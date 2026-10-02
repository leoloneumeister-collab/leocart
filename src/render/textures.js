// All textures are drawn in code with the 2D canvas API. No image files anywhere.

import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Soft blobs that wrap around the tile edges so the texture repeats seamlessly. */
function blobs(ctx, size, count, palette, rMin, rMax, rng, alpha = 0.5) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rMin + rng() * (rMax - rMin);
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function speckle(ctx, w, h, count, colors, rng, size = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.25 + rng() * 0.5;
    ctx.fillRect(rng() * w, rng() * h, size * (0.5 + rng()), size * (0.5 + rng()));
  }
  ctx.globalAlpha = 1;
}

export function groundTexture(kind, seed = 5) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  if (kind === 'grass') {
    ctx.fillStyle = '#4fa84a';
    ctx.fillRect(0, 0, S, S);
    blobs(ctx, S, 40, ['#5dbb54', '#44993f', '#68c45a', '#3d8c3c'], 14, 40, rng, 0.5);
    speckle(ctx, S, S, 700, ['#7fd36c', '#2f7a34', '#8fe07a'], rng, 2);
  } else if (kind === 'sand') {
    ctx.fillStyle = '#d9a566';
    ctx.fillRect(0, 0, S, S);
    blobs(ctx, S, 36, ['#e5b878', '#c98f52', '#eec58b', '#bf8548'], 16, 46, rng, 0.45);
    speckle(ctx, S, S, 800, ['#f3d29b', '#a8733d', '#ffe3b0'], rng, 1.5);
    // wind ripples
    ctx.strokeStyle = 'rgba(160,100,50,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = rng() * S;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * 0.3, y + 8, S * 0.6, y - 8, S, y);
      ctx.stroke();
    }
  } else if (kind === 'concrete') {
    ctx.fillStyle = '#2a2c3a';
    ctx.fillRect(0, 0, S, S);
    blobs(ctx, S, 30, ['#323547', '#25283a', '#383c50'], 14, 40, rng, 0.5);
    speckle(ctx, S, S, 900, ['#4a4f66', '#1c1e2b'], rng, 1.5);
    ctx.strokeStyle = 'rgba(120,130,170,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }
  return toTexture(c);
}

/** Road: u runs across the road, v runs along it (one tile = 16 m). */
export function roadTexture(style) {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(11);
  if (style === 'neon') {
    ctx.fillStyle = '#16171f';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 2400, ['#262833', '#0e0f15', '#30323f'], rng, 2);
    // neon edge lines with glow
    const line = (x, color) => {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color;
      ctx.fillRect(x - 5, 0, 10, H);
      ctx.shadowBlur = 0;
    };
    line(18, '#ff3fb4');
    line(W - 18, '#3fe8ff');
    ctx.fillStyle = '#e8ecff';
    for (let y = 0; y < H; y += 128) ctx.fillRect(W / 2 - 4, y, 8, 64);
  } else if (style === 'desert') {
    ctx.fillStyle = '#9a7650';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 3000, ['#a98557', '#86643f', '#b79468'], rng, 2.4);
    // two darker tyre tracks and chipped edge lines
    ctx.fillStyle = 'rgba(70,45,25,0.22)';
    ctx.fillRect(W * 0.28, 0, W * 0.1, H);
    ctx.fillRect(W * 0.62, 0, W * 0.1, H);
    ctx.fillStyle = '#f1e2c4';
    for (let y = 0; y < H; y += 64) {
      ctx.fillRect(10, y, 12, 40 + rng() * 14);
      ctx.fillRect(W - 22, y, 12, 40 + rng() * 14);
    }
    ctx.fillStyle = 'rgba(240,226,196,0.85)';
    for (let y = 0; y < H; y += 128) ctx.fillRect(W / 2 - 4, y, 8, 56);
  } else {
    ctx.fillStyle = '#4a4e57';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 3600, ['#5a5f69', '#3c4047', '#656b75'], rng, 2.2);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(14, 0, 9, H);
    ctx.fillRect(W - 23, 0, 9, H);
    for (let y = 0; y < H; y += 128) ctx.fillRect(W / 2 - 5, y, 10, 64);
  }
  return toTexture(c);
}

/** Alternating blocks for kerbs (u across, v along, one tile = 4 m). */
export function kerbTexture(a, b) {
  const c = makeCanvas(64, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  ctx.fillRect(0, 64, 64, 64);
  return toTexture(c);
}

/** Barrier wall: horizontal stripes of two colours so it reads as a crash barrier. */
export function barrierTexture(a, b, glow = false) {
  const c = makeCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 128, 6);
  ctx.fillRect(0, 58, 128, 6);
  if (glow) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 28, 128, 8);
  }
  return toTexture(c);
}

