"""Unrestricted high sculpt: change the cloth mass before any game reduction."""
import math,runpy
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

cloth=runpy.run_path(str(Path(__file__).with_name('Script_SichuanSoftBundleV6.py')))
restDepth=cloth['SoftFrontDepth']
def RestWithoutEngravedStrokes(x,z,detail=0):return restDepth(x,z,0)
cloth['BuildSoftBundle'].__globals__['SoftFrontDepth']=RestWithoutEngravedStrokes
fit={'x':1,'y':1,'z':1,'cx':0,'cz':0,'bx':0,'bz':0}


def ConfigureEndRelief(path):cloth['ConfigureEndRelief'](path)


def RawShape(point):
    x,y,z=point;u=x/.19;v=z/.15;front=max(0,min(1,-y/.13))
    horizontal=sum(math.exp(-((z-band)/.020)**2) for band in (.050,-.060))
    vertical=sum(math.exp(-((x-band)/.019)**2) for band in (-.103,.089))
    side=max(0,min(1,abs(u)))**4;end=max(0,min(1,abs(v)))**5
    # Three unequal lobes expand between real constricting cross passes.
    pinch=.0048*horizontal
    loose=.0033*math.cos(z*22+.35)+.0014*math.sin(z*57-y*24)
    x+=math.copysign((loose-pinch-.0035*abs(v)**6)*side,x)
    x+=.0018*math.sin(z*15+.7)*max(0,1-u*u)*front
    # Turn the upper/lower cloth edges instead of retaining straight rails.
    z-=math.copysign((.004*vertical+.0065*abs(u)**4)*end,z)
    z+=math.copysign(.0055*max(0,1-u*u)*end,z)
    z-=.0028*front*max(0,1-abs(v)**4)*(.75+.25*math.sin(x*19))
    # A broad soft outer leaf, with a rolled border and strap indentations.
    rounding=.012*(abs(u)**4+.8*abs(v)**4)
    loft=.007*max(0,1-abs(u)**4)*max(0,1-abs(v)**4)
    # V6 already has a pressure field. Avoid adding a second quilt-like one.
    pressure=-.0008*min(1.8,horizontal+vertical)
    y+=front**2*(rounding-loft+pressure)
    return Vector((x,min(0,y),z))


def MapRest(point):
    p=RawShape(point)
    return Vector(((p.x-fit['cx'])*fit['x']-fit['bx'],p.y*fit['y'],(p.z-fit['cz'])*fit['z']-fit['bz']))


def MapBinding(point):
    result=MapRest(point)
    if point.y>0:result.y=point.y*fit['y']
    return result


def SoftFrontDepth(x,z,detail=0):
    return MapRest((x,cloth['SoftFrontDepth'](x,z,detail),z)).y


def SculptGathering(body):
    """Broad, tapering cloth ridges from edges and tie tension, not grooves."""
    count=len(body.data.vertices);positions=np.empty(count*3,dtype=np.float32);body.data.vertices.foreach_get('co',positions);positions=positions.reshape((-1,3))
    selected=(positions[:,1]<-.085)&(np.abs(positions[:,0])<.180)&(np.abs(positions[:,2])<.146)
    ids=np.flatnonzero(selected);points=positions[ids][:,[0,2]].astype(np.float64);height=np.zeros(len(ids))
    paths=[((-.180,.126),(-.166,.111),(-.143,.082),.0018,.0038),((-.183,.106),(-.172,.091),(-.149,.077),.0012,.0030),((-.183,.020),(-.170,.005),(-.143,-.016),.0015,.0035),((-.182,-.119),(-.164,-.112),(-.135,-.086),.0020,.0040),((-.178,-.135),(-.158,-.132),(-.137,-.109),.0013,.0034),((.181,.026),(.169,.015),(.148,.008),.0016,.0034),((.182,-.009),(.173,-.016),(.153,-.022),.0013,.0030),((.180,-.112),(.161,-.099),(.139,-.082),.0016,.0038),((.175,-.134),(.159,-.127),(.142,-.108),.0013,.0030),((-.073,.143),(-.051,.137),(-.033,.121),.0010,.0032),((.041,-.140),(.057,-.134),(.071,-.112),.0011,.0035)]
    for p0,p1,p2,amplitude,width in paths:
        p0=np.array(p0);p1=np.array(p1);p2=np.array(p2);best=np.full(len(ids),np.inf);signed=np.zeros(len(ids));along=np.zeros(len(ids))
        for t in np.linspace(0,1,25):
            centre=(1-t)**2*p0+2*(1-t)*t*p1+t*t*p2;tangent=2*(1-t)*(p1-p0)+2*t*(p2-p1);tangent/=max(np.linalg.norm(tangent),1e-9);normal=np.array([-tangent[1],tangent[0]])
            delta=points-centre;distance=np.sum(delta*delta,axis=1);replace=distance<best;best[replace]=distance[replace];signed[replace]=delta[replace]@normal;along[replace]=t
        fade=np.sin(np.pi*along)**.65;w=width*(.65+.35*np.sin(np.pi*along))
        ridge=np.exp(-(signed/w)**2);valley=.30*np.exp(-((signed-1.8*w)/(w*1.5))**2)
        height+=amplitude*fade*(ridge-valley)
    positions[ids,1]-=height.astype(np.float32)
    body.data.vertices.foreach_set('co',positions.ravel());body.data.update()


