"""Irregular spalled lime plaster with fractured sections and shallow masonry."""
from mathutils import noise
import bmesh
walls=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Wall')]
front=wy-.12
mortarMat=Material('CommandRoomMortar',(.36,.34,.3),.97,'CommandRoomPlaster')
patches=[(-2.50,2.45,.62,1.11),(-2.45,.65,.73,1.05),(-.54,2.77,.45,.59),
    (.05,1.94,.44,1.13),(.80,.78,1.07,.50),(1.98,.66,.95,.58),(2.61,1.51,.78,1.25)]
# Non-radial fractures: deep bays, irregular corners and tongues of old plaster.
profiles=[
 [(-.93,-.71),(-.67,-.91),(-.40,-.79),(-.30,-.98),(-.09,-.91),(.02,-.65),(.29,-.72),(.50,-.46),(.79,-.55),(.70,-.20),(.97,-.09),(.84,.11),(.96,.37),(.68,.33),(.58,.59),(.32,.49),(.38,.80),(.12,.72),(-.06,.98),(-.25,.78),(-.56,.89),(-.50,.57),(-.83,.51),(-.70,.29),(-.98,.12),(-.83,-.11),(-.96,-.26),(-.74,-.46)],
 [(-.97,-.41),(-.81,-.64),(-.55,-.50),(-.38,-.86),(-.19,-.96),(.05,-.70),(.31,-.81),(.43,-.44),(.70,-.53),(.89,-.34),(.71,-.15),(.98,.05),(.83,.21),(.61,.19),(.76,.51),(.58,.64),(.37,.47),(.16,.79),(-.03,.68),(-.29,.93),(-.41,.58),(-.70,.72),(-.79,.38),(-.62,.19),(-.91,.03),(-.79,-.16)]
]

