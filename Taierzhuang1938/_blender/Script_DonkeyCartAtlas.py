"""Reserve atlas space for visible anatomy and timber instead of tiny hair charts."""
import bpy,bmesh,json,math

def AssignAtlasGroup(obj,label,sourceName):
    if label=='Animal':
        if sourceName=='DonkeyContinuousSkin':group=0
        elif sourceName.startswith('DonkeyShortCoatSilhouette'):group=5
        elif sourceName.startswith(('HarnessClothCollar','HarnessCollar','HarnessPad')):group=2
        elif sourceName.startswith(('Harness','Halter')):group=3
        elif sourceName.startswith(('DonkeyMane','DonkeyDenseMane','DonkeyTail','DonkeyThinTail','DonkeyForelock')):group=4
        else:group=1
    else:
        bones={g.name for g in obj.vertex_groups}
        if 'WheelLeft' in bones:group=1
        elif 'WheelRight' in bones:group=2
        elif sourceName.startswith(('Harness','CartStakeNail','CartLongitudinalSill','CartDiagonalUnderbrace','CartTransverseAxle','CartAxleBearing')):group=3
        else:group=0
    attribute=obj.data.attributes.get('AtlasGroup') or obj.data.attributes.new('AtlasGroup','INT','FACE')
    for face in obj.data.polygons:
        value=group
        if label=='Animal' and sourceName=='DonkeyContinuousSkin' and bpy.context.scene.get('DonkeyMuzzleRevision'):
            centre=sum((obj.data.vertices[i].co.y for i in face.vertices))/len(face.vertices)
            if centre>1.21:value=6
        if label=='Animal' and sourceName=='DonkeyContinuousSkin' and bpy.context.scene.get('DonkeyReferenceLegSections'):
            stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']
            mass=[sum(g.weight for i in face.vertices for g in obj.data.vertices[i].groups if obj.vertex_groups[g.group].name.startswith(stem))/len(face.vertices) for stem in stems]
            appearance=obj.data.attributes.get('LimbAppearanceMass')
            if appearance:mass=[sum(appearance.data[i].color[c] for i in face.vertices)/len(face.vertices) for c in range(4)]
            z=sum(obj.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)
            if z<.82 and max(mass)>.35:value=8+mass.index(max(mass))
        if label=='Animal' and sourceName=='DonkeyContinuousSkin' and bpy.context.scene.get('DonkeyReferenceHornCharts') and obj.data.materials[face.material_index].name.startswith('DonkeyHoofHorn'):
            owners={obj.data.attributes['FootOwner'].data[i].value for i in face.vertices}
            if len(owners)!=1 or next(iter(owners)) not in (1,2,3,4):raise RuntimeError('Horn chart has ambiguous anatomical ownership')
            value=11+next(iter(owners))
        if label=='Cart' and sourceName.startswith('CartFloorPlank') and face.normal.z<-.5:value=3
        attribute.data[face.index].value=value

