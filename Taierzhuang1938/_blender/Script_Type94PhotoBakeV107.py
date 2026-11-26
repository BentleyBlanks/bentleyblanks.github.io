"""Project the approved high source onto the low mesh's own MikkTSpace atlas."""

import math
import struct
import zlib

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
import numpy as np

from Script_Type94PhotoMaterialsV107 import CONTACT_ATTRIBUTE, POINT_ATTRIBUTE


ROLES = {"Paint":4096, "Track":2048, "Steel":2048, "Rubber":1024}
CHANNELS = ("Base","Normal","Orm")
REPLAY_OCCLUSION = "Type94PhotoReplayOcclusion"


def Select(objects, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else objects[0]


def Role(material):
    return material.get("Type94RuntimeRole") or material.name.split(".")[0].removeprefix("Material_Type94")


def StagingMesh(name, sources, donor):
    points, faces, normals, smooth, uvs, slots = [], [], [], [], [], []
    coordinates, contact, materials, bindings = [], [], [], []
    for obj,faceIndices,offset in sources:
        source = obj.data
        oldUvs = source.uv_layers.active.data if source.uv_layers.active else None
        vertices = sorted({v for i in faceIndices for v in source.polygons[i].vertices})
        row = {value:i+len(points) for i,value in enumerate(vertices)}
        authored = source.attributes.get(POINT_ATTRIBUTE)
        amount = source.attributes.get(CONTACT_ATTRIBUTE)
        for value in vertices:
            p = source.vertices[value].co
            points.append(tuple(p+offset))
            if donor:
                coordinates.append(tuple(authored.data[value].vector if authored is not None else p))
                contact.append(amount.data[value].value if amount is not None else 0)
        loopIndices = []
        start = len(normals)
        for index in faceIndices:
            polygon = source.polygons[index]
            faces.append(tuple(row[i] for i in polygon.vertices))
            smooth.append(polygon.use_smooth)
            if donor:
                material = source.materials[polygon.material_index]
                if material not in materials:
                    materials.append(material)
                slots.append(materials.index(material))
            for li in polygon.loop_indices:
                normals.append(tuple(source.corner_normals[li].vector))
                if donor:
                    uvs.append(tuple(oldUvs[li].uv) if oldUvs is not None else (0,0))
                loopIndices.append(li)
        if not donor:
            bindings.append((obj, start, loopIndices))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    mesh.polygons.foreach_set("use_smooth",smooth)
    mesh.normals_split_custom_set(normals)
    if donor:
        for material in materials:
            mesh.materials.append(material)
        mesh.polygons.foreach_set("material_index",slots)
        uv.data.foreach_set("uv",np.asarray(uvs,dtype=np.float32).ravel())
        mesh.attributes.new(POINT_ATTRIBUTE,"FLOAT_VECTOR","POINT").data.foreach_set("vector",np.asarray(coordinates,dtype=np.float32).ravel())
        mesh.attributes.new(CONTACT_ATTRIBUTE,"FLOAT","POINT").data.foreach_set("value",np.asarray(contact,dtype=np.float32))
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj, bindings


def PackTarget(target, bindings, size):
    Select([target])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(64),island_margin=0,scale_to_bounds=True)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True,margin_method="FRACTION",margin=8/size,scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    source = target.data.uv_layers.active.data
    for obj,first,loops in bindings:
        targetUv = obj.data.uv_layers.active.data
        for i,loop in enumerate(loops):
            targetUv[loop].uv = source[first+i].uv


def RasterTriangle(pixelUv, size):
    q = np.asarray(pixelUv,dtype=np.float64)*size-.5
    low = np.maximum(0,np.ceil(q.min(axis=0)).astype(int))
    high = np.minimum(size-1,np.floor(q.max(axis=0)).astype(int))
    if np.any(high < low):
        return None
    a,b,c = q
    den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den)<1e-10:
        return None
    x,y = np.meshgrid(np.arange(low[0],high[0]+1),np.arange(low[1],high[1]+1))
    u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
    v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
    inside = (u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)
    return y[inside],x[inside],u[inside],v[inside]


def OccupiedAtlas(mesh,size):
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active.data
    mask = np.zeros((size,size),dtype=bool)
    for tri in mesh.loop_triangles:
        result = RasterTriangle([uv[i].uv for i in tri.loops],size)
        if result is not None:
            yy,xx,_,_ = result
            mask[yy,xx] = True
    return mask


def SocketValue(tree, source, destination, default=1):
    if source is not None and source.is_linked:
        tree.links.new(source.links[0].from_socket,destination)
    else:
        value = source.default_value if source is not None else default
        if destination.type=="RGBA" and isinstance(value,(float,int)):
            value = (value,value,value,1)
        destination.default_value = value


