const makeDirectoryAsync = jest.fn();
const writeAsStringAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: (...a: unknown[]) => makeDirectoryAsync(...a),
  writeAsStringAsync: (...a: unknown[]) => writeAsStringAsync(...a),
}));

const isAvailableAsync = jest.fn();
const shareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...a: unknown[]) => isAvailableAsync(...a),
  shareAsync: (...a: unknown[]) => shareAsync(...a),
}));

const exportTorrent = jest.fn();
jest.mock('@/services/api/torrents', () => ({
  torrentsApi: { exportTorrent: (...a: unknown[]) => exportTorrent(...a) },
}));

import { exportFileName, exportTorrentFile } from '@/services/torrent-export';

const BYTES = new Uint8Array([0x64, 0x38, 0x3a]); // "d8:" — a bencoded dict

describe('exportFileName', () => {
  it('appends the extension', () => {
    expect(exportFileName('Ubuntu 24.04', 'abc')).toBe('Ubuntu 24.04.torrent');
  });

  it('replaces the characters that break a write or make a directory', () => {
    expect(exportFileName('a/b:c?d*e|f"g<h>i%j', 'abc')).toBe('a_b_c_d_e_f_g_h_i_j.torrent');
  });

  it('collapses whitespace and trims', () => {
    expect(exportFileName('  spaced   out  ', 'abc')).toBe('spaced out.torrent');
  });

  it('falls back to the hash when nothing usable is left', () => {
    expect(exportFileName('', 'DEADBEEF')).toBe('DEADBEEF.torrent');
    expect(exportFileName('///', 'DEADBEEF')).toBe('___.torrent');
    expect(exportFileName(undefined, 'DEADBEEF')).toBe('DEADBEEF.torrent');
  });

  it('caps the length and never ends on a dot or space', () => {
    const name = exportFileName('x'.repeat(400), 'abc');
    expect(name.length).toBe(120 + '.torrent'.length);
    expect(exportFileName('trailing dot.', 'abc')).toBe('trailing dot.torrent');
  });
});

describe('exportTorrentFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exportTorrent.mockResolvedValue(BYTES);
    makeDirectoryAsync.mockResolvedValue(undefined);
    writeAsStringAsync.mockResolvedValue(undefined);
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
  });

  it('writes the file into the cache and shares it', async () => {
    await exportTorrentFile('HASH1', 'My Torrent');

    expect(exportTorrent).toHaveBeenCalledWith('HASH1');
    expect(writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/exports/My Torrent.torrent',
      'ZDg6',
      { encoding: 'base64' },
    );
    expect(shareAsync).toHaveBeenCalledWith(
      'file:///cache/exports/My Torrent.torrent',
      expect.objectContaining({ mimeType: 'application/x-bittorrent' }),
    );
  });

  // makeDirectoryAsync rejects on an existing directory rather than no-op'ing.
  it('survives the export directory already existing', async () => {
    makeDirectoryAsync.mockRejectedValue(new Error('EEXIST'));
    await expect(exportTorrentFile('HASH1', 'x')).resolves.toBeUndefined();
    expect(shareAsync).toHaveBeenCalled();
  });

  it('refuses an empty response instead of sharing a broken file', async () => {
    exportTorrent.mockResolvedValue(new Uint8Array([]));
    await expect(exportTorrentFile('HASH1', 'x')).rejects.toThrow('empty');
    expect(writeAsStringAsync).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('reports when sharing is unavailable', async () => {
    isAvailableAsync.mockResolvedValue(false);
    await expect(exportTorrentFile('HASH1', 'x')).rejects.toThrow('Sharing is not available');
  });

  it('lets a server error through to the caller', async () => {
    exportTorrent.mockRejectedValue(new Error('Torrent not found'));
    await expect(exportTorrentFile('HASH1', 'x')).rejects.toThrow('Torrent not found');
  });
});
