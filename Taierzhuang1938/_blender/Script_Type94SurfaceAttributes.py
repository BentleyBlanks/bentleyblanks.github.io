"""Shared inferred material masks for locked studies and fresh recipe replays."""


def PrepareSurfaceAttributes(scene):
    visited=set();attributeCounts={}
    for obj in scene.objects:
        if obj.type!='MESH'or obj.data.as_pointer()in visited:continue
        visited.add(obj.data.as_pointer());mesh=obj.data
        cast=mesh.attributes.get('SurfaceCast')or mesh.attributes.new('SurfaceCast','FLOAT','FACE')
        contact=mesh.attributes.get('TrackContact')or mesh.attributes.new('TrackContact','FLOAT','FACE')
        castValue=1. if any(token in obj.name for token in ['FinalDrive','Wheel_','MachineGunFixedMount'])else 0.
        contactFaces=0
        for face in mesh.polygons:
            cast.data[face.index].value=castValue
            value=0.
            if obj.name.startswith('TrackLink_'):
                center=face.center;normal=face.normal
                # Local +Z is outward: grouser, rolling lands, inner guides.
                if center.z>.011 and normal.z>.60:value=1.
                elif -.010<center.z<-.005 and normal.z<-.65 and abs(center.x)<.058:value=.72
                elif center.z<-.018 and abs(normal.x)>.65:value=.55
                contactFaces+=int(value>0)
            contact.data[face.index].value=value
        attributeCounts[obj.name]={'cast':castValue,'contactFaces':contactFaces,'faces':len(mesh.polygons)}
    scene['SurfaceContactMasksInferred']=True
    return attributeCounts
