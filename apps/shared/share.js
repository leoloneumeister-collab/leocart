// One share sheet for every app: native share when the phone has it, plus copy link, QR code and
// direct links for the chat apps families actually use.
import qrcode from './vendor/qrcode.mjs';

export function absoluteUrl(rel = '') {
  return new URL(rel, location.href).href;
}

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true, alt: 'QR code for ' + text });
}

export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export function openShareSheet({ title, text, url }) {
  const full = text ? `${text} ${url}` : url;
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <div class="dlg">
      <h2></h2>
      <div class="qr"></div>
      <p class="small muted center">Point a phone camera at this code to open it.</p>
      <div class="urlbox"></div>
      <div class="share-links">
        <button class="btn primary" data-act="copy">Copy link</button>
        <button class="btn" data-act="native">Share...</button>
        <a class="btn" data-k="wa" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" data-k="sms">Text</a>
        <a class="btn" data-k="mail">Email</a>
        <button class="btn ghost close-wide" data-act="close">Close</button>
      </div>
    </div>`;
  dlg.querySelector('h2').textContent = title;
  dlg.querySelector('.qr').innerHTML = qrSvg(url);
  dlg.querySelector('.urlbox').textContent = url;
  dlg.querySelector('[data-k=wa]').href = 'https://wa.me/?text=' + encodeURIComponent(full);
  dlg.querySelector('[data-k=sms]').href = 'sms:?&body=' + encodeURIComponent(full);
  dlg.querySelector('[data-k=mail]').href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(full);
  const nativeBtn = dlg.querySelector('[data-act=native]');
  if (!navigator.share) nativeBtn.classList.add('hidden');
  dlg.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close' || e.target === dlg) dlg.close();
    if (act === 'copy') toast((await copyText(url)) ? 'Link copied' : 'Could not copy, select the link above');
    if (act === 'native') {
      try { await navigator.share({ title, text, url }); } catch { /* cancelled */ }
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

// Hook up every [data-share] button on the page. data-share holds a relative path ('' = this page).
export function wireShareButtons(defaults = {}) {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share]');
    if (!btn) return;
    const rel = btn.dataset.share;
    openShareSheet({
      title: btn.dataset.title || defaults.title || document.title,
      text: btn.dataset.text || defaults.text || '',
      url: absoluteUrl(rel),
    });
  });
}