def BuildSoftBundle(CreateMesh,unusedDepth,material,backMaterial,foldMaterial,parent,high=False):
    # Use the full source, never the decimated game copy.
    body=cloth['BuildSoftBundle'](CreateMesh,unusedDepth,material,backMaterial,foldMaterial,parent,high=True)
    body.name='Pack_Bundle'
    for vertex in body.data.vertices:vertex.co=RawShape(vertex.co)
    xs=[v.co.x for v in body.data.vertices];ys=[v.co.y for v in body.data.vertices];zs=[v.co.z for v in body.data.vertices]
    fit.update({'x':.38/(max(xs)-min(xs)),'y':.13/abs(min(ys)),'z':.30/(max(zs)-min(zs)),'cx':(max(xs)+min(xs))/2,'cz':(max(zs)+min(zs))/2})
    for vertex in body.data.vertices:
        p=vertex.co;vertex.co=((p.x-fit['cx'])*fit['x'],p.y*fit['y'],(p.z-fit['cz'])*fit['z'])
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
    smooth=body.modifiers.new('HighClothContinuity','SUBSURF');smooth.subdivision_type='CATMULL_CLARK';smooth.levels=1;smooth.render_levels=1
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for vertex in body.data.vertices:
        if vertex.co.y>-.00015:vertex.co.y=0
    back=[v.co for v in body.data.vertices if abs(v.co.y)<1e-9]
    fit['bx']=(max(p.x for p in back)+min(p.x for p in back))/2;fit['bz']=(max(p.z for p in back)+min(p.z for p in back))/2
    for vertex in body.data.vertices:vertex.co.x-=fit['bx'];vertex.co.z-=fit['bz']
    for polygon in body.data.polygons:
        polygon.use_smooth=True
        if all(abs(body.data.vertices[i].co.y)<1e-9 for i in polygon.vertices):polygon.use_smooth=False;polygon.material_index=1
    body.data.update()
    SculptGathering(body)
    # The outer blanket leaf visibly turns back beneath the mat. A closed
    # cloth roll follows the sculpted crown instead of a hard box top edge.
    tree=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
    positions=[];coordinates=[];polygons=[];rings=[];crossCount=16
    for column in range(161):
        x=-.174+column/160*.348
        top=tree.ray_cast(Vector((x,-.095,.4)),Vector((0,0,-1)),.6)
        if top[0] is None:continue
        z=top[0].z-.0035
        frontHit=tree.ray_cast(Vector((x,-.3,z-.006)),Vector((0,1,0)),.4)
        if frontHit[0] is None:continue
        centerY=frontHit[0].y+.0035;ring=[]
        for index in range(crossCount):
            angle=index*math.tau/crossCount
            p=(x,centerY-.0045*math.cos(angle),z+.0040*math.sin(angle))
            ring.append(len(positions));positions.append(p);coordinates.append(((x+.19)/.38,(p[2]+.15)/.30))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        for index in range(crossCount):
            following=(index+1)%crossCount;polygons.append((a[index],a[following],b[following],b[index]))
    if rings:
        polygons.extend((tuple(reversed(rings[0])),tuple(rings[-1])))
        lip=CreateMesh('StudyV7_TurnedTopLeaf',positions,polygons,coordinates,material,body)
        bpy.ops.object.select_all(action='DESELECT');body.select_set(True);lip.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
    body['HighSource']=body.name;body['SichuanHighSource']=False
    body['Construction']='Unrestricted soft cloth sculpt; no decimation or per-vertex box clamping'
    return body
