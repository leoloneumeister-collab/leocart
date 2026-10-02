"""Tidehold's buildings, walls, obstacles and props, modelled procedurally in Blender.

One GLB per building type, holding up to three upgrade tiers (tier 1 = levels 1-2, 2 = 3-4, 3 = 5-7)
as separate root nodes: keep_t1, keep_t2, ... Parts that move are separate objects named
`<root>__<part>` (turret, barrel, flame, shards ...). Team banners are named `<root>__banner...` so the
game can colour them. Looping animations are exported as clips named `<root>_loop`.

Run:  python buildings.py [type ...] [--preview]
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

import lib
from lib import Mesher, rgb, shade, mixc, new_empty, obj_anim

# ---------- palette ----------
STONE = rgb('#d8cfbd')
STONE2 = rgb('#bdb3a0')
STONE_DK = rgb('#948c7d')
SLATE = rgb('#8e949f')
WOOD = rgb('#a9733d')
WOOD_DK = rgb('#6e4726')
WOOD_LT = rgb('#d09a62')
PLASTER = rgb('#e8d9b8')
DIRT = rgb('#a88a5c')
GRASS_C = rgb('#9fc77c')
IRON = rgb('#5d636e')
IRON_LT = rgb('#8b929e')
GOLD = rgb('#f2c235')
GOLD_DK = rgb('#c99412')
CANVAS = rgb('#efe6cf')
CRYS_CY = rgb('#7ad7ff')
CRYS_VI = rgb('#b58cff')
BLACKISH = rgb('#1c1612')
RED = rgb('#d8453f')
BLUE = rgb('#3d7be0')
WHITE = rgb('#f4f1e8')
LEATHER_DK = rgb('#4b3321')

THEMES = {
    1: dict(roof=rgb('#c9573b'), roof_dk=rgb('#9d3f2b'), trim=rgb('#ead9b6'), accent=rgb('#f0b04a'), metal=rgb('#9b6a3a')),
    2: dict(roof=rgb('#3f78c0'), roof_dk=rgb('#2f5a94'), trim=rgb('#dce7f5'), accent=rgb('#f0d36a'), metal=rgb('#6f8aa8')),
    3: dict(roof=rgb('#7d52c8'), roof_dk=rgb('#5b3a9b'), trim=rgb('#f0e6ff'), accent=rgb('#ffd45a'), metal=rgb('#d9a830')),
}

ASSETS = {}   # type -> dict(tier -> root empty)


# ---------- shared pieces ----------

def new_root(btype, tier):
    name = f'{btype}_t{tier}'
    root = new_empty(name)
    ASSETS.setdefault(btype, {})[tier] = root
    return name, root


def box_xyxy(m, x0, y0, x1, y1, z0, z1, color, bevel=0.02, **kw):
    return m.box((abs(x1 - x0), abs(y1 - y0), z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), color=color, bevel=bevel, base_z=True, **kw)


def crenels(m, x0, y0, x1, y1, z, color, size=0.17, h=0.16, thick=0.2, gap=0.15):
    """Battlements along a straight wall from (x0,y0) to (x1,y1)."""
    L = math.hypot(x1 - x0, y1 - y0)
    n = max(1, int(L / (size + gap)))
    ang = math.atan2(y1 - y0, x1 - x0)
    for i in range(n):
        t = (i + 0.5) / n
        m.box((size, thick, h), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z), rot=(0, 0, ang), color=color, bevel=0.012, base_z=True, grad=0.1)


def tower(m, x, y, r, h, roof_h, th, z0=0.16, color=None, trim=True, windows=True, segs=12, roof=None, finial=True, spire=0.0):
    color = color or rgb('#ddd4c1')
    m.cyl(r, h, (x, y, z0), color=color, segs=segs, r2=r * 0.94, jitter=0.02)
    if trim:
        m.cyl(r + 0.04, 0.07, (x, y, z0 + h * 0.7), color=th['trim'], segs=segs, grad=0.05)
    m.cyl(r + 0.09, 0.11, (x, y, z0 + h - 0.02), color=shade(color, 0.85), segs=segs)
    if windows:
        for (dx, dy, rz) in ((0, -r * 0.93, 0), (r * 0.93, 0, math.pi / 2), (-r * 0.93, 0, math.pi / 2)):
            m.box((0.1, 0.06, 0.22), (x + dx, y + dy, z0 + h * 0.45), rot=(0, 0, rz), color=BLACKISH, bevel=0.01, base_z=True, grad=0, jitter=0)
    m.cyl(r + 0.13, roof_h, (x, y, z0 + h + 0.07), color=roof or th['roof'], segs=segs, r2=0.02)
    if finial:
        m.cyl(0.015, 0.2 + spire, (x, y, z0 + h + 0.07 + roof_h - 0.02), color=IRON, segs=5, grad=0)
        m.sphere(0.045, (x, y, z0 + h + 0.07 + roof_h + 0.2 + spire), color=th['accent'], segs=6, grad=0, jitter=0)


def window(m, x, y, z, face='front', w=0.15, h=0.26, glow=None, trim=STONE2):
    """Arched window on a wall face. face: front (-y), side (+x), back (+y)."""
    rz = {'front': 0.0, 'side': math.pi / 2, 'back': 0.0}[face]
    ox, oy = {'front': (0, -0.02), 'side': (0.02, 0), 'back': (0, 0.02)}[face]
    m.box((w + 0.05, 0.05, h + 0.05), (x + ox, y + oy, z), rot=(0, 0, rz), color=trim, bevel=0.01, base_z=True, grad=0, jitter=0)
    ox2, oy2 = {'front': (0, -0.035), 'side': (0.035, 0), 'back': (0, 0.035)}[face]
    m.box((w, 0.05, h), (x + ox2, y + oy2, z + 0.0), rot=(0, 0, rz), color=BLACKISH, base_z=True, grad=0, jitter=0, mat=glow or 'base')


def door(m, x, y, z, w, h, face='front', color=WOOD_DK, frame=STONE2, arch=True):
    rz = {'front': 0.0, 'side': math.pi / 2, 'back': 0.0}[face]
    sgn = {'front': -1, 'side': 1, 'back': 1}[face]
    dx = {'front': 0, 'side': 1, 'back': 0}[face] * 0.0
    px = {'front': (x, y - 0.0), 'side': (x, y), 'back': (x, y)}[face]
    off = Vector((0, -0.03, 0)) if face == 'front' else (Vector((0.03, 0, 0)) if face == 'side' else Vector((0, 0.03, 0)))
    c = Vector((x, y, z)) + off
    m.box((w + 0.12, 0.06, h + 0.06), tuple(c), rot=(0, 0, rz), color=frame, bevel=0.015, base_z=True, grad=0)
    c2 = c + (off * 0.7)
    m.box((w, 0.06, h), tuple(c2), rot=(0, 0, rz), color=color, bevel=0.01, base_z=True, grad=0.1)
    if arch:
        m.cyl(w / 2, 0.06, (c2.x, c2.y, z + h), rot=(math.pi / 2 if face != 'side' else math.pi / 2, 0, rz if face == 'side' else 0), color=color,
              segs=8, base_z=False, smooth=True, grad=0) if False else None
    # planks
    for i in (-1, 0, 1):
        k = Vector((i * w * 0.28, 0, 0))
        if face == 'side':
            k = Vector((0, i * w * 0.28, 0))
        m.box((0.02, 0.07, h * 0.94) if face != 'side' else (0.07, 0.02, h * 0.94), tuple(c2 + k + off * 0.3), color=shade(color, 0.7), base_z=True, grad=0, jitter=0)


def barrel(m, x, y, z=0.0, r=0.11, h=0.22, color=WOOD):
    m.cyl(r, h, (x, y, z), color=color, segs=9, r2=r * 0.92)
    for zz in (0.25, 0.75):
        m.cyl(r * 1.04, 0.025, (x, y, z + h * zz - 0.012), color=IRON, segs=9, grad=0)


def crate(m, x, y, z=0.0, s=0.22, rot=0.0, color=WOOD_LT):
    m.box((s, s, s), (x, y, z), rot=(0, 0, rot), color=color, bevel=0.012, base_z=True)
    m.box((s * 1.02, s * 0.14, s * 1.02), (x, y, z), rot=(0, 0, rot), color=WOOD_DK, bevel=0.005, base_z=True, grad=0)


def pole_flag(m, root, name, x, y, z0, height, w=0.5, h=0.3, pole_col=IRON, finial=GOLD):
    """Pole in the static mesh, team banner as its own object."""
    m.cyl(0.022, height, (x, y, z0), color=pole_col, segs=6, grad=0)
    m.sphere(0.04, (x, y, z0 + height), color=finial, segs=6, grad=0, jitter=0)
    flag(root, name, x, y, z0 + height - 0.04, w, h)


def flag(root, name, x, y, z, w=0.5, h=0.3, cols=4):
    """Banner pointing to +x from the pole at (x, y, z) top, with a swallow tail."""
    fm = Mesher(name, seed=9)
    rows = []
    for i in range(cols + 1):
        t = i / cols
        tail = 0.0
        rows.append(((x + w * t, y, z), (x + w * t, y, z - h * (1.0 - 0.0 * t - (0.35 * t if i == cols else 0)))))
    fm.tri_strip(rows, color=(1, 1, 1), mat='banner')
    # a small emblem square near the pole
    fm.quad([(x + w * 0.2, y - 0.002, z - h * 0.35), (x + w * 0.5, y - 0.002, z - h * 0.35), (x + w * 0.5, y - 0.002, z - h * 0.75), (x + w * 0.2, y - 0.002, z - h * 0.75)],
            color=(1, 1, 1), mat='banner')
    return fm.build(parent=root, origin=(x, y, z))


def hanging_banner(root, name, x, y, z, w=0.3, h=0.7):
    fm = Mesher(name, seed=9)
    rows = []
    for i in range(5):
        t = i / 4
        zz = z - h * t
        rows.append(((x - w / 2, y, zz), (x + w / 2, y, zz if i < 4 else zz - 0.1)))
    fm.tri_strip(rows, color=(1, 1, 1), mat='banner')
    return fm.build(parent=root, origin=(x, y, z))


def stack_coins(m, x, y, z, n=4, r=0.1, color=GOLD):
    for i in range(n):
        m.cyl(r, 0.035, (x, y, z + i * 0.04), color=color if i % 2 else shade(color, 0.92), segs=8, grad=0, jitter=0.01)


def finish(m, root, **kw):
    return m.build(parent=root, **kw)


# ---------- KEEP (4 x 4) ----------

def keep(t):
    name, root = new_root('keep', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    zb = 0.16
    m.box((3.94, 3.94, zb), (0, 0, 0), color=STONE_DK, bevel=0.035, base_z=True)
    m.box((3.44, 3.34, 0.03), (0, 0, zb), color=GRASS_C, base_z=True, jitter=0.05, grad=0)
    m.box((0.8, 1.8, 0.04), (0, -1.1, zb), color=rgb('#d4c7a8'), base_z=True, grad=0, bevel=0.01)
    wh = 0.85 + (0.1 if t >= 2 else 0)
    wc = STONE2
    # curtain walls with a gate gap in front
    box_xyxy(m, -1.8, 1.45, 1.8, 1.75, zb, zb + wh, wc)
    box_xyxy(m, -1.9, -1.55, -1.6, 1.55, zb, zb + wh, wc)
    box_xyxy(m, 1.6, -1.55, 1.9, 1.55, zb, zb + wh, wc)
    box_xyxy(m, -1.85, -1.75, -0.55, -1.45, zb, zb + wh, wc)
    box_xyxy(m, 0.55, -1.75, 1.85, -1.45, zb, zb + wh, wc)
    top = zb + wh
    crenels(m, -1.8, 1.6, 1.8, 1.6, top, wc)
    crenels(m, -1.75, -1.6, -1.75, 1.6, top, wc)
    crenels(m, 1.75, -1.6, 1.75, 1.6, top, wc)
    crenels(m, -1.8, -1.6, -0.6, -1.6, top, wc)
    crenels(m, 0.6, -1.6, 1.8, -1.6, top, wc)
    # gatehouse arch
    for sx in (-1, 1):
        m.box((0.2, 0.44, wh + 0.35), (sx * 0.62, -1.6, zb), color=STONE, bevel=0.02, base_z=True)
        m.box((0.28, 0.5, 0.1), (sx * 0.62, -1.6, zb + wh + 0.35), color=STONE_DK, bevel=0.015, base_z=True)
    m.box((1.5, 0.42, 0.2), (0, -1.6, zb + wh + 0.0), color=STONE, bevel=0.02, base_z=True)
    m.box((0.9, 0.08, 0.78), (0, -1.55, zb), color=WOOD_DK, bevel=0.012, base_z=True)
    for i in range(-2, 3):
        m.box((0.03, 0.1, 0.75), (i * 0.17, -1.6, zb), color=IRON, base_z=True, grad=0, jitter=0)
    for z in (0.28, 0.58):
        m.box((0.9, 0.1, 0.03), (0, -1.6, zb + z), color=IRON, base_z=True, grad=0, jitter=0)
    # corner towers
    tr = 0.42 + 0.03 * t
    for sx in (-1, 1):
        for sy in (-1, 1):
            tower(m, sx * 1.72, sy * 1.72, tr, 1.55 + 0.15 * t, 0.85 + 0.1 * t, th, z0=zb)
    # the donjon
    dz = zb
    dh = 1.45 + 0.35 * t
    m.box((1.9, 1.7, dh), (0, 0.35, dz), color=rgb('#ddd5c3'), bevel=0.035, base_z=True)
    m.box((2.0, 1.8, 0.12), (0, 0.35, dz + dh * 0.62), color=STONE2, bevel=0.02, base_z=True)
    top2 = dz + dh
    crenels(m, -0.9, -0.5, 0.9, -0.5, top2, STONE2)
    crenels(m, -0.9, 1.2, 0.9, 1.2, top2, STONE2)
    crenels(m, -0.95, -0.45, -0.95, 1.15, top2, STONE2, thick=0.18)
    crenels(m, 0.95, -0.45, 0.95, 1.15, top2, STONE2, thick=0.18)
    m.box((1.4, 1.2, 0.9 + 0.2 * t), (0, 0.35, top2), color=rgb('#e2dac8'), bevel=0.03, base_z=True)
    up = top2 + 0.9 + 0.2 * t
    m.pyramid(1.8, 1.6, 0.95 + 0.15 * t, (0, 0.35, up), color=th['roof'], top=0.0)
    m.pyramid(1.9, 1.7, 0.06, (0, 0.35, up - 0.02), color=th['roof_dk'], top=0.95)
    pole_flag(m, root, f'{name}__banner', 0, 0.35, up + 0.9 + 0.15 * t, 0.65 + 0.15 * t, w=0.7, h=0.42)
    # donjon face details
    door(m, 0, -0.5, dz, 0.5, 0.75, 'front')
    m.box((0.95, 0.4, 0.07), (0, -0.7, dz), color=STONE_DK, bevel=0.01, base_z=True)
    m.box((0.7, 0.3, 0.07), (0, -0.62, dz + 0.07), color=STONE_DK, bevel=0.01, base_z=True)
    glow = 'glow_yellow' if t == 3 else None
    for sx in (-0.62, 0.62):
        window(m, sx, -0.5, dz + 0.55, 'front', glow=glow)
    for sx in (-0.4, 0.4):
        window(m, sx, -0.25, top2 + 0.2, 'front', w=0.16, h=0.3, glow=glow)
    for sy in (0.0, 0.7):
        window(m, 0.95, sy, dz + 0.6, 'side', glow=glow)
        window(m, 0.72, sy, top2 + 0.2, 'side', glow=glow)
    if t >= 2:
        # gold band and corner turrets
        m.box((1.95, 1.75, 0.07), (0, 0.35, dz + dh - 0.05), color=th['accent'], bevel=0.01, base_z=True, grad=0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                tower(m, sx * 0.98, 0.35 + sy * 0.8, 0.17, 0.5, 0.35, th, z0=top2 - 0.02, windows=False, trim=False, segs=8, finial=False)
    if t == 3:
        for sx in (-1, 1):
            m.sphere(0.12, (sx * 0.98, 0.35 - 0.8, top2 + 0.5 + 0.5), color=GOLD, segs=8, grad=0.1)
            m.sphere(0.12, (sx * 0.98, 0.35 + 0.8, top2 + 0.5 + 0.5), color=GOLD, segs=8, grad=0.1)
    # courtyard props
    barrel(m, -1.1, -1.05, zb)
    barrel(m, -1.3, -0.9, zb)
    crate(m, 1.15, -1.1, zb, 0.26, 0.3)
    crate(m, 1.0, -0.82, zb, 0.2, 0.9)
    m.cyl(0.2, 0.18, (-1.15, 0.6, zb), color=STONE2, segs=10)
    m.cyl(0.15, 0.04, (-1.15, 0.6, zb + 0.15), color=rgb('#2f66c9'), segs=10, grad=0)
    if t >= 2:
        box_xyxy(m, -1.5, -0.2, -1.0, 1.1, zb, zb + 0.55, PLASTER)
        m.gable(0.6, 1.5, 0.35, (-1.25, 0.45, zb + 0.55), rot=(0, 0, math.pi / 2), color=th['roof'], overhang=0.06)
    ob = finish(m, root)
    # hanging banners on the gatehouse
    hanging_banner(root, f'{name}__banner_gate', -0.62, -1.84, zb + wh + 0.3, 0.26, 0.55)
    hanging_banner(root, f'{name}__banner_gate2', 0.62, -1.84, zb + wh + 0.3, 0.26, 0.55)
    return root


# ---------- GOLD MINE (3 x 3) ----------

def gmine(t):
    name, root = new_root('gmine', t)
    th = THEMES[t]
    rng = random.Random(40 + t)
    m = Mesher(f'{name}_body', seed=t)
    rock = rgb('#8f8b86')
    m.cyl(1.45, 0.1, (0, 0, 0), color=DIRT, segs=16, jitter=0.04)
    # craggy mound: a pile of tilted boxes
    for i in range(14):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.0, 0.8)
        s = rng.uniform(0.55, 0.95)
        m.box((s, s * rng.uniform(0.8, 1.2), s * rng.uniform(0.7, 1.1)), (math.cos(a) * d * 0.9, 0.35 + math.sin(a) * d * 0.7, 0.1 + rng.uniform(0, 0.35) + (0.5 - d) * 0.5),
              rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3)), color=mixc(rock, rgb('#b3aea6'), rng.uniform(0, 0.5)), bevel=0.06, base_z=True)
    m.box((0.9, 0.8, 0.7), (0.0, 0.5, 0.95), rot=(0.1, 0.05, 0.5), color=rgb('#a6a199'), bevel=0.06, base_z=True)
    # gold veins and nuggets
    for i in range(7 + 2 * t):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.25, 0.85)
        m.box((0.13, 0.13, 0.13), (math.cos(a) * d, 0.3 + math.sin(a) * d * 0.7, 0.15 + rng.uniform(0.0, 0.9)), rot=(rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 1)), color=GOLD, bevel=0.025,
              grad=0, jitter=0.05, base_z=True)
    # timber-framed entrance on the front
    for sx in (-1, 1):
        m.box((0.12, 0.12, 0.95), (sx * 0.42, -0.62, 0.1), color=WOOD, bevel=0.015, base_z=True)
    m.box((1.1, 0.14, 0.14), (0, -0.62, 1.0), color=WOOD, bevel=0.015, base_z=True)
    m.box((0.14, 0.14, 0.4), (0, -0.62, 1.1), color=WOOD_DK, bevel=0.015, base_z=True)
    m.box((0.72, 0.5, 0.88), (0, -0.4, 0.1), color=BLACKISH, bevel=0.01, base_z=True, grad=0, jitter=0)
    m.box((0.62, 0.1, 0.08), (0, -0.66, 0.84), rot=(0, 0, 0), color=WOOD_DK, base_z=True, grad=0)
    # rails and sleepers
    for i in range(6):
        m.box((0.55, 0.07, 0.03), (0, -0.85 - i * 0.2, 0.1), color=WOOD_DK, base_z=True, grad=0)
    for sx in (-1, 1):
        m.box((0.04, 1.3, 0.04), (sx * 0.2, -1.2, 0.13), color=IRON_LT, base_z=True, grad=0, jitter=0)
    # ore cart full of gold
    cx, cy = 0.2, -1.2
    m.box((0.5, 0.64, 0.26), (cx - 0.2, cy, 0.22), color=WOOD, bevel=0.02, base_z=True, taper=1.12)
    m.box((0.52, 0.66, 0.04), (cx - 0.2, cy, 0.46), color=IRON, bevel=0.01, base_z=True, grad=0)
    for dx in (-0.2, 0.2):
        for dy in (-0.22, 0.22):
            m.cyl(0.075, 0.05, (cx - 0.2 + dx * 1.4, cy + dy * 1.1, 0.14), rot=(0, math.pi / 2, 0), color=IRON, segs=8, base_z=False, grad=0)
    for i in range(9):
        m.sphere(0.075, (cx - 0.2 + rng.uniform(-0.17, 0.17), cy + rng.uniform(-0.24, 0.24), 0.52 + rng.uniform(0, 0.08)), color=mixc(GOLD, rgb('#fff1a0'), rng.uniform(0, 0.4)), segs=6, grad=0.1)
    # lantern
    m.box((0.05, 0.05, 0.16), (0.52, -0.62, 0.78), color=IRON, base_z=True, grad=0)
    m.sphere(0.05, (0.52, -0.62, 0.9), color=(1, 0.8, 0.3), segs=6, mat='glow_yellow', grad=0, jitter=0)
    # sacks, crossed pickaxes sign
    for (sx, sy) in ((-1.0, -0.9), (-0.85, -1.05)):
        m.sphere(0.17, (sx, sy, 0.2), scale=(1, 1, 1.2), color=rgb('#c9b27a'), segs=7)
    for sgn in (-1, 1):
        m.box((0.04, 0.04, 0.55), (-0.9, -0.55, 0.3), rot=(0, sgn * 0.7, 0), color=WOOD_DK, base_z=True, grad=0)
        m.box((0.3, 0.05, 0.05), (-0.9 + sgn * 0.1, -0.55, 0.78), rot=(0, sgn * 0.7, 0), color=IRON_LT, base_z=True, grad=0)
    # headframe (winch tower) on the right
    wx, wy = 1.0, 0.2
    hh = 1.2 + 0.4 * t
    for sy in (-1, 1):
        for sx in (-1, 1):
            m.box((0.08, 0.08, hh), (wx + sx * 0.28, wy + sy * 0.28, 0.1), rot=(0, 0, 0), color=WOOD_DK if t < 3 else IRON, bevel=0.01, base_z=True, taper=0.6)
    for z in (0.5, 0.9):
        m.box((0.7, 0.07, 0.07), (wx, wy - 0.24, 0.1 + z * hh / 1.6), color=WOOD, base_z=True, grad=0)
        m.box((0.7, 0.07, 0.07), (wx, wy + 0.24, 0.1 + z * hh / 1.6), color=WOOD, base_z=True, grad=0)
    m.box((0.78, 0.5, 0.08), (wx, wy, 0.1 + hh), color=th['roof_dk'] if t > 1 else WOOD_DK, bevel=0.015, base_z=True)
    m.pyramid(0.9, 0.7, 0.3, (wx, wy, 0.18 + hh), color=th['roof'])
    ob = finish(m, root)
    # spinning pulley wheel + bobbing bucket
    wm = Mesher(f'{name}__wheel', seed=1)
    wm.cyl(0.26, 0.06, (0, 0, 0), rot=(0, math.pi / 2, 0), color=th['metal'], segs=10, base_z=False, grad=0)
    for k in range(4):
        wm.box((0.05, 0.04, 0.56), (0, 0, 0), rot=(k * math.pi / 4, 0, 0), color=IRON, grad=0)
    w = wm.build(parent=root, origin=(wx, wy, 0.1 + hh - 0.22))
    obj_anim(w, f'{name}_loop', 48, lambda u: {'r': (u * math.tau, 0, 0)})
    bm_ = Mesher(f'{name}__bucket', seed=1)
    bm_.cyl(0.1, 0.16, (0, 0, -0.16), color=WOOD, r2=0.12, segs=8)
    for i in range(4):
        bm_.sphere(0.05, (math.cos(i * 1.6) * 0.04, math.sin(i * 1.6) * 0.04, 0.02 + (i % 2) * 0.03), color=GOLD, segs=5, grad=0)
    bm_.box((0.012, 0.012, 0.5), (0, 0, 0.1), color=IRON, grad=0, base_z=False)
    b = bm_.build(parent=root, origin=(wx, wy + 0.0, 0.1 + hh * 0.55))
    obj_anim(b, f'{name}_loop', 48, lambda u: {'t': (0, 0, math.sin(u * math.tau) * 0.35)})
    return root


# ---------- CRYSTAL WELL (3 x 3) ----------

def cwell(t):
    name, root = new_root('cwell', t)
    th = THEMES[t]
    rng = random.Random(70 + t)
    m = Mesher(f'{name}_body', seed=t)
    m.cyl(1.42, 0.12, (0, 0, 0), color=rgb('#a4a6ad'), segs=16, jitter=0.03)
    m.cyl(1.2, 0.06, (0, 0, 0.12), color=rgb('#bcbfc6'), segs=16)
    # stone well ring and water
    m.cyl(0.95, 0.5, (0, 0, 0.16), color=STONE, segs=16, r2=0.9)
    m.cyl(0.98, 0.07, (0, 0, 0.62), color=STONE2, segs=16)
    m.cyl(0.8, 0.04, (0, 0, 0.6), color=rgb('#2f66c9'), segs=16, grad=0)
    # rune pillars
    n = 4 + (t - 1)
    for i in range(n):
        a = i * math.tau / n + math.pi / n
        x, y = math.cos(a) * 1.18, math.sin(a) * 1.18
        m.box((0.2, 0.2, 0.7 + 0.1 * t), (x, y, 0.12), rot=(0, 0, a), color=STONE_DK, bevel=0.03, base_z=True, taper=0.85)
        m.box((0.24, 0.24, 0.07), (x, y, 0.12 + 0.7 + 0.1 * t), rot=(0, 0, a), color=STONE2, bevel=0.015, base_z=True)
        m.box((0.05, 0.02, 0.2), (x - math.sin(a) * 0.0, y, 0.45), rot=(0, 0, a), color=CRYS_CY, mat='glow_cyan', base_z=True, grad=0, jitter=0)
    # crystal cluster
    count = 5 + 2 * t
    for i in range(count):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(0.0, 0.5) if i else 0.0
        hgt = (0.9 + 0.25 * t) * (1.0 if i == 0 else rng.uniform(0.45, 0.85))
        lean = 0.0 if i == 0 else rng.uniform(0.15, 0.5)
        mat = 'glow_violet' if i % 3 == 0 else 'glow_cyan'
        m.cyl(0.13 if i else 0.18, hgt, (math.cos(a) * d, math.sin(a) * d, 0.64), rot=(math.sin(a) * lean, -math.cos(a) * lean, 0), color=CRYS_VI if mat == 'glow_violet' else CRYS_CY,
              r2=0.0, segs=6, mat=mat, smooth=False, grad=0, jitter=0, base_z=True)
    ob = finish(m, root)
    # floating shards that orbit slowly
    sm = Mesher(f'{name}__shards', seed=2)
    for i in range(3 + t):
        a = i * math.tau / (3 + t)
        r_ = 0.75 + 0.1 * (i % 2)
        z = 1.1 + 0.5 * (i % 3) * 0.5 + 0.15 * t
        mat = 'glow_violet' if i % 2 else 'glow_cyan'
        sm.cyl(0.07, 0.14, (math.cos(a) * r_, math.sin(a) * r_, z), color=CRYS_CY, r2=0.0, segs=4, mat=mat, smooth=False, grad=0, jitter=0, base_z=False)
        sm.cyl(0.07, 0.14, (math.cos(a) * r_, math.sin(a) * r_, z), rot=(math.pi, 0, 0), color=CRYS_CY, r2=0.0, segs=4, mat=mat, smooth=False, grad=0, jitter=0, base_z=False)
    sh = sm.build(parent=root, origin=(0, 0, 0))
    obj_anim(sh, f'{name}_loop', 90, lambda u: {'r': (0, 0, u * math.tau), 't': (0, 0, math.sin(u * math.tau * 2) * 0.05)})
    return root


# ---------- GOLD VAULT (3 x 3) ----------

def vault(t):
    name, root = new_root('vault', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    zb = 0.14
    m.box((2.9, 2.9, zb), (0, 0, 0), color=STONE_DK, bevel=0.03, base_z=True)
    bh = 0.95 + 0.1 * t
    m.box((2.3, 2.1, bh), (0, 0.1, zb), color=rgb('#e3dccb'), bevel=0.04, base_z=True)
    m.box((2.42, 2.22, 0.1), (0, 0.1, zb + bh - 0.12), color=th['accent'], bevel=0.015, base_z=True, grad=0)
    m.box((2.42, 2.22, 0.1), (0, 0.1, zb), color=STONE2, bevel=0.015, base_z=True, grad=0)
    # corner pillars
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cyl(0.17, bh + 0.1, (sx * 1.2, 0.1 + sy * 1.1, zb), color=STONE, segs=10)
            m.cyl(0.21, 0.1, (sx * 1.2, 0.1 + sy * 1.1, zb + bh), color=th['accent'], segs=10, grad=0)
    # dome
    dr = 0.95 + 0.05 * t
    m.lathe([(0.0, 0.0), (dr, 0.0), (dr * 0.96, 0.16), (dr * 0.84, 0.4), (dr * 0.55, 0.65 + 0.05 * t), (dr * 0.2, 0.82 + 0.06 * t), (0.0, 0.88 + 0.06 * t)],
            loc=(0, 0.1, zb + bh + 0.04), color=GOLD, segs=16)
    m.cyl(dr + 0.04, 0.07, (0, 0.1, zb + bh), color=th['roof'] if t > 1 else GOLD_DK, segs=16, grad=0)
    m.cyl(0.03, 0.3 + 0.05 * t, (0, 0.1, zb + bh + 0.9 + 0.06 * t), color=GOLD_DK, segs=6, grad=0)
    m.sphere(0.07, (0, 0.1, zb + bh + 1.22 + 0.06 * t), color=th['roof'] if t > 1 else RED, segs=8, grad=0)
    # heavy front door
    door(m, 0, -0.95, zb, 0.8, 0.8, 'front', color=rgb('#6a4a2a'), frame=GOLD_DK)
    for i in (-1, 0, 1):
        m.box((0.05, 0.1, 0.78), (i * 0.24, -1.0, zb), color=GOLD, bevel=0.008, base_z=True, grad=0, jitter=0)
    m.sphere(0.07, (0, -1.0, zb + 0.4), color=GOLD, segs=8, grad=0, jitter=0)
    for k in (0, 1, 2):
        m.box((1.2 - 0.12 * k, 0.4 + 0.05 * k, 0.07), (0, -1.25 - 0.0, zb - 0.0 + k * 0.0), color=STONE_DK, bevel=0.01, base_z=True) if False else None
    m.box((1.3, 0.34, 0.07), (0, -1.28, zb), color=STONE_DK, bevel=0.01, base_z=True)
    m.box((1.1, 0.26, 0.07), (0, -1.22, zb + 0.07), color=STONE_DK, bevel=0.01, base_z=True)
    for sx in (-0.75, 0.75):
        window(m, sx, -0.95, zb + 0.4, 'front', trim=th['accent'])
    for sy in (-0.45, 0.65):
        window(m, 1.15, sy, zb + 0.4, 'side', trim=th['accent'])
    # treasure around
    stack_coins(m, -1.35, -1.25, zb, 5 + t)
    stack_coins(m, -1.15, -1.4, zb, 3 + t)
    stack_coins(m, 1.3, -1.3, zb, 4 + t)
    for i in range(3 + t):
        m.box((0.2, 0.1, 0.07), (1.05 + (i % 2) * 0.06, -1.1 - (i // 2) * 0.12 + 0.2, zb + i * 0.07), rot=(0, 0, 0.2 * (i % 2)), color=GOLD, bevel=0.01, base_z=True, grad=0, jitter=0.03)
    m.box((0.42, 0.28, 0.22), (1.25, 0.9, zb), color=WOOD, bevel=0.015, base_z=True)
    m.box((0.44, 0.3, 0.07), (1.25, 0.9, zb + 0.22), color=th['accent'], bevel=0.015, base_z=True, grad=0)
    finish(m, root)
    flag(root, f'{name}__banner', -1.2, -1.1, zb + bh + 0.55, 0.4, 0.26) if False else None
    return root


# ---------- CRYSTAL TANK (3 x 3) ----------

def tank(t):
    name, root = new_root('tank', t)
    th = dict(THEMES[t])
    th['metal'] = {1: rgb('#7f8ea6'), 2: rgb('#8a9bb8'), 3: rgb('#c9a23a')}[t]
    m = Mesher(f'{name}_body', seed=t)
    zb = 0.14
    m.box((2.7, 2.7, zb), (0, 0, 0), color=rgb('#9ea3ad'), bevel=0.03, base_z=True)
    m.box((2.5, 2.5, 0.05), (0, 0, zb), color=rgb('#b4b8c0'), bevel=0.01, base_z=True, grad=0)

    def vessel(cx, cy, r, h, z0):
        m.cyl(r + 0.1, 0.16, (cx, cy, z0), color=th['metal'], segs=14)
        m.cyl(r * 0.84, h, (cx, cy, z0 + 0.1), color=CRYS_VI, segs=14, mat='glow_violet', grad=0, jitter=0)
        for i in range(6):
            a = i * math.tau / 6
            m.box((0.08, 0.08, h + 0.05), (cx + math.cos(a) * r * 0.94, cy + math.sin(a) * r * 0.94, z0 + 0.1), rot=(0, 0, a), color=th['metal'], bevel=0.015, base_z=True, grad=0)
        for k in (0.2, 0.55, 0.9):
            m.cyl(r + 0.04, 0.07, (cx, cy, z0 + 0.1 + h * k - 0.03), color=th['metal'], segs=14, grad=0)
        m.lathe([(0, 0), (r + 0.08, 0), (r * 0.9, 0.1), (r * 0.5, 0.2), (0.0, 0.25)], loc=(cx, cy, z0 + h + 0.1), color=th['metal'], segs=14)
        m.cyl(0.04, 0.2, (cx, cy, z0 + h + 0.33), color=IRON, segs=6, grad=0)

    if t == 1:
        vessel(0, 0, 0.9, 1.4, zb)
    elif t == 2:
        vessel(-0.45, 0.1, 0.78, 1.5, zb)
        vessel(0.85, -0.5, 0.5, 0.9, zb)
    else:
        vessel(-0.2, 0.3, 0.8, 1.7, zb)
        vessel(0.9, -0.6, 0.5, 1.1, zb)
        vessel(-0.95, -0.7, 0.45, 0.8, zb)
    # pipes, valve wheel and gauge
    m.cyl(0.07, 0.9, (0.0, -1.05, 0.28), rot=(math.pi / 2, 0, 0), color=th['metal'], segs=8, base_z=False, grad=0)
    m.cyl(0.07, 0.5, (0.9, -0.2, 0.28), rot=(math.pi / 2, 0, math.pi / 2), color=th['metal'], segs=8, base_z=False, grad=0)
    m.cyl(0.13, 0.04, (0.45, -1.06, 0.55), rot=(math.pi / 2, 0, 0), color=RED, segs=10, base_z=False, grad=0)
    m.cyl(0.1, 0.05, (1.1, 0.4, 0.62), rot=(0, math.pi / 2, 0), color=STONE, segs=10, base_z=False, grad=0)
    m.box((0.02, 0.02, 0.08), (1.14, 0.4, 0.62), color=RED, base_z=False, grad=0)
    # ladder and a few crates
    for sx in (-1, 1):
        m.box((0.03, 0.03, 1.4), (1.05 + sx * 0.1, 0.9, zb), color=WOOD_DK, base_z=True, grad=0)
    for z in range(1, 8):
        m.box((0.2, 0.03, 0.03), (1.05, 0.9, zb + z * 0.17), color=WOOD, base_z=True, grad=0)
    crate(m, -1.1, -1.1, zb, 0.24, 0.3, color=WOOD_LT)
    barrel(m, -0.85, -1.25, zb, color=rgb('#7a4a9b'))
    finish(m, root)
    return root


# ---------- ARMY CAMP (4 x 4) ----------

def tent(m, x, y, w, d, h, rot, color, stripe, door_dir=-1):
    """Canvas tent: a ridge roof (gable) with an open front flap."""
    m.gable(w, d, h, (x, y, 0.1), rot=(0, 0, rot), color=color, overhang=0.04, jitter=0.02)
    # front wall panel (dark door) at the gable end
    c, s_ = math.cos(rot), math.sin(rot)
    fx, fy = x + (-w / 2 - 0.0) * c, y + (-w / 2) * s_
    m.box((0.02, d * 0.36, h * 0.55), (x - (w / 2 + 0.02) * (0 if False else 1) * c, y - (w / 2 + 0.02) * s_, 0.1), rot=(0, 0, rot), color=BLACKISH, base_z=True, grad=0, jitter=0)
    # stripe along the ridge
    m.box((w + 0.12, 0.05, 0.05), (x, y, 0.1 + h), rot=(0, 0, rot), color=stripe, base_z=True, grad=0)


def camp(t):
    name, root = new_root('camp', t)
    th = THEMES[t]
    rng = random.Random(90 + t)
    m = Mesher(f'{name}_body', seed=t)
    m.cyl(1.95, 0.08, (0, 0, 0), color=rgb('#b59467'), segs=20, jitter=0.04)
    m.cyl(1.7, 0.03, (0, 0, 0.08), color=rgb('#c3a677'), segs=20, grad=0, jitter=0.05)
    cream = rgb('#efe6cf')
    red = rgb('#c4573a') if t == 1 else th['roof']
    # four tents around the fire
    spots = [(-1.15, 0.95, 0.5), (1.15, 1.0, -0.5), (-1.2, -0.7, 0.2), (1.3, -0.6, -0.2)]
    for i, (x, y, r) in enumerate(spots):
        tent(m, x, y, 1.3, 1.0, 0.8 + 0.05 * t, r, cream, red)
    if t >= 2:
        # big pavilion at the back
        m.box((1.3, 0.9, 0.32), (0, 1.5, 0.1), color=cream, bevel=0.02, base_z=True)
        m.gable(1.5, 1.1, 0.5, (0, 1.5, 0.42), color=red, overhang=0.06)
    # campfire pit
    for i in range(8):
        a = i * math.tau / 8
        m.box((0.18, 0.1, 0.1), (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.08), rot=(0, 0, a), color=rgb('#7a7468'), bevel=0.02, base_z=True)
    for k in range(3):
        a = k * 2.1
        m.cyl(0.04, 0.4, (0, 0, 0.12), rot=(1.2, 0, a), color=WOOD_DK, segs=6, base_z=False, grad=0)
    # logs to sit on
    for (x, y, r) in ((-0.2, -0.85, 0.0), (0.7, -0.5, 1.0), (-0.85, 0.15, 1.9)):
        m.cyl(0.1, 0.55, (x, y, 0.16), rot=(0, math.pi / 2, r), color=WOOD, segs=8, base_z=False)
    # weapon rack and dummy
    m.box((0.05, 0.05, 0.55), (0.9, 0.3, 0.1), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.05, 0.05, 0.55), (1.35, 0.3, 0.1), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.55, 0.05, 0.05), (1.12, 0.3, 0.4), color=WOOD, base_z=True, grad=0)
    for i in range(4):
        m.box((0.03, 0.03, 0.62), (0.97 + i * 0.12, 0.3, 0.12), rot=(0, 0.12, 0), color=IRON_LT if i % 2 else WOOD_LT, base_z=True, grad=0)
    m.box((0.06, 0.06, 0.62), (-0.55, -1.35, 0.1), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.42, 0.05, 0.06), (-0.55, -1.35, 0.5), color=WOOD, base_z=True, grad=0)
    m.sphere(0.1, (-0.55, -1.35, 0.78), color=rgb('#d9c07a'), segs=7, grad=0.1)
    for i in range(3):
        m.sphere(0.13, (1.4 + i * 0.05, 1.5 - i * 0.08, 0.18 + i * 0.05), scale=(1, 1.4, 0.8), color=rgb('#d9c07a'), segs=6) if t >= 2 else None
    barrel(m, 0.5, -1.4, 0.08)
    crate(m, 0.85, -1.35, 0.08, 0.22, 0.4)
    pole_flag(m, root, f'{name}__banner', -0.1, 1.85, 0.08, 1.3 + 0.1 * t, w=0.65, h=0.38)
    finish(m, root)
    # flickering flame
    fm = Mesher(f'{name}__flame', seed=3)
    fm.cyl(0.2, 0.55, (0, 0, 0.0), color=(1, 0.5, 0.1), r2=0.0, segs=6, mat='glow_orange', smooth=False, grad=0, jitter=0)
    fm.cyl(0.11, 0.38, (0, 0, 0.0), color=(1, 0.9, 0.3), r2=0.0, segs=6, mat='glow_yellow', smooth=False, grad=0, jitter=0)
    fl = fm.build(parent=root, origin=(0, 0, 0.14))
    obj_anim(fl, f'{name}_loop', 12, lambda u: {'s': (1 + 0.12 * math.sin(u * math.tau * 2), 1 + 0.12 * math.cos(u * math.tau * 2), 1 + 0.25 * math.sin(u * math.tau * 3))})
    return root


# ---------- BARRACKS (3 x 3) ----------

def barracks(t):
    name, root = new_root('barracks', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    zb = 0.12
    m.box((2.9, 2.7, zb), (0, 0, 0), color=STONE_DK, bevel=0.03, base_z=True)
    wall = PLASTER if t == 1 else rgb('#d8cfbd')
    low = 0.5 + 0.2 * t
    # stone foundation course, timber-frame upper wall
    m.box((2.5, 1.7, low), (0, 0.15, zb), color=STONE2, bevel=0.03, base_z=True)
    m.box((2.4, 1.6, 0.55 + 0.15 * t), (0, 0.15, zb + low), color=wall, bevel=0.02, base_z=True)
    zt = zb + low + 0.55 + 0.15 * t
    for x in (-1.1, -0.55, 0.0, 0.55, 1.1):
        m.box((0.08, 0.06, 0.55 + 0.15 * t), (x, -0.67, zb + low), color=WOOD_DK, bevel=0.01, base_z=True, grad=0)
    m.box((2.5, 0.08, 0.08), (0, -0.68, zb + low), color=WOOD_DK, base_z=True, grad=0)
    m.box((2.5, 0.08, 0.08), (0, -0.68, zt - 0.08), color=WOOD_DK, base_z=True, grad=0)
    # roof
    m.gable(2.5, 1.7, 0.85, (0, 0.15, zt), color=th['roof'], overhang=0.14)
    m.box((2.8, 0.1, 0.06), (0, 0.15, zt + 0.85), color=th['roof_dk'], bevel=0.01, base_z=True, grad=0)
    # chimney
    m.box((0.28, 0.28, 0.6), (0.8, 0.6, zt + 0.2), color=STONE_DK, bevel=0.02, base_z=True)
    # door with steps and windows
    door(m, 0, -0.7, zb + low - 0.0, 0.62, 0.78, 'front', color=WOOD_DK)
    m.box((0.9, 0.3, 0.06), (0, -0.88, zb), color=STONE_DK, bevel=0.01, base_z=True)
    for sx in (-0.85, 0.85):
        window(m, sx, -0.7, zb + low + 0.15, 'front', w=0.28, h=0.3)
    window(m, 1.22, 0.15, zb + low + 0.15, 'side', w=0.3, h=0.3)
    # shield emblem on the front gable
    m.cyl(0.2, 0.05, (0, -0.72, zt + 0.4), rot=(math.pi / 2, 0, 0), color=BLUE, segs=10, base_z=False, grad=0)
    m.box((0.05, 0.03, 0.26), (0, -0.76, zt + 0.4), color=WHITE, base_z=False, grad=0)
    m.box((0.26, 0.03, 0.05), (0, -0.76, zt + 0.4), color=WHITE, base_z=False, grad=0)
    if t >= 2:
        m.cyl(0.26, 1.0, (-1.15, 0.85, zb), color=rgb('#ddd4c1'), segs=10)
        m.cyl(0.32, 0.5, (-1.15, 0.85, zb + 1.0), color=th['roof'], r2=0.02, segs=10)
    # weapon rack and dummies outside
    m.box((0.05, 0.05, 0.5), (-1.2, -1.15, zb), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.05, 0.05, 0.5), (-0.65, -1.15, zb), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.6, 0.05, 0.05), (-0.92, -1.15, zb + 0.4), color=WOOD, base_z=True, grad=0)
    for i in range(4):
        m.box((0.03, 0.03, 0.6), (-1.1 + i * 0.14, -1.15, zb + 0.05), rot=(0, 0.1, 0), color=IRON_LT if i % 2 else WOOD_LT, base_z=True, grad=0)
    m.box((0.07, 0.07, 0.7), (1.05, -1.1, zb), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.5, 0.06, 0.07), (1.05, -1.1, zb + 0.45), color=WOOD, base_z=True, grad=0)
    m.sphere(0.12, (1.05, -1.1, zb + 0.82), color=rgb('#d9c07a'), segs=7, grad=0.1)
    pole_flag(m, root, f'{name}__banner', 1.3, 0.9, zb, 1.7, w=0.55, h=0.32)
    finish(m, root)
    return root


# ---------- FORGE (3 x 3) ----------

def forge(t):
    name, root = new_root('forge', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    zb = 0.12
    m.box((2.9, 2.7, zb), (0, 0, 0), color=STONE_DK, bevel=0.03, base_z=True)
    sm = rgb('#8f939d')
    m.box((2.2, 1.7, 1.0), (0, 0.3, zb), color=sm, bevel=0.04, base_z=True)
    m.box((2.3, 0.14, 0.1), (0, -0.55, zb + 0.9), color=shade(sm, 0.8), bevel=0.01, base_z=True)
    # shed roof sloping to the front
    roof = th['roof_dk'] if t == 1 else th['roof']
    m.box((2.5, 2.0, 0.12), (0, 0.3, zb + 1.1), rot=(0.22, 0, 0), color=roof, bevel=0.02, base_z=True)
    # chimney
    m.box((0.5, 0.5, 1.2 + 0.2 * t), (0.55, 0.7, zb + 1.0), color=STONE_DK, bevel=0.03, base_z=True, taper=0.85)
    m.box((0.62, 0.62, 0.08), (0.55, 0.7, zb + 2.15 + 0.2 * t), color=IRON, bevel=0.01, base_z=True)
    if t >= 2:
        m.box((0.36, 0.36, 1.0 + 0.2 * t), (-0.6, 0.8, zb + 1.0), color=STONE_DK, bevel=0.03, base_z=True, taper=0.85)
    # open front: furnace mouth glowing
    m.box((0.9, 0.14, 0.7), (-0.4, -0.58, zb), color=BLACKISH, bevel=0.01, base_z=True, grad=0, jitter=0)
    m.box((0.7, 0.08, 0.5), (-0.4, -0.63, zb + 0.04), color=(1, 0.5, 0.1), mat='glow_orange', base_z=True, grad=0, jitter=0)
    m.box((1.1, 0.12, 0.1), (-0.4, -0.62, zb + 0.75), color=IRON, bevel=0.01, base_z=True, grad=0)
    # coal and embers
    for i in range(6):
        m.sphere(0.06, (-0.15 - i * 0.1, -0.8, 0.12 + (i % 2) * 0.03), color=rgb('#2b2724'), segs=5, grad=0)
    # anvil and water barrel and tools
    m.box((0.5, 0.25, 0.16), (0.75, -0.85, zb + 0.28), color=IRON, bevel=0.02, base_z=True)
    m.box((0.36, 0.2, 0.28), (0.75, -0.85, zb), color=WOOD, bevel=0.02, base_z=True)
    m.cyl(0.07, 0.2, (1.0, -0.85, zb + 0.44), rot=(0, math.pi / 2, 0), color=IRON, segs=6, base_z=False, grad=0)
    barrel(m, 1.2, -0.3, zb, r=0.14, h=0.3, color=rgb('#4a6fa8'))
    m.box((0.5, 0.06, 0.4), (-1.0, -0.95, zb + 0.25), color=WOOD_DK, base_z=True, grad=0)
    for i in range(3):
        m.box((0.03, 0.04, 0.35), (-1.12 + i * 0.12, -0.99, zb + 0.28), color=IRON_LT, base_z=True, grad=0)
    window(m, 1.12, 0.3, zb + 0.5, 'side', w=0.3, h=0.3)
    finish(m, root)
    # swinging hammer
    hm = Mesher(f'{name}__hammer', seed=4)
    hm.box((0.04, 0.04, 0.34), (0, 0, 0), color=WOOD, base_z=True, grad=0)
    hm.box((0.2, 0.1, 0.1), (0, 0, 0.3), color=IRON_LT, bevel=0.01, base_z=True)
    ham = hm.build(parent=root, origin=(0.75, -0.85, zb + 0.46))
    obj_anim(ham, f'{name}_loop', 36, lambda u: {'r': (-0.9 * max(0.0, math.sin(u * math.tau * 2)) ** 2, 0, 0)})
    return root


# ---------- DEFENCES ----------

def emplacement(m, r, h, th, t, z0=0.0, sides=14):
    m.cyl(r, h, (0, 0, z0), color=rgb('#b9b2a2'), segs=sides, r2=r * 0.95)
    m.cyl(r + 0.05, 0.08, (0, 0, z0 + h), color=STONE2, segs=sides)
    for i in range(sides):
        a = i * math.tau / sides
        if i % 2 == 0:
            m.box((0.2, 0.14, 0.16), (math.cos(a) * (r + 0.0), math.sin(a) * (r + 0.0), z0 + h + 0.08), rot=(0, 0, a + math.pi / 2), color=STONE, bevel=0.015, base_z=True, grad=0.1)
    m.cyl(r + 0.06, 0.06, (0, 0, z0 + h * 0.5), color=th['accent'], segs=sides, grad=0) if t >= 2 else None


def cannon(t):
    name, root = new_root('cannon', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    emplacement(m, 0.9, 0.3, th, t)
    m.cyl(0.62, 0.04, (0, 0, 0.38), color=WOOD, segs=12, grad=0)
    # cannonball pile and powder keg
    for (x, y, z) in ((0.55, 0.45, 0.42), (0.7, 0.3, 0.42), (0.6, 0.35, 0.58)):
        m.sphere(0.075, (x, y, z), color=BLACKISH, segs=6, grad=0.1)
    barrel(m, -0.55, 0.45, 0.4, r=0.11, h=0.22)
    finish(m, root)
    # turret (yaw) with carriage, wheels and barrel. Parts are modelled relative to the pivot on the deck.
    tm = Mesher(f'{name}__turret', seed=5)
    tm.box((0.52, 0.7, 0.14), (0, 0, 0.0), color=WOOD, bevel=0.02, base_z=True)
    for sx in (-1, 1):
        tm.cyl(0.2, 0.08, (sx * 0.3, 0.05, 0.2), rot=(0, math.pi / 2, 0), color=WOOD_DK, segs=10, base_z=False, grad=0)
        tm.cyl(0.05, 0.1, (sx * 0.3, 0.05, 0.2), rot=(0, math.pi / 2, 0), color=IRON, segs=6, base_z=False, grad=0)
    bronze = th['metal'] if t != 1 else rgb('#8f6a3a')
    tr = tm.build(parent=root, origin=(0, 0, 0.38), local=True)
    bm_ = Mesher(f'{name}__barrel', seed=6)
    br = 0.17 + 0.02 * t
    bm_.cyl(br, 0.95, (0, -0.1, 0.0), rot=(math.pi / 2, 0, 0), color=bronze, r2=br * 0.78, segs=12, base_z=False)
    bm_.sphere(br * 1.05, (0, 0.38, 0.0), color=bronze, segs=10, grad=0.1)
    for dy in (-0.15, -0.38):
        bm_.cyl(br * 1.15, 0.05, (0, dy, 0.0), rot=(math.pi / 2, 0, 0), color=th['accent'], segs=12, base_z=False, grad=0)
    bm_.cyl(br * 0.95, 0.05, (0, -0.62, 0.0), rot=(math.pi / 2, 0, 0), color=shade(bronze, 0.75), segs=12, base_z=False)
    bm_.cyl(br * 0.55, 0.06, (0, -0.64, 0.0), rot=(math.pi / 2, 0, 0), color=BLACKISH, segs=10, base_z=False, grad=0, jitter=0)
    bm_.build(parent=tr, origin=(0, 0, 0.3), local=True)
    return root


def ballista(t):
    name, root = new_root('ballista', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    m.cyl(0.95, 0.22, (0, 0, 0), color=WOOD, segs=8, r2=0.9, jitter=0.04)
    m.cyl(0.98, 0.07, (0, 0, 0.22), color=th['metal'] if t > 1 else WOOD_DK, segs=8, grad=0)
    for i in range(8):
        a = i * math.tau / 8 + math.pi / 8
        m.box((0.1, 0.1, 0.3), (math.cos(a) * 0.92, math.sin(a) * 0.92, 0.12), rot=(0, 0, a), color=WOOD_DK, bevel=0.015, base_z=True)
    m.cyl(0.2, 0.34, (0, 0, 0.29), color=WOOD_DK, segs=8)
    # spare bolts in a quiver
    m.box((0.2, 0.2, 0.34), (0.62, 0.52, 0.29), color=rgb('#6a4a2a'), bevel=0.02, base_z=True)
    for i in range(4):
        m.box((0.02, 0.02, 0.4), (0.57 + i * 0.04, 0.52, 0.55), color=IRON_LT, base_z=True, grad=0)
    finish(m, root)
    tm = Mesher(f'{name}__turret', seed=5)
    # stock, winch, bow arms and string
    tm.box((0.16, 1.3, 0.14), (0, -0.05, 0.0), color=WOOD, bevel=0.02, base_z=True)
    tm.box((0.12, 0.7, 0.05), (0, -0.2, 0.14), color=th['metal'] if t > 1 else WOOD_LT, bevel=0.01, base_z=True)
    tm.cyl(0.1, 0.22, (0, 0.55, 0.12), rot=(0, math.pi / 2, 0), color=IRON, segs=8, base_z=False, grad=0)
    arm_c = WOOD_LT if t == 1 else th['roof_dk']
    for sx in (-1, 1):
        tm.box((0.7, 0.1, 0.1), (sx * 0.38, -0.62, 0.1), rot=(0, 0, sx * -0.42), color=arm_c, bevel=0.015, base_z=True)
        tm.box((0.4, 0.09, 0.09), (sx * 0.78, -0.45, 0.1), rot=(0, 0, sx * 0.5), color=arm_c, bevel=0.015, base_z=True)
    tm.box((1.65, 0.015, 0.015), (0, -0.28, 0.14), color=rgb('#e8e2d2'), base_z=True, grad=0, jitter=0)
    # the loaded bolt
    tm.box((0.03, 1.05, 0.03), (0, -0.4, 0.2), color=rgb('#d8d0bd'), base_z=True, grad=0)
    tm.pyramid(0.09, 0.09, 0.2, (0, -0.95, 0.215), rot=(math.pi / 2, 0, 0), color=IRON_LT, grad=0)
    tm_ = tm.build(parent=root, origin=(0, 0, 0.63), local=True)
    return root


def mortar(t):
    name, root = new_root('mortar', t)
    th = THEMES[t]
    m = Mesher(f'{name}_body', seed=t)
    emplacement(m, 1.3, 0.38, th, t, sides=16)
    m.cyl(0.9, 0.05, (0, 0, 0.46), color=rgb('#8c867a'), segs=16, grad=0)
    m.cyl(0.55, 0.18, (0, 0, 0.5), color=rgb('#5b5f6a'), segs=14)
    # sandbags ring in front and shell stack
    for i in range(5):
        a = math.pi * (0.8 + i * 0.1)
        m.sphere(0.17, (math.cos(a) * 1.0, math.sin(a) * 1.0 - 0.1, 0.52), scale=(1.3, 0.9, 0.7), rot=(0, 0, a + math.pi / 2), color=rgb('#c9b27a'), segs=6)
    for i, (x, y, z) in enumerate(((0.85, 0.65, 0.5), (1.02, 0.5, 0.5), (0.9, 0.52, 0.66))):
        m.sphere(0.11, (x, y, z), color=BLACKISH, segs=7, grad=0.1)
        m.cyl(0.04, 0.05, (x, y, z + 0.09), color=th['accent'], segs=6, grad=0)
    crate(m, -0.95, 0.65, 0.46, 0.28, 0.4)
    finish(m, root)
    tm = Mesher(f'{name}__turret', seed=5)
    tm.cyl(0.42, 0.12, (0, 0, 0.0), color=rgb('#5b5f6a'), segs=12)
    for sx in (-1, 1):
        tm.box((0.1, 0.5, 0.5), (sx * 0.3, 0.1, 0.1), color=IRON, bevel=0.02, base_z=True)
    tr = tm.build(parent=root, origin=(0, 0, 0.68), local=True)
    bm_ = Mesher(f'{name}__barrel', seed=6)
    bcol = rgb('#454a55') if t == 1 else th['metal']
    bm_.cyl(0.33, 0.95, (0, 0, 0.0), color=bcol, r2=0.24, segs=12, base_z=False, rot=(0, 0, 0))
    bm_.cyl(0.4, 0.09, (0, 0, 0.5), color=th['accent'], segs=12, base_z=False, grad=0)
    bm_.cyl(0.26, 0.04, (0, 0, 0.52), color=BLACKISH, segs=10, base_z=False, grad=0, jitter=0)
    bm_.sphere(0.34, (0, 0, -0.45), color=bcol, segs=10, grad=0.1)
    # barrel tilted up and forward (-y): rotate around x by -60 deg
    bar = bm_.build(parent=tr, origin=(0, 0, 0.12), local=True)
    bar.rotation_euler = (math.radians(-35), 0, 0)
    return root


def bomb(t):
    name, root = new_root('bomb', t)
    m = Mesher(f'{name}_body', seed=t)
    m.cyl(0.4, 0.07, (0, 0, 0), color=IRON, segs=12)
    m.cyl(0.33, 0.04, (0, 0, 0.07), color=IRON_LT, segs=12, grad=0)
    for i in range(10):
        a = i * math.tau / 10
        m.cyl(0.05, 0.14, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.06), color=IRON_LT, r2=0.0, segs=5, grad=0.1)
    m.sphere(0.14, (0, 0, 0.1), scale=(1, 1, 0.55), color=RED, segs=8, grad=0)
    m.cyl(0.04, 0.05, (0, 0, 0.17), color=(1, 0.8, 0.3), segs=6, mat='glow_red', grad=0, jitter=0)
    finish(m, root)
    return root


# ---------- WALL ----------

def wall(t):
    th = THEMES[t]
    stone = {1: rgb('#b9b4a9'), 2: rgb('#8e9bb0'), 3: rgb('#9a86c4')}[t]
    nm, post_root = new_root('wall', t)
    m = Mesher(f'{nm}_post', seed=t)
    m.box((0.46, 0.46, 0.74), (0, 0, 0), color=stone, bevel=0.04, base_z=True, taper=0.92)
    m.box((0.54, 0.54, 0.09), (0, 0, 0.74), color=shade(stone, 1.1), bevel=0.02, base_z=True)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.13, 0.13, 0.11), (sx * 0.19, sy * 0.19, 0.83), color=stone, bevel=0.01, base_z=True)
    if t >= 2:
        m.box((0.52, 0.52, 0.05), (0, 0, 0.5), color=th['accent'], bevel=0.01, base_z=True, grad=0)
    finish(m, post_root)
    lk = new_empty(f'wall_link_t{t}')
    ASSETS.setdefault('wall_link', {})[t] = lk
    m2 = Mesher(f'wall_link_t{t}_body', seed=t + 3)
    m2.box((0.6, 0.28, 0.52), (0, 0, 0), color=shade(stone, 0.96), bevel=0.03, base_z=True)
    for i in range(3):
        m2.box((0.14, 0.2, 0.1), (-0.2 + i * 0.2, 0, 0.52), color=stone, bevel=0.01, base_z=True)
    if t >= 2:
        m2.box((0.62, 0.3, 0.05), (0, 0, 0.34), color=th['accent'], bevel=0.008, base_z=True, grad=0)
    finish(m2, lk)
    return post_root


# ---------- SCAFFOLD, RUBBLE, OBSTACLES, PROPS ----------

def scaffold(size):
    name = f'scaffold_{size}'
    root = new_empty(name)
    ASSETS.setdefault('scaffold', {})[size] = root
    m = Mesher(f'{name}_body', seed=size)
    h = size / 2 - 0.1
    m.box((size - 0.1, size - 0.1, 0.1), (0, 0, 0), color=rgb('#b59467'), bevel=0.02, base_z=True, jitter=0.05)
    # half-built stone walls
    m.box((size * 0.62, size * 0.62, 0.34), (0, 0, 0.1), color=rgb('#d3cab8'), bevel=0.03, base_z=True)
    for i in range(4):
        m.box((size * 0.2, size * 0.2, 0.16), (-size * 0.2 + i * size * 0.14, -size * 0.2, 0.44), color=STONE2, bevel=0.015, base_z=True)
    # poles, beams and braces
    ph = 0.9 + 0.22 * size
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.09, 0.09, ph), (sx * h, sy * h, 0.1), color=WOOD, bevel=0.01, base_z=True)
    for z in (0.5, 0.5 + ph * 0.45):
        for sy in (-1, 1):
            m.box((2 * h, 0.07, 0.07), (0, sy * h, z), color=WOOD_DK, bevel=0.01, base_z=True, grad=0)
        for sx in (-1, 1):
            m.box((0.07, 2 * h, 0.07), (sx * h, 0, z), color=WOOD_DK, bevel=0.01, base_z=True, grad=0)
    m.box((2 * h, 0.07, 0.07), (0, -h, 0.5), rot=(0, 0, 0), color=WOOD, base_z=True, grad=0)
    m.box((0.07, 0.07, ph * 0.9), (0, -h, 0.2), rot=(0, 0.85, 0), color=WOOD, base_z=True, grad=0)
    # planks and a crate, a rope and bucket
    for i in range(4):
        m.box((0.28, h * 1.6, 0.04), (-h * 0.7 + i * 0.3, 0, 0.5 + ph * 0.45), color=WOOD_LT, base_z=True, grad=0)
    crate(m, h * 0.55, h * 0.5, 0.1, 0.26, 0.4)
    crate(m, h * 0.8, h * 0.1, 0.1, 0.2, 0.9)
    m.cyl(0.1, 0.16, (-h * 0.6, h * 0.6, 0.1), color=WOOD, segs=8, r2=0.12)
    # crane arm
    m.box((0.06, 0.06, ph + 0.2), (h, h, 0.1), color=WOOD_DK, base_z=True, grad=0)
    m.box((h * 1.6, 0.06, 0.06), (h * 0.2, h, ph + 0.15), color=WOOD_DK, base_z=True, grad=0)
    m.box((0.012, 0.012, 0.5), (-h * 0.5, h, ph - 0.35), color=rgb('#d6c08a'), base_z=True, grad=0)
    m.box((0.2, 0.2, 0.16), (-h * 0.5, h, ph - 0.5), color=STONE2, bevel=0.015, base_z=True)
    finish(m, root)
    return root


def rubble(size):
    name = f'rubble_{size}'
    root = new_empty(name)
    ASSETS.setdefault('rubble', {})[size] = root
    rng = random.Random(500 + size)
    m = Mesher(f'{name}_body', seed=size)
    m.box((size * 0.8, size * 0.8, 0.03), (0, 0, 0), color=rgb('#7b6d60'), bevel=0.01, base_z=True, jitter=0.1, grad=0)
    n = int(size * size * 2.2) + 3
    for i in range(n):
        x, y = rng.uniform(-size * 0.4, size * 0.4), rng.uniform(-size * 0.4, size * 0.4)
        s_ = rng.uniform(0.12, 0.34) * (0.6 + 0.2 * size)
        m.box((s_, s_ * rng.uniform(0.6, 1.2), s_ * rng.uniform(0.5, 1.0)), (x, y, 0.03), rot=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3)),
              color=mixc(rgb('#8d867b'), rgb('#5d564d'), rng.uniform(0, 1)), bevel=0.02, base_z=True)
    for i in range(max(2, size)):
        x, y = rng.uniform(-size * 0.35, size * 0.35), rng.uniform(-size * 0.35, size * 0.35)
        m.box((0.07, rng.uniform(0.5, 0.9), 0.07), (x, y, 0.1), rot=(0, rng.uniform(-0.3, 0.3), rng.uniform(0, 3)), color=rgb('#2c2420'), base_z=True, grad=0)
    finish(m, root)
    return root


def rock(variant=0):
    name = 'ob_rock'
    root = new_empty(name)
    ASSETS.setdefault('obstacles', {})['rock'] = root
    rng = random.Random(900)
    m = Mesher(f'{name}_body', seed=3)
    m.sphere(0.8, (0, 0, 0.35), scale=(1.0, 0.9, 0.7), color=rgb('#9a9892'), segs=7, smooth=False, grad=0.2)
    for i in range(7):
        a = i * math.tau / 7 + rng.uniform(-0.3, 0.3)
        d = rng.uniform(0.35, 0.65)
        m.box((rng.uniform(0.4, 0.6), rng.uniform(0.4, 0.6), rng.uniform(0.35, 0.6)), (math.cos(a) * d, math.sin(a) * d, 0.0), rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), a),
              color=mixc(rgb('#8f8b86'), rgb('#b8b4ac'), rng.uniform(0, 1)), bevel=0.07, base_z=True)
    m.box((0.5, 0.4, 0.4), (0.0, 0.1, 0.6), rot=(0.2, 0.1, 0.6), color=rgb('#a9a69f'), bevel=0.07, base_z=True)
    m.sphere(0.2, (-0.3, -0.5, 0.15), scale=(1, 1, 0.6), color=rgb('#6fa85a'), segs=6)
    finish(m, root)
    return root


def tree():
    name = 'ob_tree'
    root = new_empty(name)
    ASSETS.setdefault('obstacles', {})['tree'] = root
    rng = random.Random(901)
    m = Mesher(f'{name}_body', seed=4)
    m.cyl(0.17, 0.9, (0, 0, 0), color=rgb('#7a4f2a'), r2=0.11, segs=7)
    for i in range(3):
        a = i * 2.1
        m.cyl(0.07, 0.3, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.0), rot=(math.sin(a) * 0.7, -math.cos(a) * 0.7, 0), color=rgb('#7a4f2a'), r2=0.03, segs=5, base_z=True)
    for (x, y, z, r, c) in ((0, 0, 1.0, 0.75, '#3f9a45'), (0.25, 0.1, 1.45, 0.6, '#4aab50'), (-0.25, -0.1, 1.55, 0.55, '#57bd5b'), (0, 0.05, 1.95, 0.42, '#63cc64'), (0.3, -0.3, 1.1, 0.4, '#3f9a45')):
        m.sphere(r, (x, y, z), scale=(1, 1, 0.85), color=rgb(c), segs=8, grad=0.3)
    finish(m, root)
    return root


def stump():
    name = 'ob_stump'
    root = new_empty(name)
    ASSETS.setdefault('obstacles', {})['stump'] = root
    m = Mesher(f'{name}_body', seed=5)
    m.cyl(0.3, 0.32, (0, 0, 0), color=rgb('#8a5a30'), r2=0.26, segs=9)
    m.cyl(0.255, 0.02, (0, 0, 0.31), color=rgb('#d9ab6e'), segs=9, grad=0)
    m.cyl(0.14, 0.02, (0, 0, 0.325), color=rgb('#c4955a'), segs=9, grad=0)
    for i in range(4):
        a = i * 1.7
        m.box((0.28, 0.08, 0.08), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.0), rot=(0, 0, a), color=rgb('#7a4f2a'), bevel=0.02, base_z=True)
    for (x, y) in ((0.32, -0.2), (0.4, -0.12)):
        m.cyl(0.015, 0.1, (x, y, 0.0), color=WHITE, segs=5, grad=0)
        m.sphere(0.06, (x, y, 0.1), scale=(1, 1, 0.6), color=RED, segs=6, grad=0)
    finish(m, root)
    return root


def palm():
    name = 'deco_palm'
    root = new_empty(name)
    ASSETS.setdefault('deco', {})['palm'] = root
    m = Mesher(f'{name}_body', seed=6)
    segs_ = 6
    x, z = 0.0, 0.0
    for i in range(segs_):
        lean = 0.12 + i * 0.03
        m.cyl(0.1 - i * 0.008, 0.28, (x, 0, z), rot=(0, lean, 0), color=rgb('#9a6b3c') if i % 2 else rgb('#8d6238'), r2=0.095 - i * 0.008, segs=6, base_z=True if False else False)
        x += math.sin(lean) * 0.28
        z += math.cos(lean) * 0.28
    top = (x, 0, z + 0.05)
    m.sphere(0.1, (top[0] - 0.05, 0.08, top[2] - 0.05), color=rgb('#6b4a2a'), segs=6)
    m.sphere(0.1, (top[0] + 0.07, -0.06, top[2] - 0.06), color=rgb('#6b4a2a'), segs=6)
    for i in range(7):
        a = i * math.tau / 7
        ex, ey = top[0] + math.cos(a) * 0.75, math.sin(a) * 0.75
        ez = top[2] - 0.32
        rows = [((top[0] - math.sin(a) * 0.02, -math.cos(a) * 0.0 + math.sin(a) * 0.0, top[2]), (top[0] + math.sin(a) * 0.02, 0, top[2]))]
        mx, my = top[0] + math.cos(a) * 0.4, math.sin(a) * 0.4
        rows.append(((mx - math.sin(a) * 0.14, my + math.cos(a) * 0.14, top[2] + 0.1), (mx + math.sin(a) * 0.14, my - math.cos(a) * 0.14, top[2] + 0.1)))
        rows.append(((ex - math.sin(a) * 0.03, ey + math.cos(a) * 0.03, ez), (ex + math.sin(a) * 0.03, ey - math.cos(a) * 0.03, ez)))
        m.tri_strip(rows, color=rgb('#3f9a45') if i % 2 else rgb('#4aab50'), mat='cloth')
    finish(m, root)
    return root


def beacon_prop():
    name = 'beacon'
    root = new_empty(name)
    ASSETS.setdefault('beacon', {})[1] = root
    m = Mesher(f'{name}_body', seed=7)
    m.cyl(0.18, 0.1, (0, 0, 0), color=STONE_DK, segs=8)
    m.cyl(0.03, 1.5, (0, 0, 0.05), color=WOOD_DK, segs=6, grad=0)
    m.sphere(0.06, (0, 0, 1.58), color=GOLD, segs=6, grad=0)
    finish(m, root)
    flag(root, f'{name}__banner', 0, 0, 1.55, 0.6, 0.38)
    return root


# ---------- driver ----------

SIZES = {'keep': 4, 'gmine': 3, 'cwell': 3, 'vault': 3, 'tank': 3, 'camp': 4, 'barracks': 3, 'forge': 3, 'cannon': 2, 'ballista': 2,
         'mortar': 3, 'bomb': 1, 'wall': 1}
TIERED = {'keep': keep, 'gmine': gmine, 'cwell': cwell, 'vault': vault, 'tank': tank, 'camp': camp, 'barracks': barracks, 'forge': forge,
          'cannon': cannon, 'ballista': ballista, 'mortar': mortar, 'bomb': bomb, 'wall': wall}


def build_group(name):
    """Build one output file. Returns (roots, previews) where previews = [(label, roots_to_show, size_in_tiles)]."""
    previews = []
    if name == 'props':
        roots = [scaffold(2), scaffold(3), scaffold(4)]
        roots += [rubble(1), rubble(2), rubble(3), rubble(4)]
        roots += [rock(), tree(), stump(), palm(), beacon_prop()]
        for r, sz in zip(roots, (2, 3, 4, 1, 2, 3, 4, 2, 2, 1, 1, 1)):
            previews.append((r.name, [r], sz))
        return roots, previews
    fn = TIERED[name]
    roots = []
    for t in (1, 2, 3):
        r = fn(t)
        roots.append(r)
        extra = ASSETS.get('wall_link', {}).get(t) if name == 'wall' else None
        previews.append((f'{name}_t{t}', [r] + ([extra] if extra else []), SIZES[name]))
    if name == 'wall':
        roots += list(ASSETS['wall_link'].values())
    return roots, previews


def make(name, preview=False):
    lib.reset()
    ASSETS.clear()
    roots, previews = build_group(name)
    objs = []
    for r in roots:
        objs.append(r)
        objs += list(r.children_recursive)
    fname = 'props.glb' if name == 'props' else f'b_{name}.glb'
    out = os.path.join(lib.MODELS, fname)
    sz = lib.export_glb(out, objs)
    faces = sum(len(o.data.polygons) for o in objs if o.type == 'MESH')
    print(f'{name}: {sz / 1024:.0f} KB, {faces} faces')
    if preview:
        pv = os.path.join(lib.HERE, '_preview')
        os.makedirs(pv, exist_ok=True)
        for label, show, size in previews:
            keep_ids = set()
            for r in show:
                keep_ids.add(r.name)
                keep_ids.update(c.name for c in r.children_recursive)
            for o in objs:
                o.hide_render = o.name not in keep_ids
            meshes = [o for o in objs if o.type == 'MESH' and o.name in keep_ids]
            lib.render_preview(os.path.join(pv, f'{label}.png'), meshes, size=420, yaw=45, pitch=34, ground=True, transparent=False,
                               frame=((0, 0, size * 0.28), size * 0.85 + 0.3))
    return objs


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    for n in (args or list(TIERED) + ['props']):
        make(n, preview='--preview' in sys.argv)