def AuthorGameUv(obj,label):
    uv=obj.data.uv_layers.get('GameUV') or obj.data.uv_layers.new(name='GameUV')
    obj.data.uv_layers.active=uv;uv.active_render=True
    if label=='Animal':
        rectangles={0:(.005,.005,.790,.990)}
        for group in range(1,6):rectangles[group]=(.805,.005+(group-1)*.198,.190,.188)
        if bpy.context.scene.get('DonkeyReferenceLegSections'):
            rectangles[0]=(.005,.005,.790,.645)
            for limb in range(4):rectangles[8+limb]=(.005+limb*.1975,.660,.190,.335)
    else:
        rectangles={0:(.005,.005,.630,.990),1:(.645,.005,.350,.350),2:(.645,.365,.350,.350),3:(.645,.725,.350,.270)}
    groups=obj.data.attributes['AtlasGroup'];bpy.context.tool_settings.mesh_select_mode=(False,False,True)
    hornCharts=label=='Animal' and bpy.context.scene.get('DonkeyReferenceHornCharts')
    if hornCharts:
        if any(value.value==5 for value in groups.data):raise RuntimeError('Horn atlas reserve is occupied by legacy silhouette cards')
        # The obsolete silhouette reserve is unused by the independent groom.
        # Four continuous wall charts retain the original leg atlas allocation.
        for foot in range(4):
            rectangles[12+foot]=(.809,.801+foot*.047,.180,.041) if bpy.context.scene.get('DonkeyReferenceBalancedHornCharts') else (.809+(foot%2)*.095,.801+(foot//2)*.094,.086,.085)
    if label=='Animal' and bpy.context.scene.get('DonkeyMuzzleRevision'):
        if any(value.value in (2,3) for value in groups.data):raise RuntimeError('Bare muzzle atlas reserve overlaps tack charts')
        rectangles[6]=(.805,.203,.190,.386)
    counts={}
    for group,(x,y,width,height) in rectangles.items():
        faces=[face for face in obj.data.polygons if groups.data[face.index].value==group]
        if not faces:continue
        if hornCharts and group in (12,13,14,15):
            coordinates=obj.data.attributes['HoofRestCoordinates']
            for face in faces:
                angles=[(math.atan2(coordinates.data[i].vector.x,coordinates.data[i].vector.y)+math.pi)/(2*math.pi) for i in face.vertices]
                crosses=max(angles)-min(angles)>.5
                for loop,angle in zip(face.loop_indices,angles):
                    if crosses and angle<.5:angle+=1
                    z=coordinates.data[obj.data.loops[loop].vertex_index].vector.z
                    u=.04+.90*angle;v=.04+.90*max(0,min(1,z/.072))
                    if not 0<=u<=1:raise RuntimeError('Horn wrap escaped its guarded chart')
                    uv.data[loop].uv=(x+u*width,y+v*height)
            counts[group]=len(faces);continue
        bpy.ops.object.mode_set(mode='EDIT');bm=bmesh.from_edit_mesh(obj.data);layer=bm.faces.layers.int['AtlasGroup']
        for face in bm.faces:face.select_set(False)
        for face in bm.faces:
            if face[layer]==group:face.select_set(True)
        bm.select_flush_mode();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
        angle=.55 if label=='Animal' and bpy.context.scene.get('DonkeyReferenceLegSections') else 1.1519173063
        bpy.ops.uv.smart_project(angle_limit=angle,island_margin=.003 if group in (0,8,9,10,11) else .001,area_weight=.0,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        uv=obj.data.uv_layers['GameUV'];groups=obj.data.attributes['AtlasGroup']
        for face in obj.data.polygons:
            if groups.data[face.index].value!=group:continue
            for loop in face.loop_indices:
                p=uv.data[loop].uv.copy();uv.data[loop].uv=(x+p.x*width,y+p.y*height)
        counts[group]=len(faces)
    if label=='Animal' and bpy.context.scene.get('DonkeyReferenceLegSections'):RepairBakeUvOverlaps(obj,rectangles)
    obj.data.calc_loop_triangles();coverage=0;surface=0
    uv=obj.data.uv_layers['GameUV']
    for tri in obj.data.loop_triangles:
        surface+=tri.area
        a,b,c=[uv.data[i].uv for i in tri.loops]
        coverage+=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2
    if coverage<.25:raise RuntimeError('Atlas still wastes most of its area: '+label+' '+str(coverage))
    density=(2048 if label=='Animal' else 4096)*math.sqrt(coverage/surface)
    if density<(450 if label=='Animal' else 600):raise RuntimeError('Atlas does not retain sufficient close surface detail: '+label)
    obj['atlasCoverage']=coverage;obj['atlasTexelsPerMetre']=density;obj['atlasGroups']=json.dumps(counts)
    print(json.dumps({'atlas':label,'surfaceCoverage':coverage,'effectiveTexelsPerMetre':density,'groupFaces':counts}))

def ScanUvOverlaps(obj):
    """Raster-test real bake texels, retaining face identity at UV overlaps."""
    import numpy as np
    mesh=obj.data;uv=mesh.uv_layers['GameUV'];groups=mesh.attributes['AtlasGroup'];size=2048
    owner=np.full((size,size),-1,dtype=np.int32);groupOwner=np.full((size,size),-1,dtype=np.int8);pairs={};legPixels=0
    for tri in mesh.loop_triangles:
        face=tri.polygon_index;group=groups.data[face].value;p=np.array([uv.data[l].uv[:] for l in tri.loops])*size
        a,b,c=p;edge=b-a;other=c-a;det=edge[0]*other[1]-edge[1]*other[0]
        if abs(det)<1e-8:continue
        lo=np.maximum(0,np.floor(p.min(axis=0)).astype(int));hi=np.minimum(size-1,np.ceil(p.max(axis=0)).astype(int))
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];dx=xx+.5-a[0];dy=yy+.5-a[1]
        v=(dx*other[1]-dy*other[0])/det;w=(edge[0]*dy-edge[1]*dx)/det
        inside=(v>.01)&(w>.01)&(v+w<.99);x=xx[inside];y=yy[inside];previous=owner[y,x];previousGroup=groupOwner[y,x]
        collision=(previous>=0)&(previous!=face)
        if np.any(collision):
            legPixels+=int(np.count_nonzero(collision&((previousGroup>=8)|(group>=8))))
            for old,count in zip(*np.unique(previous[collision],return_counts=True)):
                key=tuple(sorted((int(old),face)));pairs[key]=pairs.get(key,0)+int(count)
        owner[y,x]=face;groupOwner[y,x]=group
    report={'size':[size,size],'method':'strict triangle-interior bake-texel coverage; shared triangle diagonals of one polygon ignored',
        'overlapPairs':len(pairs),'overlapPixels':sum(pairs.values()),'legOverlapPixels':legPixels,'pairs':[{'faces':list(pair),'pixels':count} for pair,count in sorted(pairs.items(),key=lambda x:-x[1])]}
    return report

def RepairBakeUvOverlaps(obj,rectangles):
    """Split folded UV polygons into their own charts, then repack the group.

    Source material coordinates and geometry stay intact. Only bake UVs move;
    the source is re-evaluated normally at every new texel afterwards.
    """
    from pathlib import Path
    attempts=[];scene=bpy.context.scene;oldSync=scene.tool_settings.use_uv_select_sync
    try:
        scene.tool_settings.use_uv_select_sync=True
        for iteration in range(5):
            obj.data.calc_loop_triangles();report=ScanUvOverlaps(obj);attempts.append(report)
            if report['overlapPixels']==0:break
            if iteration==4:raise RuntimeError('Bake UV overlaps persist after chart splits: '+str(report))
            groups=obj.data.attributes['AtlasGroup'];bad={}
            for pair in report['pairs']:
                face=max(pair['faces']);group=groups.data[face].value;bad.setdefault(group,set()).add(face)
            for group,isolated in bad.items():
                if bpy.context.scene.get('DonkeyReferenceHornCharts') and group in (12,13,14,15):raise RuntimeError('Continuous horn chart contains overlapping bake texels: '+str(sorted(isolated)))
                x,y,width,height=rectangles[group];uv=obj.data.uv_layers['GameUV'];obj.data.uv_layers.active=uv;uv.active_render=True
                for face in obj.data.polygons:
                    if groups.data[face.index].value!=group:continue
                    for loop in face.loop_indices:
                        u,v=uv.data[loop].uv;uv.data[loop].uv=((u-x)/width,(v-y)/height)
                # Moving only offending polygons breaks their UV-edge links
                # while preserving each polygon's planar chart and density.
                for offset,index in enumerate(sorted(isolated)):
                    for loop in obj.data.polygons[index].loop_indices:uv.data[loop].uv.x+=3+offset*2
                bpy.ops.object.mode_set(mode='EDIT');bm=bmesh.from_edit_mesh(obj.data);layer=bm.faces.layers.int['AtlasGroup']
                for face in bm.faces:face.select_set(face[layer]==group)
                bm.select_flush_mode();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
                bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,shape_method='CONCAVE',udim_source='ACTIVE_UDIM')
                bpy.ops.object.mode_set(mode='OBJECT');uv=obj.data.uv_layers['GameUV'];groups=obj.data.attributes['AtlasGroup']
                for face in obj.data.polygons:
                    if groups.data[face.index].value!=group:continue
                    for loop in face.loop_indices:
                        u,v=uv.data[loop].uv;uv.data[loop].uv=(x+u*width,y+v*height)
        report={'size':attempts[-1]['size'],'method':attempts[-1]['method'],'initialOverlapPixels':attempts[0]['overlapPixels'],
            'overlapPixels':attempts[-1]['overlapPixels'],'legOverlapPixels':attempts[-1]['legOverlapPixels'],'repairPasses':len(attempts)-1,'attempts':attempts}
        (Path(scene['DonkeySourceRoot'])/'Review/Data_UvOverlapVerification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'uvOverlapVerification':report}))
    finally:scene.tool_settings.use_uv_select_sync=oldSync
