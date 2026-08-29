/**
 * Haptic feedback utilities.
 *
 * Provides subtle tactile feedback for user interactions on iOS and Android.
 * Web has no haptics API and is excluded.
 *
 * Every call is fire-and-forget: expo-haptics rejects on devices without a
 * vibrator (some tablets, most emulators) and an un-awaited rejection there
 * would surface as an unhandled promise warning — or, in a strict runtime, a
 * red screen — for feedback nobody can feel anyway.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let hapticEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticEnabled = enabled;
}

const canVibrate = () => hapticEnabled && Platform.OS !== 'web';

const fire = (run: () => Promise<void>) => {
  if (!canVibrate()) return;
  try {
    // `?.` because a stubbed or older native module can hand back undefined
    // instead of a promise; the try/catch because a missing vibrator surfaces
    // as a synchronous throw on some Android builds rather than a rejection.
    void run()?.catch(() => {});
  } catch {
    // Nothing to recover, and nothing the user could act on.
  }
};

export const haptics = {
  /**
   * Light impact - for selection changes, filter chips
   */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /**
   * Medium impact - for button presses
   */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /**
   * Heavy impact - for important actions
   */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),

  /**
   * Success notification - for completed actions
   */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /**
   * Error notification - for failed actions
   */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),

  /**
   * Warning notification - for warnings
   */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  /**
   * Selection changed - for picker/tab changes
   */
  selection: () => fire(() => Haptics.selectionAsync()),
};