def SurfaceGraphs(donor):
    graphs = {}
    for material in donor.data.materials:
        tree = material.node_tree
        output = next(n for n in tree.nodes if n.type=="OUTPUT_MATERIAL" and n.is_active_output)
        shader = next(n for n in tree.nodes if n.type=="BSDF_PRINCIPLED")
        source = output.inputs["Surface"].links[0].from_socket
        graphs[material] = tree,output,shader,source,tree.nodes.new("ShaderNodeEmission")
    return graphs


def ConfigureBakeGraph(graphs, channel, replay=False):
    for material,(tree,output,shader,original,emission) in graphs.items():
        sink = emission.inputs["Color"]
        for link in list(sink.links):
            tree.links.remove(link)
        if channel=="Normal":
            tree.links.new(original,output.inputs["Surface"])
            continue
        if channel=="Coverage":
            sink.default_value = (1,1,1,1)
        elif channel=="Base":
            SocketValue(tree,shader.inputs["Base Color"],sink)
        elif channel=="Orm":
            pack = tree.nodes.new("ShaderNodeCombineColor")
            pack.mode = "RGB"
            if replay and material.get("Type94PhotoSurface"):
                ao = tree.nodes.new("ShaderNodeAttribute")
                ao.attribute_name = REPLAY_OCCLUSION
                tree.links.new(ao.outputs["Fac"],pack.inputs[0])
            elif material.get("Type94PhotoSurface"):
                ao = tree.nodes.new("ShaderNodeAmbientOcclusion")
                ao.only_local = True
                ao.samples = 12
                ao.inputs["Distance"].default_value = .045
                tree.links.new(ao.outputs["AO"],pack.inputs[0])
            else:
                occlusion = next((n.inputs["Occlusion"] for n in tree.nodes if n.type=="GROUP"
                    and n.node_tree and n.node_tree.name.startswith("glTF Material Output") and "Occlusion" in n.inputs),None)
                SocketValue(tree,occlusion,pack.inputs[0])
            SocketValue(tree,shader.inputs["Roughness"],pack.inputs[1])
            SocketValue(tree,shader.inputs["Metallic"],pack.inputs[2])
            tree.links.new(pack.outputs["Color"],sink)
        elif channel=="WorldNormal":
            normal = shader.inputs["Normal"]
            source = normal.links[0].from_socket if normal.is_linked else tree.nodes.new("ShaderNodeNewGeometry").outputs["Normal"]
            encode = tree.nodes.new("ShaderNodeVectorMath")
            encode.operation = "MULTIPLY_ADD"
            tree.links.new(source,encode.inputs[0])
            encode.inputs[1].default_value = (.5,.5,.5)
            encode.inputs[2].default_value = (.5,.5,.5)
            tree.links.new(encode.outputs[0],sink)
        else:
            raise ValueError(channel)
        tree.links.new(emission.outputs[0],output.inputs["Surface"])


