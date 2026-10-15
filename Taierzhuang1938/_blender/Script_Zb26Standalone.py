"""Rebuild ZB-26 in a fresh, independently owned headless Blender process.

blender --background --factory-startup --python Script_Zb26Standalone.py -- \
    --source-dir /absolute/path/to/a/new/owned/source-directory

This uses Blender directly. It neither starts Codex nor contacts the desktop's
BlenderMCP. The source directory receives the packed blend and original maps;
the repository receives the TZM and its model-index entry as usual.
"""
from pathlib import Path
import argparse
import os
import runpy
import sys
import bpy


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if not bpy.app.background or bpy.data.filepath:
        raise RuntimeError("Use a fresh --background --factory-startup process; existing scenes are protected")
    source = args.source_dir.expanduser().resolve()
    if (source/"Scene_Zb26Veteran20261015.blend").exists():
        raise RuntimeError("Choose a new source directory rather than overwriting an earlier iteration")
    os.environ["ZB26_SOURCE_DIR"] = str(source)
    bpy.context.scene["BlenderMcpTask"] = "Zb26Veteran20261015"
    runpy.run_path(str(Path(__file__).with_name("Script_Zb26Rebuild.py")), run_name="__main__")


if __name__ == "__main__":
    Main()
