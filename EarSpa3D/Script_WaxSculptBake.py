"""Build the reference-led wax maquettes and bake their physical shell profiles.

Run through this worktree's Script_BlenderMcp.mjs exec --file. The dense Blender
mesh is the source of the sampled heights, not an unused presentation export.
The runtime remains a closed, single-valued XY shell for the existing XPBD cage.
"""
import bpy
import math
import json
import hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/WaxCareer20261022')
VERSION = 'ear050-career-care-20261022'
SEGMENTS, RINGS = 48, 7
TAU = math.tau


def Clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def Smooth(a, b, value):
    t = Clamp((value-a)/(b-a))
    return t*t*(3-2*t)


def Wrapped(a):
    return math.atan2(math.sin(a), math.cos(a))


CONTOURS = {
    'dry': [.83,.76,.91,.86,.57,.69,.91,.75,.71,.92,.81,.52,.75,.96,.77,.69],
    'wet': [.86,.90,.76,.83,.94,.73,.79,.86,.69,.87,.94,.78,.70,.88,.78,.90],
    'impacted': [.82,.91,.87,.72,.81,.92,.83,.75,.88,.79,.92,.88,.74,.85,.94,.82],
}


def Radius(kind, angle):
    values = CONTOURS[kind]
    u = (angle % TAU)/TAU*len(values)
    j, t = int(u), u % 1
    # Long broken edges with a few localized tears; no repeated petal outline.
    edge = values[j]*(1-t)+values[(j+1) % len(values)]*t
    tears = {'dry': [(1.23,.09,.075),(3.63,.10,.055),(5.43,.055,.06)],
             'wet': [(.72,.055,.10),(2.61,.07,.085),(4.57,.06,.07)],
             'impacted': [(1.6,.05,.07),(3.1,.065,.08),(5.4,.04,.09)]}[kind]
    for center, depth, width in tears:
        edge -= depth*math.exp(-(Wrapped(angle-center)/width)**2)
    edge += (.027 if kind == 'dry' else .018)*math.sin(angle*23+.7)*math.sin(angle*13+1.2)
    return edge


def SculptHeight(kind, x, y, radius):
    """Millimetre-scale, continuous sculpt strokes matched to the recovered image."""
    across = x*.86+y*.51
    along = -x*.51+y*.86
    edge = Smooth(.48,1,radius)
    angle = math.atan2(y,x)
    grain = math.sin(x*35+math.sin(y*9))*math.sin(y*31+x*7)
    if kind == 'dry':
        # Thin torn keratin folded around a saddle. A curled rim rises and
        # turns down at its tip, while the central back stays near the wall.
        primary = math.exp(-((across-.31)/.145)**2)*(.42+.58*Smooth(-.6,.35,along))
        rim = math.exp(-(Wrapped(angle-2.30)/.67)**2)
        rim2 = math.exp(-(Wrapped(angle-5.45)/.53)**2)
        curl = .52*rim*edge*math.sin(radius*1.9)+.24*rim2*edge
        ridge = .38*primary*(.28+.72*radius)
        lamella = .018*math.exp(-((along+.21+.11*math.sin(across*5))/.055)**2)
        lamella += .023*math.exp(-((along-.22+.08*math.sin(across*7))/.045)**2)
        lamella += .019*math.exp(-((along-.47+.065*math.sin(across*9))/.035)**2)*radius
        bottom = .006+curl+ridge+lamella+grain*.0025*radius
        thickness = .014+.036*(1-radius**1.7)+.009*primary
        thickness *= 1+.17*math.sin(across*14+along*3)
    elif kind == 'wet':
        # Cohesive amber flesh: broad compressed folds with a thin torn lip.
        fold1 = math.exp(-((along-.02-.16*math.sin(across*4))/.115)**2)
        fold2 = math.exp(-((along+.37-.08*math.sin(across*6))/.09)**2)
        pool1 = math.exp(-((x+.15)**2*4+(y-.1)**2*5))
        pool2 = math.exp(-((x-.32)**2*18+(y+.18)**2*12))
        lip = math.exp(-(Wrapped(angle-2.6)/.8)**2)
        bottom = .005+.16*lip*edge+.042*fold2*radius
        thickness = .024+.17*pool1+.15*pool2+.09*fold1*(1-radius*.66)
        thickness += .065*fold2*(1-radius*.5)+grain*.009*(1-radius)
        thickness *= 1-.62*Smooth(.70,1,radius)
    else:
        # Compressed nested lamellae, each termination becomes a real slope
        # and crevice in the connected surface, not floating chip decorations.
        broad = max(0,1-radius*radius)**.48
        layers = 0.0
        for center, height, width in [(-.48,.145,.075),(-.14,.235,.09),(.24,.215,.075),(.53,.115,.065)]:
            line = along-center+.075*math.sin(across*5+center*3)
            # Unequal broad shelves end at narrow fractured lips. Gaussian
            # ridges made the compacted layers look like rounded upholstery.
            layers += height*Smooth(-.20,.005,line)*(1-Smooth(.012,.055,line))
        cracks = .030*math.exp(-((across+.04+.07*math.sin(along*8))/.042)**2)
        bottom = .004+.025*edge*(1+math.sin(angle*3+.2))
        thickness = .060+.46*broad+layers*(1-radius*.25)-cracks*broad
        thickness += .008*grain*broad
    return max(.002,bottom), max(.008,thickness)


