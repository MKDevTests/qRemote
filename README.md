# qRemote [![GitHub](https://img.shields.io/badge/GitHub-source-2ea44f?logo=github&logoColor=white)](https://github.com/MKDevTests/qRemote/)
[![Download the APK](https://img.shields.io/github/v/release/MKDevTests/qRemote?label=Android%20APK&logo=android&logoColor=white&color=3DDC84)](https://github.com/MKDevTests/qRemote/releases/latest)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FMKDevTests%2FqRemote%2Fcoverage%2Fbadge.json&logo=jest&logoColor=white&color=2ea44f)](https://github.com/MKDevTests/qRemote/actions/workflows/coverage.yml)

> **This is a personal fork of [taylorcox75/qRemote](https://github.com/taylorcox75/qRemote).**
> Upstream is iOS-only and ships through the App Store. This fork adds an
> **Android build** and an **in-app updater that installs straight from GitHub
> releases** — see [docs/ANDROID.md](docs/ANDROID.md). Everything below still
> describes the app itself, which is unchanged. All credit for it goes upstream.

**The fast, modern remote for qBittorrent — on Android and iOS.**

qRemote puts your entire qBittorrent server in your pocket. Start, monitor, and finish torrents from anywhere — with live updates every couple of seconds, a polished dark UI, one-tap actions, and built-in search across dozens of indexers. No web UI pinching and zooming, no clunky wrappers: a real native-feeling app designed for your thumb.

<p align="center">
  <img src="assets/github-landing.jpg" width="300">
</p>

Your torrents at a glance: every card shows status, speed, progress, and ETA in real time, with one-tap pause/resume and swipe actions. Filter by state — All, Active, Done, Paused, Scheduled — search the list instantly, and sort however you want. Adding is just as fast: paste a magnet link, open a `.torrent` file straight from the Files app, or tap **+** and go.

## Manage Torrents

<p align="center">
  <img src="assets/appstore/iphone_3.jpg" width="300">
</p>

Tap into any torrent for total control. The big three — **Pause**, **Recheck**, **Delete** — sit right at the top, one tap away. Below, everything qBittorrent knows about the torrent, live and editable:

- **General stats** — size, downloaded, uploaded, ratio, and seeding time at a glance
- **Ratio & seeding limits** — set per-torrent ratio limits and seeding time without touching the desktop
- **Save path, category & tags** — reorganize your library from your couch; categories and tags are fully editable in-app
- **Trackers, files & peers** — inspect trackers, reannounce, set per-file priorities, and watch who you're connected to
- **More actions** — force start, reannounce, and per-torrent speed limits when you need them

No digging through nested menus. Everything about a torrent lives on one screen.

## Manage Transfers

<p align="center">
  <img src="assets/appstore/iphone_4.jpg" width="300">
</p>

A live, scrolling upload/download graph keeps you in control of your bandwidth — watch a 61 MiB/s download happen in real time. Then shape it:

- **Global speed limits** — set download and upload caps in seconds
- **Alternative speeds** — configure alt limits and flip them on with a single toggle when you need your connection back
- **Bulk actions** — Resume All, Pause All, or Force Start All in one tap
- **Session & all-time stats** — see exactly how much you've moved today and forever
- **Connection health** — DHT nodes, connected peers, and free disk space on your server, always visible

It's the qBittorrent status bar, reimagined for a phone — and it updates live while you watch.

## Search Plugin Support

<p align="center">
  <img src="assets/appstore/iphone_5.jpg" width="300">
</p>

Stop hopping between browser tabs. qRemote drives qBittorrent's search plugins directly, so you can search **dozens of indexers at once** and add results in one tap:

- **All your plugins, one search bar** — query every installed plugin pack simultaneously, or narrow to a single one
- **Filter chips for indexer & category** — slice hundreds of results by indexer (1337x, EZTV, The Pirate Bay, …) or category (Anime, Books, Games, …) instantly
- **Works great with Prowlarr & Jackett** — indexer labels are detected and filterable
- **Seeders, leechers & size up front** — spot the healthy release before you commit
- **One-tap add** — hit **+** and the torrent is on your server, downloading before you've locked your phone
- **Plugin management built in** — install, enable, and remove search plugins from inside the app

Search, evaluate, add. Ten seconds, start to finish.

## Server Management

<p align="center">
  <img src="assets/appstore/iphone_6.jpg" width="300">
</p>

Make qBittorrent behave *your* way, and manage every server you run:

- **Smart defaults** — pick the default sort, sort direction, and filter for your torrent list
- **Torrent behavior** — pause on add, default save path, first/last piece priority for instant previews
- **Auto-categorize by tracker** — new torrents file themselves into the right category automatically
- **Full category & tag management** — create and delete categories (radarr, sonarr, …) and tags right from the app
- **Multiple servers** — add as many qBittorrent instances as you run and switch between them
- **Security built in** — credentials in the iOS secure enclave (never plain text), HTTPS support, and reverse-proxy Basic Auth for setups behind nginx/Traefik

## Everything Else

- Real-time incremental sync — updates every 2–3 seconds without hammering your server
- Fully customizable theme — override any color, with dark and light modes
- 6 languages: English, Spanish, Chinese, French, German, Russian
- Registers as an "Open With" handler for `.torrent` files in the Files app
- Connectivity logs for troubleshooting your connection

## Install (Android)

Grab the APK from the [latest release](https://github.com/MKDevTests/qRemote/releases/latest)
and open it on your phone. Android will ask you to allow installs from your
browser or file manager the first time.

After that the app updates itself: **Settings → About → Updates → Check for
updates** downloads the next release and hands it to the system installer.

## Requirements

- qBittorrent 4.1+ with WebUI enabled
- Android 7.0+, or iOS 16.4+
- Node.js 20+ and a JDK 17+ (for development)

## Getting Started

```bash
git clone https://github.com/MKDevTests/qRemote.git
cd qRemote
npm install
```

### Building

**Android** — full guide in [docs/ANDROID.md](docs/ANDROID.md):

```bash
./scripts/build-qremote-release.sh
```

**iOS** — needs macOS and Xcode:

```bash
npm run xcode
```

`android/` and `ios/` are both generated by `expo prebuild` and are not
committed. `app.config.js` is the source of truth for native configuration on
both platforms.

## Setup

1. Go to Settings → tap **+**
2. Add your qBittorrent server (IP/hostname, port, credentials)
3. Enable HTTPS if needed
4. Connect and you're good to go

## Built With

React Native (Expo), TypeScript, Expo Router

## Contributing

PRs welcome. Issues too.

## License

MIT
