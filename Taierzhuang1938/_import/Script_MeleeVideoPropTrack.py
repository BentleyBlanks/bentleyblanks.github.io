"""Constrain recovered prop orientation with visible source-video weapon lines.

The image line supplies pitch/yaw projection; GVHMR supplies the remaining depth
estimate. Neither a monocular line nor the wrist span is a full prop solve.
"""
from pathlib import Path
import argparse,json,hashlib
import av,cv2,numpy as np
from scipy.ndimage import gaussian_filter1d

parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args();root=args.root
for source in ['StaffThrustsV1','BayonetParriesV1']:
 cache=root/'Models/_Cache/MeleeVideoV1'/source
 data=np.load(cache/'Data_GvhmrMotion.npz');joints=data['incamJoints'];intrinsics=data['K_fullimg']
 video=root/'Video/Sources'/source/f'Video_{source}Inference30.mp4'
 with av.open(str(video)) as stream:frames=[f.to_ndarray(format='rgb24') for f in stream.decode(video=0)]
 projected=joints@intrinsics.transpose(0,2,1);uv=projected[:,:,:2]/projected[:,:,2:]
 directions=[];observations=[];sheet=[]
 for i,rgb in enumerate(frames):
  h,w=rgb.shape[:2];gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
  edges=cv2.Canny(gray,45,110);candidates=cv2.HoughLinesP(edges,1,np.pi/720,30,minLineLength=w*.1,maxLineGap=w*.025)
  wrist=(uv[i,20]+uv[i,21])*.5;best=None
  for line in [] if candidates is None else candidates[:,0]:
   a=np.array(line[:2],float);b=np.array(line[2:],float);delta=b-a;length=np.linalg.norm(delta)
   if abs(delta[1])>abs(delta[0])*.8:continue
   if max(a[1],b[1])>uv[i,0,1]+h*.06 or min(a[1],b[1])<uv[i,15,1]-h*.08:continue
   distance=np.linalg.norm(wrist-(a+delta*np.clip(np.dot(wrist-a,delta)/(length*length),0,1)))
   if distance>w*.13:continue
   score=length-2*distance
   if best is None or score>best[0]:best=(score,a,b)
  span=joints[i,20]-joints[i,21];span/=np.linalg.norm(span)
  if best:
   _,a,b=best;line=np.cross([*a,1],[*b,1]);normal=intrinsics[i].T@line;normal/=np.linalg.norm(normal)
   span-=normal*np.dot(normal,span);span/=np.linalg.norm(span)
   observations.append({'frame':i,'line':[a.tolist(),b.tolist()]})
  else:observations.append({'frame':i,'line':None})
  cw=data['incamGlobalRotations'][i,0]@data['worldGlobalRotations'][i,0].T
  directions.append(cw.T@span)
  if i%12==0:
   image=rgb.copy()
   if best:cv2.line(image,tuple(a.astype(int)),tuple(b.astype(int)),(30,255,30),4)
   cv2.putText(image,str(i),(20,35),cv2.FONT_HERSHEY_SIMPLEX,1,(255,90,20),2)
   sheet.append(cv2.resize(image,(320,180)))
 measured=np.array([o['line'] is not None for o in observations]);directions=np.array(directions)
 # Interpolate only short prop occlusions; retain full source motion observations.
 assert measured.mean()>.6,(source,'insufficient visible prop observations',measured.mean())
 for axis in range(3):directions[:,axis]=np.interp(np.arange(len(directions)),np.flatnonzero(measured),directions[measured,axis])
 directions=gaussian_filter1d(directions,.8,axis=0);directions/=np.linalg.norm(directions,axis=1)[:,None]
 up=data['worldJoints'][:,12]-data['worldJoints'][:,0];up/=np.linalg.norm(up,axis=1)[:,None]
 z=-directions;x=np.cross(up,z);x/=np.linalg.norm(x,axis=1)[:,None];y=np.cross(z,x)
 np.savez_compressed(cache/'Data_PropTrack.npz',worldPropRotations=np.stack([x,y,z],axis=2))
 report={'source':source,'video':video.relative_to(root).as_posix(),'videoSha256':hashlib.sha256(video.read_bytes()).hexdigest(),
  'method':'Visible image line plane + recovered wrist depth; torso roll. Occluded line frames interpolated, no authored gesture.',
  'measuredFrames':int(measured.sum()),'frameCount':len(frames),'observations':observations}
 (cache/'Data_PropTrack.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 rows=(len(sheet)+4)//5;canvas=np.zeros((rows*180,1600,3),dtype=np.uint8)
 for n,image in enumerate(sheet):canvas[n//5*180:(n//5+1)*180,n%5*320:(n%5+1)*320]=image
 encoded=cv2.imencode('.jpg',cv2.cvtColor(canvas,cv2.COLOR_RGB2BGR))[1]
 (root/'Preview/MeleeVideoV1'/f'Scene_{source}PropTrack.jpg').write_bytes(encoded.tobytes())
 print(source,int(measured.sum()),'/',len(frames),flush=True)
