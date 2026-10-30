"""Replay missed projection texels on actual nearest donor surfaces.

The supplementary samples use Cycles to evaluate the original packed donor
shader, including its true normal-map strength. World normals are converted
through the low mesh's interpolated Mikk tangent frame. No invented colors,
flat normal substitution, or texture-image inpainting is used.
"""
import bpy,hashlib,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';prepare=json.loads((acc/'Data_GameProjectionPreparationV100.json').read_text());work=Path(prepare['workBlend']);assert not bpy.data.filepath;assert hashlib.sha256(work.read_bytes()).hexdigest()==prepare['workBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(work));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.cage_extrusion=.00005;scene.render.bake.max_ray_distance=.00015
# Pixel application is deliberately a separate Pillow pass, keeping linear
# shader samples distinct from sRGB PNG storage and permitting exact replay.
def InnerPoint(p,a,b,c,epsilon):
    u=(b-a).normalized();normal=(b-a).cross(c-a).normalized();v=normal.cross(u);triangle=np.array([[0,0],[(b-a).dot(u),(b-a).dot(v)],[(c-a).dot(u),(c-a).dot(v)]],dtype=float);point=np.array([(p-a).dot(u),(p-a).dot(v)]);lines=[]
    for i in range(3):
        q,r=triangle[i],triangle[(i+1)%3];edge=r-q;n=np.array([-edge[1],edge[0]]);n/=np.linalg.norm(n);lines.append((n,float(n@q)+epsilon*3))
    corners=[np.linalg.solve(np.stack([lines[i][0],lines[(i+1)%3][0]]),np.array([lines[i][1],lines[(i+1)%3][1]]))for i in range(3)]
    if all(n@point>=d for n,d in lines):inside=point
    else:
        candidates=[]
        for i in range(3):
            q,r=corners[i],corners[(i+1)%3];edge=r-q;t=float(np.clip((point-q)@edge/max(float(edge@edge),1e-30),0,1));candidates.append(q+t*edge)
        inside=min(candidates,key=lambda q:float(np.sum((q-point)**2)))
    sample=a+u*float(inside[0])+v*float(inside[1]);return sample,u,v,normal
def PixelSamples(target,donor,missing):
    mesh=target.data;mesh.calc_loop_triangles();mesh.calc_tangents(uvmap=mesh.uv_layers.active.name);source=donor.data;source.calc_loop_triangles();tree=BVHTree.FromPolygons([v.co for v in source.vertices],[t.vertices for t in source.loop_triangles],all_triangles=True);size=missing.shape[0];samples={}
    for tri in mesh.loop_triangles:
        q=np.array([tuple(mesh.uv_layers.active.data[i].uv)for i in tri.loops])*size-.5;lo=np.maximum(0,np.ceil(q.min(axis=0)).astype(int));hi=np.minimum(size-1,np.floor(q.max(axis=0)).astype(int))
        if np.any(hi<lo):continue
        x0,y0=lo;x1,y1=hi
        if not missing[y0:y1+1,x0:x1+1].any():continue
        x,y=np.meshgrid(np.arange(x0,x1+1),np.arange(y0,y1+1));a,b,c=q;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-12:continue
        u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;inside=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)
        for yy,xx in np.argwhere(inside&missing[y0:y1+1,x0:x1+1]):
            pixel=(int(yy+y0),int(xx+x0))
            if pixel in samples:continue
            weights=[float(u[yy,xx]),float(v[yy,xx]),1-float(u[yy,xx])-float(v[yy,xx])];p=sum((mesh.vertices[i].co*w for i,w in zip(tri.vertices,weights)),Vector());normal=sum((mesh.corner_normals[i].vector*w for i,w in zip(tri.loops,weights)),Vector()).normalized();tangent=sum((mesh.loops[i].tangent*w for i,w in zip(tri.loops,weights)),Vector()).normalized();bitangent=sum((mesh.corner_normals[i].vector.cross(mesh.loops[i].tangent)*(mesh.loops[i].bitangent_sign*w)for i,w in zip(tri.loops,weights)),Vector()).normalized();basis=np.array([tuple(tangent),tuple(bitangent),tuple(normal)],dtype=float).T;assert abs(np.linalg.det(basis))>.01
            hit=tree.find_nearest(p);assert hit[2]is not None and hit[3]<.00302,('Nearest actual high surface outside separately certified distance',pixel,hit[3]);sourceTri=source.loop_triangles[hit[2]];a,b,c=[source.vertices[i].co.copy()for i in sourceTri.vertices];area=(b-a).cross(c-a).length;altitude=min(area/max((d-e).length,1e-20)for d,e in [(a,b),(b,c),(c,a)]);epsilon=min(.000012,altitude/24);assert epsilon>1e-7
            for refinement in range(8):
                point,axisU,axisV,faceNormal=InnerPoint(hit[0],a,b,c,epsilon);shift=(point-hit[0]).length
                if shift<.0003:break
                epsilon*=.4
            assert shift<.0003 and epsilon>1e-8,('Supplementary shader sample requires too large an inset',pixel,shift)
            samples[pixel]=dict(lowPoint=tuple(p),highPoint=tuple(hit[0]),samplePoint=tuple(point),axisU=tuple(axisU*epsilon),axisV=tuple(axisV*epsilon),normal=tuple(faceNormal),basis=basis,inverse=np.linalg.inv(basis),sourceTriangle=hit[2],nearestDistanceM=hit[3],sampleInsetM=shift,footprintHalfWidthM=epsilon)
    assert len(samples)==int(missing.sum());return samples
