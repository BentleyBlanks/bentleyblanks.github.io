"""Finish the relaxed high cloth without changing the approved V7 outline."""
import bpy, bmesh, math, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
body=bpy.data.objects['Pack_Bundle']
sim=bpy.data.objects['StudyV7_FrontLeafSimulation']
leaf=bpy.data.objects['StudyV7_RelaxedFrontLeaf']
deps=bpy.context.evaluated_depsgraph_get()
# Remove the previous coarse 18-vertex diagonal lip after its replacement.
# It is a disconnected part of the joined blanket, identifiable by topology.
bm=bmesh.new();bm.from_mesh(body.data);unseen=set(bm.verts);remove=[]
while unseen:
    first=unseen.pop();stack=[first];component=[first]
    while stack:
        vertex=stack.pop()
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex)
            if other in unseen:
                unseen.remove(other);stack.append(other);component.append(other)
    if len(component)==18 and min(v.co.x for v in component)>.10 and min(v.co.z for v in component)>.07:
        remove.extend(component)
if remove:bmesh.ops.delete(bm,geom=remove,context='VERTS')
bm.to_mesh(body.data);bm.free();body.data.update()
coarse=bpy.data.objects.get('StudyV7_RelaxedCoarseSource')
if coarse is None:
    evaluated=sim.evaluated_get(deps)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
    coarse=bpy.data.objects.new('StudyV7_RelaxedCoarseSource',mesh)
    scene.collection.objects.link(coarse);coarse.hide_render=True;coarse.hide_set(True)
    coarse['SimulationFrame']=scene.frame_current
mesh=coarse.data
raw=np.array([v.co[:] for v in mesh.vertices],dtype=np.float64)
rest=np.array([v.co[:] for v in sim.data.shape_keys.key_blocks['TieContactTarget'].data],dtype=np.float64)
faces=[tuple(p.vertices) for p in mesh.polygons]
assert len(raw)==81*65

def Blur(values,passes):
    result=values.copy()
    for _ in range(passes):
        padded=np.pad(result,((1,1),(1,1)),mode='edge')
        result=(padded[1:-1,1:-1]*4+padded[:-2,1:-1]+padded[2:,1:-1]+padded[1:-1,:-2]+padded[1:-1,2:])/8
    return result

# A little simulated compression remains. Broad cloth panels do not acquire
# the same row of short corrugations at every rectangular pin boundary.
delta=(raw[:,1]-rest[:,1]).reshape((65,81))
broad=Blur(delta,9).ravel()
small=(delta-Blur(delta,3)).ravel()
x=rest[:,0];z=rest[:,2]
side=np.clip((np.abs(x)-.065)/.085,0,1)
irregular=.8+.2*np.sin(x*37+z*23+.5)
height=(.22+.30*side)*irregular*broad+(.12+.13*side)*small
positions=rest.copy()
positions[:,1]+=height

# A few broad oblique folds merge and die away from the actual tie pressure.
# Each path has a different length/width; no repeated scratch pattern.
paths=[
    ((-.181,.118),(-.164,.109),(-.139,.082),.0019,.0040),
    ((-.181,.096),(-.164,.081),(-.135,.072),.0011,.0032),
    ((-.180,.027),(-.163,.005),(-.137,-.014),.0024,.0048),
    ((-.181,-.019),(-.163,-.024),(-.139,-.046),.0014,.0033),
    ((-.179,-.131),(-.163,-.115),(-.136,-.091),.0023,.0050),
    ((.181,.031),(.162,.018),(.132,.008),.0025,.0050),
    ((.181,.005),(.165,-.012),(.144,-.023),.0016,.0038),
    ((.177,-.117),(.162,-.099),(.139,-.080),.0016,.0040),
    ((-.058,.143),(-.049,.129),(-.036,.116),.0009,.0040),
    ((.022,-.142),(.041,-.132),(.056,-.113),.0012,.0042),
]
points=rest[:,[0,2]]
for a,b,c,amplitude,width in paths:
    a=np.array(a);b=np.array(b);c=np.array(c)
    best=np.full(len(rest),np.inf);signed=np.zeros(len(rest));along=np.zeros(len(rest))
    for t in np.linspace(0,1,45):
        center=(1-t)**2*a+2*(1-t)*t*b+t*t*c
        tangent=2*(1-t)*(b-a)+2*t*(c-b);tangent/=np.linalg.norm(tangent)
        d=points-center;distance=np.sum(d*d,axis=1);replace=distance<best
        best[replace]=distance[replace];signed[replace]=d[replace]@np.array([-tangent[1],tangent[0]]);along[replace]=t
    fade=np.sin(np.pi*along)**.8
    w=width*(.65+.35*np.sin(np.pi*along))
    ridge=np.exp(-(signed/w)**2)
    valley=.42*np.exp(-((signed-1.6*w)/(w*1.25))**2)
    positions[:,1]-=amplitude*fade*(ridge-valley)

