"""Retain an independent, textured high bake source without changing HighV10."""
import bpy,runpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
scene=bpy.context.scene;repo=Path(scene['SichuanPackRepository']);root=bpy.data.objects['Pack_Root']
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
assert Path(bpy.data.filepath).name=='Scene_SichuanPackGameV10.blend'
parts=('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals')
# Rigid assembly seating changes no local surface shape or material frame.
bpy.data.objects['High_Pack_StrawMat'].matrix_world = bpy.data.objects['Pack_StrawMat'].matrix_world.copy()
bpy.context.view_layer.update()

patch=bpy.data.objects.get('High_Pack_V9RepairPatch')
lowPatch=bpy.data.objects.get('Game_RepairPatchV10')
if patch and lowPatch and not patch.get('LodPatchConformed'):
    deps=bpy.context.evaluated_depsgraph_get()
    def WorldTree(obj):
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
        try:return BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices)for p in mesh.polygons],all_triangles=False)
        finally:evaluated.to_mesh_clear()
    oldTree=WorldTree(patch);newTree=WorldTree(lowPatch)
    stitchObjects=[o for o in bpy.data.objects['High_Pack_Bundle'].children_recursive if o.type=='MESH' and ('Stitch' in o.name or 'RepairThread' in o.name)]
    for obj in [patch,*stitchObjects]:
        obj.data=obj.data.copy();inverse=obj.matrix_world.inverted();count=0
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co;origin=Vector((p.x,-1,p.z));direction=Vector((0,1,0))
            a=oldTree.ray_cast(origin,direction,2)[0];b=newTree.ray_cast(origin,direction,2)[0]
            if a is not None and b is not None:p.y+=b.y-a.y-.00010;vertex.co=inverse@p;count+=1
        obj.data.update();obj['LodPatchConformed']=count

def SourceTint(obj, tint, label):
    for slot in obj.material_slots:
        if slot.material is None:continue
        mat=slot.material
        if mat.get(label):continue
        mat=mat.copy();mat.name=mat.name+'_'+label;slot.material=mat;mat[label]=True
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');socket=shader.inputs['Base Color']
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        if socket.is_linked:links.new(socket.links[0].from_socket,multiply.inputs[1])
        else:multiply.inputs[1].default_value=socket.default_value
        multiply.inputs[2].default_value=(*tint,1);links.new(multiply.outputs[0],socket)

cottonReport=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameCottonBalanceV10.py'))['ApplyCottonBalance'](bpy.data.objects['High_Pack_Root'],repo)
patch=bpy.data.objects.get('High_Pack_V9RepairPatch')
if patch:SourceTint(patch,(.82,.80,.78),'ReadableWornPatch')
button=bpy.data.objects.get('High_StudyV7_ClothKnotButton')
if button:SourceTint(button,(2.8,2.8,2.8),'WashedClothButton')
for obj in bpy.data.objects['High_Pack_Bundle'].children_recursive:
    if obj.type=='MESH' and ('Stitch' in obj.name or 'RepairThread' in obj.name) and not obj.get('ReadableThreadRadius'):
        obj.data=obj.data.copy();offsets=[v.normal.copy()*.00018 for v in obj.data.vertices]
        for vertex,offset in zip(obj.data.vertices,offsets):vertex.co+=offset
        obj.data.update();obj['ReadableThreadRadius']=.00018
    if obj.type=='MESH' and ('Stitch' in obj.name or 'RepairThread' in obj.name):
        SourceTint(obj,(.50,.50,.50),'ReadableRepairThread')

grassMaterials={}
for partName in ('Pack_StrawMat','Pack_Sandals'):
    for obj in bpy.data.objects['High_'+partName].children_recursive:
        if obj.type!='MESH' or obj.get('GameBakeSupportGenerator'):continue
        for slot in obj.material_slots:
            original=slot.material
            if original is None or original.get('AtlasRegion')!='straw':continue
            if original.get('GrassCavityDirt'):continue
            if original not in grassMaterials:
                mat=original.copy();mat.name=original.name+'_GrassCavityDirt';mat['GrassCavityDirt']=True
                nodes,links=mat.node_tree.nodes,mat.node_tree.links
                shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');socket=shader.inputs['Base Color']
                ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=False;ao.inputs['Distance'].default_value=.008
                scale=nodes.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=.45
                add=nodes.new('ShaderNodeMath');add.operation='ADD';add.inputs[1].default_value=.55
                links.new(ao.outputs['AO'],scale.inputs[0]);links.new(scale.outputs[0],add.inputs[0])
                multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
                if socket.is_linked:links.new(socket.links[0].from_socket,multiply.inputs[1])
                else:multiply.inputs[1].default_value=socket.default_value
                links.new(add.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],socket)
                grassMaterials[original]=mat
            slot.material=grassMaterials[original]
