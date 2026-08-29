const packageJson = require('./package.json');

// Android's versionCode is a single integer and must increase on every build
// users can update to. Deriving it from the semver in package.json keeps it a
// pure function of the version — there is no second counter to forget to bump.
// Layout: MAJOR * 10000 + MINOR * 100 + PATCH, so 3.8.40 -> 30840. Room for 99
// patches and 99 minors per major, and monotonic as long as semver is.
const [MAJOR, MINOR, PATCH] = packageJson.version.split('.').map((part) => parseInt(part, 10) || 0);
const ANDROID_VERSION_CODE = MAJOR * 10000 + MINOR * 100 + PATCH;

module.exports = {
  expo: {
    name: 'qRemote',
    slug: 'qremote',
    version: packageJson.version, // Single source of truth: package.json
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'qremote',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0A0A0A',
    },
    // NOTE: ios/ is generated, not committed (untracked since #154). `npm run
    // xcode` runs `expo prebuild -p ios`, which APPLIES the `ios.infoPlist`
    // block below to the generated project — this is the authoritative place
    // for native Info.plist configuration (see AGENTS.md "iOS Native
    // Workflow"). Hand-edits made directly under ios/ are machine-local and
    // can be rewritten by the next prebuild.
    ios: {
      supportsTablet: true,
      // Constant since the EAS pipeline was removed: the dev-client/production
      // split came from eas.json's "development" profile setting APP_VARIANT,
      // and that file is gone (this fork has no Apple or EAS credentials).
      // A non-EAS build already resolved to this identifier.
      bundleIdentifier: 'com.qRemote.app',
      appStoreUrl: 'https://apps.apple.com/us/app/qremote-for-qbittorrent/id6756276747',
      infoPlist: {
        // Must be false: RN's StatusBar API (expo-status-bar / FocusAwareStatusBar)
        // is a no-op when iOS uses view-controller-based status bar appearance,
        // leaving the bar stuck on the system appearance (white icons in light mode).
        UIViewControllerBasedStatusBarAppearance: false,
        ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
        CFBundleURLTypes: [
          {
            CFBundleURLName: 'com.qRemote.app.magnet',
            CFBundleURLSchemes: ['magnet'],
          },
        ],
        // Required (true, not just present — ITMS-90737 only requires the key
        // exist, but `false` demotes the app to a Share-Sheet-only receiver,
        // dropping it from Files' direct "Open In" / tap-to-open listing).
        // `true` means iOS hands the app a security-scoped reference to the
        // file at its original location instead of a sandboxed copy; reading
        // that from JS is a race the async Linking bridge usually loses (the
        // scope can lapse before app/_layout.tsx's handler runs) — see the
        // withNativeTorrentFileCopy plugin below, which copies the file
        // natively inside the native open-URL callback (while the scope is
        // still guaranteed valid) so JS only ever sees a plain, already-owned
        // copy.
        LSSupportsOpeningDocumentsInPlace: true,
        // Register as an "Open In" handler for .torrent files (issues #88, #125).
        // LSHandlerRank must be Owner (paired with the EXPORTED declaration
        // below) for Files' tap-to-open and "Always Open With" to list the
        // app — as a mere Alternate viewer of an unowned type, iOS fell back
        // to QuickLook Preview and showed "No Apps Available" (#125).
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: 'BitTorrent Document',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Owner',
            LSItemContentTypes: ['org.bittorrent.torrent', 'com.bittorrent.torrent'],
          },
        ],
        // EXPORTED, not imported (#125): "imported" tells iOS another app
        // owns this type definition — but no installed app exports a torrent
        // UTI, so the type was effectively unowned and Files offered no
        // open-with handlers. Exporting makes qRemote the canonical definer.
        // Conformance to public.content (alongside public.data) is also
        // required for Files' open-with eligibility — public.data alone only
        // gets the type into the share sheet.
        UTExportedTypeDeclarations: [
          {
            UTTypeIdentifier: 'org.bittorrent.torrent',
            UTTypeConformsTo: ['public.data', 'public.content'],
            UTTypeDescription: 'BitTorrent Document',
            UTTypeTagSpecification: {
              'public.filename-extension': ['torrent'],
              'public.mime-type': ['application/x-bittorrent'],
            },
          },
        ],
      },
    },
    android: {
      package: 'io.github.mkdevtests.qremote',
      versionCode: ANDROID_VERSION_CODE,
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#0A0A0A',
      },
      // NOTE: cleartext HTTP and user-installed CAs are enabled by
      // ./plugins/withAndroidNetworkSecurity, NOT here. `usesCleartextTraffic`
      // is not a key in the Expo android config schema — setting it here is
      // accepted in silence and produces a manifest without it, which is how
      // this shipped once already with every HTTP server unreachable.
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        // Haptics (utils/haptics.ts) — no-op without it.
        'android.permission.VIBRATE',
        // In-app updater (services/updater.ts) installs the downloaded APK
        // through PackageInstaller; without this the install intent is
        // rejected before the system dialog ever appears.
        'android.permission.REQUEST_INSTALL_PACKAGES',
      ],
      // Pulled in transitively and never used by this app: expo-dev-client
      // adds SYSTEM_ALERT_WINDOW for its debug overlay, and
      // expo-file-system / expo-document-picker add the legacy storage pair
      // (already capped at maxSdkVersion 32). Leaving them in makes the
      // release APK ask for scary permissions it never exercises.
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      intentFilters: [
        // magnet: links from a browser or any other app.
        {
          action: 'VIEW',
          category: ['DEFAULT', 'BROWSABLE'],
          data: [{ scheme: 'magnet' }],
        },
        // .torrent files opened from a file manager / downloads / share
        // sheet. Android routes these three ways depending on the source
        // app, and covering only one leaves the app missing from "Open with"
        // for the other two:
        //   1. correct MIME type on a content:// or file:// URI
        //   2. wrong/absent MIME type but a .torrent path (very common —
        //      file managers frequently hand over application/octet-stream)
        //   3. an explicit SEND share
        {
          action: 'VIEW',
          category: ['DEFAULT', 'BROWSABLE'],
          data: [
            { scheme: 'content', mimeType: 'application/x-bittorrent' },
            { scheme: 'file', mimeType: 'application/x-bittorrent' },
          ],
        },
        {
          action: 'VIEW',
          category: ['DEFAULT', 'BROWSABLE'],
          data: [
            { scheme: 'file', host: '*', pathPattern: '.*\\.torrent' },
            { scheme: 'content', host: '*', pathPattern: '.*\\.torrent' },
          ],
        },
        {
          action: 'SEND',
          category: ['DEFAULT'],
          data: [{ mimeType: 'application/x-bittorrent' }],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-localization',
      'expo-secure-store',
      'expo-sharing',
      'expo-status-bar',
      // iOS-only mod (withAppDelegate); prebuild skips it for -p android.
      './plugins/withNativeTorrentFileCopy',
      // Android-only mods (withAppBuildGradle / withAndroidManifest); prebuild
      // skips them for -p ios.
      './plugins/withAndroidBuildTweaks',
      './plugins/withAndroidNetworkSecurity',
    ],
    extra: {
      router: {},
      // Where the in-app updater looks for new Android builds. Changing the
      // fork owner means changing this and nothing else.
      githubRepo: 'MKDevTests/qRemote',
    },
    // NOTE: no `updates` / `extra.eas` / `runtimeVersion` block, and
    // expo-updates is not a dependency. Upstream ships EAS OTA updates pointed
    // at taylorcox75's Expo project — a fork that kept that URL would silently
    // pull someone else's JS bundle over its own. Updates go through GitHub
    // releases instead (see services/updater.ts), so the whole OTA runtime is
    // dead weight in the APK. `runtimeVersion` only means anything to
    // expo-updates, so it went with it.
  },
};
