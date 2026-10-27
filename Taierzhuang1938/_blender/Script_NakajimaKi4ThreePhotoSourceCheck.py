"""Reopen exact saved V42 and reimport its exact gray GLB; never save audit."""
import bpy,pathlib,json,hashlib,ast,array,struct,math,re
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
repo=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4ThreePhotoSourceCheck.py')).resolve().parents[2];asset=repo/'tmp/NakajimaKi4/ReferenceV42_ThreePhotoShape';record=json.loads((asset/'Evidence/Data_ThreePhotoShapeAuthor.json').read_text(encoding='utf8'));source=pathlib.Path(bpy.data.filepath)
assert source.resolve()==pathlib.Path(record['sourcePath']).resolve() and hashlib.sha256(source.read_bytes()).hexdigest()==record['sourceSha256'];root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV42ThreePhotoShapeGray' and not root['referenceFidelityPassed'] and not bpy.context.scene.get('Ki4ThreePhotoShapeMutationInProgress')
def LoadFunctions(path,names):
 tree=ast.parse(path.read_text(encoding='utf8'))
 for name in names:
  node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),globals())
LoadFunctions(repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py',['MeshFingerprint']);LoadFunctions(repo/'Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py',['TrianglePenetrates','Intersections'])
bpy.context.view_layer.update();meshes=[o for o in root.children_recursive if o.type=='MESH'];assert len(meshes)==928;actual={o.name:MeshFingerprint(o)for o in meshes};assert actual==record['allExpectedSourceMeshes'];images={image.name:hashlib.sha256(image.packed_file.data).hexdigest()for image in bpy.data.images if image.packed_file};assert len(images)==40 and images==record['originalPackedImagesUnchanged']
def Geometry(objects,evaluate):
 low=Vector((math.inf,math.inf,math.inf));high=-low;triangles=0;dg=bpy.context.evaluated_depsgraph_get()
 for obj in objects:
  evaluated=obj.evaluated_get(dg)if evaluate else obj;mesh=evaluated.to_mesh()if evaluate else obj.data;mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
  for vertex in mesh.vertices:
   point=obj.matrix_world@vertex.co
   for axis in range(3):low[axis]=min(low[axis],point[axis]);high[axis]=max(high[axis],point[axis])
  if evaluate:evaluated.to_mesh_clear()
 dimensions=high-low;assert abs(dimensions.x-12)<.002 and abs(dimensions.y-8.25)<.05 and abs(dimensions.z-3.31)<.04;return triangles,list(dimensions)
raw,dimensionsRaw=Geometry(meshes,False);evaluated,dimensions=Geometry(meshes,True);assert raw==348908 and evaluated==351020
def Tree(objects,evaluate=False):
 vertices=[];faces=[];dg=bpy.context.evaluated_depsgraph_get()
 for obj in objects:
  eo=obj.evaluated_get(dg)if evaluate else obj;mesh=eo.to_mesh()if evaluate else obj.data;mesh.calc_loop_triangles();offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in mesh.vertices);faces.extend(tuple(offset+i for i in t.vertices)for t in mesh.loop_triangles)
  if evaluate:eo.to_mesh_clear()
 return {'vertices':vertices,'faces':faces,'bvh':BVHTree.FromPolygons(vertices,faces,all_triangles=True)}
def Inside(tree,point):
 hit,normal,index,distance=tree.find_nearest(point);return hit is not None and normal.dot(point-hit)<=1e-5
bodyTree=Tree([bpy.data.objects['Fuselage_Monocoque']],True)['bvh'];rodRows=[]
for row in record['rodConnections']:
 obj=bpy.data.objects[row['name']];z=[v.co.z for v in obj.data.vertices];caps=[]
 for value in [min(z),max(z)]:caps.append([obj.matrix_world@v.co for v in obj.data.vertices if abs(v.co.z-value)<1e-6])
 caps.sort(key=lambda points:sum(p.z for p in points)/len(points));centers=[sum(points,Vector())/len(points)for points in caps];error=max((centers[0]-Vector(row['lowerBodyBlenderM'])).length,(centers[1]-Vector(row['upperJointBlenderM'])).length);lowerInside=all(Inside(bodyTree,p)for p in caps[0]);assert error<4e-6 and lowerInside
 upperInside=None
 if obj.name.startswith('TailplaneBrace_'):
  side='Left'if obj.name.endswith('Left')else'Right';tree=Tree([bpy.data.objects['Tailplane_'+side]],True)['bvh'];upperInside=all(Inside(tree,p)for p in caps[1]);assert upperInside
 rodRows.append({'name':obj.name,'actualSavedCapAlignmentErrorM':error,'actualSavedLowerCapInsideBodyHull':lowerInside,'actualSavedUpperCapInsideTailHull':upperInside})
