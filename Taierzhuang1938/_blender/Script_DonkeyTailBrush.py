"""Reference hair matte in the existing mane atlas and three bent brush layers."""
import math,json
import numpy as np


def ExtractTailSideProfile(rgb):
    # The side view isolates the tail against the studio floor. The narrow
    # measured envelope excludes the rump above and the hind leg below.
    height,width=384,128
    ys=np.linspace(430,810,height);xs=np.linspace(1165,1212,width)
    yy,xx=np.meshgrid(ys,xs,indexing='ij')
    ix=np.minimum(1534,xx.astype(int));iy=np.minimum(1022,yy.astype(int));fx=(xx-ix)[:,:,None];fy=(yy-iy)[:,:,None]
    sample=(rgb[iy,ix]*(1-fx)+rgb[iy,ix+1]*fx)*(1-fy)+(rgb[iy+1,ix]*(1-fx)+rgb[iy+1,ix+1]*fx)*fy
    linear=np.where(sample<=.04045,sample/12.92,((sample+.055)/1.055)**2.4)
    background=rgb[np.rint(ys).astype(int),1214,:]
    background=np.where(background<=.04045,background/12.92,((background+.055)/1.055)**2.4)
    luma=linear@np.array([.2126,.7152,.0722]);bgLuma=background@np.array([.2126,.7152,.0722])
    rawAlpha=np.clip((bgLuma[:,None]-luma)/np.maximum(.1,bgLuma[:,None]-.018),0,1)
    bounds=[(430,1178,1205),(500,1177,1208),(560,1173,1210),(620,1174,1211),(680,1177,1211),(740,1176,1210),(780,1177,1207),(810,1186,1200)]
    left=np.interp(ys,[r[0] for r in bounds],[r[1] for r in bounds]);right=np.interp(ys,[r[0] for r in bounds],[r[2] for r in bounds])
    edge=np.minimum(np.clip((xx-left[:,None])/1.8,0,1),np.clip((right[:,None]-xx)/1.8,0,1))
    alpha=rawAlpha*edge;alpha[alpha<.035]=0
    # Preserve the measured side centreline independently of new pigment.
    centreline=[]
    for sourceY in range(430,791,12):
        rows=np.abs(ys-sourceY)<6;weight=np.maximum(0,alpha[rows]-.20)
        if weight.sum()>1:centreline.append([sourceY,float(np.sum(weight*xx[rows])/weight.sum())])
    if len(centreline)<20:raise RuntimeError('Original tail has too few foreground rows for a measured centreline')
    report={'version':'20261026TailBrushV43','sourceView':'Side','sourceBounds':bounds,'sourceCropPixels':[1165,430,1212,810],
        'method':'preserved original side alpha-weighted centreline for tail-core alignment',
        'atlasPixelBox':[128,128,512,256],'sourceSampleSize':[width,height],'alphaForegroundPixels':int(np.count_nonzero(alpha>.5)),
        'sideCentrelinePixels':centreline,
        'matteEnvelopeAppliedAfterForegroundRecovery':True,
        'runtimeImagesAdded':0,'runtimeMaterialsAdded':0}
    return report


def TailCentreline(scene,z):
    rows=json.loads(scene['DonkeyTailBrushProfilePixels']);ppm=(925-302)/1.10
    anchor=float(scene['DonkeyReferenceFitAnchorY'])
    xs=np.array([r[0] for r in rows]);ys=np.array([r[1] for r in rows])
    pixel=float(np.interp(925-ppm*z,xs,ys))
    return anchor+(707-pixel)/ppm


