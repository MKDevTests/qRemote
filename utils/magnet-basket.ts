import { getMagnetDisplayName, getMagnetInfoHash, isMagnetLink } from '@/utils/magnet';

/**
 * One magnet parked in the basket, in the form the list screen renders and
 * AsyncStorage round-trips. Deliberately plain JSON — no Date objects, no
 * class instances — so a stored basket survives an app upgrade unchanged.
 */
export interface MagnetBasketItem {
  /** The full magnet URI, exactly as it arrived. This is what gets submitted. */
  magnet: string;
  /** Lowercased info hash when the link carried one, else null. */
  infoHash: string | null;
  /** The `dn` display name, or null — the UI falls back to the hash. */
  name: string | null;
  /** Epoch ms, so the list can stay in arrival order across a restart. */
  addedAt: number;
}

export function makeBasketItem(magnet: string, now: number): MagnetBasketItem {
  return {
    magnet,
    infoHash: getMagnetInfoHash(magnet),
    name: getMagnetDisplayName(magnet),
    addedAt: now,
  };
}

/**
 * Two magnets are the same torrent when they carry the same info hash.
 *
 * The full URI is only compared when at least one side has no hash to compare:
 * the same release grabbed from two indexers differs in its tracker list and
 * display name while pointing at identical content, so comparing whole URIs
 * would let obvious duplicates into the basket.
 */
export function isSameMagnet(a: MagnetBasketItem, b: MagnetBasketItem): boolean {
  if (a.infoHash && b.infoHash) return a.infoHash === b.infoHash;
  return a.magnet === b.magnet;
}

export interface BasketAddResult {
  items: MagnetBasketItem[];
  /** False when the magnet was rejected — not a magnet, or already in. */
  added: boolean;
  reason?: 'duplicate' | 'invalid';
}

/**
 * Append a magnet, refusing duplicates and anything that isn't a magnet URI.
 *
 * Returns a new array rather than mutating: this feeds React state, and the
 * collect mode adds links one at a time from a deep-link handler that can fire
 * while the list screen is mounted.
 */
export function addMagnetToBasket(
  items: MagnetBasketItem[],
  magnet: string,
  now: number,
): BasketAddResult {
  const trimmed = magnet.trim();
  if (!trimmed || !isMagnetLink(trimmed)) {
    return { items, added: false, reason: 'invalid' };
  }
  const candidate = makeBasketItem(trimmed, now);
  if (items.some((item) => isSameMagnet(item, candidate))) {
    return { items, added: false, reason: 'duplicate' };
  }
  return { items: [...items, candidate], added: true };
}

/** Drop one entry, matched the same way duplicates are detected. */
export function removeFromBasket(
  items: MagnetBasketItem[],
  target: MagnetBasketItem,
): MagnetBasketItem[] {
  return items.filter((item) => !isSameMagnet(item, target));
}

/**
 * Rebuild a basket read back from AsyncStorage, dropping anything that no
 * longer parses. Stored data is the one input this app cannot re-validate at
 * the source, and a single malformed entry must not take the whole basket —
 * or the screen that renders it — down with it.
 */
export function parseStoredBasket(raw: unknown): MagnetBasketItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MagnetBasketItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const magnet = (entry as { magnet?: unknown }).magnet;
    if (typeof magnet !== 'string' || !isMagnetLink(magnet)) continue;
    const addedAt = (entry as { addedAt?: unknown }).addedAt;
    const candidate = makeBasketItem(magnet, typeof addedAt === 'number' ? addedAt : 0);
    if (!out.some((item) => isSameMagnet(item, candidate))) out.push(candidate);
  }
  return out;
}

/** What the submit button sends: arrival order, URIs only. */
export function basketMagnetUrls(items: MagnetBasketItem[]): string[] {
  return [...items].sort((a, b) => a.addedAt - b.addedAt).map((item) => item.magnet);
}
