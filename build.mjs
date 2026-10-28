#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ANNOUNCEMENTS = join(ROOT, 'announcements');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');

const SITE_URL = 'https://status.gamepadviewer.com';
const SITE_NAME = 'GamePad Viewer status';

/**
 * The GPV mark, from the dashboard, inlined rather than linked: this page has to render when the
 * rest of the product does not, so it makes no network request of its own. Monochrome, so it
 * follows the text colour in both themes.
 */
const LOGO_G = 'M76.71,58c-6.9,0-10.36-8.35-5.48-13.23l21.87-21.87c3.37-3.37,2.92-8.95-.93-11.76C82.12,3.79,69.6-.4,56.1,.03,26.05,.99,1.44,25.23,.06,55.26c-1.53,33.28,25,60.74,57.94,60.74,11.32,0,21.88-3.25,30.81-8.87,3.04-1.91,7-1.42,9.54,1.11l5.7,5.7h0c1.37,1.37,3.31,2.18,5.43,2.03,3.73-.25,6.52-3.54,6.52-7.27v-42.96c0-4.28-3.47-7.75-7.75-7.75h-31.54Z';
const LOGO_P = 'M186.66,0h-51.75c-4.28,0-7.75,3.47-7.75,7.75V108.25c0,4.28,3.47,7.75,7.75,7.75h25.5c4.28,0,7.75-3.47,7.75-7.75v-25.5c0-4.28,3.47-7.75,7.75-7.75h10.01c21.03,0,38.64-17.21,38.23-38.23-.39-20.37-17.03-36.77-37.49-36.77Z';
const LOGO_V = 'M227.73,11.21l50.33,100.67c2.86,5.71,11.01,5.71,13.86,0L342.27,11.21c2.58-5.15-1.17-11.21-6.93-11.21h-100.67c-5.76,0-9.5,6.06-6.93,11.21Z';

const LOGO = `<svg class="logo" viewBox="0 0 343.09 116.16" role="img" aria-label="GamePad Viewer" focusable="false"><path d="${LOGO_G}"/><path d="${LOGO_P}"/><path d="${LOGO_V}"/></svg>`;

/** The same mark, as the favicon: a data URI, so it cannot 404 and costs no request. */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="34" fill="#0a0a0a"/><path transform="translate(20,22)" fill="#fff" d="${LOGO_G}"/></svg>`
)}`;

/**
 * Site-wide, and deliberately not part of any alert: this page is where people land when the
 * dashboard itself is unreachable, so it has to carry the ways to reach us on its own.
 */
const HELP_LINKS = [
  { label: 'Discord support', href: 'https://discord.com/channels/82712913701244928/1023793423205027850' },
  { label: 'Community', href: 'https://gpv.gg/discord' },
  { label: 'Documentation', href: 'https://gamepadviewer.notion.site/c89bb4e6444a46b99b72b1b6bd75c111' },
  { label: 'Dashboard', href: 'https://beta.gamepadviewer.com' }
];

const SEVERITIES = ['info', 'warning', 'outage'];
const SEVERITY_ORDER = { outage: 0, warning: 1, info: 2 };
const SEVERITY_LABEL = { info: 'Info', warning: 'Warning', outage: 'Outage' };

const LIMITS = { title: 120, summary: 500, workaround: 200, id: 64, label: 60, links: 5 };

/**
 * Roughly how much of a summary the dashboard's toast shows: it clamps to three lines on desktop
 * and two on a phone. Past this a summary is still shown whole everywhere else — the alert panel,
 * the "Report a Bug" interstitial, the overlay's support panel and the card on this site — but the
 * toast is where most people meet an incident, so a summary that needs its second half to make
 * sense is one most readers will only half read. A note rather than a failure: nothing about prose
 * length should hold up a status page mid-incident.
 */
const SUMMARY_CLAMPED_AT = 200;

/**
 * How long a resolved incident stays in alerts.json. Nothing reading the feed ever shows a resolved
 * alert — the dashboard and the overlay both check the window themselves — so this is slack for a
 * reader whose clock is behind, and enough history to make curling the feed worth it. The index page
 * is unaffected and keeps every incident forever.
 */
const FEED_RESOLVED_DAYS = 30;

/** Mirrors MAX_ALERTS in the apps' packages/data/lib/announcement.ts, which ignores anything past it. */
const MAX_FEED_ALERTS = 50;

const problems = [];
const notes = [];

/** Collects every problem rather than stopping at the first, so one run tells you all of them. */
const fail = (file, message) => problems.push(`${file}: ${message}`);

/** Worth saying, but never worth refusing to publish over. Printed once the run is done. */
const note = (file, message) => notes.push(`${file}: ${message}`);

