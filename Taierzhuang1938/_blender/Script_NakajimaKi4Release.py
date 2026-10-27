"""Finish a protected reference author and derive the independently saved game mesh.

Run through Script_BlenderMcp.mjs. Stages are explicit so a long bake never
requires overwriting the protected V47 author. Photo-fit failures stay recorded.
"""
import bpy, bmesh, pathlib, json, hashlib, math, os, ast, time
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4Release.py')).resolve()
repo = scriptPath.parents[2]
asset = pathlib.Path(os.environ.get('KI4_RELEASE_ASSET_ROOT', str(repo / 'tmp/NakajimaKi4/ReferenceV48_GameRelease')))
sourceRoot = pathlib.Path(os.environ.get('KI4_RELEASE_SOURCE_ROOT', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV48_GameRelease'))
stage = os.environ.get('KI4_RELEASE_STAGE', 'repair')
root = bpy.data.objects['NakajimaKi4']


def Hash(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def Record(name, value):
    for folder in [asset / 'Evidence', sourceRoot / 'Evidence']:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf8')


def Helper(name):
    path = scriptPath.with_name(name)
    ns = {'__file__': str(path)}
    exec(compile(path.read_text(encoding='utf8'), str(path), 'exec'), ns)
    return ns


def ArchiveScripts():
    for path in sorted(scriptPath.parent.glob('Script_NakajimaKi4*.py')):
        block = bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name)
        block.clear(); block.write(path.read_text(encoding='utf8')); block.use_fake_user = True


def SaveHigh():
    ArchiveScripts()
    bpy.context.scene['BlenderMcpTask'] = 'NakajimaKi4'
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot / 'Scene_NakajimaKi4.blend'))


def Hull(points):
    points = sorted(set(tuple(point) for point in points))
    def Cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    halves = []
    for values in [points, list(reversed(points))]:
        half = []
        for point in values:
            while len(half) >= 2 and Cross(half[-2], half[-1], point) <= 1e-14: half.pop()
            half.append(point)
        halves.append(half[:-1])
    return [Vector(point) for point in halves[0] + halves[1]]


def OpeningPaths():
    """Sweep complete actual backing outlines along the audit's exit rays.

    The margin is buried under the outer service panel/rim. Only residual
    internal monocoque is clipped; visible cover/rim meshes are untouched.
    """
    axis = float(root['bodyLongitudinalAxisHeightM']); cuts = []
    for obj in root.children_recursive:
        if obj.type != 'MESH' or not (obj.name.startswith('EngineLouvre') and 'Backing' in obj.name): continue
        side = -1 if obj.name.endswith('-1') else 1
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        radius = sum(math.hypot(point.x, point.z-axis) for point in points)/len(points)
        domain = [Vector((point.y, math.atan2(side*point.x, point.z-axis)*radius)) for point in points]
        # Minkowski expansion of the complete convex mouth, not a patch around
        # individual failing ray samples. 14mm also retains the 12mm cavity gate.
        margin = .014
        expanded = [point + Vector((math.cos(i*math.pi/4), math.sin(i*math.pi/4)))*margin
                    for point in domain for i in range(8)]
        path = Hull(expanded)
        cuts.append({'name': obj.name, 'side': side, 'radius': radius, 'axis': axis, 'path': path,
                     'marginM': margin, 'min': [min(p[k] for p in path) for k in range(2)],
                     'max': [max(p[k] for p in path) for k in range(2)]})
    assert len(cuts) == 8
    return cuts


def RepairServiceSkin(obj, cuts):
    """Clip triangle payloads, interpolating every UV layer and corner normal."""
    original = obj.data; original.calc_loop_triangles(); original.update()
    layers = [layer.name for layer in original.uv_layers]
    assert layers == ['UVMap', 'GeometryAO']
    vertices = []; faces = []; payloads = []; settings = []; vertexMap = {}
    removed = 0.; changed = 0; retainedOriginal = 0
    def Cross(a, b, p): return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)
    def Split(polygon, a, b):
        inside = []; outside = []
        for previous, current in zip(polygon[-1:] + polygon[:-1], polygon):
            d0 = Cross(a, b, previous[-1]); d1 = Cross(a, b, current[-1])
            if (d0 >= 0) != (d1 >= 0):
                factor = d0/(d0-d1)
                middle = tuple(x.lerp(y, factor) for x, y in zip(previous, current))
                inside.append(middle); outside.append(middle)
            (inside if d1 >= 0 else outside).append(current)
        return inside, outside
    def Subtract(polygon, path):
        if any(all(Cross(a,b,p[-1]) < 0 for p in polygon) for a,b in zip(path,path[1:]+path[:1])): return [polygon]
        outside = []; inside = polygon
        for a,b in zip(path,path[1:]+path[:1]):
            if len(inside) < 3: break
            inside, fragment = Split(inside,a,b)
            if len(fragment) >= 3: outside.append(fragment)
        return outside
    def Emit(polygon, material, smooth):
        nonlocal retainedOriginal
        for i in range(1,len(polygon)-1):
            corners = [polygon[k] for k in [0,i,i+1]]
            if (corners[1][0]-corners[0][0]).cross(corners[2][0]-corners[0][0]).length < 1e-12: continue
            ids = []
            for corner in corners:
                key = tuple(round(v*1e9) for v in corner[0])
                if key not in vertexMap: vertexMap[key] = len(vertices); vertices.append(corner[0])
                ids.append(vertexMap[key])
            if len(set(ids))!=3: continue
            faces.append(ids); payloads.append(corners); settings.append((material,smooth))
    for tri in original.loop_triangles:
        poly = original.polygons[tri.polygon_index]
        polygon = [tuple([original.vertices[vertex].co.copy()] +
                         [layer.data[loop].uv.copy() for layer in original.uv_layers] +
                         [original.corner_normals[loop].vector.copy(),Vector((0.,0.))])
                   for vertex,loop in zip(tri.vertices,tri.loops)]
        fragments = [polygon]
        for cut in cuts:
            values = [obj.matrix_world @ corner[0] for corner in polygon]
            if all(point.x*cut['side'] <= 0 for point in values): continue
            projectedFragments = []
            for fragment in fragments:
                projected = []
                for corner in fragment:
                    point = obj.matrix_world @ corner[0]
                    domain = Vector((point.y, math.atan2(cut['side']*point.x, point.z-cut['axis'])*cut['radius']))
                    projected.append(corner[:-1]+(domain,))
                if any(max(p[-1][k] for p in projected)<cut['min'][k] or min(p[-1][k] for p in projected)>cut['max'][k] for k in range(2)):
                    projectedFragments.append(projected)
                else: projectedFragments.extend(Subtract(projected,cut['path']))
            fragments = projectedFragments
        area = sum((p[i][0]-p[0][0]).cross(p[i+1][0]-p[0][0]).length/2 for p in fragments for i in range(1,len(p)-1))
        delta = max(0.,tri.area-area)
        if delta > 1e-10: changed += 1; removed += delta
        else: retainedOriginal += 1
        for fragment in fragments: Emit(fragment,poly.material_index,poly.use_smooth)
    mesh = bpy.data.meshes.new(original.name+'_ActualServiceRepair')
    mesh.from_pydata(vertices,[],faces); mesh.update()
    for mat in original.materials: mesh.materials.append(mat)
    for name in layers: mesh.uv_layers.new(name=name)
    normals = []
    for poly,corners,(material,smooth) in zip(mesh.polygons,payloads,settings):
        poly.material_index=material; poly.use_smooth=smooth
        for loop,corner in zip(poly.loop_indices,corners):
            for k in range(len(layers)): mesh.uv_layers[k].data[loop].uv=corner[k+1]
            normals.append(tuple(corner[-2].normalized()))
    assert not mesh.validate(verbose=True,clean_customdata=False), 'Clipping must create valid mesh topology'
    for edge in mesh.edges: edge.use_edge_sharp=True
    # Rebuild corner-normal spaces after all smoothing/sharp attributes are
    # assigned (Blender 5.2 otherwise retains a stale corner-space cache).
    obj.data=mesh
    mesh.update(calc_edges=True)
    bpy.context.view_layer.update()
    assert len(normals)==len(mesh.loops) and all(math.isfinite(v) for n in normals for v in n)
    mesh.calc_loop_triangles()
    _=len(mesh.corner_normals)
    mesh.normals_split_custom_set(normals)
    mesh.uv_layers.active_index=0; mesh.uv_layers[0].active_render=True
    obj.data=mesh
    assert 0 < removed < .05, ('Bound repair to small internal remnants',removed)
    return {'name':obj.name,'trianglesBefore':len(original.loop_triangles),'trianglesAfter':len(faces),
            'cutOriginalTriangles':changed,'retainedOriginalTriangles':retainedOriginal,'removedSkinAreaM2':removed,
            'uvLayersInterpolated':layers,'customCornerNormalsInterpolated':True,'materialAndSmoothingRetained':True,
            'cuts':[{'name':c['name'],'marginM':c['marginM'],'domain':'ActualWorldY_RadiusTimesTheta'} for c in cuts]}


