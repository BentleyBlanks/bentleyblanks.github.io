"""K06 PancakeBasket: deterministic C-reference model and local high-bake pipeline.

The default model stage writes the fully textured canonical K06_PancakeBasket
.blend and .glb, with independent Intact/Opened roots and six thin folded sheets
in each. The native file opens with only Intact visible. Source images, input
recipes, native projects and review artifacts stay in the named OneDrive folder.
No game integration or publishing is performed by this script.

Default local rebuild order:
  System Python: prepare_willow_wood_v2 prepares the generated fine willow skin
    and locks the approved 34b0f088 receiver. K06_WOOD_STYLE=legacy retains the
    previous wood material for comparison. Run bake_continuous_lid,
    prepare_continuous_lid and model afterwards for the current wood variant.
  System Python: prepare_materials, using the three generated source PNGs under
    Materials and the repository PBR baker. Source prompts and hashes are kept
    alongside them. Color/opacity is reconstructed from C; relief and normals
    are inferred, not physically measured. Transparency is retained.
  Fresh Blender: model (default). The fixed K07 A pressed input package is under
    Materials/K07PressedInput_c0e53ad3, with its source manifest and hashes.

The current lid uses one surface fitted to the physical round-willow high mesh,
with grouped cardinal stakes, a five-by-five round center, a frame-fitted edge,
2K tangent normals and subdued fine bark. Rebuild with system Python
prepare_materials, a fresh Blender bake_continuous_lid, system Python
prepare_continuous_lid, and a fresh Blender model. The unique offline author UV
atlas has an explicit byte-budget advisory; no runtime registration is performed.
The raised-course and image-aligned studies remain selectable with
K06_LID_MODE=round or aligned. Every runtime state stays <=3000 triangles.

Set K06_STAGE in the exec namespace or environment. Run Blender stages only
through scripts/Script_BlenderMcp.mjs; use a fresh task instance for each bake.
In an MCP snippet: exec(compile(open(SCRIPT,encoding='utf-8').read(),'K06','exec'),
{'K06_STAGE':'bake_lid'}). Image preparation needs system Python, PIL and NumPy.

Legacy stages remain solely for reproducing earlier controlled studies. The
final surface chain does not use the old 128x16 fiber strips. The 0.08m native
skin tile is an inferred close-authoring scale, not a measured sample; its
6400px/m density warning is retained and no runtime texture is registered.
Reference shapes, wear, heights and roughness are reconstruction, not history.
"""
import os

def UseWillowWoodV2():
    return os.environ.get('K06_WOOD_STYLE','v2').lower()=='v2'


def WillowWoodV2Folder():
    from pathlib import Path
    return Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/WoodSurfaceV2')


def ContinuousLidFolder():
    from pathlib import Path
    return WillowWoodV2Folder()/'LidBake' if UseWillowWoodV2() else Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/LidCReferenceWeave')


def BuildScriptPath():
    from pathlib import Path
    source=Path(globals().get('__file__',''))
    if not source.is_file() or source.name!='Build_K06_PancakeBasket.py':
        source=Path.cwd()/'Taierzhuang1938/_blender/VillageInteriorProps/Build_K06_PancakeBasket.py'
    assert source.is_file(), 'Run from the repository root or execute the saved build file'
    return source.resolve()

def SnapshotBuildScript(asset_dir):
    from pathlib import Path
    import hashlib,shutil
    source=BuildScriptPath()
    digest=hashlib.sha256(source.read_bytes()).hexdigest();folder=Path(asset_dir)/'Refinement'/'ScriptSnapshots';folder.mkdir(parents=True,exist_ok=True)
    target=folder/('Build_K06_'+digest[:16]+'.py')
    if not target.exists():shutil.copy2(source,target)
    assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
    return {'path':str(target),'sha256':digest,'sourcePath':str(source)}

def FinalizeGlbTangents(path):
    """Restore the orthonormal basis after Blender's tangent-component rounding.

    Only existing tangent XYZ floats change. Positions, normals, UVs, indices,
    texture bytes, tangent handedness and the glTF graph remain byte-identical.
    """
    import struct,json
    import numpy as np
    from pathlib import Path
    path=Path(path);data=bytearray(path.read_bytes());length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);binary=20+length+8;done=set();count=0;maximum=0
    def attribute(index,dimensions):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];assert a['componentType']==5126
        return np.ndarray((a['count'],dimensions),dtype='<f4',buffer=data,offset=binary+v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dimensions*4),4))
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            a=primitive['attributes'];index=a.get('TANGENT')
            if index is None or index in done:continue
            done.add(index);n=attribute(a['NORMAL'],3).astype(np.float64);t=attribute(index,4);old=t[:,:3].astype(np.float64)
            n/=np.linalg.norm(n,axis=1,keepdims=True);fixed=old-n*np.sum(old*n,axis=1,keepdims=True);fixed/=np.linalg.norm(fixed,axis=1,keepdims=True)
            maximum=max(maximum,float(np.max(np.abs(fixed-old))));t[:,:3]=fixed;count+=len(t)
    path.write_bytes(data);print('TANGENT_ORTHONORMALIZATION',count,'max_component_correction',maximum)

def BundleBindingAngles():
    return (0,.59,1.22,1.92,2.53,3.141592653589793,3.78,4.41,5.05,5.70)

def IsFullWeaveStudy():
    return bool(globals().get('K06_FULL_WEAVE_STUDY',False))

def BundleSpec(a):
    import math
    compression=sum(.09*math.exp(-(math.atan2(math.sin(a-t),math.cos(a-t))/.065)**2) for t in BundleBindingAngles())
    cr=.241+.0008*math.sin(3*a)+.0003*math.sin(7*a);cz=.1855+.00055*math.sin(5*a+.3)
    rr=.008*(.94+.04*math.sin(5*a)+.02*math.sin(13*a))*(1-compression)
    hh=.013*(.95+.04*math.sin(4*a+.4))*(1-compression)
    prototypeScale=1.30 if IsFullWeaveStudy() else 1+.30*math.exp(-(math.atan2(math.sin(a-1.22),math.cos(a-1.22))/.28)**4)
    rr*=prototypeScale;hh*=prototypeScale
    twigs=[]
    for strand in range(3):
        phi=2*math.pi*strand/3+4*a+.20*math.sin(3*a)+.05*math.sin(7*a)
        radius=.0052*prototypeScale*(1+.09*math.sin(strand*3.7))*(1+.07*math.sin(5*a+strand*1.2)+.025*math.sin(17*a+strand))*(1-compression)
        twigs.append((rr*.45*math.cos(phi),hh*.60*math.sin(phi),radius))
    return cr,cz,twigs

def BundleSurface(a,b):
    import math
    cr,cz,twigs=BundleSpec(a);dx,dz=math.cos(b),math.sin(b);distance=0
    for x,z,radius in twigs:
        along=x*dx+z*dz;disc=radius*radius-(x*x+z*z-along*along)
        if disc>=0:distance=max(distance,along+math.sqrt(disc))
    return cr+distance*dx,cz+distance*dz

def EllipseArcOffsets(sides,verticalRatio):
    import math
    offsets=[0]
    for k in range(1,sides+1):
        previous=2*math.pi*(k-1)/sides;current=2*math.pi*k/sides
        offsets.append(offsets[-1]+math.hypot(math.cos(current)-math.cos(previous),verticalRatio*(math.sin(current)-math.sin(previous))))
    return offsets

bodyHeightScale=.80
bodyWeaveRows=21
bodyStakeGroups=25
lidSurfaceZ=.1980
lidSurfaceDrop=.0108
lidUnderThickness=.0035

def BodyHeight(authorZ):
    return .004+(authorZ-.004)*bodyHeightScale

def BodyAuthorHeight(z):
    return .004+(z-.004)/bodyHeightScale

def BodyMeanRadius(z,a):
    import math
    z=BodyAuthorHeight(z)
    return .230+.012*z/.17-.0035*math.exp(-z/.012)-.0070*math.exp(-z/.020)+.0040*math.sin(math.pi*min(1,max(0,z/.180)))+.0009*math.sin(5*a+7*z)*math.cos(2*a+19*z)

def BodyCourseHeight(flow,a):
    import math
    return BodyHeight(.008+flow*(.164/bodyWeaveRows)+.0017*math.sin(3*a+flow*.14)+.0011*math.sin(7*a+flow*.67)+.00065*math.sin(19*a+flow*1.13)+.0005*math.sin(flow*1.73))

def LidRingRadius(row,a):
    import math
    return .023+row*.00670+.0018*math.sin(3*a+row*.29)+.0011*math.sin(7*a+row*.73)+.0005*math.sin(19*a+row*1.13)

def LidReceiverGeometry(z=.193):
    """A coarse height receiver samples the actual round weft's upper surface."""
    import math
    segments=32;verts=[];faces=[];bands=[('Inner',None)]
    for row in (1,7,13,19,25,29):bands.extend((('Valley',row),('Peak',row)))
    bands.append(('Outer',None));rows=len(bands)-1
    def height(r,a):
        if r<.010:return .006+.0010*(1-r/.010)
        row=max(0,min(32,round((r-.023)/.00670)));dr=r-LidRingRadius(row,a)
        thick=.00200*(1+.19*math.sin(row*2.13))*(1+.10*math.sin(a*(.023+row*.00670)*98+row)+.05*math.sin(a*(.023+row*.00670)*317+row*1.7))
        if abs(dr)>=thick:return .0053
        count=14 if r<.031 else (28 if r<.086 else 56)
        return .006+.00190*math.cos(count*.5*a+row*math.pi)+.82*math.sqrt(thick*thick-dr*dr)
    for k,(kind,row) in enumerate(bands):
        for j in range(segments):
            a=2*math.pi*j/segments
            rr=(.00795+.0003*math.sin(7*a)) if kind=='Inner' else .2325 if kind=='Outer' else LidRingRadius(row,a)-(.0055 if kind=='Valley' else 0)
            h=.0053 if kind=='Valley' else height(rr,a)
            verts.append((rr*math.cos(a),rr*math.sin(a),z-.006+h))
    for k in range(rows):
        for j in range(segments):
            n=(j+1)%segments;faces.append(((k+1)*segments+j,(k+1)*segments+n,k*segments+n,k*segments+j))
    center=len(verts);verts.append((0,0,z+.0002))
    for j in range(segments):faces.append((center,j,(j+1)%segments))
    for face in faces:
        a,b,c=(verts[i] for i in face[:3]);assert (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0,'Lid receiver must face upward'
    return verts,faces

def LidSurfaceHeight(radius,z=lidSurfaceZ,angle=0):
    import math
    wave=(.00085*math.sin(5*angle+radius*61)+.00045*math.cos(9*angle-radius*38))*min(1,radius/.05)
    return z-lidSurfaceDrop*min(1,max(0,radius/.225))**2+wave


def LidSurfaceGeometry(z=lidSurfaceZ,segments=32,radii=(.00795,.075,.150,.225)):
    import math
    verts=[];faces=[]
    for k,r in enumerate(radii):
        for j in range(segments):
            a=2*math.pi*j/segments;verts.append((r*math.cos(a),r*math.sin(a),LidSurfaceHeight(r,z,a)))
    for k in range(len(radii)-1):
        for j in range(segments):
            n=(j+1)%segments;faces.append(((k+1)*segments+j,(k+1)*segments+n,k*segments+n,k*segments+j))
    center=len(verts);verts.append((0,0,z))
    for j in range(segments):faces.append((center,j,(j+1)%segments))
    return verts,faces


def CreateAdaptiveLid(parent,name,materials,meshFactory):
    if globals().get('K06_ROUND_WEAVE_RUNTIME'):return CreateRoundWeaveReceiver(parent,name,materials,meshFactory)
    import bpy,math,numpy as np
    from pathlib import Path
    guidePath=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/Texture_K06LidIntrinsicHeight.png')
    alignedGeometry=bool(globals().get('K06_ALIGNED_LID_GEOMETRY'))
    if alignedGeometry:guidePath=guidePath.parent/'LidReliefAligned/Texture_K06LidAlignedHeight.png'
    if globals().get('K06_REFERENCE_MATERIALS'):guidePath=guidePath.parent/'ReferenceIntrinsic'/guidePath.name
    guide=bpy.data.images.load(str(guidePath),check_existing=False);guide.colorspace_settings.name='Non-Color'
    width,height=guide.size;pixels=np.empty(width*height*4,dtype=np.float32);guide.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)[:,:,0]
    def sample(x,y):
        u=min(width-2,max(0,(.5+x/.5)*width-.5 if alignedGeometry else (.5+x/.5)*(width-1)));v=min(height-2,max(0,(.5+y/.5)*height-.5 if alignedGeometry else (.5+y/.5)*(height-1)));i,j=int(u),int(v);fu,fv=u-i,v-j
        return float((pixels[j,i]*(1-fu)+pixels[j,i+1]*fu)*(1-fv)+(pixels[j+1,i]*(1-fu)+pixels[j+1,i+1]*fu)*fv)
    segments=128;rows=128;vertices=[];faces=[]
    for k in range(1,rows+1):
        radius=.225*k/rows
        for j in range(segments):
            angle=2*math.pi*j/segments;x,y=radius*math.cos(angle),radius*math.sin(angle)
            z=LidSurfaceHeight(radius,angle=angle)+(.006*sample(x,y) if alignedGeometry else .0055*(sample(x,y)-.5))
            vertices.append((x,y,z))
    center=len(vertices);vertices.append((0,0,lidSurfaceZ+(.006*sample(0,0) if alignedGeometry else .0055*(sample(0,0)-.5))))
    for j in range(segments):faces.append((center,j,(j+1)%segments))
    for k in range(rows-1):
        for j in range(segments):
            n=(j+1)%segments;faces.append(((k+1)*segments+j,(k+1)*segments+n,k*segments+n,k*segments+j))
    obj=meshFactory(name,vertices,faces,materials,[0]*len(faces),parent)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    modifier=obj.modifiers.new('CImageReliefBudget','DECIMATE');modifier.ratio=940/(segments*(rows*2-1));modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)
    if alignedGeometry:
        maximum=0
        for vertex in obj.data.vertices:
            x,y=vertex.co.x,vertex.co.y;z=LidSurfaceHeight(math.hypot(x,y),angle=math.atan2(y,x))+.006*sample(x,y);maximum=max(maximum,abs(vertex.co.z-z));vertex.co.z=z
        obj.data.update();obj['K06RetopologyReprojected']=True;obj['K06PreReprojectionMaxErrorM']=maximum
    obj.data.calc_loop_triangles();assert len(obj.data.loop_triangles)<=940
    for polygon in obj.data.polygons:polygon.use_smooth=True
    obj['K06ReliefMethod']='image-aligned sculpt-compatible retopology <=940 triangles, reprojected after reduction; original albedo retained' if alignedGeometry else 'image-derived height guide, 5.5mm guide span, reduced to <=940 actual triangles; inferred, not measured'
    obj['K06ReliefSource']=str(guidePath)
    bpy.data.images.remove(guide)
    print('LID_ADAPTIVE_TRIANGLES',name,len(obj.data.loop_triangles))
    return obj


def CreateRoundWeaveReceiver(parent,name,materials,meshFactory):
    if globals().get('K06_CONTINUOUS_LID'):return CreateContinuousLidReceiver(parent,name,materials,meshFactory)
    import math,bmesh
    segments=24;vertices=[(0,0,lidSurfaceZ-.0010)];faces=[];ids=[]
    for radius in (.12,.225):
        for j in range(segments):
            angle=2*math.pi*j/segments;vertices.append((radius*math.cos(angle),radius*math.sin(angle),LidSurfaceHeight(radius,angle=angle)-.0010))
    for j in range(segments):faces.append((0,1+j,1+(j+1)%segments));ids.append(0)
    for j in range(segments):
        n=(j+1)%segments;faces.append((1+j,1+segments+j,1+segments+n,1+n));ids.append(0)
    carrierVertices=len(vertices)
    for row in (0,3,6,10,13,16,20,23,26,29):
        count=16 if row<=10 else 24 if row<=20 else 32;base=len(vertices)
        for j in range(count):
            angle=2*math.pi*j/count;center=LidRingRadius(row,angle)
            for offset,height in ((-.0052,.0010),(0,.0065),(.0052,.0010)):
                radius=center+offset;vertices.append((radius*math.cos(angle),radius*math.sin(angle),LidSurfaceHeight(radius,angle=angle)+height))
        for j in range(count):
            n=(j+1)%count
            for k in range(2):faces.append((base+j*3+k,base+j*3+k+1,base+n*3+k+1,base+n*3+k));ids.append(1)
    obj=meshFactory(name,vertices,faces,materials,ids,parent)
    for polygon,materialId in zip(obj.data.polygons,ids):polygon.material_index=materialId;polygon.use_smooth=True
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(obj.data);bm.free();obj.data.update()
    triangles=sum(len(p.vertices)-2 for p in obj.data.polygons);assert triangles==1000
    obj['K06LidCarrierVertexCount']=carrierVertices;obj['K06ReliefMethod']='ten separate raised willow courses across the full lid; normal-baked interleaved carrier';obj['K06RaisedCourses']=10;print('ROUND_WEAVE_RECEIVER',name,triangles)
    return obj


def CreateContinuousLidReceiver(parent,name,materials,meshFactory):
    """One relief surface, fitted to the physical weave without duplicate layers."""
    import bpy,math,json,numpy as np
    from pathlib import Path
    folder=ContinuousLidFolder()
    geometryPath=folder/'Data_ContinuousReceiver.json'
    if UseWillowWoodV2():
        import hashlib
        receipt=json.loads((WillowWoodV2Folder()/'Data_WoodSurfaceV2.json').read_text(encoding='utf-8'));assert hashlib.sha256(geometryPath.read_bytes()).hexdigest()==receipt['lockedReceiverSha256']
        data=json.loads(geometryPath.read_text(encoding='utf-8'));obj=meshFactory(name,data['vertices'],data['faces'],materials,[0]*len(data['faces']),parent)
        for polygon in obj.data.polygons:polygon.use_smooth=True;polygon.material_index=0
        obj['K06ReliefMethod']=data['method'];obj['K06ContinuousReceiverTriangles']=data['triangles'];obj['K06GeometryLockedTo']='34b0f08860ca0d6c';print('LOCKED_WOOD_RECEIVER',name,data['triangles']);return obj
    high=globals().get('K06_CONTINUOUS_LID_HIGH')
    if high is not None:
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        tree=BVHTree.FromObject(high,bpy.context.evaluated_depsgraph_get())
        size=512;span=.5;values=np.zeros((size,size));valid=np.zeros((size,size))
        for j in range(size):
            y=((j+.5)/size-.5)*span
            for i in range(size):
                x=((i+.5)/size-.5)*span
                if x*x+y*y>.243**2:continue
                point,normal,face,distance=tree.ray_cast(Vector((x,y,.3)),Vector((0,0,-1)),.2)
                if point is not None:values[j,i]=point.z;valid[j,i]=1
        # Fill small weave openings from their immediate physical neighbours.
        # The 0.8 mm filter removes discontinuous hole walls, retaining course relief.
        frequency=np.fft.fftfreq(size);kernel=np.exp(-2*np.pi*np.pi*(.0008*size/span)**2*(frequency[:,None]**2+frequency[None,:]**2))
        def Blur(value):return np.fft.ifft2(np.fft.fft2(value)*kernel).real
        support=Blur(valid);height=Blur(values)/np.maximum(support,1e-8)
        def Sample(x,y):
            u=min(size-2,max(0,(x/span+.5)*size-.5));v=min(size-2,max(0,(y/span+.5)*size-.5));i,j=int(u),int(v);a,b=u-i,v-j
            if support[j,i]<.02:return LidSurfaceHeight(math.hypot(x,y),angle=math.atan2(y,x))
            return float(height[j,i]*(1-a)*(1-b)+height[j,i+1]*a*(1-b)+height[j+1,i]*(1-a)*b+height[j+1,i+1]*a*b)

        import hashlib
        rimPath=BuildScriptPath().parent/'Data_K06LidFrameInput.json';assert hashlib.sha256(rimPath.read_text(encoding='utf-8').encode('utf-8')).hexdigest()=='999b9abe71de1becc514e9cde680f7dd96986354a9840320e3bbb1d7045e24f5'
        rimInput=json.loads(rimPath.read_text(encoding='utf-8'));frameVertices=[];frameFaces=[]
        for part in rimInput['meshes']:
            if part['name'] not in ('LidRimBundle','LidBindings','LidBarkWear'):continue
            offset=len(frameVertices);frameVertices.extend(part['vertices']);frameFaces.extend(tuple(i+offset for i in face) for face in part['faces'])
        rimTree=BVHTree.FromPolygons(frameVertices,frameFaces,all_triangles=True)
        limits=np.full(256,.239)
        for j in range(len(limits)):
            a=2*math.pi*j/len(limits);ca,sa=math.cos(a),math.sin(a)
            for radius in np.arange(.213,.2391,.0004):
                point=Vector((radius*ca,radius*sa,Sample(radius*ca,radius*sa)));nearest,normal,face,distance=rimTree.find_nearest(point)
                if distance<.0005:
                    limits[j]=max(.215,radius-.0006);break
        def EdgeLimit(angle,profile=None):
            if profile is None:profile=limits
            u=(angle%(2*math.pi))*len(profile)/(2*math.pi);i=int(u)%len(profile);t=u-int(u)
            return float(profile[i]*(1-t)+profile[(i+1)%len(profile)]*t)
        segments=256;rows=128;vertices=[(0,0,Sample(0,0))];faces=[]
        for k in range(1,rows+1):
            for j in range(segments):
                a=2*math.pi*j/segments;radius=EdgeLimit(a)*k/rows;x,y=radius*math.cos(a),radius*math.sin(a);vertices.append((x,y,Sample(x,y)))
        for j in range(segments):faces.append((0,1+j,1+(j+1)%segments))
        for k in range(rows-1):
            for j in range(segments):
                a=1+k*segments+j;b=1+k*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
        obj=meshFactory(name,vertices,faces,materials,[0]*len(faces),parent)
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        modifier=obj.modifiers.new('PhysicalWeaveSurfaceBudget','DECIMATE');modifier.ratio=1000/(segments*(2*rows-1));modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)
        for vertex in obj.data.vertices:vertex.co.z=Sample(vertex.co.x,vertex.co.y)

        obj.data.update();obj.data.calc_loop_triangles()
        originalCoords=[v.co.copy() for v in obj.data.vertices];baseLimits=limits.copy()
        for fit in range(81):
            obj.data.calc_loop_triangles();surfaceTree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)
            hits=rimTree.overlap(surfaceTree)
            if not hits:break
            vertices={i for _,face in hits for i in obj.data.loop_triangles[face].vertices if math.hypot(originalCoords[i].x,originalCoords[i].y)>.19}
            assert vertices,'Lid/frame fit affected the interior'
            changedBins=set()
            for i in vertices:
                p=originalCoords[i];j=round((math.atan2(p.y,p.x)%(2*math.pi))*len(limits)/(2*math.pi))%len(limits)
                changedBins.update((j+offset)%len(limits) for offset in range(-6,7))
            for j in changedBins:limits[j]-=.0002
            for smooth in range(3):limits=np.minimum(limits,np.minimum(np.roll(limits,1),np.roll(limits,-1))+.00015)
            assert float(limits.min())>.21,'Frame-fitting radius collapsed'
            for vertex,point in zip(obj.data.vertices,originalCoords):
                radius=math.hypot(point.x,point.y);angle=math.atan2(point.y,point.x);newRadius=radius
                if radius>.19:newRadius=.19+(radius-.19)*(EdgeLimit(angle)-.19)/(EdgeLimit(angle,baseLimits)-.19)
                x,y=newRadius*math.cos(angle),newRadius*math.sin(angle);vertex.co=(x,y,Sample(x,y))
            obj.data.update()
        assert fit<80,'Continuous lid/frame fitting exceeded the limit'
        print('C_LID_FRAME_FIT',fit,'boundaryM',float(limits.min()),float(limits.max()))
        obj.data.update();obj.data.calc_loop_triangles()
        data={'method':'single continuous upper envelope sampled from physical round willow high mesh; 0.8mm normalised filter; QEM and reprojection','vertices':[list(v.co) for v in obj.data.vertices],'faces':[list(t.vertices) for t in obj.data.loop_triangles],'triangles':len(obj.data.loop_triangles)}
        assert data['triangles']<=1000
        geometryPath.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    else:
        data=json.loads(geometryPath.read_text(encoding='utf-8'));obj=meshFactory(name,data['vertices'],data['faces'],materials,[0]*len(data['faces']),parent)
    for polygon in obj.data.polygons:polygon.use_smooth=True;polygon.material_index=0
    obj['K06ReliefMethod']=data['method'];obj['K06ContinuousReceiverTriangles']=data['triangles']
    print('CONTINUOUS_WEAVE_RECEIVER',name,data['triangles'])
    return obj


def LidInnerReceiverGeometry(z=.1775):
    import math
    segments=32;rows=2;verts=[];faces=[]
    for k in range(rows+1):
        r=.00795+(.225-.00795)*k/rows
        for j in range(segments):
            a=2*math.pi*j/segments;verts.append((r*math.cos(a),r*math.sin(a),z))
    for k in range(rows):
        for j in range(segments):
            n=(j+1)%segments;faces.append((k*segments+j,k*segments+n,(k+1)*segments+n,(k+1)*segments+j))
    center=len(verts);verts.append((0,0,z))
    for j in range(segments):faces.append((center,(j+1)%segments,j))
    return verts,faces


def BodySkinGeometry(inside=False):
    """Physical half-round weft strips and recessed stake strips, not two skins.

    The legacy inside/outer labels only select the two independent bake atlases.
    The open backs are double sided; each course has an actual radial crown.
    """
    import math
    verts=[];faces=[];uvfaces=[];rows=21;pitch=.164/rows
    if not inside:
        segments=18
        for row in range(rows):
            base=len(verts)
            for j in range(segments+1):
                a=2*math.pi*j/segments;flow=row+j/segments
                z=BodyCourseHeight(flow,a)
                radius=BodyMeanRadius(z,a)+.00035*math.sin(9*a+flow*.49)
                for k in range(3):
                    h=z+(k-1)*.00315;r=radius+(.0025 if k==1 else 0)
                    verts.append((r*math.cos(a),r*math.sin(a),h))
            for j in range(segments):
                for k in range(2):
                    q=(base+j*3+k,base+(j+1)*3+k,base+(j+1)*3+k+1,base+j*3+k+1)
                    faces.append(q);uvfaces.append(((j/segments,(row+k/2)/rows),((j+1)/segments,(row+k/2)/rows),((j+1)/segments,(row+(k+1)/2)/rows),(j/segments,(row+(k+1)/2)/rows)))
    else:
        for strand in range(42):
            group=strand//2;a=2*math.pi*group/21+(-.009 if strand%2==0 else .009);base=len(verts)
            for z in (.014,.090,.170):
                r=BodyMeanRadius(z,a)-.0065
                for shift in (-.0075,.0075):verts.append((r*math.cos(a+shift),r*math.sin(a+shift),z))
            for k in range(2):
                q=(base+k*2,base+k*2+1,base+k*2+3,base+k*2+2);faces.append(q)
                uvfaces.append(tuple(((strand+(v%2))/42,verts[v][2]/.180) for v in q))
    return verts,faces,uvfaces

def BodyInnerRadiusAtHeight(z,a):
    levels=(.005,.026,.074,.126,.1735)
    j=next((i for i in range(4) if z<=levels[i+1]),3);t=min(1,max(0,(z-levels[j])/(levels[j+1]-levels[j])))
    radii=[]
    for height in (levels[j],levels[j+1]):
        depth=.0010+.0017*min(1,max(0,(height-.005)/.021));radii.append(BodyMeanRadius(height,a)-depth)
    return radii[0]*(1-t)+radii[1]*t

def CreateBodySkinMeshes(parent,prefix,material,meshFactory):
    if globals().get('K06_INTRINSIC_WEAVE'):
        import math
        segments=32;levels=tuple(BodyHeight(z) for z in (.005,.030,.095,.1698));levelCount=len(levels);objects=[]
        for inside in (False,True):
            vertices=[];faces=[];uvfaces=[]
            for j in range(segments+1):
                a=2*math.pi*j/segments
                for z in levels:
                    depth=.001+.0017*min(1,max(0,(BodyAuthorHeight(z)-.005)/.021));r=BodyMeanRadius(z,a)+(-depth if inside else depth);vertices.append((r*math.cos(a),r*math.sin(a),z))
            for j in range(segments):
                for k in range(levelCount-1):
                    q=(j*levelCount+k,(j+1)*levelCount+k,(j+1)*levelCount+k+1,j*levelCount+k+1);uv=((j/segments,BodyAuthorHeight(levels[k])/.18),((j+1)/segments,BodyAuthorHeight(levels[k])/.18),((j+1)/segments,BodyAuthorHeight(levels[k+1])/.18),(j/segments,BodyAuthorHeight(levels[k+1])/.18))
                    faces.append(tuple(reversed(q)) if inside else q);uvfaces.append(tuple(reversed(uv)) if inside else uv)
            obj=meshFactory(prefix+('_WallInnerWoven' if inside else '_WallOuterWoven'),vertices,faces,[material],[0]*len(faces),parent);obj['K06IntrinsicBody']=True
            for poly,coords in zip(obj.data.polygons,uvfaces):
                poly.use_smooth=True
                for loop,uv in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=uv
            objects.append(obj)
        return objects
    if globals().get('K06_BODY_REPRESENTATION')=='covered':
        import bpy
        from pathlib import Path
        templates=globals().get('K06_COVERED_BODY_TEMPLATES')
        if templates is None:
            path=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/CoveredWallStudy/Scene_K06CoveredWall.blend')
            with bpy.data.libraries.load(str(path),link=False) as (src,dst):dst.objects=['K06_CoveredWallOuter','K06_CoveredWallInner']
            templates=dst.objects
            for side,template in zip(('Outer','Inner'),templates):
                for mat in template.data.materials:
                    for node in mat.node_tree.nodes:
                        if node.type=='TEX_IMAGE' and node.image and node.image.name.startswith('Texture_K06Covered'+side+'Base'):
                            authored=bpy.data.images.load(str(path.parent/('Texture_K06Covered'+side+'AuthoredBase.png')),check_existing=False);authored.pack();node.image=authored
            globals()['K06_COVERED_BODY_TEMPLATES']=templates
        objects=[]
        for side,template in zip(('Outer','Inner'),templates):
            obj=template.copy();obj.name=prefix+'_Wall'+side+'Woven';obj.parent=parent;obj['K06DeepProjection']=True;bpy.context.collection.objects.link(obj);objects.append(obj)
        return objects
    objects=[]
    for inside in (False,True):
        vertices,faces,uvfaces=BodySkinGeometry(inside)
        obj=meshFactory(prefix+('_WallInnerWoven' if inside else '_WallOuterWoven'),vertices,faces,[material],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,uv in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=uv
        objects.append(obj)
    return objects

def ClearFreshTaskScene():
    import bpy
    scene=bpy.context.scene
    assert bpy.context.window and bpy.context.window.scene is scene, 'Active Blender scene mismatch'
    assert len(bpy.data.scenes)==1, 'Start a fresh task-only Blender instance for every bake'
    assert all(o.name in {'Cube','Camera','Light'} for o in scene.objects), 'Bake requires a fresh startup scene'
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    assert not list(scene.objects), 'Bake scene must be empty before construction'
    return scene

def StagePrepareWillowWoodV2():
    """Prepare a fine willow skin while retaining the accepted 34b0f088 geometry."""
    from pathlib import Path
    from PIL import Image
    import subprocess,sys,json,hashlib,shutil,importlib.util,datetime,numpy as np
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='backslashreplace')
    folder=WillowWoodV2Folder();out=folder/'Baked';out.mkdir(exist_ok=True);source=folder/'Texture_K06WillowBarkSourceV2.png';metadata=json.loads((folder/'Data_WillowBarkSourceV2.json').read_text(encoding='utf-8'));assert hashlib.sha256(source.read_bytes()).hexdigest()==metadata['sourceSha256']
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py'
    args=['--source',str(source),'--name','K06WillowSkinV2','--preset','weatheredWood','--tile-m','0.08','--size','1024','--data-size','1024','--seamless','weld','--mean','0.46,0.41,0.34','--contrast','0.10','--tone-strength','0.85','--relief-m','0.00014','--normal-strength','1','--rough','0.80','--rough-var','0.04','--rough-luma-k','-0.90','--rough-min','0.58','--ao','0.25','--data-lossless','--base-quality','94','--out',str(out),'--no-record']
    result=subprocess.run([sys.executable,str(bakerPath),*args],check=True,capture_output=True,text=True,encoding='utf-8',env={**os.environ,'PYTHONIOENCODING':'utf-8'});print(result.stdout)
    spec=importlib.util.spec_from_file_location('WillowWoodBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    pixels={channel:np.asarray(Image.open(out/('Texture_K06WillowSkinV2'+channel+'.webp')).convert('RGBA'),dtype=float)/255 for channel in ('Base','Normal','Orm')}
    def Resize(value):
        if value.ndim==3:return np.stack([Resize(value[:,:,i]) for i in range(value.shape[2])],axis=2)
        return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((512,512),Image.Resampling.LANCZOS),dtype=float)
    base=np.clip(Resize(pixels['Base']),0,1);vectors=Resize(pixels['Normal'][:,:,:3]*2-1);length=np.linalg.norm(vectors,axis=2);normal=vectors/np.maximum(length[:,:,None],1e-6);orm=np.clip(Resize(pixels['Orm']),0,1);orm[:,:,1]=np.sqrt(np.clip(orm[:,:,1]**2+.25*(1-np.clip(length,0,1)),0,1));orm[:,:,2]=0
    bareBase=np.dstack((baker.MatchTone(baker.SrgbToLinear(base[:,:,:3]),[.62,.56,.46],.045,.95),np.ones((512,512))));bareNormal=normal.copy();bareNormal[:,:,:2]*=.35;bareNormal/=np.maximum(np.linalg.norm(bareNormal,axis=2,keepdims=True),1e-6);bareOrm=orm.copy();bareOrm[:,:,1]=np.clip(.62+bareOrm[:,:,1]*.10,.62,.72)
    for kind,values in (('Rim',{'Base':base,'Normal':np.dstack((normal*.5+.5,np.ones((512,512)))),'Orm':orm}),('Exposed',{'Base':bareBase,'Normal':np.dstack((bareNormal*.5+.5,np.ones((512,512)))),'Orm':bareOrm})):
        for channel,value in values.items():
            path=out/('Texture_K06Willow'+kind+'V2'+channel+'.webp');Image.fromarray(np.uint8(np.clip(np.rint(value*255),0,255)),'RGBA').save(path,'WEBP',lossless=True,method=6,exact=True)
    lockedSource=folder.parent/'LidCReferenceWeave/Data_ContinuousReceiver.json';lidFolder=folder/'LidBake';lidFolder.mkdir(exist_ok=True);shutil.copy2(lockedSource,lidFolder/'Data_ContinuousReceiver.json')
    outputs=[{'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pixels':list(Image.open(path).size),'bytes':path.stat().st_size} for path in sorted(out.glob('Texture_*.webp'))]
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(folder.parent.parent),'sourceMetadata':'Data_WillowBarkSourceV2.json','bakerArguments':args,'bakerStdout':result.stdout,'physicalTileMeters':.08,'scaleBasis':'authoring inference; not measured','normalFineBarkStrength':.5,'roughnessMethod':'lighter rubbed fibers smoother than intact bark, derived from source luma; .58 minimum','lockedGeometryCandidate':'34b0f08860ca0d6c','lockedReceiverSha256':hashlib.sha256(lockedSource.read_bytes()).hexdigest(),'outputs':outputs,'runtimeRegistered':False,'userApproved':False}
    (folder/'Data_WoodSurfaceV2.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('WILLOW_WOOD_V2_PREPARED',len(outputs),'lockedGeometry',receipt['lockedGeometryCandidate'])


def ApplyWillowWoodV2(scene):
    import bpy,json,hashlib
    from pathlib import Path
    folder=WillowWoodV2Folder();receipt=json.loads((folder/'Data_WoodSurfaceV2.json').read_text(encoding='utf-8'));outputs={Path(row['file']).name:row for row in receipt['outputs']}
    for name,kind in (('Wicker_RimTwig','Rim'),('Wicker_ExposedWillow','Exposed')):
        material=bpy.data.materials[name];nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF')
        for channel in ('Base','Normal','Orm'):
            filename='Texture_K06Willow'+kind+'V2'+channel+'.webp';row=outputs[filename];assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256'];image=bpy.data.images.load(row['file'],check_existing=False)
            if channel!='Base':image.colorspace_settings.name='Non-Color'
            image.pack();node=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image and channel in n.image.name);node.image=image
            if channel=='Base':links.new(node.outputs['Color'],bs.inputs['Base Color'])
        next(n for n in nodes if n.type=='NORMAL_MAP').inputs['Strength'].default_value=.5;bs.inputs['Metallic'].default_value=0
    scene['K06WoodMaterialVariant']='WillowWoodV2: fine longitudinal bark, rubbed fibers and variable roughness';print('WILLOW_WOOD_V2_RUNTIME_APPLIED')


