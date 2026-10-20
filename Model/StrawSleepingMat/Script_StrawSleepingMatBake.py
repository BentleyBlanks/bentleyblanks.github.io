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
from mathutils import Vector, Quaternion

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
        self.customNormals = []

    def Vertex(self, position):
        self.vertices.append(tuple(position))
        return len(self.vertices) - 1

    def Face(self, indices, uvs, smooth=True, normals=None):
        self.faces.append(tuple(indices))
        self.uvs.append(uvs)
        self.smooth.append(smooth)
        self.customNormals.append(normals)

    def Build(self, name, material, collection):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uvLayer = mesh.uv_layers.new(name='UVMap')
        for polygon, uvs, smooth in zip(mesh.polygons, self.uvs, self.smooth):
            polygon.use_smooth = smooth
            for loopIndex, uv in zip(polygon.loop_indices, uvs):
                uvLayer.data[loopIndex].uv = uv
        mesh.update()
        if any(normals is not None for normals in self.customNormals):
            loopNormals=[normal.vector.copy() for normal in mesh.corner_normals]
            for polygon,normals in zip(mesh.polygons,self.customNormals):
                if normals is not None:
                    for loopIndex,normal in zip(polygon.loop_indices,normals):
                        loopNormals[loopIndex]=normal
            mesh.normals_split_custom_set(loopNormals)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.data.materials.append(material)
        return obj


def Tube(builder, points, radius, sides=4, closed=False, ropeRepeats=None, roughness=.035):
    points = [Vector(p) for p in points]
    rings = []
    lengths = [0.0]
    for i in range(1, len(points)):
        lengths.append(lengths[-1] + (points[i] - points[i-1]).length)
    tangents=[]
    for i,point in enumerate(points):
        previous=points[(i-1)%len(points)] if closed or i>0 else point
        following=points[(i+1)%len(points)] if closed or i<len(points)-1 else point
        tangents.append((following-previous).normalized())
    helper=Vector((1,0,0)) if abs(tangents[0].x)<.8 else Vector((0,0,1))
    frames=[tangents[0].cross(helper).normalized()]
    for i in range(1,len(points)):
        normal=tangents[i-1].rotation_difference(tangents[i])@frames[-1]
        normal=(normal-tangents[i]*normal.dot(tangents[i])).normalized()
        frames.append(normal)
    if closed:
        closing=tangents[-1].rotation_difference(tangents[0])@frames[-1]
        angle=math.atan2(tangents[0].dot(closing.cross(frames[0])),closing.dot(frames[0]))
        frames=[Quaternion(tangent,angle*i/len(points))@normal for i,(tangent,normal) in enumerate(zip(tangents,frames))]
    for i, point in enumerate(points):
        tangent=tangents[i]
        normal=frames[i]
        binormal = tangent.cross(normal).normalized()
        ring = []
        for j in range(sides):
            angle = tau * j / sides + 0.16
            variation = 1 + roughness * math.sin(i*2.1 + j*1.7)
            position = point + (normal * math.cos(angle) + binormal * math.sin(angle)) * radius * variation
            ring.append(builder.Vertex(position))
        rings.append(ring)
    count = len(points) if closed else len(points)-1
    total = lengths[-1] + ((points[-1] - points[0]).length if closed else 0)
    for i in range(count):
        nxt = (i+1) % len(points)
        # Repeat a modest run of the generated diagonal rope fibres along the
        # actual cord length; each cross section samples its width separately.
        uvPeriod=.155/3
        uvScale=uvPeriod/.015
        u0=.515+(lengths[i]*uvScale)%uvPeriod
        span=(lengths[nxt] if nxt else total)-lengths[i]
        u1=u0+span*uvScale
        for j in range(sides):
            k = (j+1) % sides
            uvCircumference=uvScale*.019
            v0,v1=.205+uvCircumference*j/sides,.205+uvCircumference*(j+1)/sides
            builder.Face((rings[i][j], rings[i][k], rings[nxt][k], rings[nxt][j]),
                         [(u0,v0), (u0,v1), (u1,v1), (u1,v0)])


def FrayCard(builder,start,tip,side,index):
    ids=[builder.Vertex(p) for p in (start-side,start+side,tip+side,tip-side)]
    u0=.5+(index%8)*.0625+.002
    u1=u0+.0585
    builder.Face(ids,[(u0,.003),(u1,.003),(u1,.123),(u0,.123)],False)


