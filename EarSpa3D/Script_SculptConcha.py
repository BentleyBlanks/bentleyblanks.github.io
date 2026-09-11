"""Reference-guided native pinna sculpt, executed in bounded rounds through BlenderMCP.

Units and deep canal remain unchanged. Sources and review renders stay in OneDrive.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ConchaSculpt')

def SculptNative(head, amount=1):
    # Add density only around the working pinna; preserve face/hair and canal budgets.
    bm = bmesh.new(); bm.from_mesh(head.data)
    for iteration in range(1):
        edges = [e for e in bm.edges if all(-14 < v.co.x < 19 and -28 < v.co.z < 25 and 0 < v.co.y < 30 for v in e.verts)]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    localVerts=[v for v in bm.verts if -13<v.co.x<18 and -27<v.co.z<24 and 1<v.co.y<29]
    for iteration in range(5):
        bmesh.ops.smooth_vert(bm,verts=localVerts,factor=.36,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    bm.to_mesh(head.data); bm.free()
    def Gaussian(x,z,cx,cz,rx,rz):
        return math.exp(-((x-cx)/rx)**2-((z-cz)/rz)**2)
    for v in head.data.vertices:
        x,y,z = v.co
        if not (-17<x<22 and -30<z<29 and 0<y<35): continue
        # Carve the cymba and cavum, leaving the original rolled helix in place.
        recess = 8.0*Gaussian(x,z,1.7,8.5,5.7,6.4) + 4.1*Gaussian(x,z,1.0,-4.5,5.2,6.0)
        # Broad Y-shaped antihelix, with tapered superior and anterior crura.
        ridge = 2.4*Gaussian(x,z,6.8,1.0,2.4,8.0)
        ridge += 2.3*Gaussian(x,z,5.0,10.5,2.5,5.5)
        ridge += 1.2*Gaussian(x,z,.3,4.0,4.4,2.1)
        # Rounded tragus/antitragus interrupt the former circular opening.
        ridge += 3.6*Gaussian(x,z,-5.6,-3.1,2.4,4.0)
        ridge += 1.8*Gaussian(x,z,1.7,-10.8,3.1,2.7)
        surface = min(1,max(0,(y-2)/5))
        v.co.y += (ridge-recess)*amount*surface
    head.data.update()
    head['referenceSculpt'] = 'Deep cymba/cavum, Y antihelix, rounded tragus and antitragus; native connected pinna'

def BakePinnaOcclusion():
    from mathutils.bvhtree import BVHTree
    head=bpy.data.objects['Model_Temple']; mouth=bpy.data.objects['Model_OuterEar']
    verts=[]; faces=[]
    for obj in [head,mouth]:
        start=len(verts);verts.extend(v.co.copy() for v in obj.data.vertices)
        faces.extend(tuple(start+i for i in p.vertices) for p in obj.data.polygons)
    tree=BVHTree.FromPolygons(verts,faces)
    for obj in [head,mouth]:
        mesh=obj.data;mesh.update()
        color=mesh.color_attributes.get('Color_PinnaOcclusion') or mesh.color_attributes.new(name='Color_PinnaOcclusion',type='FLOAT_COLOR',domain='POINT')
        for v in mesh.vertices:
            x,y,z=v.co
            weight=math.exp(-(x/21)**4-(z/30)**4)*min(1,max(0,(y-1)/5))
            blocked=0
            if weight>.01:
                n=v.normal.normalized(); tangent=n.cross(Vector((0,0,1)))
                if tangent.length<.1:tangent=n.cross(Vector((1,0,0)))
                tangent.normalize(); bitangent=n.cross(tangent)
                for i in range(32):
                    u=(i+.5)/32; a=i*2.39996323
                    direction=tangent*(math.sqrt(u)*math.cos(a))+bitangent*(math.sqrt(u)*math.sin(a))+n*math.sqrt(1-u)
                    hit,normal,index,distance=tree.ray_cast(v.co+n*.045,direction,18)
                    if hit is not None:blocked+=(1-distance/24)
            ao=1-min(.63,blocked/32*1.35)*weight
            warm=weight*min(.65,blocked/32+.12)
            color.data[v.index].color=(ao,ao*(1-warm*.26),ao*(1-warm*.36),1)
        mesh.color_attributes.active_color=color

def Build(roundNumber=4, amount=1, mouthX=-2.2, mouthY=-4.0):
    assert Path(bpy.data.filepath).resolve() == (SOURCE/'Model_ConchaSculpt.blend').resolve()
    ns={'__file__':str(ROOT/'Script_RepairOuterAnatomy.py')}
    source=(ROOT/'Script_RepairOuterAnatomy.py').read_text(encoding='utf-8')
    source=source[:source.index('\ndef GroomHair():')]
    source=source.replace('    # A slightly tilted oval', '    SculptNative(head, sculptAmount)\n    # A slightly tilted oval')
    source=source.replace('x = -.55 - 3.35 * math.sin(a) + .38 * math.cos(a)',
                          'x = mouthX - 3.8 * math.sin(a) + .65 * math.cos(a) + .65 * math.cos(2*a)')
    source=source.replace('y = -.35 + 4.05 * math.cos(a)', 'y = mouthY + 4.8 * math.cos(a)')
    source=source.replace('(t * t * (3 - 2 * t))', '(t*t / (t*t + (1-t)**4))')
    ns.update(SculptNative=SculptNative,sculptAmount=amount,mouthX=mouthX,mouthY=mouthY)
    exec(compile(source,ns['__file__'],'exec'),ns)
    ns['RepairConcha']()
    BakePinnaOcclusion()
    for o in bpy.context.scene.objects:
        o.hide_render = o.name.startswith('Model_') and o.name not in ['Model_Temple','Model_OuterEar','Model_ProfileHair','Model_ProfileHairStrands','Model_Canal','Model_Eardrum']
    bpy.context.scene['conchaRound']=roundNumber
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_ConchaSculpt.blend'))
    bpy.context.scene.render.filepath=str(SOURCE/f'Review/Shot_Round{roundNumber:02d}.png')
    bpy.ops.render.render(write_still=True)

def MergeCurrentRuntime(file):
    """Preserve concurrent tool revisions while replacing only this task's four meshes."""
    assert Path(bpy.data.filepath).resolve() == (SOURCE/'Model_ConchaSculpt.blend').resolve()
    kept={'Model_Temple','Model_OuterEar','Model_ProfileHairStrands','Model_ProfileHairWisps'}
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and obj.name not in kept:bpy.data.objects.remove(obj,do_unlink=True)
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    for obj in set(bpy.context.scene.objects)-before:
        if any(obj.name==name or obj.name.startswith(name+'.') for name in kept):
            bpy.data.objects.remove(obj,do_unlink=True)
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.name not in kept and '.' in obj.name:
            name=obj.name.split('.')[0]
            if name.startswith('Model_') and not any(other.name==name for other in bpy.context.scene.objects):obj.name=name
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_ConchaSculpt.blend'))

def Export():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.name.startswith('Model_'):o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models/Model_ImmersiveEar.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
