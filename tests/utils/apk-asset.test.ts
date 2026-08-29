import { abiOf, pickApkAsset } from '@/utils/apk-asset';

const asset = (name: string) => ({
  name,
  browser_download_url: `https://example.com/${name}`,
  size: 1,
});

/** What a v4.3.0 release attaches. */
const SPLIT = [asset('qremote-4.3.0-arm64-v8a.apk'), asset('qremote-4.3.0-armeabi-v7a.apk')];
/** What every release up to v4.2.0 attached. */
const UNIVERSAL = [asset('qremote-4.2.0.apk')];

const ARM64 = ['arm64-v8a', 'armeabi-v7a'];
const ARM32 = ['armeabi-v7a'];

describe('abiOf', () => {
  it('reads the ABI out of a split APK name', () => {
    expect(abiOf('qremote-4.3.0-arm64-v8a.apk')).toBe('arm64-v8a');
    expect(abiOf('qremote-4.3.0-armeabi-v7a.apk')).toBe('armeabi-v7a');
    expect(abiOf('QREMOTE-4.3.0-X86_64.APK')).toBe('x86_64');
  });

  it('does not mistake armeabi-v7a for another ABI', () => {
    // 'x86' is a substring rule too, and 'arm64-v8a' contains 'arm'.
    expect(abiOf('app-armeabi-v7a-release.apk')).toBe('armeabi-v7a');
  });

  it('returns null for a universal APK', () => {
    expect(abiOf('qremote-4.2.0.apk')).toBeNull();
  });
});

describe('pickApkAsset', () => {
  it('returns null when there is nothing to pick', () => {
    expect(pickApkAsset([], ARM64)).toBeNull();
    expect(pickApkAsset(null, ARM64)).toBeNull();
    expect(pickApkAsset(undefined, ARM64)).toBeNull();
  });

  it('ignores assets that are not usable APKs', () => {
    const junk = [
      { name: 'qremote-4.3.0-arm64-v8a.apk' }, // no download url
      { name: 'sources.zip', browser_download_url: 'https://example.com/sources.zip' },
    ];
    expect(pickApkAsset(junk, ARM64)).toBeNull();
  });

  it('picks the ABI the device actually runs', () => {
    expect(pickApkAsset(SPLIT, ARM64)?.name).toBe('qremote-4.3.0-arm64-v8a.apk');
    expect(pickApkAsset(SPLIT, ARM32)?.name).toBe('qremote-4.3.0-armeabi-v7a.apk');
  });

  it('follows the device preference order, not the asset order', () => {
    const reversed = [...SPLIT].reverse();
    expect(pickApkAsset(reversed, ARM64)?.name).toBe('qremote-4.3.0-arm64-v8a.apk');
  });

  it('matches case-insensitively', () => {
    expect(pickApkAsset(SPLIT, ['ARM64-V8A'])?.name).toBe('qremote-4.3.0-arm64-v8a.apk');
  });

  it('still finds the universal APK of an older release', () => {
    expect(pickApkAsset(UNIVERSAL, ARM64)?.name).toBe('qremote-4.2.0.apk');
    expect(pickApkAsset(UNIVERSAL, null)?.name).toBe('qremote-4.2.0.apk');
    expect(pickApkAsset(UNIVERSAL, [])?.name).toBe('qremote-4.2.0.apk');
  });

  it('prefers a matching split over a universal build alongside it', () => {
    const both = [...UNIVERSAL, ...SPLIT];
    expect(pickApkAsset(both, ARM64)?.name).toBe('qremote-4.3.0-arm64-v8a.apk');
  });

  it('falls back to universal when no split matches', () => {
    const both = [...SPLIT, asset('qremote-4.3.0.apk')];
    expect(pickApkAsset(both, ['riscv64'])?.name).toBe('qremote-4.3.0.apk');
  });

  it('refuses rather than offering the wrong ABI', () => {
    expect(pickApkAsset(SPLIT, ['x86_64'])).toBeNull();
    expect(pickApkAsset(SPLIT, null)).toBeNull();
    expect(pickApkAsset(SPLIT, [])).toBeNull();
  });
});
