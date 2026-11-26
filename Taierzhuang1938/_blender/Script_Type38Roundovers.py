"""Round exposed edges in the Type38 game mesh, retaining the authored UV charts."""
import hashlib
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np


BASE_REVISION = '3ae0fe2e9ffb3231112a4cfed0f7c911bdf7289d'
BASE_SHA = 'b64236d8c8c156bfdddc9140820665763c7cde05566e31490e53d608ae63de65'
ASSET = 'Taierzhuang1938/Model/Type38_511/Model_Type38_511.glb'
# Bevel settings for the visible game shells. End-scoped passes follow the
# original rims and leave the long faces and UV seams in place.
EDGES = {
    'Exterior_SeatedTang05': (.38, 3, 34, 'all'),
    'Wood_UpperFittedCrown05': (.56, 3, 27, 'ends'),
    'Exterior_Guard02': (.35, 3, 33, 'all'),
    'T38_407F_VisualSkin_Exterior_FrontBandLowerStep78': (.38, 3, 26, 'all'),
    'T38_430B_ContinuousLowerFacing_VisualOnly': (.43, 3, 36, 'all'),
    'T38_430B_IndependentLeftCoverSkin': (.42, 3, 22, 'ends'),
    'T38_430B_RetainedRightCoverHalf': (.41, 3, 23, 'rearCover'),
    'T38_433E_VisibleSideBlockRimInset': (.45, 3, 24, 'all'),
    'T38_435F2_IndependentTailNeckExterior': (.26, 2, 20, 'ends'),
    'T38_460G_WoodGroove_VisualCandidate': (.52, 3, 40, 'ends'),
}