def Export(path):
    bpy.ops.object.select_all(action='DESELECT'); root.select_set(True)
    for obj in root.children_recursive: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    modifiers=[]
    try:
        for obj in root.children_recursive:
            if obj.type=='MESH' and any(len(poly.vertices)>4 for poly in obj.data.polygons):
                modifier=obj.modifiers.new('ReleaseExportTriangulation','TRIANGULATE')
                if hasattr(modifier,'keep_custom_normals'):modifier.keep_custom_normals=True
                modifiers.append((obj,modifier))
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,
                                  export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,
                                  export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    finally:
        for obj,modifier in modifiers:obj.modifiers.remove(modifier)


def MaterialAoImage(material):
    if not material.use_nodes: return None
    settings=next((n for n in material.node_tree.nodes if n.type=='GROUP' and n.node_tree and n.node_tree.name=='glTF Material Output'),None)
    if not settings or not settings.inputs['Occlusion'].is_linked: return None
    node=settings.inputs['Occlusion'].links[0].from_node
    visited=set()
    while node not in visited:
        visited.add(node)
        if node.type=='TEX_IMAGE': return node.image
        links=[link for socket in node.inputs for link in socket.links]
        if len(links)!=1: return None
        node=links[0].from_node
    return None


def RebakeCurrentAo(onlyImages=None):
    """Keep existing UV domains and rebake every currently assigned AO atlas.

    All static receivers see current static casters. Moving receivers see only
    their nearest-pivot rigid group, so shadows do not freeze across joints.
    """
    helper=Helper('Script_NakajimaKi4GeometryAo.py')
    opaque=[o for o in root.children_recursive if o.type=='MESH' and not helper['AoGlass'](o)]
    rivet=bpy.data.objects['Surface_FlushRivetHeads']
    assignments={}
    for obj in opaque:
        images={MaterialAoImage(mat) for mat in obj.data.materials}
        assert len(images)==1 and None not in images,obj.name
        assignments.setdefault(next(iter(images)),[]).append(obj)
    if onlyImages is not None:assignments={image:objects for image,objects in assignments.items() if image.name in onlyImages}
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'
    scene.cycles.samples=1; scene.cycles.use_denoising=False
    scene.render.threads_mode='FIXED'; scene.render.threads=min(12,os.cpu_count() or 4)
    hide={obj:obj.hide_render for obj in scene.objects}
    results=[]; started=time.time()
    for oldImage,receivers in sorted(assignments.items(),key=lambda pair:pair[0].name):
        imageStarted=time.time(); name=oldImage.name; width,height=oldImage.size
        image=bpy.data.images.new('Temp_Release_'+name,width=width,height=height,alpha=False,float_buffer=True)
        image.colorspace_settings.name='Non-Color'; image.generated_color=(1,1,1,1)
        pixels=np.ones(width*height*4,dtype=np.float32); image.pixels.foreach_set(pixels)
        temporary={}
        def BakeMaterial(original):
            if original in temporary: return temporary[original]
            mat=bpy.data.materials.new('Temp_ReleaseAo_'+original.name); mat.use_nodes=True
            nodes=mat.node_tree.nodes; links=mat.node_tree.links; nodes.clear()
            output=nodes.new('ShaderNodeOutputMaterial'); emission=nodes.new('ShaderNodeEmission')
            ao=nodes.new('ShaderNodeAmbientOcclusion'); ao.samples=64
            ao.inputs['Distance'].default_value=2.; ao.only_local=False
            links.new(ao.outputs['AO'],emission.inputs['Color'])
            micro=next((n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name),None)
            if micro:
                uv=nodes.new('ShaderNodeUVMap'); uv.uv_map='UVMap'
                tex=nodes.new('ShaderNodeTexImage'); tex.image=micro
                separate=nodes.new('ShaderNodeSeparateColor'); multiply=nodes.new('ShaderNodeMath'); multiply.operation='MULTIPLY'
                links.new(uv.outputs['UV'],tex.inputs['Vector']); links.new(tex.outputs['Color'],separate.inputs['Color'])
                links.new(ao.outputs['AO'],multiply.inputs[0]); links.new(separate.outputs['Red'],multiply.inputs[1])
                links.new(multiply.outputs[0],emission.inputs['Color'])
            links.new(emission.outputs['Emission'],output.inputs['Surface'])
            target=nodes.new('ShaderNodeTexImage'); target.image=image; nodes.active=target
            temporary[original]=mat
            return mat
        groups={}
        for obj in receivers:
            if obj!=rivet: groups.setdefault(helper['AoMovingGroup'](obj),[]).append(obj)
        batches=[]
        try:
            for group,objects in sorted(groups.items()):
                for obj in scene.objects:
                    if obj.type in ['MESH','CURVE']: obj.hide_render=True
                selected=set(objects)
                for caster in opaque:
                    if caster!=rivet and caster not in selected and helper['AoMovingGroup'](caster)==group: caster.hide_render=False
                proxy,_=helper['AoProxy'](objects,'Temp_ReleaseAoProxy',True)
                slots=list(proxy.data.materials); proxy.data.materials.clear()
                for mat in slots: proxy.data.materials.append(BakeMaterial(mat))
                proxy.hide_render=False; bpy.ops.object.select_all(action='DESELECT'); proxy.select_set(True)
                bpy.context.view_layer.objects.active=proxy; bpy.context.view_layer.update()
                print('Release AO',name,group,len(objects),flush=True)
                try: bpy.ops.object.bake(type='EMIT',use_clear=False,use_selected_to_active=False,margin=4,uv_layer='GeometryAO')
                finally: helper['RemoveAoProxy'](proxy)
                batches.append({'rigidGroup':group,'receivers':len(objects)})
        finally:
            for obj,value in hide.items(): obj.hide_render=value
            for mat in temporary.values(): bpy.data.materials.remove(mat)
        image.pixels.foreach_get(pixels); pixels=pixels.reshape(height,width,4)
        broad=[o for o in receivers if o.name=='Fuselage_Monocoque' or o.name.startswith(('Propeller_Blade','Tire_'))]
        seams=Helper('Script_NakajimaKi4AoSeams.py')['StitchAoSeams'](broad,pixels,protectedStrip=.05 if rivet in receivers else 0.) if broad else None
        if rivet in receivers:
            # Each physical head has one exact atlas sample. Recompute against
            # current fixed geometry at its actual transformed top surface.
            from mathutils.kdtree import KDTree
            tree=helper['ServiceAuditTree'](opaque) if 'ServiceAuditTree' in helper else Helper('Script_NakajimaKi4ServiceAudit.py')['ServiceAuditTree']([o for o in opaque if o!=rivet and helper['AoMovingGroup'](o)=='Fixed'])
            mesh=rivet.data; todo=set(range(len(mesh.vertices))); neighbors=[[] for _ in mesh.vertices]
            for edge in mesh.edges:
                a,b=edge.vertices; neighbors[a].append(b); neighbors[b].append(a)
            components=[]
            while todo:
                stack=[todo.pop()]; ids=[]
                while stack:
                    vertex=stack.pop(); ids.append(vertex)
                    for other in neighbors[vertex]:
                        if other in todo: todo.remove(other); stack.append(other)
                components.append(ids)
            assert len(components)==1512
            uvByVertex={loop.vertex_index:mesh.uv_layers['GeometryAO'].data[loop.index].uv.copy() for loop in mesh.loops}
            sampleUvs=[uvByVertex[ids[0]] for ids in components]
            def CellStep(axis):
                positions=sorted(set(round(uv[axis],7) for uv in sampleUvs))
                return min(b-a for a,b in zip(positions,positions[1:]) if b-a>1e-6)
            stepU=CellStep(0);stepV=CellStep(1)
            values=[]
            for ids in components:
                points=[rivet.matrix_world@mesh.vertices[i].co for i in ids]
                center=sum(points,Vector())/len(points); hit,normal,_,_=tree.find_nearest(center)
                if normal.dot(center-hit)<0: normal=-normal
                origin=max(points,key=lambda point:point.dot(normal))+normal*.0005
                along=normal.orthogonal().normalized(); cross=normal.cross(along).normalized(); blocked=0
                for i in range(128):
                    u=(i+.5)/128; phi=2*math.pi*((i*.618033988749895)%1)
                    direction=along*(math.sqrt(u)*math.cos(phi))+cross*(math.sqrt(u)*math.sin(phi))+normal*math.sqrt(1-u)
                    if tree.ray_cast(origin,direction,2.)[0] is not None: blocked+=1
                value=1-blocked/128; values.append(value); uv=uvByVertex[ids[0]]
                x0=round((uv.x-stepU/2)*width);x1=round((uv.x+stepU/2)*width)
                y0=round((uv.y-stepV/2)*height);y1=round((uv.y+stepV/2)*height)
                pixels[y0:y1,x0:x1,:3]=value
            batches.append({'physicalRivetHeads':1512,'raysPerHead':128,'minimum':min(values)})
        assert np.isfinite(pixels).all() and pixels[:,:,:3].min()>=0 and pixels[:,:,:3].max()<=1.00001
        image.pixels.foreach_set(pixels.ravel()); image.update(); image.file_format='PNG'
        image.filepath_raw=str(sourceRoot/'Textures'/(name+'.png')); image.save(); image.pack()
        for mat in bpy.data.materials:
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if getattr(node,'image',None)==oldImage: node.image=image
        bpy.data.images.remove(oldImage); image.name=name
        row={'image':name,'resolution':[width,height],'samples':64,'distanceM':2.,'groups':batches,
             'seams':seams,'minimum':float(pixels[:,:,:3].min()),'seconds':time.time()-imageStarted,
             'packedSha256':hashlib.sha256(image.packed_file.data).hexdigest()}
        results.append(row); Record('Data_ReleaseAoProgress.json',results)
    root['geometryAoPending']=False
    root['geometryAoReleaseRebaked']=True
    root['geometryAo']['releaseAtlasNames']=sorted(set(root['geometryAo'].get('releaseAtlasNames',[]))|{row['image'] for row in results})
    root['geometryAo']['releaseBakePolicy']='Current full same-rigid-group assembly; existing UV0/UV1 retained'
    return {'state':'AllAssignedCurrentGeometryAoRebaked','atlases':results,'seconds':time.time()-started,
            'primaryUvAndGeometryUnchanged':True,'sameRigidGroupOnly':True}


