"""Bake shape-aware cohesive mud and settled dust on the Type 94's existing two-material game atlases."""
from argparse import ArgumentParser
from collections import Counter
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import json
import struct

import cv2
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation

from Script_MergeType94MaterialsV112 import EncodeLossless, OpenTexture, ReadGlb, SIZE, SOLIDS, ViewBytes
from Script_VerifyType94MaterialAtlasV112 import TextureBindings

TRACK_ORIGIN = np.array((2048, 0))
TRACK_SIZE = 2048
TRACK_TILES = {
    "DampA": (2096, 2104, 512),
    "DampB": (3120, 2104, 512),
    "Crust": (1024, 2480, 512),
    "Dust": (1536, 2480, 512),
}
TRACK_GROUPS = {
    "Left": ((1, 2, "Crust"), (3, 7, "DampB"), (12, 15, "DampA"), (16, 17, "Crust"),
             (22, 25, "DampB"), (26, 27, "Crust"), (35, 36, "Crust"), (37, 43, "DampA"),
             (44, 46, "Crust"), (74, 76, "Crust"), (77, 79, "DampB")),
    "Right": ((0, 3, "DampA"), (4, 6, "Crust"), (9, 12, "DampB"), (13, 14, "Crust"),
              (25, 28, "DampA"), (32, 33, "Crust"), (37, 39, "DampB"), (41, 45, "DampA"),
              (46, 48, "Crust"), (71, 74, "Crust"), (76, 78, "DampB")),
}
BODY_GROUPS = (
    ("left drive",(-.680,.314,-1.210),(.180,.225,.321),.92),
    ("left lower forward lip",(-.613,.505,-1.256),(.169,.145,.233),.70),
    ("left running wheels",(-.676,.155,-.552),(.145,.163,.338),.65),
    ("left rear return",(-.649,.349,1.016),(.191,.242,.332),.80),
    ("left rear underside",(-.478,.451,1.205),(.301,.180,.221),.65),
    ("right drive",(.676,.249,-1.148),(.159,.181,.355),.81),
    ("right road wheels",(.683,.153,.179),(.142,.141,.428),.63),
    ("right rear return",(.668,.316,1.146),(.172,.193,.262),.80),
    ("right nose shoulder",(.432,.508,-1.263),(.348,.178,.232),.51),
)
PRESSED_PATCHES = (
    ((-.729,.304,-1.148),0,-1,(.310,.220),.41,.130),
    ((-.683,.467,-.915),0,-1,(.299,.190),-.51,.136),
    ((-.681,.349,1.072),0,-1,(.328,.249),.79,.188),
    ((-.526,.426,1.238),2,1,(.302,.235),-.44,.178),
    ((+.720,.265,-1.128),0,1,(.337,.228),-.33,.156),
    ((+.462,.490,-1.290),2,-1,(.287,.218),.57,.193),
)
BODY_PREFIXES = ("Geometry_Hull", "Geometry_Wheel", "Wheel_", "Geometry_NoseHousing",
                 "Geometry_FinalDriveHousing", "Geometry_Tow", "Geometry_Suspension")
ASSET = Path(__file__).resolve().parents[1] / "Model" / "Type94Tankette"


def Smooth(x, lo, hi):
    u = np.clip((x - lo) / (hi - lo), 0, 1)
    return u*u*(3-2*u)


def Unit(vector):
    return vector / np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-12)


def DecodeSrgb(rgb):
    norm = rgb.astype(np.float32) / 255
    return np.where(norm < .04045, norm / 12.92, ((norm + .055) / 1.055)**2.4)


def Bytes(rgb):
    return np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def EncodeSrgb(linear):
    return Bytes(np.where(linear < .0031308, linear*12.92, 1.055*np.maximum(linear, 0)**(1/2.4)-.055))


def Accessor(doc, binary, index):
    spec = doc["accessors"][index]
    assert "sparse" not in spec
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[spec["type"]]
    dtype = np.dtype({5123:"<u2",5125:"<u4",5126:"<f4"}[spec["componentType"]])
    view = doc["bufferViews"][spec["bufferView"]]
    start = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
    return np.ndarray((spec["count"],width),dtype=dtype,buffer=binary,offset=start,
                      strides=(view.get("byteStride",width*dtype.itemsize),dtype.itemsize))


