import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onIdTokenChanged,
  reload,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { resolveCustomAvatarUrl } from '../utils/avatarUtils';
import {
  LinkedProviderStatus,
  getLinkedProviderStatus,
} from '../services/accountSecurityService';
import { invalidateUserProfileCache } from '../services/userService';
import { checkUsernameAvailable, saveProfileWithUsername, validateUsername } from '../services/usernameService';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

interface AuthContextType {
  user: (User | AuthUser) | null;
  firebaseUser: User | null;
  profile: UserProfile | null;
  providerStatus: LinkedProviderStatus;
  loading: boolean;
  isAdmin: boolean;
  needsProfile: boolean;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signUp: (email: string, pass: string, displayName: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  completeProfile: (displayName: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshAuthUser: () => Promise<LinkedProviderStatus>;
  optimisticUpdateFollowingCount: (delta: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function validateDisplayName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 100) throw new Error('Enter a display name between 1 and 100 characters.');
  return name;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<(User | AuthUser) | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [providerStatus, setProviderStatus] = useState<LinkedProviderStatus>(() =>
    getLinkedProviderStatus(null)
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdminClaim, setIsAdminClaim] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [missingProfileUid, setMissingProfileUid] = useState<string | null>(null);

  // Load Firestore user profile while keeping email strictly in memory (never written to public users/{uid})
  const fetchProfile = useCallback(async (uid: string, fallbackEmail?: string, fallbackDisplayName?: string | null) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userDocRef);
      const now = new Date().toISOString();

      if (snapshot.exists()) {
        const data = snapshot.data();
        const safeUsername =
          data.username ||
          (data.email ? data.email.split('@')[0] : `explorer_${uid.slice(0, 6)}`).toLowerCase();
        const safeDisplayName =
          data.displayName ||
          (fallbackDisplayName && fallbackDisplayName.trim() ? fallbackDisplayName.trim() : '') ||
          (data.email ? data.email.split('@')[0] : 'Explorer');
        const customPhoto = resolveCustomAvatarUrl(data.avatarUrl, data.photoURL) || '';

        const loadedProfile: UserProfile = {
          id: snapshot.id,
          uid: data.uid || snapshot.id,
          email: fallbackEmail || data.email || '',
          displayName: safeDisplayName,
          username: safeUsername,
          usernameLower: (data.usernameLower || safeUsername).toLowerCase(),
          displayNameLower: (data.displayNameLower || safeDisplayName).toLowerCase(),
          photoURL: customPhoto,
          avatarUrl: customPhoto,
          bio: data.bio || 'Exploring the world on Heyroq.',
          createdAt: data.createdAt || now,
          updatedAt: data.updatedAt || now,
          followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
          followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
          pinsCount: typeof data.pinsCount === 'number' ? data.pinsCount : 0,
          role:
            (fallbackEmail === 'n.kalogerogiannis@gmail.com' || data.email === 'n.kalogerogiannis@gmail.com') &&
            (data.uid === '1XUiIYnfOWTG7uFU736I25CskZU2' || uid === '1XUiIYnfOWTG7uFU736I25CskZU2')
              ? 'admin'
              : data.role || 'user',
        };
        if (auth.currentUser?.uid === uid) {
          setProfile(loadedProfile);
          setMissingProfileUid(null);
        }
        return true;
      } else {
        if (auth.currentUser?.uid === uid) setMissingProfileUid(uid);
        return false;
      }
    } catch (err) {
      console.warn('Notice fetching user profile:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('heyroq_demo_session');
    } catch {}

    let activeUid: string | null = null;
    let unsubscribeSnapshot: (() => void) | null = null;

    // onIdTokenChanged fires on sign-in, sign-out, token refresh, provider link/unlink, and email updates
    const unsubscribeAuth = onIdTokenChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setFirebaseUser(currentUser);
        setProviderStatus(getLinkedProviderStatus(currentUser));

        // Sync authoritative Auth email in memory without touching public Firestore document
        setProfile((prev) =>
          prev && prev.uid === currentUser.uid
            ? {
                ...prev,
                email: currentUser.email || prev.email || '',
              }
            : prev
        );

        currentUser
          .getIdTokenResult()
          .then((tokenResult) => {
            const hasClaim =
              tokenResult.claims.admin === true || tokenResult.claims.role === 'admin';
            setIsAdminClaim(hasClaim);
          })
          .catch((err) => {
            console.warn('[Heyroq Auth] Could not read user token claims:', err);
            setIsAdminClaim(false);
          });

        // Only attach a new Firestore user snapshot listener when the active UID changes
        if (activeUid !== currentUser.uid) {
          if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
          }
          activeUid = currentUser.uid;

          await fetchProfile(
            currentUser.uid,
            currentUser.email || undefined,
            currentUser.displayName
          );

          if (activeUid !== currentUser.uid || auth.currentUser?.uid !== currentUser.uid) return;
          unsubscribeSnapshot = onSnapshot(
            doc(db, 'users', currentUser.uid),
            (snap) => {
              if (snap.exists()) {
                const data = snap.data();
                const normalizedAvatar =
                  resolveCustomAvatarUrl(data.avatarUrl, data.photoURL) || '';
                setProfile((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    ...data,
                    email: auth.currentUser?.email || prev.email || '',
                    photoURL: normalizedAvatar,
                    avatarUrl: normalizedAvatar,
                    id: prev.id || currentUser.uid,
                    uid: prev.uid || data.uid || currentUser.uid,
                    followersCount:
                      typeof data.followersCount === 'number'
                        ? data.followersCount
                        : prev.followersCount || 0,
                    followingCount:
                      typeof data.followingCount === 'number'
                        ? data.followingCount
                        : prev.followingCount || 0,
                    pinsCount:
                      typeof data.pinsCount === 'number' ? data.pinsCount : prev.pinsCount || 0,
                  };
                });
              }
            },
            (err) => {
              console.warn('Current user profile snapshot note:', err);
            }
          );
        }
      } else {
        activeUid = null;
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        setUser(null);
        setFirebaseUser(null);
        setProviderStatus(getLinkedProviderStatus(null));
        setProfile(null);
        setMissingProfileUid(null);
        setIsAdminClaim(false);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [fetchProfile]);

  const refreshAuthUser = useCallback(async (): Promise<LinkedProviderStatus> => {
    const current = auth.currentUser;
    if (!current) {
      const empty = getLinkedProviderStatus(null);
      setProviderStatus(empty);
      return empty;
    }

    await reload(current);
    const updatedStatus = getLinkedProviderStatus(auth.currentUser);
    setUser(auth.currentUser);
    setFirebaseUser(auth.currentUser);
    setProviderStatus(updatedStatus);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            email: auth.currentUser?.email || prev.email || '',
          }
        : null
    );
    return updatedStatus;
  }, []);

  const finishSignIn = async (current: User): Promise<boolean> => {
    const exists = await fetchProfile(current.uid, current.email || undefined, current.displayName);
    if (exists === null) throw new Error('Could not load your profile. Please try signing in again.');
    return exists;
  };

  const signIn = async (email: string, pass: string) => {
    const { user: current } = await signInWithEmailAndPassword(auth, email, pass);
    return finishSignIn(current);
  };

  const completeProfile = async (displayName: string, value: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sign in to finish creating your profile.');
    const username = validateUsername(value);
    const finalDisplayName = validateDisplayName(displayName);

    const now = new Date().toISOString();
    await saveProfileWithUsername(current.uid, username, {
      id: current.uid,
      uid: current.uid,
      displayName: finalDisplayName,
      displayNameLower: finalDisplayName.toLowerCase(),
      photoURL: '',
      avatarUrl: '',
      bio: 'New explorer on Heyroq!',
      createdAt: now,
      updatedAt: now,
      followersCount: 0,
      followingCount: 0,
      pinsCount: 0,
      role: 'user',
    }, true);
    invalidateUserProfileCache(current.uid);
    if (auth.currentUser?.uid !== current.uid || !(await finishSignIn(current))) {
      throw new Error('Your profile could not be loaded. Sign in again to continue.');
    }
  };

  const signUp = async (email: string, pass: string, displayName: string, username: string) => {
    const name = validateDisplayName(displayName);
    const available = await checkUsernameAvailable(username);
    const { user: current } = await createUserWithEmailAndPassword(auth, email, pass);
    setMissingProfileUid(current.uid);
    await completeProfile(name, available);
  };

  const signInWithGoogle = async () => {
    const { user: current } = await signInWithPopup(auth, new GoogleAuthProvider());
    return finishSignIn(current);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('SignOut info:', e);
    }
    setUser(null);
    setFirebaseUser(null);
    setProviderStatus(getLinkedProviderStatus(null));
    setProfile(null);
    setMissingProfileUid(null);
    setIsAdminClaim(false);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;

    const enrichedData: Partial<UserProfile> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const username = typeof data.username === 'string'
      ? validateUsername(data.username)
      : undefined;
    if (typeof data.displayName === 'string') {
      enrichedData.displayNameLower = data.displayName.toLowerCase();
    }
    if ('avatarUrl' in data || 'photoURL' in data) {
      const normalized = resolveCustomAvatarUrl(data.avatarUrl, data.photoURL) || '';
      enrichedData.avatarUrl = normalized;
      enrichedData.photoURL = normalized;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      const { email: _privateEmail, username: _username, usernameLower: _usernameLower, ...publicChanges } = enrichedData;
      if (username !== undefined) {
        await saveProfileWithUsername(user.uid, username, publicChanges);
      } else {
        await updateDoc(userRef, publicChanges);
      }
      invalidateUserProfileCache(user.uid);
      setProfile(previous => previous?.uid === user.uid ? {
        ...previous, ...publicChanges,
        ...(username !== undefined ? { username, usernameLower: username } : {}),
      } : previous);
    } catch (err) {
      console.warn('Notice updating profile on server:', err);
      throw err;
    }
  };

  const refreshProfile = async () => {
    if (!user || !user.uid) return;
    invalidateUserProfileCache(user.uid);
    await fetchProfile(user.uid, auth.currentUser?.email || user.email || undefined, user.displayName);
  };

  const optimisticUpdateFollowingCount = (delta: number) => {
    setProfile((prev) => {
      if (!prev) return null;
      const current = typeof prev.followingCount === 'number' ? prev.followingCount : 0;
      const updatedFollowing = current + delta;
      return {
        ...prev,
        followingCount: updatedFollowing < 0 ? 0 : updatedFollowing,
      };
    });
  };

  const isAdmin =
    isAdminClaim ||
    (user?.uid === '1XUiIYnfOWTG7uFU736I25CskZU2' && user?.email === 'n.kalogerogiannis@gmail.com');

  const profileReady = Boolean(user && profile && user.uid === profile.uid);
  const needsProfile = Boolean(firebaseUser && !profileReady && missingProfileUid === firebaseUser.uid);

  return (
    <AuthContext.Provider
      value={{
        user: profileReady ? user : null,
        firebaseUser,
        profile,
        providerStatus,
        loading,
        isAdmin: profileReady && isAdmin,
        needsProfile,
        completeProfile,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        resetPassword,
        updateUserProfile,
        refreshProfile,
        refreshAuthUser,
        optimisticUpdateFollowingCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
