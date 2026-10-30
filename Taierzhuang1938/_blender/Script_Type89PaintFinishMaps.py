"""Paint/contact refinement and bounded aging from the retained substrate.

New chips grow only from actual convex edges and retained contact exposure.
Rest-pose UV context gates fading and lower/cavity dirt.
"""
from pathlib import Path
import sys,json,hashlib,math
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
manifestFile=Path(sys.argv[1]);manifest=json.loads(manifestFile.read_text(encoding='utf8'));profile=manifest['profile'];settings=profile['contactWear'];rows=[]
def Smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def Srgb(v):return np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)

def Resize(value,size):
    if value.shape==size[::-1]:return value
    return np.asarray(Image.fromarray(value.astype(np.float32)).resize(size,Image.Resampling.BILINEAR),np.float32)

def Noise(size,cell,seed):
    w,h=size;rng=np.random.default_rng(seed)
    grid=rng.random((max(2,int(np.ceil(h/cell))),max(2,int(np.ceil(w/cell))))).astype(np.float32)
    return np.asarray(Image.fromarray(grid).resize(size,Image.Resampling.BILINEAR),np.float32)

def Expanded(mask,radius):
    # An exact circular neighbourhood avoids the square imprints of a box max.
    h,w=mask.shape;result=np.zeros_like(mask,bool)
    for dy in range(-radius,radius+1):
        half=int(math.sqrt(radius*radius-dy*dy))
        for dx in range(-half,half+1):
            ys=slice(max(0,dy),min(h,h+dy));xs=slice(max(0,dx),min(w,w+dx));sourceY=slice(max(0,-dy),min(h,h-dy));sourceX=slice(max(0,-dx),min(w,w-dx));np.logical_or(result[ys,xs],mask[sourceY,sourceX],out=result[ys,xs])
    return np.asarray(Image.fromarray((result*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.55)),np.float32)/255

def Context(row,role,size):
    field=row['surfaceContext'][role];geometry=np.load(field['file']);image=Image.new('RGBA',size);draw=ImageDraw.Draw(image)
    for uv,rgba in zip(geometry['uv'],geometry['rgba']):
        points=[(float(p[0]*size[0]),float(p[1]*size[1]))for p in uv];draw.polygon(points,fill=tuple(int(v)for v in rgba))
    target=Path(field['file']).with_suffix('.png');image.save(target)
    edgeImage=Image.new('L',size);draw=ImageDraw.Draw(edgeImage)
    for edge in geometry['edges']:
        draw.line([(float(v[0]*size[0]),float(v[1]*size[1]))for v in edge],fill=255,width=1)
    edgeImage.save(Path(field['file']).with_name('Texture_'+role+'ConvexEdgeMask.png'))
    return np.asarray(image,np.float32)/255,np.asarray(edgeImage,np.float32)/255

