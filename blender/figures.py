"""Sculpted miniature figures for the elves vs orcs set.

Bodies are metaballs (they fuse like clay into one organic surface); armour, weapons,
pedestals and towers are hard-surface meshes joined on top. Every builder returns
(body, glow) and faces -Y. The figure's right hand is on -X.

Roles: pawn = spearman, knight = rider, bishop = archer, rook = tower, queen, king.
"""

import math

import bmesh
import bpy
from mathutils import Vector

from geo import (
    ORC_SIDES, S, activate, bevel, boolean, box, cylinder, ico, join, lathe, leaf, new_object, prism,
    smooth_path, sphere, spike, torus,
)

MB = 1 / 0.57  # metaball influence radius per unit of visible radius (threshold 0.6, stiffness 2)
PEDESTAL_H = 0.07


def V(*xyz):
    return Vector(xyz)


# --- metaball sculpting ----------------------------------------------------------------

class Sculpt:
    count = 0

    def __init__(self, resolution=0.0075):
        Sculpt.count += 1
        self.data = bpy.data.metaballs.new(f"clay{Sculpt.count}")
        self.data.resolution = resolution
        self.data.render_resolution = resolution
        # Metaball objects fuse by name family (text before the first dot): keep names unique.
        self.obj = bpy.data.objects.new(f"clay{Sculpt.count}obj", self.data)
        bpy.context.scene.collection.objects.link(self.obj)

    def ball(self, p, r):
        e = self.data.elements.new(type="BALL")
        e.co = p
        e.radius = r * MB

    def capsule(self, a, b, r, r_end=None):
        """Capsule between a and b; with r_end it tapers using a short chain."""
        a, b = Vector(a), Vector(b)
        if r_end is not None:
            # Overlapping short segments read as one smooth taper (few long ones look beaded).
            steps = max(3, int((b - a).length / (min(r, r_end) * 0.6)))
            for i in range(steps):
                t0, t1 = i / steps, (i + 1) / steps
                self.capsule(a.lerp(b, t0), a.lerp(b, t1), r + (r_end - r) * (t0 + t1) / 2)
            return
        d = b - a
        if d.length < 1e-6:
            self.ball(a, r)
            return
        e = self.data.elements.new(type="CAPSULE")
        e.co = (a + b) / 2
        e.radius = r * MB
        e.size_x = d.length / 2
        e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())

    def ellipsoid(self, p, sx, sy, sz):
        e = self.data.elements.new(type="ELLIPSOID")
        e.co = p
        e.radius = MB
        e.size_x, e.size_y, e.size_z = sx, sy, sz

    def to_mesh(self, name):
        activate(self.obj)
        bpy.context.view_layer.update()
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.active_object
        obj.name = name
        return obj


# --- figures ---------------------------------------------------------------------------

def human(sc, H, origin=(0, 0, 0), w=1.0, hunch=0.0, arms=None, seated=False, head=1.0, legs=True):
    """Sculpt a humanoid and return its joints (world positions).

    arms: {"r": (elbow, hand), "l": (elbow, hand)} in units of H relative to origin.
    """
    o = Vector(origin)

    def P(x, y, z):
        return o + Vector((x * H, y * H, z * H))

    j = {
        "pelvis": P(0, 0.02 * hunch, 0.5),
        "chest": P(0, -0.05 * hunch, 0.685 - 0.02 * hunch),
        "neck": P(0, -0.1 * hunch, 0.8 - 0.05 * hunch),
        "head": P(0, -0.15 * hunch, 0.875 - 0.07 * hunch),
    }
    default_arms = {
        "r": ((-0.19 * w, 0.01, 0.6), (-0.2 * w, -0.02, 0.45)),
        "l": ((0.19 * w, 0.01, 0.6), (0.2 * w, -0.02, 0.45)),
    }
    arms = {**default_arms, **(arms or {})}
    for side, s in (("r", -1), ("l", 1)):
        j[f"shoulder_{side}"] = P(s * 0.155 * w, -0.06 * hunch, 0.77 - 0.04 * hunch)
        j[f"hip_{side}"] = P(s * 0.07 * w, 0.02 * hunch, 0.5)
        if seated:
            j[f"knee_{side}"] = P(s * 0.17 * w, -0.17, 0.42)
            j[f"ankle_{side}"] = P(s * 0.18 * w, -0.08, 0.17)
            j[f"toe_{side}"] = P(s * 0.18 * w, -0.15, 0.14)
        else:
            bow = 0.03 * hunch
            j[f"knee_{side}"] = P(s * (0.075 * w + bow), -0.02 * hunch, 0.27)
            j[f"ankle_{side}"] = P(s * 0.075 * w, 0.01, 0.05)
            j[f"toe_{side}"] = P(s * 0.08 * w, -0.07, 0.025)
        elbow, hand = arms[side]
        j[f"elbow_{side}"] = P(*elbow)
        j[f"hand_{side}"] = P(*hand)

    # Torso
    sc.ellipsoid(j["pelvis"], 0.105 * w * H, 0.075 * H, 0.075 * H)
    sc.capsule(j["pelvis"], j["chest"], 0.085 * w * H)
    sc.ellipsoid(j["chest"] + V(0, 0, 0.02 * H), 0.135 * w * H, 0.085 * H, 0.105 * H)
    sc.capsule(j["chest"], j["neck"], 0.045 * H)
    sc.ball(j["head"], 0.068 * H * head)
    # Arms
    for side in ("r", "l"):
        sc.ball(j[f"shoulder_{side}"], 0.052 * w * H)
        sc.capsule(j[f"shoulder_{side}"], j[f"elbow_{side}"], 0.036 * w * H)
        sc.capsule(j[f"elbow_{side}"], j[f"hand_{side}"], 0.032 * w * H, 0.027 * w * H)
        sc.ball(j[f"hand_{side}"], 0.03 * w * H)
        if legs:
            sc.capsule(j[f"hip_{side}"], j[f"knee_{side}"], 0.05 * w * H, 0.04 * w * H)
            sc.capsule(j[f"knee_{side}"], j[f"ankle_{side}"], 0.04 * w * H, 0.032 * w * H)
            sc.capsule(j[f"ankle_{side}"], j[f"toe_{side}"], 0.03 * H)
    return j


