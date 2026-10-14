"""Builds one fleet class's model (requirements §15, architecture §23).

    blender --background --factory-startup --python build.py -- <class> <spec.json> <out.glb> [preview.png]

The spec JSON carries the class footprint ({"length": m, "width": m}) from src/config/fleet.ts (M10-2).
The scene gets two root objects, LOD0 and LOD1 (M10-1). Every budget and frame check runs before export,
and any failure exits non-zero. The optional preview renders both LODs from the app's isometric angle.
"""

import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402


def check(obj, spec, lod):
    problems = []
    tris = common.triangles(obj)
    if tris > common.TRIANGLE_BUDGET[lod]:
        problems.append(f'LOD{lod}: {tris} triangles > {common.TRIANGLE_BUDGET[lod]} (BM-8)')
    lo, hi = common.bounds(obj)
    if abs(lo[2]) > 0.02:
        problems.append(f'LOD{lod}: lowest point z = {lo[2]:.3f}, not on the ground (BM-4)')
    if abs(lo[0] + hi[0]) / 2 > 0.05 or abs(lo[1] + hi[1]) / 2 > 0.05:
        problems.append(f'LOD{lod}: not centred on the footprint (BM-4)')
    if hi[0] - lo[0] > spec['length'] + 0.01:
        problems.append(f'LOD{lod}: length {hi[0] - lo[0]:.3f} > {spec["length"]} (BM-5)')
    if hi[1] - lo[1] > spec['width'] + 0.01:
        problems.append(f'LOD{lod}: width {hi[1] - lo[1]:.3f} > {spec["width"]} (BM-5)')
    return problems


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='ACTIVE',
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_apply=False,
        use_selection=False,
    )


PREVIEW = {'paint': '#4A7FC1', 'glass': '#33405A', 'livery': '#F2B33D'}


def render_preview(objs, path):
    """Both LODs, front three-quarter and rear three-quarter, with sample paint, glass and livery."""
    swap = {common.hex_srgb(common.COLOURS[k]): common.hex_srgb(v) for k, v in PREVIEW.items()}
    scene = bpy.context.scene
    copies = []
    for row, src in enumerate(objs):
        for col, rot in enumerate((0.0, math.pi)):
            ob = src.copy()
            ob.data = src.data.copy()
            colours = ob.data.color_attributes['Color']
            for d in colours.data:
                key = tuple(round(c, 3) for c in d.color_srgb)
                for k, v in swap.items():
                    if tuple(round(c, 3) for c in k) == key:
                        d.color_srgb = v
            ob.location = Vector((col * 7.0, -row * 4.0, 0))
            ob.rotation_euler = (0, 0, rot)
            scene.collection.objects.link(ob)
            copies.append(ob)
    for src in objs:
        src.hide_render = True
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 13.5
    cam = bpy.data.objects.new('cam', cam_data)
    target = Vector((3.5, -2.0, 0.6))
    direction = Vector((1.0, -1.15, 0.95)).normalized()
    cam.location = target + direction * 30
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    cls, spec_path, out = argv[:3]
    preview = argv[3] if len(argv) > 3 else None
    with open(spec_path, encoding='utf-8') as f:
        spec = json.load(f)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    module = importlib.import_module(cls)
    objs, problems = [], []
    for lod in (0, 1):
        obj = module.build(spec, lod)
        objs.append(obj)
        problems += check(obj, spec, lod)
    for p in problems:
        print(f'MODEL ERROR {cls}: {p}')
    if problems:
        sys.exit(1)
    export(out)
    print(f'MODEL OK {cls}: LOD0 {common.triangles(objs[0])} triangles, LOD1 {common.triangles(objs[1])} triangles')
    if preview:
        render_preview(objs, preview)


try:
    main()
except SystemExit:
    raise
except Exception as exc:  # any Blender or script error must fail the run, not hang or pass
    import traceback
    traceback.print_exc()
    print(f'MODEL ERROR: {exc}')
    sys.exit(1)
