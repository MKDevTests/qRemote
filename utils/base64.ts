/**
 * base64.ts — encode raw bytes as base64.
 *
 * Hermes has no `Buffer` and no reliable `btoa`, and expo-file-system writes a
 * binary file by taking base64 text. So anything that fetches bytes over the
 * API and puts them on disk — the .torrent export, today — needs this in
 * between.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Standard base64, with `=` padding.
 *
 * Written as an explicit three-bytes-to-four-characters loop rather than via
 * a string intermediate: a .torrent can be a few megabytes, and building one
 * JS string per byte first is what turns that into a visible freeze.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const full = bytes.length - (bytes.length % 3);

  for (let i = 0; i < full; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63] +
      ALPHABET[n & 63];
  }

  // The tail: one or two bytes left over, padded out to four characters.
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = bytes[full] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[full] << 16) | (bytes[full + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }

  return out;
}
