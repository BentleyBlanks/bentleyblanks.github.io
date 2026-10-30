"""Inspect exact high/low component provenance before deriving a new game mesh."""
import ast,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path.cwd();base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV70')))
(root/'Acceptance').mkdir(parents=True,exist_ok=True)
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('DeltaExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_Type94GameTrial.py').read_text());scope=dict(bpy=bpy,np=np,math=math,Vector=Vector,BVHTree=BVHTree)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['Count','LooseParts']],type_ignores=[]),'<component helpers>','exec'),scope)
Count=scope['Count'];LooseParts=scope['LooseParts']
def Signature(mesh,ids=None):
    faces=list(mesh.polygons)if ids is None else[mesh.polygons[i]for i in ids]
    sites=np.array([tuple(v.co)for v in mesh.vertices],dtype='<f4');used=sorted({i for p in faces for i in p.vertices});points,inverse=np.unique(sites[used],axis=0,return_inverse=True);lookup=dict(zip(used,inverse));indices=np.array([[lookup[i]for i in p.vertices]for p in faces],dtype='<i8');assert indices.shape[1]==3
    indices=np.array([np.roll(t,-int(np.argmin(t)))for t in indices],dtype='<i8');indices=indices[np.lexsort(indices.T[::-1])]
    return hashlib.sha256(points.tobytes()+indices.tobytes()).hexdigest()
def Snapshot(manifestName):
    m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette'/manifestName).read_text());file=Path(m['sourceBlend']);assert hashlib.sha256(file.read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(file));asset=bpy.data.objects['Type94Tankette'];rows={};groups={}
    for obj in sorted(asset.children_recursive,key=lambda o:o.name):
        if obj.type!='MESH':continue
        key=obj.data.as_pointer()
        if key not in groups:
            mesh=exporter.TriangulatedCopy(obj.data);parts=LooseParts(mesh);groups[key]=dict(signature=Signature(mesh),triangles=Count(mesh),materials=[m.name for m in mesh.materials],parts=[dict(signature=Signature(mesh,ids),triangles=len(ids),minimum=[min(mesh.vertices[i].co[a]for f in ids for i in mesh.polygons[f].vertices)for a in range(3)],maximum=[max(mesh.vertices[i].co[a]for f in ids for i in mesh.polygons[f].vertices)for a in range(3)])for ids in parts]);bpy.data.meshes.remove(mesh)
        rows[obj.name]=groups[key]
    return dict(sha256=m['sha256'],sourceBlendSha256=m['sourceBlendSha256'],meshes=rows)
assert not bpy.data.filepath
old=Snapshot('Data_SurfaceStudyV56.json');current=Snapshot('Data_SurfaceStudyV68.json');low=Snapshot('Data_GameTrialV59.json');assert old['meshes'].keys()==current['meshes'].keys()==low['meshes'].keys()
changed=[dict(name=n,oldTriangles=old['meshes'][n]['triangles'],newTriangles=current['meshes'][n]['triangles'],lowTriangles=low['meshes'][n]['triangles'],oldParts=len(old['meshes'][n]['parts']),newParts=len(current['meshes'][n]['parts']))for n in current['meshes']if old['meshes'][n]['signature']!=current['meshes'][n]['signature']]
for r in changed:
    n=r['name'];oldParts=old['meshes'][n]['parts'];newParts=current['meshes'][n]['parts'];lookup={p['signature']:i for i,p in enumerate(oldParts)};r['retainedParts']=[dict(newIndex=i,oldIndex=lookup[p['signature']],triangles=p['triangles'])for i,p in enumerate(newParts)if p['signature']in lookup];r['changedParts']=[dict(newIndex=i,**p)for i,p in enumerate(newParts)if p['signature']not in lookup]
report=dict(old=old,current=current,low=low,changed=changed,scope='Exact float32 oriented triangulated source surfaces, independent of UV splits. This is a correspondence diagnostic, not a reused certificate.')
(root/'Acceptance/Data_GameDeltaV70.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(changed=changed,unchangedOwners=len(current['meshes'])-len(changed)),indent=2),flush=True)
