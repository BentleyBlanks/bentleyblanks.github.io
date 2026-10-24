"""Self-contained high/game PBR atlases for this one articulated Type89 asset.

Run through Script_BlenderMcp.mjs, with the task's GameGray blend open. Baking
joins temporary COPIES only; exported joints and every rigid source component
remain independent. Low normals project the complete retained high source.
"""
import bpy
import bmesh
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import sys
import time
import numpy as np
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree

here=Path(__file__).resolve().parent
repoDir=here.parents[1]
sourceDir=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
reviewDir=repoDir/'Taierzhuang1938/_shots/Type89MediumTank'
assetDir=repoDir/'Taierzhuang1938/Model/Type89MediumTank'
probe=os.environ.get('TYPE89_PBR_PROBE','0')=='1'
revision=os.environ.get('TYPE89_PBR_REVISION','')
workName=(revision+'Probe' if probe else revision) if revision else ('Probe' if probe else 'Final')
probeSize=int(os.environ.get('TYPE89_PBR_PROBE_SIZE','256'))
mapDir=sourceDir/'Pbr'/workName
mapDir.mkdir(parents=True,exist_ok=True)
reviewDir.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(here))
import Script_Type89PbrMaterials as pbr
importlib.reload(pbr)
from Script_Type89GlbCleanup import CleanGlb
roles=pbr.roles
sizes={'Armor':(4096,4096,2048),'Steel':(1024,1024,512),'Track':(2048,2048,1024),'Rubber':(512,512,512),'Exhaust':(1024,1024,512),'Glass':(256,512,256),'Guard':(2048,2048,1024)}
started=time.time()
progress={'phase':'prepare','probe':probe,'completed':[],'startedUnix':started}
reports={}


def Progress(phase,**values):
    progress.update(phase=phase,elapsedSeconds=round(time.time()-started,1),**values)
    (reviewDir/('Data_Pbr'+workName+'Progress.json')).write_text(json.dumps(progress,indent=2),encoding='utf8')
    print(json.dumps({'phase':phase,**values}),flush=True)


def RoleOf(material):
    if material is None:return 'Shadow'
    return material.get('Type89Role',material.name.split('.')[0])


def UniqueMeshes(root):
    seen=set();objects=[]
    for obj in sorted(root.children_recursive,key=lambda obj:obj.name):
        if obj.type=='MESH' and obj.data not in seen:
            seen.add(obj.data);objects.append(obj)
    return objects


def Visible(obj,value):
    obj.hide_set(not value);obj.hide_render=not value


def Unwrap(objects,label):
    Progress('unwrap',quality=label)
    for obj in bpy.context.scene.objects:obj.select_set(False)
    for obj in objects:
        Visible(obj,True)
        if not obj.data.uv_layers:obj.data.uv_layers.new(name='UVMap')
        obj.data.uv_layers.active_index=0
        obj.data.uv_layers.active.active_render=True
        # The grey guard has its own preview UV name. A joined proxy otherwise
        # creates two UV channels and leaves this object's UVMap coordinates0.
        for layer in list(obj.data.uv_layers)[1:]:obj.data.uv_layers.remove(layer)
        obj.data.uv_layers.active.name='UVMap'
    bpy.context.scene.tool_settings.use_uv_select_sync=True
    bpy.context.scene.tool_settings.mesh_select_mode=(False,False,True)
    for role in roles:
        Progress('unwrap',quality=label,material=role)
        candidates=[obj for obj in objects if any(RoleOf(material)==role for material in obj.data.materials)]
        if not candidates:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in candidates:obj.select_set(True)
        bpy.context.view_layer.objects.active=candidates[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        for obj in candidates:
            bm=bmesh.from_edit_mesh(obj.data)
            for face in bm.faces:
                face.select_set(RoleOf(obj.data.materials[face.material_index])==role)
            bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.001,area_weight=.1,scale_to_bounds=False)
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.004)
        bpy.ops.object.mode_set(mode='OBJECT')
        for obj in candidates:obj.select_set(False)
    for obj in objects:Visible(obj,False)


def Proxy(objects,name):
    copies=[]
    for original in objects:
        duplicate=original.copy();duplicate.data=original.data.copy();duplicate.name='BakeCopy_'+original.name
        duplicate.parent=None
        bpy.context.scene.collection.objects.link(duplicate)
        duplicate.matrix_world=original.matrix_world.copy()
        Visible(duplicate,True);copies.append(duplicate)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    transform=obj.matrix_world.copy();obj.data.transform(transform);obj.matrix_world=Matrix.Identity(4)
    obj.name=name
    assert len(obj.data.uv_layers)==1 and obj.data.uv_layers.active.name=='UVMap','Bake proxy must have one common UV channel'
    triangulate=obj.modifiers.new('BakeOnlyTriangulation','TRIANGULATE')
    if hasattr(triangulate,'keep_custom_normals'):triangulate.keep_custom_normals=True
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.context.view_layer.update()
    return obj


