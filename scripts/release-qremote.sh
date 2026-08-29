#!/bin/bash
# Cut a qRemote release and publish it on github.com/MKDevTests/qRemote so the
# in-app updater (services/updater.ts) can pick it up.
#
# Steps, in order:
#   1. Bump "version" in package.json — the single source of truth. app.config.js
#      derives both versionName and the Android versionCode from it, so there is
#      no second number to keep in sync.
#   2. Build a signed release APK (delegates to build-qremote-release.sh).
#   3. Verify the APK really carries the version we just wrote.
#   4. Commit the bump on main, tag it v<version>, push branch + tag.
#   5. Create the GitHub release with the APK attached.
#
# Any failure before the push rolls the version bump back and deletes the local
# tag, so the tree is clean for a retry.
#
# Usage:
#   ./scripts/release-qremote.sh <version> [notes-or-path] [--dry-run]
#
#     <version>        major.minor.patch, e.g. 3.9.0 (a leading 'v' is stripped)
#     [notes-or-path]  a release-notes file, or the notes text itself. Omitted,
#                      gh opens $EDITOR.
#     --dry-run        do everything up to (not including) the commit, then stop
#
# Requirements: clean tree on main, gh authenticated, the Android toolchain that
# build-qremote-release.sh already needs.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
. "$REPO_ROOT/scripts/_android-env.sh"

REPO_SLUG="MKDevTests/qRemote"

# ----- args -----
VERSION=""
NOTES_ARG=""
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        *)
            if [[ -z "$VERSION" ]]; then VERSION="$arg"
            elif [[ -z "$NOTES_ARG" ]]; then NOTES_ARG="$arg"
            else echo "Unexpected extra argument: $arg" >&2; exit 2
            fi
            ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version> [notes-or-path] [--dry-run]" >&2
    echo "  Example: $0 3.9.0 \"Android port: magnet + .torrent intents\"" >&2
    exit 2
fi

VERSION="${VERSION#v}"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: '$VERSION' is not major.minor.patch (e.g. 3.9.0)." >&2
    exit 2
fi

TAG="v$VERSION"
IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"
VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))

# ----- preconditions -----
# All of them before touching a single file: a half-applied release is much
# more annoying to unwind than a refused one.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "ERROR: must be on 'main' (currently on '$CURRENT_BRANCH')." >&2
    exit 1
fi

# --ignore-cr-at-eol: a Windows checkout of a repo with LF in the index reports
# every text file as modified otherwise, and blocks every release.
if ! git diff --quiet --ignore-cr-at-eol || ! git diff --cached --quiet --ignore-cr-at-eol; then
    echo "ERROR: working tree has uncommitted changes. Commit or stash first." >&2
    git status --short >&2
    exit 1
fi

