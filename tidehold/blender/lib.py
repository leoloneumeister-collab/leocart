"""Helpers for building Tidehold's 3D assets in Blender (run with the `bpy` Python module).

Everything is low-poly and uses vertex colours on one material per object, so each model is a
single draw call in the game. Parts can be bound to bones ("rigid skinning") for animated
characters. Units: 1 Blender unit = 1 map tile. Models face -Y (Blender front), which becomes +Z
in glTF, standing on z = 0.
"""
import math
import os
import random

import bpy
import bmesh
from mathutils import Euler, Matrix, Quaternion, Vector

_MATS = {}
HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, '..', 'public'))
MODELS = os.path.join(PUBLIC, 'models')


# ---------- colour ----------

def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(h):
    """'#rrggbb' (what you see on screen) to linear floats for vertex colours."""
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def shade(c, f):
    """Scale a linear colour. f < 1 darkens, > 1 brightens."""
    return tuple(min(1.0, max(0.0, v * f)) for v in c)


def mixc(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# ---------- scene ----------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.unit_settings.system = 'METRIC'
    return sc


def material(name, color=None, glow=None, strength=2.0, vertex_colors=False, rough=0.85, double=False):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    if vertex_colors:
        n = nt.nodes.new('ShaderNodeVertexColor')
        n.layer_name = 'Col'
        nt.links.new(n.outputs['Color'], bsdf.inputs['Base Color'])
    elif color is not None:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    if glow is not None:
        bsdf.inputs['Base Color'].default_value = (*glow, 1.0)
        bsdf.inputs['Emission Color'].default_value = (*glow, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = not double
    return m


# ---------- mesh builder ----------

class Mesher:
    """Accumulates primitives into one mesh with per-vertex colours (and optional bone weights)."""

    def __init__(self, name, bones=None, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.dv = self.bm.verts.layers.deform.verify()
        self.mats = ['base']
        self.groups = {b: i for i, b in enumerate(bones or [])}
        self.rng = random.Random(seed)

    # --- internals ---
    def _slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _paint(self, verts, color, bone, mat, smooth, grad, jitter):
        bm = self.bm
        verts = [v for v in verts if v.is_valid]
        faces = {f for v in verts for f in v.link_faces}
        zs = [v.co.z for v in verts]
        lo, hi = min(zs), max(zs)
        span = max(1e-6, hi - lo)
        slot = self._slot(mat)
        j = 1.0 + self.rng.uniform(-jitter, jitter) if jitter else 1.0
        for f in faces:
            f.material_index = slot
            f.smooth = smooth
            for lp in f.loops:
                t = (lp.vert.co.z - lo) / span
                k = (1.0 - grad) + grad * t
                c = shade(color, k * j) if mat == 'base' else color
                lp[self.col] = (*c, 1.0)
        if bone is not None:
            gi = self.groups[bone]
            for v in verts:
                v[self.dv][gi] = 1.0
        return faces

    def _xform(self, loc, rot, scale):
        return (Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @
                Matrix.Diagonal((*scale, 1.0)))

    # --- primitives ---
    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), color=(0.5, 0.5, 0.5), bevel=0.0, taper=1.0, bone=None,
            mat='base', smooth=False, grad=0.12, jitter=0.03, base_z=False):
        """size = (x, y, z). base_z puts loc at the bottom centre instead of the middle."""
        bm = self.bm
        before = set(bm.verts)
        r = bmesh.ops.create_cube(bm, size=1.0)
        new = r['verts']
        for v in new:
            if taper != 1.0 and v.co.z > 0:
                v.co.x *= taper
                v.co.y *= taper
        loc = Vector(loc)
        if base_z:
            loc = loc + Vector((0, 0, size[2] / 2))
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, size), verts=new)
        if bevel > 0:
            vs = set(new)
            edges = list({e for v in new for e in v.link_edges if e.verts[0] in vs and e.verts[1] in vs})
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES')
        created = [v for v in bm.verts if v not in before]
        self._paint(created, color, bone, mat, smooth, grad, jitter)
        return created

    def cyl(self, r, h, loc=(0, 0, 0), rot=(0, 0, 0), color=(0.5, 0.5, 0.5), r2=None, segs=12, bone=None, mat='base',
            smooth=True, grad=0.12, jitter=0.03, base_z=True, caps=True, scale=(1, 1)):
        bm = self.bm
        before = set(bm.verts)
        top = r if r2 is None else r2
        res = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=top, depth=h)
        new = res['verts']
        loc = Vector(loc)
        if base_z:
            loc = loc + Vector((0, 0, h / 2)) if rot == (0, 0, 0) else loc
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, (scale[0], scale[1], 1.0)), verts=new)
        created = [v for v in bm.verts if v not in before]
        faces = self._paint(created, color, bone, mat, smooth, grad, jitter)
        if smooth and caps:
            # keep caps crisp
            for f in faces:
                if len(f.verts) == segs:
                    for e in f.edges:
                        e.smooth = False
        return created

    def sphere(self, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), color=(0.5, 0.5, 0.5), segs=10, bone=None,
               mat='base', smooth=True, grad=0.2, jitter=0.02):
        bm = self.bm
        before = set(bm.verts)
        res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(4, segs // 2 + 1), radius=r)
        new = res['verts']
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, scale), verts=new)
        created = [v for v in bm.verts if v not in before]
        self._paint(created, color, bone, mat, smooth, grad, jitter)
        return created

    def pyramid(self, w, d, h, loc=(0, 0, 0), rot=(0, 0, 0), color=(0.7, 0.3, 0.2), bone=None, mat='base',
                grad=0.15, jitter=0.03, top=0.0, smooth=False):
        """Four-sided roof. `top` > 0 gives a flat-topped frustum (fraction of the base)."""
        bm = self.bm
        before = set(bm.verts)
        hx, hy = w / 2, d / 2
        base = [bm.verts.new((-hx, -hy, 0)), bm.verts.new((hx, -hy, 0)), bm.verts.new((hx, hy, 0)), bm.verts.new((-hx, hy, 0))]
        if top > 0:
            tp = [bm.verts.new((-hx * top, -hy * top, h)), bm.verts.new((hx * top, -hy * top, h)),
                  bm.verts.new((hx * top, hy * top, h)), bm.verts.new((-hx * top, hy * top, h))]
            for i in range(4):
                j = (i + 1) % 4
                bm.faces.new((base[i], base[j], tp[j], tp[i]))
            bm.faces.new(tp[::-1])
        else:
            apex = bm.verts.new((0, 0, h))
            for i in range(4):
                bm.faces.new((base[i], base[(i + 1) % 4], apex))
        bm.faces.new(base[::-1])
        new = [v for v in bm.verts if v not in before]
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, (1, 1, 1)), verts=new)
        faces = list({f for v in new for f in v.link_faces})
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(new, color, bone, mat, smooth, grad, jitter)
        return new

    def gable(self, w, d, h, loc=(0, 0, 0), rot=(0, 0, 0), color=(0.7, 0.3, 0.2), overhang=0.0, bone=None, mat='base',
              grad=0.15, jitter=0.03):
        """Roof with the ridge running along x. Base is w (x) by d (y), apex height h."""
        bm = self.bm
        before = set(bm.verts)
        hx, hy = w / 2 + overhang, d / 2 + overhang
        a = bm.verts.new((-hx, -hy, 0))
        b = bm.verts.new((hx, -hy, 0))
        c = bm.verts.new((hx, hy, 0))
        e = bm.verts.new((-hx, hy, 0))
        r0 = bm.verts.new((-hx, 0, h))
        r1 = bm.verts.new((hx, 0, h))
        bm.faces.new((a, b, r1, r0))
        bm.faces.new((c, e, r0, r1))
        bm.faces.new((a, r0, e))
        bm.faces.new((b, c, r1))
        bm.faces.new((a, e, c, b))
        new = [v for v in bm.verts if v not in before]
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, (1, 1, 1)), verts=new)
        faces = list({f for v in new for f in v.link_faces})
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(new, color, bone, mat, False, grad, jitter)
        return new

    def lathe(self, profile, loc=(0, 0, 0), rot=(0, 0, 0), color=(0.7, 0.7, 0.7), segs=14, bone=None, mat='base',
              smooth=True, grad=0.2, jitter=0.02, scale=(1, 1, 1), arc=None):
        """Spin a (radius, z) polyline around z. Close the shape by starting/ending on r = 0."""
        bm = self.bm
        before = set(bm.verts)
        vs = [bm.verts.new((r, 0, z)) for r, z in profile]
        es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
        sweep = math.tau if arc is None else math.radians(arc[1])
        bmesh.ops.spin(bm, geom=vs + es, angle=sweep, steps=segs, axis=(0, 0, 1), cent=(0, 0, 0), use_merge=arc is None)
        new = [v for v in bm.verts if v not in before]
        if arc is not None:
            bmesh.ops.rotate(bm, verts=new, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(arc[0]), 3, 'Z'))
        bmesh.ops.transform(bm, matrix=self._xform(loc, rot, scale), verts=new)
        faces = list({f for v in new for f in v.link_faces})
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._paint(new, color, bone, mat, smooth, grad, jitter)
        return new

    def quad(self, pts, color=(0.8, 0.8, 0.8), bone=None, mat='base', double=False, grad=0.0, jitter=0.0):
        """A flat polygon from world-space points (flags, cloth, wings)."""
        bm = self.bm
        before = set(bm.verts)
        vs = [bm.verts.new(p) for p in pts]
        bm.faces.new(vs)
        new = [v for v in bm.verts if v not in before]
        self._paint(new, color, bone, mat, False, grad, jitter)
        return new

    def tri_strip(self, rows, color=(0.8, 0.8, 0.8), bone=None, mat='base', double=True, grad=0.0):
        """rows: list of (left, right) point pairs, joined into a ribbon (cloth with folds)."""
        bm = self.bm
        before = set(bm.verts)
        vs = [(bm.verts.new(a), bm.verts.new(b)) for a, b in rows]
        for i in range(len(vs) - 1):
            (a0, b0), (a1, b1) = vs[i], vs[i + 1]
            bm.faces.new((a0, b0, b1, a1))
        new = [v for v in bm.verts if v not in before]
        self._paint(new, color, bone, mat, False, grad, 0.0)
        return new

    # --- output ---
    def build(self, armature=None, shade_smooth=False, origin=None, parent=None, local=False):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if origin is not None and not local:
            bmesh.ops.translate(bm, vec=(-origin[0], -origin[1], -origin[2]), verts=bm.verts[:])
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for slot in self.mats:
            me.materials.append(get_material(slot))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if origin is not None:
            ob.location = origin
        if parent is not None:
            ob.parent = parent
        if me.color_attributes:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.color_attributes.render_color_index = 0
        if armature is not None:
            for b, i in self.groups.items():
                ob.vertex_groups.new(name=b)
            mod = ob.modifiers.new('Armature', 'ARMATURE')
            mod.object = armature
            ob.parent = armature
        return ob


