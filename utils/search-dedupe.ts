/**
 * search-dedupe.ts — collapse the same release reported by several indexers.
 *
 * qBittorrent runs every enabled plugin in parallel and **concatenates** what
 * they return: `search/results` has no notion of the same torrent appearing
 * twice, and neither does its `total`. So a search across five indexers that
 * all carry a popular release shows it five times, and the list is three times
 * longer than the number of distinct things in it. Deduplicating is the
 * client's job, and nobody else's.
 *
 * The kept entry is the best-seeded one, which is the one you would have
 * picked by hand anyway.
 */
import { SearchResult } from '@/types/api';

/** One release, plus wherever else it turned up. */
export interface DedupedResult {
  /** The entry to show and to download from: most seeders wins. */
  primary: SearchResult;
  /** The other listings of the same release, best-seeded first. */
  duplicates: SearchResult[];
  /** How many distinct listings this row stands for, including the primary. */
  sourceCount: number;
}

/**
 * Reduce a name to what identifies the release.
 *
 * Indexers write the same release as `The.Show.S01E01.1080p.WEB-DL`,
 * `The Show S01E01 1080p WEB DL` and `the_show_s01e01_1080p_webdl`; those are
 * one thing. Separators become spaces, everything that is not a letter or a
 * digit goes, and the rest collapses.
 *
 * Size is deliberately *not* part of the key. Plugins scrape sizes out of HTML
 * ("1.4 GB") and reconstruct the byte count, so two listings of one release
 * routinely differ by a few megabytes — keying on it would defeat the whole
 * point. A name that survives this normalisation identically is the same
 * release; two different encodes do not have the same name.
 */
export function normalizeReleaseName(fileName: string): string {
  return (fileName ?? '')
    .toLowerCase()
    .replace(/[._\-+()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Group results by release, preserving the order the best listing of each
 * appeared in.
 *
 * A name that normalises to nothing — punctuation only, or empty — can never
 * be matched against anything, so it stays on its own rather than being
 * lumped with every other unnameable entry.
 */
export function dedupeSearchResults(results: readonly SearchResult[]): DedupedResult[] {
  const groups = new Map<string, SearchResult[]>();
  const loners: SearchResult[][] = [];
  const order: SearchResult[][] = [];

  for (const result of results ?? []) {
    const key = normalizeReleaseName(result?.fileName ?? '');
    if (!key) {
      const single = [result];
      loners.push(single);
      order.push(single);
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.push(result);
    } else {
      const created = [result];
      groups.set(key, created);
      order.push(created);
    }
  }

  return order.map((group) => {
    const sorted = [...group].sort((a, b) => (b.nbSeeders ?? 0) - (a.nbSeeders ?? 0));
    return {
      primary: sorted[0],
      duplicates: sorted.slice(1),
      sourceCount: sorted.length,
    };
  });
}

/** The flat list to render: one entry per release, best listing kept. */
export function dedupedPrimaries(results: readonly SearchResult[]): SearchResult[] {
  return dedupeSearchResults(results).map((group) => group.primary);
}
