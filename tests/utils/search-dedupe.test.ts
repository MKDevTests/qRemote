import { SearchResult } from '@/types/api';
import { dedupeSearchResults, dedupedPrimaries, normalizeReleaseName } from '@/utils/search-dedupe';

const r = (fileName: string, nbSeeders: number, siteUrl = 'https://a.example'): SearchResult => ({
  fileName,
  fileSize: 1_000_000,
  fileUrl: `${siteUrl}/${fileName}`,
  nbLeechers: 0,
  nbSeeders,
  siteUrl,
  descrLink: '',
});

const names = (list: SearchResult[]) => list.map((x) => x.fileName);

describe('normalizeReleaseName', () => {
  it('treats every separator the same way', () => {
    const canonical = 'the show s01e01 1080p web dl';
    expect(normalizeReleaseName('The.Show.S01E01.1080p.WEB-DL')).toBe(canonical);
    expect(normalizeReleaseName('The Show S01E01 1080p WEB DL')).toBe(canonical);
    expect(normalizeReleaseName('the_show_s01e01_1080p_web_dl')).toBe(canonical);
    expect(normalizeReleaseName('[The] (Show) S01E01 1080p WEB+DL')).toBe(canonical);
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeReleaseName('  a   b  ')).toBe('a b');
  });

  it('returns an empty key for a name with nothing to match on', () => {
    expect(normalizeReleaseName('')).toBe('');
    expect(normalizeReleaseName('...---...')).toBe('');
  });

  it('keeps genuinely different releases apart', () => {
    expect(normalizeReleaseName('Show.S01E01.1080p')).not.toBe(
      normalizeReleaseName('Show.S01E01.720p'),
    );
  });
});

describe('dedupeSearchResults', () => {
  it('handles an empty list', () => {
    expect(dedupeSearchResults([])).toEqual([]);
  });

  it('keeps the best-seeded listing and counts the rest', () => {
    const groups = dedupeSearchResults([
      r('The.Show.S01E01.1080p', 3, 'https://a.example'),
      r('The Show S01E01 1080p', 41, 'https://b.example'),
      r('the_show_s01e01_1080p', 12, 'https://c.example'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].primary.nbSeeders).toBe(41);
    expect(groups[0].sourceCount).toBe(3);
    expect(groups[0].duplicates.map((d) => d.nbSeeders)).toEqual([12, 3]);
  });

  // Sizes differ between indexers because plugins reconstruct them from
  // scraped text, so they must not take part in the match.
  it('matches across differing reported sizes', () => {
    const a = { ...r('Ubuntu.24.04.iso', 5), fileSize: 1_400_000_000 };
    const b = { ...r('Ubuntu 24 04 iso', 9), fileSize: 1_395_864_371 };
    expect(dedupeSearchResults([a, b])).toHaveLength(1);
  });

  it('does not merge different releases', () => {
    const groups = dedupeSearchResults([r('Show.S01E01.1080p', 1), r('Show.S01E01.720p', 2)]);
    expect(groups).toHaveLength(2);
  });

  it('keeps unnameable entries separate rather than lumping them together', () => {
    const groups = dedupeSearchResults([r('...', 1), r('---', 2)]);
    expect(groups).toHaveLength(2);
  });

  it('preserves the order the first listing of each release appeared in', () => {
    const groups = dedupeSearchResults([r('B.Release', 1), r('A.Release', 1), r('B Release', 99)]);
    expect(groups.map((g) => g.primary.fileName)).toEqual(['B Release', 'A.Release']);
  });

  it('does not mutate the input', () => {
    const input = [r('X.Y', 1), r('X Y', 9)];
    dedupeSearchResults(input);
    expect(names(input)).toEqual(['X.Y', 'X Y']);
  });

  it('tolerates a missing seeder count', () => {
    const broken = { ...r('A.B', 0), nbSeeders: undefined as unknown as number };
    expect(() => dedupeSearchResults([broken, r('A B', 4)])).not.toThrow();
    expect(dedupeSearchResults([broken, r('A B', 4)])[0].primary.nbSeeders).toBe(4);
  });
});

describe('dedupedPrimaries', () => {
  it('flattens to one entry per release', () => {
    expect(names(dedupedPrimaries([r('A.B', 1), r('A B', 7), r('C.D', 2)]))).toEqual([
      'A B',
      'C.D',
    ]);
  });
});
