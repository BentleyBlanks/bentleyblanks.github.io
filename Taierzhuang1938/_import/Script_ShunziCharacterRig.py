"""Bind the preserved Shunzi V5 mesh to the project's proven X Bot character rig.

Only the donor's skeleton and interpolated weights are used. Shunzi keeps his own
head, uniform, cap, hands, sandals, UVs and textures. Run via Script_BlenderMcp.
The existing Script_BuildXBotRigCharacter.mjs performs the final runtime conversion.
"""
import bpy, json, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path.cwd().resolve()
work=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ShunziRevision_20261104')
assets=Path(r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/01_顺子')
source=assets/'Shunzi_Merged_V5.glb'
donor=root/'Taierzhuang1938/Model/Character/Model_SquadLeaderLuo.glb'
old=bpy.data.scenes.get('ShunziBinding')
if old:
    for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(old)
sc=bpy.data.scenes.new('ShunziBinding');bpy.context.window.scene=sc

def Import(file):
    before=set(bpy.data.objects)
    with bpy.context.temp_override(scene=sc,view_layer=sc.view_layers[0]):bpy.ops.import_scene.gltf(filepath=str(file))
    return [o for o in bpy.data.objects if o not in before]

donorObjects=Import(donor)
armature=next(o for o in donorObjects if o.type=='ARMATURE')
donorMesh=next(o for o in donorObjects if o.type=='MESH' and len(o.vertex_groups)>0)
target=next(o for o in Import(source) if o.type=='MESH')
target.name='Shunzi_Merged_V5_Bones'
bpy.context.view_layer.update()
targetWorld=np.array([target.matrix_world@v.co for v in target.data.vertices])
savedCoordinates=np.array([v.co for v in target.data.vertices])
labels=np.load(work/'Data_ShunziV5Parts.npy')
assert len(labels)==len(targetWorld), (len(labels),len(targetWorld))
assert abs(targetWorld[:,2].max()-1.8312904835)<1e-5

# Fit the donor rig to Shunzi's original T-pose, in metres, never warp Shunzi.
sourceZ=np.array([0,.1364,.5002,.934,1.2208,1.4377,1.4937,1.5846,1.791])
targetZ=np.array([0,.125,.530,.980,1.255,1.425,1.522,1.6087,1.83129])
donorWorld=np.array([donorMesh.matrix_world@v.co for v in donorMesh.data.vertices])
armXs=np.array([.28,.35,.45,.55,.65,.70,.75,.80,.85,.87])
armOffsets={}
for side in [-1,1]:
    offsets=[]
    for x in armXs:
        oldPoints=donorWorld[(np.abs((donorWorld[:,0]-.0035)*side-x)<.025)&(donorWorld[:,2]>1.25)]
        newPoints=targetWorld[(np.abs(targetWorld[:,0]*side-x*1.057)<.025)&(targetWorld[:,2]>1.25)]
        assert len(oldPoints)>3 and len(newPoints)>3
        oldCentre=np.quantile(oldPoints[:,1:3],[.10,.90],axis=0).mean(0)
        newCentre=np.quantile(newPoints[:,1:3],[.10,.90],axis=0).mean(0)
        offsets.append(newCentre-oldCentre)
    armOffsets[side]=np.array(offsets)
def Fit(points):
    points=np.array(points,dtype=np.float64)
    result=points.copy()
    result[:,0]=(result[:,0]-.0035)*1.057
    result[:,2]=np.interp(result[:,2],sourceZ,targetZ)
    result[:,1]+=.012
    # Match measured arm/palm cross-sections; keep Shunzi's actual mesh untouched.
    for side in [-1,1]:
        signed=(points[:,0]-.0035)*side
        influence=np.clip((signed-.18)/.12,0,1);influence=influence*influence*(3-2*influence)
        influence*=np.clip((points[:,2]-1.20)/.10,0,1)
        for axis in [1,2]:
            wanted=points[:,axis]+np.interp(signed,armXs,armOffsets[side][:,axis-1])
            result[:,axis]=result[:,axis]*(1-influence)+wanted*influence
    return result

fitted=Fit(donorWorld)
donorMesh.data.calc_loop_triangles()
triangles=np.array([t.vertices[:] for t in donorMesh.data.loop_triangles])
tree=BVHTree.FromPolygons([Vector(p) for p in fitted],[tuple(int(x) for x in f) for f in triangles],all_triangles=True)
groupNames=[g.name for g in donorMesh.vertex_groups]
assert len(groupNames)==65, ('weight donor groups',donorMesh.name,len(groupNames))
print('BIND_SOURCE',donorMesh.name,'TARGET',target.name,'GROUPS',len(groupNames))
sourceWeights=[{groupNames[g.group]:g.weight for g in v.groups} for v in donorMesh.data.vertices]

# Keep all rest orientations; only joint positions are fitted. The standard conversion
# restores the exact X Bot node transforms and inverse-bind convention afterwards.
for obj in sc.objects:obj.select_set(False)
armature.select_set(True);bpy.context.view_layer.objects.active=armature
bpy.ops.object.mode_set(mode='EDIT')
matrix=armature.matrix_world.copy();inverse=matrix.inverted()
originalBones={b.name:(matrix@b.head,matrix@b.tail,b.matrix.copy(),b.length) for b in armature.data.edit_bones}
for bone in armature.data.edit_bones:bone.use_connect=False
for bone in armature.data.edit_bones:
    head,tail,rest,length=originalBones[bone.name]
    new=Fit(np.array([head,tail]))
    rest.translation=inverse@Vector(new[0])
    bone.matrix=rest
    bone.length=max(1e-4,length*np.linalg.norm(new[1]-new[0])/max((tail-head).length,1e-6))
bpy.ops.object.mode_set(mode='OBJECT')
armature.name='ShunziRig'
for action in list(bpy.data.actions):
    if action.users==0:bpy.data.actions.remove(action)
armature.animation_data_clear();armature.data.pose_position='REST'
for name in groupNames:target.vertex_groups.new(name=name)

def Barycentric(point,a,b,c):
    v0,v1,v2=b-a,c-a,point-a
    d00,d01,d11=np.dot(v0,v0),np.dot(v0,v1),np.dot(v1,v1)
    denom=d00*d11-d01*d01
    if abs(denom)<1e-16:return np.array([1.,0.,0.])
    v=(d11*np.dot(v2,v0)-d01*np.dot(v2,v1))/denom
    w=(d00*np.dot(v2,v1)-d01*np.dot(v2,v0))/denom
    weights=np.clip(np.array([1-v-w,v,w]),0,1)
    return weights/weights.sum()

distances=[];rigidHeadCount=0;seamCount=0;weightsByVertex=[]
for i,p in enumerate(targetWorld):
    part=int(labels[i]);weights={}
    if part==2 or (part==1 and p[2]>=1.565):
        weights={'Head':1.};rigidHeadCount+=1
    elif part==1:
        t=float(np.clip((p[2]-1.522)/.043,0,1));t=t*t*(3-2*t)
        weights={'Neck':1-t,'Head':t}
    else:
        hit,normal,face,distance=tree.find_nearest(Vector(p))
        vertices=triangles[face];bary=Barycentric(np.array(hit),*fitted[vertices])
        for j,weight in zip(vertices,bary):
            for name,value in sourceWeights[j].items():weights[name]=weights.get(name,0)+float(weight)*value
        distances.append(distance)
        # A single continuous wrist blend is shared by the hand stub and cuff.
        # Disconnected overlapping source parts therefore cannot acquire conflicting joints.
        if 0.660<abs(p[0])<0.805 and p[2]>1.32:
            side='Left' if p[0]>0 else 'Right'
            x=abs(p[0])
            if x<.695:
                t=float(np.clip((x-.660)/.035,0,1));t=.5*t*t*(3-2*t)
                weights={side+'ForeArm':1-t,side+'Hand':t}
            elif x<=.775:
                # Touching cuff/wrist surfaces share one affine transform, so they cannot separate.
                weights={side+'ForeArm':.5,side+'Hand':.5}
            else:
                t=float(np.clip((x-.775)/.030,0,1));t=t*t*(3-2*t)
                weights={name:value*t for name,value in weights.items()}
                for name in [side+'ForeArm',side+'Hand']:weights[name]=weights.get(name,0)+.5*(1-t)
            seamCount+=1
        if part==0 and abs(p[0])<.145 and p[2]>1.49:
            t=float(np.clip((p[2]-1.49)/.10,0,.45))
            weights={'Spine2':1-t,'Neck':t}
    weights=sorted(((name,w) for name,w in weights.items() if w>1e-6),key=lambda x:-x[1])[:4]
    total=sum(w for _,w in weights);assert total>0, ('unweighted target',i,p.tolist(),part,weights)
    weights={name:w/total for name,w in weights}
    weightsByVertex.append(weights)
    for name,weight in weights.items():target.vertex_groups[name].add([i],weight,'REPLACE')

modifier=target.modifiers.new('ShunziSkin','ARMATURE');modifier.object=armature
modifier.use_vertex_groups=True
targetMatrix=target.matrix_world.copy()
target.parent=armature
target.matrix_world=targetMatrix
# The donor appearance never enters either source or runtime exports.
for obj in donorObjects:
    if obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
for obj in sc.objects:obj.select_set(False)
target.select_set(True);armature.select_set(True);bpy.context.view_layer.objects.active=target
bpy.context.view_layer.update()
assert np.array_equal(savedCoordinates,np.array([v.co for v in target.data.vertices]))
output=assets/'Shunzi_Merged_V5_Bones.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=False,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_animations=False,export_skins=True,export_all_influences=False,export_def_bones=False)
glb=output.read_bytes();n=int.from_bytes(glb[12:16],'little');document=json.loads(glb[20:20+n])
assert len(document['meshes'])==1 and len(document['materials'])==1 and len(document['skins'])==1, 'Export only ShunziBinding, never other source/check scenes'
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Scene_ShunziRig_V5.blend'))
report={'schema':1,'source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':output.name,'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'binding':'fitted project X Bot rig with barycentric weight transfer, rigid original head/cap and shared wrist weights','weightDonor':donor.name,'donorSha256':hashlib.sha256(donor.read_bytes()).hexdigest(),'donorAppearanceExported':False,'sourceVerticesUnchanged':True,'vertices':len(targetWorld),'bones':len(armature.data.bones),'rigidHeadVertices':rigidHeadCount,'sharedWristVertices':seamCount,'maxInfluences':4,'transferDistanceM':{'max':float(max(distances)),'p95':float(np.quantile(distances,.95))},'reviewStatus':'requires representative motion review'}
(work/'Data_ShunziBindingV5.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=1))
