"""Account for zero-area fans omitted by Blender's explicit triangulation."""
import hashlib,json,struct

def Signature(mesh,tri):
    return tuple(sorted(tuple(float(value)for value in mesh.vertices[i].co)for i in tri.vertices))

def Audit(original,triangulated,instances,meshName,requireExact):
    original.calc_loop_triangles();triangulated.calc_loop_triangles()
    before=len(original.loop_triangles);after=len(triangulated.loop_triangles)
    if before==after:return None
    old={};new={};witness=triangulated.attributes['Type89SourcePolygon']
    for tri in original.loop_triangles:old.setdefault(tri.polygon_index,[]).append(tri)
    for tri in triangulated.loop_triangles:new.setdefault(witness.data[tri.polygon_index].value,[]).append(tri)
    rows=[]
    for face in set(old)|set(new):
        a=old.get(face,[]);b=new.get(face,[])
        if len(a)==len(b):continue
        positiveA=sorted(Signature(original,t)for t in a if t.area>1e-12)
        positiveB=sorted(Signature(triangulated,t)for t in b if t.area>1e-12)
        zeroA=sum(t.area<=1e-12 for t in a);zeroB=sum(t.area<=1e-12 for t in b)
        assert len(a)-len(b)==zeroA-zeroB and len(positiveA)==len(positiveB),'Triangulation removed a nondegenerate face'
        exact=positiveA==positiveB
        if requireExact:assert exact,'Game triangulation changed a nondegenerate triangle at a culled fan'
        areaA=sum(t.area for t in a);areaB=sum(t.area for t in b)
        assert abs(areaA-areaB)<1e-8,'Triangulation changed the source polygon area'
        rows.append({'sourcePolygon':face,'before':len(a),'after':len(b),'removedZeroAreaTriangles':zeroA-zeroB,'positiveTriangleCount':len(positiveA),'positiveTrianglesExact':exact,'sourcePositiveTriangleSha256':hashlib.sha256(repr(positiveA).encode()).hexdigest(),'sourceAreaM2':areaA,'triangulatedAreaM2':areaB})
    assert before-after==sum(row['removedZeroAreaTriangles']for row in rows)
    return {'mesh':meshName,'instances':instances,'before':before,'after':after,'removedRenderedZeroAreaTriangles':(before-after)*instances,'changedPolygons':rows}

def Write(file,record):
    raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length]);binary=raw[28+length:]
    g['asset'].setdefault('extras',{})['Type89TriangulationAccounting']=record
    encoded=json.dumps(g,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    file.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