def ReadSource(repo):
    raw = subprocess.check_output(['git', '-C', str(repo), 'show', f'{BASE_REVISION}:{ASSET}'])
    assert hashlib.sha256(raw).hexdigest() == BASE_SHA
    size = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20+size])
    payload = memoryview(raw)[28+size:]

    def Read(slot, width):
        accessor = document['accessors'][slot]
        view = document['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        kind = {5123:'<u2', 5125:'<u4', 5126:'<f4'}[accessor['componentType']]
        size = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[accessor['type']]
        return np.frombuffer(payload,dtype=kind,count=size*accessor['count'],offset=start).reshape(-1,width)

    parts = {}
    for node in document['nodes']:
        name = node.get('extras',{}).get('SourceObject')
        if name not in EDGES:
            continue
        primitive = document['meshes'][node['mesh']]['primitives'][0]
        attrs = primitive['attributes']
        parts[name] = (Read(attrs['POSITION'],3), Read(attrs['NORMAL'],3),
                       Read(attrs['TANGENT'],4), Read(attrs['TEXCOORD_0'],2), Read(primitive['indices'],3))
    assert parts.keys() == EDGES.keys()
    return parts


def Exposed(edge, width, minimumAngle, ends):
    span = edge.calc_length()
    if not edge.is_contiguous or not edge.is_convex or span < .52:
        return False
    turn = edge.calc_face_angle()
    if turn < minimumAngle or turn > math.radians(112):
        return False
    if min(face.calc_area() for face in edge.link_faces)*2/span < .56*width:
        return False
    if ends is not None:
        lo,hi = ends
        along = (edge.verts[0].co.z+edge.verts[1].co.z)*.5
        return along < lo or along > hi
    return True


def Corners(mesh, before, normals, tangents, faces):
    uv = np.empty((len(mesh.loops),2),dtype='f')
    coordinates = np.empty((len(mesh.vertices),3),dtype='f')
    normal = np.empty((len(uv),3),dtype='f')
    tangent = np.empty((len(uv),3),dtype='f')
    sign = np.empty(len(uv),dtype='f')
    corners = np.empty(len(uv),dtype=np.int32)
    surface = np.empty(len(mesh.polygons),dtype=np.int32)
    mesh.vertices.foreach_get('co',coordinates.ravel())
    mesh.loops.foreach_get('vertex_index',corners)
    mesh.uv_layers.active.uv.foreach_get('vector',uv.ravel())
    mesh.attributes['SourceTriangle'].data.foreach_get('value',surface)
    mesh.calc_tangents()
    mesh.corner_normals.foreach_get('vector',normal.ravel())
    mesh.loops.foreach_get('tangent',tangent.ravel())
    mesh.loops.foreach_get('bitangent_sign',sign)
    points = coordinates[corners]*.001

    # Keep the original corner shading wherever the surface and UV chart are
    # unchanged. Blender derives the basis on each new fillet and miter.
    source = faces[np.maximum(0,surface-1)].repeat(3,axis=0)
    distance = np.linalg.norm(before[source]-points[:,None,:],axis=2)
    nearest = distance.argmin(axis=1)
    untouched = (surface.repeat(3)>0)&(distance.min(axis=1)<1.4e-7)
    originals = source[np.arange(len(nearest)),nearest]
    normal[untouched] = normals[originals[untouched]]
    tangent[untouched] = tangents[originals[untouched],:3]
    sign[untouched] = tangents[originals[untouched],3]
    normal /= np.maximum(1e-10,np.linalg.norm(normal,axis=1,keepdims=True))
    tangent -= normal*(normal*tangent).sum(axis=1,keepdims=True)
    bad = (np.linalg.norm(tangent,axis=1)<1e-7) | (np.abs(sign)!=1)
    # Some bevel corners inherit a strip of zero UV width from a source seam.
    # They sample the padded chart edge and use an orthogonal shading frame.
    lead = np.eye(3,dtype='f')[np.abs(normal[bad]).argmin(axis=1)]
    tangent[bad] = np.cross(lead,normal[bad])
    sign[bad] = 1
    tangent /= np.linalg.norm(tangent,axis=1,keepdims=True)
    assert np.isfinite(tangent).all() and np.min(np.linalg.norm(normal,axis=1))>.999
    attributes = np.column_stack((points,normal,tangent,sign,uv))
    vertices, remap = np.unique(attributes,axis=0,return_inverse=True)
    return vertices,remap.reshape(-1,3)


def RoundPart(values, settings):
    points,normals,tangents,uv,faces = values
    width,segments,angle,scope = settings
    _,first,remap = np.unique(points.round(7),axis=0,return_index=True,return_inverse=True)
    welded = remap.reshape(-1)[faces]
    ordered = np.sort(welded,axis=1)
    keep = np.flatnonzero(np.all(np.diff(ordered,axis=1)>0,axis=1))
    keep = keep[np.sort(np.unique(ordered[keep],axis=0,return_index=True)[1])]
    mesh = bpy.data.meshes.new('Type38 roundover work')
    topology = bmesh.new()
    try:
        mesh.from_pydata((1000*points[first]).tolist(),[],welded[keep].tolist())
        chart = mesh.uv_layers.new(name='FinishUV')
        chart.uv.foreach_set('vector',uv[faces[keep]].ravel())
        original = mesh.attributes.new('SourceTriangle','INT','FACE')
        original.data.foreach_set('value',(1+keep).astype(np.int32))
        topology.from_mesh(mesh)
        topology.normal_update()
        limits = 1000*np.array([points[:,2].min(),points[:,2].max()])
        bounds = limits + np.diff(limits)*[.12,-.12] if scope=='ends' else None
        edges = [edge for edge in topology.edges if Exposed(edge,width,math.radians(angle),bounds)]
        if scope=='rearCover':
            rear = limits[1]-.13*np.diff(limits)[0]
            def MarkedRim(edge):
                side,up,along = (edge.verts[0].co+edge.verts[1].co)*.5
                return along>rear or (-124<along<-101 and side>14 and up>45)
            edges = [edge for edge in edges if MarkedRim(edge)]
        selected = len(edges)
        if not selected:
            return None
        bevel = bmesh.ops.bevel(topology,geom=edges,offset=width,segments=segments,profile=.5,
                               affect='EDGES',clamp_overlap=True,loop_slide=False)
        source = topology.faces.layers.int['SourceTriangle']
        for face in bevel['faces']:
            face[source] = 0
        bmesh.ops.dissolve_degenerate(topology,dist=.001,edges=list(topology.edges))
        bmesh.ops.triangulate(topology,faces=[face for face in topology.faces if len(face.verts)>3],quad_method='BEAUTY')
        slivers = [face for face in topology.faces if face.calc_area()<.0000005]
        if slivers:
            bmesh.ops.delete(topology,geom=slivers,context='FACES_ONLY')
        topology.normal_update()
        for face in topology.faces:
            face.smooth = True
        for edge in topology.edges:
            edge.smooth = edge.is_contiguous and edge.calc_face_angle() < math.radians(48)
        topology.to_mesh(mesh)
        mesh.update()
        vertices,triangles = Corners(mesh,points,normals,tangents,faces)
        return vertices,triangles,selected
    finally:
        topology.free()
        bpy.data.meshes.remove(mesh)


def Build(repo, output):
    parts = ReadSource(repo)
    baked = {}
    for part,values in parts.items():
        rounded = RoundPart(values,EDGES[part])
        assert rounded is not None, (part,'missing exterior ridges')
        vertices,triangles,selected = rounded
        baked[part+'_vertices'] = vertices
        baked[part+'_indices'] = triangles
        print(part, len(values[-1]),'->',len(triangles),'faces on',selected,'rounded edges',flush=True)
    output.parent.mkdir(parents=True,exist_ok=True)
    stage = output.with_suffix('.tmp.npz')
    np.savez_compressed(stage,**baked)
    stage.replace(output)


if __name__ == '__main__':
    Build(Path(__file__).resolve().parents[2],Path(sys.argv[sys.argv.index('--')+1]))
