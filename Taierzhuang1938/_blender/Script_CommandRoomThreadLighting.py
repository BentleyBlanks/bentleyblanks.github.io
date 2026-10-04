"""Sample nearby cloth irradiance for subpixel sewn threads, without UV seam bleed."""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def MapThreadLighting(scene):
    cloth=bpy.data.objects['Room_CommandRoomCloth'];cloth.data.calc_loop_triangles()
    verts=[];faces=[];uvTriangles=[]
    for tri in cloth.data.loop_triangles:
        points=[cloth.matrix_world@cloth.data.vertices[i].co for i in tri.vertices]
        if (points[1]-points[0]).cross(points[2]-points[0]).length*.5<.000004:continue
        first=len(verts);verts.extend(points);faces.append((first,first+1,first+2))
        uvTriangles.append([Vector((*cloth.data.uv_layers['LightmapUV'].data[i].uv,0)) for i in tri.loops])
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=True)
    for ob in scene.objects:
        if ob.type!='MESH' or ob.data.materials[0].name!='CommandRoomThread':continue
        if 'LightmapUV' in ob.data.uv_layers:ob.data.uv_layers.remove(ob.data.uv_layers['LightmapUV'])
        layer=ob.data.uv_layers.new(name='LightmapUV')
        for poly in ob.data.polygons:
            hit,normal,index,distance=tree.find_nearest(ob.matrix_world@poly.center)
            assert hit is not None and distance<.08, f'Thread too far from cloth: {distance}'
            uv=barycentric_transform(hit,*[verts[i] for i in faces[index]],*uvTriangles[index]).xy
            # One irradiance sample per tiny stitch face. Interpolating vertices
            # projected into different atlas islands would cross unrelated charts.
            for li in poly.loop_indices:layer.data[li].uv=uv
        ob.data.uv_layers.active_index=0;ob.data.uv_layers[0].active_render=True

MapThreadLighting(bpy.context.scene)
