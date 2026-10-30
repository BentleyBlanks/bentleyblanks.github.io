"""Finish the reviewed grey source, preserve the high source, derive a game GLB.
Run after Script_IsuzuType94TruckBuild.py and Script_IsuzuType94TruckTextures.py.
All source and backups stay in OneDrive. Runtime keeps independent rigid pivots.
"""
import bpy,math,json,random,importlib.util,contextlib,io,os,hashlib
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion

WORKSPACE=Path(os.environ.get('ISUZU_WORKSPACE') or bpy.context.scene.get('IsuzuWorkspace',Path.cwd())).resolve()
if not (WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckPbr.py').is_file():raise RuntimeError('Invalid explicit Isuzu PBR workspace: '+str(WORKSPACE))
SOURCE=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck')
QA=WORKSPACE/'tmp/IsuzuType94Truck';OUT=WORKSPACE/'Taierzhuang1938/Model/IsuzuType94Truck'
spec=importlib.util.spec_from_file_location('IsuzuTruckBuild',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckBuild.py'))
B=importlib.util.module_from_spec(spec);spec.loader.exec_module(B)
B.ROOT=bpy.data.objects['IsuzuType94Truck'];B.MATS={m.name.removeprefix('Material_Isuzu'):m for m in bpy.data.materials if m.name.startswith('Material_Isuzu')}
ROOT=B.ROOT
cabSpec=importlib.util.spec_from_file_location('IsuzuCabLod',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckCabLod.py'));cabLod=importlib.util.module_from_spec(cabSpec);cabSpec.loader.exec_module(cabLod)
weatherSpec=importlib.util.spec_from_file_location('IsuzuWeathering',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckWeathering.py'));weathering=importlib.util.module_from_spec(weatherSpec);weatherSpec.loader.exec_module(weathering)
metalSpec=importlib.util.spec_from_file_location('IsuzuMetalWear',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckMetalWear.py'));metalWear=importlib.util.module_from_spec(metalSpec);metalSpec.loader.exec_module(metalWear)
STABLE_RUNTIME_FILE=OUT/'Data_StableRuntimeParts.json'
STABLE_RUNTIME=json.loads(STABLE_RUNTIME_FILE.read_text(encoding='utf8'))
RIM_PROFILE_SEGMENTS=(24,24,24,32,32,24,24,24)
COLLAR_PROFILE_SEGMENTS=(8,8,8,8)
CAB_GLASS_BASE_COLOR=(.96,.985,.975,1)
CAB_GLASS_ROUGHNESS=.035
CAB_GLASS_TRANSMISSION=1.0
CAB_GLASS_IOR=1.52
ENAMEL_ROUGHNESS_FACTOR=1.0
ENAMEL_COAT_WEIGHT=.28
ENAMEL_COAT_ROUGHNESS=.55


def SampleRuntimeRims(sourceMeshes,originalNames,collars=False):
    """Sample the current high source, preserving its complete rim section.

    The two outside lip rings get32uniform samples; six other section rings get
    24. This fits the existing80ktriangle budget without moving source contours
    or asking merged collapse reduction to preserve a narrow rolled section.
    """
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();parts={}
    circumference=80 if collars else 96;profile=COLLAR_PROFILE_SEGMENTS if collars else RIM_PROFILE_SEGMENTS;sectionCount=len(profile)
    for obj in sourceMeshes:
        name=originalNames[obj]
        selected=name.startswith('Wheel_') and name.endswith('_InnerDisc') if collars else name.endswith('_Rim') and (name.startswith('Wheel_') or name=='SpareWheel_Rim')
        if not selected:continue
        if len(obj.data.vertices)!=sectionCount*circumference or len(obj.data.polygons)!=sectionCount*circumference:raise RuntimeError('Ring source layout changed: '+name)
        sourceUv=obj.data.uv_layers.active
        if sourceUv is None:raise RuntimeError('Rim source UV layer is missing: '+name)
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
        try:
            if len(mesh.vertices)!=sectionCount*circumference:raise RuntimeError('Ring source evaluation changed vertex layout: '+name)
            normals=[None]*len(mesh.vertices)
            for loop,normal in zip(mesh.loops,mesh.corner_normals):
                n=normal.vector.copy();old=normals[loop.vertex_index]
                if old is not None and old.angle(n)>math.radians(.01):raise RuntimeError('Rim split normal needs an explicit sampling rule: '+name)
                normals[loop.vertex_index]=n
            selected=[];rings=[]
            for row,count in enumerate(profile):
                rings.append(len(selected));selected.extend(row*circumference+k*(circumference//count) for k in range(count))
            faces=[]
            for row,na in enumerate(profile):
                nextRow=(row+1)%sectionCount;nb=profile[nextRow];a=b=0
                while a<na or b<nb:
                    ca=rings[row]+a%na;cb=rings[nextRow]+b%nb;ta=(a+1)/na;tb=(b+1)/nb
                    if abs(ta-tb)<1e-9:
                        aa=rings[row]+(a+1)%na;bb=rings[nextRow]+(b+1)%nb;faces.extend([(row,(ca,aa,bb)),(row,(ca,bb,cb))]);a+=1;b+=1
                    elif ta<tb:faces.append((row,(ca,rings[row]+(a+1)%na,cb)));a+=1
                    else:faces.append((row,(ca,rings[nextRow]+(b+1)%nb,cb)));b+=1
            if obj.get('RingReverseWinding'):faces=[(row,tuple(reversed(face))) for row,face in faces]
            matrix=obj.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed()
            part={'vertices':[],'normals':[],'uvs':[],'faces':[]}
            for row,face in faces:
                ids=[selected[i] for i in face];points=[mesh.vertices[i].co for i in ids];normal=(points[1]-points[0]).cross(points[2]-points[0]);first=len(part['vertices']);base=ids[0]%circumference;half=circumference//2
                middle=base+sum(((i%circumference-base+half)%circumference)-half for i in ids)/3
                if normal.length_squared<1e-16:raise RuntimeError('Degenerate analytical rim triangle: '+name)
                for i,p in zip(ids,points):
                    # New triangulation can change the dominant face normal.
                    # Read the source face corner on the triangle's side of
                    # this angular boundary instead of choosing a new UV axis.
                    angle=i%circumference;direction=((middle-angle+half)%circumference)-half;segment=angle if direction>=0 else (angle-1)%circumference;sourceFace=obj.data.polygons[row*circumference+segment]
                    li=next((li for li in sourceFace.loop_indices if obj.data.loops[li].vertex_index==i),None)
                    if li is None:raise RuntimeError('Rim source face/corner layout changed: '+name)
                    part['vertices'].append(tuple(matrix@p));part['normals'].append(tuple((normalMatrix@normals[i]).normalized()));part['uvs'].append(tuple(sourceUv.data[li].uv))
                part['faces'].append((first,first+1,first+2))
            if len(part['faces'])!=2*sum(profile):raise RuntimeError('Unexpected analytical ring triangle count: '+name)
            parts[name]=part
        finally:ev.to_mesh_clear()
    if len(parts)!=(6 if collars else 7):raise RuntimeError('Missing high-source rings for analytical runtime sampling')
    return parts


def MakeCollarBudgetProxy(obj):
    """Keep unrelated budget collapse inputs stable while replacing collars.

    This temporary proxy reconstructs the previous shallow collar procedurally;
    it is never saved or exported as the final collar. Current high-source
    geometry/normals/UVs are sampled before this step and restored afterward.
    No historical runtime file or frozen vertex payload is a build dependency.
    """
    x,y,z=obj.parent['SourceWheelRawCentreM'];sign=-1 if x<0 else 1
    matrix=obj.matrix_world.copy()
    temp=B.RingX('RuntimeCollarBudgetProxy',(x,y,z),[(sign*a,r) for a,r in [(.102,.104),(.115,.128),(.110,.141),(.095,.126)]],'Paint',None,80)
    temp.matrix_world=matrix
    # Reproduce the original two float32 authoring steps, not a single analytic
    # multiply: a1ulp change can alter merged collapse choices elsewhere.
    for vertex in temp.data.vertices:
        point=vertex.co;point.x=x+(point.x-x)*(.1524/.25);yy=point.y-y;zz=point.z-z;radius=math.hypot(yy,zz)
        if radius>1e-8:
            newRadius=radius*(.2864/.266);point.y=y+yy*newRadius/radius;point.z=z+zz*newRadius/radius
    B.AssignUV([temp]);tri=temp.modifiers.new('ExportTriangulation','TRIANGULATE');tri.keep_custom_normals=True
    bpy.context.view_layer.update();ev=temp.evaluated_get(bpy.context.evaluated_depsgraph_get());evaluated=ev.to_mesh();mesh=evaluated.copy();ev.to_mesh_clear();old=temp.data;bpy.data.objects.remove(temp,do_unlink=True);bpy.data.meshes.remove(old)
    temp=bpy.data.objects.new('RuntimeReduction',mesh);bpy.context.collection.objects.link(temp);temp.matrix_world=matrix;return temp


def MakeHubCapBudgetProxy(obj):
    """Isolate the new hex cover from unrelated global collapse choices.

    Reconstruct the prior circular input procedurally;only the current six-flat
    source recipe is retained in the final model. No historical GLB dependency.
    """
    x,y,z=obj.parent['SourceWheelRawCentreM'];sign=-1 if x<0 else 1
    temp=B.Cylinder('RuntimeHubCapBudgetProxy',(x+sign*.163,y,z),.067,.022,'Paint','X',None,48)
    for vertex in temp.data.vertices:
        point=vertex.co;point.x=x+(point.x-x)*(.1524/.25);yy=point.y-y;zz=point.z-z;radius=math.hypot(yy,zz)
        if radius>1e-8:
            newRadius=radius*(.2864/.266);point.y=y+yy*newRadius/radius;point.z=z+zz*newRadius/radius
    B.AssignUV([temp]);tri=temp.modifiers.new('ExportTriangulation','TRIANGULATE');tri.keep_custom_normals=True;bpy.context.view_layer.update();ev=temp.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();copy=mesh.copy();ev.to_mesh_clear();old=temp.data;bpy.data.objects.remove(temp,do_unlink=True);bpy.data.meshes.remove(old);result=bpy.data.objects.new('RuntimeReduction',copy);bpy.context.collection.objects.link(result);result.matrix_world=obj.matrix_world.copy();return result


def SampleWheelNutExtents(sourceMeshes,originalNames):
    """Retain the actual evaluated high-source nut thickness before reduction."""
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();parts={}
    for obj in sourceMeshes:
        name=originalNames[obj]
        if not (name.startswith('Wheel_') and '_Lug' in name):continue
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
        try:
            values=[(obj.matrix_world@v.co).x for v in mesh.vertices];parts[name]=(min(values),max(values))
        finally:ev.to_mesh_clear()
    if len(parts)!=48:raise RuntimeError('All48high-source wheel nuts are required for axial sampling')
    return parts


def RestoreWheelNutExtents(gameRoot,sourceBounds):
    """Correct axial loss on existing reduced triangles, without adding faces.

    These isolated steel meshes contain only their eight wheel nuts. Preserve
    evaluated topology, restore source axial min/max, transform corner normals
    by the inverse transpose and reproject physical steel UVs on each triangle.
    Source geometry and every non-nut runtime mesh are untouched.
    """
    names={int(k):v for k,v in gameRoot['SourcePartNames'].items()};rows=[]
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    for obj in list(gameRoot.children_recursive):
        if obj.type!='MESH' or obj.get('MaterialZone')!='Steel':continue
        ev=obj.evaluated_get(deps);evaluated=ev.to_mesh();attribute=evaluated.attributes.get('_SOURCE_PART_ID')
        labels=[names[int(round(v.value))] for v in attribute.data] if attribute else [];present=set(labels)&set(sourceBounds)
        if not present:ev.to_mesh_clear();continue
        if len(present)!=8 or set(labels)!=present:ev.to_mesh_clear();raise RuntimeError('Wheel nut axial repair requires an isolated eight-nut mesh: '+obj.name)
        mesh=evaluated.copy();oldNormals=[n.vector.copy() for n in evaluated.corner_normals];ev.to_mesh_clear();matrix=obj.matrix_world.copy();inverse=matrix.inverted();normalMatrix=matrix.to_3x3().inverted().transposed();normalInverse=matrix.to_3x3().transposed();factors={}
        for name in sorted(present):
            indices=[i for i,n in enumerate(labels) if n==name];world={i:matrix@mesh.vertices[i].co for i in indices};low=min(p.x for p in world.values());high=max(p.x for p in world.values());targetLow,targetHigh=sourceBounds[name]
            if high-low<1e-6:raise RuntimeError('Completely flat wheel nut needs an explicit runtime topology: '+name)
            factor=(targetHigh-targetLow)/(high-low)
            for i,p in world.items():p.x=targetLow+(p.x-low)*factor;mesh.vertices[i].co=inverse@p;factors[i]=factor
            rows.append({'name':name,'sourceAxialDepthM':targetHigh-targetLow,'oldRuntimeAxialDepthM':high-low,'sourceMinXM':targetLow,'sourceMaxXM':targetHigh})
        mesh.update();uv=mesh.uv_layers.active;normals=[None]*len(mesh.loops)
        for face in mesh.polygons:
            points=[matrix@mesh.vertices[i].co for i in face.vertices];geometric=(points[1]-points[0]).cross(points[2]-points[0])
            if geometric.length_squared<1e-20:raise RuntimeError('Nut axial correction produced a collapsed triangle')
            geometric.normalize();axis=max(range(3),key=lambda i:abs(geometric[i]))
            for li in face.loop_indices:
                vi=mesh.loops[li].vertex_index;n=normalMatrix@oldNormals[li];n.x/=factors[vi]
                if n.length_squared<1e-16:n=geometric.copy()
                normals[li]=tuple((normalInverse@n.normalized()).normalized());p=matrix@mesh.vertices[vi].co;u,v=(p.y,p.z) if axis==0 else ((p.x,p.z) if axis==1 else (p.x,p.y));uv.data[li].uv=(u/.35,v/.35)
        mesh.normals_split_custom_set(normals);old=obj.data;mesh.name=old.name+'_AxialCorrected';obj.modifiers.clear();obj.data=mesh;bpy.data.meshes.remove(old)
    if len(rows)!=48:raise RuntimeError('Not all48wheel-nut axial extents were corrected')
    gameRoot['RuntimeWheelNutAxialParts']=[r['name'] for r in rows]
    gameRoot['RuntimeWheelNutAxialMethod']='Current evaluated high-source axial bounds restored on existing reduced nut triangles; inverse-transpose normals and physical steel UV projection. Radial coordinates and triangle count retained; node scales and source nut placement unchanged.'
    return rows


def ValidateStableRuntimeSources():
    """Never reuse a derived island after its editable source has changed."""
    for name,part in STABLE_RUNTIME['parts'].items():
        obj=bpy.data.objects.get(name)
        if obj is None or obj.type!='MESH':raise RuntimeError('Stable runtime source is missing: '+name)
        points=sorted({tuple(round(v,6) for v in obj.matrix_world@vertex.co) for vertex in obj.data.vertices})
        digest=hashlib.sha256(json.dumps(points,separators=(',',':')).encode()).hexdigest()
        if digest!=part['sourcePositionSha256']:raise RuntimeError('Stable runtime source changed; explicitly regenerate its derived recipe: '+name)
    ROOT['StableRuntimePartNames']=list(STABLE_RUNTIME['parts'])
    ROOT['StableRuntimeBaselineSha256']=STABLE_RUNTIME['baselineSha256']


def RestoreStableRuntimeIslands(gameRoot,analyticRims=None,analyticCollars=None,surfaceRecipes=None):
    """Restore verified islands and fresh rim samples after budget reduction.

    The surrounding evaluated geometry, corner normals, UVs and part labels are
    copied directly. Fingerprinted unchanged-source islands reuse their
    verified recipe; rim samples are generated from the current high source.
    """
    recipes={n:p for n,p in STABLE_RUNTIME['parts'].items() if not p.get('postExport',False)};recipes.update(analyticRims or {});recipes.update(analyticCollars or {});previousRecipes=set(recipes);recipes.update(surfaceRecipes or {})
    names={int(k):v for k,v in gameRoot['SourcePartNames'].items()};partIds={v:k for k,v in names.items()};restored=[]
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    for obj in list(gameRoot.children_recursive):
        if obj.type!='MESH':continue
        ev=obj.evaluated_get(deps);evaluated=ev.to_mesh();attribute=evaluated.attributes.get('_SOURCE_PART_ID')
        present={names[int(round(v.value))] for v in attribute.data}&set(recipes) if attribute else set()
        if not present:ev.to_mesh_clear();continue
        evaluated.calc_loop_triangles();vertices=[];faces=[];uvs=[];normals=[];labels=[];smooth=[];materials=[];uv=evaluated.uv_layers.active
        # Retain the original smooth fans outside a replaced rim. Deindexing
        # those unrelated rings changes Blender's packed custom-normal space.
        preserveSharing=bool(present&(set(analyticRims or {})|set(analyticCollars or {}))) or not bool(present&previousRecipes);vertexMap={}
        for triangle in evaluated.loop_triangles:
            partId=int(round(attribute.data[triangle.vertices[0]].value))
            if names[partId] in present:continue
            face=[]
            for vi,li in zip(triangle.vertices,triangle.loops):
                if not preserveSharing or vi not in vertexMap:
                    index=len(vertices);vertices.append(tuple(evaluated.vertices[vi].co));labels.append(partId)
                    if preserveSharing:vertexMap[vi]=index
                else:index=vertexMap[vi]
                face.append(index);normals.append(tuple(evaluated.corner_normals[li].vector));uvs.append(tuple(uv.data[li].uv))
            faces.append(tuple(face));smooth.append(evaluated.polygons[triangle.polygon_index].use_smooth);materials.append(triangle.material_index)
        sharp=evaluated.attributes.get('sharp_edge');sharpEdges=set()
        if preserveSharing and sharp:
            for edge,value in zip(evaluated.edges,sharp.data):
                if value.value and all(i in vertexMap for i in edge.vertices):sharpEdges.add(tuple(sorted(vertexMap[i] for i in edge.vertices)))
        inverse=obj.matrix_world.inverted();normalInverse=obj.matrix_world.to_3x3().transposed()
        for name in sorted(present):
            part=recipes[name];first=len(vertices)
            for point,normal,tex in zip(part['vertices'],part['normals'],part['uvs']):
                vertices.append(tuple(inverse@Vector(point)));labels.append(partIds[name])
            for index,face in enumerate(part['faces']):
                faces.append(tuple(first+i for i in face));smooth.append(part.get('smooth',[True]*len(part['faces']))[index]);materials.append(0)
                for i in face:normals.append(tuple((normalInverse@Vector(part['normals'][i])).normalized()));uvs.append(tuple(part['uvs'][i]))
            restored.append(name)
        ev.to_mesh_clear();old=obj.data;meshName=old.name;old.name=meshName+'_Discard';mesh=bpy.data.meshes.new(meshName);mesh.from_pydata(vertices,[],faces);mesh.update()
        for material in old.materials:mesh.materials.append(material)
        layer=mesh.uv_layers.new(name='UVMap');sourceId=mesh.attributes.new('_SOURCE_PART_ID','FLOAT','POINT')
        for value,partId in zip(sourceId.data,labels):value.value=partId
        for polygon,flag,materialIndex in zip(mesh.polygons,smooth,materials):
            polygon.use_smooth=flag;polygon.material_index=materialIndex
            for li in polygon.loop_indices:layer.data[li].uv=uvs[li]
        if sharpEdges:
            edgeLayer=mesh.attributes.get('sharp_edge') or mesh.attributes.new('sharp_edge','BOOLEAN','EDGE')
            for edge,value in zip(mesh.edges,edgeLayer.data):value.value=tuple(sorted(edge.vertices)) in sharpEdges
        mesh.normals_split_custom_set(normals);obj.modifiers.clear();obj.data=mesh;bpy.data.meshes.remove(old)
        bpy.context.view_layer.update();deps.update()
    if set(restored)!=set(recipes):raise RuntimeError('Not all declared runtime islands were restored: '+str(restored))
    gameRoot['StableRuntimePartNames']=list(STABLE_RUNTIME['parts'])
    gameRoot['PostExportStablePartNames']=[n for n,p in STABLE_RUNTIME['parts'].items() if p.get('postExport',False)]
    gameRoot['RuntimePackaging']='Game blend is the pre-packaging derivative. Clean script restores declared post-export islands and removes float32-collapsed faces; verified Reimport blend contains the actual packaged GLB geometry.'
    gameRoot['AnalyticRimPartNames']=sorted(analyticRims or {})
    gameRoot['AnalyticCollarPartNames']=sorted(analyticCollars or {})
    gameRoot['CollarRuntimeProfileSegments']=list(COLLAR_PROFILE_SEGMENTS)
    gameRoot['CollarRuntimeSampling']='Current high-source4ring80station profiles sampled at8stations per ring with source corner normals/UVs.45degreeboundaries preserve physical projection seams. Temporary procedural shallow-collar proxies isolate unrelated global-budget collapse; only current sampled collars enter final runtime.'

def MakePbr():
    # A fresh grey rebuild removes the old material users but Blender retains
    # packed Image datablocks. Reusing a path can silently export the old pixels.
    for image in list(bpy.data.images):
        if image.type=='IMAGE' and image.name.startswith('Texture_Isuzu'):
            if image.users:raise RuntimeError('Expected fresh grey stage without image users: '+image.name)
            bpy.data.images.remove(image)
    if 'Rust' not in B.MATS:
        mat=bpy.data.materials.new('Material_IsuzuRust');mat.use_nodes=True;B.MATS['Rust']=mat
    for obj in ROOT.children_recursive:
        if obj.type!='MESH':continue
        zone=None
        if obj.name.startswith(('Door_Handle','Engine_CylinderHead','Engine_FlatHeadTop')):zone='Chassis'
        elif obj.name.startswith('Door_Hinge'):zone='Paint'
        if zone:
            obj.data.materials.clear();obj.data.materials.append(B.MATS[zone]);obj['MaterialZone']=zone
    for zone in ['Paint','Canvas','Wood','Rubber','Chassis','Steel','Leather','Rust']:
        mat=B.MATS[zone];mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
        output=nodes.new('ShaderNodeOutputMaterial');output.location=(640,0)
        bsdf=nodes.new('ShaderNodeBsdfPrincipled');bsdf.location=(340,0);links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
        for channel in ['Base','Normal','Orm']:
            path=SOURCE/'Textures'/('Texture_Isuzu'+zone+channel+'.png')
            image=bpy.data.images.load(str(path),check_existing=False);image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';image.pack()
            node=nodes.new('ShaderNodeTexImage');node.name='Texture_'+channel;node.image=image;node.extension='REPEAT';node.location=(-600,220-220*['Base','Normal','Orm'].index(channel))
            if zone=='Canvas' and channel!='Normal':
                uv=nodes.get('CanvasUv') or nodes.new('ShaderNodeTexCoord');uv.name='CanvasUv'
                mapping=nodes.get('CanvasMacroScale')
                if mapping is None:
                    mapping=nodes.new('ShaderNodeMapping');mapping.name='CanvasMacroScale';mapping.vector_type='POINT';scale=B.CANVAS_TEXTURE_TILE_M/B.CANVAS_MACRO_TEXTURE_TILE_M;mapping.inputs['Scale'].default_value=(scale,scale,1);links.new(uv.outputs['UV'],mapping.inputs['Vector'])
                links.new(mapping.outputs['Vector'],node.inputs['Vector'])
            if channel=='Base':links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
            elif channel=='Normal':
                normal=nodes.new('ShaderNodeNormalMap');normal.space='TANGENT';normal.inputs['Strength'].default_value=1;normal.location=(80,-100);links.new(node.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
            else:
                separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';separate.location=(-280,-260);links.new(node.outputs['Color'],separate.inputs['Color']);roughness=separate.outputs['Green']
                if zone=='Paint':
                    factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';factor.inputs[1].default_value=ENAMEL_ROUGHNESS_FACTOR;links.new(roughness,factor.inputs[0]);roughness=factor.outputs[0]
                links.new(roughness,bsdf.inputs['Roughness']);links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])
                group=bpy.data.node_groups.get('glTF Material Output')
                if not group:
                    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
                    group=create_settings_group('glTF Material Output')
                existing={item.name for item in group.interface.items_tree if item.item_type=='SOCKET'}
                for name,default in [('Thickness',0),('Dispersion',0),('Iridescence Factor',0),('Iridescence Thickness Minimum',100)]:
                    if name not in existing:socket=group.interface.new_socket(name=name,in_out='INPUT',socket_type='NodeSocketFloat');socket.default_value=default
                ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;ao.location=(70,-340);links.new(separate.outputs['Red'],ao.inputs['Occlusion'])
        mat.diffuse_color={'Paint':(.175,.181,.098,1),'Canvas':(.122,.1195,.076,1),'Wood':(.127,.136,.074,1),'Rubber':(.013,.013,.011,1),'Chassis':(.031,.031,.022,1),'Steel':(.55,.57,.58,1),'Leather':(.042,.030,.018,1),'Rust':(.105,.037,.012,1)}[zone]
        mat['SurfaceEvidence']='V41 user-confirmed khaki-olive palette direction; built-in imagegen cotton tile and material board guide microtexture. Historical pigment and physical relief remain reconstruction.'
        mat['NormalConvention']='OpenGL';mat['OrmPacking']='R occlusion / G roughness / B metallic'
        if zone=='Paint':
            bsdf.inputs['Coat Weight'].default_value=ENAMEL_COAT_WEIGHT
            coatRoughness=nodes.new('ShaderNodeMath');coatRoughness.operation='MULTIPLY';coatRoughness.inputs[1].default_value=ENAMEL_COAT_ROUGHNESS
            links.new(separate.outputs['Green'],coatRoughness.inputs[0]);links.new(coatRoughness.outputs[0],bsdf.inputs['Coat Roughness']);links.new(normal.outputs['Normal'],bsdf.inputs['Coat Normal'])
        if zone in weathering.TARGET_ZONES:
            color=nodes.new('ShaderNodeVertexColor');color.layer_name='Weathering';color.name='ServiceWeathering';color.location=(-250,450)
            source=bsdf.inputs['Base Color'].links[0].from_socket
            mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.name='WeatheredAlbedo';mix.location=(40,240)
            a=next(i for i in mix.inputs if i.type=='RGBA' and i.name=='A');b=next(i for i in mix.inputs if i.type=='RGBA' and i.name=='B');links.new(source,a);links.new(color.outputs['Color'],b);links.new(next(o for o in mix.outputs if o.type=='RGBA'),bsdf.inputs['Base Color'])
            mat['ServiceWearEvidence']='User-requested medium battlefield service wear; dirt and fading are artistic reconstruction, not wear measured from the clean primary photograph'
    ROOT['EnamelMetalResponseJson']=json.dumps({'version':78,'roughnessFactor':ENAMEL_ROUGHNESS_FACTOR,'clearcoatFactor':ENAMEL_COAT_WEIGHT,'clearcoatRoughnessFactor':ENAMEL_COAT_ROUGHNESS,'clearcoatRoughnessUsesPaintOrm':True,'intactPaintMetallic':0,'exposedChipMetallicFromOrm':False,'contactSteelUsesSeparateMaterial':True,'selectedPigmentDirectionRetained':True,'coatNormalShared':True,'scope':'Continuous satin enamel without tiled cloud dirt or scattered conductive scratches; existing contact wear uses separate steel regions. Spatial dirt/fading is linear vertex albedo; no baked light. Wear history and microscopic scales are artistic reconstruction.'})
    ROOT['BareSteelResponseJson']=json.dumps({'version':77,'baseSrgb8':[156,153,142],'tarnishSrgb8':[116,113,102],'roughnessNominal':.32,'metallic':1,'normalScratchSourceRetained':True,'scope':'Tarnished conductor interpretation with rest-space grime; not measured historical alloy or oxidation state.'})
    # An open annular rim exposes an independent concave reflector and bulb.
    # Thin alpha glass keeps these layers visible at oblique browser angles;
    # screen-space refraction still blackens this small assembly in the viewer.
    greyReflector=B.MATS['Reflector'];greyReflector.name='Material_IsuzuReflectorGrey'
    reflector=B.MATS['Steel'].copy();reflector.name='Material_IsuzuReflector';B.MATS['Reflector']=reflector
    nodes=reflector.node_tree.nodes;links=reflector.node_tree.links;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    for link in list(bsdf.inputs['Base Color'].links):links.remove(link)
    bsdf.inputs['Base Color'].default_value=(.75,.78,.76,1)
    roughLink=bsdf.inputs['Roughness'].links[0];source=roughLink.from_socket;links.remove(roughLink)
    factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';factor.inputs[1].default_value=.35;links.new(source,factor.inputs[0]);links.new(factor.outputs[0],bsdf.inputs['Roughness'])
    glass=B.MATS['LampGlass'];bsdf=glass.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(.92,.95,.94,1);bsdf.inputs['Roughness'].default_value=.08;bsdf.inputs['Alpha'].default_value=.13;bsdf.inputs['Transmission Weight'].default_value=0;bsdf.inputs['IOR'].default_value=1.52;bsdf.inputs['Coat Weight'].default_value=.35;bsdf.inputs['Coat Roughness'].default_value=.08
    glass.surface_render_method='BLENDED';glass.use_transparency_overlap=False
    glass['OpticalModel']='Thin alpha glass (0.13) with independent parabolic reflector and bulb; real-time approximation without screen-space refraction'
    for obj in ROOT.children_recursive:
        if obj.type=='MESH' and obj.get('MaterialZone') in ('Reflector','LampGlass'):
            obj.data.materials.clear();obj.data.materials.append(B.MATS[obj['MaterialZone']])
            if obj.get('MaterialZone')=='LampGlass':obj.visible_shadow=False
    bpy.data.materials.remove(greyReflector)
    # The current inferred enamel pigment is shared by body and wheel rims.
    # Share the body maps without converting monochrome shade into wheel tint.
    wheelPaint=B.MATS['Paint'].copy();wheelPaint.name='Material_IsuzuWheelPaint';B.MATS['WheelPaint']=wheelPaint
    wheelPaint['ToneEvidence']='Body and rims share selected khaki-olive pigment and maps; part-aware vertex albedo adds service dirt, not a monochrome-photo pigment tint'
    ROOT['FinishChoice']='HistoricalKhakiOliveCandidate'
    selectionFile=OUT/'Data_MaterialSelection.json'
    selection=json.loads(selectionFile.read_text(encoding='utf8')) if selectionFile.exists() else {}
    ROOT['FinishUserConfirmed']=selection.get('profile')==ROOT['FinishChoice'] and selection.get('confirmedByUser') is True
    ROOT['MaterialReferenceFile']=str(SOURCE/'References/Reference_MaterialHistoricStudyV35.png')
    ROOT['MaterialReferenceRole']='User-requested built-in imagegen guidance for enamel,canvas,rubber and coated wood; generated geometry and exact historic pigment are not authoritative'
    pbrSource=json.loads((SOURCE/'Data_PbrSources.json').read_text(encoding='utf8'))
    ROOT['CanvasWeaveSourceFile']=pbrSource['canvasSource']['file']
    ROOT['CanvasWeaveSourceSha256']=pbrSource['canvasSource']['sha256']
    ROOT['CanvasTextureTileM']=B.CANVAS_TEXTURE_TILE_M
    ROOT['CanvasBaseTextureTileM']=B.CANVAS_MACRO_TEXTURE_TILE_M
    ROOT['CanvasMacroSourceSha256']=pbrSource['canvasMacroSource']['sha256']
    ROOT['CanvasSurfaceStudyJson']=json.dumps(pbrSource['canvasServiceAppearance'])
    ROOT['CanvasMainProjection']='Continuous cylindrical wrap along longitudinal Y'
    ROOT['CanvasWrapCentreZM']=B.CANVAS_WRAP_CENTRE_Z_M
    ROOT['CanvasWrapRadiusM']=B.CANVAS_WRAP_RADIUS_M
    ROOT['CanvasWeaveSourceRole']='Generated cotton fibre source, flattened and retoned; scale,relief and historical pigment are inferred'
    if pbrSource['canvasSource']['tileM']!=B.CANVAS_TEXTURE_TILE_M:raise RuntimeError('Canvas UV and baked physical scale disagree')
    for obj in ROOT.children_recursive:
        if obj.type=='MESH' and obj.name.startswith('Wheel_') and obj.get('MaterialZone')=='Paint':obj.data.materials.clear();obj.data.materials.append(wheelPaint)
    for zone in ['Glass','Light','Dark','Stencil']:
        mat=B.MATS[zone];bsdf=mat.node_tree.nodes.get('Principled BSDF')
        if zone=='Glass':
            bsdf.inputs['Base Color'].default_value=CAB_GLASS_BASE_COLOR;bsdf.inputs['Roughness'].default_value=CAB_GLASS_ROUGHNESS;bsdf.inputs['Transmission Weight'].default_value=CAB_GLASS_TRANSMISSION;bsdf.inputs['IOR'].default_value=CAB_GLASS_IOR
            mat['OpticalModel']='Clear thin cab glazing with dielectric Fresnel reflection and transmission;no alpha-cutout or painted tree/building reflection. Primary-photo sharp reflected edges motivate the authored low-roughness interpretation;exact historical glass specification unmeasured.'
            ROOT['CabGlazingOpticsJson']=json.dumps({'baseColorLinear':CAB_GLASS_BASE_COLOR,'roughness':CAB_GLASS_ROUGHNESS,'transmission':CAB_GLASS_TRANSMISSION,'ior':CAB_GLASS_IOR,'scope':'Cab glazing only;headlamp sheet retains its independent alpha optical approximation. Clear-glass appearance interpretation,not historical laboratory measurements.'})
        elif zone=='Light':
            # The small bulb and rear diffuser are opaque. The independent
            # headlamp glass and reflector are authored above.
            bsdf.inputs['Base Color'].default_value=(.66,.65,.54,1);bsdf.inputs['Roughness'].default_value=.22;bsdf.inputs['Metallic'].default_value=.18;bsdf.inputs['Transmission Weight'].default_value=0;bsdf.inputs['IOR'].default_value=1.52
            mat['OpticalModel']='Opaque bulb and rear diffuser; headlamp has separate thin glass and reflector; cab glazing uses independent transmission'
        elif zone=='Dark':
            bsdf.inputs['Base Color'].default_value=(.008,.009,.007,1);bsdf.inputs['Roughness'].default_value=.83
        else:
            bsdf.inputs['Base Color'].default_value=(.70,.66,.48,1);bsdf.inputs['Roughness'].default_value=.65;bsdf.inputs['Metallic'].default_value=.08

def MakeAbradedSteel():
    material=B.MATS['Steel'].copy();material.name=metalWear.NAME;nodes=material.node_tree.nodes;links=material.node_tree.links
    mix=nodes['WeatheredAlbedo'];a=next(i for i in mix.inputs if i.type=='RGBA' and i.name=='A')
    for link in list(a.links):links.remove(link)
    a.default_value=metalWear.BASE
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');link=bsdf.inputs['Roughness'].links[0];source=link.from_socket;links.remove(link)
    factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';factor.inputs[1].default_value=metalWear.ROUGHNESS_FACTOR;links.new(source,factor.inputs[0]);links.new(factor.outputs[0],bsdf.inputs['Roughness'])
    material['AbrasionProfileJson']=json.dumps(metalWear.PROFILE);B.MATS['AbradedSteel']=material;return material

def MakeLipRust():
    material=B.MATS['Rust'].copy();material.name=metalWear.RUST_NAME;nodes=material.node_tree.nodes;links=material.node_tree.links
    uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeMapping');mapping.name='RolledLipRustPhysicalScale';mapping.vector_type='POINT';mapping.inputs['Scale'].default_value=(metalWear.RUST_UV_SCALE,metalWear.RUST_UV_SCALE,1);links.new(uv.outputs['UV'],mapping.inputs['Vector'])
    for node in list(nodes):
        if node.type=='TEX_IMAGE':links.new(mapping.outputs['Vector'],node.inputs['Vector'])
    material['LocalizedOxideProfileJson']=json.dumps(metalWear.PROFILE);B.MATS['LipRust']=material;return material

def WearDetails():
    random.seed(941936)
    def Chip(name,point,plane,parent,radius=.005,zone='Steel',stretch=(1,1)):
        radius*=2.4 if name.startswith('Wear_DoorContact') else (2.2 if name.startswith('Wear_RunningBoard') else (3.0 if name.startswith(('Wear_Bumper','Oxide_RearHinge')) else 2.6))
        vertices=[]
        for i in range(7):
            a=math.tau*i/7;r=radius*random.uniform(.5,1.2);u=r*math.cos(a)*stretch[0];v=r*.45*math.sin(a)*stretch[1]
            if plane=='X':vertices.append((point[0],point[1]+u,point[2]+v))
            elif plane=='Y':vertices.append((point[0]+u,point[1],point[2]+v))
            else:vertices.append((point[0]+u,point[1]+v,point[2]))
        obj=B.Mesh(name,vertices,[tuple(range(7))],zone,parent)
        obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
        obj['WearCause']='Visible localized service contact abrasion / fastener oxidation; artistic wear,not damage measured from the clean factory photograph'
    for side in [-1,1]:
        door=bpy.data.objects['Door_'+('Left' if side<0 else 'Right')]
        for i in range(5):Chip('Wear_DoorContact'+str(side)+str(i),(side*.77365,-.185+i*.009,.74+(1.021-.96)*(.75/.69)+random.uniform(-.002,.002)),'X',door,.0065)
        for i in range(8):Chip('Wear_RunningBoard'+str(side)+str(i),(side*(.88+random.random()*.04)*ROOT.get('FenderWidthScale',1),.45+random.uniform(-.25,.2),.446),'Z',ROOT,random.uniform(.004,.009))
        for i in range(5):Chip('Wear_Bumper'+str(side)+str(i),(side*(.66+i*.012),B.FRONT_BUMPER_FACE_Y+.0003,B.FRONT_BUMPER_CENTRE_Z+B.FRONT_BUMPER_HEIGHT_M/2-.025),'Y',ROOT,.007)
        for i in range(4):Chip('Oxide_RearHinge'+str(side)+str(i),((side*.65+random.uniform(-.04,.04))*ROOT.get('CargoWidthScale',1),-2.697+ROOT.get('CargoRearOffsetM',0),1.125+ROOT.get('CargoHeightOffsetM',0)+random.uniform(-.035,.035)),'Y',bpy.data.objects['Tailgate'],.003,'Rust')
        sheet=bpy.data.objects['BonnetSide_Sheet'+str(side)];points=[sheet.matrix_world@v.co for v in sheet.data.vertices]
        if len(points)%4:raise RuntimeError('Bonnet sheet needs its four-level source columns for oxide placement')
        columns=sorted((sum(p.y for p in points[i:i+4])/4,min(p.z for p in points[i:i+4]),max(p.z for p in points[i:i+4]),sum(abs(p.x) for p in points[i:i+4])/4) for i in range(0,len(points),4))
        loY,hiY=columns[0][0],columns[-1][0]
        def LocalSheet(yy):
            for a,b in zip(columns,columns[1:]):
                if a[0]<=yy<=b[0]:
                    t=(yy-a[0])/(b[0]-a[0]);return tuple(a[k]+(b[k]-a[k])*t for k in [1,2,3])
            raise RuntimeError('Oxide placement outside bonnet sheet')
        owner=bpy.data.objects['HoodSide_'+('Left' if side<0 else 'Right')]
        patches=[(loY+.020,'middle',(.35,2.3)),(hiY-.020,'middle',(.35,2.3)),(loY+(hiY-loY)*(.34 if side<0 else .42),'lower',(1.3,.45)),(loY+(hiY-loY)*(.70 if side<0 else .63),'upper',(1.3,.45))]
        for i,(yy,kind,stretch) in enumerate(patches):
            lower,upper,xx=LocalSheet(yy);zz=(lower+upper)/2 if kind=='middle' else (lower+.018 if kind=='lower' else upper-.018)
            Chip('Oxide_BonnetSeam'+str(side)+str(i),(side*(xx+.01),yy,zz),'X',owner,.012,'Rust',stretch)
    ConformWearSurfaces(ROOT,sourcePlacement=True)
    B.AssignUV()


def ConformWearSurfaces(root,sourcePlacement=False):
    """Seat existing small wear patches on the actual final support surfaces.

    High source and collapsed runtime need separate ray queries. Keep the ten
    already-seated bumper chips unchanged; project42door/step/oxide patches,
    preserving all support geometry and all nonpatch corner attributes.
    """
    from mathutils.bvhtree import BVHTree
    groups={
        'DoorContact':(('Wear_DoorContact',),('DoorPanel_','DoorLowerPressing_','Door_Border'),0),
        'RunningBoard':(('Wear_RunningBoard',),('RunningBoard_',),2),
        'RearHinge':(('Oxide_RearHinge',),('Tailgate_Hinge',),1),
        'BonnetSeam':(('Oxide_BonnetSeam',),('BonnetSide_Sheet',),0),
    }
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()}
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();parts={};patchObjects={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();attr=mesh.attributes.get('_SOURCE_PART_ID');matrix=obj.matrix_world
        try:
            for tri in mesh.loop_triangles:
                name=names[int(round(attr.data[tri.vertices[0]].value))] if attr else obj.name
                wanted=any(name.startswith(patch+support) for patch,support,axis in groups.values())
                if not wanted:continue
                points=[matrix@mesh.vertices[i].co for i in tri.vertices];entry=parts.setdefault(name,{'triangles':[],'points':[]})
                entry['triangles'].append(points);entry['points'].extend(points)
        finally:ev.to_mesh_clear()
        raw=obj.data;attr=raw.attributes.get('_SOURCE_PART_ID');selected={}
        for vertex in raw.vertices:
            name=names[int(round(attr.data[vertex.index].value))] if attr else obj.name
            if any(name.startswith(patch) for patch,support,axis in groups.values()):selected.setdefault(name,[]).append(vertex.index)
        if selected:
            if any(m.type!='TRIANGULATE' for m in obj.modifiers):raise RuntimeError('Wear contact mesh must be evaluated before placement: '+obj.name)
            patchObjects[obj]=selected
    trees={}
    for group,(patch,support,axis) in groups.items():
        faces=[tri for name,entry in parts.items() if name.startswith(support) for tri in entry['triangles']]
        trees[group]=BVHTree.FromPolygons([p for tri in faces for p in tri],[tuple(range(i*3,i*3+3)) for i in range(len(faces))],all_triangles=True)
    offset=.0003;rows=[]
    for obj,selected in patchObjects.items():
        mesh=obj.data;matrix=obj.matrix_world.copy();inverse=matrix.inverted();oldNormals=[n.vector.copy() for n in mesh.corner_normals];directions={}
        for name,indices in selected.items():
            group,definition=next((group,definition) for group,definition in groups.items() if name.startswith(definition[0]));axis=definition[2];points=[matrix@mesh.vertices[i].co for i in indices];centre=sum(points,Vector())/len(points);sign=1 if centre.x>0 else -1;outward=Vector((0,0,0));outward[axis]=sign if axis==0 else (-1 if group=='RearHinge' else 1);shift=Vector((0,0,0))
            if sourcePlacement and group=='ChassisRivet':
                candidates=[entry for part,entry in parts.items() if part.startswith('Chassis_Rivet'+str(sign)+'_')]
                centres=[sum(entry['points'],Vector())/len(entry['points']) for entry in candidates];nearest=min(centres,key=lambda p:abs(p.y-centre.y))
                # Oxide beside the real rivet foot, on the rail coating. It
                # does not invent a corroded cap when LOD changes that cap.
                shift.y=nearest.y+.018-centre.y;shift.z=nearest.z-centre.z
            if sourcePlacement and group=='RearHinge':
                candidates=[entry for part,entry in parts.items() if part.startswith('Tailgate_HingeLeaf') and sum(p.x for p in entry['points'])*sign>0]
                entry=min(candidates,key=lambda e:abs(sum(p.x for p in e['points'])/len(e['points'])-centre.x));bounds=[(min(p[k] for p in entry['points']),max(p[k] for p in entry['points'])) for k in [0,2]]
                for k,(low,high) in zip([0,2],bounds):
                    radius=max(abs(p[k]-centre[k]) for p in points);shift[k]=max(low+radius+.005,min(high-radius-.005,centre[k]))-centre[k]
            centre+=shift;original=[p+shift for p in points];accepted=None;maximum=0
            # Enlarge only where actual support permits it. Keep the existing
            #50..600um separation limit on vertices and triangulated centroids.
            for footprintScale in [1.0,.85,.70,.55,.40]:
                targets=[];candidateMaximum=0
                for p in original:
                    sample=centre+(p-centre)*footprintScale;hit=trees[group].ray_cast(sample+outward*.1,-outward,.2)[0]
                    if hit is None:break
                    target=hit+outward*offset;targets.append(target);candidateMaximum=max(candidateMaximum,(target-sample).length)
                if len(targets)!=len(indices):continue
                for i,target in zip(indices,targets):mesh.vertices[i].co=inverse@target
                mesh.update();mesh.calc_loop_triangles();indexSet=set(indices);samples=list(targets)
                samples.extend(sum((matrix@mesh.vertices[i].co for i in tri.vertices),Vector())/3 for tri in mesh.loop_triangles if set(tri.vertices)<=indexSet)
                gaps=[]
                for sample in samples:
                    hit=trees[group].ray_cast(sample+outward*.08,-outward,.16);gaps.append(hit[3]-.08 if hit[0] is not None else None)
                if all(gap is not None and .00005<=gap<=.0006 for gap in gaps):accepted=footprintScale;maximum=candidateMaximum;break
            if accepted is None:raise RuntimeError('Enlarged wear cannot retain actual support clearance: '+name)
            directions[name]=(outward,axis);rows.append({'name':name,'group':group,'vertices':len(indices),'maximumSurfaceProjectionM':maximum,'inPlaneShiftBlenderM':list(shift),'surfaceOffsetM':offset,'acceptedFootprintScale':accepted})
        mesh.update();attr=mesh.attributes.get('_SOURCE_PART_ID');uv=mesh.uv_layers.active
        for face in mesh.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))] if attr else obj.name
            if name not in selected:continue
            outward,axis=directions[name]
            if (matrix.to_3x3().inverted().transposed()@face.normal).dot(outward)<0:face.flip()
        mesh.update()
        for face in mesh.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))] if attr else obj.name
            if name not in selected:continue
            outward,axis=directions[name];face.use_smooth=False
            for li in face.loop_indices:
                oldNormals[li]=face.normal.copy()
                if uv:
                    p=mesh.vertices[mesh.loops[li].vertex_index].co;u,v=(p.y,p.z) if axis==0 else ((p.x,p.z) if axis==1 else (p.x,p.y));tile=.20 if name.startswith('Oxide_') else .35;uv.data[li].uv=(u/tile,v/tile)
        mesh.normals_split_custom_set(oldNormals)
    if len(rows)!=42:raise RuntimeError('Expected42existing wear/oxide patches, got '+str(len(rows)))
    key='Source' if sourcePlacement else 'Runtime';root['Wear'+key+'SurfaceProjectionJson']=json.dumps(rows);root['WearSurfaceOffsetM']=offset
    root['WearSurfacePlacementEvidence']='Existing restrained wear/oxide patches fitted to actual high-source and final reduced support surfaces separately; oxide remains an inferred material treatment,not a measured historical corrosion map. Ten already-seated bumper chips retained.'
    return rows

