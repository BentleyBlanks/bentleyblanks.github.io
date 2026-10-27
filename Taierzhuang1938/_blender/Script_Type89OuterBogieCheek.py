"""Independently observed outer three-lobe cheeks on the two vehicle sides."""
import math


def BuildOuterBogieCheeks(quality,side,parent,settings,armor,Node,PolygonPrism,Lathe,HexBolt):
    data=settings['outerBogieCheeks'];steps=18 if quality=='High'else 6;label='Left'if side<0 else'Right'
    fields=data.get('leftFixingCentresYZ'if side<0 else'rightFixingCentresYZ',[]);absX=data['absX']if side<0 else data['rightAbsX']
    for unitIndex,fixings in enumerate(fields):
        node=Node('Node_OuterBogieCheek%s%02d'%(label,unitIndex+1),parent=parent,geometryRole='observed '+label.lower()+' outer running-gear cheek',constructionEvidence='Left: native2007; Right: same-car Aoba7500. Three exposed lobes/round fixing fields observed independently; camera-conditioned metric layout, hidden depth/top and small head count remain reconstruction')
        leading,trailing=fixings[0],fixings[-1]
        outline=[(leading[0]+.100,data['hiddenTopZ']),(trailing[0]-.100,data['hiddenTopZ']),(trailing[0]-.085,trailing[1]+.030)]
        reverse=list(reversed(fixings))
        previousRadius=None
        for i,(y,z)in enumerate(reverse):
            ry=.090 if i==1 else .075;rz=.057 if i==1 else .047
            if i:
                # A tangent bridge reproduces the shallow cast transition.
                # Joining full semicircles with one middle point made a
                # pointed notch between lobes, absent from the native photo.
                a=outline[-1];d=(y-ry*math.sqrt(3)/2,z-rz/2)
                handle=min((d[0]-a[0])/3,data.get('bridgeHandleM',.012));assert handle>0
                oldRy,oldRz=previousRadius
                b=(a[0]+handle,a[1]+handle*math.sqrt(3)*oldRz/oldRy)
                c=(d[0]-handle,d[1]+handle*math.sqrt(3)*rz/ry)
                bridgeSteps=12 if quality=='High'else 4
                for j in range(1,bridgeSteps+1):
                    t=j/bridgeSteps;outline.append(tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k]for k in [0,1]))
            for j in range(steps+1):
                if i and j==0:continue
                theta=-5*math.pi/6+2*math.pi*j/(3*steps);outline.append((y+ry*math.cos(theta),z+rz*math.sin(theta)))
            previousRadius=(ry,rz)
        outline.append((leading[0]+.085,leading[1]+.030))
        PolygonPrism('OuterBogieThreeLobeCheek',outline,'X',data['thicknessM'],(side*absX,0,0),armor,node,.0012 if quality=='High'else 0)
        faceX=side*(absX+data['thicknessM']/2)
        for y,z in fixings:
            profile=[(.013,0),(.013,.002),(.009,.003),(.006,.003),(.006,.001),(.002,.001)]if quality=='High'else[(.013,0),(.013,.002)]
            Lathe('OuterCheekCircularFixing',[(r,side*offset)for r,offset in profile],(faceX,y,z),armor,node,'X',24 if quality=='High'else 12)
            if quality=='High':
                for i in range(data['smallHeadsPerFieldWorking']):
                    theta=2*math.pi*i/data['smallHeadsPerFieldWorking']
                    HexBolt((faceX+side*.0004,y+.027*math.cos(theta),z+.027*math.sin(theta)),(side,0,0),node,.0035,.0022)
        node['sideSpecificReference']=True
        node['smallHeadCountFactoryVerified']=False
