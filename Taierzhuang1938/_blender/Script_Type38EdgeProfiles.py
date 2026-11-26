"""Rebuild rounded profiles on the visible game asset's exterior trim."""
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import ConvexHull


def ReadPoints(doc, views, primitive):
    accessor = doc['accessors'][primitive['attributes']['POSITION']]
    return np.frombuffer(views[accessor['bufferView']], dtype='<f4').reshape(-1, 3)


def WriteAttributes(doc, views, primitive, points, normals, tangents, uv, faces):
    attrs = primitive['attributes']
    for slot,items in [(attrs['POSITION'],points),(attrs['NORMAL'],normals),
                       (attrs['TANGENT'],tangents),(attrs['TEXCOORD_0'],uv),
                       (primitive['indices'],faces.reshape(-1,1))]:
        accessor = doc['accessors'][slot]
        data = np.asarray(items,dtype='<u2' if accessor['componentType']==5123 else '<f4')
        accessor['count'] = len(data)
        views[accessor['bufferView']] = data.tobytes()
        for key,calc in [('min',np.min),('max',np.max)]:
            if key in accessor:
                accessor[key] = calc(data,axis=0).tolist()


def Ease(lo, hi, x):
    t = np.clip((x-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)


def Outline(points, segments):
    center = (points.max(axis=0)+points.min(axis=0))*.5
    span = np.ptp(points,axis=0)*.5
    plane = ConvexHull((points-center)/span).equations
    theta = np.arange(segments)*2*np.pi/segments
    direction = np.column_stack((np.cos(theta),np.sin(theta)))
    heading = direction @ plane[:,:2].T
    radius = np.min(np.where(heading>0,-plane[:,2]/np.maximum(heading,1e-10),np.inf), axis=1)
    outline = np.minimum(gaussian_filter1d(radius,1,mode='wrap'),radius)[:,None]*direction*span
    return center, np.vstack((outline,outline[0]))


class ProfileMesh:
    def __init__(self, segments):
        self.segments = segments
        self.positions = []
        self.uv = []
        self.faces = []

    def Ring(self, points, uv):
        start = len(self.positions)
        self.positions.extend(points)
        self.uv.extend(uv)
        return np.arange(start,start+len(points))

    def Strip(self, previous, following, flip=False):
        for i in range(self.segments):
            a,b,c,d = previous[i],previous[i+1],following[i],following[i+1]
            self.faces.extend(((a,d,c),(a,b,d)) if flip else ((a,c,d),(a,d,b)))

    def Fill(self, points, uv, center, centerUv, flip=False):
        rings = [self.Ring(p,t) for p,t in zip(points,uv,strict=True)]
        tip = self.Ring([center],[centerUv])[0]
        for a,b in zip(rings[0][:-1],rings[0][1:],strict=True):
            self.faces.append((tip,b,a) if flip else (tip,a,b))
        for a,b in zip(rings,rings[1:]):
            self.Strip(a,b,flip)

    def Write(self, doc, views, primitive):
        points,uv,faces = np.asarray(self.positions),np.asarray(self.uv),np.asarray(self.faces)
        tri = points[faces]
        edgeA,edgeB = tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]
        normal = np.cross(edgeA,edgeB)
        area = np.linalg.norm(normal,axis=1)
        assert area.min()>1e-12
        normal /= area[:,None]
        uvA,uvB = uv[faces[:,1]]-uv[faces[:,0]],uv[faces[:,2]]-uv[faces[:,0]]
        det = uvA[:,0]*uvB[:,1]-uvA[:,1]*uvB[:,0]
        assert np.min(np.abs(det))>1e-10
        tangent = (edgeA*uvB[:,1,None]-edgeB*uvA[:,1,None])/det[:,None]
        bitangent = (edgeB*uvA[:,0,None]-edgeA*uvB[:,0,None])/det[:,None]
        welded,group = np.unique(points.round(7),axis=0,return_inverse=True)
        smooth = np.zeros_like(welded)
        side,up = np.zeros_like(points),np.zeros_like(points)
        for i in range(3):
            a = tri[:,(i+1)%3]-tri[:,i]
            b = tri[:,(i+2)%3]-tri[:,i]
            angle = np.arctan2(np.linalg.norm(np.cross(a,b),axis=1),np.sum(a*b,axis=1))
            corner = faces[:,i]
            np.add.at(smooth,group[corner],normal*angle[:,None])
            np.add.at(side,corner,tangent*angle[:,None])
            np.add.at(up,corner,bitangent*angle[:,None])
        smooth = smooth[group]
        smooth /= np.linalg.norm(smooth,axis=1,keepdims=True)
        side -= smooth*np.sum(smooth*side,axis=1,keepdims=True)
        side /= np.linalg.norm(side,axis=1,keepdims=True)
        hand = np.sign(np.sum(np.cross(smooth,side)*up,axis=1))
        assert np.isfinite(side).all() and np.all(np.abs(hand)==1)
        WriteAttributes(doc,views,primitive,points,smooth,np.column_stack((side,hand)),uv,faces)
        return len(faces)


