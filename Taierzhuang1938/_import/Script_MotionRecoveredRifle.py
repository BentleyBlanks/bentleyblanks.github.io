"""Fit a shared rifle to recovered wrists; executed inside MotionBakeV2.

The calibrated local palm offsets distinguish the wrist baseline from the gun
axis. Gravity fixes roll. Grip spacing stays fixed for the whole clip, while the
observed shoulder-relative wrist baseline drives orientation and translation.
"""
sourceArmLength=sum(
 (Vector(motion['sourceRestJoints'][mapping[s+' Forearm']])-Vector(motion['sourceRestJoints'][mapping[s+' UpperArm']])).length+
 (Vector(motion['sourceRestJoints'][mapping[s+' Hand']])-Vector(motion['sourceRestJoints'][mapping[s+' Forearm']])).length
 for s in ['L','R'])/2
targetArmLength=sum((heads[N(s+' Forearm')]-heads[N(s+' UpperArm')]).length+(heads[N(s+' Hand')]-heads[N(s+' Forearm')]).length for s in ['L','R'])/2
recoveredArmScale=targetArmLength/sourceArmLength
recoveredGripDirections={'R':Vector((0,.35,-.9367)).normalized(),'L':Vector((1,0,0))}
recoveredGripNormals={'R':Vector((-1,0,0)),'L':Vector((0,1,0))}
recoveredPalmOffsets={}
for side in ['L','R']:
 bindHand=Basis(rest[N(side+' Hand')].to_3x3().col[0],rest[N(side+' Hand')].to_3x3().col[1])
 localHand=Basis(recoveredGripDirections[side],recoveredGripNormals[side])@bindHand.transposed()
 palm=rest[N(side+' Hand')].to_3x3().col[0].normalized()*(.065*scale)+rest[N(side+' Hand')].to_3x3().col[1].normalized()*(.015*scale)
 recoveredPalmOffsets[side]=localHand@palm
recoveredLocalGrips={'R':Vector((.020*scale,-.045*scale,.055*scale)),'L':Vector((0,-.022*scale,-.16*scale))}
observedSpan=float(np.median([(Vector(j[20])-Vector(j[21])).length for j in motion['sourceRelativeJoints']]))*recoveredArmScale
# Keep the support hand in the configured fore-end interval, expressed in
# original rifle socket units. Validate this interval on the complete mesh.
lower,upper=[v*scale for v in motion.get('supportGripDistanceBounds',[.14,.40])]
for iteration in range(24):
 distance=(lower+upper)/2
 candidate=Vector((0,-.022*scale,-distance))-recoveredPalmOffsets['L']
 right=recoveredLocalGrips['R']-recoveredPalmOffsets['R']
 if (candidate-right).length<observedSpan:lower=distance
 else:upper=distance
recoveredLocalGrips['L'].z=-(lower+upper)/2
recoveredLocalWrists={s:recoveredLocalGrips[s]-recoveredPalmOffsets[s] for s in ['L','R']}
recoveredLocalSpan=recoveredLocalWrists['L']-recoveredLocalWrists['R']
recoveredGripSamples=[]
recoveredGripSource=np.array(motion['sourceRelativeJoints'],dtype=float)
if loop:
 # Close only the final grip window. Keep this separate from the source arrays
 # used by the body and leg solver and from the untouched GVHMR preview.
 seam=max(1,min(motion.get('seamBlendSourceFrames',6)*2,count//4))
 delta=recoveredGripSource[0]-recoveredGripSource[-1]
 velocity=(recoveredGripSource[1]-recoveredGripSource[0])-(recoveredGripSource[-1]-recoveredGripSource[-2])
 for k in range(seam+1):
  t=k/seam
  recoveredGripSource[-seam-1+k]+=(-2*t**3+3*t*t)*delta+(t**3-t*t)*seam*velocity

def HorizontalBodyBasis(left):
 left=left.copy();left.z=0;left.normalize()
 return Matrix((left,Vector((-left.y,left.x,0)),Vector((0,0,1)))).transposed()

def RecoveredRifleProps(index,positions,rotations):
 source=[Vector(p) for p in recoveredGripSource[index]]
 sourceCenter=(source[16]+source[17])/2
 center=(positions['L UpperArm']+positions['R UpperArm'])/2
 sourceBody=HorizontalBodyBasis(source[16]-source[17])
 targetBody=HorizontalBodyBasis(positions['L UpperArm']-positions['R UpperArm'])
 transform=targetBody@sourceBody.transposed()
 wrists={s:center+transform@(source[mapping[s+' Hand']]-sourceCenter)*recoveredArmScale for s in ['L','R']}
 adjusted=positions.copy()
 for s in ['L','R']:
  direction=transform@(source[mapping[s+' Forearm']]-source[mapping[s+' UpperArm']])
  adjusted[s+' Forearm']=positions[s+' UpperArm']+direction.normalized()*(heads[N(s+' Forearm')]-heads[N(s+' UpperArm')]).length
 span=wrists['L']-wrists['R']
 # A two-axis rigid fit: the local WRIST baseline maps to observed wrists,
 # while the gun's top remains upright. The barrel is a different local axis.
 orientation=Basis(span,Vector((0,0,1)))@Basis(recoveredLocalSpan,Vector((0,1,0))).transposed()
 origin=(wrists['L']+wrists['R']-orientation@(recoveredLocalWrists['L']+recoveredLocalWrists['R']))/2
 initialOrigin=origin.copy()
 for iteration in range(12):
  for s in ['L','R']:
   reach=((heads[N(s+' Forearm')]-heads[N(s+' UpperArm')]).length+(heads[N(s+' Hand')]-heads[N(s+' Forearm')]).length)*.96
   sphereCenter=positions[s+' UpperArm']-orientation@recoveredLocalWrists[s]
   delta=origin-sphereCenter
   if delta.length>reach:origin=sphereCenter+delta.normalized()*reach
 matrix=orientation.to_4x4();matrix.translation=origin;SetRifle(matrix)
 errors=[]
 for s in ['L','R']:
  errors.append(Hand(s,matrix@recoveredLocalGrips[s],orientation@recoveredGripDirections[s],orientation@recoveredGripNormals[s],adjusted,rotations))
 bpy.context.view_layer.update()
 actual={s:arm.matrix_world@arm.pose.bones[N(s+' Hand')].head for s in ['L','R']}
 actualSpan=actual['L']-actual['R']
 recoveredGripSamples.append({'frame':index+1,'sourceFrame':motion['sourceFrameIndices'][index],
  'targetWrists':{s:list(wrists[s]) for s in ['L','R']},'actualWrists':{s:list(actual[s]) for s in ['L','R']},
  'spanDirectionErrorDegrees':math.degrees(actualSpan.angle(span)),
  'maxWristTargetErrorMeters':max((actual[s]-wrists[s]).length for s in ['L','R']),
  'sharedReachAdjustmentMeters':(origin-initialOrigin).length,'gripErrorMeters':max(errors),
  'barrelDirection':list(orientation@Vector((0,0,-1)))})
 return max(errors)

Props=RecoveredRifleProps
