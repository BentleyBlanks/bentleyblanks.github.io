"""Museum-visible coated road-wheel annuli; substrate identity is unverified."""
import bpy,hashlib,importlib.util,json,os,re
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
root=Path(os.environ['TYPE94_SOURCE_ROOT']);revision=os.environ['TYPE94_SURFACE_REVISION'];assert revision=='SurfaceV66Preview'
source=root/('Scene_Type94TanketteHigh'+revision+'.blend');assert Path(bpy.data.filepath)==source
phase=os.environ.get('TYPE94_TYRE_FINISH_PHASE','Extract');assert phase in ['Extract','Apply'];scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
material=bpy.data.materials['Material_Type94Rubber'];tree=material.node_tree;tint=(.092,.102,.067,1);roughness=.48
if phase=='Extract':
    faces=[];owners=[];coatedArea=0
    for obj in scene.objects:
        if obj.type!='MESH' or material not in list(obj.data.materials):continue
        mesh=obj.data;mask=mesh.attributes.get('TyreFaceCoating')or mesh.attributes.new('TyreFaceCoating','FLOAT','FACE');slots={i for i,m in enumerate(mesh.materials)if m==material};road=re.fullmatch(r'Wheel_(Left|Right)_Road[0-3]_Tyre',obj.name);sign=-1 if road and road.group(1)=='Left'else 1;count=0
        for face in mesh.polygons:
            coated=bool(road and face.material_index in slots and sign*face.normal.x>.99999 and abs(face.center.x-sign*.0525)<2e-6)
            mask.data[face.index].value=float(coated)
            if face.material_index not in slots:continue
            faces.append(dict(owner=obj.name,coated=coated,uv=[list(mesh.uv_layers.active.data[i].uv)for i in face.loop_indices]))
            if coated:count+=1;coatedArea+=face.area
        if road:assert count==48;owners.append(dict(owner=obj.name,faces=count))
    assert len(owners)==8
    frame=tree.nodes['Editable physical surface authoring'];attribute=tree.nodes.get('Visible tyre annulus coating mask')or tree.nodes.new('ShaderNodeAttribute');attribute.name='Visible tyre annulus coating mask';attribute.attribute_name='TyreFaceCoating';attribute.parent=frame
    for name,original,value in [('Editable museum tyre-face pigment','Carbon rubber and embedded dust',tint),('Editable museum tyre-face roughness','Rubber surface roughness',(roughness,)*3+(1,))]:
        mix=tree.nodes.get(name)or tree.nodes.new('ShaderNodeMixRGB');mix.name=name;mix.parent=frame;tree.links.new(attribute.outputs['Fac'],mix.inputs[0]);tree.links.new(tree.nodes[original].outputs[0],mix.inputs[1]);mix.inputs[2].default_value=value
    scene['TyreFaceFinishInferred']=True;scene['TyreFaceSubstrateEstablished']=False
    record=dict(schema='Type94TyreFaceFinishV1',revision=revision,size=1024,tintLinearRgb=list(tint[:3]),roughness=roughness,owners=owners,coatedFaces=sum(o['faces']for o in owners),coatedAreaM2=coatedArea,faces=faces,geometrySourceSha256=scene['SurfaceGeometryGlbSha256'],scope='Only outward planar road-wheel annuli receive an inferred opaque olive finish matching selected museum photos. Black tread/crown retained. No rubber-overpaint versus metal-retainer substrate identification or wartime finish claim.')
    (root/'Acceptance/Data_TyreFaceUvV66.json').write_text(json.dumps(record,indent=2)+'\n');bpy.ops.wm.save_as_mainfile(filepath=str(source));print(json.dumps(dict(tyreCoatingOwners=len(owners),coatedFaces=record['coatedFaces'],coatedAreaM2=coatedArea)),flush=True)
else:
    report=json.loads((root/'Acceptance/Data_TyreFaceBakeV66.json').read_text());folder=root/'Textures'/('High'+revision)
    for name,sha in report['inputHashes'].items():assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==sha
    for channel in ['Base','Orm']:
        old=tree.nodes['Baked '+channel].image;image=bpy.data.images.load(report['outputs'][channel]['file'],check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
        for node in tree.nodes:
            if node.type=='TEX_IMAGE'and node.image==old:node.image=image
        if old.users==0:bpy.data.images.remove(old)
        image.name=Path(report['outputs'][channel]['file']).stem
    scene['TyreFaceFinishApplied']=True;scene['TyreFaceFinishScope']=report['scope'];bpy.ops.wm.save_as_mainfile(filepath=str(source));bpy.ops.object.select_all(action='DESELECT')
    asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('TyreFinishExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);exporter.ExportGltf(root/'Exports'/('Model_Type94TanketteHigh'+revision+'.glb'));print('TYPE94_TYRE_FACE_FINISH_PACKED_AND_EXPORTED',flush=True)
