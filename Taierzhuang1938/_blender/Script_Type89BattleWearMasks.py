"""Place V6 surface marks in the measured rest-pose cameras.

The mask PNGs are artist controls for both the editable Blender graphs and
the game atlas bake. RGB Finish = soot / steel / earth. RGB Relief =
visibility depth / signed height / a sparse dust fringe.
"""
from dataclasses import dataclass
from pathlib import Path
import argparse
import json
import struct

import cv2
import numpy as np


HERE = Path(__file__).resolve().parent
PROFILE = HERE.parent/'Model/Type89MediumTank/Data_BattleWearProfile.json'
PROFILE_TEXT = PROFILE.read_text(encoding='utf-8')
RECIPE = json.loads(PROFILE_TEXT)
CAMERA = RECIPE['camera']
PIXELS = CAMERA['pixelsPerMetre']
CENTER = np.array(CAMERA['centre'], np.float32)
DEPTH_SCALE = RECIPE['projection']['depthScale']
TRACK_VIEW_HALF = np.array(RECIPE['projection']['trackProjectionHalfM'], np.float32)
ARMOR_ROLES = {'Armor', 'CastArmor', 'Guard', 'Rubber', 'Exhaust', 'Steel'}


def Smooth(start, end, value):
    value = np.clip((value-start)/(end-start), 0, 1)
    return value*value*(3-2*value)


def SaveRgb(file, image):
    # cv2 writes RGB16 without shrinking the physical height and depth range.
    assert cv2.imwrite(str(file), image[:, :, ::-1])