def horse(sc, s, origin=(0, 0, 0)):
    """Elven steed facing -Y; returns the saddle point."""
    o = Vector(origin)

    def P(x, y, z):
        return o + Vector((x * s, y * s, z * s))

    sc.ellipsoid(P(0, 0.02, 0.53), 0.1 * s, 0.27 * s, 0.12 * s)
    sc.ball(P(0, -0.2, 0.55), 0.115 * s)
    sc.ball(P(0, 0.22, 0.55), 0.115 * s)
    sc.capsule(P(0, -0.25, 0.62), P(0, -0.37, 0.86), 0.075 * s, 0.055 * s)
    sc.capsule(P(0, -0.39, 0.89), P(0, -0.54, 0.74), 0.055 * s, 0.038 * s)
    for x in (-0.03, 0.03):
        sc.capsule(P(x, -0.37, 0.93), P(x * 1.4, -0.36, 1.0), 0.015 * s)
    for x, y in ((-0.065, -0.2), (0.065, -0.2), (-0.065, 0.24), (0.065, 0.24)):
        knee = P(x, y - (0.02 if y < 0 else -0.04), 0.25)
        sc.capsule(P(x, y, 0.47), knee, 0.045 * s, 0.03 * s)
        sc.capsule(knee, P(x, y, 0.035), 0.026 * s, 0.022 * s)
        sc.ball(P(x, y - 0.01, 0.03), 0.03 * s)
    sc.capsule(P(0, 0.34, 0.62), P(0, 0.44, 0.3), 0.032 * s, 0.018 * s)  # tail
    sc.capsule(P(0, -0.3, 0.8), P(0, -0.2, 0.66), 0.03 * s)  # mane
    return P(0, 0.0, 0.68)


def warg(sc, s, origin=(0, 0, 0)):
    """Orc war-wolf facing -Y; returns (saddle point, eye positions)."""
    o = Vector(origin)

    def P(x, y, z):
        return o + Vector((x * s, y * s, z * s))

    sc.ellipsoid(P(0, 0.04, 0.44), 0.13 * s, 0.28 * s, 0.13 * s)
    sc.ball(P(0, -0.2, 0.5), 0.14 * s)  # heavy shoulders
    sc.ball(P(0, 0.24, 0.44), 0.11 * s)
    sc.capsule(P(0, -0.26, 0.52), P(0, -0.38, 0.6), 0.09 * s)
    sc.capsule(P(0, -0.4, 0.62), P(0, -0.62, 0.55), 0.075 * s, 0.04 * s)  # snout
    sc.capsule(P(0, -0.42, 0.53), P(0, -0.6, 0.47), 0.04 * s, 0.028 * s)  # lower jaw
    for x, y in ((-0.08, -0.2), (0.08, -0.2), (-0.08, 0.24), (0.08, 0.24)):
        knee = P(x * 1.1, y - 0.03, 0.22)
        sc.capsule(P(x, y, 0.42), knee, 0.05 * s, 0.035 * s)
        sc.capsule(knee, P(x, y - 0.04, 0.04), 0.032 * s, 0.026 * s)
        sc.ball(P(x, y - 0.06, 0.035), 0.035 * s)
    sc.capsule(P(0, 0.34, 0.5), P(0, 0.5, 0.42), 0.04 * s, 0.02 * s)
    eyes = [P(x, -0.5, 0.65) for x in (-0.05, 0.05)]
    ears = [spike(f"ear{x}", P(x, -0.36, 0.66), P(x * 1.3, -0.3, 0.8), 0.03 * s, vertices=5) for x in (-0.05, 0.05)]
    teeth = [spike(f"fang{i}", P(x, -0.58, 0.5), P(x, -0.585, 0.44), 0.012 * s, vertices=4)
             for i, x in enumerate((-0.035, 0.035))]
    return P(0, -0.02, 0.6), eyes, ears + teeth


# --- props -----------------------------------------------------------------------------

def rod(name, a, b, r, vertices=10):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=r, depth=d.length, location=(a + b) / 2,
        rotation=d.to_track_quat("Z", "Y").to_euler(),
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def arc(name, points, r):
    parts = [rod(f"{name}{i}", a, b, r, vertices=8) for i, (a, b) in enumerate(zip(points, points[1:]))]
    parts += [sphere(f"{name}j{i}", r, p, segments=8) for i, p in enumerate(points[1:-1])]
    return join(parts, name)


