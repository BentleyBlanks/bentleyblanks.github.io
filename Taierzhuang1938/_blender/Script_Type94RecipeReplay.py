"""Fresh geometry-only replay in a separate Blender factory-startup batch.

Run through Script_BlenderMcp.mjs start --batch; canonical sources are untouched.
The matching verifier compares oriented authored polygons and exported surface
samples. This does not replay baked texture images or establish photo fidelity.
"""
import bpy,os,json,importlib.util,shutil,numpy as np
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
asset=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
source=Path(os.environ.get('TYPE94_REPLAY_ROOT',str(asset/'Acceptance/RecipeReplay')))
assert not bpy.data.filepath,'Use a separate factory-startup batch for recipe replay'
assert source.resolve().is_relative_to(asset.resolve()) and source.resolve()!=asset.resolve()
source.mkdir(parents=True,exist_ok=True);(source/'Acceptance').mkdir(exist_ok=True)
shutil.copyfile(asset/'Acceptance/Data_CameraFit.json',source/'Acceptance/Data_CameraFit.json')
os.environ['TYPE94_REPO_ROOT']=str(repo);os.environ['TYPE94_SOURCE_ROOT']=str(source);os.environ['TYPE94_QUALITY']='High';bpy.context.scene['BlenderMcpTask']='Type94Tankette'
script=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py';build={'__name__':'__main__','__file__':str(script)};exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),build)
patch=repo/'Taierzhuang1938/_blender/Script_Type94MechanismCorrect.py';spec=importlib.util.spec_from_file_location('ReplayMechanism',patch);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.CorrectMechanism();bpy.context.view_layer.update()
arrays={};records=[]
for index,obj in enumerate(o for o in bpy.data.objects if o.type=='MESH'):
 mesh=obj.data;mesh.calc_loop_triangles();vertices=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices],dtype=np.float32);triangles=np.array([tuple(t.vertices) for t in mesh.loop_triangles],dtype=np.int32)
 arrays['s'+str(index)]=np.array([p.use_smooth for p in mesh.polygons],dtype=np.bool_);arrays['swa'+str(index)]=np.array([v.value for v in mesh.attributes['WearZone'].data],dtype=np.float32) if 'WearZone' in mesh.attributes else np.zeros(len(mesh.polygons),dtype=np.float32);arrays['v'+str(index)]=vertices;arrays['t'+str(index)]=triangles;arrays['p'+str(index)]=np.array([v for face in mesh.polygons for v in face.vertices],dtype=np.int32);arrays['o'+str(index)]=np.array([0]+list(np.cumsum([len(face.vertices) for face in mesh.polygons])),dtype=np.int32);arrays['u'+str(index)]=np.array([tuple(loop.uv) for loop in mesh.uv_layers.active.data],dtype=np.float32);records.append({'name':obj.name,'index':index,'parent':obj.parent.name if obj.parent else '', 'role':obj.get('SurfaceRole'),'triangles':len(triangles)})
np.savez_compressed(source/'Acceptance/Data_ReplayGeometry.npz',**arrays)
(source/'Acceptance/Data_ReplayGeometry.json').write_text(json.dumps({'asset':'Type94Tankette','recipeRevision':build['REVISION'],'scope':'Fresh geometry recipe and mechanism correction only; PBR replay separate','records':records,'triangles':sum(r['triangles'] for r in records)},indent=2),encoding='utf-8')
bpy.ops.wm.save_mainfile();print('TYPE94_FRESH_GEOMETRY_REPLAY_DONE',sum(r['triangles'] for r in records),len(records))
