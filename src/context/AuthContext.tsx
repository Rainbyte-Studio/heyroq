import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

interface AuthContextType {
  user: (User | AuthUser) | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, displayName: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  optimisticUpdateFollowingCount: (delta: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<(User | AuthUser) | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdminClaim, setIsAdminClaim] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Load Firestore user profile
  const fetchProfile = async (uid: string, fallbackEmail?: string) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userDocRef);
      const now = new Date().toISOString();

      if (snapshot.exists()) {
        const data = snapshot.data();
        const safeUsername =
          data.username ||
          (data.email ? data.email.split('@')[0] : `explorer_${uid.slice(0, 6)}`).toLowerCase();
        const safeDisplayName = data.displayName || (data.email ? data.email.split('@')[0] : 'Explorer');
        const photo = data.photoURL || data.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

        const loadedProfile: UserProfile = {
          id: snapshot.id,
          uid: data.uid || snapshot.id,
          email: data.email || fallbackEmail || '',
          displayName: safeDisplayName,
          username: safeUsername,
          usernameLower: (data.usernameLower || safeUsername).toLowerCase(),
          displayNameLower: (data.displayNameLower || safeDisplayName).toLowerCase(),
          photoURL: photo,
          avatarUrl: photo,
          bio: data.bio || 'Exploring the world on Heyroq.',
          createdAt: data.createdAt || now,
          updatedAt: data.updatedAt || now,
          followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
          followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
          pinsCount: typeof data.pinsCount === 'number' ? data.pinsCount : 0,
          role: (data.email === 'n.kalogerogiannis@gmail.com' && (data.uid === '1XUiIYnfOWTG7uFU736I25CskZU2' || uid === '1XUiIYnfOWTG7uFU736I25CskZU2')) ? 'admin' : (data.role || 'user'),
        };
        setProfile(loadedProfile);
      } else {
        // First-time registration or Google sign-in: create users/{uid} document in Firestore
        const defaultEmail = fallbackEmail || '';
        const defaultUsername = (
          defaultEmail ? defaultEmail.split('@')[0] : `explorer_${uid.slice(0, 6)}`
        ).toLowerCase().replace(/[^a-z0-9_]/g, '');
        const defaultDisplayName = defaultEmail ? defaultEmail.split('@')[0] : 'Explorer';
        const defaultPhoto = `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

        const finalUsername = defaultUsername || `user_${uid.slice(0, 5)}`;
        const newProfile: UserProfile = {
          id: uid,
          uid,
          email: defaultEmail,
          displayName: defaultDisplayName,
          username: finalUsername,
          usernameLower: finalUsername.toLowerCase(),
          displayNameLower: defaultDisplayName.toLowerCase(),
          photoURL: defaultPhoto,
          avatarUrl: defaultPhoto,
          bio: 'Exploring the world on Heyroq.',
          createdAt: now,
          updatedAt: now,
          followersCount: 0,
          followingCount: 0,
          pinsCount: 0,
          role: 'user',
        };

        try {
          await setDoc(userDocRef, newProfile);
        } catch (setErr) {
          console.warn('Notice creating initial user profile in Firestore:', setErr);
        }
        setProfile(newProfile);
      }
    } catch (err) {
      console.warn('Notice fetching user profile:', err);
    }
  };

  useEffect(() => {
    // Clear any obsolete legacy demo session keys from previous sessions
    try {
      localStorage.removeItem('heyroq_demo_session');
    } catch {}

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (currentUser) {
        setUser(currentUser);

        // Read server-issued ID token claims for admin privileges
        currentUser
          .getIdTokenResult()
          .then((tokenResult) => {
            const hasClaim = tokenResult.claims.admin === true || tokenResult.claims.role === 'admin';
            setIsAdminClaim(hasClaim);
          })
          .catch((err) => {
            console.warn('[Heyroq Auth] Could not read user token claims:', err);
            setIsAdminClaim(false);
          });

        await fetchProfile(currentUser.uid, currentUser.email || undefined);

        // Real-time listener for current user's profile counters and changes
        unsubscribeSnapshot = onSnapshot(
          doc(db, 'users', currentUser.uid),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setProfile((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  ...data,
                  id: prev.id || currentUser.uid,
                  uid: prev.uid || data.uid || currentUser.uid,
                  followersCount: typeof data.followersCount === 'number' ? data.followersCount : (prev.followersCount || 0),
                  followingCount: typeof data.followingCount === 'number' ? data.followingCount : (prev.followingCount || 0),
                  pinsCount: typeof data.pinsCount === 'number' ? data.pinsCount : (prev.pinsCount || 0),
                };
              });
            }
          },
          (err) => {
            console.warn('Current user profile snapshot note:', err);
          }
        );
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      try {
        const tokenResult = await cred.user.getIdTokenResult(true);
        setIsAdminClaim(tokenResult.claims.admin === true || tokenResult.claims.role === 'admin');
      } catch (err) {
        console.warn('[Heyroq Auth] Token refresh note:', err);
      }
      await fetchProfile(cred.user.uid, cred.user.email || undefined);
    }
  };

  const signUp = async (
    email: string,
    pass: string,
    displayName: string,
    username: string
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    const now = new Date().toISOString();
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;
    const finalUsername = cleanUsername || `user_${uid.slice(0, 5)}`;
    const finalDisplayName = displayName.trim() || 'Explorer';
    const newProfile: UserProfile = {
      id: uid,
      uid,
      username: finalUsername,
      usernameLower: finalUsername.toLowerCase(),
      displayName: finalDisplayName,
      displayNameLower: finalDisplayName.toLowerCase(),
      email: email.trim().toLowerCase(),
      photoURL: avatar,
      avatarUrl: avatar,
      bio: 'New explorer on Heyroq!',
      createdAt: now,
      updatedAt: now,
      followersCount: 0,
      followingCount: 0,
      pinsCount: 0,
      role: 'user',
    };

    try {
      await setDoc(doc(db, 'users', uid), newProfile);
      setProfile(newProfile);
    } catch (err) {
      console.warn('Notice saving profile doc to Firestore:', err);
      // Still set profile locally so user is never blocked
      setProfile(newProfile);
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    if (cred.user) {
      try {
        const tokenResult = await cred.user.getIdTokenResult(true);
        setIsAdminClaim(tokenResult.claims.admin === true || tokenResult.claims.role === 'admin');
      } catch (err) {
        console.warn('[Heyroq Auth] Google token refresh note:', err);
      }
      await fetchProfile(cred.user.uid, cred.user.email || undefined);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('SignOut info:', e);
    }
    setUser(null);
    setProfile(null);
    setIsAdminClaim(false);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;

    const enrichedData: Partial<UserProfile> = { ...data };
    if (typeof data.username === 'string') {
      enrichedData.usernameLower = data.username.toLowerCase();
    }
    if (typeof data.displayName === 'string') {
      enrichedData.displayNameLower = data.displayName.toLowerCase();
    }

    setProfile((prev) => (prev ? { ...prev, ...enrichedData } : null));

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, enrichedData);
    } catch (err) {
      console.warn('Notice updating profile on server:', err);
    }
  };

  const refreshProfile = async () => {
    if (!user || !user.uid) return;
    await fetchProfile(user.uid, user.email || undefined);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        resetPassword,
        updateUserProfile,
        refreshProfile,
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
