"""Reference-combed short leg wisps, reusing existing body-fibre triangles."""
import bpy,bisect,hashlib,json,math,random
import numpy as np
from pathlib import Path
from mathutils import Vector


def ReuseLegTufts(skin,vertices,faces,normals,uvs,rows,colors,fringeTags,pigmentSampler,means):
    project=Path(bpy.context.scene['DonkeyCartProject']);namespace={};file=project/'_blender/Script_DonkeyLegSections.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    stems,masses,profiles=namespace['MeasureLegSections'](skin,True);curve=namespace['Curve']
    sourceNamespace={};file=project/'_blender/Script_DonkeyLegAlbedo.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),sourceNamespace);bounds=sourceNamespace['BOUNDARIES']
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(source),check_existing=False);rgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(image)
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);luma=linear@np.array([.2126,.7152,.0722]);gy,gx=np.gradient(luma)
    blurNs={};file=project/'_blender/Script_DonkeyPhotoDetail.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),blurNs);blur=blurNs['BoxBlur']
    xx,xy,yy=blur(gx*gx,3),blur(gx*gy,3),blur(gy*gy,3);local=blur(luma,4)
    donors=[]
    for face in faces:
        if len(face)!=3 or any(i in fringeTags for i in face):continue
        if not all(uvs[i][1]>.5 for i in face):continue
        centre=sum((vertices[i] for i in face),Vector())/3
        if .80<centre.z<1.12 and -.06<centre.y<.52:donors.append(list(face))
    groups={(stem,zone):[[],[],0.] for stem in stems for zone in ('Fetlock','Carpal')}
    skin.data.calc_loop_triangles()
    for triangle in skin.data.loop_triangles:
        material=skin.data.materials[skin.data.polygons[triangle.polygon_index].material_index]
        if not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur')):continue
        ids=triangle.vertices;centre=sum((skin.data.vertices[i].co for i in ids),Vector())/3
        zone='Fetlock' if .125<centre.z<.245 else 'Carpal' if .315<centre.z<.445 else None
        if zone is None:continue
        stem=max(stems,key=lambda name:sum(masses[i][name] for i in ids))
        if sum(masses[i][stem] for i in ids)/3<.80:continue
        group=groups[(stem,zone)];weight=triangle.area*(.3+math.exp(-((centre.z-(.165 if zone=='Fetlock' else .375))/(.035 if zone=='Fetlock' else .040))**2))
        group[2]+=weight;group[0].append(triangle);group[1].append(group[2])
    rng=random.Random(19381038);rng.shuffle(donors);limit=min(800,len(donors)//4);accepted=[];retargeted=[];counts={stem:{zone:0 for zone in ('Fetlock','Carpal')} for stem in stems}
    def Photo(root,normal,stem):
        front='Front' in stem;left=stem.endswith('Left');profile=profiles[stem]
        cx,cy,wx,wy=[curve([(r[0],r[c]) for r in profile],root.z) for c in (1,2,3,4)]
        nx=(root.x-cx)/max(.01,wx*.5);ny=(root.y-cy)/max(.01,wy*.5);radius=max(.001,math.hypot(nx,ny));nx/=radius;ny/=radius
        cap=(normal.y if front else -normal.y)>abs(normal.x)*.85
        key=(('Front' if front else 'Rear')+('Left' if left else 'Right')) if cap else ('SideFront' if front else 'SideRear')
        sourceY=925-root.z*(925-302)/1.10;edges=bounds[key];lo=float(np.interp(sourceY,[r[0] for r in edges],[r[1] for r in edges]));hi=float(np.interp(sourceY,[r[0] for r in edges],[r[2] for r in edges]))
        horizontal=(-nx if front else nx) if cap else -ny;sourceX=(lo+hi)/2+horizontal*(hi-lo)*.4;u=int(np.clip(round(sourceX),1,1534));v=int(np.clip(round(sourceY),1,1022))
        angle=.5*math.atan2(2*xy[v,u],xx[v,u]-yy[v,u])+math.pi/2;du,dv=math.cos(angle),math.sin(angle)
        if dv<0:du,dv=-du,-dv
        flow=Vector(((-du if front else du),0,-dv)) if cap else Vector((0,-du,-dv))
        coherence=float(math.hypot(float(xx[v,u]-yy[v,u]),2*float(xy[v,u]))/max(1e-8,float(xx[v,u]+yy[v,u])))
        if coherence<.12:flow=Vector((0,-.12,-1))
        light=np.array((-.3,.5,.81) if front and cap else (.3,-.5,.81) if cap else (-.4,.5,.76));light/=np.linalg.norm(light)
        photoNormal=np.array([-nx,abs(ny) if front else -abs(ny),0]) if cap else np.array([-abs(nx),ny,0]);irradiance=.55+.45*max(0,float(photoNormal@light))
        pigment=linear[v,u]*(.50/irradiance)*np.array([1,1.03,1.10])
        return flow,pigment,float(luma[v,u]/max(.008,local[v,u])),[u,v],coherence
    for index in range(limit*3):
        if len(accepted)>=limit:break
        stem=stems[index%4];zone='Fetlock' if (index//4)%10<7 else 'Carpal';candidates,cdf,total=groups[(stem,zone)]
        if not candidates:continue
        sample=None
        for attempt in range(40):
            triangle=candidates[bisect.bisect_left(cdf,rng.random()*total)];a,b=rng.random(),rng.random()
            if a+b>1:a,b=1-a,1-b
            bary=(1-a-b,a,b);ids=triangle.vertices;root=sum((skin.data.vertices[i].co*w for i,w in zip(ids,bary)),Vector());normal=sum((skin.data.vertices[i].normal*w for i,w in zip(ids,bary)),Vector()).normalized()
            if zone=='Fetlock' and root.z<.125:continue
            base=np.array(pigmentSampler(root));flow,photo,contrast,pixel,coherence=Photo(root,normal,stem)
            if float(base.mean())>.09 or (zone=='Carpal' and contrast<1.03):continue
            tip=np.minimum(np.maximum(photo,base*1.12),np.minimum(.18,base*1.85))
            sample=(triangle,bary,root,normal,base,flow,tip,pixel,coherence);break
        if sample is None:continue
        triangle,bary,root,normal,base,flow,tip,pixel,coherence=sample
        if zone=='Fetlock':flow=flow.lerp(Vector((.15*math.tanh(root.x/.04),-.30,-1)).normalized(),.35)
        flow-=normal*flow.dot(normal)
        if flow.length<.05:continue
        flow.normalize();across=flow.cross(normal).normalized()
        length=rng.uniform(.016,.028) if zone=='Fetlock' else rng.uniform(.009,.016)
        width=rng.uniform(.0020,.0038) if zone=='Fetlock' else rng.uniform(.0015,.0030)
        lift=rng.uniform(.005,.009) if zone=='Fetlock' else rng.uniform(.0015,.0030)
        lower=root-normal*.00025;middle=root+flow*length*.58+normal*lift;upper=root+flow*length+normal*lift*.70+across*rng.uniform(-.0010,.0010)
        centres=[lower,middle,upper];corners=[];cornerNormals=[]
        for level,point in enumerate(centres):
            tangent=(centres[min(2,level+1)]-centres[max(0,level-1)]).normalized();right=(across-tangent*across.dot(tangent)).normalized();surface=right.cross(tangent).normalized();half=width*(.28 if level==0 else .50 if level==1 else .08)
            corners.extend((point-right*half,point+right*half));cornerNormals.extend((surface,surface))
        # Source face slots use clockwise middle/top corner order.
        corners=[corners[i] for i in [0,1,3,2,5,4]];cornerNormals=[cornerNormals[i] for i in [0,1,3,2,5,4]]
        weights={}
        for i,w in zip(triangle.vertices,bary):
            for g in skin.data.vertices[i].groups:
                name=skin.vertex_groups[g.group].name;weights[name]=weights.get(name,0)+g.weight*w
        weights=dict(sorted(weights.items(),key=lambda item:-item[1])[:4]);weightSum=sum(weights.values());weights={name:w/weightSum for name,w in weights.items()}
        slots=[i for face in donors[len(accepted)*4:len(accepted)*4+4] for i in face]
        coordinates=[(0,.5001),(.4999,.5001),(.4999,.75),(0,.75),(.4999,.9999),(0,.9999)]
        for vertex,corner in zip(slots,[0,1,2,0,2,3,3,2,4,3,4,5]):
            level=0 if corner<2 else .60 if corner<4 else 1;colour=base*(1-level)+tip*level
            if level>0:colour*=1.10
            vertices[vertex]=corners[corner];normals[vertex]=tuple(cornerNormals[corner]);uvs[vertex]=coordinates[corner];rows[vertex]=dict(weights);colors[vertex]=tuple(float(np.clip(colour[c]/means[0][c],.003,1)) for c in range(3))+(1,)
        retargeted.extend(slots);counts[stem][zone]+=1
        accepted.append({'leg':stem,'zone':zone,'pixel':pixel,'root':list(root),'tipLinearRgb':(tip*1.10).tolist(),'flowCoherence':coherence})
    return {'version':'20261026LegTuftsV44','wisps':len(accepted),'reusedFineTriangles':len(accepted)*4,'trianglesAdded':0,'segments':2,'widthM':[.0015,.0038],'lengthM':[.009,.028],'liftM':[.0015,.009],'atlasCell':0,'tipStudioExposureGain':1.10,'counts':counts,'availableDonorTriangles':len(donors),
        'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'fixed existing fine-fibre slots reassigned evenly across four legs, mostly to tapered fetlock feathering; photographic flow, restrained tip pigment, local curve normals and identical shared-corner skin weights',
        'samples':accepted[:16],'_retargetedVertices':retargeted}
