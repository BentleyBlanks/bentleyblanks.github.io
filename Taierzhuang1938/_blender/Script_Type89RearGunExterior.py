"""Local rear-gun exterior builder; callers retain the established aiming rig."""
import json,math
from pathlib import Path

def BuildRearGunExterior(quality,fixedMount,aimingCarrier,armor,steel,PolygonPrism,Lathe,CutOpening):
    file=Path(__file__).resolve().parents[1]/'Model/Type89MediumTank/Data_RearGunExterior.json'
    data=json.loads(file.read_text(encoding='utf8'))
    foot=PolygonPrism('TurretMgLowerMountFoot',data['footOutlineLocalXzM'],'Y',data['footThicknessM'],(0,data['footCentreLocalY'],0),armor,fixedMount,.001)
    for x in data['slotCentresLocalX']:
        outline=[]
        for z,start in [(data['slotCentreLocalZ']+data['slotStraightHalfLengthM'],0),(data['slotCentreLocalZ']-data['slotStraightHalfLengthM'],math.pi)]:
            for i in range(9):
                angle=start+i*math.pi/8
                outline.append((x+data['slotRadiusM']*math.cos(angle),z+data['slotRadiusM']*math.sin(angle)))
        cutter=PolygonPrism('TurretMgFootSlotCutter',outline,'Y',.03,(0,data['footCentreLocalY'],0),armor,fixedMount,0)
        CutOpening([foot],cutter)
    sheath=Lathe('TurretMgTaperedSheath',data['sheathProfileRadiusAxisM'],(0,0,0),steel,aimingCarrier,'Y',64 if quality=='High' else 32)
    fixedMount['exteriorEvidence']='Dark taper corroborated in2007photo34/2025photo19; lower foot visible in19; metric dimensions/slot identity/global fit remain inferred'
    return {'foot':foot,'sheath':sheath}
