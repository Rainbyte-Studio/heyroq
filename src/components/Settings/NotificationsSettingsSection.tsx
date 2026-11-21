import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, Check, Eye, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import {
  EngagementServiceError,
  saveEngagementSetting,
  subscribeToEngagementSettings,
} from '../../services/engagementService';
import {
  ACTIVITY_PRIVACY_ITEMS,
  NOTIFICATION_PREFERENCE_ITEMS,
  type EngagementErrorInfo,
  type PreferenceDescriptor,
  type PreferenceKey,
} from '../../utils/engagement';

export interface NotificationsSettingsSectionProps {
  uid: string;
  onOpenHistory?: () => void;
  onOpenActivity?: () => void;
}

interface SettingToggleRowProps {
  item: PreferenceDescriptor;
  checked: boolean;
  disabled: boolean;
  saving: boolean;
  muted?: boolean;
  onChange: (nextValue: boolean) => void;
}

const SettingToggleRow: React.FC<SettingToggleRowProps> = ({
  item,
  checked,
  disabled,
  saving,
  muted = false,
  onChange,
}) => {
  const titleId = `setting-title-${item.key}`;
  const detailId = `setting-detail-${item.key}`;

  return (
    <div
      className={`flex items-center justify-between gap-3 sm:gap-4 px-3.5 sm:px-4 py-3 transition-opacity ${
        muted ? 'opacity-65' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <label
          id={titleId}
          htmlFor={`setting-switch-${item.key}`}
          className="block text-[13px] sm:text-sm font-medium text-[var(--heyroq-text-primary)] cursor-pointer leading-snug"
        >
          {item.title}
        </label>
        <p id={detailId} className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed">
          {item.detail}
        </p>
      </div>

      <button
        id={`setting-switch-${item.key}`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={titleId}
        aria-describedby={detailId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="heyroq-focus-ring relative inline-flex h-11 w-12 shrink-0 items-center justify-end cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 rounded-xl"
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-150 ${
            checked
              ? 'bg-[var(--brand-cta-bg)] border-[var(--brand-cta-bg)]'
              : 'bg-[var(--heyroq-bg-elevated)] border-[var(--heyroq-border-strong)]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </span>
        {saving && <span className="sr-only">Saving {item.title}</span>}
      </button>
    </div>
  );
};

export const NotificationsSettingsSection: React.FC<NotificationsSettingsSectionProps> = ({
  uid,
  onOpenHistory,
  onOpenActivity,
}) => {
  const [values, setValues] = useState<Record<PreferenceKey, boolean> | null>(null);
  const [pending, setPending] = useState<{ key: PreferenceKey; value: boolean } | null>(null);
  const [savedKey, setSavedKey] = useState<PreferenceKey | null>(null);
  const [snapshotOffline, setSnapshotOffline] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [errorInfo, setErrorInfo] = useState<EngagementErrorInfo | null>(null);
  const [failedSave, setFailedSave] = useState<{ key: PreferenceKey; value: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const savedTimerRef = useRef<number | null>(null);

  const isOffline = !browserOnline || snapshotOffline;

  useEffect(() => {
    function handleOnlineChange() {
      setBrowserOnline(navigator.onLine);
    }
    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    return () => {
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, []);

  useEffect(() => {
    setErrorInfo(null);
    return subscribeToEngagementSettings(
      uid,
      (current, meta) => {
        setValues(current);
        setSnapshotOffline(meta.offline);
        setErrorInfo(null);
      },
      (err) => {
        setErrorInfo(err);
      }
    );
  }, [uid, attempt]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  async function handleSave(key: PreferenceKey, nextValue: boolean) {
    setPending({ key, value: nextValue });
    setFailedSave(null);
    setErrorInfo(null);
    setSavedKey(null);
    try {
      await saveEngagementSetting(uid, key, nextValue);
      setValues((prev) => (prev ? { ...prev, [key]: nextValue } : prev));
      setSavedKey(key);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSavedKey(null), 2400);
    } catch (err) {
      setFailedSave({ key, value: nextValue });
      if (err instanceof EngagementServiceError) {
        setErrorInfo(err.info);
      } else {
        setErrorInfo({
          kind: 'unknown',
          code: 'unknown',
          message: 'Your preference could not be saved.',
          detail: 'Check your connection and Firestore permissions, then try again.',
          recoverable: true,
        });
      }
    } finally {
      setPending(null);
    }
  }

  function handleRetry() {
    if (failedSave) {
      void handleSave(failedSave.key, failedSave.value);
      return;
    }
    setErrorInfo(null);
    setAttempt((n) => n + 1);
  }

  const shareActivityEnabled = Boolean(
    pending?.key === 'shareActivity' ? pending.value : values?.shareActivity
  );

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {errorInfo && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/35 bg-rose-500/[0.08] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
              aria-hidden="true"
            />
            <div className="space-y-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-[var(--heyroq-text-primary)]">
                {errorInfo.message}
              </p>
              <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
                {errorInfo.detail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={Boolean(pending) || (Boolean(failedSave) && isOffline)}
            className="heyroq-btn-secondary min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap heyroq-focus-ring"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {!values && !errorInfo && (
        <div role="status" className="space-y-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--heyroq-text-secondary)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
            <span>Loading notification and privacy preferences…</span>
          </div>
          <div className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-4 py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="h-3.5 w-36 rounded bg-[var(--heyroq-bg-elevated)]" />
                  <div className="h-3 w-56 max-w-full rounded bg-[var(--heyroq-bg-elevated)] opacity-70" />
                </div>
                <div className="h-6 w-11 rounded-full bg-[var(--heyroq-bg-elevated)] shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loaded Preferences */}
      {values && (
        <>
          {/* Sync / Offline Status Strip */}
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--heyroq-text-secondary)]"
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              {isOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[var(--heyroq-status-warning)]" aria-hidden="true" />
                  <span>Connect to the internet to change preferences.</span>
                </>
              ) : pending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
                  <span>Saving preference…</span>
                </>
              ) : savedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--heyroq-status-success)]" aria-hidden="true" />
                  <span className="text-[var(--heyroq-status-success)]">Saved</span>
                </>
              ) : (
                <span>Preferences sync across your devices.</span>
              )}
            </span>

            {(onOpenHistory || onOpenActivity) && (
              <div className="flex items-center gap-2.5">
                {onOpenHistory && (
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="font-medium text-[var(--heyroq-accent-text)] hover:underline cursor-pointer heyroq-focus-ring rounded"
                  >
                    Notification History
                  </button>
                )}
                {onOpenHistory && onOpenActivity && (
                  <span aria-hidden="true" className="text-[var(--heyroq-text-muted)] opacity-50">
                    ·
                  </span>
                )}
                {onOpenActivity && (
                  <button
                    type="button"
                    onClick={onOpenActivity}
                    className="font-medium text-[var(--heyroq-accent-text)] hover:underline cursor-pointer heyroq-focus-ring rounded"
                  >
                    Activity
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Group 1: In-app notifications */}
          <section aria-labelledby="sec-inapp-notifications-heading" className="space-y-3">
            <div>
              <h3
                id="sec-inapp-notifications-heading"
                className="font-heading text-[15px] sm:text-base font-semibold text-[var(--heyroq-text-primary)] flex items-center gap-2"
              >
                <Bell className="w-4 h-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
                <span>In-app Notifications</span>
              </h3>
              <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed">
                Choose which social updates, progression milestones, and announcements appear in your inbox.
              </p>
            </div>

            <div className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
              {NOTIFICATION_PREFERENCE_ITEMS.map((item) => (
                <SettingToggleRow
                  key={item.key}
                  item={item}
                  checked={pending?.key === item.key ? pending.value : values[item.key]}
                  disabled={Boolean(pending) || isOffline}
                  saving={pending?.key === item.key}
                  onChange={(nextValue) => void handleSave(item.key, nextValue)}
                />
              ))}
            </div>
          </section>

          {/* Group 2: Activity & Privacy */}
          <section
            aria-labelledby="sec-activity-privacy-heading"
            className="space-y-3 pt-5 border-t border-slate-900/8 dark:border-white/10"
          >
            <div>
              <h3
                id="sec-activity-privacy-heading"
                className="font-heading text-[15px] sm:text-base font-semibold text-[var(--heyroq-text-primary)] flex items-center gap-2"
              >
                <Eye className="w-4 h-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
                <span>Activity &amp; Privacy</span>
              </h3>
              <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5 leading-relaxed">
                Activity sharing stays off by default until you turn it on. Your My Activity timeline is always private to you, and private spots are never shared.
              </p>
            </div>

            <div className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
              {ACTIVITY_PRIVACY_ITEMS.map((item) => {
                const isChildSetting = item.key !== 'shareActivity';
                return (
                  <SettingToggleRow
                    key={item.key}
                    item={item}
                    checked={pending?.key === item.key ? pending.value : values[item.key]}
                    disabled={Boolean(pending) || isOffline}
                    saving={pending?.key === item.key}
                    muted={isChildSetting && !shareActivityEnabled}
                    onChange={(nextValue) => void handleSave(item.key, nextValue)}
                  />
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