def MeshTree(mesh):
    mesh.calc_loop_triangles()
    return BVHTree.FromPolygons([v.co for v in mesh.vertices],[tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True)


def TransformMeshCornerField(mesh,matrix):
    normals=[(matrix.to_3x3().inverted().transposed()@n.vector).normalized() for n in mesh.corner_normals]
    mesh.transform(matrix);mesh.update(calc_edges=True);mesh.calc_loop_triangles();_=len(mesh.corner_normals)
    mesh.normals_split_custom_set(normals)


def ExactTriangleCopy(original):
    original.calc_loop_triangles();triangles=list(original.loop_triangles)
    mesh=bpy.data.meshes.new(original.name+'_ExplicitGameTriangles')
    mesh.from_pydata([v.co for v in original.vertices],[],[tuple(t.vertices) for t in triangles]);mesh.update()
    for mat in original.materials:mesh.materials.append(mat)
    for layer in original.uv_layers:
        uv=mesh.uv_layers.new(name=layer.name)
        for poly,tri in zip(mesh.polygons,triangles):
            for target,sourceLoop in zip(poly.loop_indices,tri.loops):uv.data[target].uv=layer.data[sourceLoop].uv
    normals=[]
    for poly,tri in zip(mesh.polygons,triangles):
        sourcePoly=original.polygons[tri.polygon_index];poly.material_index=sourcePoly.material_index;poly.use_smooth=sourcePoly.use_smooth
        normals.extend(tuple(original.corner_normals[index].vector) for index in tri.loops)
    for edge in mesh.edges:edge.use_edge_sharp=True
    mesh.update(calc_edges=True);mesh.calc_loop_triangles();_=len(mesh.corner_normals);mesh.normals_split_custom_set(normals)
    mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
    return mesh


def ProtectedPlanarCandidate(original,degrees):
    """Reduce skin edges while keeping the exact triangulation of warped caps.

    Passing a nonplanar ngon through a Decimate modifier can silently choose a
    different cap triangulation even at a near-one ratio. Preserve the original
    evaluated triangle surface explicitly, and exclude those caps and every UV
    chart boundary from the planar operation.
    """
    original.calc_loop_triangles();triangles=list(original.loop_triangles)
    mesh=bpy.data.meshes.new(original.name+'_ProtectedPlanarGame')
    mesh.from_pydata([v.co for v in original.vertices],[],[tuple(t.vertices) for t in triangles]);mesh.update()
    for mat in original.materials:mesh.materials.append(mat)
    for layer in original.uv_layers:
        uv=mesh.uv_layers.new(name=layer.name)
        for poly,tri in zip(mesh.polygons,triangles):
            for target,sourceLoop in zip(poly.loop_indices,tri.loops):uv.data[target].uv=layer.data[sourceLoop].uv
    caps=mesh.attributes.new('ReleaseProtectedCap','INT','FACE')
    for poly,tri in zip(mesh.polygons,triangles):
        sourcePoly=original.polygons[tri.polygon_index];poly.material_index=sourcePoly.material_index;poly.use_smooth=sourcePoly.use_smooth
        caps.data[poly.index].value=int(len(sourcePoly.vertices)>4)
    bm=bmesh.new();bm.from_mesh(mesh);bm.normal_update()
    cap=bm.faces.layers.int.get('ReleaseProtectedCap');uvLayers=list(bm.loops.layers.uv.values())
    def UvBoundary(edge):
        if len(edge.link_faces)!=2:return True
        for vertex in edge.verts:
            loops=[next(loop for loop in face.loops if loop.vert==vertex)for face in edge.link_faces]
            for layer in uvLayers:
                if (loops[0][layer].uv-loops[1][layer].uv).length>1e-6:return True
        return False
    allowed=[edge for edge in bm.edges if not any(face[cap] for face in edge.link_faces) and not UvBoundary(edge)]
    permitted=set(allowed);verts=[v for v in bm.verts if all(e in permitted for e in v.link_edges)]
    bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(degrees),use_dissolve_boundaries=False,
                            verts=verts,edges=allowed,delimit={'MATERIAL'})
    bm.to_mesh(mesh);bm.free();mesh.update();mesh.calc_loop_triangles()
    return mesh


