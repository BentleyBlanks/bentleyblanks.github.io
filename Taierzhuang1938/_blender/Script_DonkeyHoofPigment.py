"""Reference RGB horn walls in a separate authoring atlas; baked into UV0."""
import numpy as np

sourceViews=[
 {'leg':'DonkeyFrontLeft','cap':[190,882,252,926],'side':[665,882,736,926],'capCentre':[221.5,220.0],'sideCentre':698},
 {'leg':'DonkeyFrontRight','cap':[60,882,128,926],'side':[632,882,666,926],'capCentre':[91.0,91.0],'sideCentre':660},
 {'leg':'DonkeyRearLeft','cap':[1295,882,1361,926],'side':[1085,882,1155,926],'capCentre':[1325.0,1328.5],'sideCentre':1117},
 {'leg':'DonkeyRearRight','cap':[1420,882,1492,926],'side':[1018,882,1083,926],'capCentre':[1459.0,1453.5],'sideCentre':1050},
]

def BuildSampler(rgb,frames,blur):
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    linear=np.stack([np.clip(linear[:,:,c]+1.25*(linear[:,:,c]-blur(linear[:,:,c],1)),0,1) for c in range(3)],axis=2)
    fields={};records=[];ppm=(925-302)/1.10
    for owner,spec in enumerate(sourceViews):
        for view in ['cap','side']:
            x0,y0,x1,y1=spec[view];patch=rgb[y0:y1,x0:x1];value=patch.mean(axis=2);saturation=(patch.max(axis=2)-patch.min(axis=2))/np.maximum(.001,patch.max(axis=2));good=(value<.58)|(saturation>.09);field=linear[y0:y1,x0:x1].copy();rows=np.flatnonzero(good.any(axis=1));filled=0
            if not len(rows):raise RuntimeError('No actual horn pixels in '+str((owner,view)))
            for y in range(len(good)):
                row=y if good[y].any() else int(rows[np.argmin(abs(rows-y))]);xs=np.flatnonzero(good[row]);target=np.arange(field.shape[1]);right=np.searchsorted(xs,target).clip(0,len(xs)-1);left=np.maximum(0,right-1);near=np.where(abs(xs[left]-target)<=abs(xs[right]-target),xs[left],xs[right]);bad=~good[y];field[y,bad]=linear[y0+row,x0+near[bad]];filled+=int(bad.sum())
            fields[(owner,view)]=(field,x0,y0)
            records.append({'leg':spec['leg'],'view':view,'sourceBounds':[x0,y0,x1,y1],'backgroundPixelsExtendedFromSameHoof':filled,'sourcePixels':int(good.size)})
    def Fetch(owner,view,x,y):
        f,x0,y0=fields[(owner,view)];height,width=f.shape[:2];x=np.clip(x-x0,0,width-1);y=np.clip(y-y0,0,height-1);ix=x.astype(int);iy=y.astype(int);fx=(x-ix)[:,None];fy=(y-iy)[:,None]
        return (f[iy,ix]*(1-fx)+f[iy,np.minimum(ix+1,width-1)]*fx)*(1-fy)+(f[np.minimum(iy+1,height-1),ix]*(1-fx)+f[np.minimum(iy+1,height-1),np.minimum(ix+1,width-1)]*fx)*fy
    def Sample(points,normals,owner):
        spec=sourceViews[owner];front=owner<2;centre=np.array(frames[owner]);normals=normals/np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None];nx,ny,nz=normals.T;radial=np.maximum(.001,np.hypot(nx,ny));nx=nx/radial;ny=ny/radial;nz=np.full_like(nx,.16);normalLength=np.sqrt(1+nz*nz);nx/=normalLength;ny/=normalLength;nz/=normalLength;v=925-ppm*points[:,2];capCentre=spec['capCentre'][0]+(spec['capCentre'][1]-spec['capCentre'][0])*np.clip(points[:,2]/((925-900)/ppm),0,1);u=capCentre+(-1 if front else 1)*ppm*(points[:,0]-centre[0]);cap=Fetch(owner,'cap',u,v);side=Fetch(owner,'side',spec['sideCentre']-ppm*(points[:,1]-centre[1]),v)
        light=np.array([-.3,.5,.81] if front else [.3,-.5,.81]);light/=np.linalg.norm(light);dot=-nx*light[0]+(np.abs(ny) if front else -np.abs(ny))*light[1]+nz*light[2];cap*=.50/(.55+.45*np.maximum(0,dot))[:,None]
        light=np.array([-.4,.5,.76]);light/=np.linalg.norm(light);dot=-np.abs(nx)*light[0]+ny*light[1]+nz*light[2];side*=.50/(.55+.45*np.maximum(0,dot))[:,None];amount=np.abs(ny)**3/np.maximum(.001,np.abs(nx)**3+np.abs(ny)**3)
        return np.clip((cap*amount[:,None]+side*(1-amount[:,None]))*np.array([1,1.03,1.10]),.003,.55)
    return Sample,records

