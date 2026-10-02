// Renders a normalized CV (see normalize.js) as a self-contained SVG string and
// as an accessible HTML table. Pure string building, so it works in Node, in the
// widget iframe and on the website.
//
// Chart choices (see DECISIONS.md): a Gantt-style timeline for roles and
// education, and a horizontal bar chart of years of hands-on use per skill.
// Two series on the timeline (work, education) so it has a legend; the skills
// chart is a single series in the work colour. Colours come from a validated
// palette (blue/orange, light and dark, all checks pass).

import { formatDuration, formatYears, tickYears } from './normalize.js';

// Two geometries. "wide" puts labels in a left column and bars to the right
// (exports, desktop, wide chat panes). "narrow" stacks each label above its bar so
// the text stays readable on a phone, where a wide chart would shrink to a blur.
const LAYOUTS = {
  wide: { narrow: false, W: 760, PAD: 28, LABEL_W: 232, X0: 28 + 232 + 12, X1: 760 - 28 - 52, ROW_H: 40, SKILL_ROW_H: 26 },
  narrow: { narrow: true, W: 380, PAD: 16, LABEL_W: 380 - 32, X0: 16, X1: 380 - 16 - 50, ROW_H: 60, SKILL_ROW_H: 42 },
};
const BAR_H = 10;
const MAX_SKILL_BARS = 10;

