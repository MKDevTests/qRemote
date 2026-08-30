import { TorrentInfo } from '@/types/api';
import { completionTime } from '@/utils/torrent-sort';

const NOW = 1_760_000_000; // a fixed "now" so the future guard is deterministic
const t = (completion_on: number) => ({ completion_on }) as TorrentInfo;

describe('completionTime', () => {
  it('passes a real completion through untouched', () => {
    expect(completionTime(t(NOW - 3600), NOW)).toBe(NOW - 3600);
  });

  // qBittorrent's "never completed" marker. formatDate already treats <= 0 as
  // no date, which is where the expectation comes from.
  it('treats a non-positive value as never completed', () => {
    expect(completionTime(t(0), NOW)).toBe(0);
    expect(completionTime(t(-1), NOW)).toBe(0);
  });

  // The one that would actually misorder the list: read as seconds, the
  // unsigned sentinel lands in 2106 and heads a newest-first sort.
  it('treats the unsigned sentinel as never completed', () => {
    expect(completionTime(t(4294967295), NOW)).toBe(0);
  });

  it('allows a little clock skew rather than calling it a sentinel', () => {
    expect(completionTime(t(NOW + 600), NOW)).toBe(NOW + 600);
  });

  it('rejects a timestamp well past now', () => {
    expect(completionTime(t(NOW + 86400 * 30), NOW)).toBe(0);
  });

  it('treats nonsense as never completed rather than throwing', () => {
    expect(completionTime(t(NaN), NOW)).toBe(0);
    expect(completionTime(t(Infinity), NOW)).toBe(0);
    expect(completionTime(t(undefined as unknown as number), NOW)).toBe(0);
    expect(completionTime(undefined as unknown as TorrentInfo, NOW)).toBe(0);
  });

  it('defaults to the real clock when none is given', () => {
    const recent = Math.floor(Date.now() / 1000) - 60;
    expect(completionTime(t(recent))).toBe(recent);
    expect(completionTime(t(4294967295))).toBe(0);
  });
});

describe('sorting by completion', () => {
  const byNewest = (list: TorrentInfo[]) =>
    [...list].sort((a, b) => completionTime(b, NOW) - completionTime(a, NOW));

  it('puts the most recently finished first', () => {
    const a = t(NOW - 10);
    const b = t(NOW - 5000);
    const c = t(NOW - 100);
    expect(byNewest([b, a, c])).toEqual([a, c, b]);
  });

  it('sinks the never-completed to the bottom, sentinel or not', () => {
    const done = t(NOW - 10);
    const never = t(0);
    const sentinel = t(4294967295);
    expect(byNewest([never, sentinel, done])[0]).toBe(done);
  });
});