def blade_leaf(name, base, length, width, direction=(0, 0, 1)):
    """Leaf-shaped blade (elven spear tip, sword) pointing along direction."""
    obj = lathe(name, [(0, 0, S), (width * 0.8, length * 0.25), (width, length * 0.45), (width * 0.5, length * 0.8), (0, length, S)], segments=16)
    obj.scale = (1, 0.25, 1)
    activate(obj)
    bpy.ops.object.transform_apply(scale=True)
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_euler()
    obj.location = base
    bpy.ops.object.transform_apply(location=True, rotation=True)
    return obj


def spear(name, bottom, top, r, elven=True):
    bottom, top = Vector(bottom), Vector(top)
    d = (top - bottom).normalized()
    shaft = rod(f"{name}_shaft", bottom, top, r)
    if elven:
        tip = blade_leaf(f"{name}_tip", top, 0.14, 0.032, d)
    else:
        tip = spike(f"{name}_tip", top, top + d * 0.12, r * 3.2, vertices=4)
        barb = spike(f"{name}_barb", top + d * 0.02, top + d * 0.02 + Vector((0.05, 0, -0.03)), r * 1.6, vertices=4)
        tip = join([tip, barb], f"{name}_head")
    return join([shaft, tip], name)


def shield_elf(name, center, height):
    obj = lathe(name, [(0, 0, S), (height * 0.22, height * 0.15), (height * 0.27, height * 0.45), (height * 0.24, height * 0.75), (0, height, S)], segments=24)
    obj.scale = (1, 0.12, 1)
    obj.location = Vector(center) - Vector((0, 0, height / 2))
    activate(obj)
    bpy.ops.object.transform_apply(location=True, scale=True)
    boss = sphere(f"{name}_boss", height * 0.06, Vector(center) + Vector((0, -height * 0.035, height * 0.05)), segments=16)
    return join([obj, boss], name)


def shield_orc(name, center, radius):
    disc = cylinder(name, radius, radius * 0.18, center, rotation=(math.pi / 2, 0, 0), vertices=ORC_SIDES)
    c = Vector(center)
    boss = spike(f"{name}_spike", c, c + Vector((0, -radius * 0.9, 0)), radius * 0.28, vertices=5)
    return join([disc, boss], name)


def bow(name, grip, height, bulge, elven=True):
    """Vertical bow held at grip, bulging towards -Y; returns (bow, top tip, bottom tip)."""
    g = Vector(grip)
    pts = []
    for i in range(9):
        t = -1 + 2 * i / 8
        recurve = 0.15 * bulge * t ** 4 if elven else 0
        pts.append(g + Vector((0, bulge * (t * t) - recurve, t * height / 2)))
    limb = arc(name, pts, 0.008 if elven else 0.011)
    return limb, pts[-1], pts[0]


def helmet_elf(name, head, r):
    hz = Vector(head)
    obj = lathe(name, [(0, -r * 0.1, S), (r * 1.12, -r * 0.1, S), (r * 1.12, r * 0.3), (r * 0.85, r * 0.85), (r * 0.35, r * 1.35), (0, r * 1.9, S)], segments=32)
    obj.location = hz
    activate(obj)
    bpy.ops.object.transform_apply(location=True)
    return obj


def helmet_orc(name, head, r):
    hz = Vector(head)
    cap = lathe(name, [(0, -r * 0.05), (r * 1.18, -r * 0.05), (r * 1.12, r * 0.45), (r * 0.7, r * 0.95), (0, r * 1.1)], segments=ORC_SIDES, smooth_profile=False)
    cap.location = hz
    activate(cap)
    bpy.ops.object.transform_apply(location=True)
    horns = [arc(f"{name}_horn{s}", [hz + Vector((s * r * 0.95, 0, r * 0.4)), hz + Vector((s * r * 1.6, r * 0.1, r * 0.75)), hz + Vector((s * r * 1.75, r * 0.2, r * 1.5))], r * 0.18)
             for s in (-1, 1)]
    nasal = box(f"{name}_nasal", (r * 0.25, r * 0.3, r * 0.9), hz + Vector((0, -r * 1.05, -r * 0.2)))
    return join([cap, nasal] + horns, name)


def cape(name, top_z, bottom_z, r_top, r_bottom, y_shift, thickness=0.012, sides=24, jagged=False):
    """Half-shell draped behind the figure (+Y side)."""
    bm = bmesh.new()
    rows = []
    for k in range(sides + 1):
        a = math.pi * k / sides  # 0..pi sweeps +X -> +Y -> -X (the back)
        col = []
        for z, r in ((top_z, r_top), (bottom_z, r_bottom)):
            rr = r
            zz = z
            if jagged and z == bottom_z:
                zz += 0.025 * (k % 2)
            col.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a) + y_shift, zz)))
        rows.append(col)
    for c0, c1 in zip(rows, rows[1:]):
        bm.faces.new((c0[0], c1[0], c1[1], c0[1]))
    obj = new_object(name, bm)
    activate(obj)
    mod = obj.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = thickness
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def robe(name, waist_z, r_waist, r_hem, segments=48, smooth_profile=True, hem=0.012):
    mid = (r_waist + r_hem) / 2
    return lathe(name, [
        (0, hem, S), (r_hem, hem, S), (r_hem * 0.96, waist_z * 0.25), (mid, waist_z * 0.6), (r_waist, waist_z, S), (0, waist_z, S),
    ], segments=segments, smooth_profile=smooth_profile)


