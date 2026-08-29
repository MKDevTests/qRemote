const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * withMagnetCollector — wire up the magnet basket's silent collect mode.
 *
 * The feature needs exactly one of two components to own the `magnet:` scheme
 * at a time, switchable at runtime (MagnetCollectorModule.setCollectModeEnabled):
 *
 *   collect mode OFF -> MagnetLauncherAlias  (opens the app, normal behaviour)
 *   collect mode ON  -> MagnetCollectActivity (invisible, queues, finishes)
 *
 * ## Why an activity-alias instead of MainActivity's own filter
 *
 * An intent filter cannot be enabled or disabled by itself — `enabled` is an
 * attribute of the component, not the filter. Disabling MainActivity would take
 * the launcher icon down with it. An alias is a separately toggleable component
 * that still resolves to MainActivity, which is exactly the missing piece.
 *
 * ## Why the magnet <data> is surgically extracted
 *
 * Expo merges every scheme sharing an intent-filter shape into ONE filter, so
 * the generated manifest carries `magnet` and the dev-client's `exp+qremote`
 * side by side. Moving that filter wholesale to the alias would mean turning on
 * collect mode also stops `exp+qremote` links from opening the app. So this
 * removes only the magnet `<data>` element and leaves the rest of the filter
 * on MainActivity untouched.
 */

const ALIAS_NAME = '.MagnetLauncherAlias';
const COLLECT_ACTIVITY = 'io.github.mkdevtests.magnetcollector.MagnetCollectActivity';

const magnetFilter = () => ({
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [
    { $: { 'android:name': 'android.intent.category.DEFAULT' } },
    { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
  ],
  data: [{ $: { 'android:scheme': 'magnet' } }],
});

/**
 * Strip the magnet scheme off MainActivity, keeping every other scheme.
 *
 * Takes the whole AndroidManifest, not the <application> node:
 * getMainActivityOrThrow walks down from `manifest.application` itself, and
 * handing it the application node instead fails prebuild with the misleading
 * "AndroidManifest.xml is missing the required MainActivity element".
 */
function removeMagnetFromMainActivity(androidManifest) {
  const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  const filters = mainActivity['intent-filter'] ?? [];
  let removed = false;

  for (let i = filters.length - 1; i >= 0; i -= 1) {
    const data = filters[i].data;
    if (!Array.isArray(data)) continue;
    const kept = data.filter((entry) => entry?.$?.['android:scheme'] !== 'magnet');
    if (kept.length === data.length) continue;

    removed = true;
    if (kept.length === 0) {
      // The filter existed only for magnet — drop it whole rather than leave
      // a VIEW/BROWSABLE filter with no data, which matches nothing and shows
      // up in manifest audits as a mistake.
      filters.splice(i, 1);
    } else {
      filters[i].data = kept;
    }
  }

  if (!removed) {
    throw new Error(
      'withMagnetCollector: no magnet scheme found on MainActivity. The magnet ' +
        'intentFilter in app.config.js is what this plugin moves — if it was ' +
        'removed or renamed, this plugin has nothing to do and the manifest ' +
        'would silently end up with no magnet handler at all.',
    );
  }
  mainActivity['intent-filter'] = filters;
}

module.exports = function withMagnetCollector(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    // Idempotent: prebuild runs this against a freshly generated manifest, but
    // a re-run over an already-patched one must not duplicate the components.
    const aliases = application['activity-alias'] ?? [];
    if (aliases.some((a) => a.$?.['android:name'] === ALIAS_NAME)) return cfg;

    removeMagnetFromMainActivity(cfg.modResults);

    application['activity-alias'] = [
      ...aliases,
      {
        $: {
          'android:name': ALIAS_NAME,
          'android:targetActivity': '.MainActivity',
          // Enabled by default: a fresh install behaves exactly as before,
          // with magnets opening the add-torrent screen.
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [magnetFilter()],
      },
    ];

    application.activity = [
      ...(application.activity ?? []),
      {
        $: {
          'android:name': COLLECT_ACTIVITY,
          // Theme.NoDisplay is the obvious choice and the wrong one: it throws
          // IllegalStateException on Android 8+ if the activity is resumed
          // before finishing. Translucent draws nothing and cannot crash.
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
          'android:enabled': 'false',
          'android:exported': 'true',
          // Keep it out of the recents list and off the back stack: it is a
          // side effect, not a place the user can navigate back to.
          'android:excludeFromRecents': 'true',
          'android:noHistory': 'true',
          // Its own task, so capturing a magnet never touches the state of the
          // real app task sitting in the background.
          'android:taskAffinity': '',
        },
        'intent-filter': [magnetFilter()],
      },
    ];

    return cfg;
  });
};
