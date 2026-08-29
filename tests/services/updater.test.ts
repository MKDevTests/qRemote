const mockPlatform = { OS: 'android' };
const expoConfig = { extra: { githubRepo: 'MKDevTests/qRemote' }, version: '3.8.40' };

jest.mock('react-native', () => ({
  Platform: mockPlatform,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return expoConfig;
    },
  },
}));

const makeDirectoryAsync = jest.fn();
const deleteAsync = jest.fn();
const getInfoAsync = jest.fn();
const downloadAsync = jest.fn();
const createDownloadResumable = jest.fn();
const getContentUriAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: (...a: unknown[]) => makeDirectoryAsync(...a),
  deleteAsync: (...a: unknown[]) => deleteAsync(...a),
  getInfoAsync: (...a: unknown[]) => getInfoAsync(...a),
  createDownloadResumable: (...a: unknown[]) => createDownloadResumable(...a),
  getContentUriAsync: (...a: unknown[]) => getContentUriAsync(...a),
}));

// The device reports the ABIs it can run, most preferred first; the updater
// uses that to pick between the per-ABI APKs on a release.
let supportedCpuArchitectures: string[] | null = ['arm64-v8a', 'armeabi-v7a'];
jest.mock('expo-device', () => ({
  get supportedCpuArchitectures() {
    return supportedCpuArchitectures;
  },
}));

const startActivityAsync = jest.fn();
jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: (...a: unknown[]) => startActivityAsync(...a),
}));

import {
  checkForUpdate,
  clearDownloadedUpdates,
  compareVersions,
  downloadUpdate,
  installUpdate,
  releasesUrl,
  updatesSupported,
  AvailableUpdate,
} from '@/services/updater';

const RELEASE_URL = 'https://api.github.com/repos/MKDevTests/qRemote/releases/latest';

