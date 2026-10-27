"""Visible paired rear-turret cover, without an invented opening mechanism.

The two closed leaves, centre strip and four exterior hinges are photographed.
Metric dimensions, small fixing counts and the tangent mounting frame remain
reconstruction parameters. No hidden opening or factory articulation is claimed.
"""
import math


def BuildRearTurretCover(quality,owner,settings,armor,Node,Box,PolygonPrism,RoundedRectangle,Tube,Rivet,CutOpening):
    surface=Node('Node_TurretRearCoverSurface',parent=owner,
                 reconstruction='Tangent frame of the retained conical shell; no historical hidden part')
    surface.rotation_euler=(settings['surfaceTiltRadians'],0,settings['surfaceYawRadians'])
    width=settings['widthM'];height=settings['heightM'];gap=settings['centreGapM'];depth=settings['plateThicknessM']
    leafWidth=(width-gap)/2
    for side,label in [(-1,'Left'),(1,'Right')]:
        centreX=side*(gap/2+leafWidth/2)
        leaf=PolygonPrism('RearTurretCover'+label,
                     RoundedRectangle(leafWidth,height,settings['cornerRadiusM'],4 if quality=='High'else 2),
                     'Y',depth,(centreX,-.012+depth/2,0),armor,surface,0)
        if side<0:
            oval=settings['leftLeafSmallOval'];count=32 if quality=='High'else 20
            outline=[(oval['widthM']/2*math.cos(2*math.pi*i/count),oval['heightM']/2*math.sin(2*math.pi*i/count))for i in range(count)]
            cutter=PolygonPrism('RearTurretCoverLeftOvalCutter',outline,'Y',.060,(oval['xM'],-.010,oval['zM']),armor,surface,0)
            CutOpening([leaf],cutter)
        for z in settings['hingeStationsZM']:
            pinX=side*(width/2+.001)
            inreach=settings['hingeStrapInreachM']
            Box('RearTurretCoverHingeStrap',(pinX-side*inreach,-.017,z),(settings['hingeStrapWidthM'],.006,settings['hingeStrapHeightM']),armor,surface,.001)
            half=settings['hingeKnuckleLengthM']/2
            for dz in [-settings['hingeKnuckleStepM'],0,settings['hingeKnuckleStepM']]:
                Tube('RearTurretCoverHingeKnuckle',(pinX,-.018,z+dz-half),(pinX,-.018,z+dz+half),settings['hingeKnuckleRadiusM'],armor,surface,count=16 if quality=='High'else 8)
            for dx in [-settings['hingeFixingDxM'],settings['hingeFixingDxM']]:
                for dz in [-settings['hingeFixingDzM'],settings['hingeFixingDzM']]:
                    Rivet((pinX-side*inreach+dx,-.0202,z+dz),(0,-1,0),surface,settings['hingeFixingRadiusM'],armor)
    Box('RearTurretCoverCentreStrip',(0,-.015,0),(settings['centreStripWidthM'],.006,height+.002),armor,surface,.0008)
    for z in [.070,-.010]:Rivet((0,-.0183,z),(0,-1,0),surface,.0055,armor)
    Rivet((.028,-.0123,-.064),(0,-1,0),surface,.0045,armor)
    owner['pairedClosedCoverObserved']=True
    owner['rearCoverFunction']='Unverified; closed exterior reconstruction only'
    owner['rearCoverMetricCertified']=False
    owner['rearCoverOpeningDemonstrated']=False
    return surface
