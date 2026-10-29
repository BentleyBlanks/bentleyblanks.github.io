"""Refine only already exposed paint/contact texels; do not scatter new damage."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from PIL import Image
manifestFile=Path(sys.argv[1]);manifest=json.loads(manifestFile.read_text(encoding='utf8'));profile=manifest['profile'];settings=profile['contactWear'];rows=[]
def Smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def Srgb(v):return np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)
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
        # Badge pigment and its original conductor classification are a datum.
        if role=='Armor':
            base[badge]=originals['Base'][badge];orm[badge]=originals['Orm'][badge];coat[badge]=originals['MicroCoatData'][badge]
        assert np.array_equal(base[:,:,3],originals['Base'][:,:,3]);assert np.array_equal(orm[:,:,0],originals['Orm'][:,:,0]);assert np.array_equal(coat[:,:,1:],originals['MicroCoatData'][:,:,1:]);assert np.array_equal(coat[:,:,0][~changedMetal],originals['MicroCoatData'][:,:,0][~changedMetal])
        assert not np.any((base!=originals['Base']).any(axis=2)&(colourMask==0));assert not np.any((orm!=originals['Orm']).any(axis=2)&((m<=settings['minimumExistingMetallic'])|badge))
        for label,data in [('Base',base),('Orm',orm),('MicroCoatData',coat)]:
            name=row['maps'][role+label]['name'];file=output/(name if name.lower().endswith('.png')else name+'.png');Image.fromarray(data).save(file);files[role+label]=str(file)
        stats.append({'role':role,'changedBaseTexels':int(np.count_nonzero((base!=originals['Base']).any(axis=2))),'changedOrmTexels':int(np.count_nonzero((orm!=originals['Orm']).any(axis=2))),'oldMetallicAreaAboveHalf':float(np.mean(m>.5)),'newMetallicAreaAboveHalf':float(np.mean(newM>.5)),'unwornPigmentExact':True,'aoAndEffectiveOpacityExact':True,'badgePixelsProtected':int(badge.sum()),'newDamageMask':False})
    rows.append({'quality':row['quality'],'files':files,'stats':stats})
result={'pass':True,'profileSha256':manifest['profileSha256'],'rows':rows};(manifestFile.parent/'Data_PaintFinishMaps.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'pass':True,'rows':[{k:v for k,v in r.items()if k!='files'}for r in rows]}))
