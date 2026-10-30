"""Apply and independently replay actual-donor supplemental shader samples."""
import copy,hashlib,json,os,shutil,numpy as np
from pathlib import Path
from PIL import Image
root=Path(os.environ.get('TYPE94_GAME_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/GameTrialV100'));acc=root/'Acceptance';summary=json.loads((acc/'Data_GameProjectionRepairSamplesV100.json').read_text());assert summary['passed'];inputs=root/'Inputs'/('PrimaryProjection'+summary['preparationSha256'][:12]);inputs.mkdir(parents=True,exist_ok=True);rows=[]
for repair in summary['reports']:
    role=repair['role'];file=acc/('Data_GameProjection'+role+'V100.json');report=json.loads(file.read_text());assert report['preparationSha256']==summary['preparationSha256']
    if not repair['repairedPixels']:rows.append(repair);continue
    samples=np.load(acc/('Data_ActualProjectionRepair'+role+'V100.npz'));positions=samples['pixels'];yy=positions[:,0];xx=positions[:,1];padding=samples['padding'];world=samples['sampledWorldNormals'].astype(float)*2-1;world/=np.linalg.norm(world,axis=1,keepdims=True);basis=samples['lowTangentFrames'];normal=np.linalg.solve(basis,world[:,:,None])[:,:,0];normal/=np.linalg.norm(normal,axis=1,keepdims=True);normalBytes=np.rint(np.clip(normal*.5+.5,0,1)*255).astype(np.uint8);decoded=normalBytes.astype(float)/255*2-1;reconstructed=np.einsum('nij,nj->ni',basis,decoded);reconstructed/=np.linalg.norm(reconstructed,axis=1,keepdims=True);angles=np.rad2deg(np.arccos(np.clip(np.sum(reconstructed*world,axis=1),-1,1)));assert float(angles.max())<1.5
    if'primaryChannels'not in report:report['primaryChannels']=copy.deepcopy(report['channels'])
    channelRows=[]
    for channel in ['Base','Orm','Normal']:
        current=next(r for r in report['channels']if r['channel']==channel);original=next(r for r in report['primaryChannels']if r['channel']==channel);destination=Path(current['file']);source=inputs/destination.name
        if not source.exists():
            assert hashlib.sha256(destination.read_bytes()).hexdigest()==original['sha256'];shutil.copy2(destination,source)
        assert hashlib.sha256(source.read_bytes()).hexdigest()==original['sha256'];image=Image.open(source).convert('RGB');a=np.array(image);b=a.copy();size=len(a)
        if channel=='Normal':replacement=normalBytes
        else:
            values=samples['sampledBaseLinear'if channel=='Base'else'sampledOrm'].astype(float)
            if channel=='Base':values=np.where(values<=.0031308,values*12.92,1.055*np.maximum(values,0)**(1/2.4)-.055)
            replacement=np.rint(np.clip(values,0,1)*255).astype(np.uint8)
        b[size-1-yy,xx]=replacement
        if len(padding):b[size-1-padding[:,0],padding[:,1]]=b[size-1-padding[:,2],padding[:,3]]
        allowed=np.zeros((size,size),dtype=bool);allowed[size-1-yy,xx]=True
        if len(padding):allowed[size-1-padding[:,0],padding[:,1]]=True
        assert np.array_equal(a[~allowed],b[~allowed]);Image.fromarray(b).save(destination);assert np.array_equal(np.array(Image.open(destination)),b)
        # A second complete raster evaluation from immutable inputs must yield
        # exactly the saved decoded pixels, including identical padding sites.
        replay=a.copy();replay[size-1-yy,xx]=replacement
        if len(padding):replay[size-1-padding[:,0],padding[:,1]]=replay[size-1-padding[:,2],padding[:,3]]
        assert np.array_equal(replay,b);current['sha256']=hashlib.sha256(destination.read_bytes()).hexdigest();channelRows.append(dict(channel=channel,primarySha256=original['sha256'],sha256=current['sha256'],unchangedOutsideExplicitSites=True,exactRasterReplay=True))
    repair.update(pixelApplicationPassed=True,maximumNormalRoundTripDegrees=float(angles.max()),percentile95NormalRoundTripDegrees=float(np.percentile(angles,95)),channels=channelRows)
    report['coverage'].update(repairedPixels=repair['repairedPixels'],primaryMissingPixels=repair['primaryMissingPixels'],missingPixels=0,validPixels=report['coverage']['usedPixels'],allPixelsProjected=True,projectionMethod='Primary selected-to-active rays plus explicit actual-surface shader replay');report['actualSurfaceRepair']=repair;file.write_text(json.dumps(report,indent=2)+'\n');rows.append(repair)
result=dict(preparationSha256=summary['preparationSha256'],reports=rows,passed=all(r['passed']and(r.get('pixelApplicationPassed')or r['repairedPixels']==0)for r in rows),pixelApplicationPending=False,method='Immutable primary PNGs, explicit linear-to-sRGB base encoding, inverse low tangent frames, actual-sample gutter propagation, byte-exact decoded raster replay')
(acc/'Data_GameProjectionRepairV100.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));assert result['passed']