def ShellMesh(name, kind, segments=144, rings=28):
    vertices, faces = [], []
    layer = 1+segments*rings
    for side in range(2):
        bottom, thick = SculptHeight(kind,0,0,0)
        vertices.append((0,0,bottom+(thick if side == 0 else 0)))
        for ring in range(1,rings+1):
            r = ring/rings
            for j in range(segments):
                a = j/segments*TAU
                rr = Radius(kind,a)*r
                x,y = math.cos(a)*rr,math.sin(a)*rr
                bottom, thick = SculptHeight(kind,x,y,r)
                vertices.append((x,y,bottom+(thick if side == 0 else 0)))
        offset = side*layer
        def Face(a,b,c):
            faces.append((offset+a,offset+b,offset+c) if side == 0 else (offset+a,offset+c,offset+b))
        for j in range(segments):
            Face(0,1+j,1+(j+1)%segments)
        for ring in range(1,rings):
            for j in range(segments):
                a=1+(ring-1)*segments+j
                b=1+ring*segments+j
                c=1+ring*segments+(j+1)%segments
                d=1+(ring-1)*segments+(j+1)%segments
                Face(a,b,c)
                Face(a,c,d)
    for j in range(segments):
        a=1+(rings-1)*segments+j
        b=1+(rings-1)*segments+(j+1)%segments
        faces.extend([(a,a+layer,b+layer),(a,b+layer,b)])
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    measured=mesh.attributes.new('WaxThickness','FLOAT','POINT')
    for i,vertex in enumerate(vertices):
        k=i % layer
        measured.data[i].value=vertices[k][2]-vertices[k+layer][2]
    for polygon in mesh.polygons:
        polygon.use_smooth=True
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['WaxSculptVersion']=VERSION
    obj['MaterialType']=kind
    obj['RuntimeRole']='Source mesh raycast into Data_WaxSculptProfiles.mjs'
    return obj


