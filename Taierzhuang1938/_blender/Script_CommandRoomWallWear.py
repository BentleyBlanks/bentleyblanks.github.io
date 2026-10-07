"""Reference wall: continuous lime/earth/masonry atlas on a shallow relief skin.

The same authored surface determines both colour and physical layer recession.
This avoids repeated radial CSG holes and an unrelated clean brick grid.
"""
import numpy as np
import bmesh
from mathutils import noise

def Boolean(ob,cutter,operation):
    bpy.context.view_layer.objects.active=ob
    mod=ob.modifiers.new('Fractured material volume','BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)

def Recalculate(ob):
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(ob.data);bm.free()

walls=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Wall')]
front=wy-.12
mortarMat=plaster  # Legacy material-batching name; no separate ochre ring mesh.
wallSurface=Material('CommandRoomWallSurface',(.69,.665,.615),.96,'CommandRoomWallSurface')
sourceImage=bpy.data.images.load(str(SOURCE/'Source/CommandRoomWallLime20261007.png'),check_existing=False)
sourceImage.colorspace_settings.name='Non-Color'
width,height=sourceImage.size
pixels=np.empty(width*height*4,dtype=np.float32);sourceImage.pixels.foreach_get(pixels)
rgb=pixels.reshape((height,width,4))[:,:,:3]
# Small-scale grain belongs in the PBR normal. The mesh carries only the
# millimetre-thick peeled lime and deeper earth/brick losses, not every pigment.
for iteration in range(5):
    rgb=(rgb*4+np.roll(rgb,1,0)+np.roll(rgb,-1,0)+np.roll(rgb,1,1)+np.roll(rgb,-1,1))/8
red,green,blue=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
luma=red*.2126+green*.7152+blue*.0722

def Smooth(low,high,value):
    t=np.clip((value-low)/(high-low),0,1)
    return t*t*(3-2*t)

earth=Smooth(.10,.23,red-blue)*(1-Smooth(.64,.77,luma))
brickLoss=(1-Smooth(.42,.59,luma))*(1-Smooth(.09,.20,red-blue))
depthField=earth*.005+brickLoss*.014

def WallUv(x,z):
    # Keep the exposure between coat and map. The window's left pier samples
    # intact plaster instead of duplicating the same brick loss beside it.
    # The UV boundary is hidden by the window jamb and the cabinet below it.
    left=-1.17;span=2.70
    u=.68+(left-x)*.17 if x<left else 1-abs(((x-left)/span)%2-1)
    v=z/3.675
    return (max(.003,min(.997,u)),max(.002,min(.998,v)))

def DepthAt(u,v):
    x=u*(width-1);y=v*(height-1);ix=int(x);iy=int(y);fx=x-ix;fy=y-iy
    return float((depthField[iy,ix]*(1-fx)+depthField[iy,min(ix+1,width-1)]*fx)*(1-fy)
        +(depthField[min(iy+1,height-1),ix]*(1-fx)+depthField[min(iy+1,height-1),min(ix+1,width-1)]*fx)*fy)

surfaceTriangles=0
for wall in walls:
    bounds=[wall.matrix_world@Vector(p) for p in wall.bound_box]
    x0=min(p.x for p in bounds);x1=max(p.x for p in bounds)
    z0=min(p.z for p in bounds);z1=max(p.z for p in bounds)
    # The opaque enclosure still blocks sunlight, behind the relief surface.
    inverse=wall.matrix_world.inverted()
    for vertex in wall.data.vertices:
        p=wall.matrix_world@vertex.co
        if abs(p.y-front)<.001:p.y+=.035;vertex.co=inverse@p
    wall.data.update()
    nx=max(1,math.ceil((x1-x0)/.025));nz=max(1,math.ceil((z1-z0)/.025))
    verts=[];uvs=[]
    for j in range(nz+1):
        z=z0+(z1-z0)*j/nz
        for i in range(nx+1):
            x=x0+(x1-x0)*i/nx;u,v=WallUv(x,z)
            waviness=noise.noise_vector(Vector((x*4,7.3,z*4)))[0]*.0007
            verts.append((x,front-.001+DepthAt(u,v)+waviness,z));uvs.append((u,v))
    stride=nx+1
    faces=[(j*stride+i,j*stride+i+1,(j+1)*stride+i+1,(j+1)*stride+i) for j in range(nz) for i in range(nx)]
    skin=Mesh('ReferenceWallSkin_'+wall.name,verts,faces,wallSurface,uvs,True)
    surfaceTriangles+=len(faces)*2
bpy.data.images.remove(sourceImage)
wallSurfaceSummary={'source':'CommandRoomWallLime20261007.png','skinTriangles':surfaceTriangles,
    'earthRecessionM':.005,'brickRecessionM':.014,'sampleSpacingM':.025,'uniquePanelWidthM':2.70}
print('Reference wall surface',wallSurfaceSummary)