def Motions():
    """Five short, separate inspection clips. Playback does not require skinning."""
    scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=61
    nodes=[o for o in ROOT.children_recursive if o.type=='EMPTY' and o.get('MotionAxisBlender')]
    rootNames=[]
    for obj in nodes:
        axis=obj['MotionAxisBlender'];obj['MotionAxisGltf']={'X':'X','Y':'-Z','Z':'Y'}[axis]
        if obj.name in ['Door_Left','Hood_Right']:obj['MotionRangeDegrees']=[-78 if obj.name=='Door_Left' else -100,0]
        if obj.name.startswith('HoodSide_'):obj['MotionRangeDegrees']=[-180,90] if obj.name.endswith('Right') else [-90,180]
        obj['InspectionOnlyAnimation']=True
        if obj.name=='SteeringTieRod':continue
        if obj.name.startswith('Wheel_'):clip='Drive2M';a=0;value=-2/obj.get('RollingRadiusM',.4318)
        elif obj.name.startswith('Door_'):clip='DoorsOpen';a=2;value=math.radians(76)*(1 if obj.name.endswith('Right') else -1)
        elif obj.name.startswith('Hood_'):clip='BonnetOpen';a=1;value=math.radians(B.BONNET_REFERENCE_TOP_DEG)*(1 if obj.name.endswith('Left') else -1)
        elif obj.name.startswith('HoodSide_'):clip='BonnetOpen';a=1;value=math.radians(B.BONNET_REFERENCE_SIDE_DEG)*(1 if obj.name.endswith('Left') else -1)
        elif obj.name.startswith('RearCheek_'):clip='BonnetOpen';a=2;value=math.radians(B.BONNET_REFERENCE_CHEEK_DEG)*(1 if obj.name.endswith('Right') else -1)
        elif obj.name=='Tailgate':clip='TailgateOpen';a=0;value=math.radians(94)
        elif obj.name.startswith('Steer_'):clip='SteerLeft';a=2;value=math.radians(26) if obj.name.endswith('Left') else SteeringSolution(math.radians(26))[0]
        elif obj.name=='SteeringWheel':clip='SteerLeft';a=2;value=math.radians(26*16.5)
        else:continue
        obj.animation_data_clear();base=obj.matrix_basis.to_quaternion();obj['RestRotationBlenderWxyz']=list(base);obj.rotation_mode='QUATERNION';obj.rotation_quaternion=base
        action=bpy.data.actions.new(obj.name+'_'+clip);obj.animation_data_create();obj.animation_data.action=action
        # Explicit object keys are required: the exporter may otherwise preserve
        # only quaternion endpoints, losing turns greater than 180 degrees.
        frames=[(f,(f-1)/60) for f in range(1,62)] if obj.name.startswith(('Steer_','Wheel_','Hood_','HoodSide_','RearCheek_')) or obj.name=='SteeringWheel' else [(1,0),(61,1)]
        for frame,weight in frames:
            delta=value*weight
            if obj.name=='Steer_Right':delta=SteeringSolution(math.radians(26)*weight)[0]
            if obj.name.startswith(('Hood_','HoodSide_')):
                topAngle,sideAngle=B.BonnetInspectionAngles(weight)
                delta=math.radians(sideAngle if obj.name.startswith('HoodSide_') else topAngle)*(1 if obj.name.endswith('Left') else -1)
            if obj.name.startswith('RearCheek_'):delta=math.radians(B.BonnetRearCheekAngle(weight))*(1 if obj.name.endswith('Right') else -1)
            axisVector=Vector([(1 if k==a else 0) for k in range(3)]);obj.rotation_quaternion=base@Quaternion(axisVector,delta);obj.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=clip)
        # Blender 5 actions use channel bags. LINEAR sampling gives consistent wheel speed.
        try:
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for curve in bag.fcurves:
                            for key in curve.keyframe_points:key.interpolation='LINEAR'
        except AttributeError:pass
        track=obj.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,1,action);obj.animation_data.action=None
        obj.rotation_quaternion=base
        rootNames.append(obj.name)
    rod=bpy.data.objects.get('SteeringTieRod')
    if rod:
        rod.animation_data_clear();rod.animation_data_create();rod.rotation_mode='QUATERNION';action=bpy.data.actions.new('SteeringTieRod_SteerLeft');rod.animation_data.action=action
        for frame in range(1,62):
            _,left,right=SteeringSolution(math.radians(26)*(frame-1)/60)
            mid=(left+right)/2;rod.location=(mid.x,mid.y,.4218);rod.rotation_quaternion=Quaternion(Vector((0,0,1)),math.atan2(right.y-left.y,right.x-left.x));rod.keyframe_insert(data_path='location',frame=frame);rod.keyframe_insert(data_path='rotation_quaternion',frame=frame)
        track=rod.animation_data.nla_tracks.new();track.name='SteerLeft';track.strips.new('SteerLeft',1,action);rod.animation_data.action=None
    scene.frame_set(1);ROOT['AnimationClips']=['Drive2M','DoorsOpen','BonnetOpen','TailgateOpen','SteerLeft']
    ROOT['DriveConvention']='Distance +m is local -Z in glTF; wheel X rotation = -distance / 0.4318m (34-inch nominal tyre)'
    ROOT['SteeringWheelRatio']=16.5
    ROOT['BonnetSideIndependent']=True
    ROOT['BonnetReferenceTopDegrees']=B.BONNET_REFERENCE_TOP_DEG
    ROOT['BonnetReferenceSideDegrees']=B.BONNET_REFERENCE_SIDE_DEG
    ROOT['BonnetInspectionWaypointsDegrees']=[v for row in B.BONNET_INSPECTION_POSES for v in row]
    ROOT['BonnetInspectionEvidence']='Six-leaf reconstruction: main butterfly leaves lift,independent rear plain cheeks fold outward,then main leaves return to photo pose. Rear hinges/hardware/operation remain inferred and require actual exported surface verification.'

