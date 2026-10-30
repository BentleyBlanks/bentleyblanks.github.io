"""Rest-space service dirt as linear albedo multipliers, never baked lighting.

The same field is evaluated in editable Blender sources and on the final GLB
after exact island restoration. Tiling PBR retains its physical microdetail;
COLOR_0 supplies broad part-aware dirt/fading without another texture atlas.
"""
import json,struct,hashlib,argparse
from pathlib import Path
import numpy as np

TARGET_ZONES={'Paint','WheelPaint','Canvas','Wood','Rubber','Chassis','Steel','AbradedSteel'}
PROFILE={'version':80,'severity':'MediumServiceWearWithVisibleLocalizedRust','space':'Closed rest-space; follows each rigid part during animation','method':'Tiling worn PBR plus standard linear COLOR_0 albedo multipliers','effects':['lower-body road grime','dry wheel dust','canvas hem staining and rain trails','uneven exposed-surface fading','coated timber wear','polished contact steel','uneven canvas bleaching,set-fold stains and worn hems'],'lightingBaked':False,'historicallyMeasured':False,'scope':'User-requested artistic service wear and abrasion; not damage evidence for a particular truck or battle'}

def Smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)

def Noise(p,seed=74):
    """Continuous trilinear value noise; independent of object/vertex ordering."""
    p=np.asarray(p,dtype=np.float64);cell=np.floor(p).astype(np.int64);f=p-cell;f=f*f*(3-2*f);out=np.zeros(len(p))
    for x in (0,1):
        for y in (0,1):
            for z in (0,1):
                c=(cell+np.array([x,y,z])).astype(np.uint32)
                with np.errstate(over='ignore'):
                    h=c[:,0]*np.uint32(73856093)^c[:,1]*np.uint32(19349663)^c[:,2]*np.uint32(83492791)^np.uint32(seed)
                    h=(h^(h>>np.uint32(16)))*np.uint32(2246822519);h=(h^(h>>np.uint32(13)))*np.uint32(3266489917);h^=h>>np.uint32(16)
                value=h.astype(np.float64)/4294967295.0
                weight=np.prod(np.where(np.array([x,y,z]),f,1-f),axis=1);out+=value*weight
    return out

def SurfaceColor(zone,part,positions):
    p=np.asarray(positions,dtype=np.float64).reshape(-1,3);z=p[:,2];n=Noise(p*2.7,941974);broad=Noise(p*.85,7401)
    if zone=='AbradedSteel' and not part.startswith('Wear_'):return SurfaceColor('Paint',part,p)
    colors=np.ones((len(p),4),np.float32)
    def Mix(a,b,t):return np.asarray(a)[None,:]*(1-t[:,None])+np.asarray(b)[None,:]*t[:,None]
    low=(1-Smooth(.35,1.35,z))*(.45+.55*n)
    if zone in {'Paint','WheelPaint'}:
        if part.startswith(('Wheel_','SpareWheel')):dirt=np.clip(.42+.42*n,0,1)
        else:
            contact=.30 if part.startswith(('RunningBoard','Bumper','FrontBumper','RearBumper')) else 0
            dirt=np.clip(low*1.12+contact+.10*(1-broad),0,.92)
        colors[:,:3]=Mix([.97,.97,.95],[.59,.50,.36],dirt)
    elif zone=='Canvas':
        # Broad bleaching, old fold stains and runoff must read at vehicle
        # distance. The4cm weave tile supplies fibres,not centimetre mud repeats.
        cloud=Smooth(.28,.72,Noise(p*np.array([1.2,.85,1.1]),7611))
        patch=Smooth(.32,.70,Noise(p*np.array([4.5,3.0,2.2]),7612))
        runs=Noise(p*np.array([6,6,.45]),7613)
        sun=Smooth(1.85,2.82,z)*(.55+.45*cloud)
        base=Mix([.90,.88,.80],[1,.98,.90],sun)
        weather=np.clip(.05+.15*(1-cloud)+.12*patch,0,.42)
        base*=Mix([1,1,1],[.75,.70,.58],weather)
        hem=(1-Smooth(1.30,2.02,z))*(.42+.58*n)
        rain=Smooth(.35,.66,runs)*(1-Smooth(1.65,2.82,z))
        edge=np.zeros(len(p))
        if part.startswith('Canvas_SideClosure'):
            axes=np.argsort(np.ptp(p,axis=0))[-2:];distances=np.minimum(p[:,axes]-p[:,axes].min(axis=0),p[:,axes].max(axis=0)-p[:,axes])
            edge=1-Smooth(.008,.045,distances.min(axis=1))
        dirt=np.clip(.45*hem+.20*rain+.15*edge,0,.82)
        colors[:,:3]=base*Mix([1,1,1],[.55,.48,.34],dirt)
        if any(token in part for token in ['Hem','Seam','Reinforcement','VerticalLap','Lashing','RollTie']):
            colors[:,:3]*=Mix([.97,.95,.90],[.78,.71,.57],np.clip(.20+.35*n,0,1))
    elif zone=='Wood':
        dirt=np.clip((1-Smooth(.85,1.65,z))*(.35+.55*n)+.12*(1-broad),0,.86)
        colors[:,:3]=Mix([.96,.94,.87],[.52,.43,.30],dirt)
    elif zone=='Rubber':
        if part.startswith(('Wheel_','SpareWheel')):
            dirt=np.clip(.35+.55*n,0,1)
            if 'TreadLug' in part:dirt*=.72
            colors[:,:3]=Mix([.56,.56,.53],[1,.88,.69],dirt)
        else:colors[:,:3]=[.55,.55,.52]
    elif zone=='Chassis':colors[:,:3]=Mix([.85,.81,.70],[.55,.43,.28],np.clip(.35+.5*n,0,1))
    elif zone in {'Steel','AbradedSteel'}:
        if part.startswith('Wear_'):colors[:,:3]=Mix([.98,.98,.98],[.84,.85,.85],np.clip(.12+.2*n,0,.5))
        else:colors[:,:3]=Mix([.94,.93,.88],[.60,.52,.39],np.clip(.2+.45*n+.2*low,0,.9))
    if not np.all(np.isfinite(colors)) or colors.min()<0 or colors.max()>1:raise RuntimeError('Invalid linear weathering colours')
    return colors

