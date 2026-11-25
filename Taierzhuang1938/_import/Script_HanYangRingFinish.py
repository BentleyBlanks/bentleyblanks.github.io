"""Static display pose and continuous shading of the two exterior strap rings."""
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.spatial import ConvexHull


DisplayPoses = {
    'RearBand_ExternalAttachmentLoop': ((0., .0110, -.582), 0., 63., 46., 0.),
    'RearStock_ExternalAttachmentLoop': ((0., -.0327, .0438), 18., 76., 67., -.00148),
}


def PoseRingNode(name, node, positions, rearBandBounds=None):
    if name not in DisplayPoses:
        return None
    assert not any(key in node for key in ('matrix', 'translation', 'rotation', 'scale'))
    anchor, tilt, twist, fold, lower = DisplayPoses[name]
    frame = Rotation.from_euler('x', tilt, degrees=True)
    turn = frame * Rotation.from_euler('y', twist, degrees=True) * Rotation.from_euler('z', -fold, degrees=True) * frame.inv()
    translation = np.asarray(anchor) - turn.apply(anchor) + np.array([0., lower, 0.])
    if name=='RearBand_ExternalAttachmentLoop' and rearBandBounds is not None:
        # Roll the resting loop around its long projected axis in the side portrait.
        posed=turn.apply(np.unique(np.round(positions,6),axis=0))+translation
        sideView=np.column_stack((-posed[:,2],posed[:,1]))
        axis=np.linalg.eigh(np.cov(sideView.T))[1][:,-1]
        if axis[0]<0:axis=-axis
        roll=Rotation.from_rotvec(np.radians(16.)*np.array([0.,axis[1],-axis[0]]))
        centre=posed.mean(axis=0)
        shift=(rearBandBounds[1]-rearBandBounds[0])*np.array([.09,-.080,-.17])
        translation=centre+roll.apply(translation-centre)+shift
        turn=roll*turn
    node.update(translation=translation.tolist(), rotation=turn.as_quat().tolist())
    travel = np.linalg.norm(turn.apply(positions)+translation-positions, axis=1)
    return {'scope':'rigid exterior display pose; not a museum measurement',
            'maxVertexTravelM':round(float(travel.max()), 7)}


def SmoothRingFrames(name, streams, triangles):
    if name not in DisplayPoses:
        return streams
    faces = triangles.reshape(-1, 3)
    positions = streams['POSITION'].astype(np.float64)
    vertices, inverse = np.unique(np.round(positions, 6), axis=0, return_inverse=True)
    corners = positions[faces]
    faceNormals = np.cross(corners[:, 1]-corners[:, 0], corners[:, 2]-corners[:, 0])
    faceNormals /= np.maximum(np.linalg.norm(faceNormals, axis=1)[:, None], 1e-15)
    authored = streams['NORMAL']
    faceNormals *= np.where((faceNormals*authored[faces].mean(axis=1)).sum(axis=1)<0., -1., 1.)[:, None]
    merged = np.zeros_like(vertices)
    for corner in range(3):
        first = corners[:, (corner+1)%3]-corners[:, corner]
        second = corners[:, (corner+2)%3]-corners[:, corner]
        angle = np.arctan2(np.linalg.norm(np.cross(first, second), axis=1), (first*second).sum(axis=1))
        np.add.at(merged, inverse[faces[:, corner]], faceNormals*angle[:, None])
    normal = merged[inverse]
    lengths = np.linalg.norm(normal, axis=1)
    normal = np.where(lengths[:, None]>1e-9, normal/np.maximum(lengths[:, None], 1e-9), authored)
    tangent = streams['TANGENT'].copy()
    projected = tangent[:, :3]-normal*(normal*tangent[:, :3]).sum(axis=1)[:, None]
    lengths = np.linalg.norm(projected, axis=1)
    assert np.all(lengths>1e-6), name
    tangent[:, :3] = projected/lengths[:, None]
    return {**streams, 'NORMAL':normal.astype('<f4'), 'TANGENT':tangent}


def BandTrimSurface(sourcePoints, bounds):
    # The visible tab is a solid exterior relief. Register the face to the band
    # in the side photograph and roll its exposed perimeter into the narrow edge.
    low,high=bounds
    outline=np.array([(.095,.030),(.190,.053),(.822,.050),(.887,.030),
                      (.888,-.063),(.831,-.122),(.747,-.169),(.568,-.181),
                      (.411,-.154),(.246,-.081)])
    centre=outline.mean(axis=0)
    extent=high-low
    halfWidth=.36*np.ptp(sourcePoints[:,0])
    centreX=.5*(sourcePoints[:,0].min()+sourcePoints[:,0].max())
    layers=[]
    for side,faceScale in [(-1.,.86),(-.73,1.),(.73,1.),(1.,.86)]:
        silhouette=centre+(outline-centre)*faceScale
        layers.append(np.column_stack((np.full(len(outline),centreX+halfWidth*side),
                                       low[1]+extent[1]*silhouette[:,1],
                                       high[2]-extent[2]*silhouette[:,0])))
    return np.concatenate(layers)


