"""One existing coiffure: opaque scalp, three alpha-card depths, loose silhouette hairs."""
import bpy, bmesh, math, random, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/HairCoverage')

def Build(roundNumber=7):
    assert Path(bpy.data.filepath).resolve()==(SOURCE/'Model_HairCoverage.blend').resolve()
    ns={'__file__':str(ROOT/'Script_BuildReferenceProfile.py')}
    exec(compile((ROOT/'Script_BuildReferenceProfile.py').read_text(encoding='utf-8'),ns['__file__'],'exec'),ns)
    fit=json.loads((SOURCE.parent/'ReferenceProfile/ConchaFit.json').read_text())
    ns['DEPTH_OFFSET']=-1.8+fit['depthShift']-6
    for name in ['Model_ProfileHair','Model_ProfileHairStrands','Model_ProfileHairWisps']:
        old=bpy.data.objects.get(name)
        if old:bpy.data.objects.remove(old,do_unlink=True)
    material=ns['Mat']('Material_LayeredHairCards',(.11,.085,.065),.54,coat=0)
    nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for node in list(nodes):
        if node!=bsdf and node.type!='OUTPUT_MATERIAL':nodes.remove(node)
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'Textures/Texture_LayeredDarkHair.png'),check_existing=True);tex.image.pack()
    uvCoord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeMapping');mapping.inputs['Scale'].default_value=(.18,1,1);mapping.inputs['Location'].default_value=(.34,0,0)
    links.new(uvCoord.outputs['UV'],mapping.inputs['Vector']);links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
    alpha=nodes.new('ShaderNodeTexImage');alpha.image=tex.image;links.new(uvCoord.outputs['UV'],alpha.inputs['Vector'])
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);links.new(alpha.outputs['Alpha'],bsdf.inputs['Alpha'])
    bsdf.inputs['Anisotropic'].default_value=0;bsdf.inputs['Specular IOR Level'].default_value=.19
    material.surface_render_method='DITHERED';material.use_transparency_overlap=False
    def Catmull(a,b,c,d,t):return (b*2+(c-a)*t+(a*2-b*5+c*4-d)*t*t+(-a+b*3-c*3+d)*t**3)*.5
    head=bpy.data.objects['Model_Temple']
    headCenter=Vector((-6,35,60))
    def Flow(side,u,t,lift):
        u=max(0,min(1,u));a=u*math.pi
        wrap=math.sqrt(max(0,1-u*u))
        controls=[Vector((side*.055*wrap,6.988,.45-.23*u)),
                  Vector((side*.55*wrap,6.83,.42+.58*math.cos(a))),
                  Vector((side*.77*wrap,6.30,.36+.40*math.cos(a))),
                  Vector((side*.78*wrap,5.96,.37-.48*u)),
                  Vector((side*.77*wrap,5.74,.29-.68*u)),
                  Vector((side*.79*wrap,5.20,.35-.80*u)),
                  Vector((side*.82*wrap,4.25+.035*math.sin(u*7),.36-.86*u))]
        at=t*6;i=min(5,int(at));q=at-i
        p=Catmull(controls[max(0,i-1)],controls[i],controls[i+1],controls[min(6,i+2)],q)
        p.x+=side*lift/100*wrap
        game=Vector(ns['Map'](p))+Vector((-3.5,.8,0))
        if game.y>-15:
            direction=(game-headCenter).normalized()
            hit,point,normal,index=head.ray_cast(ns['V'](headCenter+direction*280),ns['V'](-direction))
            if hit:
                surface=Vector((point.x,point.z,-point.y))+direction*(2.1+lift*min(1,t*18))
                weight=max(0,min(1,(game.y+15)/35));weight=weight*weight*(3-2*weight)
                game=game.lerp(surface,weight)
        return game

    # Native scalp follows the skull down to the occiput; it is an opaque volume.
    raw,points,uvs,groups=ns['Read']()
    scalpFaces=[f for f in groups['body'] if all(points[i].y>6.28+.24*max(0,min(1,(points[i].z-.4)/.7)) or (points[i].y>5.55 and points[i].z<.23) for i,u in f)]
    scalp=ns['Subset']('Model_ProfileHair',scalpFaces,points,uvs,material,1)
    bm=bmesh.new();bm.from_mesh(scalp.data)
    boundary=[v for v in bm.verts if v.is_boundary]
    for iteration in range(6):
        positions={v:v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges if e.is_boundary),Vector())/2,.45) for v in boundary if sum(e.is_boundary for e in v.link_edges)==2}
        for v,p in positions.items():v.co=p
    bm.to_mesh(scalp.data);bm.free()
    for vertex in scalp.data.vertices:
        vertex.co.x-=3.5;vertex.co.z+=.8
    scalp.data.update()
    for vertex in scalp.data.vertices:vertex.co+=vertex.normal*1.25
    for poly in scalp.data.polygons:
        for loop in poly.loop_indices:
            p=scalp.data.vertices[scalp.data.loops[loop].vertex_index].co
            scalp.data.uv_layers.active.data[loop].uv=(.30+p.x/400, max(.03,min(.85,1-(p.z+25)/165)))
    # One continuous undercoat per hemisphere closes the gaps between the three card layers.
    baseVerts=[];baseFaces=[];baseUvs=[]
    for side in [-1,1]:
        start=len(baseVerts)
        for row in range(37):
            t=row/36
            for col in range(33):
                u=col/32
                baseVerts.append(tuple(Flow(side,u,t,.08)))
                baseUvs.append((.12+u*.76,1-t*.90))
                if row<36 and col<32:
                    k=start+row*33+col;baseFaces.append((k,k+1,k+34,k+33))
    base=ns['Mesh']('HairContinuousUndercoat',baseVerts,baseFaces,material)
    uv=base.data.uv_layers.new(name='UVMap')
    for f in base.data.polygons:
        for loop in f.loop_indices:uv.data[loop].uv=baseUvs[base.data.loops[loop].vertex_index]
    bpy.ops.object.select_all(action='DESELECT');scalp.hide_set(False);base.select_set(True);scalp.select_set(True);bpy.context.view_layer.objects.active=scalp;bpy.ops.object.join()
    scalp['coverage']='Native occipital cap plus continuous temple-to-nape undercoat'
    opaque=material.copy();opaque.name='Material_HairOpaqueCoverage'
    opaqueBsdf=opaque.node_tree.nodes.get('Principled BSDF')
    for link in list(opaqueBsdf.inputs['Alpha'].links):opaque.node_tree.links.remove(link)
    opaqueBsdf.inputs['Alpha'].default_value=1
    scalp.data.materials.clear();scalp.data.materials.append(opaque)
    rng=random.Random(9126);verts=[];faces=[];uvs=[]
    # Each surface layer follows a slightly different curve and elevation.
    for side in [-1,1]:
        for layer,count in [(0,20),(1,22),(2,18)]:
            for card in range(count):
                center=(card+.42+rng.uniform(-.16,.16))/count
                width=rng.uniform(1.55,1.8)/count if layer==0 else rng.uniform(.85,1.2)/count
                lift=[.25,1.25,2.7][layer]+rng.uniform(0,.55)
                startT=rng.uniform(.012,.045);endT=rng.uniform(.89,1)
                begin=len(verts)
                for row in range(23):
                    t=row/22;tt=startT+(endT-startT)*t
                    drift=math.sin(t*5.5+card*1.61)*(.005+layer*.002)
                    for col in range(3):
                        u=center+width*(col/2-.5)+drift
                        p=Flow(side,u,tt,lift+math.sin(col/2*math.pi)*(.04+layer*.075)+layer*.35*math.sin(t*4+card*1.2))
                        verts.append(tuple(p));uvs.append((col/2,1-t))
                        if row<22 and col<2:
                            k=begin+row*3+col;faces.append((k,k+1,k+4,k+3))
    cards=ns['Mesh']('Model_ProfileHairStrands',verts,faces,material)
    uv=cards.data.uv_layers.new(name='UVMap')
    for f in cards.data.polygons:
        for l in f.loop_indices:uv.data[l].uv=uvs[cards.data.loops[l].vertex_index]
    cards['hairLayers']=3;cards['hairCards']=120;cards['texture']='Texture_LayeredDarkHair.png'
    # Continuous fine ribbons break up the otherwise straight front silhouette.
    verts=[];faces=[];uvs=[]
    for side in [-1,1]:
        for strand in range(45):
            center=rng.uniform(-.035,.08) if strand<25 else rng.uniform(.05,.85)
            startT=rng.uniform(.18,.42);endT=rng.uniform(.63,.88)
            lift=rng.uniform(1.1,2.7);width=rng.uniform(.030,.060);drift=rng.uniform(.005,.008)
            start=len(verts)
            for row in range(17):
                t=row/16;tt=startT+(endT-startT)*t
                u=center+math.sin(t*math.pi)*drift
                tangent=Flow(side,u,min(.999,tt+.001),lift)-Flow(side,u,max(.001,tt-.001),lift)
                across=Vector((-tangent.y,tangent.x,0)).normalized()
                for edge in [-1,1]:
                    p=Flow(side,u,tt,lift+math.sin(t*math.pi)*2.2)+across*(edge*width*(1-t*.85))
                    if strand<25:
                        p.x-=(3.0+(strand%9)*.72)*math.sin(t*math.pi)**1.5
                        p.z-=1.7*math.sin(t*math.pi)
                    verts.append(tuple(p));uvs.append((.5+edge*.08,1-t*.86))
                if row<16:
                    k=start+row*2;faces.append((k,k+1,k+3,k+2))
    wisps=ns['Mesh']('Model_ProfileHairWisps',verts,faces,material)
    uv=wisps.data.uv_layers.new(name='UVMap')
    for f in wisps.data.polygons:
        for l in f.loop_indices:uv.data[l].uv=uvs[wisps.data.loops[l].vertex_index]
    wisps['silhouetteHairs']=90
    for obj in [scalp,cards,wisps]:obj['outerFitShifted']=True;obj['conchaAligned']=True
    bpy.context.scene['hairCoverageRound']=roundNumber
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_HairCoverage.blend'))
    print('Layered hair: 120 curved textured cards in 3 depths; 90 silhouette strands')


def Export():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.name.startswith('Model_'):
            obj.hide_set(False);obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models/Model_ImmersiveEar.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
