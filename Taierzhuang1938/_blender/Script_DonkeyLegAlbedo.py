"""Source-scale limb albedo preparation; pure numpy, also usable for bake QA.

Separate photographed pigment from small fur variation before cylindrical
resampling. Narrow orthographic strips must not become broad circumferential
bands. Hidden faces reuse only short-fur detail from the corresponding limb.
"""
import math
import numpy as np

BOUNDARIES={
 'SideFront':[(450,658,749),(500,671,751),(550,690,750),(600,692,735),(650,695,739),(700,696,744),(750,700,738),(800,702,740),(850,707,746),(875,704,729),(925,696,728)],
 'SideRear':[(450,1033,1113),(500,1064,1129),(550,1080,1131),(600,1101,1137),(650,1122,1160),(700,1132,1170),(750,1132,1166),(800,1131,1162),(850,1126,1165),(875,1118,1158),(925,1100,1145)],
 'FrontLeft':[(450,178,264),(500,180,258),(550,177,242),(600,177,237),(650,181,227),(700,177,227),(725,179,231),(750,185,226),(800,190,223),(850,183,233),(925,193,245)],
 'FrontRight':[(450,43,134),(500,45,137),(550,69,137),(600,74,136),(650,85,136),(700,84,142),(725,80,140),(750,86,134),(800,88,130),(850,78,131),(925,67,115)],
 'RearLeft':[(450,1272,1374),(500,1277,1372),(550,1295,1369),(600,1308,1360),(650,1317,1357),(700,1315,1367),(750,1321,1362),(800,1324,1356),(850,1315,1357),(900,1306,1352),(925,1301,1351)],
 'RearRight':[(450,1417,1514),(500,1415,1512),(550,1420,1495),(600,1425,1481),(650,1426,1471),(700,1418,1469),(750,1422,1464),(800,1427,1461),(850,1426,1470),(900,1431,1480),(925,1434,1484)]}
PALETTE_BOXES={'ForeSideDark':[707,750,732,830],'HindSideDark':[1136,760,1159,825],'ForeFrontDark':[207,765,220,825],'ForeMedialPale':[185,565,198,610],'RearMedialLeft':[1339,577,1354,610],'RearMedialRight':[1430,577,1445,610]}

