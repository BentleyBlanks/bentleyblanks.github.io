"""Soft field cap matching the approved Lovart front/side/back turnaround.

Adult 58 cm inner sweatband, with the existing soft outer crown and short visor.
The folded ear cloth is a separate shell. Only its rear has a joining seam.
"""
hx,hy,hz=physical['cap']['position']
capCloth=Material('CommandRoomCapCloth',(.24,.225,.19),.96,'CommandRoomCapCloth')
capBrass=Material('CommandRoomCapBrass',(.38,.265,.095),.43)
capBrass.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.72
capBlue=Material('CommandRoomCapEnamel',(.022,.063,.12),.38)
capWhite=Material('CommandRoomCapIvory',(.73,.72,.65),.52)

def CapRing(a,z,rx=.100,ry=.112):
    # Subtle broad fabric compression; the top remains low and mostly level.
    ripple=.0011*math.sin(3*a+.3)+.0008*math.sin(7*a+z*13)
    return Vector((hx+(rx+ripple)*math.cos(a),hy+(ry+ripple)*math.sin(a),hz+z))

def CapCrown(u,v):
    a=u*math.tau
    z=.008+.095*v+.0024*math.sin(2*a+.2)*v
    inward=.0045*v-.0025*math.sin(math.pi*v)
    p=CapRing(a,z,.100-inward,.112-inward)
    compression=.0035*math.sin(5*a+v*3)*math.sin(math.pi*v)
    p+=Vector((math.cos(a)*compression,math.sin(a)*compression,0))
    return p

def CapFold(u,v):
    a=u*math.tau
    # Folded cloth wraps continuously, a shallow dip at the front shows badge.
    height=.056+.006*math.sin(a)+.0015*math.sin(3*a)
    p=CapRing(a,.006+height*v,.103,.115)
    bulge=.0017*math.sin(math.pi*v)
    p+=Vector((math.cos(a)*bulge,math.sin(a)*bulge,0))
    return p

def CapTop(u,v):
    a=u*math.tau;r=1-v
    p=Vector((hx-.003,hy+.003,hz+.105)).lerp(CapCrown(u,1),r)
    p.z+=.0025*(1-r*r)-.002*math.sin(a*3+.6)*math.sin(math.pi*r)**2
    return p

Shell(Surface('CapSoftCrown',128,30,CapCrown,capCloth,lambda u,v:(u*.67,v*.105)),.0018)
Shell(Surface('CapOvalTop',128,30,CapTop,capCloth,lambda u,v:(.12+.096*(1-v)*math.cos(u*math.tau),.12+.108*(1-v)*math.sin(u*math.tau))),.0016)
Shell(Surface('CapFoldedEarCloth',144,20,CapFold,capCloth,lambda u,v:(u*.69,v*.065)),.0018)

# A real head opening fixes fit independently of loose outer cloth and the visor.
headRatio=physical['cap']['headLengthToWidth']
headRx=physical['cap']['headCircumferenceM']/(math.pi*(3*(headRatio+1)-math.sqrt((3*headRatio+1)*(headRatio+3))))
headRy=headRx*headRatio
def CapInner(u,v):
    a=u*math.tau
    return Vector((hx+(headRx+.001*math.sin(v*math.pi))*math.cos(a),
                   hy+(headRy+.001*math.sin(v*math.pi))*math.sin(a),hz+.006+.022*v))
capSweatband=Shell(Surface('CapInnerSweatband',128,8,CapInner,capCloth,lambda u,v:(u*.58,v*.022),reverse=True),.0015)
Shell(Surface('CapInnerBinding',128,4,lambda u,v:CapInner(u,0).lerp(CapRing(u*math.tau,.008),v),capCloth),.001)
from mathutils.kdtree import KDTree
headTree=KDTree(len(capSweatband.data.vertices))
for vertex in capSweatband.data.vertices:headTree.insert(vertex.co,vertex.index)
headTree.balance()
headFitVertexIds=[headTree.find(CapInner(i/128,0))[1] for i in range(128)]

def CapVisor(u,v):
    a=math.pi*1.055+u*math.pi*.89
    p=CapRing(a,.006,.100,.112)
    extension=.057*math.sin(math.pi*u)**.72
    p+=Vector((math.cos(a)*extension*v*.7,math.sin(a)*extension*v,0))
    p.z-=.014*v*math.sin(math.pi*u)**1.6+.003*math.sin(math.pi*v)
    return p

Shell(Surface('CapShortVisor',100,24,CapVisor,capCloth,lambda u,v:(u*.21,v*.061),reverse=True),.0023)
Curve('CapVisorBinding',[CapVisor(i/128,1) for i in range(129)],.00065,thread)
for v in [.88,.95]:
    Curve('CapVisorStitch',[CapVisor(i/128,v)+Vector((0,0,.00035)) for i in range(129)],.00017,thread)
Curve('CapTopPanelSeam',[CapCrown(i/160,1)+Vector((0,0,.00025)) for i in range(161)],.00037,thread)
for v in [.04,.94]:
    Curve('CapFoldStitch',[CapFold(i/160,v)+Vector((math.cos(i/160*math.tau)*.0009,math.sin(i/160*math.tau)*.0009,0)) for i in range(161)],.00018,thread)
# Back view in approved reference: a single vertical seam, no extra buttons.
Curve('CapRearSeam',[CapFold(.25,i/36)+Vector((0,.0011,0)) for i in range(37)],.00022,thread)
Curve('CapRearCrownSeam',[CapCrown(.25,i/36)+Vector((0,.001,0)) for i in range(37)],.00022,thread)

def CapDisk(name,x,y,z,radius,material):
    ob=Rod(name,(x,y+.001,z),(x,y-.001,z),radius,material,64)
    for poly in ob.data.polygons:poly.use_smooth=len(poly.vertices)==4
    return ob

for z in [.021,.043]:
    center=Vector((hx,hy-.117,hz+z))
    # Two convex brass buttons, no modern plastic four-hole face.
    Surface('CapBrassButton',48,12,lambda u,v,c=center:tuple(c+Vector((.0085*math.sin(v*math.pi/2)*math.cos(u*math.tau),-.0022*math.cos(v*math.pi/2),.0085*math.sin(v*math.pi/2)*math.sin(u*math.tau)))),capBrass)
    Curve('CapButtonHole',[center+Vector((x,-.0002,-.001)) for x in [.006,.009,.013,.016]],.00045,thread)

badge=Vector((hx,hy-.119,hz+.079));r=.016
CapDisk('CapBadgeBrassRim',*badge,r,capBrass)
CapDisk('CapBadgeBlueEnamel',badge.x,badge.y-.0013,badge.z,r*.93,capBlue)
CapDisk('CapBadgeWhiteSun',badge.x,badge.y-.0027,badge.z,r*.43,capWhite)
for i in range(12):
    a=i/12*math.tau
    points=[]
    for radius,angle in [(r*.50,a-.17),(r*.85,a),(r*.50,a+.17)]:
        points.append((badge.x+radius*math.sin(angle),badge.y-.004,badge.z+radius*math.cos(angle)))
    Mesh('CapBadgeSunRay',points,[(0,2,1)],capWhite)

capDimensions={'headCircumferenceM':physical['cap']['headCircumferenceM'],'buttons':2,'badgeRays':12}
