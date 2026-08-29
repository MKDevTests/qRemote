import AsyncStorage from '@react-native-async-storage/async-storage';

import { MagnetBasketItem, parseStoredBasket } from '@/utils/magnet-basket';

const BASKET_KEY = 'magnet_basket';

/**
 * Persistence for the magnet basket.
 *
 * Separate from `services/storage.ts` on purpose: that holds preferences —
 * small, always-present settings written whole on every change. The basket is
 * a working list that can be captured while the app is closed, so it gets its
 * own key and its own failure behaviour. A read that fails yields an empty
 * basket rather than throwing, because the alternative is an app that will not
 * start because of one bad string.
 */
export const magnetBasketStorage = {
  async load(): Promise<MagnetBasketItem[]> {
    try {
      const raw = await AsyncStorage.getItem(BASKET_KEY);
      if (!raw) return [];
      return parseStoredBasket(JSON.parse(raw));
    } catch {
      return [];
    }
  },

  async save(items: MagnetBasketItem[]): Promise<void> {
    try {
      if (items.length === 0) {
        await AsyncStorage.removeItem(BASKET_KEY);
        return;
      }
      await AsyncStorage.setItem(BASKET_KEY, JSON.stringify(items));
    } catch {
      // The in-memory basket stays correct for this session; only the
      // restore-after-restart guarantee is lost, and reporting a storage
      // failure over a magnet the user just collected helps nobody.
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(BASKET_KEY);
    } catch {
      // Same reasoning as save().
    }
  },
};
