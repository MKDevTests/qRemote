/**
 * useCompletionNotifications — the foreground half of completion notifications.
 *
 * The background task (services/completion-task.ts) can only run every fifteen
 * minutes or so. While the app is open TorrentContext already polls every two
 * seconds, so a completion can be announced the moment it happens instead —
 * for free, from data that was fetched anyway.
 *
 * Both halves share one snapshot in AsyncStorage, so whichever sees a torrent
 * finish first is the only one that reports it.
 */
import { useEffect, useRef } from 'react';
import { TorrentInfo } from '@/types/api';
import {
  completionNotificationsEnabled,
  reportCompletions,
} from '@/services/completion-notifications';

export function useCompletionNotifications(
  torrents: readonly TorrentInfo[],
  isConnected: boolean,
): void {
  // One check at a time: the poll fires every 2s and a slow AsyncStorage write
  // must not let two runs read the same snapshot and both report the same
  // torrent.
  const running = useRef(false);

  useEffect(() => {
    if (!isConnected || !completionNotificationsEnabled()) return;
    // An empty list is either a genuinely empty client or the moment before
    // the first sync lands; either way there is nothing to compare and
    // snapshotting it would forget everything the last session knew.
    if (torrents.length === 0) return;
    if (running.current) return;

    running.current = true;
    reportCompletions(torrents).finally(() => {
      running.current = false;
    });
  }, [torrents, isConnected]);
}
