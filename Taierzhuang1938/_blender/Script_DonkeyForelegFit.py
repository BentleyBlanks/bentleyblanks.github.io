"""Late transverse foreleg fit from the original frontal silhouette.

Run after pectoral construction/topology, before pigment, flow and grooming.
This retains the standing horn, side depth, all Y/Z coordinates and hierarchy.
"""
import bpy,math,json
from pathlib import Path
from mathutils import Vector

def FitFrontalForelegs(scene,skin,rig):
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyLegSections.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    stems,masses,profiles=namespace['MeasureLegSections'](skin,True);curve=namespace['Curve'];smooth=namespace['Smooth']
    centres=[(.12,.096),(.155,.09567),(.24,.092),(.30,.087),(.38,.085),(.48,.087),(.60,.093),(.69,.115),(.80,.145)]
    widths=[(.12,.066),(.155,.075),(.22,.061),(.30,.068),(.345,.083),(.38,.100),(.425,.086),(.50,.086),(.60,.108),(.69,.112),(.78,.145)]
    source=[v.co.copy() for v in skin.data.vertices];horn={i for f in skin.data.polygons if skin.data.materials[f.material_index].name.startswith('DonkeyHoofHorn') for i in f.vertices};changes=[]
    def Deform(p):
        amount=smooth(.12,.17,p.z)*(1-smooth(.78,.92,p.z))*smooth(.40,.50,p.y)*(1-smooth(.90,1.0,p.y))
        if amount<=0:return p.x
        cx=sum(abs(curve([(r[0],r[1]) for r in profiles[stem]],p.z)) for stem in stems[:2])/2
        width=sum(curve([(r[0],r[3]) for r in profiles[stem]],p.z) for stem in stems[:2])/2
        targetCentre=curve(centres,p.z);targetWidth=curve(widths,p.z)
        inner=max(.008,cx-width*.5);outer=cx+width*.5
        targetInner=max(.008,targetCentre-targetWidth*.5);targetOuter=targetCentre+targetWidth*.5
        stop=max(.25,outer+.08,targetOuter+.08)
        # Fit the lower limb locally, then use a shared affine contraction
        # through the axilla. Applying a nonlinear width map to its long,
        # nearly touching triangles can make their straight chords cross.
        target=curve([(0,0),(inner,targetInner),(cx,targetCentre),(outer,targetOuter),(stop,stop)],abs(p.x))
        lower=1-smooth(.50,.58,p.z)
        target=p.x*.80+(math.copysign(target,p.x)-p.x*.80)*lower
        return p.x+(target-p.x)*amount
    for vertex in skin.data.vertices:
        p=source[vertex.index]
        if vertex.index in horn:continue
        vertex.co.x=Deform(p)
        if abs(vertex.co.x-p.x)>1e-9:changes.append(abs(vertex.co.x-p.x))
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');bones={}
    for bone in rig.data.edit_bones:
        if not bone.name.startswith(('DonkeyFrontLeft','DonkeyFrontRight')) or bone.name.endswith('HoofPivot'):continue
        old=bone.head.copy();bone.head.x=Deform(old);bone.tail=bone.head+Vector((0,.075,0));bones[bone.name]=list(bone.head-old)
    bpy.ops.object.mode_set(mode='OBJECT');skin.data.update()
    protected=[i for i,p in enumerate(source) if p.z<.10 or p.y>1.0];maxProtected=max((skin.data.vertices[i].co-source[i]).length for i in protected);yz=max(abs(vertex.co[c]-p[c]) for vertex,p in zip(skin.data.vertices,source) for c in [1,2]);hornDelta=max((skin.data.vertices[i].co-source[i]).length for i in horn)
    if max(maxProtected,yz,hornDelta)>1e-8:raise RuntimeError('Frontal foreleg fit changed a protected coordinate')
    record={'method':'monotone lower-foreleg centre/width fit, transitioning to shared transverse affine contraction through the connected breast/axilla; source Y/Z, horn and head retained; compatible fore-root and knee frames follow the same field','lowerCentreXTargetsByHeightM':centres,'lowerWidthTargetsByHeightM':widths,'lowerToRootTransitionHeightM':[.50,.58],'transverseRootScale':.80,'upperFadeHeightM':[.78,.92],'changedVertices':len(changes),'maximumLateralChangeM':max(changes,default=0),'maximumProtectedPointChangeM':maxProtected,'maximumYZChangeM':yz,'maximumHornChangeM':hornDelta,'boneChangesM':bones}
    (Path(scene['DonkeySourceRoot'])/'Review/Data_ForelegFit.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');scene['DonkeyFrontalForelegRevision']='20261025ForelegV27';return record