def Stage_prepare_rim_native():
    """Reproduce the native bark crop and the explicitly local dense PBR trial."""
    from pathlib import Path
    from PIL import Image
    import subprocess,sys,json,hashlib
    folder=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    source=folder/'Texture_K06ThinWillowBarkSource.png';target=folder/'Texture_K06RimNativeSource.png'
    im=Image.open(source);side=min(im.size);left=(im.width-side)//2;top=(im.height-side)//2;box=(left,top,left+side,top+side)
    im.crop(box).save(target)
    baker=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py'
    args=['--source',str(target),'--name','K06RimNative','--preset','weatheredWood','--tile-m','0.08','--size','512','--data-size','512','--seamless','weld','--rough','0.90','--rough-var','0.05','--relief-m','0.0003','--normal-strength','1','--out',str(folder),'--preview-dir',str(folder/'RimNativePreview'),'--no-record']
    result=subprocess.run([sys.executable,str(baker),*args],check=True,capture_output=True,text=True,encoding='utf-8',env={**os.environ,'PYTHONIOENCODING':'utf-8'})
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='backslashreplace')
    print(result.stdout)
    receipt={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourcePixels':im.size,'cropBox':box,'cropPixels':[side,side],'cropSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'physicalTileMeters':.08,'scaleBasis':'Local authoring inference from the selected coarse willow reference; not measured. No source enlargement.','nativeCropPixelsPerMm':side/80,'derivativePixelsPerMm':6.4,'highAtlasLongitudinalPixelsPerMmApprox':2.7,'baker':str(baker),'bakerArguments':args,'bakerStdout':result.stdout,'strictGateClaimed':False,'standardGateException':'6400px/m exceeds the general repeat-texture gate [128,1024]. Local material trial only; no runtime registration.','outputs':{channel:hashlib.sha256((folder/('Texture_K06RimNative'+channel+'.webp')).read_bytes()).hexdigest() for channel in ('Base','Normal','Orm')}}
    (folder/'Data_RimNativeSampling.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')

