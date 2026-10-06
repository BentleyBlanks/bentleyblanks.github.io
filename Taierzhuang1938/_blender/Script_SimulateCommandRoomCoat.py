"""Bake a connected open-front coat pattern into a static hanging garment.

Run in the task BlenderMCP scene before rebuilding the room. The saved JSON
retains the sewn topology, UVs and seam paths; realtime needs no cloth solver.
"""
import bpy, math, json, os, bmesh
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(os.environ.get('COMMAND_ROOM_ROOT',r'C:\Users\Bentl\Documents\bentleyblanks_Codex_CommandRoomMenu_20261004'))
DEST=ROOT/'Taierzhuang1938/_blender/Data_CommandRoomCoatMesh.json'
scene=bpy.context.scene
assert Path(bpy.data.filepath).name=='Scene_CommandRoom.blend'
originalScene=scene
simScene=bpy.data.scenes.new('CoatDrapeSimulation')
bpy.context.window.scene=simScene
simScene.frame_start=1;simScene.frame_end=300;simScene.render.fps=30
simScene.gravity=(0,0,-9.81)
verts=[];faces=[];uvs=[];seams=[]
NU=64;NV=64
def Profile(t,points):
    for (a,x),(b,y) in zip(points,points[1:]):
        if t<=b:
            q=max(0,min(1,(t-a)/(b-a)));q=q*q*(3-2*q)
            return x+(y-x)*q
    return points[-1][1]
def Body(i,j):
    t=j/NV;u=i/NU;a=-math.pi/2+.045+u*(math.tau-.09)
    width=Profile(t,[(0,.059),(.12,.225),(.28,.240),(.6,.255),(1,.29)])
    depth=Profile(t,[(0,.039),(.13,.086),(.4,.072),(1,.067)])
    # The cut pattern has enough cloth to collapse; unequal folds seed the
    # solver without forcing a radial cone or a symmetrical mannequin pose.
    folds=(.013*math.sin(a*7+.7+t*3)+.009*math.sin(a*11-.8-t*4))*math.sin(t*math.pi*.85)
    return Vector((width*math.cos(a)+folds*math.cos(a),depth*math.sin(a)+folds*math.sin(a),
                   -1.23*t+.019*math.sin(a*2+.6)*t**4))
for j in range(NV+1):
    for i in range(NU+1):verts.append(Body(i,j));uvs.append((i/NU*1.35,j/NV*1.23))
def Id(i,j):return j*(NU+1)+i
# Rectangular armholes in the cylindrical pattern, bridged to sleeve rings.
holes=[(12,20,7,18,-1),(44,52,7,18,1)]
for j in range(NV):
    for i in range(NU):
        if any(a<=i<b and c<=j<d for a,b,c,d,s in holes):continue
        faces.append((Id(i,j),Id(i,j+1),Id(i+1,j+1),Id(i+1,j)))
