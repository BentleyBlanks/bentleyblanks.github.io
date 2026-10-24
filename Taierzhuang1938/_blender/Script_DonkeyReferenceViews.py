"""Axial-photo visibility in the fitted rest mesh; baked, never view dependent."""
import bpy,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def BuildViewSampler(skin):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    def Weights(point,normal,photo=False):
        power=4 if photo else 2
        values=[abs(normal.x)**4+.03 if photo else (abs(normal.x)+.15)**2,max(0,normal.y)**power,max(0,-normal.y)**power]
        if photo and bpy.context.scene.get('DonkeyMuzzleRevision') and point.y>1.21 and point.z<1.10:
            horizontal=math.hypot(normal.x,normal.y)
            if horizontal>.03:
                values=[(abs(normal.x)/horizontal)**4,(max(0,normal.y)/horizontal)**4,(max(0,-normal.y)/horizontal)**4]
        if bpy.context.scene.get('DonkeyReferenceChestRevision'):
            chest=Smooth(.54,.62,point.y)*(1-Smooth(.86,.98,point.y))*Smooth(.54,.62,point.z)*(1-Smooth(.84,.91,point.z))*(1-Smooth(.16,.22,abs(point.x)))*Smooth(0,.10,normal.y)
            # The breast's downward-facing normals otherwise inherit the
            # constant side-photo floor, including the filled collar area.
            # Keep this anatomical region tied to its frontal source while
            # still performing the same real source-camera occlusion test.
            values=[values[0]*(1-chest),values[1]*(1-chest)+chest,values[2]*(1-chest)]
        directions=(Vector((-1 if point.x<=0 else 1,0,0)),Vector((0,1,0)),Vector((0,-1,0)))
        for i,(weight,direction) in enumerate(zip(values,directions)):
            if weight<1e-8:continue
            hit,_,_,distance=tree.ray_cast(point+direction*2,-direction,2.05)
            if hit is not None and distance<1.996:values[i]=0
        return Vector(values)
    return Weights