def quiver(name, base, top, r):
    tube = rod(name, base, top, r, vertices=10)
    t = Vector(top)
    fletch = [spike(f"{name}_arrow{i}", t + Vector((dx, dy, 0)), t + Vector((dx, dy, 0.06)), r * 0.35, vertices=3)
              for i, (dx, dy) in enumerate(((-0.01, 0), (0.012, 0.006), (0, -0.01)))]
    return join([tube] + fletch, name)


def crown_elf(name, head, r):
    hz = Vector(head)
    band = torus(f"{name}_band", r * 1.02, r * 0.07, hz.z + r * 0.45, segments=48)
    points = [leaf(f"{name}_pt{i}", r * 0.5, r * 0.12, hz.z + r * 0.45, tilt=math.radians(12), angle=a, radius=r * 1.0)
              for i, a in enumerate(math.radians(d) for d in (-90, -60, -120, -30, -150))]
    return join([band] + points, name)


def crown_spikes(name, center, r, count, length, tilt=20, vertices=5):
    c = Vector(center)
    band = torus(f"{name}_band", r, r * 0.12, c.z, segments=count * 2)
    spikes = []
    for i in range(count):
        a = i * math.tau / count + math.pi / 2
        base = c + Vector((r * math.cos(a), r * math.sin(a), 0))
        out = Vector((math.cos(a), math.sin(a), 0)) * math.sin(math.radians(tilt))
        ln = length * (1.35 if abs(math.sin(a) + 1) < 1e-3 else 1.0)  # tallest spike at the front
        spikes.append(spike(f"{name}_s{i}", base, base + (out + Vector((0, 0, 1))) * ln, r * 0.22, vertices=vertices))
    return join([band] + spikes, name)


def pedestal(name, r, elven):
    if elven:
        return lathe(name, [(0, 0, S), (r, 0, S), (r, 0.025, S), (r - 0.025, 0.05), (r - 0.06, PEDESTAL_H, S), (0, PEDESTAL_H, S)], segments=64)
    return prism(name, ORC_SIDES, r, r - 0.035, 0, PEDESTAL_H)


def pedestal_glow(name, r, elven):
    return torus(name, r - (0.05 if elven else 0.06), 0.011 if elven else 0.013, PEDESTAL_H * (0.75 if elven else 1.0),
                 segments=96 if elven else ORC_SIDES * 3)


def eyes(name, head, r, spread=0.36, size=0.16):
    h = Vector(head)
    return [sphere(f"{name}{s}", r * size, h + Vector((s * r * spread, -r * 0.9, r * 0.12)), segments=10) for s in (-1, 1)]


# --- pieces ----------------------------------------------------------------------------

def elf_pawn():
    """Spearman: tall leaf spear, kite shield, pointed helm, cloak."""
    H, base = 0.66, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=0.85, arms={
        "r": ((-0.21, -0.05, 0.6), (-0.17, -0.14, 0.56)),
        "l": ((0.2, -0.05, 0.6), (0.14, -0.15, 0.55)),
    })
    body = sc.to_mesh("elf_pawn_body")
    hand_r = j["hand_r"]
    parts = [
        body,
        pedestal("elf_pawn_ped", 0.24, True),
        spear("elf_pawn_spear", V(hand_r.x, hand_r.y, PEDESTAL_H + 0.01), V(hand_r.x, hand_r.y, PEDESTAL_H + H * 1.3), 0.009),
        shield_elf("elf_pawn_shield", j["hand_l"] + V(0.02, -0.04, -0.02), H * 0.48),
        helmet_elf("elf_pawn_helm", j["head"], 0.068 * H),
        cape("elf_pawn_cape", j["shoulder_l"].z, PEDESTAL_H + H * 0.1, H * 0.14, H * 0.2, 0.0),
        robe("elf_pawn_tunic", PEDESTAL_H + H * 0.56, H * 0.1, H * 0.15),
    ]
    return join(parts, "elf_pawn"), pedestal_glow("elf_pawn_glow", 0.24, True)