/** A GitHub `releases/latest` payload with one APK attached. */
function releaseBody(tag: string) {
  return {
    tag_name: tag,
    body: '  Fixed the thing.  ',
    html_url: `https://github.com/MKDevTests/qRemote/releases/tag/${tag}`,
    assets: [
      { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt', size: 10 },
      {
        name: `qremote-${tag.replace(/^v/, '')}.apk`,
        browser_download_url: `https://example.com/${tag}.apk`,
        size: 42 * 1024 * 1024,
      },
    ],
  };
}

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('compareVersions', () => {
  it('orders by each numeric component', () => {
    expect(compareVersions('3.9.0', '3.8.40')).toBeGreaterThan(0);
    expect(compareVersions('3.8.40', '3.9.0')).toBeLessThan(0);
    expect(compareVersions('4.0.0', '3.99.99')).toBeGreaterThan(0);
  });

  it('treats a missing component as zero', () => {
    expect(compareVersions('3.9', '3.9.0')).toBe(0);
    expect(compareVersions('3.9.1', '3.9')).toBeGreaterThan(0);
  });

  it('ignores a leading v and surrounding whitespace', () => {
    expect(compareVersions(' v3.9.0 ', '3.9.0')).toBe(0);
  });

  // A pre-release must never outrank the release it precedes, or every user on
  // the stable build gets nagged by a build that is older than theirs.
  it('does not rank a pre-release above the same stable version', () => {
    expect(compareVersions('3.9.0-beta.1', '3.9.0')).toBeLessThanOrEqual(0);
  });
});

describe('checkForUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'android';
    expoConfig.extra = { githubRepo: 'MKDevTests/qRemote' };
  });

  it('reports an available update with the APK asset, not the first asset', async () => {
    mockFetch(200, releaseBody('v3.9.0'));
    const result = await checkForUpdate();

    expect(global.fetch).toHaveBeenCalledWith(RELEASE_URL, expect.anything());
    expect(result).toEqual({
      status: 'available',
      update: {
        version: '3.9.0',
        tag: 'v3.9.0',
        notes: 'Fixed the thing.',
        apkUrl: 'https://example.com/v3.9.0.apk',
        apkName: 'qremote-3.9.0.apk',
        sizeBytes: 42 * 1024 * 1024,
        releaseUrl: 'https://github.com/MKDevTests/qRemote/releases/tag/v3.9.0',
      },
    });
  });

  it('reports up-to-date when the latest release is the running version', async () => {
    mockFetch(200, releaseBody('v3.8.40'));
    expect(await checkForUpdate()).toEqual({ status: 'up-to-date', latestVersion: '3.8.40' });
  });

  it('reports up-to-date when the latest release is older', async () => {
    mockFetch(200, releaseBody('v3.0.0'));
    expect(await checkForUpdate()).toEqual({ status: 'up-to-date', latestVersion: '3.0.0' });
  });

  // Releases from v4.3.0 attach one APK per ABI instead of one universal
  // build; the wrong one would install libraries this CPU cannot load.
  it('downloads the APK built for this device', async () => {
    const url = (abi: string) => `https://example.com/qremote-3.9.0-${abi}.apk`;
    const split = {
      ...releaseBody('v3.9.0'),
      assets: [
        { name: 'qremote-3.9.0-arm64-v8a.apk', browser_download_url: url('arm64-v8a'), size: 1 },
        {
          name: 'qremote-3.9.0-armeabi-v7a.apk',
          browser_download_url: url('armeabi-v7a'),
          size: 2,
        },
      ],
    };

    mockFetch(200, split);
    let result = await checkForUpdate();
    expect(result.status).toBe('available');
    expect((result as { update: AvailableUpdate }).update.apkName).toBe(
      'qremote-3.9.0-arm64-v8a.apk',
    );

    supportedCpuArchitectures = ['armeabi-v7a'];
    mockFetch(200, split);
    result = await checkForUpdate();
    expect((result as { update: AvailableUpdate }).update.apkName).toBe(
      'qremote-3.9.0-armeabi-v7a.apk',
    );

    supportedCpuArchitectures = ['arm64-v8a', 'armeabi-v7a'];
  });

  it('reports no-asset when a newer release has no APK attached', async () => {
    mockFetch(200, { ...releaseBody('v3.9.0'), assets: [] });
    expect(await checkForUpdate()).toEqual({
      status: 'no-asset',
      latestVersion: '3.9.0',
      releaseUrl: 'https://github.com/MKDevTests/qRemote/releases/tag/v3.9.0',
    });
  });

  // A repository with no releases yet answers 404. That is the normal state of
  // a fresh fork, not something to show the user an error for.
  it('treats 404 as up-to-date rather than an error', async () => {
    mockFetch(404, {});
    expect(await checkForUpdate()).toEqual({ status: 'up-to-date', latestVersion: '3.8.40' });
  });

  it('distinguishes rate limiting from other failures', async () => {
    mockFetch(403, {});
    expect(await checkForUpdate()).toEqual({ status: 'error', message: 'rateLimited' });

    mockFetch(500, {});
    expect(await checkForUpdate()).toEqual({ status: 'error', message: 'HTTP 500' });
  });

  it('never throws on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await checkForUpdate()).toEqual({ status: 'error', message: 'network' });
  });

  it('is unsupported on iOS, where the App Store owns updates', async () => {
    mockPlatform.OS = 'ios';
    expect(await checkForUpdate()).toEqual({ status: 'unsupported' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('is unsupported when no repository is configured', async () => {
    expoConfig.extra = {} as typeof expoConfig.extra;
    expect(await checkForUpdate()).toEqual({ status: 'unsupported' });
  });
});

describe('downloadUpdate', () => {
  const update: AvailableUpdate = {
    version: '3.9.0',
    tag: 'v3.9.0',
    notes: '',
    apkUrl: 'https://example.com/v3.9.0.apk',
    apkName: 'qremote 3.9.0!.apk',
    sizeBytes: 1,
    releaseUrl: 'https://github.com/MKDevTests/qRemote/releases/tag/v3.9.0',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    makeDirectoryAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);
    getInfoAsync.mockResolvedValue({ exists: true, size: 40 * 1024 * 1024 });
    downloadAsync.mockResolvedValue({ uri: 'file:///cache/updates/qremote_3.9.0_.apk' });
    createDownloadResumable.mockReturnValue({ downloadAsync });
  });

  it('sanitizes the file name and clears any earlier partial download', async () => {
    const uri = await downloadUpdate(update);

    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///cache/updates/', {
      intermediates: true,
    });
    expect(deleteAsync).toHaveBeenCalledWith('file:///cache/updates/qremote_3.9.0_.apk', {
      idempotent: true,
    });
    expect(createDownloadResumable).toHaveBeenCalledWith(
      update.apkUrl,
      'file:///cache/updates/qremote_3.9.0_.apk',
      {},
      expect.any(Function),
    );
    expect(uri).toBe('file:///cache/updates/qremote_3.9.0_.apk');
  });

  it('reports progress as a fraction, and null when no length is advertised', async () => {
    const seen: (number | null)[] = [];
    await downloadUpdate(update, (f) => seen.push(f));

    const onProgress = createDownloadResumable.mock.calls[0][3] as (p: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void;
    onProgress({ totalBytesWritten: 50, totalBytesExpectedToWrite: 200 });
    onProgress({ totalBytesWritten: 50, totalBytesExpectedToWrite: 0 });

    expect(seen).toEqual([0.25, null]);
  });

  // GitHub serves an error page with a 200 on the redirect chain; it lands on
  // disk as a few hundred bytes and would reach the installer as a corrupt APK.
  it('rejects and deletes a suspiciously small download', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 900 });

    await expect(downloadUpdate(update)).rejects.toThrow('not a valid APK');
    expect(deleteAsync).toHaveBeenLastCalledWith('file:///cache/updates/qremote_3.9.0_.apk', {
      idempotent: true,
    });
  });

  it('rejects when the download produced no file', async () => {
    downloadAsync.mockResolvedValue(undefined);
    await expect(downloadUpdate(update)).rejects.toThrow('no file');
  });
});

