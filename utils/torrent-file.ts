const TORRENT_EXTENSION = '.torrent';
const FALLBACK_FILE_NAME = 'download.torrent';

export interface IncomingTorrentFile {
  uri: string;
  name: string;
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getFileName = (url: string): string => {
  const withoutQuery = url.split(/[?#]/)[0];
  const lastSegment = withoutQuery.split('/').filter(Boolean).pop() || '';
  return safeDecode(lastSegment).trim();
};

/**
 * Check whether an incoming URL points to a .torrent file opened from another app.
 *
 * iOS delivers `file://` URLs via document types, and the file name is
 * authoritative there.
 *
 * Android delivers `content://` URIs instead, and their path is an opaque
 * provider id — `content://com.android.providers.downloads.documents/document/1234`
 * carries neither a name nor an extension, so testing for `.torrent` rejects
 * essentially every real Android hand-off. What decides on Android is the
 * manifest: the intent filters in app.config.js route only magnet links,
 * `application/x-bittorrent`, and `*.torrent` paths to this app, so a
 * `content://` URI arriving at the Linking handler is by construction a file
 * the user explicitly asked qRemote to open. Accepting it unconditionally is
 * therefore correct, and harmless on iOS, where `content://` never arrives.
 */
export const isTorrentFileUrl = (value?: string | null): boolean => {
  if (!value) return false;
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('content://')) return true;
  if (!lower.startsWith('file://')) return false;
  return getFileName(raw).toLowerCase().endsWith(TORRENT_EXTENSION);
};

/**
 * Extract a torrent file reference (upload URI + display name) from an incoming URL.
 * Returns null when the URL is not a torrent file.
 */
export const extractTorrentFile = (incomingUrl?: string | null): IncomingTorrentFile | null => {
  if (!incomingUrl) return null;

  const raw = incomingUrl.trim();
  if (!isTorrentFileUrl(raw)) return null;

  let name = getFileName(raw);

  // An opaque content:// id ("1234", "msf:42") is not a file name — appending
  // ".torrent" to it would show the user a meaningless name in the add dialog.
  // qBittorrent reads the torrent's own metadata for the display name anyway,
  // so a neutral fallback loses nothing.
  if (
    raw.toLowerCase().startsWith('content://') &&
    !name.toLowerCase().endsWith(TORRENT_EXTENSION)
  ) {
    name = FALLBACK_FILE_NAME;
  } else if (!name.toLowerCase().endsWith(TORRENT_EXTENSION)) {
    name = name ? `${name}${TORRENT_EXTENSION}` : FALLBACK_FILE_NAME;
  }

  return { uri: raw, name };
};