def PaintTriangles(pixels,triangles,sampler):
    height,width=pixels.shape[:2];mask=np.zeros((height,width),bool)
    for owner,positions,normals,uv in triangles:
        q=np.asarray(uv)*[width,height];a,b,c=q;v0=b-a;v1=c-a;det=v0[0]*v1[1]-v0[1]*v1[0]
        if abs(det)<1e-9:continue
        lo=np.maximum(0,np.floor(q.min(axis=0)-.5).astype(int));hi=np.minimum([width-1,height-1],np.ceil(q.max(axis=0)-.5).astype(int))
        if np.any(hi<lo):continue
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];p=np.stack((xx+.5,yy+.5),axis=-1)-a;u=(p[:,:,0]*v1[1]-p[:,:,1]*v1[0])/det;v=(v0[0]*p[:,:,1]-v0[1]*p[:,:,0])/det;inside=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
        if not inside.any():continue
        bary=np.stack((1-u[inside]-v[inside],u[inside],v[inside]),axis=1);values=sampler(bary@np.array(positions),bary@np.array(normals),owner);encoded=np.where(values<=.0031308,values*12.92,1.055*values**(1/2.4)-.055);pixels[yy[inside],xx[inside],:3]=np.rint(encoded*255).clip(0,255).astype(np.uint8);mask[yy[inside],xx[inside]]=True
    return mask

def PadCharts(pixels,mask,rectangles,iterations=5):
    import math
    height,width=mask.shape
    for x,y,w,h in rectangles:
        x0,y0=int(x*width),int(y*height);x1,y1=math.ceil((x+w)*width),math.ceil((y+h)*height);block=pixels[y0:y1,x0:x1];known=mask[y0:y1,x0:x1].copy()
        for iteration in range(iterations):
            previous=known.copy();old=block.copy()
            for dy,dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                valid=np.roll(previous,(dy,dx),(0,1))&~known
                if dy<0:valid[-1]=False
                if dy>0:valid[0]=False
                if dx<0:valid[:,-1]=False
                if dx>0:valid[:,0]=False
                block[valid]=np.roll(old,(dy,dx),(0,1))[valid];known[valid]=True