def Material(kind):
    mat=bpy.data.materials.new('Material_WaxSculpt_'+kind.title())
    mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value={'dry':.64,'wet':.38,'impacted':.51}[kind]
    bsdf.inputs['IOR'].default_value=1.46
    bsdf.inputs['Subsurface Weight'].default_value={'dry':.13,'wet':.08,'impacted':.035}[kind]
    bsdf.inputs['Subsurface Radius'].default_value=(.13,.065,.026)
    bsdf.inputs['Coat Weight'].default_value={'dry':.06,'wet':.24,'impacted':.10}[kind]
    bsdf.inputs['Coat Roughness'].default_value=.27
    bsdf.inputs['Specular IOR Level'].default_value=.34
    coords=nodes.new('ShaderNodeTexCoord')
    noise=nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value=24
    noise.inputs['Detail'].default_value=4
    noise.inputs['Roughness'].default_value=.68
    links.new(coords.outputs['Generated'],noise.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB')
    colors={'dry':[(.26,.16,.057,1),(.68,.48,.22,1)],
            'wet':[(.21,.066,.008,1),(.64,.30,.045,1)],
            'impacted':[(.010,.0025,.0008,1),(.082,.024,.005,1)]}[kind]
    for elem,col in zip(ramp.color_ramp.elements,colors):
        elem.color=col
    links.new(noise.outputs['Fac'],ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
    if kind == 'wet':
        measured=nodes.new('ShaderNodeAttribute')
        measured.attribute_name='WaxThickness'
        optical=nodes.new('ShaderNodeMath')
        optical.operation='MULTIPLY'
        optical.inputs[1].default_value=3.7
        links.new(measured.outputs['Fac'],optical.inputs[0])
        absorb=nodes.new('ShaderNodeValToRGB')
        absorb.color_ramp.elements[0].color=(1,1,1,1)
        absorb.color_ramp.elements[1].color=(.24,.12,.04,1)
        links.new(optical.outputs[0],absorb.inputs[0])
        tinted=nodes.new('ShaderNodeMixRGB')
        tinted.blend_type='MULTIPLY'
        tinted.inputs[0].default_value=1
        links.new(ramp.outputs['Color'],tinted.inputs[1])
        links.new(absorb.outputs['Color'],tinted.inputs[2])
        links.new(tinted.outputs[0],bsdf.inputs['Base Color'])
    micro=nodes.new('ShaderNodeTexNoise')
    micro.inputs['Scale'].default_value=110
    micro.inputs['Detail'].default_value=3
    links.new(coords.outputs['Generated'],micro.inputs['Vector'])
    fissures=nodes.new('ShaderNodeTexVoronoi')
    fissures.feature='DISTANCE_TO_EDGE'
    fissures.inputs['Scale'].default_value=43
    links.new(coords.outputs['Generated'],fissures.inputs['Vector'])
    creases=nodes.new('ShaderNodeBump')
    creases.inputs['Strength'].default_value=.32
    creases.inputs['Distance'].default_value={'dry':.014,'wet':.012,'impacted':.022}[kind]
    links.new(fissures.outputs['Distance'],creases.inputs['Height'])
    bump=nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value=.35
    bump.inputs['Distance'].default_value={'dry':.012,'wet':.008,'impacted':.016}[kind]
    links.new(micro.outputs['Fac'],bump.inputs['Height'])
    links.new(creases.outputs['Normal'],bump.inputs['Normal'])
    links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    return mat


def Bake(obj, kind):
    # Raycast the evaluated Blender triangles at the runtime radial samples.
    # Slightly inset perimeter rays avoid numerical misses exactly on a seam.
    tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
    contour=[Radius(kind,j/SEGMENTS*TAU) for j in range(SEGMENTS)]
    bottom,top=[],[]
    missed=0
    for ring in range(RINGS+1):
        for j in range(1 if ring == 0 else SEGMENTS):
            a=j/SEGMENTS*TAU
            r=0 if ring == 0 else ring/RINGS
            rr=contour[j]*r*(.999999 if ring == RINGS else 1)
            x,y=math.cos(a)*rr,math.sin(a)*rr
            hi=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),4)[0]
            lo=tree.ray_cast(Vector((x,y,-1)),Vector((0,0,1)),4)[0]
            if hi is None or lo is None:
                missed+=1
                raise RuntimeError('Sculpt ray missed '+kind+' '+str((ring,j)))
            bottom.append(round(lo.z,6))
            top.append(round(hi.z,6))
    return {'contour':[round(x,6) for x in contour],'bottom':bottom,'top':top,
            'sourceVertices':len(obj.data.vertices),'sourceTriangles':len(obj.data.polygons),'rayMisses':missed}


