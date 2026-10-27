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

const problems = [];

/** Collects every problem rather than stopping at the first, so one run tells you all of them. */
const fail = (file, message) => problems.push(`${file}: ${message}`);

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
      if (required) fail(file, `needs a ${field}`);
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

  return {
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

const linkList = (links) =>
  links.length === 0
    ? ''
    : `<p class="links">${links
        .map(({ label, href }) => `<a href="${escape(href)}" rel="noopener">${escape(label)} &#8599;</a>`)
        .join('')}</p>`;

const block = (heading, text) => (text ? `<p class="label">${heading}</p><p>${escape(text)}</p>` : '');

const STYLE = `
:root { --bg:#0f1115; --card:#171a21; --line:#272b35; --text:#e7e9ee; --muted:#9aa3b2;
        --info:#4c8dff; --warning:#e9a23b; --outage:#e5534b; color-scheme: dark; }
@media (prefers-color-scheme: light) {
  :root { --bg:#f7f8fa; --card:#fff; --line:#e3e6eb; --text:#1b1f27; --muted:#5d6675; color-scheme: light; }
}
* { box-sizing: border-box; }
body { margin:0; padding:32px 16px 64px; background:var(--bg); color:var(--text);
       font:16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 680px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 24px; }
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
footer a { margin-right:14px; }
.back { display:inline-block; color:var(--muted); text-decoration:none; margin-bottom:20px; }
.body { margin-top:8px; border-top:1px solid var(--line); padding-top:20px; }
`;

const footer = () =>
  `<footer><p class="label">Where to get help</p>${HELP_LINKS.map(
    ({ label, href }) => `<a href="${escape(href)}" rel="noopener">${escape(label)}</a>`
  ).join('')}</footer>`;

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="robots" content="index,follow">
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

  return page(SITE_NAME, `<h1>${SITE_NAME}</h1>${current}${archive}`);
}

function detailPage(alert) {
  const ongoing = !alert.endsAt;
  return page(
    `${alert.title} &middot; ${SITE_NAME}`,
    `<a class="back" href="/">&larr; ${SITE_NAME}</a>
<span class="tag ${escape(alert.severity)}">${escape(SEVERITY_LABEL[alert.severity])}</span>
<h1>${escape(alert.title)}</h1>
<p class="when">Started ${escape(formatDate(alert.startsAt))}${
      ongoing ? ' &middot; ongoing' : ` &middot; resolved ${escape(formatDate(alert.endsAt))}`
    }</p>
${block('What you can do', alert.workaround)}
${alert.links.length ? '<p class="label">Links</p>' : ''}${linkList(alert.links)}
<div class="body">${marked.parse(alert.body)}</div>`
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
    return;
  }

  const now = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await writeFile(
    join(DIST, 'alerts.json'),
    `${JSON.stringify({ schema: 'gpv-status/1', alerts: announcements.map(toAlert) }, null, 2)}\n`
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
  console.log(`Built ${announcements.length} announcement(s), ${active} active, into dist/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