def get_material(name):
    if name in _MATS and _MATS[name].name in bpy.data.materials:
        return _MATS[name]
    if name == 'base':
        m = material('base', vertex_colors=True)
    elif name == 'banner':
        m = material('banner', color=rgb('#3d7be0'), double=True)
    elif name.startswith('glow_'):
        table = {
            'glow_cyan': '#7ad7ff', 'glow_violet': '#b58cff', 'glow_orange': '#ff9a2e', 'glow_yellow': '#ffd24a',
            'glow_red': '#ff5a4a', 'glow_white': '#fff6d8', 'glow_green': '#7dff9a',
        }
        m = material(name, glow=rgb(table[name]), strength=2.0)
    elif name.startswith('cloth'):
        m = material(name, vertex_colors=True, double=True)
    else:
        m = material(name, vertex_colors=True)
    _MATS[name] = m
    return m


def new_empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    return ob


def attach(ob, parent, loc=None):
    """Parent keeping the object where it is."""
    mw = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    ob.matrix_world = mw
    if loc is not None:
        ob.location = loc


# ---------- armature and animation ----------

class Rig:
    """Rigid-skinned skeleton. Every bone is a pivot at `head`; bones point along +y so their local
    axes equal the armature axes, which makes pose angles easy to reason about (rx pitches forward)."""

    def __init__(self, name, bones):
        """bones: list of (name, head(x,y,z), parent or None) in parent-before-child order."""
        self.name = name
        ad = bpy.data.armatures.new(name)
        self.ob = bpy.data.objects.new(name, ad)
        bpy.context.scene.collection.objects.link(self.ob)
        bpy.context.view_layer.objects.active = self.ob
        bpy.ops.object.mode_set(mode='EDIT')
        eb = {}
        for bname, head, parent in bones:
            b = ad.edit_bones.new(bname)
            b.head = Vector(head)
            b.tail = Vector(head) + Vector((0, 0.08, 0))
            if parent:
                b.parent = eb[parent]
            eb[bname] = b
        bpy.ops.object.mode_set(mode='OBJECT')
        self.names = [b[0] for b in bones]
        self.ob.animation_data_create()
        self.clips = {}

    def clip(self, name, frames, loop=True):
        """Start a new action. Returns a Clip to key poses into."""
        act = bpy.data.actions.new(name)
        self.ob.animation_data.action = act
        return Clip(self, name, act, frames, loop)

    def finish(self):
        """Move every action into its own NLA track (named after it) so the glTF exporter makes one clip each."""
        ad = self.ob.animation_data
        ad.action = None
        for name, clip in self.clips.items():
            tr = ad.nla_tracks.new()
            tr.name = name
            tr.strips.new(name, 1, clip.act)
        # rest pose
        bpy.context.view_layer.objects.active = self.ob
        for pb in self.ob.pose.bones:
            pb.rotation_mode = 'XYZ'


