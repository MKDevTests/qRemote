import { AppPreferences } from '@/types/preferences';

/**
 * The two per-torrent flags qRemote can pre-set on everything it adds.
 *
 * Both are plain `torrents/add` form fields in the WebUI API and have been
 * since 4.1, so nothing here needs an ApiFeatures gate.
 */
export interface TorrentAddDefaults {
  sequentialDownload: boolean;
  firstLastPiecePrio: boolean;
}

/**
 * Read the user's global add-defaults out of stored preferences.
 *
 * `firstLastPiecePrio` comes from the numeric `defaultPriority` key rather than
 * a boolean of its own: that key already backed the existing "First/Last Piece
 * Priority" switch, and renaming a stored preference orphans it for every
 * existing user (there is no migration system — see AGENTS.md §8).
 */
export function getTorrentAddDefaults(
  prefs: Partial<AppPreferences> | null | undefined,
): TorrentAddDefaults {
  return {
    sequentialDownload: prefs?.defaultSequentialDownload === true,
    firstLastPiecePrio: Number(prefs?.defaultPriority ?? 0) > 0,
  };
}

/**
 * Fill the two flags into an options object for a `torrents/add` call.
 *
 * A value already present on `options` always wins, including an explicit
 * `false`: that is the add-torrent dialogue reporting what the user actually
 * sees on screen, and a global default must never silently override a switch
 * the user just looked at. The defaults only fill in where the caller said
 * nothing — which is every add path that has no options UI at all (RSS, the
 * Search tab's instant add, the quick-add modal), plus the dialogue's own
 * hidden fields in its compact variant.
 */
export function withTorrentAddDefaults<T extends object>(
  options: T | undefined,
  prefs: Partial<AppPreferences> | null | undefined,
): Omit<T, keyof TorrentAddDefaults> & TorrentAddDefaults {
  const defaults = getTorrentAddDefaults(prefs);
  // T is deliberately unconstrained so every caller can pass its own add
  // options object without the two flags having to be in its type.
  const given = (options ?? {}) as Partial<TorrentAddDefaults>;
  return {
    ...(options ?? ({} as T)),
    sequentialDownload: given.sequentialDownload ?? defaults.sequentialDownload,
    firstLastPiecePrio: given.firstLastPiecePrio ?? defaults.firstLastPiecePrio,
  } as Omit<T, keyof TorrentAddDefaults> & TorrentAddDefaults;
}
