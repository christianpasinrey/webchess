"""Geometry helpers shared by the piece and environment builders."""

import math

import bmesh
import bpy
from mathutils import Vector

S = True  # sharp corner marker in smoothed profiles
ORC_SIDES = 7


def catmull_rom(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
        for a, b, c, d in zip(p0, p1, p2, p3)
    )


def smooth_path(points, sub=6):
    """Catmull-Rom through the points, keeping corners marked sharp (and both ends)."""
    coords = [(p[0], p[1]) for p in points]
    sharp = sorted({0, len(points) - 1} | {i for i, p in enumerate(points) if len(p) > 2 and p[2]})
    out = []
    for a, b in zip(sharp, sharp[1:]):
        run = coords[a:b + 1]
        if len(run) == 2:
            seg = run
        else:
            seg, n = [], len(run)
            for i in range(n - 1):
                p0, p1, p2, p3 = run[max(i - 1, 0)], run[i], run[i + 1], run[min(i + 2, n - 1)]
                seg.extend(catmull_rom(p0, p1, p2, p3, k / sub) for k in range(sub))
            seg.append(run[-1])
        out.extend(seg if not out else seg[1:])
    return out


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(obj):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def new_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def lathe(name, profile, segments=96, smooth_profile=True):
    pts = smooth_path(profile) if smooth_profile else [(p[0], p[1]) for p in profile]
    bm = bmesh.new()
    verts = [bm.verts.new((max(r, 0.0), 0, z)) for r, z in pts]
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(
        bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1),
        angle=math.tau, steps=segments, use_merge=True,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return new_object(name, bm)


def prism(name, sides, r0, r1, z0, z1, twist=0.0, levels=1, phase=0.0):
    """Tapered (optionally twisted) prism with flat caps; r1 may be 0 for a point."""
    bm = bmesh.new()
    rings = []
    for lv in range(levels + 1):
        t = lv / levels
        r, z, a0 = r0 + (r1 - r0) * t, z0 + (z1 - z0) * t, phase + twist * t
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        rings.append([bm.verts.new((r * math.cos(a0 + i * math.tau / sides), r * math.sin(a0 + i * math.tau / sides), z))
                      for i in range(sides)])
    for lower, upper in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if len(upper) == 1:
                bm.faces.new((lower[i], lower[j], upper[0]))
            else:
                bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    return new_object(name, bm)


def extrude_silhouette(name, outline, thickness, smooth_outline):
    """Silhouette in (y, z) extruded symmetrically along X."""
    pts = smooth_path(outline, sub=5) if smooth_outline else [(p[0], p[1]) for p in outline]
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((-thickness / 2, y, z)) for y, z in pts])
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [g for g in extruded["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(thickness, 0, 0))
    return new_object(name, bm)


def box(name, size, location, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return obj


def sphere(name, radius, location, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def ico(name, radius, location):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def cylinder(name, radius, depth, location, rotation=(0, 0, 0), vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def torus(name, major, minor, z, tilt=0.0, segments=96):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=segments, minor_segments=12,
        location=(0, 0, z), rotation=(tilt, 0, 0),
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def spike(name, start, end, radius, vertices=8):
    """Cone from start (base) to end (tip)."""
    start, end = Vector(start), Vector(end)
    direction = end - start
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius, radius2=0.0, depth=direction.length,
        location=(start + end) / 2, rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def horn(name, points, radius):
    """Tapering chain of cone segments along points; the last segment ends in a tip."""
    parts = []
    n = len(points) - 1
    for i in range(n):
        r0 = radius * (1 - i / n)
        r1 = radius * (1 - (i + 1) / n)
        a, b = Vector(points[i]), Vector(points[i + 1])
        d = b - a
        bpy.ops.mesh.primitive_cone_add(
            vertices=ORC_SIDES, radius1=r0, radius2=r1, depth=d.length,
            location=(a + b) / 2, rotation=d.to_track_quat("Z", "Y").to_euler(),
        )
        parts.append(bpy.context.active_object)
    return join(parts, name)


def leaf(name, length, width, base_z, tilt=0.0, angle=0.0, radius=0.0):
    """Pointed leaf blade, broad face towards the front; optionally fanned out around the axis."""
    obj = lathe(name, [(0, 0, S), (width * 0.7, length * 0.2), (width, length * 0.45), (width * 0.6, length * 0.75), (0, length, S)], segments=32)
    obj.scale = (1, 0.3, 1)
    obj.location = (radius * math.cos(angle), radius * math.sin(angle), base_z)
    obj.rotation_euler = (-tilt * math.sin(angle), tilt * math.cos(angle), angle + math.pi / 2)
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def boolean(target, cutter, operation="DIFFERENCE"):
    activate(target)
    mod = target.modifiers.new("bool", "BOOLEAN")
    mod.object = cutter
    mod.operation = operation
    mod.solver = "EXACT"
    # Cutters are often several overlapping primitives joined together.
    mod.use_self = True
    mod.use_hole_tolerant = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def bevel(obj, width, segments=3, angle=30):
    activate(obj)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def join(objs, name):
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def shade(obj, angle):
    activate(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except (AttributeError, RuntimeError):
        bpy.ops.object.shade_smooth()