class Clip:
    def __init__(self, rig, name, act, frames, loop):
        self.rig, self.name, self.act, self.frames, self.loop = rig, name, act, frames, loop
        rig.clips[name] = self
        self.ob = rig.ob
        bpy.context.view_layer.objects.active = self.ob
        bpy.ops.object.mode_set(mode='POSE')
        for pb in self.ob.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)

    def key(self, frame, pose):
        """pose: {bone: dict(r=(rx,ry,rz) radians, t=(x,y,z) offset, s=scale)} (missing bones stay at rest)."""
        ob = self.ob
        for pb in ob.pose.bones:
            p = pose.get(pb.name, {})
            pb.rotation_euler = p.get('r', (0, 0, 0))
            pb.location = p.get('t', (0, 0, 0))
            s = p.get('s', 1.0)
            pb.scale = (s, s, s) if not isinstance(s, tuple) else s
            pb.keyframe_insert('rotation_euler', frame=frame)
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('scale', frame=frame)

    def done(self):
        bpy.ops.object.mode_set(mode='OBJECT')
        # linear-ish smooth curves: leave Bezier (default) for soft motion


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def obj_anim(ob, track, frames, fn):
    """Loop an object's transform. fn(t) -> dict(r=(rx,ry,rz), t=(x,y,z), s=scale) for t in [0, 1].
    Objects sharing a track name are exported as one glTF clip with that name."""
    ob.rotation_mode = 'XYZ'
    base_loc = tuple(ob.location)
    base_rot = tuple(ob.rotation_euler)
    base_scale = tuple(ob.scale)
    if not ob.animation_data:
        ob.animation_data_create()
    act = bpy.data.actions.new(f'{ob.name}_{track}')
    ob.animation_data.action = act
    for f in range(frames + 1):
        p = fn(f / frames)
        r = p.get('r', (0, 0, 0))
        t = p.get('t', (0, 0, 0))
        s = p.get('s', 1.0)
        ob.rotation_euler = tuple(base_rot[i] + r[i] for i in range(3))
        ob.location = tuple(base_loc[i] + t[i] for i in range(3))
        ob.scale = tuple(base_scale[i] * (s if not isinstance(s, tuple) else s[i]) for i in range(3))
        ob.keyframe_insert('rotation_euler', frame=1 + f)
        ob.keyframe_insert('location', frame=1 + f)
        ob.keyframe_insert('scale', frame=1 + f)
    ob.rotation_euler, ob.location, ob.scale = base_rot, base_loc, base_scale
    ob.animation_data.action = None
    tr = ob.animation_data.nla_tracks.new()
    tr.name = track
    tr.strips.new(act.name, 1, act)


