"""Visible small left-shell aperture; function and unseen internals unverified."""
import math


def BuildTurretSmallAperture(quality,turret,shell,settings,armor,shadow,PlanPoint,PolygonPrism,CutOpening):
    entry=settings['leftSmallAperture'];group=next(g for g in settings['groups']if g['name']=='RearStiffenerPair')
    angle=group['angleRadians']+entry['angleOffsetFromRearGroup'];z=group['rowZ'][entry['rowIndexFromBottom']];centre=PlanPoint(angle,z)
    count=48 if quality=='High'else 32
    outline=[(entry['widthYM']/2*math.cos(2*math.pi*i/count),entry['heightSourceZM']/2*math.sin(2*math.pi*i/count))for i in range(count)]
    # Cutter uses the wall's Armor role. Boolean reveal faces must retain
    # painted steel, rather than inheriting the dark interior material.
    cutter=PolygonPrism('TurretLeftSmallApertureCutter',outline,'X',entry['boreDepthXM'],centre,armor,turret,0)
    CutOpening([shell],cutter)
    # The actual external hole is observed. A dark back at an explicitly
    # inferred depth avoids inventing the unphotographed turret interior.
    PolygonPrism('TurretLeftSmallApertureInterior',outline,'X',.003,(centre[0]+entry['interiorBackOffsetXM'],centre[1],centre[2]),shadow,turret,0)
    turret['leftSmallApertureObserved']=True
    turret['leftSmallApertureFunction']='Unverified; no pistol/vision function asserted'
    turret['leftSmallApertureStudy']={'angle':angle,'sourceZ':z,'widthYM':entry['widthYM'],'heightSourceZM':entry['heightSourceZM'],'interiorDepthInferred':True}