def RoleProxy(source,role):
    duplicate=source.copy();duplicate.data=source.data.copy();duplicate.name='BakeSource_'+role
    bpy.context.scene.collection.objects.link(duplicate)
    bm=bmesh.new();bm.from_mesh(duplicate.data)
    # A low pressed-wheel front uses its armor atlas for the thin contact band
    # represented by separate rubber geometry in the retained high source.
    # Keep that actual source surface instead of shooting through the band.
    allowed={role,'Rubber'} if role=='Armor' else {role}
    remove=[face for face in bm.faces if RoleOf(duplicate.data.materials[face.material_index])not in allowed]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bm.to_mesh(duplicate.data);bm.free();duplicate.data.update()
    return duplicate


def ReadRawImage(path):
    image=bpy.data.images.load(str(path),check_existing=False)
    image.colorspace_settings.name='Non-Color'
    width,height=image.size
    pixels=np.empty(width*height*4,dtype=np.float32);image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height,width,4)


def RasterGuardOpacity(target,image):
    """Raster the high guard's shared punch pattern in the new low atlas.

    Bake margins dilate no-hit pixels and close small real holes. Stored sheet
    coordinates preserve those holes without sampling an unrelated surface.
    """
    mesh=target.data;mesh.calc_loop_triangles();size=image.size[0]
    material=next(mat for mat in mesh.materials if RoleOf(mat)=='Guard')
    coord=mesh.attributes.get('GuardCoord');assert coord is not None,'Guard sheet coordinates must survive proxy joining'
    uvData=mesh.uv_layers.active.data;pixels=np.zeros((size,size,4),dtype=np.float32)
    rows=material['GuardRows'];columns=material['GuardColumns'];arc=material['GuardArcLength'];length=material['GuardLength']
    half=material['GuardHoleHalf'];corner=material['GuardHoleCorner'];cellS=arc/rows;cellY=length/columns
    for triangle in mesh.loop_triangles:
        if RoleOf(mesh.materials[triangle.material_index])!='Guard':continue
        uv=np.array([uvData[loop].uv[:] for loop in triangle.loops])*size
        cs=np.array([coord.data[index].vector[:2] for index in triangle.vertices])
        a,b,c=uv;u=b-a;v=c-a;denominator=u[0]*v[1]-u[1]*v[0]
        if abs(denominator)<1e-12:continue
        minX=max(0,int(np.floor(uv[:,0].min())));maxX=min(size-1,int(np.ceil(uv[:,0].max())))
        minY=max(0,int(np.floor(uv[:,1].min())));maxY=min(size-1,int(np.ceil(uv[:,1].max())))
        yy,xx=np.mgrid[minY:maxY+1,minX:maxX+1];px=xx+.5-a[0];py=yy+.5-a[1]
        beta=(px*v[1]-py*v[0])/denominator;gamma=(u[0]*py-u[1]*px)/denominator;alpha=1-beta-gamma
        inside=(alpha>=-1e-6)&(beta>=-1e-6)&(gamma>=-1e-6)
        values=alpha[...,None]*cs[0]+beta[...,None]*cs[1]+gamma[...,None]*cs[2]
        ds=(np.mod(values[:,:,0]*rows,1)-.5)*cellS;dy=(np.mod(values[:,:,1]*columns,1)-.5)*cellY
        qx=np.abs(ds)-(half-corner);qy=np.abs(dy)-(half-corner)
        distance=np.sqrt(np.maximum(qx,0)**2+np.maximum(qy,0)**2)+np.minimum(np.maximum(qx,qy),0)-corner
        derivative=np.diag([arc,length])@np.column_stack((cs[1]-cs[0],cs[2]-cs[0]))@np.linalg.inv(np.column_stack((u,v)))
        footprint=max(np.linalg.norm(derivative[:,0]),np.linalg.norm(derivative[:,1]),1e-7)
        opacity=np.clip(.5+distance/footprint,0,1)
        block=pixels[minY:maxY+1,minX:maxX+1];block[inside,:3]=opacity[inside,None];block[inside,3]=1
    image.pixels.foreach_set(pixels.reshape(-1));image.update()
    return {'source':'same rounded punch dimensions as actual high mesh; stored sheet coordinates rastered in low UV atlas','solidTexels':int(np.count_nonzero((pixels[:,:,3]>.5)&(pixels[:,:,0]>=.5))),'holeTexels':int(np.count_nonzero((pixels[:,:,3]>.5)&(pixels[:,:,0]<.5)))}


def Barycentric(point,a,b,c):
    u=b-a;v=c-a;w=point-a
    uu=u.dot(u);uv=u.dot(v);vv=v.dot(v);wu=w.dot(u);wv=w.dot(v)
    denominator=uu*vv-uv*uv
    if abs(denominator)<1e-20:return (1,0,0)
    y=(wu*vv-wv*uv)/denominator;z=(wv*uu-wu*uv)/denominator
    return (1-y-z,y,z)


