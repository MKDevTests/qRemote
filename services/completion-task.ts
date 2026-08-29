/**
 * completion-task.ts — the background half of completion notifications.
 *
 * `TaskManager.defineTask` has to run at module scope, before React mounts,
 * because Android can start the app headless purely to run the task: there is
 * no component tree, no provider, no context. That is also why everything this
 * file touches is a static or a module singleton — `ServerManager` and
 * `apiClient` both work without React, and `storageService.getServers()`
 * rehydrates credentials from SecureStore on its own.
 *
 * Import this module for its side effect (see app/_layout.tsx). Registering
 * the task is separate and follows the preference.
 */
import { Platform } from 'react-native';
// A headless launch has no React tree, so nothing else has initialised i18n
// and the notification would be posted with raw key names as its text.
import '@/i18n';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { ServerManager } from '@/services/server-manager';
import { storageService } from '@/services/storage';
import { torrentsApi } from '@/services/api/torrents';
import { clogDebug, clogWarn } from '@/services/connectivity-log';
import {
  notificationsSupported,
  reportCompletions,
  setCompletionNotificationsEnabled,
} from '@/services/completion-notifications';

export const COMPLETION_TASK = 'qremote-completion-check';

/**
 * WorkManager's floor. Asking for less is accepted and then ignored, so the
 * honest thing is to ask for exactly what the platform can do and tell the
 * user that number.
 */
export const COMPLETION_INTERVAL_MINUTES = 15;

TaskManager.defineTask(COMPLETION_TASK, async () => {
  try {
    // The preference is re-read here rather than trusted from the module flag:
    // a headless launch starts a fresh JS context where nothing has run the
    // cold-start bootstrap.
    const prefs = await storageService.getPreferences();
    if (prefs.notifyOnComplete !== true) {
      setCompletionNotificationsEnabled(false);
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    setCompletionNotificationsEnabled(true);

    const server = await ServerManager.getCurrentServer();
    if (!server) return BackgroundTask.BackgroundTaskResult.Success;

    const connected = await ServerManager.connectToServer(server);
    if (!connected) return BackgroundTask.BackgroundTaskResult.Success;

    const torrents = await torrentsApi.getTorrentList();
    const posted = await reportCompletions(torrents);
    clogDebug('NOTIFY', `background check: ${torrents.length} torrents, ${posted} posted`);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    // A failed check is a missed notification, not a broken app. Returning
    // Failed only tells the system the run went badly; it does not unregister
    // the task, so the next window still fires.
    clogWarn('NOTIFY', `background check failed: ${String(error)}`);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Make the registered task match the preference.
 *
 * Both directions are safe to call repeatedly — registering an already
 * registered task is a no-op, and unregistering one that was never registered
 * throws, which is caught here rather than surfaced.
 */
export async function syncCompletionTask(enable: boolean): Promise<void> {
  if (Platform.OS !== 'android' || !notificationsSupported()) return;

  try {
    const registered = await TaskManager.isTaskRegisteredAsync(COMPLETION_TASK);

    if (enable && !registered) {
      await BackgroundTask.registerTaskAsync(COMPLETION_TASK, {
        minimumInterval: COMPLETION_INTERVAL_MINUTES,
      });
      clogDebug('NOTIFY', 'background completion check registered');
    } else if (!enable && registered) {
      await BackgroundTask.unregisterTaskAsync(COMPLETION_TASK);
      clogDebug('NOTIFY', 'background completion check unregistered');
    }
  } catch (error) {
    clogWarn('NOTIFY', `could not sync background task: ${String(error)}`);
  }
}
