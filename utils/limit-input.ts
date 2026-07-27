/**
 * limit-input.ts — parsing and display logic for the numeric limit fields
 * (share ratio, seeding time, speed) the user types on the torrent detail screen.
 *
 * qBittorrent uses two sentinel values in every share-limit field (ratio,
 * seeding time, inactive seeding time):
 *   -2 → follow the global limit
 *   -1 → no limit
 * Any other negative number is meaningless, so it is rejected on input.
 *
 * `torrents/info` reports each share limit twice: the torrent's OWN setting
 * (`ratio_limit`) and the EFFECTIVE limit with -2 already resolved against the
 * global setting (`max_ratio`). Those agree when an explicit per-torrent limit
 * is set and diverge when the torrent follows the global limit — which is why
 * showing the raw own-value alone reads "Unlimited" for a torrent that is in
 * fact capped by the global limit.
 */

/** Sentinel: follow the global (server-wide) limit. */
export const SHARE_LIMIT_GLOBAL = -2;
/** Sentinel: no limit at all. */
export const SHARE_LIMIT_UNLIMITED = -1;

/**
 * Smooth over what iOS keyboards actually emit before parsing.
 *
 * The numbers-and-punctuation keyboard offers "," as the decimal separator in
 * the es/fr/de/ru locales, and some keyboards produce a Unicode minus (U+2212)
 * or an en/em dash rather than ASCII "-". Without this, a strict parse would
 * reject input that looks perfectly valid to the person typing it.
 */
export function normalizeNumericInput(raw: string): string {
  return raw.trim().replace(/[−–—]/g, '-').replace(',', '.');
}

/**
 * Parse a user-entered share limit. Returns `null` when the input is not a
 * usable value, so callers can reject it instead of silently coercing.
 *
 * Deliberately stricter than `parseFloat`, which happily returns 1.2 for
 * "1.2.3" and NaN for "abc" — and NaN then reads as "unlimited" downstream.
 *
 * An empty string is treated as "no limit" (-1), matching the placeholder text.
 */
export function parseShareLimitInput(
  raw: string,
  options: { integer?: boolean } = {},
): number | null {
  const normalized = normalizeNumericInput(raw);
  if (normalized === '') return SHARE_LIMIT_UNLIMITED;

  const pattern = options.integer ? /^-?\d+$/ : /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (!pattern.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  // Only the two documented sentinels are valid negatives.
  if (parsed < 0 && parsed !== SHARE_LIMIT_GLOBAL && parsed !== SHARE_LIMIT_UNLIMITED) {
    return null;
  }
  return parsed;
}

/**
 * Parse a speed limit. Unit-agnostic — the caller decides whether it's bytes/s
 * or KiB/s. Empty means 0, which qBittorrent treats as unlimited. Negatives are
 * rejected: unlike share limits, speed limits have no sentinel values.
 */
export function parseSpeedLimitInput(raw: string): number | null {
  const normalized = normalizeNumericInput(raw);
  if (normalized === '') return 0;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ShareLimitDisplay =
  /** No limit applies. */
  | { kind: 'unlimited' }
  /** Following the global limit; `effective` is the resolved value, or null when the global limit is itself unlimited. */
  | { kind: 'global'; effective: number | null }
  /** An explicit per-torrent limit. */
  | { kind: 'value'; value: number };

/**
 * Work out what a share-limit row should actually say.
 *
 * @param own       the torrent's own setting (`ratio_limit` / `seeding_time_limit`)
 * @param effective the resolved limit (`max_ratio` / `max_seeding_time`)
 */
export function describeShareLimit(
  own: number | null | undefined,
  effective: number | null | undefined,
): ShareLimitDisplay {
  const resolved = effective != null && effective >= 0 ? effective : null;

  // Servers older than WebAPI 2.8.0 don't report the per-torrent field at all;
  // the effective value is the only thing we know.
  if (own == null) {
    return resolved == null ? { kind: 'unlimited' } : { kind: 'value', value: resolved };
  }
  if (own === SHARE_LIMIT_GLOBAL) {
    return { kind: 'global', effective: resolved };
  }
  if (own < 0) {
    return { kind: 'unlimited' };
  }
  return { kind: 'value', value: own };
}
