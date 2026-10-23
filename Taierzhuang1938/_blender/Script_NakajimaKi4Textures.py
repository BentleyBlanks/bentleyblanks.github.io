"""Current Ki-4 PBR entrypoint. V1 recipe remains in Git commit3bdd77c9.
SurfaceV2 uses archived generated albedo samples and construction-aware channels.
Run with ordinary Python + NumPy + Pillow, not inside Blender.
"""
import pathlib,runpy

if __name__=='__main__':
    scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4Textures.py')).resolve()
    runpy.run_path(str(scriptPath.with_name('Script_NakajimaKi4SurfaceBake.py')),run_name='__main__')
