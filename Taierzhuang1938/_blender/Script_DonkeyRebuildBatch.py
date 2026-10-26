"""Headless standalone donkey rebuild, owned by Script_BlenderMcp.mjs."""
import argparse,json,os,subprocess,sys
from pathlib import Path
import bpy

project=Path(__file__).resolve().parents[1];scripts=project/'_blender';root=project.parent
parser=argparse.ArgumentParser();parser.add_argument('--resume',type=Path);parser.add_argument('--refresh-leg-pigment',action='store_true');parser.add_argument('--measurements-only',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
def Run(name):
    print(json.dumps({'stage':name,'status':'started'}),flush=True)
    file=scripts/name;exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),{'__name__':'__main__','__file__':str(file),'DonkeyAssetName':'Donkey'})
    print(json.dumps({'stage':name,'status':'completed'}),flush=True)
if args.resume:
    source=args.resume.resolve()
    if not source.is_file():raise RuntimeError('Resume source does not exist')
    bpy.ops.wm.open_mainfile(filepath=str(source))
    if Path(bpy.context.scene.get('DonkeyCartProject','')).resolve()!=project.resolve():raise RuntimeError('Resume source belongs to another project/worktree')
    if not bpy.context.scene.get('DonkeyReferenceFitRevision'):raise RuntimeError('Resume source has not completed the reference fit')
    if bpy.context.scene['DonkeyReferenceFitRevision']!='20261026ReferenceV40':raise RuntimeError('Resume requires the current V40 source; rebuild from the frozen input to migrate an older source')
else:
    bpy.context.scene['DonkeyCartProject']=str(project);Run('Script_DonkeyReferenceBake.py');Run('Script_DonkeyReferenceRefine.py')
base=Path(bpy.context.scene['DonkeySourceRoot']);python=os.environ.get('DONKEY_CART_PYTHON','python')
if args.refresh_leg_pigment:
    scene=bpy.context.scene;skin=bpy.data.objects['DonkeyContinuousSkin'];rig=bpy.data.objects['DonkeyRig']
    scene['DonkeyReferenceBodyTuftLimit']=288
    record=json.loads((base/'Data_Derivation.json').read_text(encoding='utf-8'));fit=record['referenceFit']
    namespace={};file=scripts/'Script_DonkeyChest.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    fit['details']['pectoralEdges']=namespace['ApplyPectoralEdges'](scene,skin)
    namespace={};file=scripts/'Script_DonkeyLimbTopology.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    fit['details']['axillaryTopology']=namespace['FinishAxillaryTopology'](scene,skin)
    namespace={};file=scripts/'Script_DonkeyLegPigment.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    fit['photoDetail']['legPigment']=namespace['InstallLegPigment'](scene,skin,rig,base)
    # The saved export contains the post-bake wisps. Start from the authored
    # slot allocation before rebuilding that layer against the refreshed base.
    previous=bpy.data.objects['DonkeyShortCoatCards'];material=previous.data.materials[0]
    bpy.data.objects.remove(previous,do_unlink=True)
    namespace={};file=scripts/'Script_DonkeyCoat.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    _,fit['groom']=namespace['BuildGroom'](skin,rig,bpy.data.collections['DonkeyEditable'],material)
    record['coat'].update(fit['groom'])
    namespace={};file=scripts/'Script_DonkeyTailGroom.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    fit['details']['tailGroom']=namespace['RebuildTailGroom'](skin,rig,bpy.data.collections['DonkeyEditable'],material)
    (base/'Data_ReferenceFit.json').write_text(json.dumps(fit,indent=2)+'\n',encoding='utf-8')
    (base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
Run('Script_DonkeyCartAnimate.py');Run('Script_DonkeyCartExport.py')
subprocess.run([python,str(scripts/'Script_DonkeyCartPack.py'),'--input',str(base/'Model_DonkeyUnpacked.glb'),'--output',str(project/'Model/Donkey/Model_Donkey.glb')],cwd=root,check=True)
bpy.context.scene['DonkeyVerifyMeasurementsOnly']=args.measurements_only
try:Run('Script_DonkeyCartVerify.py')
finally:bpy.context.scene['DonkeyVerifyMeasurementsOnly']=False
Run('Script_DonkeyMotionVerify.py');Run('Script_DonkeyFinalize.py')
subprocess.run([python,str(scripts/'Script_DonkeyFringeVerify.py'),'--asset',str(project/'Model/Donkey/Model_Donkey.glb'),'--contract',str(project/'Model/Donkey/Data_Donkey.json')],cwd=root,check=True)
if bpy.context.scene.get('DonkeyReferenceBakedCoatRelief'):
    subprocess.run([python,str(scripts/'Script_DonkeyFringeVerify.py'),'--asset',str(project/'Model/Donkey/Model_Donkey.glb'),'--contract',str(project/'Model/Donkey/Data_Donkey.json'),'--kind','dark'],cwd=root,check=True)
print(json.dumps({'rebuilt':str(project/'Model/Donkey/Model_Donkey.glb'),'source':str(base/'Scene_Donkey.blend'),'mode':'headless owned batch'}),flush=True)
