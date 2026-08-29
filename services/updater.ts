import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { APP_VERSION } from '@/utils/version';

/**
 * updater.ts — Android in-app updates from GitHub releases.
 *
 * This fork ships Android APKs through GitHub releases rather than a store, so
 * nothing tells a device that a newer build exists. This module is that
 * missing piece: it reads the repository's latest release, compares it to the
 * running version, and — if the user agrees — downloads the attached APK and
 * hands it to Android's package installer.
 *
 * Android only, deliberately. On iOS the App Store owns updates and sideloading
 * is not possible; every entry point here no-ops rather than showing the user a
 * control that cannot work.
 *
 * The install itself is *always* the system's decision: we fire an intent, the
 * OS shows its own confirmation, and the user can refuse. Nothing here installs
 * silently.
 */

const GITHUB_API = 'https://api.github.com';

/** Where releases are read from. Set in app.config.js `extra.githubRepo`. */
function githubRepo(): string | null {
  const repo = Constants.expoConfig?.extra?.githubRepo;
  return typeof repo === 'string' && repo.includes('/') ? repo : null;
}

export interface AvailableUpdate {
  /** Normalised semver, e.g. "3.9.1" — the leading "v" of the tag stripped. */
  version: string;
  tag: string;
  notes: string;
  apkUrl: string;
  apkName: string;
  /** 0 when the API did not report a size. */
  sizeBytes: number;
  releaseUrl: string;
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; latestVersion: string }
  | { status: 'available'; update: AvailableUpdate }
  /** Reached GitHub, but the latest release has no APK attached. */
  | { status: 'no-asset'; latestVersion: string; releaseUrl: string }
  /** Not applicable on this platform, or no repo configured. */
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

/**
 * Compare two dotted numeric versions.
 *
 * Returns >0 when `a` is newer, <0 when older, 0 when equal. Missing components
 * count as 0, so "3.9" == "3.9.0".
 *
 * Everything from the first `-` or `+` is discarded before comparing, which
 * makes "3.9.0-beta.1" rank *equal* to "3.9.0" rather than above it. Splitting
 * on `-` instead would turn the `1` of `beta.1` into a fourth component and
 * offer every user of the stable 3.9.0 an "update" to the beta that preceded
 * it. Equal is the safe reading: a pre-release is never pushed at someone who
 * already has the release.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((part) => parseInt(part, 10))
      .filter((n) => !Number.isNaN(n));

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubAsset[];
}

/** The first `.apk` attached to the release, or null. */
function findApkAsset(release: GitHubRelease): GitHubAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return (
    assets.find(
      (asset) =>
        typeof asset.browser_download_url === 'string' &&
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().endsWith('.apk'),
    ) ?? null
  );
}

/**
 * Ask GitHub whether a newer release exists.
 *
 * Never throws: an update check runs in the background on launch, and a
 * network blip there must not surface as a crash or an error toast. Failures
 * come back as `{ status: 'error' }` for the caller to show — or ignore.
 */
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheckResult> {
  if (Platform.OS !== 'android') return { status: 'unsupported' };

  const repo = githubRepo();
  if (!repo) return { status: 'unsupported' };

  try {
    const response = await fetch(`${GITHUB_API}/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal,
    });

    // 404 is the normal answer for a repository that has no published release
    // yet — not an error worth showing anyone.
    if (response.status === 404) {
      return { status: 'up-to-date', latestVersion: APP_VERSION };
    }
    if (response.status === 403 || response.status === 429) {
      // Unauthenticated GitHub API calls are rate-limited per IP (60/hour).
      return { status: 'error', message: 'rateLimited' };
    }
    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` };
    }

    const release = (await response.json()) as GitHubRelease;
    const tag = release.tag_name ?? '';
    const latestVersion = tag.replace(/^v/i, '');
    if (!latestVersion) {
      return { status: 'error', message: 'noTag' };
    }

    if (compareVersions(latestVersion, APP_VERSION) <= 0) {
      return { status: 'up-to-date', latestVersion };
    }

    const asset = findApkAsset(release);
    if (!asset?.browser_download_url) {
      return {
        status: 'no-asset',
        latestVersion,
        releaseUrl: release.html_url ?? `https://github.com/${repo}/releases`,
      };
    }

    return {
      status: 'available',
      update: {
        version: latestVersion,
        tag,
        notes: (release.body ?? '').trim(),
        apkUrl: asset.browser_download_url,
        apkName: asset.name ?? `qremote-${latestVersion}.apk`,
        sizeBytes: typeof asset.size === 'number' ? asset.size : 0,
        releaseUrl: release.html_url ?? `https://github.com/${repo}/releases`,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'error', message: 'aborted' };
    }
    return { status: 'error', message: 'network' };
  }
}

