import {
  extractMagnetLink,
  getMagnetDisplayName,
  getMagnetInfoHash,
  isMagnetLink,
} from '@/utils/magnet';

describe('isMagnetLink', () => {
  it('returns true for valid magnet links', () => {
    expect(isMagnetLink('magnet:?xt=urn:btih:abc123')).toBe(true);
  });

  it('is case-insensitive and ignores outer whitespace', () => {
    expect(isMagnetLink('  MAGNET:?xt=urn:btih:abc123  ')).toBe(true);
  });

  it('returns false for non-magnet values', () => {
    expect(isMagnetLink('https://example.com/file.torrent')).toBe(false);
    expect(isMagnetLink('')).toBe(false);
  });
});

describe('extractMagnetLink', () => {
  const sampleMagnet = 'magnet:?xt=urn:btih:ABCDEF1234567890&dn=Ubuntu';
  const encodedSampleMagnet = encodeURIComponent(sampleMagnet);

  it('extracts direct magnet links', () => {
    expect(extractMagnetLink(sampleMagnet)).toBe(sampleMagnet);
  });

  it('extracts URL-encoded direct magnet links', () => {
    expect(extractMagnetLink(encodedSampleMagnet)).toBe(sampleMagnet);
  });

  it('extracts magnet from deep-link magnet param', () => {
    const incomingUrl = `qremote:///?magnet=${encodedSampleMagnet}`;
    expect(extractMagnetLink(incomingUrl)).toBe(sampleMagnet);
  });

  it('extracts magnet from deep-link url param', () => {
    const incomingUrl = `qremote:///?url=${encodedSampleMagnet}`;
    expect(extractMagnetLink(incomingUrl)).toBe(sampleMagnet);
  });

  it('returns null when no magnet link exists', () => {
    expect(extractMagnetLink('qremote:///?foo=bar')).toBeNull();
    expect(extractMagnetLink('https://example.com/file.torrent')).toBeNull();
    expect(extractMagnetLink('')).toBeNull();
    expect(extractMagnetLink(undefined)).toBeNull();
    expect(extractMagnetLink(null)).toBeNull();
  });

  it('falls back to regex extraction for free-form text', () => {
    const incomingText = `Hey, use this ${sampleMagnet} thanks`;
    expect(extractMagnetLink(incomingText)).toBe(sampleMagnet);
  });

  it('handles malformed percent-encoding without throwing (safeDecode catch)', () => {
    // "%" alone is an invalid escape sequence for decodeURIComponent
    expect(extractMagnetLink('%')).toBeNull();
  });

  it('returns the raw magnet unchanged when it contains invalid percent-encoding', () => {
    const malformed = 'magnet:?xt=urn:btih:abc%zz123';
    expect(extractMagnetLink(malformed)).toBe(malformed);
  });
});

describe('getMagnetInfoHash', () => {
  const HASH = 'c9e15763f722f23e98a29decdfae341b98d53056';

  it('reads a v1 hex hash', () => {
    expect(getMagnetInfoHash(`magnet:?xt=urn:btih:${HASH}&dn=Some.Release`)).toBe(HASH);
  });

  it('lowercases an uppercase hash so the same torrent compares equal', () => {
    expect(getMagnetInfoHash(`magnet:?xt=urn:btih:${HASH.toUpperCase()}`)).toBe(HASH);
  });

  it('accepts the 32-character base32 form', () => {
    const b32 = 'ZHQVOY7XELZD5GFCTXWN7LRUDOMNKMCW';
    expect(getMagnetInfoHash(`magnet:?xt=urn:btih:${b32}`)).toBe(b32.toLowerCase());
  });

  it('accepts a 64-character v2 hash', () => {
    const v2 = 'a'.repeat(64);
    expect(getMagnetInfoHash(`magnet:?xt=urn:btih:${v2}`)).toBe(v2);
  });

  it('takes the btih xt from a hybrid magnet, ignoring urn:btmh', () => {
    const m = `magnet:?xt=urn:btmh:1220${'b'.repeat(60)}&xt=urn:btih:${HASH}&dn=Hybrid`;
    expect(getMagnetInfoHash(m)).toBe(HASH);
  });

  it('finds the hash whatever the parameter order', () => {
    expect(getMagnetInfoHash(`magnet:?dn=Name&tr=udp%3A%2F%2Ft.example&xt=urn:btih:${HASH}`)).toBe(
      HASH,
    );
  });

  it('rejects a hash of the wrong length rather than guessing', () => {
    expect(getMagnetInfoHash('magnet:?xt=urn:btih:abc123')).toBeNull();
  });

  it('returns null for a magnet with no xt, and for a non-magnet', () => {
    expect(getMagnetInfoHash('magnet:?dn=NoHash')).toBeNull();
    expect(getMagnetInfoHash('https://example.com/x.torrent')).toBeNull();
    expect(getMagnetInfoHash('not a url at all')).toBeNull();
  });
});

describe('getMagnetDisplayName', () => {
  it('decodes a percent-encoded name', () => {
    expect(getMagnetDisplayName('magnet:?xt=urn:btih:x&dn=Some%20Release%202026')).toBe(
      'Some Release 2026',
    );
  });

  it('turns + into a space, as URLSearchParams does for query strings', () => {
    expect(getMagnetDisplayName('magnet:?dn=Some+Release')).toBe('Some Release');
  });

  it('returns null when dn is missing or blank, so callers use a fallback', () => {
    expect(getMagnetDisplayName('magnet:?xt=urn:btih:x')).toBeNull();
    expect(getMagnetDisplayName('magnet:?dn=%20%20')).toBeNull();
    expect(getMagnetDisplayName('nonsense')).toBeNull();
  });
});