const printNotes = () => {
  if (notes.length === 0) return;
  console.warn('\nWorth a look, though none of this stopped the build:\n');
  for (const message of notes) console.warn(`  - ${message}`);
  console.warn('');
};

const isHttps = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function readFrontmatter(file, raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    fail(file, 'has no --- frontmatter block at the top');
    return null;
  }
  try {
    return { data: parseYaml(match[1]) ?? {}, body: match[2].trim() };
  } catch (error) {
    fail(file, `has frontmatter that is not valid YAML: ${error.message}`);
    return null;
  }
}

function validate(file, data, body) {
  const { id, severity, title, summary, workaround, links, startsAt, endsAt } = data;

  const text = (value, field, max, required) => {
    if (value === undefined || value === null || value === '') {
      if (required) fail(file, `needs ${field}`);
      return undefined;
    }
    if (typeof value !== 'string') {
      fail(file, `${field} must be text`);
      return undefined;
    }
    if (value.length > max) fail(file, `${field} is ${value.length} characters, over the ${max} limit`);
    return value;
  };

  if (!SEVERITIES.includes(severity)) {
    fail(file, `severity must be one of ${SEVERITIES.join(', ')}, not ${JSON.stringify(severity ?? null)}`);
  }
  if (!isIsoDate(startsAt)) fail(file, 'startsAt must be an ISO date, such as 2026-10-26T14:00:00Z');
  if (endsAt !== undefined && endsAt !== null && endsAt !== '' && !isIsoDate(endsAt)) {
    fail(file, 'endsAt must be an ISO date, or empty while the incident is ongoing');
  }

  const checkedLinks = [];
  if (links !== undefined && links !== null) {
    if (!Array.isArray(links)) {
      fail(file, 'links must be a list of label/href pairs');
    } else {
      if (links.length > LIMITS.links) fail(file, `has ${links.length} links, over the ${LIMITS.links} limit`);
      links.forEach((link, index) => {
        const label = text(link?.label, `links[${index}].label`, LIMITS.label, true);
        const href = link?.href;
        if (typeof href !== 'string' || !isHttps(href)) {
          fail(file, `links[${index}].href must be an https URL, not ${JSON.stringify(href ?? null)}`);
          return;
        }
        if (label) checkedLinks.push({ label, href });
      });
    }
  }

  const alert = {
    id: text(id, 'an id', LIMITS.id, true),
    severity,
    title: text(title, 'a title', LIMITS.title, true),
    summary: text(summary, 'a summary', LIMITS.summary, true),
    workaround: text(workaround, 'workaround', LIMITS.workaround, false),
    links: checkedLinks,
    startsAt,
    endsAt: endsAt === '' || endsAt === undefined ? null : endsAt,
    body
  };

  if (alert.summary && alert.summary.length > SUMMARY_CLAMPED_AT) {
    note(
      file,
      `the summary is ${alert.summary.length} characters and the dashboard's toast shows about ` +
        `${SUMMARY_CLAMPED_AT}. Lead with the symptom in a sentence that stands on its own, and ` +
        'leave the workaround to its own field and the long version to the body.'
    );
  }

  return alert;
}

async function readAnnouncements() {
  let names = [];
  try {
    names = (await readdir(ANNOUNCEMENTS)).filter((name) => name.endsWith('.md') && !name.startsWith('_'));
  } catch {
    return [];
  }

  const announcements = [];
  const seen = new Map();

  for (const name of names.sort()) {
    const raw = await readFile(join(ANNOUNCEMENTS, name), 'utf8');
    const parsed = readFrontmatter(name, raw);
    if (!parsed) continue;

    const alert = validate(name, parsed.data, parsed.body);
    if (!alert.id) continue;

    if (seen.has(alert.id)) fail(name, `uses the id "${alert.id}", which ${seen.get(alert.id)} already uses`);
    seen.set(alert.id, name);
    announcements.push(alert);
  }

  return announcements.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );

const formatDate = (value) =>
  new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hourCycle: 'h23'
  }) + ' UTC';

const isActive = (alert, now) =>
  Date.parse(alert.startsAt) <= now && (!alert.endsAt || Date.parse(alert.endsAt) > now);

/**
 * The alerts worth sending to the dashboard and the overlay: everything still open or still to come,
 * and anything resolved recently. Filtered on the end rather than the start, so an incident that is
 * scheduled but has not begun is still sent and its reader can show it when the window opens.
 */
const feedAlerts = (announcements, now) => {
  const cutoff = now - FEED_RESOLVED_DAYS * 24 * 60 * 60 * 1000;
  const worthSending = announcements.filter(({ endsAt }) => !endsAt || Date.parse(endsAt) > cutoff);

  if (worthSending.length > MAX_FEED_ALERTS) {
    console.warn(
      `\n${worthSending.length} incidents are open or recent, over the ${MAX_FEED_ALERTS} a reader will take.` +
        ` Sending the newest ${MAX_FEED_ALERTS}.\n`
    );
  }

  return worthSending.slice(0, MAX_FEED_ALERTS);
};

