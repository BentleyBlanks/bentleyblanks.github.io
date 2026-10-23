"""Re-import the delivered GLB, then audit rigid track/wheel surfaces directly.

This is a controlled background verification, not a persistent Blender service.
The collision pass reads the exported triangles and uses the actual glTF node
hierarchy. It does not rely on a Blender authoring mesh or a screenshot.
"""
import bpy
import json
import hashlib
import math
from pathlib import Path
import struct
import sys
from mathutils import Matrix,Quaternion,Vector
from mathutils.bvhtree import BVHTree

repoDir=Path(__file__).resolve().parents[2]
reviewDir=repoDir/'Taierzhuang1938/_shots/Type89MediumTank'
arguments=sys.argv[sys.argv.index('--')+1:] if '--'in sys.argv else []
file=Path(arguments[0]) if arguments else repoDir/'Taierzhuang1938/Model/Type89MediumTank/Model_Type89MediumTank.glb'
assert bpy.app.background,'This audit must run in the owned background process'
assert 'Type89MediumTank'in str(file.resolve()),'Wrong asset path'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(file))
imported={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'images':len(bpy.data.images),'materials':len(bpy.data.materials),'roots':[obj.name for obj in bpy.data.objects if obj.parent is None]}
data=file.read_bytes();jsonLength,jsonType=struct.unpack_from('<II',data,12);g=json.loads(data[20:20+jsonLength]);offset=20+jsonLength;binary=data[offset+8:]
path=json.loads((repoDir/'Taierzhuang1938/Model/Type89MediumTank/Data_TrackPath.json').read_text())
def Access(index):
    accessor=g['accessors'][index];view=g['bufferViews'][accessor['bufferView']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
    code,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[accessor['componentType']]
    base=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',count*width)
    return [struct.unpack_from('<'+code*count,binary,base+i*stride) for i in range(accessor['count'])]
def Transform(node):
    if 'matrix'in node:return Matrix([node['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
    x,y,z,w=node.get('rotation',[0,0,0,1])
    return Matrix.Translation(Vector(node.get('translation',[0,0,0])))@Quaternion((w,x,y,z)).to_matrix().to_4x4()@Matrix.Diagonal((*node.get('scale',[1,1,1]),1))
static=[Transform(node) for node in g['nodes']]
indicesByName={node.get('name'):i for i,node in enumerate(g['nodes'])}
meshes={}
for i,mesh in enumerate(g['meshes']):
    vertices=[];triangles=[]
    for primitive in mesh['primitives']:
        positions=Access(primitive['attributes']['POSITION']);indices=[x[0] for x in Access(primitive['indices'])]
        base=len(vertices);vertices.extend(Vector(point) for point in positions)
        triangles.extend(tuple(base+index for index in indices[k:k+3]) for k in range(0,len(indices),3))
    meshes[i]=(vertices,triangles)
def Point(distance):
    distance%=path['length']
    for segment in path['segments']:
        if distance<=segment['s']+segment['length']+1e-7:
            t=(distance-segment['s'])/segment['length'];a,b=segment['a'],segment['b']
            return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
def Shoe(distance):
    a=Point(distance-path['pitchM']/2);b=Point(distance+path['pitchM']/2)
    return ((a[0]+b[0])/2,(a[1]+b[1])/2,math.atan2(b[1]-a[1],b[0]-a[0])+math.pi)
links=[i for i,node in enumerate(g['nodes']) if node.get('name','').startswith('Node_TrackLink')]
wheels=[i for i,node in enumerate(g['nodes']) if node.get('name','').startswith(('Node_RoadWheel','Node_LeadingWheel','Node_FrontIdler','Node_RearSprocket','Node_ReturnRoller'))]
def World(pose):
    matrices={}
    def Visit(i,parent):
        matrix=parent@pose.get(i,static[i]);matrices[i]=matrix
        for child in g['nodes'][i].get('children',[]):Visit(child,matrix)
    for root in g['scenes'][g.get('scene',0)]['nodes']:Visit(root,Matrix.Identity(4))
    return matrices
def Geometry(index,world):
    vertices=[];triangles=[]
    def Visit(i):
        node=g['nodes'][i]
        if 'mesh'in node:
            points,faces=meshes[node['mesh']];base=len(vertices)
            vertices.extend(world[i]@point for point in points);triangles.extend(tuple(base+j for j in face) for face in faces)
        for child in node.get('children',[]):Visit(child)
    Visit(index)
    return vertices,triangles
def Bvh(geometry):return BVHTree.FromPolygons(*geometry,all_triangles=True,epsilon=0)
contacts={};maximumPenetration=0.0;testedPairs=0
for frame in range(36):
    distance=path['pitchM']*frame/36;pose={}
    for i in links:
        node=g['nodes'][i];y,z,angle=Shoe(node['extras']['phaseM']-distance)
        pose[i]=Matrix.Translation(Vector((node['translation'][0],z,-y)))@Matrix.Rotation(angle,4,'X')
    for i in wheels:
        pose[i]=static[i]@Matrix.Rotation(-distance/g['nodes'][i]['extras']['radiusM'],4,'X')
    world=World(pose);wheelData={i:(Geometry(i,world),None) for i in wheels}
    wheelData={i:(geometry,Bvh(geometry)) for i,(geometry,_) in wheelData.items()}
    for link in links:
        center=world[link].translation
        nearby=[wheel for wheel in wheels if abs(world[wheel].translation.x-center.x)<.25 and (world[wheel].translation-center).length<g['nodes'][wheel]['extras'].get('geometryRadiusM',g['nodes'][wheel]['extras']['radiusM'])+.14]
        if not nearby:continue
        linkGeometry=Geometry(link,world);linkBvh=Bvh(linkGeometry)
        for wheel in nearby:
            testedPairs+=1;wheelGeometry,wheelBvh=wheelData[wheel]
            overlap=linkBvh.overlap(wheelBvh)
            if not overlap:continue
            key=g['nodes'][wheel]['name'];row=contacts.setdefault(key,{'frames':set(),'trianglePairs':0,'maximumVertexPenetrationM':0.0})
            row['frames'].add(frame);row['trianglePairs']+=len(overlap)
            verticesToCheck={index for a,b in overlap for index in linkGeometry[1][a]}
            for index in verticesToCheck:
                point=linkGeometry[0][index];nearest,normal,_,separation=wheelBvh.find_nearest(point)
                if nearest is None:continue
                signed=(point-nearest).dot(normal)
                if signed<0:
                    if -signed>row['maximumVertexPenetrationM']:
                        row['deepestContact']={'frame':frame,'link':g['nodes'][link]['name'],'pointWorld':list(point),'pointRelativeWheel':list(point-world[wheel].translation),'nearestWorld':list(nearest),'surfaceNormal':list(normal)}
                    row['maximumVertexPenetrationM']=max(row['maximumVertexPenetrationM'],-signed);maximumPenetration=max(maximumPenetration,-signed)
for row in contacts.values():row['frames']=sorted(row['frames'])
report={'file':str(file.resolve()),'sha256':hashlib.sha256(data).hexdigest(),'imported':imported,'links':len(links),'wheelGroups':len(wheels),'phaseSamples':36,'testedNearbyPairs':testedPairs,'contacts':contacts,'maximumVertexPenetrationM':maximumPenetration,'pass':maximumPenetration<.001,'note':'BVH contacts include intended rolling contact; penetration above 1mm blocks acceptance'}
(reviewDir/'Data_ImportedCollisionAudit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:raise RuntimeError('Moving track/wheel intersection exceeds 1mm')
