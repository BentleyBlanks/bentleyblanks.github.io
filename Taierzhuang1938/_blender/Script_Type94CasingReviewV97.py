"""Current physical casing surfaces and coarse two-photo lug correspondence."""
import bpy,hashlib,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV97'
for directory in [root/'Inputs',root/'Acceptance',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV95.json').read_text());cameras=json.loads((base/'ReferenceV93/Inputs/Data_ReferenceCamerasV93.json').read_text())
assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette';bpy.context.view_layer.update();asset=bpy.data.objects['Type94Tankette']
shift=json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM']
def Tree(objects):
    vertices=[];faces=[];owners=[]
    for obj in objects:
        if obj.type!='MESH':continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        for f in obj.data.polygons:faces.append([offset+i for i in f.vertices]);owners.append(obj.name)
    return BVHTree.FromPolygons(vertices,faces),owners
full,names=Tree(asset.children_recursive)
def Ray(pixel,c):
    r,t,k=np.array(c['rotationCameraFromBlender']),np.array(c['translationCameraFromBlender']),np.array(c['k'])
    assert np.array_equal(c['distortion'],np.zeros(5))
    eye=-r.T@t+[0,0,shift];direction=r.T@np.r_[(np.array(pixel)-k[:2,2])/[k[0,0],k[1,1]],1];direction/=np.linalg.norm(direction)
    return eye,direction
def Project(point,c):
    v=np.array(c['rotationCameraFromBlender'])@(np.array(point)-[0,0,shift])+c['translationCameraFromBlender'];p=np.array(c['k'])@v;return(p[:2]/p[2]).tolist()
observations=[dict(camera='2017',pixel=[750,2012],sigmaNative=8),dict(camera='2014',pixel=[679,2043],sigmaNative=8)]
rows=[];rays=[]
for observation in observations:
    c=cameras['cameras'][observation['camera']];eye,direction=Ray(observation['pixel'],c);rays.append((eye,direction))
    nearest=full.ray_cast(Vector(eye),Vector(direction));parts=[]
    for side in ['Left','Right']:
        obj=bpy.data.objects['Geometry_FinalDriveHousing'+side+'_Paint'];tree,_=Tree([obj]);hit=tree.ray_cast(Vector(eye),Vector(direction))
        parts.append(dict(side=side,hitWorldM=list(hit[0])if hit[0]is not None else None,distanceM=hit[3]if hit[0]is not None else None))
    rows.append(dict(**observation,firstOwner=names[nearest[2]]if nearest[2]is not None else None,firstHitWorldM=list(nearest[0])if nearest[0]is not None else None,casingHits=parts))
(a,u),(b,v)=rays;parameter=np.linalg.lstsq(np.c_[u,-v],b-a,rcond=None)[0];p,q=a+u*parameter[0],b+v*parameter[1];point=(p+q)/2
triangulation=dict(worldM=point.tolist(),raysGapM=float(np.linalg.norm(p-q)),rayDistancesM=parameter.tolist(),projections={row['camera']:Project(point,cameras['cameras'][row['camera']])for row in observations},scope='Coarse apparent lug footprint, not a surveyed attachment or mechanical axis; retained cameras are conditional')
report=dict(sourceManifest='Data_GrayTrialV95.json',sourceBlendSha256=m['sourceBlendSha256'],sourceGlbSha256=m['sha256'],observations=observations,rayRows=rows,conditionalTriangulation=triangulation,sourceReadOnly=True,geometryChanged=False,cameraChanged=False,photographicLugIdentityReviewed=True,exactLugSectionInferred=True,wholeReferenceAccepted=False)
(root/'Acceptance/Data_CasingLugRaysV97.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
