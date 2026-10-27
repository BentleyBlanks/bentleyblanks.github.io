"""Independent source-backed horizontal-tail longitudinal-station correction.

Primary p14/plate83/plate94: rear mounting at frame6 and adjacent60mm hinge
offset. Height/incidence stay at the preserved reconstruction; not factory proof.
"""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math,shutil,re
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4TailStation.py')).resolve();repo=scriptPath.parents[2]
base=pathlib.Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV40_Connected/Scene_NakajimaKi4.blend');sourceRoot=pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV41_TailStation'));asset=pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repo/'tmp/NakajimaKi4/ReferenceV41_TailStation')))
assert pathlib.Path(bpy.data.filepath).resolve()==base.resolve();assert hashlib.sha256(base.read_bytes()).hexdigest()=='5d9bbc88cd394a247b1d16dc0c1ede2aac15c7b30a3325e4a04d5649c7e6250b';assert not sourceRoot.exists(),'Use a NEW author directory';assert not (asset/'Model_NakajimaKi4HighGray.glb').exists()
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV40GrayDatum';assert not bpy.context.scene.get('Ki4TailStationMutationInProgress',False);objects=list(root.children_recursive);meshes=[o for o in objects if o.type=='MESH'];assert len(meshes)==928
module=ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in module.body if isinstance(n,ast.FunctionDef)and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
bpy.context.view_layer.update();before={o.name:MeshFingerprint(o)for o in meshes};images={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file};assert len(images)==40
for o in meshes:o.data.calc_loop_triangles()
rawBefore=sum(len(o.data.loop_triangles)for o in meshes);assert rawBefore==348908
def EvaluatedCount():
 dg=bpy.context.evaluated_depsgraph_get();total=0
 for o in meshes:
  e=o.evaluated_get(dg);m=e.to_mesh();m.calc_loop_triangles();total+=len(m.loop_triangles);e.to_mesh_clear()
 return total
assert EvaluatedCount()==351020
pivots=[bpy.data.objects['Pivot_Elevator'+side]for side in ['Left','Right']];oldAxis=sum((p.matrix_world.translation for p in pivots),Vector())/2;frame6=float(root['fuselageFrameStationsBlenderY'][6]);targetY=frame6-.060;shift=targetY-oldAxis.y;assert abs(shift-.360)<2e-6;delta=Vector((0,shift,0));fixed=[bpy.data.objects['Tailplane_'+side]for side in ['Left','Right']];braces=[bpy.data.objects['TailplaneBrace_'+side]for side in ['Left','Right']];changedNames={'Tailplane_Left','Tailplane_Right','Elevator_Left','Elevator_Right','TailplaneBrace_Left','TailplaneBrace_Right'}
bpy.context.scene['Ki4TailStationMutationInProgress']=True
for o in fixed+pivots:o.matrix_world=Matrix.Translation(delta)@o.matrix_world
bpy.context.view_layer.update();braceRows=[]
for o in braces:
 z=[v.co.z for v in o.data.vertices];lo,hi=min(z),max(z);caps=[]
 for value in [lo,hi]:
  points=[o.matrix_world@v.co for v in o.data.vertices if abs(v.co.z-value)<1e-6];caps.append(sum(points,Vector())/len(points))
 lower,upper=sorted(caps,key=lambda p:p.z);newUpper=upper+delta;axis=newUpper-lower;scale=o.scale.copy();scale.z=axis.length/(hi-lo);o.location=(newUpper+lower)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=axis.to_track_quat('Z','Y');o.scale=scale
 uv=o.data.uv_layers.get('UVMap');assert uv
 radius=max(abs(v.co.x)for v in o.data.vertices)
 for polygon in o.data.polygons:
  angles=[math.atan2(o.data.vertices[o.data.loops[i].vertex_index].co.y,o.data.vertices[o.data.loops[i].vertex_index].co.x)%(2*math.pi)for i in polygon.loop_indices];crosses=max(angles)-min(angles)>math.pi
  for index,angle in zip(polygon.loop_indices,angles):
   p=o.data.vertices[o.data.loops[index].vertex_index].co
   if abs(polygon.normal.z)<.5:
    if crosses and angle<math.pi:angle+=2*math.pi
    uv.data[index].uv=(angle*radius*scale.x/1.5,(p.z-lo)*scale.z/1.5)
   else:uv.data[index].uv=(p.x*scale.x/1.5,p.y*scale.y/1.5)
 o.data.update();braceRows.append({'name':o.name,'lowerBodyBlenderM':list(lower),'upperTailBlenderM':list(newUpper),'lengthM':axis.length,'primarySteelUvDomainM':[1.5,1.5]})
