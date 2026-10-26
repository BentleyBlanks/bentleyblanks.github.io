"""A tapered tail core and individually curved, skinned terminal hairs."""
import bpy,math,random
import numpy as np
from pathlib import Path
from mathutils import Vector

def RebuildTailGroom(skin,rig,collection,material):
    namespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyTailBrush.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    for obj in list(collection.objects):
        if obj.name.startswith(('DonkeyTailFineFibres','DonkeyReferenceTailVolume')):
            bpy.data.objects.remove(obj,do_unlink=True)
    tail=bpy.data.objects['DonkeyThinTail'];matrix=rig.matrix_world.inverted()@tail.matrix_world;back=matrix.inverted()
    points=[matrix@v.co for v in tail.data.vertices]
    # A finished source may be reopened for grooming. Its .60 m core is
    # already tapered; applying the original .38 m remap twice shortens it.
    taperCore=min(p.z for p in points)<.50
    for first in range(0,len(points),8) if taperCore else ():
        ring=points[first:first+8];centre=sum(ring,Vector())/len(ring)
        if centre.z>=.80:continue
        fraction=max(0,min(1,(centre.z-.38)/.42));newZ=.60+.20*fraction
        radius=.0012+.01232*fraction;oldRadius=max((p-centre).length for p in ring)
        newCentre=Vector((centre.x,-.170+.005*(newZ-.65)/.15,newZ))
        for vertex,point in zip(list(tail.data.vertices)[first:first+8],ring):
            offset=point-centre;vertex.co=back@(newCentre+offset*(radius/max(.0001,oldRadius)))
    tail.data.update();coreCentrelineMaximum=0
    for first in range(0,len(tail.data.vertices),8):
        ring=list(tail.data.vertices)[first:first+8];points=[matrix@v.co for v in ring];centre=sum(points,Vector())/len(points)
        blend=max(0,min(1,(.94-centre.z)/.10))
        delta=(namespace['TailCentreline'](bpy.context.scene,centre.z)-centre.y)*blend
        coreCentrelineMaximum=max(coreCentrelineMaximum,abs(delta))
        for vertex,point in zip(ring,points):vertex.co=back@(point+Vector((0,delta,0)))
    tail.data.update()
    if coreCentrelineMaximum>.04:raise RuntimeError('Tail centreline fit exceeds the measured 40 mm correction limit')
    reference=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(reference),check_existing=False)
    originalRgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3]
    tailPixels,tailPigment=namespace['ExtractTailReference'](originalRgb);endHeight,endProfile=namespace['BuildTailEndProfile'](originalRgb)
    rgb=originalRgb[450:710,1177:1209,:3]
    rgb=rgb[(rgb.mean(axis=2)>.075)&(rgb.mean(axis=2)<.36)]
    palette=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    bpy.data.images.remove(image)
    if len(palette)<100:raise RuntimeError('No reference tail pigment samples')
    rng=random.Random(19381030);vertices=[];faces=[];normals=[];colors=[];weights=[];uvs=[]
    guideEnds=tuple(endHeight((guide+.5)/13) for guide in range(13));endHeights=[]
    guideCount=len(guideEnds);guides=[]
    for guide in range(guideCount):
        angle=2*math.pi*guide/guideCount
        guides.append((math.cos(angle),math.sin(angle),rng.uniform(-.010,.010),rng.uniform(-.008,.008),guideEnds[guide]))
    def Centre(z):
        return Vector((.009,namespace['TailCentreline'](bpy.context.scene,z),z))
    for strand in range(480):
        gx,gy,bendX,bendY,guideEnd=guides[strand%guideCount];rootZ=rng.uniform(.80,.92)
        # Fill the brush cross-section instead of duplicating thirteen outer
        # guide endpoints. Stratification keeps density through the centre;
        # guide attraction retains small, irregular natural clumps.
        angle=strand*math.pi*(3-math.sqrt(5));radius=math.sqrt((strand%120+.5)/120)
        dx=.055*(.50*radius*math.cos(angle)+.50*gx)
        dy=.022*(.50*radius*math.sin(angle)+.50*gy)
        interior=strand>=300 and strand<420
        rng.random()  # Preserve the original per-strand random sequence.
        endZ=endHeight((strand*.6180339887498949+.5/480)%1);endHeights.append(endZ)
        rootAngle=rng.uniform(0,2*math.pi);root=Centre(rootZ)+Vector((math.cos(rootAngle)*.007,math.sin(rootAngle)*.007,0))
        # A small curl softens the longest tips without changing the measured
        # centreline into the old exaggerated forward hook.
        curl=max(0,min(1,(.365-endZ)/.075));curl=curl*curl*(3-2*curl)
        end=Centre(endZ)+Vector((dx*.45 if interior else dx,dy+.006*curl,0))
        angle=rng.uniform(0,2*math.pi);across=Vector((math.cos(angle),math.sin(angle),0))
        tangent=(end-root).normalized();across=(across-tangent*across.dot(tangent)).normalized();normal=across.cross(tangent).normalized()
        halfWidth=rng.uniform(.00004,.00012);pigment=palette[rng.randrange(len(palette))]*rng.uniform(.80,1.40)
        first=len(vertices);profile=((0,.75),(.38,1),(.93,.70),(1,.02));centres=[]
        rootOffset=root-Centre(root.z);endOffset=end-Centre(end.z)
        for t,taper in profile:
            wave=math.sin(math.pi*t);z=root.z*(1-t)+end.z*t
            lower=max(0,min(1,(.41-end.z)/.11));tailT=max(0,min(1,(t-.15)/.80));tailT=tailT*tailT*(3-2*tailT)
            centres.append(Centre(z)+rootOffset*(1-t)+endOffset*t+Vector(((bendX+.20*dx)*wave,(bendY-.004*curl)*wave+.080*lower*tailT,0)))
        for level,((t,taper),point) in enumerate(zip(profile,centres)):
            previous=centres[max(0,level-1)];following=centres[min(len(centres)-1,level+1)]
            tangent=(following-previous).normalized();across=(across-tangent*across.dot(tangent)).normalized();normal=across.cross(tangent).normalized()
            vertices.extend((point-across*halfWidth*taper,point+across*halfWidth*taper));normals.extend((tuple(normal),tuple(normal)))
            target=namespace['SampleTailPigment'](point,tailPixels,bpy.context.scene['DonkeyReferenceFitAnchorY'],np.clip(pigment*(.90+.16*t),.005,.16))
            color=tuple(float(value) for value in target)+(1,)
            colors.extend((color,color));row={'DonkeyTailPivot':.35*(1-t),'DonkeyTailTipPivot':.65+.35*t};weights.extend((row,row))
            uvs.extend(((.2498,.5700+.0006*t),(.2502,.5700+.0006*t)))
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
    brush=namespace['BuildReferenceTailBrush'](rig,collection)
    return {'version':'20261026TailFlowV43','referenceBrush':brush,'fibres':480,'guides':guideCount,'triangles':len(faces)*2,'halfWidthM':[.00004,.00012],'endHeightM':[min(endHeights),max(endHeights)],'longClumpEndHeightsM':list(guideEnds),'outerFibres':300,'interiorFibres':120,'remainingRootFibres':60,'shortFibres':sum(z>.47 for z in endHeights),
            'coreEndHeightM':.60,'coreTipRadiusM':.0012,'material':'DonkeyShortCoatPbr','exportLayer':'DonkeyCoatRuntime',
            'pigment':'alpha-confident original side/rear tail RGB projected to each fibre knot; existing neutral tuft texel is compensated once','pigmentViews':['Side','Rear'],'neutralFibreTexelLinear':.5394794890121072,'densityProfile':endProfile,'maximumForwardTipCurlM':.080,'frameNormals':'parallel-transported across vectors and local curve tangents at all four knots','centreline':'alpha-weighted original side-reference tail centroids','maximumCoreCentrelineCorrectionM':coreCentrelineMaximum,
            'fibreProfile':[[0,.75],[.38,1],[.93,.70],[1,.02]],'tipTaperSpanFraction':.07,
            'method':'reference-density end distribution with measured centreline at every knot, forward-curving sparse tips and locally transported ribbon frames; three segments per fibre and monotonic UVs'}
