"""Bounded carpal, fetlock and tendon relief below the fitted limb roots.

The original photograph shows angular joints and paired longitudinal tendons.
Keep those shallow forms in the surface, where their lighting can move, rather
than baking a dark joint ring into the coat. Horn, soles and rig are protected.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector


def RefineLowerLimbRelief(scene,skin):
    if scene.get('DonkeyLowerLimbReliefReport'):
        return json.loads(scene['DonkeyLowerLimbReliefReport'])
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyLegSections.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    stems,masses,profiles=namespace['MeasureLegSections'](skin,True)
    smooth=namespace['Smooth'];curve=namespace['Curve']
    original=[v.co.copy() for v in skin.data.vertices]
    horn={i for face in skin.data.polygons if skin.data.materials[face.material_index].name.startswith('DonkeyHoofHorn') for i in face.vertices}
    changes={stem:[] for stem in stems}
    def Bell(value,centre,width):return math.exp(-((value-centre)/width)**2)
    for vertex,p,row in zip(skin.data.vertices,original,masses):
        stem=max(stems,key=lambda name:row[name]);front='Front' in stem
        amount=smooth(.70,.95,row[stem])*smooth(.105,.125,p.z)*(1-smooth(.48,.53,p.z))
        if vertex.index in horn or amount<=0:continue
        rows=profiles[stem];cx,cy,wx,wy=[curve([(r[0],r[c]) for r in rows],p.z) for c in (1,2,3,4)]
        nx=(p.x-cx)/max(.01,wx*.5);ny=(p.y-cy)/max(.01,wy*.5)
        radius=max(.001,math.hypot(nx,ny));nx/=radius;ny/=radius
        # Offset paired bony lobes rather than swelling the full circumference.
        knee=Bell(p.z,.375 if front else .384,.025)
        lateral=Bell(abs(nx),.86,.22)*Bell(ny,.30 if front else -.28,.58)
        fetlock=Bell(p.z,.162,.020)*Bell(abs(nx),.82,.26)*Bell(ny,-.32,.60)
        boss=.0032*knee*lateral+.0024*fetlock
        shaft=smooth(.195,.225,p.z)*(1-smooth(.300,.340,p.z))
        dorsal=Bell(nx,0,.30)*Bell(ny,1,.30)
        paired=Bell(abs(nx),.58,.18)*Bell(ny,-.81,.35)
        tendon=shaft*(.0016*dorsal+.0016*paired)
        groove=shaft*.0010*Bell(nx,0,.26)*Bell(ny,-1,.25)
        # A shallow medial plane breaks the lathed-cylinder reading while
        # preserving the measured silhouette and both standing foot offsets.
        plane=-.0008*shaft*Bell(abs(nx),1,.20)
        delta=Vector((nx,ny,0))*(boss+tendon-groove+plane)*amount
        if delta.length>.0033:delta*=.0033/delta.length
        vertex.co=p+delta;changes[stem].append(delta.length)
    skin.data.update()
    protected=max(((v.co-p).length for v,p in zip(skin.data.vertices,original) if p.z<=.105 or p.z>=.53 or v.index in horn),default=0)
    if protected>1e-8:raise RuntimeError('Lower-limb relief changed a protected hoof or limb root')
    report={'version':'20261026LowerLimbReliefV36','method':'shallow offset carpal and fetlock bosses, dorsal crest and paired palmar tendons; no circumferential joint ring',
        'referenceSourceBoxes':{'Front':[166,520,248,925],'SideFore':[683,520,755,925],'SideHind':[1090,520,1183,925],'Rear':[1290,520,1377,925]},
        'heightRangeM':[.105,.53],'maximumDisplacementLimitM':.0033,'maximumDisplacementM':max((max(values,default=0) for values in changes.values()),default=0),
        'byLeg':{name:{'vertices':len(values),'maximumDisplacementM':max(values,default=0)} for name,values in changes.items()},
        'protectedHoofAndRootDisplacementM':protected,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0}
    scene['DonkeyLowerLimbReliefReport']=json.dumps(report)
    return report
