"""Deterministic UV PBR baking for Ki-4. Run using Python + NumPy + Pillow.

This is a physically partitioned author texture bake, not generative image editing.
No illumination, specular highlight or photographic shadow is baked into BaseColor.
Aluminum is oxidized, never painted with ferrous rust. Paint chips reveal metal.
Reference photographs are monochrome: all hue choices are declared reconstruction.
"""
import pathlib, json, hashlib, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sourceRoot=pathlib.Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4')
textureRoot=sourceRoot/'Textures';textureRoot.mkdir(parents=True,exist_ok=True)
repoRoot=pathlib.Path(__file__).resolve().parents[2]
recipes={}

def Noise(w,h,seed,scale):
    rng=np.random.default_rng(seed);iw=max(3,int(w/scale));ih=max(3,int(h/scale))
    a=Image.fromarray((rng.random((ih,iw))*255).astype('uint8')).resize((w,h),Image.Resampling.BICUBIC)
    return np.asarray(a,dtype=np.float32)/255

def Stamps(w,h,seed,count,ys=None,radius=(1,4)):
    rng=np.random.default_rng(seed);im=Image.new('L',(w,h));d=ImageDraw.Draw(im)
    for _ in range(count):
        x=int(rng.random()*w);y=int((rng.choice(ys)+rng.normal(0,.008))*h) if ys else int(rng.random()*h)
        r=float(rng.uniform(*radius));d.ellipse((x-r,y-r*.35,x+r,y+r*.35),fill=int(rng.uniform(90,255)))
    return np.asarray(im,dtype=np.float32)/255

