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
    body = 0.0025 + 0.0018*math.sin(x*6.2 + y*3.7) + 0.0010*math.cos(y*14-x*2.2)
    edgeX = max(0, (abs(x)-0.80)/0.10)**2
    edgeY = max(0, (abs(y)-0.37)/0.08)**2
    curl = (0.009 + 0.009*(0.5+0.5*math.sin(y*3.1+x*2.8))) * edgeX
    curl += (0.002+0.005*(0.5+0.5*math.cos(x*4.4))) * edgeY
    return min(body + curl,.0275)


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
    nx, ny = 16, 10
    positions = []
    for j in range(ny+1):
        row = []
        y = -0.45 + 0.9*j/ny
        for i in range(nx+1):
            x = -0.9 + 1.8*i/nx
            # Keep the exact nominal footprint but soften the handmade edge.
            wiggle = 0.0040*math.sin(i*2.21+j*1.73)
            yy = y + (wiggle if j in (0,ny) and i not in (0,nx) else 0)
            if i in (0,nx) and j in (0,ny):
                x -= math.copysign(.009,x)
                yy -= math.copysign(.009,yy)
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
    Tube(builder, border, 0.0060, sides=6, closed=True)
    # Hand whipstitches run over the edge cord and underneath the 5mm sheet.
    for stitch in range(40):
        index=int(stitch*len(border)/40)
        p=Vector(border[index])
        tangent=(Vector(border[(index+1)%len(border)])-Vector(border[(index-1)%len(border)])).normalized()
        outward=Vector((tangent.y,-tangent.x,0)).normalized()
        points=[p-outward*.005+Vector((0,0,.004)),p+outward*.004+Vector((0,0,.002)),p-outward*.003+Vector((0,0,-.0035))]
        Tube(builder,points,.0015,sides=3)
    # Four compact hand-finished corner wraps, not decorative metal fittings.
    for x,y in [(-.891,-.441),(.891,-.441),(.891,.441),(-.891,.441)]:
        points = [(x+.005*math.cos(tau*k/4), y+.005*math.sin(tau*k/4), SheetHeight(x,y)+.0035) for k in range(4)]
        Tube(builder, points, .0022, sides=3, closed=True)
    # A few silhouette fibres carry damage; the dense weave is ONLY in maps.
    for k in range(16):
        edge = k % 4
        x = rng.uniform(-.88,.88) if edge < 2 else (-.9 if edge==2 else .9)
        y = (-.449 if edge==0 else .449) if edge < 2 else rng.uniform(-.44,.44)
        direction = Vector((0, -1 if edge==0 else 1, .25)) if edge<2 else Vector((-1 if edge==2 else 1,0,.25))
        start = Vector((x,y,SheetHeight(x,y)+.001))
        end = start + direction * rng.uniform(.005,.012)
        cross = Vector((direction.y,-direction.x,0))*.0005
        ids = [builder.Vertex(p) for p in (start-cross,start+cross,end+cross*.3,end-cross*.3)]
        builder.Face(ids,[(.52,.02),(.53,.02),(.67,.48),(.66,.48)],False)
    for corner,(x,y) in enumerate([(-.891,-.441),(.891,-.441),(.891,.441),(-.891,.441)]):
        for strand in range(3):
            direction=Vector((math.copysign(.7+strand*.15,x),math.copysign(1.0-strand*.17,y),.15)).normalized()
            start=Vector((x,y,SheetHeight(x,y)+.004))
            tip=start+direction*(.008+strand*.002)
            cross=Vector((direction.y,-direction.x,0))*.0006
            ids=[builder.Vertex(p) for p in (start-cross,start+cross,tip+cross*.2,tip-cross*.2)]
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
    cinch = sum(.0012*math.exp(-((x-tie)/.035)**2) for tie in (-.225,.225))
    return shape-cinch


def RollPoint(x, theta, offset=0):
    radius = Radius(theta,x)+offset
    return (x, radius*math.sin(theta), .070+radius*math.cos(theta))