def SteeringSolution(inner):
    return B.SteeringSolution(inner)

def Export(path,root):
    path.parent.mkdir(parents=True,exist_ok=True)
    window=bpy.context.window_manager.windows[0];area=next((a for a in window.screen.areas if a.type=='VIEW_3D'),window.screen.areas[0]);region=next((r for r in area.regions if r.type=='WINDOW'),None)
    # File-open callbacks can retain a stale context until the next UI tick.
    # Explicitly bind export to this dedicated Blender window's current scene.
    with bpy.context.temp_override(window=window,area=area,region=region):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in [root]+root.children_recursive:obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        with contextlib.redirect_stdout(io.StringIO()),metalWear.BaseMaterialExport(root):
            # Canonical packaging evaluates COLOR_0 after exact stable-island
            # restoration. Native materials already display the same field.
            bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_tangents=True,export_attributes=True,export_vertex_color='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=True,export_frame_step=1,export_optimize_animation_size=False)

def Count(root):
    deps=bpy.context.evaluated_depsgraph_get();count=0
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();count+=len(mesh.loop_triangles);ev.to_mesh_clear()
    return count

def RemoveRuntimeDegenerateFaces(root):
    """Apply the existing package cleaner's1e-12area rule before budget count.

    Keep every surviving corner's normal,UV,material and original vertex sharing.
    Only affected evaluated groups are rebuilt;the high authoring source is not.
    """
    deps=bpy.context.evaluated_depsgraph_get();rows=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ev=obj.evaluated_get(deps);evaluated=ev.to_mesh();evaluated.calc_loop_triangles();kept=[];removed=0
        for tri in evaluated.loop_triangles:
            a,b,c=[tuple(evaluated.vertices[i].co) for i in tri.vertices];u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];area2=math.sqrt(sum(x*x for x in (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])))
            if area2<1e-12:removed+=1
            else:kept.append((tuple(tri.vertices),tuple(tri.loops),tri.polygon_index))
        if not removed:ev.to_mesh_clear();continue
        old=obj.data;mesh=bpy.data.meshes.new(old.name+'_ValidFaces');mesh.from_pydata([tuple(v.co) for v in evaluated.vertices],[],[t[0] for t in kept]);mesh.update()
        # Evaluated material IDs are temporary depsgraph data. Reusing them
        # can export a textureless variant with the same material name.
        for material in old.materials:mesh.materials.append(material)
        for attr in evaluated.attributes:
            if attr.domain!='POINT' or not attr.name.startswith('_'):continue
            if attr.data_type not in ['INT','FLOAT','BOOLEAN']:raise RuntimeError('Unsupported runtime point attribute during degenerate cleanup: '+attr.name)
            target=mesh.attributes.new(attr.name,attr.data_type,'POINT')
            for a,b in zip(target.data,attr.data):a.value=b.value
        for sourceUv in evaluated.uv_layers:
            target=mesh.uv_layers.new(name=sourceUv.name)
            target.active_render=sourceUv.active_render
            for face,(_,loops,_) in zip(mesh.polygons,kept):
                for li,oldLi in zip(face.loop_indices,loops):target.data[li].uv=sourceUv.data[oldLi].uv
        mesh.uv_layers.active_index=evaluated.uv_layers.active_index
        normals=[]
        for face,(_,loops,sourceFace) in zip(mesh.polygons,kept):
            face.use_smooth=evaluated.polygons[sourceFace].use_smooth;face.material_index=evaluated.polygons[sourceFace].material_index;normals.extend(tuple(evaluated.corner_normals[li].vector) for li in loops)
        sharp=evaluated.attributes.get('sharp_edge')
        if sharp:
            keys={tuple(sorted(edge.vertices)) for edge,value in zip(evaluated.edges,sharp.data) if value.value};target=mesh.attributes.new('sharp_edge','BOOLEAN','EDGE')
            for edge,value in zip(mesh.edges,target.data):value.value=tuple(sorted(edge.vertices)) in keys
        mesh.normals_split_custom_set(normals);ev.to_mesh_clear();obj.modifiers.clear();obj.data=mesh;bpy.data.meshes.remove(old);rows.append({'object':obj.name,'removedTriangles':removed,'area2ThresholdM2':1e-12})
    root['RuntimePreExportDegenerateRemovalJson']=json.dumps(rows)
    return rows


