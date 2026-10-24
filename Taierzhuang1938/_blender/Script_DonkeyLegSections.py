"""Continuous anatomical limb sections, fitted independently of photo pigment."""
import bpy,math
from mathutils import Vector

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Curve(rows,height):
    """Shape-preserving cubic interpolation; no section-to-section overshoot."""
    if height<=rows[0][0]:return rows[0][1]
    if height>=rows[-1][0]:return rows[-1][1]
    slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(rows,rows[1:])]
    tangent=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]):tangent.append(0 if a*b<=0 else 2*a*b/(a+b))
    tangent.append(slopes[-1])
    for i,((a,x),(b,y)) in enumerate(zip(rows,rows[1:])):
        if a<=height<=b:
            t=(height-a)/(b-a)
            return (2*t**3-3*t*t+1)*x+(t**3-2*t*t+t)*(b-a)*tangent[i]+(-2*t**3+3*t*t)*y+(t**3-t*t)*(b-a)*tangent[i+1]

def MeasureLegSections(skin,appearance=False):
    stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']
    owners={g.index:next((s for s in stems if g.name.startswith(s)),None) for g in skin.vertex_groups}
    masses=[{s:sum(g.weight for g in v.groups if owners[g.group]==s) for s in stems} for v in skin.data.vertices]
    cached=skin.data.attributes.get('LimbAppearanceMass') if appearance else None
    if cached:masses=[{s:float(cached.data[v.index].color[i]) for i,s in enumerate(stems)} for v in skin.data.vertices]
    levels=[.09+i*.01 for i in range(79)];sections={s:[[] for z in levels] for s in stems}
    points=[v.co.copy() for v in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;p,q=points[a],points[b]
        if abs(q.z-p.z)<1e-8:continue
        stem=max(stems,key=lambda s:masses[a][s]+masses[b][s])
        if masses[a][stem]+masses[b][stem]<.8:continue
        first=max(0,math.ceil((min(p.z,q.z)-.09)/.01));last=min(len(levels)-1,math.floor((max(p.z,q.z)-.09)/.01))
        for i in range(first,last+1):
            t=(levels[i]-p.z)/(q.z-p.z)
            if masses[a][stem]*(1-t)+masses[b][stem]*t>.55:sections[stem][i].append(p.lerp(q,t))
    profiles={}
    for stem in stems:
        rows=[]
        for z,section in zip(levels,sections[stem]):
            if len(section)<6:continue
            lo=[min(p[c] for p in section) for c in (0,1)];hi=[max(p[c] for p in section) for c in (0,1)]
            rows.append([z,(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,hi[0]-lo[0],hi[1]-lo[1]])
        if len(rows)<50:raise RuntimeError('Incomplete limb sections: '+stem)
        profiles[stem]=rows
    return stems,masses,profiles

def FitReferenceLegs(skin,rig):
    bpy.context.scene['DonkeyReferenceLegSections']=True
    stems,masses,profiles=MeasureLegSections(skin);source=[v.co.copy() for v in skin.data.vertices]
    horn={i for f in skin.data.polygons if skin.data.materials[f.material_index].name.startswith('DonkeyHoofHorn') for i in f.vertices}
    # Absolute metre sections replace the old independent depth multipliers.
    frontX=[(.12,.096),(.155,.09567),(.24,.100),(.33,.103),(.38,.104),(.48,.111),(.60,.126),(.70,.132),(.80,.145)]
    frontY=[(.12,.650),(.155,.644167),(.23,.655),(.33,.662),(.38,.666),(.48,.671),(.60,.669),(.70,.666),(.80,.666)]
    frontWidth=[(.12,.066),(.155,.075),(.22,.059),(.30,.055),(.345,.064),(.38,.088),(.425,.076),(.50,.068),(.60,.088),(.69,.112),(.78,.145)]
    frontDepth=[(.12,.066),(.155,.080),(.22,.071),(.30,.071),(.38,.087),(.45,.084),(.54,.099),(.63,.120),(.70,.147),(.78,.165)]
    rearX=[(.12,.107),(.155,.1063),(.24,.108),(.375,.112),(.48,.126),(.58,.136),(.68,.142)]
    rearY=[(.12,-.080),(.155,-.087719),(.24,-.092),(.33,-.099),(.375,-.095273),(.43,-.069),(.50,-.041),(.58,.005),(.65,.035),(.70,.055)]
    rearWidth=[(.12,.065),(.155,.072),(.22,.057),(.30,.053),(.355,.064),(.40,.070),(.48,.080),(.56,.105),(.64,.140),(.72,.175)]
    rearDepth=[(.12,.065),(.155,.076),(.22,.059),(.30,.056),(.355,.073),(.40,.080),(.48,.105),(.56,.145),(.64,.190),(.72,.240)]
    offsets={kind:rig.data.bones['Donkey'+kind+'RightHoofPivot'].head_local.y-rig.data.bones['Donkey'+kind+'LeftHoofPivot'].head_local.y for kind in ('Front','Rear')}
    def Centre(stem,z):
        front='Front' in stem;right=stem.endswith('Right');sign=1 if right else -1
        cy=Curve(frontY if front else rearY,z)
        if right:cy+=offsets['Front' if front else 'Rear']*(1-Smooth(.155 if front else .32,.72,z))
        return sign*Curve(frontX if front else rearX,z),cy
    changes={s:[] for s in stems}
    for v,p,row in zip(skin.data.vertices,source,masses):
        stem=max(stems,key=lambda s:row[s]);front='Front' in stem
        strength=Smooth(.40,.85,row[stem])*Smooth(.100,.145,p.z)*(1-Smooth(.62,.70,p.z) if front else 1-Smooth(.56,.72,p.z))
        if v.index in horn or strength<=0:continue
        rows=profiles[stem];cx,cy,wx,wy=[Curve([(r[0],r[c]) for r in rows],p.z) for c in (1,2,3,4)]
        dx,dy=(p.x-cx)/max(.01,wx*.5),(p.y-cy)/max(.01,wy*.5)
        radius=max(.1,math.hypot(dx,dy));fair=.85/radius+.15
        tx,ty=Centre(stem,p.z);width=Curve(frontWidth if front else rearWidth,p.z);depth=Curve(frontDepth if front else rearDepth,p.z)
        target=Vector((tx+dx*fair*width*.5,ty+dy*fair*depth*.5,p.z))
        v.co=p.lerp(target,strength);changes[stem].append((v.co-p).length)
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT');movedBones={}
    for b in rig.data.edit_bones:
        stem=next((s for s in stems if b.name.startswith(s)),None)
        if not stem or b.name.endswith('HoofPivot') or b.name==stem+'Pivot':continue
        old=b.head.copy();x,y=Centre(stem,b.head.z)
        if 'Rear' in stem and b.name.endswith('ElbowPivot'):x,y=(1 if stem.endswith('Right') else -1)*.13,.055
        b.head.x=x;b.head.y=y;b.tail=b.head+Vector((0,.075,0));movedBones[b.name]=list(b.head-old)
    bpy.ops.object.mode_set(mode='OBJECT');skin.data.update()
    soleError=max((v.co-p).length for v,p in zip(skin.data.vertices,source) if p.z<.035)
    hornError=max((skin.data.vertices[i].co-source[i]).length for i in horn)
    if soleError>1e-8 or hornError>1e-8:raise RuntimeError('Limb fit changed rigid horn or planted soles')
    return {'method':'independent metre-scale anatomical sections; shape-preserving cubic centreline/width/depth, faired radial contours and continuous root transitions; preserved horn and soles',
        'maxDisplacementM':{s:max(d,default=0) for s,d in changes.items()},'sourceSections':profiles,'frontCentreX':frontX,'frontCentreY':frontY,'frontWidth':frontWidth,'frontDepth':frontDepth,
        'rearCentreX':rearX,'rearCentreY':rearY,'rearWidth':rearWidth,'rearDepth':rearDepth,'standingOffsetY':offsets,'boneDisplacementM':movedBones,'soleDisplacementM':soleError,'hornDisplacementM':hornError}
