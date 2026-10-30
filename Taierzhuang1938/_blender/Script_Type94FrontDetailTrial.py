"""Reconstruct the visible V64 MG details while conserving the V63 source."""
import bpy,bmesh,hashlib,importlib.util,json,os,shutil
from pathlib import Path
from mathutils import Vector


def Main():
    assert not bpy.data.filepath,'V64 requires a fresh owned Blender process'
    repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
    base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
    baseline=base/'GunFrontV63/Scene_Type94TanketteHighShapeV63GunFrontTrial.blend'
    baselineSha='c8e2eaf8d0470a9c4e0c4039bd2f1b1c37b8b1fa6b72d6c87939584f10f1b381'
    assert hashlib.sha256(baseline.read_bytes()).hexdigest()==baselineSha
    os.environ['TYPE94_BODY_LAYOUT']='Data_BodyTrialV64.json'
    script=repo/'Taierzhuang1938/_blender/Script_Type94EnvelopeTrial.py'
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),{'__name__':'__main__','__file__':str(script)})
    root=Path(os.environ['TYPE94_SOURCE_ROOT']);blend=root/'Scene_Type94TanketteHighShapeV64FrontDetailTrial.blend';glb=root/'Exports/Model_Type94TanketteHighShapeV64FrontDetailTrial.glb'
    paintName=bpy.data.objects['Geometry_MachineGunPitch_Paint'].data.name
    construction=root/'Construction/Scene_Type94FrontDetailConstructorV64.blend';construction.parent.mkdir(exist_ok=True);shutil.copy2(blend,construction)
    candidateGun=bpy.data.objects['MachineGunPitch']
    keys=['MgRoundOpeningCenterLocalM','MgFrontRaisedFittingLayout','MgFrontRaisedFittingFrontProbePointsLocalM']
    properties={key:candidateGun[key].to_list()if hasattr(candidateGun[key],'to_list')else candidateGun[key]for key in keys}
    bpy.ops.wm.open_mainfile(filepath=str(baseline));assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
    with bpy.data.libraries.load(str(construction),link=False)as(source,target):
        assert paintName in source.meshes
        target.meshes=[paintName]
    bpy.data.objects['Geometry_MachineGunPitch_Paint'].data=target.meshes[0]
    file=repo/'Taierzhuang1938/_blender/Script_Type94DetailCorrect.py';spec=importlib.util.spec_from_file_location('V64Parts',file);details=importlib.util.module_from_spec(spec);spec.loader.exec_module(details)
    steel=bpy.data.objects['Geometry_MachineGunPitch_Steel'];original=steel.data;original.use_fake_user=True;mesh=original.copy();mesh.name=original.name+'_V64PhotoExterior';steel.data=mesh
    matches=[];gun=bpy.data.objects['MachineGunPitch'];toGun=gun.matrix_world.inverted()@steel.matrix_world
    for group in details.Components(mesh):
        points=[toGun@mesh.vertices[i].co for i in group];center=sum(points,Vector())/len(points)
        if abs(center.x)<.001 and abs(center.y-.236)<.001 and abs(center.z-.0055)<.001:matches.append(group)
    assert len(matches)==1,'Identify the actual isolated rectangular front-sight component before removal'
    group=matches[0];points=[toGun@mesh.vertices[i].co for i in group];extent=[max(p[k]for p in points)-min(p[k]for p in points)for k in range(3)]
    assert all(abs(a-b)<2e-6 for a,b in zip(extent,[.009,.015,.025]))
    attribute=mesh.attributes.new('V64RetainedCornerNormal','FLOAT_VECTOR','CORNER')
    for value,normal in zip(attribute.data,mesh.corner_normals):value.vector=normal.vector
    bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i]for i in group],context='VERTS');bm.to_mesh(mesh);bm.free();mesh.update()
    mesh.normals_split_custom_set([tuple(v.vector)for v in mesh.attributes['V64RetainedCornerNormal'].data]);mesh.attributes.remove(mesh.attributes['V64RetainedCornerNormal'])
    gun=bpy.data.objects['MachineGunPitch']
    for key,value in properties.items():gun[key]=value
    gun['MgExternalFrontSightRepresented']=False
    gun['MgFrontSightReferenceScope']='Tall rectangular block omitted from selected museum exterior; no wartime configuration claim'
    bpy.data.objects['Hull']['BodyTrialLayout']='Data_BodyTrialV64.json'
    scene=bpy.context.scene;scene['BodyTrialLayout']='Data_BodyTrialV64.json';scene['Type94TurretFrontLayout']='Data_TurretFrontLayoutV64.json';scene['AssetRevision']='ShapeV64FrontDetailTrial gray geometry study; no final PBR/game acceptance';scene['HistoricalShapeAccepted']=False
    file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('V64Export',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    exporter.ExportGltf(glb);bpy.ops.wm.save_as_mainfile(filepath=str(blend));sha=hashlib.sha256(glb.read_bytes()).hexdigest()
    for name in ['Data_MechanismShapeV64FrontDetailTrial.json','Data_ShapeV64FrontDetailTrialGrayBuild.json']:
        file=root/'Acceptance'/name;data=json.loads(file.read_text());data.update(sha256=sha,sourceProducer='Taierzhuang1938/_blender/Script_Type94FrontDetailTrial.py',preservedSourceV63Sha256=baselineSha);file.write_text(json.dumps(data,indent=2)+'\n')
    (root/'Acceptance/Data_FrontSightRemovalV64.json').write_text(json.dumps(dict(sha256=sha,removedComponentVertices=len(group),removedComponentExtentM=extent,originalSteelMeshRetainedForEditing=True,wartimeEquipmentClaim=False),indent=2)+'\n')
    print(json.dumps(dict(source=str(blend),glb=str(glb),sha256=sha,wholeReferenceAccepted=False),indent=2),flush=True)


if __name__=='__main__':Main()