def BuildReferenceTailBrush(rig,collection):
    import bpy
    from mathutils import Vector
    old=bpy.data.objects.get('DonkeyReferenceTailBrush')
    if old:bpy.data.objects.remove(old,do_unlink=True)
    vertices=[];faces=[];uvs=[];weights=[]
    layers=3;segments=18
    for layer in range(layers):
        angle=math.pi*layer/layers;start=len(vertices)
        for level in range(segments+1):
            t=level/segments;z=.874-(.874-.203)*t
            centre=Vector((.009,TailCentreline(bpy.context.scene,z),z))
            # Elliptical cross-section matches the wider rear and narrower side
            # brush. Shallow bends and staggered planes avoid a flat cutout.
            centre.x+=.003*math.sin(math.pi*t)*math.sin(angle)
            for q in (-1,1):
                offset=Vector((.066*math.cos(angle),.041*math.sin(angle),0))*q
                vertices.append(centre+offset)
                uvs.append(((128.5+383*t)/512,((63.5 if layer==0 else 127.5)-63*(q+1)*.5)/256))
                weights.append({'DonkeyTailPivot':.35*(1-t),'DonkeyTailTipPivot':.65+.35*t})
            if level:
                a=start+(level-1)*2;faces.append((a,a+1,a+3,a+2))
    mesh=bpy.data.meshes.new('DonkeyReferenceTailBrush');mesh.from_pydata(vertices,[],faces);mesh.update()
    mesh.materials.append(bpy.data.materials['DonkeyManePbr'])
    for face in mesh.polygons:face.use_smooth=True
    uv=mesh.uv_layers.new(name='UVMap');paint=mesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    for color in paint.data:color.color=(.90,.90,.90,1)
    mesh.color_attributes.active_color_index=0;mesh.color_attributes.render_color_index=0
    obj=bpy.data.objects.new('DonkeyReferenceTailBrush',mesh);collection.objects.link(obj);obj.parent=rig
    for index,row in enumerate(weights):
        for name,weight in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],weight,'REPLACE')
    modifier=obj.modifiers.new('DonkeyTailBrushSkin','ARMATURE');modifier.object=rig
    obj['coatCardCount']=len(faces);obj['groomCastShadow']=False;obj.visible_shadow=False
    return {'version':'20261026TailBrushV43','layers':layers,'segmentsPerLayer':segments,'triangles':len(faces)*2,
        'sourceObject':obj.name,'exportLayer':'DonkeyManeRuntime','material':'DonkeyManePbr','atlasPixelBox':[128,128,512,256],
        'widthM':.132,'depthM':.082,'heightRangeM':[.203,.874],'fibresRetained':480,
        'centreline':'alpha-weighted side-reference tail centroids at 12-source-pixel intervals',
        'method':'three curved skinned brush layers; rear-reference pigment on the rear layer, side-reference pigment on the two oblique layers'}


def ExtractTailReference(rgb):
    record=ExtractTailSideProfile(rgb)
    sideBounds=record['sourceBounds']
    rearBounds=[(430,1381,1410),(500,1371,1420),(560,1367,1419),(620,1370,1419),(680,1370,1417),(720,1374,1414),(760,1380,1408),(800,1386,1400),(810,1390,1398)]
    sourceLinear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    def View(crop,bounds,rear=False):
        left,top,right,bottom=crop;ys=np.linspace(top,bottom,384);xs=np.linspace(left,right,64);yy,xx=np.meshgrid(ys,xs,indexing='ij')
        ix=xx.astype(int);iy=yy.astype(int);fx=(xx-ix)[:,:,None];fy=(yy-iy)[:,:,None]
        linear=(sourceLinear[iy,ix]*(1-fx)+sourceLinear[iy,ix+1]*fx)*(1-fy)+(sourceLinear[iy+1,ix]*(1-fx)+sourceLinear[iy+1,ix+1]*fx)*fy
        background=np.quantile(sourceLinear[np.rint(ys).astype(int),1355:1430],.98,axis=1) if rear else sourceLinear[np.rint(ys).astype(int),1214]
        luma=linear@np.array([.2126,.7152,.0722]);bgLuma=background@np.array([.2126,.7152,.0722])
        raw=np.clip((bgLuma[:,None]-luma)/np.maximum(.1,bgLuma[:,None]-.018),0,1)
        t=np.clip((raw-.12)/.55,0,1);coverage=np.maximum(raw,t*t*(3-2*t))
        lo=np.interp(ys,[r[0] for r in bounds],[r[1] for r in bounds]);hi=np.interp(ys,[r[0] for r in bounds],[r[2] for r in bounds])
        edge=np.clip((xx-lo[:,None])/1.8,0,1)*np.clip((hi[:,None]-xx)/1.8,0,1)
        confidence=np.clip((raw-.14)/.14,0,1);confidence=confidence*confidence*(3-2*confidence)
        rootFade=np.clip((ys-430)/45,0,1);rootFade=rootFade*rootFade*(3-2*rootFade)
        alpha=coverage*edge*confidence*rootFade[:,None];alpha[alpha<.035]=0
        # Infer coverage separately from pigment. With alpha==raw, the old
        # equation algebraically flattened every resolved hair to luma .018.
        foreground=(linear-background[:,None,:]*(1-coverage[:,:,None]))/np.maximum(.04,coverage[:,:,None])
        foreground=np.clip(foreground,.004,.45)*np.array([.68,.7004,.748])
        colour=np.where(foreground<=.0031308,foreground*12.92,1.055*foreground**(1/2.4)-.055)
        result=np.concatenate((colour,alpha[:,:,None]),axis=2).astype(np.float32);result[[0,-1],:,3]=0;result[:,[0,-1],3]=0
        return result
    side=View([1165,430,1212,810],sideBounds);rear=View([1356,430,1424,810],rearBounds,True)
    result=np.concatenate((side,rear),axis=1)
    record.update({'version':'20261026TailBrushV43','sourceView':'Side+Rear','sourceSampleSize':[64,384],'foregroundChromaRelativeToTailPalette':None,
        'sideAtlasPixelBox':[128,128,512,192],'rearAtlasPixelBox':[128,192,512,256],
        'rearSourceCropPixels':[1356,430,1424,810],'rearSourceBounds':rearBounds,'rearBackgroundQuantile':.98,
        'backgroundConfidenceRange':[.14,.28],'rootFadePixels':[430,475],'interiorCoveragePromotion':[.12,.67],'opaqueHairPreservesPhotoRgbVariation':True,
        'alphaForegroundPixels':int(np.count_nonzero(result[:,:,3]>.5)),
        'method':'two original tail views in the existing atlas; resolved interior coverage retains photographic pigment instead of flattening it into transparency; edge unmixing precedes anatomical envelope'})
    return result,record