def Stage_prepare_twig():
    """Extract distinct small willow-fiber strips, removing row illumination gradients."""
    from pathlib import Path
    from PIL import Image,ImageFilter
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    src=np.asarray(Image.open(p/'Texture_K06AgedWillowSource.png').convert('RGB'),dtype=np.float32)
    atlas=Image.new('RGB',(1024,96))
    for i in range(48):
        column=i%6; row=i//6
        x0=125+column*176
        y0=30+row*145
        profile=src[max(0,y0-12):min(1248,y0+13),x0:x0+135].mean(axis=(1,2))
        target=np.percentile(profile,65)
        center=max(5,min(1248,y0-12+int(np.argmin(abs(profile-target)))))
        patch=src[center-5:center+5,x0:x0+135].copy()
        # Remove slow illumination, retaining localized fine fiber and wear.
        smooth=np.asarray(Image.fromarray(np.uint8(patch),'RGB').filter(ImageFilter.GaussianBlur(8)),dtype=np.float32)
        detail=np.clip(patch/np.maximum(smooth,25),.72,1.28)
        patch=detail*np.array([115,96,78],dtype=np.float32)[None,None,:]
        patch=np.uint8(np.clip(patch,0,255))
        im=Image.fromarray(patch,'RGB').resize((128,16),Image.Resampling.LANCZOS)
        a=np.asarray(im,dtype=np.float32).copy()
        for k in range(12):
            w=(12-k)/24;left=a[:,k].copy();right=a[:,-1-k].copy();a[:,k]=left*(1-w)+right*w;a[:,-1-k]=right*(1-w)+left*w
        atlas.paste(Image.fromarray(np.uint8(np.clip(a,0,255)),'RGB'),((i%8)*128,(i//8)*16))
    atlas.save(p/'Texture_K06TwigFiberAtlas.png')
    print('FIBER_ATLAS',atlas.size,'strips',48)


def Stage_bake_weave():
    import bpy, math, random, bisect
    from pathlib import Path
    from mathutils import Vector

    random.seed(1938)
    out=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    ClearFreshTaskScene()
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=16
    scene.render.bake.use_clear=True; scene.render.bake.margin=8
    tile=0.18; row_count=24; stake_count=7; pitch_y=tile/row_count; pitch_x=tile/stake_count
    rows=[-tile/2+(i+0.5)*pitch_y+random.uniform(-0.00065,0.00065) for i in range(row_count)]
    stakes=[-tile/2+(i+0.5)*pitch_x+random.uniform(-0.0018,0.0018) for i in range(stake_count)]
    verts=[]; faces=[]
    def cross_index(t, positions, pitch):
        i=bisect.bisect_right(positions,t)-1
        if i<0:return (t-positions[0])/pitch
        if i>=len(positions)-1:return len(positions)-1+(t-positions[-1])/pitch
        return i+(t-positions[i])/(positions[i+1]-positions[i])
    def add_tube(axis, index, spacing, count, steps, sides):
        pos=(rows if axis=='x' else stakes)[index]
        radius=0.00175*(1+0.19*math.sin(index*5.2)+0.07*math.cos(index*1.31))
        base=len(verts)
        for i in range(steps+1):
            t=-tile/2-0.015+(tile+0.03)*i/steps
            points=stakes if axis=='x' else rows
            phase=math.pi*(cross_index(t,points,pitch_x if axis=='x' else pitch_y)+index)
            h=0.005+(0.0018 if axis=='x' else -0.0018)*math.cos(phase)
            h+=0.00017*math.sin(t*117+index*1.7)
            jitter=0.00048*math.sin(t*74+index*2.7)+0.00019*math.sin(t*193+index*0.83)
            local_radius=radius*(1+0.10*math.sin(t*110+index*1.2)+0.045*math.sin(t*421+index))
            for j in range(sides):
                a=2*math.pi*j/sides
                s=pos+jitter+local_radius*math.cos(a)
                z=h+local_radius*math.sin(a)
                verts.append((t,s,z) if axis=='x' else (s,t,z))
        for i in range(steps):
            for j in range(sides):
                j2=(j+1)%sides
                f=(base+i*sides+j,base+(i+1)*sides+j,base+(i+1)*sides+j2,base+i*sides+j2)
                faces.append(tuple(reversed(f)) if axis=='x' else f)
    for j in range(row_count): add_tube('x',j,pitch_y,row_count,64,8)
    for j in range(stake_count): add_tube('y',j,pitch_x,stake_count,120,8)
    me=bpy.data.meshes.new('HighWeave_Mesh'); me.from_pydata(verts,[],faces); me.update()
    high=bpy.data.objects.new('HighWeave',me); bpy.context.collection.objects.link(high)
    for p in high.data.polygons:p.use_smooth=True
    bpy.ops.mesh.primitive_plane_add(size=tile); low=bpy.context.object; low.name='LowBakePlane'
    mat=bpy.data.materials.new('BakedWeave'); mat.use_nodes=True; low.data.materials.append(mat)
    nodes=mat.node_tree.nodes
    scene.render.bake.use_selected_to_active=True
    scene.render.bake.cage_extrusion=0.014
    scene.render.bake.max_ray_distance=0.025
    assert bpy.context.scene is scene and bpy.context.window.scene is scene and set(scene.objects)=={high,low}, 'Unexpected bake scene objects'
    print('BAKE_SCENE',scene.name,'objects',[(o.name,o.type) for o in scene.objects])
    def bake(kind, name):
        im=bpy.data.images.new(name,width=1024,height=1024,alpha=False)
        im.colorspace_settings.name='Non-Color'
        node=nodes.new('ShaderNodeTexImage'); node.image=im; nodes.active=node
        bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active=low
        bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.014, max_ray_distance=0.025, margin=8)
        im.filepath_raw=str(out/(name+'.png')); im.file_format='PNG'; im.save(); im.pack()
        nodes.remove(node)
        print('BAKED',kind,im.filepath_raw)
    bake('NORMAL','Texture_K06WeaveHighNormal')
    bake('AO','Texture_K06WeaveHighAo')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Scene_K06WeaveHighBake.blend'))
    print('HIGH_TRIS',sum(len(p.vertices)-2 for p in high.data.polygons))


def Stage_combine_weave():
    """Combine tangent-space high weave normals with local willow fiber normals."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    high=np.asarray(Image.open(p/'Texture_K06WeaveHighNormal.png').convert('RGB'),dtype=np.float32)/127.5-1
    source=Image.open(p/'Texture_K06AgedWillowBase.webp').convert('RGB')
    source_normal=Image.open(p/'Texture_K06AgedWillowNormal.webp').convert('RGB')
    target=np.mean(high[:,:,2],axis=1)
    target=(target-target.mean())/(target.std()+1e-9)
    best=(-1,None)
    for start in range(0,129):
        crop=source.crop((0,start,512,start+384)).resize((1024,1024),Image.Resampling.LANCZOS)
        profile=np.asarray(crop,dtype=np.float32).mean(axis=(1,2))
        profile=(profile-profile.mean())/(profile.std()+1e-9)
        corr=float(np.mean(profile*target))
        if corr>best[0]:best=(corr,start)
    start=best[1]
    matched=source.crop((0,start,512,start+384)).resize((1024,1024),Image.Resampling.LANCZOS)
    matched.save(p/'Texture_K06WillowMatchedBase.webp',format='WEBP',quality=88,method=6)
    fiber_img=source_normal.crop((0,start,512,start+384)).resize((1024,1024),Image.Resampling.LANCZOS)
    fiber_img.save(p/'Texture_K06WillowMatchedFiberNormal.png')
    fiber=np.asarray(fiber_img,dtype=np.float32)/127.5-1
    xy=high[:,:,:2]*0.50+fiber[:,:,:2]*0.50
    length=np.sum(xy*xy,axis=2)
    scale=np.minimum(1,0.96/np.sqrt(np.maximum(length,1e-8)))
    xy*=scale[:,:,None]
    z=np.sqrt(np.maximum(0,1-np.sum(xy*xy,axis=2)))
    combined=np.dstack((xy,z))
    Image.fromarray(np.uint8(np.clip(combined*127.5+127.5,0,255)),'RGB').save(p/'Texture_K06WillowCombinedNormal.png')
    ao=np.asarray(Image.open(p/'Texture_K06WeaveHighAo.png').convert('L'),dtype=np.float32)/255
    ao=0.65+0.35*ao
    Image.fromarray(np.uint8(np.clip(ao*255,0,255)),'L').save(p/'Texture_K06WillowContactAo.png')
    print('MATCHED vertical crop start',start,'correlation',round(best[0],4),'COMBINED range',combined.min(),combined.max())


def BakeLidWeave(centerOnly=False,bottomOnly=False,insideOnly=False,surfaceOnly=False):
    """Bake physical annular woven lid to a planar atlas; no lit concept projection."""
    import bpy,math,random
    import bisect
    from pathlib import Path
    random.seed(6040 if bottomOnly else 6038)
    out=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    materials=out
    physicalRelief=bool(globals().get('K06_LID_PHYSICAL_RELIEF'))
    roundWeave=bool(globals().get('K06_ROUND_WEAVE_RUNTIME'));continuousWeave=bool(globals().get('K06_CONTINUOUS_LID'))
    if physicalRelief:out=materials/'LidReliefPhysical';out.mkdir(exist_ok=True)
    if roundWeave:out=materials/'LidRoundWeave';out.mkdir(exist_ok=True)
    if continuousWeave:out=ContinuousLidFolder();out.mkdir(exist_ok=True)
    fullBottom=bottomOnly and IsFullWeaveStudy()
    if fullBottom:out=materials/'FullWeaveStudy';out.mkdir(exist_ok=True)
    ClearFreshTaskScene()
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64 if physicalRelief else 32
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=0.022;scene.render.bake.max_ray_distance=0.035;scene.render.bake.margin=8
    verts=[];faces=[];uvfaces=[];ids=[]
    rows=37 if bottomOnly else 33;spokes=64 if bottomOnly else 56;steps=320;sides=12;inner=.010 if bottomOnly else .023;pitch=.00595 if bottomOnly else .00670
    branchSmall=.050 if bottomOnly and not fullBottom else .031;branchLarge=.112 if bottomOnly and not fullBottom else .086
    verticalRatio=.70 if bottomOnly and not fullBottom else .82;crossOffsets=EllipseArcOffsets(sides,verticalRatio)
    if roundWeave:verticalRatio=1.0;sides=16;crossOffsets=EllipseArcOffsets(sides,verticalRatio)
    def ring_radius(row,a):
        if fullBottom:
            fraction=row/(rows-1);outer=BodyInnerRadiusAtHeight(.009,a)-.0010
            return inner+fraction*(outer-inner)+(1-fraction**4)*(.0011*math.sin(3*a+row*.07)+.0005*math.sin(11*a+row*.10))
        return LidRingRadius(row,a)
    def crossing_number(rad,positions):
        j=bisect.bisect_right(positions,rad)-1
        if j<0:return (rad-positions[0])/pitch
        if j>=len(positions)-1:return len(positions)-1+(rad-positions[-1])/pitch
        return j+(rad-positions[j])/(positions[j+1]-positions[j])
    def addtube(kind,index,radius_override=None,lane=0):
        base=len(verts);thicknesses=[]
        tube_id=index if kind=='ring' else rows+index
        phase_offset=random.Random(6000+tube_id+lane*31).uniform(0,1)
        start=inner if index%4==0 else (branchSmall if index%2==0 else branchLarge)
        count=steps if kind=='ring' else int((inner+(rows-1)*pitch-start)/pitch*4)
        radius0=(inner+index*pitch if radius_override is None else radius_override) if kind=='ring' else 0
        a0=2*math.pi*index/spokes+.006*math.sin(index*2.17) if kind=='spoke' else 0
        thickness=((.00285 if kind=='ring' else .0018)*(1+.10*math.sin(index*2.13))) if physicalRelief else (.00128 if bottomOnly and not fullBottom else ((.00175 if bottomOnly else .00200) if kind=='ring' else (.00155 if bottomOnly else .00200)))*(1+0.19*math.sin(index*2.13))
        for i in range(count+1):
            if kind=='ring':
                a=2*math.pi*i/count
                rad=ring_radius(index,a) if radius_override is None else radius0+0.00015*math.sin(3*a+index)
                stake_count=spokes//4 if radius0<branchSmall else (spokes//2 if radius0<branchLarge else spokes)
                h=0.006+(.00260 if roundWeave else .00210 if physicalRelief else .00115 if bottomOnly else .00190)*math.cos(stake_count*.5*a+index*math.pi)
                along=2*math.pi*radius0*i/count
            else:
                rad=start+((ring_radius(rows-1,a0) if fullBottom else inner+(rows-1)*pitch)-start)*i/count
                a=a0+.007*math.sin(rad*45+index*.17)+.004*math.sin(rad*109+index*.71)
                crossings=[ring_radius(j,a0) for j in range(rows)]
                stride=4 if rad<branchSmall else (2 if rad<branchLarge else 1)
                h=0.006-(.00260 if roundWeave else .00210 if physicalRelief else .00115 if bottomOnly else .00190)*math.cos(math.pi*(crossing_number(rad,crossings)+index//stride))
                along=rad-inner
            thick=thickness*(1+0.10*math.sin(along*98+index)+0.05*math.sin(along*317+index*1.7))
            if physicalRelief and kind=='ring' and radius_override is None:
                spacing=min(abs(ring_radius(index,a)-ring_radius(neighbor,a)) for neighbor in (index-1,index+1) if 0<=neighbor<rows)
                thick=min(thick,.47*spacing)
                if roundWeave:thick=min(thick,.0029)
            thicknesses.append(thick)
            for j in range(sides):
                b=2*math.pi*j/sides
                if kind=='ring':
                    rr=rad+thick*math.cos(b)
                    verts.append((rr*math.cos(a),rr*math.sin(a),h+thick*verticalRatio*math.sin(b)))
                else:
                    offset=thick*math.cos(b)+(lane*.0044 if continuousWeave else 0)
                    verts.append((rad*math.cos(a)-offset*math.sin(a),rad*math.sin(a)+offset*math.cos(a),h+thick*verticalRatio*math.sin(b)))
        for i in range(count):
            for j in range(sides):
                nj=(j+1)%sides
                q=(base+i*sides+j,base+(i+1)*sides+j,base+(i+1)*sides+nj,base+i*sides+nj)
                # Along-ring and along-spoke have opposite orientation.
                faces.append(tuple(reversed(q)) if kind=='spoke' else q)
                u0=phase_offset+i/count*(2*math.pi*radius0/.08 if kind=='ring' else (pitch*(rows-1)/.08))
                u1=phase_offset+(i+1)/count*(2*math.pi*radius0/.08 if kind=='ring' else (pitch*(rows-1)/.08))
                cv0=thicknesses[i]/.08;cv1=thicknesses[i+1]/.08;offset=.15+(index%7)*.065
                uv=((u0,offset+crossOffsets[j]*cv0),(u1,offset+crossOffsets[j]*cv1),(u1,offset+crossOffsets[j+1]*cv1),(u0,offset+crossOffsets[j+1]*cv0))
                uvfaces.append(tuple(reversed(uv)) if kind=='spoke' else uv)
                ids.append(tube_id)
    for i in range(rows):addtube('ring',i)
    for i in range(spokes):
        addtube('spoke',i)
        if continuousWeave and i%(spokes//4)==0:
            addtube('spoke',i,lane=-1);addtube('spoke',i,lane=1)
    # The start is an orthogonal woven field, continuous beneath the first
    # circular courses; it is not a raised concentric button.
    for direction in range(2):
        for strand in range(5 if continuousWeave else 7):
            base=len(verts);pitchAcross=.0044 if continuousWeave else .00245 if bottomOnly else (.0065 if direction==0 else .0060);pitchAlong=.0044 if continuousWeave else .00245 if bottomOnly else (.0060 if direction==0 else .0065);extent=.016 if bottomOnly else (.031 if direction==0 else .035);offset=(strand-(2 if continuousWeave else 3))*pitchAcross;count=48
            for j in range(count+1):
                t=-extent+2*extent*j/count
                h=.006+(1 if direction==0 else -1)*(.00195 if continuousWeave else .00055 if bottomOnly else .0010)*math.cos(math.pi*(t/pitchAlong+strand))
                for k in range(8):
                    b=2*math.pi*k/8;side=offset+(.00180 if continuousWeave else .00070 if bottomOnly else (.00220 if direction==0 else .00200))*math.cos(b);z=h+(.00180 if continuousWeave else .00043 if bottomOnly else .00110)*math.sin(b)
                    verts.append((t,side,z) if direction==0 else (side,t,z))
            for j in range(count):
                for k in range(8):
                    nk=(k+1)%8;face=(base+j*8+k,base+(j+1)*8+k,base+(j+1)*8+nk,base+j*8+nk)
                    crossSpan=.045 if bottomOnly else (.072 if direction==0 else .1074)
                    uv=((j/count*2*extent/.08,.2+k/8*crossSpan),((j+1)/count*2*extent/.08,.2+k/8*crossSpan),((j+1)/count*2*extent/.08,.2+(k+1)/8*crossSpan),(j/count*2*extent/.08,.2+(k+1)/8*crossSpan))
                    faces.append(face if direction else tuple(reversed(face)))
                    uvfaces.append(uv if direction else tuple(reversed(uv)));ids.append(rows+spokes+direction*7+strand)
    if bottomOnly and not fullBottom:
        ca,sa=math.cos(.19),math.sin(.19);verts=[(ca*x-sa*y,sa*x+ca*y,z) for x,y,z in verts]
    if physicalRelief:verts=[(x,y,z+LidSurfaceHeight(math.hypot(x,y),angle=math.atan2(y,x))-.006) for x,y,z in verts]
    me=bpy.data.meshes.new(('Bottom' if bottomOnly else 'Lid')+'WeaveHigh_Mesh');me.from_pydata(verts,[],faces);me.update()
    high=bpy.data.objects.new(('Bottom' if bottomOnly else 'Lid')+'WeaveHigh',me);bpy.context.collection.objects.link(high)
    uv=me.uv_layers.new(name='TwigFiberUV')
    for poly,coords,idx in zip(me.polygons,uvfaces,ids):
        poly.use_smooth=True;poly.material_index=idx
        for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
    woodV2=continuousWeave and UseWillowWoodV2();skinFolder=WillowWoodV2Folder()/'Baked' if woodV2 else materials
    img=bpy.data.images.load(str(skinFolder/('Texture_K06WillowSkinV2Base.webp' if woodV2 else 'Texture_K06RimAuthoredBase.webp' if physicalRelief else 'Texture_K06RimNativeBase.webp')),check_existing=False);img.pack()
    normal_img=bpy.data.images.load(str(skinFolder/('Texture_K06WillowSkinV2Normal.webp' if woodV2 else 'Texture_K06RimNativeNormal.webp')),check_existing=False);normal_img.colorspace_settings.name='Non-Color';normal_img.pack()
    rough_img=bpy.data.images.load(str(skinFolder/('Texture_K06WillowSkinV2Orm.webp' if woodV2 else 'Texture_K06RimNativeOrm.webp')),check_existing=False);rough_img.colorspace_settings.name='Non-Color';rough_img.pack()
    for i in range(rows+spokes+14):
        m=bpy.data.materials.new('HighTwig_%03d'%i);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
        coord=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexImage');tex.image=img;l.new(coord.outputs['UV'],tex.inputs['Vector'])
        mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
        v=random.Random((2040 if bottomOnly else 2000)+i).uniform(.88,1.32);mult.inputs[2].default_value=(v,v*.99,v*.97,1)
        l.new(tex.outputs['Color'],mult.inputs[1]);l.new(mult.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.9
        if roundWeave and not woodV2:
            noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=18;noise.inputs['Detail'].default_value=2;noise.inputs['Roughness'].default_value=.6;l.new(coord.outputs['UV'],noise.inputs['Vector'])
            ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(.70,.72,.74,1);ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=(1.35,1.33,1.28,1);l.new(noise.outputs['Fac'],ramp.inputs['Fac'])
            weather=n.new('ShaderNodeMixRGB');weather.blend_type='MULTIPLY';weather.inputs[0].default_value=1;l.new(mult.outputs['Color'],weather.inputs[1]);l.new(ramp.outputs['Color'],weather.inputs[2]);l.new(weather.outputs['Color'],bs.inputs['Base Color'])
        nt=n.new('ShaderNodeTexImage');nt.image=normal_img;l.new(coord.outputs['UV'],nt.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.5 if woodV2 else .18 if continuousWeave else .9 if roundWeave else .6;l.new(nt.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
        rt=n.new('ShaderNodeTexImage');rt.image=rough_img;l.new(coord.outputs['UV'],rt.inputs['Vector']);sp=n.new('ShaderNodeSeparateColor');l.new(rt.outputs['Color'],sp.inputs['Color']);l.new(sp.outputs['Green'],bs.inputs['Roughness'])
        me.materials.append(m)
    if physicalRelief:
        def PhysicalReceiver(name,vertices,polygons,mats,indices,parent):
            data=bpy.data.meshes.new(name+'_Mesh');data.from_pydata(vertices,[],polygons);data.update();data.uv_layers.new(name='LidPlanarUV');obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return obj
        if continuousWeave:globals()['K06_CONTINUOUS_LID_HIGH']=high
        try:low=CreateAdaptiveLid(None,'LidBakeProxy',[],PhysicalReceiver)
        finally:globals().pop('K06_CONTINUOUS_LID_HIGH',None)
        for poly in low.data.polygons:
            for loop in poly.loop_indices:
                v=low.data.vertices[low.data.loops[loop].vertex_index].co;low.data.uv_layers.active.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
    elif not bottomOnly and not centerOnly:
        pv,pf=LidInnerReceiverGeometry(.012) if insideOnly else LidSurfaceGeometry(.006) if surfaceOnly else LidReceiverGeometry(.006);pm=bpy.data.meshes.new('LidReceiverMesh');pm.from_pydata(pv,[],pf);pm.update();low=bpy.data.objects.new('LidBakeProxy',pm);scene.collection.objects.link(low)
        uv=pm.uv_layers.new(name='LidPlanarUV')
        for poly in pm.polygons:
            for loop in poly.loop_indices:
                v=pm.vertices[pm.loops[loop].vertex_index].co;uv.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
        import bmesh
        bm=bmesh.new();bm.from_mesh(pm);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(pm);bm.free()
    else:bpy.ops.mesh.primitive_plane_add(size=(.020 if centerOnly else .50));low=bpy.context.object;low.name='LidBakeProxy'
    mat=bpy.data.materials.new('LidBakeReceiver');mat.use_nodes=True;low.data.materials.append(mat);targetMaterials=[mat]
    if roundWeave and not continuousWeave:
        raisedMaterial=mat.copy();raisedMaterial.name='LidRaisedBakeReceiver';low.data.materials.append(raisedMaterial);targetMaterials.append(raisedMaterial)
        for polygon in low.data.polygons:polygon.material_index=0 if all(i<low['K06LidCarrierVertexCount'] for i in polygon.vertices) else 1
        import json
        footprint={'triangles':[[list(low.data.uv_layers.active.data[loop].uv) for loop in polygon.loop_indices] for polygon in low.data.polygons if polygon.material_index==1]}
        (out/'Data_RaisedWeaveUv.json').write_text(json.dumps(footprint),encoding='utf-8')
    cage=None
    if not bottomOnly and not centerOnly:
        cageMesh=low.data.copy();cage=bpy.data.objects.new('LidVerticalCage',cageMesh);scene.collection.objects.link(cage)
        for vertex in cageMesh.vertices:vertex.co.z+=(-.030 if insideOnly else .024)
        cage.hide_render=True
    assert bpy.context.scene is scene and bpy.context.window.scene is scene and set(scene.objects)==({high,low,cage} if cage else {high,low}), 'Unexpected bake scene objects'
    print('BAKE_SCENE',scene.name,'objects',[(o.name,o.type) for o in scene.objects])
    def bake(kind,name):
        pixels=2048 if continuousWeave else 1024 if physicalRelief else 512 if centerOnly else 2048
        image=bpy.data.images.new(name,width=pixels,height=pixels,alpha=False)
        if kind!='DIFFUSE':image.colorspace_settings.name='Non-Color'
        targets=[]
        for index,targetMaterial in enumerate(targetMaterials):
            targetImage=image
            if index and kind=='NORMAL':
                targetImage=bpy.data.images.new(name.replace('HighNormal','HighRaisedNormal'),width=1024,height=1024,alpha=False);targetImage.colorspace_settings.name='Non-Color'
            node=targetMaterial.node_tree.nodes.new('ShaderNodeTexImage');node.image=targetImage;targetMaterial.node_tree.nodes.active=node;targets.append((targetMaterial,node,targetImage))
        bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
        args={'type':kind,'use_selected_to_active':True,'cage_extrusion':0.022,'max_ray_distance':0.035,'margin':(0 if kind=='EMIT' else 8)}
        if cage:args.update(use_cage=True,cage_object=cage.name,cage_extrusion=0,max_ray_distance=.05)
        if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
        if kind=='AO' and roundWeave:
            for attr in ('visible_shadow','visible_diffuse','visible_glossy','visible_transmission','visible_volume_scatter'):setattr(low,attr,False)
        bpy.ops.object.bake(**args)
        savedImages=set()
        for targetMaterial,node,targetImage in targets:
            if targetImage not in savedImages:
                targetImage.filepath_raw=str(out/(targetImage.name+'.png'));targetImage.file_format='PNG';targetImage.save();targetImage.pack();savedImages.add(targetImage)
            targetMaterial.node_tree.nodes.remove(node)
        print('BAKED',kind,image.filepath_raw)
    label='Bottom' if bottomOnly else ('Center' if centerOnly else ('LidInner' if insideOnly else ('LidSurface' if surfaceOnly else 'Lid')))
    for typ,suffix in [('DIFFUSE','Base'),('NORMAL','Normal'),('AO','Ao'),('ROUGHNESS','Roughness')]:bake(typ,'Texture_K06'+label+'High'+suffix)
    saved=[]
    for material in me.materials:
        n=material.node_tree.nodes;l=material.node_tree.links;output=n.get('Material Output');old=output.inputs['Surface'].links[0].from_socket
        emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(1,1,1,1);l.new(emission.outputs[0],output.inputs['Surface']);saved.append((material,output,old,emission))
    bake('EMIT','Texture_K06'+label+'Coverage')
    if roundWeave and not continuousWeave:
        selectedRows={0,3,6,10,13,16,20,23,26,29}
        for index,(_,_,_,emission) in enumerate(saved):emission.inputs['Color'].default_value=((1,1,1,1) if index in selectedRows else (0,0,0,1))
        bake('EMIT','Texture_K06LidRaisedCoverage')
    for material,output,old,emission in saved:
        material.node_tree.links.new(old,output.inputs['Surface']);material.node_tree.nodes.remove(emission)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/('Scene_K06'+label+'HighBake.blend')))
    print(label.upper()+'_HIGH_TRIS',sum(len(p.vertices)-2 for p in me.polygons))


def Stage_bake_lid():
    BakeLidWeave(False)

def Stage_bake_lid_inner():
    return BakeLidWeave(insideOnly=True)

def Stage_bake_lid_surface():
    return BakeLidWeave(surfaceOnly=True)


def StageBakePhysicalLid():
    from pathlib import Path
    import hashlib,json,datetime,bpy
    previous=globals().get('K06_LID_PHYSICAL_RELIEF');globals()['K06_LID_PHYSICAL_RELIEF']=True
    try:BakeLidWeave(surfaceOnly=True)
    finally:globals()['K06_LID_PHYSICAL_RELIEF']=previous
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidReliefPhysical'
    files=list(folder.glob('Texture_*.png'));receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'bakeMethod':'Cycles selected-to-active from dense round twig high mesh to the exact runtime 940-triangle lid receiver; COLOR only albedo, tangent NORMAL, AO, ROUGHNESS and EMIT coverage','samples':64,'pixels':[1024,1024],'runtimeMeshTriangles':940,'ringBaseRadiusM':.00285,'spokeBaseRadiusM':.0018,'crossingCenterOffsetM':.0021,'sceneObjects':[o.name for o in bpy.context.scene.objects],'textures':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'gameIntegrated':False,'userApproved':False}
    (folder/'Data_PhysicalLidBake.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('PHYSICAL_LID_BAKE_RECEIPT',folder/'Data_PhysicalLidBake.json')


def StageBakeRoundWeave():
    import json,hashlib,datetime,bpy
    from pathlib import Path
    oldRound=globals().get('K06_ROUND_WEAVE_RUNTIME');oldPhysical=globals().get('K06_LID_PHYSICAL_RELIEF');globals()['K06_ROUND_WEAVE_RUNTIME']=True;globals()['K06_LID_PHYSICAL_RELIEF']=True
    try:BakeLidWeave(surfaceOnly=True)
    finally:globals()['K06_ROUND_WEAVE_RUNTIME']=oldRound;globals()['K06_LID_PHYSICAL_RELIEF']=oldPhysical
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidRoundWeave';receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'method':'round-section willow high geometry projected to ten separate raised course proxies and an interleaved carrier; individual bark grain/weathering','runtimeUpperTriangles':1000,'raisedCourses':10,'ringRadiusM':.00285,'spokeRadiusM':.0018,'verticalCrossRatio':1.0,'crossingAmplitudeM':.0026,'pixels':[1024,1024],'samples':64,'normalFineBarkStrength':.9,'outputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob('Texture_*.png')},'userApproved':False};(folder/'Data_RoundWeaveBake.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ROUND_WEAVE_BAKE',json.dumps(receipt))


def StageBakeContinuousLid():
    import json,hashlib,datetime
    from pathlib import Path
    flags=('K06_ROUND_WEAVE_RUNTIME','K06_LID_PHYSICAL_RELIEF','K06_CONTINUOUS_LID');previous={key:globals().get(key) for key in flags}
    for key in flags:globals()[key]=True
    try:BakeLidWeave(surfaceOnly=True)
    finally:
        for key,value in previous.items():globals()[key]=value
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=ContinuousLidFolder()
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'method':'physical round willow baked to one fitted continuous upper surface; no duplicate raised overlay','pixels':[2048,2048],'fineBarkNormalStrength':.18,'normalScale':1.0,'receiver':json.loads((folder/'Data_ContinuousReceiver.json').read_text(encoding='utf-8'))['triangles'],'outputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob('Texture_*.png')},'userApproved':False}
    if UseWillowWoodV2():receipt.update(fineBarkNormalStrength=.5,geometryLockedTo='34b0f08860ca0d6c',woodMaterialRecipe='../Data_WoodSurfaceV2.json')
    (folder/'Data_ContinuousWeaveBake.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('CONTINUOUS_BAKE_DONE',receipt['receiver'])


def StagePrepareContinuousLid():
    from pathlib import Path
    from PIL import Image
    import numpy as np,json,hashlib,datetime,importlib.util
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=ContinuousLidFolder();out=folder/'Baked';out.mkdir(exist_ok=True)
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py';spec=importlib.util.spec_from_file_location('ContinuousLidBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    def Load(suffix):return np.asarray(Image.open(folder/('Texture_K06LidSurface'+suffix+'.png')).convert('RGB'),dtype=float)/255
    alpha=Load('Coverage').mean(axis=2);valid=alpha>=.5;linear=baker.SrgbToLinear(Load('HighBase'));den=baker.GaussianPeriodic(valid.astype(float),4);padded=baker.GaussianPeriodic(linear*valid[:,:,None],4)/np.maximum(den[:,:,None],1e-6);padded[den<1e-4]=linear[valid].mean(axis=0);padded[valid]=linear[valid];color=baker.MatchTone(padded,[.46,.41,.34] if UseWillowWoodV2() else [.48,.45,.40],.095 if UseWillowWoodV2() else .075,.65)
    if UseWillowWoodV2():
        baselineCoverage=np.asarray(Image.open(root/'Materials/LidCReferenceWeave/Texture_K06LidSurfaceCoverage.png').convert('RGB'),dtype=float)/255
        assert np.array_equal(Load('Coverage'),baselineCoverage),'Wood refinement changed the accepted weave silhouette'
    basePath=out/'Texture_K06LidContinuousBase.webp';Image.fromarray(np.uint8(np.clip(np.rint(np.dstack((color,alpha))*255),0,255)),'RGBA').save(basePath,'WEBP',quality=90,method=6,alpha_quality=100)
    normal=Load('HighNormal')*2-1;length=np.linalg.norm(normal,axis=2);support=(length>.85)&(length<1.15);weight=baker.GaussianPeriodic(support.astype(float),3);padding=baker.GaussianPeriodic(normal*support[:,:,None],3)/np.maximum(weight[:,:,None],1e-6);padding[weight<1e-4]=(0,0,1);normal[~support]=padding[~support];normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-6)
    normalPath=out/'Texture_K06LidContinuousNormal.webp';Image.fromarray(np.uint8(np.clip(np.rint((normal*.5+.5)*255),0,255)),'RGB').save(normalPath,'WEBP',lossless=True,method=6,exact=True)
    def Resize(value):return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((1024,1024),Image.Resampling.LANCZOS),dtype=float)
    weight=np.maximum(Resize(alpha),1e-6);ao=np.clip(Resize(Load('HighAo')[:,:,0]*alpha)/weight,0,1);roughness=np.clip(Resize(Load('HighRoughness')[:,:,0]*alpha)/weight,0,1)
    ormPath=out/'Texture_K06LidContinuousOrm.webp';packedOrm=np.uint8(np.clip(np.rint(np.dstack((ao,roughness,np.zeros_like(ao),np.ones_like(ao)))*255),0,255));Image.fromarray(packedOrm,'RGBA').save(ormPath,'WEBP',lossless=True,method=6,exact=True)
    decodedOrm=np.asarray(Image.open(ormPath).convert('RGBA'));assert np.array_equal(decodedOrm,packedOrm),'Packed ORM channels were altered'
    if UseWillowWoodV2():
        use=np.asarray(Image.fromarray(valid.astype(np.uint8)*255).resize((1024,1024),Image.Resampling.BOX))>=128
        assert len(np.unique(decodedOrm[:,:,1][use]))>=24 and np.std(decodedOrm[:,:,1][use]/255)>.02,'Willow roughness lost its continuous variation'
    rows=[{'channel':channel,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'pixels':list(Image.open(path).size)} for channel,path in (('Base',basePath),('Normal',normalPath),('Orm',ormPath))]
    saved=np.asarray(Image.open(basePath).convert('RGB'),dtype=float)/255;metrics={**baker.ToneMetrics(saved),**baker.TileMetrics(saved),'texelsPerMeter':None};presets=json.loads((bakerPath.parent/'Data_TextureBakePresets.json').read_text(encoding='utf-8'));problems=baker.CheckGates(metrics,sum(row['bytes'] for row in rows),rows,presets['gates'],presets['classes']['weatheredWood'],uv_atlas=True);assert not [p for p in problems if 'B >' not in p],problems
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'method':'one continuous low surface fitted to the physical round weave, smooth fine bark, high-to-low tangent normal and independent AO','sourceBake':'../Data_ContinuousWeaveBake.json','normalPixels':[2048,2048],'ormPixels':[1024,1024],'normalScale':1.0,'fineBarkNormalStrength':.18,'uvAtlasReason':'Unique circular author UV atlas preserving round willow cross-sections and crossings during direct close inspection','budgetReason':'Local authoring comparison only; 2K normals resolve strand curvature without duplicated proxy strips; no runtime registration or budget change','metrics':metrics,'advisoryBudgetProblems':problems,'outputs':rows,'runtimeRegistered':False,'userApproved':False}
    if UseWillowWoodV2():receipt.update(fineBarkNormalStrength=.5,woodMaterialRecipe='../../Data_WoodSurfaceV2.json',geometryLockedTo='34b0f08860ca0d6c',alphaExactlyPreserved=True)
    (out/'Data_ContinuousWeavePbr.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('CONTINUOUS_PBR',json.dumps(receipt))


def ApplyContinuousLidMaterial(scene,folder):
    import bpy,json,hashlib
    from pathlib import Path
    recipe=json.loads((folder/'Data_ContinuousWeavePbr.json').read_text(encoding='utf-8'));original=bpy.data.objects['Intact_LidWeave'].data.materials[0];material=original.copy();material.name='Wicker_LidContinuous';material.use_backface_culling=False
    for row in recipe['outputs']:
        assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256'];image=bpy.data.images.load(row['file'],check_existing=False)
        if row['channel']!='Base':image.colorspace_settings.name='Non-Color'
        image.pack();node=next(node for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.image and row['channel'] in node.image.name);node.image=image
    next(node for node in material.node_tree.nodes if node.type=='NORMAL_MAP').inputs['Strength'].default_value=1.0
    for state in ('Intact','Opened'):
        obj=bpy.data.objects[state+'_LidWeave'];obj.data.materials.clear();obj.data.materials.append(material)
        for polygon in obj.data.polygons:polygon.material_index=0
        bpy.data.objects[state+'_LidWeaveInner'].data.materials[0].use_backface_culling=True
    scene['K06LidReliefMethod']=recipe['method'];print('CONTINUOUS_LID_MATERIAL_APPLIED',recipe['normalPixels'])


def StagePrepareRoundWeave():
    from pathlib import Path
    from PIL import Image,ImageDraw
    import numpy as np,json,hashlib,datetime,importlib.util,io
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidRoundWeave';out=folder/'Baked';out.mkdir(exist_ok=True)
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py';spec=importlib.util.spec_from_file_location('RoundLidBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    def Load(suffix):return np.asarray(Image.open(folder/('Texture_K06LidSurface'+suffix+'.png')).convert('RGB'),dtype=float)/255
    def Resize(value,size):
        if value.ndim==3:return np.stack([Resize(value[:,:,i],size) for i in range(value.shape[2])],axis=2)
        return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((size,size),Image.Resampling.LANCZOS),dtype=float)
    alpha=Load('Coverage').mean(axis=2);valid=alpha>=.5;linear=baker.SrgbToLinear(Load('HighBase'));den=baker.GaussianPeriodic(valid.astype(float),4);padded=baker.GaussianPeriodic(linear*valid[:,:,None],4)/np.maximum(den[:,:,None],1e-6);padded[den<1e-4]=linear[valid].mean(axis=0);padded[valid]=linear[valid];color=baker.MatchTone(padded,[.48,.45,.40],.075,.65)
    footprint=json.loads((folder/'Data_RaisedWeaveUv.json').read_text(encoding='utf-8'));maskImage=Image.new('L',(4096,4096));draw=ImageDraw.Draw(maskImage)
    for triangle in footprint['triangles']:draw.polygon([(u*4096-.5,(1-v)*4096-.5) for u,v in triangle],fill=255)
    raised=np.asarray(maskImage.resize((1024,1024),Image.Resampling.BOX))>=128
    basePaths={}
    raisedCoverage=np.asarray(Image.open(folder/'Texture_K06LidRaisedCoverage.png').convert('RGB'),dtype=float).mean(axis=2)/255
    for kind,regionAlpha in (('Carrier',alpha),('Raised',np.minimum(alpha,raisedCoverage))):
        path=out/('Texture_K06LidRound'+kind+'Base.webp');Image.fromarray(np.uint8(np.clip(np.rint(np.dstack((color,regionAlpha))*255),0,255)),'RGBA').save(path,'WEBP',quality=86,method=6,alpha_quality=100);basePaths[kind]=path
    normals=[];supports=[]
    for suffix in ('HighNormal','HighRaisedNormal'):
        n=Load(suffix)*2-1;s=(np.sum(n*n,axis=2)>.7)&(np.sum(n*n,axis=2)<1.3);d=baker.GaussianPeriodic(s.astype(float),3);pad=baker.GaussianPeriodic(n*s[:,:,None],3)/np.maximum(d[:,:,None],1e-6);pad[d<1e-4]=(0,0,1);n[~s]=pad[~s];n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-6);normals.append(n);supports.append(s)
    normal=np.where(raised[:,:,None],normals[1],normals[0]);support=np.where(raised,supports[1],supports[0])
    normalImage=Image.fromarray(np.uint8(np.clip(np.rint((normal*.5+.5)*255),0,255)),'RGB');encoded=io.BytesIO();normalImage.save(encoded,'WEBP',quality=100,method=6,use_sharp_yuv=True);candidate=encoded.getvalue();decoded=np.asarray(Image.open(io.BytesIO(candidate)).convert('RGB'),dtype=float)/255*2-1;decoded/=np.maximum(np.linalg.norm(decoded,axis=2,keepdims=True),1e-6);error=np.degrees(np.arccos(np.clip(np.sum(normal*decoded,axis=2),-1,1)))[valid&support]
    codec='WebP q100, measured angular error';normalPath=out/'Texture_K06LidRoundNormal.webp'
    if np.percentile(error,95)<=2 and np.percentile(error,99)<=5:normalPath.write_bytes(candidate)
    else:normalImage.save(normalPath,'WEBP',lossless=True,method=6,exact=True);codec='lossless WebP; lossy candidate rejected by angular error gate'
    normalPaths={}
    for kind,value in zip(('Carrier','Raised'),normals):
        path=out/('Texture_K06LidRound'+kind+'Normal.webp');Image.fromarray(np.uint8(np.clip(np.rint((value*.5+.5)*255),0,255)),'RGB').save(path,'WEBP',lossless=True,method=6,exact=True);normalPaths[kind]=path
    refined=folder/'Texture_K06LidRoundAssemblyAo.png';aoHigh=np.asarray(Image.open(refined).convert('RGB'),dtype=float)[:,:,0]/255 if refined.exists() else Load('HighAo')[:,:,0];rough=Load('HighRoughness')[:,:,0];weight=np.maximum(Resize(alpha,512),1e-6);ao=np.clip(Resize(aoHigh*alpha,512)/weight,0,1);rough=np.clip(Resize(rough*alpha,512)/weight,0,1);orm=np.dstack((ao,rough,np.zeros((512,512)),np.ones((512,512))));ormPath=out/'Texture_K06LidRoundOrm.webp';Image.fromarray(np.uint8(np.clip(np.rint(orm*255),0,255)),'RGBA').save(ormPath,'WEBP',lossless=True,method=6,exact=True)
    rows=[{'channel':channel,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'pixels':list(Image.open(path).size)} for channel,path in (('CarrierBase',basePaths['Carrier']),('RaisedBase',basePaths['Raised']),('CarrierNormal',normalPaths['Carrier']),('RaisedNormal',normalPaths['Raised']),('Orm',ormPath))]
    saved=np.asarray(Image.open(basePaths['Carrier']).convert('RGB'),dtype=float)/255;metrics={**baker.ToneMetrics(saved),**baker.TileMetrics(saved),'texelsPerMeter':None};presets=json.loads((bakerPath.parent/'Data_TextureBakePresets.json').read_text(encoding='utf-8'));problems=baker.CheckGates(metrics,sum(row['bytes'] for row in rows),rows,presets['gates'],presets['classes']['weatheredWood'],uv_atlas=True)
    nonBudget=[p for p in problems if 'B >' not in p];assert not nonBudget,nonBudget
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'sourceBake':'../Data_RoundWeaveBake.json','method':'physical round willow high bake on ten raised courses and a continuous underlying weave carrier','normalScaleByRegion':{'Carrier':2.0,'Raised':1.0},'roughnessFactor':1.0,'normalCodec':'lossless WebP per region; lossy merged probe rejected','lossyCandidateAngularErrorQuantiles':np.percentile(error,[50,95,99]).tolist(),'normalPixels':[1024,1024],'ormPixels':[512,512],'physicalBakeSpanM':.5,'metersPerTile':None,'uvAtlasReason':'Unique nonrepeating circular lid atlas containing individual bark-covered and worn willow strands; 1K normal retained for close inspection of 4–6mm strands','budgetReason':'Offline hero-lid authoring candidate prioritizes strand cross-section and grain; no runtime registration or budget increase is performed','metrics':metrics,'advisoryBudgetProblems':problems,'outputs':rows,'runtimeRegistered':False,'userApproved':False}
    (out/'Data_RoundWeavePbr.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ROUND_WEAVE_PBR',json.dumps(receipt))


def StageBakeLidAssemblyAo():
    import bpy,json,hashlib,datetime
    from pathlib import Path
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidReliefPhysical'
    assert Path(bpy.data.filepath).resolve()==(folder/'Scene_K06LidSurfaceHighBake.blend').resolve()
    assert set(o.name for o in bpy.context.scene.objects)=={'LidWeaveHigh','LidBakeProxy','LidVerticalCage'}
    source=root/'Refinement/ReviewCandidates/Scene_K06_Review_13970f2240fb65e4.blend'
    assert hashlib.sha256(source.read_bytes()).hexdigest()=='ec24957331fddcc49c21b4b921584be73928af03602a86ba15f64fbfbeefb9b9'
    names=['Intact_'+part+'_Mesh' for part in ('LidRimBundle','LidBindings','LidSpines','LidBarkWear')]
    with bpy.data.libraries.load(str(source),link=False) as (src,dst):
        assert all(name in src.meshes for name in names);dst.meshes=names
    opaque=bpy.data.materials.new('LidAssemblyOccluder');opaque.use_nodes=True;casters=[]
    for index,data in enumerate(dst.meshes):
        data.materials.clear();data.materials.append(opaque)
        for polygon in data.polygons:polygon.material_index=0
        obj=bpy.data.objects.new('LidAssemblyCaster_'+str(index),data);bpy.context.scene.collection.objects.link(obj);casters.append(obj.name)
    scene=bpy.context.scene;low=bpy.data.objects['LidBakeProxy'];high=bpy.data.objects['LidWeaveHigh'];mat=low.data.materials[0];image=bpy.data.images.new('Texture_K06LidAssemblyHighAo',width=1024,height=1024,alpha=False);image.colorspace_settings.name='Non-Color';node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
    bpy.ops.object.select_all(action='DESELECT');low.select_set(True);high.select_set(True);bpy.context.view_layer.objects.active=low;scene.cycles.samples=64
    bpy.ops.object.bake(type='AO',use_selected_to_active=True,use_cage=True,cage_object='LidVerticalCage',cage_extrusion=0,max_ray_distance=.05,margin=8)
    path=folder/'Texture_K06LidAssemblyHighAo.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack();mat.node_tree.nodes.remove(node)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Scene_K06LidAssemblyHighBake.blend'))
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'occluderSource':str(source),'occluderSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'casters':casters,'method':'Cycles high-to-exact-runtime-low AO, with the accepted rim, ties, support rods and bark peels as occluders; no directional scene light baked','output':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'samples':64,'pixels':[1024,1024]}
    (folder/'Data_LidAssemblyAoBake.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('LID_ASSEMBLY_AO_BAKED',path)


def StagePreparePhysicalLid():
    from pathlib import Path
    from PIL import Image
    import numpy as np,json,hashlib,datetime,importlib.util
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');source=root/'Materials/LidReliefPhysical';out=source/'Baked';out.mkdir(exist_ok=True);size=512
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py';spec=importlib.util.spec_from_file_location('PhysicalLidBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    def Load(suffix):return np.asarray(Image.open(source/('Texture_K06LidSurface'+suffix+'.png')).convert('RGB'),dtype=float)/255
    def Resize(value):
        if value.ndim==3:return np.stack([Resize(value[:,:,i]) for i in range(value.shape[2])],axis=2)
        return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((size,size),Image.Resampling.LANCZOS),dtype=float)
    coverage=Load('Coverage').mean(axis=2);valid=coverage>=.5;linear=baker.SrgbToLinear(Load('HighBase'));den=baker.GaussianPeriodic(valid.astype(float),4);padded=baker.GaussianPeriodic(linear*valid[:,:,None],4)/np.maximum(den[:,:,None],1e-6);padded[den<1e-4]=linear[valid].mean(axis=0);padded[valid]=linear[valid]
    padded=baker.SrgbToLinear(baker.MatchTone(padded,np.array([.48,.45,.40]),.07,.65))
    alpha=np.clip(Resize(coverage),0,1);color=baker.LinearToSrgb(Resize(padded*coverage[:,:,None])/np.maximum(alpha[:,:,None],1e-6));color=np.where((alpha<.02)[:,:,None],baker.LinearToSrgb(Resize(padded)),color)
    threshold=np.quantile(alpha,1-float(valid.mean()));alpha=np.clip(alpha+.5-threshold,0,1)
    mean=Resize((Load('HighNormal')*2-1)*coverage[:,:,None])/np.maximum(Resize(coverage)[:,:,None],1e-6);length=np.linalg.norm(mean,axis=2);normal=mean/np.maximum(length[:,:,None],1e-6);normal[length<1e-6]=(0,0,1)
    aoSource=source/'Texture_K06LidAssemblyHighAo.png';assert aoSource.exists(),'Bake the assembled lid occlusion before preparing its runtime maps'
    aoHigh=np.asarray(Image.open(aoSource).convert('RGB'),dtype=float)[:,:,0]/255;ao=np.clip(Resize(aoHigh*coverage)/np.maximum(Resize(coverage),1e-6),0,1)
    rough=np.clip(Resize(Load('HighRoughness')[:,:,0]*coverage)/np.maximum(Resize(coverage),1e-6),0,1);rough=np.sqrt(np.clip(rough**2+.15*(1-np.clip(length,0,1)),0,1))
    outputs={'Base':np.dstack((color,alpha)),'Normal':np.dstack((normal*.5+.5,np.ones((size,size)))),'Orm':np.dstack((ao,rough,np.zeros((size,size)),np.ones((size,size))))};rows=[]
    for channel,value in outputs.items():
        path=out/('Texture_K06LidPhysical'+channel+'.webp');image=Image.fromarray(np.uint8(np.clip(np.rint(value*255),0,255)),'RGBA')
        if channel=='Base':image.save(path,'WEBP',quality=90,method=6,alpha_quality=100)
        else:image.save(path,'WEBP',lossless=True,method=6,exact=True)
        rows.append({'channel':channel,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'pixels':[512,512]})
    saved=np.asarray(Image.open(out/'Texture_K06LidPhysicalBase.webp').convert('RGBA'),dtype=float)/255;metrics={**baker.ToneMetrics(saved[:,:,:3]),**baker.TileMetrics(saved[:,:,:3]),'texelsPerMeter':1024};presets=json.loads((bakerPath.parent/'Data_TextureBakePresets.json').read_text(encoding='utf-8'));problems=baker.CheckGates(metrics,sum(row['bytes'] for row in rows),rows,presets['gates'],presets['classes']['weatheredWood'],uv_atlas=True);assert not problems,problems
    use=saved[:,:,3]>=.5;scaled=normal.copy();scaled[:,:,:2]*=1.35;scaled/=np.linalg.norm(scaled,axis=2,keepdims=True);angles=np.degrees(np.arccos(np.clip(scaled[:,:,2],-1,1)))[use]
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'sourceBake':'../Data_PhysicalLidBake.json','assemblyAoBake':'../Data_LidAssemblyAoBake.json','normalMethod':'dense round willow weave high-to-exact-runtime-low Cycles tangent bake; source fine bark normals retained','normalScale':1.35,'effectiveTiltQuantiles':np.percentile(angles,[25,50,75,90,99]).tolist(),'sourceMaskCoverage':float(valid.mean()),'savedMaskCoverage':float(use.mean()),'metrics':metrics,'problems':problems,'outputs':rows,'scope':'upper lid only; accepted side and food PBR remain separate','runtimeRegistered':False,'userApproved':False}
    (out/'Data_PhysicalLidPbr.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('PHYSICAL_LID_PBR',json.dumps(receipt))


def StagePrepareAlignedLidSculpt():
    from pathlib import Path
    from PIL import Image
    import numpy as np,json,hashlib,datetime,importlib.util
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');source=root/'Materials/RuntimeNormalized/LidIntrinsicBaked/Texture_K06LidIntrinsicBase.webp';folder=root/'Materials/LidReliefAligned';folder.mkdir(exist_ok=True)
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py';spec=importlib.util.spec_from_file_location('AlignedLidBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    base=np.asarray(Image.open(source).convert('RGBA'),dtype=float)/255;size=base.shape[0];mask=base[:,:,3]>=.5;lum=base[:,:,:3].mean(axis=2);smooth=baker.GaussianPeriodic(lum,1.1);local=baker.GaussianPeriodic(lum,4.5);seam=(~mask)|(smooth<local-.05)
    y,x=np.mgrid[0:size,0:size];nearestX=np.where(seam,x,100000).astype(np.int32);nearestY=np.where(seam,y,100000).astype(np.int32);distance=(nearestX-x).astype(float)**2+(nearestY-y).astype(float)**2;step=size//2
    while step:
        for dy in (-step,0,step):
            for dx in (-step,0,step):
                if not (dx or dy):continue
                nx=np.roll(nearestX,(dy,dx),(0,1));ny=np.roll(nearestY,(dy,dx),(0,1));d=(nx-x).astype(float)**2+(ny-y).astype(float)**2
                if dy>0:d[:dy,:]=1e20
                if dy<0:d[dy:,:]=1e20
                if dx>0:d[:,:dx]=1e20
                if dx<0:d[:,dx:]=1e20
                use=d<distance;distance[use]=d[use];nearestX[use]=nx[use];nearestY[use]=ny[use]
        step//=2
    distance=np.sqrt(distance)*(.5/size);radius=.0023;crown=np.sqrt(np.maximum(0,radius**2-(radius-np.minimum(distance,radius))**2));junction=.0018*(1-np.exp(-(np.maximum(distance-radius,0)/.0015)**2));height=(crown*1.15+junction)*mask;height=baker.GaussianPeriodic(height,.45);span=.006
    path=folder/'Texture_K06LidAlignedHeight.png';Image.fromarray(np.uint16(np.clip(np.rint(height/span*65535),0,65535))).save(path)
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'baseSource':str(source),'baseSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'heightPath':str(path),'heightSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'heightSpanM':span,'imageSpanM':.5,'pixels':[size,size],'method':'image-aligned sculpt surrogate: rounded willow crowns from aperture/groove distance, raised broad crossing junctions; this is authored relief, not a measured scan','crownRadiusM':radius,'crownScale':1.15,'junctionHeightM':.0018,'grooveThresholdSrgb':.05,'grooveSmoothSigmaPixels':1.1,'seamFractionWithinWood':float(seam[mask].mean()),'heightQuantilesM':np.percentile(height[mask],[0,25,50,75,99,100]).tolist(),'baseAndAlphaUnchanged':True}
    (folder/'Data_AlignedLidSculpt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ALIGNED_LID_SCULPT',json.dumps(receipt))


def StageBakeAlignedLid():
    import bpy,numpy as np,json,hashlib,datetime,math,bmesh
    from pathlib import Path
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidReliefAligned';recipe=json.loads((folder/'Data_AlignedLidSculpt.json').read_text(encoding='utf-8'));ClearFreshTaskScene();scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64
    image=bpy.data.images.load(recipe['heightPath'],check_existing=False);image.colorspace_settings.name='Non-Color';width,height=image.size;pixels=np.asarray(image.pixels[:],dtype=float).reshape(height,width,4)[:,:,0]*recipe['heightSpanM']
    vertices=[];faces=[]
    for j in range(height):
        y=((j+.5)/height-.5)*.5
        for i in range(width):
            x=((i+.5)/width-.5)*.5;r=math.hypot(x,y);vertices.append((x,y,LidSurfaceHeight(r,angle=math.atan2(y,x))+float(pixels[j,i])))
    for j in range(height-1):
        for i in range(width-1):
            x=((i+1)/width-.5)*.5;y=((j+1)/height-.5)*.5
            if x*x+y*y<=.230**2:faces.append((j*width+i,j*width+i+1,(j+1)*width+i+1,(j+1)*width+i))
    data=bpy.data.meshes.new('LidAlignedSculptHigh_Mesh');data.from_pydata(vertices,[],faces);data.update();high=bpy.data.objects.new('LidAlignedSculptHigh',data);scene.collection.objects.link(high);uv=data.uv_layers.new(name='SculptPlanarUV')
    for polygon in data.polygons:
        polygon.use_smooth=True
        for loop in polygon.loop_indices:
            v=data.vertices[data.loops[loop].vertex_index].co;uv.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
    material=bpy.data.materials.new('LidAlignedSculptSurface');material.use_nodes=True;data.materials.append(material);nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.4,.35,.3,1);bs.inputs['Roughness'].default_value=.9
    fine=bpy.data.images.load(str(root/'Materials/RuntimeNormalized/LidIntrinsicBaked/Texture_K06LidIntrinsicNormal.webp'),check_existing=False);fine.colorspace_settings.name='Non-Color';fine.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=fine;normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.25;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    def Receiver(name,verts,polys,mats,indices,parent):
        mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata(verts,[],polys);mesh.update();mesh.uv_layers.new(name='LidPlanarUV');obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);return obj
    previousAligned=globals().get('K06_ALIGNED_LID_GEOMETRY');globals()['K06_ALIGNED_LID_GEOMETRY']=True
    try:low=CreateAdaptiveLid(None,'LidAlignedRuntimeReceiver',[],Receiver)
    finally:globals()['K06_ALIGNED_LID_GEOMETRY']=previousAligned
    for polygon in low.data.polygons:
        for loop in polygon.loop_indices:
            v=low.data.vertices[low.data.loops[loop].vertex_index].co;low.data.uv_layers.active.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
    receiver=bpy.data.materials.new('LidAlignedBakeReceiver');receiver.use_nodes=True;low.data.materials.append(receiver);cageData=low.data.copy();cage=bpy.data.objects.new('LidAlignedCage',cageData);scene.collection.objects.link(cage)
    for vertex in cageData.vertices:vertex.co.z+=.025
    cage.hide_render=True
    source=root/'Refinement/ReviewCandidates/Scene_K06_Review_13970f2240fb65e4.blend';assert hashlib.sha256(source.read_bytes()).hexdigest()=='ec24957331fddcc49c21b4b921584be73928af03602a86ba15f64fbfbeefb9b9';names=['Intact_'+part+'_Mesh' for part in ('LidRimBundle','LidBindings','LidSpines','LidBarkWear')]
    with bpy.data.libraries.load(str(source),link=False) as (src,dst):dst.meshes=names
    casterMat=bpy.data.materials.new('LidAlignedOpaqueOccluder');casterMat.use_nodes=True
    for index,mesh in enumerate(dst.meshes):
        mesh.materials.clear();mesh.materials.append(casterMat)
        for polygon in mesh.polygons:polygon.material_index=0
        obj=bpy.data.objects.new('LidAlignedCaster_'+str(index),mesh);scene.collection.objects.link(obj)
    outputs={}
    for kind,suffix in (('NORMAL','Normal'),('AO','Ao')):
        target=bpy.data.images.new('Texture_K06LidAlignedHigh'+suffix,width=1024,height=1024,alpha=False);target.colorspace_settings.name='Non-Color';node=receiver.node_tree.nodes.new('ShaderNodeTexImage');node.image=target;receiver.node_tree.nodes.active=node;bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
        if kind=='AO':
            for attr in ('visible_shadow','visible_diffuse','visible_glossy','visible_transmission','visible_volume_scatter'):setattr(low,attr,False)
        bpy.ops.object.bake(type=kind,use_selected_to_active=True,use_cage=True,cage_object=cage.name,cage_extrusion=0,max_ray_distance=.06,margin=8)
        path=folder/(target.name+'.png');target.filepath_raw=str(path);target.file_format='PNG';target.save();target.pack();receiver.node_tree.nodes.remove(node);outputs[suffix]={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()};print('ALIGNED_LID_BAKED',kind,path)
    scene['K06AlignedLidSource']=recipe['heightSha256'];bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Scene_K06LidAlignedHighBake.blend'))
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'sculptRecipe':'Data_AlignedLidSculpt.json','sculptHeightSha256':recipe['heightSha256'],'lowReceiverTriangles':sum(len(p.vertices)-2 for p in low.data.polygons),'highTriangles':sum(len(p.vertices)-2 for p in data.polygons),'fineNormalStrength':.25,'samples':64,'pixels':[1024,1024],'normalMethod':'Cycles tangent projection from image-aligned sculpt to the exact runtime mesh','aoMethod':'sculpted crossings and accepted complete lid assembly; low receiver excluded from AO ray occlusion; no scene light baked','outputs':outputs,'sideGeometryAndPbrUnchanged':True,'baseAndAlphaUnchanged':True}
    (folder/'Data_AlignedLidBake.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ALIGNED_LID_BAKE_RECEIPT',json.dumps(receipt))


def StagePrepareAlignedLidPbr():
    from pathlib import Path
    from PIL import Image
    import numpy as np,json,hashlib,datetime,importlib.util
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidReliefAligned';out=folder/'Baked';out.mkdir(exist_ok=True);original=root/'Materials/RuntimeNormalized/LidIntrinsicBaked';size=512
    bakerPath=BuildScriptPath().parents[2]/'_import/Script_BakePbrTexture.py';spec=importlib.util.spec_from_file_location('AlignedLidBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    def Resize(value,target=size):
        if value.ndim==3:return np.stack([Resize(value[:,:,i],target) for i in range(value.shape[2])],axis=2)
        return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((target,target),Image.Resampling.LANCZOS),dtype=float)
    basePath=original/'Texture_K06LidIntrinsicBase.webp';base=np.asarray(Image.open(basePath).convert('RGBA'),dtype=float)/255
    raw=np.asarray(Image.open(folder/'Texture_K06LidAlignedHighNormal.png').convert('RGB'),dtype=float)/255*2-1;valid=(np.sum(raw*raw,axis=2)>.7)&(np.sum(raw*raw,axis=2)<1.3);den=baker.GaussianPeriodic(valid.astype(float),3);padding=baker.GaussianPeriodic(raw*valid[:,:,None],3)/np.maximum(den[:,:,None],1e-6);padding[den<1e-4]=(0,0,1);raw[~valid]=padding[~valid]
    alphaHigh=np.clip(Resize(base[:,:,3],raw.shape[0]),0,1);mean=Resize(raw*alphaHigh[:,:,None])/np.maximum(Resize(alphaHigh)[:,:,None],1e-6);length=np.linalg.norm(mean,axis=2);normal=mean/np.maximum(length[:,:,None],1e-6);normal[length<1e-6]=(0,0,1)
    refinedAo=folder/'Texture_K06LidAlignedAssemblyAo.png';aoPath=refinedAo if refinedAo.exists() else folder/'Texture_K06LidAlignedHighAo.png'
    if refinedAo.exists():
        refined=json.loads((folder/'Data_AlignedLidAssemblyAo.json').read_text(encoding='utf-8'));sculpt=json.loads((folder/'Data_AlignedLidSculpt.json').read_text(encoding='utf-8'));assert refined['sculptHeightSha256']==sculpt['heightSha256'];assert hashlib.sha256(refinedAo.read_bytes()).hexdigest()==refined['sha256']
    aoHigh=np.asarray(Image.open(aoPath).convert('RGB'),dtype=float)[:,:,0]/255;aoPad=baker.GaussianPeriodic(aoHigh*valid,3)/np.maximum(den,1e-6);aoPad[den<1e-4]=1;aoHigh[~valid]=aoPad[~valid];ao=np.clip(Resize(aoHigh*alphaHigh)/np.maximum(Resize(alphaHigh),1e-6),0,1)
    originalOrmPath=original/'Texture_K06LidIntrinsicOrm.webp';ormBytes=np.asarray(Image.open(originalOrmPath).convert('RGBA'));orm=ormBytes.copy();orm[:,:,0]=np.uint8(np.clip(np.rint(ao*255),0,255));assert np.array_equal(orm[:,:,1:],ormBytes[:,:,1:])
    normalPath=out/'Texture_K06LidAlignedNormal.webp';Image.fromarray(np.uint8(np.clip(np.rint((normal*.5+.5)*255),0,255)),'RGB').save(normalPath,'WEBP',lossless=True,method=6,exact=True)
    ormPath=out/'Texture_K06LidAlignedOrm.webp';Image.fromarray(orm,'RGBA').save(ormPath,'WEBP',lossless=True,method=6,exact=True)
    rows=[{'channel':channel,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'pixels':[512,512]} for channel,path in (('Base',basePath),('Normal',normalPath),('Orm',ormPath))]
    metrics={**baker.ToneMetrics(base[:,:,:3]),**baker.TileMetrics(base[:,:,:3]),'texelsPerMeter':1024};presets=json.loads((bakerPath.parent/'Data_TextureBakePresets.json').read_text(encoding='utf-8'));problems=baker.CheckGates(metrics,sum(row['bytes'] for row in rows),rows,presets['gates'],presets['classes']['weatheredWood'],uv_atlas=True);assert not problems,problems
    support=Resize(valid.astype(float))>.5;use=(base[:,:,3]>=.5)&support;rawAngles=np.degrees(np.arccos(np.clip(normal[:,:,2],-1,1)))[use];effective=normal.copy();effective[:,:,:2]*=1.45;effective/=np.linalg.norm(effective,axis=2,keepdims=True);angles=np.degrees(np.arccos(np.clip(effective[:,:,2],-1,1)))[use]
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'normalMethod':'image-aligned sculpt high-to-exact-runtime-low tangent bake with original fine bark contribution','sourceBake':'../Data_AlignedLidBake.json','normalScale':1.45,'rawNormalTiltQuantiles':np.percentile(rawAngles,[25,50,75,90,99]).tolist(),'normalTiltQuantiles':np.percentile(angles,[25,50,75,90,99]).tolist(),'aoQuantiles':np.percentile(ao[use],[10,50,90]).tolist(),'baseAndAlphaPayloadUnchanged':True,'roughnessMetalAlphaPixelsUnchanged':True,'scope':'upper lid material only','metrics':metrics,'problems':problems,'outputs':rows,'runtimeRegistered':False,'userApproved':False}
    (out/'Data_AlignedLidPbr.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ALIGNED_LID_PBR',json.dumps(receipt))


def WriteLidOccluderInput(scene,folder):
    import json,hashlib,datetime
    folder.mkdir(exist_ok=True);meshes=[]
    for suffix in ('LidRimBundle','LidBindings','LidSpines','LidBarkWear'):
        obj=next(obj for obj in scene.objects if obj.name=='Intact_'+suffix)
        meshes.append({'name':suffix,'vertices':[list(v.co) for v in obj.data.vertices],'faces':[list(p.vertices) for p in obj.data.polygons]})
    signature=hashlib.sha256(json.dumps(meshes,separators=(',',':')).encode()).hexdigest();path=folder/('Data_LidOccluders_'+signature[:16]+'.json')
    if not path.exists():path.write_text(json.dumps({'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'geometrySha256':signature,'buildScript':SnapshotBuildScript(folder.parent.parent),'meshes':meshes},indent=2),encoding='utf-8')
    pointer={'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'geometrySha256':signature};(folder/'Data_LidOccludersCurrent.json').write_text(json.dumps(pointer,indent=2),encoding='utf-8');print('LID_OCCLUDERS_SNAPSHOT',signature)


def StageBakeAlignedAssemblyAo():
    import bpy,json,hashlib,datetime
    from pathlib import Path
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');folder=root/'Materials/LidReliefAligned';assert Path(bpy.data.filepath).resolve()==(folder/'Scene_K06LidAlignedHighBake.blend').resolve()
    pointer=json.loads((folder/'Data_LidOccludersCurrent.json').read_text(encoding='utf-8'));source=Path(pointer['file']);assert hashlib.sha256(source.read_bytes()).hexdigest()==pointer['sha256'];casters=json.loads(source.read_text(encoding='utf-8'))
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith('LidAlignedCaster_'):bpy.data.objects.remove(obj,do_unlink=True)
    opaque=bpy.data.materials.new('LidActualAssemblyOccluder');opaque.use_nodes=True
    for index,row in enumerate(casters['meshes']):
        mesh=bpy.data.meshes.new('ActualCaster_'+row['name']);mesh.from_pydata(row['vertices'],[],row['faces']);mesh.update();mesh.materials.append(opaque);obj=bpy.data.objects.new('LidAlignedCaster_'+str(index),mesh);bpy.context.scene.collection.objects.link(obj)
    scene=bpy.context.scene;high=bpy.data.objects['LidAlignedSculptHigh'];low=bpy.data.objects['LidAlignedRuntimeReceiver'];cage=bpy.data.objects['LidAlignedCage']
    for attr in ('visible_shadow','visible_diffuse','visible_glossy','visible_transmission','visible_volume_scatter'):setattr(low,attr,False)
    material=low.data.materials[0];image=bpy.data.images.new('Texture_K06LidAlignedAssemblyAo',width=1024,height=1024,alpha=False);image.colorspace_settings.name='Non-Color';node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;material.node_tree.nodes.active=node
    bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low;scene.cycles.samples=64
    bpy.ops.object.bake(type='AO',use_selected_to_active=True,use_cage=True,cage_object=cage.name,cage_extrusion=0,max_ray_distance=.06,margin=8)
    path=folder/'Texture_K06LidAlignedAssemblyAo.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack();material.node_tree.nodes.remove(node);bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Scene_K06LidAlignedAssemblyAo.blend'))
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root),'casterInput':pointer,'lowReceiverExcludedFromAoRays':True,'lowReceiverTriangles':sum(len(p.vertices)-2 for p in low.data.polygons),'output':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sculptHeightSha256':scene['K06AlignedLidSource'],'samples':64,'pixels':[1024,1024]};(folder/'Data_AlignedLidAssemblyAo.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('ALIGNED_ASSEMBLY_AO',json.dumps(receipt))


def ApplyAlignedLidMaterial(scene,folder):
    import bpy,json,hashlib
    from pathlib import Path
    recipe=json.loads((folder/'Data_AlignedLidPbr.json').read_text(encoding='utf-8'))
    for row in recipe['outputs']:assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256']
    original=bpy.data.objects['Intact_LidWeave'].data.materials[0];material=original.copy();original.name='Wicker_LidBeforeAlignedRelief';material.name='Wicker_LidIntrinsic';material.use_backface_culling=False
    nodes=material.node_tree.nodes
    for channel in ('Normal','Orm'):
        row=next(row for row in recipe['outputs'] if row['channel']==channel);image=bpy.data.images.load(row['file'],check_existing=False);image.colorspace_settings.name='Non-Color';image.pack()
        texture=next(node for node in nodes if node.type=='TEX_IMAGE' and node.image and channel in node.image.name);texture.image=image
    next(node for node in nodes if node.type=='NORMAL_MAP').inputs['Strength'].default_value=recipe['normalScale']
    for state in ('Intact','Opened'):
        obj=bpy.data.objects[state+'_LidWeave'];obj.data.materials.clear();obj.data.materials.append(material);obj['K06ImageAlignedRelief']=True
        bpy.data.objects[state+'_LidWeaveInner'].data.materials[0].use_backface_culling=True
    scene['K06LidReliefMethod']=recipe['normalMethod'];print('ALIGNED_LID_MATERIAL_APPLIED','normal scale',recipe['normalScale'])


def ApplyRoundWeaveMaterial(scene,folder):
    if globals().get('K06_CONTINUOUS_LID'):return ApplyContinuousLidMaterial(scene,ContinuousLidFolder()/'Baked')
    import bpy,json,hashlib
    from pathlib import Path
    recipe=json.loads((folder/'Data_RoundWeavePbr.json').read_text(encoding='utf-8'))
    original=bpy.data.objects['Intact_LidWeave'].data.materials[0];original.name='Wicker_LidBeforeRoundWeave';materials=[];images={}
    for row in recipe['outputs']:
        assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256'];image=bpy.data.images.load(row['file'],check_existing=False)
        if 'Base' not in row['channel']:image.colorspace_settings.name='Non-Color'
        image.pack();images[row['channel']]=image
    for region in ('Carrier','Raised'):
        material=original.copy();material.name='Wicker_Lid'+region;material.use_backface_culling=False
        for channel in ('Base','Normal','Orm'):
            node=next(node for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.image and channel in node.image.name);node.image=images[region+channel if channel in ('Base','Normal') else channel]
        next(node for node in material.node_tree.nodes if node.type=='NORMAL_MAP').inputs['Strength'].default_value=recipe['normalScaleByRegion'][region];materials.append(material)
    for state in ('Intact','Opened'):
        obj=bpy.data.objects[state+'_LidWeave'];obj.data.materials.clear()
        for material in materials:obj.data.materials.append(material)
        for polygon in obj.data.polygons:polygon.material_index=0 if all(i<obj['K06LidCarrierVertexCount'] for i in polygon.vertices) else 1
        counts=[sum(len(p.vertices)-2 for p in obj.data.polygons if p.material_index==i) for i in (0,1)];assert counts==[72,928],counts
        obj['K06RaisedOuterCourses']=10;bpy.data.objects[state+'_LidWeaveInner'].data.materials[0].use_backface_culling=True
    scene['K06LidReliefMethod']=recipe['method'];print('ROUND_WEAVE_MATERIAL_APPLIED',recipe['normalPixels'])


def Stage_bake_center():
    BakeLidWeave(True)


def Stage_bake_wall():
    """Bake full cylindrical high-poly willow wall into one seam-aware UV atlas."""
    import bpy,math,random
    from pathlib import Path
    random.seed(6039)
    out=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    ClearFreshTaskScene()
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=0.018;scene.render.bake.max_ray_distance=0.035;scene.render.bake.margin=8
    rows=30;spokes=32;segments=320;sides=12;height=.180;z0=.008;pitch=(height-.016)/(rows-1)
    verts=[];faces=[];uvfaces=[];ids=[]
    def body_radius(z,a):
     return .230+.012*z/.17-.0035*math.exp(-z/.012)+.0009*math.sin(5*a+7*z)*math.cos(2*a+19*z)
    def addtube(kind,index):
     base=len(verts);tube_id=index if kind=='ring' else rows+index
     phase_offset=random.Random(8000+tube_id).uniform(0,1)
     count=segments if kind=='ring' else (rows-1)*4
     thick=.0015*(1+.16*math.sin(index*2.2))
     for i in range(count+1):
      if kind=='ring':
       a=2*math.pi*i/count; z=z0+index*pitch+0.00065*math.sin(3*a+index*1.4)+0.00015*math.sin(11*a+index)
       rad=body_radius(z,a)+.0022*math.cos(spokes*.5*a+index*math.pi)
      else:
       q=i/4; a=2*math.pi*index/spokes
       z=z0+q*pitch+0.00065*math.sin(3*a+q*1.4)+0.00015*math.sin(11*a+q)
       rad=body_radius(z,a)-.0022*math.cos(math.pi*(i/4+index))
      local=thick*(1+.10*math.sin(i*0.29+index)+.04*math.sin(i*1.7+index))
      for j in range(sides):
       b=2*math.pi*j/sides
       if kind=='ring':
        rr=rad+local*.75*math.cos(b);verts.append((rr*math.cos(a),rr*math.sin(a),z+local*math.sin(b)))
       else:
        rr=rad+local*.75*math.cos(b);aa=a+local*math.sin(b)/rad;verts.append((rr*math.cos(aa),rr*math.sin(aa),z))
     for i in range(count):
      for j in range(sides):
       nj=(j+1)%sides;q=(base+i*sides+j,base+(i+1)*sides+j,base+(i+1)*sides+nj,base+i*sides+nj)
       faces.append(tuple(reversed(q)) if kind=='spoke' else q)
       cycles=round(2*math.pi*.237/.09) if kind=='ring' else 2
       u0=phase_offset+i/count*cycles;u1=phase_offset+(i+1)/count*cycles
       uv=((u0,j/sides),(u1,j/sides),(u1,(j+1)/sides),(u0,(j+1)/sides))
       uvfaces.append(tuple(reversed(uv)) if kind=='spoke' else uv);ids.append(tube_id)
    for i in range(rows):addtube('ring',i)
    for i in range(spokes):addtube('spoke',i)
    me=bpy.data.meshes.new('WallWeaveHigh_Mesh');me.from_pydata(verts,[],faces);me.update();high=bpy.data.objects.new('WallWeaveHigh',me);bpy.context.collection.objects.link(high)
    uv=me.uv_layers.new(name='TwigFiberUV')
    for poly,coords,idx in zip(me.polygons,uvfaces,ids):
     poly.use_smooth=True;poly.material_index=idx
     for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
    img=bpy.data.images.load(str(out/'Texture_K06SingleWillowBase.webp'),check_existing=False);img.pack()
    normal_img=bpy.data.images.load(str(out/'Texture_K06SingleWillowNormal.webp'),check_existing=False);normal_img.colorspace_settings.name='Non-Color';normal_img.pack()
    for i in range(rows+spokes):
     m=bpy.data.materials.new('WallTwig_%02d'%i);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
     coord=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexImage');tex.image=img;l.new(coord.outputs['UV'],tex.inputs['Vector']);mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
     v=random.Random(3000+i).uniform(.75,1.10);mult.inputs[2].default_value=(v,v*.99,v*.97,1);l.new(tex.outputs['Color'],mult.inputs[1]);l.new(mult.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.9;me.materials.append(m)
     nt=n.new('ShaderNodeTexImage');nt.image=normal_img;l.new(coord.outputs['UV'],nt.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.6;l.new(nt.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
    # Actual cylindrical proxy with duplicated seam vertices, body-height UV island.
    pv=[];pf=[]
    for j in range(segments+1):
     a=2*math.pi*j/segments
     for z in (0,height):
      rad=body_radius(z,a);pv.append((rad*math.cos(a),rad*math.sin(a),z))
    for j in range(segments):pf.append((2*j,2*j+2,2*j+3,2*j+1))
    pm=bpy.data.meshes.new('WallBakeProxy_Mesh');pm.from_pydata(pv,[],pf);pm.update();low=bpy.data.objects.new('WallBakeProxy',pm);bpy.context.collection.objects.link(low)
    uv=pm.uv_layers.new(name='WallAtlasUV')
    for j,poly in enumerate(pm.polygons):
     for loop,co in zip(poly.loop_indices,((j/segments,0),((j+1)/segments,0),((j+1)/segments,1),(j/segments,1))):uv.data[loop].uv=co
    mat=bpy.data.materials.new('WallBakeReceiver');mat.use_nodes=True;pm.materials.append(mat)
    assert bpy.context.scene is scene and bpy.context.window.scene is scene and set(scene.objects)=={high,low}, 'Unexpected bake scene objects'
    print('BAKE_SCENE',scene.name,'objects',[(o.name,o.type) for o in scene.objects])
    def bake(kind,name):
     im=bpy.data.images.new(name,width=2048,height=512,alpha=False)
     if kind!='DIFFUSE':im.colorspace_settings.name='Non-Color'
     node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;mat.node_tree.nodes.active=node
     bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
     args={'type':kind,'use_selected_to_active':True,'cage_extrusion':0.018,'max_ray_distance':0.035,'margin':(0 if kind=='EMIT' else 8)}
     if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
     bpy.ops.object.bake(**args);im.filepath_raw=str(out/(name+'.png'));im.file_format='PNG';im.save();im.pack();mat.node_tree.nodes.remove(node);print('BAKED',kind,im.filepath_raw)
    for typ,name in [('DIFFUSE','Texture_K06WallHighBase'),('NORMAL','Texture_K06WallHighNormal'),('AO','Texture_K06WallHighAo')]:bake(typ,name)
    saved=[]
    for material in me.materials:
     n=material.node_tree.nodes;l=material.node_tree.links;output=n.get('Material Output');old=output.inputs['Surface'].links[0].from_socket;emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(1,1,1,1);l.new(emission.outputs[0],output.inputs['Surface']);saved.append((material,output,old,emission))
    bake('EMIT','Texture_K06WallCoverage')
    for material,output,old,emission in saved:
     material.node_tree.links.new(old,output.inputs['Surface']);material.node_tree.nodes.remove(emission)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Scene_K06WallHighBake.blend'))
    print('WALL_HIGH_TRIS',sum(len(p.vertices)-2 for p in me.polygons))


def Stage_bake_wall_study():
    """Independent inside/outside projections from one real tightly woven high wall."""
    import bpy,bmesh,math,random
    from pathlib import Path
    materials=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    out=materials/'FullWeaveStudy';out.mkdir(exist_ok=True)
    scene=ClearFreshTaskScene();scene.render.engine='CYCLES';scene.cycles.samples=32
    rows=bodyWeaveRows;groups=bodyStakeGroups;spokes=groups*2;steps=640;sides=12;z0=.008;pitch=.164/rows
    verts=[];faces=[];uvfaces=[];ids=[]
    for kind,countTubes in [('ring',rows),('spoke',spokes)]:
        for strand in range(countTubes):
            base=len(verts);tubeId=strand if kind=='ring' else rows+strand
            stepsAlong=steps if kind=='ring' else rows*4
            centers=[];arcs=[];depths=[];widths=[]
            for j in range(stepsAlong+1):
                if kind=='ring':
                    turn=j/stepsAlong;flow=strand+turn;a=2*math.pi*turn
                    z=BodyCourseHeight(flow,a)
                    r=BodyMeanRadius(z,a)+.00225*math.cos(groups*.5*a+strand*math.pi)+.00035*math.sin(9*a+flow*.49)
                else:
                    q=j/4;group=strand//2;a=2*math.pi*group/groups+(-.009 if strand%2==0 else .009)
                    z=BodyCourseHeight(q,a)
                    r=BodyMeanRadius(z,a)-.00225*math.cos(math.pi*(q-a/(2*math.pi)+group))
                    a+=.0023*math.sin(q*.7+strand*1.71)
                variation=(1+.16*math.sin(flow*2.2))*(1+.075*math.sin(flow*2*math.pi*12)+.035*math.sin(flow*2*math.pi*37)) if kind=='ring' else (1+.14*math.sin(strand*2.2))*(1+.08*math.sin(j*.29+strand)+.03*math.sin(j*1.7+strand))
                # C uses fine, nearly round unpeeled twigs with open gaps.
                # Packing these into broad flattened ribbons erased the weave.
                depth=(.00230 if kind=='ring' else .00155)*variation
                width=(.00260 if kind=='ring' else .00190)*variation
                center=(r*math.cos(a),r*math.sin(a),z);centers.append(center);arcs.append(0 if j==0 else arcs[-1]+math.dist(center,centers[-2]));depths.append(depth);widths.append(width)
                for k in range(sides):
                    b=2*math.pi*k/sides;rr=r+depth*math.cos(b)
                    aa=a if kind=='ring' else a+width*math.sin(b)/r
                    zz=z+width*math.sin(b) if kind=='ring' else z
                    verts.append((rr*math.cos(aa),rr*math.sin(aa),zz))
            for j in range(stepsAlong):
                cross0=EllipseArcOffsets(sides,widths[j]/depths[j]);cross1=EllipseArcOffsets(sides,widths[j+1]/depths[j+1]);offset=.12+(tubeId%7)*.065;uShift=random.Random(8100+tubeId).uniform(0,8)
                for k in range(sides):
                    nk=(k+1)%sides;q=(base+j*sides+k,base+(j+1)*sides+k,base+(j+1)*sides+nk,base+j*sides+nk)
                    uv=((uShift+arcs[j]/.08,offset+cross0[k]*depths[j]/.08),(uShift+arcs[j+1]/.08,offset+cross1[k]*depths[j+1]/.08),(uShift+arcs[j+1]/.08,offset+cross1[k+1]*depths[j+1]/.08),(uShift+arcs[j]/.08,offset+cross0[k+1]*depths[j]/.08))
                    faces.append(tuple(reversed(q)) if kind=='spoke' else q);uvfaces.append(tuple(reversed(uv)) if kind=='spoke' else uv);ids.append(tubeId)
    mesh=bpy.data.meshes.new('WallStudyHighMesh');mesh.from_pydata(verts,[],faces);mesh.update();high=bpy.data.objects.new('WallStudyHigh',mesh);scene.collection.objects.link(high)
    uv=mesh.uv_layers.new(name='PhysicalFiberUV')
    for poly,coords,material in zip(mesh.polygons,uvfaces,ids):
        poly.use_smooth=True;poly.material_index=material
        for loop,co in zip(poly.loop_indices,coords):uv.data[loop].uv=co
    images={}
    for channel in ('Base','Normal','Orm'):
        image=bpy.data.images.load(str(materials/('Texture_K06RimNative'+channel+'.webp')),check_existing=False)
        if channel!='Base':image.colorspace_settings.name='Non-Color'
        image.pack();images[channel]=image
    for i in range(rows+spokes):
        mat=bpy.data.materials.new('WallStudyTwig_%03d'%i);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF');coord=n.new('ShaderNodeTexCoord')
        color=n.new('ShaderNodeTexImage');color.image=images['Base'];l.new(coord.outputs['UV'],color.inputs['Vector']);multiply=n.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        value=random.Random(3900+i).uniform(.84,1.45);multiply.inputs[2].default_value=(value,value*.99,value*.97,1);l.new(color.outputs['Color'],multiply.inputs[1]);l.new(multiply.outputs[0],bs.inputs['Base Color'])
        normal=n.new('ShaderNodeTexImage');normal.image=images['Normal'];l.new(coord.outputs['UV'],normal.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.6;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
        packed=n.new('ShaderNodeTexImage');packed.image=images['Orm'];l.new(coord.outputs['UV'],packed.inputs['Vector']);sep=n.new('ShaderNodeSeparateColor');l.new(packed.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness']);mesh.materials.append(mat)
    if globals().get('K06_WALL_HIGH_ONLY'):
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'Scene_K06WallOuterHighBake.blend'))
        print('WALL_HIGH_SOURCE_ONLY',sum(len(p.vertices)-2 for p in mesh.polygons));return
    for inside in (False,True):
        label='Inner' if inside else 'Outer';vertices,polygons,coords=BodySkinGeometry(inside)
        pm=bpy.data.meshes.new('Wall'+label+'ReceiverMesh');pm.from_pydata(vertices,[],polygons);pm.update();proxy=bpy.data.objects.new('Wall'+label+'Receiver',pm);scene.collection.objects.link(proxy)
        layer=pm.uv_layers.new(name='BodyAtlasUV')
        for poly,uvs in zip(pm.polygons,coords):
            poly.use_smooth=True
            for loop,co in zip(poly.loop_indices,uvs):layer.data[loop].uv=co
        bm=bmesh.new();bm.from_mesh(pm);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(pm);bm.free();pm.update()
        receiver=bpy.data.materials.new('Wall'+label+'BakeReceiver');receiver.use_nodes=True;pm.materials.append(receiver)
        cageMesh=pm.copy();cage=bpy.data.objects.new('Wall'+label+'RadialCage',cageMesh);scene.collection.objects.link(cage)
        for vertex in cageMesh.vertices:
            r=math.hypot(vertex.co.x,vertex.co.y);vertex.co.x*=1+.014/r;vertex.co.y*=1+.014/r
        cage.hide_render=True
        assert set(scene.objects)=={high,proxy,cage}
        def bake(kind,suffix):
            image=bpy.data.images.new('Wall'+label+suffix,width=4096,height=512,alpha=False)
            if kind!='DIFFUSE':image.colorspace_settings.name='Non-Color'
            node=receiver.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;receiver.node_tree.nodes.active=node
            bpy.ops.object.select_all(action='DESELECT');high.select_set(True);proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
            args={'type':kind,'use_selected_to_active':True,'use_cage':True,'cage_object':cage.name,'cage_extrusion':0,'max_ray_distance':.040,'margin':0 if kind=='EMIT' else 4}
            if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
            bpy.ops.object.bake(**args);image.filepath_raw=str(out/('Texture_K06Wall'+label+'High'+suffix+'.png'));image.file_format='PNG';image.save();image.pack();receiver.node_tree.nodes.remove(node);print('WALL_STUDY_BAKED',label,kind)
        for kind,suffix in [('DIFFUSE','Base'),('NORMAL','Normal'),('AO','Ao'),('ROUGHNESS','Roughness')]:bake(kind,suffix)
        saved=[]
        for mat in mesh.materials:
            n=mat.node_tree.nodes;l=mat.node_tree.links;output=n.get('Material Output');old=output.inputs['Surface'].links[0].from_socket;emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(1,1,1,1);l.new(emission.outputs[0],output.inputs['Surface']);saved.append((mat,output,old,emission))
        bake('EMIT','Coverage')
        for mat,output,old,emission in saved:mat.node_tree.links.new(old,output.inputs['Surface']);mat.node_tree.nodes.remove(emission)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/('Scene_K06Wall'+label+'HighBake.blend')))
        bpy.data.objects.remove(proxy,do_unlink=True)
        bpy.data.objects.remove(cage,do_unlink=True)
    print('WALL_STUDY_HIGH_TRIANGLES',sum(len(poly.vertices)-2 for poly in mesh.polygons))


def Stage_prepare_wall_study():
    from pathlib import Path
    from PIL import Image
    import numpy as np
    folder=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials\FullWeaveStudy')
    for side in ('Outer','Inner'):
        prefix='Texture_K06Wall'+side
        base=np.asarray(Image.open(folder/(prefix+'HighBase.png')).convert('RGB'),dtype=np.float32);valid=base.max(axis=2)>2;filled=base.copy()
        for iteration in range(32):
            total=np.zeros_like(filled);count=np.zeros(valid.shape,dtype=np.float32)
            for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
                v=np.roll(valid,shift,axis=axis);total+=np.roll(filled,shift,axis=axis)*v[:,:,None];count+=v
            fresh=(~valid)&(count>0)
            if not fresh.any():break
            filled[fresh]=total[fresh]/count[fresh,None];valid|=fresh
        color=Image.fromarray(np.uint8(np.clip(filled,0,255)),'RGB').convert('RGBA');color.putalpha(Image.open(folder/(prefix+'HighCoverage.png')).convert('L'));color.save(folder/(prefix+'AtlasBase.png'))
        ao=np.asarray(Image.open(folder/(prefix+'HighAo.png')).convert('L'),dtype=np.float32)/255;rough=np.asarray(Image.open(folder/(prefix+'HighRoughness.png')).convert('L'),dtype=np.float32)/255
        coverage=np.asarray(Image.open(folder/(prefix+'HighCoverage.png')).convert('L'))>=128
        normal=np.asarray(Image.open(folder/(prefix+'HighNormal.png')).convert('RGB')).copy()
        normal[~coverage]=(128,128,255);rough[~coverage]=.9;ao[~coverage]=1
        Image.fromarray(normal,'RGB').save(folder/(prefix+'AtlasNormal.png'))
        packed=np.stack((ao,rough,np.zeros_like(ao)),axis=2);Image.fromarray(np.uint8(np.clip(packed*255,0,255)),'RGB').save(folder/(prefix+'AtlasOrm.png'))
        print('WALL_STUDY_PREPARED',side,'fill_passes',iteration+1)


def Stage_bake_bottom():
    # Independent geometry, UV projection and bake; not a copied lid texture.
    BakeLidWeave(False,True)


def Stage_bake_bundle():
    """Bake actual individually varied rim twigs to the low bundle's toroidal UV."""
    import bpy,math,random
    from pathlib import Path
    random.seed(6107)
    out=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    materials=out
    if IsFullWeaveStudy():out=materials/'FullWeaveStudy';out.mkdir(exist_ok=True)
    ClearFreshTaskScene()
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.012;scene.render.bake.max_ray_distance=.025;scene.render.bake.margin=8
    verts=[];faces=[];uvfaces=[];ids=[];tubes=3;steps=256;sides=16
    for strand in range(tubes):
     base=len(verts);seed=random.Random(6100+strand);offset=seed.random();crossOffset=(.12,.43,.71)[strand];centers=[];radii=[];arcs=[]
     for j in range(steps+1):
      a=2*math.pi*j/steps;cr,cz,twigs=BundleSpec(a)
      dx,dz,local=twigs[strand];center_r=cr+dx;center_z=cz+dz
      center=(center_r*math.cos(a),center_r*math.sin(a),center_z);centers.append(center);radii.append(local);arcs.append(0 if j==0 else arcs[-1]+math.dist(centers[-2],center))
      for k in range(sides):
       b=2*math.pi*k/sides;r=center_r+local*math.cos(b)
       verts.append((r*math.cos(a),r*math.sin(a),center_z+local*math.sin(b)))
     for j in range(steps):
      for k in range(sides):
       nk=(k+1)%sides;faces.append((base+j*sides+k,base+(j+1)*sides+k,base+(j+1)*sides+nk,base+j*sides+nk))
       u0=offset+arcs[j]/.08;u1=offset+arcs[j+1]/.08
       v0=crossOffset+k/sides*2*math.pi*radii[j]/.08;v1=crossOffset+k/sides*2*math.pi*radii[j+1]/.08
       v2=crossOffset+(k+1)/sides*2*math.pi*radii[j+1]/.08;v3=crossOffset+(k+1)/sides*2*math.pi*radii[j]/.08
       uvfaces.append(((u0,v0),(u1,v1),(u1,v2),(u0,v3)));ids.append(strand)
    # Short, locally lifted plant fibers: geometry-derived relief, not a repeated decal.
    for index,a0 in enumerate((.08,.5,1.1,1.75,2.2,2.8,3.2,3.65,4.15,4.7,5.18,5.8)):
     base=len(verts);phi=(-.42,-.12,.18,.43)[index%4];length=.008+.003*(index%4)
     for longitudinal,across,lift in ((-.5,-.06,0),(.5,-.06,0),(.30,.06,.00035),(-.35,.06,.00020)):
      a=a0+longitudinal*length/.241;b=phi+across
      r,z=BundleSurface(a,b);r+=(.00012+lift)*math.cos(b);z+=(.00012+lift)*math.sin(b)
      verts.append((r*math.cos(a),r*math.sin(a),z))
     faces.append((base,base+1,base+2,base+3));uvfaces.append(((.1,.2),(.1+length/.08,.2),(.1+length/.08,.215),(.1,.215)));ids.append(tubes)
    me=bpy.data.meshes.new('RimBundleHigh_Mesh');me.from_pydata(verts,[],faces);me.update();high=bpy.data.objects.new('RimBundleHigh',me);bpy.context.collection.objects.link(high)
    uv=me.uv_layers.new(name='TwigFiberUV')
    for poly,coords,idx in zip(me.polygons,uvfaces,ids):
     poly.use_smooth=True;poly.material_index=idx
     for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
    img=bpy.data.images.load(str(materials/'Texture_K06RimNativeBase.webp'),check_existing=False);img.pack()
    fiber_normal=bpy.data.images.load(str(materials/'Texture_K06RimNativeNormal.webp'),check_existing=False);fiber_normal.colorspace_settings.name='Non-Color';fiber_normal.pack()
    rough_image=bpy.data.images.load(str(materials/'Texture_K06RimNativeOrm.webp'),check_existing=False);rough_image.colorspace_settings.name='Non-Color';rough_image.pack()
    for i in range(tubes+1):
     m=bpy.data.materials.new('RimTwig_%02d'%i);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
     coord=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexImage');tex.image=img;l.new(coord.outputs['UV'],tex.inputs['Vector']);mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
     v=1.28 if i==tubes else (.74,1.03,.88)[i];mult.inputs[2].default_value=(v,v*.98,v*.94,1);l.new(tex.outputs['Color'],mult.inputs[1]);l.new(mult.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.9;me.materials.append(m)
     rt=n.new('ShaderNodeTexImage');rt.image=rough_image;l.new(coord.outputs['UV'],rt.inputs['Vector']);sep=n.new('ShaderNodeSeparateColor');l.new(rt.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness'])
     nt=n.new('ShaderNodeTexImage');nt.image=fiber_normal;l.new(coord.outputs['UV'],nt.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.7;l.new(nt.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
    # Identical low-torus silhouette and non-overlapping UV island (with seam duplication).
    seg=32;cross=10;pv=[];pf=[]
    for j in range(seg+1):
     a=2*math.pi*j/seg
     for k in range(cross+1):
      b=2*math.pi*k/cross;r,z=BundleSurface(a,b);pv.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(seg):
     for k in range(cross):
      x=j*(cross+1)+k;y=(j+1)*(cross+1)+k;pf.append((x,y,y+1,x+1))
    pm=bpy.data.meshes.new('BundleBakeProxy_Mesh');pm.from_pydata(pv,[],pf);pm.update();low=bpy.data.objects.new('BundleBakeProxy',pm);bpy.context.collection.objects.link(low)
    uv=pm.uv_layers.new(name='BundleAtlasUV')
    for idx,poly in enumerate(pm.polygons):
     j,k=divmod(idx,cross)
     for loop,co in zip(poly.loop_indices,((j/seg,k/cross),((j+1)/seg,k/cross),((j+1)/seg,(k+1)/cross),(j/seg,(k+1)/cross))):uv.data[loop].uv=co
    mat=bpy.data.materials.new('BundleBakeReceiver');mat.use_nodes=True;pm.materials.append(mat)
    assert bpy.context.scene is scene and bpy.context.window.scene is scene and set(scene.objects)=={high,low}, 'Unexpected bake scene objects'
    print('BAKE_SCENE',scene.name,'objects',[(o.name,o.type) for o in scene.objects])
    def bake(kind,name):
     im=bpy.data.images.new(name,width=4096,height=512,alpha=False)
     if kind!='DIFFUSE':im.colorspace_settings.name='Non-Color'
     node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;mat.node_tree.nodes.active=node
     bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
     args={'type':kind,'use_selected_to_active':True,'cage_extrusion':.012,'max_ray_distance':.025,'margin':8}
     if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
     bpy.ops.object.bake(**args);im.filepath_raw=str(out/(name+'.png'));im.file_format='PNG';im.save();im.pack();mat.node_tree.nodes.remove(node);print('BAKED',kind,im.filepath_raw)
    for typ,name in [('DIFFUSE','Texture_K06BundleHighBase'),('NORMAL','Texture_K06BundleHighNormal'),('AO','Texture_K06BundleHighAo'),('ROUGHNESS','Texture_K06BundleHighRoughness')]:bake(typ,name)
    saved=[]
    for index,material in enumerate(me.materials):
     nodes=material.node_tree.nodes;links=material.node_tree.links;output=nodes.get('Material Output');old=output.inputs['Surface'].links[0].from_socket
     emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=((1,1,1,1) if index==tubes else (0,0,0,1));links.new(emission.outputs['Emission'],output.inputs['Surface']);saved.append((material,output,old,emission))
    bake('EMIT','Texture_K06BundleWearMask')
    for material,output,old,emission in saved:
     material.node_tree.links.new(old,output.inputs['Surface']);material.node_tree.nodes.remove(emission)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Scene_K06BundleHighBake.blend'))
    print('BUNDLE_HIGH_TRIS',sum(len(p.vertices)-2 for p in me.polygons))


def ApplyCreviceSoil(color,ao,coverage):
    """Old-willow material variation from contact cavities, with no light bake."""
    import numpy as np
    srgb=np.clip(color/255,0,1);linear=np.where(srgb<=.04045,srgb/12.92,((srgb+.055)/1.055)**2.4)
    linear=np.clip(linear*1.6,0,1)
    weight=((1-np.clip(ao,0,1))**.5*.82*(coverage>=128))[:,:,None]
    linear=linear*(1-weight)+np.array([.012,.011,.009],dtype=np.float32)*weight
    return np.clip(np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055)*255,0,255)

def Stage_prepare_wood_appearance():
    import json,hashlib
    import numpy as np
    from pathlib import Path
    from PIL import Image
    folder=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials');outputs={}
    for side in ('Outer','Inner'):
        base=Image.open(folder/'CoveredWallStudy'/('Texture_K06Covered'+side+'Base.png')).convert('RGBA');a=np.asarray(base);ao=np.asarray(Image.open(folder/'CoveredWallStudy'/('Texture_K06Covered'+side+'Ao.png')).convert('L'),dtype=np.float32)/255
        color=ApplyCreviceSoil(a[:,:,:3].astype(np.float32),ao,a[:,:,3]);out=Image.fromarray(np.uint8(color),'RGB').convert('RGBA');out.putalpha(base.getchannel('A'))
        assert np.array_equal(np.asarray(out)[:,:,3],a[:,:,3]),'Material appearance must preserve the real projected apertures'
        path=folder/'CoveredWallStudy'/('Texture_K06Covered'+side+'AuthoredBase.png');out.save(path);outputs[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    a=np.asarray(Image.open(folder/'Texture_K06RimNativeBase.webp').convert('RGB'),dtype=np.float32)/255;linear=np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4);linear=np.clip(linear*1.25,0,1);color=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
    path=folder/'Texture_K06RimAuthoredBase.webp';Image.fromarray(np.uint8(np.clip(color*255,0,255)),'RGB').save(path,'WEBP',lossless=True,method=6);outputs[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    receipt={'creation':'Reference-C dry exposed willow versus protected crevice-soil albedo; no scene lights are baked','weaveLinearGain':1.6,'bareRimLinearGain':1.25,'soilLinearRgb':[.012,.011,.009],'soilMask':'0.82 * sqrt(1 - geometric AO), only on covered source surfaces','coverageChanged':False,'outputs':outputs,'visualApproved':False,'userApproved':False}
    (folder/'Data_WoodAppearance.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('WOOD_APPEARANCE_PREPARED',outputs)


def Stage_prepare_lid():
    """Fill unsampled weave-color gaps and pack geometry AO/estimated roughness."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    label='LidSurface' if globals().get('K06_PREPARE_LID_SURFACE') else ('LidInner' if globals().get('K06_PREPARE_LID_INNER') else 'Lid')
    base=np.asarray(Image.open(p/('Texture_K06'+label+'HighBase.png')).convert('RGB'),dtype=np.float32)
    # Unhit texels are filled from neighboring twig colors. Crevice soil adds
    # material variation at actual high-model contacts, without directional light.
    valid=base.max(axis=2)>2
    filled=base.copy()
    for iteration in range(48):
        total=np.zeros_like(filled); count=np.zeros(valid.shape,dtype=np.float32)
        for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
            v=np.roll(valid,shift,axis=axis); c=np.roll(filled,shift,axis=axis)
            total+=c*v[:,:,None];count+=v
        new=(~valid)&(count>0)
        if not new.any():break
        filled[new]=total[new]/count[new,None]
        valid|=new
    ao=np.asarray(Image.open(p/('Texture_K06'+label+'HighAo.png')).convert('L'),dtype=np.float32)/255
    coverage=Image.open(p/('Texture_K06'+label+'Coverage.png')).convert('L');filled=ApplyCreviceSoil(filled,ao,np.asarray(coverage))
    color=Image.fromarray(np.uint8(filled),'RGB').convert('RGBA');color.putalpha(coverage);color.save(p/('Texture_K06'+label+'AtlasBase.png'))
    luma=filled.mean(axis=2)/255
    rough=np.asarray(Image.open(p/('Texture_K06'+label+'HighRoughness.png')).convert('L'),dtype=np.float32)/255
    orm=np.stack((ao,rough,np.zeros_like(ao)),axis=2)
    Image.fromarray(np.uint8(orm*255),'RGB').save(p/('Texture_K06'+label+'AtlasOrm.png'))
    print('filled pixels',int(valid.sum()),'passes',iteration+1)


def Stage_prepare_center():
    """Fill unsampled weave-color gaps and pack geometry AO/estimated roughness."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    base=np.asarray(Image.open(p/'Texture_K06CenterHighBase.png').convert('RGB'),dtype=np.float32)
    valid=base.max(axis=2)>2
    filled=base.copy()
    for iteration in range(48):
        total=np.zeros_like(filled); count=np.zeros(valid.shape,dtype=np.float32)
        for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
            v=np.roll(valid,shift,axis=axis); c=np.roll(filled,shift,axis=axis)
            total+=c*v[:,:,None];count+=v
        new=(~valid)&(count>0)
        if not new.any():break
        filled[new]=total[new]/count[new,None]
        valid|=new
    ao=np.asarray(Image.open(p/'Texture_K06CenterHighAo.png').convert('L'),dtype=np.float32)/255
    coverage=Image.open(p/'Texture_K06CenterCoverage.png').convert('L');filled=ApplyCreviceSoil(filled,ao,np.asarray(coverage))
    color=Image.fromarray(np.uint8(filled),'RGB').convert('RGBA');color.putalpha(coverage);color.save(p/'Texture_K06CenterAtlasBase.png')
    luma=filled.mean(axis=2)/255
    rough=np.asarray(Image.open(p/'Texture_K06CenterHighRoughness.png').convert('L'),dtype=np.float32)/255
    orm=np.stack((ao,rough,np.zeros_like(ao)),axis=2)
    Image.fromarray(np.uint8(orm*255),'RGB').save(p/'Texture_K06CenterAtlasOrm.png')
    print('filled pixels',int(valid.sum()),'passes',iteration+1)



def Stage_prepare_wall():
    """Fill unsampled weave-color gaps and pack geometry AO/estimated roughness."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    base=np.asarray(Image.open(p/'Texture_K06WallHighBase.png').convert('RGB'),dtype=np.float32)
    valid=base.max(axis=2)>2
    filled=base.copy()
    for iteration in range(48):
        total=np.zeros_like(filled); count=np.zeros(valid.shape,dtype=np.float32)
        for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
            v=np.roll(valid,shift,axis=axis); c=np.roll(filled,shift,axis=axis)
            total+=c*v[:,:,None];count+=v
        new=(~valid)&(count>0)
        if not new.any():break
        filled[new]=total[new]/count[new,None]
        valid|=new
    color=Image.fromarray(np.uint8(np.clip(filled,0,255)),'RGB').convert('RGBA');color.putalpha(Image.open(p/'Texture_K06WallCoverage.png').convert('L'));color.save(p/'Texture_K06WallAtlasBase.png')
    ao=np.asarray(Image.open(p/'Texture_K06WallHighAo.png').convert('L'),dtype=np.float32)/255
    ao=0.68+0.32*ao
    luma=filled.mean(axis=2)/255
    rough=np.clip(0.90-0.10*luma,0.78,0.94)
    orm=np.stack((ao,rough,np.zeros_like(ao)),axis=2)
    Image.fromarray(np.uint8(orm*255),'RGB').save(p/'Texture_K06WallAtlasOrm.png')
    print('filled pixels',int(valid.sum()),'passes',iteration+1)



def Stage_prepare_bottom():
    """Fill unsampled weave-color gaps and pack geometry AO/estimated roughness."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    if IsFullWeaveStudy():p=p/'FullWeaveStudy'
    base=np.asarray(Image.open(p/'Texture_K06BottomHighBase.png').convert('RGB'),dtype=np.float32)
    # Unhit and almost-black bake texels are not albedo; contact darkness is kept
    # only in the AO channel, with these holes filled from neighboring twig colors.
    valid=base.max(axis=2)>40
    filled=base.copy()
    for iteration in range(48):
        total=np.zeros_like(filled); count=np.zeros(valid.shape,dtype=np.float32)
        for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
            v=np.roll(valid,shift,axis=axis); c=np.roll(filled,shift,axis=axis)
            total+=c*v[:,:,None];count+=v
        new=(~valid)&(count>0)
        if not new.any():break
        filled[new]=total[new]/count[new,None]
        valid|=new
    color=Image.fromarray(np.uint8(np.clip(filled,0,255)),'RGB').convert('RGBA');color.putalpha(Image.open(p/'Texture_K06BottomCoverage.png').convert('L'));color.save(p/'Texture_K06BottomAtlasBase.png')
    ao=np.asarray(Image.open(p/'Texture_K06BottomHighAo.png').convert('L'),dtype=np.float32)/255
    ao=0.68+0.32*ao
    luma=filled.mean(axis=2)/255
    rough=np.asarray(Image.open(p/'Texture_K06BottomHighRoughness.png').convert('L'),dtype=np.float32)/255 if IsFullWeaveStudy() else np.clip(.90-.10*luma,.78,.94)
    orm=np.stack((ao,rough,np.zeros_like(ao)),axis=2)
    Image.fromarray(np.uint8(orm*255),'RGB').save(p/'Texture_K06BottomAtlasOrm.png')
    print('filled pixels',int(valid.sum()),'passes',iteration+1)



def Stage_prepare_bundle():
    """Fill unsampled weave-color gaps and pack geometry AO/estimated roughness."""
    from pathlib import Path
    from PIL import Image,ImageFilter
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    if IsFullWeaveStudy():p=p/'FullWeaveStudy'
    base=np.asarray(Image.open(p/'Texture_K06BundleHighBase.png').convert('RGB'),dtype=np.float32)
    valid=base.max(axis=2)>2
    filled=base.copy()
    for iteration in range(48):
        total=np.zeros_like(filled); count=np.zeros(valid.shape,dtype=np.float32)
        for axis,shift in ((0,1),(0,-1),(1,1),(1,-1)):
            v=np.roll(valid,shift,axis=axis); c=np.roll(filled,shift,axis=axis)
            total+=c*v[:,:,None];count+=v
        new=(~valid)&(count>0)
        if not new.any():break
        filled[new]=total[new]/count[new,None]
        valid|=new
    height,width=filled.shape[:2]
    wear=np.asarray(Image.open(p/'Texture_K06BundleWearMask.png').convert('L').resize((width,height)),dtype=np.float32)/255
    ao=np.asarray(Image.open(p/'Texture_K06BundleHighAo.png').convert('L'),dtype=np.float32)/255
    cavity=1-ao
    a=2*np.pi*np.arange(width,dtype=np.float32)[None,:]/width
    b=2*np.pi*(1-np.arange(height,dtype=np.float32)[:,None]/height)
    angle_distance=lambda x,y:np.arctan2(np.sin(x-y),np.cos(x-y))
    grip=(np.exp(-(angle_distance(a,0)/.25)**2)+np.exp(-(angle_distance(a,np.pi)/.25)**2))*np.exp(-(angle_distance(b,0)/1.0)**2)
    combined=np.clip(filled*(1-.055*grip[:,:,None])+wear[:,:,None]*np.array([18,15,10],dtype=np.float32),0,255)
    dust=.04*cavity[:,:,None];combined=combined*(1-dust)+np.array([110,105,90],dtype=np.float32)[None,None,:]*dust
    Image.fromarray(np.uint8(combined),'RGB').save(p/'Texture_K06BundleAtlasBase.png')
    ao=0.68+0.32*ao
    luma=filled.mean(axis=2)/255
    intrinsic_rough=np.asarray(Image.open(p/'Texture_K06BundleHighRoughness.png').convert('L'),dtype=np.float32)/255
    rough=np.clip(intrinsic_rough+.03*wear+.025*cavity-.10*grip,0.72,0.96)
    orm=np.stack((ao,rough,np.zeros_like(ao)),axis=2)
    Image.fromarray(np.uint8(orm*255),'RGB').save(p/'Texture_K06BundleAtlasOrm.png')
    print('filled pixels',int(valid.sum()),'passes',iteration+1,'geometry_wear_pixels',int((wear>.1).sum()))



def Stage_blend_center():
    """Match center UV island to surrounding physically baked lid at its edge."""
    from pathlib import Path
    from PIL import Image
    import numpy as np
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket\Materials')
    coords=(np.arange(512,dtype=np.float32)/511-.5)*.02
    x,y=np.meshgrid(coords,coords);radius=np.sqrt(x*x+y*y)
    w=np.clip((.009-radius)/.003,0,1);w=w*w*(3-2*w);w=w[:,:,None]
    for suffix,center,lid in [('Base','Texture_K06CenterAtlasBase.png','Texture_K06LidSurfaceAtlasBase.png'),('Orm','Texture_K06CenterAtlasOrm.png','Texture_K06LidSurfaceAtlasOrm.png'),('Normal','Texture_K06CenterHighNormal.png','Texture_K06LidSurfaceHighNormal.png')]:
     mode='RGBA' if suffix=='Base' else 'RGB'
     c=np.asarray(Image.open(p/center).convert(mode).resize((512,512)),dtype=np.float32)
     source=Image.open(p/lid).convert(mode);mid=source.width/2;half=source.width*.02/.5/2
     l=np.asarray(source.crop((round(mid-half),round(mid-half),round(mid+half),round(mid+half))).resize((512,512),Image.Resampling.BILINEAR),dtype=np.float32)
     if suffix=='Normal':
      a=c/127.5-1;b=l/127.5-1;mixed=a*w+b*(1-w);mixed/=np.maximum(np.linalg.norm(mixed,axis=2,keepdims=True),1e-6);result=np.clip(mixed*127.5+127.5,0,255)
     else:result=np.clip(c*w+l*(1-w),0,255)
     Image.fromarray(np.uint8(result),mode).save(p/f'Texture_K06CenterBlended{suffix}.png')
    print('CENTER seam blend 512x512')


def MakeWallStudyMaterial(folder,side):
    import bpy
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    material=bpy.data.materials.new('Wicker_Wall'+side+'HighAtlas');material.use_nodes=True;material.use_backface_culling=False
    n=material.node_tree.nodes;l=material.node_tree.links;bs=n.get('Principled BSDF')
    def texture(suffix,noncolor=False):
        image=bpy.data.images.load(str(folder/('Texture_K06Wall'+side+suffix+'.png')),check_existing=False)
        if noncolor:image.colorspace_settings.name='Non-Color'
        image.pack();node=n.new('ShaderNodeTexImage');node.image=image;node.extension='EXTEND';return node
    # Individual physical twigs are opaque. The open spaces are geometry gaps;
    # a projected coverage mask would cut false holes into the twig receivers.
    base=texture('AtlasBase');l.new(base.outputs['Color'],bs.inputs['Base Color'])
    normal=texture('AtlasNormal',True);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=1.0;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
    packed=texture('AtlasOrm',True);sep=n.new('ShaderNodeSeparateColor');l.new(packed.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness'])
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output');ao=n.new('ShaderNodeGroup');ao.node_tree=group;l.new(sep.outputs['Red'],ao.inputs['Occlusion'])
    return material


def ApplyIntrinsicWeaveMaterials(scene,folder):
    if globals().get('K06_REFERENCE_MATERIALS'):folder=folder/'ReferenceIntrinsic'
    elif globals().get('K06_NORMALIZED_TEXTURES'):folder=folder/'RuntimeNormalized'
    import bpy,json,math
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
    def makeMaterial(kind):
        mat=bpy.data.materials.new('Wicker_'+kind+'Intrinsic');mat.use_nodes=True;mat.use_backface_culling=(kind=='Body');nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
        for channel in ('Base','Normal','Orm'):
            image=bpy.data.images.load(str(folder/(kind+'IntrinsicBaked')/('Texture_K06'+kind+'Intrinsic'+channel+'.webp')),check_existing=False)
            if channel!='Base':image.colorspace_settings.name='Non-Color'
            image.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT' if kind=='Body' else 'EXTEND'
            if channel=='Base':
                links.new(tex.outputs['Color'],bs.inputs['Base Color']);clip=nodes.new('ShaderNodeMath');clip.operation='ROUND';links.new(tex.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],bs.inputs['Alpha'])
            if channel=='Normal':
                normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
            if channel=='Orm':
                split=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],bs.inputs['Roughness']);ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;links.new(split.outputs['Red'],ao.inputs['Occlusion'])
        return mat
    lid=makeMaterial('Lid');body=makeMaterial('Body');floor=lid.copy();floor.name='Wicker_BasketFloorIntrinsic'
    preparation=json.loads((folder/'Data_IntrinsicAtlasPreparation.json').read_text(encoding='utf-8'));bandLow,bandHigh=preparation['Body']['sourceBandV'];seen=set()
    for obj in scene.objects:
        if obj.type!='MESH':continue
        bodySurface=obj.get('K06IntrinsicBody');lidSurface='LidWeave' in obj.name;floorSurface='WovenBottom' in obj.name
        if not (bodySurface or lidSurface or floorSurface):continue
        if obj.data in seen:continue
        seen.add(obj.data);obj.data.materials.clear();obj.data.materials.append(body if bodySurface else floor if floorSurface else lid)
        for poly in obj.data.polygons:
            poly.material_index=0
            for loop in poly.loop_indices:
                uv=obj.data.uv_layers.active.data[loop].uv.copy();v=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                if bodySurface:
                    t=(uv.y*.18-.005)/(.1698-.005);a=2*math.pi*uv.x
                    warpedT=t+(.018*math.sin(3*a+t*math.pi)+.008*math.sin(7*a+t*6))*math.sin(math.pi*t)
                    warpedU=uv.x+.0017*math.sin(4*a+t*4.5)*math.sin(math.pi*t)
                    obj.data.uv_layers.active.data[loop].uv=(warpedU*preparation['Body'].get('bodyUvURepeat',6),bandLow+(bandHigh-bandLow)*warpedT)
                else:obj.data.uv_layers.active.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)


def ApplyWickerAtlases(scene,folder):
    if globals().get('K06_INTRINSIC_WEAVE'):return ApplyIntrinsicWeaveMaterials(scene,folder)
    import bpy,math
    objectsBefore=set(scene.objects)
    fullStudy=any(o.type=='MESH' and 'WallOuterWoven' in o.name for o in scene.objects)
    studyFolder=folder/'FullWeaveStudy'
    bundleFolder=studyFolder if fullStudy else folder
    bottomFolder=studyFolder if fullStudy else folder
    m=bpy.data.materials.new('Wicker_LidHighAtlas');m.use_nodes=True;n=m.node_tree.nodes;links=m.node_tree.links;bs=n.get('Principled BSDF')
    def image(name,noncolor=False):
        im=bpy.data.images.load(str(folder/name),check_existing=False)
        if noncolor:im.colorspace_settings.name='Non-Color'
        im.pack();node=n.new('ShaderNodeTexImage');node.image=im;node.extension='EXTEND';return node
    base=image('Texture_K06LidSurfaceAtlasBase.png');links.new(base.outputs['Color'],bs.inputs['Base Color'])
    clip=n.new('ShaderNodeMath');clip.operation='ROUND';links.new(base.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],bs.inputs['Alpha'])
    normal=image('Texture_K06LidSurfaceHighNormal.png',True);nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=1.5;links.new(normal.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    orm=image('Texture_K06LidSurfaceAtlasOrm.png',True);sep=n.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness'])
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
    ao=n.new('ShaderNodeGroup');ao.node_tree=group;links.new(sep.outputs['Red'],ao.inputs['Occlusion'])
    inner=m.copy();inner.name='Wicker_LidInnerHighAtlas';inner.use_backface_culling=False
    for node in inner.node_tree.nodes:
        if node.type!='TEX_IMAGE' or not node.image:continue
        old=node.image.name
        replacement='Texture_K06LidInnerAtlasBase.png' if old.startswith('Texture_K06LidSurfaceAtlasBase') else 'Texture_K06LidInnerHighNormal.png' if old.startswith('Texture_K06LidSurfaceHighNormal') else 'Texture_K06LidInnerAtlasOrm.png' if old.startswith('Texture_K06LidSurfaceAtlasOrm') else None
        if replacement:
            im=bpy.data.images.load(str(folder/replacement),check_existing=False)
            if 'Base' not in replacement:im.colorspace_settings.name='Non-Color'
            im.pack();node.image=im
    center=bpy.data.materials.new('Wicker_CenterHighAtlas');center.use_nodes=True
    cn=center.node_tree.nodes;cl=center.node_tree.links;cbs=cn.get('Principled BSDF')
    def center_image(name,noncolor=False):
        im=bpy.data.images.load(str(folder/name),check_existing=False)
        if noncolor:im.colorspace_settings.name='Non-Color'
        im.pack();node=cn.new('ShaderNodeTexImage');node.image=im;node.extension='EXTEND';return node
    cbase=center_image('Texture_K06CenterBlendedBase.png');cl.new(cbase.outputs['Color'],cbs.inputs['Base Color'])
    cclip=cn.new('ShaderNodeMath');cclip.operation='ROUND';cl.new(cbase.outputs['Alpha'],cclip.inputs[0]);cl.new(cclip.outputs[0],cbs.inputs['Alpha'])
    cnormal=center_image('Texture_K06CenterBlendedNormal.png',True);cnm=cn.new('ShaderNodeNormalMap');cnm.inputs['Strength'].default_value=1.5;cl.new(cnormal.outputs['Color'],cnm.inputs['Color']);cl.new(cnm.outputs['Normal'],cbs.inputs['Normal'])
    corm=center_image('Texture_K06CenterBlendedOrm.png',True);csep=cn.new('ShaderNodeSeparateColor');cl.new(corm.outputs['Color'],csep.inputs['Color']);cl.new(csep.outputs['Green'],cbs.inputs['Roughness'])
    cao=cn.new('ShaderNodeGroup');cao.node_tree=group;cl.new(csep.outputs['Red'],cao.inputs['Occlusion'])
    bottom=bpy.data.materials.new('Wicker_BottomHighAtlas');bottom.use_nodes=True
    dn=bottom.node_tree.nodes;dl=bottom.node_tree.links;dbs=dn.get('Principled BSDF')
    def bottom_image(name,noncolor=False):
        im=bpy.data.images.load(str(bottomFolder/name),check_existing=False)
        if noncolor:im.colorspace_settings.name='Non-Color'
        im.pack();node=dn.new('ShaderNodeTexImage');node.image=im;node.extension='EXTEND';return node
    dbase=bottom_image('Texture_K06BottomAtlasBase.png');dl.new(dbase.outputs['Color'],dbs.inputs['Base Color'])
    dclip=dn.new('ShaderNodeMath');dclip.operation='ROUND';dl.new(dbase.outputs['Alpha'],dclip.inputs[0]);dl.new(dclip.outputs[0],dbs.inputs['Alpha'])
    dnormal=bottom_image('Texture_K06BottomHighNormal.png',True);dnm=dn.new('ShaderNodeNormalMap');dnm.inputs['Strength'].default_value=.5;dl.new(dnormal.outputs['Color'],dnm.inputs['Color']);dl.new(dnm.outputs['Normal'],dbs.inputs['Normal'])
    dorm=bottom_image('Texture_K06BottomAtlasOrm.png',True);dsep=dn.new('ShaderNodeSeparateColor');dl.new(dorm.outputs['Color'],dsep.inputs['Color']);dl.new(dsep.outputs['Green'],dbs.inputs['Roughness'])
    dao=dn.new('ShaderNodeGroup');dao.node_tree=group;dl.new(dsep.outputs['Red'],dao.inputs['Occlusion'])
    wall=bpy.data.materials.new('Wicker_WallHighAtlas');wall.use_nodes=True
    wn=wall.node_tree.nodes;wl=wall.node_tree.links;wbs=wn.get('Principled BSDF')
    def wall_image(name,noncolor=False):
        im=bpy.data.images.load(str(folder/name),check_existing=False)
        if noncolor:im.colorspace_settings.name='Non-Color'
        im.pack();node=wn.new('ShaderNodeTexImage');node.image=im;node.extension='REPEAT';return node
    wbase=wall_image('Texture_K06WallAtlasBase.png');wl.new(wbase.outputs['Color'],wbs.inputs['Base Color'])
    wclip=wn.new('ShaderNodeMath');wclip.operation='ROUND';wl.new(wbase.outputs['Alpha'],wclip.inputs[0]);wl.new(wclip.outputs[0],wbs.inputs['Alpha'])
    wnormal=wall_image('Texture_K06WallHighNormal.png',True);wnm=wn.new('ShaderNodeNormalMap');wnm.inputs['Strength'].default_value=.5;wl.new(wnormal.outputs['Color'],wnm.inputs['Color']);wl.new(wnm.outputs['Normal'],wbs.inputs['Normal'])
    worm=wall_image('Texture_K06WallAtlasOrm.png',True);wsep=wn.new('ShaderNodeSeparateColor');wl.new(worm.outputs['Color'],wsep.inputs['Color']);wl.new(wsep.outputs['Green'],wbs.inputs['Roughness'])
    wao=wn.new('ShaderNodeGroup');wao.node_tree=group;wl.new(wsep.outputs['Red'],wao.inputs['Occlusion'])
    bundle=bpy.data.materials.new('Wicker_BundleHighAtlas');bundle.use_nodes=True
    bn=bundle.node_tree.nodes;bl=bundle.node_tree.links;bbs=bn.get('Principled BSDF')
    def bundle_image(name,noncolor=False):
        im=bpy.data.images.load(str(bundleFolder/name),check_existing=False)
        if noncolor:im.colorspace_settings.name='Non-Color'
        im.pack();node=bn.new('ShaderNodeTexImage');node.image=im;node.extension='REPEAT';return node
    batlas=bn.new('ShaderNodeUVMap');batlas.uv_map='UVMap'
    bbase=bundle_image('Texture_K06BundleAtlasBase.png');bl.new(batlas.outputs['UV'],bbase.inputs['Vector']);bl.new(bbase.outputs['Color'],bbs.inputs['Base Color'])
    bnormal=bundle_image('Texture_K06BundleHighNormal.png',True);bl.new(batlas.outputs['UV'],bnormal.inputs['Vector']);bnm=bn.new('ShaderNodeNormalMap');bnm.inputs['Strength'].default_value=1.0;bl.new(bnormal.outputs['Color'],bnm.inputs['Color']);bl.new(bnm.outputs['Normal'],bbs.inputs['Normal'])
    borm=bundle_image('Texture_K06BundleAtlasOrm.png',True);bl.new(batlas.outputs['UV'],borm.inputs['Vector']);bsep=bn.new('ShaderNodeSeparateColor');bl.new(borm.outputs['Color'],bsep.inputs['Color']);bl.new(bsep.outputs['Green'],bbs.inputs['Roughness'])
    bao=bn.new('ShaderNodeGroup');bao.node_tree=group;bl.new(bsep.outputs['Red'],bao.inputs['Occlusion'])
    wallStudyMaterials={side:MakeWallStudyMaterial(studyFolder,side) for side in ('Outer','Inner')} if fullStudy else {}
    for o in scene.objects:
     if o.type=='MESH' and 'LidWeave' in o.name and not o.get('K06LidInner'):
      o.data.materials.clear();o.data.materials.append(m);o.data.materials.append(center)
      for poly in o.data.polygons:
       points=[o.data.vertices[o.data.loops[i].vertex_index].co for i in poly.loop_indices]
       knot=all(v.x*v.x+v.y*v.y < .010**2 for v in points)
       poly.material_index=1 if knot else 0
       for loop in poly.loop_indices:
        v=o.data.vertices[o.data.loops[loop].vertex_index].co
        o.data.uv_layers.active.data[loop].uv=(.5+v.x/.02,.5+v.y/.02) if knot else (.5+v.x/.5,.5+v.y/.5)
     if o.type=='MESH' and o.get('K06LidInner'):
      o.data.materials.clear();o.data.materials.append(inner)
      for poly in o.data.polygons:
       poly.material_index=0
       for loop in poly.loop_indices:
        v=o.data.vertices[o.data.loops[loop].vertex_index].co;o.data.uv_layers.active.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
     if o.type=='MESH' and 'WallWoven' in o.name:
      o.data.materials.clear();o.data.materials.append(wall)
      for poly in o.data.polygons:
       poly.material_index=0
       points=[o.data.vertices[o.data.loops[i].vertex_index].co for i in poly.loop_indices]
       angles=[(math.atan2(v.y,v.x)+2*math.pi)%(2*math.pi) for v in points]
       wrap=max(angles)-min(angles)>math.pi
       for loop,v,a in zip(poly.loop_indices,points,angles):
        if wrap and a<math.pi:a+=2*math.pi
        o.data.uv_layers.active.data[loop].uv=(a/(2*math.pi),v.z/.180)
     if o.type=='MESH' and ('WallOuterWoven' in o.name or 'WallInnerWoven' in o.name) and not o.get('K06DeepProjection'):
      side='Inner' if 'WallInnerWoven' in o.name else 'Outer'
      o.data.materials.clear();o.data.materials.append(wallStudyMaterials[side])
      for poly in o.data.polygons:
       poly.material_index=0
     if o.type=='MESH' and 'WovenBottom' in o.name:
      o.data.materials.clear();o.data.materials.append(bottom)
      for poly in o.data.polygons:
       poly.material_index=0
       for loop in poly.loop_indices:
        v=o.data.vertices[o.data.loops[loop].vertex_index].co
        o.data.uv_layers.active.data[loop].uv=(.5+v.x/.5,.5+v.y/.5)
     if o.type=='MESH' and 'LidRimBundle' in o.name and not fullStudy:
      o.data.uv_layers.active.name='UVMap'
      o.data.materials.clear();o.data.materials.append(bundle)
      atlas_uv=o.data.uv_layers.active
      for poly in o.data.polygons:
       poly.material_index=0;points=[o.data.vertices[o.data.loops[i].vertex_index].co for i in poly.loop_indices]
       angles=[(math.atan2(v.y,v.x)+2*math.pi)%(2*math.pi) for v in points]
       phis=[]
       for v,a in zip(points,angles):
        cr,cz,_=BundleSpec(a)
        phis.append((math.atan2(v.z-cz,math.hypot(v.x,v.y)-cr)+2*math.pi)%(2*math.pi))
       wa=max(angles)-min(angles)>math.pi;wp=max(phis)-min(phis)>math.pi
       for loop,a,b in zip(poly.loop_indices,angles,phis):
        if wa and a<math.pi:a+=2*math.pi
        if wp and b<math.pi:b+=2*math.pi
        atlas_uv.data[loop].uv=(a/(2*math.pi),b/(2*math.pi))
    assert set(scene.objects)==objectsBefore, 'Atlas assignment must not add scene objects'


def Stage_assemble_pilot():
    import bpy,math,hashlib,shutil,datetime
    from pathlib import Path
    p=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket');folder=p/'Materials'
    import json
    baseline_metadata=globals().get('K06_BASELINE_METADATA')
    if baseline_metadata:
        baseline=json.loads(Path(baseline_metadata).read_text(encoding='utf-8'))
        source=Path(baseline['sourceGlb']);source_recipe=baseline['sourceBuildRecipe']
    else:
        source=p/'K06_PancakeBasket.glb';source_recipe=json.loads((p/'Data_SourceModelCurrent.json').read_text(encoding='utf-8'))
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    assert source_recipe['glbSha256']==source_hash
    assert hashlib.sha256(Path(source_recipe['buildScript']['path']).read_bytes()).hexdigest()==source_recipe['buildScript']['sha256']
    assembly_script=SnapshotBuildScript(p)
    source_snapshot=p/'Refinement'/('K06_Source_'+source_hash[:16]+'.glb')
    if not source_snapshot.exists():shutil.copy2(source,source_snapshot)
    assert hashlib.sha256(source_snapshot.read_bytes()).hexdigest()==source_hash
    token=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out=p/'Refinement'/('K06_LidPilot_Isolated_'+token+'.glb');assert not out.exists()
    scene=bpy.context.scene
    assert bpy.context.window and bpy.context.window.scene is scene, 'Active window and context scene differ'
    assert len(bpy.data.scenes)==1, 'Start a fresh task-only Blender instance for pilot assembly'
    assert all(o.name in {'Cube','Camera','Light'} for o in scene.objects), 'Pilot assembly requires a fresh startup scene'
    for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
    scene.name='K06_PilotAssembly'
    assert bpy.context.window.scene is scene and bpy.context.scene is scene and not list(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(source_snapshot))
    imported=set(scene.objects)
    assert imported and all(o.type in {'MESH','EMPTY'} for o in imported)
    roots=[o.name for o in imported if o.parent is None]
    assert len(roots)==2 and any(n.startswith('PancakeBasket_Intact') for n in roots) and any(n.startswith('PancakeBasket_Opened') for n in roots), roots
    assert not any(o.type=='MESH' and ('High' in o.name or 'Proxy' in o.name) for o in imported)
    if not source_recipe.get('atlasApplied',False):ApplyWickerAtlases(scene,folder)
    assert set(scene.objects)==imported, 'Unexpected object in pilot export scene'
    bpy.ops.object.select_all(action='DESELECT')
    for o in imported:o.select_set(True,view_layer=bpy.context.view_layer)
    assert set(bpy.context.selected_objects)==imported, 'Unexpected selected object in active export view layer'
    print('PILOT_SCENE',scene.name,'before_meshes',0,'imported',len(imported),'selected',len(bpy.context.selected_objects),'roots',roots)
    assert bpy.context.window.scene is scene and bpy.context.scene is scene, 'Active scene mismatch before export'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True)
    FinalizeGlbTangents(out)
    import json,struct
    data=out.read_bytes(); n=struct.unpack_from('<I',data,12)[0]; doc=json.loads(data[20:20+n])
    def audit_glb(d):
        scene_doc=d['scenes'][d.get('scene',0)]; nodes=d['nodes']; result={}; visited=set()
        def visit(i):
            assert i not in visited, ('node referenced twice',i); visited.add(i); node=nodes[i]; count=0
            if 'mesh' in node:
                mesh=d['meshes'][node['mesh']]; assert 'High' not in mesh.get('name','') and 'Proxy' not in mesh.get('name',''),mesh.get('name')
                count=sum(d['accessors'][p['indices']]['count']//3 for p in mesh['primitives'] if 'indices' in p)
            return count+sum(visit(child) for child in node.get('children',[]))
        for i in scene_doc['nodes']:
            name=nodes[i].get('name',''); assert name in ('PancakeBasket_Intact','PancakeBasket_Opened'),name; result[name]=visit(i)
        assert set(result)=={'PancakeBasket_Intact','PancakeBasket_Opened'} and all(n<=3000 for n in result.values()),result
        return result
    source_bytes=source_snapshot.read_bytes(); sn=struct.unpack_from('<I',source_bytes,12)[0]; source_doc=json.loads(source_bytes[20:20+sn])
    actual=audit_glb(doc);expected=audit_glb(source_doc);assert actual==expected,(actual,expected)
    metadata={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scene':scene.name,'beforeObjects':0,'beforeMeshes':0,'importedObjects':[{'name':o.name,'type':o.type,'pointer':o.as_pointer(),'parent':o.parent.name if o.parent else None} for o in imported],'selectedCount':len(bpy.context.selected_objects),'roots':roots,'helpers':[],'sourceGlb':str(source_snapshot),'sourceGlbSha256':source_hash,'sourceBuildRecipe':source_recipe,'assemblyScript':assembly_script,'isolatedGlb':str(out),'isolatedGlbSha256':hashlib.sha256(data).hexdigest(),'instances':actual}
    out.with_suffix('.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PILOT_VERIFIED',out,'source_snapshot',source_snapshot,'source_sha256',source_hash,'instances',actual,'reachable_meshes',len(doc.get('meshes',[])))



def Stage_model():
    """K06: C-inspired mended wicker pancake basket; run in Blender via BlenderMcp.

    Dimensions are metres. Blender Z-up/+Y-front exports as glTF Y-up/-Z-front.
    Each root is a separately selectable state; the lid remains a separate mesh.
    The chosen image is an appearance reference, not archaeological evidence.

    Default material sources are the C-derived bark, lid and wall images.
    Their exact prompts, original files, hashes and inferred physical spans are
    recorded under Materials/Data_*Source.json and Data_IntrinsicAtlasPreparation.
    Generated color is de-lighted approximately; normals are inferred from an
    image-derived relief guide. This is an authoring reconstruction, not a
    photometric scan or a claim of historical construction accuracy.
    """
    import bpy
    import math
    import random
    from pathlib import Path
    from mathutils import Vector

    random.seed(1938)
    OUT = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket')
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'Acceptance').mkdir(exist_ok=True)
    scene=bpy.context.scene
    assert bpy.context.window and bpy.context.window.scene is scene, 'Active window and context scene differ'
    assert len(bpy.data.scenes)==1, 'Run model stage in a fresh task-only Blender instance'
    assert not any('High' in o.name or 'Proxy' in o.name for o in scene.objects), 'High model present; start a clean instance'
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    assert not list(scene.objects), 'Model build scene must start empty'
    for data in list(bpy.data.meshes):
        if data.users == 0:
            bpy.data.meshes.remove(data)
    for data in list(bpy.data.materials):
        bpy.data.materials.remove(data)
    for data in list(bpy.data.images):
        if data.name.startswith(('Wicker_', 'Pancake_', 'K06_C', 'Texture_K06AgedWillow')):
            bpy.data.images.remove(data)
    bpy.context.scene.unit_settings.system = 'METRIC'

    def material(name, color, roughness=0.9, food=False):
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = roughness
        # Packed repeatable fine fiber / meal variation; crossings remain real geometry.
        width, height = 256, 64
        img = bpy.data.images.new(name + '_Surface', width=width, height=height, alpha=True)
        rng = random.Random(name)
        fibers = [rng.uniform(-0.13,0.13) for _ in range(height)]
        pixels = []
        for y in range(height):
            for x in range(width):
                if food:
                    factor = 0.86 + rng.random()*0.22
                    if rng.random() < 0.045: factor *= 0.58
                else:
                    # Three fine twig ridges per modeled band, with uneven edges and longitudinal fibers.
                    phase = (y / (height-1) * 4 + 0.035*math.sin(x*0.11+y*0.08)) % 1
                    edge = abs(phase*2-1)
                    factor = (0.62 + 0.38*math.sqrt(max(0,1-edge*edge)))
                    factor *= 1 + fibers[y] + 0.08*math.sin(x*0.07+y*0.4) + rng.uniform(-0.06,0.06)
                pixels.extend((min(1,max(0,color[0]*factor))**(1/2.2),min(1,max(0,color[1]*factor))**(1/2.2),min(1,max(0,color[2]*factor))**(1/2.2),1))
        img.pixels.foreach_set(pixels)
        img.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image=img
        m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        if not food:
            normal_img=bpy.data.images.get('Wicker_RoundedNormal')
            if normal_img is None:
                normal_img=bpy.data.images.new('Wicker_RoundedNormal',width=64,height=64,alpha=True)
                normal_img.colorspace_settings.name='Non-Color'
                normal_pixels=[]
                for y in range(64):
                    across=((y/63*4)%1)*2-1
                    ny=across*0.65
                    nz=math.sqrt(1-ny*ny)
                    for x in range(64): normal_pixels.extend((0.5,0.5+ny*0.5,0.5+nz*0.5,1))
                normal_img.pixels.foreach_set(normal_pixels)
                normal_img.pack()
            nt=m.node_tree.nodes.new('ShaderNodeTexImage'); nt.image=normal_img
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=0.6
            m.node_tree.links.new(nt.outputs['Color'],normal.inputs['Color'])
            m.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
        return m

    wicker = [material('Wicker_Aged', (0.19, 0.135, 0.085)),
              material('Wicker_Worn', (0.29, 0.215, 0.14)),
              material('Wicker_Dark', (0.115, 0.085, 0.058)),
              material('Wicker_Repair', (0.36, 0.28, 0.19))]
    pancake = [material('Pancake_Sorghum', (0.52, 0.34, 0.17), food=True),
               material('Pancake_Edge', (0.35, 0.21, 0.095), food=True)]

    # These maps are baked from the task's local, flat material source with the
    # repository PBR baker. They are packed into the .blend and exported GLB.
    def dense_round_material():
        folder=OUT/'Materials'
        def load(channel, noncolor=False):
            img=bpy.data.images.load(str(folder/('Texture_K06AgedWillow'+channel+'.webp')),check_existing=False)
            if noncolor: img.colorspace_settings.name='Non-Color'
            img.pack()
            return img
        color_img=bpy.data.images.load(str(folder/'Texture_K06WillowMatchedBase.webp'),check_existing=False)
        color_img.pack()
        normal_img=bpy.data.images.load(str(folder/'Texture_K06WillowCombinedNormal.png'),check_existing=False)
        normal_img.colorspace_settings.name='Non-Color';normal_img.pack()
        rough_img=load('Orm',True)
        ao_img=bpy.data.images.load(str(folder/'Texture_K06WillowContactAo.png'),check_existing=False)
        ao_img.colorspace_settings.name='Non-Color';ao_img.pack()
        m=bpy.data.materials.new('Wicker_DenseRound'); m.use_nodes=True
        bsdf=m.node_tree.nodes.get('Principled BSDF')
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=color_img
        m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=rough_img
        separate=m.node_tree.nodes.new('ShaderNodeSeparateColor')
        m.node_tree.links.new(tex.outputs['Color'],separate.inputs['Color'])
        m.node_tree.links.new(separate.outputs['Green'],bsdf.inputs['Roughness'])
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=normal_img
        normal=m.node_tree.nodes.new('ShaderNodeNormalMap')
        m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
        m.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
        output=m.node_tree.nodes.new('ShaderNodeGroup');output.node_tree=group
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=ao_img
        m.node_tree.links.new(tex.outputs['Color'],output.inputs['Occlusion'])
        return m

    lid_reference=wicker[0] if IsFullWeaveStudy() else dense_round_material()
    wicker[0]=lid_reference
    def rim_twig_material():
        mat=bpy.data.materials.new('Wicker_RimTwig');mat.use_nodes=True
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
        materialFolder=OUT/'Materials'/('RuntimeNormalized' if globals().get('K06_NORMALIZED_TEXTURES') else '')
        def tex(channel,noncolor=False):
            fileName='Texture_K06RimAuthoredBase.webp' if channel=='Base' else 'Texture_K06RimNative'+channel+'.webp'
            img=bpy.data.images.load(str(materialFolder/fileName),check_existing=False)
            if noncolor:img.colorspace_settings.name='Non-Color'
            img.pack();n=nodes.new('ShaderNodeTexImage');n.image=img;return n
        base=tex('Base');links.new(base.outputs['Color'],bs.inputs['Base Color'])
        norm=tex('Normal',True);nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.7;links.new(norm.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
        orm=tex('Orm',True);split=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],bs.inputs['Roughness'])
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output');ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;links.new(split.outputs['Red'],ao.inputs['Occlusion'])
        return mat
    rim_material=rim_twig_material()
    exposed_wood=rim_material.copy();exposed_wood.name='Wicker_ExposedWillow'
    exposed_bs=exposed_wood.node_tree.nodes.get('Principled BSDF')
    for link in list(exposed_bs.inputs['Base Color'].links):exposed_wood.node_tree.links.remove(link)
    exposed_bs.inputs['Base Color'].default_value=(.36,.31,.25,1)

    def food_material():
        folder=OUT/'Materials'
        prefix='PancakeSorghumFine'
        if IsFullWeaveStudy():
            folder=folder/'K07PressedInput_c0e53ad3'/'MaterialSources'/'BakedPressed';prefix='PancakeSorghumPressed'
        m=bpy.data.materials.new('Pancake_SorghumPBR');m.use_nodes=True
        nodes=m.node_tree.nodes;links=m.node_tree.links;bsdf=nodes.get('Principled BSDF')
        def load(channel, data=False):
            image=bpy.data.images.load(str(folder/('Texture_'+prefix+channel+'.webp')),check_existing=False)
            if data:image.colorspace_settings.name='Non-Color'
            image.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=image;return tex
        base=load('Base');links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
        normal=load('Normal',True);nm=nodes.new('ShaderNodeNormalMap');links.new(normal.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
        orm=load('Orm',True);separate=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],bsdf.inputs['Roughness'])
        return m
    pancake[0]=food_material()
    pancake[1]=pancake[0].copy();pancake[1].name='Pancake_SorghumEdgePBR'

    def mesh(name, verts, faces, mats, indices=None, parent=None):
        data = bpy.data.meshes.new(name + '_Mesh')
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        for mat in mats:
            data.materials.append(mat)
        if indices:
            for poly, index in zip(data.polygons, indices):
                poly.material_index = index
        uv=data.uv_layers.new(name='FiberUV')
        for poly in data.polygons:
            angles=[math.atan2(data.vertices[data.loops[i].vertex_index].co.y,data.vertices[data.loops[i].vertex_index].co.x) for i in poly.loop_indices]
            crosses_seam=max(angles)-min(angles)>math.pi
            for n, loop_index in enumerate(poly.loop_indices):
                if name.endswith('FoldedPancakes'):
                    v=data.vertices[data.loops[loop_index].vertex_index].co
                    if len(poly.vertices)>4:
                        uv.data[loop_index].uv=((v.x+0.13)/0.26,(v.y+0.055)/0.11)
                    else:
                        uv.data[loop_index].uv=((0,0),(1,0),(1,1),(0,1))[n%4]
                else:
                    coord=((0,0),(1,0),(1,1),(0,1))[n%4]
                    if name.endswith('WallWoven'):
                        v=data.vertices[data.loops[loop_index].vertex_index].co
                        a=angles[n]+(2*math.pi if crosses_seam and angles[n]<0 else 0)
                        coord=(a*0.236/0.18,v.z/0.18)
                    uv.data[loop_index].uv=coord
        return obj

    def root(name):
        o = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(o)
        return o

    def wall(parent, prefix):
        if IsFullWeaveStudy():return CreateBodySkinMeshes(parent,prefix,wicker[0],mesh)
        verts, faces, indices = [], [], []
        n = 24
        def strand_z(row,a):
            return 0.010+row*(.157/11)+.0026*(1+math.sin(a))*(1-row/11)+0.0012*math.sin(2*a+row*0.25)+0.00045*math.sin(5*a+row*0.17)
        # Narrow horizontal willow ribbons bend in and out over vertical stakes.
        for row in range(12):
            base = len(verts)
            for j in range(n):
                a = 2 * math.pi * j / n
                z = strand_z(row,a)
                irregular=0.0009*math.sin(5*a+7*z)*math.cos(2*a+19*z)
                radius = 0.230 + 0.012 * z / 0.17 - 0.0035*math.exp(-z/0.012) + irregular + 0.0014*math.cos(4*a+row*math.pi)
                for dz in (-0.0066, 0.0066):
                    verts.append((radius * math.cos(a), radius * math.sin(a), z + dz))
            for j in range(n):
                k = (j + 1) % n
                faces.append((base+2*j, base+2*k, base+2*k+1, base+2*j+1))
                indices.append(0)
        # Upright stakes pass alternately in front of and behind horizontal courses.
        for j in range(8):
            a = 2 * math.pi * j / 8
            base = len(verts)
            for k in range(12):
                center=strand_z(k,a)
                for end in (-.0066,.0066):
                    z=center+end
                    irregular=0.0009*math.sin(5*a+7*z)*math.cos(2*a+19*z)
                    rad = 0.230 + 0.012 * z / 0.17 - 0.0035*math.exp(-z/0.012) + irregular - .00030 - 0.0014 * (-1 if (j + k) % 2 else 1)
                    for da in (-0.010, 0.010):
                        verts.append((rad*math.cos(a+da), rad*math.sin(a+da), z))
            for k in range(23):
                faces.append((base+2*k, base+2*k+1, base+2*k+3, base+2*k+2))
                indices.append(0)
        return mesh(prefix+'_WallWoven', verts, faces, wicker, indices, parent)

    def ring(parent, name, radius, z, thickness=0.0045, sides=3, segments=16, matindex=1, braid=0):
        verts, faces = [], []
        for j in range(segments):
            a = j * 2 * math.pi / segments
            for k in range(sides):
                b = k * 2 * math.pi / sides
                local_thickness=thickness*(.86+.11*math.sin(5*a+z*17)+.06*math.sin(13*a+z*29))
                r = radius + local_thickness * math.cos(b) + 0.0008*math.sin(3*a+z*83)+0.0003*math.sin(7*a)
                h=z + local_thickness*math.sin(b)+0.00055*math.sin(5*a+z*31)
                if braid:
                    phase=5*a+1.3*math.sin(2*a)+0.35*math.sin(5*a)
                    r+=braid*0.0015*math.sin(phase)
                    h+=braid*(0.0035+0.0012*math.sin(3*a))*math.cos(phase)
                verts.append((r * math.cos(a), r * math.sin(a),h))
        for j in range(segments):
            for k in range(sides):
                nj = (j+1) % segments
                nk = (k+1) % sides
                faces.append((j*sides+k, nj*sides+k, nj*sides+nk, j*sides+nk))
        obj=mesh(name, verts, faces, [rim_material], [0]*len(faces), parent)
        for poly in obj.data.polygons:
            poly.use_smooth=True
            j,k=divmod(poly.index,sides)
            u0=j/segments*(2*math.pi*radius/.08)
            u1=(j+1)/segments*(2*math.pi*radius/.08)
            v0=k/sides*2*math.pi*thickness/.08;v1=(k+1)/sides*2*math.pi*thickness/.08
            for loop_index,uv in zip(poly.loop_indices,((u0,v0),(u1,v0),(u1,v1),(u0,v1))):
                obj.data.uv_layers.active.data[loop_index].uv=uv
        return obj

    def woven_disc(parent, name, radius, z, cover=False):
        verts, faces, ids = [], [], []
        if cover and IsFullWeaveStudy():
            if globals().get('K06_INTRINSIC_WEAVE'):return CreateAdaptiveLid(parent,name,wicker,mesh)
            verts,faces=LidSurfaceGeometry(z)
            return mesh(name,verts,faces,wicker,[0]*len(faces),parent)
        if not cover and IsFullWeaveStudy():
            verts=[(radius*math.cos(2*math.pi*j/16),radius*math.sin(2*math.pi*j/16),z+.00045*math.sin(6*math.pi*j/16)) for j in range(16)]+[(0,0,z)]
            faces=[(16,j,(j+1)%16) for j in range(16)]
            return mesh(name,verts,faces,wicker,[0]*len(faces),parent)
        discSegments=16 if IsFullWeaveStudy() and not cover else (24 if IsFullWeaveStudy() else 32)
        if not cover:
            for row in range(1 if IsFullWeaveStudy() else 2):
                base=len(verts)
                for j in range(discSegments):
                    a=2*math.pi*j/discSegments
                    for rr in ((.004,.225) if IsFullWeaveStudy() else (.004+row*.110,.004+(row+1)*.110)):
                        verts.append((rr*math.cos(a),rr*math.sin(a),z+.00045*math.sin(3*a)*rr/.224))
                for j in range(discSegments):
                    k=(j+1)%discSegments;faces.append((base+2*j+1,base+2*k+1,base+2*k,base+2*j));ids.append(0)
            base=len(verts)
            for j in range(8):
                a=2*math.pi*j/8;verts.append((.004*math.cos(a),.004*math.sin(a),z+.00045*math.sin(3*a)*.004/.224))
            verts.append((0,0,z))
            for j in range(8):faces.append((base+8,base+j,base+(j+1)%8));ids.append(0)
            return mesh(name,verts,faces,wicker,ids,parent)
        if cover:
            # Concentric willow courses cross radial ribs, following the chosen C image.
            for row in range(3):
                rad = .00795+(row+.5)*(.230-.00795)/3
                base = len(verts)
                for j in range(discSegments):
                    a=2*math.pi*j/discSegments
                    inner_edge=.00795+row*(.230-.00795)/3+.0003*math.sin(7*a+row*.65)
                    outer_edge=.00795+(row+1)*(.230-.00795)/3+.0003*math.sin(7*a+(row+1)*.65)
                    if row==2:outer_edge=(.2325 if IsFullWeaveStudy() else BundleSurface(a,2*math.pi*3/10)[0]-.00030)
                    for rr in (inner_edge,outer_edge):
                        h=z+.0015*(1-(rr/.23)**2)+.00045*math.sin(3*a)*(rr/.23)
                        if row==2 and rr==outer_edge and not IsFullWeaveStudy():h=BundleSurface(a,2*math.pi*3/10)[1]+.00050
                        verts.append((rr*math.cos(a),rr*math.sin(a),h))
                for j in range(discSegments):
                    k=(j+1)%discSegments
                    faces.append((base+2*j+1,base+2*k+1,base+2*k,base+2*j))
                    ids.append(row%3)
            # The center shares its boundary and height with the first course.
            # The separate texture island samples the same continuous high weave.
            base=len(verts)
            for j in range(discSegments):
                a=2*math.pi*j/discSegments;rad=.00795+.0003*math.sin(7*a)
                verts.append((rad*math.cos(a),rad*math.sin(a),z+.0015*(1-(rad/.23)**2)+.00045*math.sin(3*a)*(rad/.23)))
            verts.append((0,0,z+.0015))
            for j in range(discSegments):faces.append((base+discSegments,base+j,base+(j+1)%discSegments));ids.append(1)
            return mesh(name, verts, faces, wicker, ids, parent)

    def repair(parent,name,radius,z):
        verts=[];faces=[]
        for index,a in enumerate((.36,3.34) if IsFullWeaveStudy() else (.36,1.74,3.34,5.70)):
            base=len(verts);width=.010+.0005*(index%2)
            points=((radius-.0065,z+.0070),(radius+.0070,z+.0070),(radius+.0070,z-.0064),(radius+.0065,z-.0064),(radius-.001,z-.0064)) if IsFullWeaveStudy() else ((radius-.004,z+.0043),(radius,z+.0045),(radius+.005,z),(radius+.0068,z-.0039),(radius+.0068,z-.0043))
            for k,(r,h) in enumerate(points):
                angle=a+.002*(k-2)
                for shift in (-width,width):verts.append((r*math.cos(angle+shift),r*math.sin(angle+shift),h))
            for k in range(4):faces.append((base+2*k,base+2*k+1,base+2*k+3,base+2*k+2))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly in obj.data.polygons:
            _,k=divmod(poly.index,4)
            for loop,co in zip(poly.loop_indices,((k/4,.24),(k/4,.30),((k+1)/4,.30),((k+1)/4,.24))):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def cross_stick(parent,name):
        verts=[];faces=[];segments=4;sides=4
        for i in range(segments+1):
            x=-.236+.472*i/segments
            cy=.0013*math.sin(7*x);cz=.1964+.0003*math.sin(11*x)
            for j in range(4):
                a=2*math.pi*j/4
                verts.append((x,cy+.00125*math.cos(a),cz+.00125*math.sin(a)))
        for i in range(segments):
            for j in range(sides):
                k=(j+1)%sides;faces.append((i*sides+k,(i+1)*sides+k,(i+1)*sides+j,i*sides+j))
        faces.extend(((3,2,1,0),(segments*sides,segments*sides+1,segments*sides+2,segments*sides+3)))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly in obj.data.polygons:
            if poly.index>=segments*sides:continue
            i,j=divmod(poly.index,sides);u0=i/segments*.94;u1=(i+1)/segments*.94
            coords=((u0,(j+1)/sides),(u1,(j+1)/sides),(u1,j/sides),(u0,j/sides))
            for loop,coord in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=coord
        return obj

    def reference_lid_spines(parent,name):
        verts=[];faces=[];uvfaces=[];xPositions=(-.227,-.150,0,.150,.227);segments=len(xPositions)-1;sides=3
        for strand in range(3):
            base=len(verts);radius=.00130
            for j in range(segments+1):
                x=xPositions[j];cy=(strand-1)*.00290+.00025*math.sin(x*13+strand);cz=LidSurfaceHeight(math.hypot(x,cy),angle=math.atan2(cy,x))+(-.0080 if globals().get('K06_CONTINUOUS_LID') else .0090 if globals().get('K06_ROUND_WEAVE_RUNTIME') else .0060 if globals().get('K06_ALIGNED_LID_GEOMETRY') else .0020)+.00015*math.cos(x*9+strand)
                for k in range(sides):
                    b=2*math.pi*k/sides;verts.append((x,cy+radius*math.cos(b),cz+radius*math.sin(b)))
            for j in range(segments):
                for k in range(sides):
                    nk=(k+1)%sides;faces.append((base+j*sides+nk,base+(j+1)*sides+nk,base+(j+1)*sides+k,base+j*sides+k))
                    u0=(xPositions[j]+.227)/.08;u1=(xPositions[j+1]+.227)/.08
                    uvfaces.append(((u0,(k+1)/sides*.0091/.08),(u1,(k+1)/sides*.0091/.08),(u1,k/sides*.0091/.08),(u0,k/sides*.0091/.08)))
            faces.extend((tuple(base+k for k in reversed(range(sides))),tuple(base+segments*sides+k for k in range(sides))))
            capUv=tuple((.11+.01*math.cos(2*math.pi*k/sides),.11+.01*math.sin(2*math.pi*k/sides)) for k in range(sides));uvfaces.extend((capUv,capUv))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def reference_outer_lid_wefts(parent,name):
        verts=[];faces=[];uvfaces=[];segments=32;sides=3;offsets=EllipseArcOffsets(sides,.82)
        for row in (27,28,29):
            base=len(verts);arcs=[0];centers=[];radii=[]
            for j in range(segments):
                a=2*math.pi*j/segments;r=LidRingRadius(row,a);z=LidSurfaceHeight(r,angle=a)+.0028+.00015*math.sin(3*a+row*.3)
                center=(r*math.cos(a),r*math.sin(a),z);centers.append(center);radius=.0020*(1+.10*math.sin(5*a+row));radii.append(radius)
                if j:arcs.append(arcs[-1]+math.dist(centers[-1],centers[-2]))
                for k in range(sides):
                    b=2*math.pi*k/sides;rr=r+radius*math.cos(b);verts.append((rr*math.cos(a),rr*math.sin(a),z+radius*.82*math.sin(b)))
            arcs.append(arcs[-1]+math.dist(centers[-1],centers[0]))
            for j in range(segments):
                nj=(j+1)%segments
                for k in range(sides):
                    nk=(k+1)%sides;faces.append((base+j*sides+k,base+nj*sides+k,base+nj*sides+nk,base+j*sides+nk))
                    v=.15+(row%3)*.20;u=row*.371
                    uvfaces.append(((u+arcs[j]/.08,v+offsets[k]*radii[j]/.08),(u+arcs[j+1]/.08,v+offsets[k]*radii[nj]/.08),(u+arcs[j+1]/.08,v+offsets[k+1]*radii[nj]/.08),(u+arcs[j]/.08,v+offsets[k+1]*radii[j]/.08)))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def reference_bark_wear(parent,name):
        from mathutils.bvhtree import BVHTree
        rim=next(o for o in parent.children if o.name.endswith('_LidRimBundle'));data=rim.data
        tree=BVHTree.FromPolygons([v.co for v in data.vertices],[tuple(p.vertices) for p in data.polygons])
        verts=[];faces=[];uvfaces=[]
        for index,j in enumerate((1,3,4,5,6,7,8,10,13,16,19,22)):
            strand=index%3;sides=(5,5,3)[strand];offset=(0,24*5,24*10)[strand]
            poly=data.polygons[offset+j*sides+(0 if index%2 else sides-1)]
            points=[data.vertices[i].co for i in poly.vertices];uvs=[data.uv_layers.active.data[i].uv for i in poly.loop_indices];base=len(verts);coords=[]
            for u,v,lift in ((.30,.20,.00012),(.55,.20,.00020),(.52,.70,.00080),(.32,.70,.00045)):
                q=points[0].lerp(points[1],u).lerp(points[3].lerp(points[2],u),v)
                hit,normal,_,_=tree.find_nearest(q);verts.append(tuple(hit+normal*lift))
                coords.append(tuple(uvs[0].lerp(uvs[1],u).lerp(uvs[3].lerp(uvs[2],u),v)))
            faces.append((base,base+1,base+2,base+3));uvfaces.append(coords)
        obj=mesh(name,verts,faces,[exposed_wood],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def reference_repair_rods(parent,name):
        verts=[];faces=[];uvfaces=[];segments=4;sides=3
        for piece,row in enumerate((4,7)):
            base=len(verts);arcs=[0];centers=[]
            for j in range(segments+1):
                t=j/segments;a=.88-.20+.40*t;flow=row+a/(2*math.pi);z=BodyCourseHeight(flow,a)+.0007*math.sin(t*math.pi+piece)
                r=BodyMeanRadius(z,a)+.0045+.0015*math.sin(math.pi*t);center=(r*math.cos(a),r*math.sin(a),z);centers.append(center)
                if j:arcs.append(arcs[-1]+math.dist(center,centers[-2]))
                for k in range(sides):
                    b=2*math.pi*k/sides;rr=r+.0011*math.cos(b);verts.append((rr*math.cos(a),rr*math.sin(a),z+.0011*math.sin(b)))
            for j in range(segments):
                for k in range(sides):
                    nk=(k+1)%sides;faces.append((base+j*sides+k,base+(j+1)*sides+k,base+(j+1)*sides+nk,base+j*sides+nk))
                    uvfaces.append(((arcs[j]/.08,k/sides*.0069/.08),(arcs[j+1]/.08,k/sides*.0069/.08),(arcs[j+1]/.08,(k+1)/sides*.0069/.08),(arcs[j]/.08,(k+1)/sides*.0069/.08)))
            faces.extend(((base+2,base+1,base),(base+segments*sides,base+segments*sides+1,base+segments*sides+2)))
            uvfaces.extend((((.1,.1),(.12,.1),(.1,.12)),((.1,.1),(.12,.1),(.1,.12))))
        obj=mesh(name,verts,faces,[exposed_wood],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def rim_bundle_profile(a):
        center_r=.241+.0008*math.sin(3*a)+.0003*math.sin(7*a)
        center_z=.1855+.00055*math.sin(5*a+.3)
        compression=sum(.09*math.exp(-(math.atan2(math.sin(a-t),math.cos(a-t))/.065)**2) for t in (0,math.pi,5.70))
        radius=.008*(.94+.04*math.sin(5*a)+.02*math.sin(13*a))*(1-compression)
        height=.013*(.95+.04*math.sin(4*a+.4))*(1-compression)
        return center_r,center_z,radius,height

    def rim_bundle(parent,name):
        if IsFullWeaveStudy():
            verts=[];faces=[];uvfaces=[];segments=24;strandCounts=[]
            for strand,sides in enumerate((5,5,3)):
                base=len(verts);strandCounts.append(segments*sides)
                for j in range(segments):
                    a=2*math.pi*j/segments;phase=2*math.pi*strand/3+4*a+.20*math.sin(3*a)+.05*math.sin(7*a)
                    cr=.241+.0008*math.sin(3*a)+.0003*math.sin(7*a);cz=.1855+.00055*math.sin(5*a+.3)
                    centerR=cr+.0068*math.cos(phase);centerZ=cz+.00816*math.sin(phase)
                    radius=.0048*(1+.035*math.sin(5*a+strand*1.2)+.015*math.sin(11*a+strand))
                    for k in range(sides):
                        b=2*math.pi*k/sides;r=centerR+radius*math.cos(b)
                        verts.append((r*math.cos(a),r*math.sin(a),centerZ+radius*math.sin(b)))
                for j in range(segments):
                    for k in range(sides):
                        nj=(j+1)%segments;nk=(k+1)%sides
                        faces.append((base+j*sides+k,base+nj*sides+k,base+nj*sides+nk,base+j*sides+nk))
                        u0=j/segments*2*math.pi*.241/.08;u1=(j+1)/segments*2*math.pi*.241/.08
                        v0=.17*strand+k/sides*2*math.pi*.0048/.08;v1=.17*strand+(k+1)/sides*2*math.pi*.0048/.08
                        uvfaces.append(((u0,v0),(u1,v0),(u1,v1),(u0,v1)))
            obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
            obj['K06RimStrandVertexCounts']=strandCounts
            for poly,coords in zip(obj.data.polygons,uvfaces):
                poly.use_smooth=True
                for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
            return obj
        verts=[];faces=[];segments=32;sides=10
        for j in range(segments):
            a=2*math.pi*j/segments
            for k in range(sides):
                b=2*math.pi*k/sides;r,z=BundleSurface(a,b)
                verts.append((r*math.cos(a),r*math.sin(a),z))
        for j in range(segments):
            for k in range(sides):
                nj=(j+1)%segments;nk=(k+1)%sides
                faces.append((j*sides+k,nj*sides+k,nj*sides+nk,j*sides+nk))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly in obj.data.polygons:
            poly.use_smooth=True;j,k=divmod(poly.index,sides)
            u0=j/segments*(2*math.pi*.241/.5);u1=(j+1)/segments*(2*math.pi*.241/.5)
            v0=k/sides;v1=(k+1)/sides
            for loop,coord in zip(poly.loop_indices,((u0,v0),(u1,v0),(u1,v1),(u0,v1))):obj.data.uv_layers.active.data[loop].uv=coord
        return obj

    def lid_skirt(parent,name):
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        rim=next(o for o in parent.children if o.name.endswith('_LidRimBundle'))
        bvh=BVHTree.FromPolygons([v.co for v in rim.data.vertices],[tuple(p.vertices) for p in rim.data.polygons])
        verts=[];faces=[];segments=32
        for j in range(segments):
            a=2*math.pi*j/segments;outer=max(BundleSurface(a,2*math.pi*k/10)[0] for k in range(10))
            rad=min(.248+.0004*math.sin(3*a),outer-.0005)
            point,normal,face,distance=bvh.ray_cast(Vector((rad*math.cos(a),rad*math.sin(a),.140)),Vector((0,0,1)),.09)
            assert point is not None, ('skirt has no bundle support',j)
            upper=point.z-.00012;assert upper>.1645
            for z in (.164,upper):verts.append((rad*math.cos(a),rad*math.sin(a),z))
        # The bundle's underside is piecewise planar between longitudinal
        # samples. Keep the entire skirt edge below it, not only its endpoints.
        for iteration in range(2):
            for j in range(segments):
                k=(j+1)%segments;start=Vector(verts[2*j+1]);end=Vector(verts[2*k+1]);lower=0
                for sample in range(41):
                    t=sample/40;q=start.lerp(end,t)
                    hit,normal,face,distance=bvh.ray_cast(Vector((q.x,q.y,.140)),Vector((0,0,1)),.09)
                    if hit is not None:lower=max(lower,q.z-hit.z+.00020)
                if lower>0:
                    for index in (2*j+1,2*k+1):
                        x,y,z=verts[index];verts[index]=(x,y,z-lower)
        for j in range(segments):
            k=(j+1)%segments;faces.append((2*j,2*k,2*k+1,2*j+1))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for fitIteration in range(13):
            skirtTree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons])
            hits=bvh.overlap(skirtTree)
            if not hits:break
            nodes={vertex for _,face in hits for vertex in obj.data.polygons[face].vertices if vertex%2==1}
            for vertex in nodes:obj.data.vertices[vertex].co.z-=.00015
            obj.data.update()
        assert fitIteration<12, 'Skirt clearance correction exceeded 1.8mm'
        obj['K06SkirtFitSteps']=fitIteration
        for poly in obj.data.polygons:
            j=poly.index;u0=j/segments*(2*math.pi*.248/.08);u1=(j+1)/segments*(2*math.pi*.248/.08)
            for loop,u in zip(poly.loop_indices,(u0,u1,u1,u0)):
                v=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                obj.data.uv_layers.active.data[loop].uv=(u,.2+(v.z-.164)/.08)
        return obj

    def rim_accent(parent,name):
        verts=[];faces=[];indices=[];segments=28;strands=4
        for strand in (0,1,3):
            base=len(verts)
            for j in range(segments):
                a=2*math.pi*j/segments;cr,cz,rr,hh=rim_bundle_profile(a)
                phase=2*math.pi*strand/strands+.35*math.sin(3*a+strand*.9)+.12*math.sin(7*a+strand)
                for offset in (-.13,.13):
                    b=phase+offset;r=cr+(rr+.0028)*math.cos(b)
                    z=cz+(hh+.0028)*math.sin(b)
                    if abs(math.sin(a))<.12 and r<.238 and z>.190:z=max(z,.1992)
                    verts.append((r*math.cos(a),r*math.sin(a),z))
            for j in range(segments):
                k=(j+1)%segments;faces.append((base+2*j,base+2*k,base+2*k+1,base+2*j+1));indices.append(0 if strand%2==0 else 1)
        obj=mesh(name,verts,faces,[rim_material,wicker[3]],indices,parent)
        for poly in obj.data.polygons:
            poly.use_smooth=True;strand,j=divmod(poly.index,segments)
            u0=j/segments*(2*math.pi*.25/.5);u1=(j+1)/segments*(2*math.pi*.25/.5)
            for loop,coord in zip(poly.loop_indices,((u0,0),(u1,0),(u1,1),(u0,1))):obj.data.uv_layers.active.data[loop].uv=coord
        return obj

    def bind_lid_bundle(parent,name):
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        verts=[];faces=[];uvfaces=[]
        if IsFullWeaveStudy():
            materialIds=[]
            rim=next(o for o in parent.children if o.name.endswith('_LidRimBundle'))
            rimTree=BVHTree.FromPolygons([v.co for v in rim.data.vertices],[tuple(p.vertices) for p in rim.data.polygons])
            weave=next(o for o in parent.children if o.name.endswith('_LidWeave'))
            weaveTree=BVHTree.FromPolygons([v.co for v in weave.data.vertices],[tuple(p.vertices) for p in weave.data.polygons])
            for index,a0 in enumerate(BundleBindingAngles()):
                for coilOffset in (-.020,0,.020):
                    base=len(verts);a=a0+coilOffset;width=.0065+.0002*(index%3);points=[];arcs=[0]
                    support=[]
                    for sample in range(80):
                        rr=.218+sample*.0005;x,y=rr*math.cos(a),rr*math.sin(a)
                        for start,direction in ((.22,-1),(.15,1)):
                            hit,normal,face,distance=rimTree.ray_cast(Vector((x,y,start)),Vector((0,0,direction)),.08)
                            if hit is not None:support.append((rr,hit.z))
                    assert support,'No physical rim support for binding'
                    innerR=min(p[0] for p in support)-.00025;outerR=max(p[0] for p in support)+.00045
                    topZ=max(p[1] for p in support)+.00025;bottomZ=min(p[1] for p in support)-.00025
                    hit,_,_,_=weaveTree.ray_cast(Vector((innerR*math.cos(a),innerR*math.sin(a),.22)),Vector((0,0,-1)),.08)
                    if hit is not None:topZ=max(topZ,hit.z+.00025)
                    profile=((innerR,topZ),(outerR,topZ),(outerR+.00015,(topZ+bottomZ)/2),(outerR,bottomZ))
                    for k,(r,z) in enumerate(profile):
                        angle=a+.0015*(k-2)
                        points.append((r*math.cos(angle),r*math.sin(angle),z))
                        if k:arcs.append(arcs[-1]+math.dist(points[-1],points[-2]))
                        for fraction in (-1,1):
                            lift=.00040*(1-fraction*fraction);normalR=0 if k<2 else 1
                            rr=r+lift*normalR;zz=z+lift*(1 if k<2 else 0)
                            verts.append((rr*math.cos(angle+fraction*width),rr*math.sin(angle+fraction*width),zz))
                    for k in range(3):
                        faces.append((base+k*2,base+(k+1)*2,base+(k+1)*2+1,base+k*2+1))
                        materialIds.append(1 if index%4==0 else 0)
                        uvfaces.append(((arcs[k]/.08,.3),(arcs[k+1]/.08,.3),(arcs[k+1]/.08,.3+2*.244*width/.08),(arcs[k]/.08,.3+2*.244*width/.08)))
            obj=mesh(name,verts,faces,[exposed_wood,rim_material],materialIds,parent)
            for poly,coords in zip(obj.data.polygons,uvfaces):
                poly.use_smooth=True
                for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
            return obj
        rim=next(o for o in parent.children if o.name.endswith('_LidRimBundle'))
        bvh=BVHTree.FromPolygons([v.co for v in rim.data.vertices],[tuple(p.vertices) for p in rim.data.polygons])
        weave=next(o for o in parent.children if o.name.endswith('_LidWeave'))
        weaveTree=BVHTree.FromPolygons([v.co for v in weave.data.vertices],[tuple(p.vertices) for p in weave.data.polygons])
        def top_contact(angle,width):
            heights=[]
            for aa in (angle-width,angle,angle+width):
                cr,_,_=BundleSpec(aa)
                for j in range(61):
                    rr=cr-.012+j*.0004
                    point,normal,face,distance=bvh.ray_cast(Vector((rr*math.cos(aa),rr*math.sin(aa),.225)),Vector((0,0,-1)),.06)
                    if point is not None:heights.append(point.z)
                    if IsFullWeaveStudy():
                        point,normal,face,distance=weaveTree.ray_cast(Vector((rr*math.cos(aa),rr*math.sin(aa),.225)),Vector((0,0,-1)),.06)
                        if point is not None:heights.append(point.z)
            assert heights
            return max(heights)+.00012
        for index,a0 in enumerate(BundleBindingAngles()):
            prototype=IsFullWeaveStudy() or index==2
            for coilOffset in ((-.015,.015) if prototype else (0,)):
                a=a0+coilOffset;fractions=(-1,0,1) if prototype else (-1,1)
                base=len(verts);width=.0075+.0006*(index%3);centers=[];arcs=[]
                for k,degrees in enumerate((115,75,35,-5,-45,-65,-85,-100,-115)):
                    b=math.radians(degrees);angle=a+.015+.0015*(k-3);cr,cz,twigs=BundleSpec(angle)
                    distance=max(x*math.cos(b)+z*math.sin(b)+rr for x,z,rr in twigs)+.00115
                    r=cr+distance*math.cos(b);z=cz+distance*math.sin(b)
                    if k<2:
                        step=2*math.pi/32;samples=(angle-width,angle+width,math.floor(angle/step)*step,math.ceil(angle/step)*step)
                        z=top_contact(angle,width) if prototype else max(BundleSpec(t)[1]+max(dz+rr for dx,dz,rr in BundleSpec(t)[2]) for t in samples)+.00020
                    if k in (4,5):r=max(r,.2493)
                    if k==6:r,z=.252,.1635
                    if k==7:r,z=.2458,.1625
                    if k==8:r,z=.2456,.1685
                    center=(r*math.cos(angle),r*math.sin(angle),z);centers.append(center);arcs.append(0 if k==0 else arcs[-1]+math.dist(centers[-2],center))
                    for f in fractions:
                        lift=.00065*(1-f*f) if prototype else 0
                        rr=r+lift*(0 if k<2 else math.cos(b));zz=z+lift*(1 if k<2 else math.sin(b));aa=angle+f*width
                        verts.append((rr*math.cos(aa),rr*math.sin(aa),zz))
                n=len(fractions);physicalWidth=2*.241*width
                for k in range(8):
                    for j in range(n-1):
                        faces.append((base+k*n+j,base+(k+1)*n+j,base+(k+1)*n+j+1,base+k*n+j+1))
                        v0=.33+(fractions[j]+1)*.5*physicalWidth/.08;v1=.33+(fractions[j+1]+1)*.5*physicalWidth/.08
                        uvfaces.append(((arcs[k]/.08,v0),(arcs[k+1]/.08,v0),(arcs[k+1]/.08,v1),(arcs[k]/.08,v1)))
        obj=mesh(name,verts,faces,[rim_material],[0]*len(faces),parent)
        for poly,coords in zip(obj.data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,co in zip(poly.loop_indices,coords):obj.data.uv_layers.active.data[loop].uv=co
        return obj

    def loose_repair_fibers(parent,name):
        verts=[];faces=[]
        for j,(a,direction) in enumerate(((3.34,1),(3.34,-1),(5.70,1),(5.70,-1),(1.74,1),(0.36,-1))):
            r=.249;start=.181+(j%3)*.001;length=.008+.002*(j%3)
            base=len(verts);width=.00055
            for shift,z in ((-width,start),(width,start),(direction*.002,start+direction*length)):
                aa=a+shift/.249
                verts.append((r*math.cos(aa),r*math.sin(aa),z))
            faces.append((base,base+1,base+2))
        return mesh(name,verts,faces,wicker,[3]*len(faces),parent)

    def pancake_stack(parent,prefix):
        verts=[];faces=[];ids=[];uvByVertex={};thickness=.00035;foodTileM=1.0 if IsFullWeaveStudy() else .16
        xSamples=(-1,1) if IsFullWeaveStudy() else (-1,0,1);sampleCount=len(xSamples);sideSize=8*sampleCount
        # Six separate connected accordion-folded sheets. Each leaf is a thin
        # shell with round returns, instead of three independent thick boxes.
        for piece in range(6):
            base=len(verts);angle=(-.045,.018,-.025,.035,-.015,.045)[piece]
            ca,sa=math.cos(angle),math.sin(angle);cx=.003*math.sin(piece*2);cy=.0025*math.cos(piece*3)
            for side in (-1,1):
                for k in range(8):
                    for ix,t in enumerate(xSamples):
                        x=.122*t;gap=.00060+.00095*abs(t)**1.15
                        lo=-.047+.0007*math.sin(piece*1.7);hi=.047+.0005*math.cos(piece)
                        profile=((lo,0),(hi,0),(hi+gap*.5,gap*.5),(hi,gap),(lo,gap),(lo-gap*.5,gap*1.5),(lo,gap*2),(hi,gap*2))
                        y,z=profile[k];previous=profile[max(0,k-1)];following=profile[min(7,k+1)]
                        dy,dz=following[0]-previous[0],following[1]-previous[1];length=math.hypot(dy,dz)
                        y+=side*(-dz/length)*thickness*.5;z+=side*(dy/length)*thickness*.5
                        # A common broad bow keeps the three leaves curved together.
                        warp=.00070*(1-t*t)+.00012*math.sin(2.4*t+piece*.6)+y*.003
                        wx=ca*x-sa*y+cx;wy=sa*x+ca*y+cy
                        index=len(verts);verts.append((wx,wy,.0105+piece*.0048+z+warp))
                        arc=sum(math.hypot(profile[j+1][0]-profile[j][0],profile[j+1][1]-profile[j][1]) for j in range(k))
                        uvByVertex[index]=(x/foodTileM+.5+piece*.173,arc/foodTileM+piece*.137)
            def vi(side,k,ix):return base+side*sideSize+k*sampleCount+ix
            for side in range(2):
                for k in range(7):
                    for ix in range(sampleCount-1):
                        q=(vi(side,k,ix),vi(side,k,ix+1),vi(side,k+1,ix+1),vi(side,k+1,ix))
                        faces.append(q if side==1 else tuple(reversed(q)));ids.append(0)
            for ix in (0,sampleCount-1):
                for k in range(7):
                    q=(vi(0,k,ix),vi(1,k,ix),vi(1,k+1,ix),vi(0,k+1,ix))
                    faces.append(q if ix==0 else tuple(reversed(q)));ids.append(1)
            for k in (0,7):
                for ix in range(sampleCount-1):
                    q=(vi(0,k,ix),vi(0,k,ix+1),vi(1,k,ix+1),vi(1,k,ix))
                    faces.append(q if k==0 else tuple(reversed(q)));ids.append(1)
        obj=mesh(prefix+'_FoldedPancakes',verts,faces,pancake,ids,parent)
        for poly in obj.data.polygons:
            indices=[obj.data.loops[loop].vertex_index for loop in poly.loop_indices]
            xEnd=len({i%sampleCount for i in indices})==1
            for loop,index in zip(poly.loop_indices,indices):
                u,v=uvByVertex[index]
                if poly.material_index==1:
                    side=(index%(sideSize*2))//sideSize
                    u,v=(v,u+side*thickness/foodTileM) if xEnd else (u,v+side*thickness/foodTileM)
                obj.data.uv_layers.active.data[loop].uv=(u,v)
        return obj

    def apply_concept_material(obj):
        obj.data.materials.clear()
        obj.data.materials.append(lid_reference)
        for polygon in obj.data.polygons:
            polygon.material_index=0
            if obj.name.endswith('LidWeave') and polygon.index==len(obj.data.polygons)-1:
                for index in polygon.loop_indices:
                    v=obj.data.vertices[obj.data.loops[index].vertex_index].co
                    obj.data.uv_layers.active.data[index].uv=(0.5+v.x/0.018,0.5+v.y/0.018)
                continue
            if obj.name.endswith('WovenBottom') and polygon.index==len(obj.data.polygons)-1:
                for index in polygon.loop_indices:
                    v=obj.data.vertices[obj.data.loops[index].vertex_index].co
                    obj.data.uv_layers.active.data[index].uv=(0.5+v.x/0.008,0.5+v.y/0.008)
                continue
            is_lid=obj.name.endswith('LidWeave')
            ring_faces=6*24 if is_lid else 4*16
            if polygon.index>=ring_faces:
                points=[obj.data.vertices[obj.data.loops[i].vertex_index].co for i in polygon.loop_indices]
                r0=math.hypot(points[0].x,points[0].y)/0.18
                r1=math.hypot(points[2].x,points[2].y)/0.18
                for index,coord in zip(polygon.loop_indices,((r0,0.723),(r0,0.741),(r1,0.741),(r1,0.723))):
                    obj.data.uv_layers.active.data[index].uv=coord
                continue
            row=polygon.index//(24 if is_lid else 16)
            row_radius=(0.028+row*0.0402) if is_lid else (0.031+row*0.0553)
            angles=[math.atan2(obj.data.vertices[obj.data.loops[i].vertex_index].co.y,obj.data.vertices[obj.data.loops[i].vertex_index].co.x) for i in polygon.loop_indices]
            crosses_seam=max(angles)-min(angles)>math.pi
            for n,index in enumerate(polygon.loop_indices):
                v=obj.data.vertices[obj.data.loops[index].vertex_index].co
                a=angles[n]+(2*math.pi if crosses_seam and angles[n]<0 else 0)
                obj.data.uv_layers.active.data[index].uv=(a*row_radius/0.18+row*0.131,math.hypot(v.x,v.y)/0.18)

    def build_state(opened):
        state='Opened' if opened else 'Intact'
        r=root('PancakeBasket_'+state)
        wall(r,state)
        if IsFullWeaveStudy():reference_repair_rods(r,state+'_RepairRods')
        bottom=woven_disc(r,state+'_WovenBottom',0.220,0.009)
        apply_concept_material(bottom)
        foot=ring(r,state+'_BottomRim',0.2195,0.0032841,0.004,segments=8 if IsFullWeaveStudy() else 14,sides=3)
        foot.location.z=.000005-min(v.co.z for v in foot.data.vertices)
        heightDelta=.1698-BodyHeight(.1698) if IsFullWeaveStudy() else 0
        ring(r,state+'_MouthRim',0.241 if IsFullWeaveStudy() else .238,.1765-heightDelta,.0060 if IsFullWeaveStudy() else .0035,segments=24 if IsFullWeaveStudy() else 16,sides=4 if IsFullWeaveStudy() else 3)
        repair(r,state+'_MouthMends',0.241 if IsFullWeaveStudy() else .238,.1765-heightDelta)
        lid=root(state+'_Lid')
        lid.parent=r
        lid_weave=woven_disc(lid,state+'_LidWeave',0.242,lidSurfaceZ if IsFullWeaveStudy() else .193,True)
        apply_concept_material(lid_weave)
        if IsFullWeaveStudy():
            if globals().get('K06_INTRINSIC_WEAVE'):
                innerVertices,innerFaces=LidSurfaceGeometry(lidSurfaceZ-lidUnderThickness-.0015,segments=16,radii=(.225,) if globals().get('K06_ROUND_WEAVE_RUNTIME') else (.00795,.120,.225));innerFaces=[tuple(reversed(face)) for face in innerFaces]
            else:innerVertices,innerFaces=LidInnerReceiverGeometry()
            innerWeave=mesh(state+'_LidWeaveInner',innerVertices,innerFaces,wicker,[0]*len(innerFaces),lid);innerWeave['K06LidInner']=True
            if not globals().get('K06_INTRINSIC_WEAVE'):reference_outer_lid_wefts(lid,state+'_LidOuterWefts')
        # The horizontal structural ribs are included in the actual high weave;
        # a second straight rod here would obscure the woven central start.
        rim_bundle(lid,state+'_LidRimBundle')
        if IsFullWeaveStudy():reference_bark_wear(lid,state+'_LidBarkWear')
        if not IsFullWeaveStudy():lid_skirt(lid,state+'_LidSkirt')
        bind_lid_bundle(lid,state+'_LidBindings')
        if IsFullWeaveStudy():reference_lid_spines(lid,state+'_LidSpines')
        if not IsFullWeaveStudy():loose_repair_fibers(lid,state+'_LidLooseFibers')
        if opened:
            # Lid is flipped alongside the basket; transformations are relative to root.
            lid.rotation_euler[1]=math.radians(82)
            lid.location=(0.109, 0.0, 0.22688)
        else:
            lid.location.z=.0095-heightDelta
        pancake_stack(r,state)
        return r

    intact=build_state(False)
    opened=build_state(True)
    if IsFullWeaveStudy():
        lid=bpy.data.objects['Opened_Lid'];bpy.context.view_layer.update()
        def is_lid_part(obj):
            while obj:
                if obj is lid:return True
                obj=obj.parent
            return False
        minimum=min((obj.matrix_world@vertex.co).z for obj in scene.objects if obj.type=='MESH' and is_lid_part(obj) for vertex in obj.data.vertices)
        if minimum<.0001:lid.location.z+=.0001-minimum
        bpy.context.view_layer.update()
    # Fix the export triangles before contact fitting. A polygon BVH can choose
    # a different diagonal from glTF on a twisted quad.
    import bmesh
    from mathutils.bvhtree import BVHTree
    for obj in list(scene.objects):
        if obj.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(obj.data);bm.free();obj.data.update()
    for state in ('Intact','Opened'):
        if IsFullWeaveStudy():continue
        rim=bpy.data.objects[state+'_LidRimBundle'];skirt=bpy.data.objects[state+'_LidSkirt']
        rimTree=BVHTree.FromPolygons([v.co for v in rim.data.vertices],[tuple(p.vertices) for p in rim.data.polygons],all_triangles=True)
        for fitIteration in range(13):
            skirtTree=BVHTree.FromPolygons([v.co for v in skirt.data.vertices],[tuple(p.vertices) for p in skirt.data.polygons],all_triangles=True)
            hits=rimTree.overlap(skirtTree)
            if not hits:break
            nodes={i for _,f in hits for i in skirt.data.polygons[f].vertices if skirt.data.vertices[i].co.z>.1641}
            assert nodes
            for i in nodes:skirt.data.vertices[i].co.z-=.00015
            skirt.data.update()
        assert fitIteration<12, 'Final triangle skirt contact did not converge'
        skirt['K06ExportTriangleFitSteps']=fitIteration
        for poly in skirt.data.polygons:
            for loop in poly.loop_indices:
                vertex=skirt.data.vertices[skirt.data.loops[loop].vertex_index]
                skirt.data.uv_layers.active.data[loop].uv.y=.2+(vertex.co.z-.164)/.08
    from mathutils.bvhtree import BVHTree
    if IsFullWeaveStudy():
        for state in ('Intact','Opened'):
            rim=bpy.data.objects[state+'_LidRimBundle'];weave=bpy.data.objects[state+'_LidWeave']
            rimTree=BVHTree.FromPolygons([v.co for v in rim.data.vertices],[tuple(p.vertices) for p in rim.data.polygons],all_triangles=True)
            if rim.get('K06RimStrandVertexCounts'):
                start=0;strandTrees=[]
                for count in rim['K06RimStrandVertexCounts']:
                    faces=[tuple(p.vertices) for p in rim.data.polygons if all(start<=i<start+count for i in p.vertices)]
                    strandTrees.append(BVHTree.FromPolygons([v.co for v in rim.data.vertices],faces,all_triangles=True));start+=count
                assert not any(a.overlap(b) for i,a in enumerate(strandTrees) for b in strandTrees[i+1:]),'Rim twig strands intersect'
            bark=bpy.data.objects[state+'_LidBarkWear']
            for barkFit in range(17):
                barkTree=BVHTree.FromPolygons([v.co for v in bark.data.vertices],[tuple(p.vertices) for p in bark.data.polygons],all_triangles=True)
                hits=rimTree.overlap(barkTree)
                if not hits:break
                vertices={i for _,face in hits for i in bark.data.polygons[face].vertices}
                for i in vertices:
                    vertex=bark.data.vertices[i];point,normal,_,distance=rimTree.find_nearest(vertex.co);signed=(vertex.co-point).dot(normal);vertex.co=point+normal*(max(0,signed)+.00015)
                bark.data.update()
            assert barkFit<16,'Final bark peel fitting exceeded 2.4mm'
            for fit in range(31):
                weaveTree=BVHTree.FromPolygons([v.co for v in weave.data.vertices],[tuple(p.vertices) for p in weave.data.polygons],all_triangles=True)
                overlap=rimTree.overlap(weaveTree)
                if not overlap:break
                vertices={i for _,f in overlap for i in weave.data.polygons[f].vertices if math.hypot(weave.data.vertices[i].co.x,weave.data.vertices[i].co.y)>.20}
                assert vertices,'Lid/rim contact involves non-boundary vertices'
                for i in vertices:
                    v=weave.data.vertices[i].co;r=math.hypot(v.x,v.y);v.x*=1-.0002/r;v.y*=1-.0002/r
                weave.data.update()
            assert fit<30,'Physical lid/rim fit exceeded 6mm'
            print('PHYSICAL_LID_EDGE_FIT',state,fit)
            spines=bpy.data.objects[state+'_LidSpines']
            outerWefts=bpy.data.objects.get(state+'_LidOuterWefts');outerTree=BVHTree.FromPolygons([v.co for v in outerWefts.data.vertices],[tuple(p.vertices) for p in outerWefts.data.polygons],all_triangles=True) if outerWefts else None
            underside=bpy.data.objects[state+'_LidWeaveInner'];undersideTree=BVHTree.FromPolygons([v.co for v in underside.data.vertices],[tuple(p.vertices) for p in underside.data.polygons]) if globals().get('K06_CONTINUOUS_LID') else None
            for fit in range(21):
                spineTree=BVHTree.FromPolygons([v.co for v in spines.data.vertices],[tuple(p.vertices) for p in spines.data.polygons],all_triangles=True)
                if not (rimTree.overlap(spineTree) or weaveTree.overlap(spineTree) or (outerTree and outerTree.overlap(spineTree)) or (undersideTree and undersideTree.overlap(spineTree))):break
                for vertex in spines.data.vertices:vertex.co.z+=(-.0002 if undersideTree else .0002)
                spines.data.update()
            assert fit<20,'Lid spine support fit exceeded 4mm'
            spines['K06SupportFitSteps']=fit;spines['K06SupportSide']='underside' if undersideTree else 'upper'
            tie=bpy.data.objects[state+'_LidBindings']
            supporters=[bpy.data.objects[state+suffix] for suffix in ('_LidRimBundle','_LidWeave')]
            trees=[BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons],all_triangles=True) for obj in supporters]
            for iteration in range(17):
                tieTree=BVHTree.FromPolygons([v.co for v in tie.data.vertices],[tuple(p.vertices) for p in tie.data.polygons],all_triangles=True)
                faces={face for tree in trees for _,face in tree.overlap(tieTree)}
                if not faces:break
                vertices={index for face in faces for index in tie.data.polygons[face].vertices}
                for index in vertices:
                    normal=tie.data.vertices[index].normal.copy()
                    assert normal.length>.9
                    tie.data.vertices[index].co+=normal*.00015
                tie.data.update()
            assert iteration<16, 'Full rim tie support fitting exceeded2.4mm'
            tie['K06SupportFitSteps']=iteration
            outside=bpy.data.objects[state+'_WallOuterWoven'];mend=bpy.data.objects[state+'_MouthMends']
            outsideTree=BVHTree.FromPolygons([v.co for v in outside.data.vertices],[tuple(p.vertices) for p in outside.data.polygons],all_triangles=True)
            for iteration in range(13):
                mendTree=BVHTree.FromPolygons([v.co for v in mend.data.vertices],[tuple(p.vertices) for p in mend.data.polygons],all_triangles=True)
                faces={face for _,face in outsideTree.overlap(mendTree)}
                if not faces:break
                vertices={index for face in faces for index in mend.data.polygons[face].vertices}
                for index in vertices:
                    vertex=mend.data.vertices[index];r=math.hypot(vertex.co.x,vertex.co.y);vertex.co.x*=1+.00015/r;vertex.co.y*=1+.00015/r
                mend.data.update()
            assert iteration<12, 'Mouth repair wall clearance exceeded1.8mm'
            print('FULL_CONTACT_FIT',state,'tie',tie['K06SupportFitSteps'],'mend',iteration)
    def local_descendant(o,ancestor):
        while o:
            if o is ancestor:return True
            o=o.parent
        return False
    def world_bvh(o):return BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons])
    if IsFullWeaveStudy():
        bpy.context.view_layer.update()
        for state in ('Intact','Opened'):
            tie=bpy.data.objects[state+'_LidBindings'];supporters=[bpy.data.objects[state+suffix] for suffix in ('_LidRimBundle','_LidWeave')]
            trees=[world_bvh(obj) for obj in supporters]
            for fitWorld in range(13):
                tieTree=world_bvh(tie);faces={face for tree in trees for _,face in tree.overlap(tieTree)}
                if not faces:break
                vertices={index for face in faces for index in tie.data.polygons[face].vertices}
                for index in vertices:tie.data.vertices[index].co+=tie.data.vertices[index].normal*.0001
                tie.data.update();bpy.context.view_layer.update()
            assert fitWorld<12,'Posed binding contact fit exceeded 1.2mm'
            print('WORLD_BINDING_CONTACT_FIT',state,fitWorld)
    lid=bpy.data.objects['Intact_Lid'];bpy.context.view_layer.update()
    body=[o for o in scene.objects if o.type=='MESH' and local_descendant(o,intact) and not local_descendant(o,lid)]
    body_trees=[world_bvh(o) for o in body]
    def lid_body_overlap():
        bpy.context.view_layer.update();trees=[world_bvh(o) for o in scene.objects if o.type=='MESH' and local_descendant(o,lid)]
        return any(a.overlap(b) for a in body_trees for b in trees)
    for iteration in range(81):
        if not lid_body_overlap():break
        lid.location.z+=.00025
    assert iteration<80, 'Lid contact fitting failed'
    clearZ=lid.location.z
    for settleStep in range(81):
        lid.location.z-=.00025
        if lid_body_overlap():break
        clearZ=lid.location.z
    assert settleStep<80,'Lid did not find real body contact within 20mm'
    hitZ=lid.location.z
    for solve in range(12):
        lid.location.z=(hitZ+clearZ)/2
        if lid_body_overlap():hitZ=lid.location.z
        else:clearZ=lid.location.z
    lid.location.z=clearZ+.00015;bpy.context.view_layer.update();scene['K06LidSeatZ']=lid.location.z
    assert not lid_body_overlap(),'Settled lid intersects the body'
    print('LID_SEAT_Z',round(lid.location.z,6),'raise_steps',iteration,'settle_steps',settleStep)
    if globals().get('K06_ALIGNED_LID_GEOMETRY'):WriteLidOccluderInput(scene,OUT/'Materials/LidReliefAligned')
    if globals().get('K06_ROUND_WEAVE_RUNTIME'):WriteLidOccluderInput(scene,ContinuousLidFolder() if globals().get('K06_CONTINUOUS_LID') else OUT/'Materials/LidRoundWeave')
    atlasApplied=bool(globals().get('K06_APPLY_ATLASES',False))
    if atlasApplied:ApplyWickerAtlases(scene,OUT/'Materials')
    if atlasApplied and IsFullWeaveStudy():BakeFoodContactAo(scene,OUT/'Materials'/'FullWeaveStudy')
    if globals().get('K06_ALIGNED_LID_GEOMETRY'):ApplyAlignedLidMaterial(scene,OUT/'Materials/LidReliefAligned/Baked')
    if globals().get('K06_ROUND_WEAVE_RUNTIME'):ApplyRoundWeaveMaterial(scene,OUT/'Materials/LidRoundWeave/Baked')
    if globals().get('K06_CONTINUOUS_LID') and UseWillowWoodV2():ApplyWillowWoodV2(scene)
    build_script=SnapshotBuildScript(OUT)
    scene['K06BuildScriptSha256']=build_script['sha256']
    if not atlasApplied:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'K06_PancakeBasket.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    assets=set(scene.objects)
    assert assets and all(obj.type in {'MESH','EMPTY'} for obj in assets)
    assert not any('High' in obj.name or 'Proxy' in obj.name for obj in assets)
    for obj in assets:obj.select_set(True,view_layer=bpy.context.view_layer)
    assert set(bpy.context.selected_objects)==assets and bpy.context.scene is scene and bpy.context.window.scene is scene
    bpy.ops.export_scene.gltf(filepath=str(OUT/'K06_PancakeBasket.glb'), export_format='GLB',
                              use_selection=True, export_yup=True,export_tangents=True)
    FinalizeGlbTangents(OUT/'K06_PancakeBasket.glb')
    if globals().get('K06_NORMALIZED_TEXTURES'):
        import shutil,subprocess
        hostPython=os.environ.get('K06_HOST_PYTHON') or shutil.which('python')
        assert hostPython,'System Python with Pillow is required for exact WebP packaging'
        result=subprocess.run([hostPython,str(BuildScriptPath())],env={**os.environ,'K06_STAGE':'compress_model'},check=True,capture_output=True,text=True,encoding='utf-8')
        print(result.stdout)
    if atlasApplied:
        ConfigureNativeStateCollections(scene)
        for material in list(bpy.data.materials):
            if material.users==0:bpy.data.materials.remove(material)
        for image in list(bpy.data.images):
            if image.users==0:bpy.data.images.remove(image)
        scene['K06CandidateOnly']=True
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'K06_PancakeBasket.blend'))
    import hashlib,json,datetime
    source_hash=hashlib.sha256((OUT/'K06_PancakeBasket.glb').read_bytes()).hexdigest()
    recipe={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scene':scene.name,'buildScript':build_script,'glbSha256':source_hash,'blendPath':str(OUT/'K06_PancakeBasket.blend'),'fullWeaveStudy':IsFullWeaveStudy(),'bodyRepresentation':globals().get('K06_BODY_REPRESENTATION','legacy'),'foodTextureFamily':'K07Pressed_c0e53ad3_at1m' if IsFullWeaveStudy() else 'LegacyFine_at0.16m','atlasApplied':atlasApplied,'visualApproved':False,'userApproved':False}
    recipe.update(bodyHeightScale=bodyHeightScale,bodyWeftRows=bodyWeaveRows,bodyPairedStakeGroupsGuide=bodyStakeGroups,bodyPairedStakeGroupsRenderedApprox=24,lidNormalGain=1,lidRepresentation='image-guide shallow relief top <=940 triangles, domed underside, three independent rim twigs and three-coil bindings',bodyUvWarp='smooth author UV warp with both height boundaries fixed',appearanceRecipe='Materials/'+('ReferenceIntrinsic/' if globals().get('K06_REFERENCE_MATERIALS') else '')+'Data_IntrinsicAtlasPreparation.json',materialVariant='reference projection diagnostic' if globals().get('K06_REFERENCE_MATERIALS') else 'generated C intrinsic reconstruction',wholeAssemblyAo=['food','floor','outer wall','inner wall','lid underside'],textureStandardStatus='local authoring; density warnings remain; not registered',barkSourceSha256=hashlib.sha256((OUT/'Materials'/'Texture_K06ThinWillowBarkSource.png').read_bytes()).hexdigest())
    if globals().get('K06_NORMALIZED_TEXTURES'):
        recipe.update(appearanceRecipe='Materials/RuntimeNormalized/Data_IntrinsicAtlasPreparation.json',textureNormalizationRecipe='Materials/RuntimeNormalized/Data_TextureNormalization.json',embeddedPackagingRecipe='Materials/RuntimeNormalized/Data_EmbeddedPackaging.json',textureStandardStatus='three wicker PBR sets pass measured tone, clipping, size, density and byte gates; runtime registration not performed',textureBasePixels={'lid':512,'body':256,'rim':64},textureBaseTexelsPerMeter={'lid':1024,'body':1024,'rim':800})
    if globals().get('K06_ALIGNED_LID_GEOMETRY'):recipe.update(lidReliefRecipe='Materials/LidReliefAligned/Baked/Data_AlignedLidPbr.json',lidRepresentation='sculpt-compatible <=940-triangle receiver with high-baked image-aligned crowns, crossing relief and assembled AO',lidNormalGain=1.45,lidUnderBackfacesCulled=True,lidUpperDoubleSidedForThinWeave=True,sideDesignRetained=True,topBaseAndAlphaRetained=True)
    if globals().get('K06_ROUND_WEAVE_RUNTIME'):recipe.update(lidReliefRecipe='Materials/LidRoundWeave/Baked/Data_RoundWeavePbr.json',lidRepresentation='ten separate raised willow course proxies across the full cap, continuous interleaved carrier, physical high-baked 1K normals, 16-triangle underside',lidNormalGainByRegion={'Carrier':2.0,'Raised':1.0},sideDesignRetained=True,topBaseAndAlphaRetained=False,textureBasePixels={'lid':1024,'body':256,'rim':64},textureStandardStatus='side/rim common material gates retained; lid is a unique 1K offline author UV atlas with explicit byte-budget advisories and reason, not registered for runtime')
    if globals().get('K06_CONTINUOUS_LID'):recipe.update(lidReliefRecipe='Materials/LidCReferenceWeave/Baked/Data_ContinuousWeavePbr.json',lidRepresentation='C-reference grouped stakes, five-by-five round center and frame-fitted outer weave; physical 2K normal with fine bark strength .18',lidNormalGainByRegion={'Continuous':1.0},textureBasePixels={'lid':2048,'body':256,'rim':64},textureStandardStatus='local authoring comparison; unique 2K UV atlas has documented byte-budget advisories, not registered for runtime')
    if globals().get('K06_CONTINUOUS_LID') and UseWillowWoodV2():recipe.update(woodMaterialRecipe='Materials/WoodSurfaceV2/Data_WoodSurfaceV2.json',lidReliefRecipe='Materials/WoodSurfaceV2/LidBake/Baked/Data_ContinuousWeavePbr.json',lidRepresentation='geometry locked to 34b0f088; updated fine willow skin and spatially varying roughness',geometryLockedTo='34b0f08860ca0d6c',textureBasePixels={'lid':2048,'body':256,'rim':512},textureStandardStatus='local wood authoring variant; 2K unique lid atlas and dense 512px skin have explicit byte/density advisories; not registered for runtime')
    recipe_path=OUT/'Refinement'/('Data_SourceModel_'+source_hash[:16]+'_'+build_script['sha256'][:16]+'.json')
    if not recipe_path.exists():recipe_path.write_text(json.dumps(recipe,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'Data_SourceModelCurrent.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2),encoding='utf-8')

    def below(obj, ancestor):
        while obj:
            if obj == ancestor:
                return True
            obj = obj.parent
        return False

    for state in (intact, opened):
        descendants=[o for o in bpy.context.scene.objects if below(o, state)]
        triangles=sum(sum(len(poly.vertices)-2 for poly in o.data.polygons) for o in descendants if o.type=='MESH')
        if atlasApplied and globals().get('K06_BODY_REPRESENTATION')=='covered':assert triangles<=3000,('K06 state exceeds triangle contract',state.name,triangles)
        print('STATE',state.name,'triangles',triangles,'objects',len(descendants))
    print('FILES',str(OUT))


def BakeFoodContactAo(scene,folder):
    """Bake each complete assembly's occlusion onto a second food UV set.

    The K07 base/normal/roughness and original UVs stay intact. In particular,
    the closed lid must occlude ambient illumination of the six folded sheets.
    """
    import bpy,math
    import numpy as np
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    def below(obj,ancestor):
        while obj:
            if obj is ancestor:return True
            obj=obj.parent
        return False
    savedVisibility={obj:obj.hide_render for obj in scene.objects}
    savedEngine=scene.render.engine;scene.render.engine='CYCLES';scene.cycles.samples=32
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
    try:
        for state in ('Intact','Opened'):
            root=bpy.data.objects['PancakeBasket_'+state];food=bpy.data.objects[state+'_FoldedPancakes']
            for obj in scene.objects:obj.hide_render=not below(obj,root)
            bpy.ops.object.select_all(action='DESELECT');food.select_set(True);bpy.context.view_layer.objects.active=food
            sourceUv=[tuple(loop.uv) for loop in food.data.uv_layers[0].data]
            layer=food.data.uv_layers.new(name='ContactAO');food.data.uv_layers.active=layer
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.02)
            bpy.ops.object.mode_set(mode='OBJECT')
            assert sourceUv==[tuple(loop.uv) for loop in food.data.uv_layers[0].data]
            image=bpy.data.images.new('Texture_K06'+state+'FoodContactAo',width=512,height=512,alpha=False);image.colorspace_settings.name='Non-Color'
            for i,mat in enumerate(list(food.data.materials)):
                mat=mat.copy();mat.name='Pancake_'+state+'_Assembly'+str(i);food.data.materials[i]=mat
                n=mat.node_tree.nodes;l=mat.node_tree.links;source=n.new('ShaderNodeUVMap');source.uv_map=food.data.uv_layers[0].name
                for node in list(n):
                    if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:l.new(source.outputs['UV'],node.inputs['Vector'])
                coord=n.new('ShaderNodeUVMap');coord.uv_map='ContactAO';texture=n.new('ShaderNodeTexImage');texture.image=image
                l.new(coord.outputs['UV'],texture.inputs['Vector']);ao=n.new('ShaderNodeGroup');ao.node_tree=group;l.new(texture.outputs['Color'],ao.inputs['Occlusion']);n.active=texture
            scene.render.bake.use_selected_to_active=False;scene.render.bake.use_cage=False
            bpy.ops.object.bake(type='AO',use_selected_to_active=False,use_cage=False,margin=4)
            image.filepath_raw=str(folder/('Texture_K06'+state+'FoodContactAo.png'));image.file_format='PNG';image.save();image.pack()
            food.data.uv_layers.active_index=0;food.data.uv_layers[0].active_render=True
            food['K06AssemblyAo']=state;print('ASSEMBLY_FOOD_AO',state,image.filepath_raw)
            floor=bpy.data.objects[state+'_WovenBottom'];floorMaterial=floor.data.materials[0].copy();floorMaterial.name='Wicker_'+state+'_FloorContact';floor.data.materials[0]=floorMaterial
            n=floorMaterial.node_tree.nodes;ormNode=next(node for node in n if node.type=='TEX_IMAGE' and node.image and 'Orm' in node.image.name)
            originalOrm=ormNode.image;ow,oh=tuple(originalOrm.size);micro=np.asarray(originalOrm.pixels[:],dtype=np.float32).reshape(-1,4).copy()
            macro=bpy.data.images.new('Texture_K06'+state+'FloorContactAo',width=512,height=512,alpha=False);macro.colorspace_settings.name='Non-Color'
            target=n.new('ShaderNodeTexImage');target.image=macro;n.active=target
            bpy.ops.object.select_all(action='DESELECT');floor.select_set(True);bpy.context.view_layer.objects.active=floor
            bpy.ops.object.bake(type='AO',use_selected_to_active=False,use_cage=False,margin=4)
            macro.filepath_raw=str(folder/('Texture_K06'+state+'FloorContactAo.png'));macro.file_format='PNG';macro.save();macro.scale(ow,oh)
            micro[:,0]*=np.asarray(macro.pixels[:],dtype=np.float32).reshape(-1,4)[:,0]
            combined=bpy.data.images.new('Texture_K06'+state+'FloorContactOrm',width=ow,height=oh,alpha=False);combined.colorspace_settings.name='Non-Color';combined.pixels.foreach_set(micro.reshape(-1))
            combined.filepath_raw=str(folder/('Texture_K06'+state+'FloorContactOrm.png'));combined.file_format='PNG';combined.save();combined.pack();n.remove(target);ormNode.image=combined
            floor['K06AssemblyAo']=state;print('ASSEMBLY_FLOOR_AO',state,combined.filepath_raw)
            for suffix in ('WallOuterWoven','WallInnerWoven','LidWeaveInner'):
                obj=bpy.data.objects[state+'_'+suffix];mat=obj.data.materials[0].copy();mat.name='Wicker_'+state+'_'+suffix+'_Assembly';obj.data.materials[0]=mat
                nodes=mat.node_tree.nodes;links=mat.node_tree.links;primary=obj.data.uv_layers[0]
                source=nodes.new('ShaderNodeUVMap');source.uv_map=primary.name
                for node in list(nodes):
                    if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:links.new(source.outputs['UV'],node.inputs['Vector'])
                layer=obj.data.uv_layers.new(name='AssemblyAO');uv=np.asarray([tuple(loop.uv) for loop in primary.data]);minimum=uv.min(axis=0);span=uv.max(axis=0)-minimum;assert np.all(span>0)
                for loop,coord in zip(layer.data,.02+.96*(uv-minimum)/span):loop.uv=coord
                obj.data.uv_layers.active=layer
                macro=bpy.data.images.new('Texture_K06'+state+suffix+'AssemblyAo',width=512,height=512,alpha=False);macro.colorspace_settings.name='Non-Color'
                coord=nodes.new('ShaderNodeUVMap');coord.uv_map=layer.name;target=nodes.new('ShaderNodeTexImage');target.image=macro;links.new(coord.outputs['UV'],target.inputs['Vector']);nodes.active=target
                bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
                bpy.ops.object.bake(type='AO',use_selected_to_active=False,use_cage=False,margin=4)
                output=next(node for node in nodes if node.type=='GROUP' and node.node_tree is group)
                for link in list(output.inputs['Occlusion'].links):links.remove(link)
                links.new(target.outputs['Color'],output.inputs['Occlusion'])
                macro.filepath_raw=str(folder/(macro.name+'.png'));macro.file_format='PNG';macro.save();macro.pack()
                obj.data.uv_layers.active_index=0;primary.active_render=True;obj['K06AssemblyAo']=state
                print('ASSEMBLY_SHELL_AO',state,suffix,macro.filepath_raw)
    finally:
        if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
        for obj,visibility in savedVisibility.items():obj.hide_render=visibility
        scene.render.engine=savedEngine


def ConfigureNativeStateCollections(scene):
    import bpy
    for state in ('Intact','Opened'):
        ancestor=bpy.data.objects['PancakeBasket_'+state]
        collection=bpy.data.collections.get('K06_'+state) or bpy.data.collections.new('K06_'+state)
        if collection.name not in scene.collection.children:scene.collection.children.link(collection)
        def belongs(obj):
            while obj:
                if obj is ancestor:return True
                obj=obj.parent
            return False
        for obj in [o for o in scene.objects if belongs(o)]:
            for previous in list(obj.users_collection):previous.objects.unlink(obj)
            collection.objects.link(obj)
        bpy.context.view_layer.update()
        layer=bpy.context.view_layer.layer_collection.children[collection.name]
        layer.hide_viewport=(state=='Opened');collection.hide_render=(state=='Opened')
    bpy.ops.object.select_all(action='DESELECT');bpy.data.objects['PancakeBasket_Intact'].select_set(True);bpy.context.view_layer.objects.active=bpy.data.objects['PancakeBasket_Intact']
    from mathutils import Vector
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='MATERIAL';space.shading.use_scene_world=False;space.shading.use_scene_lights=False
            space.overlay.show_floor=False;space.overlay.show_outline_selected=False
            space.region_3d.view_location=(0,0,.087);space.region_3d.view_distance=.85;space.region_3d.view_rotation=Vector((.9,1.2,1.3)).to_track_quat('Z','Y')


def Stage_atlas_source_candidate():
    """Create a packed editable review source; this does not grant visual approval."""
    import bpy,datetime,hashlib,json
    from pathlib import Path
    ClearFreshTaskScene()
    Stage_model()
    root=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K06_PancakeBasket')
    scene=bpy.context.scene;ApplyWickerAtlases(scene,root/'Materials')
    assert all(o.type in {'MESH','EMPTY'} for o in scene.objects)
    scene['K06CandidateOnly']=True
    folder=root/'Refinement'/'SourceCandidates';folder.mkdir(parents=True,exist_ok=True)
    token=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    glb=folder/('Model_K06_AtlasSourceCandidate_'+token+'.glb');blend=folder/('Scene_K06_AtlasSourceCandidate_'+token+'.blend')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True)
    FinalizeGlbTangents(glb)
    # Default native editing view shows the closed state; the exported GLB
    # retains both independent roots for its state selector.
    for state in ('Intact','Opened'):
        ancestor=bpy.data.objects['PancakeBasket_'+state]
        collection=bpy.data.collections.new('K06_'+state);scene.collection.children.link(collection)
        def belongs(obj):
            while obj:
                if obj is ancestor:return True
                obj=obj.parent
            return False
        for obj in [o for o in scene.objects if belongs(o)]:
            for previous in list(obj.users_collection):previous.objects.unlink(obj)
            collection.objects.link(obj)
        bpy.context.view_layer.update()
        layer=bpy.context.view_layer.layer_collection.children[collection.name]
        layer.hide_viewport=(state=='Opened');collection.hide_render=(state=='Opened')
    for material in list(bpy.data.materials):
        if material.users==0:bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users==0:bpy.data.images.remove(image)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    assert blend.is_file() and glb.is_file()
    receipt={'candidateOnly':True,'visualApproved':False,'userApproved':False,'buildScript':SnapshotBuildScript(root),'glb':str(glb),'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'blend':str(blend),'blendSha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'nativeDefaultVisibleState':'Intact','exportedStates':['Intact','Opened']}
    glb.with_suffix('.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print('ATLAS_SOURCE_CANDIDATE',blend,glb)


def RunFullWeaveStudy(function):
    previous=globals().get('K06_FULL_WEAVE_STUDY',False);globals()['K06_FULL_WEAVE_STUDY']=True
    try:return function()
    finally:globals()['K06_FULL_WEAVE_STUDY']=previous


def Stage_bake_full_rim():return RunFullWeaveStudy(Stage_bake_bundle)
def Stage_prepare_full_rim():return RunFullWeaveStudy(Stage_prepare_bundle)
def Stage_bake_full_bottom():return RunFullWeaveStudy(Stage_bake_bottom)
def Stage_prepare_full_bottom():return RunFullWeaveStudy(Stage_prepare_bottom)
def Stage_full_weave_model():return RunFullWeaveStudy(Stage_model)
def Stage_full_weave_source_candidate():return RunFullWeaveStudy(Stage_atlas_source_candidate)


def Stage_bake_body_lod():
    """Controlled solid-tube reduction study. This does not replace canonical."""
    import bpy,bmesh,math,json
    import numpy as np
    from pathlib import Path
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    scene=ClearFreshTaskScene();scene.render.engine='CYCLES';scene.cycles.samples=32
    folder=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/BodyLodStudy');folder.mkdir(exist_ok=True)
    source=folder.parent/'FullWeaveStudy/Scene_K06WallOuterHighBake.blend'
    with bpy.data.libraries.load(str(source),link=False) as (src,dst):dst.objects=['WallStudyHigh']
    high=dst.objects[0];scene.collection.objects.link(high)
    high.data.calc_loop_triangles();sourceTriangles=len(high.data.loop_triangles);parts=[];partTriangles=[]
    # Reducing the entire basket at once deletes thin stakes first. Reserve a
    # closed solid for every source twig, then allocate the reduction per twig.
    for strand in range(63):
        polygons=[p for p in high.data.polygons if p.material_index==strand]
        indices=sorted({v for p in polygons for v in p.vertices});mapping={v:i for i,v in enumerate(indices)}
        data=bpy.data.meshes.new('ReducedTwig'+str(strand));data.from_pydata([tuple(high.data.vertices[i].co) for i in indices],[],[tuple(mapping[v] for v in p.vertices) for p in polygons]);data.materials.append(high.data.materials[strand]);data.update()
        part=bpy.data.objects.new('ReducedTwig'+str(strand),data);scene.collection.objects.link(part)
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=12);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free();data.calc_loop_triangles()
        bpy.ops.object.select_all(action='DESELECT');part.select_set(True);bpy.context.view_layer.objects.active=part
        reducer=part.modifiers.new('TwigVolumeReduction','DECIMATE');reducer.decimate_type='COLLAPSE';reducer.ratio=(60 if strand<21 else 14)/len(data.loop_triangles);reducer.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=reducer.name);part.data.calc_loop_triangles();partTriangles.append(len(part.data.loop_triangles));assert partTriangles[-1]>=4
        parts.append(part)
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:part.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();low=parts[0];low.name='K06_PhysicalBodyLod'
    retained=sorted({p.material_index for p in low.data.polygons});assert retained==list(range(63)),('Lost high twigs',retained)
    bm=bmesh.new();bm.from_mesh(low.data)
    border=[e for e in bm.edges if e.is_boundary];bmesh.ops.holes_fill(bm,edges=border,sides=12)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(low.data);bm.free();low.data.update()
    while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='BodyLodUV')
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0035);bpy.ops.object.mode_set(mode='OBJECT')
    material=bpy.data.materials.new('Wicker_SolidBodyLod');material.use_nodes=True;low.data.materials.clear();low.data.materials.append(material)
    for poly in low.data.polygons:poly.material_index=0;poly.use_smooth=True
    baked={};nodes=material.node_tree.nodes;links=material.node_tree.links
    for kind,suffix in [('DIFFUSE','Base'),('NORMAL','Normal'),('AO','Ao'),('ROUGHNESS','Roughness')]:
        image=bpy.data.images.new('Texture_K06BodyLod'+suffix,width=2048,height=2048,alpha=False)
        if kind!='DIFFUSE':image.colorspace_settings.name='Non-Color'
        node=nodes.new('ShaderNodeTexImage');node.image=image;nodes.active=node
        bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
        args={'type':kind,'use_selected_to_active':True,'use_cage':False,'cage_extrusion':.012,'max_ray_distance':.035,'margin':8}
        if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
        bpy.ops.object.bake(**args);image.filepath_raw=str(folder/('Texture_K06BodyLod'+suffix+'.png'));image.file_format='PNG';image.save();image.pack();baked[suffix]=image;nodes.remove(node);print('SOLID_BODY_BAKED',kind)
    ao=np.asarray(baked['Ao'].pixels[:],dtype=np.float32).reshape(-1,4)[:,0];rough=np.asarray(baked['Roughness'].pixels[:],dtype=np.float32).reshape(-1,4)[:,0]
    pixels=np.stack((ao,rough,np.zeros_like(ao),np.ones_like(ao)),axis=1)
    orm=bpy.data.images.new('Texture_K06BodyLodOrm',width=2048,height=2048,alpha=False);orm.colorspace_settings.name='Non-Color';orm.pixels.foreach_set(pixels.reshape(-1));orm.filepath_raw=str(folder/'Texture_K06BodyLodOrm.png');orm.file_format='PNG';orm.save();orm.pack()
    bs=nodes.get('Principled BSDF');base=nodes.new('ShaderNodeTexImage');base.image=baked['Base'];links.new(base.outputs['Color'],bs.inputs['Base Color'])
    normal=nodes.new('ShaderNodeTexImage');normal.image=baked['Normal'];nm=nodes.new('ShaderNodeNormalMap');links.new(normal.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    packed=nodes.new('ShaderNodeTexImage');packed.image=orm;separate=nodes.new('ShaderNodeSeparateColor');links.new(packed.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],bs.inputs['Roughness'])
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output');out=nodes.new('ShaderNodeGroup');out.node_tree=group;links.new(separate.outputs['Red'],out.inputs['Occlusion'])
    bpy.data.objects.remove(high,do_unlink=True);low.data.calc_loop_triangles()
    report={'source':str(source),'sourceTriangles':sourceTriangles,'lowTriangles':len(low.data.loop_triangles),'retainedTwigs':len(retained),'perTwigTriangles':partTriangles,'visualApproved':False,'candidateOnly':True}
    (folder/'Data_BodyLodStudy.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Scene_K06BodyLod.blend'));print('SOLID_BODY_LOD',report)


