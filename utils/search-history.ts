/**
 * search-history.ts — the recent-searches list, as pure logic.
 *
 * The Search tab starts from an empty field every time, and torrent searches
 * are re-run constantly: the same show one episode later, the same release
 * group, the same misspelling corrected. This keeps the last few terms so the
 * user taps instead of retyping.
 */

/** How many terms to keep. Enough to be useful, few enough to fit on a row. */
export const SEARCH_HISTORY_LIMIT = 12;

/**
 * Put `term` at the front of the list.
 *
 * Matching is case- and whitespace-insensitive, but the stored form is the one
 * just typed: someone who searches "ubuntu" then "Ubuntu" wants one entry, and
 * the capitalisation they last chose.
 *
 * A blank term is not history — it returns the list untouched rather than
 * storing an empty chip nobody can tap.
 */
export function addSearchTerm(
  history: readonly string[],
  term: string,
  limit = SEARCH_HISTORY_LIMIT,
): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [...history];

  const key = trimmed.toLowerCase();
  const rest = history.filter((entry) => entry.trim().toLowerCase() !== key);
  return [trimmed, ...rest].slice(0, limit);
}

/** Drop one term, matched the same way `addSearchTerm` dedupes. */
export function removeSearchTerm(history: readonly string[], term: string): string[] {
  const key = term.trim().toLowerCase();
  return history.filter((entry) => entry.trim().toLowerCase() !== key);
}

/**
 * Read a stored list back, dropping anything that is not a usable term.
 *
 * Storage can hold whatever an older build wrote, and a malformed entry must
 * cost one chip rather than the whole history — the same rule the magnet
 * basket follows in utils/magnet-basket.ts.
 */
export function parseStoredHistory(raw: unknown, limit = SEARCH_HISTORY_LIMIT): string[] {
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}
