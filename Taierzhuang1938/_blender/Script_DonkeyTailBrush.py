"""Reference hair matte in the existing mane atlas and three bent brush layers."""
import math,json
import numpy as np


def ExtractTailReference(rgb):
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
    # Recover foreground RGB before baking; pale background must never become
    # a gray fringe. Scalar exposure correction retains the source hair hue.
    foreground=(linear-background[:,None,:]*(1-rawAlpha[:,:,None]))/np.maximum(.04,rawAlpha[:,:,None])
    palette=np.median(linear[rawAlpha>.90],axis=0)
    paletteChroma=palette/max(.004,float(palette@np.array([.2126,.7152,.0722])))
    recoveredLuma=np.maximum(.004,foreground@np.array([.2126,.7152,.0722]))
    chroma=foreground/recoveredLuma[:,:,None]
    chroma=np.clip(chroma,paletteChroma*.85,paletteChroma*1.15)
    foreground=chroma*recoveredLuma[:,:,None]*np.array([.68,.7004,.748])
    color=np.where(foreground<=.0031308,foreground*12.92,1.055*foreground**(1/2.4)-.055)
    result=np.concatenate((color,alpha[:,:,None]),axis=2).astype(np.float32)
    # One transparent texel on every border protects adjacent atlas cells.
    result[[0,-1],:,3]=0;result[:,[0,-1],3]=0
    centreline=[]
    for sourceY in range(430,791,12):
        rows=np.abs(ys-sourceY)<6;weight=np.maximum(0,alpha[rows]-.20)
        if weight.sum()>1:centreline.append([sourceY,float(np.sum(weight*xx[rows])/weight.sum())])
    if len(centreline)<20:raise RuntimeError('Original tail has too few foreground rows for a measured centreline')
    report={'version':'20261026TailBrushV36','sourceView':'Side','sourceBounds':bounds,'sourceCropPixels':[1165,430,1212,810],
        'method':'background-separated original tail RGB/alpha; foreground unmixing and scalar coat exposure; rotated into unused mane-atlas quadrant',
        'atlasPixelBox':[128,128,512,256],'sourceSampleSize':[width,height],'alphaForegroundPixels':int(np.count_nonzero(alpha>.5)),
        'sideCentrelinePixels':centreline,
        'foregroundChromaRelativeToTailPalette':[.85,1.15],'matteEnvelopeAppliedAfterForegroundRecovery':True,
        'runtimeImagesAdded':0,'runtimeMaterialsAdded':0}
    return result,report


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
                offset=Vector((.055*math.cos(angle),.030*math.sin(angle),0))*q
                vertices.append(centre+offset)
                uvs.append(((128.5+383*t)/512,(127.5-127*(q+1)*.5)/256))
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
    return {'version':'20261026TailBrushV36','layers':layers,'segmentsPerLayer':segments,'triangles':len(faces)*2,
        'sourceObject':obj.name,'exportLayer':'DonkeyManeRuntime','material':'DonkeyManePbr','atlasPixelBox':[128,128,512,256],
        'widthM':.11,'depthM':.06,'heightRangeM':[.203,.874],'fibresRetained':480,
        'centreline':'alpha-weighted side-reference tail centroids at 12-source-pixel intervals',
        'method':'three curved, skinned original-reference brush layers behind the existing fine strands'}
