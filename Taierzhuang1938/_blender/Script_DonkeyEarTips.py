"""Measured narrow ear crowns, with local rim resolution and protected roots."""
import bpy,bmesh,json,hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np


def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)


def RefineEarTips(scene,rig):
    if scene.get('DonkeyEarTipReport'):return json.loads(scene['DonkeyEarTipReport'])
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(source),check_existing=False);rgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(image)
    inverse=rig.matrix_world.inverted();ppm=(925-302)/1.10;reports={};totalAdded=0
    for side,left,right in [('Right',50,132),('Left',182,264)]:
        objects=[bpy.data.objects['DonkeyPinna'+side],bpy.data.objects['DonkeyRolledEarRim'+side]]
        reference=[]
        for v in range(15,91):
            active=np.flatnonzero(rgb[v,left:right].mean(axis=1)<.62)
            if len(active):reference.append([v,float(active.min()+left),float(active.max()+left)])
        if len(reference)<40:raise RuntimeError('Ear-tip reference silhouette is incomplete')
        rim=objects[1];matrix=inverse@rim.matrix_world;rim.data.calc_loop_triangles();beforeTriangles=len(rim.data.loop_triangles)
        bm=bmesh.new();bm.from_mesh(rim.data);top=max((matrix@v.co).z for v in bm.verts)
        edges=[e for e in bm.edges if max((matrix@v.co).z for v in e.verts)>top-.004 and min((matrix@v.co).z for v in e.verts)<top-.008]
        if len(edges)!=12:bm.free();raise RuntimeError('Unexpected original ear crown topology')
        bmesh.ops.subdivide_edges(bm,edges=edges,cuts=3,use_grid_fill=True);bm.to_mesh(rim.data);bm.free();rim.data.update();rim.data.calc_loop_triangles();added=len(rim.data.loop_triangles)-beforeTriangles;totalAdded+=added
        if added>80:raise RuntimeError('Ear-tip local refinement exceeds its triangle allocation')
        earGroup=rim.vertex_groups.get('DonkeyEar'+side+'Pivot')
        for vertex in rim.data.vertices:
            for group in list(vertex.groups):rim.vertex_groups[group.group].remove([vertex.index])
            earGroup.add([vertex.index],1,'REPLACE')
        points={obj:np.array([inverse@obj.matrix_world@v.co for v in obj.data.vertices],dtype=np.float64) for obj in objects}
        top=max(float(p[:,2].max()) for p in points.values());target=(925-reference[0][0])/ppm;lift=target-top;base=(925-82)/ppm
        edges=[]
        for obj,p in points.items():
            q=p.copy();q[:,2]+=lift*Smooth(base,top,q[:,2]);edges.extend((q[e.vertices[0]],q[e.vertices[1]]) for e in obj.data.edges)
        a=np.array([e[0] for e in edges]);b=np.array([e[1] for e in edges]);profiles=[]
        for v in np.linspace(reference[0][0]+.05,82,209):
            height=(925-v)/ppm;dz=b[:,2]-a[:,2];valid=(abs(dz)>1e-9)&(np.minimum(a[:,2],b[:,2])<=height)&(np.maximum(a[:,2],b[:,2])>=height)
            if valid.any():
                section=a[valid,0]+(b[valid,0]-a[valid,0])*(height-a[valid,2])/dz[valid];profiles.append([v,float(section.min()),float(section.max())])
        profile=np.array(profiles);ref=np.array(reference)
        def Deform(p):
            q=p.copy();q[:,2]+=lift*Smooth(base,top,q[:,2]);v=925-ppm*q[:,2];lo=np.interp(v,profile[:,0],profile[:,1]);hi=np.interp(v,profile[:,0],profile[:,2]);targetLo=(156.5-np.interp(v,ref[:,0],ref[:,2]))/ppm;targetHi=(156.5-np.interp(v,ref[:,0],ref[:,1]))/ppm
            desired=targetLo+(q[:,0]-lo)/np.maximum(.0005,hi-lo)*(targetHi-targetLo);thin=hi-lo<.0005;desired[thin]=q[thin,0]+(targetLo[thin]+targetHi[thin]-lo[thin]-hi[thin])*.5
            q[:,0]+=(desired-q[:,0])*(1-Smooth(62,82,v));return q
        maximum=0;protected=0;minimumJacobian=1;objectReports={}
        for obj,p in points.items():
            targetPoints=Deform(p);delta=np.linalg.norm(targetPoints-p,axis=1);ids=np.flatnonzero(delta>1e-9);maximum=max(maximum,float(delta.max(initial=0)));protected=max(protected,float(delta[p[:,2]<=base].max(initial=0)))
            if len(ids):
                jac=np.empty((len(ids),3,3));epsilon=.00005
                for axis in range(3):
                    plus=p[ids].copy();minus=p[ids].copy();plus[:,axis]+=epsilon;minus[:,axis]-=epsilon;jac[:,:,axis]=(Deform(plus)-Deform(minus))/(2*epsilon)
                minimumJacobian=min(minimumJacobian,float(np.linalg.det(jac).min()))
            back=(inverse@obj.matrix_world).inverted()
            for i in ids:obj.data.vertices[int(i)].co=back@Vector(targetPoints[i])
            obj.data.update()
            if obj.data.has_custom_normals:obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
            bm=bmesh.new();bm.from_mesh(obj.data);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);bm.free()
            if boundary or nonmanifold:raise RuntimeError('Ear-tip fit changed closed ear topology')
            objectReports[obj.name]={'verticesChanged':len(ids),'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold}
        if protected>1e-8 or maximum>.04 or minimumJacobian<=.05:raise RuntimeError('Ear-tip field moved roots or folded its local volume')
        afterTop=max((inverse@obj.matrix_world@v.co).z for obj in objects for v in obj.data.vertices)
        reports[side]={'referenceTopPixel':reference[0][0],'beforeTopPixel':925-ppm*top,'afterTopPixel':925-ppm*afterTop,'heightLiftM':lift,'trianglesAdded':added,'maximumDisplacementM':maximum,'maximumRootDisplacementM':protected,'minimumSampledJacobian':minimumJacobian,'objects':objectReports,'referenceRows':reference}
    if totalAdded>160:raise RuntimeError('Ear-tip refinement exceeds the total triangle budget')
    report={'version':'20261026EarTipsV39','method':'local rim longitudinal refinement, measured frontal crown height and narrow source silhouette; common monotone field preserves pinna/rim connection and ear roots','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'referenceThreshold':.62,'rimCuts':3,'trianglesAdded':totalAdded,'protectedBelowSourcePixel':82,'ears':reports}
    scene['DonkeyEarTipReport']=json.dumps(report);return report