def orc_pawn():
    """Grunt: hunched, crude barbed pike, round spiked shield, horned helm."""
    H, base = 0.6, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=1.3, hunch=0.7, head=1.1, arms={
        "r": ((-0.25, -0.06, 0.55), (-0.2, -0.18, 0.5)),
        "l": ((0.25, -0.08, 0.55), (0.18, -0.2, 0.5)),
    })
    sc.capsule(j["head"] + V(0, -0.02, -0.03), j["head"] + V(0, -0.07, -0.05), 0.04 * H)  # jutting jaw
    body = sc.to_mesh("orc_pawn_body")
    hand_r, head_r = j["hand_r"], 0.068 * H * 1.1
    tusks = [spike(f"tusk{s}", j["head"] + V(s * 0.018, -0.07 * H * 1.1, -0.025), j["head"] + V(s * 0.03, -0.085 * H * 1.1, 0.01), 0.008, vertices=4)
             for s in (-1, 1)]
    parts = [
        body,
        pedestal("orc_pawn_ped", 0.26, False),
        spear("orc_pawn_pike", V(hand_r.x, hand_r.y + 0.04, PEDESTAL_H + 0.01), V(hand_r.x - 0.02, hand_r.y - 0.06, PEDESTAL_H + H * 1.25), 0.012, elven=False),
        shield_orc("orc_pawn_shield", j["hand_l"] + V(0.03, -0.04, 0), H * 0.24),
        helmet_orc("orc_pawn_helm", j["head"], head_r),
        cape("orc_pawn_rags", j["shoulder_l"].z, PEDESTAL_H + H * 0.2, H * 0.17, H * 0.22, 0.03, jagged=True),
    ] + tusks
    glow = join([pedestal_glow("orc_pawn_ring", 0.26, False)] + eyes("orc_pawn_eye", j["head"], head_r), "orc_pawn_glow")
    return join(parts, "orc_pawn"), glow


def elf_bishop():
    """Archer drawing a tall recurve bow, quiver on the back, long hair."""
    H, base = 0.72, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=0.82, arms={
        "l": ((0.14, -0.17, 0.77), (0.06, -0.33, 0.78)),
        "r": ((-0.21, -0.02, 0.77), (-0.05, -0.12, 0.79)),
    })
    sc.ellipsoid(j["head"] + V(0, 0.035 * H, -0.08 * H), 0.05 * H, 0.03 * H, 0.1 * H)  # hair down the back
    body = sc.to_mesh("elf_bishop_body")
    limb, top, bottom = bow("elf_bishop_bow", j["hand_l"], H * 0.8, 0.07)
    string = join([rod("s1", top, j["hand_r"], 0.0025, 4), rod("s2", j["hand_r"], bottom, 0.0025, 4)], "elf_bishop_string")
    arrow = rod("elf_bishop_arrow", j["hand_r"], j["hand_l"] + V(0, -0.06, 0), 0.004, 5)
    parts = [
        body, limb, string, arrow,
        pedestal("elf_bishop_ped", 0.25, True),
        quiver("elf_bishop_quiver", j["chest"] + V(-0.06, 0.08, -0.1), j["chest"] + V(0.06, 0.1, 0.18), 0.025),
        robe("elf_bishop_coat", PEDESTAL_H + H * 0.55, H * 0.1, H * 0.17),
        crown_elf("elf_bishop_circlet", j["head"], 0.068 * H),
    ]
    return join(parts, "elf_bishop"), pedestal_glow("elf_bishop_glow", 0.25, True)


def orc_bishop():
    """Orc archer: crude heavy bow, hood of rags, quiver of jagged arrows."""
    H, base = 0.66, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=1.25, hunch=0.5, head=1.08, arms={
        "l": ((0.17, -0.18, 0.72), (0.08, -0.33, 0.73)),
        "r": ((-0.26, -0.03, 0.72), (-0.07, -0.13, 0.74)),
    })
    body = sc.to_mesh("orc_bishop_body")
    head_r = 0.068 * H * 1.08
    limb, top, bottom = bow("orc_bishop_bow", j["hand_l"], H * 0.75, 0.09, elven=False)
    string = join([rod("s1", top, j["hand_r"], 0.003, 4), rod("s2", j["hand_r"], bottom, 0.003, 4)], "orc_bishop_string")
    arrow = rod("orc_bishop_arrow", j["hand_r"], j["hand_l"] + V(0, -0.06, 0), 0.005, 4)
    hood = lathe("orc_bishop_hood", [(0, -head_r * 0.6), (head_r * 1.3, -head_r * 0.6), (head_r * 1.25, head_r * 0.4), (head_r * 0.6, head_r * 1.2), (0.0, head_r * 1.9)],
                 segments=ORC_SIDES, smooth_profile=False)
    hood.location = j["head"] + V(0, 0.012, 0)
    activate(hood)
    bpy.ops.object.transform_apply(location=True)
    boolean(hood, sphere("face", head_r * 1.05, j["head"] + V(0, -head_r * 0.9, -head_r * 0.05), segments=12))
    parts = [
        body, limb, string, arrow, hood,
        pedestal("orc_bishop_ped", 0.26, False),
        quiver("orc_bishop_quiver", j["chest"] + V(0.07, 0.09, -0.1), j["chest"] + V(-0.05, 0.12, 0.17), 0.03),
        cape("orc_bishop_rags", j["shoulder_l"].z, PEDESTAL_H + H * 0.15, H * 0.17, H * 0.23, 0.03, jagged=True),
    ]
    glow = join([pedestal_glow("orc_bishop_ring", 0.26, False)] + eyes("orc_bishop_eye", j["head"], head_r), "orc_bishop_glow")
    return join(parts, "orc_bishop"), glow


