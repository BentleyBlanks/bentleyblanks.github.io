"""Reference-bound slat face and continuously sampled folded metal shroud.

Visible crease positions use the declared conditional camera study. Gauge,
hidden backing, frame clearances and catch construction remain inferred.
"""
import math
import numpy as np
from mathutils import Matrix,Vector


def Skin(api,owner,front,rear,gauge,segments):
    # Open profile D -> bend -> foot -> inner foot -> hood root -> A wraps
    # around the real slat opening. Subdivision represents the measured twist
    # smoothly, avoiding a single nonplanar quad's arbitrary diagonal.
    profileCount=4*(len(front)-1)+1
    def Profile(points):
        return [points[i].lerp(points[i+1],j/4)for i in range(len(points)-1)for j in range(4)]+[points[-1]]
    a=Profile(front);b=Profile(rear);vertices=[]
    for side in [1,-1]:
        for u in range(segments+1):
            t=u/segments;row=[x.lerp(y,t)for x,y in zip(a,b)]
            for v,p in enumerate(row):
                along=b[v]-a[v]
                before=(row[v]-row[v-1]).cross(along).normalized()if v else None
                after=(row[v+1]-row[v]).cross(along).normalized()if v+1<len(row)else None
                n=before or after
                if before is not None and after is not None:
                    n=(before+after).normalized();n/=max(.20,n.dot(before))
                vertices.append(p+n*(side*gauge/2))
    n=(segments+1)*profileCount;faces=[]
    for u in range(segments):
        for v in range(profileCount-1):
            i=u*profileCount+v;face=(i,i+1,i+profileCount+1,i+profileCount)
            faces.append(face);faces.append(tuple(j+n for j in reversed(face)))
    for u in range(segments):
        for v in [0,profileCount-1]:
            i=u*profileCount+v;j=i+profileCount;faces.append((i,j,j+n,i+n))
    for u in [0,segments]:
        for v in range(profileCount-1):
            i=u*profileCount+v;j=i+1;faces.append((i,i+n,j+n,j))
    obj=api['Mesh']('Vent_ContinuousFoldedSkin',vertices,faces,parent=owner)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    # The large back/floor corners remain sharp; the shallow apron bend has
    # continuous shading, consistent with a pressed/rolled thin sheet.
    for edge in obj.data.edges:
        x,y=edge.vertices
        if x//profileCount!=y//profileCount and x%profileCount==y%profileCount:
            v=x%profileCount
            if v in [8,12,16]:edge.use_edge_sharp=True
    return obj