command -v gh >/dev/null 2>&1 || {
    echo "ERROR: GitHub CLI (gh) not found. https://cli.github.com/" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || {
    echo "ERROR: gh is not authenticated. Run 'gh auth login'." >&2; exit 1; }

if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "ERROR: tag '$TAG' already exists locally. Pick another version, or:" >&2
    echo "  git tag -d $TAG" >&2
    exit 1
fi
if git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null | grep -q "$TAG"; then
    echo "ERROR: tag '$TAG' already exists on origin ($REPO_SLUG)." >&2
    exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
if [[ "$CURRENT_VERSION" == "$VERSION" ]]; then
    echo "ERROR: package.json is already at $VERSION. Nothing to bump." >&2
    exit 1
fi

echo "==> Releasing $CURRENT_VERSION -> $VERSION (versionCode $VERSION_CODE)"

# ----- rollback -----
rollback() {
    echo "==> ${1:-Aborting} — rolling back the version bump" >&2
    git checkout -- package.json 2>/dev/null || true
    git tag -d "$TAG" 2>/dev/null || true
}
trap 'rollback "Script failed"' ERR

# ----- bump -----
node -e "
const fs = require('fs');
const p = './package.json';
const raw = fs.readFileSync(p, 'utf8');
const pkg = JSON.parse(raw);
pkg.version = '$VERSION';
// Preserve the file's trailing newline; npm writes one and a diff that only
// removes it is pure noise in the release commit.
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
"
echo "    package.json -> version $VERSION"

# ----- build -----
# The build script's ERR is not our ERR: run it with the trap disarmed so a
# non-fatal hiccup inside it can't kick off a rollback while this script keeps
# going and then publishes a stale APK.
echo "==> Building the signed release APK"
trap - ERR
set +e
./scripts/build-qremote-release.sh --clean --no-install
BUILD_RC=$?
set -e
trap 'rollback "Script failed"' ERR

# One APK per ABI since v4.2.1 (plugins/withAndroidBuildTweaks.js): all of them
# are attached to the release, and services/updater.ts picks the right one on
# the device from Device.supportedCpuArchitectures.
BUILT_APKS=()
while IFS= read -r line; do BUILT_APKS+=("$line"); done < <(
    ls -1 android/app/build/outputs/apk/release/*-release.apk 2>/dev/null
)
if (( ${#BUILT_APKS[@]} < 2 )); then
    echo "ERROR: expected one signed APK per ABI, found ${#BUILT_APKS[@]} (build exit=$BUILD_RC)" >&2
    exit 1
fi

# build-qremote-release.sh already checks versionName and debuggability, but it
# checks them against package.json — which this script just wrote. Re-checking
# here against $VERSION directly is the belt to that braces: it catches the case
# where the build silently reused an earlier APK.
RELEASE_APKS=()
for built in "${BUILT_APKS[@]}"; do
    abi="$(basename "$built" | sed -nE 's/^app-(.+)-release\.apk$/\1/p')"
    if [[ -z "$abi" ]]; then
        echo "ERROR: no ABI in $(basename "$built") — is the abi split still configured?" >&2
        exit 1
    fi
    named="android/app/build/outputs/apk/release/qremote-$VERSION-$abi.apk"
    cp "$built" "$named"
    RELEASE_APKS+=("$named")
    echo "==> Release APK: $named ($(du -h "$named" | cut -f1))"
done

if [[ $DRY_RUN == 1 ]]; then
    echo ""
    echo "==> --dry-run: stopping before the commit."
    echo "    The version bump is still in your working tree; 'git checkout -- package.json' to undo."
    trap - ERR
    exit 0
fi

# ----- commit + tag + push -----
echo "==> Committing and tagging $TAG"
git add package.json
git commit -m "chore(release): $TAG"
git tag -a "$TAG" -m "qRemote $TAG"

echo "==> Pushing main and $TAG"
git push origin main
git push origin "$TAG"

# Past the point of clean recovery: the tag is public now. Anything that fails
# from here on is fixed forward, by hand.
trap - ERR

# ----- GitHub release -----
echo "==> Creating the GitHub release on $REPO_SLUG"
# to_native_path takes one path at a time, so the APKs go in one by one
# rather than through a single expansion.
GH_ARGS=(release create "$TAG")
for apk in "${RELEASE_APKS[@]}"; do
    GH_ARGS+=("$(to_native_path "$(realpath "$apk")")")
done
GH_ARGS+=(--repo "$REPO_SLUG" --title "qRemote $TAG")
if [[ -n "$NOTES_ARG" ]]; then
    if [[ -f "$NOTES_ARG" ]]; then
        GH_ARGS+=(--notes-file "$(to_native_path "$(realpath "$NOTES_ARG")")")
    else
        GH_ARGS+=(--notes "$NOTES_ARG")
    fi
fi

# Not left to `set -e`: a silent failure here leaves a tag on GitHub with no
# release under it, and the app is then right to report no update available.
if ! gh "${GH_ARGS[@]}"; then
    echo "" >&2
    APKS=""
    for apk in "${RELEASE_APKS[@]}"; do
        APKS="$APKS '$(to_native_path "$(realpath "$apk")")'"
    done
    echo "ERROR: the release was not created, but $TAG is already pushed." >&2
    echo "  Nothing is lost — retry just the last step:" >&2
    echo "    gh release create $TAG $APKS \\" >&2
    echo "      --repo $REPO_SLUG --title 'qRemote $TAG'" >&2
    exit 1
fi

echo ""
echo "==> Released $TAG"
echo "    APK: $RELEASE_APK"
echo "    URL: https://github.com/$REPO_SLUG/releases/tag/$TAG"
echo ""
echo "Devices on an earlier build will offer this one the next time they check"
echo "for updates (Settings -> About -> Check for updates, or on launch)."