def ShapeButtCap(doc, views, primitive):
    original = ReadPoints(doc,views,primitive)
    # The stock end is slanted. Sample the imported shell in its own facing plane.
    scale = np.hypot(1,.156)
    axes = np.array([[1,0,0],[0,1/scale,-.156/scale],[0,.156/scale,1/scale]])
    surface = original @ axes
    mesh = ProfileMesh(88)
    center,outline = Outline(surface[:,:2],mesh.segments)
    hull = ConvexHull(surface).equations
    hull = hull[np.abs(hull[:,2])>1e-5]
    depth = hull[:,2]
    radii = np.array([.20,.44,.66,.81,.90,.95,.977,.992,.998])

    def Envelope(fraction):
        xy = center+fraction*outline
        values = -(xy @ hull[:,:2].T+hull[:,3])/depth
        front = values[:,depth<0].max(axis=1)
        back = values[:,depth>0].min(axis=1)
        front = gaussian_filter1d(front[:-1],1.75,mode='wrap')
        back = gaussian_filter1d(back[:-1],1.75,mode='wrap')
        return xy,np.r_[front,front[0]],np.r_[back,back[0]]

    # Fit the broad facing as a smooth dome. The sampled rim retains the
    # original silhouette and wraps into the wood at the toe and heel.
    xy,_,back = Envelope(.61)
    span = np.ptp(outline,axis=0)*.5
    def Terms(points):
        x,y = ((points-center)/span).T
        return np.column_stack((np.ones_like(x),x,y,x*x,y*y,x*y))
    inner = Envelope(.24)
    samples = np.vstack((Terms(xy),Terms(inner[0])))
    fit = np.linalg.lstsq(samples,np.r_[back,inner[2]],rcond=None)[0]
    rear,front,rearUv,frontUv = [],[],[],[]
    for r in radii:
        xy,lower,upper = Envelope(r)
        t = np.clip((r-.67)/.323,0,1)
        blend = t*t*(3-2*t)
        upper = (1-blend)*(Terms(xy) @ fit)+blend*upper
        thickness = upper-lower
        assert thickness.min()>0
        # The outer edge closes at a common rounded profile across the chart seam.
        roundOver = .46*np.clip((r-.943)/.055,0,1)**2
        rear.append(np.column_stack((xy,upper-thickness*roundOver)) @ axes.T)
        front.append(np.column_stack((xy,lower+thickness*roundOver)) @ axes.T)
        chart = ((xy-center)/span)*[.221,.447]
        rearUv.append(chart+[.255,.5])
        frontUv.append(chart+[.745,.5])
    mesh.Fill(rear,rearUv,np.r_[center,fit[0]] @ axes.T,[.255,.5])
    frontCenter = (Envelope(0)[1][0]+.0001)
    mesh.Fill(front,frontUv,np.r_[center,frontCenter] @ axes.T,[.745,.5],flip=True)
    phase = np.linspace(.04,.96,mesh.segments+1)
    lip = mesh.Ring(rear[-1],np.column_stack((np.full_like(phase,.484),phase)))
    heel = mesh.Ring(front[-1],np.column_stack((np.full_like(phase,.515),phase)))
    mesh.Strip(lip,heel)
    return mesh.Write(doc,views,primitive)


