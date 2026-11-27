"""Shared masks and rigid-clod footprint rules for the Type89 sediment pass."""
import json
import math
from pathlib import Path

import numpy as np


ASSET = Path(__file__).resolve().parent.parent/'Model'/'Type89MediumTank'
PROFILE_TEXT = (ASSET/'Data_SedimentProfile.json').read_text(encoding='utf-8')
PROFILE = json.loads(PROFILE_TEXT)
TRACK_CONTROL = 'Texture_Type89SedimentTread.png'
GRAIN = 'Texture_Type89SedimentGrain.png'


def Tiles():
    indices = {}
    for side,ranges in PROFILE['track']['zones'].items():
        for low,high,sequence in ranges:
            for i in range(low,high+1):
                indices[f'Mesh_TrackLink{side}{i:03d}'] = sequence[(i-low)%len(sequence)]
    assert len(indices)==162 and set(indices.values())=={0,1,2,3}
    return indices


def BodyKind(name):
    for index,key in enumerate(('hull','lower','wheel'),1):
        if any(name.startswith(prefix) for prefix in PROFILE['body']['starterNames'][key]):
            return index
    return 0


def GrainCoords(x,y,z,op):
    return (op.add(op.mul(op.add(y,3.44),.162),op.mul(x,.012)),
            op.mul(op.add(op.add(z,.57),op.mul(x,.44)),.23))


def BodyLayers(position,normal,grain,kind,op):
    x,y,z = position
    nx,ny,nz = normal
    macro,grit,_ = grain
    setting = PROFILE['body']
    s,m,hi,one = op.smooth,op.mul,op.maximum,op.oneMinus
    active = s(kind,.1,.9)
    wheel = s(kind,2.35,2.71)
    low = one(s(z,.28,.716))
    outward = m(s(op.absolute(x),.59,.85),s(op.absolute(nx),.17,.73))
    film = m(s(macro,.32,.68),.43)
    clasts = s(op.add(m(macro,.59),m(grit,.41)),.433,.633)
    flecks = hi(film,clasts)
    side = m(setting['coatSide'],m(low,outward))
    wheels = m(setting['coatWheel'],m(wheel,m(outward,s(macro,.38,.69))))
    nose = m(setting['coatBow'],m(m(s(y,1.46,1.97),s(ny,.16,.68)),one(s(z,.60,.82))))
    cake = m(active,m(hi(hi(side,wheels),nose),flecks))
    shelf = m(s(op.absolute(x),.69,.96),m(s(nz,.27,.76),m(s(z,.91,1.17),one(s(z,1.40,1.59)))))
    marginalGrain = m(s(macro,.30,.49),one(s(macro,.53,.73)))
    fringe = m(m(outward,hi(low,m(wheel,.39))),marginalGrain)
    powder = m(active,m(setting['powderOpacity'],hi(m(shelf,s(macro,.39,.68)),m(fringe,.84))))
    return cake,powder


def Dryness(cake,grain,op):
    return op.add(op.mul(op.oneMinus(op.smooth(cake,.16,.94)),.52),op.mul(grain[2],.36))


def ClodScale(coordinates,moving):
    """Widen the existing footprint in shoe-local XY, keeping its outward height."""
    positions = np.asarray(coordinates,np.float32)
    centre = positions.mean(axis=0)
    scale = np.array([PROFILE['track']['hullClodScale'],1,1],np.float32)
    if moving:
        settings = PROFILE['track']
        limits = [settings['maximumShoeX'],settings['maximumShoeAbsY']]
        relative = positions-centre
        for axis in (0,1):
            limit = max(limits[axis],float(np.max(np.abs(positions[:,axis]))))
            lo,hi = relative[:,axis].min(),relative[:,axis].max()
            headroom = min((limit-centre[axis])/max(1e-5,hi),
                           (limit+centre[axis])/max(1e-5,-lo))
            scale[axis] = max(1,min(settings['trackClodScale'][axis],headroom))
    return centre,scale


def ClayCap(origin,radii,seed,layered):
    # Two caps share a profile format. The twelve-triangle form keeps an
    # inset shoulder, while the eight-triangle form fills gaps in other shoes.
    centre = np.asarray(origin,np.float32)
    rx,ry,height = radii
    phase = seed%57*.041
    def Ring(count,radius,z,offset):
        angles = np.linspace(0,2*math.pi,count,endpoint=False)+phase+offset
        rhythm = 1+.10*np.sin(3*angles+seed)+.065*np.cos(5*angles-seed)
        u = rx*np.cos(angles)*rhythm*radius
        v = ry*np.sin(angles)*rhythm*radius
        rise = z+(np.sin(angles*2+seed)*.55+np.cos(angles*3+phase)*.45)*height*.097
        return np.column_stack((u,v,rise))
    out = Ring(6 if layered else 8,1,0,0)
    crest = [rx*.105*math.sin(seed),ry*.093*math.cos(seed),height]
    if layered:
        middle = Ring(3,.58,.70*height,math.pi/7)
        points = np.vstack((out,middle,crest))
        faces = []
        for i in range(3):
            a,b,c = 2*i,2*i+1,(2*i+2)%6
            m,n = 6+i,6+(i+1)%3
            faces.extend(((a,b,m),(b,c,m),(c,n,m),(m,n,9)))
    else:
        points = np.vstack((out,crest))
        faces = [(i,(i+1)%8,8) for i in range(8)]
    return (points+centre).astype(np.float32),np.asarray(faces,np.uint16)


def ExistingTreadCap(points,name):
    low,high = points.min(axis=0),points.max(axis=0)
    origin = np.array([(low[0]+high[0])*.5,(low[1]+high[1])*.5,low[2]])
    size = high-low
    radii = (.445*size[0],.445*size[1],size[2])
    newPoints,triangles = ClayCap(origin,radii,sum(name.encode()),True)
    newPoints[:,2] = np.clip(newPoints[:,2],low[2],high[2])
    return newPoints,triangles,origin,radii


def ClodUv(points,origin,radii,preset):
    d = (points[:,:2]-np.asarray(origin[:2]))/np.asarray(radii[:2])/1.29
    return (np.asarray(preset['offsetPixels'])+d*np.array([1,-1])*preset['halfSizePixels'])/preset['dimensionsPixels']