def WorldNodes(doc):
    def Visit(index, parent):
        node = doc["nodes"][index]
        if "matrix" in node:
            local = np.asarray(node["matrix"]).reshape(4,4).T
        else:
            local=np.identity(4)
            local[:3,:3]=Rotation.from_quat(node.get("rotation",(0,0,0,1))).as_matrix()*node.get("scale",(1,1,1))
            local[:3,3]=node.get("translation",(0,0,0))
        matrix=parent@local
        if "mesh" in node:
            yield index,node,matrix
        for child in node.get("children",[]):
            yield from Visit(child,matrix)
    for root in doc["scenes"][doc["scene"]]["nodes"]:
        yield from Visit(root,np.identity(4))


def PrimitiveTriangles(doc, binary, primitive, matrix, uvTransform):
    attrs=primitive["attributes"]
    p=Accessor(doc,binary,attrs["POSITION"])
    n=Accessor(doc,binary,attrs["NORMAL"])
    uv=uvTransform(Accessor(doc,binary,attrs["TEXCOORD_0"]))
    indices=Accessor(doc,binary,primitive["indices"]).reshape(-1,3)
    xyz=p@matrix[:3,:3].T+matrix[:3,3]
    normal=Unit(n@np.linalg.inv(matrix[:3,:3]))
    return (uv[indices].astype(np.float32),xyz[indices].astype(np.float32),
            normal[indices].astype(np.float32))


def Raster(sets, size):
    uv,positions,normals,covered = (np.concatenate(group) for group in zip(*sets))
    w,h=size
    screen=(uv*np.array((w,h),dtype=np.float32)-.5).astype(np.float32)
    ids=np.zeros((h,w),dtype=np.int32)
    polygons=np.rint(screen*16).astype(np.int32)
    for index,polygon in enumerate(polygons,1):
        cv2.fillConvexPoly(ids,polygon,index,lineType=cv2.LINE_8,shift=4)
    return ids,screen,positions,normals,np.r_[False,covered]


def Values(raster):
    ids,screen,pos,norm,eligible=raster
    y,x=np.where(eligible[ids])
    for start in range(0,len(x),150000):
        xx,yy=x[start:start+150000],y[start:start+150000]
        chosen=ids[yy,xx]-1
        u=screen[chosen]
        q=np.stack((xx,yy),axis=1)-u[:,0]
        a,b=u[:,1]-u[:,0],u[:,2]-u[:,0]
        det=a[:,0]*b[:,1]-a[:,1]*b[:,0]
        safe=np.where(abs(det)>.00001,det,1.)
        v=(q[:,0]*b[:,1]-q[:,1]*b[:,0])/safe
        w=(a[:,0]*q[:,1]-a[:,1]*q[:,0])/safe
        bary=np.maximum(0.,np.stack((1-v-w,v,w),axis=1))
        bary/=bary.sum(axis=1,keepdims=True)
        xyz=np.sum(pos[chosen]*bary[...,None],axis=1)
        normal=Unit(np.sum(norm[chosen]*bary[...,None],axis=1))
        d,e=pos[chosen,1]-pos[chosen,0],pos[chosen,2]-pos[chosen,0]
        dx=(d*b[:,1,None]-e*a[:,1,None])/safe[:,None]
        dy=(e*a[:,0,None]-d*b[:,0,None])/safe[:,None]
        scale=np.clip(np.stack((np.linalg.norm(dx,axis=1),np.linalg.norm(dy,axis=1)),axis=1),.000032,.010)
        yield yy,xx,xyz,normal,scale


def BrokenEdge(p):
    x,y,z=p.T
    return (.5 + .19*np.sin(78*x+24*z)*np.cos(116*y-47*z)
              + .14*np.cos(151*z+38*x-22*y)*np.sin(101*x+77*y)
              + .09*np.sin(211*x-160*z+97*y)
              + .055*np.sin(334*y+242*z+133*x))


def Cluster(p, center, extent):
    return 1-Smooth(np.linalg.norm((p-center)/extent,axis=1),.29,1.03)


def PressedCoverage(p, normal, alpha):
    result=np.zeros(len(p),dtype=np.float32)
    height,width=alpha.shape
    for center,axis,sign,size,angle,depth in PRESSED_PATCHES:
        rel=p-center
        facing=Smooth(sign*normal[:,axis],.16,.71)
        cover=facing*(1-Smooth(abs(rel[:,axis]),depth*.52,depth))
        across=2 if axis==0 else 0
        u=(rel[:,across]*np.cos(angle)-rel[:,1]*np.sin(angle))/size[0]+.5
        v=(-rel[:,across]*np.sin(angle)-rel[:,1]*np.cos(angle))/size[1]+.5
        hit=(cover>.015)&(u>=0)&(v>=0)&(u<1)&(v<1)
        ix=np.clip((u[hit]*width).astype(int),0,width-1)
        iy=np.clip((v[hit]*height).astype(int),0,height-1)
        result[hit]=np.maximum(result[hit],alpha[iy,ix]*cover[hit])
    return result


