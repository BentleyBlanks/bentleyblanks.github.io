"""Separate gray tail-gear candidate from printed307/330 datums.

Free-axis/fore-aft/hidden fitting points remain a drawing reconstruction. No
camera/load fit, PBR approval or canonical promotion is implied by this update.
"""
import bpy,pathlib,os,json,hashlib,math,ast,array,struct
import numpy as np
from mathutils import Vector,Matrix
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']).resolve();source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve();baseline=pathlib.Path(bpy.data.filepath)
assert baseline.parent.name=='ReferenceV37_Repacked' and hashlib.sha256(baseline.read_bytes()).hexdigest()=='563e95699bfa9b027608167cfe920a149332eec5e354a2bba803fb6e2bcd2e88'
assert (source.name=='ReferenceV38' or source.name.startswith('ReferenceV38_')) and 'OneDrive' in str(source);author=source/'Scene_NakajimaKi4.blend';assert not author.exists()
for folder in [source,source/'Scripts',source/'Evidence',source/'Exports',asset,asset/'Evidence']:folder.mkdir(parents=True,exist_ok=True)
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV37'
names=sorted(o.name for o in root.children_recursive if o.type=='MESH' and o.name.startswith('TailSkid'));assert len(names)==13,names
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH' and o.name not in names};images={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file};assert len(before)==915 and len(images)==40
deps=bpy.context.evaluated_depsgraph_get();oldParts=[]
for name in names:
    obj=bpy.data.objects[name];evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    try:mesh.calc_loop_triangles();count=len(mesh.loop_triangles)
    finally:evaluated.to_mesh_clear()
    oldParts.append({'name':name,'triangles':count,'materials':[m.name for m in obj.data.materials]})
oldUpper=Vector(root['tailSkidUpperEyeBlenderM']);oldMount=Vector(root['tailSkidShoeMountBlenderM']);oldPhi=math.radians(float(root['tailSkidShockAxisDegrees']));phi=math.radians(14.5);frame5=float(root['frameStationBlenderYm'][5]);axisHeight=float(root['bodyLongitudinalAxisHeightM'])
upper=Vector((0,frame5-.070,axisHeight+.307));direction=Vector((0,-math.sin(phi),-math.cos(phi)));normal=Vector((0,math.cos(phi),-math.sin(phi)));mount=upper+direction;pin=upper+direction*.925+normal*.040;body=Vector((0,frame5,axisHeight-.360));rotation=Matrix.Rotation(oldPhi-phi,4,'X')
upperMatrix=Matrix.Translation(upper)@rotation@Matrix.Translation(-oldUpper);lowerMatrix=Matrix.Translation(mount)@rotation@Matrix.Translation(-oldMount);eyeMatrix=Matrix.Translation(upper-oldUpper)
upperNames={'TailSkidUpperNeck','TailSkidShockBarrel','TailSkidShockCollar0.31'};eyeNames={'TailSkidUpperEye','TailSkidUpperPin'}
for name in names:
    obj=bpy.data.objects[name]
    if name.startswith('TailSkidLowerLink'):continue
    transform=eyeMatrix if name in eyeNames else upperMatrix if name in upperNames else lowerMatrix
    obj.matrix_world=transform@obj.matrix_world
for side in [-1,1]:
    obj=bpy.data.objects['TailSkidLowerLink'+str(side)];mesh=obj.data;start=body+Vector((side*.165,0,0));end=pin+Vector((side*.035,0,0));length=(end-start).length;oldLength=max(v.co.z for v in mesh.vertices)-min(v.co.z for v in mesh.vertices)
    for v in mesh.vertices:v.co.z*=length/oldLength
    mesh.update();obj.matrix_world=Matrix.Translation((start+end)/2)@(end-start).to_track_quat('Z','Y').to_matrix().to_4x4()
    for polygon in mesh.polygons:
        angles=[math.atan2(mesh.vertices[mesh.loops[i].vertex_index].co.y,mesh.vertices[mesh.loops[i].vertex_index].co.x)%(2*math.pi) for i in polygon.loop_indices];crosses=max(angles)-min(angles)>math.pi
        for i,a in zip(polygon.loop_indices,angles):
            v=mesh.vertices[mesh.loops[i].vertex_index].co
            if abs(polygon.normal.z)<.5:
                if crosses and a<math.pi:a+=2*math.pi
                mesh.uv_layers[0].data[i].uv=(a*.012/.5,(v.z+length/2)/.5)
            else:mesh.uv_layers[0].data[i].uv=(v.x/.5,v.y/.5)
    obj['tailBodyPinBlenderM']=list(start);obj['tailLowerPinBlenderM']=list(end);obj['tailRigidLengthM']=length
