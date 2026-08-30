import { FilePriority, TorrentFile } from '@/types/api';
import {
  CONFIRM_DESELECT_THRESHOLD,
  capturePriorities,
  groupByPriority,
  needsDeselectConfirm,
} from '@/utils/file-priority';

const f = (index: number, priority: FilePriority) => ({ index, priority }) as TorrentFile;

describe('capturePriorities', () => {
  it('records only the files asked for', () => {
    const files = [f(0, 1), f(1, 6), f(2, 0)];
    expect(capturePriorities(files, [0, 2])).toEqual({ 0: 1, 2: 0 });
  });

  // The whole point of the module: the undo has to put back High and Maximum,
  // not flatten everything to Normal.
  it('keeps priorities that are not Normal', () => {
    expect(capturePriorities([f(0, 7), f(1, 6)], [0, 1])).toEqual({ 0: 7, 1: 6 });
  });

  it('skips an index with no matching file rather than inventing one', () => {
    expect(capturePriorities([f(0, 1)], [0, 99])).toEqual({ 0: 1 });
  });

  it('handles nothing at all', () => {
    expect(capturePriorities([], [1])).toEqual({});
    expect(capturePriorities(null as unknown as TorrentFile[], [1])).toEqual({});
    expect(capturePriorities([f(0, 1)], [])).toEqual({});
  });

  it('survives a malformed entry', () => {
    const files = [null as unknown as TorrentFile, f(1, 4)];
    expect(capturePriorities(files, [1])).toEqual({ 1: 4 });
  });
});

describe('groupByPriority', () => {
  // filePrio takes one priority per request, so the call count is the number
  // of distinct priorities, not the number of files.
  it('collapses files sharing a priority into one group', () => {
    expect(groupByPriority({ 0: 1, 1: 1, 2: 1 })).toEqual([{ priority: 1, indices: [0, 1, 2] }]);
  });

  it('splits distinct priorities, lowest first', () => {
    expect(groupByPriority({ 0: 6, 1: 1, 2: 7, 3: 1 })).toEqual([
      { priority: 1, indices: [1, 3] },
      { priority: 6, indices: [0] },
      { priority: 7, indices: [2] },
    ]);
  });

  it('keeps a captured zero, which is a real priority', () => {
    expect(groupByPriority({ 4: 0 })).toEqual([{ priority: 0, indices: [4] }]);
  });

  it('sorts indices so the result is stable', () => {
    expect(groupByPriority({ 9: 1, 2: 1, 5: 1 })).toEqual([{ priority: 1, indices: [2, 5, 9] }]);
  });

  it('returns nothing for an empty or missing snapshot', () => {
    expect(groupByPriority({})).toEqual([]);
    expect(groupByPriority(null as unknown as Record<number, FilePriority>)).toEqual([]);
  });
});

describe('needsDeselectConfirm', () => {
  it('lets a small deselection through — the undo covers it', () => {
    expect(needsDeselectConfirm(1)).toBe(false);
    expect(needsDeselectConfirm(CONFIRM_DESELECT_THRESHOLD)).toBe(false);
  });

  it('asks first once a whole pack is at stake', () => {
    expect(needsDeselectConfirm(CONFIRM_DESELECT_THRESHOLD + 1)).toBe(true);
    expect(needsDeselectConfirm(40)).toBe(true);
  });

  it('does not trip on nothing', () => {
    expect(needsDeselectConfirm(0)).toBe(false);
  });
});
