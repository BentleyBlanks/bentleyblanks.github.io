"""Offline skin contact correction for the authored HanYang Reload.

After authoring in Blender, execute this file through Script_BlenderMcp with
HANYANG_CONTACT_FOLDER set to a local, ignored cache directory. This exports
the actual right-hand and mixed wrist skin and signed-distance grids of the
real bolt/receiver and visible packet meshes. No runtime asset is generated.

Then run with ordinary Python (NumPy/SciPy):
  python Script_HanYangReloadContact.py <cache> <Data_HanYangReloadContact.json>
Re-author the clip and run the complete bilateral runtime clearance gate.
These small wrist translations retain the authored rotations/finger poses;
the independent gate remains the authority for full arms and moving props.
"""
import json
import math
import hashlib
from pathlib import Path
import numpy as np

GUN_PARTS=('HandledCylinder','HandleRoot','HandleNeck','HandleSphere',
           'RearCockingExterior','RearOuterCover_RoundedSideReturn','ReceiverOuterCollar')
PARTS=GUN_PARTS+('Packet','Rounds')

def Export(folder):
    import bpy
    import re
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene;bolt=bpy.data.objects['Ctl_part_bolt']
    directions=[Vector(v).normalized() for v in [(1,.371,.197),(.211,1,.413),(.317,.227,1)]]
    def Inside(tree,point):
        votes=0
        for direction in directions:
            at=point.copy();hits=0
            for _ in range(64):
                hit,normal,index,distance=tree.ray_cast(at,direction)
                if hit is None:break
                at=hit+direction*1e-7;hits+=1
            votes+=hits%2
        return votes>=2
    meshes=[]
    for name in PARTS:
        ob=bpy.data.objects[('Gun173R_' if name in GUN_PARTS else 'Mesh_')+name];meshes.append(ob)
        cache=folder/(name+'.npz')
        meshHash=hashlib.sha256(np.array([v.co[:] for v in ob.data.vertices],dtype=np.float32).tobytes()+str([p.vertices[:] for p in ob.data.polygons]).encode()).hexdigest()
        if cache.exists():
            old=np.load(cache)
            if 'meshHash' in old and str(old['meshHash'].item())==meshHash:continue
        vertices=[v.co.copy() for v in ob.data.vertices]
        tree=BVHTree.FromPolygons(vertices,[p.vertices[:] for p in ob.data.polygons],all_triangles=False)
        low=np.array([min(v[i] for v in vertices) for i in range(3)])-.0045
        high=np.array([max(v[i] for v in vertices) for i in range(3)])+.0045
        axes=[np.linspace(low[i],high[i],max(3,math.ceil((high[i]-low[i])/.0015)+1)) for i in range(3)]
        shape=tuple(len(axis) for axis in axes);assert np.prod(shape)<2000000,(name,shape)
        values=np.empty(shape,dtype=np.float32)
        for index in np.ndindex(shape):
            point=Vector(tuple(float(axes[i][index[i]]) for i in range(3)))
            hit,normal,triangle,distance=tree.find_nearest(point)
            values[index]=-distance if Inside(tree,point) else distance
        np.savez_compressed(cache,x=axes[0],y=axes[1],z=axes[2],distance=values,meshHash=meshHash)
        print('CONTACT GRID',name,shape)
    skin=[]
    for ob in scene.objects:
        if ob.type!='MESH' or ob.hide_render or not ob.name.startswith('Mesh_Game'):continue
        selectedGroups={g.index for g in ob.vertex_groups if re.search(r'r(hand|finger[0-4][0-2]?)$',re.sub('[^a-z0-9]','',g.name.lower()))}
        selected=np.array([v.index for v in ob.data.vertices if sum(g.weight for g in v.groups if g.group in selectedGroups)>.05],dtype=np.int32)
        if len(selected):skin.append((ob,selected))
    points=[];matrices=[];visibility=[]
    carryWeights=json.loads(scene.get('fpsReloadPacketCarryWeights','[0]'))
    assert len(carryWeights)==205,'Author Reload before exporting contact inputs'
    baseRows=json.loads(scene.get('fpsReloadContactRows','[0]'))
    assert len(baseRows)==205,'Re-author Reload to capture its contact baseline'
    for frame in range(205):
        scene.frame_set(frame+1);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();bi=bolt.matrix_world.inverted();cloud=[]
        for ob,selected in skin:
            ev=ob.evaluated_get(dg);mesh=ev.to_mesh();coords=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)[selected]
            m=np.array(bi@ev.matrix_world);cloud.extend((coords@m[:3,:3].T+m[:3,3]).tolist());ev.to_mesh_clear()
        points.append(cloud);matrices.append([np.array(ob.matrix_world.inverted()@bolt.matrix_world) for ob in meshes]);visibility.append([not ob.hide_render for ob in meshes])
    motionWeights=np.ones((205,len(meshes)),dtype=np.float64);motionWeights[:,len(GUN_PARTS):]=1-np.array(carryWeights)[:,None]
    np.savez_compressed(folder/'Skin.npz',points=np.array(points,dtype=np.float32),matrices=np.array(matrices,dtype=np.float64),visibility=np.array(visibility,dtype=bool),motionWeights=motionWeights,baseRows=np.array(baseRows))
    print('CONTACT SKIN',np.array(points).shape,folder)

