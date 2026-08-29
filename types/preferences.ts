import { ColorTheme } from '@/services/color-theme-manager';

export type SortField =
  'name' | 'size' | 'progress' | 'dlspeed' | 'upspeed' | 'ratio' | 'priority' | 'added_on';

export type ExpandedCardField =
  | 'dlSpeed'
  | 'ulSpeed'
  | 'eta'
  | 'status'
  | 'seeds'
  | 'peers'
  | 'ratio'
  | 'ratioLimit'
  | 'maxRatio'
  | 'uploaded'
  | 'availability'
  | 'popularity'
  | 'savePath'
  | 'tracker'
  | 'addedOn'
  | 'seedingTime'
  | 'tags'
  | 'category'
  | 'progress';

export type AddTorrentDialogField =
  | 'source'
  | 'savePath'
  | 'useDownloadPath'
  | 'category'
  | 'tags'
  | 'rename'
  | 'stopped'
  | 'skipChecking'
  | 'rootFolder'
  | 'upLimit'
  | 'dlLimit'
  | 'ratioLimit'
  | 'seedingTimeLimit'
  | 'sequentialDownload'
  | 'firstLastPiecePrio'
  | 'autoTMM'
  | 'cookie';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppPreferences {
  /**
   * @deprecated Use `themeMode` instead. Kept for backward compatibility:
   * existing users have this set to 'dark' | 'light' (or boolean) and the
   * ThemeContext still reads it as a fallback when `themeMode` is absent.
   */
  theme: string | boolean;

  /**
   * Theme selection. 'system' follows the OS appearance and reactively updates
   * when the user toggles light/dark in their device settings.
   */
  themeMode: ThemeMode;

  /** Per-theme color overrides, keyed by 'dark' | 'light' */
  customColors: Record<string, ColorTheme>;

  /** Default sticker color applied to every category that has no per-name override */
  defaultCategoryColor: string;

  /** Default sticker color applied to every tag that has no per-name override */
  defaultTagColor: string;

  /** Per-category sticker color overrides, keyed by category name */
  categoryColors: Record<string, string>;

  /** Per-tag sticker color overrides, keyed by tag name */
  tagColors: Record<string, string>;

  /** Field to sort the torrent list by */
  defaultSortBy: SortField;

  /** Sort direction for the torrent list */
  defaultSortDirection: 'asc' | 'desc';

  /** Active torrent state filter (e.g. 'all', 'downloading', 'seeding') */
  defaultFilter: string;

  /**
   * @deprecated Transitional — kept for backward compatibility.
   * Task 2.2 removes multi-view UI; this key may be dropped once a
   * preference migration system is in place.
   */
  cardViewMode: 'compact' | 'expanded';

  /** Whether newly added torrents start paused */
  pauseOnAdd: boolean;

  /** Default save path for new torrents */
  defaultSavePath: string;

  /** Whether the add-torrent screen's "incomplete torrents" path field was last enabled */
  lastUseDownloadPath: boolean;

  /** Last incomplete-torrents download path typed on the add-torrent screen */
  lastDownloadPath: string;

  /**
   * Default download priority for new torrents (0 = normal).
   *
   * Historically repurposed as the "first/last piece priority by default"
   * switch: any value > 0 means on. Kept as a number because renaming or
   * retyping a stored key silently orphans it (there is no migration system).
   */
  defaultPriority: number;

  /**
   * When enabled, every torrent this app adds starts with sequential download
   * on, unless the add-torrent dialogue is showing that field and the user
   * turned it off for that one.
   *
   * There is no qBittorrent-side preference to mirror this to: the WebUI API
   * exposes sequentialDownload only as a per-torrent flag on torrents/add and
   * torrents/toggleSequentialDownload, never globally. So it is applied
   * client-side, at every call site that adds a torrent — see
   * utils/torrent-add-defaults.ts.
   */
  defaultSequentialDownload: boolean;

  /**
   * Magnet basket collect mode: magnet links go to a queue instead of opening
   * the add-torrent screen.
   *
   * On Android this also flips which manifest component owns the `magnet:`
   * scheme (see modules/magnet-collector), so the link is captured without the
   * app ever appearing. On iOS there is no equivalent — the app always comes
   * to the front — and the basket simply collects from the normal deep-link
   * path instead.
   */
  magnetBasketMode: boolean;

  /** Duration in ms for toast notifications */
  toastDuration: number;

  /** Whether haptic feedback is enabled */
  hapticFeedback: boolean;

  /** Auto-connect to the last used server on app launch */
  autoConnectLastServer: boolean;

  /** Connection timeout in ms */
  connectionTimeout: number;

  /** API request timeout in ms */
  apiTimeout: number;

  /** Number of automatic retry attempts for failed API requests */
  retryAttempts: number;

  /** Enable connectivity debug mode */
  debugMode: boolean;

  /** Polling interval in ms for torrent/transfer data refresh */
  autoRefreshInterval: number;

  /** Whether the user has completed the onboarding flow */
  hasCompletedOnboarding: boolean;

  /** Auto-tag torrents added from Search with the result's tracker/indexer label (not categorization) */
  autoCategorizeByTracker: boolean;

  /** When enabled, the add-torrent button opens the full add-torrent screen */
  useFullAddTorrentDialogue: boolean;

  /**
   * When enabled, the + on a Search result opens the add-torrent dialogue
   * pre-filled instead of instantly adding with server defaults (#217).
   */
  searchAddOpensDialogue: boolean;

  /** Per-field visibility for the full add-torrent screen */
  addTorrentDialogueFields: Record<AddTorrentDialogField, boolean>;

  /** Per-field visibility for the expanded (detailed) torrent card */
  expandedCardFields: Record<ExpandedCardField, boolean>;

  /** Number of columns in the detailed torrent card stats grid */
  expandedCardGridColumns: 3 | 4 | 5;

  /** Last selected search plugin ("all", "enabled", or a plugin name) */
  lastSearchPlugin?: string;

  /** Last selected search category ("all" or a plugin-supported category id) */
  lastSearchCategory?: string;

  /**
   * Last active category filter on the torrents tab.
   * null = All categories; '' = Uncategorized (torrents with no category set).
   */
  lastCategoryFilter?: string | null;

  /** Last active tag filters on the torrents tab (OR semantics). */
  lastTagFilters?: string[];
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  themeMode: 'system',
  customColors: {},
  defaultCategoryColor: '#0A84FF',
  defaultTagColor: '#30D158',
  categoryColors: {},
  tagColors: {},
  defaultSortBy: 'added_on',
  defaultSortDirection: 'desc',
  defaultFilter: 'all',
  cardViewMode: 'compact',
  pauseOnAdd: false,
  defaultSavePath: '',
  lastUseDownloadPath: false,
  lastDownloadPath: '',
  defaultPriority: 0,
  defaultSequentialDownload: false,
  magnetBasketMode: false,
  toastDuration: 3000,
  hapticFeedback: true,
  autoConnectLastServer: true,
  connectionTimeout: 10000,
  apiTimeout: 30000,
  retryAttempts: 3,
  debugMode: false,
  autoRefreshInterval: 1000,
  hasCompletedOnboarding: false,
  autoCategorizeByTracker: false,
  useFullAddTorrentDialogue: false,
  searchAddOpensDialogue: true,
  addTorrentDialogueFields: {
    source: true,
    savePath: true,
    useDownloadPath: true,
    category: true,
    tags: true,
    rename: true,
    stopped: true,
    skipChecking: true,
    rootFolder: true,
    upLimit: true,
    dlLimit: true,
    ratioLimit: true,
    seedingTimeLimit: true,
    sequentialDownload: true,
    firstLastPiecePrio: true,
    autoTMM: true,
    cookie: true,
  },
  expandedCardFields: {
    dlSpeed: true,
    ulSpeed: true,
    eta: true,
    status: false,
    seeds: true,
    peers: true,
    ratio: true,
    ratioLimit: false,
    maxRatio: false,
    uploaded: true,
    availability: true,
    popularity: true,
    savePath: false,
    tracker: false,
    addedOn: true,
    seedingTime: false,
    tags: true,
    category: true,
    progress: false,
  },
  expandedCardGridColumns: 4,
  lastSearchPlugin: 'all',
  lastSearchCategory: 'all',
  lastCategoryFilter: null,
  lastTagFilters: [],
};
