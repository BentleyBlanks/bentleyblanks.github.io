"""Check the actual Type 94 import against the retained articulated assembly."""

import bisect
import collections
import json
import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_BuildType94PhotoV107 import ReadJson, Sha, WriteJson, acceptance, highBlend, modelDir, revision, root
from Script_Type94Export import TriangulatedCopy
from Script_VerifyType94Sweep import VerifyScene


def Tree(objects):
    points, faces, owners = [],[],[]
    for obj in objects:
        if obj.type!="MESH":
            continue
        start = len(points)
        points.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
        for p in obj.data.polygons:
            faces.append([start+i for i in p.vertices])
            owners.append(obj.name)
    return BVHTree.FromPolygons(points,faces),owners


def CheckApertures():
    checks = []
    for sideName,sign in [("Left",-1),("Right",1)]:
        link = bpy.data.objects[f"TrackLink_{sideName}_000"]
        shoeTree,_ = Tree([link])
        down = link.matrix_world.to_3x3() @ Vector((0,0,-1))
        for x,isOpen in [(-.032,True),(0,False),(.032,True)]:
            origin = link.matrix_world @ Vector((x,-.006,.055))
            hit = shoeTree.ray_cast(origin,down,.11)[0]
            checks.append(dict(side=sideName,feature="track shoe",sample=x,expectedOpen=isOpen,
                               passed=(hit is None)==isOpen))
        wheel = bpy.data.objects[f"Wheel_{sideName}_Drive"]
        web = bpy.data.objects[f"Geometry_Wheel_{sideName}_Drive_Paint"]
        driveTree,_ = Tree([web])
        inward = wheel.matrix_world.to_3x3() @ Vector((-sign,0,0))
        for sector in range(8):
            angle = (sector+.5)*math.tau/8
            p = wheel.matrix_world @ Vector((sign*.095,.185*math.cos(angle),.185*math.sin(angle)))
            hit = driveTree.ray_cast(p,inward,.19)[0]
            checks.append(dict(side=sideName,feature="drive web",sample=sector,passed=hit is None))
    return checks


def CheckRunning(meshes,path):
    wheels = [o for o in bpy.data.objects if o.name.startswith("Wheel_") and o.get("WheelRadiusM")]
    links = [m for m in meshes if m.name.startswith("TrackLink_")]
    moving = set(links)
    for wheel in wheels:
        moving.update(wheel.children_recursive)
    fixed, owners = Tree(meshes-moving)
    rows = []
    for wheel in sorted(wheels,key=lambda obj:obj.name):
        if "_Road" not in wheel.name:
            continue
        original = wheel.matrix_basis.copy()
        count = 0
        for sample in range(16):
            wheel.matrix_basis = original @ Matrix.Rotation(sample*math.tau/16,4,"X")
            bpy.context.view_layer.update()
            tree,_ = Tree(wheel.children_recursive)
            count += len(fixed.overlap(tree))
        wheel.matrix_basis = original
        rows.append(dict(feature=wheel.name,samples=16,passed=count==0,intersections=count))
    for sideName in ["Left","Right"]:
        belt = sorted((o for o in links if o.name.startswith(f"TrackLink_{sideName}_")),key=lambda o:o["TrackIndex"])
        rest = [o.matrix_basis.copy() for o in belt]
        for sample in range(16):
            for index,shoe in enumerate(belt):
                s = (index*path["pitchM"]+sample*path["pitchM"]/16)%path["lengthM"]
                i = min(len(path["points"])-1,bisect.bisect_right(path["distances"],s)-1)
                a,b = path["points"][i],path["points"][(i+1)%len(path["points"])]
                t = (s-path["distances"][i])/(path["distances"][i+1]-path["distances"][i])
                shoe.location.y = a[0]+(b[0]-a[0])*t
                shoe.location.z = a[1]+(b[1]-a[1])*t
                shoe.rotation_mode = "XYZ"
                shoe.rotation_euler.x = math.atan2(b[1]-a[1],b[0]-a[0])+math.pi
            bpy.context.view_layer.update()
            actual,_ = Tree(belt)
            pairs = fixed.overlap(actual)
            rows.append(dict(feature=sideName+" circulating belt",phase=sample/16,passed=not pairs,
                             intersections=dict(collections.Counter(owners[i] for i,_ in pairs))))
        for shoe,original in zip(belt,rest):
            shoe.matrix_basis = original
        bpy.context.view_layer.update()
    return rows


