"""Read the retained source's front towing hardware in physical coordinates."""
import bpy,hashlib,json,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV93'
for folder in [root/'Acceptance',root/'Inputs',root/'Rebuild']:folder.mkdir(parents=True,exist_ok=True)
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV89.json').read_text())
assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
asset=bpy.data.objects['Type94Tankette'];owner=bpy.data.objects['TowShackleFront'];hull=bpy.data.objects['Geometry_Hull_Paint']
bpy.context.view_layer.update();pin=owner.matrix_world.translation.copy();mesh=hull.data
adj=[[]for v in mesh.vertices]
for edge in mesh.edges:
    a,b=edge.vertices;adj[a].append(b);adj[b].append(a)
seen=set();components=[]
for start in range(len(mesh.vertices)):
    if start in seen:continue
    pending=[start];seen.add(start);component=[]
    while pending:
        v=pending.pop();component.append(v)
        for other in adj[v]:
            if other not in seen:pending.append(other);seen.add(other)
    points=np.asarray([tuple(hull.matrix_world@mesh.vertices[v].co)for v in component]);lo,hi=points.min(axis=0),points.max(axis=0)
    if lo[0]>pin.x-.12 and hi[0]<pin.x+.12 and lo[1]>pin.y-.10 and hi[1]<pin.y+.13 and lo[2]>pin.z-.27 and hi[2]<pin.z+.15:
        indices=set(component);faces=[f.index for f in mesh.polygons if all(v in indices for v in f.vertices)]
        components.append(dict(vertices=component,faces=faces,boundsWorldM=[lo.tolist(),hi.tolist()],vertexCount=len(component),polygonCount=len(faces)))
moving=[]
for obj in owner.children_recursive:
    if obj.type!='MESH':continue
    points=np.asarray([tuple(obj.matrix_world@v.co)for v in obj.data.vertices]);moving.append(dict(name=obj.name,mesh=obj.data.name,boundsWorldM=[points.min(axis=0).tolist(),points.max(axis=0).tolist()],polygons=len(obj.data.polygons),matrixWorld=[list(row)for row in obj.matrix_world]))
report=dict(sourceReference=m,pinWorldM=list(pin),ownerMatrixWorld=[list(row)for row in owner.matrix_world],ownerProperties={k:(v.to_list()if hasattr(v,'to_list')else v)for k,v in owner.items()},candidateFixedComponents=components,movingMeshes=moving,allRootNodes=len([asset,*asset.children_recursive]),sourceGeometryUnchanged=True,scope='Source component ownership/bounds only. Photographic identity must be reviewed independently; no mechanical stop inferred.')
(root/'Acceptance/Data_TowSourceAuditV93.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(pin=list(pin),fixedComponents=[{k:v for k,v in row.items()if k not in ['vertices','faces']}for row in components],moving=moving)))
