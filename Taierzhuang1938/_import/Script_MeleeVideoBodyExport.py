"""Export the evaluated original-skeleton video take into the live melee library."""
from mathutils import Quaternion
import base64,struct
project=Path(__file__).resolve().parents[1]
path=project/f'Data_Melee{faction}Animations.mjs'
library=json.loads(path.read_text(encoding='utf-8').split(' = ',1)[1].strip().rstrip(';'))
parts=library['parts'];convert=Matrix.Rotation(-math.pi/2,4,'X');rotConvert=convert.to_quaternion()
sourceFrames=np.interp(np.linspace(0,1,31),motion['runtimeTimeKnots'],motion['sourceFrameKnots'])
rows=[];propFrames=[]
for i,sourceFrame in enumerate(sourceFrames):
 frame=(sourceFrame-motion['range'][0])*2+1;scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
 values=[]
 for part in parts:
  bone=arm.pose.bones[N(part)];matrix=arm.matrix_world@bone.matrix
  delta=matrix.to_quaternion()@rest[N(part)].to_quaternion().inverted();q=rotConvert@delta@rotConvert.inverted()
  offset=convert.to_3x3()@(matrix.translation-heads[N(part)])
  values.extend(round(x,6) for x in [*offset,q.x,q.y,q.z,q.w])
 rows.append(values+library['clips'][clip]['frames'][i][-9:])
 prop=convert@rifle.matrix_world;p=prop.translation;q=prop.to_quaternion()
 propFrames.append([round(x,6) for x in [*p,q.x,q.y,q.z,q.w]])
metadata={'loop':False,'frames':rows,'source':'GVHMR video / '+motion['source'],'sourceFrames':sourceFrames.tolist()}
if motion.get('preserveRecoveredPose'):
 sourceParts=parts+['L Toe0','R Toe0'];full=[]
 parentIndices=[]
 for part in sourceParts:
  parent=arm.pose.bones[N(part)].parent
  parentPart=parent.name[len(prefix):] if parent and parent.name.startswith(prefix) else None
  parentIndices.append(sourceParts.index(parentPart) if parentPart in sourceParts else -1)
 for frame in range(1,motion['cycleFrames']+2):
  scene.frame_set(frame);bpy.context.view_layer.update()
  matrices=[convert@arm.matrix_world@arm.pose.bones[N(part)].matrix for part in sourceParts]
  for index,matrix in enumerate(matrices):
   p=matrix.translation;q=matrix.to_quaternion();parentIndex=parentIndices[index]
   if parentIndex>=0:
    parent=matrices[parentIndex];inverseRotation=parent.to_quaternion().inverted()
    p=inverseRotation@(p-parent.translation);q=inverseRotation@q
   full.extend([*p,q.x,q.y,q.z,q.w])
  matrix=convert@rifle.matrix_world;p=matrix.translation;q=matrix.to_quaternion();full.extend([*p,q.x,q.y,q.z,q.w])
 metadata.update({'preserveRecoveredPose':True,'propFrames':propFrames,'recoveredPose':{
  'parts':sourceParts,'parents':parentIndices,'space':'parent-relative','stride':(len(sourceParts)+1)*7,'frameCount':motion['cycleFrames']+1,'sampleFps':motion['fps'],
  'sourceFrameRate':motion['sourceFrameRate'],'sourceStartFrame':motion['range'][0],
  'runtimeTimeKnots':motion['runtimeTimeKnots'],'sourceFrameKnots':motion['sourceFrameKnots'],
  'bindPelvisHeight':heads[N('Pelvis')].z,'encoding':'float32le/base64',
  'frames':base64.b64encode(struct.pack('<'+'f'*len(full),*full)).decode('ascii')}})
library['clips'][clip]=metadata
aliases={'DadaoLight':['DadaoCompact'],'DadaoLightAlt':['DadaoCompactAlt'],'DadaoParryLeft':['DadaoParry'],
 'BayonetLight':['BayonetLightAlt','BayonetCompact','BayonetCompactAlt'],'BayonetParryLeft':['BayonetParry']}
for alias in aliases.get(clip,[]):library['clips'][alias]={**{k:v for k,v in metadata.items() if k!='recoveredPose'},'aliasOf':clip}
library['source']='BlenderMCP / original bind skeleton; melee attacks and parries from GVHMR video'
path.write_text('// Original-skeleton Blender samples; video takes exported by Script_MeleeVideoBodyExport.py.\nexport const MELEE_'+faction.upper()+'_ANIMATIONS = '+json.dumps(library,separators=(',',':'))+';\n',encoding='utf-8')
print('RUNTIME VIDEO TAKE',faction,clip,flush=True)