const linkList = (links) =>
  links.length === 0
    ? ''
    : `<p class="links">${links
        .map(({ label, href }) => `<a href="${escape(href)}" rel="noopener">${escape(label)} &#8599;</a>`)
        .join('')}</p>`;

const block = (heading, text) => (text ? `<p class="label">${heading}</p><p>${escape(text)}</p>` : '');

const STYLE = `
:root { --bg:#0a0a0a; --card:#141414; --line:#2a2a2a; --text:#fafafa; --muted:#a1a1aa;
        --info:#4c8dff; --warning:#e9a23b; --outage:#e5534b; color-scheme: dark; }
@media (prefers-color-scheme: light) {
  :root { --bg:#fafafa; --card:#fff; --line:#e5e5e5; --text:#141414; --muted:#6b7280; color-scheme: light; }
}
* { box-sizing: border-box; }
body { margin:0; padding:32px 16px 64px; background:var(--bg); color:var(--text);
       font:16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 680px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 24px; }
.brand { display:flex; align-items:center; gap:10px; font-weight:600; letter-spacing:-.01em; }
.brand .logo { height:1.05em; width:auto; fill:currentColor; display:block; }
.brand .word { color:var(--muted); font-weight:500; }
h1.brand { margin:0 0 26px; }
a.brand { display:flex; width:fit-content; font-size:1rem; text-decoration:none; margin-bottom:22px; color:var(--muted); }
a.brand .logo { fill:var(--muted); }
h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
     margin: 32px 0 12px; }
a { color: inherit; }
.card { background:var(--card); border:1px solid var(--line); border-left-width:4px;
        border-radius:10px; padding:16px 18px; margin-bottom:16px; }
.card.outage { border-left-color: var(--outage); }
.card.warning { border-left-color: var(--warning); }
.card.info { border-left-color: var(--info); }
.tag { display:inline-block; font-size:.7rem; font-weight:700; letter-spacing:.07em;
       text-transform:uppercase; padding:2px 8px; border-radius:999px; margin-bottom:8px; }
.tag.outage { background:var(--outage); color:#fff; }
.tag.warning { background:var(--warning); color:#2a1c05; }
.tag.info { background:var(--info); color:#fff; }
.card h3 { margin:0 0 4px; font-size:1.1rem; }
.when { color:var(--muted); font-size:.85rem; margin:0 0 12px; }
.label { font-size:.75rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted);
         margin:14px 0 2px; }
.card p, .body p { margin:0 0 8px; }
.links a { display:inline-block; margin-right:14px; text-decoration:none; border-bottom:1px solid var(--line); }
.normal { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:28px;
          text-align:center; font-size:1.1rem; }
.archive { list-style:none; padding:0; margin:0; }
.archive li { display:flex; gap:14px; padding:9px 0; border-bottom:1px solid var(--line); font-size:.95rem; }
.archive time { color:var(--muted); white-space:nowrap; flex:0 0 7.5em; }
footer { margin-top:40px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted);
         font-size:.9rem; }
footer a { display:inline-block; margin-right:14px; white-space:nowrap; }
.body { margin-top:8px; border-top:1px solid var(--line); padding-top:20px; }
`;

const footer = () =>
  `<footer><p class="label">Where to get help</p>${HELP_LINKS.map(
    ({ label, href }) => `<a href="${escape(href)}" rel="noopener">${escape(label)}</a>`
  ).join('')}</footer>`;

/** Trimmed for the places that show a page's description: search results, and a Discord unfurl. */
const summarise = (text) => (text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text);

const page = (title, body, { description, url = SITE_URL }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="robots" content="index,follow">
<meta name="description" content="${escape(summarise(description))}">
<link rel="canonical" href="${escape(url)}">
<link rel="icon" href="${escape(FAVICON)}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${SITE_URL}/icon-256.png">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${escape(SITE_NAME)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(summarise(description))}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${SITE_URL}/icon-256.png">
<meta name="twitter:card" content="summary">
<style>${STYLE}</style>
</head>
<body><main>${body}${footer()}</main></body>
</html>
`;

const detailUrlFor = (alert) => (alert.body ? `${SITE_URL}/${alert.id}` : undefined);

function card(alert) {
  const ongoing = !alert.endsAt;
  const detail = detailUrlFor(alert);
  return `<article class="card ${escape(alert.severity)}">
<span class="tag ${escape(alert.severity)}">${escape(SEVERITY_LABEL[alert.severity])}</span>
<h3>${escape(alert.title)}</h3>
<p class="when">Started ${escape(formatDate(alert.startsAt))}${
    ongoing ? ' &middot; ongoing' : ` &middot; resolved ${escape(formatDate(alert.endsAt))}`
  }</p>
<p>${escape(alert.summary)}</p>
${block('What you can do', alert.workaround)}
${alert.links.length ? '<p class="label">Links</p>' : ''}${linkList(alert.links)}
${detail ? `<p class="links"><a href="${escape(detail)}">Read the full update &rarr;</a></p>` : ''}
</article>`;
}

function indexPage(announcements, now) {
  const active = announcements
    .filter((alert) => isActive(alert, now))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const resolved = announcements.filter((alert) => !isActive(alert, now));

  const current = active.length
    ? `<h2>Current</h2>${active.map(card).join('')}`
    : `<div class="normal">&#10003; All systems normal</div>`;

  const archive = resolved.length
    ? `<h2>Resolved</h2><ul class="archive">${resolved
        .map(
          (alert) =>
            `<li><time datetime="${escape(alert.startsAt)}">${escape(
              formatDate(alert.startsAt).replace(/,.*$/, '')
            )}</time><span>${
              alert.body ? `<a href="/${escape(alert.id)}">${escape(alert.title)}</a>` : escape(alert.title)
            }</span></li>`
        )
        .join('')}</ul>`
    : '';

  const description = active.length
    ? `${active.length} active alert${active.length === 1 ? '' : 's'}: ${active
        .map((alert) => alert.title)
        .join(' \u00b7 ')}`
    : 'All GamePad Viewer systems normal.';

  return page(SITE_NAME, `<h1 class="brand">${LOGO}<span class="word">status</span></h1>${current}${archive}`, {
    description
  });
}

function detailPage(alert) {
  const ongoing = !alert.endsAt;
  return page(
    `${alert.title} · ${SITE_NAME}`,
    `<a class="brand" href="/">${LOGO}<span class="word">status</span></a>
<span class="tag ${escape(alert.severity)}">${escape(SEVERITY_LABEL[alert.severity])}</span>
<h1>${escape(alert.title)}</h1>
<p class="when">Started ${escape(formatDate(alert.startsAt))}${
      ongoing ? ' &middot; ongoing' : ` &middot; resolved ${escape(formatDate(alert.endsAt))}`
    }</p>
${block('What you can do', alert.workaround)}
${alert.links.length ? '<p class="label">Links</p>' : ''}${linkList(alert.links)}
<div class="body">${marked.parse(alert.body)}</div>`,
    { description: alert.summary, url: detailUrlFor(alert) ?? SITE_URL }
  );
}

const toAlert = (alert) => ({
  id: alert.id,
  severity: alert.severity,
  title: alert.title,
  summary: alert.summary,
  ...(alert.workaround ? { workaround: alert.workaround } : {}),
  ...(alert.links.length ? { links: alert.links } : {}),
  ...(detailUrlFor(alert) ? { detailUrl: detailUrlFor(alert) } : {}),
  startsAt: new Date(alert.startsAt).toISOString(),
  ...(alert.endsAt ? { endsAt: new Date(alert.endsAt).toISOString() } : {})
});

async function main() {
  const checkOnly = process.argv.includes('--check');
  const announcements = await readAnnouncements();

  if (problems.length) {
    console.error(`\nRefusing to build, because ${problems.length} thing(s) need fixing:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nNothing was written, so the deploy that is live stays live.\n');
    process.exit(1);
  }

  if (checkOnly) {
    console.log(`${announcements.length} announcement(s) look fine.`);
    printNotes();
    return;
  }

  const now = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // The feed is only what a reader can act on; the pages below keep the whole archive
  const feed = feedAlerts(announcements, now);
  await writeFile(
    join(DIST, 'alerts.json'),
    `${JSON.stringify({ schema: 'gpv-status/1', alerts: feed.map(toAlert) }, null, 2)}\n`
  );
  await writeFile(join(DIST, 'index.html'), indexPage(announcements, now));

  for (const alert of announcements.filter(({ body }) => body)) {
    await mkdir(join(DIST, alert.id), { recursive: true });
    await writeFile(join(DIST, alert.id, 'index.html'), detailPage(alert));
  }

  try {
    const extras = await readdir(PUBLIC);
    for (const name of extras) await writeFile(join(DIST, name), await readFile(join(PUBLIC, name)));
  } catch {
    // no public/ to copy
  }

  const active = announcements.filter((alert) => isActive(alert, now)).length;
  console.log(
    `Built ${announcements.length} announcement(s), ${active} active, ${feed.length} in the feed, into dist/`
  );
  printNotes();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