describe('installUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'android';
    getContentUriAsync.mockResolvedValue('content://qremote.provider/updates/app.apk');
    startActivityAsync.mockResolvedValue(undefined);
  });

  // FLAG_GRANT_READ_URI_PERMISSION (1) is load-bearing: the installer is a
  // different app and cannot otherwise read the URI it is handed.
  it('hands a content URI to the package installer with the read-permission flag', async () => {
    await installUpdate('file:///cache/updates/app.apk');

    expect(getContentUriAsync).toHaveBeenCalledWith('file:///cache/updates/app.apk');
    expect(startActivityAsync).toHaveBeenCalledWith('android.intent.action.INSTALL_PACKAGE', {
      data: 'content://qremote.provider/updates/app.apk',
      flags: 1,
    });
  });

  it('refuses to run on iOS', async () => {
    mockPlatform.OS = 'ios';
    await expect(installUpdate('file:///cache/updates/app.apk')).rejects.toThrow('Android-only');
    expect(startActivityAsync).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'android';
    expoConfig.extra = { githubRepo: 'MKDevTests/qRemote' };
  });

  it('updatesSupported is true only on Android with a configured repo', () => {
    expect(updatesSupported()).toBe(true);

    mockPlatform.OS = 'ios';
    expect(updatesSupported()).toBe(false);

    mockPlatform.OS = 'android';
    expoConfig.extra = {} as typeof expoConfig.extra;
    expect(updatesSupported()).toBe(false);
  });

  it('releasesUrl points at the configured repo', () => {
    expect(releasesUrl()).toBe('https://github.com/MKDevTests/qRemote/releases');
    expoConfig.extra = {} as typeof expoConfig.extra;
    expect(releasesUrl()).toBeNull();
  });

  it('clearDownloadedUpdates swallows a failing delete', async () => {
    deleteAsync.mockRejectedValue(new Error('busy'));
    await expect(clearDownloadedUpdates()).resolves.toBeUndefined();
  });
});
