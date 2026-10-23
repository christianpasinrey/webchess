"""Build the elves (white) vs orcs (black) chess set and its surroundings.

Run: npm run model   (add RENDER=1 to also write a preview lineup PNG)
Exports blender/build/chess.glb; `npm run model` then compresses it into public/models/.
Units: one board square = 1.0, pieces stand on z=0 facing -Y (+Z in glTF). Each piece exports "<side>_<type>" plus "<side>_<type>_glow" for emissive parts.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import (  # noqa: E402
    ORC_SIDES, S, activate, bevel, boolean, box, cylinder, ico, join, lathe, leaf, reset_scene, shade, spike, torus,
)
import figures  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build", "chess.glb")


def glyph_strokes(rng, cx, cy, horizontal, prefix, depth, z_top):
    """Two or three short strokes forming an abstract carved glyph."""
    strokes = []
    for k in range(rng.choice((2, 3))):
        length = rng.uniform(0.1, 0.22)
        angle = rng.choice((0, 45, 90, 135, 60, 120)) * math.pi / 180
        ox, oy = rng.uniform(-0.07, 0.07), rng.uniform(-0.07, 0.07)
        if horizontal:
            ox, oy = oy, ox
        strokes.append(box(f"{prefix}{k}", (length, 0.032, depth), (cx + ox, cy + oy, z_top - depth / 2), rotation=(0, 0, angle)))
    return strokes


def make_board_frame():
    """Stone frame with carved glyphs; returns frame, elf runes, orc runes (glow fills)."""
    import random
    rng = random.Random(7)
    frame = box("frame", (9.0, 9.0, 0.3), (0, 0, -0.15))
    boolean(frame, box("inner", (8.0, 8.0, 0.4), (0, 0, 0.05)))
    bevel(frame, 0.05, segments=3)
    plinth = box("plinth", (9.5, 9.5, 0.12), (0, 0, -0.36))
    bevel(plinth, 0.04, segments=2)

    cutters, elf_fill, orc_fill = [], [], []
    for side in range(4):
        for i in range(8):
            t = i - 3.5
            cx, cy = [(t, -4.25), (4.25, t), (t, 4.25), (-4.25, t)][side]
            horizontal = side in (0, 2)
            seed = rng.random()
            cutters += glyph_strokes(random.Random(seed), cx, cy, horizontal, "cut", 0.06, 0.02)
            # White (elves) sits at Blender -Y, which becomes +Z in glTF.
            target = elf_fill if cy < 0 or (side in (1, 3) and t < 0) else orc_fill
            target += glyph_strokes(random.Random(seed), cx, cy, horizontal, "fill", 0.02, -0.012)
    boolean(frame, join(cutters, "glyph_cutter"))
    return join([frame, plinth], "frame"), join(elf_fill, "runes_elf"), join(orc_fill, "runes_orc")


def make_dais():
    return lathe("dais", [
        (0, -0.42, S), (7.2, -0.42, S), (7.2, -0.55, S), (7.6, -0.55, S), (7.6, -0.7, S), (8.2, -0.7, S),
        (8.2, -0.9, S), (0, -0.9, S),
    ], segments=128, smooth_profile=False)


def make_lantern():
    """Elven lamp post: slender stem, crescent arm and a hanging crystal."""
    post = lathe("lantern_post", [
        (0, 0, S), (0.22, 0, S), (0.22, 0.04, S), (0.14, 0.08), (0.06, 0.2), (0.04, 0.6), (0.035, 1.4),
        (0.05, 1.5), (0.03, 1.62), (0.012, 1.8), (0, 1.84, S),
    ], segments=48)
    arm = cylinder("arm", 0.22, 0.03, (0, -0.16, 1.55), rotation=(math.pi / 2, 0, 0), vertices=48)
    boolean(arm, cylinder("arm_cut", 0.19, 0.2, (0, -0.16, 1.5), rotation=(math.pi / 2, 0, 0), vertices=48))
    boolean(arm, box("arm_half", (0.6, 0.6, 0.6), (-0.3, -0.16, 1.55)))
    chain = cylinder("chain", 0.006, 0.18, (0.21, -0.16, 1.44), vertices=6)
    cage = [leaf(f"cage{i}", 0.2, 0.025, 1.17, tilt=math.radians(-12), angle=i * math.tau / 4, radius=0.05) for i in range(4)]
    for c in cage:
        c.location.x += 0.21
        c.location.y -= 0.16
    lamp = join([post, arm, chain] + cage, "lantern")
    crystal = ico("crystal", 0.06, (0.21, -0.16, 1.26))
    crystal.scale = (1, 1, 1.8)
    return lamp, crystal


def make_brazier():
    """Orc fire bowl on spiked legs."""
    bowl = lathe("bowl", [(0, 0.55), (0.18, 0.55), (0.34, 0.68), (0.4, 0.82), (0.36, 0.84), (0.3, 0.72), (0, 0.66)],
                 segments=ORC_SIDES, smooth_profile=False)
    legs = []
    for i in range(3):
        a = i * math.tau / 3
        legs.append(spike(f"leg{i}", (0.15 * math.cos(a), 0.15 * math.sin(a), 0.62), (0.38 * math.cos(a), 0.38 * math.sin(a), 0.0), 0.04, vertices=5))
    rim_spikes = [spike(f"rim{i}", (0.38 * math.cos(a), 0.38 * math.sin(a), 0.82), (0.5 * math.cos(a), 0.5 * math.sin(a), 1.0), 0.03, vertices=5)
                  for i, a in enumerate(j * math.tau / 7 for j in range(7))]
    coals = [ico(f"coal{i}", 0.09, (0.12 * math.cos(i * 2.1), 0.12 * math.sin(i * 2.1), 0.74)) for i in range(5)]
    return join([bowl] + legs + rim_spikes, "brazier"), join(coals, "brazier_coals")


def render_preview():
    """Workbench render of the piece lineup, for checking sculpts without the web app."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 2000, 900
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    row = float(os.environ.get("RENDER_ROW", "0"))
    cam.location = (0, 6 + row * 1.5 - 5.2, 2.0)
    cam.rotation_euler = (math.radians(73), 0, 0)
    cam.data.lens = 50
    scene.camera = cam
    # Hide environment pieces from the shot
    for obj in bpy.data.objects:
        if obj.type == "MESH" and abs(obj.location.y - (6 + row * 1.5)) > 0.5 and obj.location.y > 5:
            obj.hide_render = True
    for name in ("frame", "runes_elf", "runes_orc", "dais", "lantern", "lantern_glow", "brazier", "brazier_glow"):
        if name in bpy.data.objects:
            bpy.data.objects[name].hide_render = True
    scene.render.filepath = os.environ.get("RENDER_OUT", "/tmp/chess_preview.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.render.filepath}")