guide=bpy.data.objects['SourceGuide_TailSkidShoe'];guide.matrix_world=lowerMatrix@guide.matrix_world
bpy.context.view_layer.update();assert before=={name:MeshFingerprint(bpy.data.objects[name]) for name in before};assert images=={name:hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest() for name in images}
root['version']='20261027ReferenceV38';root['tailSkidUpperEyeBlenderM']=list(upper);root['tailSkidShoeMountBlenderM']=list(mount);root['tailSkidShockAxisDegrees']=14.5;root['tailSkidSourceUpdate']='Manual89 printed upper-eye307mm above body axis and body V-link330mm span. Free-axis14.5deg,70mm upper aft offset,360mm lower body drop,40mm fore pin offset and925mm link station remain scan/assembly reconstruction.26deg30 line is not confirmed as free flight; no load/camera adopted.';root['tailDatumNewPartsJson']=json.dumps(names);root['geometryAoPendingForChangedGeometry']=True;root['tailGeometryPbrPending']=True
parameters={'printedUpperEyeAboveAxisM':.307,'printedBodyPinSpanM':.330,'inferredAxisDegrees':14.5,'inferredUpperAftOffsetM':.070,'inferredLowerBodyPinDropM':.360,'inferredLinkAlongAxisM':.925,'inferredLinkPinForeOffsetM':.040,'nominalUpperEyeToMountEndM':1.,'upperEyeBlenderM':list(upper),'lowerMountBlenderM':list(mount),'lowerPinBlenderM':list(pin),'bodyAxisHeightM':axisHeight,'frame5BlenderYM':frame5};root['tailDatumParametersJson']=json.dumps(parameters)
shoe=bpy.data.objects['TailSkidShoe'];evaluated=shoe.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
try:shoePoints=[list(shoe.matrix_world@v.co) for v in mesh.vertices]
finally:evaluated.to_mesh_clear()
def Centre(o):return sum((o.matrix_world@v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
actualEye=Centre(bpy.data.objects['TailSkidUpperEye']);assert abs(actualEye.z-axisHeight-.307)<2e-7
bodyEnds=[]
for side in [-1,1]:
    obj=bpy.data.objects['TailSkidLowerLink'+str(side)];z=min(v.co.z for v in obj.data.vertices);points=[obj.matrix_world@v.co for v in obj.data.vertices if abs(v.co.z-z)<1e-6];bodyEnds.append(sum(points,Vector())/len(points))
assert abs(bodyEnds[1].x-bodyEnds[0].x-.330)<2e-7
script=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4TailDatum.py';text=bpy.data.texts.get(script.name) or bpy.data.texts.new(script.name);text.clear();text.write(script.read_text(encoding='utf8'));text.use_fake_user=True;(source/'Scripts'/script.name).write_text(script.read_text(encoding='utf8'));bpy.ops.wm.save_as_mainfile(filepath=str(author))
gray=bpy.data.materials.new('Material_TailDatumGrayStudy');gray.use_nodes=True;bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72;materials={bpy.data.objects[n]:list(bpy.data.objects[n].data.materials) for n in names}
try:
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for obj in materials:obj.data.materials.clear();obj.data.materials.append(gray);obj.select_set(True)
    bpy.context.view_layer.objects.active=root;patch=asset/'Model_TailDatumPatch.glb';bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
finally:
    for obj,mats in materials.items():
        obj.data.materials.clear()
        for mat in mats:obj.data.materials.append(mat)
    bpy.data.materials.remove(gray)
assert before=={name:MeshFingerprint(bpy.data.objects[name]) for name in before}
result={'state':'PrintedTail307And330DatumCandidateSaved_GrayOnly_NotFidelityApproved','sourceBaselineSha256':'563e95699bfa9b027608167cfe920a149332eec5e354a2bba803fb6e2bcd2e88','sourceSha256':hashlib.sha256(author.read_bytes()).hexdigest(),'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'parameters':parameters,'actualEyeBlenderM':list(actualEye),'actualBodyPinsBlenderM':[list(v) for v in bodyEnds],'shoeSupportBlenderM':shoePoints,'oldParts':oldParts,'newPartNames':names,'unchangedSourceMeshes':before,'unchangedPackedImages':images,'scope':root['tailSkidSourceUpdate']}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_TailDatumSource.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['unchangedSourceMeshes','unchangedPackedImages','shoeSupportBlenderM','oldParts']}),flush=True)
