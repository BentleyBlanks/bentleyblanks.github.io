"""Audit the actual GLB payload, not the Blender authoring scene."""
import argparse
import json
import math
import struct
import io
import hashlib
import re
from pathlib import Path
from PIL import Image
import numpy as np


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('glb',type=Path)
    parser.add_argument('--out',type=Path)
    parser.add_argument('--high',action='store_true')
    parser.add_argument('--geometry-only',action='store_true',help='Gray-study geometry audit; does not accept PBR channels')
    args=parser.parse_args()
    payload=args.glb.read_bytes()
    assert payload[:4]==b'glTF' and struct.unpack_from('<I',payload,4)[0]==2
    assert struct.unpack_from('<I',payload,8)[0]==len(payload)
    jsonSize=struct.unpack_from('<I',payload,12)[0]
    data=json.loads(payload[20:20+jsonSize])
    binary=payload[28+jsonSize:]
    def Accessor(index):
        accessor=data['accessors'][index];view=data['bufferViews'][accessor['bufferView']]
        types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[accessor['type']]
        dtype=np.dtype(types[accessor['componentType']]);stride=view.get('byteStride',components*dtype.itemsize)
        return np.ndarray((accessor['count'],components),dtype=dtype,buffer=binary,
            offset=view.get('byteOffset',0)+accessor.get('byteOffset',0),strides=(stride,dtype.itemsize)).copy()
    def Local(node):
        if 'matrix' in node:return np.array(node['matrix']).reshape((4,4),order='F')
        x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4)
        m[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
        m[:3,:3]=m[:3,:3]@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
    nodes=data['nodes'];parents={child:i for i,node in enumerate(nodes) for child in node.get('children',[])}
    matrices={}
    def World(index):
        if index not in matrices:matrices[index]=(World(parents[index]) if index in parents else np.eye(4))@Local(nodes[index])
        return matrices[index]
    checks=[]
    def Check(value,label):
        checks.append({'check':label,'passed':bool(value)})
    hullIndex=next(i for i,node in enumerate(nodes) if node.get('name')=='Hull')
    frontProbeHeight=nodes[hullIndex].get('extras',{}).get('FrontArmorProbeHeightM',.52)+World(hullIndex)[1,3]
    frontProbeForward=nodes[hullIndex].get('extras',{}).get('FrontArmorProbeForwardM',1.36)
    positions=[];triangles=0;degenerate=0;degenerateNodes=[];normalsFinite=True;uvFinite=True;gunPoints=[];frontNormals=[];frontProbe=None;trackWidths={'Left':[],'Right':[]};rearHullTriangles=[];rearArmorProbes=[]
    for index,node in enumerate(nodes):
        Check(all(abs(s-1)<1e-6 for s in node.get('scale',[1,1,1])),node.get('name','node')+' rigid scale')
        if 'mesh' not in node:continue
        world=World(index)
        for primitive in data['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode',4)==4
            p=Accessor(primitive['attributes']['POSITION'])
            for side in ['Left','Right']:
                if node.get('name','').startswith('TrackLink_'+side+'_'):trackWidths[side].append(float(p[:,0].max()-p[:,0].min()))
            indices=Accessor(primitive['indices']).ravel().reshape((-1,3)) if 'indices' in primitive else np.arange(len(p)).reshape((-1,3))
            triangles+=len(indices)
            worldPoints=(np.column_stack((p,np.ones(len(p))))@world.T)[:,:3]
            positions.append(worldPoints)
            cross=np.cross(p[indices[:,1]]-p[indices[:,0]],p[indices[:,2]]-p[indices[:,0]])
            bad=int(np.sum(np.linalg.norm(cross,axis=1)<1e-10));degenerate+=bad
            if bad:degenerateNodes.append({'node':node.get('name'),'triangles':bad})
            n=Accessor(primitive['attributes']['NORMAL'])
            normalsFinite=normalsFinite and bool(np.isfinite(n).all())
            Check(bool(np.all(np.abs(np.linalg.norm(n,axis=1)-1)<.002)),node.get('name','mesh')+' unit normals')
            material=data['materials'][primitive['material']]
            if 'normalTexture' in material:
                hasTangents='TANGENT' in primitive['attributes']
                Check(hasTangents,node.get('name','mesh')+' authored normal-map tangents')
                if hasTangents:
                    tangents=Accessor(primitive['attributes']['TANGENT'])
                    Check(np.isfinite(tangents).all() and np.all(np.abs(np.linalg.norm(tangents[:,:3],axis=1)-1)<.002),node.get('name','mesh')+' finite unit tangents')
            if 'TEXCOORD_0' in primitive['attributes']:
                uv=Accessor(primitive['attributes']['TEXCOORD_0']);uvFinite=uvFinite and bool(np.isfinite(uv).all())
            if 'MachineGunPitch' in node.get('name',''):
                gunPoints.extend(p.tolist())
            if node.get('name')=='Geometry_Hull_Paint':
                rearHullTriangles.append(worldPoints[indices])
                centers=worldPoints[indices].mean(axis=1)
                selection=(np.abs(centers[:,0])<.5)&(np.abs(centers[:,1]-frontProbeHeight)<.15)&(np.abs(centers[:,2]+frontProbeForward)<.08)
                worldNormals=n@world[:3,:3].T
                frontNormals.extend(worldNormals[indices[selection]].mean(axis=1).tolist())
                # Probe a specified unadorned point on the front armor. An
                # average over all nose fittings also includes their backs.
                p0=worldPoints[indices[:,0]];e1=worldPoints[indices[:,1]]-p0;e2=worldPoints[indices[:,2]]-p0
                direction=np.array([0,0,1]);origin=np.array([.30,frontProbeHeight,-2.0])
                h=np.cross(direction,e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-12
                inv=np.zeros_like(det);inv[valid]=1/det[valid]
                s=origin-p0;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q[:,2]*inv;t=np.sum(e2*q,axis=1)*inv
                hits=np.where(valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>0))[0]
                if len(hits):
                    hit=hits[np.argmin(t[hits])];geometric=np.cross(e1[hit],e2[hit]);geometric/=np.linalg.norm(geometric)
                    frontProbe={'point':(origin+direction*t[hit]).tolist(),'normal':worldNormals[indices[hit]].mean(axis=0).tolist(),'windingNormal':geometric.tolist()}
    cloud=np.vstack(positions);bounds=[cloud.min(axis=0).tolist(),cloud.max(axis=0).tolist()]
    dimensions=(cloud.max(axis=0)-cloud.min(axis=0)).tolist()
    Check(args.high or triangles<=80000,'actual primitive count within 80000 triangle game budget')
    Check(degenerate==0,'no degenerate exported triangles')
    Check(normalsFinite and uvFinite and np.isfinite(cloud).all(),'finite positions, normals and UVs')
    Check(abs(bounds[0][1])<.002,'actual exported ground origin')
    Check(1.60<dimensions[0]<1.66 and 3.03<dimensions[2]<3.12 and 1.59<dimensions[1]<1.66,'selected early configuration metric envelope')
    Check(frontProbe is not None and frontProbe['normal'][2]<-.7 and frontProbe['windingNormal'][2]<-.7,'specified front armor surface actual normal and winding face -Z')
    Check(frontProbe is not None and abs(frontProbe['point'][2]-(World(hullIndex)[2,3]-frontProbeForward))<.02,
          'actual front armor probe lands at its declared forward plane')
    names={node.get('name') for node in nodes}
    rearArmor=nodes[hullIndex].get('extras',{})
    if rearArmor.get('RearArmorInclinedRequired'):
        degrees=rearArmor['RearArmorSlopeDegrees'];angle=math.radians(degrees);anchor=np.array(rearArmor['RearArmorTopAnchorBeforeGroundM']);normalB=np.array(rearArmor['RearArmorNormalBeforeGroundM']);normalG=normalB[[0,2,1]]*np.array([1,1,-1]);normal=World(hullIndex)[:3,:3]@normalG;normal/=np.linalg.norm(normal)
        Check(0<degrees<45 and np.linalg.norm(normalB-[0,-math.cos(angle),math.sin(angle)])<1e-6,'declared rear armor normal matches its inclined plane')
        body=np.concatenate(rearHullTriangles);a=body[:,0];e1=body[:,1]-a;e2=body[:,2]-a;direction=-normal;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid]
        for z in [.50,.90]:
            y=anchor[1]+math.tan(angle)*(z-anchor[2]);local=np.array([.48,z,-y,1]);target=(World(hullIndex)@local)[:3];origin=target+normal*.20;s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv;hits=np.where(valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>0))[0]
            if len(hits):
                hit=hits[np.argmin(t[hits])];point=origin+direction*t[hit];actual=np.cross(e1[hit],e2[hit]);actual/=np.linalg.norm(actual);probe={'heightBeforeGroundM':z,'surfaceErrorM':float(np.linalg.norm(point-target)),'normalDot':float(actual@normal)}
            else:probe={'heightBeforeGroundM':z,'surfaceErrorM':None,'normalDot':None}
            rearArmorProbes.append(probe);Check(probe['surfaceErrorM']is not None and probe['surfaceErrorM']<2e-5 and probe['normalDot']>.999,'actual rear armor position and normal at height '+str(z))
        if rearArmor.get('RearCornerSealRequired'):
            corners=np.array(rearArmor['RearCornerSealProbePointsBeforeGroundM']).reshape(-1,3)
            assert len(corners)==2
            for side,pointB in enumerate(corners):
                local=np.r_[pointB[[0,2,1]]*np.array([1,1,-1]),1];target=(World(hullIndex)@local)[:3];origin=target+normal*.20;s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv;hits=np.where(valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>0))[0]
                if len(hits):
                    hit=hits[np.argmin(t[hits])];point=origin+direction*t[hit];actual=np.cross(e1[hit],e2[hit]);actual/=np.linalg.norm(actual);probe={'rearCorner':side,'surfaceErrorM':float(np.linalg.norm(point-target)),'normalDot':float(actual@normal)}
                else:probe={'rearCorner':side,'surfaceErrorM':None,'normalDot':None}
                rearArmorProbes.append(probe);Check(probe['surfaceErrorM']is not None and probe['surfaceErrorM']<2e-5 and probe['normalDot']>.999,'actual rear side-corner armor closes the transition '+str(side))
        doorIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='Hatch_RearCargo');axis=World(doorIndex)[:3,1];axis/=np.linalg.norm(axis);declared=np.array(nodes[doorIndex]['extras']['HingeAxisBeforeGroundM']);expected=World(hullIndex)[:3,:3]@(declared[[0,2,1]]*np.array([1,1,-1]));expected/=np.linalg.norm(expected)
        Check(np.linalg.norm(axis-expected)<1e-6 and abs(axis@normal)<1e-6,'actual rear hinge axis lies in the inclined rear plane')
        fixed=next(node for node in nodes if node.get('name')=='RearDoorHingeFixed');pins=np.array(fixed['extras']['PinCentersBeforeGroundM']).reshape(-1,3);pins=pins[:,[0,2,1]]*np.array([1,1,-1]);pins=(np.c_[pins,np.ones(len(pins))]@World(hullIndex).T)[:,:3];delta=pins-World(doorIndex)[:3,3];radial=delta-np.outer(delta@axis,axis)
        Check(len(pins)==2 and np.max(np.linalg.norm(radial,axis=1))<1e-6,'inclined rear hinge pin centers remain coaxial with the actual door control')
    if nodes[hullIndex].get('extras',{}).get('DriverRightPortRequired'):
        Check('Hatch_DriverPortRight'in names and 'DriverPortHingeFixedRight'in names,'reference-required outer driver-side cover retains its independent control and fixed hinge')
    turretIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='TurretYaw')
    if nodes[turretIndex].get('extras',{}).get('TurretRearRequired'):
        hatchIndex=next((i for i,node in enumerate(nodes)if node.get('name')=='Hatch_TurretRear'),None)
        fixedIndex=next((i for i,node in enumerate(nodes)if node.get('name')=='TurretRearHingeFixed'),None)
        Check(hatchIndex is not None and fixedIndex is not None and parents.get(hatchIndex)==turretIndex and parents.get(fixedIndex)==turretIndex,
              'reference-required curved turret rear hatch and fixed bearings have separate turret owners')
        if hatchIndex is not None:
            extra=nodes[hatchIndex].get('extras',{})
            Check(extra.get('HingeAxisLocal')=='Z' and extra.get('OpenSignLocal')==-1 and extra.get('FullBodyContactExclusionM')==0,
                  'curved turret rear hatch retains its inclined rigid axis, outward sign and zero contact exclusion')
            Check(any('mesh'in nodes[i]for i in nodes[hatchIndex].get('children',[])),
                  'curved turret rear hatch has actual independent moving surfaces')
    for name in ['Type94Tankette','Hull','TurretYaw','MachineGunPitch','Hatch_Commander','Hatch_DriverRoof','Hatch_DriverVisor','Hatch_Engine','Hatch_RearCargo','Hatch_DriverPortLeft','Hatch_TurretPortLeft','Hatch_TurretPortRight']:
        Check(name in names,'independent node '+name)
    gunYawIndex=next((i for i,node in enumerate(nodes)if node.get('name')=='MachineGunYaw'),None)
    if gunYawIndex is not None:
        gunIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='MachineGunPitch')
        Check(parents.get(gunIndex)==gunYawIndex and nodes[parents[gunYawIndex]].get('name')=='TurretYaw','two-axis gun pivots retain their independent nested turret hierarchy')
        Check(np.linalg.norm(World(gunIndex)[:3,3]-World(gunYawIndex)[:3,3])<1e-7,'actual gun traverse and elevation axes share the ball centre')
        extra=nodes[gunYawIndex].get('extras',{})
        Check(extra.get('GunTraverseLimitsInferred')is True and extra.get('GunTraverseMinDegrees')==-8 and extra.get('GunTraverseMaxDegrees')==8,'export retains explicitly inferred gun traverse stops')
    rearIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='Hatch_RearCargo')
    latchName=nodes[rearIndex].get('extras',{}).get('LatchTurnerName')
    if latchName:
        latchIndex=next((i for i,node in enumerate(nodes)if node.get('name')==latchName),None)
        Check(latchIndex is not None and parents.get(latchIndex)==rearIndex,'declared rear latch retains its independent door parent')
        pending=list(nodes[latchIndex].get('children',[]))if latchIndex is not None else [];movingMeshes=0
        while pending:
            child=pending.pop();movingMeshes+=int('mesh'in nodes[child]);pending.extend(nodes[child].get('children',[]))
        Check(movingMeshes>0,'declared rear turning latch retains actual moving geometry')
    rearFace=nodes[rearIndex].get('extras',{})
    if rearFace.get('RearDoorFaceRequired'):
        def MeshTriangles(nodeIndex):
            result=[]
            for primitive in data['meshes'][nodes[nodeIndex]['mesh']]['primitives']:
                points=Accessor(primitive['attributes']['POSITION'])
                points=(np.c_[points,np.ones(len(points))]@World(nodeIndex).T)[:,:3]
                result.append(points[Accessor(primitive['indices']).reshape(-1,3)])
            return np.concatenate(result)
        def RayDistances(surface,origin,direction):
            a=surface[:,0];e1=surface[:,1]-a;e2=surface[:,2]-a
            h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1)
            valid=np.abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid]
            s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1)
            v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv
            return np.unique(np.round(t[valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>1e-7)],8))
        panelIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='Geometry_Hatch_RearCargo_Paint')
        panel=MeshTriangles(panelIndex);pointB=np.array(rearFace['ObservationHoleBeforeGroundM'])
        point=(World(hullIndex)@np.r_[pointB[[0,2,1]]*[1,1,-1],1])[:3]
        right=World(rearIndex)[:3,0];up=World(rearIndex)[:3,1]
        for x in [-.006,0,.006]:
            for z in [-.006,0,.006]:
                hits=RayDistances(panel,point+right*x+up*z+normal*.08,-normal)
                Check(not np.any(hits<.16),'observed rear hole is physically open at '+str((x,z)))
        width,height=rearFace['ObservationHoleWidthHeightM']
        for label,offset in [('left',-right*(width/2+.004)),('right',right*(width/2+.004)),
                             ('top',up*(height/2+.004)),('bottom',-up*(height/2+.004))]:
            hits=RayDistances(panel,point+offset+normal*.08,-normal);hits=hits[hits<.16]
            Check(len(hits)==2 and abs(hits[1]-hits[0]-.014)<2e-6,'actual 14mm door plate surrounds the hole at '+label)
        spindle=World(latchIndex)[:3,3]
        hits=RayDistances(panel,spindle+normal*.15,-normal)
        Check(not np.any(hits<.30),'concealed spindle passes through the actual door and fixed bearing bore')
        Check(rearFace.get('ExteriorSphericalGripPresent')is False and rearFace.get('ObservedFittingFunctionsAccepted')is False
              and rearFace.get('BottomAssemblyIndependentMotion')is False and rearFace.get('ConcealedLatchInferred')is True,
              'observed static fittings and inferred internal mechanism retain distinct declarations')
        pose=np.array(rearArmor['RearArmorPoseBeforeGroundRowMajor']).reshape(4,4)
        axisMap=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1.]])
        legacy=World(hullIndex)@axisMap@pose;inverseLegacy=np.linalg.inv(legacy)
        mountB=np.array(rearFace['ObservedCircularMountBeforeGroundM'])
        mount=(inverseLegacy@World(hullIndex)@np.r_[mountB[[0,2,1]]*[1,1,-1],1])[:3]
        capDots=[]
        for primitive in data['meshes'][nodes[panelIndex]['mesh']]['primitives']:
            points=Accessor(primitive['attributes']['POSITION']);indices=Accessor(primitive['indices']).reshape(-1,3)
            worldPoints=(np.c_[points,np.ones(len(points))]@World(panelIndex).T)[:,:3]
            local=(np.c_[worldPoints,np.ones(len(points))]@inverseLegacy.T)[:,:3]
            radii=np.linalg.norm(local[:,[0,2]]-mount[[0,2]],axis=1)
            cap=(np.abs(local[:,1]-(mount[1]-.014))<2e-6)&(radii<.0261)
            selected=indices[np.all(cap[indices],axis=1)]
            normals=Accessor(primitive['attributes']['NORMAL'])@World(panelIndex)[:3,:3].T
            capDots.extend((normals[selected]@normal).reshape(-1).tolist())
        Check(len(capDots)>=144 and min(capDots)>.99999,'observed circular mounting has actual flat front-cap normals, without a shaded bulb')
        for z in [.65,.80,.95]:
            target=(World(hullIndex)@axisMap@pose@np.array([.42,-1.12,z,1]))[:3]
            hits=RayDistances(np.concatenate(rearHullTriangles),target+normal*.04,-normal);hits=hits[hits<.10]
            Check(len(hits)==2 and abs(hits[1]-hits[0]-.008)<2e-6,'actual rear inner plate retains inferred 8mm thickness at '+str(z))
    fixedIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='Geometry_MachineGunFixedMount_Paint')
    flange=nodes[fixedIndex].get('extras',{})
    if flange.get('MgFlangeFastenerPatternRequired'):
        pieces=[];offset=0;allPoints=[];allFaces=[]
        for primitive in data['meshes'][nodes[fixedIndex]['mesh']]['primitives']:
            vertices=Accessor(primitive['attributes']['POSITION'])[:,[0,2,1]]*np.array([1,-1,1])
            faces=Accessor(primitive['indices']).reshape(-1,3);allPoints.append(vertices);allFaces.append(faces+offset);offset+=len(vertices)
        points=np.concatenate(allPoints);faces=np.concatenate(allFaces)
        _,first,inverse=np.unique(np.round(points,6),axis=0,return_index=True,return_inverse=True)
        vertices=points[first];indices=inverse[faces];adjacent=[set()for _ in vertices]
        for a,b,c in indices:adjacent[a].update([b,c]);adjacent[b].update([a,c]);adjacent[c].update([a,b])
        unseen=set(range(len(vertices)))
        while unseen:
            first=unseen.pop();group=[first];pending=[first]
            while pending:
                for i in adjacent[pending.pop()]:
                    if i in unseen:unseen.remove(i);group.append(i);pending.append(i)
            p=vertices[group];center=p.mean(axis=0)
            if .130<np.hypot(center[0],center[2])<.140 and .022<center[1]<.043 and np.ptp(p,axis=0).max()<.04:
                headTriangles=vertices[indices[np.isin(indices[:,0],group)]];pieces.append((p,center,headTriangles))
        Check(len(pieces)==6 and flange.get('MgFlangeFastenerCount')==6,'actual fixed flange contains six independent heads')
        angles=np.sort(np.mod([np.arctan2(c[2],c[0])for p,c,t in pieces],math.tau))
        Check(len(angles)==6 and np.max(np.abs(np.diff(np.r_[angles,angles[0]+math.tau])-math.tau/6))<1e-4,'actual flange heads follow the observed six-site angular pattern')
        for i,(p,center,headTriangles)in enumerate(pieces):
            normals=np.cross(headTriangles[:,1]-headTriangles[:,0],headTriangles[:,2]-headTriangles[:,0]);areas=np.linalg.norm(normals,axis=1);normals/=np.maximum(areas[:,None],1e-20)
            side=(abs(normals[:,1])<1e-4)&(areas>1e-12)
            selected=normals[side&(areas>areas[side].max()*.3)] if np.any(side)else np.empty((0,3))
            directions=np.sort(np.mod(np.arctan2(selected[:,2],selected[:,0]),math.tau));clusters=[]
            for angle in directions:
                if not clusters or angle-clusters[-1]>.01:clusters.append(float(angle))
            if len(clusters)>1 and clusters[0]+math.tau-clusters[-1]<.01:clusters.pop()
            Check(len(clusters)==6,'fixed flange head '+str(i)+' retains six real flat side facets')
            Check(abs(np.ptp(p[:,1])-flange['MgFlangeHeadDepthM'])<2e-6 and abs(center[1]-flange['MgFlangeHeadCenterYLocalM'])<2e-6,'fixed flange head '+str(i)+' retains its actual declared section depth and seat')
        Check(flange.get('MgFlangeSectionDimensionsInferred')is True,'flange section sizes remain explicitly inferred')
    gunExtra=nodes[next(i for i,node in enumerate(nodes)if node.get('name')=='MachineGunPitch')].get('extras',{})
    if gunExtra.get('MgRoundOpeningRequired'):
        gunIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='MachineGunPitch')
        inverseGun=np.linalg.inv(World(gunIndex));axisMapInverse=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1.]])
        pending=list(nodes[gunIndex].get('children',[]));openingFaces=[];flatCapDots=[]
        while pending:
            child=pending.pop();pending.extend(nodes[child].get('children',[]))
            if 'mesh'not in nodes[child]:continue
            transform=axisMapInverse@inverseGun@World(child)
            for primitive in data['meshes'][nodes[child]['mesh']]['primitives']:
                p=Accessor(primitive['attributes']['POSITION']);p=(np.c_[p,np.ones(len(p))]@transform.T)[:,:3]
                openingIndices=Accessor(primitive['indices']).reshape(-1,3);openingFaces.append(p[openingIndices])
                if nodes[child].get('name')=='Geometry_MachineGunPitch_Paint':
                    frontY=gunExtra['MgRoundOpeningCenterLocalM'][1];cap=(abs(p[:,1]-frontY)<2e-6)&(np.linalg.norm(p[:,[0,2]],axis=1)<.102)
                    selected=openingIndices[np.all(cap[openingIndices],axis=1)];normalLocal=Accessor(primitive['attributes']['NORMAL'])@transform[:3,:3].T
                    flatCapDots.extend(normalLocal[selected,1].reshape(-1).tolist())
        apertureTriangles=np.concatenate(openingFaces);a=apertureTriangles[:,0];e1=apertureTriangles[:,1]-a;e2=apertureTriangles[:,2]-a;direction=np.array([0.,-1.,0.]);h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid]
        def OpeningHits(point):
            origin=np.array(point)+[0,.12,0];s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv
            return np.unique(np.round(t[valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>1e-7)&(t<.25)],8))
        center=np.array(gunExtra['MgRoundOpeningCenterLocalM'])
        for x in[-.004,0,.004]:
            for z in[-.004,0,.004]:
                Check(len(OpeningHits(center+[x,0,z]))==0,'observed round gun opening is real through-moving-geometry at '+str((x,z)))
        radius=gunExtra['MgRoundOpeningRadiusM']
        for i in range(16):
            angle=math.tau*i/16;offset=np.array([math.cos(angle),0,math.sin(angle)])*radius
            Check(len(OpeningHits(center+offset*.9))==0,'actual round aperture retains its full declared inner rim at '+str(i))
            hits=OpeningHits(center+offset*1.1)
            Check(np.any(abs(hits-.12)<2e-6) and np.any(abs(hits-(.12+gunExtra['MgRoundOpeningBallDepthM']))<2e-6),'actual round aperture retains metal immediately outside its declared rim at '+str(i))
        for label,offset in [('left',[-radius-.005,0,0]),('right',[radius+.005,0,0]),('top',[0,0,radius+.005]),('bottom',[0,0,-radius-.005])]:
            hits=OpeningHits(center+offset)
            if gunExtra.get('MgFrontRaisedFittingRequired'):
                # This line may cross the new stock as well as both original
                # ball caps. Every extra hit must belong to its declared depth.
                front=np.array(gunExtra['MgFrontRaisedFittingFrontProbePointsLocalM']).reshape(-1,3)[0,1]
                root=gunExtra['MgFrontRaisedFittingRootYLocalM']
                ballCaps=np.any(abs(hits-.12)<2e-6) and np.any(abs(hits-(.12+gunExtra['MgRoundOpeningBallDepthM']))<2e-6)
                allowed=np.isclose(hits,.12,atol=2e-6,rtol=0)|np.isclose(hits,.12+gunExtra['MgRoundOpeningBallDepthM'],atol=2e-6,rtol=0)|((hits>=.12-(front-center[1])-2e-6)&(hits<=.12-(root-center[1])+2e-6))
                surrounded=ballCaps and len(hits)in [2,4] and np.all(allowed)
            else:
                surrounded=len(hits)==2 and abs(hits[-1]-hits[0]-gunExtra['MgRoundOpeningBallDepthM'])<2e-6
            Check(surrounded,'retained modeled ball surrounds the round opening at '+label)
        Check(gunExtra.get('MgRoundOpeningDimensionsInferred')is True and gunExtra.get('MgRoundOpeningFunctionAccepted')is False,'round-opening section and unknown function retain their inference boundary')
        Check(len(flatCapDots)>=12 and min(flatCapDots)>.99999,'actual round-bore front cap has flat normals without a false triangular dent')
        if gunExtra.get('MgFrontRaisedFittingRequired'):
            for i,point in enumerate(np.array(gunExtra['MgFrontRaisedFittingFrontProbePointsLocalM']).reshape(-1,3)):
                hits=OpeningHits(point)
                Check(len(hits)>=2 and abs(hits[0]-.12)<2e-6,'actual raised front fitting has physical depth at probe '+str(i))
            # An exterior gap beside the web must expose the retained ball,
            # rather than the removed flat triangle or an invented new hole.
            # Follow the declared web position when its layout changes. The
            # retained17mmleft/2mmdown offset reproduces the original V32 site.
            gapProbe=np.array(gunExtra['MgFrontRaisedFittingFrontProbePointsLocalM']).reshape(-1,3)[0]+[-.017,0,-.002]
            gapProbe[1]=center[1]
            hits=OpeningHits(gapProbe)
            Check(len(hits)==2 and abs(hits[0]-.12)<2e-6,'raised fitting leaves adjacent ball face visible without a flat filler')
            Check(gunExtra.get('MgFrontRaisedFittingDepthInferred')is True and gunExtra.get('MgFrontRaisedFittingFunctionAccepted')is False and gunExtra.get('MgFrontRaisedFittingIndependentMotion')is False,'raised fitting keeps inferred depth and unverified function without invented motion')
    socketExtra=nodes[turretIndex].get('extras',{})
    if socketExtra.get('MgSocketOpeningRequired'):
        inverseTurret=np.linalg.inv(World(turretIndex));axisMapInverse=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1.]])
        shellIndex=next(i for i,node in enumerate(nodes)if node.get('name')=='Geometry_TurretYaw_Paint');transform=axisMapInverse@inverseTurret@World(shellIndex);socketFaces=[]
        for primitive in data['meshes'][nodes[shellIndex]['mesh']]['primitives']:
            p=Accessor(primitive['attributes']['POSITION']);p=(np.c_[p,np.ones(len(p))]@transform.T)[:,:3];socketFaces.append(p[Accessor(primitive['indices']).reshape(-1,3)])
        socketTriangles=np.concatenate(socketFaces);a=socketTriangles[:,0];e1=socketTriangles[:,1]-a;e2=socketTriangles[:,2]-a;direction=np.array([0.,-1.,0.]);h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid]
        def SocketHits(point):
            origin=np.array(point)+[0,.24,0];s=origin-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;t=np.sum(e2*q,axis=1)*inv
            return t[valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)&(t>1e-7)&(t<.5)]
        center=np.array(socketExtra['MgSocketOpeningCenterLocalM'])
        for x in[-.06,0,.06]:
            for z in[-.06,0,.06]:Check(len(SocketHits(center+[x,0,z]))==0,'actual gun socket is open through front armor at '+str((x,z)))
        radius=socketExtra['MgSocketOpeningRadiusM']
        for offset in[[-radius-.025,0,0],[radius+.025,0,0],[0,0,radius+.025],[0,0,-radius-.025]]:Check(len(SocketHits(center+offset))>=2,'actual front armor remains around socket at '+str(offset))
        Check(socketExtra.get('MgSocketOpeningSectionInferred')is True,'socket clearance opening remains explicitly inferred')
    linkCounts=[]
    for side in ['Left','Right']:
        links=[n for n in nodes if n.get('name','').startswith('TrackLink_'+side+'_')]
        linkCounts.append(len(links));Check(len(links)>=80,side+' actual independent links')
        control=next(node for node in nodes if node.get('name')=='Track_'+side)
        expectedWidth=control.get('extras',{}).get('TrackWidthM')
        if expectedWidth is not None:
            Check(bool(trackWidths[side]) and all(abs(width-expectedWidth)<.003 for width in trackWidths[side]),side+' actual link width matches declared track section')
        for kind in ['Road0','Road1','Road2','Road3','Drive','Idler','Return0','Return1']:
            Check('Wheel_'+side+'_'+kind in names,side+' independent '+kind)
    Check(linkCounts[0]==linkCounts[1],'matching left and right link topology')
    materials={m['name']:m for m in data['materials']}
    if not args.geometry_only:
        for role in ['Paint','Track','Rubber','Steel']:
            material=materials['Material_Type94'+role];pbr=material['pbrMetallicRoughness']
            complete='baseColorTexture' in pbr and 'metallicRoughnessTexture' in pbr and 'normalTexture' in material and 'occlusionTexture' in material
            Check(complete,role+' actual complete PBR channels')
            Check(complete and material['occlusionTexture']['index']==pbr['metallicRoughnessTexture']['index'],role+' actual ORM packing')
        for name,material in materials.items():
            match=re.fullmatch(r'Material_Type94(Paint|Track|Rubber|Steel)(?:\.\d+)?',name)
            if match:
                role=match.group(1);pbr=material['pbrMetallicRoughness'];complete='baseColorTexture'in pbr and 'metallicRoughnessTexture'in pbr and 'normalTexture'in material and 'occlusionTexture'in material
                Check(name=='Material_Type94'+role,name+' actual canonical PBR binding')
                Check(complete,name+' actual rendered material has every PBR channel')
            else:Check(name in ['Material_Type94Dark','Material_Type94White','Material_Type94Red'],name+' is an explicitly allowed solid-color auxiliary')
    Check(all(not m.get('doubleSided',False) for m in materials.values()),'single-sided surfaces, no backface masking of normal errors')
    images=[]
    for entry in data.get('images',[]):
        view=data['bufferViews'][entry['bufferView']];raw=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        image=Image.open(io.BytesIO(raw));image.verify();images.append({'name':entry.get('name'),'size':list(image.size),'bytes':len(raw)})
    if not args.geometry_only:Check(len(images)==12,'actual embedded twelve PBR images')
    report={'file':str(args.glb.resolve()),'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'triangles':triangles,'meshNodes':sum('mesh'in n for n in nodes),
      'boundsGltfM':bounds,'dimensionsWidthHeightLengthM':dimensions,'independentLinks':linkCounts,'images':images,
      'frontArmorProbe':frontProbe,'rearArmorProbes':rearArmorProbes,'trackWidthsM':trackWidths,'degenerateTriangles':degenerate,'degenerateByNode':degenerateNodes,
      'scope':'Gray geometry only; no PBR acceptance' if args.geometry_only else 'Full PBR export audit',
      'checks':checks,'passed':all(c['passed'] for c in checks),'referenceAcceptance':'Separate visual comparison required; this audit does not prove photographic identity'}
    if args.out:args.out.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['triangles','meshNodes','dimensionsWidthHeightLengthM','independentLinks','passed']},indent=2))
    print('Failed checks:',[c['check'] for c in checks if not c['passed']])
    if not report['passed']:raise SystemExit(1)


if __name__=='__main__':Main()
