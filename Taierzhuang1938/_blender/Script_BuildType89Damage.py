"""BlenderMCP rebuild: existing Type89 TZM + articulated broken track and engine cover.

Call LoadTank(), BuildDamage(), ExportDamage() separately in the task's Blender.
Source scene uses game coordinates (Y up, nose -Z) to preserve the TZM geometry.
"""
import bpy, math, json, base64, struct, os, hashlib
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Damage'

def Unpack(text, fmt):
    raw = base64.b64decode(text)
    return struct.unpack('<' + fmt * (len(raw) // struct.calcsize(fmt)), raw)

def Mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

def Material(name, color, texture=None):
    mat = bpy.data.materials.new(name); mat.diffuse_color = (*color, 1); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .88
    if texture:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(ROOT, 'Texture', texture), check_existing=True)
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

def LoadTank():
    assert 'Type89Damage' in bpy.data.filepath, 'Wrong Blender project'
    for obj in list(bpy.context.scene.objects): bpy.data.objects.remove(obj, do_unlink=True)
    global doc, originals, armor, track, steel, scorch
    doc = json.load(open(os.path.join(ROOT, 'Model', 'Model_Type89Tank.tzm.json'), encoding='utf8'))
    armor = Material('Material_Type89Armor', (.27,.23,.12), 'Texture_Type89ArmorBase.webp')
    track = Material('Material_Type89Track', (.16,.16,.14), 'Texture_Type89TrackBase.webp')
    steel = Material('Material_FracturedTrackSteel', (.035,.032,.025))
    scorch = Material('Material_EngineScorch', (.045,.038,.026))
    originals=[]
    for i, block in enumerate(doc['meshes']):
        q = Unpack(block['pos'],'H'); idx=Unpack(block['idx'],'I' if block['idxBits']==32 else 'H')
        vertices = [[block['posMin'][a]+q[v*3+a]*block['posScale'][a] for a in range(3)] for v in range(block['count'])]
        if i>=2:
            offset=doc['nodes'][2]['t']; vertices=[[p[a]+offset[a] for a in range(3)] for p in vertices]
        obj=Mesh(['Hull','Track','Turret','Barrel'][i],vertices,[idx[j:j+3] for j in range(0,len(idx),3)],track if i==1 else armor)
        quv=Unpack(block['uv'],'H'); uv=obj.data.uv_layers.new()
        for loop in obj.data.loops:
            uv.data[loop.index].uv=[block['uvMin'][a]+quv[loop.vertex_index*2+a]*block['uvScale'][a] for a in range(2)]
        normals=Unpack(block['nrm'],'b')
        obj.data.normals_split_custom_set_from_vertices([Vector(normals[v*3:v*3+3]).normalized() for v in range(block['count'])])
        originals.append(obj)
    print('Imported original tank:', [(o.name,len(o.data.polygons)) for o in originals])
    print('Track bounds:',[(min(v.co[a] for v in originals[1].data.vertices),max(v.co[a] for v in originals[1].data.vertices)) for a in range(3)])

def ReviewCamera():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.world.color=(.25,.25,.25)
    bpy.ops.object.camera_add(location=(-6.5,4.0,-6.8)); camera=bpy.context.object;camera.name='Camera_DamageReview'
    direction=(Vector((0,.9,0))-camera.location).normalized(); right=direction.cross(Vector((0,1,0))).normalized();up=right.cross(direction)
    camera.rotation_euler=Matrix((right,up,-direction)).transposed().to_quaternion().to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=6.8;scene.camera=camera
    for name,loc,power,size in [('Key',(-4,7,-4),1700,5),('Fill',(5,4,0),1000,4),('Rim',(-2,4,5),1300,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name='Light_'+name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    ground=Material('Material_ReviewGround',(.14,.13,.10))
    Mesh('Scene_ReviewGround',[(-200,-.025,-200),(200,-.025,-200),(200,-.025,200),(-200,-.025,200)],[(0,3,2,1)],ground)
    scene.view_settings.view_transform='AgX'
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D': area.spaces.active.region_3d.view_perspective='CAMERA'
    os.makedirs(OUT,exist_ok=True)
    scene.render.filepath=os.path.join(OUT,'Scene_Type89Before.png')
    bpy.ops.render.render(write_still=True)

def BoxMesh(name, size, material, bevel=.008):
    bpy.ops.mesh.primitive_cube_add()
    obj=bpy.context.object;obj.name=name
    obj.scale=Vector(size)*.5
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        mod=obj.modifiers.new('FractureEdge','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def Key(obj, frame, position, rotation=(0,0,0)):
    obj.location=position;obj.rotation_euler=rotation
    obj.keyframe_insert(data_path='location',frame=frame)
    obj.keyframe_insert(data_path='rotation_euler',frame=frame)

def BuildDamage():
    global parts, masks, hullMotion
    scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=73
    parts=[];masks={}
    trackObj=bpy.data.objects['Track'];hull=bpy.data.objects['Hull']
    # Cut the actual front track arc on the struck side; wheels live in Hull.
    for side in [-1,1]:
        masks[str(side)]=[p.index for p in trackObj.data.polygons if p.center.x*side>.65 and p.center.z < -1.36]
    # Separate the existing engine-deck surface with its original atlas UVs.
    deck=[p.index for p in hull.data.polygons if p.normal.y>.8 and all(abs(hull.data.vertices[i].co.x)<.73 and hull.data.vertices[i].co.y>1.3 for i in p.vertices) and max(hull.data.vertices[i].co.z for i in p.vertices)>.9]
    masks['deck']=deck
    pivot=Vector((-.721,1.54,.406))
    verts=[];faces=[];uvs=[]
    sourceUv=hull.data.uv_layers.active
    for pi in deck:
        poly=hull.data.polygons[pi];start=len(verts)
        for li in poly.loop_indices:
            verts.append(tuple(hull.data.vertices[hull.data.loops[li].vertex_index].co-pivot));uvs.append(tuple(sourceUv.data[li].uv))
        faces.append(tuple(range(start,len(verts))))
    cover=Mesh('EngineDeck',verts,faces,armor);cover['attach']='hull';cover['mirror']=False
    uv=cover.data.uv_layers.new()
    for loop in cover.data.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    for f,angle,dy in [(1,0,0),(4,.18,.03),(12,.42,.02),(24,.25,0),(43,.32,0),(73,.32,0)]:
        Key(cover,f,pivot+Vector((0,dy,0)),(0,0,angle))
    parts.append(cover)
    bay=BoxMesh('EngineBay',(1.38,.05,1.13),scorch);bay['attach']='hull';bay['mirror']=False
    Key(bay,1,(0,1.46,.406),(.266,0,0));Key(bay,73,(0,1.46,.406),(.266,0,0));parts.append(bay)
    # Broken shoes retain individual pins and raised grousers. Joined per shoe,
    # then animated as rigid pieces so the game's velocity pass sees real motion.
    for i in range(13):
        shoe=BoxMesh('TrackShoe_%02d'%i,(.34,.055,.215),steel)
        rib=BoxMesh('Grouser',(.35,.035,.028),steel);rib.location.y=.038
        bpy.ops.object.select_all(action='DESELECT');shoe.select_set(True);rib.select_set(True);bpy.context.view_layer.objects.active=shoe;bpy.ops.object.join()
        shoe['attach']='ground';shoe['mirror']=True
        if i<9:
            theta=i*.24
            start=Vector((-.89,1.19-.095*i,-1.78-.06*i))
            end=Vector((-.91-.018*i,[1.17,.995,.82,.645,.47,.295,.12,.064,.064][i],[-1.76,-1.82,-1.88,-1.94,-2,-2.06,-2.15,-2.33,-2.53][i]))
            angle=[1.25,1.25,1.25,1.25,1.25,1.15,.72,.12,0][i]
            mid=start+Vector((-.10-.025*i,.13*math.sin(theta),-.16-.04*i))
            Key(shoe,1,start,(1.06,0,0));Key(shoe,6,mid,(.6+.09*i,.06*i,0))
            Key(shoe,23,end+Vector((-.07,.07,-.07)),(1.1,.06*i,.06))
            Key(shoe,43,end,(angle,.025*i,.02));Key(shoe,73,end,(angle,.025*i,.02))
        else:
            j=i-9;start=Vector((-.9,.47-.1*j,-2.06+.18*j));end=Vector((-1.44-.26*j+(.13 if j%2 else 0),.048,-2.12+.36*j+(.2 if j==2 else 0)))
            Key(shoe,1,start,(.75,0,0));Key(shoe,8,(start+end)*.5+Vector((0,.72+.13*j,0)),(1.4,.7*j,.5))
            Key(shoe,26+j*2,end,(0,.3+.49*j,.08));Key(shoe,32+j*2,end+Vector((-.06,.095,0)),(.15,.3+.49*j,0))
            Key(shoe,42+j*2,end+Vector((-.1,0,.06)),(0,.3+.49*j,.015));Key(shoe,73,end+Vector((-.1,0,.06)),(0,.3+.49*j,.015))
        parts.append(shoe)
    # Buckled plate with an uneven torn edge, hinged away from the front idler.
    panel=Mesh('TornFender',[(-.19,0,-.30),(.19,0,-.30),(.19,.03,.12),(.08,.08,.20),(.04,.01,.12),(-.05,.06,.22),(-.19,.03,.16)],[(0,1,2,3,4,5,6)],steel)
    panel['attach']='hull';panel['mirror']=True
    mod=panel.modifiers.new('ArmorThickness','SOLIDIFY');mod.thickness=.018
    bpy.context.view_layer.objects.active=panel;bpy.ops.object.modifier_apply(modifier=mod.name)
    for f,r in [(1,0),(5,-.6),(14,-.9),(33,-.7),(73,-.7)]:Key(panel,f,(-.88,1.23,-1.68),(r,0,-.22))
    parts.append(panel)
    hullMotion=bpy.data.objects.new('HullSettle',None);scene.collection.objects.link(hullMotion)
    for f,p,r in [(1,(0,0,0),(0,0,0)),(4,(.018,.055,.045),(-.025,0,-.025)),(11,(-.018,-.025,.065),(.012,0,.026)),(23,(0,-.012,.065),(-.006,0,.018)),(42,(0,-.01,.065),(0,0,.01)),(73,(0,-.01,.065),(0,0,.01))]:Key(hullMotion,f,p,r)
    # Preview cut state. Source file and runtime intact geometry stay untouched.
    for obj,remove in [(trackObj,set(masks['-1'])),(hull,set(deck))]:
        import bmesh
        bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES');bm.to_mesh(obj.data);bm.free()
    for obj in originals:obj.parent=hullMotion
    for obj in parts:
        if obj.get('attach')=='hull':obj.parent=hullMotion
    scene.frame_set(73)
    print('Damage cut masks:',{k:len(v) for k,v in masks.items()},'animated parts:',len(parts))

def ExportDamage():
    scene=bpy.context.scene
    def Geometry(obj):
        mesh=obj.data;mesh.calc_loop_triangles();positions=[];normals=[];uv=[]
        for tri in mesh.loop_triangles:
            for li in tri.loops:
                loop=mesh.loops[li];positions.extend(mesh.vertices[loop.vertex_index].co)
                normals.extend(tri.normal)
                uv.extend(mesh.uv_layers.active.data[li].uv if mesh.uv_layers.active else (0,0))
        return {'positions':[round(v,5) for v in positions],'normals':[round(v,5) for v in normals],'uv':[round(v,6) for v in uv]}
    def Frames(obj):
        frames=[]
        for frame in range(1,74):
            scene.frame_set(frame);frames.append([round(v,5) for v in (*obj.location,*obj.rotation_euler)])
        return frames
    sourcePath=os.path.join(ROOT,'Model','Model_Type89Tank.tzm.json')
    data={'version':1,'fps':30,'duration':2.4,'source':'Model_Type89Tank.tzm.json','sourceSha256':hashlib.sha256(open(sourcePath,'rb').read()).hexdigest(),'sourceTriangles':doc['triangles'],'cutTriangles':masks,'hullFrames':Frames(hullMotion),'parts':[]}
    for obj in parts:
        data['parts'].append({'name':obj.name,'attach':obj['attach'],'mirror':bool(obj['mirror']),'material':'armor' if obj.name=='EngineDeck' else 'scorch' if obj.name=='EngineBay' else 'steel','geometry':Geometry(obj),'frames':Frames(obj)})
    output=os.path.join(ROOT,'Data_Type89Damage.mjs')
    with open(output,'w',encoding='utf8') as f:f.write('// BlenderMCP baked rigid geometry and 30 fps animation. Rebuild with _blender/Script_BuildType89Damage.py.\nexport const TYPE89_DAMAGE = '+json.dumps(data,separators=(',',':'))+';\n')
    scene.frame_set(73)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Model_Type89Damage.blend'))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Model_Type89Damage.blend'))
    scene.render.filepath=os.path.join(OUT,'Scene_Type89Damage.png');bpy.ops.render.render(write_still=True)
    print('Wrote',output,os.path.getsize(output),'bytes')

def PreviewSmoke():
    """Editable volumetric smoke in the source scene; game uses its pooled VFX."""
    mat=bpy.data.materials.new('Material_EngineSmokeVolume');mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial');volume=nodes.new('ShaderNodeVolumePrincipled')
    volume.inputs['Color'].default_value=(.055,.05,.04,1)
    tex=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=3
    links.new(tex.outputs['Generated'],noise.inputs['Vector'])
    center=nodes.new('ShaderNodeVectorMath');center.operation='SUBTRACT';center.inputs[1].default_value=(.5,.5,.5)
    length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH'
    falloff=nodes.new('ShaderNodeMapRange');falloff.inputs['From Min'].default_value=.12;falloff.inputs['From Max'].default_value=.5;falloff.inputs['To Min'].default_value=1;falloff.inputs['To Max'].default_value=0;falloff.clamp=True
    density=nodes.new('ShaderNodeMath');density.operation='MULTIPLY'
    gain=nodes.new('ShaderNodeMath');gain.operation='MULTIPLY';gain.inputs[1].default_value=4.2
    links.new(tex.outputs['Generated'],center.inputs[0]);links.new(center.outputs[0],length.inputs[0]);links.new(length.outputs['Value'],falloff.inputs['Value'])
    links.new(noise.outputs['Fac'],density.inputs[0]);links.new(falloff.outputs['Result'],density.inputs[1]);links.new(density.outputs[0],gain.inputs[0]);links.new(gain.outputs[0],volume.inputs['Density']);links.new(volume.outputs['Volume'],output.inputs['Volume'])
    for i in range(9):
        obj=BoxMesh('Preview_EngineSmoke_%02d'%i,(1,1,1),mat,0)
        start=Vector((0,1.56,.64));end=Vector((.07*i,1.7+.28*i,.64+.04*i))
        obj.location=start;obj.scale=(.001,.001,.001)
        obj.keyframe_insert(data_path='location',frame=1);obj.keyframe_insert(data_path='scale',frame=1)
        obj.keyframe_insert(data_path='location',frame=10+i*3);obj.keyframe_insert(data_path='scale',frame=10+i*3)
        obj.location=end;obj.scale=(.35+i*.095,.56+i*.04,.36+i*.09)
        obj.keyframe_insert(data_path='location',frame=35+i*4);obj.keyframe_insert(data_path='scale',frame=35+i*4)
        obj.rotation_euler=(.14*i,.23*i,.36*i)
    bpy.context.scene.frame_set(73)
    bpy.context.scene.render.filepath=os.path.join(OUT,'Scene_Type89Smoke720.png')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Model_Type89Damage.blend'))
    bpy.ops.render.render(write_still=True)

def ExportGlb():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [*originals,*parts,hullMotion]:obj.select_set(True)
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Model_Type89Damage.glb'),use_selection=True,
        export_format='GLB',export_animations=True,export_animation_mode='SCENE',
        export_anim_scene_split_object=False,export_force_sampling=True,export_frame_range=True,export_yup=False)
    bpy.context.scene.frame_set(73)
