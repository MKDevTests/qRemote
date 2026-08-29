/**
 * file-sort.ts — ordering for the torrent file browser.
 *
 * The browser renders a flat list and injects a folder header the first time
 * it meets a file living under that folder (see the `displayItems` memo in
 * app/(tabs)/(torrents)/torrent/files.tsx). That only produces a coherent
 * tree while every file under a folder is *contiguous* in the array — so
 * sorting cannot be a plain `[...files].sort()`: sorting a nested torrent by
 * size that way interleaves folders and emits each header in the wrong place.
 *
 * So the sort rebuilds the folder tree, orders each level independently, and
 * flattens depth-first. A folder sorts by the total size of everything under
 * it, which is the number the browser already shows on its header row.
 */

/** The shape this module needs; `TorrentFile` satisfies it. */
export interface SortableFile {
  /** Path relative to the torrent root, `/`-separated — qBittorrent's `name`. */
  name: string;
  size: number;
}

export type FileSortMode = 'torrent' | 'name' | 'sizeDesc' | 'sizeAsc';

/** Picker order, and the order the labels are declared in i18n. */
export const FILE_SORT_MODES: readonly FileSortMode[] = [
  'torrent',
  'name',
  'sizeDesc',
  'sizeAsc',
] as const;

export function isFileSortMode(value: unknown): value is FileSortMode {
  return typeof value === 'string' && (FILE_SORT_MODES as readonly string[]).includes(value);
}

interface Folder<T> {
  name: string;
  /** Position of the first file underneath, so 'torrent' order is the API's. */
  order: number;
  size: number;
  folders: Map<string, Folder<T>>;
  files: Array<{ file: T; name: string; order: number }>;
}

type Entry<T> =
  | { kind: 'folder'; name: string; order: number; size: number; node: Folder<T> }
  | { kind: 'file'; name: string; order: number; size: number; file: T };

function newFolder<T>(name: string, order: number): Folder<T> {
  return { name, order, size: 0, folders: new Map(), files: [] };
}

/**
 * Reorder `files` so the file browser renders them in `mode` order.
 *
 * The returned array holds the same objects — the browser still reads
 * `index` and `priority` off them — only the order changes. `'torrent'`
 * returns the input order untouched, which is qBittorrent's own file order.
 */
export function sortTorrentFiles<T extends SortableFile>(
  files: readonly T[],
  mode: FileSortMode,
): T[] {
  if (mode === 'torrent' || files.length < 2) return [...files];

  const root = newFolder<T>('', 0);

  files.forEach((file, order) => {
    const parts = file.name.split('/');
    const fileName = parts[parts.length - 1];
    let node = root;
    root.size += file.size;

    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      let child = node.folders.get(segment);
      if (!child) {
        child = newFolder<T>(segment, order);
        node.folders.set(segment, child);
      }
      child.size += file.size;
      node = child;
    }

    node.files.push({ file, name: fileName, order });
  });

  const compare = (a: Entry<T>, b: Entry<T>): number => {
    switch (mode) {
      case 'name': {
        const byName = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (byName !== 0) return byName;
        break;
      }
      case 'sizeDesc':
        if (a.size !== b.size) return b.size - a.size;
        break;
      case 'sizeAsc':
        if (a.size !== b.size) return a.size - b.size;
        break;
    }
    // Ties keep qBittorrent's order, so the list never reshuffles on refresh.
    return a.order - b.order;
  };

  const out: T[] = [];
  const walk = (node: Folder<T>): void => {
    const entries: Array<Entry<T>> = [];
    for (const child of node.folders.values()) {
      entries.push({
        kind: 'folder',
        name: child.name,
        order: child.order,
        size: child.size,
        node: child,
      });
    }
    for (const entry of node.files) {
      entries.push({
        kind: 'file',
        name: entry.name,
        order: entry.order,
        size: entry.file.size,
        file: entry.file,
      });
    }
    entries.sort(compare);
    for (const entry of entries) {
      if (entry.kind === 'folder') walk(entry.node);
      else out.push(entry.file);
    }
  };
  walk(root);

  return out;
}
