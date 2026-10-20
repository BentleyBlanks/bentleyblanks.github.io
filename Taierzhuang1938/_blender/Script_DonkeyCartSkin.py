"""Closed voxel heat envelope, barycentric transfer to the untouched authored skin."""
import bpy,bmesh,math,json
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

def RebindDonkeySkin(rig,skin):
    originalSkin=skin
    skin=originalSkin.copy();skin.data=originalSkin.data.copy();bpy.context.scene.collection.objects.link(skin);skin.name='DonkeyHeatSurface'
    world=skin.matrix_world.copy();skin.parent=None;skin.matrix_world=world
    for mod in list(skin.modifiers):skin.modifiers.remove(mod)
    skin.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT');skin.select_set(True);bpy.context.view_layer.objects.active=skin
    skin.data.remesh_voxel_size=.013
    bpy.ops.object.voxel_remesh()
    bm=bmesh.new();bm.from_mesh(skin.data)
    edges=[edge for edge in bm.edges if edge.is_boundary]
    if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=512)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free()
    if 'DonkeyChestPivot' not in rig.data.bones:
        bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
        bpy.ops.object.mode_set(mode='EDIT');bone=rig.data.edit_bones.new('DonkeyChestPivot');bone.head=(0,.64,.84);bone.tail=(0,.715,.84);bone.parent=rig.data.edit_bones['DonkeyThoraxPivot'];bpy.ops.object.mode_set(mode='OBJECT')
    origins={b.name:b.head_local.copy() for b in rig.data.bones}
    data=bpy.data.armatures.new('DonkeyWeightEnvelope');proxy=bpy.data.objects.new('DonkeyWeightEnvelope',data);bpy.context.scene.collection.objects.link(proxy)
    proxy.matrix_world=rig.matrix_world.copy()
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy;bpy.ops.object.mode_set(mode='EDIT')
    for name,p in origins.items():
        bone=data.edit_bones.new(name);bone.head=p;tail=p+Vector((0,.08,0))
        for suffix,nextSuffix in [('ElbowPivot','KneePivot'),('KneePivot','HoofPivot')]:
            if name.endswith(suffix) and name[:-len(suffix)]+nextSuffix in origins:tail=origins[name[:-len(suffix)]+nextSuffix]
        if name.endswith('Pivot') and any(part in name for part in ['FrontLeft','FrontRight','RearLeft','RearRight']) and not any(part in name for part in ['Elbow','Knee','Hoof']):tail=origins[name[:-5]+'ElbowPivot']
        if name.endswith('HoofPivot'):tail=p+Vector((0,.065,-.045))
        if name=='DonkeyBodyPivot':tail=origins['DonkeyThoraxPivot']
        if name=='DonkeyPelvisPivot':tail=origins['DonkeyBodyPivot']
        if name=='DonkeyThoraxPivot':tail=origins['DonkeyNeckPivot']
        if name=='DonkeyNeckPivot':tail=origins['DonkeyHeadPivot']
        if name=='DonkeyHeadPivot':tail=Vector((0,origins['DonkeyHeadPivot'].y+.17,origins['DonkeyHeadPivot'].z-.32))
        if name=='DonkeyChestPivot':tail=Vector((0,.68,.70))
        bone.tail=tail
        bone.use_deform=not any(tag in name for tag in ['Root','Hitch','Ear','Tail'])
    for bone in rig.data.bones:
        if bone.parent:data.edit_bones[bone.name].parent=data.edit_bones[bone.parent.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    world=skin.matrix_world.copy()
    for mod in list(skin.modifiers):
        if mod.type=='ARMATURE':skin.modifiers.remove(mod)
    skin.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT');skin.select_set(True);proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
    skin.parent=rig;skin.matrix_world=world
    for mod in skin.modifiers:
        if mod.type=='ARMATURE':mod.object=rig
    footNames=[n for n in origins if n.endswith('HoofPivot')]
    missing=0
    for vertex in skin.data.vertices:
        row={skin.vertex_groups[g.group].name:g.weight for g in vertex.groups if g.weight>1e-7}
        if vertex.co.z<.105:
            name=min(footNames,key=lambda n:(vertex.co-origins[n]).length_squared);row={name:1}
        if not row:missing+=1;continue
        top=sorted(row.items(),key=lambda x:-x[1])[:4];total=sum(w for _,w in top)
        for item in list(vertex.groups):skin.vertex_groups[item.group].remove([vertex.index])
        for name,value in top:
            group=skin.vertex_groups.get(name) or skin.vertex_groups.new(name=name);group.add([vertex.index],value/total,'REPLACE')
    print(json.dumps({'vertices':len(skin.data.vertices),'missing':missing,'groups':len(skin.vertex_groups)}))
    if missing:
        bpy.data.objects.remove(proxy,do_unlink=True);bpy.data.objects.remove(skin,do_unlink=True)
        raise RuntimeError('Heat envelopes left unweighted skin')
    skin.data.calc_loop_triangles();triangles=[tuple(t.vertices) for t in skin.data.loop_triangles]
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],triangles,all_triangles=True)
    cageRows=[{skin.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-8} for v in skin.data.vertices]
    originalSkin.vertex_groups.clear()
    transform=skin.matrix_world.inverted()@originalSkin.matrix_world
    for vertex in originalSkin.data.vertices:
        position=transform@vertex.co;near,normal,index,distance=tree.find_nearest(position)
        ids=triangles[index];a,b,c=[skin.data.vertices[i].co for i in ids]
        v0=b-a;v1=c-a;v2=near-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01
        v=(d11*d20-d01*d21)/den if den else 0;w=(d00*d21-d01*d20)/den if den else 0;u=1-v-w
        row={}
        for i,factor in zip(ids,[u,v,w]):
            for name,value in cageRows[i].items():row[name]=row.get(name,0)+value*max(0,factor)
        if vertex.co.z<.105:row={min(footNames,key=lambda n:(vertex.co-origins[n]).length_squared):1}
        top=sorted(row.items(),key=lambda x:-x[1])[:4];total=sum(value for _,value in top)
        for name,value in top:
            group=originalSkin.vertex_groups.get(name) or originalSkin.vertex_groups.new(name=name);group.add([vertex.index],value/total,'REPLACE')
    bpy.data.objects.remove(proxy,do_unlink=True);bpy.data.objects.remove(skin,do_unlink=True)
    for mod in originalSkin.modifiers:
        if mod.type=='ARMATURE':mod.object=rig
    names=[g.name for g in originalSkin.vertex_groups];count=len(names)
    matrix=np.zeros((len(originalSkin.data.vertices),count),dtype=np.float32)
    for vertex in originalSkin.data.vertices:
        for g in vertex.groups:matrix[vertex.index,g.group]=g.weight
    edges=np.array([tuple(edge.vertices) for edge in originalSkin.data.edges],dtype=np.int32)
    starts=np.r_[edges[:,0],edges[:,1]];ends=np.r_[edges[:,1],edges[:,0]]
    degrees=np.bincount(starts,minlength=len(matrix)).clip(1)
    mask=np.array([.50<v.co.z<1.10 and v.co.y<.95 for v in originalSkin.data.vertices])
    for iteration in range(28):
        average=np.zeros_like(matrix);np.add.at(average,starts,matrix[ends]);average/=degrees[:,None]
        matrix[mask]=matrix[mask]*.55+average[mask]*.45
    for vertex in originalSkin.data.vertices:
        if not mask[vertex.index]:continue
        row=matrix[vertex.index];indices=np.argsort(row)[-4:];total=float(row[indices].sum())
        for item in list(vertex.groups):originalSkin.vertex_groups[item.group].remove([vertex.index])
        for index in indices:
            if row[index]>1e-8:originalSkin.vertex_groups[int(index)].add([vertex.index],float(row[index])/total,'REPLACE')
    print('Voxel heat weights transferred to untouched source skin')
