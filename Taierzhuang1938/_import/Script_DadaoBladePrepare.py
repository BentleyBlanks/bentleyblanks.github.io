"""Turn reviewed 2D blade observations into an explicitly inferred prop track.

Does not change videos, inference, raw recovery, or body animation. A monocular
line determines a plane; apparent length and reviewed depth priors resolve the
remaining ambiguity approximately. Never label this a measured 3D sword track.
"""
from pathlib import Path
import argparse, hashlib, json
import cv2, numpy as np
from scipy.spatial.transform import Rotation, Slerp

def Unit(v):
    return v / np.linalg.norm(v)

def Main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root
    out=root/'Models/ReviewV8';out.mkdir(parents=True,exist_ok=True)
    config=json.loads(Path(__file__).with_name('Data_DadaoBladeObservations.json').read_text())
    (out/'Data_BladeObservations.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    for source,rows in config['sources'].items():
        cache=root/'Models/_Cache/MeleeVideoV1'/source;data=np.load(cache/'Data_GvhmrMotion.npz')
        video=cache/'0_input_video.mp4';cap=cv2.VideoCapture(str(video));directions=[];observations=[];sheet=[];planes=[]
        for f,ax,ay,bx,by,visible,prior in rows:
            k=data['K_fullimg'][f];aa=np.array([ax,ay])/0.375;bb=np.array([bx,by])/0.375
            normal=Unit(k.T@np.cross([*aa,1],[*bb,1]));e=Unit(np.array([(bb[0]-aa[0])/k[0,0],(bb[1]-aa[1])/k[1,1],0.]))
            depth=Unit(np.cross(normal,e))
            if depth[2]<0:depth=-depth
            # Actual source props vary in apparent scale, so this is a depth
            # regularizer, not a claim of physical length measurement.
            apparent=np.linalg.norm((bb-aa)/np.diag(k)[:2])*data['incamJoints'][f,21,2]
            fraction=np.clip(apparent/1.05,.18,1.)
            amount=np.sign(prior)*np.sqrt(1-fraction*fraction) if visible else prior
            # Near-planar samples should not abruptly switch depth branches.
            if abs(prior)<=.3:amount=np.clip(amount,-.45,.45)
            direction=Unit(e*np.sqrt(1-amount*amount)+depth*amount)
            cw=data['incamGlobalRotations'][f,0]@data['worldGlobalRotations'][f,0].T
            directions.append(cw.T@direction)
            planes.append(cw.T@np.stack([e,depth,np.cross(e,depth)],axis=1))
            inferred=f in config.get('inferredDirectionFrames',{}).get(source,[])
            observations.append({'frame':f,'guard':aa.tolist(),'blade':bb.tolist(),'tipVisible':visible,'directionStatus':'inferred_while_out_of_frame' if inferred else 'visible_line','inferredDepthComponent':float(amount),'cameraDirection':direction.tolist()})
            cap.set(1,f);ok,img=cap.read();assert ok
            cv2.arrowedLine(img,tuple(aa.astype(int)),tuple(bb.astype(int)),(30,255,30),3,tipLength=.07)
            img=cv2.resize(img,(320,180));cv2.putText(img,str(f),(10,20),0,.6,(0,0,255),2);sheet.append(img)
        # Parallel transport avoids the old torso-up cross-product roll flips
        # when a sword becomes vertical. Seed blade normal toward source camera.
        rotations=[];oldX=None;oldZ=None
        for row,direction in zip(rows,directions):
            f=row[0];z=-Unit(direction)
            if oldX is None:
                cw=data['incamGlobalRotations'][f,0]@data['worldGlobalRotations'][f,0].T
                hint=cw.T@np.array([0.,0.,-1.]);x=Unit(hint-z*np.dot(hint,z))
            else:
                axis=np.cross(oldZ,z);angle=np.arctan2(np.linalg.norm(axis),np.dot(oldZ,z))
                x=Rotation.from_rotvec(Unit(axis)*angle).apply(oldX) if np.linalg.norm(axis)>1e-8 else oldX
                x=Unit(x-z*np.dot(x,z))
            y=Unit(np.cross(z,x));rotations.append(np.stack([x,y,z],axis=1));oldX=x;oldZ=z
        times=np.array([r[0] for r in rows]);query=np.arange(times[0]*2,times[-1]*2+1)/2
        rot=Slerp(times,Rotation.from_matrix(rotations))(query).as_matrix()
        planeRot=Slerp(times,Rotation.from_matrix(planes))(query).as_matrix()
        report={'source':source,'fps':30,'sourceFrameIndices':query.tolist(),'worldPropRotations':rot.tolist(),
                'worldObservationPlanes':planeRot.tolist(),
                'video':video.relative_to(root).as_posix(),'videoSha256':hashlib.sha256(video.read_bytes()).hexdigest(),
                'method':config['method'],'depthStatus':'inferred; clipped and foreshortened phases remain ambiguous','observations':observations}
        (out/f'Data_{source}BladeTrack.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        canvas=np.zeros((((len(sheet)+4)//5)*180,1600,3),np.uint8)
        for i,img in enumerate(sheet):canvas[(i//5)*180:(i//5+1)*180,(i%5)*320:(i%5+1)*320]=img
        target=root/'Preview/ReviewV8';target.mkdir(parents=True,exist_ok=True)
        (target/f'Texture_{source}ReviewedBladeLines.jpg').write_bytes(cv2.imencode('.jpg',canvas)[1].tobytes())
        print(source,len(rows)-len(config.get('inferredDirectionFrames',{}).get(source,[])),'visible line samples;',len(config.get('inferredDirectionFrames',{}).get(source,[])),'out-of-frame direction priors')

if __name__=='__main__':Main()
