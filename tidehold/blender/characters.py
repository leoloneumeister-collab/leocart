"""The five fighters of Tidehold: modelled, rigged and animated in Blender, exported as GLB.

Each character is one skinned mesh (vertex colours, a few glow parts) plus clips named
idle, run, attack, die. Run:  python characters.py [name ...] [--preview]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

import lib
from lib import Mesher, Rig, rgb, shade, mixc, lerp

SKIN = rgb('#f1c08f')
SKIN_DK = rgb('#d9a272')
LEATHER = rgb('#a06c3c')
LEATHER_DK = rgb('#6f4a2c')
STEEL = rgb('#b9c0cc')
STEEL_DK = rgb('#98a2b2')
GOLD = rgb('#e8b830')
WHITE = rgb('#f4f1e8')
BLUE = rgb('#3d7be0')
BLUE_DK = rgb('#2a56a8')
RED = rgb('#d8453f')
BLACK = rgb('#3b3f4a')

SIDE = {'L': 1, 'R': -1}  # the character's left hand is +x because it faces -y


def humanoid_bones(h=1.0, w=1.0, extra=()):
    """Bone pivots for a standing humanoid of height ~h (units are tiles). Extra bones: (name, head, parent)."""
    z = lambda v: v * h
    x = lambda v: v * w
    b = [
        ('root', (0, 0, 0), None),
        ('hips', (0, 0, z(0.36)), 'root'),
        ('spine', (0, 0, z(0.38)), 'hips'),
        ('chest', (0, 0, z(0.5)), 'spine'),
        ('head', (0, 0, z(0.70)), 'chest'),
    ]
    for s, k in SIDE.items():
        b += [
            (f'upper_arm.{s}', (x(0.2) * k, 0, z(0.64)), 'chest'),
            (f'forearm.{s}', (x(0.2) * k, 0, z(0.50)), f'upper_arm.{s}'),
            (f'hand.{s}', (x(0.2) * k, 0, z(0.37)), f'forearm.{s}'),
            (f'thigh.{s}', (x(0.09) * k, 0, z(0.36)), 'hips'),
            (f'shin.{s}', (x(0.09) * k, 0, z(0.19)), f'thigh.{s}'),
            (f'foot.{s}', (x(0.09) * k, 0, z(0.04)), f'shin.{s}'),
        ]
    return b + list(extra)


# ---------- shared body parts ----------

def legs(m, h=1.0, w=1.0, pants=BLACK, boots=LEATHER_DK, greaves=None, thick=1.0):
    z = lambda v: v * h
    for s, k in SIDE.items():
        x = 0.09 * w * k
        m.cyl(0.062 * thick, z(0.18), (x, 0, z(0.19)), color=pants, segs=8, bone=f'thigh.{s}')
        m.sphere(0.066 * thick, (x, 0, z(0.19)), color=pants, segs=8, bone=f'thigh.{s}')
        m.cyl(0.055 * thick, z(0.17), (x, 0, z(0.04)), color=boots, r2=0.062 * thick, segs=8, bone=f'shin.{s}')
        if greaves:
            m.cyl(0.062 * thick, z(0.09), (x, 0, z(0.09)), color=greaves, segs=8, bone=f'shin.{s}')
        m.box((0.10 * thick, 0.19 * thick, 0.06), (x, -0.045 * thick, 0.03), color=boots, bevel=0.012, bone=f'foot.{s}')


def arm(m, s, h=1.0, w=1.0, sleeve=STEEL, glove=SKIN, thick=1.0, forearm_col=None, shoulder_pad=None):
    z = lambda v: v * h
    k = SIDE[s]
    x = 0.2 * w * k
    m.cyl(0.05 * thick, z(0.15), (x, 0, z(0.50)), color=sleeve, r2=0.055 * thick, segs=8, bone=f'upper_arm.{s}')
    m.sphere(0.058 * thick, (x, 0, z(0.64)), color=shoulder_pad or sleeve, segs=8, bone=f'upper_arm.{s}')
    m.sphere(0.05 * thick, (x, 0, z(0.5)), color=sleeve, segs=8, bone=f'forearm.{s}')
    m.cyl(0.046 * thick, z(0.14), (x, 0, z(0.37)), color=forearm_col or sleeve, r2=0.05 * thick, segs=8, bone=f'forearm.{s}')
    m.sphere(0.05 * thick, (x, 0, z(0.35)), color=glove, segs=8, bone=f'hand.{s}')


def face(m, z, r=0.15, skin=SKIN, eyes=BLACK, y=-1.0, brow=None, bone='head'):
    """Simple friendly face on the -y side of a head centred at z."""
    m.sphere(r, (0, 0, z), scale=(1, 0.96, 1.0), color=skin, segs=12, bone=bone, grad=0.1)
    for sx in (-1, 1):
        m.sphere(0.022, (sx * r * 0.36, -r * 0.88, z + r * 0.05), color=eyes, segs=6, bone=bone, grad=0.0, jitter=0)
        m.sphere(0.008, (sx * r * 0.36 - 0.005, -r * 0.93, z + r * 0.12), color=WHITE, segs=4, bone=bone, grad=0.0, jitter=0)
        if brow:
            m.box((0.05, 0.015, 0.012), (sx * r * 0.36, -r * 0.88, z + r * 0.28), color=brow, bone=bone, grad=0)
    m.sphere(0.02, (0, -r * 0.98, z - r * 0.12), color=shade(skin, 0.9), segs=5, bone=bone, grad=0, jitter=0)
    m.box((0.055, 0.012, 0.012), (0, -r * 0.9, z - r * 0.38), color=rgb('#b0524a'), bone=bone, grad=0, jitter=0)


# ---------- animation helpers ----------

def swing(t, amp, phase=0.0):
    return math.sin(math.tau * t + phase) * amp


def run_pose(t, lean=0.1, stride=0.75, bob=0.035, arm_amp=0.65, knee=1.0, twist=0.15, elbow=0.7, extra=None):
    """Pose for a running cycle at phase t in [0,1). rx < 0 swings forward (character faces -y)."""
    pose = {}
    lp = math.tau * t
    for s, k in SIDE.items():
        ph = lp + (0 if s == 'L' else math.pi)
        thigh = -math.sin(ph) * stride
        pose[f'thigh.{s}'] = {'r': (thigh, 0, 0.0)}
        pose[f'shin.{s}'] = {'r': (max(0.0, math.sin(ph + 1.2)) * 1.1 * knee + 0.1, 0, 0)}
        pose[f'foot.{s}'] = {'r': (-0.2 + math.sin(ph) * 0.2, 0, 0)}
        a = math.sin(ph)
        pose[f'upper_arm.{s}'] = {'r': (a * arm_amp, 0, 0.12 * k if False else 0)}
        pose[f'forearm.{s}'] = {'r': (-elbow - max(0, -a) * 0.3, 0, 0)}
    pose['hips'] = {'r': (-lean * 0.4, 0, math.sin(lp) * twist * 0.5), 't': (0, 0, abs(math.sin(lp)) * bob - bob * 0.5)}
    pose['spine'] = {'r': (-lean * 0.6, 0, -math.sin(lp) * twist)}
    pose['chest'] = {'r': (0, 0, -math.sin(lp) * twist * 0.5)}
    pose['head'] = {'r': (lean * 0.5, 0, math.sin(lp) * twist * 0.4)}
    if extra:
        for k2, v in extra(t, lp).items():
            pose.setdefault(k2, {}).update(v)
    return pose


def idle_pose(t, breathe=0.012, sway=0.05, extra=None):
    lp = math.tau * t
    pose = {
        'hips': {'t': (0, 0, math.sin(lp) * breathe * 0.5)},
        'spine': {'r': (math.sin(lp) * 0.012, 0, math.sin(lp * 0.5) * 0.02)},
        'chest': {'s': (1.0, 1.0, 1.0 + math.sin(lp) * breathe), 'r': (0, 0, 0)},
        'head': {'r': (math.sin(lp + 1.0) * 0.03, 0, math.sin(lp * 0.5) * 0.08)},
        'upper_arm.L': {'r': (math.sin(lp + 0.5) * sway * 0.6, 0, 0.06)},
        'upper_arm.R': {'r': (math.sin(lp + 0.9) * sway * 0.6, 0, -0.06)},
        'forearm.L': {'r': (-0.35 + math.sin(lp) * 0.04, 0, 0)},
        'forearm.R': {'r': (-0.35 + math.sin(lp + 0.4) * 0.04, 0, 0)},
    }
    if extra:
        for k2, v in extra(t, lp).items():
            pose.setdefault(k2, {}).update(v)
    return pose


def die_pose(u, back=True, spin=0.0, drop=0.0):
    """u in [0,1]: standing to lying. Falls over backwards (or forwards) with floppy limbs."""
    e = lib.smoothstep(u)
    ang = (-1.5 if back else 1.5) * e
    pose = {
        'root': {'r': (ang, 0, spin * e), 't': (0, (0.08 if back else -0.08) * e, 0.07 * e - drop * e)},
        'head': {'r': (0.25 * e * (1 if back else -1), 0, 0.2 * e)},
        'upper_arm.L': {'r': (-1.0 * e, 0, 0.9 * e)},
        'upper_arm.R': {'r': (-0.7 * e, 0, -1.0 * e)},
        'forearm.L': {'r': (-0.5 * e, 0, 0)},
        'forearm.R': {'r': (-0.9 * e, 0, 0)},
        'thigh.L': {'r': (-0.3 * e, 0, 0.25 * e)},
        'thigh.R': {'r': (0.2 * e, 0, -0.3 * e)},
        'shin.L': {'r': (0.6 * e, 0, 0)},
        'shin.R': {'r': (0.9 * e, 0, 0)},
    }
    return pose


def key_cycle(clip, frames, fn):
    """Key a looping cycle: frame 1..frames, last key equals first."""
    for f in range(frames + 1):
        clip.key(1 + f, fn(f / frames))
    clip.done()


def merge(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            out.setdefault(k, {}).update(v)
    return out


# ---------- the squire ----------

def build_squire():
    extra = [('weapon', (-0.2, 0, 0.35), 'hand.R'), ('shield', (0.2, 0, 0.45), 'forearm.L'), ('plume', (0, 0, 0.93), 'head'),
             ('cape', (0, 0.1, 0.66), 'chest')]
    bones = humanoid_bones(1.0, 1.0, extra)
    rig = Rig('Rig', bones)
    m = Mesher('squire', [b[0] for b in bones], seed=3)
    legs(m, pants=rgb('#33405e'), boots=LEATHER_DK, greaves=STEEL, thick=1.05)
    # torso: steel chest, blue tabard, belt
    m.box((0.34, 0.22, 0.27), (0, 0, 0.55), color=STEEL, bevel=0.03, bone='chest')
    m.box((0.31, 0.24, 0.17), (0, 0, 0.42), color=STEEL_DK, bevel=0.02, bone='spine')
    m.box((0.26, 0.012, 0.34), (0, -0.126, 0.5), color=BLUE, bevel=0.004, bone='chest', grad=0.05)
    m.box((0.05, 0.014, 0.2), (0, -0.14, 0.52), color=WHITE, bone='chest', grad=0)
    m.box((0.16, 0.014, 0.05), (0, -0.14, 0.57), color=WHITE, bone='chest', grad=0)
    m.box((0.31, 0.25, 0.035), (0, 0, 0.375), color=LEATHER, bevel=0.01, bone='spine')
    m.box((0.05, 0.02, 0.045), (0, -0.14, 0.375), color=GOLD, bevel=0.006, bone='spine', grad=0)
    # arms
    for s in 'LR':
        arm(m, s, sleeve=STEEL, glove=SKIN, shoulder_pad=STEEL_DK)
    # head + open-face helmet
    face(m, 0.83, 0.16, brow=LEATHER_DK)
    m.lathe([(0, 1.0), (0.09, 0.985), (0.15, 0.94), (0.172, 0.89), (0.176, 0.845), (0.12, 0.845), (0.0, 0.9)], color=STEEL, segs=14,
            bone='head', smooth=True)
    m.box((0.35, 0.05, 0.03), (0, -0.12, 0.865), color=STEEL_DK, bevel=0.008, bone='head')
    m.box((0.03, 0.03, 0.11), (0, -0.17, 0.81), color=STEEL, bevel=0.008, bone='head')
    for sx in (-1, 1):
        m.box((0.03, 0.11, 0.1), (sx * 0.165, -0.0, 0.79), color=STEEL_DK, bevel=0.008, bone='head')
    m.box((0.34, 0.07, 0.07), (0, 0.13, 0.82), color=STEEL_DK, bevel=0.012, bone='head')
    m.box((0.035, 0.22, 0.04), (0, 0.0, 1.0), color=STEEL_DK, bevel=0.01, bone='head')
    m.box((0.045, 0.24, 0.1), (0, 0.04, 1.04), color=RED, bevel=0.018, bone='plume')
    m.box((0.05, 0.12, 0.09), (0, 0.16, 0.98), color=shade(RED, 0.85), bevel=0.018, bone='plume')
    # cape
    m.box((0.3, 0.015, 0.34), (0, 0.125, 0.5), color=BLUE_DK, bevel=0.004, bone='cape', grad=0.2)
    # shield (left arm, +x)
    m.cyl(0.19, 0.04, (0.27, -0.05, 0.45), rot=(math.pi / 2, 0, 0), color=BLUE, segs=14, bone='shield', base_z=False)
    m.cyl(0.2, 0.025, (0.27, -0.07, 0.45), rot=(math.pi / 2, 0, 0), color=WHITE, segs=14, bone='shield', base_z=False, grad=0)
    m.cyl(0.17, 0.03, (0.27, -0.075, 0.45), rot=(math.pi / 2, 0, 0), color=BLUE, segs=14, bone='shield', base_z=False, grad=0)
    m.sphere(0.05, (0.27, -0.095, 0.45), scale=(1, 0.5, 1), color=GOLD, segs=8, bone='shield', grad=0)
    m.box((0.05, 0.015, 0.15), (0.27, -0.087, 0.45), color=WHITE, bone='shield', grad=0)
    m.box((0.15, 0.015, 0.05), (0.27, -0.087, 0.45), color=WHITE, bone='shield', grad=0)
    # sword (right hand, -x), blade pointing forward (-y) and up
    m.box((0.035, 0.035, 0.1), (-0.2, 0.0, 0.34), color=LEATHER_DK, bevel=0.008, bone='weapon')
    m.box((0.14, 0.03, 0.03), (-0.2, -0.0, 0.4), color=GOLD, bevel=0.008, bone='weapon', grad=0)
    m.box((0.045, 0.012, 0.42), (-0.2, 0.0, 0.62), color=rgb('#eef2f8'), bevel=0.004, bone='weapon', taper=0.4, grad=0.05)
    ob = m.build(rig.ob)
    return rig, ob


def anim_squire(rig):
    rest_sword = {'weapon': {'r': (0.0, 0, 0)}}

    def idle(t):
        return merge(idle_pose(t), {'upper_arm.R': {'r': (-0.5 + math.sin(math.tau * t) * 0.03, 0, -0.1)},
                                    'forearm.R': {'r': (-0.7, 0, 0)}, 'weapon': {'r': (-0.35, 0, 0)},
                                    'upper_arm.L': {'r': (-0.35, 0, 0.1)}, 'forearm.L': {'r': (-1.0, 0, 0)},
                                    'cape': {'r': (math.sin(math.tau * t) * 0.04, 0, 0)}})

    key_cycle(rig.clip('idle', 40), 40, idle)

    def run(t):
        p = run_pose(t, lean=0.14, stride=0.8, arm_amp=0.6, extra=lambda t_, lp: {
            'upper_arm.R': {'r': (-0.7 + math.sin(lp) * 0.2, 0, -0.12)}, 'forearm.R': {'r': (-0.9, 0, 0)},
            'weapon': {'r': (-0.4, 0, 0)}, 'upper_arm.L': {'r': (-0.4 - math.sin(lp) * 0.15, 0, 0.1)},
            'forearm.L': {'r': (-1.0, 0, 0)}, 'cape': {'r': (0.25 + math.sin(lp * 2) * 0.15, 0, 0)},
            'plume': {'r': (0.25 + math.sin(lp * 2 + 1) * 0.2, 0, 0)}})
        return p

    key_cycle(rig.clip('run', 16), 16, run)

    # attack: raise sword, slash down-forward, recover (non-looping)
    clip = rig.clip('attack', 16, loop=False)
    keys = {
        1: dict(arm=-0.5, fore=-0.7, wp=-0.35, twist=0.0, lunge=0.0, sh=-0.35),
        4: dict(arm=-2.5, fore=-0.5, wp=-0.2, twist=0.35, lunge=0.0, sh=-0.2),
        7: dict(arm=-0.4, fore=-0.2, wp=0.5, twist=-0.45, lunge=0.1, sh=-0.7),
        11: dict(arm=-0.2, fore=-0.2, wp=0.6, twist=-0.4, lunge=0.1, sh=-0.7),
        16: dict(arm=-0.5, fore=-0.7, wp=-0.35, twist=0.0, lunge=0.0, sh=-0.35),
    }
    for f, k in keys.items():
        clip.key(f, {
            'hips': {'t': (0, -k['lunge'], 0), 'r': (0, 0, -k['twist'] * 0.4)},
            'spine': {'r': (-0.1 if f in (7, 11) else 0.0, 0, k['twist'])},
            'upper_arm.R': {'r': (k['arm'], 0, -0.1)}, 'forearm.R': {'r': (k['fore'], 0, 0)}, 'weapon': {'r': (k['wp'], 0, 0)},
            'upper_arm.L': {'r': (k['sh'], 0, 0.1)}, 'forearm.L': {'r': (-1.0, 0, 0)},
            'thigh.L': {'r': (-0.35 * k['lunge'] * 5, 0, 0)}, 'thigh.R': {'r': (0.3 * k['lunge'] * 5, 0, 0)},
            'shin.R': {'r': (0.3 * k['lunge'] * 5, 0, 0)},
            'cape': {'r': (0.2 * k['lunge'] * 5, 0, 0)},
        })
    clip.done()
    clip = rig.clip('die', 26, loop=False)
    for f in range(0, 27, 2):
        u = f / 26
        p = die_pose(u, back=True)
        p['weapon'] = {'r': (-0.35 + u, 0, 0)}
        clip.key(1 + f, p)
    clip.done()


# ---------- the slinger ----------

GREEN = rgb('#3da56a')
GREEN_DK = rgb('#2b8352')
CREAM = rgb('#e9ddb4')
SAND = rgb('#c9b27a')


def build_slinger():
    extra = [('sling', (-0.17, 0, 0.33), 'hand.R'), ('hood', (0, 0.1, 0.9), 'head'), ('cloak', (0, 0.1, 0.68), 'chest'),
             ('pouch', (0.13, 0.0, 0.34), 'hips')]
    bones = humanoid_bones(0.95, 0.85, extra)
    rig = Rig('Rig', bones)
    m = Mesher('slinger', [b[0] for b in bones], seed=5)
    legs(m, h=0.95, w=0.85, pants=SAND, boots=LEATHER, thick=0.9)
    m.box((0.28, 0.19, 0.24), (0, 0, 0.52), color=LEATHER, bevel=0.03, bone='chest')
    m.box((0.27, 0.2, 0.15), (0, 0, 0.4), color=GREEN, bevel=0.02, bone='spine')
    m.box((0.1, 0.012, 0.22), (0, -0.103, 0.52), color=LEATHER_DK, bone='chest', grad=0)
    m.box((0.28, 0.21, 0.03), (0, 0, 0.36), color=LEATHER_DK, bevel=0.008, bone='spine')
    for s_ in 'LR':
        arm(m, s_, h=0.95, w=0.85, sleeve=GREEN, glove=LEATHER, thick=0.85, shoulder_pad=GREEN_DK)
    face(m, 0.79, 0.145, brow=LEATHER_DK)
    m.box((0.2, 0.06, 0.09), (0, -0.115, 0.745), color=CREAM, bevel=0.015, bone='head')
    # hood: dome with a pointed tail
    m.lathe([(0, 0.99), (0.09, 0.97), (0.155, 0.92), (0.178, 0.85), (0.182, 0.78), (0.14, 0.75)], color=GREEN, segs=12, bone='head', arc=(-55, 290))
    m.pyramid(0.14, 0.14, 0.2, (0, 0.15, 0.85), rot=(math.pi / 2 + 0.3, 0, 0), color=GREEN_DK, bone='hood')
    m.box((0.36, 0.05, 0.05), (0, -0.075, 0.9), color=GREEN_DK, bevel=0.012, bone='head')
    m.box((0.25, 0.015, 0.4), (0, 0.108, 0.5), color=GREEN_DK, bevel=0.004, bone='cloak', grad=0.25)
    m.box((0.31, 0.015, 0.08), (0, 0.108, 0.7), color=GREEN, bevel=0.004, bone='cloak', grad=0.0)
    # stone pouch and strap
    m.box((0.09, 0.07, 0.09), (0.15, -0.02, 0.33), color=LEATHER, bevel=0.015, bone='pouch')
    m.sphere(0.025, (0.15, -0.065, 0.36), color=rgb('#8f9298'), segs=6, bone='pouch', grad=0)
    # sling: strap from the right hand with a pouch; the sling bone whirls it
    m.box((0.016, 0.34, 0.016), (-0.17, -0.17, 0.34), color=LEATHER_DK, bone='sling', grad=0)
    m.sphere(0.04, (-0.17, -0.36, 0.34), scale=(1, 1.3, 0.7), color=LEATHER, segs=6, bone='sling', grad=0)
    m.sphere(0.028, (-0.17, -0.36, 0.34), color=rgb('#8f9298'), segs=6, bone='sling', grad=0)
    return rig, m.build(rig.ob)


def anim_slinger(rig):
    def idle(t):
        return merge(idle_pose(t), {'upper_arm.R': {'r': (-0.2, 0, -0.1)}, 'forearm.R': {'r': (-0.9, 0, 0)},
                                    'upper_arm.L': {'r': (-0.2, 0, 0.1)}, 'forearm.L': {'r': (-0.6, 0, 0)},
                                    'cloak': {'r': (math.sin(math.tau * t) * 0.05, 0, 0)},
                                    'sling': {'r': (0, 0, math.sin(math.tau * t) * 0.15)}})

    key_cycle(rig.clip('idle', 44), 44, idle)

    def run(t):
        return run_pose(t, lean=0.22, stride=0.85, arm_amp=0.7, bob=0.04, extra=lambda t_, lp: {
            'cloak': {'r': (0.35 + math.sin(lp * 2) * 0.15, 0, 0)}, 'hood': {'r': (0.3 + math.sin(lp * 2 + 1) * 0.2, 0, 0)},
            'sling': {'r': (0.2, 0, math.sin(lp) * 0.4)}, 'forearm.R': {'r': (-0.9, 0, 0)}, 'forearm.L': {'r': (-0.9, 0, 0)}})

    key_cycle(rig.clip('run', 14), 14, run)
    # attack: wind the sling over the head, release forward
    clip = rig.clip('attack', 18, loop=False)
    for f in range(0, 19):
        u = f / 18
        spin = u * math.tau * 2.2 if u < 0.62 else math.tau * 2.2 * 0.62 + (u - 0.62) * 1.2
        raise_ = lib.smoothstep(min(1, u / 0.25)) * (1 - lib.smoothstep((u - 0.7) / 0.25))
        rel = lib.smoothstep((u - 0.62) / 0.12) * (1 - lib.smoothstep((u - 0.8) / 0.2))
        clip.key(1 + f, {
            'spine': {'r': (-0.15 * rel + 0.05, 0, 0.25 * raise_ - 0.4 * rel)},
            'hips': {'r': (0, 0, 0.12 * raise_)},
            'upper_arm.R': {'r': (-2.7 * raise_ + 1.0 * rel, 0, -0.2)}, 'forearm.R': {'r': (-0.5 + 0.5 * raise_, 0, 0)},
            'sling': {'r': (0, 0, spin)},
            'upper_arm.L': {'r': (-0.6 * raise_, 0, 0.4 * raise_)}, 'forearm.L': {'r': (-0.4, 0, 0)},
            'thigh.L': {'r': (-0.25 * rel, 0, 0)}, 'thigh.R': {'r': (0.2 * rel, 0, 0)},
            'cloak': {'r': (0.1 + 0.3 * rel, 0, 0)},
        })
    clip.done()
    clip = rig.clip('die', 26, loop=False)
    for f in range(0, 27, 2):
        u = f / 26
        p = die_pose(u, back=False)
        p['sling'] = {'r': (0, 0, u * 2)}
        clip.key(1 + f, p)
    clip.done()


# ---------- the sapper ----------

ORANGE = rgb('#f09a35')
BRASS = rgb('#c9963a')
SOOT = rgb('#74655d')


def build_sapper():
    extra = [('keg', (0, 0.15, 0.56), 'chest'), ('fuse', (0.0, 0.2, 0.82), 'keg'), ('bomb', (0.22, -0.02, 0.33), 'hand.L')]
    bones = humanoid_bones(0.85, 1.1, extra)
    rig = Rig('Rig', bones)
    m = Mesher('sapper', [b[0] for b in bones], seed=7)
    legs(m, h=0.85, w=1.1, pants=rgb('#7a3b2a'), boots=LEATHER_DK, thick=1.15)
    m.box((0.38, 0.26, 0.24), (0, 0, 0.47), color=ORANGE, bevel=0.04, bone='chest')
    m.box((0.34, 0.25, 0.14), (0, 0, 0.35), color=rgb('#9a5a2a'), bevel=0.03, bone='spine')
    m.box((0.38, 0.27, 0.035), (0, 0, 0.31), color=LEATHER_DK, bevel=0.008, bone='spine')
    # bandolier with little bombs
    m.box((0.05, 0.28, 0.45), (-0.05, 0, 0.47), rot=(0, 0.6, 0), color=LEATHER, bone='chest', bevel=0.008, grad=0)
    for i in range(3):
        m.sphere(0.028, (0.0 + i * 0.07 - 0.07, -0.145, 0.55 - i * 0.05), color=BLACK, segs=6, bone='chest', grad=0)
    for s_ in 'LR':
        arm(m, s_, h=0.85, w=1.1, sleeve=ORANGE, glove=LEATHER_DK, thick=1.1, shoulder_pad=SOOT)
    face(m, 0.68, 0.165, skin=mixc(SKIN, SOOT, 0.35), brow=BLACK)
    # leather cap and goggles
    m.lathe([(0, 0.87), (0.1, 0.85), (0.16, 0.8), (0.178, 0.74), (0.18, 0.69), (0.1, 0.7), (0.0, 0.76)], color=LEATHER, segs=12, bone='head')
    m.box((0.36, 0.05, 0.03), (0, -0.12, 0.735), color=LEATHER_DK, bevel=0.008, bone='head')
    for sx in (-1, 1):
        m.cyl(0.058, 0.05, (sx * 0.075, -0.15, 0.74), rot=(math.pi / 2, 0, 0), color=BRASS, segs=10, bone='head', base_z=False, grad=0)
        m.cyl(0.042, 0.03, (sx * 0.075, -0.18, 0.74), rot=(math.pi / 2, 0, 0), color=rgb('#2a3138'), segs=10, bone='head', base_z=False, grad=0)
        m.sphere(0.014, (sx * 0.067, -0.195, 0.752), color=WHITE, segs=4, bone='head', grad=0, jitter=0)
    # powder keg on the back
    m.cyl(0.14, 0.3, (0, 0.21, 0.4), color=rgb('#8a5a2e'), r2=0.13, segs=12, bone='keg')
    for z in (0.46, 0.6, 0.72):
        m.cyl(0.152, 0.03, (0, 0.21, z - 0.03), color=rgb('#464b55'), segs=12, bone='keg', grad=0)
    m.cyl(0.12, 0.03, (0, 0.21, 0.71), color=RED, segs=12, bone='keg', grad=0)
    m.box((0.02, 0.02, 0.09), (0, 0.21, 0.76), rot=(0.25, 0, 0), color=rgb('#d6c08a'), bone='fuse', grad=0)
    m.sphere(0.03, (0, 0.235, 0.82), color=(1, 0.6, 0.1), segs=6, bone='fuse', mat='glow_orange', grad=0, jitter=0)
    # bomb in the left hand
    m.sphere(0.075, (0.22, -0.02, 0.33), color=BLACK, segs=10, bone='bomb', grad=0.1)
    m.box((0.015, 0.015, 0.05), (0.22, -0.02, 0.4), color=rgb('#d6c08a'), bone='bomb', grad=0)
    m.sphere(0.025, (0.22, -0.02, 0.43), color=(1, 0.6, 0.1), segs=6, bone='bomb', mat='glow_orange', grad=0, jitter=0)
    return rig, m.build(rig.ob)


def anim_sapper(rig):
    def idle(t):
        return merge(idle_pose(t, breathe=0.02), {'upper_arm.L': {'r': (-0.6, 0, 0.15)}, 'forearm.L': {'r': (-1.0, 0, 0)},
                                                  'upper_arm.R': {'r': (-0.15, 0, -0.1)}, 'forearm.R': {'r': (-0.5, 0, 0)},
                                                  'fuse': {'s': 1.0 + math.sin(math.tau * t * 3) * 0.25}, 'keg': {'r': (math.sin(math.tau * t) * 0.03, 0, 0)}})

    key_cycle(rig.clip('idle', 36), 36, idle)

    def run(t):
        return run_pose(t, lean=0.32, stride=0.95, arm_amp=0.9, bob=0.045, knee=1.2, extra=lambda t_, lp: {
            'upper_arm.L': {'r': (-1.0 + math.sin(lp) * 0.2, 0, 0.15)}, 'forearm.L': {'r': (-1.1, 0, 0)},
            'keg': {'r': (0.08 + math.sin(lp * 2) * 0.05, 0, math.sin(lp) * 0.06)},
            'fuse': {'s': 1.0 + math.sin(lp * 3) * 0.35}, 'bomb': {'r': (0, 0, 0)}})

    key_cycle(rig.clip('run', 12), 12, run)
    # attack: panicked hop, hugging the keg (the sim blows it up right after)
    clip = rig.clip('attack', 14, loop=False)
    for f in range(0, 15):
        u = f / 14
        hop = abs(math.sin(u * math.pi * 3)) * 0.07
        shake = math.sin(u * math.tau * 5) * 0.12
        clip.key(1 + f, {
            'hips': {'t': (0, 0, hop), 'r': (0, 0, shake)},
            'spine': {'r': (-0.2, 0, -shake)},
            'upper_arm.L': {'r': (-1.5, 0, 0.3)}, 'upper_arm.R': {'r': (-1.5, 0, -0.3)},
            'forearm.L': {'r': (-0.8, 0, 0)}, 'forearm.R': {'r': (-0.8, 0, 0)},
            'fuse': {'s': 1.0 + 0.7 * math.sin(u * math.tau * 4)}, 'keg': {'r': (0, 0, shake * 0.6)},
            'thigh.L': {'r': (-0.4 * abs(math.sin(u * 9)), 0, 0)}, 'thigh.R': {'r': (-0.4 * abs(math.cos(u * 9)), 0, 0)},
        })
    clip.done()
    clip = rig.clip('die', 22, loop=False)
    for f in range(0, 23, 2):
        u = f / 22
        p = die_pose(u, back=True, spin=0.4)
        p['keg'] = {'r': (u * 0.5, 0, 0)}
        clip.key(1 + f, p)
    clip.done()


# ---------- the brute ----------

FUR = rgb('#9a6a3a')
TAN = rgb('#d9a070')
IRON = rgb('#9aa4b4')
BONE = rgb('#eadfc4')


def build_brute():
    extra = [('weapon', (-0.3, 0, 0.5), 'hand.R'), ('pelt', (0, 0.0, 0.88), 'chest'), ('braid', (0, 0.0, 0.7), 'head'),
             ('loin', (0, 0, 0.52), 'hips')]
    bones = humanoid_bones(1.2, 1.55, extra)
    rig = Rig('Rig', bones)
    m = Mesher('brute', [b[0] for b in bones], seed=11)
    legs(m, h=1.2, w=1.55, pants=FUR, boots=LEATHER_DK, thick=1.75)
    # barrel chest and belly
    m.box((0.62, 0.36, 0.4), (0, 0, 0.78), color=TAN, bevel=0.07, bone='chest')
    m.box((0.5, 0.34, 0.28), (0, 0, 0.55), color=shade(TAN, 0.95), bevel=0.07, bone='spine', taper=0.9)
    m.box((0.54, 0.36, 0.07), (0, 0, 0.45), color=LEATHER, bevel=0.015, bone='spine')
    m.sphere(0.045, (0, -0.19, 0.45), color=BONE, scale=(1, 0.6, 1.1), segs=6, bone='spine', grad=0)
    m.box((0.62, 0.3, 0.2), (0, 0.0, 0.34), color=FUR, bevel=0.05, bone='loin', taper=1.1)
    for s_ in 'LR':
        arm(m, s_, h=1.2, w=1.55, sleeve=TAN, glove=TAN, thick=1.9, forearm_col=shade(TAN, 0.92), shoulder_pad=TAN)
        k = SIDE[s_]
        m.cyl(0.11, 0.08, (k * 0.31, 0, 0.76), color=IRON, segs=10, bone=f'upper_arm.{s_}', grad=0.1)
        m.cyl(0.1, 0.06, (k * 0.31, 0, 0.45), color=LEATHER_DK, segs=10, bone=f'forearm.{s_}', grad=0.1)
    # fur pelt over the shoulders
    m.box((0.78, 0.45, 0.12), (0, 0.0, 0.92), color=FUR, bevel=0.035, bone='pelt')
    m.box((0.5, 0.1, 0.3), (0, 0.18, 0.78), color=shade(FUR, 0.85), bevel=0.04, bone='pelt', taper=0.7)
    # small head, big jaw, horned helmet
    face(m, 1.04, 0.19, skin=TAN, brow=LEATHER_DK)
    m.sphere(0.12, (0, -0.1, 0.93), scale=(1.1, 0.8, 0.7), color=shade(TAN, 0.95), segs=8, bone='head', grad=0.1)
    m.box((0.2, 0.05, 0.12), (0, -0.17, 0.915), color=FUR, bevel=0.02, bone='head')
    m.lathe([(0, 1.3), (0.1, 1.28), (0.17, 1.22), (0.2, 1.14), (0.205, 1.07), (0.14, 1.05), (0.0, 1.1)], color=IRON, segs=12, bone='head')
    m.box((0.42, 0.06, 0.05), (0, -0.14, 1.07), color=shade(IRON, 0.8), bevel=0.012, bone='head')
    m.box((0.05, 0.05, 0.14), (0, -0.2, 1.0), color=IRON, bevel=0.01, bone='head')
    for sx in (-1, 1):
        m.cyl(0.04, 0.2, (sx * 0.22, 0, 1.15), rot=(0, sx * 0.9, 0), color=BONE, r2=0.012, segs=7, bone='head', base_z=False)
        m.cyl(0.04, 0.12, (sx * 0.32, 0, 1.25), rot=(0, sx * 0.3, 0), color=BONE, r2=0.012, segs=7, bone='head', base_z=False)
    m.box((0.05, 0.05, 0.28), (0.1, 0.0, 0.72), color=LEATHER, bone='braid', grad=0.1)
    # the club: a big studded log
    k = -1
    m.cyl(0.05, 0.3, (-0.31, 0, 0.35), color=LEATHER_DK, segs=8, bone='weapon', grad=0)
    m.cyl(0.075, 0.5, (-0.31, 0, 0.62), color=rgb('#8a5a2e'), r2=0.14, segs=10, bone='weapon')
    m.cyl(0.14, 0.12, (-0.31, 0, 1.08), color=rgb('#8a5a2e'), r2=0.12, segs=10, bone='weapon')
    for z, a in ((0.78, 0), (0.9, 2.1), (1.0, 4.0), (1.08, 1.0), (0.84, 3.3)):
        m.pyramid(0.05, 0.05, 0.07, (-0.31 + math.cos(a) * 0.15, math.sin(a) * 0.15, z), rot=(0, 0, 0), color=IRON, bone='weapon', grad=0)
    m.cyl(0.145, 0.03, (-0.31, 0, 0.85), color=IRON, segs=10, bone='weapon', grad=0)
    return rig, m.build(rig.ob)


def anim_brute(rig):
    def idle(t):
        return merge(idle_pose(t, breathe=0.025, sway=0.08), {'upper_arm.R': {'r': (-0.35, 0, -0.35)}, 'forearm.R': {'r': (-0.6, 0, 0)},
                                                              'upper_arm.L': {'r': (-0.1, 0, 0.35)}, 'forearm.L': {'r': (-0.5, 0, 0)},
                                                              'pelt': {'r': (math.sin(math.tau * t) * 0.03, 0, 0)},
                                                              'braid': {'r': (math.sin(math.tau * t + 1) * 0.1, 0, 0)}})

    key_cycle(rig.clip('idle', 56), 56, idle)

    def run(t):
        return run_pose(t, lean=0.1, stride=0.6, arm_amp=0.5, bob=0.05, twist=0.2, knee=0.8, elbow=0.5, extra=lambda t_, lp: {
            'upper_arm.R': {'r': (-0.5 + math.sin(lp) * 0.2, 0, -0.35)}, 'forearm.R': {'r': (-0.7, 0, 0)},
            'pelt': {'r': (0.1 + math.sin(lp * 2) * 0.08, 0, 0)}, 'braid': {'r': (0.3 + math.sin(lp * 2 + 1) * 0.3, 0, 0)},
            'loin': {'r': (math.sin(lp * 2) * 0.1, 0, 0)}})

    key_cycle(rig.clip('run', 26), 26, run)
    # attack: lift the club overhead, slam it down
    clip = rig.clip('attack', 22, loop=False)
    keys = {0: (-0.35, -0.6, 0.0, 0.0, 0.0), 7: (-3.0, -0.4, -0.25, 0.0, 0.1), 10: (-3.0, -0.4, -0.3, 0.0, 0.1),
            14: (0.15, -0.2, 0.3, 0.12, -0.12), 22: (-0.35, -0.6, 0.0, 0.0, 0.0)}
    for f, (arm_, fore, lean, drop, step) in keys.items():
        clip.key(1 + f, {
            'hips': {'t': (0, -step, -drop), 'r': (0, 0, 0)},
            'spine': {'r': (lean, 0, 0)}, 'chest': {'r': (lean * 0.5, 0, 0)},
            'upper_arm.R': {'r': (arm_, 0, -0.3)}, 'forearm.R': {'r': (fore, 0, 0)},
            'upper_arm.L': {'r': (arm_ * 0.85, 0, 0.3)}, 'forearm.L': {'r': (fore, 0, 0)},
            'thigh.L': {'r': (-0.4 * abs(step) * 6, 0, 0)}, 'thigh.R': {'r': (0.3 * abs(step) * 6, 0, 0)},
            'head': {'r': (-lean * 0.8, 0, 0)}, 'pelt': {'r': (-lean, 0, 0)},
        })
    clip.done()
    clip = rig.clip('die', 30, loop=False)
    for f in range(0, 31, 2):
        u = f / 30
        p = die_pose(u, back=True)
        p['root'] = {'r': (-1.52 * lib.smoothstep(u), 0, 0), 't': (0, 0.12 * lib.smoothstep(u), 0.12 * lib.smoothstep(u))}
        clip.key(1 + f, p)
    clip.done()


# ---------- the glider ----------

SKYBLUE = rgb('#bfe7ff')


def build_glider():
    bones = [('root', (0, 0, 0), None), ('body', (0, 0, 0.8), 'root'), ('chest', (0, -0.05, 0.85), 'body'),
             ('head', (0, -0.3, 0.88), 'chest'), ('wing.L', (0.04, -0.1, 1.26), 'body'), ('wing.R', (-0.04, -0.1, 1.26), 'body'),
             ('arm.L', (0.1, -0.2, 0.9), 'chest'), ('arm.R', (-0.1, -0.2, 0.9), 'chest'), ('leg.L', (0.05, 0.12, 0.8), 'chest'),
             ('leg.R', (-0.05, 0.12, 0.8), 'chest'), ('scarf', (0, 0.0, 0.92), 'chest')]
    rig = Rig('Rig', bones)
    m = Mesher('glider', [b[0] for b in bones], seed=13)
    # pilot, lying forward under the wing
    m.box((0.2, 0.34, 0.16), (0, -0.02, 0.84), color=rgb('#c97a3a'), bevel=0.04, bone='chest')
    m.box((0.21, 0.1, 0.17), (0, 0.19, 0.83), color=rgb('#7a5a3a'), bevel=0.03, bone='chest')
    face(m, 0.88, 0.115, brow=LEATHER_DK, bone='head')
    # rotate the face to look forward (-y): the helper faces -y already; push head forward
    m.lathe([(0, 0.98), (0.07, 0.97), (0.11, 0.93), (0.125, 0.88), (0.12, 0.84), (0.0, 0.88)], color=LEATHER, segs=10, bone='head')
    m.box((0.25, 0.03, 0.025), (0, -0.09, 0.915), color=BRASS, bevel=0.006, bone='head', grad=0)
    for sx in (-1, 1):
        m.cyl(0.036, 0.03, (sx * 0.05, -0.11, 0.9), rot=(math.pi / 2, 0, 0), color=BRASS, segs=8, bone='head', base_z=False, grad=0)
        m.cyl(0.026, 0.02, (sx * 0.05, -0.128, 0.9), rot=(math.pi / 2, 0, 0), color=rgb('#2a3138'), segs=8, bone='head', base_z=False, grad=0)
    # arms up to the control bar, legs trailing
    for s_, k in (('L', 1), ('R', -1)):
        m.cyl(0.032, 0.34, (k * 0.1, -0.22, 0.88), rot=(0.0, k * 0.0, 0), color=rgb('#c97a3a'), segs=7, bone=f'arm.{s_}', base_z=True, r2=0.028)
        m.sphere(0.036, (k * 0.1, -0.22, 1.21), color=SKIN, segs=6, bone=f'arm.{s_}', grad=0)
        m.cyl(0.04, 0.3, (k * 0.05, 0.3, 0.8), rot=(math.pi / 2, 0, 0), color=SAND, segs=7, bone=f'leg.{s_}', base_z=False)
        m.box((0.06, 0.11, 0.05), (k * 0.05, 0.5, 0.78), color=LEATHER_DK, bevel=0.012, bone=f'leg.{s_}')
    # control bar and wooden frame
    m.box((0.3, 0.025, 0.025), (0, -0.22, 1.215), color=rgb('#8a5a2e'), bone='body', grad=0)
    m.box((0.03, 0.9, 0.03), (0, 0.0, 1.27), color=rgb('#8a5a2e'), bevel=0.006, bone='body', grad=0)
    m.box((0.03, 0.03, 0.4), (0, -0.2, 1.05), rot=(0.0, 0, 0), color=rgb('#8a5a2e'), bone='body', grad=0)
    m.box((0.03, 0.03, 0.4), (0, 0.15, 1.05), color=rgb('#8a5a2e'), bone='body', grad=0)
    # wing panels: a delta wing, two halves with stripes
    span, sweep, droop = 1.0, 0.7, 0.12
    for s_, k in (('L', 1), ('R', -1)):
        rows = []
        for i, (frac0, frac1) in enumerate(((0.0, 0.34), (0.34, 0.67), (0.67, 1.0))):
            pass
        stripes = [rgb('#bfe7ff'), WHITE, rgb('#bfe7ff'), rgb('#ff8a6b')]
        n = len(stripes)
        for i in range(n):
            a0, a1 = i / n, (i + 1) / n
            def pt(a, front):
                x = k * span * a
                yfront = -0.6 + sweep * a
                yback = 0.28 + 0.02 * a
                y = yfront if front else yback + (0.0 if a < 0.99 else -0.05)
                z = 1.26 - droop * a
                return (x, y, z)
            quad = [pt(a0, True), pt(a1, True), pt(a1, False), pt(a0, False)]
            if k < 0:
                quad = quad[::-1]
            m.quad(quad, color=stripes[i], bone=f'wing.{s_}', mat='cloth', double=True)
        # leading-edge spar
        m.box((0.03, 0.03, 0.03), (k * span * 0.5, -0.6 + sweep * 0.5, 1.26 - droop * 0.5), color=rgb('#8a5a2e'), bone=f'wing.{s_}', grad=0)
    # scarf
    m.tri_strip([((0.03, 0.12, 0.92), (-0.03, 0.12, 0.92)), ((0.04, 0.3, 0.9), (-0.02, 0.3, 0.9)), ((0.05, 0.5, 0.93), (-0.01, 0.5, 0.93)),
                 ((0.04, 0.66, 0.9), (0.0, 0.66, 0.9))], color=RED, bone='scarf', mat='cloth')
    return rig, m.build(rig.ob)


def anim_glider(rig):
    def hover(t, amp, wing, scarf_amp):
        lp = math.tau * t
        flap = math.sin(lp) * wing
        return {
            'body': {'t': (0, 0, math.sin(lp) * amp), 'r': (math.sin(lp + 0.6) * 0.05, 0, math.sin(lp * 0.5) * 0.04)},
            'wing.L': {'r': (0, flap, 0)}, 'wing.R': {'r': (0, flap, 0)},
            'leg.L': {'r': (math.sin(lp + 1) * 0.12, 0, 0)}, 'leg.R': {'r': (math.sin(lp + 1.4) * 0.12, 0, 0)},
            'scarf': {'r': (math.sin(lp * 2) * 0.12, 0, math.sin(lp * 2 + 1) * 0.1)},
            'head': {'r': (math.sin(lp + 1) * 0.04, 0, math.sin(lp * 0.5) * 0.1)},
        }

    key_cycle(rig.clip('idle', 48), 48, lambda t: hover(t, 0.03, 0.06, 0.1))

    def glide(t):
        p = hover(t, 0.02, 0.2, 0.2)
        lp = math.tau * t
        p['body']['r'] = (-0.12 + math.sin(lp) * 0.03, 0, 0)
        p['scarf'] = {'r': (0.15 + math.sin(lp * 2) * 0.2, 0, math.sin(lp * 2 + 1) * 0.2)}
        return p

    key_cycle(rig.clip('run', 16), 16, glide)
    clip = rig.clip('attack', 16, loop=False)
    for f in range(0, 17):
        u = f / 16
        dive = math.sin(u * math.pi)
        clip.key(1 + f, {
            'body': {'r': (-0.7 * dive, 0, 0), 't': (0, -0.25 * dive, -0.18 * dive)},
            'wing.L': {'r': (0, -0.25 * dive, 0)}, 'wing.R': {'r': (0, 0.25 * dive, 0)},
            'leg.L': {'r': (0.4 * dive, 0, 0)}, 'leg.R': {'r': (0.4 * dive, 0, 0)},
            'scarf': {'r': (0.5 * dive, 0, 0)},
        })
    clip.done()
    clip = rig.clip('die', 26, loop=False)
    for f in range(0, 27, 2):
        u = f / 26
        e = lib.smoothstep(u)
        clip.key(1 + f, {
            'root': {'t': (0, 0, -0.78 * e * e), 'r': (0.5 * e, 0.4 * e, 3.2 * e)},
            'wing.L': {'r': (0, -0.9 * e, 0)}, 'wing.R': {'r': (0, 0.9 * e, 0)},
            'leg.L': {'r': (0.8 * e, 0, 0)}, 'leg.R': {'r': (0.5 * e, 0, 0)},
        })
    clip.done()


# ---------- driver ----------

BUILDERS = {}


def register(name, build, anim, scale=1.0):
    BUILDERS[name] = (build, anim, scale)


register('squire', build_squire, anim_squire)
register('slinger', build_slinger, anim_slinger)
register('sapper', build_sapper, anim_sapper)
register('brute', build_brute, anim_brute)
register('glider', build_glider, anim_glider)


def make(name, preview=False):
    lib.reset()
    build, anim, scale = BUILDERS[name]
    rig, ob = build()
    anim(rig)
    rig.finish()
    out = os.path.join(lib.MODELS, 'units', f'{name}.glb')
    size = lib.export_glb(out, [rig.ob, ob])
    print(f'{name}: {size / 1024:.0f} KB, {len(ob.data.polygons)} faces')
    if preview:
        pv = os.path.join(lib.HERE, '_preview')
        os.makedirs(pv, exist_ok=True)
        sc = bpy.context.scene
        for label, frame, clipname in (('rest', 1, None), ('run', 5, 'run'), ('attack', 8, 'attack'), ('die', 26, 'die')):
            sc.frame_set(frame)
            if clipname:
                # evaluate the clip: mute other NLA tracks
                for tr in rig.ob.animation_data.nla_tracks:
                    tr.mute = tr.name != clipname
                sc.frame_set(frame)
            lib.render_preview(os.path.join(pv, f'{name}_{label}.png'), [ob], size=360, yaw=35, pitch=20, ortho=True,
                               ground=True, transparent=False, frame=((0, 0, 0.55 * scale), 0.9 * scale))
    return ob


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = args or list(BUILDERS)
    for n in names:
        make(n, preview='--preview' in sys.argv)