def Bake(name,w,h,kind,physical=(2,2)):
    u=np.arange(w,dtype=np.float32)[None,:]/w
    v=1-np.arange(h,dtype=np.float32)[:,None]/h
    broad=Noise(w,h,94+len(recipes),200)-.5
    meso=Noise(w,h,414+len(recipes),26)-.5
    fine=Noise(w,h,118+len(recipes),2)-.5
    height=np.zeros((h,w),dtype=np.float32);ao=np.ones_like(height)
    rough=np.full_like(height,.5);metal=np.full_like(height,.0)
    color=np.empty((h,w,3),dtype=np.float32)
    if kind=='body':
        color[:]=(.63,.65,.64);metal[:]=.89;rough[:]=.43
        y=-4.56+u*7.14;theta=v*2*np.pi
        lower=np.exp(-((theta-np.pi)/.7)**2)
        exhaust=np.exp(-((theta-1.75)/.25)**2)+np.exp(-((theta-4.53)/.25)**2)
        exhaust=exhaust*np.exp(-((y-1.2)/.85)**2)
        grime=np.clip(exhaust*(.10+meso*.08)+lower*(.018+broad*.025),0,.25)
        color*=1-grime[:,:,None]
        color+=(broad*.016+meso*.009+fine*.003)[:,:,None]
        rough+=grime*.8+broad*.08+meso*.03
        height+=fine*.000008+meso*.000018
        # Real frame stations and restrained longitudinal panel seams, not an arbitrary tiled grid.
        seams=np.zeros_like(height)
        for station in [-3.70,-3.05,-2.35,-1.55,-.70,.10,.90,1.65,2.30]:
            d=np.abs(y-station);seams+=np.exp(-(d/.0017)**2)
            rivets=np.exp(-((d-.010)/.0032)**2)*np.exp(-(np.sin(theta*48)/.10)**2)
            height-=rivets*.00013;rough+=rivets*.05;ao-=rivets*.09
        for a in [.95,2.10,4.18,5.33]:
            d=np.abs(theta-a);mask=np.exp(-(d/.0018)**2)
            seams+=mask*.35
        height-=np.clip(seams,0,1)*.00016;color*=1-np.clip(seams,0,1)[:,:,None]*.09
        rough+=np.clip(seams,0,1)*.05
        # Handling scratches occur around the two cockpit openings and service panels.
        nearCockpit=np.exp(-((y-.18)/.65)**2)+np.exp(-((y+1.13)/.68)**2)
        nearCockpit=nearCockpit*(np.exp(-((theta-.6)/.35)**2)+np.exp(-((theta-5.68)/.35)**2))
        scratches=Stamps(w,h,117,420,radius=(1,5))*np.clip(nearCockpit,0,1)
        color+=scratches[:,:,None]*.10;rough-=scratches*.08;height-=scratches*.000035
        # Photo02's small factory marking. Do not transfer Photo01's large numerals.
        fontArchive=sourceRoot/'Fonts/NotoSansSC-Bold.otf';fontSource=repoRoot/'tmp/fontsrc/NotoSansSC-Bold.otf'
        if not fontArchive.exists():
            assert fontSource.exists(), 'Place the project NotoSansSC-Bold.otf source in tmp/fontsrc (see Font/README.md)'
            fontArchive.parent.mkdir(exist_ok=True);shutil.copy2(fontSource,fontArchive)
        font=ImageFont.truetype(str(fontArchive),60)
        glyph=Image.new('L',(1100,130));gd=ImageDraw.Draw(glyph);gd.text((8,8),'機番141（中島製）',font=font,fill=255)
        glyph=glyph.crop(glyph.getbbox()).resize((315,55),Image.Resampling.LANCZOS).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        mask=Image.new('L',(w,h));cx=int(((-2.85+4.56)/7.14)*w);cy=int((1-1.90/(2*np.pi))*h)
        mask.paste(glyph,(cx-glyph.width//2,cy-glyph.height//2))
        ink=np.asarray(mask,dtype=np.float32)/255
        color=color*(1-ink[:,:,None])+np.array([.023,.025,.022])*ink[:,:,None]
        rough=rough*(1-ink)+ink*.67;metal=metal*(1-ink);height+=ink*.000006
    elif kind=='fabric':
        color[:]=(.64,.65,.61);rough[:]=.70;metal[:]=.025
        edge=np.exp(-((v-.025)/.06)**2)+np.exp(-((v-.98)/.05)**2)
        dirt=np.clip(edge*(.025+meso*.018)+broad*.018,0,.07)
        color*=1-dirt[:,:,None];color+=(meso*.007)[:,:,None]
        # The cured silver dope largely fills the linen weave; no coarse burlap.
        warp=np.sin(2*np.pi*u*w/3.5);weft=np.sin(2*np.pi*v*h/3.4)
        weave=warp*weft
        height+=weave*.000009+fine*.000004
        rough+=weave*.018+edge*.04+meso*.035
        wear=Stamps(w,h,718,220,ys=[.03,.97],radius=(1,3))
        color-=wear[:,:,None]*.018;height-=wear*.00002
    elif kind=='cowl':
        color[:]=(.043,.052,.053);rough[:]=.33;metal[:]=.05
        # The black enamel chips at the rolled lips and fastener rings.
        chips=Stamps(w,h,314,850,ys=[.15,.42,.59,.91],radius=(1,5))
        lips=np.exp(-((v-.43)/.015)**2)+np.exp(-((v-.9)/.014)**2)
        wear=np.clip(chips+lips*.06,0,1)
        metal+=wear*.9;rough+=wear*.18+meso*.045
        color=color*(1-wear[:,:,None])+np.array([.54,.57,.56])*wear[:,:,None]
        color+=(broad*.004+meso*.003)[:,:,None]
        height+=fine*.000006-wear*.000045
        # Faint downward rain streaks start at the top fastening zone.
        rain=(np.sin(u*157*np.pi)**20)*np.maximum(0,np.cos((v-.25)*np.pi))*meso*.006
        color-=rain[:,:,None]
    elif kind=='rubber':
        color[:]=(.052,.057,.052);rough[:]=.86
        grooves=np.exp(-(np.sin(v*np.pi*9)/.07)**2)
        height-=grooves*.00017;height+=fine*.000045
        color+=(meso*.008)[:,:,None];rough+=meso*.06
        dust=np.maximum(0,broad)*.025;color+=dust[:,:,None]*np.array([1,.87,.63])
        # Sidewall's fine concentric molding, not rust or shiny metal.
        height+=np.sin(v*np.pi*160)*.000012
    elif kind=='exhaust':
        color[:]=(.20,.14,.095);metal[:]=.75;rough[:]=.79
        oxide=np.clip(meso*2+.35,0,1);color=color*(1-oxide[:,:,None]*.4)
        color+=oxide[:,:,None]*np.array([.045,.012,-.01]);metal-=oxide*.22
        heat=np.exp(-((v-.15)/.20)**2);color+=np.broadcast_to(heat,(h,w))[:,:,None]*np.array([-.025,-.015,.02])
        soot=np.exp(-((v-.98)/.12)**2);color*=1-soot[:,:,None]*.50
        height+=fine*.00012+meso*.00010;rough+=meso*.13
    elif kind=='leather':
        color[:]=(.17,.105,.057);rough[:]=.68
        pores=np.clip(-fine-.12,0,1);height-=pores*.00012
        creases=np.maximum(0,.12-np.abs(np.sin(u*30+meso*1.2)))*.00020
        height-=creases;color+=(broad*.035+meso*.012)[:,:,None];rough+=meso*.08
    else:
        color[:]=(.40,.43,.43);metal[:]=.88;rough[:]=.45
        if kind=='steel':color[:]=(.17,.19,.19);rough[:]=.55
        brush=np.sin(u*w*1.7+meso*4)*.002
        height+=brush*.000006+fine*.000008;color+=(broad*.018+meso*.008)[:,:,None];rough+=meso*.06
        grease=Stamps(w,h,222,110,radius=(1,4))*.04
        color*=1-grease[:,:,None];rough+=grease
    color=np.clip(color,0,1);rough=np.clip(rough,.15,.97);metal=np.clip(metal,0,1);ao=np.clip(ao,.68,1)
    # OpenGL tangent-space normal, computed in meters from explicitly sized UV domains.
    gy,gx=np.gradient(height);dx=physical[0]/w;dy=physical[1]/h
    nx=-gx/dx;ny=gy/dy;nz=np.ones_like(nx);length=np.sqrt(nx*nx+ny*ny+1)
    normal=np.stack((nx/length,ny/length,nz/length),axis=-1)*.5+.5
    orm=np.stack((ao,rough,metal),axis=-1)
    record={'kind':kind,'size':[w,h],'uvDomainM':list(physical),'channels':{},'source':'Deterministic material/UV recipe; monochrome photographic appearance and 1937 construction reference; hue is inferred'}
    if kind=='body':record['factoryMark']={'text':'機番141（中島製）','sourcePhoto':'Nakajima_Ki-4.jpg','confidence':'141（中島製） readable; prefix and exact font forms inferred','side':'photographed starboard side only','font':'NotoSansSC-Bold.otf','fontSha256':hashlib.sha256(fontArchive.read_bytes()).hexdigest()}
    for channel,a in [('Base',color),('Normal',normal),('Orm',orm)]:
        p=textureRoot/f'Texture_Ki4{name}{channel}.png';Image.fromarray((np.clip(a,0,1)*255+.5).astype('uint8'),'RGB').save(p,optimize=True)
        record['channels'][channel]={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
    recipes[name]=record;print(name,kind,w,h)

if __name__=='__main__':
    Bake('Fuselage',4096,2048,'body',(7.14,3.6))
    Bake('Linen',4096,2048,'fabric',(6,2.25))
    Bake('Cowl',2048,1024,'cowl',(4.5,.68))
    Bake('Aluminum',1024,1024,'metal',(1.5,1.5))
    Bake('Steel',1024,1024,'steel',(.5,.5))
    Bake('Rubber',1024,1024,'rubber',(2.70,.29))
    Bake('Exhaust',1024,1024,'exhaust',(1.5,.34))
    Bake('Leather',512,512,'leather',(.55,.55))
    (textureRoot/'Data_TextureRecipes.json').write_text(json.dumps(recipes,indent=2),encoding='utf8')
