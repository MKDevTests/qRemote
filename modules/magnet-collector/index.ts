import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface MagnetCollectorNativeModule extends NativeModule {
  /** Magnets captured while the app was closed. Emptied by this call. */
  drainPending(): string[];
  pendingCount(): number;
  /** Route magnet links to the invisible collector instead of the app. */
  setCollectModeEnabled(enabled: boolean): void;
  isCollectModeEnabled(): boolean;
}

// requireOptionalNativeModule, not requireNativeModule: this module has no iOS
// implementation at all, and a hard require would throw at import time there.
const native = requireOptionalNativeModule<MagnetCollectorNativeModule>('MagnetCollector');

/**
 * True where magnet links can be captured without showing the app.
 *
 * Android only, and not for lack of effort on iOS: an app cannot register a
 * URL scheme handler that stays in the background — opening `magnet:` always
 * foregrounds the target app, with no transparent-activity equivalent. On iOS
 * the basket still works; collecting just goes through the normal deep-link
 * path, so the app does appear. The UI must say so rather than offering a
 * switch that quietly means something different (AGENTS.md section 9).
 */
export const supportsSilentCollect = Platform.OS === 'android' && native != null;

export function drainPendingMagnets(): string[] {
  if (!native) return [];
  try {
    return native.drainPending();
  } catch {
    // Never let a native hiccup on launch take the app down with it — the
    // worst case is that a collected magnet waits for the next foreground.
    return [];
  }
}

export function setCollectModeEnabled(enabled: boolean): void {
  if (!native) return;
  try {
    native.setCollectModeEnabled(enabled);
  } catch {
    // Component state is best-effort; the JS-side preference stays the
    // source of truth for what the UI shows.
  }
}

export function isCollectModeEnabled(): boolean {
  if (!native) return false;
  try {
    return native.isCollectModeEnabled();
  } catch {
    return false;
  }
}
