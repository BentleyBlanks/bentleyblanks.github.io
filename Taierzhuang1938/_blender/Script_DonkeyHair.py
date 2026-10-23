"""Grouped short mane locks and a fanned forelock, sampled on the fitted skin."""
import bpy,math,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def CreateHair(name,vertices,faces,weights,material,rig,collection):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.parent=rig
    for index,row in enumerate(weights):
        for key,value in row.items():
            if value<=0:continue
            group=obj.vertex_groups.get(key) or obj.vertex_groups.new(name=key);group.add([index],value,'REPLACE')
    modifier=obj.modifiers.new('DonkeyHairSkin','ARMATURE');modifier.object=rig
    return obj

def RebuildReferenceMane(skin,rig,collection):
    material=next(m for m in bpy.data.materials if m.name.startswith('DonkeyCartDarkHair'))
    for obj in list(collection.objects):
        if obj.name=='DonkeyManeFineFibres' or obj.name.startswith('DonkeyForelockFibre'):
            bpy.data.objects.remove(obj,do_unlink=True)
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    eye=bpy.data.objects['DonkeyEyeLeft'];matrix=rig.matrix_world.inverted()@eye.matrix_world
    eyeY=sum((matrix@v.co).y for v in eye.data.vertices)/len(eye.data.vertices)
    rng=random.Random(19381026)
    def Root(x,y):
        point,_,_,_=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),2)
        if point is None:raise RuntimeError('Mane root has no fitted skin')
        return point-Vector((0,0,.00035))
    def Strand(vertices,faces,weights,root,end,width,row):
        middle=root.lerp(end,.55)+Vector((0,-.001,0))
        tangent=(end-root).normalized();angle=rng.uniform(0,2*math.pi);across=Vector((math.cos(angle),math.sin(angle),0))
        across=(across-tangent*across.dot(tangent)).normalized()
        for axis in (across,tangent.cross(across).normalized()):
            start=len(vertices)
            for t,p in zip((0,.55,1),(root,middle,end)):
                half=width*(1-t)+.000075*t
                vertices.extend((p-axis*half,p+axis*half));weights.extend((row,row))
            faces.extend(((start,start+1,start+3,start+2),(start+2,start+3,start+5,start+4)))
    vertices=[];faces=[];weights=[]
    for lock in range(64):
        t=(lock+.5)/64;y=.635+.495*t;x=rng.uniform(-.005,.005)
        length=(.024+.027*math.sin(math.pi*t*.80))*rng.uniform(.55,1.25)
        target=Root(x,y)+Vector((rng.uniform(-.002,.002),-.017-rng.random()*.012,length))
        head=max(0,min(1,(y-.98)/.10));row={'DonkeyNeckPivot':1-head,'DonkeyHeadPivot':head}
        for strand in range(7):
            root=Root(x+rng.uniform(-.0025,.0025),y+rng.uniform(-.0035,.0035))
            end=target+Vector((rng.uniform(-.0015,.0015),rng.uniform(-.0015,.0015),rng.uniform(-.006,.006)))
            Strand(vertices,faces,weights,root,end,rng.uniform(.0012,.0020),row)
    CreateHair('DonkeyManeFineFibres',vertices,faces,weights,material,rig,collection)
    maneTriangles=sum(len(f)-2 for f in faces)
    vertices=[];faces=[];weights=[]
    for lock in range(32):
        x=rng.uniform(-.019,.019);y=rng.uniform(eyeY-.068,eyeY-.023);centre=Root(x,y)
        target=centre+Vector((x*.65+rng.uniform(-.003,.003),.008+rng.random()*.005,rng.uniform(.030,.050)))
        for strand in range(5):
            root=Root(x+rng.uniform(-.0015,.0015),y+rng.uniform(-.0015,.0015))
            end=target+Vector((rng.uniform(-.002,.002),rng.uniform(-.002,.002),rng.uniform(-.003,.003)))
            Strand(vertices,faces,weights,root,end,rng.uniform(.0010,.0016),{'DonkeyHeadPivot':1})
    CreateHair('DonkeyForelockFineFibres',vertices,faces,weights,material,rig,collection)
    return {'maneLocks':64,'maneStrands':448,'forelockLocks':32,'forelockStrands':160,
            'triangles':maneTriangles+sum(len(f)-2 for f in faces),'method':'grouped tapered strands rooted on the measured skin'}
