"""A tapered tail core and individually curved, skinned terminal hairs."""
import bpy,math,random
import numpy as np
from pathlib import Path
from mathutils import Vector

def RebuildTailGroom(skin,rig,collection,material):
    for obj in list(collection.objects):
        if obj.name.startswith(('DonkeyTailFineFibres','DonkeyReferenceTailVolume')):
            bpy.data.objects.remove(obj,do_unlink=True)
    tail=bpy.data.objects['DonkeyThinTail'];matrix=rig.matrix_world.inverted()@tail.matrix_world;back=matrix.inverted()
    points=[matrix@v.co for v in tail.data.vertices]
    for first in range(0,len(points),8):
        ring=points[first:first+8];centre=sum(ring,Vector())/len(ring)
        if centre.z>=.80:continue
        fraction=max(0,min(1,(centre.z-.38)/.42));newZ=.60+.20*fraction
        radius=.0012+.01232*fraction;oldRadius=max((p-centre).length for p in ring)
        newCentre=Vector((centre.x,-.170+.005*(newZ-.65)/.15,newZ))
        for vertex,point in zip(list(tail.data.vertices)[first:first+8],ring):
            offset=point-centre;vertex.co=back@(newCentre+offset*(radius/max(.0001,oldRadius)))
    tail.data.update()
    reference=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(reference),check_existing=False)
    rgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,1177:1209,:3][450:710]
    rgb=rgb[(rgb.mean(axis=2)>.075)&(rgb.mean(axis=2)<.36)]
    palette=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    bpy.data.images.remove(image)
    if len(palette)<100:raise RuntimeError('No reference tail pigment samples')
    rng=random.Random(19381030);vertices=[];faces=[];normals=[];colors=[];weights=[];uvs=[]
    guideEnds=(.24,.30,.34,.39,.32,.45,.35,.28,.36,.42,.31,.27,.38)
    guideCount=len(guideEnds);guides=[]
    for guide in range(guideCount):
        angle=2*math.pi*guide/guideCount;spread=rng.uniform(.022,.045)
        guides.append((math.cos(angle)*spread,math.sin(angle)*spread,rng.uniform(-.020,.020),rng.uniform(-.022,.022),guideEnds[guide]))
    def Centre(z):
        return Vector((.009,float(np.interp(z,(.22,.40,.58,.76,.90),(-.165,-.178,-.184,-.167,-.150))),z))
    for strand in range(480):
        gx,gy,bendX,bendY,guideEnd=guides[strand%guideCount];rootZ=rng.uniform(.77,.92)
        endZ=guideEnd+rng.uniform(-.015,.025) if strand<360 else rng.uniform(.45,.62)
        rootAngle=rng.uniform(0,2*math.pi);root=Centre(rootZ)+Vector((math.cos(rootAngle)*.007,math.sin(rootAngle)*.007,0))
        end=Centre(endZ)+Vector((gx+rng.gauss(0,.0015),gy+rng.gauss(0,.0015),0))
        angle=rng.uniform(0,2*math.pi);across=Vector((math.cos(angle),math.sin(angle),0))
        tangent=(end-root).normalized();across=(across-tangent*across.dot(tangent)).normalized();normal=across.cross(tangent).normalized()
        halfWidth=rng.uniform(.00050,.00110);pigment=palette[rng.randrange(len(palette))]*rng.uniform(.80,1.40)
        first=len(vertices)
        for t,taper in ((0,.75),(.38,1),(.76,.45),(1,.04)):
            point=root.lerp(end,t)+Vector((bendX*math.sin(math.pi*t),bendY*math.sin(math.pi*t),0))
            vertices.extend((point-across*halfWidth*taper,point+across*halfWidth*taper));normals.extend((tuple(normal),tuple(normal)))
            color=tuple(float(max(.005,min(.16,value*(.90+.16*t)))) for value in pigment)+(1,)
            colors.extend((color,color));row={'DonkeyTailPivot':.35*(1-t),'DonkeyTailTipPivot':.65+.35*t};weights.extend((row,row))
            uvs.extend(((.2498,.57),(.2502,.5702)))
        for level in range(3):
            a=first+level*2;faces.append((a,a+1,a+3,a+2))
    mesh=bpy.data.meshes.new('DonkeyReferenceTailVolume');mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    mesh.normals_split_custom_set_from_vertices(normals)
    for face in mesh.polygons:face.use_smooth=True
    uv=mesh.uv_layers.new(name='UVMap');paint=mesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    for value,color in zip(paint.data,colors):value.color=color
    mesh.color_attributes.active_color_index=0;mesh.color_attributes.render_color_index=0
    obj=bpy.data.objects.new('DonkeyReferenceTailVolume',mesh);collection.objects.link(obj);obj.parent=rig
    for index,row in enumerate(weights):
        for name,weight in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],weight,'REPLACE')
    modifier=obj.modifiers.new('DonkeyTailGroomSkin','ARMATURE');modifier.object=rig
    obj['coatCardCount']=len(faces);obj['groomCastShadow']=False;obj.visible_shadow=False
    return {'fibres':480,'guides':guideCount,'triangles':len(faces)*2,'halfWidthM':[.00050,.00110],'endHeightM':[.225,.62],'longClumpEndHeightsM':list(guideEnds),'longFibres':360,'interiorFibres':120,
            'coreEndHeightM':.60,'coreTipRadiusM':.0012,'material':'DonkeyShortCoatPbr','exportLayer':'DonkeyCoatRuntime',
            'pigment':'reference tail linear RGB samples, varied per strand','method':'three-segment curved strips, staggered ends and near-zero tip widths; no large brush cards'}
