"""Stage each new reference, cache its observations, recover and export GVHMR data."""
from pathlib import Path
import argparse, os, json, time, hashlib
parser=argparse.ArgumentParser(); parser.add_argument('name'); args=parser.parse_args()
shared=Path.home()/'Downloads/GVHMR'; runtime=shared/'InfantryActions_20260905'
os.environ['GVHMR_CHECKPOINTS']=str(shared/'Checkpoints')
os.environ['GVHMR_BODY_MODELS']=str(shared/'Checkpoints/body_models')
os.environ['GVHMR_DEVICE']='cuda'; os.environ['GVHMR_PREDICT_DEVICE']='cuda'
import torch, numpy as np, av, cv2
import gvhmr.cli.demo as demo
from gvhmr import GVHMR
from gvhmr.cli.demo import build_demo_cfg, run_preprocess, load_data_dict, recover_motion
from gvhmr.utils.smplx_utils import make_smplx
from gvhmr.utils.geo.rotations import axis_angle_to_matrix
from gvhmr.utils.body_model.smplx_lite import batch_rigid_transform_v2
torch.set_num_threads(4)
videos=list((runtime/'Sources'/args.name).rglob('*.mp4')); assert len(videos)==1,videos
video=videos[0]
def Fps(path):
    with av.open(str(path)) as c: return float(c.streams.video[0].average_rate)
demo.get_video_fps=Fps
static=args.name!='RifleCrouchAdvance'
cfg=build_demo_cfg(video,output_root=str(runtime/'Capture'),static_cam=static,use_dpvo=False,
    f_mm=None,verbose=True,render_scale=.5,
    config_overrides=['video_name='+args.name,'backbone.batch_size=4','pose2d.batch_size=4'])
capture=Path(cfg.output_dir)
with av.open(str(cfg.video_path)) as c:
    stream=c.streams.video[0]; width,height=stream.width,stream.height; count=sum(1 for _ in c.decode(video=0))
assert abs(Fps(cfg.video_path)-30)<.001
if not static and not Path(cfg.paths.slam).exists(): torch.save(np.repeat(np.eye(4,dtype=np.float32)[None],count,axis=0),cfg.paths.slam)
(capture/'Data_CameraAssumption.json').write_text(json.dumps({'staticCamera':static,'orientation':'fixed controlled studio camera','translation':'fixed' if static else 'unknown following translation','intrinsics':'uncalibrated heuristic','sourceFps':Fps(video),'stagedFps':30}),encoding='utf-8')
started=time.perf_counter(); run_preprocess(cfg)
observations=load_data_dict(cfg)
for key,value in observations.items():
    if torch.is_tensor(value): assert torch.isfinite(value).all(),key
torch.cuda.empty_cache()
model=GVHMR.from_pretrained(ckpt_path=shared/'Checkpoints/gvhmr/gvhmr_siga24_release.ckpt',device='cuda')
resultPath=capture/'hmr4d_results.pt'
if resultPath.exists(): prediction=torch.load(resultPath,map_location='cpu',weights_only=False)
else:
    prediction=recover_motion(model.pl,observations,static_cam=static,world_from_incam=False)
    torch.save(prediction,resultPath)
lite=model.pl.pipeline.endecoder.smplx_model
arrays={'fps':np.array(30.),'parents':lite.parents[:22].cpu().numpy()}
for space,params in [('world',prediction['smpl_params_global']),('incam',prediction['smpl_params_incam'])]:
    assert all(torch.isfinite(v).all() for v in params.values())
    values={k:v.cuda() for k,v in params.items()}
    rest=lite.get_skeleton(values['betas'])[...,:22,:]
    local=axis_angle_to_matrix(torch.cat([values['global_orient'],values['body_pose']],-1).reshape(count,22,3))
    joints,transforms=batch_rigid_transform_v2(local,rest,lite.parents[:22])
    arrays[space+'Joints']=(joints+values['transl'][:,None,:]).cpu().numpy()
    arrays[space+'GlobalRotations']=transforms[...,:3,:3].cpu().numpy()
    arrays[space+'RestJoints']=rest.cpu().numpy()
    for k,v in params.items(): arrays[space+'_'+k]=v.numpy()
arrays['K_fullimg']=prediction['K_fullimg'].numpy()
np.savez_compressed(capture/'Data_GvhmrMotion.npz',**arrays)
(capture/'Data_GvhmrMotion.json').write_text(json.dumps({k:v.tolist() for k,v in arrays.items()}),encoding='utf-8')
coco=make_smplx('supermotion_coco17').cuda(); poses=[]
with torch.inference_mode():
    for i in range(0,count,8): poses.append(coco(**{k:v[i:i+8].cuda() for k,v in prediction['smpl_params_incam'].items()}).cpu())
points3d=torch.cat(poses); homogeneous=torch.einsum('fij,fkj->fki',prediction['K_fullimg'],points3d)
points=(homogeneous[...,:2]/homogeneous[...,2:]).numpy()
confidence=observations['kp2d'][...,2].numpy(); errors=np.linalg.norm(points-observations['kp2d'][...,:2].numpy(),axis=-1)
edges=[(5,6),(5,7),(7,9),(6,8),(8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]
writer=cv2.VideoWriter(str(capture/'Preview_GvhmrOverlay.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),30,(width,height))
with av.open(str(cfg.video_path)) as c:
    for i,frame in enumerate(c.decode(video=0)):
        image=frame.to_ndarray(format='bgr24')
        for a,b in edges:
            if np.isfinite(points[i,[a,b]]).all(): cv2.line(image,tuple(np.rint(points[i,a]).astype(int)),tuple(np.rint(points[i,b]).astype(int)),(0,240,255),3,cv2.LINE_AA)
        cv2.putText(image,f'{args.name} GVHMR {i}',(20,35),cv2.FONT_HERSHEY_SIMPLEX,.75,(0,240,255),2)
        writer.write(image)
writer.release()
report={'status':'recovered_requires_retarget_review','frames':count,'fps':30,'staticCamera':static,'seconds':time.perf_counter()-started,
        'projectionMedianPixelsConfidence05':float(np.median(errors[confidence>=.5])),'sourceSha256':hashlib.sha256(video.read_bytes()).hexdigest(),
        'resultSha256':hashlib.sha256(resultPath.read_bytes()).hexdigest(),'gpu':torch.cuda.get_device_name(0)}
(capture/'Data_Recovery.json').write_text(json.dumps(report,indent=2),encoding='utf-8'); print(json.dumps(report),flush=True)
