/**
 * UpdateSection.tsx — the Android "Updates" card on the About screen.
 *
 * Renders nothing at all on iOS, where the App Store owns updates and
 * sideloading is impossible. See services/updater.ts for the mechanism.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import {
  AvailableUpdate,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  releasesUrl,
  updatesSupported,
} from '@/services/updater';
import { APP_VERSION } from '@/utils/version';
import { spacing, borderRadius } from '@/constants/spacing';
import { shadows } from '@/constants/shadows';
import { typography } from '@/constants/typography';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'downloading'; update: AvailableUpdate; fraction: number | null }
  | { kind: 'ready'; update: AvailableUpdate; fileUri: string };

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(1)} MiB`;
}

export function UpdateSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // The screen can be left mid-download. Without this guard the resolved
  // promise calls setState on an unmounted component and, worse, resurrects a
  // stale phase if the user comes back.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onCheck = useCallback(async () => {
    setPhase({ kind: 'checking' });
    const result = await checkForUpdate();
    if (!mounted.current) return;

    switch (result.status) {
      case 'available':
        setPhase({ kind: 'available', update: result.update });
        break;
      case 'up-to-date':
        setPhase({ kind: 'idle' });
        showToast(t('updates.upToDate', { version: APP_VERSION }), 'success');
        break;
      case 'no-asset':
        setPhase({ kind: 'idle' });
        showToast(t('updates.noApk', { version: result.latestVersion }), 'info');
        break;
      case 'unsupported':
        setPhase({ kind: 'idle' });
        break;
      case 'error':
        setPhase({ kind: 'idle' });
        showToast(
          result.message === 'rateLimited'
            ? t('updates.errorRateLimited')
            : t('updates.errorNetwork'),
          'error',
        );
        break;
    }
  }, [showToast, t]);

  const onDownload = useCallback(
    async (update: AvailableUpdate) => {
      setPhase({ kind: 'downloading', update, fraction: 0 });
      try {
        const fileUri = await downloadUpdate(update, (fraction) => {
          if (mounted.current) setPhase({ kind: 'downloading', update, fraction });
        });
        if (!mounted.current) return;
        setPhase({ kind: 'ready', update, fileUri });
        // Chain straight into the install prompt: making the user tap a second
        // button right after a download they explicitly asked for is friction
        // with no decision attached to it. The system dialog still asks.
        await installUpdate(fileUri);
      } catch {
        if (!mounted.current) return;
        setPhase({ kind: 'available', update });
        showToast(t('updates.errorDownload'), 'error');
      }
    },
    [showToast, t],
  );

  const onInstall = useCallback(
    async (fileUri: string) => {
      try {
        await installUpdate(fileUri);
      } catch {
        showToast(t('updates.errorInstall'), 'error');
      }
    },
    [showToast, t],
  );

  if (!updatesSupported()) return null;

  const url = releasesUrl();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
        {t('updates.title').toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {phase.kind === 'checking' && (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('updates.checking')}
            </Text>
          </View>
        )}

        {phase.kind === 'idle' && (
          <TouchableOpacity style={styles.row} onPress={onCheck} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.label, { color: colors.text }]}>{t('updates.check')}</Text>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  {t('updates.currentVersion', { version: APP_VERSION })}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {(phase.kind === 'available' || phase.kind === 'downloading' || phase.kind === 'ready') && (
          <View style={styles.updateBody}>
            <View style={styles.rowLeft}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={[styles.label, { color: colors.text }]}>
                  {t('updates.available', { version: phase.update.version })}
                </Text>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  {[
                    t('updates.currentVersion', { version: APP_VERSION }),
                    formatSize(phase.update.sizeBytes),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>

            {!!phase.update.notes && (
              <ScrollView style={styles.notes} nestedScrollEnabled>
                <Text style={[styles.notesText, { color: colors.textSecondary }]}>
                  {phase.update.notes}
                </Text>
              </ScrollView>
            )}

            {phase.kind === 'downloading' && (
              <View style={styles.progressWrap}>
                <View
                  style={[styles.progressTrack, { backgroundColor: colors.surfaceOutline }]}
                  accessibilityRole="progressbar"
                >
                  {/* A null fraction means the server sent no content length;
                      show a full-width muted bar rather than one stuck at 0%. */}
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width:
                          phase.fraction === null ? '100%' : `${Math.round(phase.fraction * 100)}%`,
                        opacity: phase.fraction === null ? 0.4 : 1,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  {phase.fraction === null
                    ? t('updates.downloading')
                    : t('updates.downloadingPercent', {
                        percent: Math.round(phase.fraction * 100),
                      })}
                </Text>
              </View>
            )}

            {phase.kind === 'available' && (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => onDownload(phase.update)}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>{t('updates.downloadAndInstall')}</Text>
              </TouchableOpacity>
            )}

            {phase.kind === 'ready' && (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => onInstall(phase.fileUri)}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>{t('updates.install')}</Text>
              </TouchableOpacity>
            )}

            {!!url && (
              <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.7}>
                <Text style={[styles.link, { color: colors.primary }]}>
                  {t('updates.viewOnGitHub')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  sectionHeader: { ...typography.label, marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { borderRadius: borderRadius.medium, overflow: 'hidden', ...shadows.card },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  updateBody: { padding: spacing.lg, gap: spacing.md },
  label: { ...typography.secondaryMedium },
  hint: { ...typography.caption },
  centered: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  notes: { maxHeight: 140 },
  notesText: { ...typography.caption, lineHeight: 18 },
  progressWrap: { gap: spacing.xs },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  button: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
  },
  buttonText: { ...typography.secondaryMedium, color: '#FFFFFF' },
  link: { ...typography.caption, textAlign: 'center' },
});
