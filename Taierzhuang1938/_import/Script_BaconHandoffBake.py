"""Run through BlenderMCP in the task-owned Scene_BaconHandoff.blend.
Two pork meshes and one synchronized give/receive control performance.
Control coordinates are authored in game metres (Y up, forward -Z), then
converted to Blender. Runtime IK adapts them to the existing human skeletons.
"""
import bpy, math, os, json, random
from mathutils import Vector
from pathlib import Path

projectRoot = os.environ.get('BACON_PROJECT_ROOT') or str(Path(__file__).resolve().parents[2])
assert Path(projectRoot,'Taierzhuang1938','Script_FirstLevelMeal.mjs').is_file(), 'Set BACON_PROJECT_ROOT to the task worktree'
sourceRoot = r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\BaconHandoff'
outputRoot = os.path.join(projectRoot, 'Taierzhuang1938', 'Model', 'BaconHandoff')
os.makedirs(outputRoot, exist_ok=True)
assert bpy.data.filepath == os.path.join(sourceRoot, 'Scene_BaconHandoff.blend'), 'Use task-owned project'
scene = bpy.context.scene
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene.render.fps = 60
scene.frame_start = 1
scene.frame_end = 337

def ToBlender(p): return (p[0], -p[2], p[1])
def Linear(c): return ((c + .055) / 1.055) ** 2.4 if c > .04045 else c / 12.92
material = bpy.data.materials.new('Material_CuredPork')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .64
colorNode = material.node_tree.nodes.new('ShaderNodeVertexColor')
colorNode.layer_name = 'Color'
material.node_tree.links.new(colorNode.outputs['Color'], bsdf.inputs['Base Color'])
referenceImage=bpy.data.images.load(os.path.join(sourceRoot,'Reference_CuredPorkThreeViews.png'),check_existing=True)
cutMaterial=bpy.data.materials.new('Material_CuredPorkCutFace')
cutMaterial.use_nodes=True
cutBsdf=cutMaterial.node_tree.nodes.get('Principled BSDF')
cutBsdf.inputs['Roughness'].default_value=.57
texture=cutMaterial.node_tree.nodes.new('ShaderNodeTexImage')
texture.image=referenceImage
cutMaterial.node_tree.links.new(texture.outputs['Color'],cutBsdf.inputs['Base Color'])

def Pork(name, width, height, depth, whole):
    # Wavy tissue boundaries, tapered ends and curved rind; no box primitives.
    divisions = 48 if whole else 32
    bands = [0,.09,.22,.35,.43,.58,.70,.87,1]
    palette = [(80,34,22),(186,139,86),(225,191,140),(119,55,36),
               (216,179,128),(140,61,42),(221,186,139),(93,38,24)]
    vertices, faces, colors = [], [], []
    rng = random.Random(1938 + int(whole))
    for side in range(2):
        for i in range(divisions+1):
            u = i / divisions
            taper = .76 + .24 * math.sin(math.pi*u)**.42
            for j, v in enumerate(bands):
                x = (u-.5)*width
                y = ((v-.5)*taper+.038*math.sin(u*9)+.024*math.sin(u*23+v*4))*height
                y += .018*height*math.sin(u*79+j*1.7)
                z = (side-.5)*depth*(.82+.18*math.sin(math.pi*u))
                z += (.06*depth if whole else .16*depth)*math.sin(u*11+v*5)
                vertices.append(ToBlender((x,y,z)))
    rows = len(bands)
    stride = (divisions+1)*rows
    def Face(indices, rgb):
        # Vertex colors are linear in Blender; GLB preserves COLOR_0.
        variation = rng.uniform(.94,1.055)
        faces.append(indices)
        colors.append(tuple(Linear(min(1,c/255*variation)) for c in rgb)+(1,))
    for side in range(2):
        for i in range(divisions):
            for j in range(rows-1):
                a=side*stride+i*rows+j
                indices=[a,a+rows,a+rows+1,a+1]
                if side==0: indices.reverse()
                # Whole back is smoke-darkened rind; both slice faces show layers.
                rgb=(87,41,24) if whole and side==1 else palette[j]
                Face(indices,rgb)
    for i in range(divisions):
        for j in [0,rows-1]:
            a=i*rows+j
            Face([a,a+rows,a+rows+stride,a+stride],(88,39,20) if j==rows-1 else (138,75,41))
    for i in [0,divisions]:
        for j in range(rows-1):
            a=i*rows+j
            Face([a,a+1,a+1+stride,a+stride],palette[j])
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(material)
    mesh.materials.append(cutMaterial)
    uv=mesh.uv_layers.new(name='UVMap')
    # UV-project the generated reference onto the two visible cut surfaces;
    # the organically modeled rind/edges retain their smoked vertex colors.
    for poly in mesh.polygons:
        if poly.index < divisions*(rows-1)*(1 if whole else 2):
            band=poly.index%(rows-1)
            if band not in [0,rows-2]: poly.material_index=1
        for loopIndex in poly.loop_indices:
            index=mesh.loops[loopIndex].vertex_index%stride
            u=(index//rows)/divisions
            v=bands[index%rows]
            left,right,top,bottom=(83,721,224,391) if whole else (84,629,653,813)
            uv.data[loopIndex].uv=((left+u*(right-left))/1536,1-(bottom-v*(bottom-top))/1024)
    attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for poly, color in zip(mesh.polygons,colors):
        poly.use_smooth=True
        for index in poly.loop_indices: attr.data[index].color=color
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    # Fix normals on the closed tissue shell.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj

whole=Pork('Model_CuredPorkWhole',.28,.078,.038,True)
slice=Pork('Model_CuredPorkSlice',.105,.042,.005,False)
whole['purpose']='Left hand supply, whole smoked pork belly'
slice['purpose']='One thin slice transferred once from giver to receiver'
bpy.ops.object.select_all(action='DESELECT')
whole.select_set(True);slice.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(outputRoot,'Model_CuredPork.glb'),export_format='GLB',use_selection=True,export_animations=False)

