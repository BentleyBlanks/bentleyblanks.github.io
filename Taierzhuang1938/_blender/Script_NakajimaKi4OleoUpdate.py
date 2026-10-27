"""Update an exclusive V28 author copy into the nominal-free V29 gray study."""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math
source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
repo=asset.parents[2];author=source/'Scene_NakajimaKi4.blend'
assert source.name in ['ReferenceV29','ReferenceV30'] and pathlib.Path(bpy.data.filepath).resolve()==author
assert hashlib.sha256(author.read_bytes()).hexdigest()=='48c030a5d30cdbc84e4364a32e1ce31bcb93c06f60eddaec07198a6521a0d4ef'
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261026ReferenceV28'
fingerprintSource=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py'
tree=ast.parse(fingerprintSource.read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'SourceGeometryFingerprint','exec'),globals())
remove=[obj.name for obj in root.children_recursive if obj.type=='MESH' and (obj.name.startswith(('LandingGear_ShockBarrel','LandingGear_ShockPiston','LandingGear_ShockCollar')) or obj.name in ['LandingGear_MainVFrameLeft','LandingGear_MainVFrameRight'])]
assert len(remove)==10
wheelNames=['Wheel'+kind+'_'+side+sign for kind in ['Rim','Hub'] for side in ['Left','Right'] for sign in ['-1','1']]
assert len(wheelNames)==8 and all(name in bpy.data.objects for name in wheelNames)
changed=set(remove+wheelNames)
freeCamber=float(os.environ.get('KI4_FREE_CAMBER_DEG','0'))
assert freeCamber in [0.,4.]
wheelRestBefore={name:[list(row) for row in bpy.data.objects[name].matrix_world] for name in ['Pivot_WheelLeft','Pivot_WheelRight']}
if freeCamber:
    for side,label in [(-1,'Left'),(1,'Right')]:bpy.data.objects['Pivot_Wheel'+label].rotation_euler.y=side*math.radians(freeCamber)
bpy.context.view_layer.update()
before={obj.name:MeshFingerprint(obj) for obj in root.children_recursive if obj.type=='MESH' and obj.name not in changed}
images={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
steel=bpy.data.objects['LandingGear_ShockBarrelRight'].data.materials[0];bright=bpy.data.objects['LandingGear_ShockPistonRight'].data.materials[0]
oldParts=[{'name':name,'triangles':sum(len(p.vertices)-2 for p in bpy.data.objects[name].data.polygons)} for name in remove+wheelNames]
for name in remove:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
gearPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGear.py';gear={};exec(compile(gearPath.read_text(encoding='utf8'),str(gearPath),'exec'),gear)
frame=gear['BuildMainVLegs'](root,bpy.data.objects['Fuselage_Monocoque'],steel,.780,1.810,1.640,.430,axleInnerLateral=.925,reuseBodyFittings=True,solidEyeUnion=True,axleCarrierZ=.430+.2*math.tan(math.radians(freeCamber)))
oleoPath=gearPath.with_name('Script_NakajimaKi4Oleo.py');oleo={};exec(compile(oleoPath.read_text(encoding='utf8'),str(oleoPath),'exec'),oleo)
result=oleo['BuildOleoAssemblies'](root,steel,bright,'Source',freeCamberDegrees=freeCamber)
bpy.context.view_layer.update()
assert {name:MeshFingerprint(bpy.data.objects[name]) for name in before}==before,'Unrelated source geometry/UV/normal/material/transform changed'
assert images=={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
root['version']=os.environ.get('KI4_CANDIDATE_VERSION','20261026ReferenceV29');root['geometryUpdateScope']='NominalFreeOleoAndInboardFixedAxleGrayStudy_PbrAoAndLoadedStancePending'
root['geometryAoPendingForChangedGeometry']=True
root['mainGearAxleCarrierScope']='Carrier at925mm half-span is reconstructed inboard of the rotating wheel/hub envelope, supported by the fixed axle arrangement inCanvas87. It is not the unresolved1194mm drawing datum or the2250mm wheel-centre track.'
root['mainGearNewPartsJson']=json.dumps(frame['newParts']+[name for name in before if name.startswith(('LandingGear_BodyFitting','LandingGear_BodyPin'))])
newNames=frame['newParts']+result['newParts'];assert len(set(newNames))==len(newNames)
root['oleoNewPartsJson']=json.dumps(newNames)
for path in [gearPath,oleoPath,gearPath.with_name('Script_NakajimaKi4OleoUpdate.py')]:
    text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True
    (source/'Scripts'/path.name).write_text(path.read_text(encoding='utf8'),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(author));sourceSha=hashlib.sha256(author.read_bytes()).hexdigest()
newObjects=[bpy.data.objects[name] for name in newNames]
savedMaterials={obj:list(obj.data.materials) for obj in newObjects}
gray=bpy.data.materials.new('Material_MainGearGrayStudy');gray.use_nodes=True
bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72
out=asset/'Model_OleoSourcePatch.glb'
try:
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for name in ['Pivot_WheelLeft','Pivot_WheelRight']:bpy.data.objects[name].select_set(True)
    for obj in newObjects:obj.select_set(True);obj.data.materials.clear();obj.data.materials.append(gray)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
                             export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,
                             export_animations=False,export_cameras=False,export_lights=False)
finally:
    for obj,materials in savedMaterials.items():
        obj.data.materials.clear()
        for material in materials:obj.data.materials.append(material)
    bpy.data.materials.remove(gray)
parts=[]
for obj in newObjects:obj.data.calc_loop_triangles();parts.append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'fingerprint':MeshFingerprint(obj),'parent':obj.parent.name})
record={'state':'ActualNominalFreeOleoSourceUpdated_GrayOnly_LoadStatePending','baselineSourceSha256':'48c030a5d30cdbc84e4364a32e1ce31bcb93c06f60eddaec07198a6521a0d4ef','sourceSha256':sourceSha,'source':str(author),'patch':str(out),'patchSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'oldParts':oldParts,'newParts':parts,'unchangedSourceMeshFingerprints':before,'unchangedPackedImages':images,'mainVFrame':frame,'oleo':result,'freeCamberDegrees':freeCamber,'wheelRestBefore':wheelRestBefore,'scope':'Printed component free lengths and source33deg upper reference normal. Inboard carrier, real fixed axle, lower fork and hidden rotating axle bores reconstructed coherently. Tire local geometry/centres, body, wings and10 controls retained; optional source4deg free wheel camber is an explicit rest-transform change. Loaded/park configuration, PBR/AO and whole fidelity remain unverified.'}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_OleoSourceUpdate.json').write_text(json.dumps(record,indent=2),encoding='utf8')
print(json.dumps({'state':record['state'],'sourceSha256':sourceSha,'newParts':len(parts),'newTriangles':sum(row['triangles'] for row in parts),'unchangedSourceMeshes':len(before),'oleoEyesM':[row['actualNominalEyeLengthM'] for row in result['records']]}))
