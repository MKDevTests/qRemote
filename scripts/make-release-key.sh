#!/bin/bash
# Generate a dedicated release keystore for qRemote, then print exactly what to
# do with it.
#
# Usage: ./scripts/make-release-key.sh [path]
#
#   [path]  where to write the keystore. Default: ~/.qremote/qremote-release.jks
#
# Costs nothing and involves no account: an Android signing key is a self-signed
# certificate you generate locally with keytool, which ships with the JDK. There
# is no authority to register with and nothing to renew — the key is only ever
# compared against itself, so that Android can tell "same author as the version
# already installed" from "someone else's APK".
#
# You type the password into keytool's own prompt. This script never sees it,
# never stores it, and never passes it on a command line (where it would land in
# your shell history).
#
# THE FILE THIS PRODUCES IS NOT RECOVERABLE. Lose it, and every existing install
# has to be uninstalled — losing its servers and settings — before it can be
# updated again. Back it up somewhere off this machine before you publish
# anything signed with it.

set -e

# Default location. Under WSL, $HOME is /home/<user> — inside the Linux
# filesystem, where the *Windows* Gradle daemon that actually builds the APK can
# only reach it over a UNC share. Writing the key straight to the Windows
# profile avoids a keystore that exists but the build cannot use.
#
# This matters more than it looks: in PowerShell, `bash` resolves to
# System32's bash.exe, which is the WSL launcher — so running this script as
# `bash ./scripts/make-release-key.sh` from PowerShell lands here rather than in
# Git Bash, and says nothing about it.
DEFAULT_KEYSTORE="$HOME/.qremote/qremote-release.jks"
IN_WSL=0
if grep -qi microsoft /proc/version 2>/dev/null; then
    IN_WSL=1
    WIN_USER_DIR=""
    if command -v wslpath >/dev/null 2>&1; then
        WIN_PROFILE="$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r\n')"
        [[ -n "$WIN_PROFILE" ]] && WIN_USER_DIR="$(wslpath -u "$WIN_PROFILE" 2>/dev/null || true)"
    fi
    if [[ -n "$WIN_USER_DIR" && -d "$WIN_USER_DIR" ]]; then
        DEFAULT_KEYSTORE="$WIN_USER_DIR/.qremote/qremote-release.jks"
        echo "==> WSL detected — writing the key into your Windows profile instead,"
        echo "    so the Windows Gradle build can read it directly:"
        echo "    $DEFAULT_KEYSTORE"
        echo ""
    else
        echo "WARN: running under WSL. \$HOME here is inside the Linux filesystem," >&2
        echo "      which the Windows Gradle build cannot conveniently read. Pass an" >&2
        echo "      explicit path under /mnt/c/Users/<you>/ instead." >&2
        echo "" >&2
    fi
fi

KEYSTORE="${1:-$DEFAULT_KEYSTORE}"
ALIAS="qremote"

command -v keytool >/dev/null 2>&1 || {
    echo "ERROR: keytool not found. It ships with the JDK — make sure a JDK's" >&2
    echo "  bin/ directory is on PATH (JAVA_HOME/bin)." >&2
    exit 1
}

if [[ -f "$KEYSTORE" ]]; then
    echo "ERROR: $KEYSTORE already exists." >&2
    echo "" >&2
    echo "  Refusing to touch it. Overwriting a keystore that has already signed a" >&2
    echo "  published release is unrecoverable: every installed copy of the app" >&2
    echo "  becomes un-updatable." >&2
    echo "" >&2
    echo "  If you are certain it was never used, move it aside first:" >&2
    echo "    mv '$KEYSTORE' '$KEYSTORE.old'" >&2
    exit 1
fi

mkdir -p "$(dirname "$KEYSTORE")"

echo "==> Creating a release key at: $KEYSTORE"
echo "    alias: $ALIAS · RSA 4096 · valid ~27 years"
echo ""
echo "    keytool will ask for a password (twice) and then some identity fields."
echo "    The identity fields are cosmetic — they are never verified by anyone."
echo "    Everything can be left blank except the password."
echo ""

# -validity 10000: ~27 years. A key that expires while the app is still in use
# means no more updates, so the convention is to outlive the project.
# -storetype PKCS12: the modern, non-proprietary format; JKS is legacy and
# keytool warns about it on every use.
keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storetype PKCS12 \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 10000

# The Windows path form, because Gradle's JVM cannot read /c/Users/... or
# /mnt/c/Users/...
KEYSTORE_NATIVE="$KEYSTORE"
if command -v cygpath >/dev/null 2>&1; then
    KEYSTORE_NATIVE="$(cygpath -m "$KEYSTORE")"
elif [[ $IN_WSL == 1 ]] && command -v wslpath >/dev/null 2>&1; then
    KEYSTORE_NATIVE="$(wslpath -m "$KEYSTORE" 2>/dev/null || echo "$KEYSTORE")"
fi

cat <<EOF

==> Key created.

Now tell the build about it. Put these four lines in your **user-level** Gradle
properties file — ~/.gradle/gradle.properties — not in the repo:

    QREMOTE_RELEASE_KEYSTORE=$KEYSTORE_NATIVE
    QREMOTE_RELEASE_KEYSTORE_PASSWORD=<the password you just typed>
    QREMOTE_RELEASE_KEY_ALIAS=$ALIAS
    QREMOTE_RELEASE_KEY_PASSWORD=<the same password>

That file lives outside the repository, so the password can never be committed
by accident. Gradle merges it into every build automatically — nothing else to
configure, and no need to export anything before running the build scripts.

(If you would rather not keep the password on disk at all, export those same
four names as environment variables in the shell where you run a release
instead. The build checks Gradle properties first, then the environment.)

Then verify — the script will name the keystore it picked up:

    ./scripts/build-qremote-release.sh --no-install

==> Two things to do before you publish a release signed with this key:

  1. Copy $KEYSTORE somewhere off this machine.
     A password manager attachment, an encrypted archive, anywhere you would
     keep something you cannot regenerate. There is no recovery path.

  2. Uninstall the current qRemote from your phone first.
     It is signed with the old debug key, and Android refuses an update signed
     by a different one ("App not installed"). Doing it now costs you the
     servers you have configured; doing it after you have real data in there
     costs more.
EOF