def SurfaceSamples(mesh):
    mesh.calc_loop_triangles()
    points=[v.co.copy() for v in mesh.vertices]
    for tri in mesh.loop_triangles:
        a,b,c=[mesh.vertices[i].co for i in tri.vertices]
        points.extend([(a+b+c)/3,(a+b)/2,(b+c)/2,(c+a)/2])
    return points


def MeshTopology(mesh):
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6)
    value=(sum(not edge.is_manifold for edge in bm.edges),len(bm.verts)-len(bm.edges)+len(bm.faces))
    bm.free(); return value


def TransferCornerNormals(original,candidate):
    """Keep the actual high corner field on the matching side of every crease."""
    from mathutils.geometry import barycentric_transform
    original.calc_loop_triangles(); triangles=list(original.loop_triangles); tree=MeshTree(original)
    normals=[]; distances=[]; fallbacks=0
    for poly in candidate.polygons:
        face=poly.normal.copy()
        for index in poly.loop_indices:
            point=candidate.vertices[candidate.loops[index].vertex_index].co
            hit,normal,triangleIndex,distance=tree.find_nearest(point)
            nearby=tree.find_nearest_range(point,max(.00002,distance+.00001))
            compatible=[r for r in nearby if triangles[r[2]].normal.dot(face)>.65]
            if compatible: hit,normal,triangleIndex,distance=min(compatible,key=lambda r:r[3])
            else: fallbacks+=1
            triangle=triangles[triangleIndex]
            a,b,c=[original.vertices[i].co for i in triangle.vertices]
            na,nb,nc=[original.corner_normals[i].vector.copy() for i in triangle.loops]
            normals.append(tuple(barycentric_transform(hit,a,b,c,na,nb,nc).normalized())); distances.append(distance)
    for edge in candidate.edges: edge.use_edge_sharp=True
    candidate.update(calc_edges=True); candidate.calc_loop_triangles(); _=len(candidate.corner_normals)
    candidate.normals_split_custom_set(normals)
    return {'corners':len(normals),'maxProjectionDistanceM':max(distances),'orientationFallbacks':fallbacks}


def RivetCandidate(original):
    assert len(original.vertices)==1512*24
    vertices=[];faces=[];uvs=[];aoUvs=[]
    uvPerVertex={loop.vertex_index:original.uv_layers['GeometryAO'].data[loop.index].uv.copy() for loop in original.loops}
    for index in range(1512):
        points=[original.vertices[index*24+i].co for i in range(24)]
        centers=[sum((points[ring*8+j] for j in range(8)),Vector())/8 for ring in range(3)]
        normal=(centers[2]-centers[0]).normalized(); along=(points[0]-centers[0]).normalized(); cross=normal.cross(along).normalized()
        point=centers[0]-normal*.00008; base=len(vertices)
        for radius,height in [(.0028,.00008),(.0021,.00050),(.0006,.00068)]:
            for i in range(5):
                angle=2*math.pi*i/5
                vertices.append(point+normal*height+along*(radius*math.cos(angle))+cross*(radius*math.sin(angle)))
                uvs.append((.5+.48*math.cos(angle),.5+.48*math.sin(angle)));aoUvs.append(uvPerVertex[index*24])
        for ring in range(2):
            for i in range(5):
                j=(i+1)%5;faces.append((base+ring*5+i,base+ring*5+j,base+(ring+1)*5+j,base+(ring+1)*5+i))
        faces.append(tuple(base+10+i for i in range(5)))
    mesh=bpy.data.meshes.new('Mesh_FlushRivetReleaseGame5');mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap');ao=mesh.uv_layers.new(name='GeometryAO')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for loop in poly.loop_indices:
            index=mesh.loops[loop].vertex_index; uv.data[loop].uv=uvs[index];ao.data[loop].uv=aoUvs[index]
    for mat in original.materials:mesh.materials.append(mat)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
    return mesh


