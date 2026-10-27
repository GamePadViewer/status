---
id: controller-saving-down
severity: outage
title: Controller saving is down
summary: A dependency we rely on is failing, so saved controllers will not load. We know about it and are working on it, so there is no need to report it.
workaround: Overlay links you already have keep working. Avoid saving a controller until this is resolved.
links:
  - label: PlanetScale status
    href: https://planetscale.statuspage.io
  - label: Cloudflare status
    href: https://www.cloudflarestatus.com
startsAt: 2026-10-26T14:00:00Z
endsAt:
---

Saving a controller in the dashboard currently fails. Overlay links that were already
created are unaffected and keep drawing normally on stream.

## What you can do

Nothing needs doing. Links you already have in OBS keep working. If you are part way through
setting up a new controller, your draft stays in your browser and will still be there once
saving is back.

## What we are doing

We are tracking our database provider's own status page, linked above, and will update this
page when saving works again.
