"""Fold the actual grass-sheet starting edge into the small core opening."""
import math
import bpy
from mathutils import Vector


def ApplyMatInnerTuck(root):
    assert bpy.context.scene.get('BlenderMcpTask') == 'SichuanBlanketPack'
    matRoot = bpy.data.objects['Pack_StrawMat']
    sheet = bpy.data.objects['Pack_TrueRolledGrassSheet']
    assert matRoot.parent == root and sheet.parent == matRoot
    assert len(sheet.data.vertices) == 601*49
    vertices, faces, uvs = [], [], []
    rows, columns = 32, 48
    # This is a bent rectangular leaf continuous with row zero across the
    # whole mat width, not a circular end cap or a plug at either visible end.
    for row in range(rows+1):
        t = row/rows
        for column in range(columns+1):
            start = sheet.data.vertices[column].co.copy()
            radial = Vector((0, start.y+.067, start.z-.1805)).normalized()
            tangent = Vector((0, -radial.z, radial.y))
            reach = .0060*math.sin(math.pi*.75*t)
            bend = .00120*math.sin(math.pi*t)-.00025*t
            point = start-radial*reach+tangent*bend
            point += tangent*(.00014*math.sin(start.x*83+2*t)*math.sin(math.pi*t))
            vertices.append(tuple(point)); uvs.append((.52+.46*(start.x+.202)/.08, .52+.46*t*.008/.08))
    for row in range(rows):
        for column in range(columns):
            a=row*(columns+1)+column
            faces.append((a,a+1,a+columns+2,a+columns+1))
    previous = bpy.data.objects.get('Pack_InnerMatTuckV10')
    if previous:
        data = previous.data
        bpy.data.objects.remove(previous,do_unlink=True)
        if data.users == 0: bpy.data.meshes.remove(data)
    mesh = bpy.data.meshes.new('Geometry_SichuanInnerGrassLeafV10')
    mesh.from_pydata(vertices,[],faces); mesh.update()
    for material in sheet.data.materials: mesh.materials.append(material)
    uv=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops: uv.data[loop.index].uv=uvs[loop.vertex_index]
    for face in mesh.polygons: face.use_smooth=True; face.material_index=1
    obj=bpy.data.objects.new('Pack_InnerMatTuckV10',mesh)
    bpy.context.scene.collection.objects.link(obj); obj.parent=matRoot
    obj['Construction']='A folded continuation of the real grass-sheet starting edge across its width'
    solid=obj.modifiers.new('CompressedInnerGrassLeaf','SOLIDIFY'); solid.thickness=.00220; solid.offset=0
    return {'object':obj.name,'construction':'Attached bent rectangular starting leaf, not a cap',
            'maxReachM':.006,'compressedThicknessM':.0022,'outerWeaveChanged':False}