def EngineCandidate(obj,original,settings):
    """Regular tessellation keeps every cooling layer and axial cap intact."""
    if obj.name.startswith('RockerCover'):
        radius=[max(abs(v.co[i]) for v in original.vertices) for i in range(3)]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=settings[0],ring_count=settings[1],location=(0,0,0))
        temporary=bpy.context.object
        for vertex in temporary.data.vertices:
            for axis in range(3):vertex.co[axis]*=radius[axis]
    else:
        radius=max(math.hypot(v.co.x,v.co.y) for v in original.vertices)
        low=min(v.co.z for v in original.vertices);high=max(v.co.z for v in original.vertices)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8 if obj.name.startswith('Pushrod') else 16,radius=radius,depth=high-low,location=(0,0,0))
        temporary=bpy.context.object
        for vertex in temporary.data.vertices:vertex.co.z+=(low+high)/2
    mesh=temporary.data;mesh.update();mesh.name=original.name+'_RegularGame'
    mesh.uv_layers[0].name='UVMap'
    tree=MeshTree(original);triangles=list(original.loop_triangles)
    from mathutils.geometry import barycentric_transform
    for poly in mesh.polygons:
        poly.use_smooth=abs(poly.normal.z)<.5 if not obj.name.startswith('RockerCover') else True
        centerHit=tree.find_nearest(poly.center);centerTri=triangles[centerHit[2]]
        centerUv=sum((original.uv_layers[0].data[i].uv for i in centerTri.loops),Vector((0,0)))/3
        for loop in poly.loop_indices:
            point=mesh.vertices[mesh.loops[loop].vertex_index].co
            hit=tree.find_nearest(point)
            nearby=tree.find_nearest_range(point,max(.0021,hit[3]+.00001))
            compatible=[r for r in nearby if triangles[r[2]].normal.dot(poly.normal)>.65]
            if compatible:
                # Choose the chart on this face's side of a cylindrical seam.
                hit=min(compatible,key=lambda r:r[3]+.01*(sum((original.uv_layers[0].data[i].uv for i in triangles[r[2]].loops),Vector((0,0)))/3-centerUv).length)
            tri=triangles[hit[2]];a,b,c=[original.vertices[i].co for i in tri.vertices]
            u,v,w=[Vector((*original.uv_layers[0].data[i].uv,0)) for i in tri.loops]
            mesh.uv_layers[0].data[loop].uv=barycentric_transform(hit[0],a,b,c,u,v,w)[:2]
    for mat in original.materials:mesh.materials.append(mat)
    bpy.data.objects.remove(temporary,do_unlink=True)
    return mesh


