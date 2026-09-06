"""Independently project baked blade directions into the observed source camera."""
from pathlib import Path
import argparse,json,numpy as np
from scipy.spatial.transform import Rotation

def Main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root;out=root/'Models/ReviewV8'
    annotations=json.loads(Path(__file__).with_name('Data_DadaoBladeObservations.json').read_text(encoding='utf-8'));results=[]
    for file in sorted(out.glob('Data_*_Validation.json')):
        report=json.loads(file.read_text(encoding='utf-8'));name=report['clip'].split('_',2)[2].removesuffix('_V8')
        motion=json.loads((root/f'Models/_Cache/ReviewV7/Data_{name}Motion.json').read_text(encoding='utf-8'))
        raw=json.loads((root/motion['review']['recoveryTracks'][0]['path']).read_text(encoding='utf-8'));data=np.load(root/raw['sourceCache'])
        transform=np.array([[1,0,0],[0,0,-1],[0,1,0]])@Rotation.from_euler('y',raw['viewerYawRadians']).as_matrix()
        source='DadaoParriesV1' if 'Parry' in name else 'DadaoCutsV1';samples={s['sourceFrame']:s for s in report['samples']};angles=[]
        for f,ax,ay,bx,by,visible,depth in annotations['sources'][source]:
            if f not in samples or f in annotations.get('inferredDirectionFrames',{}).get(source,[]):continue
            sample=samples[f];k=data['K_fullimg'][f];cw=data['incamGlobalRotations'][f,0]@data['worldGlobalRotations'][f,0].T
            direction=cw@transform.T@np.array(sample['bladeDirection']);aa=np.array([ax,ay])/.375;bb=np.array([bx,by])/.375
            origin=np.linalg.inv(k)@np.array([*aa,1])*data['incamJoints'][f,21,2];tip=origin+direction*.626
            projected=k@tip;delta=projected[:2]/projected[2]-aa;expected=bb-aa
            angle=float(np.degrees(np.arccos(np.clip(np.dot(delta,expected)/(np.linalg.norm(delta)*np.linalg.norm(expected)),-1,1))))
            angles.append({'sourceFrame':f,'signedProjectionErrorDegrees':angle,'tipVisible':visible})
        assert angles,file
        maximum=max(r['signedProjectionErrorDegrees'] for r in angles);assert maximum<.05,(file,maximum)
        assert report['maxBodyMatrixDelta']<.00002
        assert report['maxForearmLengthError']<.00002
        assert report['maxContactResidual']<.001
        results.append({'clip':report['clip'],'observations':angles,'maxProjectionErrorDegrees':maximum,'maxWristCorrectionMeters':report['maxWristPositionDelta'],'maxForearmCorrectionDegrees':report['maxForearmCorrectionDegrees'],'maxContactResidual':report['maxContactResidual']})
    result={'status':'passed','scope':'Baked blade axis projected from observed source hilt; does not establish true depth or blade roll','results':results}
    (out/'Data_SourceDirectionValidation.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print('Source-direction checks passed',len(results),'models',sum(len(r['observations']) for r in results),'observations')

if __name__=='__main__':Main()
