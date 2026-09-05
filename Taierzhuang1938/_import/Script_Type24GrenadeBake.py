"""Compatibility CLI entry for the authored pre-1938 stick-grenade exterior.

The old Sketchfab bake is superseded. See docs/Data_GrenadeAsset.md.
Run in a dedicated background Blender process; the scene is reset here.
"""
from pathlib import Path
import runpy
import bpy

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    runpy.run_path(str(Path(__file__).resolve().parents[1] / '_blender' / 'Script_GrenadeDetail.py'), run_name='__main__')