def Track(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def Build():
    if bpy.data.filepath and Path(bpy.data.filepath).resolve().parent != SOURCE.resolve():
        raise RuntimeError('Refusing to replace an unrelated Blender file: '+bpy.data.filepath)
    SOURCE.mkdir(parents=True,exist_ok=True)
    review=ROOT/'_dev'/'WaxCareer20261022'
    review.mkdir(parents=True,exist_ok=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    scene=bpy.context.scene
    scene['BlenderMcpTask']='EarSpaWaxCareer20261022'
    data={'version':VERSION,'segments':SEGMENTS,'rings':RINGS,'reference':'References/Reference_CerumenMaterials.png','profiles':{}}
    objects=[]
    for i,kind in enumerate(['dry','wet','impacted']):
        obj=ShellMesh('Model_WaxSculpt_'+kind.title(),kind)
        obj.data.materials.append(Material(kind))
        bpy.context.view_layer.update()
        data['profiles'][kind]=Bake(obj,kind)
        objects.append(obj)
    # A source hash ties runtime data to the precise dense local meshes.
    canonical=json.dumps(data,sort_keys=True,separators=(',',':'))
    data['sourceSha256']=hashlib.sha256(canonical.encode()).hexdigest()
    (ROOT/'Data_WaxSculptProfiles.mjs').write_text('// Generated by Script_WaxSculptBake.py through BlenderMCP. Do not edit samples.\nexport const WAX_SCULPT_PROFILES = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
    # The recovered art is packed for a portable source project, never treated
    # as calibrated photography or as a runtime albedo map.
    reference=bpy.data.images.load(str(ROOT/'References'/'Reference_CerumenMaterials.png'),check_existing=True)
    reference.pack()
    empty=bpy.data.objects.new('Reference_CerumenMaterials_GeneratedArt',None)
    scene.collection.objects.link(empty)
    empty.empty_display_type='IMAGE'
    empty.data=reference
    empty.empty_display_size=6
    empty.location=(0,3,0)
    empty.hide_render=True
    # Two views of the same three physical maquettes, matching the source art.
    for i,obj in enumerate(objects):
        obj.location=((i-1)*2.35,.95,0)
        obj.rotation_euler=(0,0,-.18)
        duplicate=bpy.data.objects.new(obj.name+'_Profile',obj.data)
        scene.collection.objects.link(duplicate)
        duplicate.rotation_euler=(-.50,0,.18)
        minimum=min((duplicate.rotation_euler.to_matrix() @ v.co).z for v in duplicate.data.vertices)
        duplicate.location=((i-1)*2.35,-1.05,.012-minimum)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.045))
    plane=bpy.context.object
    plane.name='Model_WaxReviewGround'
    mat=bpy.data.materials.new('Material_WaxReviewGround')
    mat.diffuse_color=(.036,.043,.047,1)
    mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.036,.043,.047,1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.91
    plane.data.materials.append(mat)
    for name,loc,power,size in [('Key',(-3,-1,7),420,3.5),('Fill',(4,2,5),130,3),('Rim',(0,4,3),210,2.5)]:
        lamp=bpy.data.lights.new('Light_WaxReview'+name,'AREA')
        lamp.energy=power
        lamp.shape='DISK'
        lamp.size=size
        obj=bpy.data.objects.new(lamp.name,lamp)
        scene.collection.objects.link(obj)
        obj.location=loc
        Track(obj,(0,0,0))
    camera=bpy.data.cameras.new('Camera_WaxReview')
    obj=bpy.data.objects.new(camera.name,camera)
    scene.collection.objects.link(obj)
    obj.location=(.2,-5.5,8.5)
    Track(obj,(0,0,.05))
    camera.type='ORTHO'
    camera.ortho_scale=7.5
    scene.camera=obj
    scene.render.engine='CYCLES'
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1280
    scene.render.resolution_y=720
    scene.render.resolution_percentage=100
    scene.world.color=(.14,.14,.14)
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(review/'Shot_BlenderWaxMaquettes.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_WaxCareer20261022.blend'))
    bpy.ops.render.render(write_still=True)
    print(json.dumps({'blend':bpy.data.filepath,'profiles':str(ROOT/'Data_WaxSculptProfiles.mjs'),'review':scene.render.filepath,'sourceSha256':data['sourceSha256'],'rayMisses':sum(x['rayMisses'] for x in data['profiles'].values())}))


Build()