def Stage_bake_covered_wall():
    """Near/far weave projection study; coverage comes only from actual twigs."""
    import bpy,bmesh,math
    import numpy as np
    from pathlib import Path
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group
    scene=ClearFreshTaskScene();scene.render.engine='CYCLES';scene.cycles.samples=32
    folder=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials/CoveredWallStudy');folder.mkdir(exist_ok=True)
    with bpy.data.libraries.load(str(folder.parent/'FullWeaveStudy/Scene_K06WallOuterHighBake.blend'),link=False) as (src,dst):dst.objects=['WallStudyHigh']
    high=dst.objects[0];scene.collection.objects.link(high)
    group=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
    for inside in (False,True):
        label='Inner' if inside else 'Outer';verts=[];faces=[];uvfaces=[];segments=32;levels=tuple(BodyHeight(z) for z in (.005,.090,.1698));levelCount=len(levels)
        for j in range(segments+1):
            a=2*math.pi*j/segments
            for z in levels:
                depth=.001+.0017*min(1,max(0,(BodyAuthorHeight(z)-.005)/.021));r=BodyMeanRadius(z,a)+(-depth if inside else depth)
                verts.append((r*math.cos(a),r*math.sin(a),z))
        for j in range(segments):
            for k in range(levelCount-1):
                q=(j*levelCount+k,(j+1)*levelCount+k,(j+1)*levelCount+k+1,j*levelCount+k+1);uv=((j/segments,BodyAuthorHeight(levels[k])/.18),((j+1)/segments,BodyAuthorHeight(levels[k])/.18),((j+1)/segments,BodyAuthorHeight(levels[k+1])/.18),(j/segments,BodyAuthorHeight(levels[k+1])/.18))
                faces.append(tuple(reversed(q)) if inside else q);uvfaces.append(tuple(reversed(uv)) if inside else uv)
        data=bpy.data.meshes.new('CoveredWall'+label);data.from_pydata(verts,[],faces);data.update();low=bpy.data.objects.new('K06_CoveredWall'+label,data);scene.collection.objects.link(low)
        layer=data.uv_layers.new(name='CylinderUV')
        for poly,coords in zip(data.polygons,uvfaces):
            poly.use_smooth=True
            for loop,uv in zip(poly.loop_indices,coords):layer.data[loop].uv=uv
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
        mat=bpy.data.materials.new('Wicker_Covered'+label);mat.use_nodes=True;mat.use_backface_culling=True;data.materials.append(mat);nodes=mat.node_tree.nodes;links=mat.node_tree.links;baked={}
        cageMesh=data.copy();cage=bpy.data.objects.new('CoveredRadialCage'+label,cageMesh);scene.collection.objects.link(cage);cage.hide_render=True
        for vertex in cageMesh.vertices:
            r=math.hypot(vertex.co.x,vertex.co.y);direction=-1 if inside else 1;vertex.co.x*=1+direction*.014/r;vertex.co.y*=1+direction*.014/r
        for kind,suffix in [('DIFFUSE','Base'),('NORMAL','Normal'),('AO','Ao'),('ROUGHNESS','Roughness'),('EMIT','Coverage')]:
            saved=[]
            if kind=='EMIT':
                for sourceMaterial in high.data.materials:
                    n=sourceMaterial.node_tree.nodes;l=sourceMaterial.node_tree.links;output=n.get('Material Output');old=output.inputs['Surface'].links[0].from_socket;emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(1,1,1,1);l.new(emission.outputs[0],output.inputs['Surface']);saved.append((sourceMaterial,output,old,emission))
            image=bpy.data.images.new('Texture_K06Covered'+label+suffix,width=4096,height=512,alpha=True)
            if kind!='DIFFUSE':image.colorspace_settings.name='Non-Color'
            node=nodes.new('ShaderNodeTexImage');node.image=image;nodes.active=node
            bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
            args={'type':kind,'use_selected_to_active':True,'use_cage':True,'cage_object':cage.name,'cage_extrusion':0,'max_ray_distance':.60 if not inside else .035,'margin':0 if kind=='EMIT' else 8}
            if kind=='DIFFUSE':args['pass_filter']={'COLOR'}
            bpy.ops.object.bake(**args);baked[suffix]=image;nodes.remove(node)
            for sourceMaterial,output,old,emission in saved:sourceMaterial.node_tree.links.new(old,output.inputs['Surface']);sourceMaterial.node_tree.nodes.remove(emission)
            print('COVERED_WALL_BAKED',label,kind)
        color=np.asarray(baked['Base'].pixels[:],dtype=np.float32).reshape(-1,4);color[:,3]=np.asarray(baked['Coverage'].pixels[:],dtype=np.float32).reshape(-1,4)[:,0];baked['Base'].pixels.foreach_set(color.reshape(-1))
        ao=np.asarray(baked['Ao'].pixels[:],dtype=np.float32).reshape(-1,4)[:,0];rough=np.asarray(baked['Roughness'].pixels[:],dtype=np.float32).reshape(-1,4)[:,0];pixels=np.stack((ao,rough,np.zeros_like(ao),np.ones_like(ao)),axis=1)
        orm=bpy.data.images.new('Texture_K06Covered'+label+'Orm',width=4096,height=512,alpha=False);orm.colorspace_settings.name='Non-Color';orm.pixels.foreach_set(pixels.reshape(-1));baked['Orm']=orm
        for suffix,image in baked.items():image.filepath_raw=str(folder/('Texture_K06Covered'+label+suffix+'.png'));image.file_format='PNG';image.save();image.pack()
        bs=nodes.get('Principled BSDF');base=nodes.new('ShaderNodeTexImage');base.image=baked['Base'];links.new(base.outputs['Color'],bs.inputs['Base Color']);clip=nodes.new('ShaderNodeMath');clip.operation='ROUND';links.new(base.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],bs.inputs['Alpha'])
        normal=nodes.new('ShaderNodeTexImage');normal.image=baked['Normal'];nm=nodes.new('ShaderNodeNormalMap');links.new(normal.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
        packed=nodes.new('ShaderNodeTexImage');packed.image=orm;separate=nodes.new('ShaderNodeSeparateColor');links.new(packed.outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],bs.inputs['Roughness']);out=nodes.new('ShaderNodeGroup');out.node_tree=group;links.new(separate.outputs['Red'],out.inputs['Occlusion'])
        bpy.data.objects.remove(cage,do_unlink=True);low.hide_render=True
    bpy.data.objects.remove(high,do_unlink=True)
    for obj in scene.objects:obj.hide_render=False
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Scene_K06CoveredWall.blend'))


