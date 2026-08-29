/**
 * completion-notifications.ts — tell the user a download finished.
 *
 * Android only, like the rest of this fork's platform work: on iOS the App
 * Store owns the experience and none of this is reachable.
 *
 * ## What this can honestly promise
 *
 * "Within about fifteen minutes", not "the moment it finishes". Android will
 * not let an app poll a server on a schedule it chooses: `expo-background-task`
 * hands the work to WorkManager, whose minimum interval is 15 minutes and
 * which stretches it further under Doze, battery optimisation, or a device
 * that decides the app is not worth waking. The UI says so rather than
 * implying a guarantee the platform will not keep.
 *
 * While the app is in the foreground TorrentContext is already polling every
 * few seconds, so completions are noticed immediately there; both paths write
 * the same snapshot, so neither re-notifies what the other has handled.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { TorrentInfo } from '@/types/api';
import {
  CompletedTorrent,
  CompletionSnapshot,
  findNewlyCompleted,
  snapshotProgress,
} from '@/utils/completion-watch';
import { clogDebug, clogWarn } from '@/services/connectivity-log';
// The bare i18next singleton, deliberately not '@/i18n': this module is
// reachable from the component tree through TorrentContext, and importing the
// initialiser there would drag i18n setup into every component test. Whoever
// enters first initialises it — app/_layout.tsx in the app, and
// services/completion-task.ts on a headless background launch.
import i18n from 'i18next';

const SNAPSHOT_KEY = 'completion_snapshot';
const CHANNEL_ID = 'downloads';

/** Beyond this many at once, one summary beats a burst of separate alerts. */
const MAX_INDIVIDUAL = 3;

/**
 * Module-level mirror of the `notifyOnComplete` preference, following the same
 * pattern as utils/haptics.ts: the foreground poll runs on every sync and must
 * not hit AsyncStorage each time, and the background task has no React to read
 * a context from.
 */
let enabled = false;

export function setCompletionNotificationsEnabled(value: boolean): void {
  enabled = value;
}

export function completionNotificationsEnabled(): boolean {
  return enabled;
}

export function notificationsSupported(): boolean {
  return Platform.OS === 'android';
}

// Without a handler, expo-notifications swallows anything posted while the app
// is in the foreground — which is exactly the case the two-second poll covers.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for the POST_NOTIFICATIONS permission (Android 13+) and make sure the
 * channel exists.
 *
 * Returns whether notifications can actually be posted, so the settings toggle
 * can refuse to turn itself on rather than lying.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;

  try {
    // A channel is required before anything shows on Android 8+, and creating
    // it is idempotent.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('screens.settings.notifyChannelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    clogWarn('NOTIFY', `permission setup failed: ${String(error)}`);
    return false;
  }
}

async function loadSnapshot(): Promise<CompletionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as CompletionSnapshot;
  } catch {
    return null;
  }
}

async function saveSnapshot(snapshot: CompletionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Worst case the next check sees no previous snapshot and reports nothing,
    // which is the quiet failure, not the noisy one.
  }
}

/** Forget everything, so the next check treats every torrent as already seen. */
export async function resetCompletionSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Nothing to do; a stale snapshot only ever causes under-reporting.
  }
}

async function present(completed: CompletedTorrent[]): Promise<void> {
  if (completed.length === 0) return;

  const post = (title: string, body: string) =>
    Notifications.scheduleNotificationAsync({
      // Silent by design: a finished download is worth a shade in the
      // notification drawer, not a sound at 3am.
      content: { title, body, sound: false },
      trigger: null, // immediately
      identifier: undefined,
    });

  if (completed.length <= MAX_INDIVIDUAL) {
    for (const torrent of completed) {
      await post(i18n.t('toast.downloadComplete'), torrent.name);
    }
    return;
  }

  // A batch — the app was closed for a while and several finished. One line
  // beats twelve, and the first name gives it something to recognise.
  await post(
    // `total` / `others` rather than `count`: i18next treats `count` as a
    // pluralization key and would go looking for suffixed variants none of the
    // six locales define.
    i18n.t('toast.downloadsComplete', { total: completed.length }),
    i18n.t('toast.downloadsCompleteBody', {
      name: completed[0].name,
      others: completed.length - 1,
    }),
  );
}

/**
 * Compare a fresh torrent list against the last one and notify about anything
 * that finished in between.
 *
 * Returns how many notifications were posted, which the background task uses
 * to report whether it did anything.
 */
export async function reportCompletions(torrents: readonly TorrentInfo[]): Promise<number> {
  if (!notificationsSupported() || !enabled) return 0;

  const previous = await loadSnapshot();
  const completed = findNewlyCompleted(previous, torrents);

  // The snapshot is written whatever happens, including on the first look —
  // that is what makes the next comparison possible.
  await saveSnapshot(snapshotProgress(torrents));

  if (completed.length === 0) return 0;

  try {
    await present(completed);
    clogDebug('NOTIFY', `announced ${completed.length} completion(s)`);
    return completed.length;
  } catch (error) {
    clogWarn('NOTIFY', `could not post: ${String(error)}`);
    return 0;
  }
}
