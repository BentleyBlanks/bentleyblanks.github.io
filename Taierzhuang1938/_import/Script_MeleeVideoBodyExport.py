"""Export the evaluated original-skeleton video take into the live melee library."""
from mathutils import Quaternion
project=Path(__file__).resolve().parents[1]
path=project/f'Data_Melee{faction}Animations.mjs'
library=json.loads(path.read_text(encoding='utf-8').split(' = ',1)[1].strip().rstrip(';'))
parts=library['parts'];convert=Matrix.Rotation(-math.pi/2,4,'X');rotConvert=convert.to_quaternion()
sourceFrames=np.interp(np.linspace(0,1,31),motion['runtimeTimeKnots'],motion['sourceFrameKnots'])
rows=[]
for i,sourceFrame in enumerate(sourceFrames):
 frame=(sourceFrame-motion['range'][0])*2+1;scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
 values=[]
 for part in parts:
  bone=arm.pose.bones[N(part)];matrix=arm.matrix_world@bone.matrix
  delta=matrix.to_quaternion()@rest[N(part)].to_quaternion().inverted();q=rotConvert@delta@rotConvert.inverted()
  offset=convert.to_3x3()@(matrix.translation-heads[N(part)])
  values.extend(round(x,6) for x in [*offset,q.x,q.y,q.z,q.w])
 rows.append(values+library['clips'][clip]['frames'][i][-9:])
metadata={'loop':False,'frames':rows,'source':'GVHMR video / '+motion['source'],'sourceFrames':sourceFrames.tolist()}
library['clips'][clip]=metadata
aliases={'DadaoLight':['DadaoCompact'],'DadaoLightAlt':['DadaoCompactAlt'],'DadaoParryLeft':['DadaoParry'],
 'BayonetLight':['BayonetLightAlt','BayonetCompact','BayonetCompactAlt'],'BayonetParryLeft':['BayonetParry']}
for alias in aliases.get(clip,[]):library['clips'][alias]={**metadata,'aliasOf':clip}
library['source']='BlenderMCP / original bind skeleton; melee attacks and parries from GVHMR video'
path.write_text('// Original-skeleton Blender samples; video takes exported by Script_MeleeVideoBodyExport.py.\nexport const MELEE_'+faction.upper()+'_ANIMATIONS = '+json.dumps(library,separators=(',',':'))+';\n',encoding='utf-8')
print('RUNTIME VIDEO TAKE',faction,clip,flush=True)
