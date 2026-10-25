"""Anatomical hind-chain binding after the coupled reference section fit."""
import bpy,math,json
import numpy as np

def Smooth(a,b,value):
 t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def BindReferenceHindLegs(scene,skin,rig):
 stems=['DonkeyRearLeft','DonkeyRearRight'];appearance=skin.data.attributes.get('LimbAppearanceMass');changed=0;oppositeRemoved=0
 groups={g.name:g.index for g in skin.vertex_groups};owners={g.index:next((s for s in stems if g.name.startswith(s)),None) for g in skin.vertex_groups}
 rows={s:[rig.data.bones[s+suffix].head_local.copy() for suffix in ['Pivot','ElbowPivot','KneePivot','HoofPivot']] for s in stems}
 for v in skin.data.vertices:
  p=v.co
  if p.y>.30 or p.z>.95 or p.z<.105 or abs(p.x)<.03:continue
  original={g.group:g.weight for g in v.groups};mass={s:sum(w for g,w in original.items() if owners[g]==s) for s in stems};total=sum(mass.values())
  if total<.15:continue
  stem=stems[0] if p.x<0 else stems[1];hip,stifle,hock,hoof=rows[stem]
  a=Smooth(stifle.z-.060,stifle.z+.060,p.z);b=Smooth(hock.z-.045,hock.z+.045,p.z);c=Smooth(hoof.z-.040,hoof.z+.040,p.z)
  chain={stem+'Pivot':a,stem+'ElbowPivot':(1-a)*b,stem+'KneePivot':(1-a)*(1-b)*c,stem+'HoofPivot':(1-a)*(1-b)*(1-c)}
  row={g:w for g,w in original.items() if owners[g] is None}
  for name,weight in chain.items():
   if weight>1e-8:row[groups[name]]=total*weight
  row=dict(sorted(row.items(),key=lambda item:-item[1])[:4]);normal=sum(row.values())
  for g in list(v.groups):skin.vertex_groups[g.group].remove([v.index])
  for group,weight in row.items():skin.vertex_groups[group].add([v.index],weight/normal,'REPLACE')
  changed+=1;oppositeRemoved+=int(mass[stems[1] if stem==stems[0] else stems[0]]>1e-5)
 report={'version':'20261025HindBindingV32','method':'same-side anatomical hip/stifle/hock/fetlock segment ownership with smooth joint bands; original total rear/axial mass retained and strongest four normalized; rigid horn/soles untouched','vertices':changed,'oppositeSideContaminationRemoved':oppositeRemoved,'jointHalfBandsM':[.060,.045,.040],'maximumInfluences':max(len(v.groups) for v in skin.data.vertices)}
 scene['DonkeyHindBindingReport']=json.dumps(report);return report