def elf_knight():
    """Rider on a slender steed, lance raised with a leaf blade."""
    s = 0.62
    sc = Sculpt()
    saddle = horse(sc, s, V(0, 0.02, PEDESTAL_H))
    H = 0.5
    j = human(sc, H, saddle - V(0, 0, 0.5 * H), w=0.85, seated=True, arms={
        "r": ((-0.2, -0.08, 0.62), (-0.18, -0.2, 0.62)),
        "l": ((0.18, -0.12, 0.58), (0.08, -0.26, 0.6)),
    })
    body = sc.to_mesh("elf_knight_body")
    hand_r = j["hand_r"]
    lance_dir = V(0, -0.35, 1).normalized()
    parts = [
        body,
        pedestal("elf_knight_ped", 0.28, True),
        spear("elf_knight_lance", hand_r - lance_dir * 0.18, hand_r + lance_dir * 0.62, 0.008),
        helmet_elf("elf_knight_helm", j["head"], 0.068 * H),
        cape("elf_knight_cape", j["shoulder_l"].z, j["pelvis"].z - 0.02, H * 0.15, H * 0.3, 0.02),
        shield_elf("elf_knight_shield", j["shoulder_l"] + V(0.06, 0.0, -0.08), H * 0.42),
    ]
    return join(parts, "elf_knight"), pedestal_glow("elf_knight_glow", 0.28, True)


def orc_knight():
    """Orc rider on a warg, cleaver raised."""
    s = 0.62
    sc = Sculpt()
    saddle, warg_eyes, warg_parts = warg(sc, s, V(0, 0.03, PEDESTAL_H))
    H = 0.48
    j = human(sc, H, saddle - V(0, 0, 0.5 * H), w=1.25, hunch=0.5, seated=True, head=1.1, arms={
        "r": ((-0.26, -0.02, 0.78), (-0.22, -0.06, 0.98)),
        "l": ((0.24, -0.12, 0.6), (0.12, -0.24, 0.55)),
    })
    body = sc.to_mesh("orc_knight_body")
    head_r = 0.068 * H * 1.1
    hand = j["hand_r"]
    cleaver = join([
        rod("handle", hand - V(0, 0, 0.05), hand + V(0, 0, 0.08), 0.008, 6),
        box("blade", (0.016, 0.1, 0.13), hand + V(0, -0.045, 0.14)),
    ], "orc_knight_cleaver")
    parts = [
        body, cleaver,
        pedestal("orc_knight_ped", 0.29, False),
        helmet_orc("orc_knight_helm", j["head"], head_r),
    ] + warg_parts
    glow_parts = [pedestal_glow("orc_knight_ring", 0.29, False)] + eyes("orc_knight_eye", j["head"], head_r)
    glow_parts += [sphere(f"wargeye{i}", 0.014, p, segments=8) for i, p in enumerate(warg_eyes)]
    return join(parts, "orc_knight"), join(glow_parts, "orc_knight_glow")


def elf_rook():
    """White tower: slender, banded, arched door, balcony and a tall conical roof."""
    shell = lathe("elf_rook_tower", [
        (0, 0, S), (0.27, 0, S), (0.27, 0.025, S), (0.245, 0.05), (0.2, PEDESTAL_H + 0.02, S),
        (0.19, 0.12), (0.17, 0.3), (0.16, 0.5), (0.165, 0.62), (0.2, 0.68, S),
        (0.22, 0.69, S), (0.22, 0.72, S), (0.16, 0.73, S),
        (0.15, 0.78), (0.11, 0.86), (0.06, 0.96), (0.02, 1.05), (0, 1.1, S),
    ])
    boolean(shell, lathe("hollow", [(0, 0.1, S), (0.13, 0.1, S), (0.12, 0.64, S), (0, 0.64, S)], segments=48, smooth_profile=False))
    # Arched door at the front and slit windows around
    door = join([box("door", (0.09, 0.3, 0.12), (0, -0.17, PEDESTAL_H + 0.08)), cylinder("arch", 0.045, 0.3, (0, -0.17, PEDESTAL_H + 0.14), rotation=(math.pi / 2, 0, 0), vertices=24)], "door")
    boolean(shell, door)
    for z, n, off in ((0.34, 4, math.pi / 4), (0.52, 6, 0)):
        for i in range(n):
            a = off + i * math.tau / n
            boolean(shell, box("win", (0.03, 0.2, 0.09), (0.16 * math.cos(a), 0.16 * math.sin(a), z), rotation=(0, 0, a + math.pi / 2)))
    merlons = []
    for i in range(12):
        a = i * math.tau / 12
        merlons.append(box(f"m{i}", (0.035, 0.03, 0.045), (0.21 * math.cos(a), 0.21 * math.sin(a), 0.745), rotation=(0, 0, a)))
    bands = [torus(f"band{i}", r, 0.008, z, segments=64) for i, (r, z) in enumerate(((0.178, 0.22), (0.166, 0.44)))]
    finial = blade_leaf("finial", V(0, 0, 1.08), 0.1, 0.02)
    body = join([shell, finial] + merlons + bands, "elf_rook")
    glow = join([pedestal_glow("ring", 0.27, True), lathe("light", [(0, 0.12, S), (0.125, 0.12, S), (0.115, 0.62, S), (0, 0.62, S)], segments=32, smooth_profile=False)], "elf_rook_glow")
    return body, glow


