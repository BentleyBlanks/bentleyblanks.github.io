"""BlenderMCP exterior artwork pass. Set TYPE38_REPO_ROOT and stage the 511 baseline first."""
import math
import os
from pathlib import Path

import bmesh
import bpy


def BuildExterior(repo):
    work = repo / 'tmp/Type38Review'
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(work / 'Before.glb'), merge_vertices=True)
    parts = {obj['SourceObject']: obj for obj in bpy.context.scene.objects if obj.type == 'MESH'}
    crown = parts['T38_430J_Exterior_ImportedRemainder_Plate72']
    crownPoints = [vertex for vertex in crown.data.vertices if (crown.matrix_world @ vertex.co).y > .98]
    floor = min((crown.matrix_world @ vertex.co).z for vertex in crownPoints)
    seat = parts['Exterior_FrontUpperRoot80']
    seatTop = max((seat.matrix_world @ vertex.co).z for vertex in seat.data.vertices)
    assert crownPoints and seatTop < floor
    for vertex in crownPoints:
        point = crown.matrix_world @ vertex.co
        if point.z < floor + .00002:
            point.z = seatTop - .00065
            vertex.co = crown.matrix_world.inverted() @ point
    crown.data.update()
    edited = [crown]
    stages = [('Exterior_ButtCap04', 30), ('Exterior_MiddleBand57', 36), ('Exterior_Guard02', 18),
              ('Exterior_LongRound44', 18), ('Exterior_FrontUpperDetail76_Neg', 12),
              ('Exterior_FrontUpperDetail76_Pos', 12), ('Exterior_FrontBandEnd78', 16),
              ('T38_407F_VisualSkin_Exterior_FrontBandBody78', 36), ('Exterior_FoldedShortBridge47', 12),
              ('T38_463C_FrontPad_VisualCandidate', 24), ('Exterior_SeatedTang05', 12)]
    for name, limit in stages:
        obj = parts[name]
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        mesh.normal_update()
        angle = 15 if name in ('Exterior_MiddleBand57', 'Exterior_LongRound44', 'Exterior_SeatedTang05') else 36
        edges = [edge for edge in mesh.edges if edge.is_manifold and edge.calc_face_angle() > math.radians(angle)
                 and edge.calc_length() > .0008 and edge.is_convex]
        edges.sort(key=lambda edge: (-edge.calc_length(), edge.index))
        if edges:
            result = bmesh.ops.bevel(mesh, geom=edges[:limit], offset=.00019, segments=2,
                                     profile=.5, affect='EDGES', clamp_overlap=True, loop_slide=True)
            if result['faces']:
                for face in result['faces']:
                    face.smooth = True
                bmesh.ops.triangulate(mesh, faces=[face for face in mesh.faces if len(face.verts) > 3])
                mesh.to_mesh(obj.data)
                obj.data.update()
                edited.append(obj)
        mesh.free()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in edited:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(work / 'ExteriorGeometry.glb'), export_format='GLB',
                              use_selection=True, export_materials='NONE', export_texcoords=True,
                              export_normals=True, export_tangents=True, export_extras=True, export_animations=False)
    print('Exterior geometry:', [obj['SourceObject'] for obj in edited])


BuildExterior(Path(os.environ['TYPE38_REPO_ROOT']))
