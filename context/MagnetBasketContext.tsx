import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import {
  drainPendingMagnets,
  setCollectModeEnabled,
  supportsSilentCollect,
} from '@/modules/magnet-collector';
import { magnetBasketStorage } from '@/services/magnet-basket-storage';
import { storageService } from '@/services/storage';
import {
  addMagnetToBasket,
  basketMagnetUrls,
  MagnetBasketItem,
  removeFromBasket,
} from '@/utils/magnet-basket';

interface MagnetBasketContextType {
  /** Collect mode: magnets queue up instead of opening the add screen. */
  collectMode: boolean;
  setCollectMode: (enabled: boolean) => void;
  /** Where collecting happens without the app appearing (Android only). */
  silentCollect: boolean;
  items: MagnetBasketItem[];
  /** True once storage has been read — until then `items` is not yet the truth. */
  hydrated: boolean;
  /** Returns false when the magnet was a duplicate or not a magnet at all. */
  add: (magnet: string) => boolean;
  remove: (item: MagnetBasketItem) => void;
  clear: () => void;
  /** The basket as submit-ready magnet URIs, in arrival order. */
  urls: () => string[];
}

const MagnetBasketContext = createContext<MagnetBasketContextType | undefined>(undefined);

/**
 * The magnet basket: a queue of magnet links to add to qBittorrent in one go.
 *
 * Unlike SearchCartContext — which is deliberately session-scoped because
 * plugin download URLs expire — this basket IS persisted. Its whole reason to
 * exist is that links are collected over time, often while the app is closed,
 * and reviewed later. A magnet URI is self-contained and does not go stale.
 *
 * Two things feed it, and they must not fight:
 *   - JS, when a magnet deep link arrives while collect mode is on
 *   - the native collector, which appends to its own inbox while the app is
 *     not running (Android)
 * The native inbox is drained into this basket on hydration and on every
 * return to the foreground. Native never writes here, JS never writes there.
 */
export function MagnetBasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MagnetBasketItem[]>([]);
  const [collectMode, setCollectModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read inside callbacks that must not be recreated when the basket changes —
  // the AppState subscription below would otherwise be torn down and
  // re-registered on every single add.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback((next: MagnetBasketItem[]) => {
    setItems(next);
    void magnetBasketStorage.save(next);
  }, []);

  /** Fold anything the native collector captured into the basket. */
  const drainNative = useCallback(() => {
    const pending = drainPendingMagnets();
    if (pending.length === 0) return;
    let next = itemsRef.current;
    const now = Date.now();
    for (const magnet of pending) {
      // Native only guards against an exact double-tap; this is where the
      // real info-hash dedupe happens.
      next = addMagnetToBasket(next, magnet, now).items;
    }
    if (next !== itemsRef.current) commit(next);
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const [stored, prefs] = await Promise.all([
        magnetBasketStorage.load(),
        storageService.getPreferences().catch(() => null),
      ]);
      if (cancelled) return;
      itemsRef.current = stored;
      setItems(stored);
      setCollectModeState(prefs?.magnetBasketMode === true);
      setHydrated(true);
      drainNative();
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [drainNative]);

  // Coming back from the browser is the moment a magnet was just captured, so
  // it is also the moment the basket has to catch up.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') drainNative();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [drainNative]);

  const setCollectMode = useCallback((enabled: boolean) => {
    setCollectModeState(enabled);
    // Native component state first: it is what actually routes the next magnet
    // link, and it is the part that can fail. The preference is only a record
    // of what the user asked for.
    setCollectModeEnabled(enabled);
    void storageService
      .getPreferences()
      .then((prefs) => storageService.savePreferences({ ...prefs, magnetBasketMode: enabled }))
      .catch(() => {
        // Mode stays correct for this session; it just won't survive a restart.
      });
  }, []);

  const add = useCallback(
    (magnet: string) => {
      const result = addMagnetToBasket(itemsRef.current, magnet, Date.now());
      if (result.added) commit(result.items);
      return result.added;
    },
    [commit],
  );

  const remove = useCallback(
    (item: MagnetBasketItem) => commit(removeFromBasket(itemsRef.current, item)),
    [commit],
  );

  const clear = useCallback(() => {
    setItems([]);
    void magnetBasketStorage.clear();
  }, []);

  const urls = useCallback(() => basketMagnetUrls(itemsRef.current), []);

  const value = useMemo(
    () => ({
      collectMode,
      setCollectMode,
      silentCollect: supportsSilentCollect,
      items,
      hydrated,
      add,
      remove,
      clear,
      urls,
    }),
    [collectMode, setCollectMode, items, hydrated, add, remove, clear, urls],
  );

  return <MagnetBasketContext.Provider value={value}>{children}</MagnetBasketContext.Provider>;
}

export function useMagnetBasket() {
  const ctx = useContext(MagnetBasketContext);
  if (!ctx) throw new Error('useMagnetBasket must be used within a MagnetBasketProvider');
  return ctx;
}
