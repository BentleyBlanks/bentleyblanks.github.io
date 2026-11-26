"""Revise the frozen Type89 high source while retaining its UVs and motion rig."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy


SOURCE_ROOT = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
BASELINE = SOURCE_ROOT / 'SurfaceV14/Scene_Type89MediumTankHighPbr.blend'
VERSION = 'GeometryV55SurfaceV15'
GEOMETRY = '20261126GeometryV55'
SURFACE = 'SurfaceV15'
MODEL = 'Model_Type89MediumTank'


def Hash(file):
    with file.open('rb') as data:
        return hashlib.file_digest(data, 'sha256').hexdigest()


def Clamp(value, lower=0, upper=1):
    return max(lower, min(upper, value))


def MeshPart(suffix):
    return bpy.data.objects['Mesh_' + suffix].data


def Component(mesh, seed):
    adjacent = [[] for vertex in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacent[a].append(b)
        adjacent[b].append(a)
    found = {seed}
    queue = [seed]
    for index in queue:
        for neighbor in adjacent[index]:
            if neighbor not in found:
                found.add(neighbor)
                queue.append(neighbor)
    return found


def Count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def Bevel(mesh, select, width, segments=3):
    """Round the actual face junction. UVs follow the edge loops."""
    edit = bmesh.new()
    edit.from_mesh(mesh)
    edit.normal_update()
    edges = [edge for edge in edit.edges if edge.is_manifold
             and edge.calc_face_angle() > math.radians(50)
             and all(select(vertex.co, vertex.index) for vertex in edge.verts)]
    if edges:
        result = bmesh.ops.bevel(edit, geom=edges, offset=width, segments=segments,
                                 profile=.5, affect='EDGES', clamp_overlap=True)
        edit.normal_update()
        edit.to_mesh(mesh)
        mesh.update()
    else:
        result = {'faces': []}
    edit.free()
    return {'selectedEdges': len(edges), 'bevelFaces': len(result['faces']), 'radiusParameterM': width}


def ReviseTurret():
    mesh = MeshPart('TurretYaw')
    # The outer trapezoid reads taller in both the frontal and right-quarter
    # photos. The working opening and the two moving pivots are left in place.
    frame = Component(mesh, 8824)
    rim = Component(mesh, 1176)
    shell = Component(mesh, 256)
    assert len(frame) > 100 and len(rim) == 288 and frame.isdisjoint(shell | rim)
    changed = 0
    for vertex in mesh.vertices:
        p = vertex.co
        if vertex.index in rim:
            p.x *= .995
            p.y *= .995
            p.z -= .0018 * Clamp((p.z-.548)/.017)
        if vertex.index in shell:
            p.z -= .006 * Clamp((.105-p.z)/.053)
        # Exposed frame, fastener heads and the tapered collar share the same
        # deformation at the upper and lower flange. The slot stays unchanged.
        if vertex.index not in shell and vertex.index not in rim and abs(p.x) < .275 and p.y > .56:
            if p.z < .160:
                p.z -= .028 * Clamp((.160-p.z)/.050)
                changed += 1
            elif p.z > .440:
                p.z += .025 * Clamp((p.z-.440)/.050)
                changed += 1
    mesh.update()
    edge = Bevel(mesh, lambda p, i: i in shell and p.z < .059, .0018)
    return {'retainerVertices': len(rim), 'mantletVertices': changed,
            'mantletExtensionM': [.028, .025], 'lowerWallEdge': edge}


def ReviseHull():
    hull = MeshPart('Hull')
    changed = 0
    # Photos 19 and 39 separate the curled fender from the channel tail.
    # Adjust the rolled lip and its sheet together. The terminal tail datum
    # and the straight portion over the upper tread keep their source positions.
    for vertex in hull.vertices:
        p = vertex.co
        if not (.715 < abs(p.x) < 1.10 and 1.08 < p.z < 1.295 and p.y < -2.10):
            continue
        influence = Clamp((-2.10-p.y)/.725)**2
        p.y += .055*influence
        p.z += .009*influence
        changed += 1
    hull.update()
    plate = MeshPart('BowPlate')
    sheet = Component(plate, 0)
    edge = Bevel(plate, lambda p, i: i in sheet and (abs(p.z) > .60 or abs(p.x) > .624+.142*p.z), .0015)
    return {'rearFenderVertices': changed, 'rearFenderCrownTravelM': [.055,.009], 'bowPlatePerimeter': edge}


def ReviseSkirtEdges():
    results = {}
    for side, sign in [('Left', -1), ('Right', 1)]:
        for end in ['Front','Rear']:
            mesh = MeshPart('VerticalSkirt'+side+end)
            sheet = Component(mesh, 0)
            # Select exposed edges of the lapped plate. Keep bolts, tabs and
            # the mating suspension cover as distinct editable components.
            results[side+end] = Bevel(mesh, lambda p,i: i in sheet and sign*p.x >= -.0002 and p.z < -.02, .00115)
    return results


def ReviseRearDeck():
    details = {}
    for side, sign in [('Left',-1),('Right',1)]:
        mesh = MeshPart('EngineHatch'+side)
        shape = bmesh.new()
        shape.from_mesh(mesh)
        uv = shape.loops.layers.uv.active
        steel = next(index for index, material in enumerate(mesh.materials) if material.get('Type89Role')=='Steel')
        handleUVs = {-1:[],1:[]}
        handles = []
        for face in shape.faces:
            center = face.calc_center_median()
            if face.material_index==steel and abs(center.y)>.59 and abs(center.x-sign*.33)<.065:
                handles.append(face)
                handleUVs[1 if center.y>0 else -1].extend(tuple(loop[uv].uv) for loop in face.loops)
        assert handles and all(handleUVs.values())
        bmesh.ops.delete(shape,geom=handles,context='FACES')
        lowered = 0
        for vert in shape.verts:
            x,y,z = vert.co
            if z>.0177 and abs(x-(sign*.21 if sign<0 else .33)) < (.109 if sign<0 else .232) and (abs(y)<.508 if sign<0 else .08<y<.524):
                # The folded slats read in nearly the same plane as the
                # frame in the rear quarter. Their dark reveals stay open.
                vert.co.z -= .006 * Clamp((z-.0177)/.010)
                lowered += 1
        for end, bounds in handleUVs.items():
            limits = [(min(point[axis] for point in bounds),max(point[axis] for point in bounds)) for axis in (0,1)]
            rings = []
            for i in range(17):
                t = math.pi*i/16
                x = sign*.33-.067*math.cos(t)
                y = end*.61
                z = .014+.026*math.sin(t)
                dx,dz = .067*math.sin(t),.026*math.cos(t)
                length = math.hypot(dx,dz)
                row = []
                for vertex in range(12):
                    angle = math.tau*vertex/12
                    radial = .006*math.cos(angle)
                    row.append(shape.verts.new((x+radial*dz/length, y+.006*math.sin(angle), z-radial*dx/length)))
                rings.append(row)
            for i in range(16):
                a,b = rings[i:i+2]
                for j in range(12):
                    k = (j+1)%12
                    face = shape.faces.new((a[j],a[k],b[k],b[j]))
                    face.material_index = steel
                    face.smooth = True
                    for loop,(s,t) in zip(face.loops,((i,j),(i,j+1),(i+1,j+1),(i+1,j))):
                        loop[uv].uv = (limits[0][0]+(limits[0][1]-limits[0][0])*s/16,
                                       limits[1][0]+(limits[1][1]-limits[1][0])*t/12)
        bmesh.ops.recalc_face_normals(shape,faces=list(shape.faces))
        shape.to_mesh(mesh)
        shape.free()
        mesh.update()
        details[side] = {'louvreVerticesLowered':lowered,'archedGrabHandles':2,'maximumLoweringM':.006}
    return details


def RetuneFinish(material, settings):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    for socketName, transform in settings.items():
        socket = shader.inputs[socketName]
        if not socket.is_linked:
            continue
        source = socket.links[0].from_socket
        if isinstance(transform, tuple):
            node = nodes.new('ShaderNodeMixRGB')
            node.blend_type = 'MULTIPLY'
            node.inputs[0].default_value = 1
            node.inputs[2].default_value = (*transform,1)
            target = node.inputs[1]
            if material.get('Type89Role') == 'Armor':
                badge = nodes.new('ShaderNodeAttribute')
                badge.attribute_name = 'MuseumBadge'
                mask = nodes.new('ShaderNodeMath')
                mask.operation = 'SUBTRACT'
                mask.use_clamp = True
                mask.inputs[0].default_value = 1
                links.new(badge.outputs['Fac'], mask.inputs[1])
                links.new(mask.outputs[0], node.inputs[0])
        else:
            node = nodes.new('ShaderNodeMath')
            node.operation = 'MULTIPLY'
            node.use_clamp = True
            node.inputs[1].default_value = transform
            target = node.inputs[0]
        node.label = 'Tsuchiura 2007 ' + socketName
        links.new(source, target)
        links.new(node.outputs[0], socket)


def SaveMaps(root, versionDir):
    directory = versionDir / 'Maps/High'
    directory.mkdir(parents=True, exist_ok=True)
    materials = {material for obj in root.children_recursive if obj.type == 'MESH'
                 for material in obj.data.materials if material}
    images = sorted({node.image for material in materials for node in material.node_tree.nodes
                     if node.type == 'TEX_IMAGE' and node.image}, key=lambda image:image.name)
    rows = []
    for image in images:
        assert image.packed_file is not None, image.name
        data = bytes(image.packed_file.data)
        assert data.startswith(b'\x89PNG\r\n\x1a\n'), image.name
        file = directory / (Path(image.name).stem + '.png')
        file.write_bytes(data)
        image.filepath_raw = '//' + file.relative_to(versionDir).as_posix()
        rows.append(dict(file=file.relative_to(versionDir).as_posix(), pixels=list(image.size),
                         colorSpace=image.colorspace_settings.name, sha256=hashlib.sha256(data).hexdigest()))
    return rows


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, default=BASELINE)
    parser.add_argument('--output', type=Path, default=SOURCE_ROOT/VERSION)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out = args.output.resolve()
    assert out.is_relative_to(SOURCE_ROOT.resolve()) and out != args.baseline.parent.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sourceHash = Hash(args.baseline)
    assert sourceHash == 'f84f9b6c069118bba42d181f66b4d243833ea790167889d72ae2fcce778cb02e', sourceHash
    bpy.ops.wm.open_mainfile(filepath=str(args.baseline))
    bpy.data.use_autopack = False
    root = bpy.data.objects[MODEL]
    assert root['geometryVersion'] == '20261027GeometryV54' and root['surfaceRevision'] == 'SurfaceV14'
    before = sum(Count(obj.data) for obj in root.children_recursive if obj.type == 'MESH')
    assert before == 1462012
    edits = {'turret': ReviseTurret(), 'hull': ReviseHull(), 'skirtEdges': ReviseSkirtEdges(), 'deck': ReviseRearDeck()}
    print(json.dumps(edits), flush=True)
    finish = {
        'Armor': {'Base Color': (.81,.80,.74), 'Roughness': 1.035, 'Coat Roughness': 1.10},
        'CastArmor': {'Base Color': (.81,.80,.74), 'Roughness': 1.052, 'Coat Roughness': 1.12},
        'Guard': {'Base Color': (.81,.80,.74), 'Roughness': 1.04, 'Coat Roughness': 1.10},
        'Track': {'Base Color': (.88,.88,.89), 'Roughness': 1.045},
        'Steel': {'Roughness': .96},
    }
    for role, settings in finish.items():
        RetuneFinish(bpy.data.materials['Material_Type89High'+role], settings)
    materials = SaveMaps(root, out)
    recipeHash = Hash(Path(__file__))
    root['assetVersion'] = GEOMETRY
    root['geometryVersion'] = GEOMETRY
    root['surfaceRevision'] = SURFACE
    root['geometryRecipeSha256'] = recipeHash
    root['acceptance'] = 'PHOTO_ALIGNED_HIGH_SOURCE'
    root['highSourceBaselineSha256'] = sourceHash
    scene = bpy.context.scene
    scene['Type89Stage'] = 'Pbr'
    scene['BlenderMcpTask'] = 'Type89MediumTank'
    triangles = sum(Count(obj.data) for obj in root.children_recursive if obj.type == 'MESH')
    report = {'schema':'Type89HighSourceV55', 'baseline':str(args.baseline), 'baselineSha256':sourceHash,
              'sourceTriangles':before, 'highTriangles':triangles, 'edits':edits, 'finish':finish,
              'maps':materials, 'recipeSha256':recipeHash}
    text = bpy.data.texts.new('Data_Type89RestorationHigh.json')
    text.write(json.dumps(report,indent=2))
    blend = out/'Scene_Type89MediumTankHighPbr.blend'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.data.use_autopack = False
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), relative_remap=False)
    report.update(blend=str(blend), blendSha256=Hash(blend))
    (out/'Data_HighBuild.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf-8')
    print(f'{triangles:,} high source triangles across the whole vehicle · {blend}', flush=True)


if __name__ == '__main__':
    Main()
