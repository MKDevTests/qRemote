/**
 * apk-asset.ts — choose which APK on a GitHub release this device should
 * download.
 *
 * Releases ship one APK per ABI (see plugins/withAndroidBuildTweaks.js): a
 * universal build carries React Native's C++ for every architecture and
 * weighs ~59 MB, while a single-ABI build is ~35 MB. The saving is entirely
 * the user's download, so the updater has to pick correctly — installing the
 * wrong ABI over a working install would replace its native libraries with
 * ones this CPU cannot load.
 *
 * Releases up to v4.2.0 attached a single universal `qremote-<version>.apk`,
 * and the app that reads them may be any older build, so selection has to
 * degrade cleanly in both directions: a new app must still find the old
 * universal asset, and an old app still takes the first `.apk` it sees.
 */

/** The fields of a GitHub release asset this module needs. */
export interface ApkAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

/** Every ABI a release may be split on, longest first — see `abiOf`. */
const KNOWN_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'] as const;

function isUsable(asset: ApkAsset): boolean {
  return (
    typeof asset.browser_download_url === 'string' &&
    typeof asset.name === 'string' &&
    asset.name.toLowerCase().endsWith('.apk')
  );
}

/**
 * The ABI an asset is built for, or null when it names none — a universal
 * APK, which any device can install.
 *
 * Matched longest-first so `armeabi-v7a` is never mistaken for the `x86`
 * substring rule, and so an `arm64-v8a` name is not read as plain `arm`.
 */
export function abiOf(assetName: string): string | null {
  const lower = assetName.toLowerCase();
  return KNOWN_ABIS.find((abi) => lower.includes(abi)) ?? null;
}

/**
 * Pick the best APK for a device.
 *
 * @param assets           the release's assets, as GitHub returned them
 * @param supportedAbis    the device's ABIs, most preferred first
 *                         (`Device.supportedCpuArchitectures`). Null or empty
 *                         when the platform will not say — then only a
 *                         universal APK is safe.
 */
export function pickApkAsset(
  assets: readonly ApkAsset[] | null | undefined,
  supportedAbis: readonly string[] | null | undefined,
): ApkAsset | null {
  const apks = (Array.isArray(assets) ? assets : []).filter(isUsable);
  if (apks.length === 0) return null;

  const universal = apks.find((asset) => abiOf(asset.name as string) === null) ?? null;

  // Device order is preference order: an arm64 phone lists arm64-v8a first
  // and armeabi-v7a second, and would run either — but the first is native.
  for (const abi of supportedAbis ?? []) {
    const match = apks.find((asset) => abiOf(asset.name as string) === abi.toLowerCase());
    if (match) return match;
  }

  // Nothing matched this device's ABIs — or the platform would not name
  // them. A universal APK installs anywhere, so it is the answer to both.
  // Failing that, refuse: an APK for the wrong ABI would replace a working
  // install's native libraries with ones this CPU cannot load, and the card
  // still offers "View on GitHub" for a human to sort out.
  return universal;
}