class ProjectionRepair:
    def __init__(self,high,low,role):
        self.high=high.data;self.low=low.data;self.role=role
        self.high.calc_loop_triangles();self.low.calc_loop_triangles()
        self.high.calc_tangents(uvmap=self.high.uv_layers.active.name)
        self.low.calc_tangents(uvmap=self.low.uv_layers.active.name)
        self.highTriangles=[triangle for triangle in self.high.loop_triangles if RoleOf(self.high.materials[triangle.material_index])==role]
        self.lowTriangles=[triangle for triangle in self.low.loop_triangles if RoleOf(self.low.materials[triangle.material_index])==role]
        self.bvh=BVHTree.FromPolygons([vertex.co for vertex in self.high.vertices],[tuple(triangle.vertices) for triangle in self.highTriangles],all_triangles=True)
        self.uvHigh=self.high.uv_layers.active.data;self.uvLow=self.low.uv_layers.active.data

    def Basis(self,mesh,triangle,weights):
        normal=Vector((0,0,0));tangent=Vector((0,0,0));sign=0
        for loopIndex,weight in zip(triangle.loops,weights):
            normal+=mesh.corner_normals[loopIndex].vector*weight
            tangent+=mesh.loops[loopIndex].tangent*weight
            sign+=mesh.loops[loopIndex].bitangent_sign*weight
        normal.normalize();tangent-=normal*tangent.dot(normal)
        if tangent.length<1e-8:tangent=normal.cross(Vector((0,0,1)))
        if tangent.length<1e-8:tangent=normal.cross(Vector((0,1,0)))
        tangent.normalize();bitangent=normal.cross(tangent)*(1 if sign>=0 else -1)
        return tangent,bitangent,normal

    def SampleHigh(self,point,highImage):
        def Candidates():
            yield self.bvh.find_nearest(point)
            yield from sorted(self.bvh.find_nearest_range(point,.035),key=lambda row:row[3])
        visited=set()
        for hit,_,index,distance in Candidates():
            if index is None or index in visited or distance>.035:continue
            visited.add(index)
            triangle=self.highTriangles[index]
            points=[self.high.vertices[i].co for i in triangle.vertices]
            weights=Barycentric(hit,*points)
            uv=sum((self.uvHigh[loop].uv*weight for loop,weight in zip(triangle.loops,weights)),Vector((0,0)))
            x=min(highImage.shape[1]-1,max(0,int(uv.x*highImage.shape[1])));y=min(highImage.shape[0]-1,max(0,int(uv.y*highImage.shape[0])))
            if highImage[y,x,3]>.5:return highImage[y,x].copy(),triangle,weights,float(distance)
            # Only sample padding inside this actual source triangle. A nearby
            # atlas island may belong to a completely different surface.
            radius=16
            uvTriangle=np.array([self.uvHigh[loop].uv[:] for loop in triangle.loops])*[highImage.shape[1],highImage.shape[0]]
            a,b,c=uvTriangle;u=b-a;v=c-a;denominator=u[0]*v[1]-u[1]*v[0]
            if abs(denominator)<1e-12:continue
            minX=max(0,x-radius);maxX=min(highImage.shape[1],x+radius+1);minY=max(0,y-radius);maxY=min(highImage.shape[0],y+radius+1)
            valid=np.argwhere(highImage[minY:maxY,minX:maxX,3]>.5)
            if not len(valid):continue
            px=valid[:,1]+minX+.5-a[0];py=valid[:,0]+minY+.5-a[1]
            beta=(px*v[1]-py*v[0])/denominator;gamma=(u[0]*py-u[1]*px)/denominator
            valid=valid[(beta>=-1e-5)&(gamma>=-1e-5)&(beta+gamma<=1+1e-5)]
            if not len(valid):continue
            origin=np.array([y-minY,x-minX]);nearest=valid[np.argmin(np.sum((valid-origin)**2,axis=1))]
            return highImage[minY+nearest[0],minX+nearest[1]].copy(),triangle,weights,float(distance)
        raise RuntimeError('No valid baked high surface within35mm for '+self.role+' at '+str(tuple(point)))

    def Repair(self,image,channel,force=False):
        size=image.size[0]
        buffer=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(buffer);pixels=buffer.reshape(size,size,4)
        missing=pixels[:,:,3]<.5
        if force:missing[:]=True
        highImage=ReadRawImage(mapDir/('Texture_Type89High'+self.role+channel+'.png'))
        count=0;maximumDistance=0.0
        for triangle in self.lowTriangles:
            uv=np.array([self.uvLow[loop].uv[:] for loop in triangle.loops],dtype=np.float64)*size
            minX=max(0,int(np.floor(uv[:,0].min())));maxX=min(size-1,int(np.ceil(uv[:,0].max())))
            minY=max(0,int(np.floor(uv[:,1].min())));maxY=min(size-1,int(np.ceil(uv[:,1].max())))
            if maxX<minX or maxY<minY:continue
            ys,xs=np.nonzero(missing[minY:maxY+1,minX:maxX+1]);xs+=minX;ys+=minY
            if not len(xs):continue
            a,b,c=uv;edgeA=b-a;edgeB=c-a
            denominator=edgeA[0]*edgeB[1]-edgeA[1]*edgeB[0]
            if abs(denominator)<1e-12:continue
            pointX=xs+.5-a[0];pointY=ys+.5-a[1]
            beta=(pointX*edgeB[1]-pointY*edgeB[0])/denominator
            gamma=(edgeA[0]*pointY-edgeA[1]*pointX)/denominator
            alpha=1-beta-gamma
            keep=(alpha>=-1e-6)&(beta>=-1e-6)&(gamma>=-1e-6)
            for x,y,wa,wb,wc in zip(xs[keep],ys[keep],alpha[keep],beta[keep],gamma[keep]):
                if not missing[y,x]:continue
                weights=(float(wa),float(wb),float(wc))
                point=sum((self.low.vertices[index].co*weight for index,weight in zip(triangle.vertices,weights)),Vector((0,0,0)))
                color,sourceTriangle,sourceWeights,distance=self.SampleHigh(point,highImage)
                if channel=='Normal':
                    ht,hb,hn=self.Basis(self.high,sourceTriangle,sourceWeights)
                    lt,lb,ln=self.Basis(self.low,triangle,weights)
                    encoded=Vector(tuple(color[:3]*2-1));worldNormal=(ht*encoded.x+hb*encoded.y+hn*encoded.z).normalized()
                    color[:3]=[(worldNormal.dot(axis)+1)*.5 for axis in [lt,lb,ln]]
                color[3]=1;pixels[y,x]=color;missing[y,x]=False
                count+=1;maximumDistance=max(maximumDistance,float(distance))
        # Extend only genuinely sampled texels into a narrow mip-safe gutter.
        for iteration in range(16 if not probe else 4):
            valid=pixels[:,:,3]>.5;pending=~valid;filled=0
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                shifted=np.roll(valid,(dy,dx),(0,1));shiftedPixels=np.roll(pixels,(dy,dx),(0,1))
                if dy>0:shifted[:dy]=False
                if dy<0:shifted[dy:]=False
                if dx>0:shifted[:,:dx]=False
                if dx<0:shifted[:,dx:]=False
                take=shifted&pending;pixels[take]=shiftedPixels[take];pending[take]=False;filled+=int(take.sum())
            if not filled:break
        image.pixels.foreach_set(pixels.reshape(-1));image.update()
        return {'repairedTexels':count,'maximumNearestHighDistanceM':maximumDistance,'source':'nearest actual high triangle / high baked surface, tangent frames converted for normal'}


