"""Part-aware photographic limb pigment; bake-only cylindrical correspondence.

Visible source strips belong to the same anatomical limb. Occluded inner and
back faces extend that limb's coat, rather than projecting another leg, belly,
floor, rope or background through the model. No new runtime material or image.
"""
import bpy,json,math,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

def InstallLegPigment(scene,skin,rig,base):
    project=Path(scene['DonkeyCartProject']);ns={};file=project/'_blender/Script_DonkeyLegSections.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),ns)
    stems,masses,profiles=ns['MeasureLegSections'](skin,True);curve=ns['Curve'];smooth=ns['Smooth']
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    original=bpy.data.images.load(str(source),check_existing=False)
    rgb=np.array(original.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(original)
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    paletteBoxes={'ForeSideDark':[707,750,732,830],'HindSideDark':[1136,760,1159,825],'ForeFrontDark':[207,765,220,825],'ForeMedialPale':[185,565,198,610],'RearMedialLeft':[1339,577,1354,610],'RearMedialRight':[1430,577,1445,610]}
    palette={name:np.median(linear[top:bottom,left:right].reshape(-1,3),axis=0)*(.50/.75)*np.array([1,1.03,1.10]) for name,(left,top,right,bottom) in paletteBoxes.items()}
    detailNamespace={};detailFile=project/'_blender/Script_DonkeyPhotoDetail.py';exec(compile(detailFile.read_text(encoding='utf-8'),detailFile.name,'exec'),detailNamespace)
    blur=detailNamespace['BoxBlur']
    # Each row is source image Y, left visible skin boundary, right boundary.
    # Near-side donors exclude the partially hidden far limb. Margins remain
    # inside the photographed coat even at the cannon and staggered feet.
    sideFront=[(450,658,749),(500,671,751),(550,690,750),(600,692,735),(650,695,739),(700,696,744),(750,700,738),(800,702,740),(850,707,746),(875,704,729),(925,696,728)]
    sideRear=[(450,1033,1113),(500,1064,1129),(550,1080,1131),(600,1101,1137),(650,1122,1160),(700,1132,1170),(750,1132,1166),(800,1131,1162),(850,1126,1165),(875,1118,1158),(925,1100,1145)]
    frontLeft=[(450,178,264),(500,180,258),(550,177,242),(600,177,237),(650,181,227),(700,177,227),(725,179,231),(750,185,226),(800,190,223),(850,183,233),(925,193,245)]
    frontRight=[(450,43,134),(500,45,137),(550,69,137),(600,74,136),(650,85,136),(700,84,142),(725,80,140),(750,86,134),(800,88,130),(850,78,131),(925,67,115)]
    rearLeft=[(450,1272,1374),(500,1277,1372),(550,1295,1369),(600,1308,1360),(650,1317,1357),(700,1315,1367),(750,1321,1362),(800,1324,1356),(850,1315,1357),(900,1306,1352),(925,1301,1351)]
    rearRight=[(450,1417,1514),(500,1415,1512),(550,1420,1495),(600,1425,1481),(650,1426,1471),(700,1418,1469),(750,1422,1464),(800,1427,1461),(850,1426,1470),(900,1431,1480),(925,1434,1484)]
    boundaries={'SideFront':sideFront,'SideRear':sideRear,'FrontLeft':frontLeft,'FrontRight':frontRight,'RearLeft':rearLeft,'RearRight':rearRight}
    height=1024;tileWidth=384;bodyWidth=256;gutter=64;atlas=np.ones((height,tileWidth*4,4),dtype=np.float32)
    yy=np.linspace(.90,0,height)[:,None];sourceY=np.broadcast_to(925-yy*(925-302)/1.10,(height,tileWidth))
    angle=(np.arange(tileWidth)-gutter)/(bodyWidth-1)*2*math.pi-math.pi
    nx=np.broadcast_to(np.sin(angle),(height,tileWidth));ny=np.broadcast_to(np.cos(angle),(height,tileWidth))
    sourceChecks=[]
    def Sample(rows,horizontal,normal,view):
        ys=np.array([r[0] for r in rows]);lo=np.interp(sourceY,ys,[r[1] for r in rows]);hi=np.interp(sourceY,ys,[r[2] for r in rows])
        sourceX=(lo+hi)*.5+np.clip(horizontal,-1,1)*(hi-lo)*.41
        # Bilinear sampling inside a verified same-limb strip, never an
        # alpha-threshold transition between photograph and fallback colour.
        x=np.clip(sourceX,0,1534);y=np.clip(sourceY,0,1022);ix=x.astype(int);iy=y.astype(int);fx=(x-ix)[:,:,None];fy=(y-iy)[:,:,None]
        active=(sourceY>460)&(sourceY<870)
        sourceChecks.append({'view':view,'boundaryFirstRow':rows[0],'samples':int(np.count_nonzero(active)),
            'lightPixelSamples':int(np.count_nonzero(active&(rgb[iy,ix].mean(axis=2)>.69))),
            'sourceXRange':[float(sourceX[active].min()),float(sourceX[active].max())]})
        color=(linear[iy,ix]*(1-fx)+linear[iy,ix+1]*fx)*(1-fy)+(linear[iy+1,ix]*(1-fx)+linear[iy+1,ix+1]*fx)*fy
        light=Vector((-.4,.5,.76) if view=='Side' else (-.3,.5,.81) if view=='Front' else (.3,-.5,.81)).normalized()
        dot=normal[0]*light.x+normal[1]*light.y
        return np.clip(color*(.50/(.55+.45*np.maximum(0,dot)))[:,:,None]*np.array([1,1.03,1.10]),.004,.45)
    sampling=[]
    for index,stem in enumerate(stems):
        front='Front' in stem;left=stem.endswith('Left')
        side=Sample(sideFront if front else sideRear,-ny,(-np.abs(nx),ny),'Side')
        face=Sample(frontLeft if left else frontRight,-nx,(-nx,np.abs(ny)),'Front') if front else Sample(rearLeft if left else rearRight,nx,(-nx,-np.abs(ny)),'Rear')
        # Only the source-facing cap uses the frontal/rear photograph. The
        # hidden cap is a continuous extension of the same side coat.
        w=np.maximum(0,ny if front else -ny)**3;sideWeight=np.abs(nx)**3+np.maximum(0,-ny if front else ny)**3
        w=w/np.maximum(.001,w+sideWeight)
        photographic=side*(1-w[:,:,None])+face*w[:,:,None]
        # Photograph shading around joints is not pigment. Retain short-fur
        # microvariation while removing low-frequency joint shadows and the
        # wide horizontal streaks created by stretching a narrow donor strip.
        low=np.stack([blur(blur(photographic[:,:,c],8),8) for c in range(3)],axis=2)
        detail=np.clip(photographic/np.maximum(.008,low),.55,1.65)
        dark=np.mean([palette['ForeSideDark'],palette['HindSideDark'],palette['ForeFrontDark']],axis=0)
        pale=palette['ForeMedialPale'] if front else np.mean([palette['RearMedialLeft'],palette['RearMedialRight']],axis=0)
        inward=np.maximum(0,nx*(1 if left else -1))
        if front:
            frontPigment=np.stack([blur(blur(face[:,:,c],8),8) for c in range(3)],axis=2)
            frontPigment=np.minimum(pale,np.maximum(dark,frontPigment))
            heightMask=np.clip((yy-.32)/.13,0,1);heightMask=heightMask*heightMask*(3-2*heightMask)
            frontFacing=np.clip((ny+.20)/.85,0,1);frontFacing=frontFacing*frontFacing*(3-2*frontFacing)
            # Source RGB already places the inner light stripe on the front
            # cap. Extend it around the medial wall without multiplying by a
            # second inward-normal mask that erases the photographed patch.
            coverage=np.maximum(frontFacing,inward*inward)
            pigment=dark+(frontPigment-dark)*(coverage*heightMask)[:,:,None]
        else:
            heightMask=np.clip((yy-.36)/.10,0,1);heightMask=heightMask*heightMask*(3-2*heightMask)
            # The rear photograph already locates the medial pale patch.
            # Preserve its continuous RGB gradient instead of thresholding
            # luminance into a uniformly pale painted patch. The dark-coat
            # floor removes joint shadows; the same-limb light sample bounds
            # highlights. A duplicate inward mask would erase the rear cap.
            rearPigment=np.stack([blur(blur(face[:,:,c],8),8) for c in range(3)],axis=2)
            rearPigment=np.minimum(pale,np.maximum(dark,rearPigment))
            rearFacing=np.clip((-ny+.20)/.85,0,1);rearFacing=rearFacing*rearFacing*(3-2*rearFacing)
            pigment=dark+(rearPigment-dark)*(rearFacing*heightMask)[:,:,None]
        color=pigment*(1+1.05*(detail-1))
        atlas[:,index*tileWidth:(index+1)*tileWidth,:3]=np.where(color<=.0031308,color*12.92,1.055*color**(1/2.4)-.055)
        sampling.append({'leg':stem,'sideDonor':'near '+('foreleg' if front else 'hindleg'),'capDonor':('Front' if front else 'Rear')+('Left' if left else 'Right')})
    image=bpy.data.images.new('Texture_DonkeyLegPigment',width=tileWidth*4,height=height,alpha=False);image.colorspace_settings.name='sRGB'
    image.pixels.foreach_set(atlas[::-1].copy().ravel());path=base/'SourceTextures/Texture_DonkeyLegPigment.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
    layer=skin.data.uv_layers.get('LegPigmentUV') or skin.data.uv_layers.new(name='LegPigmentUV')
    mask=skin.data.attributes.get('LegPigmentBlend') or skin.data.attributes.new('LegPigmentBlend','FLOAT','POINT')
    protection=skin.data.attributes.get('LegProjectionProtection') or skin.data.attributes.new('LegProjectionProtection','FLOAT','POINT')
    coordinates=[];paint=skin.data.color_attributes['CoatColor'];count=0
    for vertex,row in zip(skin.data.vertices,masses):
        stem=max(stems,key=lambda s:row[s]);p=vertex.co
        if row[stem]<.40:stem='Donkey'+('Front' if p.y>.40 else 'Rear')+('Left' if p.x<0 else 'Right')
        index=stems.index(stem);front='Front' in stem;rows=profiles[stem]
        cx,cy,wx,wy=[curve([(r[0],r[c]) for r in rows],p.z) for c in (1,2,3,4)]
        theta=(math.atan2((p.x-cx)/max(.01,wx*.5),(p.y-cy)/max(.01,wy*.5))+math.pi)/(2*math.pi)
        coordinates.append((index,theta,p.z/.90))
        ownership=smooth(.45,.85,row[stem])
        amount=ownership*(1-smooth(.66,.74,p.z) if front else 1-smooth(.67,.86,p.z))
        mask.data[vertex.index].value=amount
        protected=amount;protection.data[vertex.index].value=protected
        if amount>0:
            col=int(np.clip(index*tileWidth+gutter+theta*(bodyWidth-1),0,tileWidth*4-1));line=int(np.clip((1-p.z/.90)*(height-1),0,height-1));value=atlas[line,col,:3]
            value=np.where(value<=.04045,value/12.92,((value+.055)/1.055)**2.4)
            old=Vector(paint.data[vertex.index].color[:3]);paint.data[vertex.index].color=(*old.lerp(Vector(value/.75),protected),1);count+=1
    for face in skin.data.polygons:
        votes=[coordinates[i][0] for i in face.vertices];tile=max(set(votes),key=votes.count)
        angles=[coordinates[skin.data.loops[l].vertex_index][1] for l in face.loop_indices];crosses=max(angles)-min(angles)>.5
        for loop,a in zip(face.loop_indices,angles):
            i=skin.data.loops[loop].vertex_index
            if crosses and a<.5:a+=1
            layer.data[loop].uv=((tile*tileWidth+gutter+a*(bodyWidth-1))/(tileWidth*4),coordinates[i][2])
    materials=[]
    for material in skin.data.materials:
        if not material or not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur')):continue
        nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');previous=shader.inputs['Base Color'].links[0].from_socket
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='LegPigmentUV';texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0])
        blend=nodes.new('ShaderNodeAttribute');blend.attribute_name='LegPigmentBlend';mix=nodes.new('ShaderNodeMixRGB');links.new(blend.outputs['Fac'],mix.inputs[0]);links.new(previous,mix.inputs[1]);links.new(texture.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],shader.inputs['Base Color']);materials.append(material.name)
    record={'method':'bone-owned limb correspondence below the fore-elbow transition; short-fur microvariation separated from photo shading; continuous front/rear RGB bounded by same-limb dark/light samples; front cap retains the photographed light stripe and wraps onto the medial wall, fading near the carpus; gradual rear-cap/hock falloffs; no duplicate inward mask or generated guide on limbs',
        'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'atlas':str(path),'sha256':hashlib.sha256(content).hexdigest(),'sourceBoundaryRows':boundaries,'sampling':sampling,'sourceChecks':sourceChecks,'paletteSourceBoxes':paletteBoxes,'paletteCalibratedLinearRgb':{name:value.tolist() for name,value in palette.items()},'vertices':count,'materials':materials,
        'runtime':'baked into existing UV0 2K Base Color; shared UV1 fur normal unchanged; no additional runtime image or projection'}
    (base/'SourceTextures/Data_LegPigment.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');scene['DonkeyLegPigmentRevision']='20261025ForeMedialV24';return record