def ApplyNative(root):
    import bpy
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};summary=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        zone=obj.get('MaterialZone','Paint')
        if zone not in TARGET_ZONES:continue
        mesh=obj.data;ids=mesh.attributes.get('_SOURCE_PART_ID');positions=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices],dtype=np.float64)
        values=np.ones((len(mesh.vertices),4),np.float32)
        if ids:
            labels=np.array([int(round(i.value)) for i in ids.data])
            for label in np.unique(labels):
                use=labels==label;values[use]=SurfaceColor(zone,names[int(label)],positions[use])
        else:values=SurfaceColor(zone,obj.name,positions)
        attr=mesh.color_attributes.get('Weathering') or mesh.color_attributes.new(name='Weathering',type='FLOAT_COLOR',domain='POINT')
        attr.data.foreach_set('color',values.ravel());mesh.color_attributes.active_color_index=mesh.color_attributes.find('Weathering')
        summary.append({'part':obj.name,'zone':zone,'vertices':len(values),'minimumRgb':values[:,:3].min(axis=0).tolist(),'maximumRgb':values[:,:3].max(axis=0).tolist()})
    root['ServiceWeatheringJson']=json.dumps(PROFILE);return summary

def ReadGlb(path):
    raw=Path(path).read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);start=20+length+8;return raw,doc,raw[start:]

def WriteGlb(path,doc,data):
    data+=b'\0'*((-len(data))%4);doc['buffers'][0]['byteLength']=len(data);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data)

def ApplyGlb(path):
    raw,doc,data=ReadGlb(path);originalData=data;rows=[]
    def Access(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        item=np.dtype(dtype).itemsize;return np.ndarray((a['count'],width),dtype=dtype,buffer=originalData,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*item),item)).astype(np.float64)
    def Matrix(n):
        if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
        x,y,z,w=n.get('rotation',[0,0,0,1]);r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        m=np.eye(4);m[:3,:3]=r@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
    root=next(n for n in doc['nodes'] if n.get('name')=='IsuzuType94Truck');names={int(k):v for k,v in root.get('extras',{}).get('SourcePartNames',{}).items()}
    def Walk(i,parent):
        nonlocal data
        node=doc['nodes'][i];m=parent@Matrix(node)
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                name=doc['materials'][primitive['material']]['name'];zone=name.removeprefix('Material_Isuzu')
                if zone not in TARGET_ZONES:continue
                p=Access(primitive['attributes']['POSITION']);world=p@m[:3,:3].T+m[:3,3];blender=world[:,[0,2,1]]*np.array([1,-1,1]);colors=np.ones((len(p),4),np.float32)
                if '_SOURCE_PART_ID' in primitive['attributes']:
                    ids=np.rint(Access(primitive['attributes']['_SOURCE_PART_ID'])[:,0]).astype(int)
                    for label in np.unique(ids):
                        use=ids==label;colors[use]=SurfaceColor(zone,names[int(label)],blender[use])
                else:colors=SurfaceColor(zone,node.get('name',''),blender)
                pad=(-len(data))%4;data+=b'\0'*pad;offset=len(data);payload=colors.astype('<f4').tobytes();data+=payload
                view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload),'target':34962})
                primitive['attributes']['COLOR_0']=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5126,'count':len(colors),'type':'VEC4'})
                rows.append({'node':node.get('name'),'zone':zone,'vertices':len(colors),'minimumRgb':colors[:,:3].min(axis=0).tolist(),'maximumRgb':colors[:,:3].max(axis=0).tolist()})
        for child in node.get('children',[]):Walk(child,m)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:Walk(i,np.eye(4))
    root.setdefault('extras',{})['ServiceWeatheringJson']=json.dumps(PROFILE);WriteGlb(path,doc,data)
    return {'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'originalBinPrefixRetained':data.startswith(originalData),'coloredPrimitives':len(rows),'vertices':sum(r['vertices'] for r in rows),'profile':PROFILE,'rows':rows}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--glb',required=True);parser.add_argument('--report');args=parser.parse_args();report=ApplyGlb(args.glb)
    if args.report:Path(args.report).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)