sourcePivots={o.name:o for o in root.children_recursive if o.name.startswith('Pivot_')};assert len(sourcePivots)==10
def TailChecks(nodes,evaluate):
 rudder=nodes['Pivot_Rudder'];elevators=[nodes['Pivot_Elevator'+side]for side in ['Left','Right']];sourceObjects=[rudder]+elevators;snapshot={obj:(obj.rotation_mode,obj.rotation_quaternion.copy(),obj.rotation_euler.copy())for obj in sourceObjects};rq=rudder.matrix_basis.to_quaternion();eq=[obj.matrix_basis.to_quaternion()for obj in elevators]
 movingR=[obj for obj in rudder.children_recursive if obj.type=='MESH'];movingE=[obj for pivot in elevators for obj in pivot.children_recursive if obj.type=='MESH'];fixed=[nodes[name]for name in ['Tailplane_Left','Tailplane_Right','TailplaneBrace_Left','TailplaneBrace_Right','Fuselage_Monocoque','VerticalFin']];static=Tree(fixed,evaluate);rows=[]
 for obj in sourceObjects:obj.rotation_mode='QUATERNION'
 for r in [-25,0,25]:
  for e in [-25,0,25]:
   rudder.rotation_quaternion=rq@Quaternion(Vector((0,0,1)),math.radians(r))
   for obj,q in zip(elevators,eq):obj.rotation_quaternion=q@Quaternion(Vector((1,0,0)),math.radians(e))
   bpy.context.view_layer.update();rt=Tree(movingR,evaluate);et=Tree(movingE,evaluate);rE,cRE=Intersections(rt,et);eS,cES=Intersections(et,static);rows.append({'rudderDegrees':r,'elevatorDegrees':e,'rudderElevatorIntersections':rE,'elevatorFixedBodyTailIntersections':eS,'bvhCandidates':cRE+cES})
 for obj,(mode,quaternion,euler)in snapshot.items():obj.rotation_mode=mode;obj.rotation_quaternion=quaternion;obj.rotation_euler=euler
 bpy.context.view_layer.update();assert not any(row['rudderElevatorIntersections']or row['elevatorFixedBodyTailIntersections']for row in rows),rows;return rows
sourceNodes={obj.name:obj for obj in [root]+list(root.children_recursive)};sourceTail=TailChecks(sourceNodes,True);assert actual=={o.name:MeshFingerprint(o)for o in meshes}
glb=asset/'Model_NakajimaKi4HighGray.glb';assert hashlib.sha256(glb.read_bytes()).hexdigest()==record['grayExportSha256'];before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(glb));new=set(bpy.data.objects)-before;nodes={re.sub(r'\.\d{3}$','',obj.name):obj for obj in new};newMeshes=[obj for obj in new if obj.type=='MESH'];assert len(newMeshes)==928;runtimeTriangles,runtimeDimensions=Geometry(newMeshes,False);assert runtimeTriangles==351020 and max(abs(a-b)for a,b in zip(dimensions,runtimeDimensions))<3e-5
pivotRows=[]
for name,pivot in sourcePivots.items():
 imported=nodes[name];axis=Vector((0,0,1))if name in ['Pivot_Rudder','Pivot_ObserverYaw']else Vector((0,1,0))if name=='Pivot_Propeller'else Vector((1,0,0));originError=(pivot.matrix_world.translation-imported.matrix_world.translation).length;axisError=((pivot.matrix_world.to_3x3()@axis).normalized()-(imported.matrix_world.to_3x3()@axis).normalized()).length;assert originError<4e-6 and axisError<3e-6;pivotRows.append({'name':name,'actualGlbOriginDifferenceM':originError,'actualGlbAxisUnitDifference':axisError})
runtimeTail=TailChecks(nodes,False);assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sourceSha256'];assert actual=={o.name:MeshFingerprint(o)for o in meshes}
baseRecord=json.loads((repo/'tmp/NakajimaKi4/ReferenceV41_TailStation/Evidence/Data_TailStationAuthor.json').read_text(encoding='utf8'));baseHashes={**baseRecord['unchangedSourceMeshes'],**baseRecord['changedSourceMeshes']};unchangedNames=[name for name,value in actual.items()if baseHashes[name]==value]
result={'state':'ActualSavedV42SourceAndActualGrayGlbReimportVerified_ReferenceAndPbrIncomplete','sourcePath':str(source),'sourceSha256':record['sourceSha256'],'grayExportSha256':record['grayExportSha256'],'sourceMeshFingerprintsChecked':928,'sourcePackedImagesChecked':40,'actualChangedMeshCount':928-len(unchangedNames),'actualUnchangedMeshCount':len(unchangedNames),'protectedUnrelatedMeshCount':len(record.get('protectedUnrelatedSourceMeshes',record['unchangedSourceMeshes'])),'rawTriangles':raw,'evaluatedTriangles':evaluated,'actualGlbTriangles':runtimeTriangles,'savedSourceDimensionsBlenderM':dimensions,'actualGlbDimensionsBlenderM':runtimeDimensions,'savedRodConnections':rodRows,'actualGlbTenPivotOriginsAndAxes':pivotRows,'savedSourceNineCombinedTailClearance':sourceTail,'actualGlbNineCombinedTailClearance':runtimeTail,'authorNeverSavedDuringAudit':True,'wholeReferenceFidelityPassed':False,'scope':'Actual saved author reopens with every mesh fingerprint and original packed input intact. Six rod lower caps lie inside actual body skin; tail brace upper caps inside actual tail skin. Exact exported GLB dimensions,10hinge origins/axes and9tail-specific combined collision states checked. Does not approve all original photo/ground/held-out-shadow/full80/PBR/AO/game/source-runtime integration/publication requirements.'}
for directory in [asset/'Evidence',source.parent/'Evidence']:(directory/'Data_ThreePhotoSourceReopenedCheck.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({'state':result['state'],'sourceSha256':record['sourceSha256'],'graySha256':record['grayExportSha256'],'changedMeshes':result['actualChangedMeshCount'],'unchangedMeshes':result['actualUnchangedMeshCount'],'triangles':runtimeTriangles,'packedImages':len(images),'sourceTailPoses':len(sourceTail),'actualGlbTailPoses':len(runtimeTail),'rodConnections':len(rodRows),'dimensionsBlenderM':runtimeDimensions}),flush=True)
