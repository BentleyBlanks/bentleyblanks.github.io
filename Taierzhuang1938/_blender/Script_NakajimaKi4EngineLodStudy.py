"""Read-only engine LOD feasibility study; never save over the high author.

Retains nine cylinders and every one of their24 cooling fins. Tests only
radial tessellation and rocker-cover tessellation against the original2mm
sampled surface gate. This is not a complete game/PBR derivative.
"""
import bpy,bmesh,pathlib,json,hashlib,struct,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4EngineLodStudy.py')).resolve().parents[2]
asset=repo/'tmp/NakajimaKi4/ReferenceV41_TailStation';author=json.loads((asset/'Evidence/Data_TailStationAuthor.json').read_text(encoding='utf8'));source=pathlib.Path(bpy.data.filepath)
assert source.resolve()==pathlib.Path(author['sourcePath']).resolve() and hashlib.sha256(source.read_bytes()).hexdigest()==author['sourceSha256']
root=bpy.data.objects['NakajimaKi4'];objects=[o for o in root.children_recursive if o.type=='MESH'];assert len(objects)==928
images={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file};assert images==author['originalPackedImagesUnchanged']
parts=sorted([o for o in objects if o.name.startswith(('CylinderCoolingFin','RockerCover','Engine_Cylinder','Pushrod'))],key=lambda o:o.name);assert len(parts)==252

def Tree(mesh):
    mesh.calc_loop_triangles();return BVHTree.FromPolygons([v.co for v in mesh.vertices],[list(t.vertices)for t in mesh.loop_triangles],all_triangles=True)
def Samples(mesh):
    points=[v.co.copy()for v in mesh.vertices]
    for triangle in mesh.loop_triangles:
        a,b,c=[mesh.vertices[i].co for i in triangle.vertices];points.extend([(a+b+c)/3,(a+b)/2,(b+c)/2,(c+a)/2])
    return points
def Quality(mesh):
    bm=bmesh.new();bm.from_mesh(mesh);opened=sum(not edge.is_manifold for edge in bm.edges);volume=bm.calc_volume(signed=True);bm.free();return opened,volume

rows=[]
for obj in parts:
    assert max(abs(value-1)for value in obj.matrix_world.to_scale())<1e-6
    original=obj.data;original.calc_loop_triangles();sourceTriangles=len(original.loop_triangles)
    attempts=[];options=[(8 if obj.name.startswith('Pushrod') else 16,0)] if not obj.name.startswith('RockerCover') else [(16,10),(16,11),(18,10),(16,12),(18,11),(20,10)]
    treeHigh=Tree(original);highPoints=Samples(original);selected=None
    for sides,rings in options:
      if not obj.name.startswith('RockerCover'):
        radius=max(math.hypot(v.co.x,v.co.y)for v in original.vertices);low=min(v.co.z for v in original.vertices);high=max(v.co.z for v in original.vertices)
        bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=high-low,location=(0,0,0));temporary=bpy.context.object
        for vertex in temporary.data.vertices:vertex.co.z+=(low+high)/2
        settings={'radialSides':sides,'coolingLayersPerCylinder':24}
      else:
        radius=[max(abs(v.co[i])for v in original.vertices)for i in range(3)]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=sides,ring_count=rings,location=(0,0,0));temporary=bpy.context.object
        for vertex in temporary.data.vertices:
            for axis in range(3):vertex.co[axis]*=radius[axis]
        settings={'segments':sides,'rings':rings}
      temporary.name='Study_EngineLodCandidate';candidate=temporary.data;candidate.update();candidate.calc_loop_triangles();treeLow=Tree(candidate);lowPoints=Samples(candidate)
      hToL=max(treeLow.find_nearest(point)[3]for point in highPoints);lToH=max(treeHigh.find_nearest(point)[3]for point in lowPoints);opened,volume=Quality(candidate)
      row={'name':obj.name,'sourceTriangles':sourceTriangles,'candidateTriangles':len(candidate.loop_triangles),'highToLowMaxSampledSurfaceErrorM':hToL,'lowToHighMaxSampledSurfaceErrorM':lToH,'highSamples':len(highPoints),'lowSamples':len(lowPoints),'openOrNonmanifoldEdges':opened,'positiveVolume':volume>0,'settings':settings}
      attempts.append(row);bpy.data.objects.remove(temporary,do_unlink=True);bpy.data.meshes.remove(candidate)
      if max(hToL,lToH)<.002 and opened==0 and volume>0:selected=row;break
    assert selected,attempts
    selected['rejectedTessellations']=[r for r in attempts if r is not selected];rows.append(selected)

baseline=repo/'tmp/NakajimaKi4/ReferenceV38/Model_NakajimaKi4Gray.glb';payload=baseline.read_bytes();length,kind=struct.unpack_from('<II',payload,12);assert kind==0x4e4f534a;g=json.loads(payload[20:20+length]);baselineTriangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes']for p in m['primitives']);assert baselineTriangles==188792
saved=sum(row['sourceTriangles']-row['candidateTriangles']for row in rows);predicted=baselineTriangles-saved
assert predicted<=180000 and len([o for o in root.children_recursive if o.type=='MESH'])==928,{'predicted':predicted,'saved':saved}
assert images=={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file} and hashlib.sha256(source.read_bytes()).hexdigest()==author['sourceSha256']
result={'state':'EngineTessellationBudgetFeasibilityPassed_NotACompleteGameDerivative','sourcePath':str(source),'sourceSha256':author['sourceSha256'],'authorNeverSavedOrMeshMutated':True,'parts':rows,'retainedCoolingFins':216,'retainedRockerCovers':9,'savedTriangles':saved,'baselineGame':str(baseline),'baselineGameSha256':hashlib.sha256(payload).hexdigest(),'baselineGameTriangles':baselineTriangles,'predictedTrianglesIfOtherDerivationCountsRetained':predicted,'maxSampledSurfaceErrorM':max(max(r['highToLowMaxSampledSurfaceErrorM'],r['lowToHighMaxSampledSurfaceErrorM'])for r in rows),'scope':'Local geometry feasibility only. Actual final low source, primary/AO UV transfer, normal/tangent transfer, PBR/AO baking, complete game export/reimport and motion/reference checks remain required. Prediction assumes unchanged counts for all other derived parts.'}
for directory in [asset/'Evidence',source.parent/'Evidence']:(directory/'Data_EngineLodStudy.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({k:result[k]for k in ['state','retainedCoolingFins','savedTriangles','predictedTrianglesIfOtherDerivationCountsRetained','maxSampledSurfaceErrorM']}),flush=True)
