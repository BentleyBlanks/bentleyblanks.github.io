"""Twenty-four actual high hand stitches as visible, two-triangle cloth ribbons."""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator='SichuanGameRepairStitchesV10'


def Name(obj):return obj.get('PackSourceName',obj.name)
def Count(obj):return sum(len(face.vertices)-2 for face in obj.data.polygons)


def Tree(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        return BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],
                                   [tuple(t.vertices)for t in mesh.loop_triangles],all_triangles=True)
    finally:evaluated.to_mesh_clear()


def Hit(tree,point):
    return tree.ray_cast(Vector((point.x,-.5,point.z)),Vector((0,1,0)),1)[0]


def BuildRepairStitchRibbons(highPart,gamePart,budget=48,partBudget=1200):
    if budget!=48:raise RuntimeError('This source-backed stitch recipe is exactly 24 two-triangle ribbons')
    sources={Name(obj):obj for obj in (highPart,*highPart.children_recursive)if obj.type=='MESH'}
    source=sources.get('Pack_V9RepairHandStitches');patch=sources.get('Pack_V9RepairPatch')
    lowPatch=next((obj for obj in gamePart.children_recursive if obj.name=='Game_RepairPatchV10'),None)
    leaf=next((obj for obj in gamePart.children_recursive if obj.name=='Game_RelaxedFrontLeafV10'),None)
    if not all((source,patch,lowPatch,leaf)):raise RuntimeError('Actual high hand stitches, high/low repair and low leaf are required')
    for obj in list(gamePart.children_recursive):
        if obj.get('GameGenerator')==generator:
            mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
            if mesh.users==0:bpy.data.meshes.remove(mesh)
    oldTree,newTree,leafTree=Tree(patch),Tree(lowPatch),Tree(leaf)
    evaluated=source.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    try:
        adjacency=[[]for v in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices;adjacency[a].append(b);adjacency[b].append(a)
        unseen=set(range(len(mesh.vertices)));components=[]
        while unseen:
            first=unseen.pop();component=[first];queue=[first]
            while queue:
                vertex=queue.pop()
                for other in adjacency[vertex]:
                    if other in unseen:unseen.remove(other);queue.append(other);component.append(other)
            # Real needle stitches have nine stations of seven tube vertices;
            # the two six-station loose ends are deliberately not fabricated.
            if len(component)==63:components.append(sorted(component))
        points=[source.matrix_world@v.co for v in mesh.vertices]
        patchPoints=[patch.matrix_world@v.co for v in patch.data.vertices]
        minX,maxX=min(p.x for p in patchPoints),max(p.x for p in patchPoints)
        minZ,maxZ=min(p.z for p in patchPoints),max(p.z for p in patchPoints)
        groups={0:[],1:[],2:[],3:[]}
        for component in components:
            center=sum((points[i]for i in component),Vector())/len(component)
            distances=(abs(center.z-minZ),abs(center.z-maxZ),abs(center.x-minX),abs(center.x-maxX))
            edge=min(range(4),key=lambda index:distances[index])
            groups[edge].append((center.x if edge<2 else center.z,component))
        selected=[]
        for edge in range(4):
            available=sorted(groups[edge],key=lambda row:row[0])
            if len(available)<6:raise RuntimeError('Not enough actual stitches on repair edge '+str((edge,len(available))))
            indices=[round(index*(len(available)-1)/5)for index in range(6)]
            selected.extend((edge,available[index][1])for index in indices)
        uvLayer=mesh.uv_layers.get('UVMap')or mesh.uv_layers.active
        if uvLayer is None:raise RuntimeError('Actual high thread UV is missing')
        vertexUv={}
        for loop in mesh.loops:
            if loop.vertex_index not in vertexUv:vertexUv[loop.vertex_index]=tuple(uvLayer.data[loop.index].uv)
        positions,uvs,faces,details=[],[],[],[];maximumShift=0;maximumBias=0
        intoGame=gamePart.matrix_world.inverted_safe()
        for edge,component in selected:
            rings=[[points[index]for index in component[row*7:(row+1)*7]]for row in range(9)]
            centers=[sum(ring,Vector())/7 for ring in rings]
            tangent=centers[-1]-centers[0]
            if tangent.length<1e-5:raise RuntimeError('Actual hand stitch collapsed before sampling')
            width=Vector((0,-1,0)).cross(tangent).normalized()
            corners=[]
            for row in (0,8):
                dots=[point.dot(width)for point in rings[row]]
                across=(min(range(7),key=lambda i:dots[i]),max(range(7),key=lambda i:dots[i]))
                for column in across:
                    index=component[row*7+column];point=points[index].copy();originalY=point.y
                    old,new=Hit(oldTree,point),Hit(newTree,point)
                    if old is not None and new is not None:point.y+=new.y-old.y-.00010
                    maximumShift=max(maximumShift,abs(point.y-originalY))
                    hits=[hit for hit in (Hit(newTree,point),Hit(leafTree,point))if hit is not None]
                    if not hits:raise RuntimeError('No actual low repair/leaf beneath stitch ribbon')
                    surface=min(hit.y for hit in hits);before=point.y
                    point.y=min(point.y,surface-.00030)
                    maximumBias=max(maximumBias,before-point.y)
                    corners.append((intoGame@point,vertexUv[index]))
            start=len(positions);positions.extend(tuple(p)for p,uv in corners);uvs.extend(uv for p,uv in corners)
            face=(start,start+1,start+3,start+2)
            normal=(Vector(positions[face[1]])-Vector(positions[face[0]])).cross(Vector(positions[face[2]])-Vector(positions[face[0]]))
            if normal.y>0:face=tuple(reversed(face))
            faces.append(face)
            details.append({'sourceFirstVertex':component[0],'repairEdge':edge,
                            'actualSourceLengthM':tangent.length,
                            'actualSourceWidthM':sum((ring[0].dot(width)-min(p.dot(width)for p in ring))+(max(p.dot(width)for p in ring)-ring[0].dot(width))for ring in (rings[0],rings[-1]))/2})
        result=bpy.data.meshes.new('Geometry_GameRepairStitchRibbonsV10');result.from_pydata(positions,[],faces);result.update()
        uv=result.uv_layers.new(name='SurfaceUV')
        for loop in result.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
        material=bpy.data.materials.get('Material_GameRepairStitchClayV10')or bpy.data.materials.new('Material_GameRepairStitchClayV10')
        material.use_nodes=True;material.use_backface_culling=False
        shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.05,.04,.03,1);shader.inputs['Roughness'].default_value=.99
        result.materials.append(material)
        obj=bpy.data.objects.new('Game_RepairStitchRibbonsV10',result);bpy.context.scene.collection.objects.link(obj);obj.parent=gamePart
        obj['GameGenerator']=generator;obj['SourceHighObject']=source.name;obj['BakeSourceNames']=Name(source)
        obj['PackSourceName']=Name(source);obj['GameTwoSidedCloth']=True;obj['ActualHighStitchCount']=24
        partTriangles=sum(Count(item)for item in gamePart.children_recursive if item.type=='MESH')
        packTriangles=sum(Count(item)for item in gamePart.parent.children_recursive if item.type=='MESH')
        if Count(obj)!=48 or partTriangles>partBudget or packTriangles>3000:
            bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(result)
            raise RuntimeError('Measured actual stitch/part/pack budget failed: '+str((48,partTriangles,packTriangles)))
        return {'generator':generator,'object':obj.name,'triangles':48,'actualHighStitches':24,
                'sourceObject':source.name,'bodyTrianglesAfter':partTriangles,'partTriangleLimit':partBudget,'packTrianglesAfter':packTriangles,
                'sourceGeometryUnchanged':True,'sourceUvPreserved':True,'maxPatchConformanceShiftM':maximumShift,
                'maxAdditionalOutwardBiasM':maximumBias,'stitches':details}
    finally:evaluated.to_mesh_clear()