export function checkerTexture() {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  const n = 8;
  const sw = 256 / n;
  const sh = 64 / 2;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * sw, y * sh, sw, sh);
    }
  }
  return toTexture(c, { repeat: false });
}

/** Boost pad: chevrons pointing along the direction of travel (v increases forward). */
export function boostTexture() {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#10182a';
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 4; i++) {
    const y = i * 64 + 8;
    const g = ctx.createLinearGradient(0, y, 0, y + 50);
    g.addColorStop(0, '#ffcf3a');
    g.addColorStop(1, '#ff7a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(10, y + 50);
    ctx.lineTo(64, y);
    ctx.lineTo(118, y + 50);
    ctx.lineTo(118, y + 32);
    ctx.lineTo(64, y - 18);
    ctx.lineTo(10, y + 32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 250);
  return toTexture(c);
}

/** Lit windows for city buildings (u across, v up). */
export function windowTexture(seed = 3) {
  const W = 128;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  ctx.fillStyle = '#12142a';
  ctx.fillRect(0, 0, W, H);
  const cols = 6;
  const rows = 16;
  const cw = W / cols;
  const rh = H / rows;
  const warm = ['#ffd98a', '#ffc66b', '#9fe8ff', '#ffb0e0', '#fff2c4'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rng() < 0.42) {
        ctx.fillStyle = warm[Math.floor(rng() * warm.length)];
        ctx.globalAlpha = 0.65 + rng() * 0.35;
      } else {
        ctx.fillStyle = '#1d2142';
        ctx.globalAlpha = 1;
      }
      ctx.fillRect(x * cw + 3, y * rh + 3, cw - 6, rh - 6);
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

export function blobShadowTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

export function oilTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(8,6,16,0.96)');
  g.addColorStop(0.75, 'rgba(14,10,28,0.92)');
  g.addColorStop(1, 'rgba(14,10,28,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const rainbow = ctx.createLinearGradient(20, 20, 108, 108);
  rainbow.addColorStop(0, 'rgba(120,80,255,0.4)');
  rainbow.addColorStop(0.5, 'rgba(60,220,200,0.35)');
  rainbow.addColorStop(1, 'rgba(255,90,200,0.4)');
  ctx.fillStyle = rainbow;
  ctx.beginPath();
  ctx.ellipse(50, 48, 26, 12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, { repeat: false });
}

/** Item box face: a bold question mark. */
export function itemBoxTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.0)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 96px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillText('?', 64, 70);
  return toTexture(c, { repeat: false });
}

export function bannerTexture(text, bg = '#e8341c', fg = '#ffffff') {
  const c = makeCanvas(512, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = fg;
  ctx.font = '900 64px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 16; i++) ctx.fillRect(i * 32, 0, 16, 8);
  return toTexture(c, { repeat: false });
}

/**
 * Equirectangular sky. Gradient, sun glow and soft clouds only; stars and mountains are
 * real geometry so they stay sharp.
 */
export function skyTexture(theme) {
  const W = 2048;
  const H = 1024;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(theme.seed ?? 9);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [stop, col] of theme.sky) g.addColorStop(stop, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sun / moon glow
  if (theme.sun) {
    const sx = theme.sun.u * W;
    const sy = theme.sun.v * H;
    for (const [r, col] of theme.sun.glow) {
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.fillStyle = theme.sun.core;
    ctx.beginPath();
    ctx.arc(sx, sy, theme.sun.size, 0, Math.PI * 2);
    ctx.fill();
  }
  // clouds
  if (theme.clouds) {
    const { count, color, minY, maxY } = theme.clouds;
    for (let i = 0; i < count; i++) {
      const cx = rng() * W;
      const cy = (minY + rng() * (maxY - minY)) * H;
      const puffs = 5 + Math.floor(rng() * 6);
      const scale = 0.7 + rng() * 0.9;
      for (let p = 0; p < puffs; p++) {
        const px = cx + (p - puffs / 2) * 34 * scale + (rng() - 0.5) * 20;
        const py = cy + (rng() - 0.5) * 14 * scale;
        const r = (22 + rng() * 26) * scale;
        for (const ox of [-W, 0, W]) {
          const rg = ctx.createRadialGradient(px + ox, py, 0, px + ox, py, r);
          rg.addColorStop(0, color);
          rg.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
          ctx.fillStyle = rg;
          ctx.fillRect(px + ox - r, py - r, r * 2, r * 2);
        }
      }
    }
  }
  return toTexture(c, { repeat: false, srgb: true });
}
