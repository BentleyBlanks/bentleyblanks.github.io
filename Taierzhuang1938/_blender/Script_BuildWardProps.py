"""First-level M15/M16 ward furniture and medical vessels, authored in Blender.

Run via Script_BlenderMcp in the task's dedicated empty scene:
  exec --code "import runpy; runpy.run_path(r'<repo>/Taierzhuang1938/_blender/Script_BuildWardProps.py', run_name='__main__')"
Coordinates are game metres, Y up, front -Z; GLB export_yup=False. Each library
root is independently reusable. Source components remain editable in the .blend;
export copies are merged by asset, preserving UVs and material slots.
No generated texture artwork: wood reuses the project's VillageTimber PBR;
vessel rims, handles, insets, seams and enamel chips are actual geometry.
"""
import bpy, bmesh, math, json, os, hashlib, struct
from pathlib import Path
from mathutils import Vector, Matrix

projectDir = Path(__file__).resolve().parents[1]
sourceDir = Path(os.environ.get('WARD_PROPS_SOURCE_DIR', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\WardPropsM15M16'))
blendPath = sourceDir / 'Scene_WardProps.blend'
modelPath = projectDir / 'Model' / 'Model_WardProps.glb'
reviewDir = sourceDir / 'Review'
sourceDir.mkdir(parents=True, exist_ok=True)
reviewDir.mkdir(exist_ok=True)
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != blendPath.resolve():
    raise RuntimeError('Refusing to replace an unrelated Blender source: ' + bpy.data.filepath)
if not bpy.data.filepath and bpy.context.scene.get('BlenderMcpTask') != 'WardPropsM15M16':
    raise RuntimeError('Start an independent WardPropsM15M16 Blender scene first')
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'WardPropsM15M16'
scene['AssetConvention'] = 'Metres; Y up; front -Z; static furniture and medical props only'
scene.unit_settings.system = 'METRIC'
assets = {}
materials = {}
currentRoot = None


def Material(name, color, roughness=.65, metalness=0):
    material = bpy.data.materials.new('Ward' + name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    material.diffuse_color = (*color, 1)
    materials[name] = material
    return material


def WoodMaterial():
    material = Material('Timber', (.32, .25, .17), .82)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    for channel in ['Base', 'Normal', 'Orm']:
        image = bpy.data.images.load(str(projectDir / 'Texture' / ('Texture_VillageTimber' + channel + '.webp')), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
        image.pack()
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        if channel == 'Base':
            tint = nodes.new('ShaderNodeMixRGB')
            tint.blend_type = 'MULTIPLY'
            tint.inputs[0].default_value = 1
            tint.inputs[2].default_value = (.48, .39, .28, 1)
            links.new(texture.outputs['Color'], tint.inputs[1])
            links.new(tint.outputs[0], shader.inputs['Base Color'])
        elif channel == 'Normal':
            normal = nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value = .6
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        else:
            split = nodes.new('ShaderNodeSeparateColor')
            links.new(texture.outputs['Color'], split.inputs['Color'])
            links.new(split.outputs['Green'], shader.inputs['Roughness'])
    return material


WoodMaterial()
Material('Iron', (.055, .046, .034), .68, .65)
Material('Cork', (.28, .17, .075), .93)
Material('Paper', (.68, .60, .43), .96)
Material('AmberGlass', (.12, .047, .013), .19)
Material('GreenGlass', (.035, .105, .07), .22)
Material('Ceramic', (.14, .061, .025), .3)
Material('CeramicRim', (.30, .21, .13), .78)
Material('Enamel', (.62, .65, .59), .24)
Material('EnamelBlue', (.027, .075, .11), .28)
Material('Cloth', (.53, .48, .36), .97)


def Asset(name, display):
    global currentRoot
    currentRoot = bpy.data.objects.new(name + 'Source', None)
    scene.collection.objects.link(currentRoot)
    currentRoot.location = display
    currentRoot['AssetId'] = name
    currentRoot['Forward'] = '-Z'
    assets[name] = currentRoot


def Mesh(name, vertices, faces, material, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = currentRoot
    obj.data.materials.append(materials[material])
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return obj


def ProjectUv(obj, grainAxis=1, tileM=.7):
    mesh = obj.data
    uv = mesh.uv_layers.new(name='UVMap') if not mesh.uv_layers else mesh.uv_layers.active
    seed = sum(ord(c) for c in obj.name)
    offset = (seed % 97) / 97
    for polygon in mesh.polygons:
        dominant = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
        plane = [axis for axis in range(3) if axis != dominant]
        along = grainAxis if grainAxis in plane else plane[1]
        across = next(axis for axis in plane if axis != along)
        for loopIndex in polygon.loop_indices:
            p = mesh.vertices[mesh.loops[loopIndex].vertex_index].co
            uv.data[loopIndex].uv = (p[across] / tileM + offset, p[along] / tileM + offset * .71)


def Box(name, size, center, material='Timber', bevel=.004, rotation=None):
    w, h, d = size
    vertices = [(x*w/2, y*h/2, z*d/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    obj = Mesh(name, vertices, faces, material)
    if bevel:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel,min(size)*.18), segments=2, affect='EDGES')
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
    ProjectUv(obj, max(range(3), key=lambda axis:size[axis]))
    obj.location = center
    if rotation:
        obj.rotation_euler = rotation
    return obj


def Lathe(name, profile, center=(0,0,0), material='Ceramic', segments=32, scale=(1,1,1)):
    vertices = []
    for radius, height in profile:
        for i in range(segments):
            angle = 2*math.pi*i/segments
            vertices.append((radius*math.sin(angle)*scale[0], height*scale[1], radius*math.cos(angle)*scale[2]))
    faces = []
    for j in range(len(profile)-1):
        for i in range(segments):
            k = (i+1)%segments
            faces.append((j*segments+i,j*segments+k,(j+1)*segments+k,(j+1)*segments+i))
    obj = Mesh(name, vertices, faces, material, True)
    obj.location = center
    ProjectUv(obj)
    return obj


def Ring(name, center, radius, tube, material='Iron', axis='z', segments=20, minor=6):
    vertices, faces = [], []
    for i in range(segments):
        u = 2*math.pi*i/segments
        for j in range(minor):
            v = 2*math.pi*j/minor
            point = ((radius+tube*math.cos(v))*math.sin(u),(radius+tube*math.cos(v))*math.cos(u),tube*math.sin(v))
            if axis == 'y': point = (point[0],point[2],point[1])
            vertices.append(point)
    for i in range(segments):
        for j in range(minor):
            faces.append((i*minor+j,((i+1)%segments)*minor+j,((i+1)%segments)*minor+(j+1)%minor,i*minor+(j+1)%minor))
    obj = Mesh(name, vertices, faces, material, True)
    obj.location = center
    ProjectUv(obj)
    return obj


def Handle(name, x, y, z, small=False):
    size = .025 if small else .035
    Box(name+'Plate', (size*1.45,size*1.7,.004), (x,y,z), 'Iron', .001)
    Ring(name+'Ring', (x,y-size*.48,z-.008), size*.47,.0024,'Iron',segments=16)


def Bottle(name, x=0, y=0, z=0, height=.20, radius=.042, green=False):
    r, h = radius, height
    profile=[(0,0),(r*.85,0),(r,.016*h),(r,.12*h),(r,.67*h),(r*.92,.73*h),(r*.42,.82*h),(r*.40,.94*h),(r*.49,.95*h),(r*.49,.985*h),(r*.35,h),(0,h)]
    Lathe(name+'Body',profile,(x,y,z),'GreenGlass' if green else 'AmberGlass')
    Lathe(name+'Stopper',[(0,0),(r*.33,0),(r*.36,h*.04),(r*.30,h*.065),(0,h*.065)],(x,y+h*.972,z),'Cork',24)
    # Paper labels follow the bottle curvature, never float on a square plaque.
    angles=[math.pi-.52+i*1.04/10 for i in range(11)]
    vertices=[(x+(r+.0005)*math.sin(a),y+h*t,z+(r+.0005)*math.cos(a)) for t in [.25,.59] for a in angles]
    obj=Mesh(name+'Label',vertices,[(i,i+1,i+12,i+11) for i in range(10)],'Paper',True)
    ProjectUv(obj)
    return h*1.037


def Jar(name, x=0,y=0,z=0,height=.14,radius=.045):
    r,h=radius,height
    Lathe(name+'Body',[(0,0),(r*.76,0),(r*.93,h*.06),(r,h*.2),(r*.97,h*.63),(r*.82,h*.8),(r*.77,h*.87),(r*.7,h*.91),(0,h*.91)],(x,y,z),'Ceramic')
    Ring(name+'FootRing',(x,y+.012,z),r*.87,.0022,'CeramicRim','y',24)
    Lathe(name+'Lid',[(0,0),(r*.82,0),(r*.88,h*.025),(r*.82,h*.07),(r*.27,h*.1),(r*.19,h*.14),(0,h*.14)],(x,y+h*.86,z),'Ceramic')


def Bandage(name, x=0,y=0,z=0,scale=1):
    # Open rolled gauze with a genuine central hole and several winding edges.
    r=.028*scale; h=.055*scale
    obj=Lathe(name+'Roll',[(r*.28,0),(r,0),(r,h),(r*.28,h),(r*.28,0)],(x,y,z),'Cloth',28)
    for i in range(4):
        Ring(name+'Winding'+str(i),(x,y+h+.0002,z),r*(.4+i*.15),.00065*scale,'Cloth','y',24,4)
    return obj


def Cabinet():
    Asset('WardMedicineCabinet',(-3.1,0,0))
    # Stiles and feet, recessed plank sides, framed lower doors, twelve upper drawers.
    for x in [-.935,.935]:
        for z in [-.237,.237]: Box('CabinetStile',(.095,1.91,.09),(x,.955,z))
    for x in [-.955,.955]:
        for i in range(4): Box('CabinetSideBoard',(.034,1.7,.105),(x,.98,-.173+i*.116))
    for i in range(11): Box('CabinetBackBoard',(.166,1.73,.025),(-.86+i*.172,.98,.255))
    for y,h in [(.135,.11),(.89,.055),(1.91,.08),(1.978,.044)]:
        Box('CabinetRail',(2 if y>1.9 else 1.87,h,.55),(0,y,0),bevel=.006)
    for i in range(2):
        x=-.456+i*.912
        Box('CabinetDoorInset',(.78,.62,.027),(x,.508,-.247))
        for dx in [-.398,.398]: Box('CabinetDoorStile',(.055,.72,.048),(x+dx,.51,-.262))
        for y in [.177,.842]: Box('CabinetDoorRail',(.85,.055,.048),(x,y,-.262))
        Handle('CabinetDoorHandle',x+(.29 if i==0 else -.29),.58,-.291)
        for y in [.3,.73]:Box('CabinetDoorHinge',(.047,.07,.006),(x+(-.42 if i==0 else .42),y,-.29),'Iron',.002)
    for row in range(3):
        for col in range(4):
            x=-.681+col*.454; y=1.073+row*.293
            Box('ApothecaryDrawer',(.44,.273,.05),(x,y,-.263),bevel=.006)
            Box('DrawerInset',(.355,.195,.012),(x,y,-.292),bevel=.005)
            Handle('DrawerHandle',x,y-.028,-.303,True)
            Box('DrawerLabel',(.105,.038,.002),(x,y+.069,-.300),'Paper',.0007)
    Box('CabinetCentreStile',(.05,.74,.05),(0,.51,-.268))


def Shelf():
    Asset('WardStockedShelf',(0,0,0))
    for x in [-1.06,1.06]:
        for z in [-.264,.264]: Box('ShelfPost',(.075,1.9,.072),(x,.95,z))
    for i in range(10):Box('ShelfBackSlat',(.21,1.73,.02),(-.97+i*.215,.99,.29))
    for level in [.16,.55,1.05,1.55,1.866]:
        for j in range(3):Box('ShelfPlank',(2.2,.035,.204),(0,level,-.212+j*.208),bevel=.003)
        Box('ShelfFrontLip',(2.19,.05,.018),(0,level+.01,-.317),bevel=.002)
    for row,y in enumerate([.568,1.068,1.568]):
        for j in range(7):
            x=-.86+j*.28+(row%2)*.025
            if (j+row)%3==0:Jar('ShelfMedicineJar',x,y,-.16,.15+(j%2)*.025,.054)
            else:Bottle('ShelfMedicineBottle',x,y,-.165,.21 if j%2 else .18,.043,green=(j+row)%2==0)
        # One wrapped packet on each level, behind the front row.
        Box('ShelfDressingPacket',(.25,.075,.13),(.6-row*.65,y+.037,.095),'Cloth',.01)
        Box('ShelfPacketTie',(.028,.079,.133),(.6-row*.65,y+.039,.095),'Paper',.001)
    for i in range(3):Bandage('LowerShelfBandage',-.55+i*.28,.177,-.06,1.45)


def Table():
    Asset('WardTreatmentTable',(2.45,0,0))
    for x in [-.374,.374]:
        for z in [-.224,.224]:
            Box('TableLeg',(.065,.738,.065),(x,.369,z),bevel=.005)
    for z in [-.232,.232]:Box('TableApron',(.81,.14,.037),(0,.642,z))
    for x in [-.381,.381]:Box('TableEndApron',(.04,.14,.47),(x,.642,0))
    Box('TableLowStretcher',(.77,.055,.045),(0,.22,0))
    for x in [-.375,.375]:Box('TableEndStretcher',(.035,.055,.45),(x,.22,0))
    for j in range(4):Box('TableTopBoard',(.9,.044,.145),(0,.758,-.225+j*.15),bevel=.004)
    Box('TableDrawer',(.36,.095,.025),(0,.657,-.266),bevel=.004)
    Handle('TableDrawerPull',0,.65,-.282,True)
    for x in [-.38,.38]:
        for z in [-.245,.245]:Box('TablePeg',(.012,.001,.012),(x,.7805,z),'Cork',.001)


def Stool():
    Asset('WardWoodStool',(3.4,0,-1.05))
    for x in [-.124,.124]:
        for z in [-.124,.124]:Box('StoolLeg',(.045,.38,.045),(x,.19,z),bevel=.004,rotation=(z*.15,0,-x*.15))
    for z in [-.125,.125]:Box('StoolRung',(.275,.035,.03),(0,.15,z))
    for x in [-.125,.125]:Box('StoolRung',(.03,.035,.275),(x,.21,0))
    for i in [-1,1]:Box('StoolSeat',(.36,.045,.177),(0,.3975,i*.091),bevel=.008)


def Bench():
    Asset('WardWoodBench',(.05,0,1.25))
    for x in [-.61,.61]:
        for z in [-.125,.125]:Box('BenchLeg',(.075,.4,.067),(x,.2,z),bevel=.005)
        Box('BenchEndRail',(.08,.1,.35),(x,.345,0))
    Box('BenchStretcher',(1.25,.075,.07),(0,.19,0))
    for j in [-1,1]:Box('BenchSeat',(1.6,.05,.197),(0,.425,j*.102),bevel=.006)


def Basin():
    Asset('WardEnamelBasin',(-.60,.02,-1.65))
    # Continuous closed vessel section: underside -> rolled lip -> inner bowl.
    profile=[(0,0),(.155,0),(.18,.008),(.2,.025),(.224,.065),(.247,.112),(.25,.118),(.247,.125),(.237,.127),(.231,.12),(.211,.072),(.19,.034),(.167,.018),(0,.018)]
    Lathe('EnamelBasinBody',profile,material='Enamel',segments=64,scale=(1,1,.9))
    rim=Ring('EnamelRolledRim',(0,.122,0),.242,.006,'EnamelBlue','y',64,8)
    rim.scale.z=.9
    for i,angle in enumerate([.2,1.4,2.8,4.9]):
        x=.241*math.sin(angle);z=.241*math.cos(angle)*.9
        Box('EnamelRimChip',(.013,.004,.009),(x,.128,z),'Iron',.001,rotation=(0,angle,0))


def SmallAssets():
    Asset('WardAmberBottle',(-1.56,.02,-1.65));Bottle('AmberMedicineBottle',height=.23)
    Asset('WardGreenBottle',(-1.30,.02,-1.65));Bottle('GreenMedicineBottle',height=.19,green=True)
    Asset('WardCeramicJar',(-1.01,.02,-1.65));Jar('GlazedMedicineJar')
    Asset('WardBandageRoll',(-.18,.02,-1.65));Bandage('Gauze')
    Asset('WardDressingBundle',(.12,.02,-1.65))
    for i in range(4):Box('FoldedGauze',(.17-i*.004,.012,.12),(0,.009+i*.011,0),'Cloth',.004)
    Box('GauzeTie',(.019,.053,.122),(0,.027,0),'Paper',.002)


def Export():
    exportObjects=[]
    audit=[]
    for name,root in assets.items():
        bpy.ops.object.select_all(action='DESELECT')
        copies=[]
        for source in root.children:
            obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
            obj.parent=None
            obj.matrix_world=source.matrix_local.copy()
            obj.select_set(True);copies.append(obj)
        bpy.context.view_layer.objects.active=copies[0]
        bpy.ops.object.join()
        merged=bpy.context.object
        merged.name=name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        merged.data.calc_loop_triangles()
        points=[v.co for v in merged.data.vertices]
        bounds={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
        merged['AssetId']=name;merged['Forward']='-Z';merged['Units']='metres'
        merged['DimensionsM']=[round(bounds['max'][i]-bounds['min'][i],6) for i in range(3)]
        audit.append({'id':name,'triangles':len(merged.data.loop_triangles),'bounds':bounds,'dimensions':list(merged['DimensionsM'])})
        exportObjects.append(merged)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in exportObjects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(modelPath),export_format='GLB',use_selection=True,export_yup=False,
        export_animations=False,export_extras=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True)
    # Blender 5.2 exports the untouched WebP for MixRGB(MULTIPLY), but drops the
    # constant multiplier. Carry the same linear tint as a standard glTF factor.
    raw=modelPath.read_bytes()
    jsonLength=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+jsonLength])
    for material in doc['materials']:
        if material['name']=='WardTimber':material['pbrMetallicRoughness']['baseColorFactor']=[.48,.39,.28,1]
    encoded=json.dumps(doc,separators=(',',':')).encode('utf-8')
    encoded+=b' '*((-len(encoded))%4)
    binary=raw[20+jsonLength:]
    modelPath.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+binary)
    for obj in exportObjects:bpy.data.objects.remove(obj,do_unlink=True)
    manifest={'version':'20261011','generator':'_blender/Script_BuildWardProps.py','coordinateSystem':'Y up, -Z front, metres',
        'materials':list(materials.keys()),'woodSource':'Texture/Texture_VillageTimber{Base,Normal,Orm}.webp',
        'assets':audit,'bytes':modelPath.stat().st_size,'sha256':hashlib.sha256(modelPath.read_bytes()).hexdigest()}
    (projectDir/'Model'/'Data_WardProps.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'assets':len(audit),'triangles':sum(a['triangles'] for a in audit),'bytes':manifest['bytes']}))


def LookAt(obj,point):
    forward=(Vector(point)-obj.location).normalized()
    right=forward.cross(Vector((0,1,0))).normalized()
    up=right.cross(forward).normalized()
    obj.rotation_euler=Matrix((right,up,-forward)).transposed().to_euler()


def Review():
    global currentRoot
    currentRoot=None
    Material('ReviewFloor',(.12,.13,.14),.9)
    floor=Box('ReviewFloor',(16,.05,10),(0,-.045,0),'ReviewFloor',0)
    floor.hide_select=True
    scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.3,.34,.4,1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
    for name,at,power,size in [('Key',(-3,6,-5),1450,6),('Fill',(5,4,-2),900,5),('Rim',(0,6,4),1200,4)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=at;LookAt(light,(0,.8,0))
    camera=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'))
    scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.data.lens=55
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    camera.location=(6,5.6,-9);LookAt(camera,(0,.85,.1));camera.data.ortho_scale=9.3
    scene.render.filepath=str(reviewDir/'WardFurniture.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(blendPath))
    if os.environ.get('WARD_PROPS_RENDER','1')!='0':bpy.ops.render.render(write_still=True)
    # The small objects have their own close-up without scaling the source asset.
    camera.location=(-.1,.75,-3.6);LookAt(camera,(-.70,.10,-1.65));camera.data.ortho_scale=2.1
    scene.render.filepath=str(reviewDir/'WardMedical.png')
    if os.environ.get('WARD_PROPS_RENDER','1')!='0':bpy.ops.render.render(write_still=True)
    camera.location=(6,5.6,-9);LookAt(camera,(0,.85,.1));camera.data.ortho_scale=9.3
    bpy.ops.wm.save_as_mainfile(filepath=str(blendPath))


Cabinet();Shelf();Table();Stool();Bench();Basin();SmallAssets()
bpy.context.view_layer.update()
Export();Review()
print('Saved editable source:',blendPath)
