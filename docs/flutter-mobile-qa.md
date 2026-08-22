# Flutter Mobile Controller — Manual QA Checklist

Run against a real desktop (`bun server/index.js`, binds `0.0.0.0:4000`) on the same Wi-Fi.

## Discovery

- [ ] Fresh install, same LAN: app lists the desktop in ≤ 4s (subnet sweep).
- [ ] With `ENABLE_MDNS` on: desktop appears via mDNS with latency shown.
- [ ] Desktop off / different Wi-Fi: empty state explains "same Wi-Fi" requirement; no crash.
- [ ] Pull-to-refresh re-scans.

## Pairing

- [ ] Wrong join code → inline error, no token stored.
- [ ] Correct join code → connects, JWT persisted, restart auto-connects.
- [ ] QR from desktop `QRCodeDialog` → prefills host + code and connects.

## Live control

- [ ] Next/Prev update the desktop output instantly; counter matches.
- [ ] Tapping a lyric row jumps to that line on all clients.
- [ ] Output toggle in AppBar flips desktop output.
- [ ] Setlist sheet loads a song; current line card + list refresh.

## Resilience

- [ ] Kill desktop mid-service → offline banner; restart → reconnects, state resyncs.
- [ ] Airplane mode toggle → socket reconnects, no duplicate connections.
- [ ] Rotate phone↔tablet breakpoint (600dp): two-pane appears without losing selected line.

## Tablet

- [ ] ≥600dp: NavigationRail + setlist pane + lyrics pane visible together.
- [ ] Transport bar works in both panes' shared layout.