def BuildLegAlbedo(rgb,blur):
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    tint=np.array([1,1.03,1.10]);gain=.50/.75
    palette={name:np.median(linear[top:bottom,left:right].reshape(-1,3),axis=0)*gain*tint for name,(left,top,right,bottom) in PALETTE_BOXES.items()}
    # Filtering is performed in original photo pixels, where x/y have the
    # same physical scale. The old atlas-space blur had unequal scales.
    luminance=linear@np.array([.2126,.7152,.0722])
    height=1024;tileWidth=384;bodyWidth=256;gutter=64
    yy=np.linspace(.90,0,height)[:,None];sourceY=np.broadcast_to(925-yy*(925-302)/1.10,(height,tileWidth))
    angle=(np.arange(tileWidth)-gutter)/(bodyWidth-1)*2*math.pi-math.pi
    nx=np.broadcast_to(np.sin(angle),(height,tileWidth));ny=np.broadcast_to(np.cos(angle),(height,tileWidth))
    atlas=np.ones((height,tileWidth*4,4),dtype=np.float32);sourceChecks=[];sampling=[]
    def Fetch(field,x,y):
        x=np.clip(x,0,1534);y=np.clip(y,0,1022);ix=x.astype(int);iy=y.astype(int);fx=x-ix;fy=y-iy
        if field.ndim==3:fx=fx[:,:,None];fy=fy[:,:,None]
        return (field[iy,ix]*(1-fx)+field[iy,ix+1]*fx)*(1-fy)+(field[iy+1,ix]*(1-fx)+field[iy+1,ix+1]*fx)*fy
    def Sample(key,horizontal,normal,view):
        rows=BOUNDARIES[key];ys=np.array([r[0] for r in rows]);lo=np.interp(sourceY,ys,[r[1] for r in rows]);hi=np.interp(sourceY,ys,[r[2] for r in rows]);width=hi-lo
        # Filter only this limb's pixels. Blurring the entire photograph
        # pulled pale background/other legs across a narrow dark cannon.
        fy,fx=np.indices(luminance.shape);left=np.interp(fy,ys,[r[1] for r in rows]);right=np.interp(fy,ys,[r[2] for r in rows]);margin=(right-left)*.08
        valid=((fx>=left+margin)&(fx<=right-margin)&(fy>=ys[0]-80)&(fy<=ys[-1])).astype(np.float32)
        denominator=np.maximum(.0001,blur(blur(valid,6),6))
        low=np.stack([blur(blur(linear[:,:,c]*valid,6),6)/denominator for c in range(3)],axis=2)
        microLow=blur(luminance*valid,4)/np.maximum(.0001,blur(valid,4))
        micro=luminance/np.maximum(.008,microLow)
        # Tendon highlights form long vertical cables in a photo. Remove
        # their coherent column component while retaining short curved hairs
        # at their original scale; a 25-pixel vertical window exceeds a hair.
        padded=np.pad(micro,((12,12),(0,0)),mode='edge')
        summed=np.pad(np.cumsum(padded,axis=0,dtype=np.float64),((1,0),(0,0)))
        column=(summed[25:]-summed[:-25])/25
        micro=np.clip(micro/np.maximum(.5,column),.65,1.45)
        sourceX=(lo+hi)*.5+np.clip(horizontal,-1,1)*width*.40
        color=Fetch(low,sourceX,sourceY)
        light=np.array((-.4,.5,.76) if view=='Side' else (-.3,.5,.81) if view=='Front' else (.3,-.5,.81));light/=np.linalg.norm(light)
        irradiance=.55+.45*np.maximum(0,normal[0]*light[0]+normal[1]*light[1])
        color=np.clip(color*(.50/irradiance)[:,:,None]*tint,.004,.45)
        # Circumference is pi times the photographed diameter. Use that
        # arc length for detail instead of stretching one projection over
        # the whole sleeve. Two phased donors feather the periodic cut.
        repeats=round(math.pi/.60)
        phase=np.broadcast_to(np.mod((angle+math.pi)/(2*math.pi)*repeats,1),(height,tileWidth))
        a=Fetch(micro,lo+width*(.20+.60*phase),sourceY)
        b=Fetch(micro,lo+width*(.20+.60*np.mod(phase+.5,1)),sourceY)
        wa=np.sin(math.pi*phase)**2;detail=a*wa+b*(1-wa)
        # Suppress a coherent source-row stripe while retaining variations
        # between actual individual hairs. There is no synthetic noise.
        rowMean=np.mean(np.stack([Fetch(micro,lo+width*t,sourceY) for t in np.linspace(.2,.8,16)]),axis=0)
        detail=np.clip(detail/np.maximum(.5,rowMean),.65,1.45)
        active=(sourceY>460)&(sourceY<870)
        sourceChecks.append({'view':view,'donor':key,'samples':int(np.count_nonzero(active)),'sourceXRange':[float(sourceX[active].min()),float(sourceX[active].max())]})
        projected=np.clip(Fetch(micro,sourceX,sourceY)/np.maximum(.5,rowMean),.65,1.45)
        return color,projected,detail
    dark=np.mean([palette['ForeSideDark'],palette['HindSideDark'],palette['ForeFrontDark']],axis=0)
    for index,stem in enumerate(['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']):
        front='Front' in stem;left=stem.endswith('Left');sideKey='SideFront' if front else 'SideRear';capKey=('Front' if front else 'Rear')+('Left' if left else 'Right')
        side,sideProjected,sideFallback=Sample(sideKey,-ny,(-np.abs(nx),ny),'Side')
        face,faceDetail,_=Sample(capKey,-nx if front else nx,(-nx,np.abs(ny) if front else -np.abs(ny)),'Front' if front else 'Rear')
        w=np.maximum(0,ny if front else -ny)**3;sideWeight=np.abs(nx)**3+np.maximum(0,-ny if front else ny)**3;w=w/np.maximum(.001,w+sideWeight)
        visibleSide=np.abs(nx)**3/np.maximum(.001,sideWeight)
        sideDetail=sideProjected*visibleSide+sideFallback*(1-visibleSide)
        detail=sideDetail*(1-w)+faceDetail*w
        # Dark fibres retain bounded, same-limb photographic mottling;
        # directional light and joint recesses are supplied by PBR geometry.
        sideBase=palette['ForeSideDark' if front else 'HindSideDark']
        mottling=np.clip(side/np.maximum(.008,sideBase),.82,1.22)
        pigment=dark*mottling
        pale=palette['ForeMedialPale'] if front else np.mean([palette['RearMedialLeft'],palette['RearMedialRight']],axis=0)
        capPigment=np.minimum(pale,np.maximum(dark,face))
        heightMask=np.clip((yy-(.32 if front else .36))/(.13 if front else .10),0,1);heightMask=heightMask*heightMask*(3-2*heightMask)
        facing=np.clip(((ny if front else -ny)+.20)/.85,0,1);facing=facing*facing*(3-2*facing)
        if front:coverage=np.maximum(facing,np.maximum(0,nx*(1 if left else -1))**2)
        else:coverage=facing
        pigment=pigment+(capPigment-pigment)*(coverage*heightMask)[:,:,None]
        # Source-facing surfaces retain the photographed detail at its
        # actual location. Periodic donors only fill the unphotographed cap;
        # repeating them over visible faces creates artificial dapple spots.
        color=np.maximum(0,pigment*detail[:,:,None])
        atlas[:,index*tileWidth:(index+1)*tileWidth,:3]=np.where(color<=.0031308,color*12.92,1.055*color**(1/2.4)-.055)
        sampling.append({'leg':stem,'sideDonor':sideKey,'capDonor':capKey})
    record={'method':'silhouette-masked source-space filtering; charcoal pigment with bounded photographic short-hair detail; broad joint shadows suppressed; same-limb frontal/rear pale pigment and periodic hidden-cap extension',
        'sourceBoundaryRows':BOUNDARIES,'sampling':sampling,'sourceChecks':sourceChecks,'paletteSourceBoxes':PALETTE_BOXES,'paletteCalibratedLinearRgb':{name:value.tolist() for name,value in palette.items()},
        'sourcePigmentBlurRadiusPixels':6,'sourceMicroBlurRadiusPixels':4,'sourceVerticalCoherenceWindowPixels':25,'microRatioRange':[.65,1.45],'microStrength':1.0,'darkMottlingRatioRange':[.82,1.22],'silhouetteMaskedFiltering':True,'hiddenCapRepeats':round(math.pi/.60),'visibleDetailIsPhotographic':True,'periodicDetailScope':'unphotographed cap only','detailUsesAtlasSpaceBlur':False,'detailUsesSyntheticNoise':False}
    return atlas,record