def Stage_build_wall_high():
    previous=globals().get('K06_WALL_HIGH_ONLY',False);globals()['K06_WALL_HIGH_ONLY']=True
    try:return Stage_bake_wall_study()
    finally:globals()['K06_WALL_HIGH_ONLY']=previous


def Stage_prepare_lid_inner():
    previous=globals().get('K06_PREPARE_LID_INNER',False);globals()['K06_PREPARE_LID_INNER']=True
    try:return Stage_prepare_lid()
    finally:globals()['K06_PREPARE_LID_INNER']=previous


def Stage_prepare_lid_surface():
    previous=globals().get('K06_PREPARE_LID_SURFACE',False);globals()['K06_PREPARE_LID_SURFACE']=True
    try:return Stage_prepare_lid()
    finally:globals()['K06_PREPARE_LID_SURFACE']=previous


def Stage_prepare_intrinsic_textures():
    """Local texture study: preserve alpha, infer relief, separate broad normal-correlated shading."""
    from pathlib import Path
    import importlib.util,json,hashlib,subprocess,sys
    import numpy as np
    from PIL import Image
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='backslashreplace')
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket')
    script=BuildScriptPath().parents[2]/'_import'/'Script_BakePbrTexture.py'
    spec=importlib.util.spec_from_file_location('K06PbrStudy',script);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    reports={};referenceMaterials=bool(globals().get('K06_REFERENCE_MATERIALS'));materialRoot=root/'Materials'/('ReferenceIntrinsic' if referenceMaterials else '')
    for kind,span,seam in [('Lid',.5,'none'),('Body',1.5 if referenceMaterials else .25,'weld')]:
        source=materialRoot/('Texture_K06'+kind+'IntrinsicSource.png');raw=Image.open(source).convert('RGBA');side=max(raw.size)
        square=Image.new('RGBA',(side,side));top=(side-raw.height)//2;left=(side-raw.width)//2;square.paste(raw,(left,top));small=square.resize((1024,1024),Image.Resampling.LANCZOS)
        a=np.asarray(small).copy();alpha=a[:,:,3];valid=alpha>=128;rgb=a[:,:,:3].astype(np.float64)/255
        denominator=baker.GaussianPeriodic(valid.astype(float),6)
        weighted=baker.GaussianPeriodic(rgb*valid[:,:,None],6);mean=rgb[valid].mean(axis=0)
        filled=np.where((denominator>1e-4)[:,:,None],weighted/np.maximum(denominator[:,:,None],1e-4),mean)
        filled[valid]=rgb[valid];filled=np.clip(filled,0,1)
        height=(.15+.85*baker.HeightFromLuma(baker.SrgbToLinear(filled),1024,fineWeight=.75))*(alpha/255)
        normals=baker.NormalFromHeight(height,.002,span,1,'gl')
        linear=baker.SrgbToLinear(filled);luma=baker.LinearLuminance(linear);x=np.concatenate((np.ones((1024,1024,1)),normals),axis=2)
        use=valid&(luma>.02)&(luma<.9);samples=x[use];target=luma[use]
        coefficients=np.linalg.lstsq(samples,target,rcond=None)[0]
        illumination=np.sum(x*coefficients,axis=2);average=np.median(illumination[use]);relative=np.clip(illumination/max(average,1e-4),.65,1.5)
        corrected=np.clip(linear/relative[:,:,None],0,1);color=np.uint8(np.clip(baker.LinearToSrgb(corrected)*255,0,255))
        out=Image.fromarray(color,'RGB').convert('RGBA');out.putalpha(Image.fromarray(alpha,'L'));assert np.array_equal(np.asarray(out)[:,:,3],alpha)
        prepared=materialRoot/('Texture_K06'+kind+'IntrinsicPrepared.png');heightPath=materialRoot/('Texture_K06'+kind+'IntrinsicHeight.png');out.save(prepared);Image.fromarray(np.uint8(height*255),'L').save(heightPath)
        folder=materialRoot/(kind+'IntrinsicBaked')
        args=['--source',str(prepared),'--height',str(heightPath),'--name','K06'+kind+'Intrinsic','--preset','weatheredWood','--tile-m',str(span),'--size','1024','--data-size','1024','--keep-alpha','--mean','.48,.45,.40','--contrast','.10','--tone-strength','.65','--seamless',seam,'--row-flatten','off','--no-flatten','--uv-atlas-reason','Full artist UV atlas with actual alpha apertures; generated C reconstruction, not a measured specimen','--relief-m','.002','--normal-strength','1','--rough','.90','--rough-var','.04','--ao','.40','--data-quality','90','--out',str(folder),'--preview-dir',str(folder/'Preview'),'--no-record']
        result=subprocess.run([sys.executable,str(script),*args],check=True,capture_output=True,text=True,encoding='utf-8');print(result.stdout)
        reports[kind]={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rawPixels':raw.size,'sourceSquarePixels':side,'sourceBandV':[1-(top+raw.height)/side,1-top/side],'physicalImageSpanMeters':span,'normalMethod':'height-from-luma inference at fineWeight .75, alpha constrained; not measured geometry','delighting':'least-squares normal-correlated intensity separation, bounded .65..1.5; approximation only','delightingCoefficients':coefficients.tolist(),'sourceCoveragePreservedBeforeSeamBake':True,'bakerArguments':args,'bakerStdout':result.stdout,'strictStandardPassClaimed':False,'outputs':{channel:hashlib.sha256((folder/('Texture_K06'+kind+'Intrinsic'+channel+'.webp')).read_bytes()).hexdigest() for channel in ('Base','Normal','Orm')}}
        reports[kind]['bodyUvURepeat']=1 if referenceMaterials else 6
        reports[kind]['sourceKind']='supplied reference photo extraction' if referenceMaterials else 'imagegen C reconstruction'
    (materialRoot/'Data_IntrinsicAtlasPreparation.json').write_text(json.dumps(reports,indent=2),encoding='utf-8');print('INTRINSIC_ATLASES_PREPARED')


def Stage_prepare_bare_willow():
    import numpy as np
    from PIL import Image
    from pathlib import Path
    folder=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials')
    rgb=np.asarray(Image.open(folder/'Texture_K06RimNativeBase.webp').convert('RGB'),dtype=np.float32)/255
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);linear=np.clip(linear*1.25,0,1)
    corrected=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
    Image.fromarray(np.uint8(np.clip(corrected*255,0,255)),'RGB').save(folder/'Texture_K06RimAuthoredBase.webp','WEBP',lossless=True,method=6)


