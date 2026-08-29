#!/bin/bash
# Build & install the signed qRemote Android release APK.
#
# Usage: ./scripts/build-qremote-release.sh [--clean] [--prebuild] [--no-install]
#
#     --clean       gradle clean before building
#     --prebuild    force `expo prebuild -p android --clean`
#     --no-install  build only; skip the adb install step
#
# Signing is handled inside the generated build.gradle by the
# withAndroidBuildTweaks config plugin: by default the APK is signed with
# ~/.android/debug.keystore — the same key every time, so a new build installs
# over the previous one as an ordinary update with no data loss. To switch to a
# dedicated release key, export these before running:
#
#     QREMOTE_RELEASE_KEYSTORE           path to the .jks/.keystore
#     QREMOTE_RELEASE_KEYSTORE_PASSWORD
#     QREMOTE_RELEASE_KEY_ALIAS
#     QREMOTE_RELEASE_KEY_PASSWORD
#
# Switching keys is one-way for existing installs: Android will refuse the
# update and the app has to be uninstalled (losing its data) first. Decide
# before you publish a release, not after.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
. "$REPO_ROOT/scripts/_android-env.sh"

CLEAN=0
FORCE_PREBUILD=0
DO_INSTALL=1
for arg in "$@"; do
    case "$arg" in
        --clean) CLEAN=1 ;;
        --prebuild) FORCE_PREBUILD=1 ;;
        --no-install) DO_INSTALL=0 ;;
        *) echo "Unknown arg: $arg" >&2; exit 2 ;;
    esac
done

# Report which key the build will actually use, in the same order Gradle
# resolves it (see plugins/withAndroidBuildTweaks.js). Getting this wrong is
# silent and expensive: an APK signed with an unexpected key installs nowhere.
GRADLE_PROPS="$HOME/.gradle/gradle.properties"
PROP_KEYSTORE=""
if [[ -f "$GRADLE_PROPS" ]]; then
    PROP_KEYSTORE="$(sed -nE 's/^[[:space:]]*QREMOTE_RELEASE_KEYSTORE[[:space:]]*=[[:space:]]*(.*[^[:space:]])[[:space:]]*$//p' "$GRADLE_PROPS" | tail -n 1)"
fi

if [[ -n "${QREMOTE_RELEASE_KEYSTORE:-}" ]]; then
    [[ -f "$QREMOTE_RELEASE_KEYSTORE" ]] || {
        echo "ERROR: QREMOTE_RELEASE_KEYSTORE points at a missing file: $QREMOTE_RELEASE_KEYSTORE" >&2
        exit 1
    }
    echo "==> Signing key: $QREMOTE_RELEASE_KEYSTORE (from env)"
elif [[ -n "$PROP_KEYSTORE" ]]; then
    echo "==> Signing key: $PROP_KEYSTORE (from ~/.gradle/gradle.properties)"
elif [[ -f "$HOME/.android/debug.keystore" ]]; then
    echo "==> Signing key: ~/.android/debug.keystore (stable, seamless updates)"
else
    echo "WARN: no release key configured, and ~/.android/debug.keystore does not exist."
    echo "      For a dedicated key, run: ./scripts/make-release-key.sh"
    echo "      The build will fall back to the keystore inside the generated"
    echo "      android/ tree, which is NOT stable across prebuilds. Create the"
    echo "      standard one once so every future build matches:"
    echo "        keytool -genkeypair -v -keystore ~/.android/debug.keystore \\"
    echo "          -storepass android -keypass android -alias androiddebugkey \\"
    echo "          -keyalg RSA -keysize 2048 -validity 10000 \\"
    echo "          -dname 'CN=Android Debug,O=Android,C=US'"
fi

prepare_android_build "$REPO_ROOT" "$FORCE_PREBUILD"

cd "$REPO_ROOT/android"
JVM_ARGS="$(gradle_jvm_args)"

if [[ $CLEAN == 1 ]]; then
    echo "==> Clean"
    ./gradlew :app:clean -Dorg.gradle.jvmargs="$JVM_ARGS"
fi

echo "==> Building release APK"
./gradlew :app:assembleRelease -Dorg.gradle.jvmargs="$JVM_ARGS"

cd "$REPO_ROOT"
APK="android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "APK not found at $APK" >&2; exit 1; }

# A release APK that is debuggable, or carries the wrong version, is worse than
# a failed build: it looks shippable. Check before anyone can publish it.
verify_release_apk() {
    local apk="$1"
    local expected_version
    # to_native_path: node here is the Windows binary and cannot resolve the
    # /c/Users/... form Git Bash reports for $REPO_ROOT.
    expected_version="$(node -p "require('$(to_native_path "$REPO_ROOT")/package.json').version")"

    local aapt2
    aapt2="$(ls -1 "$ANDROID_HOME/build-tools"/*/aapt2 "$ANDROID_HOME/build-tools"/*/aapt2.exe 2>/dev/null | sort -V | tail -n 1)"
    if [[ -z "$aapt2" ]]; then
        echo "    WARN: aapt2 not found — skipping the versionName/debuggable check." >&2
        return 0
    fi

    local badging
    badging="$("$aapt2" dump badging "$(to_native_path "$apk")" 2>/dev/null)" || {
        echo "    WARN: 'aapt2 dump badging' failed — skipping the check." >&2
        return 0
    }

    local name code
    name="$(echo "$badging" | sed -nE "s/.*versionName='([^']+)'.*/\1/p" | head -n 1)"
    code="$(echo "$badging" | sed -nE "s/.*versionCode='([0-9]+)'.*/\1/p" | head -n 1)"

    if [[ "$name" != "$expected_version" ]]; then
        echo "ERROR: APK versionName='$name' but package.json says '$expected_version'." >&2
        echo "  Almost always a stale APK from an earlier build. Re-run with --clean." >&2
        return 1
    fi
    if echo "$badging" | grep -q "application-debuggable"; then
        echo "ERROR: the release APK is DEBUGGABLE — refusing to treat it as shippable." >&2
        return 1
    fi
    echo "    Verified: versionName=$name versionCode=$code (not debuggable)"
}

verify_release_apk "$APK"

echo "==> APK ready: $APK ($(du -h "$APK" | cut -f1))"

if [[ $DO_INSTALL == 1 ]]; then
    install_apk "$REPO_ROOT/$APK"
    echo ""
    echo "==> Launch with:"
    echo "    adb shell monkey -p io.github.mkdevtests.qremote -c android.intent.category.LAUNCHER 1"
fi
