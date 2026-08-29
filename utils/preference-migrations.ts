/**
 * preference-migrations.ts — bring a stored preferences blob up to date.
 *
 * Until now the repo had no migration system at all, and the consequence was
 * a standing rule: **never rename a preference key**, because an old key just
 * becomes orphaned on every existing install and the value silently reverts to
 * its default. `types/preferences.ts` still carries keys kept alive purely for
 * that reason.
 *
 * This is the way out. Preferences now carry a schema version; anything
 * written before this existed reads as version 0. On load, every migration
 * newer than the stored version runs in order, and the result is written back.
 *
 * ## Adding a migration
 *
 * Append to `MIGRATIONS` — never renumber or edit an existing one, since some
 * installs have already run it, and rerunning a different body under the same
 * number is how you corrupt exactly the devices you were trying to fix.
 *
 * A migration takes the whole blob and returns the whole blob, and it must
 * tolerate garbage: it is reading data written by an older build that may
 * itself have had bugs.
 *
 * Renaming `foo` to `bar` then becomes:
 *
 *     { to: 2, migrate: (p) => {
 *         if (p.foo === undefined) return p;
 *         const { foo, ...rest } = p;
 *         return { ...rest, bar: foo };
 *       } }
 */

/** A preferences blob mid-migration: shape unknown, by definition. */
export type StoredPreferences = Record<string, unknown>;

export interface PreferenceMigration {
  /** The schema version this migration produces. */
  to: number;
  migrate: (prefs: StoredPreferences) => StoredPreferences;
}

/** Where the schema version lives inside the blob. */
export const SCHEMA_VERSION_KEY = '__schemaVersion';

/**
 * Ordered, append-only. Empty today: nothing has needed renaming yet, and the
 * point of landing this now is that the next rename does not have to be
 * refused.
 *
 * Note for whoever adds the first one: `cardViewMode` looks like an obvious
 * candidate — types/preferences.ts described it as transitional, to be dropped
 * "once a preference migration system is in place". It is not a candidate. The
 * multi-view UI it selects was never actually removed; the toggle is live in
 * Settings > Appearance and the torrent list reads it on every render. That
 * comment was stale, and deleting the key would silently reset everyone's card
 * view.
 */
export const MIGRATIONS: PreferenceMigration[] = [];

/** The version a fully migrated blob carries. */
export const CURRENT_SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.to), 0);

/**
 * The version a stored blob claims.
 *
 * Anything unreadable — absent, negative, fractional, a string — reads as 0,
 * which is also what every install written before this existed reports. Running
 * migrations again on an already-migrated blob is the safe direction: each one
 * is written to no-op when its change is already applied.
 */
export function storedSchemaVersion(prefs: StoredPreferences | null | undefined): number {
  const raw = prefs?.[SCHEMA_VERSION_KEY];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return 0;
  return raw;
}

export interface MigrationResult {
  prefs: StoredPreferences;
  /** True when anything actually changed and the blob is worth writing back. */
  changed: boolean;
}

/**
 * Apply every migration newer than the blob's own version.
 *
 * A migration that throws is skipped rather than allowed to take the whole
 * preferences store down with it: losing one key's cleanup is recoverable,
 * an app that cannot read its settings is not.
 */
export function migratePreferences(
  raw: StoredPreferences | null | undefined,
  migrations: readonly PreferenceMigration[] = MIGRATIONS,
): MigrationResult {
  const prefs: StoredPreferences =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};

  const target = migrations.reduce((max, m) => Math.max(max, m.to), 0);
  const from = storedSchemaVersion(prefs);
  if (from >= target && prefs[SCHEMA_VERSION_KEY] === target) {
    return { prefs, changed: false };
  }

  let current = prefs;
  for (const migration of migrations) {
    if (migration.to <= from) continue;
    try {
      const next = migration.migrate(current);
      if (next && typeof next === 'object') current = next;
    } catch {
      // Skip this step; later ones still get their chance.
    }
  }

  current = { ...current, [SCHEMA_VERSION_KEY]: target };
  return { prefs: current, changed: true };
}
