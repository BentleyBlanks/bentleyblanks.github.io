"""Metric wear masks and distinct coating, oxide, steel and contact responses."""
from pathlib import Path
import ast,hashlib,json,math,os
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_WEAR101_ROOT',str(base/'SurfaceV101')));folder=root/'Textures/HighSurfaceV101'
data=json.loads((root/'Acceptance/Data_WearPreparationV101.json').read_text())
for item in data['inputs'].values():assert hashlib.sha256(Path(item['file']).read_bytes()).hexdigest()==item['sha256']
syntax=ast.parse(Path(__file__).with_name('Script_Type94WearRasterV77.py').read_text())
names=['Seed','Pixel','Cross2','Clip','Polygon','Stamp','Linear','Srgb']
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),'Wear101PureGeometry','exec'),globals())

def Noise(rng,resolution):
    source=Image.fromarray(rng.integers(0,256,(resolution,resolution),dtype=np.uint8))
    return np.asarray(source.resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
def Quantize(value):return np.rint(np.clip(value,0,1)*255).astype(np.uint8)
def PreparePlanes(triangles,role):
    groups={}
    for tri in triangles:
        if role=='Paint'and not any(s in tri['owner']for s in ['Hatch','Turret','Tow','Nose']):continue
        if role=='Track'and tri['contact']<.5:continue
        p=np.asarray(tri['pointsWorldM']);n=np.cross(p[1]-p[0],p[2]-p[0]);length=np.linalg.norm(n)
        if length<.00001:continue
        n/=length
        if n[np.argmax(abs(n))]<0:n=-n
        key=(tri['owner'],*np.rint(n*1000).astype(int),round(float(n@p[0])*10000));groups.setdefault(key,[]).append(tri)
    for key,triangles in groups.items():
        n=np.asarray(key[1:4],float);n/=np.linalg.norm(n);origin=n*(key[4]/10000);u=np.cross([1.,0.,0.],n)
        if np.linalg.norm(u)<.1:u=np.cross([0.,0.,1.],n)
        u/=np.linalg.norm(u);v=np.cross(n,u);prepared=[];area=0
        for tri in triangles:
            p=np.asarray(tri['pointsWorldM']);xy=np.c_[(p-origin)@u,(p-origin)@v];matrix=np.column_stack((xy[1]-xy[0],xy[2]-xy[0]));det=np.linalg.det(matrix)
            if abs(det)>1e-12:prepared.append((tri,xy,np.linalg.inv(matrix)));area+=abs(det)/2
        if prepared:yield key,prepared,area

def SurfaceScuffs(triangles):
    """One metric world stroke continues across curved faces and UV seams."""
    owners={}
    for tri in triangles:
        if any(s in tri['owner']for s in ['Hull','Hatch','Turret','Nose']):owners.setdefault(tri['owner'],[]).append(tri)
    count=0
    for owner,rows in owners.items():
        points=np.asarray([t['pointsWorldM']for t in rows]);uvs=np.asarray([t['uv']for t in rows]);e1=points[:,1]-points[:,0];e2=points[:,2]-points[:,0];cross=np.cross(e1,e2);area=np.linalg.norm(cross,axis=1)/2;normals=cross/np.maximum(area[:,None]*2,1e-15);inverse=np.linalg.pinv(np.stack((e1,e2),axis=2));lo,hi=points.min(axis=1),points.max(axis=1);local=np.random.default_rng(Seed('PhysicalScuff101'+owner));handling=any(s in owner for s in ['Hatch','Turret']);amount=min(65,int(local.poisson(area.sum()*(24 if handling else 4))))
        def DrawWorld(polygon,label,value,normal,centre):
            margin=.0015;near=np.flatnonzero(np.all(hi>=polygon.min(axis=0)-margin,axis=1)&np.all(lo<=polygon.max(axis=0)+margin,axis=1)&(normals@normal>.82)&(abs((points[:,0]-centre)@normal)<.003))
            for i in near:
                projected=(polygon-points[i,0])@inverse[i].T;clipped=Clip(projected,np.array([[0.,0.],[1.,0.],[0.,1.]]))
                if len(clipped)>2:
                    coords=uvs[i,0]+clipped[:,:1]*(uvs[i,1]-uvs[i,0])+clipped[:,1:]*(uvs[i,2]-uvs[i,0]);draws[label].polygon([tuple(Pixel(v))for v in coords],fill=value)
        for mark in range(amount):
            i=int(local.choice(len(rows),p=area/area.sum()));weights=local.dirichlet([1.,1.,1.]);centre=weights@points[i];normal=normals[i];direction=local.normal(size=3);direction-=normal*(direction@normal);direction/=max(np.linalg.norm(direction),1e-12);across=np.cross(normal,direction);length=local.uniform(.026,.085);width=local.uniform(.0025,.007)
            polygon=np.array([centre+direction*math.cos(t)*length*.5+across*math.sin(t)*width*local.uniform(.5,1)for t in np.linspace(0,2*math.pi,20,endpoint=False)]);DrawWorld(polygon,'Scuff',int(local.integers(130,220)),normal,centre)
            for stroke in range(int(local.integers(3,7))):
                c=centre+across*local.uniform(-width,width);extent=length*local.uniform(.35,.95);w=local.uniform(.00025,.0007);polygon=np.array([c-direction*extent*.5,c-direction*extent*.3+across*w,c+direction*extent*.5,c+direction*extent*.2-across*w*.65]);DrawWorld(polygon,'Scratch',int(local.integers(175,255)),normal,centre)
            count+=1
    return count

reports={}
for role,record in data['roles'].items():
    size,factor=record['size'],2;rng=np.random.default_rng(Seed('WearLayers101'+role))
    layers={k:Image.new('L',(size*factor,)*2)for k in ['Loss','Scuff','Scratch','Contact']};draws={k:ImageDraw.Draw(v)for k,v in layers.items()};edgeMarks=0;clusters=0
    coverage=Image.new('L',(size*factor,)*2);coverageDraw=ImageDraw.Draw(coverage)
    for tri in record['triangles']:
        polygon=[tuple(Pixel(uv))for uv in tri['uv']];coverageDraw.polygon(polygon,fill=255)
        if role=='Track':draws['Contact'].polygon(polygon,fill=round(tri['contact']*255))
    for index,edge in enumerate(record['edges']):
        local=np.random.default_rng(Seed('Wear101'+role+edge['owner']+str(index)));handling=any(s in edge['owner']for s in ['Hatch','Hinge','Tow','Turret','MachineGun'])
        probability=(.03+.09*edge['exposure']+(.045 if handling else 0))if edge['lengthM']<.025 else(.14+.28*edge['exposure'])
        if role=='Paint':probability*=.58
        count=max(1,math.ceil(edge['lengthM']/.055))
        for part in range(count):
            if local.random()>probability:continue
            t=(part+local.uniform(.12,.88))/count;length=min(edge['lengthM']/count*local.uniform(.24,.75),.04);width=local.uniform(.0011,.0042)if role=='Paint'else local.uniform(.0005,.0017);stampSeed=int(local.integers(0,2**32))
            for segment in edge['segments']:
                a,b=Pixel(segment['uvA']),Pixel(segment['uvB']);density=segment['pixelsPerMetre']*factor;c=a+(b-a)*t
                Polygon(draws['Loss'],c,b-a,length*density,width*density,np.random.default_rng(stampSeed),segment['clipUvTriangles'])
                Polygon(draws['Scuff'],c,b-a,length*density*1.6,width*density*2.5,np.random.default_rng(stampSeed+1),segment['clipUvTriangles'],140)
                if handling or role!='Paint':Polygon(draws['Scratch'],c,b-a,length*density*.72,width*density*.24,np.random.default_rng(stampSeed+2),segment['clipUvTriangles'],235)
            edgeMarks+=1
    for key,prepared,area in PreparePlanes(record['triangles'],role):
        local=np.random.default_rng(Seed('Scuff101'+role+str(key)));points=np.vstack([r[1]for r in prepared]);lo,hi=points.min(axis=0),points.max(axis=0)
        if role=='Paint':amount=min(16,int(area*11))
        elif role=='Track':amount=min(22,int(area*1400))
        else:amount=min(5,int(area*180))
        for mark in range(amount):
            centre=local.uniform(lo,hi);angle=local.uniform(-.25,.25)if role=='Track'else local.uniform(-math.pi,math.pi);direction=np.array([math.cos(angle),math.sin(angle)]);across=np.array([-direction[1],direction[0]])
            length=local.uniform(.014,.075)if role=='Paint'else local.uniform(.006,.022);width=local.uniform(.002,.009)if role=='Paint'else .0012
            outline=np.asarray([centre+(direction*math.cos(t)*length+across*math.sin(t)*width)*local.uniform(.35,.65)for t in np.linspace(0,2*math.pi,19,endpoint=False)]);Stamp(prepared,outline,'Scuff',int(local.integers(100,200)))
            for stroke in range(int(local.integers(3,8))):
                c=centre+across*local.uniform(-width,width);extent=length*local.uniform(.3,.92);w=local.uniform(.00025,.00085);polygon=np.array([c-direction*extent*.5,c-direction*extent*.32+across*w,c+direction*extent*.5,c+direction*extent*.18-across*w*.65]);Stamp(prepared,polygon,'Scratch',int(local.integers(150,255)))
            clusters+=1
    if role=='Paint':clusters+=SurfaceScuffs(record['triangles'])
    masks={k:np.asarray(v.resize((size,size),Image.Resampling.LANCZOS),dtype=np.float32)/255 for k,v in layers.items()};coarse=Noise(rng,192);grain=Noise(rng,768);fine=rng.random((size,size),dtype=np.float32)
    if role=='Paint':
        for label,weight in [('Loss',1),('Scuff',.65),('Scratch',.5)]:masks[label]=np.maximum(masks[label],np.asarray(Image.open(data['oldMasks'][label]).convert('L'),dtype=np.float32)/255*weight)
    # These are material coverage masks, not illumination or photo highlights.
    loss=masks['Loss'];scuff=masks['Scuff'];scratch=masks['Scratch'];contact=masks['Contact'];erosion=np.asarray(Image.fromarray(Quantize(loss)).filter(ImageFilter.MinFilter(3)),dtype=np.float32)/255
    dull=erosion*np.clip((coarse-.22)*3.6,0,1);polish=np.maximum(erosion*np.clip((coarse-.56)*7,0,1),scratch*.9);oxide=loss*(1-dull*.9)
    if role=='Track':
        polish=np.maximum(polish,contact*np.clip((grain-.2)*1.7,0,1));oxide=(1-contact)*np.clip((coarse-.58)*4,0,1)*.4;dull=np.maximum(dull,contact*.8);loss=np.maximum(loss,contact)
    elif role=='Steel':
        # Blueing stays on the barrel; exposed steel is confined to actual
        # convex edges and a few fine handling marks.
        dull=loss*.75;oxide*=.2;polish=np.maximum(polish,scratch)
    masks.update(Loss=loss,Dull=dull,Polish=polish,Oxide=oxide)
    masks={k:Quantize(v).astype(np.float32)/255 for k,v in masks.items()};loss,scuff,scratch,dull,polish,oxide=[masks[k]for k in ['Loss','Scuff','Scratch','Dull','Polish','Oxide']]
    original={c:np.array(Image.open(data['inputs'][role+c]['file']).convert('RGB'))for c in ['Base','Orm','Normal']};pigment=Linear(original['Base'].astype(np.float32)/255);orm=original['Orm'].copy();rough=orm[:,:,1].astype(np.float32)/255;metal=orm[:,:,2].astype(np.float32)/255
    pigment*=1-scuff[:,:,None]*.035;rough=rough*(1-scuff*.65)+(.34+coarse*.13)*scuff*.65
    oxideColor=np.stack((.025+grain*.016,.020+grain*.014,.012+grain*.009),axis=-1);agedSteel=(.13+grain*.07)[:,:,None]*np.array([.92,.98,1.],np.float32);brightSteel=(.25+grain*.10)[:,:,None]*np.array([.94,.98,1.],np.float32)
    pigment=pigment*(1-loss[:,:,None])+oxideColor*loss[:,:,None];rough=rough*(1-loss)+(.64+grain*.12)*loss;metal=metal*(1-loss)+.10*loss
    pigment=pigment*(1-dull[:,:,None])+agedSteel*dull[:,:,None];rough=rough*(1-dull)+(.39+grain*.14)*dull;metal=metal*(1-dull)+.94*dull
    pigment=pigment*(1-polish[:,:,None])+brightSteel*polish[:,:,None];rough=rough*(1-polish)+(.19+grain*.12)*polish;metal=metal*(1-polish)+.99*polish
    if role=='Track':
        pigment=pigment*(1-oxide[:,:,None])+oxideColor*oxide[:,:,None];rough=rough*(1-oxide)+.76*oxide;metal=metal*(1-oxide)+.18*oxide
    orm[:,:,1]=Quantize(rough);orm[:,:,2]=Quantize(metal)
    normal=original['Normal'].astype(np.float32)/127.5-1;normal[:,:,:2]*=(1-np.maximum(loss*.88,scuff*.25))[:,:,None]
    height=(1-loss)*(.000035 if role=='Paint'else .000012)-scratch*.000014
    # Per-face metric density prevents tiny hardware getting inflated relief.
    densityImage=Image.new('F',(size,size),0);densityDraw=ImageDraw.Draw(densityImage)
    for tri in record['triangles']:
        uv=np.asarray(tri['uv']);p=np.asarray(tri['pointsWorldM']);a=np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))/2;b=abs(Cross2(uv[1]-uv[0],uv[2]-uv[0]))/2
        if a>1e-14:densityDraw.polygon([tuple(Pixel(v)/factor)for v in uv],fill=float(size*math.sqrt(b/a)))
    density=np.asarray(densityImage);gy,gx=np.gradient(height);normal[:,:,0]-=gx*density;normal[:,:,1]+=gy*density;normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
    touched=(loss>0)|(scuff>0)|(scratch>0)|(oxide>0);outputs={};maskFiles={}
    for label,value in masks.items():
        file=folder/('Texture_Type94'+role+label+'V101.png');Image.fromarray(Quantize(value)).save(file);maskFiles[label]=str(file)
    file=folder/('Texture_Type94'+role+'TouchedV101.png');Image.fromarray(touched.astype(np.uint8)*255).save(file);maskFiles['Touched']=str(file)
    for channel,pixels in [('Base',Quantize(Srgb(pigment))),('Orm',orm),('Normal',Quantize(normal*.5+.5))]:
        pixels[~touched]=original[channel][~touched];file=folder/('Texture_Type94'+role+channel+'WearV101.png');Image.fromarray(pixels).save(file);outputs[channel]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    reports[role]=dict(outputs=outputs,masks=maskFiles,physicalEdgeMarks=edgeMarks,handlingClusters=clusters,touchedPixels=int(touched.sum()),polishedPixels=int((polish>.8).sum()),darkSubstratePixels=int(((loss>.8)&(polish<.1)&(dull<.2)).sum()),aoPixelsUnchanged=True)
    print(json.dumps(dict(role=role,edgeMarks=edgeMarks,clusters=clusters,touchedPixels=int(touched.sum()))),flush=True)
report=dict(roles=reports,paintLossHeightM=.000035,sourceGeometryUvAndRigUnchanged=True,allAoUnchanged=True,rubberUnchanged=True,scope='Inferred usage wear: interrupted dark flake margins, dull exposed steel, sharper rubbed lands and metric scratches. Recess oxide is restrained. Amount and placement are art direction; no historical damage claim.')
(root/'Acceptance/Data_WearRasterV101.json').write_text(json.dumps(report,indent=2)+'\n')
