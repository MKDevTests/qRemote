/**
 * torrent-export.ts — save a torrent's own `.torrent` file and hand it to the
 * share sheet.
 *
 * qBittorrent keeps the original metainfo for everything it manages, and
 * `torrents/export` gives it back. That is the only way to get a `.torrent`
 * out of a torrent added from a magnet link, which is most of them.
 *
 * The file goes to the app cache rather than to storage the user picked: the
 * share sheet is where it becomes theirs, and a cache file needs no
 * permission and gets cleaned up by Android on its own.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { torrentsApi } from '@/services/api/torrents';
import { bytesToBase64 } from '@/utils/base64';

const EXPORT_DIR = `${FileSystem.cacheDirectory}exports/`;

/**
 * Make a torrent name safe to use as a filename.
 *
 * Torrent names routinely contain `/`, `:` and quotes, all of which either
 * break the write or silently create a directory. An empty result falls back
 * to the info hash, which is never empty and never invalid.
 */
export function exportFileName(name: string | undefined, hash: string): string {
  const cleaned = (name ?? '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/, '');
  return `${cleaned || hash}.torrent`;
}

/**
 * Fetch, write and share. Resolves once the share sheet has been handed the
 * file — not once the user has chosen what to do with it, which the platform
 * does not report.
 *
 * Throws if the server refuses the export or sharing is unavailable; callers
 * surface that as a toast.
 */
export async function exportTorrentFile(hash: string, name?: string): Promise<void> {
  const bytes = await torrentsApi.exportTorrent(hash);
  if (bytes.length === 0) {
    throw new Error('The server returned an empty .torrent file');
  }

  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true }).catch(() => {
    // Already there — makeDirectoryAsync rejects rather than no-op'ing.
  });

  const target = `${EXPORT_DIR}${exportFileName(name, hash)}`;
  await FileSystem.writeAsStringAsync(target, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(target, {
    mimeType: 'application/x-bittorrent',
    UTI: 'org.bittorrent.torrent',
  });
}
