"""Bake the captured, fitted 173R arms into a task-owned copy of the Idle source."""
import bpy,os,importlib.util,hashlib
from pathlib import Path
root=Path(os.environ['HANYANG_PROJECT_ROOT'])
folder=Path(os.environ.get('HANYANG_IDLE_SOURCE_DIR',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/HanYang173RIdle_20261025'))
source=folder/'Animation_HanYang173RIdle.blend'
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
bpy.context.scene['BlenderMcpTask']=folder.name
spec=importlib.util.spec_from_file_location('ScopedIdleBake',root/'_blender/Script_FpsIdleLeftSupportBake.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.bake_idle_left_support(str(root),str(folder/'Data_Capture.json'),folder.name)
bpy.context.scene['HanYang173RGameModelSha256']=hashlib.sha256((root/'Model/HanYang173R/Model_HanYang173R.glb').read_bytes()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