def Image(name,size,colorSpace,default):
    image=bpy.data.images.new(name,width=size,height=size,alpha=True,float_buffer=False)
    image.generated_color=default;image.colorspace_settings.name=colorSpace
    return image


def SaveImage(image,path):
    image.file_format='PNG';image.filepath_raw=str(path);image.save()


def TransferDetailNormals(highProxy,gameProxy,gameMeshes,gameMaps,partNames=('Mesh_BowMgMount',)):
    def UvKey(uv):return (round(uv[0],7),round(uv[1],7))
    keys=set()
    for obj in gameMeshes:
        if obj.name not in partNames:continue
        for value in obj.data.uv_layers.active.data:keys.add(UvKey(value.uv))
    repair=ProjectionRepair(highProxy,gameProxy,'Armor')
    repair.lowTriangles=[triangle for triangle in repair.lowTriangles if all(UvKey(repair.uvLow[loop].uv)in keys for loop in triangle.loops)]
    assert repair.lowTriangles,'No requested detail UV triangles'
    file=Path(gameMaps['Armor']['Normal']);image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name='Non-Color'
    Progress('nearestDetailNormals',triangles=len(repair.lowTriangles),parts=list(partNames))
    result=repair.Repair(image,'Normal',force=True);SaveImage(image,file);bpy.data.images.remove(image)
    result.update(parts=list(partNames),triangles=len(repair.lowTriangles),scope='All mapped detail normal texels; nearest actual retained-high surface, unchanged35mm gate')
    reports['Game/DetailNormals']=result
    return result


def TargetNodes(materials,role,image,scratch):
    for material in materials:
        if material is None:continue
        material.use_nodes=True
        node=material.node_tree.nodes.get('Type89BakeTarget')
        if node is None:node=material.node_tree.nodes.new('ShaderNodeTexImage');node.name='Type89BakeTarget'
        node.image=image if RoleOf(material)==role else scratch
        material.node_tree.nodes.active=node;node.select=True