def SetChannel(material,channel,graph):
    output,shader,original,emission=graph;tree=material.node_tree
    if channel=='Coverage':emission.inputs['Color'].default_value=(1,1,1,1)
    elif channel=='Base':
        socket=shader.inputs['Base Color'];tree.links.new(socket.links[0].from_socket,emission.inputs['Color'])if socket.is_linked else setattr(emission.inputs['Color'],'default_value',socket.default_value)
    elif channel=='Orm':
        combine=tree.nodes.new('ShaderNodeCombineColor');combine.mode='RGB';ao=next((n.inputs['Occlusion']for n in tree.nodes if n.type=='GROUP'and n.node_tree and n.node_tree.name.startswith('glTF Material Output')and'Occlusion'in n.inputs),None)
        for index,socket in enumerate([ao,shader.inputs['Roughness'],shader.inputs['Metallic']]):
            if socket is not None and socket.is_linked:tree.links.new(socket.links[0].from_socket,combine.inputs[index])
            else:combine.inputs[index].default_value=socket.default_value if socket is not None else 1.
        tree.links.new(combine.outputs['Color'],emission.inputs['Color'])
    else:
        normal=shader.inputs['Normal'];source=normal.links[0].from_socket if normal.is_linked else tree.nodes.new('ShaderNodeNewGeometry').outputs['Normal'];encode=tree.nodes.new('ShaderNodeVectorMath');encode.operation='MULTIPLY_ADD';tree.links.new(source,encode.inputs[0]);encode.inputs[1].default_value=(.5,.5,.5);encode.inputs[2].default_value=(.5,.5,.5);tree.links.new(encode.outputs[0],emission.inputs['Color'])
    tree.links.new(emission.outputs[0],output.inputs['Surface'])
