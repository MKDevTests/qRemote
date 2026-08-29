const MAGNET_PREFIX = 'magnet:?';

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const isMagnetLink = (value: string): boolean =>
  value.trim().toLowerCase().startsWith(MAGNET_PREFIX);

/**
 * Extract a magnet URI from an arbitrary incoming URL.
 * Supports direct `magnet:?` links and app deep links that carry it in query params.
 */
export const extractMagnetLink = (incomingUrl?: string | null): string | null => {
  if (!incomingUrl) return null;

  const raw = incomingUrl.trim();
  if (!raw) return null;

  const decodedRaw = safeDecode(raw);
  if (isMagnetLink(decodedRaw)) {
    return decodedRaw;
  }

  try {
    const parsed = new URL(raw);
    const candidates = [
      parsed.searchParams.get('magnet'),
      parsed.searchParams.get('url'),
      parsed.searchParams.get('link'),
    ].filter((value): value is string => !!value);

    for (const candidate of candidates) {
      const decodedCandidate = safeDecode(candidate.trim());
      if (isMagnetLink(decodedCandidate)) {
        return decodedCandidate;
      }
    }
  } catch {
    // Ignore parse errors and try regex fallback.
  }

  const fallback = decodedRaw.match(/magnet:\?[^\s]+/i)?.[0];
  return fallback && isMagnetLink(fallback) ? fallback : null;
};

/**
 * The query part of a magnet URI, as URLSearchParams.
 *
 * `new URL(magnet)` is not usable here: `magnet:` is a non-special scheme, so
 * the WHATWG parser leaves everything after the colon in `pathname` and hands
 * back an empty `searchParams`. Slicing at the first `?` is what actually
 * works, and matches how qBittorrent itself reads these.
 */
const magnetParams = (magnet: string): URLSearchParams | null => {
  const q = magnet.indexOf('?');
  if (q < 0) return null;
  try {
    return new URLSearchParams(magnet.slice(q + 1));
  } catch {
    return null;
  }
};

/**
 * The BitTorrent info hash carried by a magnet link, lowercased, or null.
 *
 * Used to tell two magnets apart when the rest of the URI differs — the same
 * torrent handed out by two indexers usually carries a different tracker list
 * and display name, so comparing whole URIs would let duplicates through.
 *
 * A hybrid v1+v2 magnet carries two `xt` values; the first `urn:btih:` one
 * wins, which is the v1 hash and the one qBittorrent keys torrents by. Both
 * hex (40 or 64 characters) and the older base32 form (32 characters) are
 * accepted, and anything else is rejected rather than guessed at.
 */
export const getMagnetInfoHash = (magnet: string): string | null => {
  const params = magnetParams(magnet);
  if (!params) return null;
  for (const xt of params.getAll('xt')) {
    const match = xt.trim().match(/^urn:btih:([A-Za-z0-9]+)$/i);
    if (!match) continue;
    const hash = match[1].toLowerCase();
    if (hash.length === 32 || hash.length === 40 || hash.length === 64) return hash;
  }
  return null;
};

/**
 * The `dn` (display name) of a magnet link, or null when it has none —
 * plenty of magnets omit it, so callers must have a fallback rather than
 * showing an empty row.
 */
export const getMagnetDisplayName = (magnet: string): string | null => {
  const params = magnetParams(magnet);
  const name = params?.get('dn')?.trim();
  return name ? name : null;
};