def Age(row,role,originals,base,orm,coat,badge):
    age={**profile['agingPaint'],**profile['agingPaint'].get('roleProfiles',{}).get(role,{})};m=originals['Orm'][:,:,2].astype(np.float32)/255;h,w=m.shape;size=(w,h)
    context,convexEdges=Context(row,role,size);support=context[:,:,3]>.5;visible=Resize(base[:,:,3].astype(np.float32)/255,size)>.01
    allowed=support&visible&~badge;density=row['surfaceContext'][role]['uvUnitsPerM']*w
    radius=max(1,int(np.ceil(age['edgeExpansionM']*density)));primerRadius=max(radius,int(np.ceil(age['primerExpansionM']*density)))
    assert primerRadius<=24,'Unexpected atlas scale; do not spill wear across UV islands'
    seeds=((m>age['exposureSeedMetallic'])|(convexEdges>.5))&allowed;near=Expanded(seeds,radius);rim=Expanded(seeds,primerRadius)
    seed=age['seed']+(0 if role=='Armor'else 500);breakup=Noise(size,max(1.5,.0035*density),seed)
    patches=Noise(size,max(3,.016*density),seed+1);grain=Noise(size,1.0,seed+2);oldFinish=Noise(size,max(4,age['fadingPatchM']*density),seed+3)
    broken=Smooth(.48,.72,breakup*.78+patches*.22)
    chip=near*broken*(1-Smooth(.10,.65,m));chip[~allowed]=0
    primer=rim*Smooth(.36,.69,breakup*.55+patches*.45)*(1-np.maximum(chip,Smooth(.08,.65,m)));primer[~allowed]=0
    upward=context[:,:,0];lower=1-context[:,:,1];handled=context[:,:,2]
    painted=1-Smooth(.08,.60,np.maximum(m,chip));painted[~allowed]=0
    ao=originals['Orm'][:,:,0].astype(np.float32)/255
    cavity=1-Smooth(.48,.94,ao)
    dust=(cavity*(.36+.64*lower)+upward*.10)*(.62+patches*.38)*painted*age['recessDustStrength']
    oxide=rim*cavity*Smooth(.40,.67,patches)*(1-chip)*age['oxideStrength'];oxide[~allowed]=0
    fade=(age['paintFade']+age['upwardFade']*upward)*(.65+oldFinish*.35)*painted
    rough=orm[:,:,1].astype(np.float32)/255
    rough+=painted*(age['paintRoughnessGain']+age['chalkRoughnessGain']*(.4+.6*upward)*(.45+.55*oldFinish))+dust*.18+primer*.07
    rough+=(age['newSteelRoughness']-rough)*chip
    newM=np.maximum(orm[:,:,2].astype(np.float32)/255,chip*age['newSteelMetallic'])
    orm[:,:,1]=np.rint(np.clip(rough,0,1)*255).astype(np.uint8);orm[:,:,2]=np.rint(newM*255).astype(np.uint8)
    coat[:,:,0]=np.rint(np.minimum(coat[:,:,0]/255,.8*(1-newM))*(1-primer*.35-painted*handled*age['handlingCoatLoss'])*255).astype(np.uint8)
    # The reflected coating lobe must age with the base lobe.
    coat[:,:,1]=orm[:,:,1]
    bw,bh=base.shape[1],base.shape[0];colour=Linear(base[:,:,:3].astype(np.float32)/255)
    def Blend(target,weight):
        nonlocal colour
        t=np.asarray(target,np.float32);weight=Resize(weight,(bw,bh));colour+=((t if t.ndim==3 else t[None,None,:])-colour)*weight[:,:,None]
    luma=colour@np.array([.2126,.7152,.0722],np.float32)
    faded=luma[:,:,None]*np.array([1.52,1.46,1.29],np.float32)
    Blend(faded,fade);Blend(age['primerLinearRgb'],primer*age['primerStrength']);Blend(age['dustLinearRgb'],dust);Blend(age['oxideLinearRgb'],oxide);Blend(age['steelLinearRgb'],chip)
    encoded=np.rint(np.clip(Srgb(colour),0,1)*255).astype(np.uint8)
    active=Resize(allowed.astype(np.float32),(bw,bh))>.01;active&=base[:,:,3]>0
    base[:,:,:3][active]=encoded[active]
    # Keep all RGB beneath cutout transparency, as well as its effective alpha.
    hidden=originals['Base'][:,:,3]==0;base[hidden]=originals['Base'][hidden]
    for data,label in [(orm,'Orm'),(coat,'MicroCoatData')]:data[badge]=originals[label][badge]
    if badge.shape==base.shape[:2]:base[badge]=originals['Base'][badge]
    added=(m<=age['exposureSeedMetallic'])&(newM>.5)&allowed
    fraction=float(np.count_nonzero(added)/max(1,np.count_nonzero(allowed)))
    assert fraction<age['maximumNewSteelAreaFraction'],f'Excessive new exposure: {role} {fraction}'
    return {'edgeRadiusTexels':radius,'primerRadiusTexels':primerRadius,'uvTexelsPerM':density,'newSteelAreaFraction':fraction,'newSteelTexels':int(added.sum()),'upwardFadeTexels':int(np.count_nonzero((upward>.5)&allowed)),'newDamageMask':True,'maskSource':'Actual non-smooth manifold convex edges above18degrees, existing exposure, original AO, read-only rest-pose triangle context','badgePixelsProtected':int(badge.sum()),'context':row['surfaceContext'][role]['file']}