def CloseFittingShell(name, streams, triangles, rearBandBounds=None):
    if name not in ('RearBand_ExternalAttachmentBridge','RearStock_ExternalAttachmentBridge'):
        return streams, triangles
    positions=np.unique(streams['POSITION'].astype(np.float64),axis=0)
    if name=='RearBand_ExternalAttachmentBridge' and rearBandBounds is not None:
        positions=BandTrimSurface(positions,rearBandBounds)
    hull=ConvexHull(positions)
    faces=hull.simplices.copy()
    planes=hull.equations[:,:3]
    corners=positions[faces]
    cross=np.cross(corners[:,1]-corners[:,0],corners[:,2]-corners[:,0])
    wrong=(cross*planes).sum(axis=1)<0
    faces[wrong]=faces[wrong][:,[0,2,1]]
    corners=positions[faces]
    axes=np.linalg.svd(positions-positions.mean(axis=0),full_matrices=False)[2]
    axes[2]=np.cross(axes[0],axes[1])
    align=planes@axes.T
    primary=np.argmax(abs(align),axis=1)
    negative=align[np.arange(len(align)),primary]<0
    charts=primary*2+negative.astype(int)
    uvs=np.zeros((len(faces),3,2));normals=np.zeros_like(corners);tangents=np.zeros((len(faces),3,4))
    smoothLimit=np.cos(np.radians(48))
    for chart in np.unique(charts):
        mask=charts==chart;axis=chart//2
        axisU=axes[(axis+1)%3];axisV=axes[(axis+2)%3]*(-1 if chart%2 else 1)
        projected=np.stack((corners[mask]@axisU,corners[mask]@axisV),axis=-1)
        low=projected.min(axis=(0,1));extent=np.ptp(projected,axis=(0,1))
        packed=(projected-low)/max(extent.max(),1e-8)
        uvs[mask]=(packed*.92+.04+np.array([chart%3,chart//3]))/np.array([3,2])
        for index in np.flatnonzero(mask):
            for corner,vertex in enumerate(faces[index]):
                adjacent=(faces==vertex).any(axis=1)&((planes@planes[index])>=smoothLimit)
                normal=planes[adjacent].mean(axis=0);normal/=np.linalg.norm(normal)
                tangent=axisU-normal*normal.dot(axisU);tangent/=np.linalg.norm(tangent)
                normals[index,corner]=normal
                tangents[index,corner,:3]=tangent
                tangents[index,corner,3]=1 if np.cross(normal,tangent).dot(axisV)>=0 else -1
    repaired={semantic:values.reshape(-1,values.shape[-1]).astype('<f4') for semantic,values in
              [('POSITION',corners),('NORMAL',normals),('TANGENT',tangents),('TEXCOORD_0',uvs)]}
    return repaired,np.arange(faces.size,dtype=triangles.dtype).reshape(-1,1)


def VertexDistance(points, targetPositions, targetIndices):
    faces=targetPositions[targetIndices.reshape(-1,3)].astype(np.float64)
    first,second,third=faces[:,0],faces[:,1],faces[:,2]
    planes=np.cross(second-first,third-first)
    planes/=np.maximum(np.linalg.norm(planes,axis=1)[:,None],1e-20)
    worst=0.
    for point in np.unique(points,axis=0):
        height=((point-first)*planes).sum(axis=1)
        projected=point-height[:,None]*planes
        inside=np.linalg.norm(planes,axis=1)>.5
        nearest=np.full(len(faces),np.inf)
        for start,end in ((first,second),(second,third),(third,first)):
            edge=end-start
            inside&=(np.cross(edge,projected-start)*planes).sum(axis=1)>=-1e-15
            fraction=np.clip(((point-start)*edge).sum(axis=1)/np.maximum((edge*edge).sum(axis=1),1e-25),0.,1.)
            nearest=np.minimum(nearest,np.linalg.norm(point-start-fraction[:,None]*edge,axis=1))
        worst=max(worst,float(np.where(inside,abs(height),nearest).min()))
    return worst