def BakeImage(target, donor, graphs, channel, size, cage, distance, margin, replayUv=""):
    stage = target.data.materials[0].node_tree
    node = next(n for n in stage.nodes if n.type=="TEX_IMAGE")
    stage.nodes.active = node
    image = bpy.data.images.new("Type94Projection"+channel,width=size,height=size,alpha=False,float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    node.image = image
    ConfigureBakeGraph(graphs,channel,bool(replayUv))
    Select([target] if replayUv else [donor,target],target)
    bpy.ops.object.bake(type="NORMAL" if channel=="Normal" else "EMIT",normal_space="TANGENT",
                        use_selected_to_active=not bool(replayUv),use_clear=True,margin=margin,
                        margin_type="EXTEND",cage_extrusion=cage,max_ray_distance=distance,uv_layer=replayUv)
    pixels = np.empty(size*size*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    node.image = None
    bpy.data.images.remove(image)
    return pixels.reshape(size,size,4)


def TemporaryMaterial(obj):
    material = bpy.data.materials.new(obj.name+"Material")
    material.use_nodes = True
    material.node_tree.nodes.new("ShaderNodeTexImage")
    obj.data.materials.append(material)


def LocateMissing(target,donor,missing):
    mesh = target.data
    uv = mesh.uv_layers.active.data
    mesh.calc_loop_triangles()
    mesh.calc_tangents(uvmap=mesh.uv_layers.active.name)
    source = donor.data
    source.calc_loop_triangles()
    bvh = BVHTree.FromPolygons([v.co for v in source.vertices],[t.vertices for t in source.loop_triangles],all_triangles=True)
    samples = {}
    size = missing.shape[0]
    for tri in mesh.loop_triangles:
        result = RasterTriangle([uv[i].uv for i in tri.loops],size)
        if result is None:
            continue
        yy,xx,u,v = result
        picks = missing[yy,xx]
        if not picks.any():
            continue
        for row,col,a,b in zip(yy[picks],xx[picks],u[picks],v[picks]):
            pixel = int(row),int(col)
            if pixel in samples:
                continue
            weights = [float(a),float(b),float(1-a-b)]
            p = sum((mesh.vertices[i].co*w for i,w in zip(tri.vertices,weights)),Vector())
            normal = sum((mesh.corner_normals[i].vector*w for i,w in zip(tri.loops,weights)),Vector()).normalized()
            tangent = sum((mesh.loops[i].tangent*w for i,w in zip(tri.loops,weights)),Vector())
            tangent = (tangent-normal*normal.dot(tangent)).normalized()
            bitangentSign = sum(mesh.loops[i].bitangent_sign*w for i,w in zip(tri.loops,weights))
            bitangent = normal.cross(tangent) * (-1 if bitangentSign<0 else 1)
            hit,_,index,distance = bvh.find_nearest(p)
            if index is None or distance>.012:
                raise ValueError(f"Missing texel {pixel} has no nearby high source at {p}: {distance}")
            sourceTri = source.loop_triangles[index]
            corners = [source.vertices[i].co for i in sourceTri.vertices]
            basis = [Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
            weights = np.maximum(0,np.asarray(barycentric_transform(hit,*corners,*basis),dtype=float))
            weights = weights/max(weights.sum(),1e-8)
            weights = .998*weights+.002/3
            plane = (corners[1]-corners[0]).cross(corners[2]-corners[0]).normalized()
            position = sum((p*w for p,w in zip(corners,weights)),Vector())
            sourceMaterial = source.materials[sourceTri.material_index]
            ao = SampleOcclusion(bvh,position,plane) if sourceMaterial.get("Type94PhotoSurface") else 1
            samples[pixel] = (sourceTri,weights,ao,(tuple(tangent),tuple(bitangent),tuple(normal)),float(distance))
    if len(samples) != int(missing.sum()):
        raise ValueError("Some unprojected texels have no corresponding low atlas triangle")
    return sorted(samples.items())


def SampleOcclusion(tree,point,normal):
    up = Vector((1,0,0)) if abs(normal.x)<.85 else Vector((0,1,0))
    x = normal.cross(up).normalized()
    y = normal.cross(x)
    response = 0.
    for i in range(16):
        r = math.sqrt((i+.5)/16)
        a = i*math.pi*(3-math.sqrt(5))
        direction = x*(r*math.cos(a))+y*(r*math.sin(a))+normal*math.sqrt(1-r*r)
        hit = tree.ray_cast(point+normal*.00006,direction,.045)
        response += hit[3]/.045 if hit[0] is not None else 1.
    return response/16


def EvaluateMissing(target,donor,graphs,missing):
    items = LocateMissing(target,donor,missing)
    if not items:
        return {},0
    size = 2**math.ceil(math.log2(max(8,math.ceil(math.sqrt(len(items))))))
    vertices,faces,uvs,shaderUvs,normals,points,contacts,aoValues,slots = [],[],[],[],[],[],[],[],[]
    source = donor.data
    sourceUv = source.uv_layers.active.data
    sourcePoint = source.attributes[POINT_ATTRIBUTE].data
    sourceContact = source.attributes[CONTACT_ATTRIBUTE].data
    cell = np.array([[.03,.03],[.97,.03],[.97,.97],[.03,.97]],dtype=float)
    stencil = np.array([[2,-1,-1],[0,1,-1],[-2,1,1],[0,-1,1]],dtype=float)
    for i,(_,sample) in enumerate(items):
        triangle,weights,ao,_,_ = sample
        pp = np.asarray([tuple(source.vertices[vi].co) for vi in triangle.vertices])
        sub = weights + stencil*(min(weights)*.42)
        start = len(vertices)
        # Copy a small inset quadrilateral of the donor triangle into a full
        # atlas texel. Its centre is the original nearest point's barycentric
        # sample and its shader still reads the donor's own coordinates.
        vertices.extend((sub-weights)@(pp-pp[0]))
        faces.append((start,start+1,start+2,start+3))
        uvs.extend((cell + [i%size,i//size])/size)
        shaderUvs.extend(sub@np.asarray([tuple(sourceUv[li].uv) for li in triangle.loops]))
        normals.extend([tuple(Vector(value).normalized()) for value in
                        sub@np.asarray([tuple(source.corner_normals[li].vector) for li in triangle.loops])])
        points.extend(sub@np.asarray([tuple(sourcePoint[vi].vector) for vi in triangle.vertices]))
        contacts.extend(sub@np.asarray([sourceContact[vi].value for vi in triangle.vertices]))
        aoValues.extend([ao]*4)
        slots.append(triangle.material_index)
    mesh = bpy.data.meshes.new("Type94PhotoRayRepair")
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    originalUv = mesh.uv_layers.new(name="UVMap")
    originalUv.data.foreach_set("uv",np.asarray(shaderUvs,dtype=np.float32).ravel())
    mesh.uv_layers.new(name="ReplayUV").data.foreach_set("uv",np.asarray(uvs,dtype=np.float32).ravel())
    originalUv.active_render = True
    mesh.polygons.foreach_set("use_smooth",[True]*len(faces))
    mesh.normals_split_custom_set(normals)
    mesh.attributes.new(POINT_ATTRIBUTE,"FLOAT_VECTOR","POINT").data.foreach_set("vector",np.asarray(points,dtype=np.float32).ravel())
    mesh.attributes.new(CONTACT_ATTRIBUTE,"FLOAT","POINT").data.foreach_set("value",np.asarray(contacts,dtype=np.float32))
    mesh.attributes.new(REPLAY_OCCLUSION,"FLOAT","POINT").data.foreach_set("value",np.asarray(aoValues,dtype=np.float32))
    for material in source.materials:
        mesh.materials.append(material)
    mesh.polygons.foreach_set("material_index",slots)
    patch = bpy.data.objects.new(mesh.name,mesh)
    bpy.context.scene.collection.objects.link(patch)
    imageNodes = {}
    for material in mesh.materials:
        tree = material.node_tree
        node = tree.nodes.new("ShaderNodeTexImage")
        tree.nodes.active = node
        imageNodes[material] = node
    values = {}
    try:
        for channel in ("Coverage","Base","Orm","WorldNormal"):
            image = bpy.data.images.new("Type94SurfaceReplay"+channel,width=size,height=size,alpha=False,float_buffer=True)
            image.colorspace_settings.name = "Non-Color"
            ConfigureBakeGraph(graphs,channel,replay=True)
            for material,node in imageNodes.items():
                material.node_tree.nodes.active = node
                node.image = image
            Select([patch])
            bpy.ops.object.bake(type="EMIT",uv_layer="ReplayUV",use_selected_to_active=False,use_clear=True,margin=0)
            raw = np.empty(size*size*4,dtype=np.float32)
            image.pixels.foreach_get(raw)
            pixels = raw.reshape(-1,4)[:len(items),:3].copy()
            bpy.data.images.remove(image)
            if channel=="Coverage":
                if not np.all(pixels>.998):
                    raise ValueError(f"Could not resample {np.any(pixels<=.998,axis=1).sum()} nearest high surface points")
                continue
            if channel=="WorldNormal":
                basis = np.asarray([entry[1][3] for entry in items])
                low = np.einsum("nij,nj->ni",basis,pixels*2-1)
                pixels = .5+.5*low/np.maximum(np.linalg.norm(low,axis=1)[:,None],1e-6)
                channel = "Normal"
            values[channel] = pixels
    finally:
        for material,node in imageNodes.items():
            material.node_tree.nodes.remove(node)
        bpy.data.objects.remove(patch,do_unlink=True)
    rows,cols = np.asarray([entry[0] for entry in items],dtype=int).T
    return {c:(rows,cols,v) for c,v in values.items()}, max(entry[1][-1] for entry in items)


def WriteMap(filepath, pixels, isBase):
    rgb = np.clip(pixels[:,:,:3],0,1)
    if isBase:
        rgb = np.where(rgb<=.0031308,12.92*rgb,1.055*np.power(rgb,1/2.4)-.055)
    rgb = np.rint(rgb*255).astype(np.uint8)[::-1]
    height,width,_ = rgb.shape
    encoder = zlib.compressobj(7)
    encoded = bytearray()
    previous = np.zeros((width,3),dtype=np.uint8)
    for row in rgb:
        delta = row.copy()
        delta[1:] -= row[:-1]
        up = row-previous
        scanlines = (row,delta,up)
        mode = min(range(len(scanlines)),key=lambda i:int(np.abs(scanlines[i].view(np.int8).astype(np.int16)).sum()))
        encoded.extend(encoder.compress(bytes([mode])+scanlines[mode].tobytes()))
        previous = row
    encoded.extend(encoder.flush())

    def Chunk(stream, kind, payload):
        stream.write(struct.pack(">I",len(payload)))
        stream.write(kind)
        stream.write(payload)
        stream.write(struct.pack(">I",zlib.crc32(payload,zlib.crc32(kind))))

    # Match glTF's channel encodings explicitly. Blender's float-buffer PNG
    # saver writes the source Base samples as linear 16-bit RGB.
    with filepath.open("wb") as stream:
        stream.write(b"\x89PNG\r\n\x1a\n")
        Chunk(stream,b"IHDR",struct.pack(">IIBBBBB",width,height,8,2,0,0,0))
        if isBase:
            Chunk(stream,b"sRGB",b"\0")
        Chunk(stream,b"IDAT",encoded)
        Chunk(stream,b"IEND",b"")