def BodyLayers(p, normal, pressed):
    x,y,z=p.T
    rough=BrokenEdge(p)
    wobble=p+np.stack((rough-.5,BrokenEdge(p[:,[1,2,0]])-.5,BrokenEdge(p[:,[2,0,1]])-.5),axis=1)*(.058,.080,.108)
    shape=np.zeros_like(y)
    for _,center,extent,amount in BODY_GROUPS:
        shape=np.maximum(shape,Cluster(wobble,center,extent)*amount)
    stamp=PressedCoverage(p,normal,pressed)
    wet=np.maximum(Smooth(shape*(.62+.73*rough),.38,.84)*.83,
                   Smooth(stamp,.16,.72)*.94)
    dry=np.maximum(Smooth(shape*(.73+.34*rough),.17,.74)*(.56+.22*rough),
                   Smooth(stamp,.055,.64)*(.64+.29*rough))
    # Dust settles around the belt and on lower upward-facing ledges.
    low=1-Smooth(y,.34,.79)
    outside=Smooth(abs(x),.38,.74)
    shelf=Smooth(normal[:,1],.07,.80)*(1-Smooth(y,.71,1.00))
    dust=(.040+.245*low*outside+.10*shelf)*(.38+.62*rough)
    dust *= 1-Smooth(y,.89,.99)
    return dust,dry,wet


def TrackLayers(p, normal, role):
    about=BrokenEdge(p*np.array((1.78,1.50,1.65)))
    x,y,z=p.T
    recess=(1-Smooth(y,.001,.014))*(.61+.39*about)
    dust=(.13+.17*recess)*(.54+.58*about)
    if role=="Dust":
        return dust, .15*recess*Smooth(about,.27,.67), np.zeros_like(dust)
    base={
        "DampA": ((-.021,-.006,-.002),(.084,.043,.047),.97,.74),
        "DampB": ((+.025,-.012,.005),(.085,.046,.044),.91,.83),
        "Crust": ((+.002,-.009,-.009),(.073,.045,.048),.35,.94),
    }
    center,extent,wetStrength,dryStrength=base[role]
    shifted=p+np.stack((about-.5,BrokenEdge(p[:,[2,0,1]]*1.7)-.5,
                        BrokenEdge(p[:,[1,2,0]]*1.4)-.5),axis=1)*(.020,.020,.025)
    broad = Cluster(shifted,center,extent)
    shape=np.maximum(broad,Cluster(shifted,(center[0]*.42,-.020,-.019),
                                   (.071,.037,.032))*.75)
    wear=Smooth(y,.004,.014)*Smooth(normal[:,1],.44,.95)
    wet=Smooth(shape*(.54+.82*about),.19,.72)*wetStrength*(1-.69*wear)
    dry=Smooth(shape*(.76+.32*about),.09,.62)*dryStrength*(1-.51*wear)
    return dust, dry, wet


def Sample(image, points, normal, period, phase):
    p=points/period+np.asarray(phase)
    weights=abs(normal)**3
    weights=weights/np.maximum(weights.sum(1,keepdims=True),1e-8)
    result=np.zeros((len(p),3),dtype=np.float32)
    height,width=image.shape[:2]
    for axis,(horizontal,vertical) in enumerate(((1,2),(0,2),(0,1))):
        sx=np.mod(p[:,horizontal],1)*width-.5
        sy=np.mod(-p[:,vertical],1)*height-.5
        ix,iy=np.floor(sx).astype(np.int32),np.floor(sy).astype(np.int32)
        u,v=(sx-ix)[:,None],(sy-iy)[:,None]
        c00=image[iy%height,ix%width]
        c10=image[iy%height,(ix+1)%width]
        c01=image[(iy+1)%height,ix%width]
        c11=image[(iy+1)%height,(ix+1)%width]
        layer=(c00*(1-u)+c10*u)*(1-v)+(c01*(1-u)+c11*u)*v
        result+=layer*weights[:,axis,None]
    return result