seams.extend([[Id(0,j) for j in range(NV+1)],[Id(NU,j) for j in range(NV+1)],
              [Id(i,NV) for i in range(NU+1)],[Id(NU//2,j) for j in range(NV+1)]])
for a,b,c,d,side in holes:
    boundary=([Id(i,c) for i in range(a,b)]+[Id(b,j) for j in range(c,d)]
             +[Id(i,d) for i in range(b,a,-1)]+[Id(a,j) for j in range(d,c,-1)])
    # i=16 is +X and i=48 is -X in the unfolded torso.
    side=1 if a<32 else -1
    center=sum((verts[k] for k in boundary),Vector())/len(boundary)
    count=len(boundary);previous=boundary;seams.append(boundary+[boundary[0]])
    length=.66 if side<0 else .73
    for row in range(1,37):
        t=row/36
        axis=Vector((side*(.19*t+.023*math.sin(t*math.pi)), -.021*t,-length*t))
        tangent=Vector((side*.19,-.021,-length)).normalized()
        vx=Vector((0,1,0));vy=tangent.cross(vx).normalized()
        radius=.091*(1-t)+.064*t
        ring=[]
        for k,old in enumerate(boundary):
            source=verts[old]-center
            angle=math.atan2(source.dot(vy),source.dot(vx))
            radial=radius+(.006*math.sin(angle*5+t*6)+.003*math.sin(angle*9-t*4))*math.sin(math.pi*t)
            section=vx*(math.cos(angle)*radial*.78)+vy*(math.sin(angle)*radial)
            # Match the real armhole exactly before rounding into the sleeve.
            blend=min(1,t/.22);blend=blend*blend*(3-2*blend)
            p=center+axis+source.lerp(section,blend)
            ring.append(len(verts));verts.append(p);uvs.append((k/count*.55,1.4+t*length))
        faces.extend((previous[k],ring[k],ring[(k+1)%count],previous[(k+1)%count]) for k in range(count))
        if row==36:seams.append(ring+[ring[0]])
        previous=ring
# Folded collar stitched to the neck opening, a separate rolled-over strip.
neck=[Id(i,0) for i in range(NU+1)];previous=neck
for row in range(1,7):
    t=row/6;ring=[]
    for i,k in enumerate(neck):
        p=verts[k].copy();a=-math.pi/2+.045+i/NU*(math.tau-.09)
        p.x+=math.cos(a)*(.024*t+.021*t*t)
        p.y+=math.sin(a)*(.024*t+.012*t*t)
        p.z+=.039*math.sin(t*math.pi)-.035*t*t
        ring.append(len(verts));verts.append(p);uvs.append((i/NU*.38,-t*.075))
    faces.extend((previous[i],previous[i+1],ring[i+1],ring[i]) for i in range(NU))
    previous=ring
seams.append(previous)
mesh=bpy.data.meshes.new('SewnCoatPattern');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new('SewnCoatPattern',mesh);simScene.collection.objects.link(ob)
# Remove isolated grid vertices inside the armholes, preserving remap below.
used=sorted({k for f in faces for k in f});remap={old:new for new,old in enumerate(used)}
faces=[tuple(remap[k] for k in f) for f in faces];uvs=[uvs[k] for k in used];verts=[verts[k] for k in used]
seams=[[remap[k] for k in p] for p in seams]
mesh.clear_geometry();mesh.from_pydata(verts,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='UVMap')
for poly in mesh.polygons:
    poly.use_smooth=True
    for li in poly.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
# Relax the initial pattern square to the collision wall. The final viewing
# angle is applied by the room authoring script after the cloth has settled.
rot=Matrix.Identity(3)
for v in mesh.vertices:v.co=rot@v.co
pins=ob.vertex_groups.new(name='NeckSupport')
for i in range(NU//2-4,NU//2+5):pins.add([remap[Id(i,0)]],1,'REPLACE')
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
clothMod=ob.modifiers.new('Gravity and sewn panel relaxation','CLOTH')
st=clothMod.settings;st.quality=12;st.mass=.4
st.tension_stiffness=40;st.compression_stiffness=40;st.shear_stiffness=20;st.bending_stiffness=.70
st.tension_damping=8;st.compression_damping=8;st.shear_damping=8;st.bending_damping=.8
st.air_damping=10;st.vertex_group_mass=pins.name;st.pin_stiffness=1
cc=clothMod.collision_settings;cc.use_collision=True;cc.distance_min=.004
cc.collision_quality=5;cc.use_self_collision=True;cc.self_distance_min=.0025;cc.self_friction=5
# The initial pattern must lie wholly in front of the collision surface.
# A wall cutting through the rest sleeves traps them on opposite sides.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.23,-.65))
wall=bpy.context.object;wall.name='CoatSimulationWall';wall.dimensions=(2,.12,2)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
wall.modifiers.new('Wall collision','COLLISION');wall.collision.thickness_outer=.004
clothMod.point_cache.frame_start=1;clothMod.point_cache.frame_end=300
for frame in range(1,301):
    simScene.frame_set(frame);bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();evaluated=ob.evaluated_get(deps)
    # Force evaluation now, rather than making frame_set a deferred cache jump.
    _=len(evaluated.data.vertices)
    if frame%16==0:print('Cloth frame',frame,flush=True)
evaluatedCoat=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
points=[list(v.co) for v in evaluatedCoat.data.vertices]
assert len(points)==len(verts)
assert all(math.isfinite(c) and abs(c)<3 for p in points for c in p)
data={'method':'Blender cloth, connected torso/armholes/sleeves, neck support, gravity, wall and self collision',
      'frames':300,'vertices':[[round(c,6) for c in p] for p in points],
      'faces':faces,'uvs':[[round(c,6) for c in p] for p in uvs],'seams':seams}
DEST.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
print(json.dumps({'coatVertices':len(points),'coatFaces':len(faces),'file':str(DEST)}))
bpy.context.window.scene=originalScene
bpy.data.scenes.remove(simScene)
result={'coatVertices':len(points),'coatFaces':len(faces),'file':str(DEST)}
