// The UI that ChatGPT and Claude render inside the chat for `visualize_cv`.
// It receives the normalized CV from the tool result and draws it with the same
// renderer the website demo uses.

import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { renderCvSvg, renderCvTable } from '../core/render.js';

const $ = (id) => document.getElementById(id);
const app = new App({ name: 'CV Lens', version: '0.1.0' });

let payload = null; // { cv, site }
let mode = 'chart';
let layout = 'wide';

// Under about 560px the wide chart shrinks to an unreadable blur, so switch to the stacked layout.
const pickLayout = () => ($('view').clientWidth < 560 ? 'narrow' : 'wide');

const hostLabel = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const footerFor = (site) => (site?.url ? `Made with CV Lens · ${hostLabel(site.url)}` : 'Made with CV Lens');

function flash(text) {
  $('flash').textContent = text;
  if (text) setTimeout(() => ($('flash').textContent === text ? ($('flash').textContent = '') : null), 3500);
}

function draw() {
  if (!payload) return;
  const { cv, site } = payload;
  $('status').hidden = true;
  $('bar').hidden = false;
  layout = pickLayout();
  $('view').innerHTML = mode === 'chart' ? renderCvSvg(cv, { theme: 'auto', footer: footerFor(site), layout }) : renderCvTable(cv);
  $('tab-chart').setAttribute('aria-pressed', String(mode === 'chart'));
  $('tab-table').setAttribute('aria-pressed', String(mode === 'table'));
  $('cta').hidden = !site?.url;
  $('notes').replaceChildren(
    ...cv.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })),
  );
}

function show(result) {
  const sc = result?.structuredContent;
  if (!sc?.cv) {
    const text = result?.content?.find((c) => c.type === 'text')?.text;
    $('status').hidden = false;
    $('status').textContent = text || 'Nothing to show.';
    return;
  }
  payload = sc;
  draw();
}

async function save() {
  if (!payload) return;
  const svg = renderCvSvg(payload.cv, { theme: 'light', footer: footerFor(payload.site) });
  const name = `${payload.cv.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cv'}-overview.svg`;
  try {
    const res = await app.downloadFile({
      contents: [{ type: 'resource', resource: { uri: `file:///${name}`, mimeType: 'image/svg+xml', text: svg } }],
    });
    if (!res?.isError) return flash('Saved');
  } catch {
    // Host does not support downloads. Fall through to a plain browser download.
  }
  try {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
      download: name,
    });
    document.body.append(a);
    a.click();
    a.remove();
  } catch {
    flash('This chat does not allow downloads');
  }
}

async function openSite() {
  const url = payload?.site?.url;
  if (!url) return;
  try {
    await app.openLink({ url });
  } catch {
    flash('Could not open the link');
  }
}

function applyHost(ctx) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
}

$('tab-chart').addEventListener('click', () => {
  mode = 'chart';
  draw();
});
$('tab-table').addEventListener('click', () => {
  mode = 'table';
  draw();
});
$('download').addEventListener('click', save);
$('cta').addEventListener('click', openSite);

app.ontoolresult = show;
app.onhostcontextchanged = applyHost;
app.ontoolcancelled = () => {
  $('status').textContent = 'Cancelled.';
};

// ChatGPT's older Apps SDK surface, in case a host only offers window.openai.
try {
  const initial = window.openai?.toolOutput;
  if (initial) show({ structuredContent: initial });
  window.addEventListener('openai:set_globals', (e) => {
    const out = e.detail?.globals?.toolOutput;
    if (out) show({ structuredContent: out });
  });
} catch {
  // not running in ChatGPT's legacy bridge
}

new ResizeObserver(() => {
  if (payload && mode === 'chart' && pickLayout() !== layout) draw();
}).observe($('view'));

await app.connect();
applyHost(app.getHostContext());