def HarmonicHindRoots(skin,hipStrength=1.0,bodyThreshold=.86,upperHeight=.91,bodyForwardMargin=None):
 mesh=skin.data;original={v.index:{g.group:g.weight for g in v.groups} for v in mesh.vertices};adj=[set() for v in mesh.vertices]
 for e in mesh.edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 pelvis=skin.vertex_groups['DonkeyPelvisPivot'].index;axial={g.index for g in skin.vertex_groups if g.name in ['DonkeyPelvisPivot','DonkeyBodyPivot','DonkeyThoraxPivot','DonkeyChestPivot']};stems=['DonkeyRearLeft','DonkeyRearRight'];rear={s:{g.index for g in skin.vertex_groups if g.name.startswith(s)} for s in stems}
 envelope=None
 if bodyForwardMargin is not None:
  from pathlib import Path
  project=Path(bpy.context.scene['DonkeyCartProject']);namespace={};file=project/'_blender/Script_DonkeyLegAlbedo.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace);envelope=namespace['BOUNDARIES']['SideRear']
 selected={v.index for v in mesh.vertices if abs(v.co.x)<.24 and -.22<v.co.y<.27 and .60<v.co.z<upperHeight};anchors={};unknown=[]
 for i in selected:
  p=mesh.vertices[i].co;stem=stems[0] if p.x<0 else stems[1];mass=sum(original[i].get(g,0) for g in rear[stem]);row=None
  bodyY=.23
  if envelope is not None:
   ppm=(925-302)/1.10;v=925-ppm*p.z;lo,hi=[float(np.interp(v,[r[0] for r in envelope],[r[c] for r in envelope])) for c in [1,2]];bodyY=.692091405+(707-(lo+hi)/2)/ppm+(hi-lo)/ppm*.48+bodyForwardMargin
  if p.z>bodyThreshold or p.y>bodyY or abs(p.x)<.05:row={pelvis:1}
  elif p.z<.635:row={skin.vertex_groups[stem+'ElbowPivot'].index:1}
  elif .755<p.z<.795 and mass>.65:row={skin.vertex_groups[stem+'Pivot'].index:hipStrength,pelvis:1-hipStrength}
  elif any(j not in selected for j in adj[i]):row=original[i]
  if row is None:unknown.append(i)
  else:anchors[i]=row
 lookup={v:i for i,v in enumerate(unknown)};groups=len(skin.vertex_groups);matrix=np.zeros((len(unknown),len(unknown)));rhs=np.zeros((len(unknown),groups))
 for vertex in unknown:
  i=lookup[vertex];p=mesh.vertices[vertex].co
  for j in adj[vertex]:
   weight=1/max(.0005,(mesh.vertices[j].co-p).length);matrix[i,i]+=weight
   if j in lookup:matrix[i,lookup[j]]-=weight
   else:
    for group,value in anchors.get(j,original[j]).items():rhs[i,pelvis if group in axial else group]+=weight*value
 solution=np.linalg.solve(matrix,rhs)
 if not np.isfinite(solution).all():raise RuntimeError('Non-finite hind-root harmonic weights')
 for vertex in selected:
  p=mesh.vertices[vertex].co;stem=stems[0] if p.x<0 else stems[1];opposite=rear[stems[1] if stem==stems[0] else stems[0]];row=dict(enumerate(solution[lookup[vertex]])) if vertex in lookup else anchors[vertex];values={}
  for group,value in row.items():
   if value<=1e-8:continue
   target=pelvis if group in axial or group in opposite else group;values[target]=values.get(target,0)+float(value)
  values=dict(sorted(values.items(),key=lambda item:-item[1])[:4]);total=sum(values.values())
  for g in list(mesh.vertices[vertex].groups):skin.vertex_groups[g.group].remove([vertex])
  for group,value in values.items():skin.vertex_groups[group].add([vertex],value/total,'REPLACE')
 return {'method':'positive inverse-edge-length harmonic root weights between pelvic, hip and stifle anchors; opposite-side contamination consolidated into pelvis; strongest four normalized','selectedVertices':len(selected),'unknownVertices':len(unknown),'anchors':len(anchors),'hipAnchorStrength':hipStrength,'bodyAnchorHeightM':bodyThreshold,'domainUpperHeightM':upperHeight,'anteriorBodyMarginM':bodyForwardMargin,'geometryDisplacementM':0}

def RigidHindPasterns(skin):
 changed=0;stems=['DonkeyRearLeft','DonkeyRearRight']
 for v in skin.data.vertices:
  p=v.co
  if p.z<.105 or p.z>.30 or p.y>.25 or abs(p.x)<.03:continue
  stem=stems[0] if p.x<0 else stems[1];mass=sum(g.weight for g in v.groups if skin.vertex_groups[g.group].name.startswith(stem))
  if mass<.85:continue
  t=Smooth(.19,.30,p.z);row={stem+'HoofPivot':1-t,stem+'KneePivot':t}
  for g in list(v.groups):skin.vertex_groups[g.group].remove([v.index])
  for name,weight in row.items():
   if weight>1e-8:skin.vertex_groups[name].add([v.index],weight,'REPLACE')
  changed+=1
 return {'method':'rigid lower pastern with a smooth upper-cannon transition; horn and soles retained','vertices':changed,'transitionHeightM':[.19,.30]}
