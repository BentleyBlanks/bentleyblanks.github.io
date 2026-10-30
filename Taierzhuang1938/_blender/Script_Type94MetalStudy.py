"""Rebuild SurfaceV44 from the locked V37 gray source, or apply its edge wear.

Run with Script_BlenderMcp start --batch. Between Build and Apply, run the
ordinary-Python SurfaceWearBake with TYPE94_SURFACE_REVISION=SurfaceV44.
This retains the explicit V34 UV checkpoint dependency of the surface studies.
"""
import bpy
import hashlib
import json
import os
from pathlib import Path

repo = Path.cwd()
root = Path(os.environ.get('TYPE94_SOURCE_ROOT',
    r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
phase = os.environ.get('TYPE94_METAL_PHASE', 'Build')
assert phase in ['Build', 'Apply']
os.environ.update(TYPE94_REPO_ROOT=str(repo), TYPE94_SOURCE_ROOT=str(root),
                  TYPE94_GRAY_MANIFEST='Data_GrayStudyV37.json',
                  TYPE94_SURFACE_REVISION='SurfaceV44')
if phase == 'Build':
    gray = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayStudyV37.json').read_text())
    source = Path(gray['sourceBlend'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == gray['sourceBlendSha256']
    scripts = ['Script_Type94SurfaceStudy.py', 'Script_Type94SurfaceWearExtract.py']
else:
    source = root/'Scene_Type94TanketteHighSurfaceV44.blend'
    scripts = ['Script_Type94SurfaceWearApply.py']
bpy.ops.wm.open_mainfile(filepath=str(source))
assert bpy.context.scene.get('BlenderMcpTask') == 'Type94Tankette'
bpy.context.scene.render.threads_mode = 'FIXED'
bpy.context.scene.render.threads = 6
for name in scripts:
    script = repo/'Taierzhuang1938/_blender'/name
    exec(compile(script.read_text(encoding='utf-8'), str(script), 'exec'),
         {'__name__': '__main__', '__file__': str(script)})
print('TYPE94_METAL_STUDY', phase, 'COMPLETE', flush=True)