def InstallHoofPigment(scene,skin,base):
    import bpy,json,hashlib,math
    from pathlib import Path
    if not scene.get('DonkeyHoofColumnsReport'):raise RuntimeError('Horn pigment requires the completed hoof-column fit')
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png');image=bpy.data.images.load(str(source),check_existing=False);rgb=np.array(image.pixels[:],dtype=float).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(image)
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyPhotoDetail.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    mesh=skin.data;points=np.array([v.co for v in mesh.vertices]);owners=mesh.attributes['FootOwner'];coordinates=mesh.attributes['HoofRestCoordinates'];frames=[]
    for owner in range(1,5):
        sole=points[np.array([(owners.data[v.index].value==owner and v.co.z<.006) for v in mesh.vertices])]
        if len(sole)<20:raise RuntimeError('Missing photographic hoof frame')
        frames.append((sole.min(axis=0)+sole.max(axis=0))/2)
    sampler,regions=BuildSampler(rgb,frames,namespace['BoxBlur']);layer=mesh.uv_layers.get('HoofPigmentUV') or mesh.uv_layers.new(name='HoofPigmentUV');material=bpy.data.materials['DonkeyHoofHorn'];horn=mesh.materials.find(material.name)
    for face in mesh.polygons:
        if face.material_index!=horn:continue
        labels={owners.data[i].value for i in face.vertices}
        if len(labels)!=1 or next(iter(labels)) not in (1,2,3,4):raise RuntimeError('Horn pigment has mixed anatomical owners')
        owner=next(iter(labels))-1;angles=[(math.atan2(coordinates.data[i].vector.x,coordinates.data[i].vector.y)+math.pi)/(2*math.pi) for i in face.vertices];crosses=max(angles)-min(angles)>.5
        for loop,angle in zip(face.loop_indices,angles):
            if crosses and angle<.5:angle+=1
            z=coordinates.data[mesh.loops[loop].vertex_index].vector.z;u=.04+.9*angle;v=.04+.9*max(0,min(1,z/.072))
            if not 0<=u<=1:raise RuntimeError('Horn pigment wrap escaped its protected chart')
            layer.data[loop].uv=(u,1-(owner+1)/4+v/4)
    mesh.calc_loop_triangles();triangles=[]
    for triangle in mesh.loop_triangles:
        if mesh.polygons[triangle.polygon_index].material_index!=horn:continue
        owner=owners.data[triangle.vertices[0]].value-1;uv=np.array([layer.data[i].uv[:] for i in triangle.loops]);uv[:,1]=1-uv[:,1]
        triangles.append((owner,points[list(triangle.vertices)],np.array([mesh.corner_normals[i].vector[:] for i in triangle.loops]),uv))
    pixels=np.full((1024,1024,4),255,dtype=np.uint8);mask=PaintTriangles(pixels,triangles,sampler);PadCharts(pixels,mask,[(0,i/4,1,.25) for i in range(4)])
    if mask.sum()<200000:raise RuntimeError('Horn pigment has insufficient raster coverage')
    image=bpy.data.images.new('Texture_DonkeyHoofPigment',width=1024,height=1024,alpha=False);image.colorspace_settings.name='sRGB';image.pixels.foreach_set((pixels[::-1].copy().astype(np.float32)/255).ravel());image.update();path=base/'SourceTextures/Texture_DonkeyHoofPigment.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack()
    probe=bpy.data.images.load(str(path),check_existing=False);decoded=np.array(probe.pixels[:],dtype=np.float32).reshape(1024,1024,4)[::-1];bpy.data.images.remove(probe);error=float(np.max(abs(decoded-pixels/255)))
    if error>1.1/255:raise RuntimeError('Saved hoof pigment pixels differ from the source buffer')
    nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');uvNode=nodes.new('ShaderNodeUVMap');uvNode.uv_map='HoofPigmentUV';texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';texture.interpolation='Closest';links.new(uvNode.outputs['UV'],texture.inputs['Vector']);links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    report={'version':'20261027HoofPigmentV49','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceRegions':regions,'sourceViews':sourceViews,'footFrames':np.array(frames).tolist(),'sourceAtlas':str(path),'sourceAtlasSize':[1024,1024],'hornTriangles':len(triangles),'paintedSourcePixels':int(mask.sum()),'savedPixelMaximumError':error,
        'method':'actual same-hoof frontal/rear and lateral RGB in metric foot frames; source background extends from nearest valid same-hoof wall pixel; smooth normal-azimuth blending and macro illumination compensation; hidden opposite faces reuse the corresponding photographed wall',
        'fineCompensation':{'radiusPixels':1,'amount':1.25},'sourceTexelAspect':4,'runtimeChartRectangles':[[.809,.801+i*.047,.180,.041] for i in range(4)],'runtimeChartAspect':.18/.041,'runtime':'offline bake into shared2048 Base; balanced four continuous horn strips share the existing reserve; normal/roughness retained; no extra runtime image, material or UV'}
    scene['DonkeyHoofPigmentRevision']='20261027HoofPigmentV49';(base/'SourceTextures/Data_HoofPigmentV49.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
