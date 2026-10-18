"""Rebuild both low-poly straw mats through this worktree's BlenderMCP.

Set scene['StrawMatRoot'] to this asset directory before executing as text.
All dimensions below are metres. Blender Z-up is exported as glTF Y-up.
Each independent GLB uses its own aligned 1K imagegen-derived PBR atlas.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

root = Path(bpy.context.scene['StrawMatRoot']) if 'StrawMatRoot' in bpy.context.scene else Path(__file__).resolve().parent
repoRoot = root.parents[1]
scratch = repoRoot / 'tmp' / 'StrawSleepingMat'
sourceRoot = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/HistoricalProps/StrawSleepingMat')
rng = random.Random(1937)
tau = math.tau


class MeshBuilder:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.smooth = []

    def Vertex(self, position):
        self.vertices.append(tuple(position))
        return len(self.vertices) - 1

    def Face(self, indices, uvs, smooth=True):
        self.faces.append(tuple(indices))
        self.uvs.append(uvs)
        self.smooth.append(smooth)

    def Build(self, name, material, collection):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uvLayer = mesh.uv_layers.new(name='UVMap')
        for polygon, uvs, smooth in zip(mesh.polygons, self.uvs, self.smooth):
            polygon.use_smooth = smooth
            for loopIndex, uv in zip(polygon.loop_indices, uvs):
                uvLayer.data[loopIndex].uv = uv
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.data.materials.append(material)
        return obj


def Tube(builder, points, radius, sides=4, closed=False, ropeRepeats=None):
    points = [Vector(p) for p in points]
    rings = []
    lengths = [0.0]
    for i in range(1, len(points)):
        lengths.append(lengths[-1] + (points[i] - points[i-1]).length)
    for i, point in enumerate(points):
        previous = points[(i-1) % len(points)] if closed or i > 0 else point
        following = points[(i+1) % len(points)] if closed or i < len(points)-1 else point
        tangent = (following - previous).normalized()
        helper = Vector((1, 0, 0)) if abs(tangent.x) < 0.8 else Vector((0, 0, 1))
        normal = tangent.cross(helper).normalized()
        binormal = tangent.cross(normal).normalized()
        ring = []
        for j in range(sides):
            angle = tau * j / sides + 0.16
            variation = 1 + 0.035 * math.sin(i*2.1 + j*1.7)
            position = point + (normal * math.cos(angle) + binormal * math.sin(angle)) * radius * variation
            ring.append(builder.Vertex(position))
        rings.append(ring)
    count = len(points) if closed else len(points)-1
    total = lengths[-1] + ((points[-1] - points[0]).length if closed else 0)
    for i in range(count):
        nxt = (i+1) % len(points)
        # Repeat a modest run of the generated diagonal rope fibres along the
        # actual cord length; each cross section samples its width separately.
        u0 = 0.515 + (i % 3)*0.155
        u1 = u0+0.155
        for j in range(sides):
            k = (j+1) % sides
            v0, v1 = 0.015 + 0.47*j/sides, 0.015 + 0.47*(j+1)/sides
            builder.Face((rings[i][j], rings[i][k], rings[nxt][k], rings[nxt][j]),
                         [(u0,v0), (u0,v1), (u1,v1), (u1,v0)])


def SheetHeight(x, y):
    # Broad almost-flat body with a restrained roll-memory ripple; only the
    # last 8–10 cm turn upward, matching the approved thin silhouette.
    body = 0.0030 + 0.0016*math.sin(x*6.2 + y*3.7) + 0.0011*math.cos(y*14-x*2.2)
    edgeX = max(0, (abs(x)-0.80)/0.10)**2
    edgeY = max(0, (abs(y)-0.37)/0.08)**2
    curl = (0.003 + 0.010*(0.5+0.5*math.sin(y*3.1+x*2.8))) * edgeX
    curl += (0.002+0.004*(0.5+0.5*math.cos(x*4.4))) * edgeY
    return body + curl


def BodyUV(x, y):
    return ((x+0.9)/1.8, 0.5+0.5*(y+0.45)/0.9)


def CenterAtBottom(obj):
    low = [min(v.co[k] for v in obj.data.vertices) for k in range(3)]
    high = [max(v.co[k] for v in obj.data.vertices) for k in range(3)]
    offset = Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,low[2]))
    for vertex in obj.data.vertices:
        vertex.co -= offset


def BuildFlat(material, collection):
    builder = MeshBuilder()
    nx, ny = 20, 12
    positions = []
    for j in range(ny+1):
        row = []
        y = -0.45 + 0.9*j/ny
        for i in range(nx+1):
            x = -0.9 + 1.8*i/nx
            # Keep the exact nominal footprint but soften the handmade edge.
            wiggle = 0.0008*math.sin(i*2.21+j*1.73)
            yy = y + (wiggle if j in (0,ny) and i not in (0,nx) else 0)
            if i in (0,nx) and j in (0,ny):
                x -= math.copysign(.004,x)
                yy -= math.copysign(.004,yy)
            row.append((x, yy, SheetHeight(x, yy)))
        positions.append(row)
    layers = []
    for offset in (0.0025, -0.0025):
        layers.append([[builder.Vertex((x,y,z+offset)) for x,y,z in row] for row in positions])
    for j in range(ny):
        for i in range(nx):
            uvs = [BodyUV(*positions[j][i][:2]), BodyUV(*positions[j][i+1][:2]),
                   BodyUV(*positions[j+1][i+1][:2]), BodyUV(*positions[j+1][i][:2])]
            builder.Face([layers[0][j][i],layers[0][j][i+1],layers[0][j+1][i+1],layers[0][j+1][i]],uvs)
            builder.Face([layers[1][j+1][i],layers[1][j+1][i+1],layers[1][j][i+1],layers[1][j][i]],list(reversed(uvs)))
    perimeter = [(i,0) for i in range(nx)] + [(nx,j) for j in range(ny)]
    perimeter += [(i,ny) for i in range(nx,0,-1)] + [(0,j) for j in range(ny,0,-1)]
    border = []
    for index, (i,j) in enumerate(perimeter):
        ni,nj = perimeter[(index+1)%len(perimeter)]
        builder.Face([layers[0][j][i],layers[1][j][i],layers[1][nj][ni],layers[0][nj][ni]],
                     [(0.52,0.02),(0.52,0.48),(0.67,0.48),(0.67,0.02)])
        x,y,z = positions[j][i]
        border.append((x,y,z))
    Tube(builder, border, 0.0040, sides=5, closed=True)
    # Four compact hand-finished corner wraps, not decorative metal fittings.
    for x,y in [(-.896,-.447),(.896,-.447),(.896,.447),(-.896,.447)]:
        points = [(x+.003*math.cos(tau*k/4), y+.003*math.sin(tau*k/4), SheetHeight(x,y)+.0015) for k in range(4)]
        Tube(builder, points, .0012, sides=4, closed=True)
    # A few silhouette fibres carry damage; the dense weave is ONLY in maps.
    for k in range(16):
        edge = k % 4
        x = rng.uniform(-.88,.88) if edge < 2 else (-.9 if edge==2 else .9)
        y = (-.449 if edge==0 else .449) if edge < 2 else rng.uniform(-.44,.44)
        direction = Vector((0, -1 if edge==0 else 1, .25)) if edge<2 else Vector((-1 if edge==2 else 1,0,.25))
        start = Vector((x,y,SheetHeight(x,y)+.001))
        end = start + direction * rng.uniform(.003,.009)
        cross = Vector((direction.y,-direction.x,0))*.0005
        ids = [builder.Vertex(p) for p in (start-cross,start+cross,end+cross*.3,end-cross*.3)]
        builder.Face(ids,[(.52,.02),(.53,.02),(.67,.48),(.66,.48)],False)
    obj = builder.Build('Model_StrawSleepingMatFlat', material, collection)
    CenterAtBottom(obj)
    obj['NominalDimensionsMeters'] = [1.8,0.9,0.005]
    obj['TriangleLimit'] = 2000
    obj['State'] = 'Laid flat, slight undulation, four cord-bound edges'
    return obj


def Radius(theta, x=0):
    # The slight ovalness and waist at the two ties avoid a perfect pipe.
    shape = .0675*(1+.018*math.sin(3*theta+.7)+.012*math.sin(5*theta-1))
    cinch = sum(.0012*math.exp(-((x-tie)/.035)**2) for tie in (-.215,.215))
    return shape-cinch


def RollPoint(x, theta, offset=0):
    radius = Radius(theta,x)+offset
    return (x, radius*math.sin(theta), .070+radius*math.cos(theta))


def BuildRolled(material, collection):
    builder = MeshBuilder()
    sides = 24
    stations = [-.45,-.215,.215,.45]
    rings = []
    for x in stations:
        ring = []
        for j in range(sides):
            ring.append(builder.Vertex(RollPoint(x,tau*j/sides+math.pi)))
        rings.append(ring)
    for i in range(len(stations)-1):
        for j in range(sides):
            k = (j+1)%sides
            # Dedicated rectified exterior atlas keeps the approved weave
            # scale on this state; its UV seam is underneath the bundle.
            u0,u1=(stations[i]+.45)/.9,(stations[i+1]+.45)/.9
            v0,v1=.5+.5*j/sides,.5+.5*(j+1)/sides
            builder.Face([rings[i][j],rings[i+1][j],rings[i+1][k],rings[i][k]],
                         [(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
    # At this triangle budget the packed paired layers are represented in
    # the end-face albedo/normal atlas. The dished end, open-looking centre,
    # uneven circumference and bound rim retain actual silhouette geometry.
    for end in (-1,1):
        outer,inner = [],[]
        for j in range(sides):
            angle = tau*j/sides
            r = Radius(angle,end*.45)-.0012
            outer.append(builder.Vertex((end*.4501,r*math.sin(angle),.070+r*math.cos(angle))))
            inner.append(builder.Vertex((end*.444,.0065*math.sin(angle),.070+.0065*math.cos(angle))))
        centre = builder.Vertex((end*.433,0,.070))
        def EndUV(vertex):
            p = builder.vertices[vertex]
            return (.25+.241*p[1]/.0675,.25+.241*(p[2]-.070)/.0675)
        for j in range(sides):
            k = (j+1)%sides
            face = [outer[j],outer[k],inner[k],inner[j]]
            if end>0: face.reverse()
            builder.Face(face,[EndUV(v) for v in face],True)
            face = [inner[j],inner[k],centre]
            if end>0: face.reverse()
            builder.Face(face,[EndUV(v) for v in face],True)
        # A full bound outer lip, separately visible from the end layers.
        lip = [RollPoint(end*.450,tau*j/20,.0013) for j in range(20)]
        Tube(builder,lip,.0028,sides=4,closed=True)
    # TWO rope ties, each one closed path. All of this geometry counts.
    for tieX in (-.215,.215):
        points = [RollPoint(tieX,tau*j/20,.0027) for j in range(20)]
        Tube(builder, points, .0036, sides=4, closed=True)
        # Low polygon interlocked knot: six stations on a small figure eight.
        knotPoints = []
        for j in range(7):
            t = tau*j/6
            knotPoints.append((tieX+.010*math.sin(t), -.010+.006*math.sin(2*t), .147+.005*math.cos(t)))
        Tube(builder,knotPoints,.0033,sides=4)
        # One naturally hanging free tail at each knot.
        tail = [RollPoint(tieX+.008+.007*j/5,-.12-1.1*j/5,.0055) for j in range(6)]
        Tube(builder,tail,.0018,sides=3)
        for direction in (-1,1):
            start=Vector(tail[-1])
            tip=start+Vector((direction*.005,-.004,-.010))
            span=Vector((.0006,0,0))
            ids=[builder.Vertex(p) for p in (start-span,start+span,tip+span*.2,tip-span*.2)]
            builder.Face(ids,[(.52,.02),(.53,.02),(.67,.48),(.66,.48)],False)
    loop = []
    for j in range(13):
        t = j/12
        loop.append((-.215+.430*t, .001+.018*math.sin(t*tau), .145+.073*math.sin(math.pi*t)**1.10))
    Tube(builder,loop,.0033,sides=4)
    # The outer edge lip sits in the very last turn; paired end layers above
    # expose the fold. Twelve isolated frays keep the silhouette handmade.
    for j in range(12):
        end = -1 if j%2==0 else 1
        theta = tau*j/12+.5
        start = Vector(RollPoint(end*.449,theta,.0007))
        tip = start+Vector((end*rng.uniform(.003,.007), .002*math.sin(theta), .002*math.cos(theta)))
        width = Vector((0,.0006*math.cos(theta),-.0006*math.sin(theta)))
        ids = [builder.Vertex(p) for p in (start-width,start+width,tip)]
        builder.Face(ids,[(.52,.02),(.52,.48),(.67,.25)],False)
    obj = builder.Build('Model_StrawSleepingMatRolled', material, collection)
    CenterAtBottom(obj)
    obj['NominalBodyDimensionsMeters'] = [0.9,0.135,0.135]
    obj['TriangleLimit'] = 1200
    obj['Bindings'] = 2
    obj['CarryingLoops'] = 1
    obj['Fold'] = '1.8m length folded once into 0.9 x 0.9m double layer; axis along original width'
    return obj


def ImageNode(nodes, file, name, data=False):
    image = bpy.data.images.load(str(file), check_existing=False)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.pack()
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    node.name = name
    node.label = name
    node.interpolation = 'Linear'
    node.extension = 'REPEAT'
    return node


def CreateMaterial(state):
    material = bpy.data.materials.new('Material_StrawSleepingMatPbr'+state)
    material.use_nodes = True
    nodes,links = material.node_tree.nodes,material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .91
    shader.inputs['IOR'].default_value = 1.46
    shader.inputs['Specular IOR Level'].default_value = .22
    base = ImageNode(nodes,root/'Texture'/f'Texture_StrawSleepingMat{state}BaseColor.png','BaseColor sRGB')
    normal = ImageNode(nodes,root/'Texture'/f'Texture_StrawSleepingMat{state}Normal.png','Normal OpenGL',True)
    orm = ImageNode(nodes,scratch/f'Texture_StrawSleepingMat{state}Orm.png','ORM AO Roughness ZeroMetal',True)
    separate = nodes.new('ShaderNodeSeparateColor')
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = .90
    links.new(base.outputs['Color'],shader.inputs['Base Color'])
    links.new(normal.outputs['Color'],nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'],shader.inputs['Normal'])
    links.new(orm.outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],shader.inputs['Roughness'])
    links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    # The official glTF exporter recognises this Occlusion socket.
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        group.nodes.new('NodeGroupInput')
    settings = nodes.new('ShaderNodeGroup')
    settings.node_tree = group
    links.new(separate.outputs['Red'],settings.inputs['Occlusion'])
    links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    material['NormalConvention'] = 'OpenGL +Y'
    material['TextureResolution'] = 1024
    material['WeaveRelief'] = 'Tangent-space normal texture only; no individual woven strand geometry'
    return material


def Export(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    assert triangles <= obj['TriangleLimit'], (obj.name,triangles,obj['TriangleLimit'])
    file = root/(obj.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_animations=False,export_extras=True,
        export_materials='EXPORT',export_texcoords=True,export_normals=True,export_tangents=True)
    return {'file':file.name,'triangles':triangles,'triangleLimit':obj['TriangleLimit'],
            'blenderDimensions':list(obj.dimensions),'rootLocation':list(obj.location),
            'rootScale':list(obj.scale),'minimumZ':min(v.co.z for v in obj.data.vertices)}


def Main():
    assert bpy.context.scene.get('BlenderMcpTask') == 'StrawSleepingMat', 'Refuse another task scene'
    assert bpy.data.filepath == '' or Path(bpy.data.filepath).parent == sourceRoot, 'Wrong .blend'
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith(('Model_StrawSleepingMat','Review_')):
            bpy.data.meshes.remove(mesh,do_unlink=True)
    for material in list(bpy.data.materials):
        if material.name.startswith('Material_StrawSleepingMatPbr'):
            bpy.data.materials.remove(material,do_unlink=True)
    for image in list(bpy.data.images):
        if image.name.startswith('Texture_StrawSleepingMat'):
            bpy.data.images.remove(image,do_unlink=True)
    for coll in list(bpy.data.collections):
        if coll.name.startswith('StrawMat'):
            bpy.data.collections.remove(coll)
    collection = bpy.data.collections.new('StrawMat_Production')
    bpy.context.scene.collection.children.link(collection)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    flat = BuildFlat(CreateMaterial('Flat'),collection)
    rolled = BuildRolled(CreateMaterial('Rolled'),collection)
    report = {'coordinateSystem':'glTF +Y up, metres; local origin at bottom-centre',
              'sourceBlend':str(sourceRoot/'Scene_StrawSleepingMat.blend'),
              'assets':[Export(flat),Export(rolled)]}
    (root/'Data_GeometryBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.context.scene['StrawMatRoot'] = str(root)
    bpy.context.scene['ReferenceApproval'] = 'User approved references on 2026-10-18; strict visual matching required'
    bpy.context.scene['ReferenceFlat'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatFlat.png')
    bpy.context.scene['ReferenceRolled'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatRolled.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_StrawSleepingMat.blend'))
    print(json.dumps(report,indent=2))


Main()
