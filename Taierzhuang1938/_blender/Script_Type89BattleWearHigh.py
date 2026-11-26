"""Author the editable Type89 battle-wear Blender source.

Run through the task's BlenderMCP controller. The visible clods are separate
editable meshes. The finish masks stay editable in the existing PBR graphs.
"""
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
PROFILE = HERE.parent/'Model/Type89MediumTank/Data_BattleWearProfile.json'
RECIPE = json.loads(PROFILE.read_text(encoding='utf-8'))
ROOT = 'Model_Type89MediumTank'
AUTHORING = 'Type89BattleWear'
PREFS = RECIPE['projection']
TRACK_VIEW_HALF = PREFS['trackProjectionHalfM']


def Srgb(rgb):
    components = np.asarray(rgb)/255
    linear = np.where(components<=.04045, components/12.92, ((components+.055)/1.055)**2.4)
    return (*linear,1)


def BodyMeshes(root):
    return sorted((obj for obj in root.children_recursive if obj.type == 'MESH'),
                  key=lambda obj: obj.name)


def InstallRestCoordinates(objects):
    visited = set()
    for obj in objects:
        if obj.name.startswith('Mesh_TrackLink'):
            continue
        if obj.data in visited:
            obj.data = obj.data.copy()
        visited.add(obj.data)
        mesh = obj.data
        if obj.name=='Mesh_BowRoundPortCover':
            preserve = mesh.attributes.new('BattleWearPreserve', 'FLOAT', 'POINT')
            preserve.data.foreach_set('value', np.ones(len(mesh.vertices),dtype=np.float32))
        transform = np.asarray(obj.matrix_world, dtype=np.float32)
        coords = np.empty((len(mesh.vertices),3), np.float32)
        mesh.vertices.foreach_get('co', coords.ravel())
        points = mesh.attributes.new('BattleWearPosition', 'FLOAT_VECTOR', 'POINT')
        points.data.foreach_set('vector', (coords@transform[:3,:3].T+transform[:3,3]).ravel())
        normals = np.empty((len(mesh.loops),3), np.float32)
        mesh.corner_normals.foreach_get('vector', normals.ravel())
        normalMatrix = np.linalg.inv(transform[:3,:3])
        world = normals@normalMatrix
        corners = mesh.attributes.new('BattleWearNormal','FLOAT_VECTOR','CORNER')
        corners.data.foreach_set('vector', world.ravel())


class Graph:
    def __init__(self, tree):
        self.tree = tree
        self.nodes = tree.nodes
        self.links = tree.links
        self.location = (0,0)

    def Lane(self, x, y):
        self.location = (x,y)

    def Node(self, kind, label=''):
        node = self.nodes.new(kind)
        node.label = label
        x,y = self.location
        node.location = (x,y)
        self.location = (x,y-156)
        return node

    def Set(self, socket, value):
        if isinstance(value,bpy.types.NodeSocket):
            self.links.new(value,socket)
        else:
            socket.default_value = value

    def Math(self, op, a, b=0, label=''):
        node = self.Node('ShaderNodeMath',label)
        node.operation = op
        self.Set(node.inputs[0],a)
        self.Set(node.inputs[1],b)
        return node.outputs[0]

    def Vector(self, op, a, b=(0,0,0), label=''):
        node = self.Node('ShaderNodeVectorMath',label)
        node.operation = op
        self.Set(node.inputs[0],a)
        self.Set(node.inputs[1],b)
        return node.outputs['Value' if op=='DOT_PRODUCT' else 'Vector']

    def Smooth(self, value, start, end):
        node = self.Node('ShaderNodeMapRange')
        node.interpolation_type = 'SMOOTHSTEP'
        for name,source in [('Value',value),('From Min',start),('From Max',end)]:
            self.Set(node.inputs[name],source)
        return node.outputs[0]

    def XY(self, x, y):
        node = self.Node('ShaderNodeCombineXYZ')
        self.Set(node.inputs['X'],x)
        self.Set(node.inputs['Y'],y)
        return node.outputs[0]

    def Separate(self, coord):
        node = self.Node('ShaderNodeSeparateXYZ')
        self.Set(node.inputs[0], coord)
        return [node.outputs[i] for i in range(3)]

    def Texture(self, image, uv):
        node = self.Node('ShaderNodeTexImage', image.name)
        node.extension = 'CLIP'
        node.image = image
        self.Set(node.inputs['Vector'],uv)
        return self.Separate(node.outputs['Color'])

    def Attr(self, name):
        node = self.Node('ShaderNodeAttribute',name)
        node.attribute_name = name
        return node.outputs['Vector']

    def Mix(self, a, b, amount, label=''):
        node = self.Node('ShaderNodeMixRGB',label)
        self.Set(node.inputs[0],amount)
        self.Set(node.inputs[1],a)
        self.Set(node.inputs[2],b)
        return node.outputs[0]

    def ScalarMix(self, a, b, amount):
        delta = self.Math('SUBTRACT',b,a)
        return self.Math('ADD',a,self.Math('MULTIPLY',delta,amount))


