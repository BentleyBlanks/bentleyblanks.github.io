"""Retain the evaluated V10 cloth envelope at a game-sized triangle budget."""
import math
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def SourceName(obj):return obj.get('PackSourceName',obj.name)
def Triangles(obj):return sum(len(face.vertices)-2 for face in obj.data.polygons)


def FreezeEvaluatedModifier(obj,modifier):
    """Replace only the low mesh through the data API, without UI context.

    The builder can run immediately after opening the source blend from MCP;
    object operators may still have a stale window/view-layer context then.
    A fresh dependency graph also captures newly linked objects and the new
    modifier, while preserving evaluated material and deform-group data.
    """
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=obj.evaluated_get(deps)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
    if mesh is None:
        raise RuntimeError('Could not evaluate low cloth modifier: '+obj.name)
    if not mesh.polygons:
        bpy.data.meshes.remove(mesh)
        raise RuntimeError('Cloth reduction produced an empty mesh: '+obj.name)
    previous=obj.data
    obj.modifiers.remove(modifier)
    obj.data=mesh
    if previous.users==0:bpy.data.meshes.remove(previous)
    obj.data.update()


def CloneSurface(source,parent,name):
    deps=bpy.context.evaluated_depsgraph_get()
    mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    mesh.transform(parent.matrix_world.inverted()@source.matrix_world)
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=parent
    obj['SourceHighObject']=source.name;obj['PackSourceName']=SourceName(source)
    for layer in list(mesh.uv_layers):mesh.uv_layers.remove(layer)
    return obj