def BindBakedHighChannel(source,role,channel):
    # Keep colour/scalar projection tied to the retained high atlas, avoiding
    # a second evaluation of bevel-driven wear under a different ray context.
    # True geometric/bump normals still use the normal-projection pass.
    originals=[slot.material for slot in source.material_slots]
    used={polygon.material_index for polygon in source.data.polygons};materials={};images=[]
    for index in sorted(used):
        actualRole=RoleOf(originals[index])
        if actualRole not in materials:
            image=bpy.data.images.load(str(mapDir/('Texture_Type89High'+actualRole+channel+'.png')),check_existing=False)
            image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';images.append(image)
            material=bpy.data.materials.new('Material_Type89HighChannelProjection')
            material.use_nodes=True;material['Type89Role']=actualRole
            nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
            output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');texture=nodes.new('ShaderNodeTexImage')
            texture.image=image;emission.inputs['Strength'].default_value=1
            links.new(texture.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs['Emission'],output.inputs['Surface'])
            materials[actualRole]=material
        source.material_slots[index].material=materials[actualRole]
    return originals,list(materials.values()),images


def RestoreHighChannel(source,binding):
    originals,materials,images=binding
    for slot,original in zip(source.material_slots,originals):slot.material=original
    for material in materials:bpy.data.materials.remove(material)
    for image in images:bpy.data.images.remove(image)


