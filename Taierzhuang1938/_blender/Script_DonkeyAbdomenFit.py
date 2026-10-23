"""Fit the posterior underside to measured original-side pixels, in metres."""
import bpy,math
import numpy as np

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def SampleProfile(rows,value):
    if value<=rows[0][0]:return rows[0][1]
    if value>=rows[-1][0]:return rows[-1][1]
    xs=[row[0] for row in rows];ys=[row[1] for row in rows]
    slopes=[(b-a)/(xb-xa) for a,b,xa,xb in zip(ys,ys[1:],xs,xs[1:])]
    tangents=[slopes[0]]
    tangents.extend(0 if a*b<=0 else 2*a*b/(a+b) for a,b in zip(slopes,slopes[1:]))
    tangents.append(slopes[-1])
    i=next(i for i in range(len(xs)-1) if xs[i]<=value<=xs[i+1]);span=xs[i+1]-xs[i];t=(value-xs[i])/span
    return ((2*t**3-3*t*t+1)*ys[i]+(t**3-2*t*t+t)*span*tangents[i]
            +(-2*t**3+3*t*t)*ys[i+1]+(t**3-t*t)*span*tangents[i+1])

def BindReferenceAbdomen(skin):
    scene=bpy.context.scene
    if scene.get('DonkeyAbdomenBindingRevision'):raise RuntimeError('Abdomen binding already applied')
    changed=0;core=0;beforeMax=0;afterMax=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        blend=Smooth(.095,.175,y)*(1-Smooth(.405,.470,y))*Smooth(.50,.56,z)*(1-Smooth(.80,.95,z))*(1-Smooth(.15,.19,abs(x)))
        if blend<=0:continue
        old={skin.vertex_groups[g.group].name:g.weight for g in vertex.groups if g.weight>1e-8}
        front=Smooth(.15,.44,y);body={'DonkeyPelvisPivot':1-front,'DonkeyThoraxPivot':front}
        weights={name:old.get(name,0)*(1-blend)+body.get(name,0)*blend for name in set(old)|set(body)}
        weights=dict(sorted(((name,w) for name,w in weights.items() if w>1e-8),key=lambda item:-item[1])[:4]);total=sum(weights.values())
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for name,weight in weights.items():
            group=skin.vertex_groups.get(name) or skin.vertex_groups.new(name=name);group.add([vertex.index],weight/total,'REPLACE')
        if blend>.999:
            core+=1;beforeMax=max(beforeMax,sum(w for name,w in old.items() if name.startswith(('DonkeyFront','DonkeyRear'))))
            afterMax=max(afterMax,sum(w/total for name,w in weights.items() if name.startswith(('DonkeyFront','DonkeyRear'))))
        changed+=1
    scene['DonkeyAbdomenBindingRevision']='ReferenceAbdomenBindV1'
    return {'version':'ReferenceAbdomenBindV1','method':'ventral trunk follows pelvis/thorax; smooth groin and lateral transition retains leg skin',
        'vertices':changed,'coreVertices':core,'coreMaxLegWeightBefore':beforeMax,'coreMaxLegWeightAfter':afterMax,'maxInfluences':4}

def FitReferenceAbdomen(skin,anchor):
    scene=bpy.context.scene
    if scene.get('DonkeyAbdomenFitRevision'):raise RuntimeError('Abdomen fit requires the undeformed reference recipe')
    # Original immutable 1536x1024 side panel. These are the visible underside,
    # clear of tack, forelegs and the terminal hindleg silhouette.
    referencePixels=[(867.1567,587.8514),(882.5040,586.3166),(897.8514,583.2472),
        (913.1987,581.7124),(928.5460,578.6430),(943.8934,574.0388),
        (959.2407,567.8998),(974.5880,563.2956),(989.9354,552.5525),(1005.2827,540.2746)]
    ppm=(925-302)/1.10
    target=sorted((anchor+(707-u)/ppm,(925-v)/ppm) for u,v in referencePixels)
    skin.data.calc_loop_triangles();indices=np.array([t.vertices[:] for t in skin.data.loop_triangles],dtype=np.int32)
    def Envelope(positions,y):
        triangles=positions[indices];ys=triangles[:,:,1]
        selected=triangles[(ys.min(axis=1)<=y)&(ys.max(axis=1)>=y)];heights=[]
        for a,b in ((0,1),(1,2),(2,0)):
            first,second=selected[:,a],selected[:,b];dy=second[:,1]-first[:,1]
            valid=(abs(dy)>1e-8)&(np.minimum(first[:,1],second[:,1])<=y)&(np.maximum(first[:,1],second[:,1])>=y)
            if not valid.any():continue
            first,second,dy=first[valid],second[valid],dy[valid]
            points=first+(second-first)*((y-first[:,1])/dy)[:,None]
            valid=(abs(points[:,0])<.10)&(points[:,2]>.50)&(points[:,2]<.90)
            heights.extend(points[valid,2].tolist())
        if not heights:raise RuntimeError('No central abdomen envelope at '+str(y))
        return min(heights)
    before=np.array([v.co[:] for v in skin.data.vertices],dtype=np.float64)
    rows=[];lifts=[];baselines=[]
    for y,z in target:
        actual=Envelope(before,y);lift=max(0,min(.115,z+.0015-actual))
        rows.append({'y':y,'referenceZ':z,'beforeZ':actual,'liftM':lift})
        lifts.append((y,lift));baselines.append((y,actual))
    # Carry the tuck into the inner upper thigh without moving the ground
    # contacts or forcing the outside of either hind leg upward.
    rearLift=min(.115,lifts[0][1]+.020)
    lifts=[(.055,0),(.105,rearLift),(.135,rearLift),*lifts,(.455,0)]
    maxLift=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        if not .055<y<.455 or not .47<z<.95 or abs(x)>=.18:continue
        baseline=SampleProfile(baselines,y)
        weight=Smooth(.47,.56,z)*(1-Smooth(baseline+.025,baseline+.270,z))*(1-Smooth(.11,.18,abs(x)))
        delta=SampleProfile(lifts,y)*weight;vertex.co.z+=delta;maxLift=max(maxLift,delta)
    skin.data.update();after=np.array([v.co[:] for v in skin.data.vertices],dtype=np.float64)
    for row in rows:
        row['afterZ']=Envelope(after,row['y']);row['afterErrorM']=row['afterZ']-row['referenceZ']
    binding=BindReferenceAbdomen(skin)
    scene['DonkeyAbdomenFitRevision']='ReferenceAbdomenV1'
    return {'version':'ReferenceAbdomenV1','method':'measured side underside with smooth Hermite displacement, lateral/height falloffs; original topology and weights retained',
        'referencePixels':referencePixels,'pixelsPerMetre':ppm,'sourceAnchorY':anchor,'skinAllowanceM':.0015,
        'maxLiftM':maxLift,'footLimitZ':.47,'outerLegLimitX':.18,'rows':rows,'binding':binding}