def main():
    reset_scene()
    material = bpy.data.materials.new("piece")

    def finish(obj, angle, layout=(0, 0, 0)):
        # Bake creation transforms into the mesh (the web app only reads geometry),
        # then, only for the preview render, spread the pieces out in rows.
        activate(obj)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if os.environ.get("RENDER"):
            obj.location = layout
        obj.data.validate(clean_customdata=False)
        obj.data.materials.clear()
        obj.data.materials.append(material)
        shade(obj, angle)

    # Lay them out in two rows so the .glb is easy to inspect; the web app re-positions them.
    for row, (side, builders) in enumerate(figures.SETS.items()):
        smooth_angle = 45 if side == "elf" else 30
        for i, build in enumerate(builders):
            body, glow = build()
            body.name = f"{side}_{build.__name__.split('_')[1]}"
            glow.name = f"{body.name}_glow"
            for obj in (body, glow):
                finish(obj, smooth_angle, layout=(i * 1.2 - 3, 6 + row * 1.5, 0))

    for obj in make_board_frame():
        finish(obj, 30)
    finish(make_dais(), 30)
    lamp, crystal = make_lantern()
    crystal.name = "lantern_glow"
    finish(lamp, 40, layout=(-6, -6, 0))
    finish(crystal, 10, layout=(-6, -6, 0))
    brazier, coals = make_brazier()
    coals.name = "brazier_glow"
    finish(brazier, 12, layout=(6, 6, 0))
    finish(coals, 10, layout=(6, 6, 0))

    if os.environ.get("RENDER"):
        render_preview()
        return  # the preview layout must not end up in the exported model

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
        export_texcoords=False,  # finishes are procedural, no UVs needed
    )
    print(f"Exported {OUT}")

main()
