"""Form the inward sweep at the right-hand rear mudguard's terminal edge."""

import bpy
from mathutils import Vector

from Script_Type94PhotoMaterialsV107 import POINT_ATTRIBUTE


INBOARD_X=.550
OUTBOARD_X=.810
START_Y=-1.145
END_Y=-1.365
INSET_M=.075


def SweepRearRim(asset):
    hull=bpy.data.objects["Geometry_Hull_Paint"]
    if hull not in asset.children_recursive or hull.type!="MESH":
        raise ValueError("The V108 photographic hull is missing")
    mesh=hull.data
    fold=mesh.attributes["Type94RearFoldV108"]
    if fold.domain!="POINT" or fold.data_type!="BOOLEAN":
        raise ValueError("The rear mudguard needs its original V108 point mask")
    shading=mesh.attributes[POINT_ATTRIBUTE]
    before=[sample.vector.copy() for sample in mesh.corner_normals]
    localToWorld=hull.matrix_world.copy()
    worldToLocal=localToWorld.inverted()
    localNormalToWorld=worldToLocal.to_3x3().transposed()
    worldNormalToLocal=localToWorld.to_3x3().transposed()
    spanY=START_Y-END_Y
    width=OUTBOARD_X-INBOARD_X
    changes={}
    maxInset=0.
    for v in mesh.vertices:
        p=localToWorld@v.co
        if not fold.data[v.index].value or p.x<=INBOARD_X or p.y>=START_Y:
            continue
        t=min(1.,(START_Y-p.y)/spanY)
        w=t*t*(3.-2.*t)
        u=(p.x-INBOARD_X)/width
        delta=INSET_M*u*w
        p.x-=delta
        v.co=worldToLocal@p
        shading.data[v.index].vector=v.co
        # The original rounded bevel stays smooth when the terminal rim turns
        # inward. Move its custom normal with the inverse-transpose Jacobian.
        ax=1.-INSET_M*w/width
        by=INSET_M*u*6.*t*(1.-t)/spanY
        changes[v.index]=(ax,by)
        maxInset=max(maxInset,delta)
    if len(changes)<20 or maxInset<.060:
        raise ValueError(f"The V108 terminal rim selection is incomplete ({len(changes)} points, {maxInset} m)")
    normals=[]
    for corner,normal in zip(mesh.loops,before):
        jac=changes.get(corner.vertex_index)
        if jac is not None:
            x,y,z=localNormalToWorld@normal
            x/=jac[0]
            normal=(worldNormalToLocal@Vector((x,y-jac[1]*x,z))).normalized()
        normals.append(tuple(normal))
    mesh.normals_split_custom_set(normals)
    mesh.update()
    return dict(rightRearTaperVertices=len(changes),largestInsetM=maxInset,
                startWorldYM=START_Y,terminalWorldYM=END_Y)
