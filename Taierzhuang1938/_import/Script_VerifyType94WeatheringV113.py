"""Verify the baked Type 94 channels and the assembled rigid vehicle in the actual export."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

import numpy as np

from Script_BakeType94WeatheringV113 import Accessor, ReadMaps, TrackRole, WorldNodes
from Script_MergeType94MaterialsV112 import ReadGlb, SOLIDS


def Main(args):
    oldBytes,old,oldBin=ReadGlb(args.before)
    newBytes,new,newBin=ReadGlb(args.after)
    for key in ("materials","textures","samplers","scenes","scene","animations","skins"):
        assert old.get(key)==new.get(key),key
    assert len(old["nodes"])==len(new["nodes"])==296
    assert len(new["materials"])==2 and len(new["images"])==6
    oldRoles,newRoles=[ReadMaps(doc,binary,doc["materials"][1]) for doc,binary in ((old,oldBin),(new,newBin))]
    for x,y,w,h in SOLIDS.values():
        for channel in oldRoles:
            assert np.array_equal(oldRoles[channel][y:y+h,x:x+w],newRoles[channel][y:y+h,x:x+w]),channel

    for channel in oldRoles:
        assert np.array_equal(oldRoles[channel][:2048,2048:4096],newRoles[channel][:2048,2048:4096]),channel

    meshOwners=0
    triangles=0
    activeRoles={}
    differences={}
    for i,node,_ in WorldNodes(old):
        meshOwners+=1
        after=new["nodes"][i]
        assert {k:v for k,v in node.items() if k!="mesh"}=={k:v for k,v in after.items() if k!="mesh"},node["name"]
        body=old["meshes"][node["mesh"]]["primitives"]
        baked=new["meshes"][after["mesh"]]["primitives"]
        track=node["name"].startswith("TrackLink_")
        assert len(body)==len(baked)
        if track:
            _,side,index=node["name"].split("_")
            role=TrackRole(side,int(index))
            assert activeRoles.setdefault(role,after["mesh"])==after["mesh"]
        else:
            assert node["mesh"]==after["mesh"]
        for left,right in zip(body,baked):
            for k in ("POSITION","NORMAL","TANGENT"):
                source=Accessor(old,oldBin,left["attributes"][k])
                output=Accessor(new,newBin,right["attributes"][k])
                assert source.tobytes()==output.tobytes(),(node["name"],k)
            leftIndex=Accessor(old,oldBin,left["indices"])
            rightIndex=Accessor(new,newBin,right["indices"])
            assert leftIndex.tobytes()==rightIndex.tobytes()
            triangles+=len(leftIndex)//3
            assert left["material"]==right["material"]
            if not track or role=="Bare":
                assert Accessor(old,oldBin,left["attributes"]["TEXCOORD_0"]).tobytes()==Accessor(new,newBin,right["attributes"]["TEXCOORD_0"]).tobytes()
            if track and role not in differences:
                uv=Accessor(new,newBin,right["attributes"]["TEXCOORD_0"])
                center=uv[rightIndex.reshape(-1,3)].mean(1)
                arr=newRoles["Orm"]
                w,h=arr.shape[1],arr.shape[0]
                texel=np.minimum((center*(w,h)).astype(int),(w-1,h-1))
                values=arr[texel[:,1],texel[:,0]].astype(float)/255.
                differences[role]={"aoMedian":round(float(np.median(values[:,0])),4),
                                   "metallicMedian":round(float(np.median(values[:,2])),4),
                                   "roughnessMedian":round(float(np.median(values[:,1])),4)}
    assert (meshOwners,triangles)==(240,79178)
    assert len(set(activeRoles.values()))==len(activeRoles)==5
    assert differences["DampA"]["metallicMedian"]<differences["Bare"]["metallicMedian"]-.075
    assert differences["DampB"]["metallicMedian"]<differences["Bare"]["metallicMedian"]-.075
    assert differences["Crust"]["roughnessMedian"]>differences["DampA"]["roughnessMedian"]
    verification={"beforeSha256":sha256(oldBytes).hexdigest(),"afterSha256":sha256(newBytes).hexdigest(),
                  "nodes":len(new["nodes"]),"meshOwners":meshOwners,"triangles":triangles,"materials":2,"images":6,
                  "allRigidTransformsAndGeometryValuesExact":True,"emblemAndSolidPixelsExact":True,
                  "trackUvVariants":len(activeRoles),"ormAtActualLinkUvTriangleCenters":differences,"passed":True}
    args.report.write_text(json.dumps(verification,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(verification),flush=True)


if __name__=="__main__":
    p=ArgumentParser(description=__doc__)
    p.add_argument("--before",type=Path,required=True)
    p.add_argument("--after",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    Main(p.parse_args())
