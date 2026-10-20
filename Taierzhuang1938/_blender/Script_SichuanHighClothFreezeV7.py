"""Freeze a simulated front leaf once, preserving a portable coarse source."""
import bpy

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
assert not bpy.data.objects.get('StudyV7_RelaxedFrontLeaf'),'Rebuild the V7 study before freezing a second time'
body=bpy.data.objects['Pack_Bundle'];sim=bpy.data.objects['StudyV7_FrontLeafSimulation']
deps=bpy.context.evaluated_depsgraph_get();evaluated=sim.evaluated_get(deps)
mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
coarse=bpy.data.objects.new('StudyV7_RelaxedCoarseSource',mesh.copy());scene.collection.objects.link(coarse)
coarse.hide_render=True;coarse.hide_set(True);coarse['SimulationFrame']=scene.frame_current
leaf=bpy.data.objects.new('StudyV7_RelaxedFrontLeaf',mesh);scene.collection.objects.link(leaf);leaf.parent=body
indices=set()
for polygon in body.data.polygons:
    if polygon.material_index==0 and polygon.normal.y<-.4:indices.update(polygon.vertices)
for index in indices:body.data.vertices[index].co.y+=.003
body.data.update();body['HighFrontRecessedM']=.003
for obj in (sim,bpy.data.objects['StudyV7_ClothCollider']):obj.hide_render=True;obj.hide_set(True)
leaf['ClothSimulationFrame']=scene.frame_current;leaf['RestSlack']=1.055
print('HIGH_CLOTH_FROZEN',scene.frame_current,len(mesh.vertices))
