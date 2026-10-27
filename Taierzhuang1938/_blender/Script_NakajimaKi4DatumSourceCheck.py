"""Reopen check for the independent V40 author; never save this audit scene."""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math
from mathutils import Vector
repo=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4DatumSourceCheck.py')).resolve().parents[2]
asset=pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repo/'tmp/NakajimaKi4/ReferenceV40')));record=json.loads((asset/'Evidence/Data_DatumCandidateAuthor.json').read_text(encoding='utf8'));source=pathlib.Path(bpy.data.filepath);assert source.resolve()==pathlib.Path(record['sourcePath']).resolve();assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sourceSha256'];root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV40GrayDatum';assert not root.get('referenceFidelityPassed') and not bpy.context.scene.get('Ki4DatumMutationInProgress')
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
meshes=[o for o in root.children_recursive if o.type=='MESH'];assert len(meshes)==928;actual={o.name:MeshFingerprint(o)for o in meshes};expected={**record['unchangedSourceMeshes'],**record['changedSourceMeshes']};baseline=json.loads((repo/'tmp/NakajimaKi4/ReferenceV38/Evidence/Data_TailDatumSource.json').read_text(encoding='utf8'))['unchangedSourceMeshes'];missing=sorted(set(actual)-set(expected));assert all(name in baseline for name in missing);expected.update({name:baseline[name]for name in missing});assert len(expected)==928;differences=[name for name,value in expected.items()if actual[name]!=value];assert not differences,differences
images={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file};assert images==record['original40PackedImagesUnchanged'];assert len(images)==40
low=Vector((math.inf,math.inf,math.inf));high=-low;raw=0;evaluated=0;dg=bpy.context.evaluated_depsgraph_get()
for obj in meshes:
 obj.data.calc_loop_triangles();raw+=len(obj.data.loop_triangles);eo=obj.evaluated_get(dg);em=eo.to_mesh();em.calc_loop_triangles();evaluated+=len(em.loop_triangles)
 for v in em.vertices:
  p=obj.matrix_world@v.co
  for i in range(3):low[i]=min(low[i],p[i]);high[i]=max(high[i],p[i])
 eo.to_mesh_clear()
dims=high-low;assert raw==348908 and evaluated==351020;assert abs(dims.x-12)<.002 and abs(dims.y-8.25)<.05 and abs(dims.z-3.31)<.04
frames=[bpy.data.objects[n]for n in ['Frame_SharedWingDatumV40','Frame_SharedEngineDatumV40']];assert abs(frames[0].rotation_euler.x-frames[1].rotation_euler.x)<1e-10
cabane=[]
for row in record['cabaneConnections']:
 obj=bpy.data.objects[row['name']];z=[v.co.z for v in obj.data.vertices];caps=[]
 for value in [min(z),max(z)]:
  points=[obj.matrix_world@v.co for v in obj.data.vertices if abs(v.co.z-value)<1e-6];caps.append(sum(points,Vector())/len(points))
 caps=sorted(caps,key=lambda p:p.z);error=max((caps[0]-Vector(row['lowerBodyBlenderM'])).length,(caps[1]-Vector(row['upperWingBlenderM'])).length);assert error<2e-6;cabane.append({'name':obj.name,'capErrorM':error})
controls=sorted(o.name for o in root.children_recursive if o.name.startswith('Pivot_'));assert len(controls)==10,controls
result={'state':'SavedV40AuthorReopened_All928MeshFingerprints40PackedImagesAndDimensionsChecked_GrayOnly','sourceSha256':record['sourceSha256'],'authorNeverSavedDuringAudit':True,'meshCount':928,'knownChangedMeshCount':len(record['changedSourceMeshes']),'unchangedIncludingAllowedZeroShiftCount':928-len(record['changedSourceMeshes']),'zeroShiftNamesRecoveredFromProtectedV38':missing,'packedImages':40,'rawTriangles':raw,'evaluatedTriangles':evaluated,'nominalEvaluatedDimensionsBlenderM':list(dims),'relativeWingEngineDatumRotationPreserved':True,'cabaneConnections':cabane,'controls':controls,'wholeFidelityAndPbrPassed':False,'scope':'Checks the actual reopened editable source, every source mesh fingerprint and original packed images, nominal evaluated dimensions and rebuilt cabane connections. Does not approve camera hypotheses, original photo/shadow fit, full motion, revised PBR/AO or game derivative.'}
for directory in [asset/'Evidence',source.parent/'Evidence']:(directory/'Data_DatumSourceReopenedCheck.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result),flush=True)