const LIGHT = { bg: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', grid: '#e1e0d9', axis: '#c3c2b7', work: '#2a78d6', edu: '#eb6834' };
const DARK = { bg: '#1a1a19', ink: '#ffffff', ink2: '#c3c2b7', grid: '#2c2c2a', axis: '#383835', work: '#3987e5', edu: '#d95926' };

const vars = (p) => Object.entries(p).map(([k, v]) => `--cvl-${k}:${v}`).join(';');

function styleBlock(theme) {
  const base = [
    '.cvl-svg text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.cvl-bg{fill:var(--cvl-bg)}',
    '.cvl-ink{fill:var(--cvl-ink)}',
    '.cvl-ink2{fill:var(--cvl-ink2)}',
    '.cvl-grid{stroke:var(--cvl-grid);stroke-width:1;fill:none}',
    '.cvl-axis{stroke:var(--cvl-axis);stroke-width:1;fill:none}',
    '.cvl-work{fill:var(--cvl-work)}',
    '.cvl-edu{fill:var(--cvl-edu)}',
    '.cvl-ring{stroke:var(--cvl-bg);stroke-width:2}',
    '.cvl-row:hover .cvl-hit{fill:var(--cvl-grid);opacity:.5}',
    '.cvl-hit{fill:transparent}',
  ].join('');
  if (theme === 'light') return `.cvl-svg{${vars(LIGHT)}}${base}`;
  if (theme === 'dark') return `.cvl-svg{${vars(DARK)}}${base}`;
  return (
    `.cvl-svg{${vars(LIGHT)}}` +
    `@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .cvl-svg{${vars(DARK)}}}` +
    `:root[data-theme="dark"] .cvl-svg{${vars(DARK)}}` +
    base
  );
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Rough text measurement. Good enough to truncate labels and to place a value
// label after a bar without a DOM; deliberately a little wide.
function textWidth(text, size) {
  let units = 0;
  for (const ch of text) {
    if ('iljtfI.,:;\'|!'.includes(ch)) units += 0.3;
    else if (ch === ' ') units += 0.3;
    else if ('mwMW@'.includes(ch)) units += 0.88;
    else if (/[A-Z]/.test(ch)) units += 0.67;
    else if (/[0-9]/.test(ch)) units += 0.57;
    else units += 0.55;
  }
  return units * size * 1.04;
}

function fit(text, maxWidth, size) {
  if (textWidth(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

// Bar with a square left edge (the baseline) and a rounded data end.
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w, h / 2);
  return `M${x} ${y}h${w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - rr)}z`;
}

function summaryText(data) {
  const { stats, work, skills } = data;
  const parts = [`CV overview for ${data.name}.`];
  if (work.length) {
    parts.push(`${formatYears(stats.yearsExperience)} years of experience across ${stats.employers} employer${stats.employers === 1 ? '' : 's'} and ${stats.roles} role${stats.roles === 1 ? '' : 's'}.`);
  }
  if (skills.length) {
    parts.push(`Most used skills: ${skills.slice(0, 3).map((s) => `${s.name} (${formatYears(s.years)} years)`).join(', ')}.`);
  }
  return parts.join(' ');
}

/**
 * @param {object} data   output of normalizeCv
 * @param {{ theme?: 'auto'|'light'|'dark', footer?: string, layout?: 'wide'|'narrow' }} [opts]
 *   theme 'auto' follows the page (prefers-color-scheme and data-theme);
 *   'light' or 'dark' pins the palette, which is what exports use.
 *   layout 'narrow' is for containers under about 560px.
 */
export function renderCvSvg(data, opts = {}) {
  const theme = opts.theme ?? 'auto';
  const footer = opts.footer ?? 'Made with CV Lens';
  const L = LAYOUTS[opts.layout === 'narrow' ? 'narrow' : 'wide'];
  const { narrow, W, PAD, LABEL_W, X0, X1, ROW_H, SKILL_ROW_H } = L;
  const out = [];
  let y = 0;

  // Header
  const nameSize = narrow ? 20 : 24;
  y = narrow ? 38 : 46;
  out.push(`<text class="cvl-ink" x="${PAD}" y="${y}" font-size="${nameSize}" font-weight="650">${esc(fit(data.name, W - 2 * PAD, nameSize))}</text>`);
  if (data.headline) {
    y += narrow ? 22 : 24;
    out.push(`<text class="cvl-ink2" x="${PAD}" y="${y}" font-size="${narrow ? 13 : 14}">${esc(fit(data.headline, W - 2 * PAD, narrow ? 13 : 14))}</text>`);
  }

  // Headline numbers
  const tiles = [];
  if (data.work.length) {
    tiles.push([formatYears(data.stats.yearsExperience), data.stats.yearsExperience === 1 ? 'year of experience' : 'years of experience']);
    tiles.push([String(data.stats.employers), data.stats.employers === 1 ? 'employer' : 'employers']);
    tiles.push([String(data.stats.roles), data.stats.roles === 1 ? 'role' : 'roles']);
  }
  if (data.skills.length) tiles.push([String(data.skills.length), data.skills.length === 1 ? 'skill used on the job' : 'skills used on the job']);
  if (tiles.length) {
    y += narrow ? 36 : 40;
    let x = PAD;
    const colW = (W - 2 * PAD) / 2;
    tiles.forEach(([value, caption], i) => {
      if (narrow) {
        // two columns, so four numbers fit on a phone
        x = PAD + (i % 2) * colW;
        if (i > 0 && i % 2 === 0) y += 52;
      }
      out.push(`<text class="cvl-ink" x="${x}" y="${y}" font-size="${narrow ? 24 : 26}" font-weight="600">${esc(value)}</text>`);
      out.push(`<text class="cvl-ink2" x="${x}" y="${y + 18}" font-size="12">${esc(fit(caption, narrow ? colW - 8 : 400, 12))}</text>`);
      if (!narrow) x += Math.max(textWidth(value, 26), textWidth(caption, 12)) + 36;
    });
    y += 18;
  }

  // Timeline
  const entries = [...data.work, ...data.edu];
  if (entries.length) {
    y += 40;
    out.push(`<text class="cvl-ink" x="${PAD}" y="${y}" font-size="15" font-weight="600">Career timeline</text>`);
    const hasBoth = data.work.length > 0 && data.edu.length > 0;
    const hasOngoing = entries.some((e) => e.ongoing);
    const keys = [];
    if (hasBoth) keys.push(['work', 'Experience'], ['edu', 'Education']);
    if (hasOngoing) keys.push(['dot', 'current']);
    const keyW = (label) => 16 + textWidth(label, 12);
    const total = keys.reduce((sum, [, label]) => sum + keyW(label), 0) + 18 * Math.max(0, keys.length - 1);
    let lx = narrow ? PAD : W - PAD - total;
    const ly = narrow ? y + 22 : y;
    const legend = [];
    for (const [kind, label] of keys) {
      if (kind === 'dot') legend.push(`<circle class="cvl-ring cvl-work" cx="${lx + 5}" cy="${ly - 4}" r="4"/>`);
      else legend.push(`<rect class="cvl-${kind}" x="${lx}" y="${ly - 9}" width="10" height="10" rx="3"/>`);
      legend.push(`<text class="cvl-ink2" x="${lx + 16}" y="${ly}" font-size="12">${label}</text>`);
      lx += keyW(label) + 18;
    }
    out.push(...legend);
    if (narrow && keys.length) y += 22;

    const { min, max } = data.axis;
    const xOf = (t) => X0 + ((t - min) / (max - min)) * (X1 - X0);
    const axisY = y + 26;
    const rows = [];
    let ry = axisY + 14;
    const groups = [
      ['Experience', data.work, 'cvl-work'],
      ['Education', data.edu, 'cvl-edu'],
    ];
    for (const [title, list, cls] of groups) {
      if (!list.length) continue;
      if (hasBoth) {
        if (list === data.edu) ry += 12;
        rows.push(`<text class="cvl-ink2" x="${PAD}" y="${ry + 12}" font-size="12" font-weight="600">${title.toUpperCase()}</text>`);
        ry += 24;
      }
      for (const e of list) {
        const x1 = xOf(e.start);
        const x2 = Math.max(xOf(e.end), x1 + 6);
        const primary = e.title || e.org;
        const secondary = e.title ? e.org : '';
        // wide: label column on the left, bar centred on the row. narrow: label above, bar below.
        const mid = narrow ? ry + 46 : ry + 20;
        const titleY = narrow ? ry + 16 : mid - (secondary ? 3 : -4);
        const orgY = narrow ? ry + 31 : mid + 13;
        const tip = `${primary}${e.title && e.org ? ` at ${e.org}` : ''}, ${e.startLabel} to ${e.endLabel} (${formatDuration(e.years)})`;
        rows.push(`<g class="cvl-row"><title>${esc(tip)}</title>`);
        rows.push(`<rect class="cvl-hit" x="${PAD - 8}" y="${ry}" width="${W - 2 * PAD + 16}" height="${ROW_H}" rx="6"/>`);
        rows.push(`<text class="cvl-ink" x="${PAD}" y="${titleY}" font-size="13.5" font-weight="550">${esc(fit(primary, LABEL_W, 13.5))}</text>`);
        if (secondary) rows.push(`<text class="cvl-ink2" x="${PAD}" y="${orgY}" font-size="12">${esc(fit(secondary, LABEL_W, 12))}</text>`);
        rows.push(`<rect class="${cls}" x="${x1.toFixed(1)}" y="${mid - BAR_H / 2}" width="${(x2 - x1).toFixed(1)}" height="${BAR_H}" rx="4"/>`);
        if (e.ongoing) rows.push(`<circle class="cvl-ring ${cls}" cx="${x2.toFixed(1)}" cy="${mid}" r="5"/>`);
        const labelX = x2 + (e.ongoing ? 12 : 8);
        rows.push(`<text class="cvl-ink2" x="${labelX.toFixed(1)}" y="${mid + 4}" font-size="12">${esc(formatDuration(e.years))}</text>`);
        rows.push('</g>');
        ry += ROW_H;
      }
    }
    // gridlines and ticks first so rows draw above them
    const grid = [];
    for (const t of data.axis.ticks) {
      const gx = xOf(t).toFixed(1);
      grid.push(`<line class="cvl-grid" x1="${gx}" y1="${axisY}" x2="${gx}" y2="${ry}"/>`);
      grid.push(`<text class="cvl-ink2" x="${gx}" y="${axisY - 8}" font-size="11.5" text-anchor="middle">${t}</text>`);
    }
    out.push(...grid, ...rows);
    y = ry;
  }

  // Skills by years used
  const shown = data.skills.filter((s) => s.years > 0).slice(0, MAX_SKILL_BARS);
  if (shown.length) {
    y += 30;
    out.push(`<text class="cvl-ink" x="${PAD}" y="${y}" font-size="15" font-weight="600">Skills by years used on the job</text>`);
    const top = Math.max(...shown.map((s) => s.years));
    const scaleMax = Math.max(1, Math.ceil(top));
    const sx = (v) => X0 + (v / scaleMax) * (X1 - X0);
    const axisY = y + 26;
    let sy = axisY + 10;
    const bars = [];
    for (const s of shown) {
      const mid = narrow ? sy + 30 : sy + SKILL_ROW_H / 2;
      const w = Math.max(6, sx(s.years) - X0);
      const tip = `${s.name}: ${formatDuration(s.years)} across ${s.roles} role${s.roles === 1 ? '' : 's'}`;
      bars.push(`<g class="cvl-row"><title>${esc(tip)}</title>`);
      bars.push(`<rect class="cvl-hit" x="${PAD - 8}" y="${sy}" width="${W - 2 * PAD + 16}" height="${SKILL_ROW_H}" rx="6"/>`);
      bars.push(`<text class="cvl-ink" x="${PAD}" y="${narrow ? sy + 16 : mid + 4.5}" font-size="13.5">${esc(fit(s.name, LABEL_W, 13.5))}</text>`);
      bars.push(`<path class="cvl-work" d="${barPath(X0, mid - BAR_H / 2, w, BAR_H, 4)}"/>`);
      bars.push(`<text class="cvl-ink2" x="${(X0 + w + 8).toFixed(1)}" y="${mid + 4}" font-size="12">${formatYears(s.years)} yrs</text>`);
      bars.push('</g>');
      sy += SKILL_ROW_H;
    }
    const step = scaleMax <= 8 ? 1 : scaleMax <= 16 ? 2 : 5;
    for (const t of tickYears(0, scaleMax).filter((v) => v % step === 0)) {
      const gx = sx(t).toFixed(1);
      out.push(`<line class="${t === 0 ? 'cvl-axis' : 'cvl-grid'}" x1="${gx}" y1="${axisY}" x2="${gx}" y2="${sy}"/>`);
      out.push(`<text class="cvl-ink2" x="${gx}" y="${axisY - 8}" font-size="11.5" text-anchor="middle">${t}</text>`);
    }
    out.push(...bars);
    y = sy;
    const hidden = data.skills.filter((s) => s.years > 0).length - shown.length;
    if (hidden > 0) {
      y += 18;
      out.push(`<text class="cvl-ink2" x="${PAD}" y="${y}" font-size="12">+${hidden} more in the table view</text>`);
    }
  }

  // Skills listed but not tied to a role
  if (data.extraSkills.length) {
    y += 30;
    out.push(`<text class="cvl-ink" x="${PAD}" y="${y}" font-size="15" font-weight="600">Also listed</text>`);
    const maxW = W - 2 * PAD;
    let line = '';
    let lines = 0;
    let used = 0;
    const flush = () => {
      y += 20;
      out.push(`<text class="cvl-ink2" x="${PAD}" y="${y}" font-size="13">${esc(line)}</text>`);
      lines += 1;
      line = '';
    };
    for (const s of data.extraSkills) {
      const next = line ? `${line}  ·  ${s}` : s;
      if (textWidth(next, 13) > maxW && line) {
        if (lines >= 2) break;
        flush();
        line = s;
      } else {
        line = next;
      }
      used += 1;
    }
    if (line && lines < 3) flush();
    const rest = data.extraSkills.length - used;
    if (rest > 0) {
      y += 18;
      out.push(`<text class="cvl-ink2" x="${PAD}" y="${y}" font-size="12">+${rest} more in the table view</text>`);
    }
  }

  // Footer
  y += 26;
  if (footer) {
    out.push(`<line class="cvl-grid" x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"/>`);
    y += 22;
    out.push(`<text class="cvl-ink2" x="${PAD}" y="${y}" font-size="12">${esc(fit(footer, W - 2 * PAD, 12))}</text>`);
  }
  const height = y + 18;

  const label = summaryText(data);
  return (
    `<svg class="cvl-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-labelledby="cvl-t cvl-d" style="max-width:100%;height:auto">` +
    `<title id="cvl-t">${esc(data.name)}: CV overview</title><desc id="cvl-d">${esc(label)}</desc>` +
    `<style>${styleBlock(theme)}</style>` +
    `<rect class="cvl-bg" width="${W}" height="${height}" rx="14"/>` +
    out.join('') +
    '</svg>'
  );
}

/** Same data as the chart, as plain tables. The accessible alternative to the SVG. */
export function renderCvTable(data) {
  const parts = [];
  const rows = (list) =>
    list
      .map(
        (e) =>
          `<tr><td>${esc(e.title || e.org)}</td><td>${esc(e.title ? e.org : '')}</td><td>${esc(e.startLabel)}</td><td>${esc(e.endLabel)}</td><td>${esc(formatDuration(e.years))}</td></tr>`,
      )
      .join('');
  const head = '<thead><tr><th scope="col">Role</th><th scope="col">Organization</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Length</th></tr></thead>';
  if (data.work.length) parts.push(`<h3>Experience</h3><table class="cvl-table">${head}<tbody>${rows(data.work)}</tbody></table>`);
  if (data.edu.length) parts.push(`<h3>Education</h3><table class="cvl-table">${head}<tbody>${rows(data.edu)}</tbody></table>`);
  if (data.skills.length) {
    const body = data.skills
      .map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(formatDuration(s.years))}</td><td>${s.roles}</td></tr>`)
      .join('');
    parts.push(
      `<h3>Skills by years used on the job</h3><table class="cvl-table"><thead><tr><th scope="col">Skill</th><th scope="col">Years used</th><th scope="col">Roles</th></tr></thead><tbody>${body}</tbody></table>`,
    );
  }
  if (data.extraSkills.length) parts.push(`<h3>Also listed</h3><p>${data.extraSkills.map(esc).join(', ')}</p>`);
  return parts.join('');
}
