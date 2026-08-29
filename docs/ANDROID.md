# Android

Upstream qRemote is iOS-only. This fork adds an Android target alongside it —
same JS, same screens, same qBittorrent API layer — plus a release channel that
does not go through a store.

Nothing here changes the iOS build. `npm run xcode` still works exactly as
documented in [AGENTS.md](../AGENTS.md).

---

## TL;DR

```bash
./scripts/build-qremote-release.sh
```

Builds a signed APK, verifies it, and installs it on a connected device. The
APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

---

## What the Android target is made of

| Piece | Where | Why |
|---|---|---|
| Package id, permissions, intent filters, `versionCode` | `app.config.js` → `android` block | `android/` is generated and git-ignored; this is the only source of truth |
| `.debug` id suffix, stable release signing, ARM-only ABIs | `plugins/withAndroidBuildTweaks.js` | Three things `app.config.js` has no field for — see below |
| Build / install scripts | `scripts/build-qremote-{debug,release}.sh` | Wrap prebuild + gradle + adb, and the Windows-specific traps |
| Release + publish | `scripts/release-qremote.sh` | Version bump → build → tag → GitHub release |
| In-app updates | `services/updater.ts`, `components/UpdateSection.tsx` | Reads GitHub releases, downloads the APK, hands it to the system installer |

`android/` is **generated**, exactly like `ios/`. Never hand-edit anything under
it: the next `expo prebuild` silently discards the change. Everything that must
survive belongs in `app.config.js` or a config plugin.

---

## Requirements

- Node 20+ and the repo's `npm install`
- JDK 17 or newer (JDK 21 is what this was built and tested with)
- Android SDK — the scripts auto-detect it, or export `ANDROID_HOME`
- `adb` on PATH for the install step (optional; the scripts print the manual
  command when it is missing)

---

## Building

### Debug

```bash
./scripts/build-qremote-debug.sh
```

- Refuses to run on `main` — debug builds come from a feature branch.
- Installs as **`io.github.mkdevtests.qremote.debug`**, a different package from
  the release build, so the two coexist and a debug install never touches the
  servers and settings of the one you actually use.
- `--clean` for a gradle clean, `--prebuild` to force-regenerate `android/`.

### Release

```bash
./scripts/build-qremote-release.sh
```

- Installs as **`io.github.mkdevtests.qremote`**.
- Verifies the built APK's `versionName` against `package.json` and refuses to
  hand you a debuggable release — the two ways a build can look shippable and
  not be.
- `--no-install` to build only.

The scripts re-run `expo prebuild -p android` automatically whenever
`app.config.js` or a file in `plugins/` is newer than the generated project, so
a config change can never be silently left out of a build.

---

## APK size and ABIs

The New Architecture ships compiled C++, and a universal APK carries it for all
four Android ABIs — **107 MB**. The plugin narrows `reactNativeArchitectures` in
`android/gradle.properties` to `arm64-v8a,armeabi-v7a`, which brings it to
**64 MB**. Both ARM ABIs are kept so older 32-bit devices still install; the two
dropped ones are x86 and x86_64, which only emulators use.

It has to be that property rather than `defaultConfig.ndk.abiFilters`. The React
Native Gradle plugin derives its own `abiFilters` from
`reactNativeArchitectures` and applies them later in the configuration phase, so
a hand-written `abiFilters` block is silently overwritten — the build succeeds
and still ships all four ABIs, which is exactly how this was first got wrong
here.

A command-line `-P` beats `gradle.properties`, so building for an emulator is
still one flag:

```bash
cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64
```

---

## Signing

By default the release APK is signed with **`~/.android/debug.keystore`** — the
standard Android debug key, the same one every time on a given machine. That is
what makes an update install over the previous build instead of being rejected.

It is deliberately *not* the `debug.keystore` that ships inside the generated
`android/app/` tree: that file is re-materialised by every prebuild, and if it
ever differs between two of them, every existing install becomes un-updatable
with no fix short of uninstalling and losing the data.

If you have never run an Android build on this machine, create the standard
keystore once:

```bash
keytool -genkeypair -v -keystore ~/.android/debug.keystore -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
```

### Moving to a dedicated release key

```bash
./scripts/make-release-key.sh
```

An Android signing key costs nothing and involves no account: it is a
self-signed certificate you generate locally with `keytool`, which ships with
the JDK. There is no authority to register with and nothing to renew — Android
only ever compares the key against itself, to tell "same author as the version
already installed" from "someone else's APK". Google Play requires an *account*
to distribute, not to sign; none of that applies here.

The script writes the keystore to `~/.qremote/qremote-release.jks` (outside the
repo), asks for the password through `keytool`'s own prompt, and then prints the
four lines to add to **`~/.gradle/gradle.properties`**:

