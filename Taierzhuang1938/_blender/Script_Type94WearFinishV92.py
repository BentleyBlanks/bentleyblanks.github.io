"""A reversible finish pass on the immutable V91 geometry and UVs."""
import bpy,hashlib,importlib.util,json,math,os
from pathlib import Path

repo=Path(__file__).resolve().parents[2]
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_FINISH_ROOT',str(base/'SurfaceV92')))
folder=root/'Textures/HighSurfaceV92Preview'
for directory in [folder,root/'Acceptance',root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('TYPE94_FINISH_PHASE','Prepare');assert phase in ['Prepare','Apply','Verify']and not bpy.data.filepath
destination=root/'Scene_Type94TanketteHighSurfaceV92Preview.blend'

def Hash(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def Save(file,data):Path(file).write_text(json.dumps(data,indent=2)+'\n')
def Export(file):
    bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    fileSpec=importlib.util.spec_from_file_location('Finish92Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py')
    module=importlib.util.module_from_spec(fileSpec);fileSpec.loader.exec_module(module);module.ExportGltf(file)

if phase=='Prepare':
    manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV91.json').read_text())
    assert Hash(manifest['sourceBlend'])==manifest['sourceBlendSha256']
    assert Hash(manifest['sourceGlb'])==manifest['sha256']
    bpy.ops.wm.open_mainfile(filepath=manifest['sourceBlend']);scene=bpy.context.scene
    assert scene.get('BlenderMcpTask')=='Type94Tankette'
    paint=bpy.data.materials['Material_Type94Paint'];inputs={}
    for channel in ['Base','Orm','Normal']:
        image=paint.node_tree.nodes['Baked '+channel].image;assert image.packed_file
        file=folder/('Texture_Type94Paint'+channel+'InputV92.png');file.write_bytes(image.packed_file.data)
        inputs[channel]=dict(file=str(file),sha256=Hash(file))
    edges=[];triangles=[];seen=set()
    for obj in bpy.data.objects['Type94Tankette'].children_recursive:
        if obj.type!='MESH'or paint not in list(obj.data.materials)or obj.data.as_pointer()in seen:continue
        mesh=obj.data;seen.add(mesh.as_pointer());mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        byFace={};byEdge=[[]for edge in mesh.edges]
        for tri in mesh.loop_triangles:
            face=mesh.polygons[tri.polygon_index]
            if mesh.materials[face.material_index]!=paint:continue
            uvTriangle=[list(uv[i].uv)for i in tri.loops];byFace.setdefault(face.index,[]).append(uvTriangle)
            points=[obj.matrix_world@mesh.vertices[i].co for i in tri.vertices]
            if face.area>.00012 and (points[1]-points[0]).cross(points[2]-points[0]).length>2e-7:
                exposure=float(mesh.attributes['WearZone'].data[face.index].value)if mesh.attributes.get('WearZone')else .08
                triangles.append(dict(owner=obj.name,pointsWorldM=[list(p)for p in points],uv=uvTriangle,exposure=exposure))
        for face in mesh.polygons:
            if mesh.materials[face.material_index]!=paint:continue
            loops=list(face.loop_indices);points=[uv[i].uv.copy()for i in loops]
            uvArea=abs(sum(a.x*b.y-a.y*b.x for a,b in zip(points,points[1:]+points[:1])))/2
            density=4096*math.sqrt(uvArea/max(face.area,1e-18))
            for j,index in enumerate(loops):
                byEdge[mesh.loops[index].edge_index].append((face,points[j],points[(j+1)%len(points)],density))
        for edge,adjacent in zip(mesh.edges,byEdge):
            if len(adjacent)!=2:continue
            a,b=adjacent;n1,n2=a[0].normal,b[0].normal
            p,q=(mesh.vertices[i].co for i in edge.vertices);length=(q-p).length
            if length<.008 or n1.length_squared<.5 or n2.length_squared<.5:continue
            if not math.radians(24)<n1.angle(n2)<math.radians(150):continue
            mid=(p+q)/2
            if -n1.dot(b[0].center-mid)-n2.dot(a[0].center-mid)<1e-8:continue
            exposure=max(mesh.attributes['WearZone'].data[row[0].index].value for row in adjacent)if mesh.attributes.get('WearZone')else .08
            edges.append(dict(owner=obj.name,lengthM=length,exposure=float(exposure),segments=[dict(uvA=list(row[1]),uvB=list(row[2]),pixelsPerMetre=row[3],clipUvTriangles=byFace[row[0].index])for row in adjacent]))
    Save(root/'Acceptance/Data_FinishPreparationV92.json',dict(reference=manifest,inputs=inputs,edges=edges,paintTriangles=triangles,geometryAndUvChanged=False))
    scene['SurfaceStudyRevision']='SurfaceV92Preview';scene['WearV92PlacementInferred']=True
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    print(json.dumps(dict(physicalEdges=len(edges),paintTriangles=len(triangles))),flush=True)
elif phase=='Apply':
    preparation=json.loads((root/'Acceptance/Data_FinishPreparationV92.json').read_text())
    source=preparation['reference']['sourceBlend']
    assert Hash(source)==preparation['reference']['sourceBlendSha256']
    bpy.ops.wm.open_mainfile(filepath=source);scene=bpy.context.scene
    scene['SurfaceStudyRevision']='SurfaceV92Preview';scene['WearV92PlacementInferred']=True
    tree=bpy.data.materials['Material_Type94Paint'].node_tree
    report=json.loads((root/'Acceptance/Data_FinishRasterV92.json').read_text())
    frame=tree.nodes.new('NodeFrame');frame.name='Editable V92 exposed steel and handling wear';frame.label='Metric chips / oxidized transition / polished steel / shallow scratches'
    for channel in ['Base','Orm','Normal']:
        old=tree.nodes['Baked '+channel].image
        archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable V92 original '+channel;archive.image=old;archive.parent=frame
        file=Path(report['outputs'][channel]['file']);assert Hash(file)==report['outputs'][channel]['sha256']
        image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
        for node in tree.nodes:
            if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=image
    for label,file in report['masks'].items():
        image=bpy.data.images.load(file,check_existing=False);image.colorspace_settings.name='Non-Color';image.pack()
        node=tree.nodes.new('ShaderNodeTexImage');node.name='Editable V92 '+label;node.image=image;node.parent=frame
    scene['WearV92Applied']=True;scene['WearV92Scope']=report['scope'];scene['WearV92PaintLossHeightM']=.00002
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene;assert scene.get('WearV92Applied')
    asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];meshes=[o for o in objects if o.type=='MESH']
    assert len(objects)==293 and len(meshes)==238
    assert not any(o.name.startswith('Temporary_')for o in objects)
    runtimeImages={}
    for role in ['Paint','Track','Steel','Rubber']:
        for channel in ['Base','Orm','Normal']:
            image=bpy.data.materials['Material_Type94'+role].node_tree.nodes['Baked '+channel].image
            assert image.packed_file and image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color')
            assert tuple(image.size)==(dict(Paint=4096,Track=2048,Steel=2048,Rubber=1024)[role],)*2
            runtimeImages[role+channel]=dict(size=list(image.size),packed=True,colorspace=image.colorspace_settings.name)
    tree=bpy.data.materials['Material_Type94Paint'].node_tree
    assert all(tree.nodes['Editable V92 '+name].image.packed_file for name in ['Core','Scuff','Scratch','Primer','Height','Loss'])
    Export(root/'Exports/Model_Type94TanketteHighSurfaceV92Preview.glb')
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    Export(root/'Exports/Model_Type94TanketteHighSurfaceV92SourceReexport.glb')
    from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
    report=dict(passed=True,sourceBlend=str(destination),sourceBlendSha256=Hash(destination),meshOwners=len(meshes),poseNodes=len(objects),runtimeImages=runtimeImages,editableWearMasks=6,sourceReexportSha256=Hash(root/'Exports/Model_Type94TanketteHighSurfaceV92SourceReexport.glb'),exporterTangentRoundingDigits=ROUNDING_DIGIT)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'Exports/Model_Type94TanketteHighSurfaceV92Preview.glb'))
    importedMeshes=[o for o in bpy.data.objects if o.type=='MESH'];images=[img for img in bpy.data.images if img.source=='FILE']
    assert len(importedMeshes)==238 and len(bpy.data.objects)==293 and len(images)==12 and all(i.packed_file for i in images)
    report.update(actualImportedMeshOwners=len(importedMeshes),actualImportedPoseNodes=len(bpy.data.objects),actualImportedImages=len(images))
    Save(root/'Acceptance/Data_FinishSourceReopenV92.json',report)
print('TYPE94_FINISH92_'+phase.upper()+'_COMPLETE',flush=True)
