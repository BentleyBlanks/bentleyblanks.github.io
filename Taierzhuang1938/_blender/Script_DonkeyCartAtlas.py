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
        if label=='Cart' and sourceName.startswith('CartFloorPlank') and face.normal.z<-.5:value=3
        attribute.data[face.index].value=value

def AuthorGameUv(obj,label):
    uv=obj.data.uv_layers.get('GameUV') or obj.data.uv_layers.new(name='GameUV')
    obj.data.uv_layers.active=uv;uv.active_render=True
    if label=='Animal':
        rectangles={0:(.005,.005,.790,.990)}
        for group in range(1,6):rectangles[group]=(.805,.005+(group-1)*.198,.190,.188)
    else:
        rectangles={0:(.005,.005,.630,.990),1:(.645,.005,.350,.350),2:(.645,.365,.350,.350),3:(.645,.725,.350,.270)}
    groups=obj.data.attributes['AtlasGroup'];bpy.context.tool_settings.mesh_select_mode=(False,False,True)
    counts={}
    for group,(x,y,width,height) in rectangles.items():
        faces=[face for face in obj.data.polygons if groups.data[face.index].value==group]
        if not faces:continue
        bpy.ops.object.mode_set(mode='EDIT');bm=bmesh.from_edit_mesh(obj.data);layer=bm.faces.layers.int['AtlasGroup']
        for face in bm.faces:face.select_set(False)
        for face in bm.faces:
            if face[layer]==group:face.select_set(True)
        bm.select_flush_mode();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
        bpy.ops.uv.smart_project(angle_limit=1.1519173063,island_margin=.001 if group else .003,area_weight=.0,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        uv=obj.data.uv_layers['GameUV'];groups=obj.data.attributes['AtlasGroup']
        for face in obj.data.polygons:
            if groups.data[face.index].value!=group:continue
            for loop in face.loop_indices:
                p=uv.data[loop].uv.copy();uv.data[loop].uv=(x+p.x*width,y+p.y*height)
        counts[group]=len(faces)
    obj.data.calc_loop_triangles();coverage=0;surface=0
    for tri in obj.data.loop_triangles:
        surface+=tri.area
        a,b,c=[uv.data[i].uv for i in tri.loops]
        coverage+=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2
    if coverage<.25:raise RuntimeError('Atlas still wastes most of its area: '+label+' '+str(coverage))
    density=(2048 if label=='Animal' else 4096)*math.sqrt(coverage/surface)
    if density<(450 if label=='Animal' else 600):raise RuntimeError('Atlas does not retain sufficient close surface detail: '+label)
    obj['atlasCoverage']=coverage;obj['atlasTexelsPerMetre']=density;obj['atlasGroups']=json.dumps(counts)
    print(json.dumps({'atlas':label,'surfaceCoverage':coverage,'effectiveTexelsPerMetre':density,'groupFaces':counts}))
