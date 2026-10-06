"""Irregular spalled lime plaster with fractured sections and shallow masonry."""
from mathutils import noise
import bmesh
walls=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Wall')]
front=wy-.12
mortarMat=Material('CommandRoomMortar',(.40,.295,.175),.99,'CommandRoomPlaster')
# Ochre earth-and-lime scratch coat beneath the ivory finish.
mt=mortarMat.node_tree;bp=mt.nodes['Principled BSDF']
ln=next(l for l in mt.links if l.to_socket==bp.inputs['Base Color']);src=ln.from_socket;mt.links.remove(ln)
mx=mt.nodes.new('ShaderNodeMixRGB');mx.blend_type='MULTIPLY';mx.inputs[0].default_value=1;mx.inputs[2].default_value=(.65,.47,.28,1)
mt.links.new(src,mx.inputs[1]);mt.links.new(mx.outputs[0],bp.inputs['Base Color'])
patches=[(-2.51,2.49,.66,1.38),(-2.47,.66,.80,1.20),(-.79,2.98,.57,.48),
    (-.15,2.04,.67,1.37),(.76,.82,1.15,.62),(1.95,.64,1.13,.70),(2.61,1.60,.97,1.68)]
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

def WallAt(x,z):
    # Respect the window aperture and wall ends when placing shallow spalls.
    return any(min((w.matrix_world@Vector(p)).x for p in w.bound_box)+.005<x<max((w.matrix_world@Vector(p)).x for p in w.bound_box)-.005
        and min((w.matrix_world@Vector(p)).z for p in w.bound_box)+.005<z<max((w.matrix_world@Vector(p)).z for p in w.bound_box)-.005 for w in walls)

def SurfaceIsland(name,center,radius,depth,mat,rng,stretch=1):
    # Closed, chipped plaster layer. The centre and intermediate ring prevent
    # a large planar polygon from making the edge look like a pasted decal.
    x,z=center;count=22;outline=[]
    for k in range(count):
        a=k/count*math.tau;r=radius*rng.uniform(.70,1.14)
        outline.append((x+math.cos(a)*r,z+math.sin(a)*r*stretch))
    points=[(x,front+depth-.0015,z)]
    points.extend((px,front+depth+rng.uniform(-.0012,.0012),pz) for px,pz in outline)
    points.extend((px,front+depth+.005,pz) for px,pz in outline)
    faces=[(0,k+1,(k+1)%count+1) for k in range(count)]
    faces.extend((k+1,count+k+1,count+(k+1)%count+1,(k+1)%count+1) for k in range(count))
    faces.append(tuple(range(count+1,count*2+1)))
    ob=Mesh(name,points,faces,mat);Recalculate(ob);ProjectUv(ob,1.8)
    return ob,outline

allOutlines=[]

for index,(cx,cz,sx,sz) in enumerate(patches):
    rng=random.Random(738+index)
    coarse=[Vector((cx+x*sx*.5,cz+z*sz*.5)) for x,z in profiles[index%2]]
    # Worn lime loses sharp triangular tips. Smooth only the large silhouette,
    # then fracture it again at the much smaller grain scale below.
    for iteration in range(1):
        coarse=[point for i,p in enumerate(coarse) for point in (p.lerp(coarse[(i+1)%len(coarse)],.22),p.lerp(coarse[(i+1)%len(coarse)],.78))]
    outline=[]
    for i,p in enumerate(coarse):
        q=coarse[(i+1)%len(coarse)];edge=q-p;perp=Vector((-edge.y,edge.x)).normalized()
        steps=max(1,math.ceil(edge.length/.010))
        for j in range(steps):
            f=j/steps
            point=p.lerp(q,f)+perp*rng.uniform(-.0045,.0045)
            outline.append(tuple(point))
    allOutlines.append(outline)
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
    # The large loss exposes mostly earthen undercoat. Only an irregular,
    # smaller deep core reveals blue-grey bricks, as in the user's reference.
    innerOutline=[(cx+(x-cx)*(.50+.055*math.sin(i*.19)),cz+(z-cz)*(.65+.055*math.sin(i*.23))) for i,(x,z) in enumerate(outline)]
    nv=len(innerOutline)
    deepVerts=[(x,y,z) for y in [front-.02,front+.065] for x,z in innerOutline]
    deepFaces=[tuple(reversed(range(nv))),tuple(nv+i for i in range(nv))]+[(i,(i+1)%nv,nv+(i+1)%nv,nv+i) for i in range(nv)]
    brickCut=Mesh('InnerMasonryExposure',deepVerts,deepFaces,brick);Recalculate(brickCut)
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
            ob.data.update();Boolean(ob,brickCut,'INTERSECT')
            if not ob.data.polygons:bpy.data.objects.remove(ob,do_unlink=True);continue
            # Exact CSG must not retain the cutter's front cap after erosion.
            assert min((ob.matrix_world@v.co).y for v in ob.data.vertices)>front+.010, 'Invalid recessed brick intersection'
            ob.data.materials.clear();ob.data.materials.append(brick)
            for poly in ob.data.polygons:poly.material_index=0;poly.use_smooth=False
            ProjectUv(ob,.5)
            color=ob.data.color_attributes.new(name='BrickWear',type='FLOAT_COLOR',domain='POINT');shade=rng.uniform(.89,1.13)
            for v in ob.data.vertices:
                p=ob.matrix_world@v.co;nval=noise.noise_vector(p*25)[0];value=shade+.14*max(0,nval)
                color.data[v.index].color=(value*.96,value*.985,value,1)
    bpy.data.objects.remove(brickCut,do_unlink=True)
    bpy.data.objects.remove(cut,do_unlink=True)
    # Remnants of the scratch coat stay on some brick faces. They bridge the
    # mortar joints instead of tracing every brick like clean new tilework.
    for sample in range(7):
        px=cx+rng.uniform(-sx*.44,sx*.44);pz=cz+rng.uniform(-sz*.43,sz*.43)
        radius=rng.uniform(.014,.035)
        if not all(InsidePatch(px+dx,pz+dz,outline) for dx,dz in [(0,0),(radius,0),(-radius,0),(0,radius),(0,-radius)]):continue
        ob,_=SurfaceIsland('OldLimeResidue',(px,pz),radius,.013,mortarMat,rng,rng.uniform(1.2,3.2))
        colors=ob.data.color_attributes.new(name='FreshLimeSection',type='FLOAT_COLOR',domain='POINT')
        for v,c in zip(ob.data.vertices,colors.data):
            shade=rng.uniform(.82,1.05);c.color=(shade,shade*.975,shade*.925,1)
    for sample in [.17,.63]:
        p=Vector(outline[int(n*sample)]);direction=(p-Vector((cx,cz))).normalized()
        PlasterCrack(p-direction*.006,direction,.14+.09*rng.random(),index*41+int(sample*100))