```properties
QREMOTE_RELEASE_KEYSTORE=C:/Users/you/.qremote/qremote-release.jks
QREMOTE_RELEASE_KEYSTORE_PASSWORD=…
QREMOTE_RELEASE_KEY_ALIAS=qremote
QREMOTE_RELEASE_KEY_PASSWORD=…
```

That file is user-level, outside the repository, and Gradle merges it into every
build — so the password can never be committed by accident and nothing needs
exporting before a build. The same four names also work as environment
variables, if you would rather not keep the password on disk; the build checks
Gradle properties first, then the environment.

`build-qremote-release.sh` prints which keystore it resolved, so you can confirm
the switch took effect before publishing.

> **On Windows, mind which `bash` you used.** In PowerShell, `bash` resolves to
> `System32ash.exe` — the WSL launcher, not Git Bash. `$HOME` there is
> `/home/<user>` inside the Linux filesystem, so the key lands somewhere the
> Windows Gradle daemon can only reach over a UNC share. The script detects WSL
> and writes to the Windows profile instead, but if you generated a key before
> that guard existed, copy it across and point `QREMOTE_RELEASE_KEYSTORE` at the
> Windows path.

**Two things this changes, permanently:**

- **Decide before you publish anything.** Changing the signing key later is
  one-way for everyone who already installed: Android refuses the update
  ("App not installed"), and the app has to be uninstalled — taking its servers
  and settings with it. Switching now means uninstalling your own copy once.
- **Back the keystore up off this machine.** Losing it has exactly the same
  consequence as changing it, with no way to undo. A password-manager
  attachment or an encrypted archive is enough.

### Why the debug key is not a long-term answer

The default (`~/.android/debug.keystore`) uses the alias `androiddebugkey` and
the password `android` — the same, publicly documented values on every Android
machine in the world. Anyone can produce an APK that your phone will accept as a
qRemote update. For a private build installed only from your own GitHub
releases that is a small risk; it stops being small the moment other people
install it from anywhere else.

---

## Cutting a release

```bash
./scripts/release-qremote.sh 3.9.0 "Android port: magnet and .torrent intents"
```

From a clean `main`, it will:

1. bump `version` in `package.json` — the single source of truth, from which
   `app.config.js` derives both the `versionName` and the integer
   `versionCode` (`MAJOR*10000 + MINOR*100 + PATCH`, so `3.9.0` → `30900`)
2. build and verify the signed APK
3. commit, tag `v3.9.0`, push both
4. create the GitHub release with `qremote-3.9.0.apk` attached

Add `--dry-run` to do everything up to (not including) the commit. Any failure
before the push rolls the version bump back and deletes the local tag.

Devices running an earlier build pick the release up from **Settings → About →
Updates**.

---

## In-app updates

`services/updater.ts` reads `GET /repos/{owner}/{repo}/releases/latest`, compares
the tag against the running version, downloads the attached `.apk` into the app
cache, and fires `ACTION_INSTALL_PACKAGE` through a FileProvider content URI.

The repository it looks at is `extra.githubRepo` in `app.config.js` — the only
thing to change when forking this fork.

Android then shows its own install prompt, plus a one-time "allow installs from
this app" flow. Nothing installs silently, and the `REQUEST_INSTALL_PACKAGES`
permission is what makes the prompt appear at all rather than the intent being
dropped.

On iOS every entry point returns early and `UpdateSection` renders nothing.

---

## Windows notes

Both traps below are handled by `scripts/_android-env.sh`; they are documented
here because the errors they produce point nowhere near their cause.

**TLS interception breaks Gradle, and only Gradle.** Avast/Kaspersky/ESET web
shields and corporate proxies re-sign HTTPS with a root CA that lives in the
Windows certificate store but not in the JDK's `cacerts`. `curl` and `npm` are
fine; Gradle fails every download with a handshake error that surfaces as:

```
Plugin [id: 'org.gradle.toolchains.foojay-resolver-convention'] was not found in any of the following sources
```

The fix is `-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT`, which the scripts pass
automatically on Windows.

**`local.properties` is a Java properties file.** A backslash starts an escape
sequence there, so `sdk.dir=C:\Users\mathi\…` parses as `C:Usersmathi…` and AGP
reports:

```
La syntaxe du nom de fichier, de répertoire ou de volume est incorrecte
```

The scripts always write forward slashes.

---

## Known Android gaps

- **Self-signed certificates.** The per-server "Allow Self-Signed Certificate"
  toggle is backed by `modules/insecure-cert-allowlist`, which is an iOS-only
  native module (`platforms: ["ios"]`). On Android the JS call is a no-op, so
  the toggle currently does nothing. Use a proper certificate, or plain HTTP on
  the LAN, until an Android side is written for it.
- **Haptics** are enabled on Android but map onto the vibrator rather than the
  Taptic Engine, so they feel coarser than on iOS. `Settings → Advanced` turns
  them off.