def CordLobe(builder,centre,axis,length,radius,phase=0):
    centre=Vector(centre);axis=Vector(axis).normalized()
    helper=Vector((0,0,1)) if abs(axis.z)<.8 else Vector((0,1,0))
    normal=axis.cross(helper).normalized();binormal=axis.cross(normal).normalized()
    half=length*.5
    stations=[-half+radius*.55,half-radius*.55]
    rings=[]
    for station in stations:
        ring=[]
        for j in range(8):
            a=tau*j/8+.11
            ring.append(builder.Vertex(centre+axis*station+radius*.89*(normal*math.cos(a)+binormal*math.sin(a))))
        rings.append(ring)
    start=builder.Vertex(centre-axis*half);end=builder.Vertex(centre+axis*half)
    uvScale=(.155/3)/.015;uvCircumference=uvScale*.019
    u0=.515+(phase%1)*(.155/3)
    for j in range(8):
        k=(j+1)%8;v0=.205+uvCircumference*j/8;v1=.205+uvCircumference*(j+1)/8
        ua=u0+(stations[0]+half)*uvScale;ub=u0+(stations[1]+half)*uvScale
        builder.Face([rings[0][j],rings[0][k],rings[1][k],rings[1][j]],[(ua,v0),(ua,v1),(ub,v1),(ub,v0)])
        builder.Face([start,rings[0][k],rings[0][j]],[(u0,(v0+v1)*.5),(ua,v1),(ua,v0)])
        builder.Face([end,rings[1][j],rings[1][k]],[(u0+length*uvScale,(v0+v1)*.5),(ub,v0),(ub,v1)])


