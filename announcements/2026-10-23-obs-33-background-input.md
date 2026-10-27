---
id: obs-33-background-input
severity: warning
title: OBS 33 stops showing controller input while another app is focused
summary: On OBS 33.0.0, the overlay stops updating as soon as another application takes focus, so controller input does not appear on stream while you are playing. This is a change in OBS rather than in GamePad Viewer, and it is already reported upstream, so there is no need to file a bug. Running OBS as administrator clears it for most setups; downgrading to OBS 32.2.2 is the fallback.
workaround: Run OBS as administrator. If that does not help, downgrade to OBS 32.2.2.
links:
  - label: OBS 32.2.2 release
    href: https://github.com/obsproject/obs-studio/releases/tag/32.2.2
  - label: OBS issue 14083
    href: https://github.com/obsproject/obs-studio/issues/14083
startsAt: 2026-10-23T22:20:29Z
endsAt:
---

GamePad Viewer renders in an OBS browser source. From OBS 33.0.0 on, a browser source stops
receiving controller input as soon as OBS is not the focused application — which is, in practice,
the whole time you are playing. The overlay freezes on the last input it saw, and starts moving
again the moment you click back into OBS.

Nothing changed in GamePad Viewer, and nothing is wrong with your controller or your overlay link.

## What you can do

Try running OBS as administrator first. It restores input without leaving the current version.
Administrator is a Windows notion, so on macOS go straight to the downgrade.

Otherwise, downgrade to OBS 32.2.2, the last release before the change.

## What we are doing

This is a change in OBS rather than something we can fix from our side, so we are following the
upstream issue rather than working around it in the overlay. It is open, and filed against 33.0.0
with the same symptom.

We will update this page as that moves, and resolve it once a fixed OBS release is out.
