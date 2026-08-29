jest.mock('expo-haptics', () => ({
  // Resolved promises, like the real module: utils/haptics attaches a .catch
  // to whatever these return.
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { haptics, setHapticsEnabled } from '@/utils/haptics';

describe('haptics', () => {
  const mockPlatform = Platform as unknown as { OS: string };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'ios';
    setHapticsEnabled(true);
  });

  it('light triggers impactAsync with Light style on iOS when enabled', () => {
    haptics.light();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('medium triggers impactAsync with Medium style', () => {
    haptics.medium();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('heavy triggers impactAsync with Heavy style', () => {
    haptics.heavy();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('success triggers notificationAsync with Success type', () => {
    haptics.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('error triggers notificationAsync with Error type', () => {
    haptics.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('warning triggers notificationAsync with Warning type', () => {
    haptics.warning();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    );
  });

  it('selection triggers selectionAsync', () => {
    haptics.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('fires on Android too — expo-haptics maps these onto the vibrator', () => {
    mockPlatform.OS = 'android';
    haptics.light();
    haptics.success();
    haptics.selection();
    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('does nothing on web, which has no haptics API', () => {
    mockPlatform.OS = 'web';
    haptics.light();
    haptics.success();
    haptics.selection();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('does nothing when haptics are disabled via setHapticsEnabled(false)', () => {
    setHapticsEnabled(false);
    haptics.light();
    haptics.success();
    haptics.selection();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('resumes firing once re-enabled', () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    haptics.light();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });
});