def SampleTailPigment(point,pixels,anchor,fallback):
    ppm=(925-302)/1.10;v=925-ppm*point[2];samples=[];weights=[]
    for offset,u,left,right in [(0,707-ppm*(point[1]-anchor),1165,1212),(64,1394+ppm*point[0],1356,1424)]:
        if not(left<=u<=right and 430<=v<=810):continue
        x=np.clip((u-left)/(right-left)*63,0,63);y=np.clip((v-430)/380*383,0,383);ix,iy=int(x),int(y);jx,jy=min(63,ix+1),min(383,iy+1);fx,fy=x-ix,y-iy
        a=(pixels[iy,offset+ix]*(1-fx)+pixels[iy,offset+jx]*fx)*(1-fy)+(pixels[jy,offset+ix]*(1-fx)+pixels[jy,offset+jx]*fx)*fy
        rgb=np.where(a[:3]<=.04045,a[:3]/12.92,((a[:3]+.055)/1.055)**2.4);samples.append(rgb*a[3]);weights.append(float(a[3]))
    value=np.sum(samples,axis=0)/max(.001,sum(weights)) if sum(weights)>.25 else np.asarray(fallback)*np.array([.68,.7004,.748])
    return np.clip(value*.90/.5394794890121072,.003,.85)


def BuildTailEndProfile(rgb):
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    luma=linear@np.array([.2126,.7152,.0722]);rows=np.arange(560,781)
    background=np.median(luma[rows,1214:1219],axis=1)
    samples=[]
    bounds=[(560,1370,1418),(600,1370,1416),(650,1370,1416),(700,1372,1414),(720,1374,1412),(740,1376,1408),(760,1382,1403),(780,1386,1400)]
    for view,(left,right) in enumerate([(1173,1212),(1365,1420)]):
        bg=background if view==0 else np.quantile(luma[rows,1355:1430],.98,axis=1)
        alpha=np.clip((bg[:,None]-luma[rows,left:right])/np.maximum(.1,bg[:,None]-.018),0,1)
        if view==1:
            lo=np.interp(rows,[r[0] for r in bounds],[r[1] for r in bounds]);hi=np.interp(rows,[r[0] for r in bounds],[r[2] for r in bounds]);x=np.arange(left,right)[None,:]
            alpha*=np.clip((x-lo[:,None])/1.5,0,1)*np.clip((hi[:,None]-x)/1.5,0,1)
        mass=alpha.sum(axis=1);mass=np.convolve(np.pad(mass,(6,6),mode='edge'),np.ones(13)/13,mode='valid')
        scale=max(1,float(np.percentile(mass[:51],90)));samples.append(np.clip(mass/scale,0,1))
    survival=np.minimum.accumulate(np.mean(samples,axis=0));survival[-1]=0
    report={'version':'20261026TailDensityV43','sourceRows':[560,780],'sideBoundsX':[1173,1212],'rearBounds':bounds,'rearBackgroundQuantile':.98,
        'backgroundBoundsX':[1214,1219],'smoothingRows':13,'method':'monotonic mean of side and rear dark-hair coverage, normalized within the upper brush; inverse survival sets fine-strand end heights',
        'samples':[[int(y),float(s)] for y,s in zip(rows[::8],survival[::8])]+[[780,0.0]]}
    def EndHeight(rank):
        pixel=float(np.interp(rank,survival[::-1],rows[::-1]));return (925-pixel)/((925-302)/1.10)
    return EndHeight,report
