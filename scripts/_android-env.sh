#!/bin/bash
# Shared setup for the Android build scripts. Source it, then call
# `prepare_android_build`.
#
# Everything in here exists because of a specific way the build fails on a
# fresh machine. Read the comments before deleting any of it.

# Locate the Android SDK and export ANDROID_HOME.
#
# ANDROID_HOME usually lives in an interactive shell profile, which a script
# invoked non-interactively never sources — so the build dies on "SDK location
# not found" seconds in, for a reason that has nothing to do with the code.
resolve_android_sdk() {
    if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME/platform-tools" ]]; then
        return 0
    fi
    local candidate
    for candidate in \
        "${ANDROID_SDK_ROOT:-}" \
        "$HOME/AppData/Local/Android/Sdk" \
        "$LOCALAPPDATA/Android/Sdk" \
        "$HOME/Android/Sdk" \
        "$HOME/Library/Android/sdk" \
        "/mnt/c/Users/$USER/AppData/Local/Android/Sdk"; do
        if [[ -n "$candidate" && -d "$candidate/platform-tools" ]]; then
            export ANDROID_HOME="$candidate"
            return 0
        fi
    done
    echo "ERROR: Android SDK not found. Install it, or export ANDROID_HOME." >&2
    return 1
}

# Convert a path to the Windows form Gradle's JVM understands.
# Git Bash reports /c/Users/... which java.io.File reads as a relative path.
to_native_path() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -m "$1"
    else
        echo "$1"
    fi
}

# Write android/local.properties.
#
# The AGP property parser treats local.properties as a java.util.Properties
# file, where a backslash starts an escape sequence: `sdk.dir=C:\Users\mathi`
# resolves to `C:Usersmathi` and the build fails with the useless "The
# filename, directory name, or volume label syntax is incorrect". Forward
# slashes are accepted verbatim on Windows and sidestep the escaping entirely.
write_local_properties() {
    local repo_root="$1"
    local sdk_native
    sdk_native="$(to_native_path "$ANDROID_HOME")"
    printf 'sdk.dir=%s\n' "$sdk_native" > "$repo_root/android/local.properties"
}

# Extra JVM args for the Gradle daemon.
#
# On Windows, TLS-inspecting security software (Avast/Kaspersky/ESET web
# shields, corporate proxies) re-signs HTTPS traffic with a root CA that is
# installed in the Windows certificate store but NOT in the JDK's own cacerts.
# curl and npm are unaffected; Gradle fails every dependency download with a
# handshake error that surfaces as the deeply misleading "Plugin … was not
# found in any of the following sources". Pointing the JVM at the Windows
# store makes it trust exactly what the rest of the machine already trusts.
gradle_jvm_args() {
    local args="-Xmx4096m -XX:MaxMetaspaceSize=1024m"
    case "$(uname -s)" in
        MINGW* | MSYS* | CYGWIN*)
            args="$args -Djavax.net.ssl.trustStoreType=WINDOWS-ROOT"
            ;;
    esac
    echo "$args"
}

# Regenerate android/ from app.config.js when it is missing or out of date.
#
# android/ is git-ignored and derived: app.config.js is the source of truth for
# the manifest, the package id, permissions and intent filters. Building
# against a stale android/ silently ships yesterday's configuration.
ensure_prebuild() {
    local repo_root="$1"
    local force="${2:-0}"

    if [[ ! -d "$repo_root/node_modules" ]]; then
        echo "==> node_modules missing — running npm install"
        (cd "$repo_root" && npm install)
    fi

    local needs_prebuild=0
    if [[ ! -f "$repo_root/android/app/build.gradle" ]]; then
        needs_prebuild=1
    elif [[ "$repo_root/app.config.js" -nt "$repo_root/android/app/build.gradle" ]]; then
        echo "==> app.config.js is newer than the generated project"
        needs_prebuild=1
    elif [[ -n "$(find "$repo_root/plugins" -newer "$repo_root/android/app/build.gradle" -name '*.js' 2>/dev/null)" ]]; then
        echo "==> a config plugin is newer than the generated project"
        needs_prebuild=1
    elif [[ -n "$(find "$repo_root/modules" -newer "$repo_root/android/app/build.gradle" -name 'expo-module.config.json' 2>/dev/null)" ]]; then
        # Only the file that changes how a local module is *linked*. Editing
        # the Kotlin or Swift inside one is picked up by an ordinary build;
        # adding a platform to expo-module.config.json is not.
        echo "==> a local module's linking config is newer than the generated project"
        needs_prebuild=1
    fi
    [[ "$force" == "1" ]] && needs_prebuild=1

    if [[ $needs_prebuild == 1 ]]; then
        stop_gradle_daemon "$repo_root"
        # Delete android/ ourselves instead of using `prebuild --clean`. On
        # Windows the Gradle daemon holds handles on android/app/build/** for a
        # moment after it exits, and expo's own clean gives up half-way with
        # "EBUSY: resource busy or locked, unlink … classes.dex" — leaving a
        # gutted android/ that the next run has to be told to rebuild anyway.
        # remove_android_dir retries, which is all that was missing.
        remove_android_dir "$repo_root"
        echo "==> expo prebuild -p android"
        (cd "$repo_root" && npx expo prebuild -p android --no-install)
    else
        echo "==> android/ is up to date with app.config.js"
    fi
}

