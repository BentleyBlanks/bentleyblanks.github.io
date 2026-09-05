"""Explicit local GVHMR recovery. Reuses observations; always reruns prediction."""
from pathlib import Path
import argparse, os, json, time, hashlib, shutil
parser=argparse.ArgumentParser()
parser.add_argument('--name',required=True);parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True);parser.add_argument('--cache',type=Path)
parser.add_argument('--runtime',type=Path,default=Path.home()/'Downloads/GVHMR')
parser.add_argument('--crop',type=float,nargs=2);args=parser.parse_args()
os.environ['GVHMR_CHECKPOINTS']=str(args.runtime/'Checkpoints')
os.environ['GVHMR_BODY_MODELS']=str(args.runtime/'Checkpoints/body_models')
os.environ['GVHMR_DEVICE']='cuda';os.environ['GVHMR_PREDICT_DEVICE']='cuda'
import torch, numpy as np, av, cv2
import gvhmr.cli.demo as demo
from gvhmr import GVHMR
from gvhmr.cli.demo import build_demo_cfg,run_preprocess,load_data_dict,recover_motion
from gvhmr.utils.geo.rotations import axis_angle_to_matrix
from gvhmr.utils.body_model.smplx_lite import batch_rigid_transform_v2
torch.set_num_threads(4);torch.manual_seed(20260905)
args.output.mkdir(parents=True,exist_ok=True)
def Fps(path):
    with av.open(str(path)) as c:return float(c.streams.video[0].average_rate)
demo.get_video_fps=Fps
source=args.source
if args.crop:
    source=args.output/(args.name+'_Crop.mp4')
    with av.open(str(args.source)) as c:
        frames=[f.to_ndarray(format='bgr24') for f in c.decode(video=0)]
    h,w=frames[0].shape[:2];left,right=[round(x*w)//2*2 for x in args.crop]
    writer=cv2.VideoWriter(str(source),cv2.VideoWriter_fourcc(*'mp4v'),30,(right-left,h))
    sourceFps=Fps(args.source)
    for i in range(round(len(frames)/sourceFps*30)):
        writer.write(frames[min(round(i*sourceFps/30),len(frames)-1)][:,left:right])
    writer.release();del frames
cfg=build_demo_cfg(source,output_root=json.dumps(args.output.as_posix(),ensure_ascii=False),static_cam=True,use_dpvo=False,f_mm=None,verbose=False,render_scale=.5,
    config_overrides=['video_name='+args.name,'backbone.batch_size=4','pose2d.batch_size=4'])
capture=Path(cfg.output_dir)
if args.cache:
    for name in ['bbx.pt','vitpose.pt','vit_features.pt']:
        origin=args.cache/'preprocess'/name
        if origin.exists():shutil.copy2(origin,Path(cfg.preprocess_dir)/name)
started=time.perf_counter();run_preprocess(cfg);observations=load_data_dict(cfg)
for key,value in observations.items():
    if torch.is_tensor(value):assert torch.isfinite(value).all(),key
torch.cuda.empty_cache()
model=GVHMR.from_pretrained(ckpt_path=args.runtime/'Checkpoints/gvhmr/gvhmr_siga24_release.ckpt',device='cuda')
# Never reuse an earlier prediction: this command is an explicit recovery revision.
prediction=recover_motion(model.pl,observations,static_cam=True,world_from_incam=False)
resultPath=capture/'hmr4d_results.pt';torch.save(prediction,resultPath)
lite=model.pl.pipeline.endecoder.smplx_model
count=prediction['smpl_params_global']['body_pose'].shape[0]
arrays={'fps':np.array(30.),'parents':lite.parents[:22].cpu().numpy()}
for space,params in [('world',prediction['smpl_params_global']),('incam',prediction['smpl_params_incam'])]:
    assert all(torch.isfinite(v).all() for v in params.values())
    values={k:v.cuda() for k,v in params.items()};rest=lite.get_skeleton(values['betas'])[...,:22,:]
    local=axis_angle_to_matrix(torch.cat([values['global_orient'],values['body_pose']],-1).reshape(count,22,3))
    joints,transforms=batch_rigid_transform_v2(local,rest,lite.parents[:22])
    arrays[space+'Joints']=(joints+values['transl'][:,None,:]).cpu().numpy()
    arrays[space+'GlobalRotations']=transforms[...,:3,:3].cpu().numpy();arrays[space+'RestJoints']=rest.cpu().numpy()
    for k,v in params.items():arrays[space+'_'+k]=v.numpy()
arrays['K_fullimg']=prediction['K_fullimg'].numpy()
np.savez_compressed(capture/'Data_GvhmrMotion.npz',**arrays)
report={'status':'fresh_local_recovery','frames':count,'fps':30,'staticCameraAssumption':True,'cropFraction':args.crop,
    'seconds':time.perf_counter()-started,'source':str(args.source),'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
    'observationCache':str(args.cache) if args.cache else None,'predictionReused':False,'gpu':torch.cuda.get_device_name(0),
    'resultSha256':hashlib.sha256(resultPath.read_bytes()).hexdigest()}
(capture/'Data_Recovery.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