# Peripheral shallow flakes progressively thin the plaster around major losses.
# They are cut into the wall; there are no separate floating chip particles.
for index,outline in enumerate(allOutlines):
    rng=random.Random(8321+index);cx,cz,sx,sz=patches[index]
    for sample in range(14):
        p=Vector(outline[int(sample/14*len(outline))]);direction=(p-Vector((cx,cz))).normalized()
        center=p+direction*rng.uniform(.022,.078);radius=rng.uniform(.026,.095)
        ob,edge=SurfaceIsland('PeelingLimeUndercoat',center,radius,.006,mortarMat,rng,rng.uniform(.65,1.4))
        if not all(WallAt(x,z) and not any(InsidePatch(x,z,other) for other in allOutlines) for x,z in edge):
            bpy.data.objects.remove(ob,do_unlink=True);continue
        n=len(edge);vs=[(x,y,z) for y in [front-.03,front+.012] for x,z in edge]
        fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
        cutter=Mesh('ShallowPeelVolume',vs,fs,plaster);Recalculate(cutter)
        for wall in walls:
            bounds=[wall.matrix_world@Vector(p) for p in wall.bound_box]
            if min(v.x for v in bounds)<center.x+radius and max(v.x for v in bounds)>center.x-radius and min(v.z for v in bounds)<center.y+radius*1.5 and max(v.z for v in bounds)>center.y-radius*1.5:
                Boolean(wall,cutter,'DIFFERENCE')
        bpy.data.objects.remove(cutter,do_unlink=True)
        colors=ob.data.color_attributes.new(name='FreshLimeSection',type='FLOAT_COLOR',domain='POINT')
        shade=rng.uniform(.91,1.15)
        for c in colors.data:c.color=(shade,shade*.976,shade*.935,1)

for wall in walls:
    # Subdivide long front triangles for slow albedo variation in physical
    # wall space. The PBR tile provides fine grain, never baked light or dirt
    # stripes repeated at the same scale over the entire room.
    bm=bmesh.new();bm.from_mesh(wall.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    for iteration in range(3):
        edges=[e for e in bm.edges if e.calc_length()>.13 and any(f.normal.y<-.5 for f in e.link_faces)]
        if not edges:break
        bmesh.ops.subdivide_edges(bm,edges=edges,cuts=3,use_grid_fill=True)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(wall.data);bm.free();wall.data.update()
    colors=wall.data.color_attributes.new(name='FreshLimeSection',type='FLOAT_COLOR',domain='POINT')
    for v in wall.data.vertices:
        p=wall.matrix_world@v.co
        broad=noise.noise_vector(Vector((p.x*1.8,2.37,p.z*1.7)))[0]
        grain=noise.noise_vector(Vector((p.x*9,5.8,p.z*7)))[0]
        low=math.exp(-max(0,p.z)/.48)
        # Pale abraded lime interleaves with warm absorbed dust and lower-wall
        # damp marks; neutral channels avoid the former rainbow blotches.
        rubbed=max(0,broad+.08)*.55
        shade=.98+rubbed+.11*grain-.24*low
        colors.data[v.index].color=(shade,shade*(.985-.015*low),shade*(.958-.04*low),1)
    ProjectUv(wall,1.8)