def Boolean(ob,cutter,operation):
    bpy.context.view_layer.objects.active=ob
    mod=ob.modifiers.new('Fractured material volume','BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)

def Recalculate(ob):
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(ob.data);bm.free()

def InsidePatch(x,z,outline):
    inside=False
    for i,(a,b) in enumerate(outline):
        c,d=outline[i-1]
        if (b>z)!=(d>z) and x<(c-a)*(z-b)/(d-b)+a:inside=not inside
    return inside

def PlasterCrack(start,direction,length,seed):
    rng=random.Random(seed);verts=[];faces=[];side=Vector((-direction.y,direction.x))
    count=16
    for j in range(count+1):
        t=j/count
        p=start+direction*(length*t)+side*(rng.uniform(-.008,.008)*math.sin(math.pi*t))
        half=.0015*(1-t)**.65+.00004
        for offset,depth in [(-half,-.009),(half,-.009),(half*.1,.008*(1-t)),(-half*.1,.008*(1-t))]:
            q=p+side*offset;verts.append((q.x,front+depth,q.y))
    faces.extend([tuple(reversed(range(4))),tuple(count*4+i for i in range(4))])
    for j in range(count):
        for i in range(4):faces.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
    cut=Mesh('PlasterHairlineVolume',verts,faces,plaster);Recalculate(cut)
    for wall in walls:
        bounds=[wall.matrix_world@Vector(p) for p in wall.bound_box]
        if max(p.x for p in bounds)<start.x-length or min(p.x for p in bounds)>start.x+length:continue
        if max(p.z for p in bounds)<start.y-length or min(p.z for p in bounds)>start.y+length:continue
        Boolean(wall,cut,'DIFFERENCE')
    bpy.data.objects.remove(cut,do_unlink=True)

def ProjectUv(ob,tile):
    layer=ob.data.uv_layers.active or ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        a,b=(0,2) if axis==1 else (1,2) if axis==0 else (0,1)
        for li in poly.loop_indices:
            p=ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co
            layer.data[li].uv=(p[a]/tile,p[b]/tile)

for index,(cx,cz,sx,sz) in enumerate(patches):
    rng=random.Random(738+index)
    coarse=[Vector((cx+x*sx*.5,cz+z*sz*.5)) for x,z in profiles[index%2]]
    # Worn lime loses sharp triangular tips. Smooth only the large silhouette,
    # then fracture it again at the much smaller grain scale below.
    for iteration in range(2):
        coarse=[point for i,p in enumerate(coarse) for point in (p.lerp(coarse[(i+1)%len(coarse)],.22),p.lerp(coarse[(i+1)%len(coarse)],.78))]
    outline=[]
    for i,p in enumerate(coarse):
        q=coarse[(i+1)%len(coarse)];edge=q-p;perp=Vector((-edge.y,edge.x)).normalized()
        steps=max(1,math.ceil(edge.length/.010))
        for j in range(steps):
            f=j/steps
            point=p.lerp(q,f)+perp*rng.uniform(-.003,.003)
            outline.append(tuple(point))
    n=len(outline)
    verts=[(x,y,z) for y in [front-.08,front+.060] for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
    cut=Mesh('PlasterCutVolume',verts,faces,plaster);Recalculate(cut)
    for wall in walls:
        bounds=[wall.matrix_world@Vector(p) for p in wall.bound_box]
        if max(p.x for p in bounds)<cx-sx or min(p.x for p in bounds)>cx+sx or max(p.z for p in bounds)<cz-sz or min(p.z for p in bounds)>cz+sz:continue
        Boolean(wall,cut,'DIFFERENCE')
    # Shallow lime joints, rather than equally deep black channels.
    Mesh('RecessedLimeBed',[(x,front+.027,z) for x,z in outline],[tuple(range(n))],mortarMat,[(x/1.8,z/1.8) for x,z in outline])
    rim=[];rimUvs=[];perimeter=[0];inward=[];depths=[]
    for i,p in enumerate(outline):
        p=Vector(p);last=Vector(outline[i-1]);nxt=Vector(outline[(i+1)%n])
        edge=(nxt-last).normalized();inward.append(Vector((-edge.y,edge.x)))
        perimeter.append(perimeter[-1]+(nxt-p).length);depths.append(rng.uniform(.013,.027))
    for ring in range(4):
        for i,(x,z) in enumerate(outline+[outline[0]]):
            k=i%n;d=depths[k]
            inset=[0,.002,.006,.010][ring]*(.6+.6*rng.random())
            point=Vector((x,z))+inward[k]*inset;depth=[0,.002,d*.52,d][ring]
            rim.append((point.x,front+depth,point.y));rimUvs.append((perimeter[i]/1.8,(depth+inset)/1.8))
    stride=n+1
    ob=Mesh('FracturedPlasterSection',rim,[(r*stride+i,r*stride+i+1,(r+1)*stride+i+1,(r+1)*stride+i) for r in range(3) for i in range(n)],mortarMat,rimUvs)
    color=ob.data.color_attributes.new(name='FreshLimeSection',type='FLOAT_COLOR',domain='POINT')
    for c in color.data:c.color=(1.15,1.13,1.08,1)
    for row in range(math.floor((cz-sz*.6)/.105),math.ceil((cz+sz*.6)/.105)):
        for col in range(math.floor((cx-sx*.6)/.25),math.ceil((cx+sx*.6)/.25)+1):
            x=col*.25+(row%2)*.125;z=row*.105
            overlaps=any(InsidePatch(x+dx,z+dz,outline) for dx in [-.126,.126] for dz in [-.053,.053])
            overlaps=overlaps or any(abs(px-x)<.126 and abs(pz-z)<.053 for px,pz in outline)
            if not overlaps:continue
            ob=Cube('RecessedWeatheredBrick',(x,front+.033,z),(.239+rng.uniform(-.004,.003),.032,.095+rng.uniform(-.002,.002)),brick,0)
            bm=bmesh.new();bm.from_mesh(ob.data)
            bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=3,use_grid_fill=True)
            bm.to_mesh(ob.data);bm.free();ob.data.update()
            for v in ob.data.vertices:
                wp=ob.matrix_world@v.co
                v.co+=v.normal*noise.noise_vector(wp*38)[0]*.0015
            # Erode a coarse closed solid before adding its small bevel. Noise
            # on tiny bevel segments can invert triangles and break CSG volumes.
            bpy.context.view_layer.objects.active=ob
            bevel=ob.modifiers.new('Chipped brick corners','BEVEL');bevel.width=.0025;bevel.segments=1
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            ob.rotation_euler.y=rng.uniform(-.012,.012)
            ob.data.update();Boolean(ob,cut,'INTERSECT')
            if not ob.data.polygons:bpy.data.objects.remove(ob,do_unlink=True);continue
            # Exact CSG must not retain the cutter's front cap after erosion.
            assert min((ob.matrix_world@v.co).y for v in ob.data.vertices)>front+.010, 'Invalid recessed brick intersection'
            ob.data.materials.clear();ob.data.materials.append(brick)
            for poly in ob.data.polygons:poly.material_index=0;poly.use_smooth=False
            ProjectUv(ob,.5)
            color=ob.data.color_attributes.new(name='BrickWear',type='FLOAT_COLOR',domain='POINT');shade=rng.uniform(.89,1.13)
            for v in ob.data.vertices:
                p=ob.matrix_world@v.co;nval=noise.noise_vector(p*25)[0];value=shade+.14*max(0,nval)
                color.data[v.index].color=(value,value*.985,value*.955,1)
    bpy.data.objects.remove(cut,do_unlink=True)
    for sample in [.17,.63]:
        p=Vector(outline[int(n*sample)]);direction=(p-Vector((cx,cz))).normalized()
        PlasterCrack(p-direction*.006,direction,.14+.09*rng.random(),index*41+int(sample*100))

for wall in walls:ProjectUv(wall,1.8)
