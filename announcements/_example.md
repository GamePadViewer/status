---
id: controller-saving-down            # stable; dismissal in the dashboard is keyed on it
severity: outage                      # info | warning | outage
title: Controller saving is down
summary: A dependency we rely on is failing, so saved controllers will not load. We know about it and are working on it, so there is no need to report it.
workaround: Overlay links you already have keep working. Avoid saving a controller until this is resolved.
links:                                # optional, up to 5, all https
  - label: PlanetScale status
    href: https://planetscale.statuspage.io
startsAt: 2026-10-26T14:00:00Z
endsAt:                               # empty while ongoing; fill in to resolve
---

Everything below the frontmatter becomes the incident's own page, and it is the one place with no
length limit.

## What you can do

The long version of the mitigation, where `workaround` was the one-liner.

## What we are doing

Where things stand, and what you are waiting on.
