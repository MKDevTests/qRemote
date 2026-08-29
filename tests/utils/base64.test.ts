import { bytesToBase64 } from '@/utils/base64';

const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('bytesToBase64', () => {
  it('encodes an empty input', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });

  // The three classic padding cases: 3n, 3n+1, 3n+2 bytes.
  it('pads the tail correctly', () => {
    expect(bytesToBase64(enc('abc'))).toBe('YWJj');
    expect(bytesToBase64(enc('a'))).toBe('YQ==');
    expect(bytesToBase64(enc('ab'))).toBe('YWI=');
  });

  it('matches the RFC 4648 test vectors', () => {
    expect(bytesToBase64(enc('f'))).toBe('Zg==');
    expect(bytesToBase64(enc('fo'))).toBe('Zm8=');
    expect(bytesToBase64(enc('foo'))).toBe('Zm9v');
    expect(bytesToBase64(enc('foob'))).toBe('Zm9vYg==');
    expect(bytesToBase64(enc('fooba'))).toBe('Zm9vYmE=');
    expect(bytesToBase64(enc('foobar'))).toBe('Zm9vYmFy');
  });

  it('handles high bytes, which a bencoded .torrent is full of', () => {
    expect(bytesToBase64(new Uint8Array([0x00, 0xff, 0x80]))).toBe('AP+A');
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('+/+/');
  });

  it('agrees with Node for a long random buffer', () => {
    const bytes = new Uint8Array(3000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + (i % 13)) & 0xff;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('agrees with Node at every tail length', () => {
    for (let n = 0; n < 12; n++) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 37) & 0xff;
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