def BuildVent(api,layout):
    owner=api['Empty']('VentHousing',parent=api['PARTS']['Hull'])
    points={name:Vector(value)for name,value in layout['pointsBeforeGroundM'].items()}
    a,b,c,d=[points['Face'+name]for name in 'ABCD']
    frontRoot=points['RootFront'];rearRoot=points['RootRear']
    frontBend=points['BendFront'];rearBend=points['BendRear'];frontFoot=points['FootFront'];rearFoot=points['FootRear']
    frontInner=points['InnerFootFront'];rearInner=points['InnerFootRear'];gauge=layout['sheetGaugeM']
    front=[d,frontBend,frontFoot,frontInner,frontRoot,a]
    rear=[c,rearBend,rearFoot,rearInner,rearRoot,b]
    Skin(api,owner,front,rear,gauge,layout['longitudinalSegments'])
    for label,profile in [('Front',front),('Rear',rear)]:
        api['Plate']('Vent_EndWall'+label,profile,gauge,parent=owner,bevel=.0004)
    normal=(b-a).cross(d-a).normalized()
    if normal.x>0:normal=-normal
    def Face(t,h):return a.lerp(b,t).lerp(d.lerp(c,t),h)
    intervals=layout['railIntervals']
    for index,(lo,hi)in enumerate(intervals):
        api['Plate']('Vent_LouverRail'+str(index),[Face(0,lo),Face(0,hi),Face(1,hi),Face(1,lo)],layout['railDepthM'],parent=owner,bevel=.0004)
    backing=[Face(t,h)-normal*layout['recessDepthM']for t,h in [(0,0),(1,0),(1,1),(0,1)]]
    api['Plate']('Vent_RecessedInterior',backing,.003,'Dark',owner,bevel=.0003)
    def Hood(t,f):return frontRoot.lerp(rearRoot,t).lerp(a.lerp(b,t),f)
    hoodNormal=(a-frontRoot).cross(rearRoot-frontRoot).normalized()
    if hoodNormal.z<0:hoodNormal=-hoodNormal
    lap=layout['lapOffsetM'];sheet=layout['lapGaugeM'];end=layout['lapEndFraction']
    api['Plate']('Vent_TopRearLap',[Hood(t,f)+hoodNormal*lap for t,f in [(0,0),(0,end),(1,end),(1,0)]],sheet,parent=owner,bevel=.0004)
    pinAxis=(b-a).normalized();matrix=Matrix(((0,0,0),(0,0,0),(0,0,0)))
    xAxis=hoodNormal.cross(pinAxis).normalized();zAxis=xAxis.cross(pinAxis).normalized()
    if zAxis.dot(hoodNormal)<0:xAxis=-xAxis;zAxis=-zAxis
    rotation=Matrix((xAxis,pinAxis,zAxis)).transposed().to_4x4()
    feet=[]
    for index,t in enumerate(layout['catchFractions']):
        centre=Hood(t,.10)+hoodNormal*(lap+.013)
        pin=api['Cylinder']('Vent_TopCatchPin'+str(index),(0,0,0),.010,.055,axis='Y',parent=owner,vertices=24)
        pin.matrix_basis=Matrix.Translation(centre)@rotation
        for offset in [-.019,.019]:
            collar=api['Cylinder']('Vent_CatchPinCollar'+str(index),(0,0,0),.012,.008,axis='Y',parent=owner,vertices=24)
            collar.matrix_basis=Matrix.Translation(centre+pinAxis*offset)@rotation
        offset=lap+sheet/2+.0025+.0004
        api['Plate']('Vent_TopCatchStrap'+str(index),[Hood(tt,f)+hoodNormal*offset for tt,f in [(t-.022,.06),(t-.022,.46),(t+.022,.46),(t+.022,.06)]],.005,parent=owner,bevel=.0005)
        foot=Hood(t,.42)+hoodNormal*(offset+.0025);api['Rivet']('Vent_CatchFoot'+str(index),foot,hoodNormal,.006,owner);feet.extend(foot)
    owner['VentReferenceLayout']=layout['filename'];owner['VentShapeAccepted']=False;owner['VentSlotFrameRequired']=True
    owner['VentFaceCornersBeforeGroundM']=[value for p in [a,b,c,d]for value in p]
    owner['VentFaceOutwardNormalBeforeGroundM']=list(normal);owner['VentRailIntervals']=[v for pair in intervals for v in pair]
    owner['VentRecessDepthM']=layout['recessDepthM'];owner['VentSheetGaugeInferred']=True
    owner['TopLapRequired']=True;owner['TopLapLayout']=layout['filename'];owner['TopLapNormal']=list(hoodNormal)
    owner['TopLapOffsetM']=lap;owner['TopLapSheetThicknessM']=sheet;owner['TopLapClosedGapM']=lap-gauge/2-sheet/2;owner['TopLapIsFourthThroughSlot']=False
    owner['TopLapProbeBasePointsM']=[value for f,t in [(end-.03,.18),(end-.03,.82),(end+.03,.18),(end+.03,.82)]for value in Hood(t,f)]
    owner['CatchFootCentersM']=feet;owner['CatchStrapOffsetM']=lap+sheet/2+.0025+.0004;owner['CatchStrapThicknessM']=.005
    owner['ReferenceBasis']='Reviewed four-view slat creases and apron support lines; conditional camera family'
    owner['Unverified']='Hidden backing, sheet gauge, root attachment, catch sections and inferred engine-side transition; no surveyed dimensions or catch animation'
    return owner