reports=[]
for role,stage in prepare['stages'].items():
    file=acc/('Data_GameProjection'+role+'V100.json');report=json.loads(file.read_text());assert report['preparationSha256']==prepare['workBlendSha256'];coverage=np.load(acc/('Data_ProjectionCoverage'+role+'V100.npz'));missing=coverage['missing'];mask=coverage['mask'];count=int(missing.sum())
    if not count:reports.append(dict(role=role,primaryMissingPixels=0,repairedPixels=0,passed=True));continue
    target=bpy.data.objects[stage['target']];donor=bpy.data.objects[stage['donor']];samples=PixelSamples(target,donor,missing);items=sorted(samples.items());side=2**math.ceil(math.log2(max(8,math.ceil(math.sqrt(count)))));points=[];faces=[];uvs=[]
    for index,(pixel,sample)in enumerate(items):
        center=Vector(sample['samplePoint']);u=Vector(sample['axisU']);v=Vector(sample['axisV']);offset=len(points);points.extend([center-u-v,center+u-v,center+u+v,center-u+v]);faces.extend([(offset,offset+1,offset+2),(offset,offset+2,offset+3)]);x=index%side;y=index//side;corners=[((x+.01)/side,(y+.01)/side),((x+.99)/side,(y+.01)/side),((x+.99)/side,(y+.99)/side),((x+.01)/side,(y+.99)/side)];uvs.extend(corners[i]for i in [0,1,2,0,2,3])
    mesh=bpy.data.meshes.new('Mesh_ActualDonorPointSamples');mesh.from_pydata(points,[],faces);mesh.update();layer=mesh.uv_layers.new(name='SampleUV')
    for item,uv in zip(layer.data,uvs):item.uv=uv
    patch=bpy.data.objects.new('Temporary_ActualDonorPointSamples',mesh);scene.collection.objects.link(patch);material=bpy.data.materials.new('Material_ActualDonorPointSamples');material.use_nodes=True;mesh.materials.append(material);graphs={}
    for source in set(donor.data.materials):
        tree=source.node_tree;output=next(n for n in tree.nodes if n.type=='OUTPUT_MATERIAL'and n.is_active_output);shader=next(n for n in tree.nodes if n.type=='BSDF_PRINCIPLED');graphs[source]=(output,shader,output.inputs['Surface'].links[0].from_socket,tree.nodes.new('ShaderNodeEmission'))
    values={}
    for channel in ['Coverage','Base','Orm','WorldNormal']:
        for source,graph in graphs.items():SetChannel(source,channel,graph)
        image=bpy.data.images.new('Texture_ActualDonorPointSamples',width=side,height=side,alpha=False,float_buffer=True);image.colorspace_settings.name='Non-Color';node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;material.node_tree.nodes.active=node;bpy.ops.object.select_all(action='DESELECT');donor.select_set(True);patch.select_set(True);bpy.context.view_layer.objects.active=patch;bpy.ops.object.bake(type='EMIT',use_selected_to_active=True,use_clear=True,margin=0,cage_extrusion=.00005,max_ray_distance=.00015);pixels=np.empty(side*side*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)[:count,:3].copy();values[channel]=pixels;bpy.data.images.remove(image)
        if channel=='Coverage':assert np.all(pixels>.999),('Actual-surface point replay missed a shader sample',role,np.where(np.any(pixels<=.999,axis=1))[0][:20].tolist())
        print('TYPE94_V100_REPAIR_SAMPLES',role,channel,count,flush=True)
    for source,(output,shader,original,emission)in graphs.items():source.node_tree.links.new(original,output.inputs['Surface'])
    # Pad only the gutters near repaired texels, copying from actual used low
    # texels. All three channels use the same deterministic nearest-site map.
    band=np.zeros_like(mask)
    for y,x in samples:band[max(0,y-4):y+5,max(0,x-4):x+5]=True
    padding=[]
    for y,x in np.argwhere(band&~mask):
        y0=max(0,y-4);x0=max(0,x-4);near=np.argwhere(mask[y0:y+5,x0:x+5]);assert len(near);nearest=near[np.argmin((near[:,0]+y0-y)**2+(near[:,1]+x0-x)**2)];padding.append((y,x,nearest[0]+y0,nearest[1]+x0))
    pad=np.array(padding,dtype=int)
    np.savez_compressed(acc/('Data_ActualProjectionRepair'+role+'V100.npz'),pixels=np.array([p for p,s in items]),lowPoints=np.array([s['lowPoint']for p,s in items]),nearestHighPoints=np.array([s['highPoint']for p,s in items]),samplePoints=np.array([s['samplePoint']for p,s in items]),lowTangentFrames=np.array([s['basis']for p,s in items]),sourceTriangles=np.array([s['sourceTriangle']for p,s in items]),sampledBaseLinear=values['Base'],sampledOrm=values['Orm'],sampledWorldNormals=values['WorldNormal'],padding=pad)
    repair=dict(role=role,primaryMissingPixels=count,repairedPixels=count,missingAfter=0,paddingPixels=len(padding),nearestHighSurfaceMaximumDistanceM=max(s['nearestDistanceM']for p,s in items),maximumInsetAlongSameHighTriangleM=max(s['sampleInsetM']for p,s in items),maximumFootprintHalfWidthM=max(s['footprintHalfWidthM']for p,s in items),allActualShaderSamplesValid=True,passed=True,method='Nearest actual high triangle, conservative interior point, Cycles unlit base/ORM/world-normal evaluation, inverse low Mikk tangent frame')
    reports.append(repair);bpy.data.objects.remove(patch,do_unlink=True);print(json.dumps(repair),flush=True)
(acc/'Data_GameProjectionRepairSamplesV100.json').write_text(json.dumps(dict(preparationSha256=prepare['workBlendSha256'],reports=reports,passed=all(r['passed']for r in reports),pixelApplicationPending=True),indent=2)+'\n')
