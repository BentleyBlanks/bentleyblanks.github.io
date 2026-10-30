"""Editable layered wear on retained V99 surfaces; no mesh or UV changes."""
import bpy,hashlib,importlib.util,json,math,os
from pathlib import Path

repo=Path(__file__).resolve().parents[2]
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_WEAR101_ROOT',str(base/'SurfaceV101')))
folder=root/'Textures/HighSurfaceV101'
for directory in [folder,root/'Acceptance',root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('TYPE94_WEAR101_PHASE','Prepare');assert phase in ['Prepare','Apply','Verify']and not bpy.data.filepath
source=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV99.json').read_text())
destination=root/'Scene_Type94TanketteHighWearV101.blend'

def Hash(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def Save(file,data):Path(file).write_text(json.dumps(data,indent=2)+'\n')
def Open(file):
    bpy.ops.wm.open_mainfile(filepath=str(file));assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
def Export(file):
    bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    spec=importlib.util.spec_from_file_location('Wear101Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ExportGltf(file)
def Value(mesh,name,face,default=0):
    attr=mesh.attributes.get(name)
    if not attr:return default
    if attr.domain=='FACE':return float(attr.data[face.index].value)
    if attr.domain=='POINT':return sum(float(attr.data[i].value)for i in face.vertices)/len(face.vertices)
    if attr.domain=='CORNER':return sum(float(attr.data[i].value)for i in face.loop_indices)/len(face.loop_indices)
    raise ValueError((name,attr.domain))

if phase=='Prepare':
    assert Hash(source['sourceBlend'])==source['sourceBlendSha256']and Hash(source['sourceGlb'])==source['sha256'];Open(source['sourceBlend'])
    inputs={};oldMasks={};roles={};seen=set();asset=bpy.data.objects['Type94Tankette']
    for role in ['Paint','Track','Steel','Rubber']:
        material=bpy.data.materials['Material_Type94'+role];size=dict(Paint=4096,Track=2048,Steel=2048,Rubber=1024)[role]
        for channel in ['Base','Orm','Normal']:
            image=material.node_tree.nodes['Baked '+channel].image;assert image.packed_file
            file=folder/('Texture_Type94'+role+channel+'InputV101.png');file.write_bytes(image.packed_file.data);inputs[role+channel]=dict(file=str(file),sha256=Hash(file))
        if role=='Paint':
            for label in ['Loss','Core','Scuff','Scratch']:
                node=material.node_tree.nodes.get('Editable V92 '+label);assert node and node.image.packed_file
                file=folder/('Texture_Type94Paint'+label+'RetainedV101.png');file.write_bytes(node.image.packed_file.data);oldMasks[label]=str(file)
        if role=='Rubber':continue
        edges=[];triangles=[];attributeRows=[]
        for obj in sorted(asset.children_recursive,key=lambda o:o.name):
            if obj.type!='MESH'or material not in list(obj.data.materials)or (role,obj.data.as_pointer())in seen:continue
            mesh=obj.data;seen.add((role,mesh.as_pointer()));mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
            byFace={};byEdge=[[]for edge in mesh.edges]
            attributeRows.append(dict(owner=obj.name,attributes=[a.name for a in mesh.attributes],bounds=[list(v)for v in obj.bound_box]))
            for tri in mesh.loop_triangles:
                face=mesh.polygons[tri.polygon_index]
                if mesh.materials[face.material_index]!=material:continue
                uvTriangle=[list(uv[i].uv)for i in tri.loops];byFace.setdefault(face.index,[]).append(uvTriangle)
                points=[obj.matrix_world@mesh.vertices[i].co for i in tri.vertices]
                if (role!='Paint'or face.area>.00012)and (points[1]-points[0]).cross(points[2]-points[0]).length>2e-9:
                    triangles.append(dict(owner=obj.name,pointsWorldM=[list(p)for p in points],uv=uvTriangle,exposure=Value(mesh,'WearZone',face,.08),contact=Value(mesh,'TrackContact',face,0)))
            for face in mesh.polygons:
                if mesh.materials[face.material_index]!=material:continue
                loops=list(face.loop_indices);points=[uv[i].uv.copy()for i in loops]
                uvArea=abs(sum(a.x*b.y-a.y*b.x for a,b in zip(points,points[1:]+points[:1])))/2;density=size*math.sqrt(uvArea/max(face.area,1e-18))
                for j,index in enumerate(loops):byEdge[mesh.loops[index].edge_index].append((face,points[j],points[(j+1)%len(points)],density))
            for edge,adjacent in zip(mesh.edges,byEdge):
                if len(adjacent)!=2:continue
                a,b=adjacent;n1,n2=a[0].normal,b[0].normal;p,q=(mesh.vertices[i].co for i in edge.vertices);length=(q-p).length
                if length<(.006 if role=='Paint'else .0015)or n1.length_squared<.5 or n2.length_squared<.5:continue
                if not math.radians(12)<n1.angle(n2)<math.radians(150):continue
                mid=(p+q)/2
                if -n1.dot(b[0].center-mid)-n2.dot(a[0].center-mid)<1e-8:continue
                edges.append(dict(owner=obj.name,lengthM=length,exposure=max(Value(mesh,'WearZone',r[0],.08)for r in adjacent),segments=[dict(uvA=list(r[1]),uvB=list(r[2]),pixelsPerMetre=r[3],clipUvTriangles=byFace[r[0].index])for r in adjacent]))
        roles[role]=dict(edges=edges,triangles=triangles,attributes=attributeRows,size=size)
    Save(root/'Acceptance/Data_WearPreparationV101.json',dict(reference=source,inputs=inputs,oldMasks=oldMasks,roles=roles,geometryUvAndRigChanged=False))
    print(json.dumps({r:dict(edges=len(v['edges']),triangles=len(v['triangles']),contactValues=sorted(set(round(t['contact'],4)for t in v['triangles'])))for r,v in roles.items()}),flush=True)
elif phase=='Apply':
    prep=json.loads((root/'Acceptance/Data_WearPreparationV101.json').read_text());raster=json.loads((root/'Acceptance/Data_WearRasterV101.json').read_text());assert Hash(source['sourceBlend'])==source['sourceBlendSha256'];Open(source['sourceBlend'])
    for role,record in raster['roles'].items():
        tree=bpy.data.materials['Material_Type94'+role].node_tree;frame=tree.nodes.new('NodeFrame');frame.name='Editable V101 '+role+' layered wear';frame.label='Broken coating / dark old steel / directional contact polish'
        for channel,record in record['outputs'].items():
            old=tree.nodes['Baked '+channel].image;archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable V101 original '+channel;archive.image=old;archive.parent=frame;assert Hash(record['file'])==record['sha256']
            image=bpy.data.images.load(record['file'],check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
            for node in tree.nodes:
                if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=image
        for label,file in raster['roles'][role]['masks'].items():
            image=bpy.data.images.load(file,check_existing=False);image.colorspace_settings.name='Non-Color';image.pack();node=tree.nodes.new('ShaderNodeTexImage');node.name='Editable V101 '+label;node.image=image;node.parent=frame
    scene=bpy.context.scene;scene['SurfaceStudyRevision']='WearV101';scene['WearV101PlacementInferred']=True;scene['WearV101PaintLossHeightM']=.000035;scene['WholeReferenceAccepted']=False
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
else:
    Open(destination);scene=bpy.context.scene;assert scene.get('SurfaceStudyRevision')=='WearV101';asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];assert len(objects)==296 and sum(o.type=='MESH'for o in objects)==240
    for role,size in [('Paint',4096),('Track',2048),('Steel',2048),('Rubber',1024)]:
        for channel in ['Base','Orm','Normal']:
            image=bpy.data.materials['Material_Type94'+role].node_tree.nodes['Baked '+channel].image;assert image.packed_file and tuple(image.size)==(size,size)and image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color')
    output=root/'Exports/Model_Type94TanketteHighWearV101.glb';Export(output);Open(destination);reexport=root/'Exports/Model_Type94TanketteHighWearReexportV101.glb';Export(reexport)
    from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
    report=dict(sourceBlend=str(destination),sourceBlendSha256=Hash(destination),sourceGlb=str(output),sha256=Hash(output),sourceReexportSha256=Hash(reexport),exporterTangentRoundingDigits=ROUNDING_DIGIT)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(output));assert len(bpy.data.objects)==296 and sum(o.type=='MESH'for o in bpy.data.objects)==240 and sum(i.source=='FILE'for i in bpy.data.images)==12
    report['actualGlbImportPassed']=True;Save(root/'Acceptance/Data_WearSourceReopenV101.json',report)
print('TYPE94_WEAR101_'+phase.upper()+'_COMPLETE',flush=True)
