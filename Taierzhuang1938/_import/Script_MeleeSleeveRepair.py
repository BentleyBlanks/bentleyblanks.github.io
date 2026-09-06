"""Close the detached first-person shoulder seam without rebaking finger geometry."""
from pathlib import Path
import bpy,bmesh,json,argparse,sys
from mathutils import Vector
project=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,default=project/'Model/Model_FpsArmsNraSkeletal01.glb')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);path=args.output
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.input))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for mesh in [o for o in bpy.context.scene.objects if o.type=='MESH' and o.vertex_groups]:
 handGroups={g.index for g in mesh.vertex_groups if any(p in g.name for p in ['Hand','Finger'])}
 def HandVertices():
  return sorted(tuple(v.co) for v in mesh.data.vertices if sum(g.weight for g in v.groups if g.group in handGroups)>.1)
 originalHands=HandVertices()
 bm=bmesh.new();bm.from_mesh(mesh.data);weights=bm.verts.layers.deform.active
 before=len(bm.verts);reports=[]
 for side in ['L','R']:
  def Bone(part):return next(b for b in arm.data.bones if b.name.replace('_',' ').endswith(' '+side+' '+part))
  upper,forearm=Bone('UpperArm'),Bone('Forearm')
  transform=mesh.matrix_world.inverted()@arm.matrix_world
  shoulder=transform@upper.head_local;axis=(transform@forearm.head_local-shoulder).normalized()
  # Remove the ragged cape/clavicle islands behind a single transverse sleeve cut.
  units=1/mesh.matrix_world.to_scale().x
  plane=shoulder+axis*(.035*units)
  sideGroups={g.index for g in mesh.vertex_groups if ' '+side+' ' in g.name.replace('_',' ')}
  selected={v for v in bm.verts if sum(value for group,value in v[weights].items() if group in sideGroups)>.9}
  proximal=[v for v in selected if (v.co-shoulder).dot(axis)<.16*units]
  bmesh.ops.remove_doubles(bm,verts=proximal,dist=.00001*units)
  selected={v for v in bm.verts if sum(value for group,value in v[weights].items() if group in sideGroups)>.9}
  geom=list(selected)+[e for e in bm.edges if all(v in selected for v in e.verts)]+[f for f in bm.faces if all(v in selected for v in f.verts)]
  result=bmesh.ops.bisect_plane(bm,geom=geom,dist=.00001*units,plane_co=plane,plane_no=axis,clear_inner=True,clear_outer=False)
  selected={v for v in bm.verts if sum(value for group,value in v[weights].items() if group in sideGroups)>.9}
  edges=[e for e in bm.edges if e.is_boundary and all(v in selected and (v.co-shoulder).dot(axis)<.16*units for v in e.verts)]
  # Continue the uniform behind the near-camera shoulder. Source GLB UV splits
  # were welded only here; hands/fingers and their vertices remain untouched.
  extended=bmesh.ops.extrude_edge_only(bm,edges=edges)['geom'] if edges else []
  newVertices=[v for v in extended if isinstance(v,bmesh.types.BMVert)]
  for v in newVertices:v.co+=axis*(-.24*units-(v.co-shoulder).dot(axis))
  capEdges=[e for e in extended if isinstance(e,bmesh.types.BMEdge) and all(v in newVertices for v in e.verts)]
  filled=bmesh.ops.holes_fill(bm,edges=capEdges,sides=0)['faces'] if capEdges else []
  upperGroup=next(g.index for g in mesh.vertex_groups if g.name==upper.name)
  clavicleGroup=next(g.index for g in mesh.vertex_groups if g.name==Bone('Clavicle').name)
  for v in bm.verts:
   if clavicleGroup in v[weights]:
    v[weights][upperGroup]=v[weights].get(upperGroup,0)+v[weights][clavicleGroup];del v[weights][clavicleGroup]
  for face in filled:
   adjacent=[f for e in face.edges for f in e.link_faces if f not in filled]
   if adjacent:face.material_index=adjacent[0].material_index
  # Keep the continuation tessellated like the source sleeve, with no long
  # triangles spanning the new shoulder section under close-camera skinning.
  extensionEdges=[e for e in extended if isinstance(e,bmesh.types.BMEdge) and e.is_valid]
  if extensionEdges:bmesh.ops.subdivide_edges(bm,edges=extensionEdges,cuts=3,use_grid_fill=True)
  reports.append({'side':side,'capFaces':len(filled),'extendedVertices':len(newVertices)})
 for iteration in range(5):
  polygons=[f for f in bm.faces if len(f.verts)>3]
  if polygons:bmesh.ops.triangulate(bm,faces=polygons)
  longEdges=[e for e in bm.edges if e.calc_length()>.08*units]
  if not longEdges:break
  bmesh.ops.subdivide_edges(bm,edges=longEdges,cuts=1,use_grid_fill=True)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh.data);bm.free();mesh.data.update()
 assert HandVertices()==originalHands,'Sleeve repair changed calibrated hand geometry'
 print('HAND_VERTICES_PRESERVED',len(originalHands),flush=True)
 print('SLEEVE_REPAIR',mesh.name,before,len(mesh.data.vertices),reports,flush=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True)
blend=Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼\Blender\MeleeVideoV1\Scene_MeleeSleeveRepair.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
print('MELEE_SLEEVE_REPAIR_COMPLETE',flush=True)