def BakeGameEngine(objects):
    helpers=Helper('Script_NakajimaKi4GeometryAo.py')
    previous=[image for image in bpy.data.images if image.name.startswith('Texture_Ki4GameMetalGeometryAo')]
    image=bpy.data.images.new('Temp_ReleaseGameMetalAo',width=2048,height=2048,alpha=False,float_buffer=True)
    image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    materials={}
    for obj in objects:
        for index,original in enumerate(list(obj.data.materials)):
            baseName=original.name.removesuffix('_GameEngine')
            if baseName not in materials:
                mat=bpy.data.materials[baseName]
                nodes=mat.node_tree.nodes;links=mat.node_tree.links
                uv=nodes.new('ShaderNodeUVMap');uv.uv_map='GeometryAO'
                tex=nodes.new('ShaderNodeTexImage');tex.image=image;separate=nodes.new('ShaderNodeSeparateColor')
                links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],separate.inputs['Color'])
                settings=next(n for n in nodes if n.type=='GROUP' and n.node_tree and n.node_tree.name=='glTF Material Output')
                links.new(separate.outputs['Red'],settings.inputs['Occlusion']);materials[baseName]=mat
            obj.data.materials[index]=materials[baseName]
        if not obj.data.uv_layers.get('GeometryAO'):obj.data.uv_layers.new(name='GeometryAO')
    rivet=bpy.data.objects['Surface_FlushRivetHeads']
    targets=[obj for obj in objects if obj!=rivet]
    proxy,mapping=helpers['AoProxy'](targets,'Temp_GameEngineUnwrap',True)
    proxy.data.uv_layers.active=proxy.data.uv_layers['GeometryAO']
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002,correct_aspect=False,scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION',shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i,(obj,index) in enumerate(mapping):
        uv=proxy.data.uv_layers['GeometryAO'].data[i].uv
        obj.data.uv_layers['GeometryAO'].data[index].uv=(uv.x,.05+.95*uv.y)
    helpers['RemoveAoProxy'](proxy)
    for obj in objects:obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    assert len(rivet.data.vertices)==1512*15
    for loop in rivet.data.loops:
        index=loop.vertex_index//15
        rivet.data.uv_layers['GeometryAO'].data[loop.index].uv=((index%84+.5)/84,.05*(index//84+.5)/18)
    for material in bpy.data.materials:
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if getattr(node,'image',None) in previous:node.image=image
    for oldImage in previous:bpy.data.images.remove(oldImage)
    image.name='Texture_Ki4GameMetalGeometryAo'
    return RebakeCurrentAo({'Texture_Ki4GameMetalGeometryAo'})


def RefineWingCaps(records):
    byName={row['name']:row for row in records}
    for name in ['UpperWing_MainLeft','UpperWing_MainRight','Aileron_Left','Aileron_Right']:
        row=byName[name];obj=bpy.data.objects[name];original=obj.data
        assert row['after']==row['before'], 'Cap refinement starts from the retained full reference surface'
        high=MeshTree(original);samples=SurfaceSamples(original);prepared=ProtectedPlanarCandidate(original,0)
        cap=prepared.attributes['ReleaseProtectedCap']
        capVertices={i for poly in prepared.polygons if cap.data[poly.index].value for i in poly.vertices}
        obj.data=prepared;bpy.context.view_layer.objects.active=obj
        group=obj.vertex_groups.new(name='Release_OnlyReduceWingSkin')
        group.add([v.index for v in prepared.vertices if v.index not in capVertices],1.,'REPLACE')
        attempts=[];selected=None
        for ratio in [.12,.15,.20,.25,.295,.35,.5,.7,.85,1.]:
            modifier=obj.modifiers.new('Release_ExactCapReduction','DECIMATE');modifier.ratio=ratio
            modifier.use_collapse_triangulate=True;modifier.vertex_group=group.name;modifier.vertex_group_factor=1000.
            dg=bpy.context.evaluated_depsgraph_get()
            candidate=bpy.data.meshes.new_from_object(obj.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
            obj.modifiers.remove(modifier);low=MeshTree(candidate)
            h=max(low.find_nearest(point)[3] for point in samples)
            l=max(high.find_nearest(point)[3] for point in SurfaceSamples(candidate));topology=MeshTopology(candidate)
            trial={'ratio':ratio,'triangles':len(candidate.loop_triangles),'highToLowMaxSampledSurfaceErrorM':h,
                   'lowToHighMaxSampledSurfaceErrorM':l,'topology':list(topology),'exactSourceCapTrianglesPrepared':True,
                   'protectedCapVertices':len(capVertices),'serviceExitProbesClear':True}
            attempts.append(trial)
            if max(h,l)<=row['surfaceToleranceM'] and topology==MeshTopology(original):selected=candidate;break
            bpy.data.meshes.remove(candidate)
        obj.vertex_groups.remove(group);obj.data=original;bpy.data.meshes.remove(prepared)
        assert selected is not None,(name,attempts)
        obj.data=selected;row['after']=len(selected.loop_triangles);row['selected']=attempts[-1]
        row['capPreservingAttempts']=attempts;row['normalTransfer']=TransferCornerNormals(original,selected)
        selected.uv_layers.active_index=0;selected.uv_layers[0].active_render=True
        print('Release exact-cap LOD',name,row['before'],row['after'],flush=True)
        Record('Data_ReleaseLodProgress.json',records)


def DeriveGame():
    assert root.get('geometryAoReleaseRebaked'), 'Bake the current high source before deriving'
    sourceHash=Hash(sourceRoot/'Scene_NakajimaKi4.blend')
    bpy.context.view_layer.update(); records=[];meshes=[o for o in root.children_recursive if o.type=='MESH']
    fabricFunctions={}
    helper=scriptPath.with_name('Script_NakajimaKi4Hinges.py');syntax=ast.parse(helper.read_text(encoding='utf8'))
    for name in ['CacheFabricSurfaceNormals','ProjectFabricSurfaceNormals']:
        node=next(n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name==name)
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(helper),'exec'),globals())
    fabricReferences={}
    if not root.get('gameDerivative'):
        fabricReferences={obj.name:CacheFabricSurfaceNormals([obj]) for obj in meshes if any(mat.name in ['Material_SilverDopedLinen','Material_DopedLinenTail']for mat in obj.data.materials)}
    if os.environ.get('KI4_RELEASE_RESUME')=='1':
        records=json.loads((asset/'Evidence/Data_ReleaseLodProgress.json').read_text(encoding='utf8'))
        for row in records:
            mesh=bpy.data.objects[row['name']].data;mesh.calc_loop_triangles()
            assert len(mesh.loop_triangles)==row['after'], 'Resume only the same unsaved in-memory derivative'
    completed={row['name'] for row in records}
    service=Helper('Script_NakajimaKi4ServiceAudit.py')
    sourceService,sourceProbes=service['AuditServiceSource'](root,{o.name:o for o in root.children_recursive})
    for obj in meshes:
        if obj.name in completed:continue
        bpy.context.view_layer.objects.active=obj
        for mod in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
        original=obj.data; original.calc_loop_triangles(); before=len(original.loop_triangles)
        shape=obj.name.startswith(('Fuselage','UpperWing','LowerWing','Aileron','Tailplane','Elevator','VerticalFin','Rudder')) and before>=1200
        engine=obj.name.startswith(('CylinderCoolingFin','RockerCover','Engine_Cylinder','Pushrod'))
        gear=obj.name.startswith(('Oleo_CoilSpring','Oleo_ConnectorHousing','Oleo_InnerGuide','Oleo_ExternalTube','Oleo_UpperSpringSeat','Oleo_LowerSpringSeat','WheelRim_','WheelHub_','TireMoldLine_'))
        propeller=obj.name.startswith('Propeller_Blade')
        rivet=obj.name=='Surface_FlushRivetHeads'
        if not (shape or engine or gear or propeller or rivet):continue
        highTree=MeshTree(original); highSamples=SurfaceSamples(original)
        topology=MeshTopology(original); attempts=[]; selected=None
        limit=.0008 if rivet else .0005 if propeller else float(obj.get('gameSurfaceToleranceM',.002))
        ratios=[.15,.2,.3,.35,.5,.7,.85,1.] if obj.name in ['VerticalFin','Rudder'] else [.295,.3,.35,.5,.7,.85,1.] if shape else [.38,.45,.5,.6,.7,.85,1.] if engine else [.08,.12,.18,.25,.35,.5,.7,.85,1.] if gear else [.2,.3,.4,.5,.7,.85,1.]
        if rivet:ratios=[5]
        if engine:ratios=[(16,10),(16,11),(18,10),(16,12),(18,11),(20,10)] if obj.name.startswith('RockerCover') else ['Regular16Or8']
        for ratio in ratios:
            if rivet:candidate=RivetCandidate(original)
            elif engine:candidate=EngineCandidate(obj,original,ratio)
            elif ratio==1.:candidate=original.copy()
            else:
                modifier=obj.modifiers.new('ReleaseGameReduction','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
                candidate=bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()),preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
                obj.modifiers.remove(modifier)
            candidate.calc_loop_triangles();lowTree=MeshTree(candidate)
            highToLow=max(lowTree.find_nearest(point)[3] for point in highSamples)
            lowToHigh=max(highTree.find_nearest(point)[3] for point in SurfaceSamples(candidate))
            candidateTopology=MeshTopology(candidate);aperturesClear=True
            if obj.name=='Fuselage_Monocoque':
                inv=obj.matrix_world.inverted()
                for name,center,outward in sourceProbes:
                    origin=inv@(center+outward*.0005);direction=(inv.to_3x3()@outward).normalized()
                    if lowTree.ray_cast(origin,direction,.10)[0] is not None:aperturesClear=False;break
            goodTopology=candidateTopology==topology if gear or engine or propeller else candidateTopology[0]<=topology[0]
            row={'ratio':ratio,'triangles':len(candidate.loop_triangles),'highToLowMaxSampledSurfaceErrorM':highToLow,
                 'lowToHighMaxSampledSurfaceErrorM':lowToHigh,'topology':list(candidateTopology),'serviceExitProbesClear':aperturesClear}
            attempts.append(row)
            if max(highToLow,lowToHigh)<=limit and goodTopology and aperturesClear:
                selected=candidate;break
            bpy.data.meshes.remove(candidate)
        assert selected is not None, (obj.name,attempts)
        obj.data=selected
        transfer=TransferCornerNormals(original,selected)
        selected.uv_layers.active_index=0; selected.uv_layers[0].active_render=True
        if rivet:obj['ringSides']=5
        row={'name':obj.name,'before':before,'after':len(selected.loop_triangles),'surfaceToleranceM':limit,
             'selected':attempts[-1],'attempts':attempts,'normalTransfer':transfer,'primaryAndAoUvPolicy':'Retained decimator corner payloads; rivet UV1 copies the exact source per-head sample'}
        records.append(row); print('Release LOD',obj.name,before,row['after'],flush=True)
        Record('Data_ReleaseLodProgress.json',records)
    if any(row['name'] in ['UpperWing_MainLeft','UpperWing_MainRight','Aileron_Left','Aileron_Right'] and row['after']==row['before'] for row in records):RefineWingCaps(records)
    if fabricReferences:
        normalRepair=[ProjectFabricSurfaceNormals(reference,bpy.data.objects[name])for name,reference in fabricReferences.items()]
        root['fabricHighNormalFieldRepaired']=True;Record('Data_FabricNormalRepair.json',{'parts':normalRepair,'state':'EvaluatedHighFabricFieldTransferredBeforeMerging'})
    triangles=sum(len(o.data.loop_triangles) if o.data.loop_triangles else sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    Record('Data_ReleaseLod.json',{'sourceSha256':sourceHash,'sourceServiceAudit':sourceService,'parts':records,'trianglesBeforeMerge':triangles})
    assert triangles<=180000, ('Actual complete derivative exceeds the game budget',triangles)
    serviceRuntime=service['AuditServiceRuntime'](meshes,sourceProbes)
    # Discard unused slots before grouping. Consolidate the three metal sets
    # onto one newly unwrapped/baked atlas, keeping their authored UV0 PBR. This
    # avoids extra game materials for the regularly tessellated engine.
    for obj in meshes:
        slots=list(obj.data.materials);used=sorted(set(p.material_index for p in obj.data.polygons))
        indices=[p.material_index for p in obj.data.polygons]
        if len(used)!=len(slots):
            obj.data.materials.clear()
            for index in used:obj.data.materials.append(slots[index])
            remap={old:new for new,old in enumerate(used)}
            for poly,index in zip(obj.data.polygons,indices):poly.material_index=remap[index]
    bases={'Material_EngineCastAluminum','Material_MachinedAluminum','Material_OxidizedSteel'}
    metalObjects=[obj for obj in meshes if any(mat.name.removesuffix('_GameEngine') in bases for mat in obj.data.materials)]
    Record('Data_GameMetalAo.json',BakeGameEngine(metalObjects))
    # Preserve the independent low source before draw-call merging. It contains
    # each complete part, transferred UVs/normals and the same genuine pivots.
    root['gameDerivative']=True;root['highSourceSha256']=sourceHash
    root['gameTriangleBudget']=180000
    ArchiveScripts();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Game/Scene_NakajimaKi4Parts.blend'))
    helpers=Helper('Script_NakajimaKi4GeometryAo.py')
    # Static datum frames belong to authoring. Bake their exact world matrices
    # into the game siblings before grouping; retain every pivot/rest transform
    # and each source part name. Source and GameParts keep the full frame tree.
    for obj in list(root.children_recursive):
        if obj.type!='MESH':continue
        parent=obj.parent
        while parent and parent!=root and not parent.name.startswith('Pivot_'):parent=parent.parent
        parent=parent or root
        if obj.parent!=parent:
            world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
    bpy.context.view_layer.update();root['gameStaticDatumFramesBaked']=True
    basisRecords=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        before=[obj.matrix_world@v.co for v in obj.data.vertices]
        parentWorld=obj.parent.matrix_world.copy()
        local=obj.matrix_local.copy()
        TransformMeshCornerField(obj.data,local)
        obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
        drift=max((parentWorld@v.co-point).length for v,point in zip(obj.data.vertices,before))
        assert drift<.00001,(obj.name,drift)
        obj.data=ExactTriangleCopy(obj.data)
        basisRecords.append({'name':obj.name,'maxWorldVertexDriftM':drift,'localMatrixBakedWithInverseTransposeNormals':True})
    bpy.context.view_layer.update()
    groups={}
    for obj in list(root.children_recursive):
        if obj.type=='MESH' and len(obj.data.materials)==1 and obj.name!='Surface_FlushRivetHeads':
            groups.setdefault((obj.parent.name,obj.data.materials[0].name),[]).append(obj)
    merged=[];normalRows=[]
    for (parentName,materialName),objects in groups.items():
        if len(objects)<2:continue
        cornerFields={}
        for index,obj in enumerate(objects):
            sourceNormals=[tuple(n.vector) for n in obj.data.corner_normals]
            sourcePoints=[tuple(v.co) for v in obj.data.vertices]
            tag=obj.data.attributes.get('ReleaseSourcePart') or obj.data.attributes.new('ReleaseSourcePart','INT','FACE')
            tag.data.foreach_set('value',np.full(len(obj.data.polygons),index,dtype=np.int32))
            faceTag=obj.data.attributes.get('ReleaseSourceFace') or obj.data.attributes.new('ReleaseSourceFace','INT','FACE')
            faceTag.data.foreach_set('value',np.arange(len(obj.data.polygons),dtype=np.int32))
            for poly in obj.data.polygons:
                cornerFields[(index,poly.index)]=[(sourcePoints[obj.data.loops[loop].vertex_index],sourceNormals[loop])for loop in poly.loop_indices]
        names=[o.name for o in objects];bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        obj=bpy.context.object;obj.name='Mesh_'+parentName.removeprefix('Pivot_')+'_'+materialName.removeprefix('Material_')
        obj['sourceParts']=names; merged.append({'name':obj.name,'parts':names})
        tag=obj.data.attributes['ReleaseSourcePart'];ranges=[]
        for triangleIndex,poly in enumerate(obj.data.polygons):
            assert len(poly.vertices)==3
            name=names[tag.data[poly.index].value]
            if ranges and ranges[-1]['name']==name:ranges[-1]['triangleCount']+=1
            else:ranges.append({'name':name,'firstTriangle':triangleIndex,'triangleCount':1})
        obj['sourceTrianglePartRangesJson']=json.dumps(ranges)
        # Exact face/corner provenance avoids choosing the other side of a
        # crease during a nearest-surface query after joining. Every sibling
        # already has an identity basis in the common parent frame.
        bpy.context.view_layer.update()
        faceTag=obj.data.attributes['ReleaseSourceFace'];normals=[];positionsMax=0.
        for poly in obj.data.polygons:
            sourceCorners=cornerFields[(tag.data[poly.index].value,faceTag.data[poly.index].value)]
            for loop in poly.loop_indices:
                point=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                sourcePoint,normal=min(sourceCorners,key=lambda corner:(point-Vector(corner[0])).length_squared)
                positionsMax=max(positionsMax,(point-Vector(sourcePoint)).length);normals.append(normal)
        assert positionsMax<.00001,(obj.name,positionsMax)
        for edge in obj.data.edges:edge.use_edge_sharp=True
        obj.data.update(calc_edges=True);obj.data.calc_loop_triangles();_=len(obj.data.corner_normals)
        obj.data.normals_split_custom_set(normals)
        maximum=max(math.degrees(math.acos(max(-1.,min(1.,Vector(expected).normalized().dot(actual.vector.normalized()))))) for expected,actual in zip(normals,obj.data.corner_normals))
        assert maximum<.1,(obj.name,maximum)
        normalRows.append({'name':obj.name,'corners':len(normals),'method':'Exact source face/corner field in common parent coordinates; no spatial crease substitution',
                           'maxCornerPositionDriftM':positionsMax,'maxEncodedNormalDifferenceDegrees':maximum})
    ArchiveScripts();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Game/Scene_NakajimaKi4.blend'))
    gamePath=asset/'Model_NakajimaKi4.glb';Export(gamePath)
    record={'state':'ActualCompleteGameDerivativeExported','sourceSha256':sourceHash,'gameSource':bpy.data.filepath,
            'gameSourceSha256':Hash(bpy.data.filepath),'runtimePath':str(gamePath),'runtimeSha256':Hash(gamePath),
            'triangles':triangles,'parts':records,'staticMerges':merged,'postMergeNormalTransfer':normalRows,
            'meshLocalBasisBake':basisRecords,
            'serviceRuntimeBeforeExport':serviceRuntime,'sourceAuthorNeverOverwritten':Hash(sourceRoot/'Scene_NakajimaKi4.blend')==sourceHash}
    Record('Data_ReleaseGame.json',record)
    return record


if stage == 'repair':
    pointer=json.loads((repo/'tmp/NakajimaKi4/Data_CurrentReferenceIteration.json').read_text(encoding='utf8'))
    inputPath=pathlib.Path(pointer['sourcePath'])
    assert pathlib.Path(bpy.data.filepath).resolve()==inputPath.resolve() and Hash(inputPath)==pointer['sourceSha256']
    assert not (sourceRoot/'Scene_NakajimaKi4.blend').exists(), 'Never overwrite an existing author during repair'
    sourceRoot.mkdir(parents=True,exist_ok=True)
    for folder in ['Textures','Exports','Game']: (sourceRoot/folder).mkdir(exist_ok=True)
    asset.mkdir(parents=True,exist_ok=True)
    repair=RepairServiceSkin(bpy.data.objects['Fuselage_Monocoque'],OpeningPaths())
    service=Helper('Script_NakajimaKi4ServiceAudit.py')
    audit,probes=service['AuditServiceSource'](root,{o.name:o for o in root.children_recursive})
    root['version']='20261028ReferenceV48GameRelease'
    root['serviceResidualRepairJson']=json.dumps(repair)
    root['referenceFidelityPassed']=False
    root['deliveryScope']='Current reference iteration accepted for game configuration; original native photograph-fit failures retained in the release record.'
    SaveHigh()
    Record('Data_ServiceRepair.json',{'inputSource':str(inputPath),'inputSourceSha256':pointer['sourceSha256'],
           'sourcePath':bpy.data.filepath,'sourceSha256':Hash(bpy.data.filepath),'repair':repair,'sourceServiceAudit':audit})
    result={'stage':stage,'source':bpy.data.filepath,'removedAreaM2':repair['removedSkinAreaM2'],
            'sourceSamples':audit['samples'],'clearExitRays':len(probes),'retainedSkinObstructions':0}
    print(json.dumps(result),flush=True)

elif stage == 'bake':
    assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Scene_NakajimaKi4.blend').resolve()
    record=RebakeCurrentAo()
    # Copy the exact packed source payloads alongside the self-contained source.
    for image in bpy.data.images:
        if image.packed_file:
            name=pathlib.Path(image.filepath).name
            path=sourceRoot/'Textures'/name
            if not path.exists(): path.write_bytes(image.packed_file.data)
    SaveHigh(); record['sourceSha256']=Hash(bpy.data.filepath)
    Export(sourceRoot/'Exports/Model_NakajimaKi4High.glb')
    record['highGlbSha256']=Hash(sourceRoot/'Exports/Model_NakajimaKi4High.glb')
    Record('Data_ReleaseAo.json',record)
    result={'stage':stage,'atlases':len(record['atlases']),'seconds':record['seconds'],'sourceSha256':record['sourceSha256']}
    print(json.dumps(result),flush=True)

elif stage == 'derive':
    expected=sourceRoot/('Game/Scene_NakajimaKi4Parts.blend' if os.environ.get('KI4_RELEASE_REMERGE')=='1' else 'Scene_NakajimaKi4.blend')
    assert pathlib.Path(bpy.data.filepath).resolve()==expected.resolve()
    record=DeriveGame()
    result={key:record[key] for key in ['state','runtimeSha256','triangles','gameSource']}
    print(json.dumps(result),flush=True)

elif stage == 'refresh':
    assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Scene_NakajimaKi4.blend').resolve()
    SaveHigh(); Export(sourceRoot/'Exports/Model_NakajimaKi4High.glb')
    result={'stage':stage,'sourceSha256':Hash(bpy.data.filepath),'highGlbSha256':Hash(sourceRoot/'Exports/Model_NakajimaKi4High.glb')}
    Record('Data_ReleaseHigh.json',result);print(json.dumps(result),flush=True)

elif stage == 'archive_game':
    assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Game/Scene_NakajimaKi4.blend').resolve()
    assert root['gameDerivative']
    ArchiveScripts();bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    record=json.loads((asset/'Evidence/Data_ReleaseGame.json').read_text(encoding='utf8'))
    record['gameSourceSha256']=Hash(bpy.data.filepath);Record('Data_ReleaseGame.json',record)
    result={'gameSourceSha256':record['gameSourceSha256']};print(json.dumps(result),flush=True)

elif stage == 'repair_rivet_atlas':
    assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Scene_NakajimaKi4.blend').resolve()
    record=RebakeCurrentAo({'Texture_Ki4HardwareGeometryAoHigh'})
    SaveHigh();Export(sourceRoot/'Exports/Model_NakajimaKi4High.glb')
    result={'stage':stage,'sourceSha256':Hash(bpy.data.filepath),'highGlbSha256':Hash(sourceRoot/'Exports/Model_NakajimaKi4High.glb')}
    Record('Data_ReleaseHigh.json',result);Record('Data_RivetAtlasRepair.json',record);print(json.dumps(result),flush=True)