def Optimize(folder,output):
    from scipy.interpolate import RegularGridInterpolator
    from scipy.optimize import least_squares
    folder=Path(folder);output=Path(output);skin=np.load(folder/'Skin.npz');points=skin['points'];matrices=skin['matrices'];visibility=skin['visibility'];motionWeights=skin['motionWeights'];fields=[]
    for name in PARTS:
        grid=np.load(folder/(name+'.npz'));axes=[grid[key] for key in ('x','y','z')]
        fields.append((RegularGridInterpolator(axes,grid['distance'],bounds_error=False,fill_value=.1),np.array([a[0] for a in axes]),np.array([a[-1] for a in axes])))
    assert 'baseRows' in skin,'Re-export contact inputs from the current authoring scene'
    previous=skin['baseRows'].tolist()
    corrections=[];audit=[]
    def Distance(frame,delta):
        nearest=np.full(len(points[frame]),.1)
        for partIndex,((field,low,high),matrix,visible,motionWeight) in enumerate(zip(fields,matrices[frame],visibility[frame],motionWeights[frame])):
            # A rigidly carried packet translates with the complete grasp;
            # whole-wrist translation cannot change its internal contact.
            # Validate that contact in the independent runtime audit instead
            # of letting a constant proxy residual select the wrong escape.
            if not visible or (partIndex>=len(GUN_PARTS) and motionWeight<.9999):continue
            translated=points[frame]+delta*motionWeight
            p=translated@matrix[:3,:3].T+matrix[:3,3]
            inside=np.all((p>=low)&(p<=high),axis=1)
            if np.any(inside):nearest[inside]=np.minimum(nearest[inside],field(p[inside]))
        return nearest
    for frame in range(len(points)):
        initial=Distance(frame,np.zeros(3));correction=np.zeros(3)
        active=10<=frame<=190
        if active and np.min(initial)<-.0005:
            def Residual(mm):
                return np.r_[np.maximum(0,-Distance(frame,mm*.001)-.00025)*1000,mm*.012]
            best=least_squares(Residual,np.zeros(3),bounds=(-22,22),max_nfev=60,ftol=1e-6,xtol=1e-5,diff_step=1e-3)
            correction=best.x*.001
        corrections.append(correction)
        audit.append({'frame':frame,'initialMm':float(-np.min(initial)*1000),'finalMm':float(-np.min(Distance(frame,correction))*1000),'deltaMm':np.round(correction*1000,3).tolist()})
    # Smooth the authored correction, then retain the minimum necessary local
    # repair if smoothing would put the skin back into a solid.
    raw=np.array(corrections);smooth=np.array([np.convolve(np.pad(raw[:,i],2,mode='edge'),[1/16,4/16,6/16,4/16,1/16],'valid') for i in range(3)]).T
    final=[]
    for frame,seed in enumerate(smooth):
        if np.min(Distance(frame,seed))<-.0007:
            def Residual(mm):
                penetration=np.maximum(0,-Distance(frame,mm*.001)-.00025)*1000
                return np.r_[penetration,np.max(penetration)*8,(mm-seed*1000)*.008]
            candidates=[least_squares(Residual,seed*1000,bounds=(-22,22),max_nfev=50,ftol=1e-6,xtol=1e-5,diff_step=1e-3).x*.001]
            if np.min(Distance(frame,candidates[0]))<-.001:
                for axis in np.eye(3):
                    for sign in [-1,1]:
                        start=np.clip((seed+axis*sign*.007)*1000,-21.99,21.99)
                        candidates.append(least_squares(Residual,start,bounds=(-22,22),max_nfev=40,ftol=1e-5,xtol=1e-5,diff_step=1e-3).x*.001)
            seed=min(candidates,key=lambda v:(max(0,-np.min(Distance(frame,v))-.0008),np.linalg.norm(v)))
        final.append([round(float(a+b),7) for a,b in zip(previous[frame],seed)])
        audit[frame]['smoothedMm']=float(-np.min(Distance(frame,seed))*1000)
    output.write_text(json.dumps({'fps':60,'space':'bolt local; add to desired wrist before fixed-length arm solve','rows':final},separators=(',',':')),encoding='utf-8')
    (folder/'Data_ContactAudit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
    print('CONTACT CORRECTIONS',max(np.linalg.norm(row) for row in np.array(final))*1000,'mm; residual',max(row['smoothedMm'] for row in audit),'mm')
    print([(r['frame'],round(r['initialMm'],2),r['deltaMm'],round(r['smoothedMm'],2)) for r in audit if r['initialMm']>.5])

if 'HANYANG_CONTACT_FOLDER' in globals():Export(HANYANG_CONTACT_FOLDER)
elif __name__=='__main__':
    import sys
    Optimize(sys.argv[1],sys.argv[2])
