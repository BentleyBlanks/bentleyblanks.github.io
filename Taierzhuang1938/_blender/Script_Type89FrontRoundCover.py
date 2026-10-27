"""Visible front round cover; calibrated placement, inferred concealed depth."""
import math


def BuildFrontRoundCover(quality,front,targets,settings,armor,shadow,Node,Mesh,Lathe,PolygonPrism,RoundedRectangle,CutOpening,Box,Tube,Rivet):
    x=settings['centreXM'];z=settings['centreZM'];scale=settings['outerRadiusM']/.075;hingeY=settings['faceFrontYM']+.003*scale;hingeZ=z+.089*scale
    cutter=Lathe('RoundBowPortCutter',[(.066*scale,-.12),(.066*scale,.12)],(x,.012,z),armor,front,'Y',40 if quality=='High'else 20);CutOpening(targets,cutter)
    Lathe('RoundBowPortInterior',[(.065*scale,0),(.065*scale,.004)],(x,-.080,z),shadow,front,'Y',32 if quality=='High'else 16)
    cover=Node('Node_BowRoundPortCover',(x,hingeY,hingeZ),front,axis='localX',rangeDegrees=[0,180],roundCoverMetricCertified=False)
    Lathe('BowRoundPort',[(.071*scale,0),(.071*scale,.012*scale)],(0,-.015*scale,-.089*scale),armor,cover,'Y',96 if quality=='High'else 64)
    Lathe('BowRoundPortLip',[(.069*scale,0),(.075*scale,.003*scale),(.075*scale,.012*scale),(.069*scale,.016*scale)],(0,-.014*scale,-.089*scale),armor,cover,'Y',96 if quality=='High'else 64,closeProfile=True)
    vertices=[(0,-.0245*scale,-.089*scale)]
    for i in range(10):
        a=-math.pi/2+i*math.pi/5;r=(.055 if i%2==0 else .025)*scale;vertices.append((r*math.cos(a),-.019*scale,-.089*scale+r*math.sin(a)))
    vertices.extend((a,-.0145*scale,c)for a,b,c in vertices[1:11]);faces=[(0,i+1,(i+1)%10+1)for i in range(10)];faces.extend((i+1,(i+1)%10+1,(i+1)%10+11,i+11)for i in range(10));faces.append(tuple(reversed(range(11,21))))
    star=Mesh('BowCoverInsideStar',vertices,faces,armor,cover);badge=star.data.attributes.new('MuseumBadge','FLOAT','POINT')
    for value in badge.data: value.value=1.0
    PolygonPrism('RoundPortHingeLeaf',RoundedRectangle(.072*scale,.042*scale,.007*scale,3 if quality=='High'else 1),'Y',.013*scale,(0,.0035*scale,-.019*scale),armor,cover,.001*scale if quality=='High'else 0)
    for dx in [-.024,.024]:Rivet((dx*scale,.0123*scale,-.029*scale),(0,1,0),cover,.010*scale)
    # The fixed foot bridges the body surface to the visible bearing. Its
    # hidden thickness is an explicit support reconstruction.
    bearingBack=hingeY+.002*scale;footBack=.015;footDepth=bearingBack-footBack;footY=(bearingBack+footBack)/2
    for dx in [-.023,.023]:Box('RoundPortFixedHingeLeaf',(x+dx*scale,footY,hingeZ+.006*scale),(.021*scale,footDepth,.033*scale),armor,front,.001*scale if quality=='High'else 0)
    for a,b in [(-.036,-.015),(-.014,.014),(.015,.036)]:Tube('RoundPortHingeKnuckle',(x+a*scale,hingeY+.010*scale,hingeZ),(x+b*scale,hingeY+.010*scale,hingeZ),.008*scale,armor,front,12 if quality=='High'else 6)
    return cover
