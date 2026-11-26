"""Compact rounded exterior profiles for the inspection prop."""
import math

import bmesh
import bpy
import numpy as np


def FinishProfile(name, points, normals, faces, wear):
    mesh = bpy.data.meshes.new(name+' fine returns')
    mesh.from_pydata((np.asarray(points)*1000).tolist(), [], faces)
    mesh.update()
    edit = bmesh.new()
    try:
        edit.from_mesh(mesh)
        rounded = edit.faces.layers.float.new('rounded')
        for face, weight in zip(edit.faces, wear):
            face[rounded] = weight
            face.smooth = True
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
        bmesh.ops.triangulate(edit, faces=list(edit.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
        edit.to_mesh(mesh)
    finally:
        edit.free()
    mesh.update()
    assert len(mesh.vertices)==len(normals), name
    mesh.normals_split_custom_set_from_vertices(np.asarray(normals).tolist())
    print(name,len(mesh.polygons),'triangles in rounded profile')
    return mesh


def ConvexOutline(points):
    def Half(sequence):
        hull = []
        for point in sequence:
            while len(hull)>1:
                a,b = hull[-2],hull[-1]
                turn = (b[0]-a[0])*(point[1]-b[1])-(b[1]-a[1])*(point[0]-b[0])
                if turn>1e-12:
                    break
                hull.pop()
            hull.append(point)
        return hull
    values = np.unique(np.round(points,7),axis=0).tolist()
    return np.asarray(Half(values)[:-1]+Half(values[::-1])[:-1])


def RoundedPlate(name, points, axis, radius):
    # The former top and bottom faces set the levels of the new outer rounds.
    first,second = (i for i in range(3) if i!=axis)
    outline = ConvexOutline(points[:,[first,second]])
    relative = points[:,[first,second]]-outline.mean(axis=0)
    levels = points[:,axis]
    edges = np.roll(outline,-1,axis=0)-outline
    edges /= np.linalg.norm(edges,axis=1)[:,None]
    outside = np.column_stack((edges[:,1],-edges[:,0]))
    bisector = outside+np.roll(outside,1,axis=0)
    offset = bisector/np.einsum('ij,ij->i',bisector,outside)[:,None]
    direction = bisector/np.linalg.norm(bisector,axis=1)[:,None]
    vertices,normals = [],[]
    count = len(outline)
    faces,wear = [],[]
    for side in (-1.,1.):
        threshold = levels.min()+.00025 if side<0 else levels.max()-.00024
        mask = levels<=threshold if side<0 else levels>=threshold
        slope,_,_,_ = np.linalg.lstsq(np.column_stack((relative[mask],np.ones(np.count_nonzero(mask)))),
                                    levels[mask],rcond=None)
        cap = np.zeros(3)
        cap[axis]=side
        cap[[first,second]]=-side*slope[:2]
        cap /= np.linalg.norm(cap)
        angles = np.linspace(0.,math.pi/2,4)
        if side>0:
            angles = angles[::-1]
        for angle in angles:
            ring = outline-radius*(1.-math.sin(angle))*offset
            vertex = np.empty((count,3))
            vertex[:,[first,second]]=ring
            vertex[:,axis] = (ring-outline.mean(axis=0)) @ slope[:2] + slope[2]-side*radius*(1.-math.cos(angle))
            normal = np.broadcast_to(cap*math.cos(angle),(count,3)).copy()
            normal[:,[first,second]] += direction*math.sin(angle)
            normals.extend(normal/np.linalg.norm(normal,axis=1)[:,None])
            vertices.extend(vertex)
    for row in range(7):
        start=row*count
        for i in range(count):
            following=(i+1)%count
            faces.append((start+i,start+following,start+following+count,start+i+count))
            wear.append(.30 if row==3 else .91)
    faces.extend((tuple(range(count)),tuple(range(7*count,8*count))))
    wear.extend((0.,0.))
    return FinishProfile(name,vertices,normals,faces,wear)


def RoundedAxialCap(name, points, radius):
    centre = .5*(points[:,:2].min(axis=0)+points[:,:2].max(axis=0))
    radial = np.linalg.norm(points[:,:2]-centre,axis=1)
    contour = np.unique(np.round(np.column_stack((points[:,2],radial)),6),axis=0)
    end = contour[:,0]==contour[:,0].max()
    contour = np.concatenate((contour[~end],contour[end][::-1])).astype(np.float64)
    stations=[]
    for i,point in enumerate(contour):
        if i==0 or i==len(contour)-1:
            heading = contour[1]-point if i==0 else point-contour[i-1]
            stations.append((point,heading,0.))
            continue
        before,after = point-contour[i-1],contour[i+1]-point
        first,last = before/np.linalg.norm(before),after/np.linalg.norm(after)
        exposed = point[0]>-.0766 if name=='RearSmallCover' else point[0]>-.077
        if not exposed or np.dot(first,last)>.95:
            stations.append((point,first+last,0.))
            continue
        approach=min(radius,.36*np.linalg.norm(before),.36*np.linalg.norm(after))
        a,b=point-first*approach,point+last*approach
        for t in (0.,.5,1.):
            arc=(1.-t)**2*a+2.*(1.-t)*t*point+t*t*b
            tangent=(1.-t)*first+t*last
            stations.append((arc,tangent,.87))

    count=36
    angle=np.arange(count)*2.*math.pi/count
    rays=np.column_stack((np.cos(angle),np.sin(angle)))
    vertices,normals,rows=[],[],[]
    for (z,r), heading, _ in stations:
        tangent=heading/np.linalg.norm(heading)
        sides=rays if r>1e-8 else rays[:1]
        rows.append(list(range(len(vertices),len(vertices)+len(sides))))
        vertices.extend(np.column_stack((centre+r*sides,np.full(len(sides),z))))
        normals.extend(np.column_stack((tangent[0]*sides,np.full(len(sides),-tangent[1]))))
    faces, wear=[],[]
    for i,(a,b) in enumerate(zip(rows,rows[1:])):
        for j in range(count):
            k=(j+1)%count
            if len(a)==1:
                faces.append((a[0],b[j],b[k]))
            elif len(b)==1:
                faces.append((a[j],b[0],a[k]))
            else:
                faces.append((a[j],b[j],b[k],a[k]))
            wear.append(min(stations[i][2],stations[i+1][2]))
    return FinishProfile(name,vertices,normals,faces,wear)