def orc_rook():
    """Orc fortress tower: stacked rough stone courses, palisade stakes, fire inside."""
    import random
    rng = random.Random(3)
    courses = []
    z, r = PEDESTAL_H, 0.25
    i = 0
    while z < 0.72:
        h = 0.09 + rng.uniform(-0.015, 0.015)
        courses.append(prism(f"course{i}", 4, r * 1.41, r * 1.38, z, z + h, phase=math.radians(45 + rng.uniform(-3, 3))))
        z += h
        r -= 0.007
        i += 1
    shell = join(courses, "orc_rook_shell")
    boolean(shell, box("hollow", (0.26, 0.26, 0.8), (0, 0, 0.55)))
    boolean(shell, box("gate", (0.1, 0.4, 0.16), (0, -0.2, PEDESTAL_H + 0.08)))
    for k, a in enumerate((0, math.pi / 2, math.pi, -math.pi / 2)):
        boolean(shell, box(f"slit{k}", (0.025, 0.4, 0.1), (0, 0, 0.45), rotation=(0, 0, a)))
    stakes = []
    for k in range(10):
        a = k * math.tau / 10
        x, y = 0.2 * math.cos(a), 0.2 * math.sin(a)
        h = 0.14 + rng.uniform(0, 0.1)
        stakes.append(spike(f"stake{k}", (x, y, z - 0.03), (x * 1.2, y * 1.2, z + h), 0.022, vertices=5))
    pole = rod("pole", (0.16, 0.16, z - 0.05), (0.16, 0.16, z + 0.32), 0.008, 6)
    banner = box("banner", (0.004, 0.12, 0.13), (0.16, 0.1, z + 0.22), rotation=(0.1, 0, 0))
    body = join([pedestal("orc_rook_ped", 0.31, False), shell, pole, banner] + stakes, "orc_rook")
    glow = join([pedestal_glow("ring", 0.31, False), box("fire", (0.24, 0.24, 0.6), (0, 0, 0.45)), ico("flame", 0.1, (0, 0, z + 0.02))], "orc_rook_glow")
    return body, glow


def elf_queen():
    """Lady of light: flowing gown, long hair, circlet, staff crowned by a star."""
    H, base = 0.88, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=0.75, legs=False, arms={
        "r": ((-0.17, -0.05, 0.62), (-0.15, -0.12, 0.64)),
        "l": ((0.15, -0.04, 0.6), (0.06, -0.1, 0.55)),
    })
    sc.ellipsoid(j["head"] + V(0, 0.03 * H, -0.12 * H), 0.06 * H, 0.035 * H, 0.15 * H)  # hair
    body = sc.to_mesh("elf_queen_body")
    hand = j["hand_r"]
    staff = join([rod("staff", V(hand.x, hand.y, PEDESTAL_H + 0.01), V(hand.x, hand.y, PEDESTAL_H + H * 1.08), 0.007, 8),
                  crown_spikes("cradle", V(hand.x, hand.y, PEDESTAL_H + H * 1.08), 0.022, 5, 0.04, tilt=35, vertices=6)], "elf_queen_staff")
    parts = [
        body, staff,
        pedestal("elf_queen_ped", 0.29, True),
        robe("elf_queen_gown", PEDESTAL_H + H * 0.52, H * 0.085, H * 0.27),
        crown_elf("elf_queen_circlet", j["head"], 0.068 * H),
        cape("elf_queen_mantle", j["shoulder_l"].z, PEDESTAL_H + 0.015, H * 0.13, H * 0.3, 0.015),
    ]
    star = ico("star", 0.032, V(hand.x, hand.y, PEDESTAL_H + H * 1.08 + 0.04))
    return join(parts, "elf_queen"), join([pedestal_glow("ring", 0.29, True), star], "elf_queen_glow")


def orc_queen():
    """Witch-queen: tattered faceted robes, spiked crown, staff with a burning orb."""
    H, base = 0.84, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=1.05, hunch=0.25, legs=False, head=1.05, arms={
        "r": ((-0.22, -0.06, 0.62), (-0.19, -0.14, 0.68)),
        "l": ((0.2, -0.1, 0.62), (0.14, -0.22, 0.66)),
    })
    body = sc.to_mesh("orc_queen_body")
    head_r = 0.068 * H * 1.05
    hand = j["hand_r"]
    top = V(hand.x, hand.y, PEDESTAL_H + H * 1.1)
    claws = [spike(f"claw{k}", top + V(0.03 * math.cos(a), 0.03 * math.sin(a), -0.03), top + V(0.05 * math.cos(a), 0.05 * math.sin(a), 0.06), 0.008, vertices=4)
             for k, a in enumerate(i * math.tau / 4 for i in range(4))]
    parts = [
        body,
        rod("staff", V(hand.x, hand.y, PEDESTAL_H + 0.01), top, 0.01, 6),
        pedestal("orc_queen_ped", 0.3, False),
        robe("orc_queen_robe", PEDESTAL_H + H * 0.55, H * 0.12, H * 0.3, segments=ORC_SIDES * 2, smooth_profile=False),
        crown_spikes("orc_queen_crown", j["head"] + V(0, 0, head_r * 0.55), head_r * 1.0, 7, head_r * 1.3, tilt=25),
        cape("orc_queen_cloak", j["shoulder_l"].z + 0.02, PEDESTAL_H + 0.02, H * 0.16, H * 0.32, 0.02, jagged=True),
    ] + claws
    glow = join([pedestal_glow("ring", 0.3, False), ico("orb", 0.04, top + V(0, 0, 0.015))] + eyes("orc_queen_eye", j["head"], head_r), "orc_queen_glow")
    return join(parts, "orc_queen"), glow


