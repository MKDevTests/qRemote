# AGENTS.md

qRemote is a React Native (Expo SDK 57) app for remotely controlling
qBittorrent servers over the WebUI API v2.

**This is the MKDevTests fork.** Upstream (`taylorcox75/qRemote`) is iOS-only;
this fork adds an Android target and ships it through GitHub releases with an
in-app updater. Both platforms build from the same JS. Anything Android — build
scripts, signing, intent filters, the updater — is documented in
[docs/ANDROID.md](docs/ANDROID.md); read it before touching `app.config.js`'s
`android` block, `plugins/withAndroidBuildTweaks.js`, or `scripts/`.

Read this file top to bottom once. The **File Index** is a complete map — trust
it instead of re-exploring, and open only the files you're actually changing.

## How to work a task

1. **Read it as an API question first** — [§1](#think-in-api-terms-first): which
   endpoint, does it break stored data, does it still work on qBittorrent 4.x?
2. **Locate files in the [File Index](#5-file-index).** Don't search the tree.
3. **Copy the nearest sibling.** Whatever you're adding — a screen, a test, a
   settings row, a loading or empty state — one like it already exists. Match it
   instead of inventing a pattern.
4. **Edit. Run nothing while you work.**
5. **Verify narrowly** — the impacted suite only, and only if the change is
   non-trivial ([§1](#dont-burn-runs)). **Skip this entirely if you're heading
   straight to a commit** — step 7's full batch supersedes it. Never run both.
6. **Reply in a few lines**: what changed, file links, anything surprising.
7. **Stop.** Commit only when asked — and when asked, go all the way to a PR
   ([§1](#when-asked-to-commit-go-all-the-way-to-a-pr)).

**Decide, don't ask.** When something's ambiguous, make the reasonable call and
name it in your reply so it can be corrected. Stop only when genuinely blocked.

**Don't spawn subagents** unless the user asks for one by name or says something
like "thorough" or "review." Each one starts cold and re-derives context you
already have.

---

## 1. Working Agreement

How to work in this repo, before anything about the code itself.

### Think in API terms first

The target is the **qBittorrent WebUI API v2**
([5.0 reference](<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)>)).
Almost every request the user makes is an API question wearing a UI costume. Work
through these three before writing code, and raise a problem early rather than
shipping a plausible-looking guess:

**1. What API will I be using?**
Name the specific endpoint(s) and confirm they exist in the 5.0 wiki, along with
their exact parameter names and response fields. If nothing in the API supports
the request, say so up front — that's far more useful than an implementation
built on an endpoint that isn't there.

**2. Will this break existing users?**
The app has users with data on their devices. Anything that renames or changes
the meaning of a stored key silently breaks them. Preferences now have a
migration system (`utils/preference-migrations.ts`) — a rename is possible, but
only *with* a migration appended to it. Check against: preference keys (`types/preferences.ts`), `colors` keys
(ThemeContext), stored `ServerConfig` records, and saved color themes. Adding is
safe; renaming and repurposing are not. See [§8 Critical Rules](#8-critical-rules).

**3. Does it still work on qBittorrent 4.x?**
([4.1 reference](<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)>))
Not every feature has to — some endpoints genuinely only exist in 5.0 — but the
**main features must stay usable on 4.x**. When a capability is version-dependent,
gate it rather than dropping 4.x support.

Gating lives in `utils/apiVersion.ts` (`ApiFeatures`), keyed on the **WebAPI**
version rather than the qBittorrent version:

- **WebAPI ≥ 2.11.0 = qBittorrent 5.0** — the main boundary. Start/stop endpoints,
  `content_path`, inactive-seeding limits, cookies, `search/downloadTorrent`,
  `getDirectoryContent`.
- **WebAPI ≥ 2.8.0 = qBittorrent 4.3.x** — ratio and seeding-time limit fields.
- **Unknown or unparseable version → assume the 5.0 feature set**, so a detection
  failure doesn't silently downgrade a modern server.

> ⚠️ **A wrong parameter name looks like success.** qBittorrent silently drops
> form fields it doesn't recognize and still returns 200. So a 5.0-only parameter
> sent to a 4.x server doesn't error — the feature just quietly does nothing.
> qBit 5.0 renamed several things (`paused` → `stopped` on `torrents/add`,
> `start_paused_enabled` → `add_stopped_enabled` in preferences), and these
> renames are per-site: handling one does not handle the others. When you add a
> version-dependent parameter, gate it _and_ verify against the older wiki.

### Don't burn runs

Every typecheck / test / lint run costs real tokens and wall time. There are
exactly **three** moments to run anything, and no others:

**1. Mid-task → run nothing.** Never fire `tsc`, `jest`, or `eslint` after an
individual edit or "just to be safe." Trust the edit and keep working.

**2. Handing back a non-trivial change → the impacted suites only.** Never the
full run here. Pick the narrowest command that covers what you actually touched:

| What you changed                            | What to run                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One module that has a test                  | That one suite — `npm test -- tests/utils/format.test.ts` (~18s). Same form for `tests/services/…` and `tests/rn/…`. |
| Pure logic — `utils/`, `services/`, locales | `npm test -- --selectProjects node` (skips the slow jest-expo project)                                               |
| Components, hooks, context                  | `npm test -- --selectProjects rn`                                                                                    |
| Types, or a change that crosses many files  | `npx tsc --noEmit`                                                                                                   |

**Trivial edits need nothing** — a comment, a copy tweak, a doc line, a single
string. Use judgment; the point is to catch real breakage, not to perform rigor.

**3. Before a commit → the full batch.** See [Commit-time checks](#commit-time-checks).

### Read narrowly

Tool output is **permanent and recurring**: whatever a command prints stays in
the conversation and is re-sent on every later turn. A single careless dump of a
few hundred lines is a tax on the whole rest of the session, so the cost of
reading too much is much higher than it looks at the moment you do it.

- **Never `cat` a whole file** to answer a narrow question. Use `grep -n` (with
  `-A`/`-B` for context) or a ranged read. Reach for the file's shape first —
  `grep -n "^export\|^## "` beats reading it.
- **Especially never dump** generated, lock, or config-heavy files:
  `package-lock.json`, anything under `ios/`, `.github/workflows/*` (they embed
  long inline scripts), coverage output, `dist/`.
- **Don't re-list the tree.** The [File Index](#5-file-index) is complete and
  maintained. Use it instead of `find` or a recursive `ls`.
- **Don't re-read a file you just edited** to confirm the edit — the edit tool
  already failed loudly if it didn't apply.
- **Read the whole file when you're about to change it substantially.** This rule
  is about avoiding _incidental_ bulk, not about editing blind.

### Commit-time checks

Only now do you run the whole thing — once, as a batch:

| Command            | Bar                                                                             |
| ------------------ | ------------------------------------------------------------------------------- |
| `npx tsc --noEmit` | Exit 0. Currently clean. Incremental via `.tsbuildinfo` (~25s warm, ~85s cold). |
| `npm test`         | All passing, both projects — see [Testing](#7-testing).                         |
| `npm run lint`     | **Zero errors.** Warnings are baseline noise; the count drifts, don't chase it. |
| `npm run format`   | Prettier. Run it last, so it also formats anything you just changed.            |

Then, in the same pre-commit pass:

- **Update the [File Index](#5-file-index)** if you added, removed, or renamed a
  module. The index promises to be complete; a stale entry is what forces the
  next session to re-explore, which costs far more than this edit.
- **Changelog** — only if the user explicitly asked (see above).

### Changelog is opt-in

**Do not touch `constants/changelog.ts` on your own initiative** — not even for
a user-facing change. Only edit it when the user explicitly asks ("update the
changelog", "add a changelog entry"). When they do ask, follow
[docs/RELEASING.md](docs/RELEASING.md) exactly — read it at that point, not
before.

### Branches — always work on one

**Never commit to `main`.** It is protected by convention: work reaches it only
through a PR. There is no exception for a one-line fix or a "quick" change.

Every change starts on its own branch cut from `main`:

```bash
git switch main && git pull && git switch -c bugfix/#123-short-description
```

Naming follows what's already in the repo — `feature/…`, `bugfix/…`, or `fix/…`,
usually carrying the issue number (`bugfix/#177`, `feature/#121`). Agent-created
branches use a `claude/…` prefix.

> **This fork has no `develop`.** Upstream's docs describe a
> branch → `develop` → `main` chain, but `develop` does not exist here and
> `git switch develop` fails. The extra integration layer earns nothing on a
> single-maintainer fork whose releases are cut by a local script, so branches
> merge straight into `main` by PR. If you ever see instructions elsewhere in
> this file referring to `develop`, they are upstream leftovers — report them.

| Branch        | Role                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| _your branch_ | Where every commit goes. Cut from `main`, merged back by PR.                                                                                  |
| `main`        | Release branch. Android releases are cut from it with `scripts/release-qremote.sh` — see [docs/ANDROID.md](docs/ANDROID.md).                  |
| `coverage`    | Machine-written. The `coverage.yml` workflow force-pushes the README badge's `badge.json` here. Never branch from it or commit to it by hand. |

Two workflows live in `.github/workflows/`: `coverage.yml` (badge, on every push
to `main`) and `android-release.yml` (manual `workflow_dispatch`, cuts a signed
release from GitHub instead of the maintainer's machine — the same output as
`scripts/release-qremote.sh`, reading the keystore from repository secrets).

> **The upstream EAS / App Store pipeline is gone from this fork, entirely.**
> `.github/workflows/ios-deploy.yml`, `eas.json`, `.eas/workflows/`, the
> `easBuild` key in `package.json`, the `updates` / `extra.eas` /
> `runtimeVersion` blocks in `app.config.js`, and the `expo-updates` dependency
> were all removed — there are no Apple or EAS credentials here, and a build
> that kept the OTA config would have pulled upstream's JS bundle over its own.
> Releases go out as Android APKs on GitHub (`services/updater.ts`).
> Don't reintroduce any of it, and treat instructions elsewhere that mention
> `easBuild` or `eas.json` as upstream leftovers — report them.

**Commit and push only when asked.** If you're asked to commit and you're sitting
on `main`, branch first, then commit — don't ask whether the rule
applies this time.

### When asked to commit, go all the way to a PR

"Commit this" means the full sequence, not just the commit:

1. Run the [commit-time checks](#commit-time-checks) and the File Index pass.
2. Branch if you aren't already on one.
3. Commit. **No `Co-Authored-By: Claude` trailer** on this repo.
4. `git push -u origin <branch>`
5. `gh pr create --base main` with a short summary and a test-plan line
   covering what you ran.

Stop there. **Never merge the PR** — review and merge are the user's.

---

## 2. Dev Commands

- **`npm run xcode`** — the one command that gets you building. Fresh-clone-safe:
  `npm install` → `npx expo prebuild -p ios` → `pod install` → opens
  `ios/qRemote.xcworkspace`. Safe to re-run any time (after pulling native or
  dependency changes). Build/run with Cmd+R once Xcode is open.
- **`npm start`** — Metro for the dev-client build (`expo start --dev-client`).
  **Not** `--go`: this app is bare with custom native code, so plain Expo Go
  can't run it. Run alongside a dev-client build for JS fast refresh.

---

## 3. iOS Native Workflow

**`ios/` is generated, not committed.** It (and `android/`) have been gitignored
since #154 (commit `ba511cd`). `npm run xcode` regenerates it from scratch, so a
fresh clone builds with no committed native files. Whatever sits under `ios/`
locally is machine-local and disposable.

Consequences:

- **Native config goes in `app.config.js`**, not in `ios/`. Info.plist keys,
  entitlements, URL schemes and document types all live in the `ios.infoPlist`
  block, which prebuild applies when generating the project. Hand-edits under
  `ios/` are wiped by the next prebuild.
- **When `app.config.js` can't express it, write a config plugin.** There's one
  precedent: `plugins/withNativeTorrentFileCopy.js`, which patches `AppDelegate`
  so an incoming `.torrent` is copied natively inside the open-URL callback —
  while the security-scoped access is still valid — instead of racing the async
  JS Linking bridge on cold launch.
- **When you need actual new native code (not a patch to a generated file),
  write a local Expo module under `modules/`.** Precedent:
  `modules/insecure-cert-allowlist` — autolinked by Expo from `modules/*` with
  no config plugin needed, discovered automatically on `npm run xcode`'s prebuild.
- **`app.config.js` is tested.** `tests/utils/app-config.test.ts` asserts the
  magnet scheme and `.torrent` document-type registration survive. Update it if
  you change those blocks; the comments in `app.config.js` explain why each key
  is set the way it is (several encode hard-won App Store / Files.app fixes —
  read them before flipping a value).
- **Expo SDK upgrades (57 → 58…)** are the normal managed path: bump the
  packages, re-run `npm run xcode`, and prebuild regenerates from the new
  template.

Android support was removed entirely — no platform, no build target, no plan to
re-add one without being asked.

---

## 4. Architecture

- **Routing** — Expo Router, file-based, in `app/`. Parenthesized `(groupname)`
  segments are route _groups_: they organize files but are **omitted from URLs**.
  The tab bar lives in `app/(tabs)/_layout.tsx`. Screens that must keep the tab
  bar visible live in nested Stacks _under_ a tab, never as siblings of `(tabs)`
  on the root stack. The root stack (`app/_layout.tsx`) anchors on `(tabs)`, so
  dismissing a modal doesn't wipe the tab navigator.
- **State** — React Context + TanStack Query.
- **Data sync** — TanStack Query with `refetchInterval` (2–3s); torrents use
  rid-based incremental sync through a custom `queryFn`.
- **Storage** — AsyncStorage for preferences, `expo-secure-store` for secrets.
- **API** — thin wrapper objects in `services/api/` over one axios singleton
  (`apiClient`).
- **Styling** — every color comes from `useTheme()`. Users can override any
  color via the in-app picker.
- **i18n** — react-i18next, six locales.
- **Deep links** — magnet URLs and `.torrent` files arrive via a `Linking`
  listener in `app/_layout.tsx`. `app/+native-intent.ts` returns `null` for those
  URLs so Expo Router doesn't try to treat a `file://…torrent` path as a route
  and land the user on "Unmatched Route".

### Per-server secrets

Reverse-proxy Basic Auth (`useBasicAuth`, #118) shows the pattern every
per-server secret must follow:

- Non-secret half (`basicAuthUsername`) → plain AsyncStorage via `services/storage.ts`.
- Secret half (`basicAuthPassword`) → `expo-secure-store` under
  `server_basic_auth_password_{id}`, and forced to `''` before the server record
  is written to AsyncStorage.
- `services/api/client.ts` reads it back off the in-memory `ServerConfig` to
  build the header via `utils/basicAuth.ts`.

Custom headers (`useCustomHeaders`, #228) follow the same rule: the flag is
plain, but the whole `customHeaders` array is a secret (values are tokens),
JSON-stringified into `server_custom_headers_{id}` and forced to `[]` in
AsyncStorage.

Be deliberate whenever you touch code that persists a `ServerConfig` — including
paths that rewrite the _whole_ server list, such as add, edit, delete, and
import. A secret must never reach AsyncStorage, and bulk rewrites are the easiest
place to let one slip through.

### Auth modes

A server's auth mode is _derived_, not stored — see `utils/authMode.ts`
(`password` | `apiKey` | `none`). Legacy records that only ever set `bypassAuth`
keep working; when both `useApiKey` and `bypassAuth` are set, API key wins.

---

## 5. File Index

Complete map. Trust it.

### Screens (`app/`, Expo Router)

| Path                                        | Notes                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(tabs)/(torrents)/`                    | Torrents tab as a nested stack: `index` list, `torrent/[hash]`, `torrent/files`, `torrent/manage-trackers`, `magnet-basket`. Group is omitted from URLs → `/`, `/torrent/[hash]`, `/magnet-basket`.                                   |
| `app/(tabs)/search.tsx`                     | Search tab: job polling UI, plugin/category/indexer filter chips, client-side sort, collapsing header. Optional auto-tag-by-tracker on add (`autoCategorizeByTracker` pref — tags Search downloads only; the key name is historical). |
| `app/(tabs)/transfer.tsx`                   | Transfer stats, global speed and seeding limits.                                                                                                                                                                                      |
| `app/(tabs)/logs.tsx`                       | Connectivity logs. `href: null` — reached from Settings → Advanced, not a visible tab.                                                                                                                                                |
| `app/(tabs)/rss/`                           | RSS Feeds tab (`index` tree + `feed` detail). `href` is null until connected **and** the server's `rss_processing_enabled` is on. Rules and settings screens do **not** go here — they live under Settings.                           |
| `app/(tabs)/settings/`                      | Settings tab as a nested stack. See sub-screens below.                                                                                                                                                                                |
| `app/(tabs)/_layout.tsx`                    | Tab bar and tab gating.                                                                                                                                                                                                               |
| `app/_layout.tsx`                           | Root providers, theme, deep-link handling. Anchors on `(tabs)`.                                                                                                                                                                       |
| `app/+native-intent.ts`                     | Suppresses Router navigation for magnet / `.torrent` URLs.                                                                                                                                                                            |
| `app/torrents/add.tsx`                      | Add-torrent flow (magnet or file, plus options). Root stack → no tab bar. Uses `PathAutocompleteInput`.                                                                                                                               |
| `app/search/plugins.tsx`                    | Search plugin install/enable/uninstall (`app/search/_layout.tsx` stack). Root stack. Also linked from the Settings hub.                                                                                                               |
| `app/server/add.tsx`, `app/server/[id].tsx` | Server add/edit, presented as native modal sheets → they mount `<ModalToast/>` locally.                                                                                                                                               |

**Settings sub-screens** — hub order on `index` is Servers → Appearance → Server
Settings → RSS → Search Plugins → Advanced, then What's New → About, then
Community links (source / issues only — upstream's Beer Fund and App Store
review rows were removed with the rest of the upstream links: this fork is not
on the App Store, and the donate button paid a different maintainer). Notifications & Feedback is
nested under `advanced`, not on the hub.

`about` · `add-torrent-dialogue` · `advanced` · `appearance` ·
`category-tag-colors` · `detailed-card-fields` · `notifications` · `rss` ·
`rss-rules` · `rss-rule` · `servers` (list + secret-free export/import) ·
`server-settings-advanced` (qBit email/automation) · `theme` ·
`torrent-defaults` (nav label is **Server Settings**; route path unchanged) ·
`whats-new`

> **Do not recreate** top-level `app/settings/` or `app/torrent/` trees, the old
> `app/(tabs)/index.tsx` / `app/(tabs)/settings.tsx` hub files, or the deleted
> `app/(tabs)/rss/rule.tsx` / `rules.tsx`. They were moved deliberately so the
> tab bar stays visible.

### Contexts (`context/`)

- **`ServerContext.tsx`** — connection lifecycle. `checkAndReconnect()` **always**
  does a full re-login (no session-validity probe) and de-dupes concurrent calls
  behind a shared in-flight promise. qBittorrent ties search jobs to the session,
  so **never call it eagerly** on foreground/AppState events — only reactively,
  after a request has actually failed. `disconnect()` clears the session but
  _keeps_ `currentServer` for one-tap reconnect from Settings; call
  `forgetCurrentServer()` when that server is deleted, and `updateCurrentServer()`
  after editing it so one-tap Connect doesn't retry stale credentials.
- **`TorrentContext.tsx`** — rid-based incremental sync, plus the reactive
  auto-reconnect effect the other providers piggyback on.
- **`TransferContext.tsx`** — transfer-info poll; relies on TorrentContext's reconnect.
- **`ToastContext.tsx`** + `components/Toast.tsx` — the global toast is a plain
  view. **Never wrap it in an RN `<Modal>`** — a Modal captures all touches and
  freezes the UI. Native-modal-sheet screens mount `ModalToast` locally instead.
- **`ThemeContext.tsx`** — `useTheme()`, the `colors` object, user overrides.
- **`ApiVersionContext.tsx`** — detected qBittorrent API version → feature gating
  through `utils/apiVersion.ts`.
- **`MagnetBasketContext.tsx`** — the magnet basket: a **persisted** queue of
  magnet links (AsyncStorage via `services/magnet-basket-storage.ts`). Unlike
  the Search cart it survives a restart, because collecting happens over time
  and often while the app is closed. Two producers feed it and must not fight:
  JS (a magnet deep link arriving while collect mode is on, in
  `app/_layout.tsx`) and the native collector's inbox, drained on hydration and
  on every AppState `active`. **Native never writes the basket, JS never writes
  the inbox.** Checkout goes to `app/torrents/add.tsx` with `fromBasket=1`,
  which prefills the textarea one URI per line and clears the basket only on a
  successful add.
- **`SearchCartContext.tsx`** — session-scoped queue of Search results the user
  wants to add together (#217). Not persisted — plugin download URLs are often
  session/token-bound. Dedupes by `fileUrl`. Consumed by `app/torrents/add.tsx`
  (gated on the `fromCart` route param) and grouped for submission via
  `utils/search-cart.ts`.

### Components (`components/`)

All PascalCase function components taking a `…Props` interface.

- **Modals / pickers** — `ActionMenu` (anchored popover), `ConfirmModal` (themed
  confirm), `InputModal` (themed text input; optional `pathAutocomplete` prop),
  `OptionPicker`, `MultiSelectPicker`, `CategoryModal`, `TagsModal`, `ColorPicker`,
  `IconPicker` (grid picker for a server's badge icon, previewed in its badge
  color — see `constants/serverIcons.ts`), `PathAutocompleteInput` (live
  directory suggestions via `app/getDirectoryContent`, qBit 5.0+ / WebAPI ≥
  2.11 — silent no-op when unsupported; also renders the browse button),
  `SavePathPickerModal` (filterable list of save paths already in use, derived
  from TorrentContext via `utils/save-paths.ts` — works on any qBittorrent
  version), `SearchCartModal` (review sheet for the Search tab's add queue —
  list, per-item remove, Clear all, Checkout — see `SearchCartContext.tsx`).
- **Torrent / search UI** — `TorrentCard` (`React.memo` with a **custom
  comparator — keep it in sync when you add a rendered field**, or the card
  silently stops updating; category/tag stickers use `categoryColors`/`tagColors`
  then defaults then the `avatarColor` fallback), `SearchResultRow` (+ internal
  ActionPill; the `+` button and the cart-toggle button are independent — see
  its header comment), `FilterChip`, `EmptyState`, `SkeletonLoader`
  (+ `SkeletonTorrentCard`), `PieceMap`, `ServerIconBadge` (per-server tinted
  icon badge — `ServerConfig.icon`/`iconColor` via `utils/server.ts`
  `getServerIcon`/`getServerIconColor`, falling back to a default icon and
  `avatarColor(name)`), `ServerAppearanceSection` (icon + badge-color editor
  used by both `app/server/add.tsx` and `app/server/[id].tsx` — quick
  `AVATAR_PALETTE` swatches plus a "custom color" swatch that opens the full
  `ColorPicker`), `CustomHeadersSection` (per-server custom HTTP header
  key/value rows, max 5, used by the same two screens — see
  `utils/customHeaders.ts`).
- **Visuals** — `SpeedGraph`, `CircularProgress`, `AnimatedProgressBar`,
  `AnimatedButton`, `Confetti`.
- **Chrome / diagnostics** — `FocusAwareStatusBar`, `SettingRow`,
  `QuickConnectPanel`, `LogViewer`, `DebugRow`, `SuperDebugPanel`,
  `UpdateSection` (the Android Updates card on the About screen; renders
  nothing on iOS — backed by `services/updater.ts`).

### API wrappers (`services/api/`)

Thin objects over `apiClient`.

- **`client.ts`** — the axios singleton. Holds server config, cookies, API
  version and the Basic Auth header, and normalizes HTTP failures into
  human-readable `Error`s. **Callers substring-match those messages — grep
  before rewording one.**
- `auth.ts` (login/logout) · `sync.ts` (`getMainData` rid-sync, `getTorrentPeers`) ·
  `transfer.ts` (global speed + seeding limits, alt-speed toggle, `banPeers`) ·
  `application.ts` (version/buildInfo/preferences/cookies, `getDirectoryContent`) ·
  `categories.ts` · `tags.ts` · `logs.ts` (main + peer logs) · `rss.ts` (feeds,
  folders, rules, `moveItem`) · `search.ts` (job start/stop/status/results/delete,
  plugin management, `downloadTorrent`).
- **`torrents.ts`** — everything per-torrent: list/properties/trackers/webseeds/
  contents/pieces; pause/resume/delete/recheck/reannounce; add (URL + file);
  tracker and peer edits; queue and file priorities; limits and share-limits;
  location/name/category/tags; AMM, sequential, first/last piece, force start,
  super seeding; `renameFile`/`renameFolder`.

### Services (`services/`)

- **`server-manager.ts`** — server CRUD, connect/reconnect/test
  (`ConnectionTestResult`, `isNetworkError`). `exportServers()`/`importServers()`
  back the server-list export/import; import preserves this device's stored
  secrets when an id already exists.
- **`storage.ts`** — AsyncStorage preferences (typed shape and defaults in
  `types/preferences.ts`). `savePreferences` **merges** over what is stored, so
  a partial write means what it looks like; `replaceAllPreferences` is the
  explicit replace, used only by the settings import. Reads run
  `utils/preference-migrations.ts` and write the result back.
- **`torrent-export.ts`** — fetch a torrent's own `.torrent` via
  `torrents/export`, write it to the app cache and hand it to the share sheet.
  The only way to get a `.torrent` back out of a torrent added from a magnet.
- **`search-history-storage.ts`** — the Search tab's recent terms, on their own
  AsyncStorage key for the same reason the magnet basket has one.
- **`magnet-basket-storage.ts`** — the magnet basket's own AsyncStorage key.
  Separate from `storage.ts` on purpose: preferences are small settings written
  whole, the basket is a working list. A failed read yields an empty basket
  rather than throwing.
- **`incoming-file.ts`** — copies an incoming `.torrent` into the app cache
  before iOS's security-scoped access, or Android's per-activity `content://`
  read grant, can lapse.
- **`updater.ts`** — Android in-app updates from GitHub releases (check the
  latest tag, download the `.apk` built for this device's ABI via
  `utils/apk-asset.ts`, fire `ACTION_INSTALL_PACKAGE`). Reads
  `extra.githubRepo` from `app.config.js`. No-ops on iOS. See
  [docs/ANDROID.md](docs/ANDROID.md).
- **`completion-notifications.ts`** — posts the "download finished" system
  notification (Android only). Owns the permission request, the channel, the
  stored snapshot, and a module-level enabled flag mirroring the
  `notifyOnComplete` preference — the same pattern as `utils/haptics.ts`,
  because the 2s foreground poll must not hit AsyncStorage each time and the
  background task has no React to read a context from.
- **`completion-task.ts`** — the background half. `TaskManager.defineTask` runs
  at module scope (Android can start the app headless purely to run it), so
  **import this module for its side effect** — app/_layout.tsx does.
  `syncCompletionTask(enabled)` registers/unregisters the WorkManager job.
  15 minutes is WorkManager's floor, not a choice.
- **`query-client.ts`** — the shared TanStack `QueryClient`.
- **`color-theme-manager.ts`** — save/load/apply user color themes.
- **`connectivity-log.ts`** — in-memory ring log (`clogDebug/Info/Warn/Error(tag, msg)`).
- **`log-storage.ts`** — persisted entries for the Logs screen.

### Native modules (`modules/`)

- **`magnet-collector`** — Android-only local Expo module behind the magnet
  basket's silent collect mode. `MagnetCollectActivity` is transparent, appends
  the link to a SharedPreferences inbox and calls `finish()`, so a magnet
  tapped in the browser never brings qRemote to the front. Use
  `Theme.Translucent.NoTitleBar`, **not `Theme.NoDisplay`** — the latter throws
  IllegalStateException on Android 8+ for exactly this pattern. The store uses
  `commit()`, not `apply()`: the process can die the moment the activity ends.
  No iOS half exists and none can — a URL scheme always foregrounds the target
  app — so `supportsSilentCollect` is false there and the basket collects
  through the normal deep-link path instead.
- **`insecure-cert-allowlist`** — local Expo module (Swift + an Obj-C category
  on `RCTHTTPRequestHandler`) backing the per-server "Allow Self-Signed
  Certificate" toggle. RN's default iOS HTTP handler never implements the TLS
  challenge delegate method, so it always falls through to default system
  trust evaluation with zero override point — not even for a certificate the
  user has manually trusted on-device. The category fills in that delegate
  method and accepts the connection only for hosts JS has explicitly
  allow-listed (`ServerConfig.allowInsecureCert`, synced from
  `services/server-manager.ts`); every other host and every non-server-trust
  challenge (Basic Auth, client cert) falls through to default handling
  unchanged. Requires `npm run xcode` to pick up (new native code, not just a
  generated-file patch).

  **Android** side added in this fork: OkHttp _does_ accept a custom trust
  manager, so instead of a category the module replaces React Native's
  `OkHttpClientFactory` (installed from the module's `OnCreate`, before any
  request causes a client to be cached). Same rule — real validation first, the
  allowlist only as a fallback — scoped per host through
  `X509ExtendedTrustManager`, the only trust-manager variant handed the socket
  being validated.

### Build tooling (`plugins/`, `scripts/`)

- **`plugins/withNativeTorrentFileCopy.js`** — iOS `withAppDelegate` mod;
  copies an incoming `.torrent` natively inside the open-URL callback.
- **`plugins/withMagnetCollector.js`** — manifest surgery for the magnet
  basket's collect mode. Adds an `<activity-alias>` owning the `magnet:` scheme
  (enabled) and the collector activity (disabled); exactly one is ever on,
  flipped at runtime by `MagnetCollectorModule.setCollectModeEnabled`. **An
  intent filter cannot be enabled on its own** — `enabled` belongs to the
  component — and disabling MainActivity would take the launcher icon with it,
  which is the whole reason for the alias. It also extracts _only_ the magnet
  `<data>` element out of MainActivity's generated filter, because Expo merges
  `magnet` and the dev-client's `exp+qremote` into one.
- **`plugins/withAndroidNetworkSecurity.js`** — writes
  `res/xml/network_security_config.xml` and points the manifest at it:
  cleartext HTTP (LAN qBittorrent is HTTP) and user-installed CAs (Android
  ignores them since 7.0). **`expo.android.usesCleartextTraffic` does not exist
  in the Expo schema** — setting it there is dropped in silence.
- **`plugins/withAndroidBuildTweaks.js`** — Android-only mods: a `.debug`
  `applicationIdSuffix` (side-by-side installs), a release signing config
  pointing _outside_ the generated tree so the signature is stable across
  prebuilds, and `reactNativeArchitectures` narrowed to the two ARM ABIs
  (`defaultConfig.ndk.abiFilters` does **not** work — RN's Gradle plugin
  overwrites it later and the APK silently keeps all four). Throws at prebuild
  time if the template's anchors move.
- **`scripts/_android-env.sh`** — shared: SDK detection, `local.properties`
  (forward slashes — see the file), Gradle JVM args (the Windows TLS-inspection
  workaround), prebuild-freshness check, `adb` resolution and install.
- **`scripts/build-qremote-debug.sh`** / **`build-qremote-release.sh`** —
  build + install. Release verifies `versionName` and refuses a debuggable APK.
- **`scripts/release-qremote.sh`** — bump `package.json` → build → verify →
  commit → tag → push → `gh release create`. Rolls back on any pre-push failure.

### Hooks (`hooks/`)

- `useSearchJob.ts` — search job lifecycle: start/stop/delete, 2s status+results
  polling, unmount cleanup.
- `useTorrentActions.ts` — builds the per-torrent action menu used by both list
  and detail. Delete exposes `deleteConfirmVisible` for a caller-mounted
  `ConfirmModal`.
- `useReactiveReconnect.ts` — feeds query errors into ServerContext reconnect
  (`isReconnectableError`).
- `useCompletionNotifications.ts` — the foreground half of completion
  notifications, called from TorrentProvider. Shares one snapshot with the
  background task, so whichever sees a torrent finish first is the only one
  that reports it.
- `useGracefulError.ts` — suppresses a transient error until it has persisted
  ~2.5s, so a self-healing poll failure doesn't flash error UI.
- `useRssFeeds.ts` / `useRssRules.ts` — RSS tree and auto-download rule state.
- `useSpeedTracker.ts` / `useSpeedHistory.ts` — sampling for `SpeedGraph`.

### Utils (`utils/`)

Pure and well-tested. **Put logic here whenever it doesn't need React.**

`format.ts` (size/speed/time/ratio/percent/progress/availability/date — progress
and availability **FLOOR**, never round up) · `torrent-state.ts` (state → color/
label, completion and ETA rules) · `limit-input.ts` (share-limit sentinels:
`-2` = follow global, `-1` = unlimited; own-vs-effective limit resolution) ·
`error.ts` (`getErrorMessage`) · `apiVersion.ts` (parse + `ApiFeatures` gating) ·
`server.ts` (endpoint resolution incl. fallback URL, avatar colors, and
`getServerIcon`/`getServerIconColor` for the per-server badge — #224) ·
`authMode.ts` (derives `password`/`apiKey`/`none`) · `basicAuth.ts` ·
`customHeaders.ts` (per-server custom HTTP headers — sanitize/validate, and the
reserved-name set the app manages itself: Authorization, Cookie, Referer,
Origin, Content-Type, Host — #228) ·
`magnet.ts` / `torrent-file.ts` (incoming link and file parsing; `magnet.ts` also
has `getMagnetInfoHash` / `getMagnetDisplayName` — note `new URL()` is useless on
a `magnet:` URI, the query has to be sliced at the first `?`) ·
`magnet-basket.ts` (the magnet basket's pure logic: add/remove/dedupe/restore.
Dedupe is by **info hash**, not by URI — the same release from two indexers
carries different trackers and `dn` but identical content. `parseStoredBasket`
drops malformed entries rather than failing the whole basket) · `rss.ts`
(RSS tree flattening; paths join with `\`) · `searchResult.ts` (indexer-label
heuristics) · `login-response.ts` (qBittorrent login body/cookie interpretation) ·
`release-notes.ts` (`formatReleaseNotes` — flattens a GitHub release body to
plain text for the updater card: headings and bullets survive, inline Markdown,
the generated "by @user in <url>" attribution and the Full Changelog footer do
not. Not a Markdown renderer, and deliberately lookbehind-free — Hermes) ·
`haptics.ts` (global toggle + wrappers) · `tags.ts` (CSV tag parsing) ·
`add-torrent-dialogue.ts` (compact vs full variant, plus `getSearchAddOpensDialogue`
for the Search tab's `+` behavior — #217) ·
`torrent-add-defaults.ts` (`withTorrentAddDefaults` — fills the global
sequential-download / first-last-piece defaults into any `torrents/add` options
object; an explicit value from the caller always wins, so the add dialogue's
switches beat the default. Must be applied at EVERY add call site: the quick-add
modal, the full dialogue, RSS single + bulk, and the Search tab's instant add.
`search/downloadTorrent` takes no options and is the one path it cannot reach) ·
`search-cart.ts`
(`groupCartItemsForAdd` — splits a `SearchCartContext` cart into one
`torrents/add` batch per indexer when auto-tag-by-tracker is on, since that
endpoint applies one `tags` value per request) · `server-export.ts` (strips
`password`/`basicAuthPassword`/`apiKey` on export, forces them empty on import) ·
`apk-asset.ts` (`pickApkAsset` — which APK on a GitHub release this device
should download, now that releases ship one per ABI. Prefers a split matching
`Device.supportedCpuArchitectures` in device preference order, falls back to a
universal APK (what releases up to v4.2.0 attached), and returns null rather
than offering the wrong ABI) ·
`base64.ts` (`bytesToBase64` — Hermes has no Buffer and no reliable btoa, and
expo-file-system writes binary as base64 text) ·
`search-history.ts` (recent search terms: add/remove/parse, deduped
case-insensitively, capped) ·
`completion-watch.ts` (which torrents finished since the last check. The rule
the module exists for: **a torrent seen for the first time is never reported**,
or enabling notifications on a client holding 300 finished torrents fires 300
of them) ·
`preference-migrations.ts` (`migratePreferences` — the schema-versioned
migration chain for the preferences blob; append-only, a throwing step is
skipped rather than taking the store down) ·
`search-dedupe.ts` (`dedupeSearchResults` / `dedupedPrimaries` — collapse the
same release reported by several indexers. qBittorrent concatenates plugin
output without deduplicating, so this is the client's job. Keys on the
normalised name only: plugins reconstruct sizes from scraped text, so two
listings of one release routinely differ by megabytes. Best-seeded listing
wins; behind the `dedupeSearchResults` preference) ·
`save-paths.ts` (`getKnownSavePaths`, derived from live data — no API call) ·
`file-sort.ts` (`sortTorrentFiles` — ordering for the torrent file browser.
Not a flat `.sort()`: the browser injects a folder header the first time it
meets a file under that folder, so every folder's files must stay contiguous.
Rebuilds the tree, sorts each level, flattens depth-first; folders sort by
their aggregate size, ties keep qBittorrent's order. Mode persisted as the
`fileSortMode` preference) ·
`version.ts` (`APP_VERSION`).

### Types, constants, i18n

- `types/api.ts` — every qBittorrent API shape (`TorrentInfo`, `ServerConfig`,
  RSS types, preference fields).
- `types/preferences.ts` — typed preferences + defaults.
- `constants/` — `changelog.ts` (don't edit unless asked; see
  [docs/RELEASING.md](docs/RELEASING.md)),
  `spacing.ts`, `typography.ts`, `shadows.ts`, `buttons.ts`, `serverIcons.ts`
  (`SERVER_ICON_OPTIONS`, `DEFAULT_SERVER_ICON` — the curated Ionicons set for
  a server's badge, #224). **Use these tokens; don't invent ad-hoc spacing.**
- `i18n/index.ts` initializes react-i18next. Each locale is ONE file,
  `locales/{en,es,zh,fr,de,ru}/translation.json`, holding every namespace:
  `common`, `states`, `screens`, `placeholders`, `actions`, `alerts`, `server`,
  `torrentDetail`, `filters`, `sort`, `toast`, `errors`. Keys read like
  `t('actions.pause')`.

---

## 6. Task Recipes

Exact touch-lists for recurring work. Follow them; don't rediscover.

**Add or change a user-facing string**
Add the key to **all six** `locales/*/translation.json` and use it via `t('ns.key')`.
Actually translate — the parity test rejects English copied verbatim into another
locale (for strings ≥16 chars). `npm test` names any file you missed.

**Add a preference**
Typed shape + default in `types/preferences.ts` → read/write through
`storageService` (`services/storage.ts`) → UI in the relevant
`app/(tabs)/settings/*` screen using `SettingRow` + `OptionPicker`/switch → i18n
the label. **Never rename an existing key.**

**Add a qBittorrent API call**
Confirm the endpoint, its exact parameter names and its response shape against
the [5.0 wiki](<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)>)
and, for anything that isn't 5.0-only, the
[4.1 wiki](<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)>)
→ method on the matching `services/api/*.ts` object (follow its neighbors' style)
→ request/response types in `types/api.ts` → if availability or spelling depends
on the server version, add a flag to `ApiFeatures` in `utils/apiVersion.ts` and
branch on it. Remember a misspelled param is dropped silently, not rejected —
see [§1](#1-working-agreement).

**Add a torrent action**
API method (above) → menu item in `hooks/useTorrentActions.ts` → strings in the
`actions` / `toast` namespaces. For a destructive confirm, expose visibility
state from the hook and mount `ConfirmModal` in the screen (see the torrents list
and detail screens).

**Add a settings sub-screen**
Create `app/(tabs)/settings/<name>.tsx` by copying a sibling's structure — the
route registers itself, `_layout.tsx` needs no edit — then link it from
`app/(tabs)/settings/index.tsx`.

**Keep the tab bar on a pushed screen**
Put the screen under `app/(tabs)/(torrents)/` or `app/(tabs)/settings/`. The root
stack means no tab bar, and is for modals and full-screen flows only.

**Add a rendered field to `TorrentCard`**
Update the `React.memo` comparator in the same edit, or the card won't re-render
when that field changes.

**Add a test**
Pick the project by what you're testing, and copy the nearest sibling — they
already carry the right imports and mocks:

- **Pure logic** → `tests/utils/<name>.test.ts` or `tests/services/<name>.test.ts`.
  Plain ts-jest, no React. API wrappers have a shared `tests/services/api-test-helpers.ts`.
- **Component, hook, or context** → `tests/rn/{components,hooks,context}/<Name>.test.tsx`.
  Runs under jest-expo with `@testing-library/react-native`; `tests/rn/setup.ts`
  loads automatically and `tests/rn/components/theme-mock.ts` stands in for
  ThemeContext.

Import app code as `@/…` — both projects map it to the repo root.

---

## 7. Testing

Tests live in `tests/` at the repo root (**not** `__tests__/`), split across two
Jest projects configured in `jest.config.js`:

- **`node`** (ts-jest, node env) — `tests/utils/`, `tests/services/`,
  `tests/locales/`. Pure logic and API wrappers.
- **`rn`** (jest-expo + `@testing-library/react-native`) — `tests/rn/`, with
  `components/`, `context/` and `hooks/` subtrees and a shared
  `tests/rn/setup.ts` / `theme-mock.ts`.

Both map `@/…` to the repo root. `npm test` runs both projects.

### How much to test

**Coverage sits around 90% and must not drop below it.** That's the whole bar —
don't chase a higher number, and don't write tests for their own sake.

In practice: **a substantial piece of new logic ships with a test; a small change
doesn't.** New `utils/` and `services/` modules are the clear yes — they're pure,
fast to test, and that's what the existing `tests/utils` / `tests/services` trees
already cover. A copy tweak, a style fix, or a small branch in existing code is a
clear no.

**Don't run coverage locally.** `jest --coverage` means the full suite plus
instrumentation — expensive, and it tells you what CI already reports. The
`coverage.yml` workflow computes it on every push to `main` and publishes the
README badge. Trust that.

**The locale parity test earns its keep.** `tests/locales/i18n-parity.test.ts`
fails if a locale adds or drops keys relative to `en`, or if a long string (≥16
chars) is byte-identical to the English source — exactly the drift that let the
`torrentDetail` namespace regress to ~170 untranslated keys per locale in v3.5.1.
Genuine coincidental matches (loanwords like "tracker"/"Status"/"OK", literal
URL and path placeholders) live in that test's `COINCIDENTAL_MATCH_ALLOWLIST`.
Extend the allowlist only after checking by hand that the match is intentional
rather than a translation gap.

---

## 8. Critical Rules

1. **Never hardcode a color.** Always `useTheme()` → `colors.*`.
2. **Never rename a key in the `colors` object.** Users' saved overrides are keyed
   by name in AsyncStorage; renaming silently breaks their customizations.
3. **Never rename a preference key without a migration.** `utils/preference-migrations.ts`
   is how: append a migration, never renumber an existing one. Renaming without
   one still orphans the old key on every install.
4. **Color defaults mix formats** (rgb, rgba, hex) and the picker only handles
   6-digit hex. Changing an `rgba(...)` default to `#hex` drops the alpha channel
   and visibly changes the UI.
5. **All user-facing strings go through i18n** — `const { t } = useTranslation()`.
6. **Prefer themed dialogs**: `InputModal` over `Alert.prompt`, `ConfirmModal`
   over `Alert.alert`. Native alerts ignore the app theme. **Don't add a new
   one.** _Known deviations_ — eight existing sites: `settings/advanced`,
   `settings/torrent-defaults` ×2, `search/plugins`, `server/[id]`, `TagsModal`,
   `CategoryModal`, `SuperDebugPanel`. Converting one while you're already in
   that file is welcome, but it's never required.
7. **Delete superseded files in the same change.** When a component is replaced
   by a route-level screen or vice versa, remove the old one rather than leaving
   dead code. Precedent: `components/TorrentDetails.tsx` was deleted once its
   markup moved into `app/(tabs)/(torrents)/torrent/[hash].tsx`.
8. **Don't trust a static bug list** — including this file's. Read the code and
   run the checks before concluding a defect exists.

### Naming conventions

- Components: PascalCase — `TorrentCard.tsx`
- Utilities and hooks: camelCase — `format.ts`, `useTorrentActions.ts`
- Services: kebab-case — `server-manager.ts`, `color-theme-manager.ts`
- `(group)`, `[param]` and `_layout.tsx` are Expo Router syntax, not style
  choices. They can't be renamed.

---

## 9. Environment & Headless Agents

- **Two platforms now.** iOS-specific APIs (`ActionSheetIOS`, `Alert.prompt`, …)
  still appear un-gated in existing code — that is upstream's legacy, not a
  pattern to copy. **New** platform-specific code must be gated on
  `Platform.OS`, and anything that only works on one platform must degrade to a
  visible no-op rather than a control that silently lies (the per-server
  "allow self-signed certificate" toggle is the current example of the latter —
  see docs/ANDROID.md "Known Android gaps").
- **`expo-*` packages are pre-approved**, even ones needing `expo-dev-client`.
  Third-party native modules (e.g. `react-native-ios-context-menu`,
  `lottie-react-native`) need explicit approval first.
- **Don't run the app.** It needs a device, or a simulator via Xcode, which is
  the user's to drive. **Never start the web target** (`npm run web`) either —
  there is no qBittorrent server configured for an agent to talk to, so it
  proves nothing.
- **An Android build is ~40 minutes cold** (`scripts/build-qremote-*.sh`). Run
  one only when the user asks for an APK, never to "check" a JS change — `tsc`
  and `npm test` cover that in seconds.
- **Verify with `npx tsc --noEmit` and `npm test`** instead, batched at commit
  time per [§1](#1-working-agreement). The bar is exit 0, tests passing, lint 0
  errors.