def Blend(a,b,w):
    return a+(b-a)*w[...,None]


def NearestBorder(ids):
    valid=ids!=0
    d,labels=cv2.distanceTransformWithLabels((~valid).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    positions=np.flatnonzero(valid)
    lookup=np.zeros(int(labels.max())+1,dtype=np.int32)
    lookup[labels.ravel()[positions]]=positions
    target=np.flatnonzero((~valid)&(d<=10.))
    return target,lookup[labels.ravel()[target]]


def ApplyLayers(images,raster,soil,layerFn,track=False):
    ids=raster[0]
    height=np.zeros(ids.shape,dtype=np.float32)
    coverage=np.zeros(ids.shape,dtype=np.float32)
    pad,nearest=NearestBorder(ids)
    active=0
    for y,x,p,n,scale in Values(raster):
        dust,dry,wet=layerFn(p,n)
        visible=1-(1-dust)*(1-dry)*(1-wet)
        hit=visible>.014
        y,x,p,n,scale,visible,dust,dry,wet=[v[hit] for v in (y,x,p,n,scale,visible,dust,dry,wet)]
        if not len(y):
            continue
        active+=len(y)
        fresh=Sample(soil["Wet"],p,n,.184 if track else .211,(.16,.51,.24))
        crust=Sample(soil["Dry"],p,n,.195 if track else .285,(.64,.18,.57))
        wetTone=np.clip(fresh*1.12+np.array((.024,.014,.007)),0,1)
        dryTone=np.clip(crust*1.19+np.array((.019,.013,.0065)),0,1)
        base=DecodeSrgb(images["Base"][y,x])
        dustTone=DecodeSrgb(np.array([112,101,82],dtype=np.uint8))
        base=Blend(Blend(Blend(base,dustTone,dust),dryTone,dry),wetTone,wet)
        images["Base"][y,x]=EncodeSrgb(base)
        orm=images["Orm"][y,x].astype(np.float32)/255.
        rough=orm[:,1]
        rough+=dust*(.83-rough)
        rough+=dry*(.88-rough)
        rough+=wet*((.57+.14*Smooth(fresh.mean(1),.014,.10))-rough)
        orm[:,2]*=(1-dust*.97)*(1-dry)*(1-wet)
        orm[:,0]*=1-.151*np.maximum(dry,wet)*(1-Smooth(fresh.mean(1),.018,.078))
        images["Orm"][y,x]=Bytes(orm)
        relief=Smooth(fresh.mean(1),.008,.12)*.00335+.00092
        reliefDry=Smooth(crust.mean(1),.025,.19)*.00198+.00044
        height[y,x]=wet*relief+dry*reliefDry*(1-.51*wet)+dust*.00009
        coverage[y,x]=visible
    height.ravel()[pad]=height.ravel()[nearest]
    dx=cv2.Sobel(height,cv2.CV_32F,1,0,ksize=3,scale=1/8)
    dy=cv2.Sobel(height,cv2.CV_32F,0,1,ksize=3,scale=1/8)
    # Tangent +Y points opposite image rows in glTF normal maps.
    for y,x,_,_,scale in Values(raster):
        vis=coverage[y,x]
        activeMask=vis>.014
        y,x,vis,scale=(v[activeMask] for v in (y,x,vis,scale))
        if not len(y):
            continue
        slopes=np.clip(np.stack((-dx[y,x],dy[y,x]),axis=1)/scale,-.8,.8)
        relief=Unit(np.column_stack((slopes,np.ones(len(y)))))
        old=Unit(images["Normal"][y,x].astype(np.float32)/127.5-1.)
        combined=Unit(Blend(old,relief,np.clip(vis*.78,0,1)))
        images["Normal"][y,x]=Bytes(combined*.5+.5)
    change=coverage.ravel()[nearest]>.014
    for array in images.values():
        flat=array.reshape(-1,3)
        flat[pad[change]]=flat[nearest[change]]
    return {"affectedSurfaceTexels":active,
            "strongCoatingTexels":int(np.count_nonzero(coverage>.56))}


def ReadMaps(doc, binary, material):
    return {name:np.asarray(OpenTexture(doc,binary,index)).copy()
            for name,index in TextureBindings(material).items()}


def BodySets(doc,binary,materialIndex):
    values=[]
    for _,node,matrix in WorldNodes(doc):
        if node["name"].startswith("TrackLink_"):
            continue
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            if primitive["material"]!=materialIndex:
                continue
            u,p,n=PrimitiveTriangles(doc,binary,primitive,matrix,lambda x:x)
            selected=np.full(len(u),node["name"].startswith(BODY_PREFIXES),dtype=bool)&(p[:,:,1].min(1)<.995)
            if materialIndex==1:
                mean=u.mean(1)*SIZE
                for x,y,w,h in SOLIDS.values():
                    selected &= ~((mean[:,0]>=x)&(mean[:,0]<x+w)&(mean[:,1]>=y)&(mean[:,1]<y+h))
            values.append((u,p,n,selected))
    return values


def TrackRole(side,index):
    chosen=next((role for start,end,role in TRACK_GROUPS[side] if start<=index<=end),None)
    if chosen:
        if chosen.startswith("Damp") and index%4==1:
            return "DampB" if chosen=="DampA" else "DampA"
        return chosen
    return "Dust" if (index+int(side=="Right"))%5 in {1,2,4} else "Bare"


def BuildVariants(doc,binary,details,soil):
    links=[n for n in doc["nodes"] if n["name"].startswith("TrackLink_")]
    assert len(links)==160 and len({n["mesh"] for n in links})==1
    baseIndex=links[0]["mesh"]
    oldMesh=doc["meshes"][baseIndex]
    primitive=oldMesh["primitives"][0]
    uvIndex=primitive["attributes"]["TEXCOORD_0"]
    trackUv=(Accessor(doc,binary,uvIndex)*SIZE-TRACK_ORIGIN)/TRACK_SIZE
    u,p,n=PrimitiveTriangles(doc,binary,primitive,np.identity(4),
                            lambda uv:(uv*SIZE-TRACK_ORIGIN)/TRACK_SIZE)
    assert u.min()>=0 and u.max()<=1
    source={k:data[:TRACK_SIZE,TRACK_SIZE:TRACK_SIZE*2,:].copy() for k,data in details.items()}
    mappings={"Bare":baseIndex}
    append={}
    statistics={}
    for role,(x,y,res) in TRACK_TILES.items():
        bakeSize=1024 if role.startswith("Damp") else res
        tile={k:np.asarray(Image.fromarray(array,"RGB").resize((bakeSize,bakeSize),Image.Resampling.LANCZOS)).copy()
              for k,array in source.items()}
        raster=Raster([(u,p,n,np.ones(len(u),bool))],(bakeSize,bakeSize))
        statistics[role]=ApplyLayers(tile,raster,soil,lambda pts,norm:TrackLayers(pts,norm,role),track=True)
        for k,values in tile.items():
            if bakeSize!=res:
                smaller=Image.fromarray(values,"RGB").resize((res,res),Image.Resampling.BOX)
                values=np.asarray(smaller).copy()
                if k=="Normal":
                    values=Bytes(Unit(values.astype(np.float32)/127.5-1.)*.5+.5)
                guard=12
                details[k][y-guard:y+res+guard,x-guard:x+res+guard]=np.pad(values,((guard,guard),(guard,guard),(0,0)),mode="edge")
            else:
                details[k][y:y+res,x:x+res]=values
        mesh=deepcopy(oldMesh)
        mesh["name"]=f"Mesh_Type94Shoe{role}V113"
        uv=((trackUv*res+(x,y))/SIZE).astype("<f4")
        acc=deepcopy(doc["accessors"][uvIndex])
        view=len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer":0,"byteOffset":0,"byteLength":uv.nbytes,"target":34962})
        append[view]=uv.tobytes()
        acc["bufferView"]=view
        acc.pop("byteOffset",None)
        if "min" in acc:
            acc["min"]=uv.min(axis=0).tolist()
        if "max" in acc:
            acc["max"]=uv.max(axis=0).tolist()
        mesh["primitives"][0]["attributes"]["TEXCOORD_0"]=len(doc["accessors"])
        doc["accessors"].append(acc)
        mappings[role]=len(doc["meshes"])
        doc["meshes"].append(mesh)
        print(role,statistics[role],flush=True)
    assignment={}
    for node in links:
        _,side,number=node["name"].split("_")
        role=TrackRole(side,int(number))
        node["mesh"]=mappings[role]
        assignment[node["name"]]=role
    return append,assignment,statistics


def Repack(doc,binary,replacements):
    new=bytearray()
    for i,view in enumerate(doc["bufferViews"]):
        blob=replacements.get(i)
        if blob is None:
            blob=ViewBytes(doc,binary,i)
        view["byteOffset"]=len(new)
        view["byteLength"]=len(blob)
        new.extend(blob)
        new.extend(b"\0"*(-len(blob)%4))
    doc["buffers"][0]["byteLength"]=len(new)
    text=json.dumps(doc,separators=(",",":"),ensure_ascii=False).encode("utf-8")
    text+=b" "*(-len(text)%4)
    return struct.pack("<4s2II4s",b"glTF",2,28+len(text)+len(new),len(text),b"JSON")+text+struct.pack("<I4s",len(new),b"BIN\0")+new


def Main():
    parser=ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--wet",type=Path,required=True)
    parser.add_argument("--dry",type=Path,required=True)
    parser.add_argument("--pressed",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    before,doc,binary=ReadGlb(args.input)
    baseline=json.loads((ASSET/"Data_ReleaseV112.json").read_text(encoding="utf-8"))
    assert sha256(before).hexdigest()==baseline["output"]["sha256"]
    assert [m["name"] for m in doc["materials"]]==["Material_Type94Paint","Material_Type94Details"]
    assert len(doc["images"])==6
    root=args.output_dir.resolve()
    textures=root/"Textures"
    acceptance=root/"Acceptance"
    exports=root/"Exports"
    for directory in (textures,acceptance,exports):
        directory.mkdir(parents=True,exist_ok=True)
    soil={}
    for kind,file in (("Wet",args.wet),("Dry",args.dry)):
        with Image.open(file) as image:
            soil[kind]=DecodeSrgb(np.asarray(image.convert("RGB")))

    with Image.open(args.pressed) as image:
        pressed=np.asarray(image.convert("RGBA"))[:,:,3].astype(np.float32)/255
    maps=[ReadMaps(doc,binary,m) for m in doc["materials"]]
    dryTrack={channel:data[:2048,2048:4096].copy() for channel,data in maps[1].items()}
    stats={}
    for number,name in enumerate(("Paint","Details")):
        h,w=maps[number]["Base"].shape[:2]
        raster=Raster(BodySets(doc,binary,number),(w,h))
        stats[name]=ApplyLayers(maps[number],raster,soil,lambda p,n:BodyLayers(p,n,pressed))
        print(name,stats[name],flush=True)
        del raster
    for channel,baseTrack in dryTrack.items():
        maps[1][channel][:2048,2048:4096]=baseTrack
    append,assignment,track=BuildVariants(doc,binary,maps[1],soil)
    replacements=dict(append)
    textureFiles={}
    for material,group,array in zip(doc["materials"],("Paint","Details"),maps):
        textureFiles[group]={}
        for channel,index in TextureBindings(material).items():
            slot=doc["textures"][index]["extensions"]["EXT_texture_webp"]["source"]
            image=doc["images"][slot]
            name=f"Texture_Type94{group}{channel}V113"
            image["name"]=name
            picture=Image.fromarray(array[channel],"RGB")
            file=textures/(name+".png")
            picture.save(file,compress_level=3)
            replacements[image["bufferView"]]=EncodeLossless(picture)
            textureFiles[group][channel]={"file":str(file),"sha256":sha256(file.read_bytes()).hexdigest()}
            print("Written",name,picture.size,flush=True)
    result=Repack(doc,binary,replacements)
    output=exports/"Model_Type94TanketteWeatheringV113.glb"
    output.write_bytes(result)
    counts=Counter(assignment.values())
    report={"schema":"Type94WeatheringV113",
            "sourceGlb":str(args.input.resolve()),"sourceSha256":sha256(before).hexdigest(),
            "outputGlb":str(output),"outputSha256":sha256(result).hexdigest(),"bytes":len(result),
            "textures":textureFiles,"weatheredBody":stats,"trackTexels":track,"trackTiles":TRACK_TILES,
            "trackCounts":counts,"trackAssignments":assignment,
            "references":{"wet":str(args.wet.resolve()),"wetSha256":sha256(args.wet.read_bytes()).hexdigest(),
                          "dry":str(args.dry.resolve()),"drySha256":sha256(args.dry.read_bytes()).hexdigest(),
                          "pressed":str(args.pressed.resolve()),"pressedSha256":sha256(args.pressed.read_bytes()).hexdigest()}}
    (acceptance/"Data_Type94WeatherBakeV113.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"sha256":report["outputSha256"],"bytes":len(result),"trackCounts":counts}),flush=True)


if __name__=="__main__":
    Main()
