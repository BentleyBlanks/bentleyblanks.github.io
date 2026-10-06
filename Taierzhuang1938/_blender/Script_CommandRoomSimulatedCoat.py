"""Static cloth drape, baked from a sewn pattern with gravity in Blender.

The cached solver result makes rebuilds deterministic. It is a real open shell
with attached sleeves and collar; surface seams follow the deformed topology.
"""
import bmesh
coatData=json.loads((GAME/'_blender/Data_CommandRoomCoatMesh.json').read_text(encoding='utf-8'))
coatx=-.44;coaty=1.25;coatTop=2.655
neck=Vector((0,.039,0));turn=Matrix.Rotation(math.radians(-50),3,'Z')
localPoints=[]
for point,uv in zip(coatData['vertices'],coatData['uvs']):
    p=Vector(point)-neck
    if uv[1]>=1.4:
        cuff=min(1,(uv[1]-1.4)/.70)**3
        # Gently ease the empty sleeves forward and shorten their low ends,
        # keeping the cuffs visible above the chair's crest. The sewn armhole
        # is unchanged and the cloth solver's asymmetric folds are retained.
        p.x*=1+.3*cuff;p.y-=.035*cuff;p.z+=.12*cuff
    localPoints.append(turn@p)
# Translate the whole garment, preserving its simulated cross sections. Its
# back is just in front of the plaster instead of clipping into the masonry.
coaty=min(coaty,1.419-max(p.y for p in localPoints))
points=[p+Vector((coatx,coaty,coatTop)) for p in localPoints]
coat=Mesh('CoatGravityDrape',points,coatData['faces'],cloth,coatData['uvs'],True)
bm=bmesh.new();bm.from_mesh(coat.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(coat.data);bm.free()
bpy.context.view_layer.objects.active=coat
sub=coat.modifiers.new('Smooth simulated fabric','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
Shell(coat,.0027)

Cube('CoatRack',(coatx,1.405,2.72),(.48,.044,.075),wood,.006)
Curve('CoatHook',[(coatx,1.4,2.73),(coatx,coaty+.013,2.73),(coatx,coaty-.023,2.77),(coatx,coaty-.018,2.80)],.008,iron)
Curve('CoatHangingLoop',[(coatx-.015,coaty,coatTop-.008),(coatx-.020,coaty+.009,coatTop+.057),
    (coatx-.014,coaty+.009,coatTop+.113),(coatx+.012,coaty+.009,coatTop+.116),
    (coatx+.020,coaty+.009,coatTop+.058),(coatx+.014,coaty,coatTop-.008)],.0033,cloth)

# Smooth the mesh paths once so piping follows the subdivided cloth, not the
# faceted solver grid. A narrow, darker stitch line gives hems real scale.
def SeamPoints(indices):
    ps=[points[i] for i in indices]
    for iteration in range(2):
        ps=[ps[0]]+[q for a,b in zip(ps,ps[1:]) for q in (a.lerp(b,.25),a.lerp(b,.75))]+[ps[-1]]
    return ps
for index,path in enumerate(coatData['seams']):
    radius=.00065 if index in (0,1,2,5,7,8) else .00028
    Curve('CoatSewnEdge',SeamPoints(path),radius,thread)

# Three dark horn buttons lie on the inner front edge, partly hidden by the
# side-hung folds. Their planes follow the local cloth instead of floating.
frontPath=coatData['seams'][0]
for t in [.32,.47,.63]:
    j=int(t*(len(frontPath)-1));p=points[frontPath[j]]
    tangent=(points[frontPath[j+1]]-points[frontPath[j-1]]).normalized()
    across=(points[frontPath[j]+1]-p).normalized()
    normal=tangent.cross(across).normalized()
    Button('CoatHornButton',p+across*.012+normal*.0016,.009,normal)
