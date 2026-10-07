"""Short gravity relaxation from the authored side-hung coat rest shape.

Cache is keyed by connected rest geometry, rather than blindly reusing an
older simulated garment. Run before thickness and sewn edge construction.
"""
import hashlib
restKey=hashlib.sha256(json.dumps({'points':[list(p) for p in points],'faces':faces},separators=(',',':')).encode()).hexdigest()
cachePath=GAME/'_blender/Data_CommandRoomTailoredDrape.json'
cache=json.loads(cachePath.read_text()) if cachePath.exists() else {}
if cache.get('restKey')==restKey:
    for v,p in zip(coat.data.vertices,cache['vertices']):v.co=p
    coat.data.update()
else:
    oldFrame=scene.frame_current;scene.frame_set(1)
    pins=coat.vertex_groups.new(name='CollarPeg')
    for i in range(NU//2-5,NU//2+6):pins.add([remap[CoatId(i,0)]],1,'REPLACE')
    bpy.context.view_layer.objects.active=coat
    mod=coat.modifiers.new('Wool gravity relaxation','CLOTH')
    st=mod.settings;st.quality=8;st.mass=.36
    st.tension_stiffness=65;st.compression_stiffness=65;st.shear_stiffness=30;st.bending_stiffness=1.2
    st.tension_damping=10;st.compression_damping=10;st.shear_damping=10;st.bending_damping=1
    st.air_damping=12;st.vertex_group_mass=pins.name;st.pin_stiffness=1
    cc=mod.collision_settings;cc.use_collision=True;cc.distance_min=.003
    cc.collision_quality=5;cc.use_self_collision=True;cc.self_distance_min=.0025;cc.self_friction=4
    bpy.ops.mesh.primitive_cube_add(size=1,location=(coatx,1.51,2))
    collider=bpy.context.object;collider.dimensions=(2,.14,3)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    collider.modifiers.new('Room wall collision','COLLISION');collider.collision.thickness_outer=.002
    mod.point_cache.frame_start=1;mod.point_cache.frame_end=55
    for frame in range(1,56):
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=coat.evaluated_get(bpy.context.evaluated_depsgraph_get());_=len(evaluated.data.vertices)
    bpy.context.view_layer.objects.active=coat
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(collider,do_unlink=True);scene.frame_set(oldFrame)
    cache={'restKey':restKey,'frames':55,'vertices':[[round(c,7) for c in v.co] for v in coat.data.vertices]}
    assert len(cache['vertices'])==len(points)
    cachePath.write_text(json.dumps(cache,separators=(',',':')),encoding='utf-8')
points=[v.co.copy() for v in coat.data.vertices]
