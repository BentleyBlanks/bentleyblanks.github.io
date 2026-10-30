"""Deterministic physical-scale PBR surfaces guided by a generated material board.

Images tile seamlessly. Base is sRGB; normal is OpenGL tangent space; ORM is
R=microcavity AO, G=roughness, B=metallic. Large-scale shading is not painted in.
The period photos are monochrome. The current khaki-olive palette is an inferred
historical candidate; the generated board supplies texture/response guidance,
not measured paint colour, historical geometry or a baked lighting texture.
"""
from pathlib import Path
import numpy as np
from PIL import Image
import json,hashlib,importlib.util

SOURCE=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck')
TEXTURES=SOURCE/'Textures';TEXTURES.mkdir(parents=True,exist_ok=True)
N=2048
rng=np.random.default_rng(193694)
y,x=np.mgrid[0:N,0:N].astype(np.float32)/N

def Noise(frequency,sourceRng=None):
    """Periodic Fourier noise, normalized; no directional illumination."""
    data=(rng if sourceRng is None else sourceRng).normal(size=(N,N)).astype(np.float32)
    fy=np.fft.fftfreq(N)[:,None];fx=np.fft.fftfreq(N)[None,:]
    result=np.fft.irfft2(np.fft.rfft2(data)*np.exp(-.5*(fx[:,:N//2+1]**2+fy**2)*(N/frequency)**2),s=(N,N)).astype(np.float32)
    return (result-result.mean())/(result.std()+1e-7)

def GrainNoise(alongFrequency,acrossFrequency,sourceRng=None):
    """Periodic, directionally correlated timber fibres without regular ridges."""
    data=(rng if sourceRng is None else sourceRng).normal(size=(N,N)).astype(np.float32)
    fy=np.fft.fftfreq(N)[:,None];fx=np.fft.fftfreq(N)[None,:N//2+1]
    spectrum=np.fft.rfft2(data)*np.exp(-.5*((fx*N/alongFrequency)**2+(fy*N/acrossFrequency)**2))
    field=np.fft.irfft2(spectrum,s=(N,N)).astype(np.float32)
    return (field-field.mean())/(field.std()+1e-7)

fine=Noise(320);medium=Noise(55);broad=Noise(8)
records=[]
def Save(zone,color,height,roughness,metallic,ao,tileM,method='Analytic surface microgeometry / physical height, no baked light',normalTileM=None):
    color=np.clip(color,0,255).astype(np.uint8)
    if color.ndim==1:color=np.broadcast_to(color,(N,N,3)).copy()
    roughness=np.broadcast_to(roughness,(N,N));metallic=np.broadcast_to(metallic,(N,N));ao=np.broadcast_to(ao,(N,N))
    # UV V increases upwards while the stored image's row increases downwards.
    normalTileM=tileM if normalTileM is None else normalTileM
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*normalTileM/N)
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*normalTileM/N)
    normal=np.stack([-dx,dy,np.ones_like(dx)],-1);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    normal=np.clip((normal*.5+.5)*255+.5,0,255).astype(np.uint8)
    orm=np.clip(np.stack([ao,roughness,metallic],-1)*255+.5,0,255).astype(np.uint8)
    channels={'Base':color,'Normal':normal,'Orm':orm};row={'zone':zone,'tileM':tileM,'normalTileM':normalTileM,'size':N,'method':method,'channels':{}}
    for channel,data in channels.items():
        path=TEXTURES/('Texture_Isuzu'+zone+channel+'.png');Image.fromarray(data).save(path,optimize=True)
        row['channels'][channel]={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'min':data.min(axis=(0,1)).tolist(),'max':data.max(axis=(0,1)).tolist()}
    records.append(row);print(zone,'authored PBR',flush=True)

# Retain the V77 intact-paint median pigment but remove cloudy tiled dirt,
# fading and repeated scratches. Existing contact wear and rolled lips carry
# exposed steel; rest-space vertex albedo carries lower-body grime. Only faint
# enamel peel belongs in this continuous coating. Scales remain artistic.
paintVariation=.18*fine+.06*medium
paint=np.array([123,122,92],np.float32)[None,None,:]+paintVariation[:,:,None]*np.array([1,.95,.8])
height=.000006*fine+.0000015*medium
paintRoughness=np.clip(.36+.004*medium+.002*fine,.335,.385)
Save('Paint',paint,height,paintRoughness,0,1,.75,
     'Continuous satin enamel: retained median pigment, fine peel, no tiled clouds or random metal scars; existing contact regions and rest-space grime retained')

# The generated source supplies irregular cotton fibres, not historical pigment
# or measured relief. Remove its low-frequency illumination and retain only
# restrained local variation. A 40mm tile gives approximately0.6mm yarn pitch;
# the old750mm analytic tile could not resolve its weave at2K.
canvasSource=SOURCE/'References/Texture_IsuzuCanvasWeaveSourceV41.png'
canvasSourceHash=hashlib.sha256(canvasSource.read_bytes()).hexdigest()
if canvasSourceHash!='6f0f43be8544e8e9ff418791c7fbbac4db24f2edbaf6b669dc95832d6a056707':
    raise RuntimeError('Canvas source does not match the reviewed built-in imagegen output')
spec=importlib.util.spec_from_file_location('IsuzuPbrBaker',Path(__file__).resolve().parents[1]/'_import/Script_BakePbrTexture.py')
baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
rgb,_=baker.LoadSquare(str(canvasSource),N)
flat=baker.WeldEdges(baker.FlattenLowFrequency(baker.SrgbToLinear(rgb),N/22),12)
lum=baker.LinearLuminance(flat)
detail=baker.GaussianPeriodic(lum,.8)-baker.GaussianPeriodic(lum,24)
detail=baker.WeldEdges(np.clip((detail-detail.mean())/detail.std(),-2.5,2.5),8)
canvasMacroSource=SOURCE/'References/Texture_IsuzuCanvasServiceSourceV79.png'
canvasMacroHash=hashlib.sha256(canvasMacroSource.read_bytes()).hexdigest()
if canvasMacroHash!='0a809765bf95c43bd8f01833464d54ad7746945afded4db617f599beeb5bcef6':raise RuntimeError('Unexpected reviewed canvas macro source')
macroRgb,_=baker.LoadSquare(str(canvasMacroSource),N)
# The V79 age-only swatch carries irregular soil and old crease stains.
# Mild filtering suppresses pixel artefacts; the independent4cm Normal
# retains cotton yarn relief without a large woven grid in the Base image.
macroLinear=baker.GaussianPeriodic(baker.SrgbToLinear(macroRgb),1.25)
macroMean=macroLinear.mean(axis=(0,1),keepdims=True)
macroLinear=macroMean+1.0*(macroLinear-macroMean)
target=baker.SrgbToLinear(np.array([119,111,88],np.float32)/255)
macroLinear*=target[None,None,:]/macroLinear.mean(axis=(0,1),keepdims=True)
macroLinear=baker.WeldEdges(np.clip(macroLinear,0,1),20)
canvas=np.clip(baker.LinearToSrgb(macroLinear)*255,0,255)
macroLum=baker.LinearLuminance(macroLinear)
oldStain=np.clip((macroLum.mean()-macroLum)/(macroLum.std()+1e-7)*.25,0,.8)
fibres=.000035*detail+.000003*fine
Save('Canvas',canvas,fibres,np.clip(.925+.025*oldStain,.90,.97),0,.985,2.5,
     'Reviewed built-in imagegen flat aged-cotton macro swatch,retone and edge weld;independent4cm cotton normal. Macro pigment/soil is not a historical scan or measured illumination-free reflectance',normalTileM=.04)

# Coated timber: low-relief longitudinal grain, small pores and sparse weathered
# pigment loss. Board joints and fasteners are actual geometry in the asset.
wear=np.clip((Noise(24)-.85)*.36,0,.72)
grain=GrainNoise(6,90);grainFine=GrainNoise(30,310)
pores=np.clip((grainFine-1.6)*.12,0,.35)
wood=np.array([113,111,82],np.float32)[None,None,:]+(2.4*grain+1.5*grainFine+2.4*medium+2.0*broad)[:,:,None]
wood=wood*(1-wear[:,:,None])+np.array([143,119,81])[None,None,:]*wear[:,:,None]
Save('Wood',wood,.000030*grain+.000010*grainFine-.000120*pores+.000012*fine,.78+.035*pores+.025*medium,0,.98-.05*pores,.60)

# Carbon-filled tyre rubber, with tiny mould grain and fine abrasion cuts.
cuts=np.clip(np.sin(2*np.pi*(x*127+y*13))-.985,0,1)*25
rubber=np.array([30,30,27],np.float32)[None,None,:]+(.7*fine+.8*medium)[:,:,None]
rubber+=np.sqrt(cuts)[:,:,None]*np.array([5,4,2])
rubberDust=np.clip(.42+.20*broad+.08*medium,0,.84)
rubber=rubber*(1-rubberDust[:,:,None])+np.array([93,80,58])[None,None,:]*rubberDust[:,:,None]
Save('Rubber',rubber,.000035*fine-.000090*cuts+.000020*rubberDust*fine,.87+.025*medium+.030*cuts,0,.99-.035*cuts,.35)

# Painted chassis: dust catches microscopic recesses; tiny pores expose steel.
exposed=np.clip((fine-2.5)*.18,0,.18)
chassis=np.array([49,49,40],np.float32)[None,None,:]+(1.2*medium+.8*broad)[:,:,None]
chassisDust=np.clip(.28+.12*broad+.08*medium,0,.65);chassis=chassis*(1-chassisDust[:,:,None])+np.array([91,75,51])[None,None,:]*chassisDust[:,:,None]
Save('Chassis',chassis,.000022*fine+.000018*medium,.83+.025*medium,exposed,.98-.025*np.clip(-fine,0,2),.65)

# Bare machined/pressed metal with restrained parallel handling scratches.
scratch=np.clip(np.sin(2*np.pi*(y*270+.008*medium))-.94,0,1)*9
steel=np.array([156,153,142],np.float32)[None,None,:]+(2.0*medium+1.0*fine)[:,:,None]
tarnish=np.clip(.08+.08*broad,0,.4);steel=steel*(1-tarnish[:,:,None])+np.array([116,113,102])[None,None,:]*tarnish[:,:,None]
Save('Steel',steel,.000003*fine-.000010*scratch,.32+.035*medium+.055*tarnish+.045*scratch,1,.995-.018*scratch,.35)

# Seat covering: oilcloth/leather interpretation; finely pebbled rather than
# cloth weave, with deliberately different roughness from the cargo cover.
pebble=np.sin(fine*1.9+medium*.4)
leather=np.array([57,49,35],np.float32)[None,None,:]+(.8*medium+.6*broad)[:,:,None]
Save('Leather',leather,.00005*pebble,.65+.04*pebble,0,.98-.025*np.clip(-pebble,0,1),.30)

# Nonmetallic oxide appears only on local underframe/fastener geometry.
rust=np.array([102,59,32],np.float32)[None,None,:]+(12*medium+4*broad)[:,:,None]*np.array([1,.65,.35])
Save('Rust',rust,.00008*medium+.000028*fine,.91+.025*medium,0,.96-.05*np.clip(-medium,0,1),.20)
referenceFile=SOURCE/'References/Reference_MaterialHistoricStudyV35.png'
provenance={
    'seed':193694,
    'colourEvidence':'User-confirmed low-saturation khaki-olive palette direction. MIS Information Bulletin16,20May1942,sectionVIII describes ordinary trucks as usually sandy khaki; not a1938Type94paint-chip measurement. Exact historical pigment remains unproven.',
    'materialReference':{'file':str(referenceFile),'sha256':hashlib.sha256(referenceFile.read_bytes()).hexdigest(),'role':'Built-in imagegen material guide for enamel,canvas,rubber and wood; not historical geometry or measured colour'},
    'canvasSource':{'file':str(canvasSource),'sha256':canvasSourceHash,'generator':'built-in imagegen','date':'2026-10-26','promptFile':str(SOURCE/'References/Data_ImagegenCanvasPromptV41.txt'),'tileM':.04,'nominalYarnPitchM':.0006,'heightRmsM':float(fibres.std()),'heightPeakToPeakM':float(np.ptp(fibres)),'sourceScaleAndReliefAreAuthored':True,'baseToneMetrics':baker.ToneMetrics(canvas/255),'baseTileMetrics':baker.TileMetrics(canvas/255)},
    'canvasMacroSource':{'file':str(canvasMacroSource),'sha256':canvasMacroHash,'generator':'built-in imagegen','date':'2026-10-30','promptFile':str(SOURCE/'References/Data_CanvasMacroPromptV79.txt'),'tileM':2.5,'role':'Artistic irregular service ageing;not a film-frame texture or historical scan'},
    'canvasServiceAppearance':{'version':79,'profile':'Dry aged heavy cotton with uneven bleaching,fold stains,runoff and worn lower hems','baseAndOrmTileM':2.5,'normalTileM':.04,'macroSourceBlurPixels':1.25,'macroContrast':1.0,'macroSourceWeaveSuppressed':True,'filmReferences':['https://www.imcdb.org/v059051.html','https://www.imcdb.org/v074865.html','https://www.imcdb.org/v702024.html'],'filmScope':'Cloth behaviour and surface-age reference only;not Japanese dimensions,pigment measurements or tailoring','sameTypeReference':'https://www.ww2technik.de/sites/inf/tansport/typ94.htm','historicalWearMeasured':False},
    'paintMicrorelief':{'version':78,'enamelFineRmsM':.000006,'paintFlowRmsM':.0000015,'sheetWavinessRmsM':0,'scuffCountPerTile':0,'smallChipSeedsPerTile':0,'connectedFlakesPerTile':0,'tileM':.75,'retainedIntactPaintMedianSrgb8':[123,122,92],'roughnessMean':float(paintRoughness.mean()),'roughnessStd':float(paintRoughness.std()),'barePixelPercentAboveHalfMetallic':0,'paintMetallic':0,'contactSteel':'Existing36contact patches and two rolled wing lips retain their separate abraded-steel material','scope':'User-rejected cloud-pattern paint replaced by coherent satin coating; spatial dirt and wear are artistic reconstruction'},
    'localizedMetalServiceWear':{'version':80,'rustBaseSrgb8':[102,59,32],'contactScale':{'DoorContact':2.4,'RunningBoard':2.2,'Bumper':3,'RearHingeOxide':3,'BonnetSeamOxide':2.6},'rollLipRustTrianglesPerRuntimeSide':8,'scope':'Localized artistic service wear;intact V78paint and user-accepted V79canvas retained'},
    'normalConvention':'OpenGL +Y','maps':records,
}
(SOURCE/'Data_PbrSources.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')
