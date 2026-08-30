/**
 * torrent-sort.ts — ordering values that need normalising before they compare.
 *
 * Most of the torrent list's sort keys are plain numbers that compare fine on
 * their own. `completion_on` is not one of them: it carries a sentinel for
 * torrents that never finished, and a sentinel read as a date sorts wherever
 * its bit pattern happens to fall.
 */
import { TorrentInfo } from '@/types/api';

/** A day of slack, so a clock skewed slightly fast is not read as a sentinel. */
const FUTURE_TOLERANCE_SECONDS = 86400;

/**
 * When this client saw the torrent finish, as a Unix timestamp, or 0 if it
 * never did.
 *
 * qBittorrent marks "never completed" with a non-positive value — which is why
 * `formatDate` already treats `<= 0` as no date at all. Those sink to the
 * bottom of a newest-first sort on their own.
 *
 * The value that would not is an *unsigned* sentinel: 4294967295 read as
 * seconds lands in the year 2106, so a torrent that never completed would
 * head the list of most recently completed ones. Rather than trust every
 * qBittorrent build to agree on which sentinel it writes, anything past
 * roughly now is treated the same as anything below zero — neither is a
 * completion this client witnessed.
 *
 * Note this is when *this client* saw it finish, not when the release came
 * out: a torrent added already-complete is stamped at the moment qBittorrent
 * verified it.
 */
export function completionTime(
  torrent: Pick<TorrentInfo, 'completion_on'>,
  nowSeconds: number = Date.now() / 1000,
): number {
  const raw = Number(torrent?.completion_on);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw > nowSeconds + FUTURE_TOLERANCE_SECONDS) return 0;
  return raw;
}
