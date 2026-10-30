"""Build the V54 planar forebody trial, retaining all earlier source files."""
import bpy
import importlib.util
import os
from pathlib import Path


def Main():
    assert not bpy.data.filepath,'Forebody trials require a fresh Blender scene'
    repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
    os.environ['TYPE94_BODY_LAYOUT']='Data_BodyTrialV54.json'
    file=repo/'Taierzhuang1938/_blender/Script_Type94EnvelopeTrial.py'
    spec=importlib.util.spec_from_file_location('ForebodyEnvelope',file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.Main()


if __name__=='__main__':Main()
