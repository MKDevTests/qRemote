import {
  SEARCH_HISTORY_LIMIT,
  addSearchTerm,
  parseStoredHistory,
  removeSearchTerm,
} from '@/utils/search-history';

describe('addSearchTerm', () => {
  it('puts the newest term first', () => {
    expect(addSearchTerm(['b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });

  it('trims what it stores', () => {
    expect(addSearchTerm([], '  ubuntu  ')).toEqual(['ubuntu']);
  });

  it('ignores a blank term', () => {
    expect(addSearchTerm(['a'], '')).toEqual(['a']);
    expect(addSearchTerm(['a'], '   ')).toEqual(['a']);
  });

  it('moves an existing term to the front instead of duplicating it', () => {
    expect(addSearchTerm(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  // Same search, different shift key — one entry, and the casing last typed.
  it('dedupes case-insensitively, keeping the newest spelling', () => {
    expect(addSearchTerm(['ubuntu'], 'Ubuntu')).toEqual(['Ubuntu']);
    expect(addSearchTerm(['  ubuntu '], 'UBUNTU')).toEqual(['UBUNTU']);
  });

  it('caps the list', () => {
    const long = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, i) => `t${i}`);
    const out = addSearchTerm(long, 'new');
    expect(out).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(out[0]).toBe('new');
    expect(out).not.toContain(`t${SEARCH_HISTORY_LIMIT - 1}`);
  });

  it('does not mutate the input', () => {
    const input = ['a'];
    addSearchTerm(input, 'b');
    expect(input).toEqual(['a']);
  });
});

describe('removeSearchTerm', () => {
  it('removes the matching entry, case-insensitively', () => {
    expect(removeSearchTerm(['Ubuntu', 'debian'], 'ubuntu')).toEqual(['debian']);
  });

  it('leaves the list alone when nothing matches', () => {
    expect(removeSearchTerm(['a'], 'b')).toEqual(['a']);
  });
});

describe('parseStoredHistory', () => {
  it('returns an empty history for anything that is not an array', () => {
    expect(parseStoredHistory(null)).toEqual([]);
    expect(parseStoredHistory('nope')).toEqual([]);
    expect(parseStoredHistory({ 0: 'a' })).toEqual([]);
  });

  // One bad entry costs one chip, never the whole history.
  it('drops malformed entries and keeps the rest', () => {
    expect(parseStoredHistory(['a', 42, null, '', '  ', 'b'])).toEqual(['a', 'b']);
  });

  it('collapses duplicates written by an older build', () => {
    expect(parseStoredHistory(['a', 'A', ' a '])).toEqual(['a']);
  });

  it('honours the cap', () => {
    const long = Array.from({ length: 40 }, (_, i) => `t${i}`);
    expect(parseStoredHistory(long)).toHaveLength(SEARCH_HISTORY_LIMIT);
  });
});
