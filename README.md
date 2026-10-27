# GamePad Viewer status

The status page at [status.gamepadviewer.com](https://status.gamepadviewer.com), and the alert feed
the dashboard and the overlay read.

This repository is deliberately small and framework-free. It is the thing that has to keep working
when something else is broken, so it has two dependencies and a build measured in seconds.

## Publishing an alert

One file per incident, in `announcements/`, named `YYYY-MM-DD-short-description.md`. The build turns
every file into `alerts.json` and a page of its own, so **never hand-edit `alerts.json`** — it is
generated, and `dist/` is not committed.

```md
---
id: controller-saving-down            # stable, and what dismissal is keyed on — see below
severity: outage                      # info | warning | outage
title: Controller saving is down
summary: One or two sentences. Shown in the dashboard banner and the overlay's support panel.
workaround: One line on what the reader can do right now. Optional.
links:                                # optional, up to 5, all https
  - label: PlanetScale status
    href: https://planetscale.statuspage.io
startsAt: 2026-10-26T14:00:00Z
endsAt:                               # empty while ongoing; fill in to resolve
---

The full write-up. Everything below the frontmatter becomes the incident's own page, and it is
the one place with no length limit.
```

Then:

```bash
npm install          # first time only
node build.mjs       # fails loudly, and lists every problem, if anything is wrong
git add -A && git commit -m "status: controller saving is down" && git push
```

Pushing to `main` runs the **Deploy** workflow. **If the build fails, nothing is deployed and the
previous version stays live** — which is also why the build is worth running before you push.

### Resolving an alert

Fill in `endsAt` and push. The alert disappears from the products and from "Current", and moves into
the "Resolved" list. Keep the file: it is the incident archive.

### Changing an alert that is already live

Edit the same file and push. Keep the `id` the same unless you want people who dismissed it to see
it again — dismissal in the dashboard is keyed on `id`, so a new `id` means a fresh alert to
everyone.

## How long it takes to go live

GitHub Pages serves `cache-control: max-age=600`, and that is not configurable, so an alert can take
**up to 10 minutes** to reach everyone. The products poll every 60 seconds, so once the CDN has it,
open tabs pick it up within a minute.

If that is too slow, proxy `status.gamepadviewer.com` through Cloudflare (DNS set to proxied) and add
a Cache Rule overriding the edge TTL for `/alerts.json` to 30 seconds. That keeps the hosting here
and brings propagation down without another platform.

## What reads this

| Reader | What it shows |
| --- | --- |
| Dashboard banner | The loudest active alert, with its workaround and first link |
| Dashboard "Report a Bug" | Every active alert, before the bug tracker opens |
| Overlay support panel | Every active alert, as health checks, and in the copied report |

`alerts.json` is `{ "schema": "gpv-status/1", "alerts": [...] }`. The readers validate it and treat
anything unexpected as no alerts at all, so a malformed or unreachable file degrades to silence
rather than breaking a page. The canonical schema lives in the `gpv` repository, at
`packages/data/lib/announcement.ts`; if you change the shape, change it in both places.

## Layout

```
announcements/        one markdown file per incident
build.mjs             validates frontmatter, writes dist/
public/               copied verbatim into dist/ (CNAME, .nojekyll)
.github/workflows/    the Pages deploy
```
