const platform = { OS: 'android' };
jest.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
}));

const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

interface PostedNotification {
  content: { title: string; body: string };
}
const scheduleNotificationAsync = jest.fn(async (_request: PostedNotification) => 'id');
const setNotificationChannelAsync = jest.fn(async (_id: string, _channel: unknown) => undefined);
const getPermissionsAsync = jest.fn(async () => ({ granted: false, canAskAgain: true }));
const requestPermissionsAsync = jest.fn(async () => ({ granted: true }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  scheduleNotificationAsync: (request: PostedNotification) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: unknown) =>
    setNotificationChannelAsync(id, channel),
  getPermissionsAsync: () => getPermissionsAsync(),
  requestPermissionsAsync: () => requestPermissionsAsync(),
}));

jest.mock('@/i18n', () => ({}));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock('@/services/connectivity-log', () => ({
  clogDebug: jest.fn(),
  clogWarn: jest.fn(),
}));

import { TorrentInfo } from '@/types/api';
import {
  ensureNotificationPermission,
  notificationsSupported,
  reportCompletions,
  resetCompletionSnapshot,
  setCompletionNotificationsEnabled,
} from '@/services/completion-notifications';

const t = (hash: string, progress: number, name = hash) =>
  ({ hash, progress, name }) as TorrentInfo;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  platform.OS = 'android';
  setCompletionNotificationsEnabled(true);
});

describe('notificationsSupported', () => {
  it('is Android-only', () => {
    expect(notificationsSupported()).toBe(true);
    platform.OS = 'ios';
    expect(notificationsSupported()).toBe(false);
  });
});

describe('reportCompletions', () => {
  it('says nothing on the first look but remembers what it saw', async () => {
    expect(await reportCompletions([t('a', 0.4)])).toBe(0);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();

    // Second pass sees the same torrent finish, and now has something to
    // compare against.
    expect(await reportCompletions([t('a', 1)])).toBe(1);
  });

  it('names the torrent that finished', async () => {
    await reportCompletions([t('a', 0.4, 'Ubuntu 24.04')]);
    await reportCompletions([t('a', 1, 'Ubuntu 24.04')]);

    expect(scheduleNotificationAsync.mock.calls[0][0].content.body).toBe('Ubuntu 24.04');
  });

  it('does not report the same completion twice', async () => {
    await reportCompletions([t('a', 0.4)]);
    expect(await reportCompletions([t('a', 1)])).toBe(1);
    expect(await reportCompletions([t('a', 1)])).toBe(0);
  });

  // Four or more is the app having been closed for a while; a burst of
  // separate alerts would be worse than one line.
  it('collapses a large batch into a single summary', async () => {
    const hashes = ['a', 'b', 'c', 'd', 'e'];
    await reportCompletions(hashes.map((h) => t(h, 0.4)));
    expect(await reportCompletions(hashes.map((h) => t(h, 1)))).toBe(5);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('posts one notification each for a small batch', async () => {
    await reportCompletions([t('a', 0.4), t('b', 0.4)]);
    await reportCompletions([t('a', 1), t('b', 1)]);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('stays silent when the preference is off', async () => {
    setCompletionNotificationsEnabled(false);
    await reportCompletions([t('a', 0.4)]);
    expect(await reportCompletions([t('a', 1)])).toBe(0);
  });

  it('stays silent on iOS', async () => {
    platform.OS = 'ios';
    expect(await reportCompletions([t('a', 1)])).toBe(0);
  });

  it('survives a corrupt stored snapshot', async () => {
    store.set('completion_snapshot', 'not json');
    expect(await reportCompletions([t('a', 1)])).toBe(0);
  });

  it('reports nothing after the snapshot is reset', async () => {
    await reportCompletions([t('a', 0.4)]);
    await resetCompletionSnapshot();
    expect(await reportCompletions([t('a', 1)])).toBe(0);
  });
});

describe('ensureNotificationPermission', () => {
  it('creates the channel and asks when it can', async () => {
    expect(await ensureNotificationPermission()).toBe(true);
    expect(setNotificationChannelAsync).toHaveBeenCalled();
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });

  it('does not ask again when already granted', async () => {
    getPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('gives up when the user has blocked it for good', async () => {
    getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(await ensureNotificationPermission()).toBe(false);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing', async () => {
    setNotificationChannelAsync.mockRejectedValueOnce(new Error('no channel'));
    expect(await ensureNotificationPermission()).toBe(false);
  });

  it('is false on iOS without touching the module', async () => {
    platform.OS = 'ios';
    expect(await ensureNotificationPermission()).toBe(false);
    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