def ReadRgb(file):
    image = cv2.imread(str(file), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(file)
    return image[:, :, ::-1].copy()


def Quantize(values, maximum=65535):
    dtype = np.uint16 if maximum == 65535 else np.uint8
    return np.rint(np.clip(values, 0, 1)*maximum).astype(dtype)


@dataclass
class Shot:
    name: str
    size: tuple
    right: np.ndarray
    up: np.ndarray
    axis: np.ndarray
    details: dict

    def Project(self, position):
        coordinates = position-CENTER
        return np.stack((
            coordinates@self.right*PIXELS+self.size[0]/2,
            coordinates@(-self.up)*PIXELS+self.size[1]/2,
            coordinates@self.axis,
        ), axis=-1)

    def Register(self, x, y):
        pairs = [self.details.get(coordinate+'Registration') for coordinate in ('x', 'y')]
        return tuple(np.interp(value, np.transpose(pair)[0], np.transpose(pair)[1]) if pair else value
                     for value, pair in zip((x, y), pairs))


def Shots():
    for name, details in RECIPE['views'].items():
        axis = np.array(details['axis'], np.float32)
        up = np.array([0, 1, 0] if name == 'Top' else [0, 0, 1], np.float32)
        right = np.cross(up, axis)
        yield Shot(name, tuple(details.get('size') or CAMERA['sizes'][name]), right, up, axis, details)


class Glb:
    def __init__(self, file):
        self.data = file.read_bytes()
        magic, version, length, jsonBytes, chunk = struct.unpack_from('<4sIII4s', self.data)
        assert (magic, version, length, chunk) == (b'glTF', 2, len(self.data), b'JSON')
        self.doc = json.loads(self.data[20:20+jsonBytes])
        self.bin = memoryview(self.data)[28+jsonBytes:]
        self.array = {}

    def Bytes(self, index):
        view = self.doc['bufferViews'][index]
        offset = view.get('byteOffset', 0)
        return self.bin[offset:offset+view['byteLength']]

    def Access(self, index):
        if index not in self.array:
            accessor = self.doc['accessors'][index]
            dtype = {5121:'u1', 5123:'<u2', 5125:'<u4', 5126:'<f4'}[accessor['componentType']]
            width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[accessor['type']]
            view = self.doc['bufferViews'][accessor['bufferView']]
            stride = view.get('byteStride', width*np.dtype(dtype).itemsize)
            self.array[index] = np.ndarray((accessor['count'], width), dtype=dtype,
                buffer=self.Bytes(accessor['bufferView']), offset=accessor.get('byteOffset', 0),
                strides=(stride, np.dtype(dtype).itemsize))
        return self.array[index]

    def Nodes(self):
        doc = self.doc
        scenes = doc['scenes']

        def Walk(index, parent):
            node = doc['nodes'][index]
            world = parent@Matrix(node)
            yield index, node, world
            for child in node.get('children', []):
                yield from Walk(child, world)

        for index in scenes[doc.get('scene', 0)]['nodes']:
            yield from Walk(index, np.eye(4, dtype=np.float32))

    def Geometry(self):
        for _, node, world in self.Nodes():
            if 'mesh' not in node:
                continue
            for primitive in self.doc['meshes'][node['mesh']]['primitives']:
                role = self.doc['materials'][primitive['material']]['extras']['Type89Role']
                yield node, world, primitive, role


def Matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], np.float32).reshape((4,4)).T
    x, y, z, w = node.get('rotation', [0,0,0,1])
    matrix = np.eye(4, dtype=np.float32)
    matrix[:3,:3] = np.array([
        [1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
        [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
        [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)],
    ])*node.get('scale', [1,1,1])
    matrix[:3,3] = node.get('translation', [0,0,0])
    return matrix


def ToBlender(vectors):
    return vectors[:,[0,2,1]]*np.array([1,-1,1], np.float32)


def ScreenTriangle(pixels, size):
    """Rasterize at texture pixel centres. Return flattened covered samples."""
    width, height = size
    x, y = pixels[0]
    u, v = pixels[1]-pixels[0]
    s, t = pixels[2]-pixels[0]
    determinant = u*t-v*s
    if abs(determinant) < 1e-6:
        return None
    low = np.maximum(np.ceil(pixels.min(axis=0)-.5).astype(int), 0)
    high = np.minimum(np.floor(pixels.max(axis=0)-.5).astype(int), (width-1,height-1))
    if np.any(low > high):
        return None
    yy, xx = np.ogrid[low[1]:high[1]+1,low[0]:high[0]+1]
    dx, dy = xx+.5-x, yy+.5-y
    b = (dx*t-dy*s)/determinant
    c = (dy*u-dx*v)/determinant
    rows, columns = np.where((b>=-1e-5)&(c>=-1e-5)&(b+c<=1.00001))
    if not len(rows):
        return None
    return rows+low[1], columns+low[0], b[rows,columns].astype(np.float32), c[rows,columns].astype(np.float32)


def Depth(model, shot, mask):
    width, height = shot.size
    depth = np.full((height,width), -8, np.float32)
    # An integral mask rejects triangles nowhere near an authored mark.
    visibleArea = cv2.integral(cv2.dilate(mask.astype(np.uint8), np.ones((13,13), np.uint8)))
    for node, world, primitive, _ in model.Geometry():
        coords = model.Access(primitive['attributes']['POSITION'])
        points = ToBlender(coords@world[:3,:3].T+world[:3,3])
        projected = shot.Project(points)
        indices = model.Access(primitive['indices']).reshape(-1,3)
        screen = projected[indices,:2]
        a = np.maximum(np.floor(screen.min(axis=1)-1).astype(int), 0)
        b = np.minimum(np.ceil(screen.max(axis=1)+1).astype(int), (width,height))
        keep = np.all(b > a, axis=1)
        a, b = (values[keep] for values in (a,b))
        intersects = visibleArea[b[:,1],b[:,0]]-visibleArea[a[:,1],b[:,0]]
        intersects -= visibleArea[b[:,1],a[:,0]]-visibleArea[a[:,1],a[:,0]]
        for ids, triangle in zip(indices[keep][intersects>0], screen[keep][intersects>0]):
            samples = ScreenTriangle(triangle, shot.size)
            if samples is None:
                continue
            y, x, u, v = samples
            p, q, r = projected[ids,2]
            depth[y,x] = np.maximum(depth[y,x], p+(q-p)*u+(r-p)*v)
    # At anti-aliased silhouettes, use the nearest occupied depth. Surfaces
    # more than the small projection tolerance behind it still reject marks.
    for _ in range(2):
        depth = np.where(depth>-7, depth, cv2.dilate(depth, np.ones((3,3), np.uint8)))
    return depth


def Noise(size, seed):
    w,h = size
    rng = np.random.default_rng(seed)
    result = np.zeros((h,w), np.float32)
    for step, value in [(44,.60),(18,.31),(5,.09)]:
        tile = rng.random((max(3,h//step),max(3,w//step)),dtype=np.float32)-.5
        result += cv2.resize(tile,(w,h),interpolation=cv2.INTER_CUBIC)*value
    return result


class Trace:
    def __init__(self, shot, seed):
        self.shot = shot
        w,h = shot.size
        self.soot = np.zeros((h,w), np.float32)
        self.steel = np.zeros_like(self.soot)
        self.earth = np.zeros_like(self.soot)
        self.dust = np.zeros_like(self.soot)
        self.height = np.zeros_like(self.soot)
        self.noise = Noise(shot.size, seed)
        rng = np.random.default_rng(seed+860)
        gy,gx = (max(5,dimension//4) for dimension in self.soot.shape)
        small = rng.random((gy,gx),dtype=np.float32)-.5
        self.grain = cv2.resize(small,shot.size,interpolation=cv2.INTER_LINEAR)
        self.seed = seed

    def Box(self, x, y, radius):
        height,width = self.soot.shape
        left,top = max(0,int(x-radius)),max(0,int(y-radius))
        right,bottom = min(width,int(x+radius)+1),min(height,int(y+radius)+1)
        rows,cols = np.ogrid[top:bottom,left:right]
        return np.s_[top:bottom,left:right], (cols+.5-x).astype(np.float32), (rows+.5-y).astype(np.float32)

    def Ellipse(self, x, y, a, b, degrees, margin):
        x,y = self.shot.Register(x,y)
        box, xx, yy = self.Box(x,y,max(a,b)*margin)
        angle = np.deg2rad(degrees)
        co,si = np.cos(angle),np.sin(angle)
        u,v = (xx*co+yy*si)/a, (-xx*si+yy*co)/b
        return box, np.hypot(u,v), np.arctan2(v,u)

    def Deposit(self, row, earth=False):
        x,y,a,b,angle,strength = row
        box,radius,_ = self.Ellipse(x,y,a,b,angle,1.52)
        noise = self.noise[box]
        grain = self.grain[box]
        distortion = radius+noise*(.96 if earth else .93)+grain*(.09 if earth else .13)
        fill = (1-Smooth(.24,1.33,distortion))*strength
        fill *= np.clip(.94+noise*.61+grain*(.14 if earth else .18),.69,1)
        field = self.earth if earth else self.soot
        np.maximum(field[box],fill,out=field[box])
        if earth:
            fringe = .13*strength*Smooth(.55,.98,distortion)*(1-Smooth(1.0,1.45,distortion))
            np.maximum(self.dust[box],fringe,out=self.dust[box])
            self.height[box] += fill*noise*.003

    def Scar(self, row, index):
        x,y,a,b,angle,strength = row
        box,radius,bearing = self.Ellipse(x,y,a,b,angle,2.9)
        phase = index*1.648+self.seed
        ragged = radius*(1+.094*np.sin(3*bearing+phase)+.10*np.sin(7*bearing-2*phase))
        ragged += self.noise[box]*.28
        pit = 1-Smooth(.17,.89,ragged)
        outside = 1-Smooth(.77,2.43,ragged)
        np.maximum(self.soot[box],strength*(.65*pit+.28*outside),out=self.soot[box])
        rim = Smooth(.44,.87,ragged)*(1-Smooth(.90,1.40,ragged))
        crescent = .28+.72*Smooth(-.83,.51,np.cos(bearing-phase))
        torn = .65+.35*Smooth(-.6,.9,np.sin(bearing*6+phase))
        metal = .69*rim*crescent*torn*strength + .08*pit*strength
        np.maximum(self.steel[box],metal,out=self.steel[box])
        self.height[box] += strength*(rim*.00145-pit*.0038)*min(1.2,a/10)

    def Graze(self, row, index):
        x,y,xx,yy,width,strength = row
        x,y = self.shot.Register(x,y)
        xx,yy = self.shot.Register(xx,yy)
        dx,dy = xx-x,yy-y
        length = np.hypot(dx,dy)
        box,dX,dY = self.Box((x+xx)/2,(y+yy)/2,length*.53+width*3)
        along = ((dX+dx/2)*dx+(dY+dy/2)*dy)/(length*length)
        cross = (-dX*dy+dY*dx)/length
        taper = np.maximum(0,np.sin(np.pi*np.clip(along,0,1)))**.61
        widthScale = width*(.41+.64*taper)*(1+self.noise[box]*.7)
        widthScale *= .91+.10*np.sin(along*22+index)+.055*np.cos(along*49.4-index)
        blade = (1-Smooth(.16,1.13,np.abs(cross+self.noise[box]*width*.93)/widthScale))
        interrupted = np.clip(.78+self.noise[box]*2.2+.16*np.sin(along*22+index)+.075*np.sin(along*83.7-index),.26,1)
        metal = (blade*taper*interrupted)**1.10*strength
        collar = taper*(1-Smooth(.45,2.2,np.abs(cross)/widthScale))*.37*strength
        np.maximum(self.steel[box],metal,out=self.steel[box])
        np.maximum(self.soot[box],collar,out=self.soot[box])
        self.height[box] -= metal*.0014


def TraceView(model, shot, directory, seed):
    trace = Trace(shot, seed)
    for row in shot.details['soot']:
        trace.Deposit(row)
    for row in shot.details['earth']:
        trace.Deposit(row, earth=True)
    for index,row in enumerate(shot.details['scars']):
        trace.Scar(row, index)
    for index,row in enumerate(shot.details['grazes']):
        trace.Graze(row, index)
    valid = (trace.soot+trace.steel+trace.earth+trace.dust)>.009
    depth = Depth(model, shot, valid)
    height = .5+trace.height/RECIPE['projection']['heightRangeM']
    stem = directory/('Texture_Type89Wear'+shot.name)
    SaveRgb(stem.with_name(stem.name+'Finish.png'), Quantize(np.stack((trace.soot,trace.steel,trace.earth),axis=-1)))
    SaveRgb(stem.with_name(stem.name+'Relief.png'), Quantize(np.stack((.5+depth*DEPTH_SCALE,height,trace.dust),axis=-1)))
    print(shot.name, 'traced',len(shot.details['scars']),'impact pocks;',int(valid.sum()),'affected projection pixels',flush=True)


def TrackControls(directory):
    """A tile describes non-periodic lumps in a single local track shoe."""
    size = 512
    halfX, halfY = TRACK_VIEW_HALF
    x = (np.arange(size, dtype=np.float32)[None,:]+.5)/size*2*halfX-halfX
    y = halfY-(np.arange(size, dtype=np.float32)[:,None]+.5)/size*2*halfY
    atlas = np.empty((2*size,2*size,3),np.uint16)
    for tile,config in enumerate(RECIPE['tracks']['variants']):
        seed,coverage = config['seed'],config['coverage']
        rng = np.random.default_rng(seed)
        mound = np.zeros((size,size),np.float32)
        density = np.zeros_like(mound)
        noise = Noise((size,size),seed)
        for _ in range(3+tile*2):
            xx, yy = rng.uniform(-.143,.143), rng.uniform(-.067,.064)
            a,b = rng.uniform(.029,.094)*(1+coverage*.26),rng.uniform(.015,.032)*(1+coverage*.42)
            angle = rng.uniform(-.48,.48)
            u = ((x-xx)*np.cos(angle)+(y-yy)*np.sin(angle))/a
            v = (-(x-xx)*np.sin(angle)+(y-yy)*np.cos(angle))/b
            patch = 1-Smooth(.31,1.4,np.hypot(u,v)+noise*.29)
            density = np.maximum(density, patch*rng.uniform(.60,1))
            mound = np.maximum(mound, patch**1.7*rng.uniform(.0013,.004)*(.6+coverage))
        strength = .47+.99*coverage
        clay = np.clip(density*strength*(.93+noise*.72)+coverage*.11,0,.98)
        height = np.clip(.5+(mound+noise*.0021*clay)/.017,0,1)
        dust = .20*Smooth(.04,.28,density)*(1-Smooth(.32,.66,density))
        row,column = (tile//2)*size,(tile%2)*size
        atlas[row:row+size,column:column+size] = Quantize(np.stack((clay,height,dust),axis=-1))
    SaveRgb(directory/'Texture_Type89TrackEarthControls.png',atlas)


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('destination',type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True,exist_ok=True)
    model = Glb(args.baseline)
    for index,shot in enumerate(Shots()):
        TraceView(model,shot,args.destination,36+index*41)
    TrackControls(args.destination)


if __name__ == '__main__':
    Main()
