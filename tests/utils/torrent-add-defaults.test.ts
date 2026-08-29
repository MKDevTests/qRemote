import { getTorrentAddDefaults, withTorrentAddDefaults } from '@/utils/torrent-add-defaults';

describe('getTorrentAddDefaults', () => {
  it('is all-off for absent preferences', () => {
    expect(getTorrentAddDefaults(null)).toEqual({
      sequentialDownload: false,
      firstLastPiecePrio: false,
    });
    expect(getTorrentAddDefaults(undefined)).toEqual({
      sequentialDownload: false,
      firstLastPiecePrio: false,
    });
    expect(getTorrentAddDefaults({})).toEqual({
      sequentialDownload: false,
      firstLastPiecePrio: false,
    });
  });

  it('reads the sequential flag strictly', () => {
    expect(getTorrentAddDefaults({ defaultSequentialDownload: true }).sequentialDownload).toBe(
      true,
    );
    expect(getTorrentAddDefaults({ defaultSequentialDownload: false }).sequentialDownload).toBe(
      false,
    );
  });

  it('treats any positive defaultPriority as first/last-piece on', () => {
    expect(getTorrentAddDefaults({ defaultPriority: 1 }).firstLastPiecePrio).toBe(true);
    expect(getTorrentAddDefaults({ defaultPriority: 7 }).firstLastPiecePrio).toBe(true);
    expect(getTorrentAddDefaults({ defaultPriority: 0 }).firstLastPiecePrio).toBe(false);
    // The key is a number, but AsyncStorage has handed back strings before.
    expect(
      getTorrentAddDefaults({ defaultPriority: '1' as unknown as number }).firstLastPiecePrio,
    ).toBe(true);
  });
});

describe('withTorrentAddDefaults', () => {
  const prefs = { defaultSequentialDownload: true, defaultPriority: 1 };

  it('fills both flags in when the caller passes nothing', () => {
    expect(withTorrentAddDefaults(undefined, prefs)).toEqual({
      sequentialDownload: true,
      firstLastPiecePrio: true,
    });
  });

  it('keeps the caller’s other options untouched', () => {
    expect(withTorrentAddDefaults({ tags: ['x'], stopped: true }, prefs)).toEqual({
      tags: ['x'],
      stopped: true,
      sequentialDownload: true,
      firstLastPiecePrio: true,
    });
  });

  it('lets an explicit false from the caller beat the default', () => {
    // The add-torrent dialogue reports what the user actually sees on screen;
    // a global default must never override a switch they just looked at.
    const opts = withTorrentAddDefaults(
      { sequentialDownload: false, firstLastPiecePrio: false },
      prefs,
    );
    expect(opts.sequentialDownload).toBe(false);
    expect(opts.firstLastPiecePrio).toBe(false);
  });

  it('fills only the flag the caller left out', () => {
    expect(withTorrentAddDefaults({ sequentialDownload: false }, prefs)).toEqual({
      sequentialDownload: false,
      firstLastPiecePrio: true,
    });
  });

  it('does not mutate the options it was given', () => {
    const original = { tags: ['x'] };
    withTorrentAddDefaults(original, prefs);
    expect(original).toEqual({ tags: ['x'] });
  });
});