# ---------- export ----------

def export_glb(path, objects, animations=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kw = dict(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_cameras=False, export_lights=False, export_extras=True, export_vertex_color='ACTIVE',
        export_animations=animations, export_image_format='NONE', export_texcoords=False,
    )
    if animations:
        kw.update(export_animation_mode='NLA_TRACKS', export_nla_strips=True, export_optimize_animation_size=True,
                  export_frame_range=False)
    bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


# ---------- preview renders (Cycles, CPU) ----------

def _bounds(objects):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for ob in objects:
        if ob.type != 'MESH':
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def render_preview(path, objects=None, size=512, yaw=45.0, pitch=38.0, samples=24, ground=False, margin=1.12, ortho=True,
                   transparent=True, frame=None, catcher=False):
    """Render the scene (or `objects`) from the game's camera angle. yaw 45 looks from +x/-y."""
    sc = bpy.context.scene
    objs = objects or [o for o in sc.objects if o.type == 'MESH']
    for o in list(sc.objects):
        if o.type in ('LIGHT', 'CAMERA') and o.name.startswith('_pv'):
            bpy.data.objects.remove(o)
    mn, mx = _bounds(objs)
    center = (mn + mx) / 2
    radius = max((mx - mn).length / 2, 0.5)
    if frame:
        center = Vector(frame[0])
        radius = frame[1]
    cam_d = bpy.data.cameras.new('_pvcam')
    cam = bpy.data.objects.new('_pvcam', cam_d)
    sc.collection.objects.link(cam)
    yawr, pitchr = math.radians(yaw), math.radians(pitch)
    dist = radius * 4
    off = Vector((math.sin(yawr) * math.cos(pitchr), -math.cos(yawr) * math.cos(pitchr), math.sin(pitchr))) * dist
    cam.location = center + off
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam_d.type = 'ORTHO'
        cam_d.ortho_scale = radius * 2 * margin
    sc.camera = cam
    sun_d = bpy.data.lights.new('_pvsun', 'SUN')
    sun_d.energy = 3.2
    sun_d.angle = math.radians(18)
    sun = bpy.data.objects.new('_pvsun', sun_d)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(-35))
    world = bpy.data.worlds.new('_pvworld') if not sc.world else sc.world
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.62, 0.78, 0.95, 1)
    bg.inputs['Strength'].default_value = 0.9
    plane = None
    if catcher:
        bpy.ops.mesh.primitive_plane_add(size=radius * 14, location=(center.x, center.y, 0))
        plane = bpy.context.object
        plane.name = '_pvground'
        plane.is_shadow_catcher = True
    elif ground:
        bpy.ops.mesh.primitive_plane_add(size=radius * 12, location=(center.x, center.y, 0))
        plane = bpy.context.object
        plane.name = '_pvground'
        plane.data.materials.append(material('_pvg', color=rgb('#8fd46d')))
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = transparent
    sc.render.filepath = path
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True)
    if plane:
        bpy.data.objects.remove(plane)
