import {
  MIGRATIONS,
  PreferenceMigration,
  SCHEMA_VERSION_KEY,
  migratePreferences,
  storedSchemaVersion,
} from '@/utils/preference-migrations';

/** A throwaway chain, so these tests do not depend on what ships today. */
const renameFooToBar: PreferenceMigration = {
  to: 1,
  migrate: (p) => {
    if (p.foo === undefined) return p;
    const { foo, ...rest } = p;
    return { ...rest, bar: foo };
  },
};
const dropLegacy: PreferenceMigration = {
  to: 2,
  migrate: (p) => {
    const next = { ...p };
    delete next.legacy;
    return next;
  },
};
const CHAIN = [renameFooToBar, dropLegacy];

describe('the shipped migration list', () => {
  it('is ordered and has no repeated version', () => {
    const versions = MIGRATIONS.map((m) => m.to);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('storedSchemaVersion', () => {
  it('reads a stored integer', () => {
    expect(storedSchemaVersion({ [SCHEMA_VERSION_KEY]: 3 })).toBe(3);
  });

  // Everything written before this system existed reports 0.
  it('treats anything unreadable as 0', () => {
    expect(storedSchemaVersion(null)).toBe(0);
    expect(storedSchemaVersion(undefined)).toBe(0);
    expect(storedSchemaVersion({})).toBe(0);
    expect(storedSchemaVersion({ [SCHEMA_VERSION_KEY]: '2' })).toBe(0);
    expect(storedSchemaVersion({ [SCHEMA_VERSION_KEY]: -1 })).toBe(0);
    expect(storedSchemaVersion({ [SCHEMA_VERSION_KEY]: 1.5 })).toBe(0);
  });
});

describe('migratePreferences', () => {
  it('runs the whole chain on an unversioned blob and stamps the result', () => {
    const { prefs, changed } = migratePreferences({ foo: 'x', legacy: 1, keep: true }, CHAIN);
    expect(changed).toBe(true);
    expect(prefs).toEqual({ bar: 'x', keep: true, [SCHEMA_VERSION_KEY]: 2 });
  });

  it('runs only what is newer than the stored version', () => {
    const { prefs } = migratePreferences({ foo: 'x', legacy: 1, [SCHEMA_VERSION_KEY]: 1 }, CHAIN);
    // v1 is skipped, so `foo` survives untouched; v2 still drops `legacy`.
    expect(prefs).toEqual({ foo: 'x', [SCHEMA_VERSION_KEY]: 2 });
  });

  it('is a no-op on an already-current blob', () => {
    const stored = { bar: 'x', [SCHEMA_VERSION_KEY]: 2 };
    const { prefs, changed } = migratePreferences(stored, CHAIN);
    expect(changed).toBe(false);
    expect(prefs).toEqual(stored);
  });

  it('never mutates the stored object', () => {
    const stored = { foo: 'x', legacy: 1 };
    migratePreferences(stored, CHAIN);
    expect(stored).toEqual({ foo: 'x', legacy: 1 });
  });

  it('treats anything that is not an object as an empty blob', () => {
    expect(migratePreferences(null, CHAIN).prefs).toEqual({ [SCHEMA_VERSION_KEY]: 2 });
    expect(migratePreferences(undefined, CHAIN).prefs).toEqual({ [SCHEMA_VERSION_KEY]: 2 });
    expect(migratePreferences([1, 2] as unknown as Record<string, unknown>, CHAIN).prefs).toEqual({
      [SCHEMA_VERSION_KEY]: 2,
    });
  });

  // One broken step must not take the user's whole settings store with it.
  it('skips a migration that throws and still runs the later ones', () => {
    const exploding: PreferenceMigration = {
      to: 1,
      migrate: () => {
        throw new Error('bad data');
      },
    };
    const { prefs } = migratePreferences({ legacy: 1, keep: 'yes' }, [exploding, dropLegacy]);
    expect(prefs).toEqual({ keep: 'yes', [SCHEMA_VERSION_KEY]: 2 });
  });

  it('ignores a migration that returns nothing usable', () => {
    const nonsense: PreferenceMigration = {
      to: 1,
      migrate: () => undefined as unknown as Record<string, unknown>,
    };
    const { prefs } = migratePreferences({ keep: 1 }, [nonsense]);
    expect(prefs).toEqual({ keep: 1, [SCHEMA_VERSION_KEY]: 1 });
  });

  it('stamps a blob even when there is nothing to run', () => {
    const { prefs, changed } = migratePreferences({ a: 1 }, []);
    expect(changed).toBe(true);
    expect(prefs).toEqual({ a: 1, [SCHEMA_VERSION_KEY]: 0 });
    // …and then settles.
    expect(migratePreferences(prefs, []).changed).toBe(false);
  });

  it('does not re-run migrations on a blob from a newer build', () => {
    const fromTheFuture = { bar: 'x', [SCHEMA_VERSION_KEY]: 9 };
    const { prefs, changed } = migratePreferences(fromTheFuture, CHAIN);
    expect(changed).toBe(true);
    expect(prefs.bar).toBe('x');
    // Every step is older than the stored version, so nothing ran.
    expect(prefs.foo).toBeUndefined();
  });
});