def CheckGate(meshes):
    gate = bpy.data.objects["TowLatchFront"]
    moving = set(gate.children_recursive)
    fixed,owners = Tree(meshes-moving)
    rest = gate.matrix_basis.copy()
    collisions = []
    for degrees in range(56):
        gate.matrix_basis = rest @ Matrix.Rotation(math.radians(degrees),4,"X")
        bpy.context.view_layer.update()
        tree,_ = Tree(moving)
        pairs = fixed.overlap(tree)
        if pairs:
            collisions.append(dict(degrees=degrees,owners=sorted({owners[i] for i,j in pairs})))
    gate.matrix_basis = rest
    bpy.context.view_layer.update()
    return dict(feature="tow latch",samples=56,passed=not collisions,collisions=collisions)


def SampleSurface(source, target):
    target.calc_loop_triangles()
    targetTree = BVHTree.FromPolygons([v.co for v in target.vertices],
        [t.vertices for t in target.loop_triangles],all_triangles=True)
    source.calc_loop_triangles()
    used = {i for triangle in source.loop_triangles for i in triangle.vertices}
    points = [source.vertices[i].co for i in used]
    for t in source.loop_triangles:
        a,b,c = [source.vertices[i].co for i in t.vertices]
        points.extend([(a+b)*.5,(b+c)*.5,(c+a)*.5,(a+b+c)/3])
    distances = [targetTree.find_nearest(p)[3] for p in points]
    index = int(np.argmax(distances))
    return dict(samples=len(distances),medianM=float(np.median(distances)),
                percentile95M=float(np.percentile(distances,95)),maximumM=distances[index],
                maximumAtOwnerLocalM=list(points[index]))


def CompareSurfaces():
    names = [
        "Geometry_Hull_Paint", "Geometry_NoseHousing_Paint", "Geometry_FinalDriveRaisedEarRight_Paint",
        "Geometry_FinalDriveHousingLeft_Paint", "Geometry_FinalDriveHousingRight_Paint",
        "Geometry_Wheel_Left_Drive_Paint", "Geometry_Wheel_Right_Drive_Paint",
        "Geometry_Wheel_Left_Road0_Paint", "TrackLink_Left_000",
    ]
    low = {name:bpy.data.objects[name] for name in names}
    with bpy.data.libraries.load(str(highBlend),link=False) as (available,loaded):
        if any(name not in available.objects for name in names):
            raise ValueError("The audited high source lacks a corresponding owner")
        loaded.objects = names.copy()
    rows = []
    for name,obj in zip(names,loaded.objects):
        highTriangles = TriangulatedCopy(obj.data)
        try:
            rows.append(dict(owner=name,highToGame=SampleSurface(highTriangles,low[name].data),
                             gameToHigh=SampleSurface(low[name].data,highTriangles)))
        finally:
            bpy.data.meshes.remove(highTriangles)
    return rows


file = Path(os.environ.get("TYPE94_PHOTO_VERIFY_FILE",root/"Exports"/"Model_Type94Tankette.glb"))
isGlb = file.suffix.lower()==".glb"
if isGlb:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(file))
else:
    bpy.ops.wm.open_mainfile(filepath=str(file))
bpy.context.view_layer.update()
scene = bpy.context.scene
asset = bpy.data.objects["Type94Tankette"]
objects = [asset,*asset.children_recursive]
meshes = {o for o in objects if o.type=="MESH"}
contract = ReadJson(modelDir/"Data_Type94Tankette.json")
path = contract["mechanisms"]["path"]
driver = ReadJson(modelDir/"Data_BodyTrialV64.json")["driver"]
envelope = dict(xRangeM=[driver["centerXM"]-driver["widthM"]/2-.10,driver["centerXM"]+driver["widthM"]/2+.10],
    forwardRangeM=[driver["topForwardM"]-.283-.10,driver["bottomForwardM"]+.10],minimumHeightM=driver["bottomZM"]-.015)
holes = CheckApertures()
motion = VerifyScene(scene,path,{"DriverRoof":dict(gunElevationDegrees=12,basis="Preserved preview interlock")},cabinEnvelope=envelope)
running = CheckRunning(meshes,path)
gate = CheckGate(meshes)
ok = len(objects)==296 and len(meshes)==240 and all(row["passed"] for row in holes+running+[gate]) and motion["passed"]
report = dict(file=str(file),sha256=Sha(file),passed=ok,meshOwners=len(meshes),nodes=len(objects),
              actualGlbReimport=isGlb,apertures=holes,mechanisms=motion,running=running,towLatch=gate)
if isGlb:
    report["sampledSurfaces"] = CompareSurfaces()
    report["highSourceSha256"] = Sha(highBlend)
motionReport = f"Data_Type94{'Actual' if isGlb else 'Source'}Motion{revision}.json"
WriteJson(acceptance/motionReport,report)
print(json.dumps(dict(passed=ok,failures=[r for r in holes+running+[gate]+motion["checks"] if not r["passed"]]),indent=2),flush=True)
if not ok:
    raise ValueError("Type94 rigid assembly or aperture acceptance failed")