def ShapeRolledBand(doc, views, primitive):
    original = ReadPoints(doc,views,primitive)
    mesh = ProfileMesh(72)
    center,outline = Outline(original[:,:2],mesh.segments)
    x = outline[:,0]
    radial = outline/np.linalg.norm(outline,axis=1,keepdims=True)
    first,last = original[:,2].min(),original[:,2].max()
    phase = np.linspace(.035,.965,mesh.segments+1)
    width = last-first
    roll = width*.071
    # The fillet is tangent to both the ring face and the outer shell. The
    # several intermediate rings carry the highlight through grazing angles.
    arc = [(1-np.cos(a),1-np.sin(a)) for a in np.linspace(0,np.pi/2,6)]
    end = width/roll
    innerLip = .0935*width/roll
    bands = [(0,innerLip), *arc, (4.8,0), (end-4.8,0),
             *((end-along,inset) for along,inset in reversed(arc)), (end,innerLip)]
    points = [np.column_stack((center+outline-radial*(inset*roll),np.full_like(x,first+along*roll)))
              for along,inset in bands]
    charts = [mesh.Ring(ring,np.column_stack((np.full_like(x,u),phase)))
              for ring,u in zip(points,np.linspace(.06,.874,len(points)),strict=True)]
    for a,b in zip(charts,charts[1:]):
        mesh.Strip(a,b,flip=True)
    inner = [mesh.Ring(ring,np.column_stack((np.full_like(x,u),phase)))
             for ring,u in [(points[-1],.896),(points[0],.978)]]
    mesh.Strip(*inner,flip=True)
    return mesh.Write(doc,views,primitive)


def BlendCoverCrown(doc, views, primitive):
    attrs = primitive['attributes']

    def Array(slot, width):
        accessor = doc['accessors'][slot]
        return np.frombuffer(views[accessor['bufferView']],
                             dtype='<u2' if accessor['componentType']==5123 else '<f4').reshape(-1,width)

    points = ReadPoints(doc,views,primitive)
    normal = Array(attrs['NORMAL'],3)
    tangent = Array(attrs['TANGENT'],4)
    uv = Array(attrs['TEXCOORD_0'],2)
    faces = Array(primitive['indices'],3).copy()
    tri = points[faces]
    faceNormal = np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
    faceNormal /= np.maximum(1e-12,np.linalg.norm(faceNormal,axis=1,keepdims=True))
    # The sides are separate meshes. Average the visible crown across the cut;
    # the inward-facing end and seam facets keep their existing frame.
    crown = (faceNormal[:,1]>.52)&(tri[:,:,1].min(axis=1)>.051)&(np.abs(tri[:,:,0]).min(axis=1)<.0042)
    outer = np.unique(faces[crown])
    outer = outer[np.abs(points[outer,0])<.0042]
    x,y,z = points[outer].T
    top = points[(np.abs(points[:,0])<.002)&(points[:,1]>.055)]
    fit = np.polynomial.Polynomial.fit(top[:,2],top[:,1],3)
    ideal = np.column_stack((x/.021,np.ones_like(x),-fit.deriv()(z)))
    ideal /= np.linalg.norm(ideal,axis=1,keepdims=True)
    strength = 1-Ease(.00055,.0042,np.abs(x))
    blended = normal[outer]+strength[:,None]*(ideal-normal[outer])
    blended /= np.linalg.norm(blended,axis=1,keepdims=True)
    direction = tangent[outer,:3]-blended*np.sum(tangent[outer,:3]*blended,axis=1,keepdims=True)
    direction /= np.linalg.norm(direction,axis=1,keepdims=True)
    remap = np.arange(len(points))
    remap[outer] = len(points)+np.arange(len(outer))
    faces[crown] = remap[faces[crown]]
    WriteAttributes(doc,views,primitive,np.vstack((points,points[outer])),np.vstack((normal,blended)),
                    np.vstack((tangent,np.column_stack((direction,tangent[outer,3])))),
                    np.vstack((uv,uv[outer])),faces)