def elf_king():
    """High elven king: long robes and mantle, leaf crown, hands resting on a sword."""
    H, base = 0.98, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=0.82, legs=False, arms={
        "r": ((-0.17, -0.06, 0.58), (-0.035, -0.15, 0.53)),
        "l": ((0.17, -0.06, 0.58), (0.035, -0.15, 0.53)),
    })
    sc.ellipsoid(j["head"] + V(0, 0.03 * H, -0.1 * H), 0.055 * H, 0.032 * H, 0.13 * H)  # hair
    body = sc.to_mesh("elf_king_body")
    grip = (j["hand_r"] + j["hand_l"]) / 2
    sword = join([
        blade_leaf("blade", grip - V(0, 0, 0.04), -0.0001 + (grip.z - PEDESTAL_H - 0.06), 0.022, (0, 0, -1)),
        box("guard", (0.12, 0.018, 0.016), grip - V(0, 0, 0.035)),
        sphere("pommel", 0.016, grip + V(0, 0, 0.045), segments=12),
    ], "elf_king_sword")
    parts = [
        body, sword,
        pedestal("elf_king_ped", 0.3, True),
        robe("elf_king_robe", PEDESTAL_H + H * 0.55, H * 0.1, H * 0.25),
        crown_elf("elf_king_crown", j["head"], 0.068 * H * 1.05),
        cape("elf_king_mantle", j["shoulder_l"].z + 0.01, PEDESTAL_H + 0.015, H * 0.15, H * 0.3, 0.015),
    ]
    gem = ico("gem", 0.016, j["head"] + V(0, -0.068 * H * 1.06, 0.068 * H * 0.55))
    return join(parts, "elf_king"), join([pedestal_glow("ring", 0.3, True), gem], "elf_king_glow")


def orc_king():
    """Dark lord: towering armour, huge spiked pauldrons, crown of blades, heavy mace."""
    H, base = 1.02, V(0, 0, PEDESTAL_H)
    sc = Sculpt()
    j = human(sc, H, base, w=1.2, arms={
        "r": ((-0.25, -0.03, 0.6), (-0.22, -0.12, 0.5)),
        "l": ((0.24, -0.02, 0.6), (0.22, -0.06, 0.45)),
    })
    body = sc.to_mesh("orc_king_body")
    head_r = 0.068 * H
    helm = lathe("helm", [(0, -head_r * 1.1), (head_r * 1.15, -head_r * 1.1), (head_r * 1.2, head_r * 0.3), (head_r * 0.9, head_r * 1.0), (0, head_r * 1.2)],
                 segments=8, smooth_profile=False)
    helm.location = j["head"]
    activate(helm)
    bpy.ops.object.transform_apply(location=True)
    pauldrons = []
    for side in ("r", "l"):
        sh = j[f"shoulder_{side}"]
        s = -1 if side == "r" else 1
        plate = sphere(f"plate{side}", 0.075 * H, sh + V(s * 0.01, 0, 0.02), segments=8)
        plate.scale = (1.1, 1.0, 0.7)
        activate(plate)
        bpy.ops.object.transform_apply(scale=True)
        spikes = [spike(f"ps{side}{k}", sh + V(s * 0.03, dy, 0.03), sh + V(s * 0.1, dy * 1.5, 0.15), 0.014, vertices=4) for k, dy in enumerate((-0.04, 0.0, 0.04))]
        pauldrons += [plate] + spikes
    hand = j["hand_r"]
    mace = join([
        rod("haft", hand + V(0, 0, 0.12), hand - V(0, 0, 0.36), 0.011, 6),
        ico("mace_head", 0.045, hand - V(0, 0, 0.38)),
    ] + [spike(f"flange{k}", hand - V(0, 0, 0.38), hand - V(0, 0, 0.38) + V(0.07 * math.cos(a), 0.07 * math.sin(a), 0), 0.02, vertices=3)
         for k, a in enumerate(i * math.tau / 6 for i in range(6))], "orc_king_mace")
    parts = [
        body, helm, mace,
        pedestal("orc_king_ped", 0.32, False),
        crown_spikes("orc_king_crown", j["head"] + V(0, 0, head_r * 0.95), head_r * 1.05, 7, head_r * 2.0, tilt=12),
        cape("orc_king_cloak", j["shoulder_l"].z + 0.03, PEDESTAL_H + 0.02, H * 0.19, H * 0.32, 0.03, jagged=True),
        robe("orc_king_tasset", PEDESTAL_H + H * 0.5, H * 0.13, H * 0.2, segments=8, smooth_profile=False),
    ] + pauldrons
    visor = box("visor", (head_r * 1.3, 0.012, head_r * 0.18), j["head"] + V(0, -head_r * 1.13, head_r * 0.05))
    return join(parts, "orc_king"), join([pedestal_glow("ring", 0.32, False), visor], "orc_king_glow")


SETS = {
    "elf": [elf_pawn, elf_rook, elf_knight, elf_bishop, elf_queen, elf_king],
    "orc": [orc_pawn, orc_rook, orc_knight, orc_bishop, orc_queen, orc_king],
}
