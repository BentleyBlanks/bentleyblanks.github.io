"""Separate buried side skins and round cotton tape in the V7 high study."""
import bpy,bmesh,math,json

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
body=bpy.data.objects['Pack_Bundle']
if body.data.shape_keys is None:body.shape_key_add(name='Basis')
basis=body.data.shape_keys.key_blocks['Basis']
detail=body.data.shape_keys.key_blocks.get('SideFoldSeparation') or body.shape_key_add(name='SideFoldSeparation')
for original,point in zip(basis.data,detail.data):point.co=original.co

# The continuous fill was intersecting the visible rolled cloth lips. Move
# only its buried side surface; the traced fold edges carry the silhouette.
bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
unseen=set(bm.verts);shell=[]
while unseen:
    first=unseen.pop();stack=[first];component=[first]
    while stack:
        vertex=stack.pop()
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex)
            if other in unseen:
                unseen.remove(other);stack.append(other);component.append(other)
    if any(abs(v.co.y)<1e-8 for v in component):shell.extend(v.index for v in component)
bm.free();changed=0
for index in shell:
    p=basis.data[index].co
    if abs(p.x)<.160 or not -.113<p.y<-.007 or abs(p.z)>.141:continue
    depth=math.sin(math.pi*(p.y+.113)/.106)**.65
    height=min(1,max(0,(.141-abs(p.z))/.020))
    side=min(1,max(0,(abs(p.x)-.160)/.012))
    detail.data[index].co.x-=math.copysign(.005*depth*height*side,p.x);changed+=1
detail.value=1
body['SideFoldCorrection']='Buried shell receded behind unchanged folded edges; no outline deformation'

binding=bpy.data.objects['Pack_Binding']
for obj in binding.children_recursive:
    if obj.type!='MESH':continue
    sub=obj.modifiers.get('HighCottonCurvature') or obj.modifiers.new('HighCottonCurvature','SUBSURF')
    sub.subdivision_type='CATMULL_CLARK';sub.levels=2;sub.render_levels=2
    obj['HighCottonDetail']='Rounded tie, bow, tail and shoulder tape; continuous strip retained'
scene['HighV7SecondaryCloth']='Side skins separated; cotton tape curvature refined'
print('HIGH_SECONDARY_CLOTH',json.dumps({'buriedSideVertices':changed,'outline':'unchanged','bindingSubdivision':2}))
