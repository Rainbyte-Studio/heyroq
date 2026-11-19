import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LatLngPoint, PinCategory, Pin } from '../../types';
import { CategoryBadge, CATEGORY_CONFIG } from '../Map/CategoryBadge';
import { createPin, newPinPublishAttempt } from '../../services/pinService';
import { MAX_PIN_IMAGES } from '../../services/storageService';
import { extractCityAndCountry } from '../../utils/footprintUtils';
import { resolveCustomAvatarUrl } from '../../utils/avatarUtils';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';
import { CloseButton } from '../Common/CloseButton';
import {
  MapPin,
  UploadCloud,
  Image as ImageIcon,
  Tag,
  CheckCircle,
  Eye,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

export interface CreatePinDraft {
  title: string;
  description: string;
  category: PinCategory;
  locationName: string;
  tags: string[];
  files: File[];
  previewUrls: string[];
  customLat: number;
  customLng: number;
  publishAttempt?: ReturnType<typeof newPinPublishAttempt>;
}

interface CreatePinModalProps {
  onClose: () => void;
  selectedLocation: LatLngPoint | null;
  initialLocationName?: string;
  onActivateMapPick: (currentDraft?: CreatePinDraft) => void;
  onPinCreated: (newPinId: string) => void;
  onLocationSelect?: (loc: LatLngPoint, locationName?: string) => void;
  isPickingLocation?: boolean;
  initialDraft?: CreatePinDraft | null;
}

const CATEGORIES: PinCategory[] = [
  'Food',
  'Travel',
  'Nature',
  'Events',
  'Activities',
  'Hidden Gems',
  'Photography',
  'Other',
];

export const CreatePinModal: React.FC<CreatePinModalProps> = ({
  onClose,
  selectedLocation,
  initialLocationName,
  onActivateMapPick,
  onPinCreated,
  onLocationSelect,
  isPickingLocation = false,
  initialDraft = null,
}) => {
  const { user, profile } = useAuth();

  const [title, setTitle] = useState(initialDraft?.title || '');
  const [description, setDescription] = useState(initialDraft?.description || '');
  const [category, setCategory] = useState<PinCategory>(initialDraft?.category || 'Hidden Gems');
  const [locationName, setLocationName] = useState(
    initialDraft?.locationName || initialLocationName || ''
  );
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialDraft?.tags || []);
  const [files, setFiles] = useState<File[]>(initialDraft?.files || []);
  const [previewUrls, setPreviewUrls] = useState<string[]>(initialDraft?.previewUrls || []);
  const [customLat, setCustomLat] = useState<number>(
    selectedLocation?.lat ?? initialDraft?.customLat ?? 37.7749
  );
  const [customLng, setCustomLng] = useState<number>(
    selectedLocation?.lng ?? initialDraft?.customLng ?? -122.4194
  );
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const publishAttempt = useRef(initialDraft?.publishAttempt);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync selectedLocation if updated from map click
  useEffect(() => {
    if (selectedLocation) {
      setCustomLat(selectedLocation.lat);
      setCustomLng(selectedLocation.lng);
    }
  }, [selectedLocation]);

  // Sync initialLocationName if updated externally (e.g. reverse geocoding from map click)
  useEffect(() => {
    if (initialLocationName) {
      setLocationName(initialLocationName);
    }
  }, [initialLocationName]);

  // Sync initialDraft when updated externally
  useEffect(() => {
    if (initialDraft) {
      if (initialDraft.title !== undefined) setTitle(initialDraft.title);
      if (initialDraft.description !== undefined) setDescription(initialDraft.description);
      if (initialDraft.category) setCategory(initialDraft.category);
      if (initialDraft.tags) setTags(initialDraft.tags);
      if (initialDraft.files) setFiles(initialDraft.files);
      if (initialDraft.previewUrls) setPreviewUrls(initialDraft.previewUrls);
      if (initialDraft.locationName) setLocationName(initialDraft.locationName);
      if (initialDraft.customLat !== undefined && !selectedLocation) setCustomLat(initialDraft.customLat);
      if (initialDraft.customLng !== undefined && !selectedLocation) setCustomLng(initialDraft.customLng);
    }
  }, [initialDraft]);

  const handleAutocompleteLocationSelect = (loc: {
    locationName: string;
    latitude: number;
    longitude: number;
  }) => {
    setLocationName(loc.locationName);
    setCustomLat(loc.latitude);
    setCustomLng(loc.longitude);
    onLocationSelect?.({ lat: loc.latitude, lng: loc.longitude }, loc.locationName);
  };

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const clean = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files) as File[];
      e.target.value = '';
      if (files.length + selected.length > MAX_PIN_IMAGES) {
        setErrorMsg(`You can attach up to ${MAX_PIN_IMAGES} photos per pin.`);
        return;
      }
      setErrorMsg(null);
      setFiles((prev) => [...prev, ...selected]);

      const newUrls = selected.map((file) => URL.createObjectURL(file));
      setPreviewUrls((prev) => [...prev, ...newUrls]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitInFlight.current) return;
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Please provide a title for your pin.');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('Please describe what makes this spot unique.');
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    console.log('[CreatePinModal] Starting pin publish flow. Files count:', files.length);
    try {
      // Extract structured geographic metadata for normalization
      const geo = extractCityAndCountry({
        id: '',
        userId: user.uid,
        userName: '',
        title: title.trim(),
        description: description.trim(),
        latitude: customLat,
        longitude: customLng,
        locationName: locationName.trim() || undefined,
        category,
        tags,
        imageUrls: [],
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      });

      // 2. Publish to Firestore
      console.log('[CreatePinModal] Step 2: Creating pin document in Firestore...');
      publishAttempt.current ??= newPinPublishAttempt();
      const newPinId = await createPin({
        userId: user.uid,
        userName: profile?.displayName || user.email?.split('@')[0] || 'Explorer',
        userAvatar: resolveCustomAvatarUrl(profile?.avatarUrl, profile?.photoURL) || '',
        title: title.trim(),
        description: description.trim(),
        latitude: customLat,
        longitude: customLng,
        locationName: locationName.trim() || undefined,
        countryCode: geo.countryCode,
        countryName: geo.country,
        city: geo.city,
        category,
        tags,
      }, files, publishAttempt.current);
      console.log('[CreatePinModal] Step 2 Complete: Pin document created with ID:', newPinId);

      onPinCreated(newPinId);
      onClose();
    } catch (err: any) {
      console.error('[CreatePinModal] Failed to publish pin:', err);
      setErrorMsg(err.message || 'Failed to create pin. Please check your inputs.');
    } finally {
      console.log('[CreatePinModal] Resetting isSubmitting in finally block.');
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const hasUnsavedChanges = Boolean(
    title.trim() ||
    description.trim() ||
    files.length > 0 ||
    (locationName && locationName.trim())
  );

  const handleAttemptClose = () => {
    if (isSubmitting) return;
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPickingLocation) return;
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleAttemptClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDiscardConfirm, hasUnsavedChanges, isSubmitting, onClose, isPickingLocation]);

  if (isPickingLocation) {
    return null;
  }

  return (
    <div
      onClick={handleAttemptClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 liquid-glass-backdrop animate-in fade-in"
    >
      <div
        id="create-pin-modal"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] max-w-2xl lg:max-w-3xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col text-[var(--heyroq-text-primary)] relative"
      >
        {/* Discard Confirmation Overlay */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-50 bg-white/[0.98] dark:bg-[#18191C]/[0.98] rounded-[28px] sm:rounded-[32px] p-6 flex flex-col items-center justify-center text-center animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/30 flex items-center justify-center mb-4 text-[var(--brand-primary)]">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-white mb-1.5">
              Discard Pin Draft?
            </h3>
            <p className="text-xs text-slate-600 dark:text-white/60 max-w-xs mb-6 leading-relaxed">
              {publishAttempt.current?.commitStarted
                ? 'This draft may have been published. Retry it here to check, or check your profile before creating it again.'
                : 'You have unsaved details that will be lost if you leave now.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-5 py-2.5 rounded-full text-xs font-semibold liquid-glass-pill text-slate-800 dark:text-white hover:bg-slate-900/[0.06] dark:hover:bg-white/15 transition cursor-pointer min-h-[40px]"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer min-h-[40px] shadow-sm"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-5 border-b border-[var(--heyroq-divider)] flex items-center justify-between bg-slate-900/[0.02] dark:bg-white/[0.02]">
          <div className="min-w-0 pr-2">
            <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
              Share a Discovery
            </h2>
            <p className="text-xs text-slate-600 dark:text-white/55 mt-0.5 line-clamp-1">
              Pin an unforgettable spot or food secret on the Heyroq social map
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className="liquid-glass-pill px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-900/[0.06] dark:hover:bg-white/15 transition flex items-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              <Eye className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>{isPreviewMode ? 'Edit' : 'Preview'}</span>
            </button>
            <CloseButton
              onClick={handleAttemptClose}
              disabled={isSubmitting}
              ariaLabel="Close Create Pin"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/75 border border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 subtle-glass-scrollbar">
          {isPreviewMode ? (
            /* Live Pin Preview */
            <div className="space-y-4 max-w-md mx-auto py-2">
              <div className="text-xs font-bold text-slate-500 dark:text-white/45 text-center">
                Live Preview
              </div>
              <div className="liquid-glass-floating rounded-[28px] overflow-hidden">
                <div className="h-48 bg-slate-200 dark:bg-neutral-900 relative">
                  {previewUrls.length > 0 ? (
                    <img
                      src={previewUrls[0]}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 dark:text-white/45 gap-1.5">
                      <ImageIcon className="w-8 h-8 opacity-45" />
                      <span className="text-xs">No photo uploaded yet</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <CategoryBadge category={category} size="sm" />
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-heading font-bold text-lg tracking-tight text-slate-900 dark:text-white">
                    {title || 'Pin Title'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-white/65 mt-1 line-clamp-2 leading-relaxed">
                    {description || 'Your description will appear here...'}
                  </p>
                  <div className="flex items-center gap-1 mt-3 text-xs font-medium text-[var(--heyroq-text-muted)] tabular-nums">
                    <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)]" strokeWidth={1.75} />
                    <span>
                      {locationName || `${customLat.toFixed(4)}, ${customLng.toFixed(4)}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Form Fields */
            <form id="create-pin-form" onSubmit={handleSubmit} className="space-y-5">
              {/* Step 1: Location selection */}
              <div className="p-4 liquid-glass-card rounded-2xl">
                <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                  <label className="text-xs font-bold text-slate-700 dark:text-white/75 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>01. Location Coordinates</span>
                  </label>
                  <button
                    id="click-on-map-to-pick-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (submitInFlight.current) return;
                      onActivateMapPick({
                        title,
                        description,
                        category,
                        locationName,
                        tags,
                        files,
                        previewUrls,
                        customLat,
                        customLng,
                        publishAttempt: publishAttempt.current,
                      });
                    }}
                    className="text-xs text-[var(--heyroq-accent-text)] hover:underline font-semibold cursor-pointer"
                  >
                    Click on Map to Pick
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="relative">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50">
                      Location / City Name
                    </span>
                    <div className="mt-1">
                      <LocationAutocompleteInput
                        value={locationName}
                        onChange={setLocationName}
                        onLocationSelect={handleAutocompleteLocationSelect}
                        placeholder="e.g. Tromsø, Norway or Montmartre"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-white/50">
                      Latitude
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={customLat}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomLat(val);
                        onLocationSelect?.({ lat: val, lng: customLng }, locationName);
                      }}
                      className="liquid-glass-input w-full mt-1 px-3 py-2 rounded-xl text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 font-sans tabular-nums"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[var(--heyroq-text-muted)]">
                      Longitude
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={customLng}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomLng(val);
                        onLocationSelect?.({ lat: customLat, lng: val }, locationName);
                      }}
                      className="liquid-glass-input w-full mt-1 px-3 py-2 rounded-xl text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 font-sans tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Upload Photos */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-white/75 mb-2">
                  02. Photos
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-white/20 hover:border-[var(--brand-primary)]/60 dark:hover:border-white/40 rounded-2xl p-5 text-center cursor-pointer transition bg-slate-900/[0.02] dark:bg-white/[0.03] relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <UploadCloud className="w-8 h-8 text-[var(--brand-primary)] mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Click to browse or drop photos here
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
                    PNG, JPG, WebP up to 10MB each
                  </p>
                </div>

                {/* Previews */}
                {previewUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {previewUrls.map((url, i) => (
                      <div
                        key={i}
                        className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-900/10 dark:border-white/20 group"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="absolute top-1 right-1 p-1.5 bg-black/70 text-white rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition cursor-pointer"
                          aria-label="Remove uploaded image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3: Title */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-white/75">
                    03. Title
                  </label>
                  <span className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-white/45">
                    {title.length}/140
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Hidden Rooftop Speakeasy with Skyline Views"
                  className="liquid-glass-input w-full px-4 py-2.5 text-base sm:text-sm rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 transition"
                  required
                />
              </div>

              {/* Step 4: Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-white/75 mb-2">
                  04. Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <CategoryBadge
                      key={cat}
                      category={cat}
                      size="sm"
                      active={category === cat}
                      onClick={() => setCategory(cat)}
                    />
                  ))}
                </div>
              </div>

              {/* Step 5: Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-white/75 mb-1">
                  05. Description &amp; Tips
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What makes this place special? Any secret entrance, best time to visit, or signature dishes?"
                  className="liquid-glass-input w-full px-4 py-2.5 text-base sm:text-sm rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 transition resize-none"
                  required
                />
              </div>

              {/* Step 6: Tags */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-white/75 mb-1">
                  06. Tags
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      placeholder="e.g. sunset, coffee, vegan (press enter)"
                      className="liquid-glass-input w-full pl-9 pr-4 py-2 text-base sm:text-xs rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 min-h-[40px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="liquid-glass-pill px-4 py-2 text-slate-800 dark:text-white hover:bg-slate-900/[0.06] dark:hover:bg-white/15 rounded-xl text-xs font-semibold cursor-pointer min-h-[40px] flex items-center"
                  >
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 text-xs font-medium liquid-glass-pill text-slate-800 dark:text-white/90 px-3 py-1 rounded-full"
                      >
                        <span>#{t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="text-slate-400 dark:text-white/50 hover:text-[var(--brand-primary)] cursor-pointer"
                          aria-label={`Remove tag ${t}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-[var(--heyroq-divider)] flex items-center justify-end gap-2 sm:gap-3 bg-slate-900/[0.02] dark:bg-white/[0.02] pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-5 py-2 text-xs font-semibold text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white cursor-pointer min-h-[40px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-pin-form"
            disabled={isSubmitting}
            className="heyroq-btn-primary px-5 sm:px-6 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer min-h-[40px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Publishing Pin...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Publish Pin</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
