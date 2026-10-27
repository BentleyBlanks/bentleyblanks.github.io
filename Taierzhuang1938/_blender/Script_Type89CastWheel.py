"""Continuous cast relief for the large Type89 wheel flanges.

The native Tsuchiura photographs show rounded rib roots rather than separate
bars laid on a dished disc. Rib/notch counts are inherited working parameters,
not a claim that the obscured circumference has been historically verified.
"""
import math


def BuildCastWheelFlange(quality, parent, radius, discSign, pitchRadius, armor, Mesh, driven=False,notchCount=18,ribbed=True,ribCount=8):
    innerCount=36 if quality=='High' else 24
    outerCount=288 if quality=='High' else 144
    rimMax=pitchRadius-.006 if driven else radius
    rimMin=radius*.91 if not driven else min(radius,rimMax-.027)
    sections=[(.035,-.020,innerCount,False,False),
              (.70*radius,-.020,innerCount,False,False),
              (rimMax,-.020,outerCount,True,False),
              (rimMax,.020,outerCount,True,False)]
    sections.extend((fraction*radius,0,outerCount,False,True)
                    for fraction in [.82,.75,.65,.50,.35,.24,.18])
    sections.append((.035,.020,outerCount,False,True))
    vertices=[];rings=[];faces=[]

    def Front(r,angle):
        if r>=.82*radius:base=.020
        elif r>=.24*radius:base=.005+.015*(r/radius-.24)/.58
        else:base=.020-.015*max(0,min(1,(r-.035)/(.24*radius-.035)))
        if not ribbed:return base
        fraction=max(0,min(1,(r/radius-.24)/.58))
        halfWidth=(.020+fraction*.025) if driven else (.014+fraction*.016)
        ribStep=2*math.pi/ribCount
        delta=((angle-.12+ribStep/2)%ribStep)-ribStep/2
        q=min(1,abs(r*math.sin(delta))/halfWidth)
        relief=(1+math.cos(math.pi*q))/2
        return base+(.020-base)*relief

    for r,offset,count,wave,front in sections:
        ring=[]
        for i in range(count):
            angle=2*math.pi*i/count
            # A tooth crown faces the shoe's open window at the rear rest
            # station. Odd candidate counts otherwise put that crown beneath
            # the solid pin web; even18 keeps its previous phase exactly.
            rr=rimMin+(rimMax-rimMin)*(.5+.5*math.cos(notchCount*(angle-math.pi))) if wave else r
            x=Front(rr,angle) if front else offset
            ring.append(len(vertices))
            vertices.append((discSign*(.057+x),math.cos(angle)*rr,math.sin(angle)*rr))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]+rings[:1]):
        if len(a)==len(b):
            for i in range(len(a)):
                faces.append((a[i],a[(i+1)%len(a)],b[(i+1)%len(b)],b[i]))
        else:
            small,large=(a,b) if len(a)<len(b) else (b,a)
            reverse=len(a)>len(b);ratio=len(large)//len(small)
            assert ratio*len(small)==len(large)
            for i in range(len(small)):
                for j in range(ratio):
                    face=(small[i],large[(i*ratio+j)%len(large)],large[(i*ratio+j+1)%len(large)])
                    faces.append(tuple(reversed(face)) if reverse else face)
                face=(small[i],large[((i+1)*ratio)%len(large)],small[(i+1)%len(small)])
                faces.append(tuple(reversed(face)) if reverse else face)
    obj=Mesh('ContinuousCastWheelWeb',vertices,faces,armor,parent,smooth=True)
    cast=obj.data.attributes.new('SurfaceCastWheel','FLOAT','POINT')
    for value in cast.data:value.value=1.0
    obj['reconstructionEvidence']='Native17/2007 left exterior ribs; Native20 left inboard and Native17 far-wheel inboard are smooth. Opposite exterior symmetry and exact rib/notch counts remain provisional.'
    return obj