def BakeAtlases(label,target,source,graphs,scratch,roleScope=None):
    scene=bpy.context.scene
    selectedToActive=source is not None
    allMaterials=list({material for material in target.data.materials if material})
    result={}
    for role in roleScope or roles:
        if not any(RoleOf(material)==role for material in allMaterials):continue
        roleSource=RoleProxy(source,role) if source is not None else None
        repair=ProjectionRepair(source,target,role) if source is not None else None
        repairs={}
        baseSize,normalSize,dataSize=sizes[role]
        if probe and label=='Game':
            # A source island can be narrower than one pixel in a512px data
            # atlas even though its real surface is only2mm from the receiver.
            # Keep native high-source sampling during probes; only lower the
            # game preview resolution. Never widen the35mm repair limit or
            # borrow a texel from a different source triangle to hide a miss.
            baseSize=min(baseSize,probeSize);normalSize=min(normalSize,probeSize);dataSize=min(dataSize,max(128,probeSize//2))
        rawChannels={};files={};opacity=None
        channels=['Base','Normal','Roughness','Metallic','Ao','Coverage']+(['Opacity'] if role=='Guard' else [])
        for channel in channels:
            size=baseSize if channel in ['Base','Opacity'] else (normalSize if channel=='Normal' else dataSize)
            colorSpace='sRGB' if channel=='Base' else 'Non-Color'
            baseDefaults={'Armor':(.205,.188,.091),'Steel':(.10,.12,.13),'Track':(.068,.079,.078),'Rubber':(.05,.04,.028),'Exhaust':(.05,.035,.020),'Glass':(.91,.95,.96),'Guard':(.205,.151,.075)}
            if channel in ['Coverage','Opacity']:default=(0,0,0,0)
            elif channel=='Normal':default=(.5,.5,1,0)
            elif channel=='Base':default=(*baseDefaults[role],0)
            elif channel=='Metallic':default=(0,0,0,0)
            elif channel=='Roughness':default=(.8,.8,.8,0)
            else:default=(1,1,1,0)
            image=Image('Bake_'+label+role+channel,size,colorSpace,default)
            TargetNodes(allMaterials,role,image,scratch)
            for graph in graphs.values():graph.SetBakeChannel(channel)
            binding=BindBakedHighChannel(roleSource,role,channel) if selectedToActive and channel not in ['Normal','Opacity'] else None
            bpy.ops.object.select_all(action='DESELECT')
            Visible(target,True);target.select_set(True)
            if source is not None:
                Visible(source,False);Visible(roleSource,True);roleSource.select_set(True)
            bpy.context.view_layer.objects.active=target
            scene.render.bake.use_selected_to_active=selectedToActive
            scene.render.bake.use_clear=False
            scene.render.bake.margin=16 if not probe else 4
            scene.render.bake.cage_extrusion=.009
            scene.render.bake.max_ray_distance=.035
            scene.render.bake.normal_space='TANGENT'
            scene.render.bake.target='IMAGE_TEXTURES'
            Progress('bake',quality=label,material=role,channel=channel,size=size)
            if role=='Guard' and channel=='Opacity' and selectedToActive:
                reports[label+'/GuardOpacity']=RasterGuardOpacity(target,image)
            else:
                # Thin commander lids/rims sit only millimetres apart. A22mm
                # cage projected neighbouring or reverse faces onto the game
                # edge and produced false dark chipping in Normal/AO.
                cage=.003 if selectedToActive and role=='Armor' else .022
                distance=.012 if selectedToActive and role=='Armor' else .050
                bpy.ops.object.bake(type='NORMAL' if channel=='Normal' else 'EMIT',use_selected_to_active=selectedToActive,use_clear=False,margin=0 if channel=='Opacity' else scene.render.bake.margin,cage_extrusion=cage,max_ray_distance=distance)
            if binding:RestoreHighChannel(roleSource,binding)
            file=mapDir/('Texture_Type89'+label+role+channel+'.png')
            SaveImage(image,file)
            repairedImage=None
            if repair is not None and channel not in ['Coverage','Opacity']:
                # Work on saved raw bytes for both sides, so sRGB albedo is
                # copied exactly once without a second gamma conversion.
                repairedImage=bpy.data.images.load(str(file),check_existing=False)
                repairedImage.colorspace_settings.name='Non-Color'
                Progress('repairProjection',quality=label,material=role,channel=channel)
                repairs[channel]=repair.Repair(repairedImage,channel)
                SaveImage(repairedImage,file)
            readImage=repairedImage or image
            if channel=='Opacity':
                pixels=np.empty(size*size*4,dtype=np.float32);readImage.pixels.foreach_get(pixels)
                opacity=pixels.reshape(size,size,4)[:,:,0].copy();del pixels
            elif channel in ['Roughness','Metallic','Ao']:
                pixels=np.empty(size*size*4,dtype=np.float32);readImage.pixels.foreach_get(pixels)
                rawChannels[channel]=pixels.reshape(size,size,4)[:,:,0].copy()
                del pixels
            elif channel!='Coverage':
                files[channel]=str(file)
            bpy.data.images.remove(image)
            if repairedImage is not None:bpy.data.images.remove(repairedImage)
            progress['completed'].append(label+'/'+role+'/'+channel)
        orm=Image('Bake_'+label+role+'Orm',dataSize,'Non-Color',(1,.7,0,1))
        packed=np.ones((dataSize,dataSize,4),dtype=np.float32)
        packed[:,:,0]=rawChannels['Ao'];packed[:,:,1]=rawChannels['Roughness'];packed[:,:,2]=rawChannels['Metallic']
        orm.pixels.foreach_set(packed.reshape(-1));orm.update()
        ormFile=mapDir/('Texture_Type89'+label+role+'Orm.png');SaveImage(orm,ormFile);bpy.data.images.remove(orm)
        files['Orm']=str(ormFile)
        if opacity is not None:
            baseImage=bpy.data.images.load(files['Base'],check_existing=False);baseImage.colorspace_settings.name='Non-Color'
            rgba=np.empty(baseSize*baseSize*4,dtype=np.float32);baseImage.pixels.foreach_get(rgba)
            rgba=rgba.reshape(baseSize,baseSize,4);rgba[:,:,3]=opacity
            baseImage.pixels.foreach_set(rgba.reshape(-1));baseImage.update();SaveImage(baseImage,Path(files['Base']));bpy.data.images.remove(baseImage)
        result[role]=files
        if roleSource is not None:bpy.data.objects.remove(roleSource,do_unlink=True)
        reports[label+'/'+role]=repairs
        (mapDir/'Data_ProjectionRepair.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
        Progress('atlasComplete',quality=label,material=role)
        (mapDir/('Data_'+label+'AtlasFiles.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
    for graph in graphs.values():graph.Restore()
    return result


def BakedMaterial(role,files,label):
    material=bpy.data.materials.new('Material_Type89'+label+role)
    material.use_nodes=True;material['Type89Role']=role;material['PbrChannels']='Base(sRGB), Normal(linear OpenGL), ORM(linear R=AO G=roughness B=metallic)'
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');links.new(shader.outputs[0],output.inputs['Surface'])
    if files is None:
        shader.inputs['Base Color'].default_value=(.003,.004,.004,1);shader.inputs['Roughness'].default_value=.98
        return material
    textures={}
    for channel in ['Base','Normal','Orm']:
        image=bpy.data.images.load(files[channel],check_existing=False)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';image.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=image;node.label=channel;textures[channel]=node
    links.new(textures['Base'].outputs['Color'],shader.inputs['Base Color'])
    if role=='Guard':
        cutoff=nodes.new('ShaderNodeMath');cutoff.operation='GREATER_THAN';cutoff.inputs[1].default_value=.5
        links.new(textures['Base'].outputs['Alpha'],cutoff.inputs[0]);links.new(cutoff.outputs[0],shader.inputs['Alpha'])
        material.use_backface_culling=False
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;links.new(textures['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],shader.inputs['Normal'])
    separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(textures['Orm'].outputs['Color'],separate.inputs[0]);links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    group=bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    settings=nodes.new('ShaderNodeGroup');settings.node_tree=group;links.new(separate.outputs['Red'],settings.inputs['Occlusion'])
    if role=='Glass':shader.inputs['Transmission Weight'].default_value=.88;shader.inputs['IOR'].default_value=1.50
    return material


def ClearBakeTargets(objects):
    # A targeted rebake uses the existing runtime materials as its receivers.
    # Unconnected scratch targets are not part of the editable packed PBR set.
    seen=set();removed=0
    for obj in objects:
        if obj.type!='MESH':continue
        for material in obj.data.materials:
            if material is None or material in seen or not material.use_nodes:continue
            seen.add(material);node=material.node_tree.nodes.get('Type89BakeTarget')
            if node:
                assert not any(output.is_linked for output in node.outputs),'A bake target must not drive the runtime shader'
                material.node_tree.nodes.remove(node);removed+=1
    return removed


def Assign(root,materials):
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        for slot in obj.material_slots:slot.material=materials[RoleOf(slot.material)]


def SelectRoot(root):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root]+list(root.children_recursive):Visible(obj,True);obj.select_set(True)
    bpy.context.view_layer.objects.active=root


def Export(root,path):
    # glTF's tangent export cannot evaluate n-gons. Triangulate temporary
    # shared-data copies with the same custom-normal policy as the bake proxy;
    # the editable source and its UVs/normals remain untouched.
    groups={}
    for obj in root.children_recursive:
        if obj.type=='MESH':groups.setdefault(obj.data,[]).append(obj)
    replacements=[]
    try:
        for original,objects in groups.items():
            temporary=bpy.data.objects.new('Type89ExportTriangulation',original.copy())
            bpy.context.scene.collection.objects.link(temporary)
            modifier=temporary.modifiers.new('ExportOnlyTriangulation','TRIANGULATE')
            if hasattr(modifier,'keep_custom_normals'):modifier.keep_custom_normals=True
            bpy.context.view_layer.objects.active=temporary
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            triangulated=temporary.data;bpy.data.objects.remove(temporary,do_unlink=True)
            for obj in objects:obj.data=triangulated
            replacements.append((original,triangulated,objects))
        SelectRoot(root)
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_tangents=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    finally:
        for original,triangulated,objects in replacements:
            for obj in objects:obj.data=original
            if triangulated.users==0:bpy.data.meshes.remove(triangulated)
    CleanGlb(path)


def Main():
    assert 'Type89MediumTank' in bpy.data.filepath and 'GameGray' in bpy.data.filepath,'Open this task GameGray source before PBR baking'
    assert bpy.context.scene.get('BlenderMcpTask')=='Type89MediumTank','Wrong BlenderMCP task'
    gameRoot=bpy.data.objects['Model_Type89MediumTank']
    gameFile=Path(bpy.data.filepath)
    highFile=sourceDir/'Scene_Type89MediumTankHighGray.blend'
    sourceHashes={str(file):hashlib.sha256(file.read_bytes()).hexdigest() for file in [highFile,gameFile]}
    authoringHash=hashlib.sha256((here/'Script_Type89PbrMaterials.py').read_bytes()).hexdigest()
    bakeScriptHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    Progress('appendHighSource')
    with bpy.data.libraries.load(str(highFile),link=False) as (dataFrom,dataTo):
        requested=[name for name in dataFrom.objects if name.startswith(('Model_Type89MediumTank','Node_','Mesh_'))]
        dataTo.objects=list(requested)
    highCollection=bpy.data.collections.new('Type89HighAuthoring');bpy.context.scene.collection.children.link(highCollection)
    highObjects={}
    for original,obj in zip(requested,dataTo.objects):
        if obj is None:continue
        highCollection.objects.link(obj);obj.name='High_'+original;highObjects[original]=obj
    highRoot=highObjects['Model_Type89MediumTank']
    assert gameRoot['geometryVersion']==highRoot['geometryVersion'],'High/game geometry versions differ'
    assert gameRoot.get('geometryRecipeSha256') and gameRoot['geometryRecipeSha256']==highRoot.get('geometryRecipeSha256'),'Rebuild both gray sources from the same geometry recipe before baking'
    bpy.context.view_layer.update()
    gameMeshes=UniqueMeshes(gameRoot);highMeshes=UniqueMeshes(highRoot)
    for obj in gameMeshes:
        for slot in obj.material_slots:
            if RoleOf(slot.material)=='Guard':
                shader=next(node for node in slot.material.node_tree.nodes if node.type=='BSDF_PRINCIPLED')
                for link in list(shader.inputs['Alpha'].links):slot.material.node_tree.links.remove(link)
                shader.inputs['Alpha'].default_value=1.0
    for obj in [gameRoot]+list(gameRoot.children_recursive):Visible(obj,False)
    for obj in highObjects.values():Visible(obj,False)
    bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=4 if probe else 16
    for obj in bpy.context.scene.objects:
        if obj.get('ReviewOnly') or obj.name.startswith(('Studio','Light_')):obj.hide_render=True
    graphs=pbr.BuildAuthoringMaterials()
    for obj in highMeshes:
        for slot in obj.material_slots:slot.material=graphs[RoleOf(slot.material)].material
    Progress('surfaceAttributes',objects=len(highMeshes))
    pbr.PrepareSurfaceAttributes(highMeshes,samples=6 if probe else 16,onObject=lambda name,count:Progress('surfaceAttributes',object=name,objectCount=count,objectTotal=len(highMeshes)),allObjects=list(highObjects.values()))
    Unwrap(highMeshes,'High');Unwrap(gameMeshes,'Game')
    highProxy=Proxy(highMeshes,'BakeProxy_High');gameProxy=Proxy(gameMeshes,'BakeProxy_Game')
    for obj in highObjects.values():Visible(obj,False)
    for obj in [gameRoot]+list(gameRoot.children_recursive):Visible(obj,False)
    scratch=Image('Type89Scratch',32,'Non-Color',(0,0,0,1))
    workFile=sourceDir/('Scene_Type89MediumTankPbr'+workName+'Work.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(workFile))
    Visible(gameProxy,False)
    highMaps=BakeAtlases('High',highProxy,None,graphs,scratch)
    gameMaps=BakeAtlases('Game',gameProxy,highProxy,graphs,scratch)
    TransferDetailNormals(highProxy,gameProxy,gameMeshes,gameMaps)
    highMats={role:BakedMaterial(role,highMaps.get(role),'High') for role in roles+['Shadow']}
    gameMats={role:BakedMaterial(role,gameMaps.get(role),'Game') for role in roles+['Shadow']}
    Assign(highRoot,highMats);Assign(gameRoot,gameMats)
    for graph in graphs.values():
        node=graph.nodes.get('Type89BakeTarget')
        if node:graph.nodes.remove(node)
    for proxy in [gameProxy,highProxy]:bpy.data.objects.remove(proxy,do_unlink=True)
    for obj in highObjects.values():Visible(obj,False)
    for obj in [gameRoot]+list(gameRoot.children_recursive):Visible(obj,True)
    scene=bpy.context.scene;scene['Type89Stage']='PbrProbe' if probe else 'Pbr';scene['Type89Quality']='Game'
    gameRoot['acceptance']='PBR_PROBE' if probe else 'PBR_PENDING_VISUAL_REVIEW'
    for obj in scene.objects:
        if obj.get('ReviewOnly') or obj.name.startswith(('Studio','Light_')):obj.hide_render=False
    gameOutput=reviewDir/('Model_Type89MediumTankGamePbr'+('Probe' if probe else '')+'.glb')
    Export(gameRoot,gameOutput)
    gameBlend=sourceDir/('Scene_Type89MediumTankGamePbr'+('Probe' if probe else '')+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(gameBlend))
    # Save an independent editable high source and a complete high PBR export.
    for obj in [gameRoot]+list(gameRoot.children_recursive):bpy.data.objects.remove(obj,do_unlink=True)
    for original,obj in highObjects.items():obj.name=original;Visible(obj,True)
    highRoot['acceptance']='PBR_PROBE' if probe else 'PBR_PENDING_VISUAL_REVIEW'
    scene['Type89Quality']='High'
    bpy.data.orphans_purge(do_recursive=True)
    highOutput=reviewDir/('Model_Type89MediumTankHighPbr'+('Probe' if probe else '')+'.glb')
    Export(highRoot,highOutput)
    highBlend=sourceDir/('Scene_Type89MediumTankHighPbr'+('Probe' if probe else '')+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(highBlend))
    exportedDir=sourceDir/'Exports';exportedDir.mkdir(exist_ok=True)
    (exportedDir/highOutput.name).write_bytes(highOutput.read_bytes())
    assert all(hashlib.sha256(Path(file).read_bytes()).hexdigest()==digest for file,digest in sourceHashes.items()),'Gray source changed during the bake; do not promote this candidate'
    assert hashlib.sha256((here/'Script_Type89PbrMaterials.py').read_bytes()).hexdigest()==authoringHash,'Authoring material script changed during the bake'
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==bakeScriptHash,'PBR bake script changed during the bake'
    if not probe:
        assetDir.mkdir(parents=True,exist_ok=True)
        (assetDir/'Model_Type89MediumTank.glb').write_bytes(gameOutput.read_bytes())
        (exportedDir/gameOutput.name).write_bytes(gameOutput.read_bytes())
    report={'probe':probe,'elapsedSeconds':time.time()-started,'highBlend':str(highBlend),'gameBlend':str(gameBlend),'highGlb':str(highOutput),'gameGlb':str(gameOutput),'highMaps':highMaps,'gameMaps':gameMaps,'gameDataProjection':'BakedHighBaseAndScalarChannels; Armor target retains actual HighRubber contact surfaces; geometric/bump normals projected independently','exportBasis':'ExplicitMikkTangents_TemporarySharedTriangulationCopies','projectionRepairs':reports,'detailNormalTransfer':reports.get('Game/DetailNormals'),'geometryVersion':highRoot['geometryVersion'],'geometryRecipeSha256':highRoot['geometryRecipeSha256'],'geometrySourceSha256':sourceHashes[str(highFile)],'gameGeometrySourceSha256':sourceHashes[str(gameFile)],'materialAuthoringScriptSha256':authoringHash,'bakeScriptSha256':bakeScriptHash,'materialAccepted':False,'scope':'restored Tsuchiura car; micro-wear and unobserved interiors are explicitly inferred'}
    (reviewDir/('Data_Pbr'+workName+'Build.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
    Progress('complete',report=str(reviewDir/('Data_Pbr'+workName+'Build.json')))


if __name__=='__main__':
    try:Main()
    except Exception as error:
        Progress('error',error=str(error))
        raise
