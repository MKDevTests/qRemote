import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseStoredHistory } from '@/utils/search-history';

const HISTORY_KEY = 'search_history';

/**
 * Persistence for the Search tab's recent terms.
 *
 * Its own key rather than a preference, for the same reason the magnet basket
 * has one (see services/magnet-basket-storage.ts): preferences are small
 * settings written whole, this is a working list that changes on every search.
 * A failed read yields an empty history — losing the chips is a non-event,
 * refusing to open the Search tab is not.
 */
export const searchHistoryStorage = {
  async load(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      return parseStoredHistory(JSON.parse(raw));
    } catch {
      return [];
    }
  },

  async save(history: string[]): Promise<void> {
    try {
      if (history.length === 0) {
        await AsyncStorage.removeItem(HISTORY_KEY);
        return;
      }
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The list stays correct for this session; only the restore after a
      // restart is lost, which is not worth a toast.
    }
  },
};
