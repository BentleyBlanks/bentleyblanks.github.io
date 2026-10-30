"""Verify real recessed suspension channels and rounded-cover game profiles."""
import importlib.util,json,os,sys,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';geometryOnly='--geometry'in sys.argv;spec=importlib.util.spec_from_file_location('ActualGameSurfaces',Path(__file__).with_name('Script_VerifyType94GameV100.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV99.json').read_text());lowManifest=json.loads((acc/('Data_GameGeometryV100.json'if geometryOnly else'Data_GamePbrV100.json')).read_text());high=module.Read(highManifest['sourceGlb'],False);low=module.Read(lowManifest['sourceGlb'],False);hull=low['worldMatrices']['Hull'];assert np.array_equal(hull,high['worldMatrices']['Hull']);triangles={}
for label,model in [('High',high),('Low',low)]:
    p,t=module.Mesh(model,'Geometry_Hull_Paint');world=(np.c_[p,np.ones(len(p))]@model['worldMatrices']['Geometry_Hull_Paint'].T)[:,:3];triangles[label]=world[t]
def Point(p):return(hull@np.r_[np.array(p)[[0,2,1]]*[1,1,-1],1])[:3]
def Hits(point,side,label):
    tri=triangles[label];normal=hull[:3,:3]@np.array([side,0.,0.]);normal/=np.linalg.norm(normal);origin=Point(point)+normal*.2;direction=-normal;a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid];s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv;return np.unique(np.round(t[valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>0)&(t<.27)],8))
layout=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_RunningAssemblyV61.json').read_text());section=layout['armChannelSection'];checks=[]
for side in [-1,1]:
    for bi,bogie in enumerate(layout['bogies']):
        a=np.array(bogie['pivotYZM'])
        for ri in bogie['roadIndices']:
            b=np.array(layout['roadCentersYZM'][ri]);direction=(b-a)/np.linalg.norm(b-a);cross=np.array([-direction[1],direction[0]]);mid=(a+b)/2;front=layout['trackCenterXM']+section['axialCenterOffsetM']+section['thicknessM']/2
            for name,x,yz,thickness in [('UpperRim',front,mid+cross*(section['halfWidthM']-section['rimWidthM']/2),section['thicknessM']),('LowerRim',front,mid-cross*(section['halfWidthM']-section['rimWidthM']/2),section['thicknessM']),('Web',front-section['recessDepthM'],mid,section['thicknessM']-section['recessDepthM'])]:
                hits=Hits([side*x,*yz],side,'Low');checks.append(dict(check=f'{side}:{ri}:{name}',passed=bool(len(hits)>=2 and abs(hits[0]-.2)<2e-6 and abs(hits[1]-hits[0]-thickness)<2e-6),expectedThicknessM=thickness,hits=hits.tolist(),toleranceM=.000002))
            for name,x,yz in [('JournalCover',layout['trackCenterXM']+.098,b),('BogieCover',layout['trackCenterXM']+.1065,a)]:
                point=[side*x,*yz];h=Hits(point,side,'High');l=Hits(point,side,'Low');checks.append(dict(check=f'{side}:{ri}:{name}',passed=bool(len(h)and len(l)and abs(h[0]-l[0])<=.003),highHits=h.tolist(),lowHits=l.tolist(),gameSurfaceBoundM=.003))
        cover=section['bogieCoverProfile']
        for fraction in [0,.25,.5,.75]:
            depth=cover['rimOffsetM']+(cover['crownOffsetM']-cover['rimOffsetM'])*(1-fraction*fraction);point=[side*(layout['trackCenterXM']+depth),a[0]+cover['radiusM']*fraction,a[1]];h=Hits(point,side,'High');l=Hits(point,side,'Low');checks.append(dict(check=f'{side}:{bi}:RoundedBogie:{fraction}',passed=bool(len(h)and len(l)and abs(h[0]-l[0])<=.003),highHits=h.tolist(),lowHits=l.tolist(),gameSurfaceBoundM=.003))
report=dict(sha256=low['sha256'],referenceSha256=high['sha256'],checks=checks,passed=len(checks)==56 and all(r['passed']for r in checks),recessDepthM=section['recessDepthM'],sectionDimensionsInferred=True,scope='Actual low channel floor/rim/back dimensions retain the two-micrometre flat-section gate; real low cover profiles are compared with actual current high rays within the declared3mmgame surface bound. No historical dimension claim.')
(acc/('Data_GameSectionsGeometryV100.json'if geometryOnly else'Data_GameSectionsV100.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']]),indent=2));assert report['passed']