const UPDATE_DIR = `${FileSystem.cacheDirectory}updates/`;

/**
 * Download the update's APK into the app cache and return its file:// URI.
 *
 * `onProgress` receives 0..1, or null while the server withholds a content
 * length (GitHub redirects downloads to a CDN that usually provides one, but
 * not always — a progress bar that silently sits at 0 is worse than one the
 * caller knows to render as indeterminate).
 */
export async function downloadUpdate(
  update: AvailableUpdate,
  onProgress?: (fraction: number | null) => void,
): Promise<string> {
  await FileSystem.makeDirectoryAsync(UPDATE_DIR, { intermediates: true });

  // One file per version, and always deleted first: a truncated download left
  // behind by an earlier attempt would otherwise be handed to the installer as
  // a corrupt APK, which fails with an unhelpful "There was a problem parsing
  // the package".
  const target = `${UPDATE_DIR}${update.apkName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await FileSystem.deleteAsync(target, { idempotent: true });

  const resumable = FileSystem.createDownloadResumable(
    update.apkUrl,
    target,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (!onProgress) return;
      onProgress(
        totalBytesExpectedToWrite > 0 ? totalBytesWritten / totalBytesExpectedToWrite : null,
      );
    },
  );

  const result = await resumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('Download produced no file');
  }

  // A GitHub error page (rate limit, deleted asset) is served with a 200 for
  // the redirect chain and lands on disk as a few hundred bytes of HTML. Catch
  // it here rather than in the package installer.
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || (info.size ?? 0) < 1024 * 100) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error('Downloaded file is not a valid APK');
  }

  return result.uri;
}

/**
 * Hand the downloaded APK to Android's package installer.
 *
 * Two things are load-bearing:
 *   - The installer is a different app, so it cannot read our `file://` path.
 *     `getContentUriAsync` exposes the file through the FileProvider that
 *     expo-file-system already declares in the manifest.
 *   - That content URI has to come with FLAG_GRANT_READ_URI_PERMISSION (1), or
 *     the installer is handed a URI it is not allowed to open and fails with a
 *     parse error.
 *
 * The system then shows its own "Do you want to install this app?" dialog, and
 * on Android 8+ additionally asks the user to allow installs from qRemote if
 * they have not already. Returning normally means the intent was *fired*, not
 * that the user accepted it — Android does not tell us the outcome.
 */
export async function installUpdate(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('installUpdate is Android-only');
  }

  const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
  const contentUri = await FileSystem.getContentUriAsync(fileUri);

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** Best-effort cleanup of downloaded APKs. Failure is not worth reporting. */
export async function clearDownloadedUpdates(): Promise<void> {
  try {
    await FileSystem.deleteAsync(UPDATE_DIR, { idempotent: true });
  } catch {
    // Cache directory; the OS reclaims it anyway.
  }
}

/** True when this build can install updates itself (i.e. Android + a repo). */
export function updatesSupported(): boolean {
  return Platform.OS === 'android' && githubRepo() !== null;
}

/** Public releases page, for the "open in browser" fallback. */
export function releasesUrl(): string | null {
  const repo = githubRepo();
  return repo ? `https://github.com/${repo}/releases` : null;
}
