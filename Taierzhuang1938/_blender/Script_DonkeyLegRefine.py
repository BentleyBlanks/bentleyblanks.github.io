"""Reference-led forearm/cannon volume and a straighter far foreleg stance."""
import bpy,math
from mathutils import Vector

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Curve(rows,height):
    if height<=rows[0][0]:return rows[0][1]
    if height>=rows[-1][0]:return rows[-1][1]
    for (a,x),(b,y) in zip(rows,rows[1:]):
        if a<=height<=b:
            t=Smooth(a,b,height);return x+(y-x)*t

def FitReferenceLegs(skin,rig):
    stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']
    groupOwner={group.index:next((stem for stem in stems if group.name.startswith(stem)),None) for group in skin.vertex_groups}
    masses=[{stem:sum(g.weight for g in vertex.groups if groupOwner[g.group]==stem) for stem in stems} for vertex in skin.data.vertices]
    source=[vertex.co.copy() for vertex in skin.data.vertices]
    horn={i for face in skin.data.polygons if skin.data.materials[face.material_index].name.startswith('DonkeyHoofHorn') for i in face.vertices}
    levels=[.10+i*.025 for i in range(24)]
    sections={stem:[[] for z in levels] for stem in stems}
    # Intersect real surface edges with horizontal planes; sampling vertices
    # alone misses long pastern faces and overweights detached little tufts.
    for edge in skin.data.edges:
        a,b=edge.vertices;p,q=source[a],source[b]
        if abs(p.z-q.z)<1e-8:continue
        for index,height in enumerate(levels):
            t=(height-p.z)/(q.z-p.z)
            if not 0<=t<=1:continue
            point=p.lerp(q,t)
            for stem in stems:
                if masses[a][stem]*(1-t)+masses[b][stem]*t>.55:sections[stem][index].append(point)
    profiles={}
    for stem in stems:
        rows=[]
        for height,points in zip(levels,sections[stem]):
            if len(points)<6:continue
            low=[min(p[i] for p in points) for i in (0,1)];high=[max(p[i] for p in points) for i in (0,1)]
            rows.append([height,(low[0]+high[0])/2,(low[1]+high[1])/2,high[0]-low[0],high[1]-low[1]])
        if len(rows)<18:raise RuntimeError('Incomplete leg surface cross sections: '+stem)
        profiles[stem]=rows
    frontX=[(.10,1),(.155,.97),(.20,1.28),(.25,1.33),(.30,1.33),(.375,1.08),(.43,1.12),(.55,1.12),(.62,1.08),(.68,1)]
    frontY=[(.10,1),(.155,.80),(.20,1.65),(.25,1.85),(.30,1.80),(.375,1.15),(.43,1.60),(.48,2.05),(.55,2.10),(.60,2.05),(.65,1.60),(.70,1)]
    rearX=[(.10,1),(.155,.98),(.20,1.18),(.25,1.22),(.30,1.20),(.375,1.02),(.45,1)]
    rearY=[(.10,1),(.155,.98),(.20,1.40),(.25,1.48),(.30,1.40),(.375,1.04),(.45,1)]
    farPose=[(.10,0),(.155,-.018),(.22,-.048),(.30,-.058),(.38,-.045),(.48,-.025),(.60,-.025),(.69,-.020),(.80,-.005),(.90,0)]
    changes={stem:[] for stem in stems}
    for vertex,point,row in zip(skin.data.vertices,source,masses):
        stem=max(stems,key=lambda name:row[name]);weight=Smooth(.50,.92,row[stem])
        if vertex.index in horn or weight<=0 or not .10<point.z<.90:continue
        front=stem.startswith('DonkeyFront');rows=profiles[stem]
        cx,cy,depth=[Curve([(r[0],r[c]) for r in rows],point.z) for c in (1,2,4)]
        sx=Curve(frontX if front else rearX,point.z);sy=Curve(frontY if front else rearY,point.z)
        delta=Vector(((point.x-cx)*(sx-1),(point.y-cy)*(sy-1),0))
        if front:
            anteriorBias=-.5+Smooth(.155,.205,point.z)
            anteriorBias=anteriorBias*(1-Smooth(.39,.46,point.z))+.10*Smooth(.39,.46,point.z)
            delta.y+=anteriorBias*depth*(sy-1)
        if stem=='DonkeyFrontRight':delta.y+=Curve(farPose,point.z)
        vertex.co=point+delta*weight;changes[stem].append((vertex.co-point).length)
    # Keep 28 translation-framed joints and the unchanged physical hoof/sole
    # surfaces. Far carpus/fetlock pivots follow the straighter standing limb;
    # native clips and the actual planted sole offsets are solved afresh.
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    movedBones={}
    for bone in rig.data.edit_bones:
        if not bone.name.startswith('DonkeyFrontRight'):continue
        delta=Curve(farPose,bone.head.z);bone.head.y+=delta;bone.tail=bone.head+Vector((0,.075,0));movedBones[bone.name]=delta
    bpy.ops.object.mode_set(mode='OBJECT')
    skin.data.update()
    soleError=max((v.co-p).length for v,p in zip(skin.data.vertices,source) if p.z<.035)
    hornError=max((skin.data.vertices[i].co-source[i]).length for i in horn)
    if soleError>1e-8 or hornError>1e-8:raise RuntimeError('Leg volume fit changed rigid hoof horn or planted soles')
    return {'method':'surface cross-section volume fit; fuller forearms and cannon shafts, restrained fetlocks, straighter far foreleg; unchanged horn and soles',
        'maxDisplacementM':{stem:max(values,default=0) for stem,values in changes.items()},'sourceSections':profiles,
        'frontScaleX':frontX,'frontScaleY':frontY,'rearScaleX':rearX,'rearScaleY':rearY,
        'farForelegPoseShiftY':farPose,'boneShiftY':movedBones,'upperFadeZ':.70,'poseFadeZ':.90,'soleDisplacementM':soleError,'hornDisplacementM':hornError}
