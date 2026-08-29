import { TorrentInfo } from '@/types/api';
import { findNewlyCompleted, isComplete, snapshotProgress } from '@/utils/completion-watch';

const t = (hash: string, progress: number, name = hash) =>
  ({ hash, progress, name }) as TorrentInfo;

describe('isComplete', () => {
  it('accepts a finished torrent', () => {
    expect(isComplete({ progress: 1 })).toBe(true);
  });

  // qBittorrent computes progress as a ratio, so an exact 1 is not guaranteed.
  it('accepts a value a hair under 1', () => {
    expect(isComplete({ progress: 0.9999999 })).toBe(true);
  });

  it('rejects anything genuinely unfinished', () => {
    expect(isComplete({ progress: 0 })).toBe(false);
    expect(isComplete({ progress: 0.99 })).toBe(false);
  });

  it('treats nonsense as unfinished rather than throwing', () => {
    expect(isComplete({ progress: NaN })).toBe(false);
    expect(isComplete({ progress: -1 })).toBe(false);
    expect(isComplete({ progress: undefined as unknown as number })).toBe(false);
  });
});

describe('snapshotProgress', () => {
  it('reduces a list to hash → progress', () => {
    expect(snapshotProgress([t('a', 0.5), t('b', 1)])).toEqual({ a: 0.5, b: 1 });
  });

  it('handles nothing at all', () => {
    expect(snapshotProgress(null)).toEqual({});
    expect(snapshotProgress(undefined)).toEqual({});
    expect(snapshotProgress([])).toEqual({});
  });

  it('clamps and skips what it cannot use', () => {
    expect(snapshotProgress([t('a', 1.4), t('b', -3), t('', 1)])).toEqual({ a: 1, b: 0 });
  });
});

describe('findNewlyCompleted', () => {
  it('reports a torrent that crossed the line', () => {
    expect(findNewlyCompleted({ a: 0.4 }, [t('a', 1, 'Ubuntu')])).toEqual([
      { hash: 'a', name: 'Ubuntu' },
    ]);
  });

  // The rule the whole module exists for: enabling the feature on a client
  // holding 300 finished torrents must not fire 300 notifications.
  it('reports nothing on the very first look', () => {
    expect(findNewlyCompleted(null, [t('a', 1), t('b', 1)])).toEqual([]);
    expect(findNewlyCompleted({}, [t('a', 1), t('b', 1)])).toEqual([]);
  });

  it('ignores a torrent it has never seen, even if it is finished', () => {
    expect(findNewlyCompleted({ a: 0.2 }, [t('a', 0.3), t('brand-new', 1)])).toEqual([]);
  });

  it('does not report the same completion twice', () => {
    expect(findNewlyCompleted({ a: 1 }, [t('a', 1)])).toEqual([]);
  });

  it('ignores torrents still downloading', () => {
    expect(findNewlyCompleted({ a: 0.1 }, [t('a', 0.9)])).toEqual([]);
  });

  it('reports several at once', () => {
    const done = findNewlyCompleted({ a: 0.1, b: 0.5, c: 1 }, [t('a', 1), t('b', 1), t('c', 1)]);
    expect(done.map((d) => d.hash)).toEqual(['a', 'b']);
  });

  it('falls back to the hash when a torrent has no name', () => {
    expect(findNewlyCompleted({ a: 0.4 }, [t('a', 1, '')])).toEqual([{ hash: 'a', name: 'a' }]);
  });

  it('survives a torrent that vanished between checks', () => {
    expect(findNewlyCompleted({ a: 0.4, gone: 0.4 }, [t('a', 1)])).toEqual([
      { hash: 'a', name: 'a' },
    ]);
  });

  it('handles an empty or missing torrent list', () => {
    expect(findNewlyCompleted({ a: 0.4 }, [])).toEqual([]);
    expect(findNewlyCompleted({ a: 0.4 }, null)).toEqual([]);
  });
});