def SampleCanvasHeader(source,lod):
    """Reduce each3mm-separated skin independently; retain the complete rim.

    Whole-shell collapse can remove attachment edges and mix the two normal
    fields. Boundary weights below exclude every source perimeter vertex from
    collapse, and authored source corner normals are explicit modifier inputs.
    """
    count=715;boundary={i for i in range(count) if i//65 in (0,10) or i%65 in (0,64)}
    if len(source['p'])!=1430 or len(source['triangles'])!=2856:raise RuntimeError('Header source layout changed')
    skins=[[tri for tri in source['triangles'] if all(layer*count<=i<(layer+1)*count for i in tri['indices'])] for layer in range(2)]
    sides=[tri for tri in source['triangles'] if not any(all(layer*count<=i<(layer+1)*count for i in tri['indices']) for layer in range(2))]
    if [len(skin) for skin in skins]!=[1280,1280] or len(sides)!=296:raise RuntimeError('Header source skins/rim changed')
    recipe=lod.NewRecipe();rows=[]
    for layer,skin in enumerate(skins):
        mesh=bpy.data.meshes.new('RuntimeHeaderSkinMesh');mesh.from_pydata([tuple(p) for p in source['p'][layer*count:(layer+1)*count]],[],[tuple(i-layer*count for i in tri['indices']) for tri in skin]);mesh.update();uv=mesh.uv_layers.new(name='UVMap');normals=[]
        for face,tri in zip(mesh.polygons,skin):
            face.use_smooth=True
            for li,n,t in zip(face.loop_indices,tri['n'],tri['uv']):uv.data[li].uv=t;normals.append(n)
        mesh.normals_split_custom_set(normals);temp=bpy.data.objects.new('RuntimeHeaderSkin',mesh);bpy.context.collection.objects.link(temp)
        group=temp.vertex_groups.new(name='HeaderBoundary');group.add(sorted(boundary),1,'REPLACE')
        dec=temp.modifiers.new('HeaderInteriorReduction','DECIMATE');dec.ratio=.47;dec.use_collapse_triangulate=True;dec.vertex_group=group.name;dec.invert_vertex_group=True;dec.vertex_group_factor=1000
        bpy.context.view_layer.update();ev=temp.evaluated_get(bpy.context.evaluated_depsgraph_get());reduced=ev.to_mesh()
        try:
            reduced.calc_loop_triangles();points=[v.co for v in reduced.vertices];missing=sum(min((source['p'][layer*count+i]-p).length for p in points)>1e-6 for i in boundary)
            if missing:raise RuntimeError('Header reduction moved protected attachment vertices')
            for tri in reduced.loop_triangles:lod.AddTriangle(recipe,[reduced.vertices[i].co for i in tri.vertices],[reduced.corner_normals[i].vector for i in tri.loops],[reduced.uv_layers.active.data[i].uv for i in tri.loops])
            rows.append({'layer':layer,'triangles':len(reduced.loop_triangles),'vertices':len(points),'sourceBoundaryVerticesRetained':len(boundary)})
        finally:
            ev.to_mesh_clear();bpy.data.objects.remove(temp,do_unlink=True);bpy.data.meshes.remove(mesh)
    for tri in sides:lod.AddTriangle(recipe,tri['p'],tri['n'],tri['uv'])
    if len(recipe['faces'])!=1496:raise RuntimeError('Unexpected header reduction allocation')
    return recipe,{'sourceTriangles':2856,'runtimeTriangles':1496,'skins':rows,'sourceRimTrianglesRetained':296,'sourceCornerNormalInputsRetained':True,'method':'Independent open-skin collapse with protected source perimeter,followed by exact full-source thickness rim. No cross-skin normal projection;actual GLB quality is separately verified.'}


def DeriveRuntime():
    """Evaluate modifiers, reduce surplus tessellation, merge only within rigid parts.

    The editable high source has already been saved; it is never decimated.
    All original source meshes and pivots remain intact in the high .blend.
    """
    scene=bpy.context.scene;scene.frame_set(1);highTriangles=Count(ROOT);sourceObjects=[ROOT]+ROOT.children_recursive
    originalNames={o:o.name for o in sourceObjects}
    sourceMeshes=[o for o in sourceObjects if o.type=='MESH']
    partIds={o:i+1 for i,o in enumerate(sourceMeshes)}
    analyticRims=SampleRuntimeRims(sourceMeshes,originalNames)
    analyticCollars=SampleRuntimeRims(sourceMeshes,originalNames,collars=True)
    surfaceRecipes,surfaceMetrics=B.wheelLod.SampleSurfaces(sourceMeshes,originalNames,B)
    hardwareRecipes,hardwareMetrics=B.wheelLod.SampleHardware(sourceMeshes,originalNames)
    headerObject=next(obj for obj in sourceMeshes if originalNames[obj]=='Canvas_FrontHeaderValance')
    headerRecipe,headerMetrics=SampleCanvasHeader(B.wheelLod.SourcePart(headerObject),B.wheelLod)
    roofObject=next(obj for obj in sourceMeshes if originalNames[obj]=='Cabin_CamberedRoof');roofRecipe,roofMetrics=cabLod.RoofRecipe(B.wheelLod.SourcePart(roofObject),B.wheelLod)
    if not roofMetrics['passed']:raise RuntimeError('Current-source roof approximation violates declared surface bounds')
    surfaceRecipes.update(hardwareRecipes);surfaceRecipes['Cabin_CamberedRoof']=roofRecipe;surfaceRecipes['Canvas_FrontHeaderValance']=headerRecipe
    nutBounds=SampleWheelNutExtents(sourceMeshes,originalNames)
    for obj in sourceObjects:obj.name='Source_'+originalNames[obj]
    mapping={}
    for obj in sourceObjects:
        if obj.type!='EMPTY':continue
        clone=obj.copy();clone.name=originalNames[obj];bpy.context.collection.objects.link(clone);clone.parent=None;clone.matrix_world=obj.matrix_world.copy();mapping[obj]=clone
    for obj,clone in mapping.items():
        if obj.parent in mapping:B.Parent(clone,mapping[obj.parent])
    deps=bpy.context.evaluated_depsgraph_get();groups={};before=0
    ratios={'Canvas':.40,'Rubber':.46,'Paint':.60,'Chassis':.60,'Steel':.57,'Reflector':.7,'LampGlass':.7,'Wood':.80,'Leather':.90,'Light':.46,'Dark':.70,'Stencil':.8,'Glass':1,'Rust':1}
    for obj in sourceObjects:
        if obj.type!='MESH':continue
        name=originalNames[obj];zone=obj.get('MaterialZone','Paint');owner=obj.parent
        while owner not in mapping and owner:owner=owner.parent
        owner=owner or ROOT
        for modifier in obj.modifiers:
            if modifier.type=='BEVEL':modifier.segments=3 if zone=='Leather' else 1
        analyticGrid={'Canvas_MainCover':(97,85),'Canvas_FrontCurtain':(41,49),'Canvas_RearCurtain':(41,49)}.get(name)
        if analyticGrid:
            # Sample the original authored grid, retaining all boundary rows.
            # This avoids collapse-generated pyramids at the tensioned lower hem.
            rows,cols=analyticGrid;rowIds=list(range(0,rows,2));colIds=list(range(0,cols,2));ncols=len(colIds)
            vertices=[tuple(obj.data.vertices[r*cols+c].co) for r in rowIds for c in colIds]
            faces=[]
            for r in range(len(rowIds)-1):
                for c in range(ncols-1):
                    a=r*ncols+c;f=(a,a+1,a+ncols+1,a+ncols)
                    if name!='Canvas_RearCurtain':f=tuple(reversed(f))
                    faces.append(f)
            mesh=bpy.data.meshes.new('AnalyticCanvasGrid');mesh.from_pydata(vertices,[],faces);mesh.update();uv=mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                poly.use_smooth=True;axis=max(range(3),key=lambda k:abs(poly.normal[k]))
                for li in poly.loop_indices:
                    p=mesh.vertices[mesh.loops[li].vertex_index].co
                    sideCanvas=name=='Canvas_MainCover' and abs(poly.center.x)>.86 and poly.center.z<2.45
                    u,v=(p.y,p.z) if sideCanvas or axis==0 else ((p.x,p.z) if axis==1 else (p.x,p.y));uv.data[li].uv=B.CanvasMainUV(p) if name=='Canvas_MainCover' else (u/B.CANVAS_TEXTURE_TILE_M,v/B.CANVAS_TEXTURE_TILE_M)
            temp=bpy.data.objects.new('RuntimeReduction',mesh);bpy.context.collection.objects.link(temp);temp.matrix_world=obj.matrix_world.copy();solid=temp.modifiers.new('CanvasThickness','SOLIDIFY');solid.thickness=.004 if name=='Canvas_MainCover' else .003
        elif name in analyticCollars or name=='SpareWheel_InnerDisc':
            temp=MakeCollarBudgetProxy(obj);before+=len(obj.data.polygons)*2
        elif name.endswith('_TreadLugs') and name.startswith(('Wheel_','SpareWheel_')):
            temp=B.wheelLod.MakeTreadBudgetProxy(obj,B);before+=len(obj.data.polygons)*2
        elif name.startswith('Wheel_') and name.endswith('_HubCap'):
            temp=MakeHubCapBudgetProxy(obj);before+=len(obj.data.polygons)*2
        else:
            deps.update();ev=obj.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();before+=len(mesh.loop_triangles)
            # A temporary evaluated mesh means no edit reaches the saved high source.
            temp=bpy.data.objects.new('RuntimeReduction',mesh.copy());bpy.context.collection.objects.link(temp);temp.matrix_world=obj.matrix_world.copy();ev.to_mesh_clear()
        if not analyticGrid and not obj.get('PreserveRuntimeTopology') and len(temp.data.polygons)>80 and ratios[zone]<1:
            dec=temp.modifiers.new('GameTessellationReduction','DECIMATE');dec.ratio=ratios[zone];dec.use_collapse_triangulate=True
        deps.update();evaluated=temp.evaluated_get(deps);reduced=evaluated.to_mesh();reduced.calc_loop_triangles()
        contact=bool(obj.get('RuntimeBudgetLocked'))
        group=groups.setdefault((owner,zone,contact),{'v':[],'f':[],'uv':[],'normals':[],'parts':[],'smooth':[]})
        matrix=mapping[owner].matrix_world.inverted()@temp.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed();offset=len(group['v'])
        group['v'].extend(tuple(matrix@v.co) for v in reduced.vertices)
        group['parts'].extend([partIds[obj]]*len(reduced.vertices))
        for triangle in reduced.loop_triangles:
            group['f'].append(tuple(offset+i for i in triangle.vertices))
            group['smooth'].append(reduced.polygons[triangle.polygon_index].use_smooth)
            if zone=='Canvas':
                # Bevel/solidify and collapse can interpolate unrelated UV
                # projections across a narrow seam. Project the final physical
                # surface instead; this changes no vertices or face counts.
                poly=reduced.polygons[triangle.polygon_index]
                center=matrix@poly.center;surfaceNormal=normalMatrix@poly.normal
                axis=max(range(3),key=lambda k:abs(surfaceNormal[k]))
                sideCanvas=name=='Canvas_MainCover' and abs(center.x)>.86 and center.z<2.45
            for loopIndex in triangle.loops:
                if zone=='Canvas':
                    p=matrix@reduced.vertices[reduced.loops[loopIndex].vertex_index].co
                    u,v=(p.y,p.z) if sideCanvas or axis==0 else ((p.x,p.z) if axis==1 else (p.x,p.y))
                    uv=B.CanvasMainUV(p) if name=='Canvas_MainCover' else (u/B.CANVAS_TEXTURE_TILE_M,v/B.CANVAS_TEXTURE_TILE_M)
                else:uv=reduced.uv_layers.active.data[loopIndex].uv if reduced.uv_layers.active else (0,0)
                group['uv'].append(tuple(uv))
                group['normals'].append(tuple((normalMatrix@reduced.corner_normals[loopIndex].vector).normalized()))
        evaluated.to_mesh_clear();data=temp.data;bpy.data.objects.remove(temp,do_unlink=True);bpy.data.meshes.remove(data)
    gameRoot=mapping[ROOT]
    for (owner,zone,contact),group in groups.items():
        suffix='Contact' if contact else ''
        mesh=bpy.data.meshes.new(originalNames[owner]+'_'+zone+suffix+'Mesh');mesh.from_pydata(group['v'],[],group['f']);mesh.update()
        layer=mesh.uv_layers.new(name='UVMap')
        for loop,uv in zip(layer.data,group['uv']):loop.uv=uv
        # Keep authored flat caps/panels flat. Forcing every merged triangle to
        # smooth lets final DECIMATE turn broad planes into inflated shading.
        for poly,smooth in zip(mesh.polygons,group['smooth']):poly.use_smooth=smooth
        mesh.normals_split_custom_set(group['normals'])
        partAttribute=mesh.attributes.new('_SOURCE_PART_ID','INT','POINT');partAttribute.data.foreach_set('value',group['parts'])
        obj=bpy.data.objects.new(originalNames[owner]+'_'+zone+suffix,mesh);bpy.context.collection.objects.link(obj);obj.parent=mapping[owner];obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);mesh.materials.append(B.MATS['WheelPaint'] if zone=='Paint' and originalNames[owner].startswith('Wheel_') else B.MATS[zone]);obj['MaterialZone']=zone;obj['RuntimeBudgetLocked']=contact
    triangles=Count(gameRoot)
    gameRoot['SourcePartNames']={str(partIds[o]):originalNames[o] for o in sourceMeshes}
    gameRoot['SourcePartTrackingSchema']=1
    gameRoot['SurfaceSmoothingPolicy']='Preserve authored polygon smooth/flat flags through merge and budget reduction; custom corner normals retained'
    if triangles>80000:
        # Budget enforcement on the independent derivative, with a measured report.
        locked=sum(len(o.data.polygons) for o in gameRoot.children_recursive if o.type=='MESH' and (o.get('RuntimeBudgetLocked') or o.get('MaterialZone')=='Canvas' or o.name.startswith('HoodSide_') and o.get('MaterialZone')=='Paint'))
        factor=(78500-locked)/(triangles-locked)
        for obj in gameRoot.children_recursive:
            if obj.type=='MESH' and len(obj.data.polygons)>100 and not obj.get('RuntimeBudgetLocked') and obj.get('MaterialZone')!='Canvas' and not (obj.name.startswith('HoodSide_') and obj.get('MaterialZone')=='Paint'):
                dec=obj.modifiers.new('GameBudgetFinalReduction','DECIMATE');dec.ratio=factor;dec.use_collapse_triangulate=True
    RestoreStableRuntimeIslands(gameRoot,analyticRims,analyticCollars,surfaceRecipes)
    gameRoot['WheelLodPartNames']=sorted(surfaceRecipes);gameRoot['WheelLodTubeMetricsJson']=json.dumps(surfaceMetrics)
    gameRoot['WheelLodSampling']='Current-source13profile28station carcasses;162closed six-triangle lugs per wheel with exact high-source top corners and supported internal apex;seven continuous512triangle eight-hole pressings with12station minimax apertures,16station concealed outer edge and8station collar-matched centre. Four support tubes use bounded0.5mm/2degree ring subsets and physical UVs. High source retained; exact historical tooling unproven.'
    nutRepairs=[]
    gameRoot['RuntimeWheelNutAxialParts']=sorted(name for name in hardwareRecipes if '_Lug' in name)
    gameRoot['RuntimeWheelNutAxialMethod']='Full evaluated current high-source closed12vertex20triangle hexagonal prisms;positions,corner normals and UVs copied after global budget reduction. No axial-only repair.'
    gameRoot['RuntimeWheelBossMetricsJson']=json.dumps(hardwareMetrics)
    gameRoot['RuntimeCabRoofLodMetricsJson']=json.dumps(roofMetrics)
    gameRoot['RuntimeCanvasHeaderLodMetricsJson']=json.dumps(headerMetrics)
    wearRepairs=ConformWearSurfaces(gameRoot)
    spareContact=B.wheelLod.ConformSpareCarrier(gameRoot)
    degenerateRepairs=RemoveRuntimeDegenerateFaces(gameRoot)
    triangles=Count(gameRoot)
    if triangles>80000:raise RuntimeError('Restored runtime exceeds unchanged80kvehicle budget: '+str(triangles))
    metalWear.ApplyNative(gameRoot,B.MATS['AbradedSteel'],B.MATS['LipRust']);weathering.ApplyNative(gameRoot)
    gameRoot['HighSourceTriangles']=highTriangles;gameRoot['RuntimeTriangleLimit']=80000;gameRoot['RuntimeTriangles']=triangles
    for obj in sourceObjects:obj.hide_render=True;obj.hide_set(True)
    for obj in gameRoot.children_recursive:
        if obj.type=='MESH':mod=obj.modifiers.new('ExportTriangulation','TRIANGULATE');mod.keep_custom_normals=True
    Export(OUT/'Model_IsuzuType94Truck.glb',gameRoot)
    report={'highSourceTriangles':highTriangles,'runtimeTriangles':triangles,'wheelNutAxialRepairs':nutRepairs,'wearSurfaceRepairs':wearRepairs,'runtimeMeshes':sum(o.type=='MESH' for o in gameRoot.children_recursive),'runtimePivots':[o.name for o in gameRoot.children_recursive if o.type=='EMPTY'],'animations':list(gameRoot['AnimationClips']),'lodMethod':'Separate evaluated derivative; analytical canvas grid; reduced surplus tessellation; rigid parts retained; high source untouched on disk','sourceBlend':str(SOURCE/'Scene_IsuzuType94Truck.blend'),'runtimeGlb':str(OUT/'Model_IsuzuType94Truck.glb')}
    (QA/'Data_RuntimeBuild.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
    return gameRoot

def Finish():
    if bpy.context.scene.get('ModelStage')!='Grey':raise RuntimeError('Start from the freshly built Isuzu grey stage; do not finish an existing derivative twice')
    MakePbr();MakeAbradedSteel();MakeLipRust();WearDetails()
    scene=bpy.context.scene;scene['ModelStage']='PbrHighSource';scene['ReferenceAccepted']=False;scene['ReferenceMatchingStatus']=B.MODEL_REVISION+': whole-vehicle proportions and material trial remain under visual review after user rejection'
    # Fix the steering-wheel pivot in an older already-open grey source without
    # disturbing its visible rim and spokes. Fresh builds already use this axis.
    steering=bpy.data.objects['SteeringWheel'];children={c:c.matrix_world.copy() for c in steering.children};loc=steering.matrix_world.translation.copy();steering.matrix_world=Matrix.Translation(loc)@Matrix.Rotation(math.atan2(.13,.155),4,'X');bpy.context.view_layer.update()
    for child,world in children.items():child.matrix_world=world
    ValidateStableRuntimeSources();Motions();metalWear.ApplyNative(ROOT,B.MATS['AbradedSteel'],B.MATS['LipRust']);weathering.ApplyNative(ROOT)
    ROOT['RimRuntimeProfileSegments']=list(RIM_PROFILE_SEGMENTS)
    ROOT['RimRuntimeSamplingMethod']='Current high-source vertices,smooth corner normals and source-face corner UVs sampled at24/32uniform circumferential stations,all8axial/radial profile rows retained; source projection boundaries preserved; installed after merged budget collapse. High-source geometry unchanged; exact historical rim section remains inferred.'
    B.EmbedRecipeTexts()
    for dataFile in [STABLE_RUNTIME_FILE,OUT/'Data_PrimaryReferenceFit.json']:
        text=bpy.data.texts.get(dataFile.name) or bpy.data.texts.new(dataFile.name);text.from_string(dataFile.read_text(encoding='utf8'))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_IsuzuType94Truck.blend'),compress=True)
    Export(SOURCE/'Exports/Model_IsuzuType94TruckHigh.glb',ROOT)
    B.Render(file='Scene_PbrHigh.png',width=1800,height=1035)
    with metalWear.BaseMaterialExport(ROOT):game=DeriveRuntime()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_IsuzuType94TruckGame.blend'),compress=True)
    B.Render(file='Scene_PbrRuntime.png',width=1800,height=1035)

if __name__ in ('__main__','builtins'):Finish()