bpy.context.view_layer.update();after={o.name:MeshFingerprint(o)for o in meshes};unchanged={n:v for n,v in before.items()if n not in changedNames};assert len(unchanged)==922 and unchanged=={n:after[n]for n in unchanged};assert images=={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file};assert EvaluatedCount()==351020
# Use the existing strict triangle-intersection predicate on evaluated source
# triangles. Only the tail-specific fixed and combined moving groups are audited.
audit=ast.parse(scriptPath.with_name('Script_NakajimaKi4Audit.py').read_text(encoding='utf8'))
for name in ['TrianglePenetrates','Intersections']:
 fn=next(n for n in audit.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[fn],type_ignores=[]),'TailCollisionHelpers','exec'),globals())
def Tree(objs):
 vertices=[];faces=[];dg=bpy.context.evaluated_depsgraph_get()
 for o in objs:
  e=o.evaluated_get(dg);m=e.to_mesh();m.calc_loop_triangles();offset=len(vertices);vertices.extend(o.matrix_world@v.co for v in m.vertices);faces.extend(tuple(offset+i for i in t.vertices)for t in m.loop_triangles);e.to_mesh_clear()
 return{'vertices':vertices,'faces':faces,'bvh':BVHTree.FromPolygons(vertices,faces,epsilon=0)}
rudder=bpy.data.objects['Pivot_Rudder'];snapshots={o.name:{'location':o.location.copy(),'scale':o.scale.copy(),'quaternion':o.rotation_quaternion.copy(),'euler':o.rotation_euler.copy(),'mode':o.rotation_mode}for o in [rudder]+pivots};restR= rudder.matrix_basis.copy();restE=[p.matrix_basis.copy()for p in pivots];modes=[rudder.rotation_mode]+[p.rotation_mode for p in pivots];rq=rudder.matrix_basis.to_quaternion();eq=[p.matrix_basis.to_quaternion()for p in pivots];rudder.rotation_mode='QUATERNION'
for p in pivots:p.rotation_mode='QUATERNION'
movingR=[o for o in rudder.children_recursive if o.type=='MESH'];movingE=[o for p in pivots for o in p.children_recursive if o.type=='MESH'];fixedTail=fixed+braces+[bpy.data.objects['Fuselage_Monocoque'],bpy.data.objects['VerticalFin']];tailStatic=Tree(fixedTail);checks=[]
for rAngle in [-25,0,25]:
 for eAngle in [-25,0,25]:
  rudder.rotation_quaternion=rq@Quaternion(Vector((0,0,1)),math.radians(rAngle))
  for p,q in zip(pivots,eq):p.rotation_quaternion=q@Quaternion(Vector((1,0,0)),math.radians(eAngle))
  bpy.context.view_layer.update();rt=Tree(movingR);et=Tree(movingE);rE,cRE=Intersections(rt,et);eS,cES=Intersections(et,tailStatic);checks.append({'rudderDegrees':rAngle,'elevatorDegrees':eAngle,'rudderElevatorIntersections':rE,'elevatorFixedBodyTailIntersections':eS,'bvhCandidates':cRE+cES})
for o in [rudder]+pivots:
 old=snapshots[o.name];o.rotation_mode=old['mode'];o.location=old['location'];o.scale=old['scale'];o.rotation_quaternion=old['quaternion'];o.rotation_euler=old['euler']
bpy.context.view_layer.update();assert after=={o.name:MeshFingerprint(o)for o in meshes},'Source pose was not exactly restored after tail audit'
assert not any(row['rudderElevatorIntersections']or row['elevatorFixedBodyTailIntersections']for row in checks),checks
low=Vector((math.inf,math.inf,math.inf));high=-low
for o in meshes:
 for v in o.data.vertices:
  p=o.matrix_world@v.co
  for i in range(3):low[i]=min(low[i],p[i]);high[i]=max(high[i],p[i])
