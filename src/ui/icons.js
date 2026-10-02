// Inline SVG icons for items and UI. Drawn from scratch, no external assets.

const wrap = (inner) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

export const ITEM_ICONS = {
  bolt: wrap(`
    <defs><radialGradient id="gb" cx="40%" cy="35%"><stop offset="0" stop-color="#fff7c2"/><stop offset="1" stop-color="#ffb81f"/></radialGradient></defs>
    <path d="M6 24h14M4 32h18M6 40h14" stroke="#ffe27a" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <circle cx="38" cy="32" r="19" fill="url(#gb)" stroke="#c97a00" stroke-width="3"/>
    <path d="M42 16 30 35h8l-4 13 14-21h-9z" fill="#c25a00" stroke="#8a3d00" stroke-width="1.5" stroke-linejoin="round"/>`),
  seeker: wrap(`
    <path d="M10 46 28 28" stroke="#ffd0c0" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <g transform="rotate(-40 32 32)">
      <rect x="22" y="22" width="30" height="14" rx="6" fill="#e9eaf2" stroke="#6a6f85" stroke-width="2"/>
      <path d="M52 22q10 7 0 14z" fill="#ff4a3a" stroke="#a21f12" stroke-width="2"/>
      <path d="M26 22 20 14h10zM26 36l-6 8h10z" fill="#ff4a3a" stroke="#a21f12" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="38" cy="29" r="3" fill="#4ad8ff"/>
    </g>
    <circle cx="48" cy="16" r="9" fill="none" stroke="#ff4a3a" stroke-width="2.5"/><path d="M48 4v7M48 21v7M36 16h7M53 16h7" stroke="#ff4a3a" stroke-width="2.5" stroke-linecap="round"/>`),
  turbo: wrap(`
    <defs><linearGradient id="gt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffd23f"/></linearGradient></defs>
    <path d="M32 4c4 10 16 16 16 30a16 16 0 0 1-32 0c0-8 5-11 8-17 2 5 3 7 6 8-2-8-1-15 2-21z" fill="url(#gt)" stroke="#b83a0a" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 30c3 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 7-13z" fill="#fff4b0"/>`),
  trio: wrap(`
    <g fill="#ffb84a" stroke="#b86a0a" stroke-width="2.5" stroke-linejoin="round">
      <path d="M6 38 18 14l12 24-12-6z"/><path d="M22 50 34 26l12 24-12-6z" transform="translate(0 -4)"/><path d="M38 38 50 14l12 24-12-6z"/>
    </g>
    <g fill="#fff2b0"><path d="M18 22 24 34l-6-3-6 3z"/><path d="M50 22 56 34l-6-3-6 3z"/><path d="M34 32 40 44l-6-3-6 3z"/></g>`),
  oil: wrap(`
    <defs><radialGradient id="go" cx="35%" cy="30%"><stop offset="0" stop-color="#9a86ff"/><stop offset="1" stop-color="#2a1a66"/></radialGradient></defs>
    <path d="M32 5C20 22 12 31 12 42a20 20 0 0 0 40 0C52 31 44 22 32 5z" fill="url(#go)" stroke="#1a0f44" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="25" cy="38" rx="5" ry="9" fill="#fff" opacity=".35" transform="rotate(20 25 38)"/>
    <ellipse cx="32" cy="58" rx="18" ry="4" fill="#1a0f44" opacity=".45"/>`),
  aegis: wrap(`
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9af0ff"/><stop offset="1" stop-color="#2a9ad8"/></linearGradient></defs>
    <path d="M32 4 10 12v18c0 14 9 25 22 30 13-5 22-16 22-30V12z" fill="url(#ga)" stroke="#126a9a" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 16l4 9 10 1-7.5 6.5 2.5 10L32 37l-9 5.5 2.5-10L18 26l10-1z" fill="#fff" opacity=".9"/>`),
  comet: wrap(`
    <defs><linearGradient id="gc" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b0"/><stop offset="1" stop-color="#ff9a2a" stop-opacity="0"/></linearGradient></defs>
    <path d="M6 58 32 28l6 6z" fill="url(#gc)"/><path d="M14 54 38 32" stroke="#ffd23f" stroke-width="3" opacity=".6"/>
    <path d="M44 8l5.5 11.5 12.5 1.5-9.2 8.6 2.4 12.4L44 35.8l-11.2 6.2 2.4-12.4L26 21l12.5-1.5z" fill="#ffe066" stroke="#c98a00" stroke-width="3" stroke-linejoin="round"/>`),
  pulse: wrap(`
    <circle cx="32" cy="32" r="27" fill="none" stroke="#5dffb0" stroke-width="3" opacity=".45"/>
    <circle cx="32" cy="32" r="19" fill="none" stroke="#5dffb0" stroke-width="4" opacity=".75"/>
    <circle cx="32" cy="32" r="11" fill="#12331f" stroke="#5dffb0" stroke-width="4"/>
    <path d="M35 22 27 34h6l-3 9 9-13h-6z" fill="#b8ffd8"/>`),
};

export const EMPTY_ITEM = wrap(`<rect x="12" y="12" width="40" height="40" rx="9" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="3" stroke-dasharray="6 6"/>`);

export const ICONS = {
  trophy: wrap(`
    <path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#ffd23f" stroke="#b8860b" stroke-width="3"/>
    <path d="M18 12H8c0 10 4 15 11 16M46 12h10c0 10-4 15-11 16" fill="none" stroke="#b8860b" stroke-width="3"/>
    <rect x="28" y="36" width="8" height="10" fill="#e0a800"/><rect x="20" y="46" width="24" height="8" rx="2" fill="#b8860b"/>
    <path d="M32 14l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z" fill="#fff6c2"/>`),
};
