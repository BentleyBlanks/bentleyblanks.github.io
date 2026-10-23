"""Axial-photo visibility in the fitted rest mesh; baked, never view dependent."""
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def BuildViewSampler(skin):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    def Weights(point,normal,photo=False):
        power=4 if photo else 2
        values=[abs(normal.x)**4+.03 if photo else (abs(normal.x)+.15)**2,max(0,normal.y)**power,max(0,-normal.y)**power]
        directions=(Vector((-1 if point.x<=0 else 1,0,0)),Vector((0,1,0)),Vector((0,-1,0)))
        for i,(weight,direction) in enumerate(zip(values,directions)):
            if weight<1e-8:continue
            hit,_,_,distance=tree.ray_cast(point+direction*2,-direction,2.05)
            if hit is not None and distance<1.996:values[i]=0
        return Vector(values)
    return Weights
