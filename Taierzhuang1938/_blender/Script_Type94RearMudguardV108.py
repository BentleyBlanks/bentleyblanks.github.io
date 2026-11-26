"""Short turned-down rear mudguards on the photographed Type 94."""

import math

import bpy
from mathutils import Vector

from Script_Type94PhotoGeometryV107 import AddMesh, BeveledMesh, Bounds, DeleteVertices, MeshComponents, MeshFromFaces
from Script_Type94PhotoMaterialsV107 import CONTACT_ATTRIBUTE, POINT_ATTRIBUTE


# Blender world coordinates, in metres. The long flange joins V107 at -.690
# and at the existing fastener station near -1.08. The last 85 mm forms the
# turned-down end visible in official views 3, 4 and 6. Its exact length and
# curvature are estimates because the three views disagree on absolute depth.
REAR_PROFILE = (
    (-1.370, .622, 1.92),
    (-1.335, .675, 1.05),
    (-1.285, .715, .60),
    (-1.205, .751, .30),
    (-1.125, .782, .16),
    (-1.080, .787, .00),
    (-.690, .7873, .00),
)


def Stations(high):
    stations = []
    for i, (ya, za, ma) in enumerate(REAR_PROFILE[:-1]):
        yb, zb, mb = REAR_PROFILE[i + 1]
        intervals = (14 if i < 4 else 8) if high else (5 if i < 4 else 3)
        length = yb - ya
        for j in range(intervals):
            t = j / intervals
            t2,t3 = t*t,t*t*t
            z = (2*t3-3*t2+1)*za+(t3-2*t2+t)*length*ma+(-2*t3+3*t2)*zb+(t3-t2)*length*mb
            slope = ((6*t2-6*t)*(za-zb)+(3*t2-4*t+1)*length*ma+(3*t2-2*t)*length*mb)/length
            stations.append((ya+t*length,z,slope))
    stations.append(REAR_PROFILE[-1])
    return stations


def CreateRearMudguard(owner,side,high,material):
    outline = Stations(high)
    vertices = []
    for y,z,slope in outline:
        thicknessAxis = Vector((0,-slope,1)).normalized()
        flange = max(.40,min(1,(-.690-y)/.12))
        if high:
            section = [
                (.550,0),(.682,.0016),(.801,0),(.806,-.0006),(.809,-.002*flange),
                (.810,-.0032*flange),(.809,-.0055),(.804,-.006),(.550,-.006),
            ]
        else:
            section = [(.550,0),(.682,.0016),(.803,0),(.810,-.0032*flange),(.805,-.006),(.550,-.006)]
        vertices.extend(tuple(Vector((side*x,y,z))+thicknessAxis*depth) for x,depth in section)
    width = len(section)
    faces = [tuple(reversed(range(width)))]
    for i in range(len(outline)-1):
        for j in range(width):
            first = i*width+j
            second = i*width+(j+1)%width
            faces.append((first,second,second+width,first+width))
    faces.append(tuple(range(len(vertices)-width,len(vertices))))
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    name=f"RearMudguard{'Port' if side<0 else 'Starboard'}V108"
    mesh=MeshFromFaces(name,vertices,faces,material,high)
    if high:
        mesh=BeveledMesh(mesh,.0009,3)
    local=owner.matrix_world.inverted()
    point=mesh.attributes.new(POINT_ATTRIBUTE,"FLOAT_VECTOR","POINT")
    contact=mesh.attributes.new(CONTACT_ATTRIBUTE,"FLOAT","POINT")
    line=mesh.attributes.new("Type94RearFoldV108","BOOLEAN","POINT")
    for i,vertex in enumerate(mesh.vertices):
        point.data[i].vector=local@vertex.co
        onEdge=abs(vertex.co.x)>.806 or vertex.co.y<-1.360
        contact.data[i].value=.16 if onEdge else 0.
        line.data[i].value=True
    return mesh


def ReplaceRearMudguards(asset,high):
    owner=bpy.data.objects["Geometry_Hull_Paint"]
    if owner not in asset.children_recursive:
        raise ValueError("The Type 94 high source is missing its painted hull")
    material=next(m for m in owner.data.materials if m.get("Type94PhotoSurface")=="Sheet")
    old=[]
    for group in MeshComponents(owner.data):
        x,y,z=Bounds(owner,group)
        if .256<x[1]-x[0]<.263 and max(abs(x[0]),abs(x[1]))>.808 and y[1]<-.689 and .717<z[0]<.785:
            old.append(group)
    if len(old)!=4:
        raise ValueError(f"Expected four old tail sheets, found {len(old)}")
    DeleteVertices(owner.data,{i for group in old for i in group})
    for side in [-1,1]:
        AddMesh(owner,CreateRearMudguard(owner,side,high,material),coordinatesAreWorld=True)
    return len(old)
