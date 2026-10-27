"""Remove only exported shoe triangles wholly enclosed by their own casting.

The editable source stays intact. Original BIN bytes, attributes, normals,
tangents, UVs and images remain exact; only appended index ranges are selected.
The casting and the enclosed pin surfaces share one rigid shoe at every pose.
"""
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path


def CleanEnclosedShoeSurfaces(file):
    file=Path(file);original=file.read_bytes()
    jsonLength,jsonType=struct.unpack_from('<II',original,12)
    document=json.loads(original[20:20+jsonLength]);extras=document.get('asset',{}).get('extras',{})
    enabled=any(n.get('extras',{}).get('runtimeEnclosedShoeCleanup')is True for n in document['nodes'])
    if not enabled:return {'enabled':False,'removedRenderedTriangles':0}
    if'Type89EnclosedShoeCleanup'in extras:return extras['Type89EnclosedShoeCleanup']
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    offset=20+jsonLength;binLength,binType=struct.unpack_from('<II',original,offset)
    binary=bytearray(original[offset+8:offset+8+binLength]);oldBinary=bytes(binary)
    def Access(index):
        accessor=document['accessors'][index];view=document['bufferViews'][accessor['bufferView']]
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        code,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[accessor['componentType']]
        base=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',components*width)
        return [struct.unpack_from('<'+code*components,binary,base+i*stride)for i in range(accessor['count'])]
    shoeNodes=[n for n in document['nodes']if n.get('name','').startswith('Mesh_TrackLink')]
    assert len(shoeNodes)==162 and all('mesh'in n for n in shoeNodes)
    instances=Counter(n['mesh']for n in shoeNodes);rows=[]
    for meshIndex,count in instances.items():
        mesh=document['meshes'][meshIndex];vertices=[];lookup={};triangles=[];provenance=[];originalIndices=[]
        for primitiveIndex,primitive in enumerate(mesh['primitives']):
            points=Access(primitive['attributes']['POSITION']);indices=[v[0]for v in Access(primitive['indices'])];weld=[];originalIndices.append(indices)
            for point in points:
                if point not in lookup:lookup[point]=len(vertices);vertices.append(Vector(point))
                weld.append(lookup[point])
            for at in range(0,len(indices),3):
                triangles.append(tuple(weld[i]for i in indices[at:at+3]));provenance.append((primitiveIndex,at//3))
        adjacency=[set()for _ in vertices]
        for triangle in triangles:
            for a,b in zip(triangle,triangle[1:]+triangle[:1]):adjacency[a].add(b);adjacency[b].add(a)
        remaining=set(range(len(vertices)));components=[]
        while remaining:
            todo=[next(iter(remaining))];component=set(todo);remaining.difference_update(component)
            while todo:
                for neighbour in adjacency[todo.pop()]:
                    if neighbour in remaining:remaining.remove(neighbour);component.add(neighbour);todo.append(neighbour)
            components.append(component)
        components.sort(key=len,reverse=True);plate=components[0]
        plateTriangles=[t for t in triangles if t[0]in plate];edges=Counter()
        for triangle in plateTriangles:
            for a,b in zip(triangle,triangle[1:]+triangle[:1]):edges[tuple(sorted((a,b)))]+=1
        assert len(components)==5 and all(v==2 for v in edges.values()),'A closed same-shoe plate and four separate pin/horn pieces are required'
        plateTree=BVHTree.FromPolygons(vertices,plateTriangles,all_triangles=True,epsilon=.00002)
        rayTree=BVHTree.FromPolygons(vertices,plateTriangles,all_triangles=True,epsilon=0)
        otherIds=[i for i,t in enumerate(triangles)if t[0]not in plate]
        otherTree=BVHTree.FromPolygons(vertices,[triangles[i]for i in otherIds],all_triangles=True,epsilon=.00002)
        crossing={otherIds[a]for a,b in otherTree.overlap(plateTree)}
        directions=[Vector(v).normalized()for v in [(1,.217,.381),(.313,1,.173),(.239,.411,1)]];inside={}
        def Inside(index):
            if index in inside:return inside[index]
            point=vertices[index];nearest,normal,_,distance=plateTree.find_nearest(point)
            accepted=nearest is not None and distance>.0001 and(point-nearest).dot(normal)<0
            if accepted:
                for direction in directions:
                    cursor=point.copy();hits=0
                    for step in range(100):
                        hit,_,_,_=rayTree.ray_cast(cursor,direction)
                        if hit is None:break
                        hits+=1;cursor=hit+direction*1e-6
                    else:raise AssertionError('Unbounded inside cast')
                    if hits%2!=1:accepted=False;break
            inside[index]=accepted;return accepted
        removed={i:[]for i in range(len(mesh['primitives']))}
        for i in otherIds:
            if i not in crossing and all(Inside(v)for v in triangles[i]):
                primitiveIndex,triangleIndex=provenance[i];removed[primitiveIndex].append(triangleIndex)
        assert sum(map(len,removed.values()))>0,'No certified enclosed triangles; inspect this changed shoe rather than expanding tolerances'
        primitiveRows=[]
        for primitiveIndex,deleted in removed.items():
            if not deleted:continue
            primitive=mesh['primitives'][primitiveIndex];sourceAccessor=primitive['indices'];indices=originalIndices[primitiveIndex];deletedSet=set(deleted)
            keep=[v for at in range(0,len(indices),3)if at//3 not in deletedSet for v in indices[at:at+3]]
            componentType=document['accessors'][sourceAccessor]['componentType'];code={5125:'I',5123:'H',5121:'B'}[componentType]
            while len(binary)%4:binary.append(0)
            start=len(binary);payload=struct.pack('<'+code*len(keep),*keep);binary.extend(payload)
            viewIndex=len(document['bufferViews']);document['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(payload),'target':34963})
            index=len(document['accessors']);document['accessors'].append({'bufferView':viewIndex,'componentType':componentType,'count':len(keep),'type':'SCALAR','min':[min(keep)],'max':[max(keep)]});primitive['indices']=index
            primitiveRows.append({'primitive':primitiveIndex,'sourceIndicesAccessor':sourceAccessor,'newIndicesAccessor':index,'removedSourceTriangles':deleted,'removedStorageTriangles':len(deleted)})
        rows.append({'meshIndex':meshIndex,'mesh':mesh.get('name'),'instances':count,'removedStorageTriangles':sum(map(len,removed.values())),'removedRenderedTriangles':count*sum(map(len,removed.values())),'primitives':primitiveRows,'plateClosedTwoManifold':True,'minimumInsideDistanceM':.0001,'intersectionEpsilonM':.00002,'oddParityDirections':3})
    assert bytes(binary[:len(oldBinary)])==oldBinary
    while len(binary)%4:binary.append(0)
    report={'method':'StrictInsideWatertightSameShoePlate_NoSurfaceIntersection','rows':rows,'removedRenderedTriangles':sum(r['removedRenderedTriangles']for r in rows),'originalBinaryByteLength':len(oldBinary),'originalBinarySha256':hashlib.sha256(oldBinary).hexdigest(),'originalBinaryPrefixExact':True,'allOriginalAttributesAndImagesExact':True,'editableSourceUnchanged':True,'scope':'Only wholly enclosed pin triangles. Every retained triangle, original BIN byte and rigid shoe transform is unchanged. Shared shoe-relative transforms make the containment invariant through all track poses.'}
    document.setdefault('asset',{}).setdefault('extras',{})['Type89EnclosedShoeCleanup']=report;document['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(document,ensure_ascii=False,separators=(',',':')).encode('utf8')
    while len(encoded)%4:encoded+=b' '
    total=12+8+len(encoded)+8+len(binary)
    file.write_bytes(struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(encoded),jsonType)+encoded+struct.pack('<II',len(binary),binType)+binary)
    return report