def Stage_prepare_normalized_materials():
    """Filter into the measured density budget while keeping source images intact."""
    from pathlib import Path
    from PIL import Image
    import numpy as np,hashlib,json,importlib.util,datetime
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket/Materials')
    target=root/'RuntimeNormalized';target.mkdir(exist_ok=True)
    preparation=json.loads((root/'Data_IntrinsicAtlasPreparation.json').read_text(encoding='utf-8'))
    bakerPath=BuildScriptPath().parents[2]/'_import'/'Script_BakePbrTexture.py'
    spec=importlib.util.spec_from_file_location('K06NormalizedBaker',bakerPath);baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    presets=json.loads((bakerPath.parent/'Data_TextureBakePresets.json').read_text(encoding='utf-8'))
    def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
    def resize(value,size):
        if value.ndim==3:return np.stack([resize(value[:,:,i],size) for i in range(value.shape[2])],axis=2)
        return np.asarray(Image.fromarray(value.astype(np.float32),'F').resize((size,size),Image.Resampling.LANCZOS),dtype=float)
    reports={};newPreparation={}
    for kind,size,span in (('Lid',512,.5),('Body',256,.25),('Rim',64,.08)):
        source=root/(kind+'IntrinsicBaked') if kind!='Rim' else root
        out=target/(kind+'IntrinsicBaked') if kind!='Rim' else target;out.mkdir(exist_ok=True)
        names={channel:('Texture_K06'+kind+'Intrinsic'+channel+'.webp') if kind!='Rim' else ('Texture_K06RimAuthoredBase.webp' if channel=='Base' else 'Texture_K06RimNative'+channel+'.webp') for channel in ('Base','Normal','Orm')}
        pixels={channel:np.asarray(Image.open(source/name).convert('RGBA'),dtype=float)/255 for channel,name in names.items()}
        base=pixels['Base'];alpha=np.clip(resize(base[:,:,3],size),0,1)
        premul=resize(baker.SrgbToLinear(base[:,:,:3])*base[:,:,3,None],size)
        linear=premul/np.maximum(alpha[:,:,None],1e-8);fallback=resize(baker.SrgbToLinear(base[:,:,:3]),size);linear=np.where((alpha<.02)[:,:,None],fallback,linear)
        color=np.clip(baker.LinearToSrgb(linear),0,1);correction=None
        if kind=='Body':
            linear=baker.SrgbToLinear(color);low=baker.GaussianPeriodic(linear.mean(axis=2),size/16);gain=np.clip((np.median(low)/np.maximum(low,1e-6))**.85,.92,1.08)
            color=np.clip(baker.LinearToSrgb(linear*gain[:,:,None]),0,1)
            correction={'sigmaPixels':size/16,'gainPower':.85,'linearGainMin':float(gain.min()),'linearGainMax':float(gain.max()),'status':'bounded inferred delighting, not measured albedo'}
        coverage=float((base[:,:,3]>=.5).mean());rank=min(alpha.size-1,max(0,int(round((1-coverage)*alpha.size))));threshold=float(np.partition(alpha.ravel(),rank)[rank]);alpha=np.ones_like(alpha) if coverage>.9999 else np.clip(alpha+(.5-threshold),0,1)
        weight=base[:,:,3];mean=resize((pixels['Normal'][:,:,:3]*2-1)*weight[:,:,None],size)/np.maximum(resize(weight,size)[:,:,None],1e-6)
        length=np.linalg.norm(mean,axis=2);normal=mean/np.maximum(length[:,:,None],1e-6);normal[length<1e-6]=(0,0,1)
        orm=np.clip(resize(pixels['Orm'],size),0,1);orm[:,:,1]=np.sqrt(np.clip(orm[:,:,1]**2+.25*(1-np.clip(length,0,1)),0,1))
        outputs={'Base':np.dstack((color,alpha)),'Normal':np.dstack((normal*.5+.5,np.ones((size,size)))),'Orm':orm}
        rows=[]
        for channel,value in outputs.items():
            path=out/names[channel];image=Image.fromarray(np.uint8(np.clip(np.rint(value*255),0,255)),'RGBA')
            if channel=='Base':image.save(path,'WEBP',quality=90,method=6,alpha_quality=100)
            else:image.save(path,'WEBP',lossless=True,method=6,exact=True)
            rows.append({'channel':channel,'file':str(path),'bytes':path.stat().st_size,'sha256':digest(path),'pixels':[size,size],'source':str(source/names[channel]),'sourceSha256':digest(source/names[channel])})
        saved=np.asarray(Image.open(out/names['Base']).convert('RGBA'),dtype=float)/255;savedCoverage=float((saved[:,:,3]>=.5).mean());assert abs(coverage-savedCoverage)<.003
        metrics={**baker.ToneMetrics(saved[:,:,:3]),**baker.TileMetrics(saved[:,:,:3]),'texelsPerMeter':size/span}
        problems=baker.CheckGates(metrics,sum(row['bytes'] for row in rows),rows,presets['gates'],presets['classes']['weatheredWood'],uv_atlas=(kind=='Lid'))
        assert not problems,(kind,problems)
        reports[kind]={'size':size,'physicalImageSpanMeters':span,'metrics':metrics,'problems':problems,'outputs':rows,'sourceMaskCoverage':coverage,'savedMaskCoverage':savedCoverage,'broadIlluminationCorrection':correction,'normalFilter':'alpha-weighted mean vector, renormalized','roughnessFilter':'sqrt(r^2+.25*(1-length(mean normal)))','spatialGateScope':'nonrepeated full lid author UV atlas' if kind=='Lid' else 'repeating material including spatial gates'}
        if kind in preparation:
            original=preparation[kind];newPreparation[kind]={key:original[key] for key in ('source','sourceSha256','rawPixels','sourceSquarePixels','sourceBandV','physicalImageSpanMeters','normalMethod','delighting','delightingCoefficients','sourceCoveragePreservedBeforeSeamBake') if key in original}
            newPreparation[kind].update(bodyUvURepeat=original.get('bodyUvURepeat',6),normalizationRecipe='Data_TextureNormalization.json',sourcePreparationReport='../Data_IntrinsicAtlasPreparation.json',outputs={row['channel']:row['sha256'] for row in rows},normalizedPixels=[size,size],measuredMaterialGatesPass=True,runtimeRegistered=False)
        print('NORMALIZED_MATERIAL',kind,size,'density',metrics['texelsPerMeter'],'bytes',sum(row['bytes'] for row in rows),'PASS')
    receipt={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildScript':SnapshotBuildScript(root.parent),'referenceStatus':'generated C reconstruction; approximate color delighting and relief inference','sets':reports,'runtimeRegistered':False,'userApproved':False}
    (target/'Data_TextureNormalization.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    (target/'Data_IntrinsicAtlasPreparation.json').write_text(json.dumps(newPreparation,ensure_ascii=False,indent=2),encoding='utf-8')


def Stage_compress_model():
    """System Python: exact RGBA PNG -> lossless WebP, retaining geometry bytes."""
    from pathlib import Path
    from PIL import Image
    import struct,json,io,hashlib,datetime
    import numpy as np
    root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/VillageInteriorProps/K06_PancakeBasket');path=root/'K06_PancakeBasket.glb';raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
    oldViews=[binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in doc['bufferViews']];imageViews={im['bufferView'] for im in doc.get('images',[])};graph=json.dumps({k:doc.get(k) for k in ('nodes','meshes','accessors','scenes')},sort_keys=True);replacements={};rows=[]
    for index,image in enumerate(doc.get('images',[])):
        if image.get('mimeType')!='image/png':continue
        original=oldViews[image['bufferView']];decoded=Image.open(io.BytesIO(original)).convert('RGBA');encoded=io.BytesIO();decoded.save(encoded,'WEBP',lossless=True,method=6,exact=True);data=encoded.getvalue()
        assert np.array_equal(np.asarray(decoded),np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))),image.get('name')
        replacements[image['bufferView']]=data;image['mimeType']='image/webp';rows.append({'image':index,'name':image.get('name'),'pixels':list(decoded.size),'beforeBytes':len(original),'afterBytes':len(data),'decodedRgbaIdentical':True})
    for texture in doc.get('textures',[]):
        if 'source' in texture:
            imageIndex=texture.pop('source');texture.setdefault('extensions',{})['EXT_texture_webp']={'source':imageIndex}
    for key in ('extensionsUsed','extensionsRequired'):
        if 'EXT_texture_webp' not in doc.setdefault(key,[]):doc[key].append('EXT_texture_webp')
    rebuilt=bytearray()
    for index,view in enumerate(doc['bufferViews']):
        rebuilt.extend(b'\0'*((-len(rebuilt))%4));value=replacements.get(index,oldViews[index]);view.update(byteOffset=len(rebuilt),byteLength=len(value));rebuilt.extend(value)
        if index not in imageViews:assert value==oldViews[index]
    rebuilt.extend(b'\0'*((-len(rebuilt))%4));doc['buffers'][0]['byteLength']=len(rebuilt)
    assert graph==json.dumps({k:doc.get(k) for k in ('nodes','meshes','accessors','scenes')},sort_keys=True)
    payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4)
    result=struct.pack('<III',0x46546c67,2,28+len(payload)+len(rebuilt))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(rebuilt),0x004e4942)+rebuilt;path.write_bytes(result)
    report={'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeSha256':hashlib.sha256(raw).hexdigest(),'afterSha256':hashlib.sha256(result).hexdigest(),'beforeBytes':len(raw),'afterBytes':len(result),'allNonImageBufferViewsIdentical':True,'sceneMeshAccessorDescriptionsIdentical':True,'conversion':'same resolution and exact decoded RGBA; original WebP payloads retained','converted':rows}
    (root/'Materials/RuntimeNormalized/Data_EmbeddedPackaging.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('EXACT_EMBEDDED_WEBP',len(raw),'->',len(result),'images',len(rows))


def Stage_prepare_materials():
    Stage_prepare_rim_native();Stage_prepare_bare_willow();Stage_prepare_intrinsic_textures();Stage_prepare_normalized_materials()


def Stage_final_model():
    ClearFreshTaskScene()
    previousFull=globals().get('K06_FULL_WEAVE_STUDY',False);previousAtlas=globals().get('K06_APPLY_ATLASES',False)
    previousBody=globals().get('K06_BODY_REPRESENTATION');globals()['K06_BODY_REPRESENTATION']='covered'
    previousIntrinsic=globals().get('K06_INTRINSIC_WEAVE',False);globals()['K06_INTRINSIC_WEAVE']=True
    previousNormalized=globals().get('K06_NORMALIZED_TEXTURES',False);globals()['K06_NORMALIZED_TEXTURES']=not globals().get('K06_REFERENCE_MATERIALS')
    previousContinuous=globals().get('K06_CONTINUOUS_LID',False);globals()['K06_CONTINUOUS_LID']=not globals().get('K06_REFERENCE_MATERIALS') and os.environ.get('K06_LID_MODE','continuous')=='continuous'
    previousRound=globals().get('K06_ROUND_WEAVE_RUNTIME',False);globals()['K06_ROUND_WEAVE_RUNTIME']=not globals().get('K06_REFERENCE_MATERIALS') and os.environ.get('K06_LID_MODE','continuous') in ('round','continuous')
    previousAligned=globals().get('K06_ALIGNED_LID_GEOMETRY',False);globals()['K06_ALIGNED_LID_GEOMETRY']=not globals().get('K06_REFERENCE_MATERIALS') and not globals()['K06_ROUND_WEAVE_RUNTIME']
    globals().pop('K06_COVERED_BODY_TEMPLATES',None)
    globals()['K06_FULL_WEAVE_STUDY']=True;globals()['K06_APPLY_ATLASES']=True
    try:return Stage_model()
    finally:
        globals()['K06_FULL_WEAVE_STUDY']=previousFull;globals()['K06_APPLY_ATLASES']=previousAtlas
        globals()['K06_BODY_REPRESENTATION']=previousBody
        globals()['K06_INTRINSIC_WEAVE']=previousIntrinsic
        globals()['K06_NORMALIZED_TEXTURES']=previousNormalized
        globals()['K06_ALIGNED_LID_GEOMETRY']=previousAligned
        globals()['K06_ROUND_WEAVE_RUNTIME']=previousRound
        globals()['K06_CONTINUOUS_LID']=previousContinuous


STAGES = {'bake_full_bottom':Stage_bake_full_bottom,'prepare_full_bottom':Stage_prepare_full_bottom,'bake_full_rim':Stage_bake_full_rim,'prepare_full_rim':Stage_prepare_full_rim,'full_weave_model':Stage_full_weave_model,'full_weave_source_candidate':Stage_full_weave_source_candidate,'bake_wall_study':Stage_bake_wall_study,'prepare_wall_study':Stage_prepare_wall_study,'atlas_source_candidate': Stage_atlas_source_candidate, 'prepare_rim_native': Stage_prepare_rim_native, 'prepare_twig': Stage_prepare_twig, 'bake_weave': Stage_bake_weave, 'combine_weave': Stage_combine_weave, 'bake_lid': Stage_bake_lid, 'bake_center': Stage_bake_center, 'bake_wall': Stage_bake_wall, 'bake_bottom': Stage_bake_bottom, 'bake_bundle': Stage_bake_bundle, 'prepare_lid': Stage_prepare_lid, 'prepare_center': Stage_prepare_center, 'prepare_wall': Stage_prepare_wall, 'prepare_bottom': Stage_prepare_bottom, 'prepare_bundle': Stage_prepare_bundle, 'blend_center': Stage_blend_center, 'assemble_pilot': Stage_assemble_pilot, 'model': Stage_final_model, 'final_model': Stage_final_model, 'baseline_model': Stage_model}
STAGES['bake_body_lod']=Stage_bake_body_lod
STAGES['bake_covered_wall']=Stage_bake_covered_wall
STAGES['build_wall_high']=Stage_build_wall_high
STAGES['bake_lid_inner']=Stage_bake_lid_inner
STAGES['prepare_lid_inner']=Stage_prepare_lid_inner
STAGES['bake_lid_surface']=Stage_bake_lid_surface
STAGES['prepare_lid_surface']=Stage_prepare_lid_surface
STAGES['prepare_wood_appearance']=Stage_prepare_wood_appearance
STAGES['prepare_materials']=Stage_prepare_materials
STAGES['prepare_intrinsic_textures']=Stage_prepare_intrinsic_textures
STAGES['prepare_bare_willow']=Stage_prepare_bare_willow
STAGES['prepare_normalized_materials']=Stage_prepare_normalized_materials
STAGES['compress_model']=Stage_compress_model
STAGES['bake_physical_lid']=StageBakePhysicalLid
STAGES['bake_round_lid']=StageBakeRoundWeave
STAGES['prepare_round_lid']=StagePrepareRoundWeave
STAGES['bake_continuous_lid']=StageBakeContinuousLid
STAGES['prepare_continuous_lid']=StagePrepareContinuousLid
STAGES['prepare_willow_wood_v2']=StagePrepareWillowWoodV2
STAGES['bake_lid_assembly_ao']=StageBakeLidAssemblyAo
STAGES['prepare_physical_lid']=StagePreparePhysicalLid
STAGES['prepare_lid_sculpt']=StagePrepareAlignedLidSculpt
STAGES['bake_aligned_lid']=StageBakeAlignedLid
STAGES['prepare_aligned_lid']=StagePrepareAlignedLidPbr
STAGES['bake_aligned_ao']=StageBakeAlignedAssemblyAo
stage = globals().get("K06_STAGE") or os.environ.get("K06_STAGE", "model")
if stage not in STAGES:
    raise ValueError("Unknown K06_STAGE: " + stage)
STAGES[stage]()
