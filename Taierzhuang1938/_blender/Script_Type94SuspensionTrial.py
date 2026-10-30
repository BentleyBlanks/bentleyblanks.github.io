"""Cold-build the isolated visible suspension-arm candidate."""
import bpy,importlib.util,os
from pathlib import Path
assert not bpy.data.filepath
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
os.environ['TYPE94_BODY_LAYOUT']='Data_BodyTrialV61.json'
file=repo/'Taierzhuang1938/_blender/Script_Type94EnvelopeTrial.py'
spec=importlib.util.spec_from_file_location('SuspensionEnvelope',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.Main()