def BuildRolled(material, collection):
    builder=MeshBuilder()
    sides=18
    stations=[-.45,-.418,-.225,.225,.418,.45]
    rings=[]
    for i,x in enumerate(stations):
        ring=[]
        for j in range(sides):
            theta=math.pi+tau*j/sides
            radius=Radius(theta,x)
            radius+=.0011*math.sin(theta*7+i*1.9)+.0006*math.cos(theta*3+i)
            flare=.0018 if i in (0,len(stations)-1) else 0
            radius+=flare
            xx=x+(math.copysign(.0012*math.sin(j*2.6),x) if i in (0,len(stations)-1) else 0)
            ring.append(builder.Vertex((xx,radius*math.sin(theta),.072+radius*math.cos(theta))))
        rings.append(ring)
    for i in range(len(stations)-1):
        for j in range(sides):
            k=(j+1)%sides
            u0,u1=(stations[i]+.45)/.9,(stations[i+1]+.45)/.9
            v0,v1=.5+.5*j/sides,.5+.5*(j+1)/sides
            builder.Face([rings[i][j],rings[i+1][j],rings[i+1][k],rings[i][k]],[(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
    # A recessed fibre end closes the interior; actual paired spiral strips
    # stand proud of it and cast their own narrow layer shadows in oblique views.
    for end in (-1,1):
        centre=builder.Vertex((end*.430,0,.072))
        back=[]
        endRing=rings[0] if end<0 else rings[-1]
        for vertex in endRing:
            p=builder.vertices[vertex]
            back.append(builder.Vertex((end*.448,p[1],p[2])))
        def CutUV(vertex):
            p=builder.vertices[vertex]
            return (.25+.238*p[1]/.0715,.25+.238*(p[2]-.072)/.0715)
        for j in range(sides):
            ids=[back[j],back[(j+1)%sides],centre]
            if end>0:ids.reverse()
            builder.Face(ids,[CutUV(v) for v in ids],True)
        innerPairs=[]
        for layer in (0,1):
            strips=[]
            for j in range(49):
                t=j/48;a=-1.16+3.6*tau*t
                r=.009+(.067-.009)*t-layer*.0048
                ring=[]
                for across in (0,1):
                    rr=max(.0015,r-across*.0044)
                    xx=end*(.4540+.0016*math.sin(j*1.7+layer)+.0012*math.cos(j*.8)-across*.0025)
                    ring.append(builder.Vertex((xx,rr*math.sin(a),.072+rr*math.cos(a))))
                strips.append(ring)
            innerPairs.append(strips[0])
            for j in range(48):
                ids=[strips[j][0],strips[j+1][0],strips[j+1][1],strips[j][1]]
                if end>0:ids.reverse()
                # The same source photo is projected onto the surface, so
                # geometric layer relief does not replace the real cut fibres.
                builder.Face(ids,[CutUV(v) for v in ids],True)
        # Two small quads turn the paired sheet back into a visible inner fold.
        a,b=innerPairs[0],innerPairs[1]
        middle=[builder.Vertex((end*.453,(builder.vertices[a[k]][1]+builder.vertices[b[k]][1])*.5,
                 (builder.vertices[a[k]][2]+builder.vertices[b[k]][2])*.5+.0015)) for k in (0,1)]
        for ids in ([a[0],middle[0],middle[1],a[1]],[middle[0],b[0],b[1],middle[1]]):
            if end>0:ids=list(reversed(ids))
            builder.Face(ids,[CutUV(v) for v in ids],True)
    # Each tie is a two-strand twisted grass cord, not a straight painted line.
    for tieX in (-.225,.225):
        for strand in (0,1):
            points=[]
            for j in range(12):
                a=tau*j/12
                twist=a*5+strand*math.pi
                centre=Vector(RollPoint(tieX,a,.0038));centre.z+=.002
                centre.x+=.0020*math.cos(twist)
                centre.y+=.0020*math.sin(twist)*math.sin(a)
                centre.z+=.0020*math.sin(twist)*math.cos(a)
                points.append(centre)
            Tube(builder,points,.0025,sides=3,closed=True)
        knot=[(-.008,-.022,.147),(-.013,-.015,.157),(-.005,-.007,.161),(.008,-.011,.153),
              (.006,-.025,.145),(-.004,-.029,.151),(-.005,-.018,.159),(.012,-.010,.150)]
        Tube(builder,[(tieX+dx*.75,-.018+(y+.018)*.72,.153+(z-.153)*.75) for dx,y,z in knot],.0043,sides=3)
        tail=[RollPoint(tieX+.008+.010*j/4,-.16-1.18*j/4,.0070) for j in range(5)]
        tail=[(x,y,z+.002) for x,y,z in tail]
        Tube(builder,tail,.0023,sides=3)
    loop=[]
    for j in range(13):
        t=j/12
        loop.append((-.225+.450*t,-.009+.016*math.sin(t*tau),.155+.070*math.sin(math.pi*t)**1.06))
    for strand in (0,1):
        strandPoints=[]
        for j,point in enumerate(loop):
            t=j/12;twist=tau*3*t+strand*math.pi
            point=Vector(point)
            tangent=(Vector(loop[min(j+1,12)])-Vector(loop[max(0,j-1)])).normalized()
            normal=tangent.cross(Vector((0,1,0))).normalized()
            binormal=tangent.cross(normal).normalized()
            strandPoints.append(point+.0018*(normal*math.cos(twist)+binormal*math.sin(twist)))
        Tube(builder,strandPoints,.0027,sides=3)
    # End and rope-tail frays make the rough hand-trimmed silhouette visible.
    for j in range(14):
        if j<8:
            end=-1 if j%2==0 else 1;a=tau*j/8+.4
            start=Vector((end*.450,.067*math.sin(a),.072+.067*math.cos(a)))
            tip=start+Vector((end*rng.uniform(.006,.0115),.002*math.sin(a),.003*math.cos(a)))
            side=Vector((0,.0007*math.cos(a),-.0007*math.sin(a)))
        else:
            tieX=-.225 if j%2==0 else .225
            start=Vector(RollPoint(tieX+.018,-1.34,.007));start.z+=.002
            tip=start+Vector(((j%3-1)*.009,-.005,-.012-(j%3)*.003))
            side=Vector((.0006,0,0))
        ids=[builder.Vertex(p) for p in (start-side,start+side,tip+side*.2,tip-side*.2)]
        builder.Face(ids,[(.52,.02),(.53,.02),(.67,.48),(.66,.48)],False)
    obj=builder.Build('Model_StrawSleepingMatRolled',material,collection)
    CenterAtBottom(obj)
    obj['NominalBodyDimensionsMeters']=[.9,.135,.135]
    obj['TriangleLimit']=1200;obj['Bindings']=2;obj['CarryingLoops']=1
    obj['Fold']='Paired raised spiral layers with a joined inner fold; 0.9m roll axis'
    obj['Refinement']='Actual raised end layers, two-strand ties, volumetric overhand knots, hand-trimmed frays'
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
    bpy.data.orphans_purge(do_recursive=True)
    collection = bpy.data.collections.new('StrawMat_Production')
    bpy.context.scene.collection.children.link(collection)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    flat = BuildFlat(CreateMaterial('Flat'),collection)
    rolled = BuildRolled(CreateMaterial('Rolled'),collection)
    report = {'coordinateSystem':'glTF +Y up, metres; local origin at bottom-centre',
              'sourceBlend':str(sourceRoot/bpy.context.scene.get('StrawMatBlendName','Scene_StrawSleepingMatRefined.blend')),
              'assets':[Export(flat),Export(rolled)]}
    (root/'Data_GeometryBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.context.scene['StrawMatRoot'] = str(root)
    bpy.context.scene['ReferenceApproval'] = 'User approved references on 2026-10-18; strict visual matching required'
    bpy.context.scene['ReferenceFlat'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatFlat.png')
    bpy.context.scene['ReferenceRolled'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatRolled.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/bpy.context.scene.get('StrawMatBlendName','Scene_StrawSleepingMatRefined.blend')))
    print(json.dumps(report,indent=2))


Main()
