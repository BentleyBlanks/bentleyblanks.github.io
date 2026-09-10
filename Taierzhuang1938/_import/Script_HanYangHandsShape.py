"""One HanYang hand-model revision in the isolated BlenderMCP source scene.

No animation generation. The original mesh is retained in a source shape key.
"""
import bpy
import bmesh
import math
from mathutils import Vector
from pathlib import Path

scene=bpy.context.scene
assert Path(bpy.data.filepath).parent.name=='HanYangHands_20260910'
rig=next(o for o in scene.objects if o.type=='ARMATURE')
mesh=next(o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
rig.data.pose_position='REST'
Normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
Find=lambda name:next(b for b in rig.data.bones if Normalize(b.name).endswith(name))
if not mesh.data.shape_keys:mesh.shape_key_add(name='Basis')
basis=mesh.data.shape_keys.key_blocks['Basis']
shape=mesh.data.shape_keys.key_blocks.get('HanYangHandVolume') or mesh.shape_key_add(name='HanYangHandVolume')
shape.value=1
frames={}
for side in ('r','l'):
    hand=rig.matrix_world@Find(side+'hand').head_local
    middle=rig.matrix_world@Find(side+'finger2').head_local
    index=rig.matrix_world@Find(side+'finger1').head_local
    little=rig.matrix_world@Find(side+'finger4').head_local
    forward=(middle-hand).normalized()
    across=(index-little).normalized()
    normal=forward.cross(across).normalized()
    frames[side]=(hand,forward,normal)
if not mesh.get('fpsWristSeamsClosed'):
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh;mesh.active_shape_key_index=0
    bpy.ops.object.mode_set(mode='EDIT');bm=bmesh.from_edit_mesh(mesh.data)
    # Weld the complete skin seam first. Selecting only the closest wrist edges
    # truncates the long UV seam and leaves the actual opening unfilled.
    skinVertices={v for face in bm.faces if face.material_index!=1 for v in face.verts}
    bmesh.ops.remove_doubles(bm,verts=list(skinVertices),dist=.002)
    pending={e for e in bm.edges if e.is_boundary and e.link_faces[0].material_index!=1}
    repaired=[]
    while pending:
        edges={pending.pop()};vertices=set(next(iter(edges)).verts)
        while True:
            adjacent={e for v in vertices for e in v.link_edges if e in pending}
            if not adjacent:break
            pending-=adjacent;edges|=adjacent;vertices|={v for e in adjacent for v in e.verts}
        # The open forearm ends remain under the coat. Only close wrist slits.
        if all(abs(v.co.y)>85 for v in vertices):
            assert all(sum(e in edges for e in v.link_edges)==2 for v in vertices)
            faces=bmesh.ops.holes_fill(bm,edges=list(edges),sides=64)['faces']
            faces=bmesh.ops.triangulate(bm,faces=faces,ngon_method='BEAUTY')['faces']
            for face in faces:face.material_index=0;face.smooth=True
            repaired.extend(faces)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.update_edit_mesh(mesh.data);bpy.ops.object.mode_set(mode='OBJECT')
    mesh['fpsWristSeamsClosed']=len(repaired)
    mesh['fpsGloveEdgeSplitBmesh']=0
segments={}
for group in mesh.vertex_groups:
    name=Normalize(group.name)
    if 'finger' in name:
        bone=next(b for b in rig.data.bones if b.name==group.name)
        child=next(iter(bone.children),None)
        start=rig.matrix_world@bone.head_local
        end=rig.matrix_world@child.head_local if child else start+(start-(rig.matrix_world@bone.parent.head_local))
        segments[group.index]=(start,end,1.15 if 'finger0' in name else 1.12)
    elif name.endswith('forearm') or name.endswith('upperarm'):
        bone=next(b for b in rig.data.bones if b.name==group.name)
        child=next(b for b in bone.children if Normalize(b.name).endswith('hand' if name.endswith('forearm') else 'forearm'))
        segments[group.index]=(rig.matrix_world@bone.head_local,rig.matrix_world@child.head_local,1.35)
inverse=mesh.matrix_world.inverted()
clothVertices={i for polygon in mesh.data.polygons if polygon.material_index==1 for i in polygon.vertices}
for vertex in mesh.data.vertices:
    point=mesh.matrix_world@basis.data[vertex.index].co
    side='r' if point.x<0 else 'l'
    hand,forward,normal=frames[side]
    distance=(point-hand).dot(forward)
    cloth=vertex.index in clothVertices
    if (cloth and distance>-.12) or (not cloth and -.06<distance<.02):
        blend=0 if cloth else max(0,min(1,(distance+.025)/.045))
        blend=blend*blend*(3-2*blend)
        for assignment in list(vertex.groups):mesh.vertex_groups[assignment.group].remove([vertex.index])
        mesh.vertex_groups[Find(side+'forearm').name].add([vertex.index],1-blend,'REPLACE')
        mesh.vertex_groups[Find(side+'hand').name].add([vertex.index],blend,'REPLACE')
for vertex in mesh.data.vertices:
    point=mesh.matrix_world@basis.data[vertex.index].co
    delta=Vector((0,0,0))
    for assignment in vertex.groups:
        name=Normalize(mesh.vertex_groups[assignment.group].name)
        if assignment.group in segments:
            start,end,scale=segments[assignment.group]
            axis=(end-start).normalized()
            radial=point-start-axis*(point-start).dot(axis)
            delta+=radial*(scale-1)*assignment.weight
        elif name.endswith('hand'):
            side='r' if 'rhand' in name else 'l'
            hand,forward,normal=frames[side]
            delta+=normal*(point-hand).dot(normal)*.30*assignment.weight
    if vertex.index in clothVertices:
        side='r' if point.x<0 else 'l'
        hand,forward,normal=frames[side]
        distance=(point-hand).dot(forward)
        amount=max(0,min(1,(distance+.20)/.20))
        delta-=forward*.012*amount*amount*(3-2*amount)
        # Shallow, uneven cloth folds near the cuff; the sleeve stays loose
        # around the forearm instead of reading as a smooth tapered cylinder.
        if -.32<distance<0:
            start=rig.matrix_world@Find(side+'forearm').head_local
            axis=(hand-start).normalized()
            radial=point-start-axis*(point-start).dot(axis)
            around=math.atan2(radial.dot(normal),radial.dot(normal.cross(forward)))
            envelope=max(0,min(1,(distance+.32)/.06))*max(0,min(1,-distance/.04))
            phase=(distance+.055)*92+math.sin(around*2.0)*.6
            fold=(math.sin(phase)+.25*math.sin(phase*1.83+around))*.006*envelope
            delta+=radial.normalized()*fold
    shape.data[vertex.index].co=inverse@(point+delta)

# Bare skin uses the original hand albedo and anatomical normal map.
skin=bpy.data.materials.get('Material_HanYangSkin')
if skin is None:
    skin=bpy.data.materials['John_All Body'].copy();skin.name='Material_HanYangSkin'
shader=skin.node_tree.nodes.get('Principled BSDF')
for link in list(shader.inputs['Base Color'].links):skin.node_tree.links.remove(link)
skin.node_tree.links.new(skin.node_tree.nodes['Image Texture'].outputs['Color'],shader.inputs['Base Color'])
shader.inputs['Roughness'].default_value=.64
skin.node_tree.nodes['Normal Map'].uv_map='UVMap'
skin.node_tree.nodes['Normal Map'].inputs['Strength'].default_value=.65
mesh.data.materials[0]=skin
for polygon in mesh.data.polygons:
    if polygon.material_index!=1:polygon.material_index=0
# Closed seam triangles originally interpolated across different UV islands.
# Extend the nearest intact skin triangle instead of sampling unrelated body pixels.
import numpy as np
mesh.data.calc_loop_triangles()
uv=mesh.data.uv_layers['UVMap'].data
bad=[];good=[]
for triangle in mesh.data.loop_triangles:
    if mesh.data.polygons[triangle.polygon_index].material_index==1:continue
    points=[uv[i].uv.copy() for i in triangle.loops]
    (bad if max((a-b).length for a in points for b in points)>.15 else good).append(triangle)
for triangle in bad:
    vertices=set(triangle.vertices)
    center=sum((basis.data[i].co for i in triangle.vertices),Vector())/3
    candidates=[t for t in good if len(vertices.intersection(t.vertices))>=2]
    if not candidates:candidates=good
    closest=min(candidates,key=lambda t:((sum((basis.data[i].co for i in t.vertices),Vector())/3)-center).length_squared)
    a,b,c=[basis.data[i].co for i in closest.vertices]
    origin=uv[closest.loops[0]].uv.copy()
    u=uv[closest.loops[1]].uv-origin;v=uv[closest.loops[2]].uv-origin
    axes=np.array([b-a,c-a]).T
    for index,loop in zip(triangle.vertices,triangle.loops):
        factors=np.linalg.lstsq(axes,np.array(basis.data[index].co-a),rcond=None)[0]
        uv[loop].uv=origin+u*float(factors[0])+v*float(factors[1])
mesh['fpsWristUvRepaired']=len(bad)
while len(mesh.data.materials)>2:mesh.data.materials.pop(index=len(mesh.data.materials)-1)
# The 24 closure triangles have no original anatomical texture coverage.
# Use the adjacent wrist skin tone rather than stretching body-map details.
wrist=bpy.data.materials.get('Material_HanYangWrist')
if wrist is None:wrist=bpy.data.materials.new('Material_HanYangWrist')
wrist.use_nodes=True
wristShader=wrist.node_tree.nodes.get('Principled BSDF')
wristShader.inputs['Base Color'].default_value=(.46,.285,.215,1)
wristShader.inputs['Roughness'].default_value=.64
mesh.data.materials.append(wrist)
for index in mesh.get('fpsWristRepairFaces',[]):mesh.data.polygons[index].material_index=2
coat=mesh.data.materials[1]
coatShader=coat.node_tree.nodes.get('Principled BSDF')
for socket in ('Base Color','Roughness'):
    for link in list(coatShader.inputs[socket].links):coat.node_tree.links.remove(link)
coatShader.inputs['Base Color'].default_value=(.235,.215,.175,1)
coatShader.inputs['Roughness'].default_value=.9
coat.diffuse_color=(.235,.215,.175,1)
previous=bpy.data.objects.get('Mesh_HanYangCuffs')
if previous:bpy.data.objects.remove(previous,do_unlink=True)
uv=mesh.data.uv_layers.get('UV_HanYangGlove')
if uv:mesh.data.uv_layers.remove(uv)
rig['fpsHandRevision']='HanYang bare hands, earth-gray sleeves, repaired wrist seams'
rig.data.pose_position='POSE'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
result={'source':bpy.data.filepath,'vertices':len(mesh.data.vertices),'shape':shape.name,'gloves':False,'sleeveColor':'earth-gray'}
