"""SurfaceV2: object-aware PBR from archived generated albedo + real construction.
The generated atlas supplies material grain, not baked illumination or geometry.
Uniform grunge is deliberately avoided: each material has its own wear mechanism.
Ordinary Python/NumPy/Pillow; run serially to respect the shared workstation RAM.
"""
import os,pathlib,json,hashlib,math,gc
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont

repoRoot=pathlib.Path(__file__).resolve().parents[2]
sourceRoot=pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2'))
textureRoot=sourceRoot/'Textures';textureRoot.mkdir(parents=True,exist_ok=True)
atlasPath=repoRoot/'Taierzhuang1938/_import/Source/NakajimaKi4/Texture_NakajimaKi4SurfaceAtlasV2.png'
leatherRoot=atlasPath.parent/'Leather'
recipes={}
F=np.float32

def Noise(w,h,seed,scale):
    rng=np.random.default_rng(seed);im=Image.fromarray((rng.random((max(3,int(h/scale)),max(3,int(w/scale))))*255).astype('uint8'))
    return np.asarray(im.resize((w,h),Image.Resampling.BICUBIC),dtype=F)/255-.5

def SourceSample(name,w,h,domain,tileM=.4,rollingAlongU=False):
    atlas=Image.open(atlasPath).convert('RGB');aw,ah=atlas.size
    box={'Aluminum':(0,0,aw//2,ah//2),'Linen':(aw//2,0,aw,ah//2),'Cowl':(0,ah//2,aw//2,ah),'Steel':(aw//2,ah//2,aw,ah)}[name]
    patch=atlas.crop(box)
    if rollingAlongU:
        # Body U follows the fuselage axis. Remove source low-frequency variation
        # before tiling so the 0.4m sample cannot become repeating barrel bands.
        patch=patch.transpose(Image.Transpose.ROTATE_90)
        value=np.asarray(patch,dtype=F);low=np.asarray(patch.filter(ImageFilter.GaussianBlur(32)),dtype=F)
        mean=np.mean(value,axis=(0,1),keepdims=True);flat=np.clip(value/np.maximum(low,8)*mean,0,255)
        patch=Image.fromarray(flat.astype('uint8'),'RGB')
    if domain[0]<=tileM and domain[1]<=tileM:
        patch=patch.crop((0,0,max(2,math.ceil(patch.width*domain[0]/tileM)),max(2,math.ceil(patch.height*domain[1]/tileM))))
        return np.asarray(patch.resize((w,h),Image.Resampling.LANCZOS),dtype=F)/255
    tile=patch.resize((max(8,int(w*tileM/domain[0])),max(8,int(h*tileM/domain[1]))),Image.Resampling.LANCZOS)
    out=Image.new('RGB',(w,h))
    for y in range(0,h,tile.height):
        for x in range(0,w,tile.width):out.paste(tile,(x,y))
    return np.asarray(out,dtype=F)/255

def Luma(rgb):return rgb[:,:,0]*F(.2126)+rgb[:,:,1]*F(.7152)+rgb[:,:,2]*F(.0722)

def Recolor(rgb,target,contrast=1):
    lum=Luma(rgb);mean=F(np.mean(lum));lum=np.clip((lum-mean)*F(contrast)+1,.5,1.5)
    return lum[:,:,None]*np.asarray(target,dtype=F)

def Stamp(w,h,seed,count,radius=(1,4),bands=None):
    rng=np.random.default_rng(seed);im=Image.new('L',(w,h));d=ImageDraw.Draw(im)
    for _ in range(count):
        x=float(rng.uniform(0,w));y=float(rng.uniform(0,h) if bands is None else (rng.choice(bands)+rng.normal(0,.012))*h);r=float(rng.uniform(*radius))
        d.ellipse((x-r,y-r*.55,x+r,y+r*.55),fill=int(rng.uniform(90,255)))
    return np.asarray(im,dtype=F)/255

def Scratches(w,h,seed,count,domain,region=None,heading=0):
    rng=np.random.default_rng(seed);im=Image.new('L',(w,h));d=ImageDraw.Draw(im)
    for _ in range(count):
        x=float(rng.uniform(0,w));y=float(rng.uniform(0,h));length=float(rng.uniform(.015,.14));angle=float(rng.normal(heading,.17))
        d.line((x,y,x+math.cos(angle)*length/domain[0]*w,y+math.sin(angle)*length/domain[1]*h),fill=int(rng.uniform(30,180)),width=1)
    a=np.asarray(im,dtype=F)/255
    return a if region is None else a*region

def Marking(w,h):
    font=ImageFont.truetype(str(sourceRoot/'Fonts/NotoSansSC-Bold.otf'),60)
    g=Image.new('L',(1100,130));ImageDraw.Draw(g).text((8,8),'機番141（中島製）',font=font,fill=255)
    g=g.crop(g.getbbox()).resize((int(w*.55/7.14),int(h*.055/(.34*.95)*1/(2*np.pi))),Image.Resampling.LANCZOS).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    mask=Image.new('L',(w,h));cx=int(((-2.85+4.56)/7.14)*w);cy=int((1-1.9/(2*np.pi))*h);mask.paste(g,(cx-g.width//2,cy-g.height//2))
    return np.asarray(mask,dtype=F)/255

def Body(w,h,domain):
    u=np.arange(w,dtype=F)[None,:]/w;v=1-np.arange(h,dtype=F)[:,None]/h;y=-4.56+u*7.14;theta=v*F(2*np.pi)
    sample=SourceSample('Aluminum',w,h,domain,rollingAlongU=True);color=Recolor(sample,(.62,.635,.63),1.05);lum=Luma(sample);del sample
    broad=Noise(w,h,94,180);meso=Noise(w,h,95,22);fine=Noise(w,h,96,2)
    height=meso*F(.000028)+fine*F(.000012);rough=np.full((h,w),.46,dtype=F)+meso*.10;metal=np.full((h,w),.88,dtype=F);ao=np.ones((h,w),dtype=F)
    # Adjacent metal sheets: restrained variation, coherent rolling direction.
    stations=[-4.56,-3.70,-3.05,-2.35,-1.55,-.70,.10,.90,1.65,2.30,2.58]
    sectors=[0,.95,2.10,3.14,4.18,5.33,2*np.pi]
    panelTone=np.zeros((h,w),dtype=F);rng=np.random.default_rng(194)
    for k,(ya,yb) in enumerate(zip(stations,stations[1:])):
        for a,b in zip(sectors,sectors[1:]):
            panelTone+=((y>=ya)&(y<yb)&(theta>=a)&(theta<b))*F(rng.uniform(-.037,.037))
    color*=1+panelTone[:,:,None];rough+=panelTone*.8
    panelWarp=Noise(w,h,97,220)+Noise(w,h,98,490)*.45
    height+=panelWarp*F(.00025)
    # Seams and individual flush fasteners, scaled in metres.
    seam=np.zeros((h,w),dtype=F)
    for station in stations[1:-1]:
        dy=np.abs(y-station);seam+=np.exp(-(dy/.0017)**2)
        for offset in [-.010,.010]:
            radial=np.sqrt(((y-station-offset)/.0028)**2+(np.sin(theta*42)/.25)**2)
            head=np.exp(-radial*radial);seat=np.exp(-((radial-1.2)/.24)**2)
            height+=head*F(.00072)-seat*F(.00020);ao-=seat*.35;rough-=head*.16
            color=color*(1-seat[:,:,None]*.18)+head[:,:,None]*.065
    for angle in [.95,2.1,4.18,5.33]:seam+=np.exp(-((theta-angle)/.0020)**2)*.6
    seam=np.clip(seam,0,1);height-=seam*F(.00032);color*=1-seam[:,:,None]*.22;ao-=seam*.20
    # Engine grime follows airflow aft; no brown rust on aluminum.
    side=np.exp(-((theta-1.75)/.24)**2)+np.exp(-((theta-4.53)/.24)**2)
    aft=np.exp(-np.maximum(0,1.65-y)/1.2)*(y<1.85)*(y>-.8)
    streams=np.clip(.55+Noise(w,h,99,85)*1.1,.12,1)
    oil=np.clip(side*aft*streams*(.15+meso*.09),0,.24)
    belly=np.exp(-((theta-np.pi)/.6)**2)*(.028+broad*.025)
    color*=1-(oil+belly)[:,:,None];rough+=oil*.95+belly*.5;metal-=oil*.4
    contact=(np.exp(-((y-.18)/.65)**2)+np.exp(-((y+1.13)/.68)**2))*(np.exp(-((theta-.6)/.35)**2)+np.exp(-((theta-5.68)/.35)**2))
    scratch=Scratches(w,h,518,2400,domain,np.clip(contact+.35,0,1))
    scratch=np.maximum(scratch,Scratches(w,h,519,600,domain,np.clip(contact+.12,0,1),heading=1.05))
    color+=scratch[:,:,None]*.16;height-=scratch*F(.000055);rough-=scratch*.10
    # Recessed patina and directional rolling/scratching survive grazing light.
    patina=np.clip((.67-lum)*.6,0,.13);color*=1-patina[:,:,None]*.32;rough+=patina
    ink=Marking(w,h);color=color*(1-ink[:,:,None])+ink[:,:,None]*np.asarray([.025,.027,.024],dtype=F);metal*=1-ink;rough=rough*(1-ink)+ink*.67
    return color,height,rough,metal,ao

def Fabric(w,h,domain,tape=False):
    sample=SourceSample('Linen',w,h,domain);color=Recolor(sample,(.50,.49,.45) if tape else (.53,.52,.475),.20 if tape else .60);lum=Luma(sample);del sample
    meso=Noise(w,h,611,30);fine=Noise(w,h,612,2)
    height=(lum-np.mean(lum))*F(.00013)+fine*F(.000009);rough=np.full((h,w),.66,dtype=F)+meso*.09;metal=np.full((h,w),.02,dtype=F);ao=np.ones((h,w),dtype=F)
    u=np.arange(w,dtype=F)[None,:]/w;v=1-np.arange(h,dtype=F)[:,None]/h
    if tape:
        # UV domain is 14mm across x200mm along the real rib tape.
        stitchRows=np.exp(-((u-.24)/.090)**2)+np.exp(-((u-.76)/.090)**2)
        stitch=stitchRows*np.exp(-(np.sin(v*np.pi*8)/.22)**2)
        puncture=stitchRows*np.exp(-(np.sin(v*np.pi*8)/.09)**2)
        edges=np.exp(-((u-.055)/.025)**2)+np.exp(-((u-.945)/.025)**2)
        height+=stitch*F(.00048);height-=edges*F(.00016);ao-=edges*.28+stitch*.08
        color*=1-edges[:,:,None]*.22-puncture[:,:,None]*.42;color+=stitch[:,:,None]*.028
        rough+=edges*.07;return color,height,rough,metal,ao
    # Shallow tension creases terminate within individual rib bays. These are
    # geometric normal relief, not light/shadow stripes painted into albedo.
    ribs=[4.322*i/26 for i in range(27)]
    for interval in [.196,.204,.196,.204,.178,.160,.098,.098,.098,.098,.098]:ribs.append(ribs[-1]+interval)
    x=u*F(domain[0]);chord=v*F(domain[1]);rng=np.random.default_rng(615)
    for left,right in zip(ribs,ribs[1:]):
        center=(left+right)/2;span=right-left
        taper=np.exp(-((x-center)/(span*.43))**6)
        for _ in range(18):
            station=float(rng.uniform(.06,.94)*domain[1]);slope=float(rng.normal(0,.12))
            width=float(rng.uniform(.004,.009));amplitude=float(rng.uniform(.00065,.00120))
            ridge=np.exp(-((chord-station-(x-center)*slope)/width)**2)*taper
            height+=ridge*F(amplitude);rough+=ridge*F(.012)
    edge=np.exp(-((v-.02)/.055)**2)+np.exp(-((v-.98)/.055)**2)
    dirt=np.clip(edge*(.055+meso*.035)+Noise(w,h,614,180)*.025,0,.12);color*=1-dirt[:,:,None]
    height+=np.sin(v*83+meso*2)*edge*F(.00012);rough+=edge*.05
    return color,height,rough,metal,ao

def Cowl(w,h,domain):
    sample=SourceSample('Cowl',w,h,domain);color=Recolor(sample,(.050,.056,.058),1.8);lum=Luma(sample);del sample
    meso=Noise(w,h,720,20);fine=Noise(w,h,721,2)
    grain=(lum-np.mean(lum))/max(F(.005),F(np.percentile(lum,95)-np.percentile(lum,5)))
    height=grain*F(.000050)+fine*F(.000012);rough=np.full((h,w),.44,dtype=F)+grain*.10+meso*.06;metal=np.full((h,w),.025,dtype=F);ao=np.ones((h,w),dtype=F)
    v=1-np.arange(h,dtype=F)[:,None]/h
    lips=np.exp(-((v-.480)/.0040)**2)+np.exp(-((v-.520)/.0035)**2)+np.exp(-((v-.024)/.0035)**2)
    breakup=Noise(w,h,722,3)+Noise(w,h,723,12)*.5
    outside=((v>.075)&(v<.47)).astype(F)
    # Sparse 1--4mm chips across the exposed enamel, denser at rolled lips.
    # The worn islands share their exact footprint in color, metal and relief.
    chips=np.clip((breakup-.10)*4.6,0,.85)*lips
    specks=Stamp(w,h,726,900,radius=(.7,2.4))*outside
    rim=Stamp(w,h,727,1200,radius=(1.0,3.6),bands=[.480,.520,.024])*lips
    wear=np.clip(chips+specks*.72+rim*.90,0,.98);metal+=wear*.90;rough+=wear*.06
    color=color*(1-wear[:,:,None])+wear[:,:,None]*np.asarray([.43,.45,.44],dtype=F);height-=wear*F(.000075)
    scratch=Scratches(w,h,724,600,domain)*outside;color+=scratch[:,:,None]*.055;height-=scratch*F(.000025);rough-=scratch*.07
    grime=Stamp(w,h,725,60,radius=(2,7),bands=[.90])*.08;color*=1-grime[:,:,None];rough+=grime*.5
    u=np.arange(w,dtype=F)[None,:]/w
    fastener=np.exp(-(np.sin(u*np.pi*12)/.10)**2)*np.exp(-((v-.0865)/.008)**2)
    rubbed=np.exp(-(np.sin(u*np.pi*12)/.22)**2)*np.exp(-((v-.0865)/.020)**2)
    color+=rubbed[:,:,None]*.035;color*=1-fastener[:,:,None]*.20
    rough-=rubbed*.16;ao-=fastener*.20;height-=fastener*F(.00015)
    return color,height,rough,metal,ao

def Other(name,w,h,domain):
    u=np.arange(w,dtype=F)[None,:]/w;v=1-np.arange(h,dtype=F)[:,None]/h
    fine=Noise(w,h,800+len(recipes),2);meso=Noise(w,h,900+len(recipes),25)
    height=np.zeros((h,w),dtype=F);rough=np.full((h,w),.6,dtype=F);metal=np.zeros((h,w),dtype=F);ao=np.ones((h,w),dtype=F)
    if name=='Aluminum':
        sample=SourceSample('Aluminum',w,h,domain);color=Recolor(sample,(.66,.68,.67),.55);del sample
        metal[:]=.94;rough[:]=.34;height+=fine*F(.000020)+meso*F(.000035);rough+=meso*.035
    elif name=='EngineCast':
        # Hikari museum close-ups show isotropic casting pores, not rolled-sheet
        # striations. Keep the cast grain separate from machined aluminum.
        cast=Noise(w,h,1006,1.2);patches=Noise(w,h,1007,90)
        pores=np.clip((-cast-.22)*3.2,0,1)
        color=np.empty((h,w,3),dtype=F);color[:]=(.48,.485,.46)
        color*=1+patches[:,:,None]*.10-pores[:,:,None]*.07
        height+=cast*F(.000035)-pores*F(.000025);metal[:]=.82;rough[:]=.55
        rough+=meso*.13+pores*.14
        edge=np.exp(-((v-.05)/.08)**2)+np.exp(-((v-.95)/.08)**2)
        oil=np.clip((.45+Noise(w,h,1008,18))*edge*.24,0,.30)
        color*=1-oil[:,:,None]*.7;rough+=oil*.35;metal-=oil*.4;ao-=oil*.18
    elif name in ['Steel','Exhaust']:
        sample=SourceSample('Steel',w,h,domain);color=Recolor(sample,(.15,.145,.13) if name=='Steel' else (.26,.20,.15),1.1);lum=Luma(sample);del sample
        oxide=np.clip((.36-lum)*2,0,.5);height+=fine*F(.00013)+meso*F(.00014);rough[:]=.67 if name=='Steel' else .60;metal[:]=.78 if name=='Steel' else .64
        rough+=oxide*.22+meso*.07;metal-=oxide*.24;ao-=oxide*.12
        if name=='Exhaust':
            soot=np.exp(-((u-.97)/.11)**2)*(.65+meso*.4);heat=np.exp(-((u-.12)/.20)**2)
            color*=1-soot[:,:,None]*.55;color+=np.broadcast_to(heat,(h,w))[:,:,None]*np.asarray([-.025,-.018,.025],dtype=F);rough+=soot*.17
    elif name=='Rubber':
        color=np.empty((h,w,3),dtype=F);color[:]=(.045,.050,.046);color+=meso[:,:,None]*.018;rough[:]=.88
        grooves=np.exp(-(np.sin(v*np.pi*9)/.10)**2);height-=grooves*F(.00030);height+=fine*F(.000075)
        dust=(np.exp(-((v-.20)/.10)**2)+np.exp(-((v-.80)/.10)**2))*(.5+meso)*.07;color+=dust[:,:,None]*np.asarray([.72,.64,.47],dtype=F)
        ao-=grooves*.14;rough+=meso*.06
    else:
        # Measured 0.4m CC0 leather sample, with real grain/creases rather than sine bands.
        color=np.asarray(Image.open(leatherRoot/'Texture_BrownLeatherBase.jpg').convert('RGB').resize((w,h),Image.Resampling.LANCZOS),dtype=F)/255
        color*=F(.72)
        rough=np.asarray(Image.open(leatherRoot/'Texture_BrownLeatherRoughness.png').convert('L').resize((w,h),Image.Resampling.LANCZOS),dtype=F)/255
        rough=np.clip(rough*.75+.20,.50,.94)
        ao=np.asarray(Image.open(leatherRoot/'Texture_BrownLeatherAo.png').convert('L').resize((w,h),Image.Resampling.LANCZOS),dtype=F)/255
        height+=meso*F(.000025)
    return color,height,rough,metal,ao

def Save(name,w,h,domain,kind):
    if kind=='Body':fields=Body(w,h,domain)
    elif kind=='Linen':fields=Fabric(w,h,domain)
    elif kind=='RibTape':fields=Fabric(w,h,domain,True)
    elif kind=='Cowl':fields=Cowl(w,h,domain)
    else:fields=Other(kind,w,h,domain)
    color,height,rough,metal,ao=fields;del fields
    record={'version':'20261023SurfaceV2','kind':kind,'size':[w,h],'uvDomainM':list(domain),'sourceAtlasSha256':hashlib.sha256(atlasPath.read_bytes()).hexdigest(),'channels':{}}
    def Write(channel,a):
        p=textureRoot/f'Texture_Ki4{name}{channel}.png';im=Image.fromarray((np.clip(a,0,1)*255+.5).astype('uint8'),'RGB');im.save(p,optimize=True)
        record['channels'][channel]={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
    Write('Base',color);del color;gc.collect()
    gy,gx=np.gradient(height);nx=-gx/F(domain[0]/w);ny=gy/F(domain[1]/h);length=np.sqrt(nx*nx+ny*ny+1)
    normal=np.empty((h,w,3),dtype=F);normal[:,:,0]=nx/length*.5+.5;normal[:,:,1]=ny/length*.5+.5;normal[:,:,2]=1/length*.5+.5
    if kind=='Leather':
        detail=np.asarray(Image.open(leatherRoot/'Texture_BrownLeatherNormal.png').convert('RGB').resize((w,h),Image.Resampling.LANCZOS),dtype=F)/F(127.5)-1
        bx=detail[:,:,0]*.8+(normal[:,:,0]*2-1);by=detail[:,:,1]*.8+(normal[:,:,1]*2-1);bz=detail[:,:,2]*(normal[:,:,2]*2-1)
        norm=np.sqrt(bx*bx+by*by+bz*bz);normal[:,:,0]=bx/norm*.5+.5;normal[:,:,1]=by/norm*.5+.5;normal[:,:,2]=bz/norm*.5+.5
        record['leatherSource']='PolyHaven brown_leather by RobTuytel, CC0, 0.4m sample; material analogue only'
    Write('Normal',normal);del normal,nx,ny,length,gx,gy,height;gc.collect()
    orm=np.empty((h,w,3),dtype=F);orm[:,:,0]=np.clip(ao,.55,1);orm[:,:,1]=np.clip(rough,.18,.98);orm[:,:,2]=np.clip(metal,0,1)
    Write('Orm',orm);del orm,rough,metal,ao;gc.collect();recipes[name]=record;print(name,w,h,flush=True)

def Run():
    assert atlasPath.exists(), 'Archive the generated albedo atlas before baking'
    for args in [('Fuselage',4096,2048,(7.14,3.6),'Body'),('Linen',4096,2048,(6,2),'Linen'),('RibTape',512,1024,(.014,.20),'RibTape'),('Cowl',4096,2048,(4.5553,1.4256),'Cowl'),('Aluminum',1024,1024,(1.5,1.5),'Aluminum'),('EngineCast',1024,1024,(.5,.5),'EngineCast'),('Steel',1024,1024,(.5,.5),'Steel'),('Rubber',1024,1024,(2.70,.29),'Rubber'),('Exhaust',1024,1024,(1.5,.34),'Exhaust'),('Leather',1024,1024,(.4,.4),'Leather')]:Save(*args)
    (textureRoot/'Data_TextureRecipes.json').write_text(json.dumps(recipes,indent=2),encoding='utf8')

if __name__=='__main__':Run()