def PlanarSimplify(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    if bm.verts.layers.deform.active:bm.verts.layers.deform.remove(bm.verts.layers.deform.active)
    bmesh.ops.dissolve_limit(bm,angle_limit=.00015,verts=list(bm.verts),edges=list(bm.edges),
                            use_dissolve_boundaries=True,delimit={'MATERIAL'})
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def SimplifyBackBoundary(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bm.normal_update()
    back=[f for f in bm.faces if all(abs(v.co.y)<1e-7 for v in f.verts)]
    if back:
        face=max(back,key=lambda f:f.calc_area())
        verts=list(face.verts);points=[v.co.copy() for v in verts];n=len(points)
        keep={min(range(n),key=lambda i:points[i].x),max(range(n),key=lambda i:points[i].x),
              min(range(n),key=lambda i:points[i].z),max(range(n),key=lambda i:points[i].z)}
        def Error(a,b,index):
            start,end=points[a],points[b];edge=end-start
            t=max(0,min(1,(points[index]-start).dot(edge)/max(edge.length_squared,1e-18)))
            return (points[index]-(start+t*edge)).length
        while True:
            order=sorted(keep);candidate=None;largest=.00032
            for a,b in zip(order,order[1:]+order[:1]):
                indices=list(range(a+1,b)) if b>a else list(range(a+1,n))+list(range(0,b))
                for index in indices:
                    error=Error(a,b,index)
                    if error>largest:largest=error;candidate=index
            if candidate is None:break
            keep.add(candidate)
        remove=[v for i,v in enumerate(verts) if i not in keep]
        if remove:bmesh.ops.dissolve_verts(bm,verts=remove,use_face_split=False,use_boundary_tear=False)
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def BackContactMetrics(obj,tolerance=1e-7):
    """The rear contact is geometric; its material is shared with side cloth."""
    faces=[face for face in obj.data.polygons
           if face.normal.y>.98
           and all(abs(obj.data.vertices[index].co.y)<=tolerance for index in face.vertices)]
    ids={index for face in faces for index in face.vertices}
    return {'areaM2':sum(face.area for face in faces),'faces':len(faces),'vertices':len(ids)}


def SnapBackContact(obj,tolerance=.003):
    """Constrain nearly planar rear faces, allowing their topology to collapse.

    A hard protected vertex group freezes hundreds of coplanar back vertices
    and creates a floor above the requested budget.  QEM can remove those
    zero-error vertices naturally.  Only geometry with rear-facing normals
    already within 3 mm of Y=0 is projected; material indices never select
    side vertices.  This also corrects the high source's gently rounded rear
    envelope into the flat character contact required for the game asset.
    """
    faces=[face for face in obj.data.polygons
           if face.normal.y>.98
           and all(abs(obj.data.vertices[index].co.y)<=tolerance for index in face.vertices)]
    ids={index for face in faces for index in face.vertices}
    maximum=max((abs(obj.data.vertices[index].co.y) for index in ids),default=0)
    for index in ids:obj.data.vertices[index].co.y=0
    obj.data.update()
    return maximum


def Limit(obj,target,back=False):
    backBefore=BackContactMetrics(obj) if back else None
    PlanarSimplify(obj)
    if back:SimplifyBackBoundary(obj)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    snap=0
    for iteration in range(5):
        count=Triangles(obj)
        if count<=target:break
        mod=obj.modifiers.new('BudgetedClothEnvelope','DECIMATE');mod.decimate_type='COLLAPSE'
        mod.ratio=max(.0001,target/count*.98);mod.use_collapse_triangulate=True
        FreezeEvaluatedModifier(obj,mod)
        if back:snap=max(snap,SnapBackContact(obj))
        if Triangles(obj)>=count:raise RuntimeError('Cloth reduction made no progress: '+str((obj.name,count,target)))
    if Triangles(obj)>target:raise RuntimeError('Cloth budget exceeded '+str((obj.name,Triangles(obj),target)))
    if back:
        snap=max(snap,SnapBackContact(obj))
        backAfter=BackContactMetrics(obj)
        if backBefore['areaM2']<=0:raise RuntimeError('Source has no planar rear contact')
        if backAfter['areaM2']<.0627:
            raise RuntimeError('Rear contact area below 55% nominal pack rectangle: '+str((backBefore,backAfter)))
    for face in obj.data.polygons:
        face.use_smooth=not all(abs(obj.data.vertices[i].co.y)<1e-7 for i in face.vertices)
    obj.data.update()
    report={'object':obj.name,'triangles':Triangles(obj),'backSnapMaxM':snap}
    if back:
        report.update({'sourceBackContact':backBefore,'gameBackContact':backAfter,
                       'backContactAreaRatio':backAfter['areaM2']/backBefore['areaM2'],
                       'minimumBackContactAreaM2':.0627,'backProjectionLimitM':.003,
                       'backConstraint':'Rear normal.y > .98 and all abs(Y) <= .003 projected to Y=0; game-only envelope repair'})
    return report


def BodyOcclusion(shell,leaf,parent):
    deps=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(leaf,deps)
    leafInv=leaf.matrix_world.inverted();removed=[]
    for face in shell.data.polygons:
        if face.material_index!=0:continue
        point=parent.matrix_world@face.center
        origin=leafInv@Vector((point.x,-.45,point.z));direction=leafInv.to_3x3()@Vector((0,1,0))
        hit=tree.ray_cast(origin,direction.normalized(),.8)[0]
        if hit is not None and (leaf.matrix_world@hit).y<point.y-.00005:removed.append(face.index)
    bm=bmesh.new();bm.from_mesh(shell.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i]for i in removed],context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(shell.data);bm.free();shell.data.update()
    return len(removed)


def Patch(source,parent,leaf):
    nx,nz=3,2;vertices=[];faces=[]
    tree=BVHTree.FromObject(leaf,bpy.context.evaluated_depsgraph_get())
    into=parent.matrix_world.inverted()@source.matrix_world
    for row in range(nz+1):
        for column in range(nx+1):
            r=row/nz*24;c=column/nx*24;ri=min(23,int(r));ci=min(23,int(c));rf=r-ri;cf=c-ci
            a=source.data.vertices[ri*25+ci].co.lerp(source.data.vertices[ri*25+ci+1].co,cf)
            b=source.data.vertices[(ri+1)*25+ci].co.lerp(source.data.vertices[(ri+1)*25+ci+1].co,cf)
            p=into@(a.lerp(b,rf));hit=tree.ray_cast(Vector((p.x,-.4,p.z)),Vector((0,1,0)),.6)[0]
            if hit is not None:p.y=min(p.y,hit.y-.00045)
            vertices.append(tuple(p))
    for row in range(nz):
        for column in range(nx):
            a=row*(nx+1)+column;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new('Geometry_GameRepairPatchV10');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('Game_RepairPatchV10',mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=parent
    obj['SourceHighObject']=source.name
    return obj


def BuildLowBundle(highPart,gamePart,budget=1000):
    sources={SourceName(o):o for o in (highPart,*highPart.children_recursive) if o.type=='MESH'}
    body=sources['Pack_Bundle'];front=sources['StudyV7_RelaxedFrontLeaf']
    shell=CloneSurface(body,gamePart,'Game_BundleEnvelopeV10')
    hidden=BodyOcclusion(shell,front,gamePart)
    leaf=CloneSurface(front,gamePart,'Game_RelaxedFrontLeafV10')
    lip=CloneSurface(sources['StudyV7_JacketTuckLip'],gamePart,'Game_TurnedClothLipV10')
    records=[Limit(shell,budget-352,True),Limit(leaf,308),Limit(lip,28)]
    patch=Patch(sources['Pack_V9RepairPatch'],gamePart,leaf)
    records.append({'object':patch.name,'triangles':Triangles(patch)})
    mat=bpy.data.materials.get('Material_GameClothClayV10') or bpy.data.materials.new('Material_GameClothClayV10')
    mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.40,.37,.31,1)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
    for obj in (shell,leaf,lip,patch):
        obj.data.materials.clear();obj.data.materials.append(mat)
        for p in obj.data.polygons:p.material_index=0
        if not obj.data.uv_layers:obj.data.uv_layers.new(name='SurfaceUV')
        obj['GameGenerator']='SichuanGameBundleV10'
    total=sum(Triangles(o)for o in (shell,leaf,lip,patch));assert total<=budget,(total,budget)
    return {'triangles':total,'budget':budget,'objects':records,'hiddenFrontFacesRemoved':hidden,
            'currentV10Envelope':True,'noHistoricalRebuild':True}
