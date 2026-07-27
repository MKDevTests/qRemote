import {
  describeShareLimit,
  normalizeNumericInput,
  parseShareLimitInput,
  parseSpeedLimitInput,
  SHARE_LIMIT_GLOBAL,
  SHARE_LIMIT_UNLIMITED,
} from '@/utils/limit-input';

describe('normalizeNumericInput', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeNumericInput('  2.5  ')).toBe('2.5');
  });

  it('accepts the decimal comma used by the es/fr/de/ru keyboards', () => {
    expect(normalizeNumericInput('1,5')).toBe('1.5');
  });

  it.each([
    ['−1', '-1'], // minus sign
    ['–1', '-1'], // en dash
    ['—1', '-1'], // em dash
  ])('rewrites %s to an ASCII hyphen', (input, expected) => {
    expect(normalizeNumericInput(input)).toBe(expected);
  });
});

describe('parseShareLimitInput', () => {
  it('treats an empty value as unlimited', () => {
    expect(parseShareLimitInput('')).toBe(SHARE_LIMIT_UNLIMITED);
    expect(parseShareLimitInput('   ')).toBe(SHARE_LIMIT_UNLIMITED);
  });

  it.each([
    ['0', 0],
    ['2', 2],
    ['2.5', 2.5],
    ['.5', 0.5],
    [' 2 ', 2],
    ['-1', SHARE_LIMIT_UNLIMITED],
    ['-2', SHARE_LIMIT_GLOBAL],
  ])('parses %s', (input, expected) => {
    expect(parseShareLimitInput(input)).toBe(expected);
  });

  it('accepts the sentinels typed with a Unicode minus or decimal comma', () => {
    expect(parseShareLimitInput('−1')).toBe(SHARE_LIMIT_UNLIMITED);
    expect(parseShareLimitInput('1,5')).toBe(1.5);
  });

  // The whole point of not using parseFloat: it returns 1.2 for '1.2.3' and NaN
  // for 'abc', and NaN then read as "unlimited" downstream while the success
  // toast printed "NaN".
  it.each([['abc'], ['1.2.3'], ['1e5'], ['--1'], ['1 2'], ['$5'], ['-'], ['.']])(
    'rejects %s',
    (input) => {
      expect(parseShareLimitInput(input)).toBeNull();
    },
  );

  it('rejects negatives that are not one of the two sentinels', () => {
    expect(parseShareLimitInput('-3')).toBeNull();
    expect(parseShareLimitInput('-0.5')).toBeNull();
  });

  describe('integer mode (seeding time in minutes)', () => {
    it('accepts whole numbers and the sentinels', () => {
      expect(parseShareLimitInput('60', { integer: true })).toBe(60);
      expect(parseShareLimitInput('-2', { integer: true })).toBe(SHARE_LIMIT_GLOBAL);
    });

    it('rejects decimals', () => {
      expect(parseShareLimitInput('60.5', { integer: true })).toBeNull();
    });
  });
});

describe('parseSpeedLimitInput', () => {
  it('treats an empty value as 0, which qBittorrent reads as unlimited', () => {
    expect(parseSpeedLimitInput('')).toBe(0);
  });

  it('parses non-negative numbers', () => {
    expect(parseSpeedLimitInput('0')).toBe(0);
    expect(parseSpeedLimitInput('1024')).toBe(1024);
    expect(parseSpeedLimitInput('1,5')).toBe(1.5);
  });

  it('rejects junk instead of silently coercing it to 0', () => {
    expect(parseSpeedLimitInput('abc')).toBeNull();
    expect(parseSpeedLimitInput('1.2.3')).toBeNull();
  });

  it('rejects negatives — speed limits have no sentinel values', () => {
    expect(parseSpeedLimitInput('-1')).toBeNull();
  });
});

describe('describeShareLimit', () => {
  it('reports an explicit per-torrent limit', () => {
    expect(describeShareLimit(2, 2)).toEqual({ kind: 'value', value: 2 });
  });

  it('reports no limit', () => {
    expect(describeShareLimit(SHARE_LIMIT_UNLIMITED, SHARE_LIMIT_UNLIMITED)).toEqual({
      kind: 'unlimited',
    });
  });

  // The case that used to render as a bare "Unlimited" while the adjacent
  // Max Ratio row showed the real number.
  it('resolves the -2 sentinel against the effective limit', () => {
    expect(describeShareLimit(SHARE_LIMIT_GLOBAL, 1.5)).toEqual({
      kind: 'global',
      effective: 1.5,
    });
  });

  it('reports unlimited when the global limit is itself unlimited', () => {
    expect(describeShareLimit(SHARE_LIMIT_GLOBAL, -1)).toEqual({ kind: 'global', effective: null });
  });

  it('falls back to the effective value when the server omits the per-torrent field', () => {
    expect(describeShareLimit(undefined, 1.5)).toEqual({ kind: 'value', value: 1.5 });
    expect(describeShareLimit(undefined, -1)).toEqual({ kind: 'unlimited' });
    expect(describeShareLimit(null, null)).toEqual({ kind: 'unlimited' });
  });
});
