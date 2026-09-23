# LyricDisplay Mobile — Flutter Controller

Native Android-first (iOS-ready) controller for LyricDisplay. Finds the desktop
on the church Wi-Fi via mDNS, pairs with the on-screen 6-digit join code, and
drives the show: live lyric preview, line navigation, output toggles, setlist,
and Bible quick-load.

## Download

Signed release APKs are attached to GitHub Releases
(`mobile-v*` tags build automatically via `.github/workflows/mobile-release.yml`).

## Pairing

1. On the desktop app, open **File > Connect Mobile Controller** to see the 6-digit join code.
2. Open this app on a phone/tablet on the same Wi-Fi — LyricDisplay appears under "Find LyricDisplay".
3. Tap the server, type the on-screen code, done. (No server found? Use the manual IP field.)

The pairing is remembered; next launch offers "resume last connection".

## Development

```sh
cd mobile
flutter pub get
flutter run            # debug on a connected device/emulator
flutter test           # unit tests
flutter analyze        # lint
```

### Permissions

- **Camera** — QR-code join (declared on Android + iOS; requested when the scanner opens).
- **Location (Android only)** — the subnet-sweep leg of auto-discovery reads the
  Wi-Fi IP, which needs location permission on Android 10+. Requested on the
  first scan; without it discovery falls back to mDNS + manual IP + QR.

### Release signing

Keystore material lives **outside** the repo. Create `mobile/android/keystore.properties`:

```
storeFile=/absolute/path/to/release-key.jks
storePassword=...
keyAlias=lyricdisplay
keyPassword=...
```

CI signs using `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
`KEY_PASSWORD` repository secrets (see the workflow). Without them, builds
fall back to debug signing.

### iOS

Code stays platform-clean but iOS is untested until Apple hardware and an
Apple developer account exist.

## Architecture

- `lib/core/` — REST client (`server_api.dart`), Socket.IO service, mDNS discovery, secure pairing store, models.
- `lib/state/providers.dart` — Riverpod wiring: session, live show state mirror, commands.
- `lib/features/` — discovery, pairing, control, setlist, bible, settings screens.
- Tablets (≥600dp): navigation rail + two-pane control screen with setlist sidebar.
