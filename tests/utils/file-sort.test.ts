import { FILE_SORT_MODES, isFileSortMode, sortTorrentFiles } from '@/utils/file-sort';

const f = (name: string, size: number) => ({ name, size });
const names = (files: Array<{ name: string }>) => files.map((x) => x.name);

/** A nested torrent: two season folders plus a loose file at the root. */
const NESTED = [
  f('Season 1/e01.mkv', 300),
  f('Season 1/e02.mkv', 100),
  f('readme.txt', 1),
  f('Season 2/e01.mkv', 50),
  f('Season 2/e02.mkv', 900),
];

describe('isFileSortMode', () => {
  it('accepts every declared mode and nothing else', () => {
    for (const mode of FILE_SORT_MODES) expect(isFileSortMode(mode)).toBe(true);
    expect(isFileSortMode('size')).toBe(false);
    expect(isFileSortMode(undefined)).toBe(false);
    expect(isFileSortMode(2)).toBe(false);
  });
});

describe('sortTorrentFiles', () => {
  it('leaves the torrent order untouched', () => {
    expect(names(sortTorrentFiles(NESTED, 'torrent'))).toEqual(names(NESTED));
  });

  it('returns a copy rather than sorting in place', () => {
    const input = [f('b', 2), f('a', 1)];
    const out = sortTorrentFiles(input, 'name');
    expect(names(input)).toEqual(['b', 'a']);
    expect(names(out)).toEqual(['a', 'b']);
  });

  it('handles empty and single-file torrents', () => {
    expect(sortTorrentFiles([], 'sizeDesc')).toEqual([]);
    expect(names(sortTorrentFiles([f('only.mkv', 5)], 'sizeDesc'))).toEqual(['only.mkv']);
  });

  it('sorts a flat torrent by size, largest first', () => {
    const flat = [f('a.mkv', 10), f('b.mkv', 30), f('c.mkv', 20)];
    expect(names(sortTorrentFiles(flat, 'sizeDesc'))).toEqual(['b.mkv', 'c.mkv', 'a.mkv']);
    expect(names(sortTorrentFiles(flat, 'sizeAsc'))).toEqual(['a.mkv', 'c.mkv', 'b.mkv']);
  });

  it('keeps every folder contiguous when sorting by size', () => {
    // Season 2 totals 950 and wins the top level; readme.txt (1) comes last.
    expect(names(sortTorrentFiles(NESTED, 'sizeDesc'))).toEqual([
      'Season 2/e02.mkv',
      'Season 2/e01.mkv',
      'Season 1/e01.mkv',
      'Season 1/e02.mkv',
      'readme.txt',
    ]);
  });

  it('sorts ascending as the exact mirror of descending here', () => {
    expect(names(sortTorrentFiles(NESTED, 'sizeAsc'))).toEqual([
      'readme.txt',
      'Season 1/e02.mkv',
      'Season 1/e01.mkv',
      'Season 2/e01.mkv',
      'Season 2/e02.mkv',
    ]);
  });

  it('sorts folders and loose files together by name, case-insensitively', () => {
    // Folders are not hoisted above files: "readme.txt" sorts under r, which
    // comes before "Season". Same rule as the size modes, where a large folder
    // has to be able to outrank a small loose file.
    expect(names(sortTorrentFiles(NESTED, 'name'))).toEqual([
      'readme.txt',
      'Season 1/e01.mkv',
      'Season 1/e02.mkv',
      'Season 2/e01.mkv',
      'Season 2/e02.mkv',
    ]);
  });

  it('orders numbered names naturally, not lexicographically', () => {
    const eps = [f('e10.mkv', 1), f('e2.mkv', 1), f('e1.mkv', 1)];
    expect(names(sortTorrentFiles(eps, 'name'))).toEqual(['e1.mkv', 'e2.mkv', 'e10.mkv']);
  });

  it('breaks size ties with the torrent order', () => {
    const same = [f('c.mkv', 5), f('a.mkv', 5), f('b.mkv', 5)];
    expect(names(sortTorrentFiles(same, 'sizeDesc'))).toEqual(['c.mkv', 'a.mkv', 'b.mkv']);
  });

  it('sorts nested folders at every depth', () => {
    const deep = [f('show/s1/small.mkv', 1), f('show/s1/big.mkv', 100), f('show/s2/mid.mkv', 50)];
    expect(names(sortTorrentFiles(deep, 'sizeDesc'))).toEqual([
      'show/s1/big.mkv',
      'show/s1/small.mkv',
      'show/s2/mid.mkv',
    ]);
  });

  it('preserves the file objects themselves', () => {
    const files = [
      { name: 'b.mkv', size: 1, index: 7, priority: 1 },
      { name: 'a.mkv', size: 2, index: 3, priority: 0 },
    ];
    expect(sortTorrentFiles(files, 'sizeDesc')[0]).toBe(files[1]);
  });
});
