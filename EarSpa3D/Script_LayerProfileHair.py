"""One existing coiffure: opaque scalp, three alpha-card depths, loose silhouette hairs."""
import bpy, math, random, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ConchaSculpt')

def Build(roundNumber=10):
    assert Path(bpy.data.filepath).resolve()==(SOURCE/'Model_ConchaSculpt.blend').resolve()
    ns={'__file__':str(ROOT/'Script_BuildReferenceProfile.py')}
    exec(compile((ROOT/'Script_BuildReferenceProfile.py').read_text(encoding='utf-8'),ns['__file__'],'exec'),ns)
    fit=json.loads((SOURCE.parent/'ReferenceProfile/ConchaFit.json').read_text())
    ns['DEPTH_OFFSET']=-1.8+fit['depthShift']-6
    for name in ['Model_ProfileHairStrands','Model_ProfileHairWisps']:
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
    bsdf.inputs['Anisotropic'].default_value=.28;bsdf.inputs['Specular IOR Level'].default_value=.19
    material.surface_render_method='DITHERED';material.use_transparency_overlap=False
    def Catmull(a,b,c,d,t):return (b*2+(c-a)*t+(a*2-b*5+c*4-d)*t*t+(-a+b*3-c*3+d)*t**3)*.5
    def Flow(side,u,t,lift):
        a=u*math.pi
        controls=[Vector((side*.055,6.988,.45-.23*u)),Vector((side*.52,6.81,.42+.58*math.cos(a))),Vector((side*.78,6.20,.37+.38*math.cos(a))),Vector((side*.79,5.63,.10-.46*u)),Vector((side*.82,4.25+.10*math.sin(u*7),.10-.52*u))]
        at=t*4;i=min(3,int(at));q=at-i
        p=Catmull(controls[max(0,i-1)],controls[i],controls[i+1],controls[min(4,i+2)],q)
        p.x+=side*lift/100
        return Vector(ns['Map'](p))+Vector((-3.5,.8,0))
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
                for row in range(17):
                    t=row/16;tt=startT+(endT-startT)*t
                    drift=math.sin(t*5.5+card*1.61)*(.005+layer*.002)
                    for col in range(5):
                        u=center+width*(col/4-.5)+drift
                        p=Flow(side,u,tt,lift+math.sin(col/4*math.pi)*(.04+layer*.075)+layer*.35*math.sin(t*4+card*1.2))
                        verts.append(tuple(p));uvs.append((col/4,1-t))
                        if row<16 and col<4:
                            k=begin+row*5+col;faces.append((k,k+1,k+6,k+5))
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
    for obj in [cards,wisps]:obj['outerFitShifted']=True;obj['conchaAligned']=True
    bpy.context.scene['conchaRound']=roundNumber
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_ConchaSculpt.blend'))
    print('Layered hair: 120 curved textured cards in 3 depths; 90 silhouette strands')