new=bpy.data.meshes.new('StudyV7_NaturalCottonLeaf')
new.from_pydata(positions.tolist(),[],faces);new.update()
uv=new.uv_layers.new(name='UVMap')
for loop in new.loops:
    row,column=divmod(loop.vertex_index,81)
    uv.data[loop.index].uv=(.02+.46*column/80,.52+.46*row/64)
new.materials.append(body.data.materials[0])
previous=leaf.data;leaf.data=new
if previous.users==0:bpy.data.meshes.remove(previous)
bpy.ops.object.select_all(action='DESELECT');leaf.select_set(True);bpy.context.view_layer.objects.active=leaf
sub=leaf.modifiers.new('HighCottonSurface','SUBSURF');sub.levels=2;sub.render_levels=2;bpy.ops.object.modifier_apply(modifier=sub.name)
for polygon in leaf.data.polygons:polygon.use_smooth=True
leaf['Finish']='Relaxed compression, broad asymmetric gathering, preserved V7 outline'
leaf['ClothSimulationFrame']=coarse['SimulationFrame']
leafTree=BVHTree.FromObject(leaf,bpy.context.evaluated_depsgraph_get())

def Front(x,z):
    hit=leafTree.ray_cast(Vector((x,-.3,z)),Vector((0,1,0)),.4)
    return hit[0].y if hit[0] is not None else None

# Follow the new cloth with the existing repair rather than floating over it.
patch={}
for polygon in body.data.polygons:
    material=body.data.materials[polygon.material_index]
    if 'Patch' in material.name or 'Stitch' in material.name:
        for index in polygon.vertices:patch[index]=.0022 if 'Stitch' in material.name else .0015
for index,offset in patch.items():
    vertex=body.data.vertices[index];y=Front(vertex.co.x,vertex.co.z)
    if y is not None:vertex.co.y=y-offset
body.data.update()