dims=high-low;assert abs(dims.x-12)<.002 and abs(dims.y-8.25)<.05 and abs(dims.z-3.31)<.04
sourceRoot.mkdir(parents=True);(sourceRoot/'Scripts').mkdir();(sourceRoot/'Evidence').mkdir();(sourceRoot/'Exports').mkdir();asset.mkdir(parents=True,exist_ok=True);(asset/'Evidence').mkdir(exist_ok=True)
root['version']='20261027ReferenceV41TailStationGray';root['referenceFidelityPassed']=False;root['canonicalPromoted']=False;root['geometryAoPendingForChangedGeometry']=True;root['tailLongitudinalInstallationSource']='Printedp14 frame6 rear mounting, plate83 adjacent60mm hinge offset, plate94 mounting diagram';root['tailElevatorAxisBlenderM']=[0,targetY,float(oldAxis.z)];root['tailInstallationHeightFactoryConfirmed']=False;root['tailInstallationIncidenceFactoryConfirmed']=False;root['tailStationCorrectionM']=shift
text=bpy.data.texts.get(scriptPath.name)or bpy.data.texts.new(scriptPath.name);text.clear();text.write(scriptPath.read_text(encoding='utf8'));text.use_fake_user=True;shutil.copy2(scriptPath,sourceRoot/'Scripts'/scriptPath.name)
bpy.context.scene['Ki4TailStationMutationInProgress']=False;author=sourceRoot/'Scene_NakajimaKi4.blend';bpy.ops.wm.save_as_mainfile(filepath=str(author),compress=True);sha=hashlib.sha256(author.read_bytes()).hexdigest()
record={'state':'PrimarySupportedTailStationGraySource_CompleteReferenceAndPbrPending','inputSource':str(base),'inputSourceSha256':'5d9bbc88cd394a247b1d16dc0c1ede2aac15c7b30a3325e4a04d5649c7e6250b','sourcePath':str(author),'sourceSha256':sha,'tailForwardShiftM':shift,'oldElevatorAxisBlenderM':list(oldAxis),'newElevatorAxisBlenderM':[0,targetY,float(oldAxis.z)],'frame6BlenderY':frame6,'rearMountToHingeAftM':.060,'primaryMountAxisSpacingM':.660,'heightAndIncidenceAdoptedFromNumericalOptimum':False,'unchangedSourceMeshes':unchanged,'changedSourceMeshes':{n:after[n]for n in changedNames},'originalPackedImagesUnchanged':images,'meshCount':928,'rawTriangles':rawBefore,'evaluatedTriangles':351020,'nominalDimensionsBlenderM':list(dims),'braceConnections':braceRows,'sourceTailNineCombinedClearanceChecks':checks,'scope':'Longitudinal correction only. Original tailspan/chord/shape/control ranges and earlier height/incidence retained. Numerical exterior-tail/other photo/camera/ground checks, actual GLB collision reimport, updated PBR/AO/game derivative remain required. Source-specific fixed/elevator root pocket shape is retained and must be checked after reimport.'}
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_TailStationAuthor.json').write_text(json.dumps(record,indent=2),encoding='utf8')
# Transient gray export; preserve the original clear-glass role.
gray=bpy.data.materials.new('Material_Ki4TailStationGrayOnly');gray.use_nodes=True;bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72;glass={o.name:list(o.data.materials)for o in meshes if re.match(r'^Windscreen(?:[12]|Side[12]-?1)$',o.name)}
for o in meshes:
 o.data.materials.clear()
 for material in glass.get(o.name,[gray]):o.data.materials.append(material)
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children_recursive):o.select_set(True)
bpy.context.view_layer.objects.active=root;target=sourceRoot/'Exports/Model_NakajimaKi4HighGray.glb';bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_normals=True,export_tangents=False,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False);shutil.copy2(target,asset/target.name);record['grayExportSha256']=hashlib.sha256(target.read_bytes()).hexdigest();record['grayExportPath']=str(target)
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_TailStationAuthor.json').write_text(json.dumps(record,indent=2),encoding='utf8')
recipe={'state':record['state'],'inputSource':str(base),'inputSourceSha256':record['inputSourceSha256'],'outputSourceSha256':sha,'script':str(scriptPath),'steps':['Open protected V40Connected through owned worktree BlenderMCP. Use NEW external KI4_SOURCE_ROOT and ignored KI4_ASSET_ROOT.','Move fixed-tail objects and elevator pivot nodes as a rigid module to frame6 minus60mm; rebuild two braces to original body foot and translated upper joint, with metre steel UVs.','Retain all922 unrelated source mesh fingerprints and40packed images. Check nine rudder/elevator extreme combinations against actual evaluated source triangles.','Save author BEFORE transient neutral-gray/clear-glass export. Reopen and reimport actual GLB for source/image/dimension/clearance/reference checks. Stop owned Blender and scan.','Other photographed views, unspecified height/incidence, full80control/clearance/PBR/AO and180k game derivative/integration remain pending.']};(sourceRoot/'Data_BuildRecipe.json').write_text(json.dumps(recipe,indent=2),encoding='utf8');print(json.dumps({'state':record['state'],'source':str(author),'sourceSha256':sha,'graySha256':record['grayExportSha256'],'shiftM':shift,'axisBlenderM':record['newElevatorAxisBlenderM'],'triangles':351020,'sourceTailCombinedChecks':len(checks),'unrelatedMeshesUnchanged':len(unchanged)}),flush=True)
