# GamePad Viewer status

The status page at [status.gamepadviewer.com](https://status.gamepadviewer.com), and the alert feed
the dashboard and the overlay read.

This repository is deliberately small and framework-free. It is the thing that has to keep working
when something else is broken, so it has two dependencies and a build measured in seconds.

## Publishing an alert

One file per incident, in `announcements/`, named `YYYY-MM-DD-short-description.md`. The build turns
every file into `alerts.json` and a page of its own, so **never hand-edit `alerts.json`** — it is
generated, and `dist/` is not committed.

Copy `announcements/_example.md` to start. Files whose name begins with `_` are skipped by the
build, so the template never becomes an incident.

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
git checkout -b status/controller-saving-down
git add -A && git commit -m "status: controller saving is down" && git push -u origin HEAD
gh pr create --fill
gh pr checks --watch                      # the Validate run, about 12 seconds
gh pr merge --squash --delete-branch
```

`main` is protected: it takes a pull request, and the **Validate** workflow — the same build, run
against the PR — has to pass before it can merge. Merging then runs the **Deploy** workflow. **If
the build fails, nothing is deployed and the previous version stays live** — which is also why the
build is worth running before you push.

### When something is actually on fire

Repository admins can still push straight to `main`, and that is deliberate: this site exists to
say something within seconds, and a PR round trip is the wrong thing to owe an audience that is
already looking at breakage. Use it when the delay genuinely matters — and run `node build.mjs`
first, because the failure mode of skipping it is silent. A bad file fails the deploy, the previous
page stays live, and the alert you were in a hurry to publish simply never appears.

### Resolving an alert

Fill in `endsAt` and push. The alert disappears from the products and from "Current", and moves into
the "Resolved" list. Keep the file: it is the incident archive.

### Changing an alert that is already live

Edit the same file and push. Keep the `id`: the dashboard remembers dismissals against it, and that
is what stops an alert someone has already read coming back every time you reword it.

Raising the `severity` shows it again to everyone, including people who had dismissed it, because a
dismissal only counts for the severity it was made at. Lowering it does not. So an incident that
gets worse speaks up on its own, and you only need a new `id` when you genuinely mean a new
incident.

### Scheduling one

`startsAt` and `endsAt` are honoured on the clock, so an alert can be published ahead of time: the
dashboard shows it the moment its window opens and drops it the moment the window closes, with no
further push from you. Useful for planned maintenance.

## How long it takes to go live

**About 30 seconds from the merge**, and roughly 90 seconds to a tab that is already open.

Measured on a real change: pushed at 02:53:03, the Deploy workflow ran 02:53:05 to 02:53:31, and the
live file changed 32 seconds after the push — about a second after the deploy finished. Deploying is
the whole cost.

A pull request adds the **Validate** run ahead of that — 12 seconds, measured on the PR that
introduced it — so an alert published the normal way is live about three quarters of a minute after
you open the PR. An admin pushing straight to `main` is back to the 30 seconds above.

GitHub Pages serves `cache-control: max-age=600` and gives no way to change it, but that does not
delay a release: publishing purges the CDN, which is why the new file was served immediately. The
600 seconds only ever applied to browsers reusing their own cache, and the dashboard and overlay
both fetch with `cache: 'no-store'`, so they never do.

A tab someone already has open adds its polling interval on top — the dashboard refetches every 60
seconds and on window focus — so worst case is about a minute and a half. A tab opened after the
deploy sees it at once.

Don't bother putting a CDN in front of this to speed it up; there is nothing to gain.

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
public/               copied verbatim into dist/ (CNAME, .nojekyll, the icon)
.github/workflows/    the PR check, and the Pages deploy
```
