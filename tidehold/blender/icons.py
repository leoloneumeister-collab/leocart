"""Render the UI thumbnails (shop cards, army list) with Cycles from the same models the game uses.

Writes tidehold/public/icons/ui/*.webp. Needs Pillow for the WebP conversion (pip install pillow).
Run:  python icons.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

import lib
import buildings as B
import characters as C

OUT = os.path.join(lib.PUBLIC, 'icons', 'ui')
SIZE = 192


def to_webp(png, webp):
    from PIL import Image
    im = Image.open(png).convert('RGBA')
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
        w, h = im.size
        side = max(w, h)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        im = canvas.resize((160, 160), Image.LANCZOS)
    im.save(webp, 'WEBP', quality=88, method=6)
    os.remove(png)


def render(label, meshes, yaw=40, pitch=30, samples=40):
    png = os.path.join(OUT, label + '.png')
    lib.render_preview(png, meshes, size=SIZE * 2, yaw=yaw, pitch=pitch, samples=samples, transparent=True, catcher=True, margin=1.05)
    to_webp(png, os.path.join(OUT, label + '.webp'))


def do_buildings():
    for name in list(B.TIERED) + ['props']:
        lib.reset()
        B.ASSETS.clear()
        roots, previews = B.build_group(name)
        objs = []
        for r in roots:
            objs.append(r)
            objs += list(r.children_recursive)
        for label, show, size in previews:
            if name == 'props':
                if not label.startswith('ob_'):
                    continue
                key = 'o_' + label[3:]
            else:
                tier = label.rsplit('_t', 1)[1]
                key = f'b_{name}_{tier}'
            ids = set()
            for r in show:
                ids.add(r.name)
                ids.update(c.name for c in r.children_recursive)
            for o in objs:
                o.hide_render = o.name not in ids
            meshes = [o for o in objs if o.type == 'MESH' and o.name in ids]
            render(key, meshes)
            print('icon', key)


def do_units():
    for name in C.BUILDERS:
        lib.reset()
        build, anim, scale = C.BUILDERS[name]
        rig, ob = build()
        anim(rig)
        rig.finish()
        for tr in rig.ob.animation_data.nla_tracks:
            tr.mute = tr.name != 'idle'
        bpy.context.scene.frame_set(1)
        render('u_' + name, [ob], yaw=22, pitch=14, samples=48)
        print('icon', 'u_' + name)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    which = sys.argv[1:] or ['buildings', 'units']
    if 'buildings' in which:
        do_buildings()
    if 'units' in which:
        do_units()