for row in manifest['rows']:
    output=manifestFile.parent/'Maps'/row['quality']/'Finished';output.mkdir(parents=True,exist_ok=True);files={};stats=[]
    for role in ['Armor','Guard']:
        originals={label:np.array(Image.open(row['maps'][role+label]['file']).convert('RGBA'))for label in ['Base','Orm','MicroCoatData']};base=originals['Base'].copy();orm=originals['Orm'].copy();coat=originals['MicroCoatData'].copy();m=orm[:,:,2].astype(np.float32)/255
        badge=np.load(row['badgeMask'])if role=='Armor'else np.zeros(m.shape,bool);assert badge.shape==m.shape
        gate=Smooth(settings['minimumExistingMetallic'],.35,m);gate[badge]=0;newM=m+(np.minimum(settings['maximumMetallic'],m*settings['metallicGain'])-m)*gate
        orm[:,:,2]=np.rint(np.clip(newM,0,1)*255).astype(np.uint8);bare=Smooth(.10,.75,m);bare[badge]=0
        rough=orm[:,:,1].astype(np.float32)/255;rough+=(settings['steelRoughness']-rough)*bare*settings['roughnessBlend'];orm[:,:,1]=np.rint(np.clip(rough,0,1)*255).astype(np.uint8)
        h,w=base.shape[:2]
        if m.shape!=(h,w):
            colourMask=np.array(Image.fromarray(np.rint(bare*255).astype(np.uint8)).resize((w,h),Image.Resampling.BILINEAR)).astype(np.float32)/255
        else:colourMask=bare
        weight=colourMask*settings['neutralSteelBlend'];linear=Linear(base[:,:,:3].astype(np.float32)/255);luminance=linear@np.array([.2126,.7152,.0722],np.float32);neutral=luminance[:,:,None]*settings['neutralSteelGain'];changed=linear+(neutral-linear)*weight[:,:,None];encoded=np.rint(np.clip(Srgb(changed),0,1)*255).astype(np.uint8);active=weight>0;base[:,:,:3][active]=encoded[active]
        changedMetal=orm[:,:,2]!=originals['Orm'][:,:,2];newWeight=np.rint(np.clip(.8*(1-newM),0,1)*255).astype(np.uint8);coat[:,:,0][changedMetal]=newWeight[changedMetal]
        aging=Age(row,role,originals,base,orm,coat,badge)if profile.get('agingPaint')else None
        # Badge pigment and its original conductor classification are a datum.
        if role=='Armor':
            base[badge]=originals['Base'][badge];orm[badge]=originals['Orm'][badge];coat[badge]=originals['MicroCoatData'][badge]
        assert np.array_equal(base[:,:,3],originals['Base'][:,:,3]);assert np.array_equal(orm[:,:,0],originals['Orm'][:,:,0]);assert np.array_equal(coat[:,:,2:],originals['MicroCoatData'][:,:,2:])
        if not aging:
            assert np.array_equal(coat[:,:,1:],originals['MicroCoatData'][:,:,1:]);assert np.array_equal(coat[:,:,0][~changedMetal],originals['MicroCoatData'][:,:,0][~changedMetal]);assert not np.any((base!=originals['Base']).any(axis=2)&(colourMask==0));assert not np.any((orm!=originals['Orm']).any(axis=2)&((m<=settings['minimumExistingMetallic'])|badge))
        for label,data in [('Base',base),('Orm',orm),('MicroCoatData',coat)]:
            name=row['maps'][role+label]['name'];file=output/(name if name.lower().endswith('.png')else name+'.png');Image.fromarray(data).save(file);files[role+label]=str(file)
        stats.append({'role':role,'changedBaseTexels':int(np.count_nonzero((base!=originals['Base']).any(axis=2))),'changedOrmTexels':int(np.count_nonzero((orm!=originals['Orm']).any(axis=2))),'oldMetallicAreaAboveHalf':float(np.mean(m>.5)),'newMetallicAreaAboveHalf':float(np.mean(orm[:,:,2]>.5*255)),'unwornPigmentExact':not bool(aging),'aoAndEffectiveOpacityExact':True,'badgePixelsProtected':int(badge.sum()),'newDamageMask':bool(aging),'aging':aging})
    rows.append({'quality':row['quality'],'files':files,'stats':stats})
result={'pass':True,'profileSha256':manifest['profileSha256'],'rows':rows};(manifestFile.parent/'Data_PaintFinishMaps.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'pass':True,'rows':[{k:v for k,v in r.items()if k!='files'}for r in rows]}))
