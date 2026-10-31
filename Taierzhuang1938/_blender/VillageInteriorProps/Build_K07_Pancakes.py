"""Rebuild user-selected C as only an open pancake and a bitten half.

Concept K07_ThicknessTexture_C_20261030.png is the visual target. The user
explicitly excluded the folded state. Source materials, editable blend and
GLB remain in OneDrive; no game integration or publication is performed.
"""
import sys
from pathlib import Path
OUT=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K07_Pancakes')
MATERIAL=OUT/'MaterialSources'/'SelectedC'
# User request: double the physical thickness of version b6004c41. X/Y
# footprint and bite stay fixed; all vertical shape/profile terms scale.
THICKNESS_SCALE=2.0

if '--prepare-material' in sys.argv:
    import numpy as np
    from PIL import Image,ImageFilter
    import json,hashlib,subprocess
    source=MATERIAL/'Texture_PancakeSelectedCSource.png'
    rgb=np.asarray(Image.open(source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS),dtype=np.float32)/255
    # A bounded visual tone calibration: selected C's cooked face reads
    # darker/warmer than the first neutral-studio import. This is an artistic
    # reference match, not a physically measured albedo calibration.
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    linear*=np.array([.86,.75,.60],dtype=np.float32)
    rgb=np.clip(np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055),0,1)
    def Blur(value,radius):
        if value.ndim==3:return np.stack([Blur(value[:,:,i],radius) for i in range(3)],axis=2)
        return np.asarray(Image.fromarray(np.uint8(np.clip(value,0,1)*255),'L').filter(ImageFilter.GaussianBlur(radius)),dtype=np.float32)/255
    lum=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    high=lum-Blur(lum,5)
    warm=rgb[:,:,0]-rgb[:,:,1]
    mask=Blur(np.clip((lum-.26)/.20,0,1)*np.clip((.36-warm)/.19,0,1),1)
    fine=Blur(lum,.6)-Blur(lum,3)
    medium=Blur(lum,2)-Blur(lum,10)
    # Keep coherent cooked-skin relief through toasted areas instead of
    # suppressing almost all of their normal variation as the old mask did.
    height=np.clip(.5+np.clip(fine*1.70+medium*.75,-.32,.32)*(.55+.45*mask),0,1)
    # A separate, lightly speckled interior strip keeps large top-face scorch
    # marks from becoming uniform dark bands on the edible cut surface.
    unburned=rgb[lum>np.quantile(lum,.62)].mean(axis=0)
    edge=np.clip(unburned[None,None,:]+high[:,:,None]*1.10+medium[:,:,None]*.22,0,1)
    edgeHeight=np.clip(.5+high*2.00,0,1)
    atlas=Image.new('RGB',(1024,1024));atlasHeight=Image.new('L',(1024,1024),128)
    face=Image.fromarray(np.uint8(rgb*255),'RGB').resize((1024,896),Image.Resampling.LANCZOS)
    faceHeight=Image.fromarray(np.uint8(height*255),'L').resize((1024,896),Image.Resampling.LANCZOS)
    cut=Image.fromarray(np.uint8(edge*255),'RGB').crop((0,300,1024,412))
    cutHeight=Image.fromarray(np.uint8(edgeHeight*255),'L').crop((0,300,1024,412))
    atlas.paste(face,(0,0));atlas.paste(cut.resize((1024,128)),(0,896));atlas.paste(cut,(0,912))
    atlasHeight.paste(faceHeight,(0,0));atlasHeight.paste(cutHeight.resize((1024,128)),(0,896));atlasHeight.paste(cutHeight,(0,912))
    atlasSource=MATERIAL/'Texture_PancakeSelectedCAtlasSource.png';heightSource=MATERIAL/'Texture_PancakeSelectedCAtlasHeight.png'
    atlas.save(atlasSource);atlasHeight.save(heightSource)
    mean=rgb.mean(axis=(0,1));meanText=','.join(f'{v:.6f}' for v in mean)
    baked=MATERIAL/'Baked';preview=MATERIAL/'BakePreview'
    args=['--source',str(atlasSource),'--height',str(heightSource),'--name','PancakeSelectedC',
          '--preset','fabric','--uv-atlas-reason','Standalone food atlas: cooked face and unscorched edible cut strip; not a registered tiling fabric',
          '--tile-m','0.52','--mean',meanText,'--contrast','0.10','--tone-strength','0',
          '--no-flatten','--seamless','none','--relief-m','0.00065','--normal-convention','gl',
          '--rough','0.86','--rough-var','0.09','--ao','0.10','--metal','0',
          '--size','1024','--data-size','1024','--base-quality','89','--data-quality','90',
          '--no-record','--out',str(baked),'--preview-dir',str(preview)]
    baker=Path(__file__).resolve().parents[2]/'_import'/'Script_BakePbrTexture.py'
    subprocess.run([sys.executable,str(baker),*args],check=True)
    for file in preview.glob('*.png'):
        image=Image.open(file);image.thumbnail((500,500));image.save(file)
    files=[source,atlasSource,heightSource,MATERIAL/'Data_MaterialPrompt.json']+[baked/f'Texture_PancakeSelectedC{channel}.webp' for channel in ('Base','Normal','Orm')]
    record={'selected_reference':'Concept/K07_ThicknessTexture_C_20261030.png',
            'artistic_linear_rgb_scale':[.86,.75,.60],'cut_microcontrast_gain':1.10,'cut_height_gain':2.00,
            'surface_relief':'fine band 1.70 + medium band 0.75; toast attenuation retains at least 55%; relief 0.65mm range estimate',
            'reference_sha256':'73b07ee7da629ff7c13b4bc03a16dc7949f2e10eb3e6b3bf399a3664a4a3c8c7',
            'scope':['Pancake_Open','Pancake_BittenHalf'],'baker_sha256':hashlib.sha256(baker.read_bytes()).hexdigest(),
            'bake_args':args,'atlas_layout':'image rows 0..895 cooked face; rows 912..1023 lightly speckled unscorched cut strip; guard in between',
            'face_uv':'u=x/.52+.5; v=.14+.85*(y/.52+.5)','cut_uv':'physical perimeter and profile arc length, both /.52; v base .045',
            'limitations':'Generated food albedo and estimated microrelief; fabric processing preset does not certify food. Unique near-view atlas, not registered or game-integrated.',
            'sha256':{p.relative_to(MATERIAL).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    (MATERIAL/'Data_SelectedCMaterialRecipe.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    print('SELECTED_C_MATERIAL_READY',meanText);raise SystemExit(0)

import bpy,bmesh,math,json,hashlib
from mathutils import Vector
OUT.mkdir(parents=True,exist_ok=True)
recipe=json.loads((MATERIAL/'Data_SelectedCMaterialRecipe.json').read_text(encoding='utf-8'))
for filename,expected in recipe['sha256'].items():
    file=MATERIAL/filename
    assert file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest()==expected,filename
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
assert not any(o.name.startswith('Pancake_') for o in bpy.data.objects),'Use a fresh owned Blender process'
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
mat=bpy.data.materials.new('PancakeSelectedC');mat.use_nodes=True
nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
def Texture(channel,space):
    image=bpy.data.images.load(str(MATERIAL/'Baked'/f'Texture_PancakeSelectedC{channel}.webp'),check_existing=False)
    image.colorspace_settings.name=space;image.pack();node=nodes.new('ShaderNodeTexImage');node.image=image;return node
base=Texture('Base','sRGB');normal=Texture('Normal','Non-Color');orm=Texture('Orm','Non-Color')
split=nodes.new('ShaderNodeSeparateColor');normalMap=nodes.new('ShaderNodeNormalMap')
links.new(base.outputs['Color'],bsdf.inputs['Base Color']);links.new(normal.outputs['Color'],normalMap.inputs['Color']);links.new(normalMap.outputs['Normal'],bsdf.inputs['Normal'])
links.new(orm.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
from io_scene_gltf2.blender.com.material_helpers import create_settings_group
outputGroup=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
output=nodes.new('ShaderNodeGroup');output.node_tree=outputGroup;links.new(split.outputs['Red'],output.inputs['Occlusion'])

def Bottom(x,y):return THICKNESS_SCALE*(.00020*math.sin(12*x+1.2)*math.cos(11*y-.8)+.00008*math.sin(23*x+19*y))
def Thickness(x,y):return THICKNESS_SCALE*(.0042+.00042*math.sin(19*x+7*y)+.00025*math.cos(29*y-.7)+.00015*math.sin(41*x-33*y+.4))
def Top(x,y):return Bottom(x,y)+Thickness(x,y)
def FaceNormal(x,y,top):
    fun=Top if top else Bottom;h=.0001
    dx=(fun(x+h,y)-fun(x-h,y))/(2*h);dy=(fun(x,y+h)-fun(x,y-h))/(2*h)
    return Vector((-dx,-dy,1) if top else (dx,dy,-1)).normalized()
def Contour(half):
    if half:
        angles=sorted([math.pi*i/33 for i in range(34)]+[.65,.67,.69,.71,.735,.755,.777,.798,.817,.834,.85,.868,.885,.902,.92,.937,.954,.973,.99,1.01])
    else:angles=[2*math.pi*i/64 for i in range(64)]
    points=[]
    for a in angles:
        irregular=.0016*math.sin(7*a+.4)+.0010*math.sin(19*a+1.2)+.0005*math.sin(31*a+.5)
        if half:irregular*=math.sin(a)**2
        radius=.25+irregular
        if half:
            u=(a-.82)/.155;removal=.022*max(0,1-u*u)**1.55
            for centre,width,depth in ((.745,.020,.0020),(.825,.023,.0030),(.903,.027,.0017),(.79,.017,-.0014)):
                p=abs((a-centre)/width)
                if p<1:removal+=depth*(1-p*p)**2
            radius-=max(0,removal)
        points.append(Vector((radius*math.cos(a),radius*math.sin(a))))
    if half:
        for i in range(1,11):
            x=-.25+.5*i/11;points.append(Vector((x,.00035*math.sin(43*x+.8))))
    assert len(points)==64
    return points

def FoodState(name,half=False):
    points=Contour(half);n=len(points);centre=Vector((0,.103 if half else 0))
    outward=[]
    for i,p in enumerate(points):
        tangent=(points[(i+1)%n]-points[(i-1)%n]).normalized();outward.append(Vector((tangent.y,-tangent.x)))
    # Slightly irregular roll-off and side profile avoid a machined tan rim.
    insets=[.00045+.00018*math.sin(65*p.x+35*p.y)+.00010*math.sin(111*p.x-73*p.y) for p in points]
    inside=[p-outward[i]*insets[i] for i,p in enumerate(points)]
    vertices=[];normals=[];faces=[];faceUvs=[];profiles={}
    def AddVertex(xy,z,normal):vertices.append((xy.x,xy.y,z));normals.append(tuple(normal));return len(vertices)-1
    def Face(ids,uvs):faces.append(tuple(ids));faceUvs.append(uvs)
    def FaceUv(index):
        x,y,_=vertices[index];return (x/.52+.5,.14+.85*(y/.52+.5))
    surfaces={}
    for top in (True,False):
        fun=Top if top else Bottom
        c=AddVertex(centre,fun(*centre),FaceNormal(*centre,top));rings=[]
        for fraction in (.52,1.0):
            ring=[]
            for p in inside:
                xy=centre+(p-centre)*fraction;ring.append(AddVertex(xy,fun(*xy),FaceNormal(*xy,top)))
            rings.append(ring)
        for i in range(n):
            j=(i+1)%n;ids=(c,rings[0][i],rings[0][j]) if top else (c,rings[0][j],rings[0][i]);Face(ids,[FaceUv(k) for k in ids])
            ids=(rings[0][i],rings[1][i],rings[1][j],rings[0][j]) if top else (rings[0][i],rings[0][j],rings[1][j],rings[1][i]);Face(ids,[FaceUv(k) for k in ids])
        surfaces[top]=rings[1]
    upper=[];lower=[]
    for i,p in enumerate(points):
        upperPoint=p+outward[i]*(.00010*math.sin(97*p.x+137*p.y+.8))
        lowerPoint=p+outward[i]*(.00008*math.sin(131*p.x-83*p.y-.6))
        upperDepth=THICKNESS_SCALE*(.00042+.00013*math.sin(31*p.x+27*p.y))
        lowerDepth=THICKNESS_SCALE*(.00035+.00010*math.cos(37*p.x-21*p.y))
        normal=Vector((outward[i].x,outward[i].y,.24/THICKNESS_SCALE)).normalized();upper.append(AddVertex(upperPoint,Top(*upperPoint)-upperDepth,normal))
        normal=Vector((outward[i].x,outward[i].y,-.24/THICKNESS_SCALE)).normalized();lower.append(AddVertex(lowerPoint,Bottom(*lowerPoint)+lowerDepth,normal))
        profiles[i]=[surfaces[True][i],upper[-1],lower[-1],surfaces[False][i]]
    along=[0.0]
    for i in range(n):along.append(along[-1]+(points[(i+1)%n]-points[i]).length)
    across={}
    for i,ids in profiles.items():
        values=[0.0]
        for a,b in zip(ids,ids[1:]):values.append(values[-1]+(Vector(vertices[b])-Vector(vertices[a])).length)
        across[i]=values
    for i in range(n):
        j=(i+1)%n
        for band in range(3):
            ids=(profiles[i][band],profiles[i][band+1],profiles[j][band+1],profiles[j][band])
            u0,u1=along[i]/.52,along[i+1]/.52
            Face(ids,[(u0,.045+across[i][band]/.52),(u0,.045+across[i][band+1]/.52),
                      (u1,.045+across[j][band+1]/.52),(u1,.045+across[j][band]/.52)])
    mesh=bpy.data.meshes.new(name+'Mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='SelectedCFaceAndCutAtlas')
    for poly,coords in zip(mesh.polygons,faceUvs):
        poly.use_smooth=True
        for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
    mesh.normals_split_custom_set([normals[loop.vertex_index] for loop in mesh.loops])
    mesh.materials.append(mat)
    minimum=[min(v.co[k] for v in mesh.vertices) for k in range(3)];maximum=[max(v.co[k] for v in mesh.vertices) for k in range(3)]
    offset=Vector(((minimum[0]+maximum[0])/2,(minimum[1]+maximum[1])/2,minimum[2]))
    for vertex in mesh.vertices:vertex.co-=offset
    mesh.update();mesh.calc_loop_triangles();assert len(mesh.loop_triangles)==768
    bm=bmesh.new();bm.from_mesh(mesh);assert all(edge.is_manifold and edge.is_contiguous for edge in bm.edges);bm.free()
    root=bpy.data.objects.new(name,None);obj=bpy.data.objects.new(name+'Surface',mesh);scene.collection.objects.link(root);scene.collection.objects.link(obj);obj.parent=root
    root['state']='bitten half' if half else 'unfolded full sheet';root['selection']='user-selected C, only flat forms';root['nominal_thickness_m']=.0042*THICKNESS_SCALE
    return root,obj

states=[FoodState('Pancake_Open'),FoodState('Pancake_BittenHalf',True)]
bpy.context.view_layer.update()
measurements={}
for root,obj in states:
    mesh=obj.data;mesh.calc_loop_triangles();low=[min(v.co[i] for v in mesh.vertices) for i in range(3)];high=[max(v.co[i] for v in mesh.vertices) for i in range(3)]
    measurements[root.name]={'dimensions_blender_zup_m':[high[i]-low[i] for i in range(3)],'bounds_min_m':low,
                             'triangles':len(mesh.loop_triangles),'material':mat.name,'nominal_sheet_thickness_m':.0042*THICKNESS_SCALE,
                             'thickness_design_range_m':[min(Thickness(p.x,p.y) for p in Contour('Bitten' in root.name)),max(Thickness(p.x,p.y) for p in Contour('Bitten' in root.name))]}
    print('SELECTED_C_STATE',root.name,measurements[root.name])
(OUT/'Data_K07Measurements.json').write_text(json.dumps(measurements,indent=2),encoding='utf-8')

def FinalizeExportedTangents(path):
    """Finalize Blender 5.2's serialized tangent frames in this GLB only.

    Orthogonalize and normalize serialized XYZ against the stored normal.
    Preserve the exporter's MikkTSpace W: glTF's normal-map convention is
    not the raw UV-derivative/custom computeTangents convention. The real
    GLTFLoader/WebGL study agrees with original W and its absent-TANGENT
    path, including a known positive-green normal diagnostic.
    Positions, normals, indices, UV and image bytes are not rewritten.
    No exporter or global Blender settings are patched.
    """
    import struct
    payload = bytearray(path.read_bytes())
    beforeHash = hashlib.sha256(payload).hexdigest()
    jsonLength, jsonType = struct.unpack_from('<II', payload, 12)
    assert jsonType == 0x4E4F534A
    document = json.loads(payload[20:20+jsonLength])
    binaryHeader = 20+jsonLength
    _, binaryType = struct.unpack_from('<II', payload, binaryHeader)
    assert binaryType == 0x004E4942
    binaryStart = binaryHeader+8
    def Layout(index, width):
        accessor = document['accessors'][index]
        assert accessor['componentType'] == 5126 and accessor['type'] == f'VEC{width}'
        view = document['bufferViews'][accessor['bufferView']]
        offset = binaryStart+view.get('byteOffset',0)+accessor.get('byteOffset',0)
        return offset, view.get('byteStride',width*4), accessor['count']
    corrected = set()
    records = []
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            tangentIndex = attributes['TANGENT']
            if tangentIndex in corrected: continue
            corrected.add(tangentIndex)
            tangentStart, tangentStride, count = Layout(tangentIndex, 4)
            normalStart, normalStride, normalCount = Layout(attributes['NORMAL'], 3)
            assert 'min' not in document['accessors'][tangentIndex] and 'max' not in document['accessors'][tangentIndex]
            assert normalCount == count
            beforeUnit = beforeDot = afterUnit = afterDot = 0.0
            for index in range(count):
                normal = struct.unpack_from('<fff',payload,normalStart+index*normalStride)
                tangentOffset = tangentStart+index*tangentStride
                values = struct.unpack_from('<ffff',payload,tangentOffset)
                tangent, handedness = values[:3], values[3]
                assert handedness in (-1.0,1.0) and all(math.isfinite(value) for value in (*normal,*values))
                normalSquared = sum(value*value for value in normal)
                beforeUnit = max(beforeUnit,abs(math.sqrt(sum(value*value for value in tangent))-1))
                projection = sum(a*b for a,b in zip(normal,tangent))
                beforeDot = max(beforeDot,abs(projection))
                tangent = [value-axis*projection/normalSquared for value,axis in zip(tangent,normal)]
                length = math.sqrt(sum(value*value for value in tangent))
                assert normalSquared>.99 and length>.5
                struct.pack_into('<fff',payload,tangentOffset,*(value/length for value in tangent))
                stored = struct.unpack_from('<fff',payload,tangentOffset)
                afterUnit = max(afterUnit,abs(math.sqrt(sum(value*value for value in stored))-1))
                afterDot = max(afterDot,abs(sum(a*b for a,b in zip(normal,stored))))
            records.append({'mesh':mesh['name'],'tangent_count':count,
                            'before_unit_error_max':beforeUnit,'before_normal_dot_abs_max':beforeDot,
                            'after_unit_error_max':afterUnit,'after_normal_dot_abs_max':afterDot,
                            'exporter_handedness_w_preserved':True,'handedness_signs_changed':0})
    path.write_bytes(payload)
    receipt = {'method':'Gram-Schmidt/normalize serialized tangent XYZ only; preserve original MikkTSpace W',
               'reason':'Blender 5.2 rounds tangent XYZ to four decimals; handedness follows the export format, not a raw UV derivative test',
               'exported_before_sha256':beforeHash,'glb_sha256':hashlib.sha256(payload).hexdigest(),
               'meshes':records}
    validation = OUT/'TangentConventionStudy_20261030'/'Data_TangentConventionDecision.json'
    if validation.is_file():
        receipt['historical_gltf_convention_decision_sha256'] = hashlib.sha256(validation.read_bytes()).hexdigest()
    (OUT/'Data_K07ExportTangentCorrection.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')

bpy.ops.object.select_all(action='DESELECT')
for root,obj in states:root.select_set(True);obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Model_K07_Pancakes.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
                          export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True)
FinalizeExportedTangents(OUT/'Model_K07_Pancakes.glb')
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=500;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('SelectedCNeutralWorld');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.57,.57,.57,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
for name,position,power,size in [('Key',(-1.2,-1.5,2.5),120,3),('Fill',(1.4,.8,1.6),60,2.5)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=position;light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('SelectedCReviewCamera');camera=bpy.data.objects.new('SelectedCReviewCamera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Scene_K07_Pancakes.blend'))
renders=OUT/'SelectedCReview500';renders.mkdir(exist_ok=True)
for root,obj in states:
    for _,other in states:other.hide_render=other!=obj
    for label,position,target,span in [('Angle',(.9,-1.1,1.35),(0,0,.002),.62),('Top',(0,0,2),(0,0,0),.62),
                                      ('Side',(0,-2,.004),(0,0,.002),.55),('Surface',(.32,-.38,.32),(0,0,.002),.24),
                                      ('Edge',(0,-.7,.06),(0,-.245 if root.name=='Pancake_Open' else -.124,.002),.055)]:
        camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=span
        scene.render.filepath=str(renders/f'{root.name}_{label}_500.png');bpy.ops.render.render(write_still=True)
for _,obj in states:obj.hide_render=False
print('K07_SELECTED_C_TWO_FORMS_DONE',hashlib.sha256((OUT/'Model_K07_Pancakes.glb').read_bytes()).hexdigest())
