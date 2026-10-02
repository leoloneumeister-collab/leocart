import './shared.js';
import { config } from './config.js';
import { normalizeCv } from '../core/normalize.js';
import { renderCvSvg, renderCvTable } from '../core/render.js';
import { sampleCv } from '../core/sample.js';

const $ = (id) => document.getElementById(id);
const hostLabel = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const footer = config.siteUrl ? `Made with ${config.brand} · ${hostLabel(config.siteUrl)}` : `Made with ${config.brand}`;

// ---- Demo -------------------------------------------------------------

let cv = normalizeCv(sampleCv);
let mode = 'chart';
let layout = 'wide';

// Under about 560px the wide chart shrinks to an unreadable blur, so switch to the stacked layout.
const pickLayout = () => ($('stage').clientWidth < 560 ? 'narrow' : 'wide');

function draw() {
  layout = pickLayout();
  $('stage').innerHTML = mode === 'chart' ? renderCvSvg(cv, { theme: 'auto', footer, layout }) : renderCvTable(cv);
  $('tab-chart').setAttribute('aria-pressed', String(mode === 'chart'));
  $('tab-table').setAttribute('aria-pressed', String(mode === 'table'));
  $('warnings').replaceChildren(...cv.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
}

function readJson() {
  let parsed;
  try {
    parsed = JSON.parse($('json').value);
  } catch (err) {
    $('problem').textContent = `That is not valid JSON yet: ${err.message}`;
    return;
  }
  $('problem').textContent = '';
  cv = normalizeCv(parsed);
  draw();
}

let timer;
$('json').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(readJson, 250);
});
$('reset').addEventListener('click', () => {
  $('json').value = JSON.stringify(sampleCv, null, 2);
  readJson();
});
$('tab-chart').addEventListener('click', () => {
  mode = 'chart';
  draw();
});
$('tab-table').addEventListener('click', () => {
  mode = 'table';
  draw();
});
$('save').addEventListener('click', () => {
  const svg = renderCvSvg(cv, { theme: 'light', footer });
  const slug = cv.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cv';
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
    download: `${slug}-overview.svg`,
  });
  document.body.append(a);
  a.click();
  a.remove();
});

$('json').value = JSON.stringify(sampleCv, null, 2);
draw();
new ResizeObserver(() => {
  if (mode === 'chart' && pickLayout() !== layout) draw();
}).observe($('stage'));

// ---- Install cards ----------------------------------------------------

for (const id of ['card-chatgpt', 'card-claude']) {
  const box = document.querySelector(`#${id} .urlbox`);
  if (!config.mcpUrl) {
    box.replaceWith(Object.assign(document.createElement('p'), { className: 'pending', textContent: 'The connector address will appear here as soon as the server is live.' }));
    continue;
  }
  const code = Object.assign(document.createElement('code'), { className: 'url', textContent: config.mcpUrl });
  const copy = Object.assign(document.createElement('button'), { type: 'button', className: 'btn small', textContent: 'Copy' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(config.mcpUrl);
      copy.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      copy.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 2500);
  });
  box.append(code, copy);
}

// ---- Offers -----------------------------------------------------------

const offers = $('offers');
for (const o of config.offers) {
  const card = Object.assign(document.createElement('div'), { className: `card${o.featured ? ' featured' : ''}` });
  const list = document.createElement('ul');
  list.append(...o.points.map((p) => Object.assign(document.createElement('li'), { textContent: p })));
  const live = Boolean(o.href || o.checkoutUrl);
  const button = Object.assign(document.createElement('a'), {
    className: `btn${o.featured ? ' primary' : ''}`,
    textContent: live ? o.cta : 'Coming soon',
  });
  if (live) {
    button.href = o.href ?? o.checkoutUrl;
    if (o.checkoutUrl) button.rel = 'noopener';
  } else {
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('role', 'link');
  }
  card.append(
    Object.assign(document.createElement('h3'), { textContent: o.name }),
    Object.assign(document.createElement('div'), { className: 'price', textContent: o.price }),
    Object.assign(document.createElement('p'), { className: 'note', textContent: o.note }),
    list,
    button,
  );
  offers.append(card);
}
