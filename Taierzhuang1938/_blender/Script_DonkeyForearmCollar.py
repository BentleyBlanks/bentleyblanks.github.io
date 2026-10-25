"""Continuous forearm sections and a surface-based shoulder transition."""
import bpy,json
import numpy as np
from pathlib import Path
from mathutils import Vector


def FitForearmCollars(scene,skin):
    if scene.get('DonkeyForearmCollarReport'):
        return json.loads(scene['DonkeyForearmCollarReport'])
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyLegSections.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    stems,masses,profiles=namespace['MeasureLegSections'](skin,True)
    curve=namespace['Curve'];smooth=namespace['Smooth'];source=[v.co.copy() for v in skin.data.vertices]
    width=[(.10,.067),(.155,.076),(.22,.063),(.30,.067),(.345,.082),(.38,.092),(.425,.084),(.50,.087),(.60,.104),(.66,.118)]
    depth=[(.10,.067),(.155,.079),(.22,.065),(.30,.065),(.38,.080),(.45,.079),(.54,.090),(.60,.106),(.66,.124)]
    centreX=[(.10,.096),(.155,.0957),(.24,.092),(.30,.087),(.38,.085),(.48,.087),(.60,.095),(.66,.103)]
    adjacency=[set() for p in source]
    for edge in skin.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    seeds={};changed=0
    for v,p,row in zip(skin.data.vertices,source,masses):
        if not .10<p.z<.635 or p.y<.53:continue
        stem='DonkeyFrontLeft' if p.x<0 else 'DonkeyFrontRight'
        if row[stem]<.45:continue
        rows=profiles[stem];cx,cy,wx,wy=[curve([(r[0],r[c]) for r in rows],p.z) for c in (1,2,3,4)]
        dx,dy=(p.x-cx)/max(.01,wx/2),(p.y-cy)/max(.01,wy/2)
        radius=max(.1,float(np.hypot(dx,dy)));fair=.72/radius+.28
        tx=(-1 if p.x<0 else 1)*curve(centreX,p.z)
        target=Vector((tx+dx*fair*curve(width,p.z)/2,cy+dy*fair*curve(depth,p.z)/2,p.z))
        v.co=p.lerp(target,smooth(.10,.15,p.z)*(1-smooth(.58,.635,p.z)));changed+=1
        if p.z>.63:seeds[v.index]=v.co-p
    # Positive harmonic continuation is defined on the actual shoulder
    # surface. Cylinder coordinates stop before the axillary junction.
    domain={i for i,p in enumerate(source) if .63<p.z<.81 and .47<p.y<.87 and .025<abs(p.x)<.23}
    anchors={i:seeds[i] for i in domain if i in seeds}
    for i in domain:
        if i not in anchors and any(j not in domain for j in adjacency[i]):anchors[i]=Vector()
    unknown=sorted(domain-set(anchors));lookup={v:i for i,v in enumerate(unknown)}
    matrix=np.zeros((len(unknown),len(unknown)));rhs=np.zeros((len(unknown),3))
    for i in unknown:
        for j in adjacency[i]:
            w=1/max(.002,(source[i]-source[j]).length);matrix[lookup[i],lookup[i]]+=w
            if j in lookup:matrix[lookup[i],lookup[j]]-=w
            else:rhs[lookup[i]]+=np.array(anchors.get(j,Vector()))*w
    solution=np.linalg.solve(matrix,rhs)
    if not np.isfinite(solution).all():raise RuntimeError('Non-finite shoulder continuation')
    for i in unknown:skin.data.vertices[i].co=source[i]+Vector(solution[lookup[i]])
    skin.data.update()
    displacement=max((v.co-p).length for v,p in zip(skin.data.vertices,source))
    soleError=max((v.co-p).length for v,p in zip(skin.data.vertices,source) if p.z<.10)
    if displacement>.065 or soleError>1e-8:raise RuntimeError('Forearm collar exceeded its anatomical fit/hoof bounds')
    report={'version':'20261025ForearmCollarV33','method':'full forearm sections and positive harmonic surface continuation into shoulder; cylinder coordinates stop below the axilla','sectionVertices':changed,'collarVertices':len(unknown),'maximumDisplacementM':displacement,'hornAndSoleDisplacementM':soleError,'shoulderDomainHeightM':[.63,.81],'targetWidthM':width,'targetDepthM':depth}
    scene['DonkeyForearmCollarReport']=json.dumps(report);return report
