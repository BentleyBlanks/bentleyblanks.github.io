"""Photo-derived visible lower-front fasteners; immutable V64 checkpoint input.

The three generic heads hidden in the primary reference remain explicitly
inferred. Only the25visible generic heads are replaced by12front-face heads.
Three additional photo heads near the curved casings remain separate, unplaced
observations because the existing front-plane construction is not admissible.
This is an isolated gray trial, not final reference or PBR acceptance.
"""
import ast,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])));base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'FrontFastenersV74';acc=root/'Acceptance'
for directory in [root,acc,root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV64.json').read_text());observations=json.loads((base/'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text());datums=json.loads((base/'ReferenceV73/Inputs/Data_ActualFrontCrownsV73.json').read_text());assert datums['sourceBlendSha256']==manifest['sourceBlendSha256'];assert hashlib.sha256(Path(manifest['sourceBlend']).read_bytes()).hexdigest()==manifest['sourceBlendSha256'];assert not bpy.data.filepath;bpy.ops.wm.open_mainfile(filepath=manifest['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';asset=bpy.data.objects['Type94Tankette'];obj=bpy.data.objects['Geometry_Hull_Paint'];old=obj.data;bpy.context.view_layer.update();scope={};tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_Type94GameTrial.py').read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='LooseParts'],type_ignores=[]),'<declared actual components>','exec'),scope);parts=scope['LooseParts'](old)
removed=[r for r in datums['records']if next(v for v in r['visibility']if v['camera']=='2017')['visible']];assert len(removed)==25;removeFaces={f for r in removed for f in parts[r['componentIndex']]};keep=[f.index for f in old.polygons if f.index not in removeFaces];used=sorted({i for f in keep for i in old.polygons[f].vertices});lookup={i:j for j,i in enumerate(used)};points=[tuple(old.vertices[i].co)for i in used];faces=[[lookup[i]for i in old.polygons[f].vertices]for f in keep];smooth=[old.polygons[f].use_smooth for f in keep];slots=[old.polygons[f].material_index for f in keep];uvs=[tuple(old.uv_layers.active.data[i].uv)for f in keep for i in old.polygons[f].loop_indices];normals=[tuple(old.corner_normals[i].vector)for f in keep for i in old.polygons[f].loop_indices]
paintSlot=next(i for i,m in enumerate(old.materials)if m.name.split('.')[0]=='Material_Type94Paint');inverse=obj.matrix_world.inverted();normal=(inverse.to_3x3()@Vector(datums['frontNormal'])).normalized();axisU=Vector((1,0,0));axisU=(axisU-normal*axisU.dot(normal)).normalized();axisV=normal.cross(axisU).normalized();shift=datums['groundCompensationM'];added=[]
deferredNames={'FarUpperEdge','NearMiddleEdge','NearBottomEdge'}
frontRows=[r for r in observations['rows']if r['name']not in deferredNames]
assert len(frontRows)==12 and len(observations['rows'])==15
for index,record in enumerate(frontRows):
    crown=inverse@(Vector(record['fitFrameCrownOnConditionalPlaneM'])+Vector((0,0,shift)));radius=.010;tipRadius=.0086;height=.006;chamfer=.0014;center=crown-normal*height;offset=len(points);profile=[(0.,radius),(height-chamfer,radius),(height,tipRadius)]
    for depth,r in profile:
        for j in range(6):
            angle=(j+.5)*math.tau/6;points.append(tuple(center+normal*depth+(axisU*math.cos(angle)+axisV*math.sin(angle))*r))
    localFaces=[list(reversed(range(6))),list(range(12,18))]
    for ring in range(2):
        for j in range(6):localFaces.append([ring*6+j,ring*6+(j+1)%6,(ring+1)*6+(j+1)%6,(ring+1)*6+j])
    for face in localFaces:
        ids=[offset+i for i in face];faces.append(ids);smooth.append(False);slots.append(paintSlot);p=[Vector(points[i])for i in ids];n=(p[1]-p[0]).cross(p[2]-p[0]).normalized();normals.extend(tuple(n)for i in ids)
        u=(p[1]-p[0]).normalized();v=n.cross(u).normalized();q=[((point-center).dot(u),(point-center).dot(v))for point in p];uMin=min(a for a,b in q);uMax=max(a for a,b in q);vMin=min(b for a,b in q);vMax=max(b for a,b in q);uvs.extend(((a-uMin)/max(uMax-uMin,1e-12),(b-vMin)/max(vMax-vMin,1e-12))for a,b in q)
    added.append(dict(name=record['name'],sourceObservedNative=record['observedNative'],fitFrameCrownM=record['fitFrameCrownOnConditionalPlaneM'],sourcePixelSigmaNative=record['sigmaNative'],headSides=6,radiusM=radius,heightM=height,topChamferM=chamfer,profileDimensionsInferred=True))
mesh=bpy.data.meshes.new('Mesh_Type94FrontFastenerPhotoTrialV74');mesh.from_pydata(points,[],faces);mesh.update()
for material in old.materials:mesh.materials.append(material)
uv=mesh.uv_layers.new(name='UVMap')
for item,p in zip(uv.data,uvs):item.uv=p
for face,s,m in zip(mesh.polygons,smooth,slots):face.use_smooth=s;face.material_index=m
mesh.normals_split_custom_set(normals);obj.data=mesh;hull=bpy.data.objects['Hull'];hull['FrontVisibleFastenerLayout']='ReferenceV73/Data_FrontFastenerObservationsV73.json';hull['FrontVisibleFastenerPhotoCount']=12;hull['FrontVisibleGenericHeadsRemoved']=25;hull['FrontFastenerProfileAndDepthInferred']=True;hull['FrontFastenerPrimaryPlaneConditional']=True;hull['FrontFastenerRetainedHiddenGenericCount']=3;hull['FrontFastenerSecondaryViewsAccepted']=False;scene['WholeReferenceAccepted']=False;scene['SurfaceHistoricalPlacementAccepted']=False;scene['SurfaceUvRegenerationRequired']=True;scene['FrontFastenerRevision']='ShapeV74FrontFastenerTrial';scene['SourceGltfSha256']=manifest['sha256'];blend=root/'Scene_Type94TanketteHighShapeV74FrontFastenersTrial.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.object.select_all(action='DESELECT');actual={asset}|set(asset.children_recursive)
for part in actual:part.select_set(True)
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('FrontFastenerExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);glb=root/'Exports/Model_Type94TanketteHighShapeV74FrontFastenersTrial.glb';exporter.ExportGltf(glb);triangles=sum(len(f.vertices)-2 for part in actual if part.type=='MESH'for f in part.data.polygons);report=dict(schema='Type94FrontFastenerGrayTrialV1',sourceReferenceSha256=observations['referenceSha256'],baseGlbSha256=manifest['sha256'],baseBlendSha256=manifest['sourceBlendSha256'],sourceBlend=str(blend),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),triangles=triangles,meshOwners=sum(part.type=='MESH'for part in actual),removedGenericVisibleComponents=[dict(name=r['name'],componentIndex=r['componentIndex'])for r in removed],retainedPrimaryHiddenGenericHeads=3,addedPhotoHeads=added,baseHullFaces=len(old.polygons),retainedBaseHullFaces=len(keep),newHullFaces=len(mesh.polygons),newUvsProvisional=True,wholeReferenceAccepted=False,secondaryViewsAccepted=False,finalPbrAccepted=False,canonicalGameReplaced=False,scope='Only25primary-visible generic front heads replaced with12manually identified angular heads on the existing conditional plane. All other geometry and axes intended unchanged; independent source/export and correspondence checks remain required.')
(acc/'Data_FrontFastenerIdentityV74.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=triangles,sha256=report['sha256'],removed=25,added=12,secondaryAccepted=False)),flush=True)
