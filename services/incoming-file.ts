import * as FileSystem from 'expo-file-system/legacy';
import type { IncomingTorrentFile } from '@/utils/torrent-file';

const INCOMING_TORRENTS_DIR = `${FileSystem.cacheDirectory}incoming-torrents/`;

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download.torrent';

/**
 * Copy an incoming .torrent file into the app's own cache directory.
 *
 * iOS delivers "Open In Place" file:// URLs (LSSupportsOpeningDocumentsInPlace)
 * as security-scoped resources tied to the handoff from the source app. If
 * dispatch is delayed — e.g. waiting on navigation readiness after a cold
 * launch — that access can lapse before the file is ever read. Copying
 * immediately, before any further delay, gives us a stable app-owned URI to
 * upload from instead.
 *
 * Android's content:// URIs need the same treatment for a different reason:
 * the read permission they carry is granted to the *activity that received
 * the intent* and is revoked when that activity finishes. A URI held across a
 * relaunch, or read after the sending app has moved on, fails with a security
 * exception — and the upload path has no way to recover. It is also not a
 * plain filesystem path, so anything downstream that expects one breaks on it.
 * Copying resolves both at once.
 */
export async function persistIncomingTorrentFile(
  file: IncomingTorrentFile,
): Promise<IncomingTorrentFile | null> {
  if (!file.uri.startsWith('file://') && !file.uri.startsWith('content://')) {
    return file;
  }

  try {
    await FileSystem.makeDirectoryAsync(INCOMING_TORRENTS_DIR, { intermediates: true });
    const destUri = `${INCOMING_TORRENTS_DIR}${Date.now()}-${sanitizeFileName(file.name)}`;
    await FileSystem.copyAsync({ from: file.uri, to: destUri });

    // The source's security-scoped access can lapse mid-copy, which some
    // native paths surface as a silent empty/partial file rather than a
    // thrown error. Returning that unusable copy just moves the hang from
    // here to the upload — verify it actually has content instead.
    const info = await FileSystem.getInfoAsync(destUri);
    if (!info.exists || info.size === 0) {
      return null;
    }
    return { uri: destUri, name: file.name };
  } catch {
    // The original URI's security-scoped access may already be gone too —
    // don't hand back a URI we can't guarantee is still readable.
    return null;
  }
}