def ProjectedKnot(builder,centre):
    centre=Vector(centre);radii=Vector((.0155,.0100,.0120))
    segments,latitudes=10,8
    directions={}
    projection={}
    def Vertex(point):
        angle=math.atan2(point.z/radii.z,point.x/radii.x)
        edge=math.sqrt((point.x/radii.x)**2+(point.z/radii.z)**2)
        scale=1+(.045*math.sin(3*angle+.4)+.025*math.cos(5*angle-.7))*edge
        index=builder.Vertex(centre+point*scale)
        projection[index]=(point.x/radii.x,point.z/radii.z)
        directions[index]=Vector((point.x/radii.x**2,point.y/radii.y**2,point.z/radii.z**2)).normalized()
        return index
    top=Vertex(Vector((0,0,radii.z)));bottom=Vertex(Vector((0,0,-radii.z)))
    rings=[]
    for j in range(1,latitudes):
        theta=math.pi*j/latitudes
        rings.append([Vertex(Vector((radii.x*math.sin(theta)*math.cos(tau*i/segments),
            radii.y*math.sin(theta)*math.sin(tau*i/segments),radii.z*math.cos(theta)))) for i in range(segments)])
    def Face(ids):
        uvs=[]
        for index in ids:
            x,z=projection[index]
            uvs.append(((524+212*(.5+.5*x))/1024,
                        1-(524+212*(.5-.5*z))/1024))
        builder.Face(ids,uvs,normals=[directions[index] for index in ids])
    for i in range(segments):
        nxt=(i+1)%segments
        Face([top,rings[0][i],rings[0][nxt]])
        Face([bottom,rings[-1][nxt],rings[-1][i]])
    for j in range(len(rings)-1):
        for i in range(segments):
            nxt=(i+1)%segments
            Face([rings[j][i],rings[j+1][i],rings[j+1][nxt],rings[j][nxt]])


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
                     [(0.52,0.14),(0.52,0.48),(0.67,0.48),(0.67,0.14)])
        x,y,z = positions[j][i]
        border.append((x,y,z))
    Tube(builder, border, 0.0060, sides=6, closed=True)
    # Hand whipstitches run over the edge cord and underneath the 5mm sheet.
    for stitch in range(26):
        index=int(stitch*len(border)/26)
        p=Vector(border[index])
        tangent=(Vector(border[(index+1)%len(border)])-Vector(border[(index-1)%len(border)])).normalized()
        outward=Vector((tangent.y,-tangent.x,0)).normalized()
        points=[p-outward*.005+Vector((0,0,.004)),p+outward*.004+Vector((0,0,.002)),p-outward*.003+Vector((0,0,-.0035))]
        Tube(builder,points,.0015,sides=3)
    # Four compact hand-finished corner wraps, not decorative metal fittings.
    for corner,(x,y) in enumerate([(-.891,-.441),(.891,-.441),(.891,.441),(-.891,.441)]):
        sx=math.copysign(1,x);sy=math.copysign(1,y);z=SheetHeight(x,y)+.0058
        CordLobe(builder,(x,y,z),(sx*.75,sy*.45,.40),.014,.0028,corner*.17)
        CordLobe(builder,(x-sx*.001,y+sy*.001,z+.002),(sx*.60,-sy*.75,.24),.0135,.0028,corner*.17+.4)
    # A few silhouette fibres carry damage; the dense weave is ONLY in maps.
    for k in range(16):
        edge = k % 4
        x = rng.uniform(-.88,.88) if edge < 2 else (-.9 if edge==2 else .9)
        y = (-.449 if edge==0 else .449) if edge < 2 else rng.uniform(-.44,.44)
        direction = Vector((0, -1 if edge==0 else 1, .25)) if edge<2 else Vector((-1 if edge==2 else 1,0,.25))
        start = Vector((x,y,SheetHeight(x,y)+.002))-Vector((direction.x,direction.y,0))*.008
        end = start + direction * rng.uniform(.014,.022)
        cross = Vector((direction.y,-direction.x,0))*.005
        FrayCard(builder,start,end,cross,k)
    for corner,(x,y) in enumerate([(-.891,-.441),(.891,-.441),(.891,.441),(-.891,.441)]):
        for strand in range(3):
            direction=Vector((math.copysign(.7+strand*.15,x),math.copysign(1.0-strand*.17,y),.15)).normalized()
            start=Vector((x,y,SheetHeight(x,y)+.004))
            tip=start+direction*(.010+strand*.002)
            cross=Vector((direction.y,-direction.x,0))*.0045
            FrayCard(builder,start,tip,cross,corner*3+strand)
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
    stations=[-.45,-.225,0,.225,.45]
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
            # Keep geometric relief on the visible outer turns. The fine
            # inner turns use the aligned cut-end normal/AO bake.
            for j in range(25):
                t=.58+.42*j/24;a=-1.16+3.6*tau*t
                r=.009+(.067-.009)*t-layer*.0048
                ring=[]
                for across in (0,1):
                    rr=max(.0015,r-across*.0044)
                    xx=end*(.4540+.0016*math.sin(j*1.7+layer)+.0012*math.cos(j*.8)-across*.0025)
                    ring.append(builder.Vertex((xx,rr*math.sin(a),.072+rr*math.cos(a))))
                strips.append(ring)
            a=-1.16;r=.009-layer*.0048
            innerPairs.append([builder.Vertex((end*.454,max(.0015,r-across*.0044)*math.sin(a),
                .072+max(.0015,r-across*.0044)*math.cos(a))) for across in (0,1)])
            for j in range(24):
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
    # Smooth cord sweeps carry the physically scaled two-lobe braid normal.
    for tieX in (-.225,.225):
        points=[]
        for j in range(18):
            a=tau*j/18
            point=Vector(RollPoint(tieX+.0008*math.sin(a*3),a,.0043));point.z+=.002
            points.append(point)
        Tube(builder,points,.0040,sides=4,closed=True)
        ProjectedKnot(builder,(tieX,-.012,.1480))
        tail=[RollPoint(tieX+.008+.012*j/6,-.16-1.18*j/6,.0070) for j in range(7)]
        tail=[(x,y,z+.002) for x,y,z in tail]
        Tube(builder,tail,.0023,sides=3)
    loop=[]
    for j in range(21):
        t=j/20
        loop.append((-.225+.450*t,-.012+.016*math.sin(t*tau),.147+.078*math.sin(math.pi*t)**1.06))
    Tube(builder,loop,.0038,sides=3)
    # End and rope-tail frays make the rough hand-trimmed silhouette visible.
    for j in range(26):
        if j<22:
            end=-1 if j%2==0 else 1;a=tau*(j//2)/12+.23
            if (j//2)%2==0:
                start=Vector((end*.451,.067*math.sin(a),.072+.067*math.cos(a)))
                tip=start+Vector((end*.006,.007*math.sin(a),.007*math.cos(a)))
            else:
                start=Vector((end*.445,.066*math.sin(a),.072+.066*math.cos(a)))
                tip=start+Vector((end*.014,.003*math.sin(a),.003*math.cos(a)))
            side=Vector((0,.005*math.cos(a),-.005*math.sin(a)))
        elif j<24:
            tieX=-.225 if j%2==0 else .225
            start=Vector(RollPoint(tieX+.020,-1.30,.008));start.z+=.002
            tip=start+Vector((.002,-.004,-.015))
            side=Vector((.0045,0,0))
        else:
            tieX=-.225 if j%2==0 else .225
            start=Vector((tieX-.009,-.012,.149))
            tip=start+Vector((-.006,-.002,.010))
            side=Vector((.004,0,0))
        FrayCard(builder,start,tip,side,j)
    obj=builder.Build('Model_StrawSleepingMatRolled',material,collection)
    CenterAtBottom(obj)
    obj['NominalBodyDimensionsMeters']=[.9,.135,.135]
    obj['TriangleLimit']=1200;obj['Bindings']=2;obj['CarryingLoops']=1
    obj['Fold']='Raised outer paired spiral layers, normal-mapped inner coils and a joined inner fold; 0.9m roll axis'
    obj['Refinement']='Rounded compact knot proxies with dedicated imagegen PBR detail; arc-length binding braid normals at 15mm pitch; alpha-cut split fibres'
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
    clip=nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.33
    links.new(base.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],shader.inputs['Alpha'])
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
              'sourceBlend':str(sourceRoot/bpy.context.scene.get('StrawMatBlendName','Scene_StrawSleepingMatKnotDetail.blend')),
              'assets':[Export(flat),Export(rolled)]}
    (root/'Data_GeometryBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.context.scene['StrawMatRoot'] = str(root)
    bpy.context.scene['ReferenceApproval'] = 'User approved references on 2026-10-18; strict visual matching required'
    bpy.context.scene['ReferenceFlat'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatFlat.png')
    bpy.context.scene['ReferenceRolled'] = str(sourceRoot/'References'/'Reference_StrawSleepingMatRolled.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/bpy.context.scene.get('StrawMatBlendName','Scene_StrawSleepingMatKnotDetail.blend')))
    print(json.dumps(report,indent=2))


Main()