# Keyed end effectors, common clock in source recording seconds. Frames before
# zero use the rest pose; contact is held on both sides across ownership change.
keys = {
 'DonorRight': [(0,[.17,1.17,-.30]),(.35,[.13,1.24,-.36]),(1.55,[-.025,1.31,-.54]),(2.2,[-.025,1.31,-.54]),(2.85,[.17,1.16,-.29]),(5.6,[.17,1.16,-.29])],
 'DonorLeft': [(0,[-.19,1.13,-.30]),(1.55,[-.19,1.15,-.30]),(2.85,[-.19,1.13,-.30]),(5.6,[-.19,1.13,-.30])],
 'ReceiverRight': [(0,[.19,-.38,-.34]),(.55,[.15,-.32,-.40]),(1.65,[.025,-.31,-.37]),(2.2,[.025,-.31,-.37]),(3.10,[.11,-.075,-.40]),(4.15,[.11,-.075,-.40]),(4.65,[.09,-.025,-.12]),(4.95,[.17,-.38,-.28]),(5.6,[.19,-.27,-.45])],
 'ReceiverLeft': [(0,[-.19,-.32,-.40]),(1.6,[-.14,-.35,-.37]),(2.2,[-.14,-.35,-.37]),(3.1,[-.19,-.32,-.40]),(5.6,[-.19,-.27,-.45])],
 'GripClosure': [(0,[0,1,0]),(1.65,[0,1,0]),(1.95,[1,1,0]),(2.20,[1,0,0]),(4.70,[1,0,0]),(5.15,[0,0,0]),(5.6,[0,0,0])],
}
controls=[]
for name, points in keys.items():
    obj=bpy.data.objects.new('Control_'+name,None)
    scene.collection.objects.link(obj)
    obj.empty_display_type='SPHERE'
    obj.empty_display_size=.025
    for seconds, position in points:
        obj.location=ToBlender(position)
        obj.keyframe_insert(data_path='location',frame=1+seconds*60)
    obj.animation_data.action.name='Animation_Bacon'+name
    for slot in obj.animation_data.action.layers:
        for strip in slot.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation='BEZIER'
                        key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'
    controls.append(obj)

# Bake evaluated Blender curves to a compact pure-data clip consumed by both rigs.
samples=[]
for frame in range(337):
    scene.frame_set(frame+1)
    row={}
    for obj in controls:
        p=obj.location
        row[obj.name.removeprefix('Control_')]=[round(p.x,7),round(p.z,7),round(-p.y,7)]
    samples.append(row)
manifest={'version':'BaconHandoffV1','fps':60,'duration':5.6,'transferSeconds':2.05,
 'sliceHideSeconds':4.75,'reference':'Reference_CuredPorkThreeViews.png','source':'BlenderMCP authored Bezier controls; runtime original-skeleton IK',
 'coordinates':'Metres, Y up, forward -Z. Donor in actor space, receiver relative to eye.',
 'models':{'whole':'Model_CuredPorkWhole','slice':'Model_CuredPorkSlice'},'frames':samples}
with open(os.path.join(outputRoot,'Data_BaconHandoff.json'),'w',encoding='utf-8') as stream: json.dump(manifest,stream,separators=(',',':'))
bpy.ops.object.select_all(action='DESELECT')
for obj in controls: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(sourceRoot,'Animation_BaconHandoff.glb'),export_format='GLB',use_selection=True,export_animations=True,export_force_sampling=True)

scene.frame_set(1)
whole.location=ToBlender((-.20,1.13,-.30))
slice.location=ToBlender((.17,1.17,-.30))
reference=bpy.data.objects.new('Reference_CuredPorkThreeViews',None)
reference.empty_display_type='IMAGE'
reference.data=bpy.data.images.load(os.path.join(sourceRoot,'Reference_CuredPorkThreeViews.png'),check_existing=True)
reference.empty_display_size=.8
reference.location=(0,.5,1)
scene.collection.objects.link(reference)
scene['source']='Imagegen tier 1 reference, BlenderMCP mesh and paired hand performance'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(sourceRoot,'Scene_BaconHandoff.blend'))
print(json.dumps({'outputRoot':outputRoot,'source':bpy.data.filepath,'meshes':{o.name:len(o.data.polygons)*2 for o in [whole,slice]},'frames':len(samples)}))
