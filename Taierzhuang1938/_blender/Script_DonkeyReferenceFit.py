"""Measured three-view fit; retain the pure animal and its 28-bone rig."""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Curve(rows,value):
    if value<=rows[0][0]:return rows[0][1]
    if value>=rows[-1][0]:return rows[-1][1]
    for a,b in zip(rows,rows[1:]):
        if a[0]<=value<=b[0]:
            t=(value-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t

def NormalizeReferenceSkinWeights(skin):
    changed=0;maximum=0
    for vertex in skin.data.vertices:
        row=sorted(((g.group,g.weight) for g in vertex.groups if g.weight>1e-8),key=lambda item:-item[1]);maximum=max(maximum,len(row));row=row[:4];total=sum(w for _,w in row)
        if total<1e-8:raise RuntimeError('Unweighted reference skin vertex: '+str(vertex.index))
        if len(vertex.groups)>4 or abs(total-1)>1e-6:
            for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
            for group,weight in row:skin.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
            changed+=1
    return {'trimmedVertices':changed,'maximumBefore':maximum,'maximumAfter':max(len(v.groups) for v in skin.data.vertices),'method':'strongest four source influences normalized before groom sampling and animation export'}

def RebuildBreast(skin,rig):
    # Preserve the connected skin and its weights. A boolean over the old open
    # nostril/leg seams subdivides distant faces into nonmanifold overlaps.
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        radius=1-(x/.155)**2-((z-.80)/.205)**2
        if radius<=0:continue
        weight=Smooth(.55,.65,y)*(1-Smooth(.79,.87,y))
        target=.60+.155*math.sqrt(radius)
        vertex.co.y+=max(0,target-y)*weight
    skin.data.update()
    adjacency=[set() for vertex in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    for iteration in range(18):
        points=[v.co.copy() for v in skin.data.vertices]
        for vertex in skin.data.vertices:
            x,y,z=vertex.co
            breast=Smooth(.40,.52,y)*(1-Smooth(.79,.88,y))*Smooth(.51,.62,z)*(1-Smooth(.96,1.06,z))
            limb=sum(g.weight for g in vertex.groups if skin.vertex_groups[g.group].name.startswith(('DonkeyFront','DonkeyRear')))
            seam=limb*Smooth(.40,.47,z)*(1-Smooth(.58,.65,z))
            strength=max(breast,seam)*.30
            if strength<.01 or not adjacency[vertex.index]:continue
            mean=sum((points[i] for i in adjacency[vertex.index]),Vector())/len(adjacency[vertex.index])
            vertex.co=points[vertex.index].lerp(mean,strength)
    skin.data.update()
    # The obscured sternum has dark chest fur, grading into the pale underside.
    colors=skin.data.color_attributes['CoatColor']
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        patch=Smooth(.60,.66,y)*Smooth(.59,.64,z)*(1-Smooth(.96,1.04,z))
        if patch<=0:continue
        light=.20*(1-Smooth(.64,.74,z))
        value=Vector((.035,.032,.027)).lerp(Vector((.18,.17,.15)),light)
        old=Vector(colors.data[vertex.index].color[:3]);colors.data[vertex.index].color=(*old.lerp(value,patch),1)
    for vertex in skin.data.vertices:
        row=sorted(((g.group,g.weight) for g in vertex.groups),key=lambda item:item[1],reverse=True)[:4];total=sum(w for _,w in row)
        if total<1e-8:
            skin.vertex_groups['DonkeyThoraxPivot'].add([vertex.index],1,'REPLACE');continue
        if len(vertex.groups)>4 or abs(total-1)>1e-6:
            for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
            for group,weight in row:skin.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
    return 0

def ReferencePigment(skin,anchor):
    original='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png'
    guide=str(Path(bpy.context.scene['DonkeySourceRoot'])/'Image_NakedAnatomyGuide.png')
    arrays=[]
    for path in (original,guide):
        image=bpy.data.images.load(path,check_existing=True);width,height=image.size
        arrays.append(np.array(image.pixels[:],dtype=np.float32).reshape(height,width,4)[::-1,:,:3])
    maskNamespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyReferenceMasks.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),maskNamespace)
    occlusion=maskNamespace['BuildOcclusionWeights']()
    viewNamespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyReferenceViews.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),viewNamespace)
    viewSampler=viewNamespace['BuildViewSampler'](skin)
    ppm=(925-302)/1.10;colors=skin.data.color_attributes['CoatColor'];used=0
    eyeObject=bpy.data.objects['DonkeyEyeLeft'];eyeMatrix=skin.parent.matrix_world.inverted()@eyeObject.matrix_world
    eye=sum((eyeMatrix@v.co for v in eyeObject.data.vertices),Vector())/len(eyeObject.data.vertices);eye.x=abs(eye.x)
    def Sample(array,u,v,radius=2):
        height,width,_=array.shape;ix=int(round(u*width/1536));iy=int(round(v*height/1024))
        if not 3<ix<width-3 or not 3<iy<height-3:return None
        return np.median(array[iy-radius:iy+radius+1,ix-radius:ix+radius+1].reshape(-1,3),axis=0)
    for vertex in skin.data.vertices:
        x,y,z=vertex.co;n=vertex.normal;v=925-ppm*z;viewWeights=viewSampler(vertex.co,n)
        views=[('Side',707-ppm*(y-anchor),viewWeights.x,Vector((-abs(n.x),n.y,n.z)),Vector((-.4,.5,.76)).normalized()),
               ('Front',156.5-ppm*x,viewWeights.y,Vector((-n.x,abs(n.y),n.z)),Vector((-.3,.5,.81)).normalized()),
               ('Rear',1394+ppm*x,viewWeights.z,Vector((-n.x,-abs(n.y),n.z)),Vector((.3,-.5,.81)).normalized())]
        total=0;value=Vector()
        for name,u,weight,normal,light in views:
            if weight<.02:continue
            limits=(335,1217) if name=='Side' else (34,280) if name=='Front' else (1225,1518)
            if not limits[0]<u<limits[1] or not 30<v<925:continue
            padSample=Smooth(1.235,1.285,y)*(1-Smooth(.940,.965,z))
            rgb=Sample(arrays[0],u,v,12 if padSample>.25 else 2)
            blend=float(occlusion[name][int(round(v)),int(round(u))])
            if blend>0:
                bare=Sample(arrays[1],u,v,7)
                if bare is not None and rgb is not None:rgb=rgb*(1-blend)+bare*blend
            if rgb is None or float(np.mean(rgb))>.66:continue
            linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
            irradiance=.55+.45*max(0,normal.dot(light));albedo=np.clip(linear/irradiance*.42,.008,.48)
            value+=Vector(albedo)*weight;total+=weight
        if total<.05:continue
        old=Vector(colors.data[vertex.index].color[:3]);mix=.60 if y>.90 else .82
        nasalPad=Smooth(1.235,1.285,y)*(1-Smooth(.940,.965,z))
        mix=max(mix,.96*nasalPad)
        if abs(abs(x)-eye.x)<.055 and abs(y-eye.y)<.045 and abs(z-eye.z)<.035:mix=.20
        colors.data[vertex.index].color=(*old.lerp(value/total,mix),1);used+=1
    return used