# Ask the Gradle daemon to exit, and wait for it to actually let go.
#
# Invoked as `sh gradlew`, not `./gradlew`: the wrapper is generated by prebuild
# and a Windows checkout leaves it without the executable bit, so a `-x` test
# skips the stop entirely and the EBUSY above comes back.
stop_gradle_daemon() {
    local repo_root="$1"
    [[ -f "$repo_root/android/gradlew" ]] || return 0
    echo "==> Stopping the Gradle daemon"
    (cd "$repo_root/android" && sh ./gradlew --stop >/dev/null 2>&1) || true
}

# rm -rf android/, retrying while Windows releases file handles.
remove_android_dir() {
    local repo_root="$1"
    [[ -d "$repo_root/android" ]] || return 0
    local attempt
    for attempt in 1 2 3 4 5 6; do
        if rm -rf "$repo_root/android" 2>/dev/null && [[ ! -d "$repo_root/android" ]]; then
            return 0
        fi
        sleep 3
    done
    echo "ERROR: could not delete $repo_root/android — something still has it open." >&2
    echo "  Close Android Studio / any gradle process and re-run." >&2
    return 1
}

# Everything above, in the right order.
prepare_android_build() {
    local repo_root="$1"
    local force_prebuild="${2:-0}"
    resolve_android_sdk || return 1
    echo "==> Android SDK: $ANDROID_HOME"
    ensure_prebuild "$repo_root" "$force_prebuild"
    write_local_properties "$repo_root"
}

# Resolve an adb that can actually see the device.
#
# Under WSL, the apt-installed adb runs its own server and never sees a device
# attached to Windows; the Windows binary does. Everywhere else, PATH wins.
resolve_adb() {
    if [[ -n "${ADB:-}" ]]; then
        echo "$ADB"
        return 0
    fi
    local candidate
    if grep -qi microsoft /proc/version 2>/dev/null; then
        for candidate in \
            "/mnt/c/Users/$USER/AppData/Local/Android/Sdk/platform-tools/adb.exe" \
            "$HOME/AppData/Local/Android/Sdk/platform-tools/adb.exe"; do
            [[ -x "$candidate" ]] && echo "$candidate" && return 0
        done
    fi
    if command -v adb >/dev/null 2>&1; then
        echo "adb"
        return 0
    fi
    for candidate in \
        "$ANDROID_HOME/platform-tools/adb.exe" \
        "$ANDROID_HOME/platform-tools/adb"; do
        [[ -x "$candidate" ]] && echo "$candidate" && return 0
    done
    return 1
}

# Install an APK, translating adb's states into an instruction the user can act
# on. `adb devices` distinguishes "no device", "offline" and "unauthorized"
# (plugged in, but nobody tapped "Allow USB debugging") — collapsing all three
# into "install failed" costs a round trip every time.
install_apk() {
    local apk="$1"
    local adb
    if ! adb="$(resolve_adb)"; then
        echo ""
        echo "adb not found. Install manually:"
        echo "    adb install -r \"$(to_native_path "$apk")\""
        return 0
    fi

    "$adb" start-server >/dev/null 2>&1 || true
    local state
    state="$("$adb" devices 2>/dev/null | awk 'NR>1 && NF>=2 {print $2; exit}' | tr -d '\r')"

    case "$state" in
        device)
            echo "==> Installing on connected device"
            if ! "$adb" install -r "$(to_native_path "$apk")"; then
                echo "" >&2
                echo "Install failed. If it complains about signatures, the installed build" >&2
                echo "was signed with a different key — uninstall it first (this erases its data):" >&2
                echo "    adb uninstall <package>" >&2
                return 1
            fi
            ;;
        unauthorized)
            echo "Device is plugged in but unauthorized." >&2
            echo "  Tap 'Allow USB debugging' on the phone, then re-run. APK is ready:" >&2
            echo "  $apk" >&2
            return 1
            ;;
        offline)
            echo "Device is offline. Unplug/replug the cable, then re-run. APK is ready:" >&2
            echo "  $apk" >&2
            return 1
            ;;
        *)
            echo ""
            echo "No device connected. Install manually:"
            echo "    adb install -r \"$(to_native_path "$apk")\""
            ;;
    esac
}
