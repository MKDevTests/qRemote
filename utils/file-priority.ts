/**
 * file-priority.ts — taking back an accidental deselection in the file browser.
 *
 * A checkbox in the file browser is one tap from setting a whole folder to
 * priority 0, with nothing between the tap and the API call. Confirming every
 * one of them is the wrong trade: it taxes the deliberate case — picking apart
 * a season pack file by file — to guard against the accidental one.
 *
 * So the deselection goes through and can be taken back instead. That is only
 * honest if the restore puts back what was actually there, which is what this
 * module is for: the files were not all on priority 1. Some were on High (6)
 * or Maximum (7), and blanket-restoring them to Normal would quietly undo work
 * the user did on purpose, while looking like it had fixed things.
 */
import { FilePriority, TorrentFile } from '@/types/api';

/** What each file's priority was, keyed by the file's index in the torrent. */
export type PrioritySnapshot = Record<number, FilePriority>;

/** One `torrents/filePrio` call: the endpoint takes a single priority per request. */
export interface PriorityRestoreGroup {
  priority: FilePriority;
  indices: number[];
}

/**
 * Record the current priority of the files about to change.
 *
 * Indices with no matching file are skipped rather than recorded as 0 — a file
 * that is not in the list is one we know nothing about, and inventing a
 * priority for it would have the undo write a value that was never there.
 */
export function capturePriorities(
  files: readonly TorrentFile[],
  indices: readonly number[],
): PrioritySnapshot {
  const wanted = new Set(indices);
  const snapshot: PrioritySnapshot = {};
  for (const file of files ?? []) {
    if (!file || !wanted.has(file.index)) continue;
    snapshot[file.index] = file.priority;
  }
  return snapshot;
}

/**
 * Turn a snapshot into the fewest API calls that restore it.
 *
 * `torrents/filePrio` applies one priority to a list of ids, so the work is
 * one request per *distinct* priority in the snapshot, not one per file — the
 * same shape as the search cart's per-indexer batching, and for the same
 * reason.
 *
 * Groups come back in ascending priority order so the result is stable and
 * testable; the order they are sent in does not matter to qBittorrent.
 */
export function groupByPriority(snapshot: PrioritySnapshot): PriorityRestoreGroup[] {
  const groups = new Map<FilePriority, number[]>();

  for (const [key, priority] of Object.entries(snapshot ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    const existing = groups.get(priority);
    if (existing) {
      existing.push(index);
    } else {
      groups.set(priority, [index]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([priority, indices]) => ({ priority, indices: indices.sort((a, b) => a - b) }));
}

/**
 * Whether a deselection is big enough to be worth confirming.
 *
 * Below this a mistake costs one tap of Undo; above it, the user is about to
 * turn off a whole season pack and a moment's pause is cheaper than reading a
 * toast in time.
 */
export const CONFIRM_DESELECT_THRESHOLD = 5;

export function needsDeselectConfirm(fileCount: number): boolean {
  return fileCount > CONFIRM_DESELECT_THRESHOLD;
}