def RefreshFlow(skin,rig,collection):
    inverse=rig.matrix_world.inverted();repeat=.45
    project=Path(bpy.context.scene['DonkeyCartProject']);flowNamespace={};topologyNamespace={}
    for file,namespace in (('Script_DonkeyCoatFlow.py',flowNamespace),('Script_DonkeyTopology.py',topologyNamespace)):
        exec(compile((project/'_blender'/file).read_text(encoding='utf-8'),file,'exec'),namespace)
    bm=bmesh.new();bm.from_mesh(skin.data)
    orientation=topologyNamespace['OrientComponents'](bm)
    topology={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),
              'windingConflicts':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'mainVolumeM3':orientation['components'][0]['volumeM3']}
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    for obj in collection.all_objects:
        if obj.type!='MESH' or obj.name=='DonkeyShortCoatCards':continue
        source=obj.data.uv_layers.get('CoatFlowUV')
        if not source:continue
        detail=obj.data.uv_layers.get('FurDetailUV');transform=inverse@obj.matrix_world
        cache={}
        for face in obj.data.polygons:
            normal=transform.to_3x3()@face.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
            material=obj.data.materials[face.material_index]
            furry=material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur','DonkeyCartEarInterior'))
            centre=sum((transform@obj.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
            limbMass=sum(sum(g.weight for g in obj.data.vertices[i].groups if obj.vertex_groups[g.group].name.startswith(('DonkeyFront','DonkeyRear'))) for i in face.vertices)/len(face.vertices)
            appearance=obj.data.attributes.get('LimbAppearanceMass')
            if appearance:limbMass=sum(sum(appearance.data[i].color) for i in face.vertices)/len(face.vertices)
            leg=obj.name=='DonkeyThinTail' or (centre.z<.75 and limbMass>.65)
            for loop in face.loop_indices:
                vertex=obj.data.loops[loop].vertex_index;key=(vertex,axis,leg)
                if key not in cache:
                    p=transform@obj.data.vertices[vertex].co
                    coordinate=flowNamespace['FlowCoordinates'](p,repeat,leg) if axis==0 else (p.x/repeat,-p.z/repeat) if axis==1 else (p.x/repeat,-p.y/repeat)
                    coordinate=(coordinate[0]+.37,coordinate[1]+.19)
                    cache[key]=coordinate
                coordinate=cache[key]
                source.data[loop].uv=coordinate
                if detail:detail.data[loop].uv=coordinate if furry else (.003,.003)
    return {'method':'integrated side-flow chart with anatomical leg charts','repeatM':repeat,'triangulatedSkin':False,'topology':topology}

def SeatMane(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    inverse=rig.matrix_world.inverted()
    for obj in list(bpy.data.collections['DonkeyEditable'].objects):
        if obj.type!='MESH':continue
        transform=inverse@obj.matrix_world;back=transform.inverted()
        vertices=list(obj.data.vertices)
        if obj.name.startswith('DonkeyManeFineFibres'):
            for start in range(0,len(vertices),12):
                group=vertices[start:start+12]
                if len(group)!=12:continue
                root=sum((transform@group[i].co for i in (0,1,6,7)),Vector())/4
                hit,normal,_,_=tree.ray_cast(Vector((root.x,root.y,2)),Vector((0,0,-1)),2)
                if hit is None:continue
                delta=hit+normal*.0004-root
                for vertex in group:vertex.co=back@(transform@vertex.co+delta)
        elif obj.name.startswith(('DonkeyDenseManeBase','DonkeyForelock')):
            stride=6 if obj.name.startswith('DonkeyDenseManeBase') else len(vertices)
            for start in range(0,len(vertices),stride):
                group=vertices[start:start+stride];root=sum((transform@v.co for v in group[:min(4,len(group))]),Vector())/min(4,len(group))
                hit,normal,_,_=tree.ray_cast(Vector((root.x,root.y,2)),Vector((0,0,-1)),2)
                if hit is None:continue
                delta=hit-normal*(.003 if stride==6 else 0)-root
                for vertex in group:vertex.co=back@(transform@vertex.co+delta)
        obj.data.update()

def SeatEars(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    inverse=rig.matrix_world.inverted();offsets={}
    for side in ('Left','Right'):
        ear=bpy.data.objects['DonkeyPinna'+side];transform=inverse@ear.matrix_world
        points=[transform@v.co for v in ear.data.vertices];low=min(p.z for p in points);high=max(p.z for p in points)
        roots=[p for p in points if p.z<low+.012];centre=sum(roots,Vector())/len(roots)
        hit,_,_,_=tree.ray_cast(Vector((centre.x,centre.y,2)),Vector((0,0,-1)),2)
        if hit is None:continue
        delta=hit.z-.003-centre.z;offsets[side]=delta
        for name in ('DonkeyPinna'+side,'DonkeyRolledEarRim'+side):
            obj=bpy.data.objects[name];matrix=inverse@obj.matrix_world;back=matrix.inverted()
            for vertex in obj.data.vertices:
                p=matrix@vertex.co;t=max(0,min(1,(p.z-low)/(high-low)))
                p.z+=delta*(1-t);vertex.co=back@p
            obj.data.update()
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    for side,delta in offsets.items():
        bone=rig.data.edit_bones['DonkeyEar'+side+'Pivot'];bone.head.z+=delta;bone.tail.z+=delta
    bpy.ops.object.mode_set(mode='OBJECT')
    return offsets

def CloseHeadCavities(skin):
    bm=bmesh.new();bm.from_mesh(skin.data)
    for face in bm.faces:
        if 'NostrilInterior' in skin.data.materials[face.material_index].name:face.material_index=0
    edges={e for e in bm.edges if e.is_boundary and all(v.co.y>1.10 and v.co.z>.80 for v in e.verts)}
    groups=[]
    while edges:
        seed=edges.pop();vertices={*seed.verts};component={seed};stack=list(seed.verts)
        while stack:
            vertex=stack.pop()
            for edge in vertex.link_edges:
                if edge in edges:
                    edges.remove(edge);component.add(edge)
                    for other in edge.verts:
                        if other not in vertices:vertices.add(other);stack.append(other)
        if all(sum(e in component for e in v.link_edges)==2 for v in vertices):groups.append((component,vertices))
    deform=bm.verts.layers.deform.verify();head=skin.vertex_groups['DonkeyHeadPivot'].index
    material=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartNostrilInterior'))
    closed=[]
    for component,vertices in groups:
        if len(vertices)>180:continue
        centre=sum((v.co for v in vertices),Vector())/len(vertices)
        if centre.z>1.10:continue
        normal=Vector((-1 if centre.x<0 else 1,.75,.05)).normalized()
        ordered=[];current=next(iter(vertices));previous=None
        while current not in ordered:
            ordered.append(current);neighbours=[e.other_vert(current) for e in current.link_edges if e in component and e.other_vert(current)!=previous]
            if not neighbours:break
            previous,current=current,neighbours[0]
        if len(ordered)!=len(vertices):continue
        inner=[]
        for vertex in ordered:
            point=bm.verts.new(centre+(vertex.co-centre)*.72);point[deform][head]=1;inner.append(point)
        for i in range(len(ordered)):
            face=bm.faces.new((ordered[i],ordered[(i+1)%len(ordered)],inner[(i+1)%len(inner)],inner[i]));face.material_index=0;face.smooth=True
        face=bm.faces.new(tuple(reversed(inner)));face.material_index=0;face.smooth=True
        closed.append({'vertices':len(vertices),'centre':list(centre)})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update()
    return closed

def RebuildNostrils(skin):
    project=Path(bpy.context.scene['DonkeyCartProject']);file=project/'_blender/Script_DonkeyNasalEnvelope.py';namespace={}
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    return namespace['RebuildWrappedNostrils'](skin)


def FairNasalSurface(skin,cavities):
    points=[v.co.copy() for v in skin.data.vertices];maximum=0
    protected={i for f in skin.data.polygons if 'NostrilInterior' in skin.data.materials[f.material_index].name for i in f.vertices}
    for cavity in cavities:
        centre=Vector(cavity['centre']);sign=-1 if centre.x<0 else 1
        normal=Vector((sign*.68,.73,.05)).normalized();u=Vector((0,0,1)).cross(normal).normalized();v=normal.cross(u).normalized()
        samples=[];depths=[];near=[]
        for index,p in enumerate(points):
            if index in protected:continue
            delta=p-centre;a=delta.dot(u);b=delta.dot(v);depth=delta.dot(normal);radius=math.hypot(a,b)
            if abs(depth)>.030:continue
            if .032<radius<.062:
                samples.append((1,a/.05,b/.05,(a/.05)**2,(a*b/.0025),(b/.05)**2));depths.append(depth)
            if radius<.045:near.append((index,a,b,depth,radius))
        if len(samples)<12:raise RuntimeError('Insufficient surrounding muzzle surface for nasal repair')
        matrix=np.array(samples);values=np.array(depths)
        penalty=np.diag((0,0,0,.25,.25,.25))
        coefficients=np.linalg.lstsq(np.vstack((matrix,penalty)),np.concatenate((values,np.zeros(6))),rcond=None)[0]
        for index,a,b,depth,radius in near:
            row=np.array((1,a/.05,b/.05,(a/.05)**2,a*b/.0025,(b/.05)**2))
            wanted=float(row@coefficients);delta=max(-.022,min(.022,wanted-depth))*(1-Smooth(.022,.045,radius))
            skin.data.vertices[index].co+=normal*delta;maximum=max(maximum,abs(delta))
    skin.data.update();return {'maxDisplacementM':maximum,'method':'quadratic fairing from intact surrounding muzzle'}

def FitEarContours(rig):
    image=bpy.data.images.load('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png',check_existing=True)
    width,height=image.size;pixels=np.array(image.pixels[:],dtype=np.float32).reshape(height,width,4)[::-1,:,:3]
    inverse=rig.matrix_world.inverted();ppm=(925-302)/1.10
    for side,sign in (('Left',-1),('Right',1)):
        objects=[bpy.data.objects['DonkeyPinna'+side],bpy.data.objects['DonkeyRolledEarRim'+side]]
        points={};edges=[]
        for obj in objects:
            matrix=inverse@obj.matrix_world;points[obj]=[matrix@v.co for v in obj.data.vertices]
            edges.extend((points[obj][e.vertices[0]],points[obj][e.vertices[1]]) for e in obj.data.edges)
        cache={}
        for obj in objects:
            back=(inverse@obj.matrix_world).inverted()
            for vertex,p in zip(obj.data.vertices,points[obj]):
                v=int(round(925-ppm*p.z))
                if not 30<v<185:continue
                key=round(p.z,4)
                if key not in cache:
                    cross=[a.x+(b.x-a.x)*(p.z-a.z)/(b.z-a.z) for a,b in edges if min(a.z,b.z)<=p.z<=max(a.z,b.z) and abs(a.z-b.z)>1e-6]
                    # Exclude the central forelock from the ear silhouette.
                    lo,hi=(58,132) if sign>0 else (185,256)
                    row=np.mean(pixels[v-3:v+4,lo:hi],axis=2)<.69
                    selected=np.where(np.sum(row,axis=0)>=4)[0]+lo
                    if len(cross)<2 or len(selected)<4:cache[key]=None
                    else:
                        target=sorted(((156.5-float(selected[0]))/ppm,(156.5-float(selected[-1]))/ppm))
                        cache[key]=(min(cross),max(cross),*target)
                bounds=cache[key]
                if bounds is None or bounds[1]-bounds[0]<.006:continue
                low,high,targetLow,targetHigh=bounds
                t=(p.x-low)/(high-low);wanted=targetLow+t*(targetHigh-targetLow)
                p=p.copy();p.x+=max(-.025,min(.025,wanted-p.x))*Smooth(30,48,v)*(1-Smooth(162,185,v));vertex.co=back@p
            obj.data.update()

def TailAndMouth(rig,collection):
    inverse=rig.matrix_world.inverted();tail=bpy.data.objects['DonkeyThinTail']
    hair=next(m for m in bpy.data.materials if m.name.startswith('DonkeyCartDarkHair'))
    tail.data.materials.clear();tail.data.materials.append(next(m for m in bpy.data.materials if m.name.startswith('DonkeyCartFaceFur')))
    pigment=tail.data.color_attributes.get('CoatColor') or tail.data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
    for value in pigment.data:value.color=(.020,.019,.018,1)
    matrix=inverse@tail.matrix_world;back=matrix.inverted();vertices=list(tail.data.vertices)
    original=[matrix@v.co for v in vertices];rootY=sum(p.y for p in original[:8])/8
    profile=[(.38,-.160),(.49,-.165),(.65,-.170),(.80,-.165),(.91,-.147),(.99,rootY)]
    for start in range(0,len(vertices),8):
        ring=original[start:start+8];centre=sum(ring,Vector())/len(ring);delta=Curve(profile,centre.z)-centre.y
        for vertex,p in zip(vertices[start:start+8],ring):vertex.co=back@(p+Vector((0,delta,0)))
    tail.data.update()
    bm=bmesh.new();bm.from_mesh(tail.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(tail.data);bm.free();tail.data.update()
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    bone=rig.data.edit_bones['DonkeyTailTipPivot'];bone.head.y=Curve(profile,bone.head.z);bone.tail=bone.head+Vector((0,.075,0))
    bpy.ops.object.mode_set(mode='OBJECT')
    stemPoints=[inverse@tail.matrix_world@v.co for v in tail.data.vertices]
    for obj in list(collection.objects):
        if obj.name.startswith('DonkeyTailFibre'):bpy.data.objects.remove(obj,do_unlink=True)
    rng=__import__('random').Random(19381025);vertices=[];faces=[];rows=[]
    for strand in range(260):
        z=rng.uniform(.80,.91);nearest=sorted(stemPoints,key=lambda p:abs(p.z-z))[:12];centre=sum(nearest,Vector())/len(nearest);centre.z=z
        angle=rng.uniform(0,2*math.pi);root=centre+Vector((math.cos(angle),math.sin(angle),0))*rng.uniform(.003,.009)
        endZ=rng.uniform(.28,.47);spread=.022+.030*Smooth(.28,.44,endZ)
        end=root+Vector((rng.uniform(-spread,spread),rng.uniform(-.060,.010),endZ-z))
        middle=root.lerp(end,.55)+Vector((rng.uniform(-.006,.006),-.004,0))
        for axis in (Vector((1,0,0)),Vector((0,1,0))):
            start=len(vertices)
            for i,p in enumerate((root,middle,end)):
                width=.00085*(1-i/2)+.00018*i/2;vertices.extend([p-axis*width,p+axis*width])
                row={'DonkeyTailPivot':.35*(1-i/2),'DonkeyTailTipPivot':.65+.35*i/2};rows.extend([row,row])
            faces.extend([(start,start+1,start+3,start+2),(start+2,start+3,start+5,start+4)])
    mesh=bpy.data.meshes.new('DonkeyTailFineFibres');mesh.from_pydata(vertices,[],faces);mesh.materials.append(hair);mesh.update()
    obj=bpy.data.objects.new('DonkeyTailFineFibres',mesh);collection.objects.link(obj);obj.parent=rig
    for i,row in enumerate(rows):
        for name,weight in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([i],weight,'REPLACE')
    modifier=obj.modifiers.new('DonkeyTailSkin','ARMATURE');modifier.object=rig
    return {'tailFineStrands':260,'tailStemProfile':profile,'brushEndRangeM':[.28,.47],'mouthInterior':False}

def RefineReferenceHooves(skin):
    """Round the existing horn rings, preserving their rigid planted soles."""
    owners=skin.data.attributes['FootOwner'];records={}
    for owner in range(1,5):
        points=[v for v in skin.data.vertices if owners.data[v.index].value==owner]
        bottom=[v.co.copy() for v in points if v.co.z<.006]
        centre=sum(bottom,Vector())/len(bottom)
        for vertex in points:
            p=vertex.co;z=p.z
            if z>=.145:continue
            # A shorter coronet, inset heel and small rounded bearing edge.
            taper=1-Smooth(.075,.145,z)
            p.z=.0004+(z-.0004)*(1-.17*taper)
            # Raise the coronet without altering the existing standing rim.
            p.z+=.11*(z-.0004)*taper*Smooth(.006,.018,z)
            p.y+=.010*Smooth(.015,.065,z)*taper
            p.x=centre.x+(p.x-centre.x)*(.94+.06*Smooth(.04,.10,z))
            bevel=(1-Smooth(.0004,.006,z))*.0025
            radial=Vector((p.x-centre.x,p.y-centre.y,0))
            if radial.length>1e-6:p-=radial.normalized()*bevel
            p.z+=.0015*(min(1,abs(p.x-centre.x)/.043)**4)*(1-Smooth(.006,.018,z))
        records[str(owner)]={'soleMinZ':min(v.co.z for v in points),'rigidSolePreserved':True}
    skin.data.update()
    return {'method':'rounded existing horn rings, fuller coronet and inset heel; existing standing rim and rigid hoof weights preserved','coronetHeightGainFactor':.11,'contactRimProtectedBelowM':.006,'feet':records}

def CalibrateCoatPigment(skin):
    colors=skin.data.color_attributes['CoatColor'];changed=0
    factors=Vector((1.50,1.58,1.80))
    for vertex in skin.data.vertices:
        x,y,z=vertex.co;value=Vector(colors.data[vertex.index].color[:3]);brightness=sum(value)/3
        dark=1-Smooth(.06,.16,brightness);bodyGain=1.27 if y<.90 else 1
        for i in range(3):value[i]*=bodyGain*(1-dark)+factors[i]*dark
        pale=Smooth(.06,.18,sum(value)/3)
        height=Smooth(.52,.60,z)*(1-Smooth(.74,.80,z))
        abdomen=Smooth(-.065,.035,y)*(1-Smooth(.515,.655,y))
        belly=pale*height*abdomen;value*=1+.80*belly;value.y*=1-.03*belly;value.z*=1-.06*belly
        colors.data[vertex.index].color=(*[min(.65,c) for c in value],1);changed+=1
    muzzle=CalibrateMuzzlePigment(skin)
    return {'vertices':changed,'darkLinearFactors':list(factors),'bodyPaleGain':1.27,'bellyPaleGain':1.80,'bellyPaleTint':[1,.97,.94],'muzzle':muzzle,
            'basis':'matched neutral studio illumination and visible original three-view coat patches'}

def CalibrateMuzzlePigment(skin):
    colors=skin.data.color_attributes['CoatColor'];changed=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co;value=Vector(colors.data[vertex.index].color[:3])
        pale=Smooth(.06,.18,sum(value)/3)
        weight=pale*Smooth(1.10,1.22,y)*Smooth(.915,.955,z)*(1-Smooth(1.045,1.11,z))
        central=1-Smooth(.025,.060,abs(x));gain=1.70+1.50*central
        tint=(1,1.01,1.10)
        pad=Smooth(1.235,1.285,y)*(1-Smooth(.935,.965,z))
        if weight<=0 and pad<=0:continue
        neutral=Vector((.090,.070,.058))
        value=Vector([min(.80,value[i]*(1+(gain*tint[i]-1)*weight)) for i in range(3)]).lerp(neutral,pad)
        colors.data[vertex.index].color=(*value,1);changed+=1
    return {'vertices':changed,'sideGain':1.70,'centralGain':3.20,'centralFalloffM':[.025,.060],'lowerLipFadeZ':[.915,.955],'tint':[1,1.01,1.10],'nasalPadLinearRgb':[.090,.070,.058],'maxAlbedo':.80}

def RefineFiberAlbedo(base):
    # Read the immutable V3 image, so rerunning cannot compound contrast.
    source=Path(bpy.context.scene.get('DonkeyReferenceInputRoot','C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261023'))/'SourceTextures/Texture_DonkeyCoatDetailBase.png'
    original=bpy.data.images.load(str(source),check_existing=False)
    width,height=original.size;pixels=np.array(original.pixels[:],dtype=np.float32).reshape(height,width,4)
    bpy.data.images.remove(original)
    rgb=pixels[:,:,:3];linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    value=np.clip(.55+(linear-.55)*2.0,.18,.94)
    pixels[:,:,:3]=np.where(value<=.0031308,value*12.92,1.055*value**(1/2.4)-.055)
    texture=bpy.data.images['Texture_DonkeyCoatDetailBase'];texture.pixels.foreach_set(pixels.ravel())
    (base/'SourceTextures').mkdir(exist_ok=True)
    texture.filepath_raw=str(base/'SourceTextures/Texture_DonkeyCoatDetailBase.png');texture.file_format='PNG';texture.save()
    content=Path(texture.filepath_raw).read_bytes()
    # pack() without data retains an existing packed payload after save().
    texture.pack(data=content,data_len=len(content))

def FinishFurResponse(rig,collection):
    path='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png'
    image=bpy.data.images.load(path,check_existing=True);width,height=image.size
    pixels=np.array(image.pixels[:],dtype=np.float32).reshape(height,width,4)[::-1,:,:3];ppm=(925-302)/1.10
    inverse=rig.matrix_world.inverted()
    for side in ('Left','Right'):
        obj=bpy.data.objects['DonkeyPinna'+side];transform=inverse@obj.matrix_world;colors=obj.data.color_attributes['CoatColor']
        for vertex in obj.data.vertices:
            p=transform@vertex.co;u=int(round(156.5-ppm*p.x));v=int(round(925-ppm*p.z))
            if not 34<u<280 or not 24<v<215:continue
            rgb=np.median(pixels[v-2:v+3,u-2:u+3].reshape(-1,3),axis=0)
            if float(np.mean(rgb))>.65:continue
            linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
            colors.data[vertex.index].color=(*np.clip(linear*.60,.012,.24),1)
    # Preserve the generated strand pattern while restoring enough local
    # contrast to read as coarse short fur at the reference's viewing scale.
    RefineFiberAlbedo(Path(bpy.context.scene['DonkeySourceRoot']))
    materials={m for obj in collection.objects if obj.type=='MESH' for m in obj.data.materials if m}
    for material in materials:
        if not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur','DonkeyCartEarInterior')):continue
        shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Roughness'].default_value=.82;shader.inputs['Specular IOR Level'].default_value=.24
        for node in material.node_tree.nodes:
            if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.8
        if shader.inputs.get('Sheen Weight'):
            shader.inputs['Sheen Weight'].default_value=.035;shader.inputs['Sheen Roughness'].default_value=.80
            shader.inputs['Sheen Tint'].default_value=(.16,.14,.12,1)


def RefineEyes(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    inverse=rig.matrix_world.inverted();reports=[]
    eyeRadiusU,eyeRadiusV,eyeRadiusN=.0245,.011,.0075
    centreOffset=-.0015;openingU,openingV=.0235,.0095
    for side,sign in (('Left',-1),('Right',1)):
        eye=bpy.data.objects['DonkeyEye'+side];matrix=inverse@eye.matrix_world
        centre=sum((matrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices)
        normal=Vector((sign*.78,.62,.03)).normalized();axis=Vector((0,0,1)).cross(normal).normalized();up=normal.cross(axis).normalized()
        tilt=-sign*math.radians(12);axis=(axis*math.cos(tilt)+up*math.sin(tilt)).normalized();up=normal.cross(axis).normalized()
        hit,_,_,_=tree.ray_cast(centre+normal*.1,-normal,.2)
        centre=hit+normal*centreOffset
        def Cornea(du,dv):
            depth=eyeRadiusN*math.sqrt(max(.0001,1-(du/eyeRadiusU)**2-(dv/eyeRadiusV)**2))
            point=centre+axis*du+up*dv+normal*depth
            surfaceNormal=(axis*(du/eyeRadiusU**2)+up*(dv/eyeRadiusV**2)+normal*(depth/eyeRadiusN**2)).normalized()
            return point,surfaceNormal,depth
        # Rebuild the dark aperture around its actual surface centre. The
        # inherited object origin predates the head fit and cannot locate lids.
        vertices=[];faces=[];segments=32;rings=16
        for i in range(rings+1):
            latitude=-math.pi/2+math.pi*i/rings
            for j in range(segments):
                angle=2*math.pi*j/segments
                vertices.append(centre+axis*(eyeRadiusU*math.cos(latitude)*math.cos(angle))+up*(eyeRadiusV*math.sin(latitude))+normal*(eyeRadiusN*math.cos(latitude)*math.sin(angle)))
                if i:
                    a=(i-1)*segments+j;b=(i-1)*segments+(j+1)%segments;c=i*segments+(j+1)%segments;d=i*segments+j
                    faces.append((a,b,c,d))
        matrix=inverse@eye.matrix_world;back=matrix.inverted();mesh=eye.data
        mesh.clear_geometry();mesh.from_pydata([back@p for p in vertices],[],faces);mesh.update()
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
        for face in mesh.polygons:face.use_smooth=True
        for group in eye.vertex_groups:group.remove(list(range(len(mesh.vertices))))
        group=eye.vertex_groups.get('DonkeyHeadPivot') or eye.vertex_groups.new(name='DonkeyHeadPivot')
        group.add(list(range(len(mesh.vertices))),1,'REPLACE')
        shader=mesh.materials[0].node_tree.nodes.get('Principled BSDF')
        pigment=mesh.color_attributes.get('EyePigment') or mesh.color_attributes.new(name='EyePigment',type='FLOAT_COLOR',domain='POINT')
        for vertex in mesh.vertices:
            delta=matrix@vertex.co-centre;du=delta.dot(axis);dv=delta.dot(up)
            pupil=1-Smooth(.8,1.1,(du/.0185)**2+(dv/.0043)**2)
            value=Vector((.014,.008,.004)).lerp(Vector((.002,.0015,.001)),pupil)
            pigment.data[vertex.index].color=(*value,1)
        paint=shader.id_data.nodes.get('ReferenceEyePigment') or shader.id_data.nodes.new('ShaderNodeVertexColor')
        paint.name='ReferenceEyePigment';paint.layer_name='EyePigment'
        shader.id_data.links.new(paint.outputs['Color'],shader.inputs['Base Color'])
        shader.inputs['Roughness'].default_value=.20;shader.inputs['Specular IOR Level'].default_value=.50
        for name in ('DonkeyPaleEyeRing'+side,'DonkeyEyelidMargin'+side):
            obj=bpy.data.objects[name];matrix=inverse@obj.matrix_world;back=matrix.inverted()
            if 'PaleEyeRing' in name:
                if len(obj.data.vertices)!=120:raise RuntimeError('Unexpected orbital ring topology')
                colors=obj.data.color_attributes['CoatColor']
                for vertex in obj.data.vertices:
                    row=vertex.index//40;angle=2*math.pi*(vertex.index%40)/40
                    rx,rz=[(.0238,.0098),(.033,.021),(.043,.032)][row]
                    p=centre+axis*(rx*math.cos(angle))+up*(rz*math.sin(angle))
                    hit,_,_,_=tree.ray_cast(p+normal*.05,-normal,.13)
                    if row==0:
                        point,surfaceNormal,_=Cornea(rx*math.cos(angle),rz*math.sin(angle))
                        vertex.co=back@(point+surfaceNormal*.00035)
                    elif hit is not None:vertex.co=back@(hit+normal*(.0013+(.0012*max(0,math.sin(angle)) if row==1 else 0)))
                    shade=[.14,.065,.027][row]*(1+1.15*max(0,math.sin(angle)))
                    colors.data[vertex.index].color=(shade,shade*.93,shade*.79,1)
            if 'EyelidMargin' in name:
                vertices=list(obj.data.vertices)
                if len(vertices)!=240:raise RuntimeError('Unexpected eyelid margin topology')
                for start in range(0,len(vertices),6):
                    ring=vertices[start:start+6];angle=2*math.pi*(start//6)/40
                    du,dv=openingU*math.cos(angle),openingV*math.sin(angle);point,surfaceNormal,depth=Cornea(du,dv)
                    derivativeU,derivativeV=-openingU*math.sin(angle),openingV*math.cos(angle)
                    derivativeN=-eyeRadiusN**2*(du*derivativeU/eyeRadiusU**2+dv*derivativeV/eyeRadiusV**2)/max(.00001,depth)
                    tangent=(axis*derivativeU+up*derivativeV+normal*derivativeN).normalized();across=tangent.cross(surfaceNormal).normalized()
                    radius=.0010+.0005*max(0,math.sin(angle));point+=surfaceNormal*.0003
                    for j,vertex in enumerate(ring):
                        theta=2*math.pi*j/6;vertex.co=back@(point+radius*(surfaceNormal*math.cos(theta)+across*math.sin(theta)))
                bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
                if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
                bm.to_mesh(obj.data);bm.free()
            obj.data.update()
        reports.append({'side':side,'centre':list(centre),'radiiM':[eyeRadiusU,eyeRadiusV,eyeRadiusN],'centreOffsetM':centreOffset,'nominalCornealApexM':centreOffset+eyeRadiusN,'lidOpeningRadiiM':[openingU,openingV]})
    material=next(m for m in bpy.data.materials if m.name.startswith('DonkeyCartEyelid'))
    shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.025,.018,.012,1);shader.inputs['Roughness'].default_value=.72;shader.inputs['Specular IOR Level'].default_value=.18
    return {'version':'ReferenceEyeWrapV1','method':'seated cornea with eyelid margin and inner orbital fur following the actual ellipsoid surface','eyes':reports}

def SeatMouthSeam(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    obj=bpy.data.objects['DonkeyMouthSeam'];matrix=rig.matrix_world.inverted()@obj.matrix_world;back=matrix.inverted();vertices=list(obj.data.vertices)
    for start in range(0,len(vertices),6):
        ring=vertices[start:start+6];centre=sum((matrix@v.co for v in ring),Vector())/len(ring)
        point,normal,_,_=tree.find_nearest(centre-Vector((0,0,.025)))
        delta=point+normal*.0004-centre
        for vertex in ring:vertex.co=back@(matrix@vertex.co+delta)
    obj.data.update()
    for material in obj.data.materials:
        shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value=(.015,.012,.009,1);shader.inputs['Roughness'].default_value=.95;shader.inputs['Specular IOR Level'].default_value=.08

def InstallNasalPad(skin):
    material=bpy.data.materials.get('DonkeyNasalPad') or bpy.data.materials.new('DonkeyNasalPad');material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=.72;shader.inputs['Specular IOR Level'].default_value=.22
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(.75,.75,.75,1)
    links.new(paint.outputs['Color'],multiply.inputs[1]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    geometry=nodes.new('ShaderNodeNewGeometry');noise=nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value=180;noise.inputs['Detail'].default_value=2
    links.new(geometry.outputs['Position'],noise.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.25;bump.inputs['Distance'].default_value=.001
    links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    slot=skin.data.materials.find(material.name)
    if slot<0:skin.data.materials.append(material);slot=len(skin.data.materials)-1
    faces=0
    if bpy.context.scene.get('DonkeyMuzzleRevision'):
        coatSlot=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartGreyCoat'))
        for face in skin.data.polygons:
            if skin.data.materials[face.material_index].name.startswith('DonkeyNasalPad'):face.material_index=coatSlot
    for face in skin.data.polygons:
        name=skin.data.materials[face.material_index].name
        if not name.startswith(('DonkeyCartGreyCoat','DonkeyCartFaceFur')):continue
        centre=sum((skin.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
        selected=centre.y>1.292 and .887<centre.z<.963 if bpy.context.scene.get('DonkeyMuzzleRevision') else centre.y>1.230 and centre.z<.963
        if selected:face.material_index=slot;faces+=1
    if not faces:raise RuntimeError('No nasal pad surface was selected')
    return {'material':material.name,'faces':faces,'roughness':.72,'normal':'fine 0.25 mm procedural skin relief baked on UV0; no coarse repeated fibre normal','pigment':'full reference RGB for the V14 nasal pad; fur retained on the chin and posterior muzzle','region':{'minimumY':1.292,'heightM':[.887,.963]} if bpy.context.scene.get('DonkeyMuzzleRevision') else {'minimumY':1.230,'maximumZ':.963}}



def ApplyReferenceFit(scene,base):
    if scene.get('DonkeyReferenceFitRevision'):raise RuntimeError('Reference fit requires the preserved V3 source')
    rig=bpy.data.objects['DonkeyRig'];skin=bpy.data.objects['DonkeyContinuousSkin'];collection=bpy.data.collections['DonkeyEditable']
    rig.data.pose_position='REST';scene.frame_set(0);bpy.context.view_layer.update()
    inverse=rig.matrix_world.inverted()
    sourceBones={bone.name:bone.head_local.copy() for bone in rig.data.bones}
    feet={}
    for front in ('Front','Rear'):
        for side in ('Left','Right'):
            stem='Donkey'+front+side;group=skin.vertex_groups[stem+'HoofPivot'].index
            points=[v.co.copy() for v in skin.data.vertices if v.co.z<.035 and any(g.group==group and g.weight>.98 for g in v.groups)]
            feet[stem]=sum(points,Vector())/len(points)
    anchor=feet['DonkeyFrontLeft'].y
    legZ=[(0,0),(.18,.18),(.38,.375),(.39,.38),(.73,.70),(.94,.93),(1.1,1.08),(1.6,1.57)]
    headZ=[(.80,.80),(.95,.915),(1.10,1.06),(1.245,1.191),(1.355,1.31),(1.60,1.57)]
    width=[(0,1.29),(.04,1.29),(.10,1.14),(.20,1.0),(.40,1.0),(.50,.82),(.60,.92),(.70,1.25),(.80,1.30),(.90,1.20),(1.0,1.15),(1.10,.98),(1.25,1.0),(1.60,1.0)]
    top=[(-.30,-.01),(-.05,.004),(.15,.020),(.30,.033),(.45,.026),(.60,-.036),(.72,-.020),(.88,0)]
    longitudinal=[(-.40,-.22),(-.32,-.20),(-.26,-.18),(-.15,-.09),(-.05,.005),(.15,.185),(.30,.33),(.60,.615),(.69,.69),(.90,.90),(1.50,1.50)]
    def Field(p,row,name='',bone=False):
        x,y,z=p;result=p.copy()
        masses={stem:sum(w for key,w in row.items() if key.startswith(stem)) for stem in feet}
        limb=min(1,sum(masses.values()))
        posterior=1-Smooth(-.05,.12,y)
        yDelta=(Curve(longitudinal,y)-y)*(1-.65*Smooth(.92,1.00,z)*posterior)
        result.y+=yDelta
        low=1-Smooth(.45,.74,z)
        result.y+=masses['DonkeyFrontRight']*.055*(1-Smooth(.18,.91,z))
        result.y+=masses['DonkeyRearRight']*.155*low
        result.y+=masses['DonkeyRearLeft']*.025*math.exp(-((z-.38)/.11)**2)
        trunk=Smooth(-.22,-.05,y)*(1-Smooth(.53,.69,y))
        belly=.035*trunk*(1-Smooth(.64,.82,z))*Smooth(.40,.53,z)
        result.z+=(Curve(top,y)*Smooth(.94,1.07,z)+belly)*(1-limb)
        result.z+=.065*(1-Smooth(.12,.30,y))*Smooth(-.18,-.07,y)*Smooth(.58,.66,z)*(1-Smooth(.83,.94,z))*(1-limb*.8)
        result.z+=.015*Smooth(-.20,-.08,y)*(1-Smooth(.58,.75,y))*Smooth(1.00,1.08,z)*(1-limb)
        result.z=result.z*(1-limb)+Curve(legZ,z)*limb
        # Restore a rounded sternum instead of the old remapped central fold.
        breast=(1-Smooth(.045,.13,abs(x)))*Smooth(.43,.57,y)*(1-Smooth(.77,.89,y))*Smooth(.54,.64,z)*(1-Smooth(.86,.98,z))
        head=Smooth(.90,1.03,y)*Smooth(.84,1.02,z)
        earOwner=next((key for key,w in row.items() if key.startswith('DonkeyEar') and w>.5),None)
        if name.startswith(('DonkeyPinna','DonkeyRolledEarRim','DonkeyEar')) or earOwner:
            t=Smooth(1.31,1.59,z);right='Right' in (earOwner or name)
            result.x=x*1.12-(1 if x>0 else -1)*.014*t;result.y=y+.020-(.055 if right else .010)*t
            result.z=Curve([(.90,.90),(1.28,1.25),(1.335,1.295),(1.59,1.580),(1.7,1.690)],z)
            if right:result.z-=.002*t
            result.y+=.029*(1-t)+.013*t;result.z-=.015*t
        else:
            scale=Curve(width,z)
            skull=Curve([(.85,1.25),(1.10,1.05),(1.20,.98),(1.245,1.18),(1.36,1.18),(1.7,1.04)],z)
            muzzle=Smooth(1.19,1.28,y)*(1-Smooth(1.10,1.20,z))
            headScale=skull*(1-muzzle)+1.02*muzzle
            result.x=x*(scale*(1-head)+headScale*head)
            desiredY=1.124+.80*(y-1.1028)+.020*Smooth(1.27,1.35,z)
            result.y=result.y*(1-head)+desiredY*head
            result.z=result.z*(1-head)+Curve(headZ,z)*head
            result.z-=.018*Smooth(1.15,1.24,y)*(1-Smooth(.94,1.02,z))
            forward=Smooth(.94,1.08,y)*Smooth(.83,.96,z)
            result.y+=forward*Curve([(.84,.014),(.98,.014),(1.12,.029),(1.7,.029)],z)
        topMask=Smooth(.96,1.08,result.z)
        caudal=Smooth(.005,.095,result.y)*(1-Smooth(.12,.27,result.y))*topMask
        result.y-=.040*caudal
        result.z+=.008*math.exp(-((result.y-.070)/.050)**2)*topMask
        result.z+=.014*Smooth(.22,.32,result.y)*(1-Smooth(.62,.74,result.y))*topMask
        if not bone and z<.20 and limb>.8:
            owner=max(masses,key=masses.get)
            result.y+=(y-feet[owner].y)*.20*(1-Smooth(.10,.20,z))*limb
        return result
    moved=[];objects=[obj for obj in collection.all_objects if obj.type=='MESH']
    for obj in objects:
        transform=inverse@obj.matrix_world;back=transform.inverted()
        for vertex in obj.data.vertices:
            p=transform@vertex.co;row={obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
            target=Field(p,row,obj.name);vertex.co=back@target
            if obj==skin:moved.append((target-p).length)
        obj.data.update()
    neckNamespace={}
    project=Path(scene['DonkeyCartProject'])
    exec(compile((project/'_blender/Script_DonkeyNeckRebuild.py').read_text(encoding='utf-8'),'Script_DonkeyNeckRebuild.py','exec'),neckNamespace)
    neckLoft=neckNamespace['RebuildNeck'](skin,rig,objects)
    # Use translation-only rest frames, preserving the analytic gait solver's
    # documented +Y local bone axes while moving every physical joint.
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in rig.data.edit_bones:
        target=Field(sourceBones[bone.name],{bone.name:1},bone.name,True)
        if bone.name=='DonkeyRoot':target=sourceBones[bone.name]
        bone.head=target;bone.tail=target+Vector((0,.075,0))
    bpy.ops.object.mode_set(mode='OBJECT')
    hoofRefinement=RefineReferenceHooves(skin)
    hoofNamespace={}
    exec(compile((project/'_blender/Script_DonkeyHoofSurface.py').read_text(encoding='utf-8'),'Script_DonkeyHoofSurface.py','exec'),hoofNamespace)
    hoofRefinement['surface']=hoofNamespace['RefineHoofSurface'](skin)
    chestTriangles=RebuildBreast(skin,rig)
    topologyNamespace={}
    exec(compile((project/'_blender/Script_DonkeyTopology.py').read_text(encoding='utf-8'),'Script_DonkeyTopology.py','exec'),topologyNamespace)
    topologyNamespace['RemoveLegacyNasalShells'](skin)
    cavities=CloseHeadCavities(skin);nasalFairing=FairNasalSurface(skin,cavities)
    faceNamespace={}
    exec(compile((project/'_blender/Script_DonkeyFaceSculpt.py').read_text(encoding='utf-8'),'Script_DonkeyFaceSculpt.py','exec'),faceNamespace)
    faceSculpt=faceNamespace['RefineReferenceFace'](skin,rig)
    nostrils=RebuildNostrils(skin)
    topology=topologyNamespace['RepairReferenceSkin'](skin)
    abdomenNamespace={}
    exec(compile((project/'_blender/Script_DonkeyAbdomenFit.py').read_text(encoding='utf-8'),'Script_DonkeyAbdomenFit.py','exec'),abdomenNamespace)
    abdomenFit=abdomenNamespace['FitReferenceAbdomen'](skin,anchor)
    bm=bmesh.new();bm.from_mesh(skin.data);orientation=topologyNamespace['OrientComponents'](bm)
    topology['mainVolumeM3']=orientation['components'][0]['volumeM3'];topology['flippedFaces']+=orientation['flippedFaces']
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    legNamespace={}
    exec(compile((project/'_blender/Script_DonkeyLegSections.py').read_text(encoding='utf-8'),'Script_DonkeyLegSections.py','exec'),legNamespace)
    bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_DonkeyBeforeLimbFit.blend'))
    legFit=legNamespace['FitReferenceLegs'](skin,rig)
    upperBodyNamespace={}
    exec(compile((project/'_blender/Script_DonkeyUpperBody.py').read_text(encoding='utf-8'),'Script_DonkeyUpperBody.py','exec'),upperBodyNamespace)
    upperBodyFit=upperBodyNamespace['FitUpperBody'](scene,skin)
    chestNamespace={}
    exec(compile((project/'_blender/Script_DonkeyChest.py').read_text(encoding='utf-8'),'Script_DonkeyChest.py','exec'),chestNamespace)
    chestFit=chestNamespace['FitReferenceChest'](scene,skin,rig)
    SeatMane(skin,rig);earOffsets=SeatEars(skin,rig);FitEarContours(rig);details=TailAndMouth(rig,collection)
    details['upperBodyFit']=upperBodyFit
    details['chest']=chestFit
    details['legFit']=legFit
    details['hooves']=hoofRefinement
    details['faceSculpt']=faceSculpt
    details['abdomenFit']=abdomenFit
    hairNamespace={}
    exec(compile((project/'_blender/Script_DonkeyHair.py').read_text(encoding='utf-8'),'Script_DonkeyHair.py','exec'),hairNamespace)
    details['mane']=hairNamespace['RebuildReferenceMane'](skin,rig,collection)
    # The reference shows a staggered standing pose. Walk targets are centred
    # between the left/right feet instead of perpetuating that standing offset.
    scene['DonkeyReferenceFootCenters']=True
    scene['DonkeyReferenceFitRevision']='20261027ReferenceV51'
    scene['DonkeyReferenceBodyTuftLimit']=288
    scene['DonkeyReferencePaleFringe']=True
    scene['DonkeyReferenceForeSwingClearanceDeg']=2.5
    scene['DonkeyReferenceForeRightSwingClearanceDeg']=6.0
    scene['DonkeyReferenceFineTail']=True
    scene['DonkeyReferenceFitAnchorY']=anchor
    # Repaint the short pale muzzle rather than the old long horse-like blaze.
    colors=skin.data.color_attributes['CoatColor']
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        head=Smooth(.96,1.10,y)*Smooth(.80,.94,z)
        if not head:continue
        muzzleTop=.995+.045*math.exp(-(x/.040)**2)
        jawBoundary=Curve([(.86,1.11),(.94,1.17),(.99,1.22),(1.06,1.27)],z)
        pale=Smooth(jawBoundary-.030,jawBoundary+.030,y)*(1-Smooth(muzzleTop-.018,muzzleTop+.025,z))
        baseColor=Vector((.027,.026,.023));muzzle=Vector((.28,.27,.245))
        value=baseColor.lerp(muzzle,pale);old=Vector(colors.data[vertex.index].color[:3])
        colors.data[vertex.index].color=(*old.lerp(value,head),1)
    muzzleNamespace={}
    exec(compile((project/'_blender/Script_DonkeyMuzzle.py').read_text(encoding='utf-8'),'Script_DonkeyMuzzle.py','exec'),muzzleNamespace)
    details['muzzle']=muzzleNamespace['ApplyReferenceMuzzle'](scene,skin,rig)
    projected=ReferencePigment(skin,anchor);colorCalibration=CalibrateCoatPigment(skin)
    details['eyes']=RefineEyes(skin,rig)
    eyeNamespace={}
    exec(compile((project/'_blender/Script_DonkeyEyes.py').read_text(encoding='utf-8'),'Script_DonkeyEyes.py','exec'),eyeNamespace)
    details['eyes']['socketFit']=eyeNamespace['ApplyReferenceEyeSockets'](scene,skin,rig)
    tailRootNamespace={}
    exec(compile((project/'_blender/Script_DonkeyTailRoot.py').read_text(encoding='utf-8'),'Script_DonkeyTailRoot.py','exec'),tailRootNamespace)
    details['tailRoot']=tailRootNamespace['ApplyReferenceTailRoot'](scene,skin,rig)
    details['muzzle']['integrity']=muzzleNamespace['CheckMuzzleIntegrity'](skin)
    details['appearanceOwnership']=chestNamespace['CacheLimbAppearance'](skin)
    details['skinWeightCanonicalization']=NormalizeReferenceSkinWeights(skin)
    details['pectoralBinding']=chestNamespace['BindReferencePectorals'](scene,skin)
    details['pectoralEdges']=chestNamespace['ApplyPectoralEdges'](scene,skin)
    limbTopology={};file=project/'_blender/Script_DonkeyLimbTopology.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),limbTopology)
    details['axillaryTopology']=limbTopology['FinishAxillaryTopology'](scene,skin)
    hindNamespace={};file=project/'_blender/Script_DonkeyHindFit.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),hindNamespace)
    details['hindBinding']=hindNamespace['BindReferenceHindLegs'](scene,skin,rig)
    headNamespace={};file=project/'_blender/Script_DonkeyHeadFit.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),headNamespace)
    details['headFit']=headNamespace['ApplyReferenceHead'](scene,skin,rig,collection)
    tipNamespace={};file=project/'_blender/Script_DonkeyEarTips.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),tipNamespace)
    details['earTips']=tipNamespace['RefineEarTips'](scene,rig)
    details['postHeadOrbitalIntegrity']=eyeNamespace['CheckOrbitalIntegrity'](skin)
    details['muzzle']['integrity']=muzzleNamespace['CheckMuzzleIntegrity'](skin)
    limbSurface={};file=project/'_blender/Script_DonkeyLimbSurface.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),limbSurface)
    details['limbSurface']=limbSurface['FairReferenceLegSurfaces'](scene,skin)
    forearmNamespace={};file=project/'_blender/Script_DonkeyForearmCollar.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),forearmNamespace)
    details['forearmCollars']=forearmNamespace['FitForearmCollars'](scene,skin)
    details['hindBinding']['harmonicRoots']=hindNamespace['HarmonicHindRoots'](skin,.25,.96,1.03)
    details['hindBinding']['pasterns']=hindNamespace['RigidHindPasterns'](skin)
    FinishFurResponse(rig,collection)
    jointNamespace={};file=project/'_blender/Script_DonkeyJointFit.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),jointNamespace)
    details['jointFit']=jointNamespace['ApplyJointFit'](scene,skin,rig)
    browNamespace={};file=project/'_blender/Script_DonkeyBrowFit.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),browNamespace)
    details['browHeight']=browNamespace['FitEyeHeight'](scene,skin,rig,collection)
    details['postBrowOrbitalIntegrity']=eyeNamespace['CheckOrbitalIntegrity'](skin)
    orbitalNamespace={};file=project/'_blender/Script_DonkeyOrbitalFit.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),orbitalNamespace)
    details['orbitalOrientation']=orbitalNamespace['FitOrbitalOrientation'](scene,skin,rig,collection)
    details['postOrientationOrbitalIntegrity']=eyeNamespace['CheckOrbitalIntegrity'](skin)
    eyeAspectNamespace={};file=project/'_blender/Script_DonkeyEyeAspect.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),eyeAspectNamespace)
    details['eyeAspect']=eyeAspectNamespace['FitEyeAspect'](scene,skin,rig,collection)
    details['postAspectOrbitalIntegrity']=eyeNamespace['CheckOrbitalIntegrity'](skin)
    lowerNamespace={};file=project/'_blender/Script_DonkeyLowerLimb.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),lowerNamespace)
    details['lowerLimbRelief']=lowerNamespace['RefineLowerLimbRelief'](scene,skin)
    archNamespace={};file=project/'_blender/Script_DonkeyHindArch.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),archNamespace)
    details['hindArch']=archNamespace['RoundHindArch'](scene,skin)
    details['hindArchBinding']=archNamespace['BindHindArch'](scene,skin)
    planeNamespace={};file=project/'_blender/Script_DonkeyJointPlanes.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),planeNamespace)
    details['jointPlanes']=planeNamespace['ApplyJointPlanes'](scene,skin)
    volumeNamespace={};file=project/'_blender/Script_DonkeyChestVolume.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),volumeNamespace)
    details['chestVolume']=volumeNamespace['ApplyChestVolume'](scene,skin)
    foreSilhouetteNamespace={};file=project/'_blender/Script_DonkeyForeSilhouette.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),foreSilhouetteNamespace)
    details['foreSilhouette']=foreSilhouetteNamespace['FitForeSilhouette'](scene,skin)
    hoofColumnsNamespace={};file=project/'_blender/Script_DonkeyHoofColumns.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),hoofColumnsNamespace)
    details['hoofColumns']=hoofColumnsNamespace['RoundHoofColumns'](scene,skin)
    forearmDepthNamespace={};file=project/'_blender/Script_DonkeyForearmDepth.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),forearmDepthNamespace)
    details['forearmDepth']=forearmDepthNamespace['FitForearmDepth'](scene,skin)
    forearmBindingNamespace={};file=project/'_blender/Script_DonkeyForearmBinding.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),forearmBindingNamespace)
    details['forearmBinding']=forearmBindingNamespace['BindForearmDepth'](scene,skin)
    details['nasalPad']=InstallNasalPad(skin);flowReport=RefreshFlow(skin,rig,collection)
    photoNamespace={}
    exec(compile((project/'_blender/Script_DonkeyPhotoDetail.py').read_text(encoding='utf-8'),'Script_DonkeyPhotoDetail.py','exec'),photoNamespace)
    photoDetail=photoNamespace['InstallReferenceDetail'](scene,skin,rig,collection,base)
    pigmentNamespace={}
    exec(compile((project/'_blender/Script_DonkeyReferencePigment.py').read_text(encoding='utf-8'),'Script_DonkeyReferencePigment.py','exec'),pigmentNamespace)
    photoDetail['pigmentProjection']=pigmentNamespace['InstallReferencePigment'](scene,skin,rig,base)
    legPigmentNamespace={}
    exec(compile((project/'_blender/Script_DonkeyLegPigment.py').read_text(encoding='utf-8'),'Script_DonkeyLegPigment.py','exec'),legPigmentNamespace)
    photoDetail['legPigment']=legPigmentNamespace['InstallLegPigment'](scene,skin,rig,base)
    chestPigmentNamespace={};file=project/'_blender/Script_DonkeyChestPigment.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),chestPigmentNamespace)
    photoDetail['chestPigment']=chestPigmentNamespace['InstallChestPigment'](scene,skin,base)
    hoofPigmentNamespace={};file=project/'_blender/Script_DonkeyHoofPigment.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),hoofPigmentNamespace)
    photoDetail['hoofPigment']=hoofPigmentNamespace['InstallHoofPigment'](scene,skin,base)
    earNamespace={};file=project/'_blender/Script_DonkeyEarCoat.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),earNamespace)
    photoDetail['earCoat']=earNamespace['InstallEarCoat'](scene,rig,base)
    details['skinWeights']=NormalizeReferenceSkinWeights(skin)
    previousGroom=bpy.data.objects['DonkeyShortCoatCards'];groomMaterial=previousGroom.data.materials[0]
    bpy.data.objects.remove(previousGroom,do_unlink=True)
    coatNamespace={}
    exec(compile((project/'_blender/Script_DonkeyCoat.py').read_text(encoding='utf-8'),'Script_DonkeyCoat.py','exec'),coatNamespace)
    newGroom,groomReport=coatNamespace['BuildGroom'](skin,rig,collection,groomMaterial)
    tailNamespace={}
    exec(compile((project/'_blender/Script_DonkeyTailGroom.py').read_text(encoding='utf-8'),'Script_DonkeyTailGroom.py','exec'),tailNamespace)
    details['tailGroom']=tailNamespace['RebuildTailGroom'](skin,rig,collection,groomMaterial)
    details['tailFineStrands']=details['tailGroom']['fibres'];details['brushEndRangeM']=details['tailGroom']['endHeightM']
    report={'version':scene['DonkeyReferenceFitRevision'],'referenceImage':'Image_DonkeyOriginalThreeView.png',
            'calibration':{'groundPixelY':925,'withersPixel':[749,302],'pixelsPerMetre':(925-302)/1.10,'nearForeSolePixelX':707},
            'maxSkinDisplacementM':max(moved),'meanSkinDisplacementM':sum(moved)/len(moved),'chestSurfaceAddedTriangles':chestTriangles,'referencePigmentVertices':projected,'neckLoft':neckLoft,'restoredOldNostrils':cavities,'nasalSurfaceFairing':nasalFairing,'nostrils':nostrils,'topology':topology,'earRootOffsets':earOffsets,'details':details,
            'boneCount':len(rig.data.bones),'jointHeightsM':{front:float(rig.data.bones['Donkey'+front+'LeftKneePivot'].head_local.z) for front in ('Front','Rear')},
            'standingPose':'far forefoot forward, far hindfoot forward; centred foot targets during walk',
            'shape':'broader muzzle/skull and barrel, shorter axial silhouette, corrected eye height, back/belly profile and sternum','groom':groomReport,
            'material':'visible full-RGB reference coat/face pigment with illumination compensation; anatomical apertures and hidden pixels retain calibrated fallback; independent 0.45 m fibre-normal repeat',
            'colorCalibration':colorCalibration,'flow':flowReport,'photoDetail':photoDetail,'landmarkFit':{'skullForwardM':.029,'muzzleForwardM':.014,'eyeRaiseM':.006,'midBackRaiseM':.014,'croupBackM':.040,'croupRaiseM':.008}}
    (base/'Data_ReferenceFit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