wovenReport=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameWovenLodV10.py'))['ApplyWovenLodSource'](bpy.data.objects['High_Pack_Root'],repo)
toneReport=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameStrawToneV10.py'))['ApplyStrawTone'](bpy.data.objects['High_Pack_Root'],repo)
for assignment in wovenReport['assignments']:
    obj=bpy.data.objects[assignment['object']]
    assignment['materialsAtBake']=[slot.material.name for slot in obj.material_slots]
endcapReport=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameMatEndSourceV10.py'))['ApplyMatEndImageSource'](bpy.data.objects['High_Pack_Root'],root,repo)
for assignment in cottonReport['assignments']:
    obj=bpy.data.objects[assignment['object']]
    assignment['materialAtBake']=obj.material_slots[assignment['slot']].material.name
def Part(o):
    while o.parent and o.name not in parts:o=o.parent
    return o.name
high={n:[o for o in (bpy.data.objects['High_'+n],*bpy.data.objects['High_'+n].children_recursive) if o.type=='MESH' and not o.get('GameBakeSupportGenerator')]for n in parts}
def Sources(o):
    exact=o.get('SourceHighObject','');names=set(o.get('BakeSourceNames','').split(','))-{''};result=[s for s in high[Part(o)] if s.name==exact or s.get('PackSourceName',s.name) in names]
    if 'RepairPatch' in o.name:result.extend(s for s in high[Part(o)] if 'Stitch' in s.name or 'RepairThread' in s.name)
    return list(dict.fromkeys(result))
for o in root.children_recursive:
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=False
        o.data.update()
# Keep the UV-bearing underlay behind the actual sculpt.  At two millimetres
# a few reduced cloth triangles intercepted it before the source folds.
report=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameBakeSupportV10.py'))['AddGameBakeSupports'](root,Sources,.010)
original=Path(root.get('OriginalSculptBlend',root['SourceBlend']));base=original.parent.parent;highSource=base/'HighGameV10/Scene_SichuanPackGameBakeSourceV10.blend';highSource.parent.mkdir(parents=True,exist_ok=True);gameSource=base/'GameV10/Scene_SichuanPackGameV10.blend'
root['OriginalSculptBlend']=str(original);root['SourceBlend']=str(highSource)
report['originalSculptBlend']=str(original);report['actualBakeSource']=str(highSource)
report['wovenLodSource']=wovenReport
report['cottonBalance']=cottonReport
report['strawTone']=toneReport
report['endcapSourceProvenance']=endcapReport
(highSource.parent/'Data_GameBakeSupportsV10.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for p in (repo/'Taierzhuang1938/_blender').glob('Script_SichuanGame*V10.py'):
    t=bpy.data.texts.get(p.name) or bpy.data.texts.new(p.name);t.clear();t.write(p.read_text(encoding='utf-8-sig'))
bpy.ops.wm.save_as_mainfile(filepath=str(highSource))
bpy.ops.wm.save_as_mainfile(filepath=str(gameSource))
geometryFile=Path(scene['SichuanGameOutput'])/'Data_GameGeometry.json';geometry=json.loads(geometryFile.read_text());geometry['sourceSculptBlend']=str(original);geometry['sourceHighBlend']=str(highSource);geometry['bakeSupportReport']=str(highSource.parent/'Data_GameBakeSupportsV10.json');geometry['supportSourceTrianglesExcludedFromGame']=report['supportTriangles'];geometryFile.write_text(json.dumps(geometry,indent=2),encoding='utf-8')
print('REAL_BAKE_SUPPORTS_SAVED',json.dumps({'count':len(report['supports']),'triangles':report['supportTriangles'],'source':str(highSource),'game':str(gameSource)}))
