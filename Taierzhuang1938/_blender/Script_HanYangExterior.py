"""Build exterior finish charts and shading in an owned BlenderMCP scene."""
import bpy
import bmesh
import json
import math
import os
import hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive / 'ExteriorFinish_20261122'
revision.mkdir(exist_ok=True)
source = revision/'Input_R2.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '6f302b5dd315a7cec8b5bcebfcf0421302740de45609b2768afcdde4133c068d'
assert not bpy.data.filepath or Path(bpy.data.filepath).parent == revision
for obj in list(bpy.context.scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
parts = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == 'MESH'}
assert len(parts) == 44
changes = {}


def Select(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def RoundedEdges(obj, width):
    Select(obj)
    mesh = obj.data
    if mesh.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=.0000008)
    bmesh.ops.dissolve_limit(topology, angle_limit=.006, verts=list(topology.verts), edges=list(topology.edges), delimit=set())
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    topology.normal_update()
    edges = [edge for edge in topology.edges if edge.is_contiguous and edge.calc_face_angle() > math.radians(28)]
    if obj.name == 'ReceiverOuterCollar':
        edges = [edge for edge in edges if all(math.hypot(vert.co.x, vert.co.z-.04194) > .011 for vert in edge.verts)]
    bmesh.ops.bevel(topology, geom=edges, offset=width, segments=1 if 'AttachmentLoop' in obj.name else 3, affect='EDGES', clamp_overlap=True)
    topology.normal_update()
    for edge in topology.edges:
        edge.smooth = not edge.is_contiguous or edge.calc_face_angle() < math.radians(49)
    for face in topology.faces:
        face.smooth = True
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()
    modifier = obj.modifiers.new('Keep broad reflections planar', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = True
    modifier.weight = 36
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Final tangent lattice', 'TRIANGULATE')
    modifier.keep_custom_normals = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def ExteriorAtlas(obj):
    Select(obj)
    mesh = obj.data
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    mesh.uv_layers.new(name='FinishAtlas')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=.0025, margin_method='FRACTION', area_weight=.45, correct_aspect=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def FinishTimberLip(obj):
    mesh = obj.data
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=.0000007)
    topology.normal_update()
    selected = []
    for edge in topology.edges:
        if not edge.is_contiguous or edge.calc_length()<.00045 or edge.calc_face_angle()<math.radians(34):
            continue
        mid = (edge.verts[0].co+edge.verts[1].co)*.5
        if min(v.co.z for v in edge.verts)>.038 and (mid.y<.277 or mid.y>.573):
            selected.append(edge)
    result=bmesh.ops.bevel(topology,geom=selected,offset=.00048,segments=2,affect='EDGES',clamp_overlap=True)
    for face in result['faces']:
        face.smooth=True
    bmesh.ops.triangulate(topology,faces=[face for face in topology.faces if len(face.verts)>3])
    topology.to_mesh(mesh);topology.free();mesh.update()


def BlendTimberNormals(obj):
    mesh = obj.data
    points = np.array([vert.co[:] for vert in mesh.vertices]); normalsOut = np.array([item.vector[:] for item in mesh.corner_normals]); field = {}
    for side in [-1,1]:
        widths=np.zeros((68,24))
        for along,level in np.ndindex(widths.shape):
            hit,point,_,_=obj.ray_cast(Vector((side*.05,.248+along*.005,-.006+level*.002)),Vector((-side,0,0)))
            widths[along,level]=abs(point.x) if hit else 0
        field[side]=widths
    for loop in mesh.loops:
        point = points[loop.vertex_index]; side=1 if point[0]>0 else -1
        if not .26<point[1]<.5776 or not .003<point[2]<.033 or abs(point[0]) < .009:
            continue
        along,level=(point[1]-.248)/.005,(point[2]+.006)/.002
        first,height=math.floor(along),math.floor(level); widths=field[side]
        if abs(widths[first,height]-abs(point[0]))>.0018:continue
        avg=np.zeros(3)
        for row,yr in [(first,1-along+first),(first+1,along-first)]:
            for col,zr in [(height,1-level+height),(height+1,level-height)]:
                avg+=np.array([side,-(widths[row+1,col]-widths[row-1,col])/.01,-(widths[row,col+1]-widths[row,col-1])/.004])*yr*zr
        normalsOut[loop.index]=avg/np.linalg.norm(avg)
    mesh.normals_split_custom_set(normalsOut.tolist())


for name, obj in parts.items():
    wood = name.startswith(('FrontWood_', 'MainWood_', 'UpperWood_'))
    if name.startswith('FrontWood_'):
        for vertex in obj.data.vertices:
            if vertex.co.y > .87:
                vertex.co.y += (vertex.co.y-.87)/(.892-.87)*.0187
        obj.data.update()
    if name.startswith('MainWood_'):
        BlendTimberNormals(obj)
    if name.startswith('UpperWood_'):
        for vertex in obj.data.vertices:
            point=vertex.co
            transition=min(1,max(0,(point.y-.266)/.054))
            height=min(1,max(0,(point.z-.036)/.025))
            point.z-=.0055*(1-transition*transition*(3-2*transition))*height
        obj.data.update()
        FinishTimberLip(obj)
    if name=='RearBand_ControlledCrown':
        for vertex in obj.data.vertices:
            point=vertex.co
            if abs(point.x)>.011 and point.z<.039:
                if abs(point.y-.57835)<.00002:point.y+=.00028
                if abs(point.y-.59165)<.00002:point.y-=.00028
        obj.data.update()
    rolled = name.startswith(('ButtCap_', 'LowerPlateGuard_', 'FrontBand', 'FrontSideBoss_', 'HandleNeck', 'HandleRoot', 'MiddleSideDisk', 'SideWoodButton', 'HY150_VisualFrontSleeve', 'RearTab', 'RearTopExternalLever', 'RearStock_ExternalAttachment', 'RearBand_ExternalAttachment', 'ReceiverOuterCollar'))
    if rolled:
        RoundedEdges(obj, .00038 if name.startswith(('ButtCap_', 'LowerPlateGuard_', 'FrontBand_')) else .00012)
    if wood or rolled or name=='RearBand_ControlledCrown':
        ExteriorAtlas(obj)
        changes[name] = 'atlas'
        Select(obj)
        bpy.ops.export_scene.gltf(filepath=str(revision / (name+'.glb')), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=True, export_normals=True, export_tangents=True, export_materials='NONE', export_extras=False)

(revision/'Data_Charts.json').write_text(json.dumps(changes, indent=2))
print('EXTERIOR', len(parts), len(changes), str(revision))