def OutputGroup(name):
    tree = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    for name in ('Soot','Steel','Earth','Dust','Height'):
        tree.interface.new_socket(name=name,in_out='OUTPUT',socket_type='NodeSocketFloat')
    return Graph(tree)


def LoadControl(directory, name):
    image = bpy.data.images.load(str(directory/name), check_existing=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pack()
    image.filepath_raw = '//Maps/Controls/'+name
    return image


def BodyProjection(directory):
    graph = OutputGroup('Type89 V6 Armour Weathering')
    graph.Lane(0,0)
    point = graph.Vector('SUBTRACT',graph.Attr('BattleWearPosition'),RECIPE['camera']['centre'])
    normal = graph.Vector('NORMALIZE',graph.Attr('BattleWearNormal'))
    protected = graph.Node('ShaderNodeAttribute','Preserved cover and badge')
    protected.attribute_name = 'BattleWearPreserve'
    apply = graph.Math('SUBTRACT',1,protected.outputs['Fac'])
    channels = [None]*5
    for index,(name,row) in enumerate(RECIPE['views'].items()):
        graph.Lane(360+index*380,-index*80)
        axis = np.asarray(row['axis'], dtype=float)
        up = np.asarray((0,1,0) if name=='Top' else (0,0,1), dtype=float)
        right = np.cross(up,axis)
        width,height = row.get('size') or RECIPE['camera']['sizes'][name]
        density = RECIPE['camera']['pixelsPerMetre']
        u = graph.Math('ADD',.5,graph.Vector('DOT_PRODUCT', point, right*(density/width)))
        v = graph.Math('ADD',.5,graph.Vector('DOT_PRODUCT', point, up*(density/height)))
        uv = graph.XY(u,v)
        soot,steel,earth = graph.Texture(LoadControl(directory,'Texture_Type89Wear'+name+'Finish.png'),uv)
        depth,relief,dust = graph.Texture(LoadControl(directory,'Texture_Type89Wear'+name+'Relief.png'),uv)
        surface = graph.Vector('DOT_PRODUCT',point,axis)
        front = graph.Math('DIVIDE',graph.Math('SUBTRACT',depth,.5),PREFS['depthScale'])
        distance = graph.Math('ABSOLUTE',graph.Math('SUBTRACT',surface,front))
        visible = graph.Math('SUBTRACT',1,graph.Smooth(distance,PREFS['depthBias'],PREFS['depthFade']))
        facing = graph.Smooth(graph.Vector('DOT_PRODUCT',normal,axis),PREFS['normalStart'],PREFS['normalEnd'])
        weight = graph.Math('MULTIPLY',visible,facing,'Visible face in the '+name.lower()+' projection')
        signed = graph.Math('MULTIPLY',graph.Math('SUBTRACT',relief,.5),PREFS['heightRangeM'])
        for i,source in enumerate((soot,steel,earth,dust,signed)):
            sample = graph.Math('MULTIPLY',source,weight)
            if channels[i] is not None:
                operation = 'ADD' if i==4 else 'MAXIMUM'
                sample = graph.Math(operation,channels[i],sample)
            channels[i] = sample
    graph.Lane(2500,0)
    group = graph.Node('NodeGroupOutput')
    for socket,value in zip(group.inputs,channels):
        graph.Set(socket,graph.Math('MULTIPLY',value,apply))
    return graph.tree


def TrackProjection(directory):
    graph = OutputGroup('Type89 Local Tread Earth')
    xy = graph.Node('ShaderNodeTexCoord').outputs['Object']
    x,y,z = graph.Separate(xy)
    normal = graph.Node('ShaderNodeVectorTransform')
    normal.vector_type = 'NORMAL'
    normal.convert_from = 'WORLD'
    normal.convert_to = 'OBJECT'
    graph.Set(normal.inputs[0],graph.Node('ShaderNodeNewGeometry').outputs['Normal'])
    nx,_,nz = graph.Separate(normal.outputs[0])
    graph.Lane(270,0)
    color = graph.Node('ShaderNodeSeparateColor')
    graph.Set(color.inputs[0],graph.Node('ShaderNodeObjectInfo').outputs['Color'])
    variant = graph.Math('ROUND',graph.Math('MULTIPLY',color.outputs['Red'],3))
    offsetX = graph.Math('MULTIPLY',graph.Math('MODULO',variant,2),.5)
    offsetY = graph.Math('MULTIPLY',graph.Math('FLOOR',graph.Math('DIVIDE',variant,2)),.5)
    u = graph.Math('ADD',graph.Math('ADD',.25,graph.Math('DIVIDE',x,TRACK_VIEW_HALF[0]*4)),offsetX)
    v = graph.Math('SUBTRACT',graph.Math('ADD',.75,graph.Math('DIVIDE',y,TRACK_VIEW_HALF[1]*4)),offsetY)
    earth,height,dust = graph.Texture(LoadControl(directory,'Texture_Type89TrackEarthControls.png'),graph.XY(u,v))
    graph.Lane(650,0)
    land = graph.Math('MULTIPLY',graph.Smooth(z,-.008,.023),graph.Smooth(nz,-.19,.61))
    side = graph.Math('MULTIPLY',graph.Smooth(z,-.018,.010),
                      graph.Math('MULTIPLY',.82,graph.Smooth(graph.Math('ABSOLUTE',nx),.36,.79)))
    factor = graph.Math('MAXIMUM',land,side)
    group = graph.Node('NodeGroupOutput')
    graph.Set(group.inputs['Earth'],graph.Math('MULTIPLY',earth,factor))
    graph.Set(group.inputs['Dust'],graph.Math('MULTIPLY',dust,factor))
    graph.Set(group.inputs['Height'],
              graph.Math('MULTIPLY',graph.Math('MULTIPLY',graph.Math('SUBTRACT',height,.5),.017),factor))
    return graph.tree


def Existing(socket):
    return socket.links[0].from_socket if socket.is_linked else socket.default_value


def InstallFinish(material, tree):
    graph = Graph(material.node_tree)
    bsdf = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    graph.Lane(bsdf.location.x-860, bsdf.location.y-480)
    layer = graph.Node('ShaderNodeGroup','SurfaceV17 artist controls')
    layer.node_tree = tree
    sockets = ['Base Color','Roughness','Metallic']
    base,rough,metal = [Existing(bsdf.inputs[socket]) for socket in sockets]
    role = material.get('Type89Role')
    if role == 'Track':
        config = RECIPE['finish']['trackGrime']
        base = graph.Vector('MULTIPLY',base,(config['baseMultiplier'],)*3)
        rough = graph.Math('MAXIMUM',rough,config['roughnessFloor'])
    if role in {'Armor','CastArmor','Guard'}:
        config = RECIPE['finish']['paintTint']
        normal = graph.Vector('NORMALIZE',graph.Attr('BattleWearNormal'))
        _,_,up = graph.Separate(normal)
        fade = graph.Smooth(up,.13,.85)
        factor = graph.ScalarMix(config['level'],config['upward'],fade)
        red,green,blue = graph.Separate(base)
        brightness = graph.Math('MAXIMUM',red,graph.Math('MAXIMUM',green,blue))
        protected = graph.Node('ShaderNodeAttribute','Preserved cover and badge')
        protected.attribute_name = 'BattleWearPreserve'
        paint = graph.Math('MULTIPLY',graph.Smooth(brightness,.012,.065),
                           graph.Math('SUBTRACT',1,protected.outputs['Fac']))
        factor = graph.ScalarMix(1,factor,paint)
        scale = graph.Node('ShaderNodeVectorMath','Aged olive paint')
        scale.operation = 'SCALE'
        graph.Set(scale.inputs[0],base)
        graph.Set(scale.inputs['Scale'],factor)
        base = scale.outputs[0]
    strongest = 0
    for name,mask in [('soot','Soot'),('mud','Earth'),('dust','Dust'),('exposedSteel','Steel')]:
        config = RECIPE['finish'][name]
        strength = layer.outputs[mask]
        if mask == 'Soot':
            strength = graph.Math('SUBTRACT',1,graph.Math('POWER',
                graph.Math('SUBTRACT',1,strength),PREFS['sootPower']))
        base = graph.Mix(base,Srgb(config['base']),strength,mask)
        rough = graph.ScalarMix(rough,config['roughness'],strength)
        metal = graph.ScalarMix(metal,metal if role in {'Rubber','Exhaust'} else config['metallic'],strength)
        strongest = graph.Math('MAXIMUM',strongest,strength)
    for socket,value in zip(sockets,(base,rough,metal)):
        graph.Set(bsdf.inputs[socket],value)
    coat = bsdf.inputs['Coat Weight']
    graph.Set(coat,graph.Math('MULTIPLY',Existing(coat),graph.Math('SUBTRACT',1,strongest)))
    bump = graph.Node('ShaderNodeBump','Shallow paint loss, pocks and pressed dirt')
    bump.inputs['Strength'].default_value = .82
    bump.inputs['Distance'].default_value = 1
    graph.Set(bump.inputs['Height'],layer.outputs['Height'])
    anchor = bsdf.inputs['Normal']
    if anchor.is_linked:
        graph.Set(bump.inputs['Normal'],Existing(anchor))
    graph.Set(anchor,bump.outputs[0])


def TrackVariants():
    result = {}
    for side in ('Left','Right'):
        for i in range(81):
            result['Mesh_TrackLink'+side+f'{i:03d}'] = 0
        for start,end,variant in RECIPE['tracks'][side]:
            for i in range(start,end+1):
                result['Mesh_TrackLink'+side+f'{i:03d}'] = variant
    return result


def ClayMaterial():
    material = bpy.data.materials.new('Material_Type89HighSoilClod')
    material.diffuse_color = Srgb(RECIPE['finish']['mud']['base'])
    material.use_nodes = True
    graph = Graph(material.node_tree)
    graph.Lane(-900,0)
    shader = next(node for node in graph.nodes if node.type=='BSDF_PRINCIPLED')
    coordinates = graph.Node('ShaderNodeTexCoord').outputs['Object']
    coarse = graph.Node('ShaderNodeTexNoise','Cohesive earth, flattened when pressed')
    fine = graph.Node('ShaderNodeTexNoise','Grit visible at grazing light')
    for node,scale,detail in [(coarse,28,2.0),(fine,415,2.0)]:
        graph.Set(node.inputs['Vector'],coordinates)
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = .72
    shades = graph.Mix(Srgb((24,18,14)),Srgb((64,45,33)),coarse.outputs['Fac'],'Umber and dry clay')
    color = graph.Mix(shades,Srgb((75,54,40)),graph.Math('MULTIPLY',fine.outputs[0],.14))
    shader.inputs['Roughness'].default_value = .96
    shader.inputs['Specular IOR Level'].default_value = .27
    graph.Set(shader.inputs['Base Color'],color)
    bump = graph.Node('ShaderNodeBump','Submillimetre grit')
    bump.inputs['Distance'].default_value = .0025
    bump.inputs['Strength'].default_value = .52
    graph.Set(bump.inputs['Height'],fine.outputs[0])
    graph.Set(shader.inputs['Normal'],bump.outputs[0])
    return material


def Rim(seed, count, phase=0):
    angle = np.arange(count,dtype=float)*math.tau/count+phase
    rhythm = 1+.16*np.sin(angle*3+seed*.72)+.14*np.cos(angle*5+seed*.54)+.06*np.sin(angle*7-seed)
    return angle,rhythm


def SurfacePoint(a,b,h,angle,radius,variation,seed):
    dx = a*(math.cos(angle)*radius*variation+.14*(1-radius)*math.sin(seed))
    dy = b*(math.sin(angle)*radius*variation+.16*(1-radius)*math.cos(seed))
    wedge = h*(max(0,1-radius**2)**.78)*(.89+.15*math.sin(angle*3+seed)*radius)
    z = wedge-h*.13+(1-radius)*h*.05*math.sin(angle*2+seed)
    z += h*.098*math.cos(angle*4+seed)*math.sin(radius*math.pi)
    return (dx,dy,z)


def HighClod(radii, seed, secondary=False):
    a,b,h = radii
    count = 12 if secondary else 20
    rings = (.99,.76,.45,.20) if secondary else (1,.87,.64,.43,.21)
    angle,shape = Rim(seed,count)
    verts = [SurfacePoint(a,b,h,u,r,var,seed) for r in rings for u,var in zip(angle,shape)]
    faces = []
    for row in range(len(rings)-1):
        for i in range(count):
            j = (i+1)%count
            faces.append((row*count+i, row*count+j, (row+1)*count+j, (row+1)*count+i))
    tip = len(verts)
    verts.append(SurfacePoint(a,b,h,seed,0,1,seed))
    ring = (len(rings)-1)*count
    faces.extend((ring+i,ring+(i+1)%count,tip) for i in range(count))
    return verts,faces


def LowClod(radii, seed):
    a,b,h = radii
    angle,shape = Rim(seed,8)
    verts = [SurfacePoint(a,b,h,u,1,var,seed) for u,var in zip(angle,shape)]
    middleAngle,middleShape = Rim(seed,4,math.tau/16)
    verts.extend(SurfacePoint(a,b,h,u,.59,var,seed) for u,var in zip(middleAngle,middleShape))
    verts.append(SurfacePoint(a,b,h,seed,0,1,seed))
    faces = []
    for i in range(4):
        a,b,c = i*2,(i*2+1)%8,(i*2+2)%8
        inner,following = 8+i,8+(i+1)%4
        faces.extend([(a,b,inner),(b,c,inner),(c,following,inner),(inner,following,12)])
    return verts,faces


def LocalTrackAnchor(obj, x, y):
    hit,point,_,_ = obj.ray_cast(Vector((x,y,.17)),Vector((0,0,-1)),distance=.25)
    if hit:
        return max(.017,min(.028,point.z))
    return .018


def MudObject(collection, name, parent, vertices, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name,mesh)
    collection.objects.link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj['battleWearMud'] = True
    return obj


def ArticulateClods(root, directory, variants):
    collection = bpy.data.collections.new('Type89BattleWearMud')
    root.users_collection[0].children.link(collection)
    material = ClayMaterial()
    hero = []
    for index,(side,link,x,y,a,b,h,seed) in enumerate(RECIPE['tracks']['heroClods']):
        parent = bpy.data.objects['Mesh_TrackLink'+side+f'{link:03d}']
        z = LocalTrackAnchor(parent,x,y)
        cap = min(a,(.156-abs(x))/1.24)
        centre = np.array((x,y,z))
        radii = (cap,b,h*1.17)
        name = 'Mesh_Type89MudClod'+side+f'{index+1:02d}'
        verts,faces = HighClod(radii,seed)
        MudObject(collection,name,parent,(np.array(verts)+centre).tolist(),faces,material)
        lowVerts,lowFaces = LowClod(radii,seed)
        hero.append(dict(name=name, parent=parent.name, seed=seed, centre=centre.tolist(),
                         radii=radii, vertices=(np.array(lowVerts)+centre).tolist(), faces=lowFaces))
    detail = 0
    for name,variant in variants.items():
        if not variant:
            continue
        parent = bpy.data.objects[name]
        side = 0 if 'Left' in name else 1
        link = int(name[-3:])
        rng = np.random.default_rng(link+261+side*1000)
        # Alternate width and depth. Link pockets and rims remain visible.
        count = int(rng.choice([0,1,1,2] if variant==1 else [1,2,2,3]))
        for i in range(count):
            x,y = rng.uniform(-.119,.119),rng.uniform(-.049,.050)
            a = min(rng.uniform(.029,.073)*(1+variant*.19),(.157-abs(x))/1.22)
            b = rng.uniform(.014,.036)
            h = rng.uniform(.009,.026)*(1+variant*.16)
            seed = int(rng.integers(0,10000))
            z = LocalTrackAnchor(parent,x,y)
            if parent.matrix_world.translation.z < .075:
                h = min(h,max(.004,parent.matrix_world.translation.z-z+.0003))
            if h < .009 and i>0:
                continue
            verts,faces = HighClod((a,b,h),seed,secondary=True)
            centre = np.array((x,y,z))
            objectName = f'Mesh_Type89MudFragment{detail+1:03d}'
            MudObject(collection,objectName,parent,(np.array(verts)+centre).tolist(),faces,material)
            detail += 1
    rims = 0
    for side,intervals in RECIPE['tracks']['rimRegions'].items():
        sign = -1 if side=='Left' else 1
        for first,last in intervals:
            for link in range(first,last+1):
                rng = np.random.default_rng(link+794+sign*231)
                if rng.random()<.24:
                    continue
                parent = bpy.data.objects['Mesh_TrackLink'+side+f'{link:03d}']
                seed = int(rng.integers(0,10000))
                y = rng.uniform(-.031,.036)
                z = rng.uniform(.006,.018)
                width = rng.uniform(.034,.063)
                thickness = rng.uniform(.022,.048)
                height = rng.uniform(.010,.022)
                verts,faces = HighClod((width,thickness,height),seed,secondary=True)
                # Seat on the shoe edge. An oblique cap curls back onto the
                # tread without jutting into the sprocket or widening the hull.
                normal = Vector((sign*.81,0,.586)).normalized()
                tangent = Vector((0,sign,0))
                cross = normal.cross(tangent)
                matrix = Matrix((tangent,cross,normal)).transposed()
                centre = Vector((sign*.149,y,z))
                points = [centre+matrix@Vector(vertex) for vertex in verts]
                for point in points:
                    point.x = sign*min(.181,abs(point.x))
                objectName = f'Mesh_Type89RimEarth{rims+1:03d}'
                MudObject(collection,objectName,parent,points,faces,material)
                rims += 1
    hull = 0
    for name, place, outward, radii, seed in RECIPE['tracks']['hullClods']:
        parent = bpy.data.objects[name]
        normal = Vector(outward).normalized()
        position = Vector(place)+normal*.32
        inverse = parent.matrix_world.inverted()
        origin,ray = inverse@position,inverse.to_3x3()@(-normal)
        hit,point,landNormal,_ = parent.ray_cast(origin,ray,distance=.70)
        if not hit:
            continue
        landWorld = (parent.matrix_world.to_3x3()@landNormal).normalized()
        normal = (normal+landWorld).normalized()
        x = normal.cross(Vector((0,0,1))).normalized()
        y = normal.cross(x).normalized()
        verts,faces = HighClod(radii,seed)
        transform = inverse.to_3x3() @ Matrix((x,y,normal)).transposed()
        vertices = [tuple(point+transform@Vector(v)) for v in verts]
        objectName = f'Mesh_Type89HullEarth{hull+1:02d}'
        MudObject(collection,objectName,parent,vertices,faces,material)
        if hull<2:
            a,b,h = radii
            angles,rim = Rim(seed,8)
            local = [SurfacePoint(a,b,h,angle,1,variation,seed) for angle,variation in zip(angles,rim)]
            local.append(SurfacePoint(a,b,h,seed,0,1,seed))
            faces = [(i,(i+1)%8,8) for i in range(8)]
            vertices = [tuple(point+transform@Vector(v)) for v in local]
            hero.append(dict(name=objectName, parent=parent.name, seed=seed, centre=list(point), radii=radii,
                         vertices=vertices, faces=faces, planar=[v[:2] for v in local], tangent=list(transform.col[0])))
        hull += 1
    report = {'heroClods':hero,'highTrackFragments':detail+rims,'highHullClods':hull,
              'trackVariants':variants,'gameClodTriangles':sum(len(row['faces']) for row in hero)}
    (directory/'Data_BattleWearGeometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(f'Sculpted {len(RECIPE["tracks"]["heroClods"])} main track clods, {detail+rims} smaller clods and {hull} hull deposits.',flush=True)


def Author(version):
    active = Path(bpy.data.filepath).resolve()
    target = version/'Scene_Type89MediumTankHighPbr.blend'
    assert active == target.resolve(), (active,target)
    root = bpy.data.objects[ROOT]
    # During iteration restore the immutable high source first. All saves
    # remain at the versioned task path.
    if root['surfaceRevision'] == RECIPE['revision']:
        baseline = version.with_name('GeometryV55SurfaceV16')/target.name
        bpy.ops.wm.open_mainfile(filepath=str(baseline))
        root = bpy.data.objects[ROOT]
    assert root['geometryVersion'] == RECIPE['geometryVersion'] and root['surfaceRevision']=='SurfaceV16'
    controls = version/'Maps'/'Controls'
    originalMeshes = BodyMeshes(root)
    InstallRestCoordinates(originalMeshes)
    body,track = BodyProjection(controls),TrackProjection(controls)
    materials = {material for obj in originalMeshes for material in obj.data.materials}
    for material in materials:
        role = material.get('Type89Role')
        if role not in {'Glass','Shadow'}:
            InstallFinish(material,track if role=='Track' else body)
    variants = TrackVariants()
    for name,variant in variants.items():
        bpy.data.objects[name].color[0] = variant/3
    ArticulateClods(root,version,variants)
    root['surfaceRevision'] = RECIPE['revision']
    root['battleWearReference'] = RECIPE['referenceEdition']
    bpy.data.use_autopack = False
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene['BlenderMcpTask'] = AUTHORING
    bpy.ops.wm.save_as_mainfile(filepath=str(target),relative_remap=False)
    print('Saved editable high source',str(target),flush=True)
