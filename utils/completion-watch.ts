/**
 * completion-watch.ts — work out which torrents finished since last time.
 *
 * The app has never told anyone that a download completed; you reopen it to
 * find out. This is the decision half of fixing that, kept pure so the rule
 * that matters most is testable without a device: **a torrent seen for the
 * first time is never reported**.
 *
 * Without that rule, turning the feature on — or a reinstall, or a cleared
 * snapshot — fires one notification per finished torrent in the client, which
 * for a seedbox with three hundred of them is not a feature, it is an attack.
 */
import { TorrentInfo } from '@/types/api';

/** hash → progress, the smallest thing that answers "did this just finish?". */
export type CompletionSnapshot = Record<string, number>;

export interface CompletedTorrent {
  hash: string;
  name: string;
}

/** qBittorrent reports progress as 0..1; floating point makes exact 1 unsafe. */
const COMPLETE = 0.999999;

function progressOf(torrent: Pick<TorrentInfo, 'progress'>): number {
  const raw = Number(torrent?.progress);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw > 1 ? 1 : raw;
}

export function isComplete(torrent: Pick<TorrentInfo, 'progress'>): boolean {
  return progressOf(torrent) >= COMPLETE;
}

/** What to store for the next comparison. */
export function snapshotProgress(
  torrents: readonly Pick<TorrentInfo, 'hash' | 'progress'>[] | null | undefined,
): CompletionSnapshot {
  const snapshot: CompletionSnapshot = {};
  for (const torrent of torrents ?? []) {
    if (!torrent?.hash) continue;
    snapshot[torrent.hash] = progressOf(torrent);
  }
  return snapshot;
}

/**
 * The torrents that went from unfinished to finished since `previous`.
 *
 * A null or empty snapshot means there is nothing to compare against — this is
 * the first look — so nothing is reported and the caller just stores the new
 * snapshot. Same for a hash that was not in the previous snapshot: a torrent
 * added and completed entirely between two checks is indistinguishable from
 * one that has been sitting there finished for a month, and guessing wrong in
 * that direction is the noisy one.
 */
export function findNewlyCompleted(
  previous: CompletionSnapshot | null | undefined,
  torrents: readonly TorrentInfo[] | null | undefined,
): CompletedTorrent[] {
  if (!previous || Object.keys(previous).length === 0) return [];

  const completed: CompletedTorrent[] = [];
  for (const torrent of torrents ?? []) {
    if (!torrent?.hash) continue;
    const before = previous[torrent.hash];
    if (before === undefined) continue;
    if (before >= COMPLETE) continue;
    if (!isComplete(torrent)) continue;
    completed.push({ hash: torrent.hash, name: torrent.name || torrent.hash });
  }
  return completed;
}
