"""Reference-led alar recess, orbital ridge and continuous throat fairing."""
import bpy,math
from mathutils import Vector

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def RefineReferenceFace(skin,rig):
    inverse=rig.matrix_world.inverted();original=[v.co.copy() for v in skin.data.vertices]
    eye=bpy.data.objects['DonkeyEyeLeft'];matrix=inverse@eye.matrix_world
    eyeCentre=sum((matrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices)
    eyeCentre.x=abs(eyeCentre.x)
    for vertex in skin.data.vertices:
        p=vertex.co;x,y,z=p
        crown=(1-Smooth(0,.085,abs(x)))*(1-Smooth(.015,.070,abs(y-1.125)))*Smooth(1.21,1.275,z)
        p.z+=.020*crown
        # The side photograph places the alar hollow behind the nasal tip.
        # A lateral recess changes side depth while retaining frontal width.
        lateral=Smooth(.020,.050,abs(x))*(1-Smooth(.080,.105,abs(x)))
        nasal=lateral*Smooth(1.235,1.285,y)*math.exp(-((z-.944)/.071)**4)
        p.y-=.016*nasal
        sign=-1 if x<0 else 1;centre=Vector((sign*eyeCentre.x,eyeCentre.y,eyeCentre.z))
        normal=Vector((sign*.78,.62,.03)).normalized();axis=Vector((0,0,1)).cross(normal).normalized();up=normal.cross(axis).normalized()
        delta=Vector((x,y,z))-centre;du=delta.dot(axis);dv=delta.dot(up);depth=delta.dot(normal)
        if abs(depth)<.045 and abs(du)<.075 and abs(dv)<.075:
            posterior=-sign*du
            brow=.0038*math.exp(-(du/.043)**4-((dv-.021-.12*posterior)/.010)**2)
            orbital=-.0018*math.exp(-(du/.035)**4-((dv+.018)/.014)**2)
            p+=normal*(brow+orbital)*(1-Smooth(.025,.045,abs(depth)))
    # Relax the old neck/head junction on its own connected surface, retaining
    # the mouth and the measured lower jaw silhouette outside the falloff.
    adjacency=[set() for _ in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    for iteration in range(10):
        points=[v.co.copy() for v in skin.data.vertices]
        for vertex,p in zip(skin.data.vertices,points):
            x,y,z=p
            weight=Smooth(.995,1.035,y)*(1-Smooth(1.12,1.155,y))*Smooth(.925,.965,z)*(1-Smooth(1.065,1.105,z))
            if weight<.001 or not adjacency[vertex.index]:continue
            mean=sum((points[i] for i in adjacency[vertex.index]),Vector())/len(adjacency[vertex.index])
            change=(mean-p)*(.22*weight)
            if change.length>.001:change*=.001/change.length
            vertex.co=p+change
    skin.data.update()
    return {'method':'lateral alar recess, rounded interaural crown, subtle supraorbital ridge and connected throat junction fairing',
            'alarRecessM':.016,'maxCrownRaiseM':.020,'maxOrbitalReliefM':.0038,'maxDisplacementM':max((v.co-p).length for v,p in zip(skin.data.vertices,original))}
