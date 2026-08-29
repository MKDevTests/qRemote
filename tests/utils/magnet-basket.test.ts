import {
  addMagnetToBasket,
  basketMagnetUrls,
  isSameMagnet,
  makeBasketItem,
  parseStoredBasket,
  removeFromBasket,
} from '@/utils/magnet-basket';

const H1 = 'c9e15763f722f23e98a29decdfae341b98d53056';
const H2 = '1f2e3d4c5b6a798071625344556677889900aabb';
const m = (hash: string, extra = '') => `magnet:?xt=urn:btih:${hash}${extra}`;

describe('makeBasketItem', () => {
  it('pulls the hash and display name out of the link', () => {
    const item = makeBasketItem(m(H1, '&dn=Some+Release'), 1000);
    expect(item).toEqual({
      magnet: m(H1, '&dn=Some+Release'),
      infoHash: H1,
      name: 'Some Release',
      addedAt: 1000,
    });
  });

  it('leaves name null when the link has no dn, so the UI can fall back', () => {
    expect(makeBasketItem(m(H1), 0).name).toBeNull();
  });
});

describe('isSameMagnet', () => {
  it('matches on info hash even when trackers and name differ', () => {
    // The same release from two indexers: different tracker list, different
    // dn, identical content. Comparing whole URIs would miss this.
    const a = makeBasketItem(m(H1, '&dn=Release.A&tr=udp%3A%2F%2Fone.example'), 1);
    const b = makeBasketItem(m(H1, '&dn=Release+B&tr=udp%3A%2F%2Ftwo.example'), 2);
    expect(isSameMagnet(a, b)).toBe(true);
  });

  it('treats different hashes as different torrents', () => {
    expect(isSameMagnet(makeBasketItem(m(H1), 1), makeBasketItem(m(H2), 2))).toBe(false);
  });

  it('falls back to the whole URI when a hash is missing', () => {
    const a = makeBasketItem('magnet:?dn=NoHash', 1);
    const b = makeBasketItem('magnet:?dn=NoHash', 2);
    const c = makeBasketItem('magnet:?dn=Other', 3);
    expect(isSameMagnet(a, b)).toBe(true);
    expect(isSameMagnet(a, c)).toBe(false);
  });
});

describe('addMagnetToBasket', () => {
  it('appends and reports success', () => {
    const r = addMagnetToBasket([], m(H1), 5);
    expect(r.added).toBe(true);
    expect(r.items).toHaveLength(1);
  });

  it('refuses a duplicate and returns the basket untouched', () => {
    const first = addMagnetToBasket([], m(H1, '&dn=A'), 1).items;
    const second = addMagnetToBasket(first, m(H1, '&dn=B&tr=udp%3A%2F%2Fx'), 2);
    expect(second.added).toBe(false);
    expect(second.reason).toBe('duplicate');
    expect(second.items).toBe(first);
  });

  it('refuses anything that is not a magnet', () => {
    for (const bad of ['', '   ', 'https://example.com/a.torrent', 'nonsense']) {
      const r = addMagnetToBasket([], bad, 1);
      expect(r.added).toBe(false);
      expect(r.reason).toBe('invalid');
    }
  });

  it('does not mutate the array it was given', () => {
    const items = [makeBasketItem(m(H1), 1)];
    addMagnetToBasket(items, m(H2), 2);
    expect(items).toHaveLength(1);
  });
});

describe('removeFromBasket', () => {
  it('drops the matching entry and keeps the rest', () => {
    const items = [makeBasketItem(m(H1), 1), makeBasketItem(m(H2), 2)];
    const left = removeFromBasket(items, items[0]);
    expect(left).toHaveLength(1);
    expect(left[0].infoHash).toBe(H2);
  });

  it('matches by hash, so a differently-decorated copy still removes it', () => {
    const items = [makeBasketItem(m(H1, '&dn=A'), 1)];
    expect(removeFromBasket(items, makeBasketItem(m(H1, '&tr=udp%3A%2F%2Fz'), 9))).toHaveLength(0);
  });
});

describe('parseStoredBasket', () => {
  it('rebuilds a stored basket', () => {
    const stored = [{ magnet: m(H1), infoHash: H1, name: null, addedAt: 7 }];
    expect(parseStoredBasket(stored)).toEqual([
      { magnet: m(H1), infoHash: H1, name: null, addedAt: 7 },
    ]);
  });

  it('drops malformed entries instead of failing the whole basket', () => {
    const stored = [
      null,
      'a string',
      { magnet: 42 },
      { magnet: 'https://example.com/x' },
      { magnet: m(H1), addedAt: 3 },
    ];
    const parsed = parseStoredBasket(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].infoHash).toBe(H1);
  });

  it('drops duplicates that a previous version could have stored', () => {
    const stored = [{ magnet: m(H1, '&dn=A') }, { magnet: m(H1, '&dn=B') }];
    expect(parseStoredBasket(stored)).toHaveLength(1);
  });

  it('defaults a missing timestamp rather than producing NaN ordering', () => {
    expect(parseStoredBasket([{ magnet: m(H1) }])[0].addedAt).toBe(0);
  });

  it('returns an empty basket for anything that is not an array', () => {
    for (const bad of [null, undefined, 0, 'x', {}]) {
      expect(parseStoredBasket(bad)).toEqual([]);
    }
  });
});

describe('basketMagnetUrls', () => {
  it('submits in arrival order, whatever order the array is in', () => {
    const items = [makeBasketItem(m(H2), 20), makeBasketItem(m(H1), 10)];
    expect(basketMagnetUrls(items)).toEqual([m(H1), m(H2)]);
  });

  it('does not reorder the array it was given', () => {
    const items = [makeBasketItem(m(H2), 20), makeBasketItem(m(H1), 10)];
    basketMagnetUrls(items);
    expect(items[0].infoHash).toBe(H2);
  });
});
