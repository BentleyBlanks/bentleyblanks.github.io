"""Sample nearby cloth irradiance for subpixel sewn threads, without UV seam bleed."""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def MapThreadLighting(scene):
    atlas=globals().get('atlas') or bpy.data.images['CommandRoomLighting'];width,height=atlas.size
    pixels=np.empty(len(atlas.pixels),dtype=np.float32);atlas.pixels.foreach_get(pixels)
    pixels=pixels.reshape((height,width,4))
    verts=[];faces=[];uvTriangles=[];energies=[]
    for clothName in ['Room_CommandRoomCloth','Room_CommandRoomCapCloth']:
        cloth=bpy.data.objects[clothName];cloth.data.calc_loop_triangles()
        for tri in cloth.data.loop_triangles:
            points=[cloth.matrix_world@cloth.data.vertices[i].co for i in tri.vertices]
            if (points[1]-points[0]).cross(points[2]-points[0]).length*.5<.000004:continue
            samples=[Vector((*cloth.data.uv_layers['LightmapUV'].data[i].uv,0)) for i in tri.loops]
            center=sum(samples,Vector())/3
            x=max(0,min(width-1,int(center.x*width)));y=max(0,min(height-1,int(center.y*height)))
            if pixels[y,x,:3].max()<.008:continue
            first=len(verts);verts.extend(points);faces.append((first,first+1,first+2))
            # Pixel centres keep bilinear filtering out of adjacent unlit padding.
            uvTriangles.append(Vector(((x+.5)/width,(y+.5)/height)))
            energies.append(float(pixels[y,x,:3].max()))
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=True)
    for ob in scene.objects:
        if ob.type!='MESH' or ob.data.materials[0].name!='CommandRoomThread':continue
        if 'LightmapUV' in ob.data.uv_layers:ob.data.uv_layers.remove(ob.data.uv_layers['LightmapUV'])
        layer=ob.data.uv_layers.new(name='LightmapUV')
        for poly in ob.data.polygons:
            point=ob.matrix_world@poly.center
            nearby=tree.find_nearest_range(point,.025)
            if nearby:
                # A piping centre lies on the dark chart boundary. Use resolved
                # interior cloth in the same small neighbourhood, preserving
                # broad room shadows without alternating padding-black segments.
                peak=max(energies[x[2]] for x in nearby)
                hit,normal,index,distance=min((x for x in nearby if energies[x[2]]>=peak*.55),key=lambda x:x[3])
            else:hit,normal,index,distance=tree.find_nearest(point)
            assert hit is not None and distance<.12, f'Thread too far from resolved cloth: {distance}'
            uv=uvTriangles[index]
            # One irradiance sample per tiny stitch face. Interpolating vertices
            # projected into different atlas islands would cross unrelated charts.
            for li in poly.loop_indices:layer.data[li].uv=uv
        ob.data.uv_layers.active_index=0;ob.data.uv_layers[0].active_render=True

MapThreadLighting(bpy.context.scene)
