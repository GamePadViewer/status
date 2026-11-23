---
id: obs-33-background-input
severity: warning
title: OBS 33 stops showing controller input while another app is focused
summary: On OBS 33.0.0 and 33.0.1, controller input stopped showing on the overlay whenever another app had focus. OBS fixed it in 33.0.2, so updating OBS clears it.
workaround: Update OBS to 33.0.3 or later.
links:
  - label: OBS 33.0.3 release
    href: https://github.com/obsproject/obs-studio/releases/tag/33.0.3
  - label: OBS issue 14083
    href: https://github.com/obsproject/obs-studio/issues/14083
startsAt: 2026-10-23T22:20:29Z
endsAt: 2026-11-20T14:15:30Z
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

## Resolved, 23 November

OBS fixed this in 33.0.2, released on 20 November. Its release notes list the fix for controller
input in browser sources stopping when OBS loses focus, on both Windows and macOS. OBS 33.0.3
followed on 21 November to fix a crash in 33.0.2 on some older CPUs, so update straight to 33.0.3
or later.

Once you have updated, the overlay keeps moving while you play, and there is no need to run OBS as
administrator or stay on OBS 32.2.2.