# The independent jacket corner must remain above the relaxed blanket skin.
# Preserve the original folded full garment, including its hidden sleeves.
jacket=bpy.data.objects['Pack_Jacket']
for obj in jacket.children_recursive:
    if obj.type!='MESH':continue
    if obj.name.startswith('StudyV7_'):continue
    # The old game-scale button is replaced below by a rounded cloth knot.
    bm=bmesh.new();bm.from_mesh(obj.data)
    buttonFaces=[face for face in bm.faces if 'Button' in obj.data.materials[face.material_index].name]
    if buttonFaces:bmesh.ops.delete(bm,geom=buttonFaces,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    for vertex in obj.data.vertices:
        p=vertex.co
        if p.x>.105 and p.z>.073 and p.y<-.103:
            y=Front(p.x,p.z)
            if y is not None:
                p.y=y-.0038
    obj.data.update()

old=bpy.data.objects.get('StudyV7_ClothKnotButton')
if old:bpy.data.objects.remove(old,do_unlink=True)
knotVerts=[];knotFaces=[]
def CottonTube(path,radius,sides=10):
    first=len(knotVerts);count=len(path)
    for i,point in enumerate(path):
        tangent=(Vector(path[(i+1)%count])-Vector(path[(i-1)%count])).normalized()
        side=tangent.cross(Vector((0,1,0))).normalized();normal=tangent.cross(side).normalized()
        for j in range(sides):
            angle=math.tau*j/sides
            knotVerts.append(tuple(Vector(point)+radius*(math.cos(angle)*side+math.sin(angle)*normal)))
    for i in range(count):
        for j in range(sides):
            a=first+i*sides+j;b=first+i*sides+(j+1)%sides
            c=first+((i+1)%count)*sides+(j+1)%sides;d=first+((i+1)%count)*sides+j
            knotFaces.append((a,b,c,d))
center=Vector((.155,0,.124));center.y=Front(center.x,center.z)-.0068
path=[]
for i in range(72):
    t=math.tau*i/72
    path.append(tuple(center+Vector((.0033*math.sin(t),.00085*math.cos(t),.00135*math.sin(2*t)))))
CottonTube(path,.0011,12)
eye=[]
for i in range(40):
    t=math.tau*i/40;px=.1603+.0031*math.cos(t);pz=.124+.0018*math.sin(t)
    eye.append((px,Front(px,pz)-.0057,pz))
CottonTube(eye,.0007,10)
knotMesh=bpy.data.meshes.new('StudyV7_ClothKnotMesh');knotMesh.from_pydata(knotVerts,[],knotFaces);knotMesh.update()
knot=bpy.data.objects.new('StudyV7_ClothKnotButton',knotMesh);scene.collection.objects.link(knot);knot.parent=jacket
knotMesh.materials.append(next(m for m in bpy.data.materials if m.name=='Material_SichuanJacketButton'))
knotUv=knotMesh.uv_layers.new(name='UVMap')
for loop in knotMesh.loops:
    p=knotMesh.vertices[loop.vertex_index].co;knotUv.data[loop.index].uv=(.70+(p.x-.15),.45+(p.z-.12))
for polygon in knotMesh.polygons:polygon.use_smooth=True

# A thin turned blanket edge overlaps the left diagonal of the jacket corner.
old=bpy.data.objects.get('StudyV7_JacketTuckLip')
if old:bpy.data.objects.remove(old,do_unlink=True)
verts=[];polygons=[];steps=64;across=8
for row in range(steps+1):
    t=row/steps
    cx=.112+.063*t+.0009*math.sin(t*math.pi*2)
    cz=.139-.061*t
    for column in range(across+1):
        s=column/across
        px=cx+.0070*(s-.5);pz=cz+.0073*(s-.5)
        y=Front(px,pz)
        if y is None:y=-.111
        py=y-.0037-.0022*math.sin(math.pi*s)
        verts.append((px,py,pz))
for row in range(steps):
    for col in range(across):
        a=row*(across+1)+col;polygons.append((a,a+1,a+across+2,a+across+1))
lipMesh=bpy.data.meshes.new('StudyV7_JacketTuckLipMesh');lipMesh.from_pydata(verts,[],polygons);lipMesh.update()
lip=bpy.data.objects.new('StudyV7_JacketTuckLip',lipMesh);scene.collection.objects.link(lip);lip.parent=body
lipMesh.materials.append(body.data.materials[0])
lipUv=lipMesh.uv_layers.new(name='UVMap')
for loop in lipMesh.loops:
    p=lipMesh.vertices[loop.vertex_index].co;lipUv.data[loop.index].uv=(.02+.46*(p.x+.19)/.38,.52+.46*(p.z+.15)/.30)
for polygon in lipMesh.polygons:polygon.use_smooth=True
solid=lip.modifiers.new('TurnedCottonThickness','SOLIDIFY');solid.thickness=.0008;solid.offset=0
scene['HighV7View']='three'
print('HIGH_CLOTH_FINISHED',json.dumps({'leafVertices':len(leaf.data.vertices),'simulationFrame':51,'silhouette':'V7 preserved'}))
