"""Bounded fairing of rolled stifle and pastern skin, with rigid horn retained."""
import bpy,bmesh,json
from mathutils import Vector

def Smooth(a,b,value):
 t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def FairReferenceLegSurfaces(scene,skin):
 if scene.get('DonkeyLimbFairingReport'):return json.loads(scene['DonkeyLimbFairingReport'])
 bm=bmesh.new();bm.from_mesh(skin.data)
 faces=[f for f in bm.faces if all(v.co.z>.08 and (v.co.z<.24 or (v.co.y<.35 and v.co.z<.82)) for v in f.verts)]
 bmesh.ops.triangulate(bm,faces=faces,quad_method='BEAUTY',ngon_method='BEAUTY')
 if any(not e.is_manifold for e in bm.edges):
  bm.free();raise RuntimeError('Limb-local triangulation changed the closed skin topology')
 bm.to_mesh(skin.data);bm.free();skin.data.update()
 original=[v.co.copy() for v in skin.data.vertices];strength=[];adj=[set() for v in original]
 for p in original:
  upper=Smooth(.44,.52,p.z)*(1-Smooth(.74,.82,p.z))*(1-Smooth(.20,.35,p.y))*Smooth(.03,.07,abs(p.x))
  pastern=Smooth(.095,.115,p.z)*(1-Smooth(.17,.22,p.z))*Smooth(.03,.07,abs(p.x))
  strength.append(max(upper,pastern))
 for e in skin.data.edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 for _ in range(3):
  points=[v.co.copy() for v in skin.data.vertices]
  for v,amount in zip(skin.data.vertices,strength):
   if amount<=0:continue
   weights=[(j,1/max(.002,(points[j]-points[v.index]).length)) for j in adj[v.index]];total=sum(w for j,w in weights);mean=sum((points[j]*w for j,w in weights),Vector())/total;delta=(mean-points[v.index])*(.35*amount)
   if delta.length>.002:delta*=.002/delta.length
   v.co=points[v.index]+delta
  skin.data.update()
 displacement=max((v.co-p).length for v,p in zip(skin.data.vertices,original));protected=max(((v.co-p).length for v,p in zip(skin.data.vertices,original) if p.z<=.095),default=0)
 if displacement>.0061 or protected>1e-8:raise RuntimeError('Limb fairing changed rigid horn/soles or exceeded 6 mm')
 report={'version':'20261025LimbSurfaceV32','method':'three bounded positive inverse-edge-length fairing passes on both upper hind stifles and all four pastern cuffs; explicit export triangles retained','passes':3,'stepLimitM':.002,'maximumDisplacementM':displacement,'maximumHornOrSoleDisplacementM':protected,'vertices':sum(a>0 for a in strength)}
 scene['DonkeyLimbFairingReport']=json.dumps(report);return report
