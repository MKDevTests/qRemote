import { extractMagnetLink } from '@/utils/magnet';
import { isTorrentFileUrl } from '@/utils/torrent-file';

/**
 * Expo Router's own deep-link handling has no scheme filtering (`prefixes: []`
 * internally) — it treats any incoming URL, including the `file://…torrent`
 * one iOS delivers for "Open In", as a navigation target, stripping the scheme
 * and matching the raw file path as an app route. That path never matches
 * anything, so the user lands on "Unmatched Route" instead of the app's own
 * magnet/.torrent handling in app/_layout.tsx (a separate Linking listener
 * that keeps working regardless of what this returns).
 *
 * Returning null here tells Router "don't navigate, leave the app where it
 * is" for these URLs, so only our own handler acts on them.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  if (extractMagnetLink(path) || isTorrentFileUrl(path)) {
    return null;
  }
  return path;
}
