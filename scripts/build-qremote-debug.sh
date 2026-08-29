#!/bin/bash
# Build & install the qRemote Android debug APK from the current branch.
#
# Usage: ./scripts/build-qremote-debug.sh [--clean] [--prebuild]
#
#     --clean     gradle clean before building
#     --prebuild  force `expo prebuild -p android --clean` even when android/
#                 already looks current
#
# Run from anywhere; the script finds the repo root itself. Requires Node, a
# JDK 17+, and the Android SDK (auto-detected, or export ANDROID_HOME).
#
# The debug build installs as io.github.mkdevtests.qremote.debug — a different
# package from the release build, so the two live side by side and a debug
# install never wipes the servers you actually use.
#
# Refuses to build from `main`: feature work belongs on a branch. Ship main
# with scripts/build-qremote-release.sh.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
. "$REPO_ROOT/scripts/_android-env.sh"

CLEAN=0
FORCE_PREBUILD=0
for arg in "$@"; do
    case "$arg" in
        --clean) CLEAN=1 ;;
        --prebuild) FORCE_PREBUILD=1 ;;
        *) echo "Unknown arg: $arg" >&2; exit 2 ;;
    esac
done

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
case "$CURRENT_BRANCH" in
    main)
        echo "ERROR: refusing to build from 'main'." >&2
        echo "  Debug builds come from a feature branch. Either:" >&2
        echo "    - check out a feature branch, or" >&2
        echo "    - use scripts/build-qremote-release.sh to ship main." >&2
        exit 1
        ;;
    "")
        echo "WARN: could not detect the current branch (detached HEAD?). Continuing."
        ;;
    *)
        echo "==> Building from branch: $CURRENT_BRANCH"
        ;;
esac

prepare_android_build "$REPO_ROOT" "$FORCE_PREBUILD"

cd "$REPO_ROOT/android"
JVM_ARGS="$(gradle_jvm_args)"

if [[ $CLEAN == 1 ]]; then
    echo "==> Clean"
    ./gradlew :app:clean -Dorg.gradle.jvmargs="$JVM_ARGS"
fi

echo "==> Building debug APK"
./gradlew :app:assembleDebug -Dorg.gradle.jvmargs="$JVM_ARGS"

cd "$REPO_ROOT"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
[[ -f "$APK" ]] || { echo "APK not found at $APK" >&2; exit 1; }

echo "==> APK ready: $APK ($(du -h "$APK" | cut -f1))"

install_apk "$REPO_ROOT/$APK"

echo ""
echo "==> Launch with:"
echo "    adb shell monkey -p io.github.mkdevtests.qremote.debug -c android.intent.category.LAUNCHER 1"
