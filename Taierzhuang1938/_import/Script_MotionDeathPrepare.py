"""Prepare a non-looping collapse, preserving untouched inference separately."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import CubicSpline
from scipy.spatial.transform import Rotation, Slerp

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--settle-frame', type=int, required=True)
args = parser.parse_args()
root = args.root
capture = root/'Models/_Cache/DeathCollapseV1/DeathCollapse'
source = capture/'Data_GvhmrMotion.npz'
data = np.load(source)
fps = float(data['fps'])
length = len(data['worldJoints'])
assert 0 < args.settle_frame < length
ids = np.arange(length)
query = np.linspace(0, length-1, (length-1)*2+1)
conversion = np.array([[1.,0,0],[0,0,-1],[0,1,0]])
direction = conversion@data['worldGlobalRotations'][:20,0,:,2].mean(0)
heading = Rotation.from_euler('z', -np.pi/2-np.arctan2(direction[1],direction[0])).as_matrix()
transform = heading@conversion
rawJoints = data['worldJoints']@transform.T
joints = gaussian_filter1d(rawJoints, .6, axis=0)
floor = float(np.median(np.min(rawJoints[:25,[10,11],2], axis=1)))
roots = joints[:,0].copy()
roots[:,:2] -= roots[0,:2]
roots[:,2] -= floor
rotations = []
for j in range(22):
    sourceRotation = Rotation.from_matrix(data['worldGlobalRotations'][:,j])
    relative = (sourceRotation[0].inv()*sourceRotation).as_rotvec()
    filtered = sourceRotation[0]*Rotation.from_rotvec(gaussian_filter1d(relative,.55,axis=0))
    rotations.append(transform@Slerp(ids,filtered)(query).as_matrix()@conversion.T)
rotations = np.stack(rotations,axis=1)
roots = CubicSpline(ids,roots)(query)
# The standing gravity estimate leaves the collapsed body on an inclined plane.
# Fit the final support plane and blend one rigid orientation correction during
# the impact. This preserves local joint angles and is recorded as an edit.
supportIds = [0,1,2,7,8,12,15,16,17,18,19,20,21]
support = rawJoints[args.settle_frame,supportIds]
_,_,axes = np.linalg.svd(support-support.mean(0))
normal = axes[-1]*np.sign(axes[-1,2])
planeCorrection = Rotation.align_vectors([[0,0,1]],[normal])[0]
correctionCurve = Slerp([0,1],Rotation.from_quat(np.stack([Rotation.identity().as_quat(),planeCorrection.as_quat()])))
for i,sourceFrame in enumerate(query):
    t = np.clip((sourceFrame-68)/42,0,1)
    weight = t*t*(3-2*t)
    correction = correctionCurve([weight]).as_matrix()[0]
    rotations[i] = correction@rotations[i]
# The final still is explicitly a retarget-stage correction, never a raw edit.
settle = args.settle_frame*2
blendFrames = 20
for i in range(max(0,settle-blendFrames),settle):
    t = (i-(settle-blendFrames))/blendFrames
    weight = t*t*(3-2*t)
    roots[i] = roots[i]*(1-weight)+roots[settle]*weight
    for j in range(22):
        rotations[i,j] = Slerp([0,1],Rotation.from_matrix(np.stack([rotations[i,j],rotations[settle,j]])))([weight]).as_matrix()[0]
roots[settle:] = roots[settle]
rotations[settle:] = rotations[settle]
relativeJoints=CubicSpline(ids,joints-joints[:,0,None])(query)
relativeJoints[settle:]=relativeJoints[settle]
rest = data['worldRestJoints'].mean(0)@conversion.T
prepared = {'name':'DeathCollapse','kind':'death','loop':False,'range':[0,length-1],
    'fps':fps*2,'durationSeconds':(length-1)/fps,'cycleFrames':len(query)-1,
    'sourceFrameIndices':query.tolist(),'sourceFrameRate':fps,'settleFrame':settle,
    'sourceRestJoints':rest.tolist(),'sourceLegLength':float(np.linalg.norm(rest[4]-rest[1])+np.linalg.norm(rest[7]-rest[4])),
    'rotations':rotations.tolist(),'rootOffsets':roots.tolist(),
    'sourceRelativeJoints':relativeJoints.tolist(),
    'rawCache':source.relative_to(root).as_posix(),'rawSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'supportPlaneNormal':normal.tolist(),'supportPlaneCorrectionDegrees':float(np.degrees(planeCorrection.magnitude())),
    'corrections':['Subframe interpolation; mild temporal filtering','Constant standing floor, no per-frame foot snapping',
        'Rigid support-plane correction blended over source frames 68-110; local joint angles preserved','Blend into held final pose only in retarget data']}
(capture.parent/'Data_DeathCollapseMotion.json').write_text(json.dumps(prepared),encoding='utf-8')
names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
positions = data['worldJoints']
forward = data['worldGlobalRotations'][:20,0,:,2].mean(0)
raw = {'schemaVersion':1,'stage':'GVHMR worldJoints before retarget, filtering, IK or floor correction',
    'sourceCache':source.relative_to(root).as_posix(),'sourceCacheSha256':prepared['rawSha256'],
    'fps':fps,'parents':data['parents'].tolist(),'jointNames':names,'positions':positions.tolist(),
    'viewerYawRadians':float(-np.arctan2(forward[0],forward[2])),
    'viewerOrigin':[float(positions[0,0,0]),0,float(positions[0,0,2])]}
(root/'Models/RecoveryPreview/Data_V1_DeathCollapseRawJoints.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
print(json.dumps({'frames':len(query),'seconds':prepared['durationSeconds'],'floor':floor,'settleFrame':settle}))
