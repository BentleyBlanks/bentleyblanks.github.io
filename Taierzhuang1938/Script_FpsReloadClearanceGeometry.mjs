// Test-only geometry probe. No renderer, global state, pose correction or contact exemptions.
// Containment is evaluated per edge-connected watertight shell (union, not XOR
// across the entire gun). Open/non-manifold shells receive transverse surface
// crossing evidence only; their ray parity is never called solid penetration.
export function CreateReloadClearanceGeometry(THREE) {
  const weldM = 1e-6, rayEpsilonM = 1e-7, crossingEpsilonM = 1e-6;
  const directions = [[1,.371,.137],[.217,1,.439],[.313,.127,1],[-.673,.291,1],[.843,1,-.439]]
    .map(value => new THREE.Vector3(...value).normalize());
  const Box = list => {
    const box = new THREE.Box3();
    for (const item of list) box.union(item.box);
    return box;
  };
  const Build = list => {
    const box = Box(list);
    if (list.length <= 10) return {box, list};
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
    list.sort((a,b) => a.center[axis] - b.center[axis]);
    const middle = list.length >> 1;
    return {box, left:Build(list.slice(0,middle)), right:Build(list.slice(middle))};
  };
  const Surface = triangles => {
    const vertices = new Map(), edges = new Map(), seen = new Set(), items = [];
    const Vertex = point => {
      const key = point.toArray().map(value => Math.round(value / weldM)).join(',');
      if (!vertices.has(key)) vertices.set(key,vertices.size);
      return vertices.get(key);
    };
    for (let index = 0; index < triangles.length; index++) {
      const triangle = triangles[index];
      if (triangle.getArea() < 1e-16) continue;
      const ids = [triangle.a,triangle.b,triangle.c].map(Vertex);
      const key = ids.slice().sort((a,b) => a-b).join(',');
      if (new Set(ids).size < 3 || seen.has(key)) continue;
      seen.add(key);
      const item = {triangle,index,ids,box:new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]),
        center:triangle.getMidpoint(new THREE.Vector3()),edges:[]};
      for (let i = 0; i < 3; i++) {
        const a = ids[i], b = ids[(i+1)%3], edge = a < b ? `${a},${b}` : `${b},${a}`;
        item.edges.push(edge);
        if (!edges.has(edge)) edges.set(edge,[]);
        edges.get(edge).push(items.length);
      }
      items.push(item);
    }
    const parents = items.map((_,i) => i);
    const Find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    for (const adjacent of edges.values()) for (let i = 1; i < adjacent.length; i++) parents[Find(adjacent[i])] = Find(adjacent[0]);
    const groups = new Map();
    items.forEach((item,i) => { const key = Find(i); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(item); });
    const components = [...groups.values()].map((list,id) => {
      const edgeKeys = new Set(list.flatMap(item => item.edges));
      const boundaryEdges = [...edgeKeys].filter(key => edges.get(key).length === 1).length;
      const nonManifoldEdges = [...edgeKeys].filter(key => edges.get(key).length > 2).length;
      return {id,tree:Build(list.slice()),closed:boundaryEdges === 0 && nonManifoldEdges === 0,
        triangles:list.length,boundaryEdges,nonManifoldEdges};
    });
    return {tree:items.length ? Build(items.slice()) : null,components,triangles:items.length,
      discardedTriangles:triangles.length-items.length};
  };
  const Nearest = (tree,point) => {
    let distance = Infinity, item = null, nearest = null;
    const close = new THREE.Vector3();
    const Visit = node => {
      if (!node || node.box.distanceToPoint(point) >= distance) return;
      if (node.list) {
        for (const candidate of node.list) {
          candidate.triangle.closestPointToPoint(point,close);
          const value = point.distanceTo(close);
          if (value < distance) { distance = value; item = candidate; nearest = close.clone(); }
        }
      } else {
        const a = node.left.box.distanceToPoint(point), b = node.right.box.distanceToPoint(point);
        Visit(a < b ? node.left : node.right); Visit(a < b ? node.right : node.left);
      }
    };
    Visit(tree); return {distance,item,point:nearest};
  };
  const RayCount = (tree,point,direction) => {
    const ray = new THREE.Ray(point,direction), hit = new THREE.Vector3(), distances = [];
    const Visit = node => {
      if (!ray.intersectsBox(node.box)) return;
      if (node.list) {
        for (const {triangle} of node.list) if (ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)) {
          const distance = point.distanceTo(hit);
          if (distance > rayEpsilonM) distances.push(distance);
        }
      } else { Visit(node.left); Visit(node.right); }
    };
    Visit(tree); distances.sort((a,b) => a-b);
    return distances.filter((value,i) => i === 0 || value-distances[i-1] > rayEpsilonM).length;
  };
  const Interior = (surface,point) => {
    let depth = 0, witness = null, ambiguousClosed = 0, openBounds = 0;
    for (const component of surface.components) {
      if (!component.tree.box.containsPoint(point)) continue;
      if (!component.closed) { openBounds++; continue; }
      // Both rays on a line must agree. Four of five independent lines must
      // classify inside; edge/vertex ray accidents are retained as ambiguity.
      const votes = directions.reduce((sum,direction) => sum + Number(
        RayCount(component.tree,point,direction)%2 === 1 &&
        RayCount(component.tree,point,direction.clone().negate())%2 === 1),0);
      if (votes >= 4) {
        const near = Nearest(component.tree,point);
        if (near.distance > depth) { depth = near.distance; witness = {component:component.id,votes,...near}; }
      } else if (votes > 0) ambiguousClosed++;
    }
    return {depth,witness,ambiguousClosed,openBounds};
  };
  const Crossing = (triangle,surface) => {
    if (!surface.tree) return null;
    const box = new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]);
    const hit = new THREE.Vector3(), ray = new THREE.Ray();
    const Edges = (a,b) => {
      const points = [a.a,a.b,a.c], normal = b.getNormal(new THREE.Vector3());
      for (let i = 0; i < 3; i++) {
        const start = points[i], end = points[(i+1)%3], direction = end.clone().sub(start), length = direction.length();
        if (length < crossingEpsilonM*2) continue;
        direction.divideScalar(length);
        if (Math.abs(normal.dot(direction)) < 1e-5) continue; // Coplanar/tangent contact is not transverse crossing.
        ray.set(start,direction);
        if (ray.intersectTriangle(b.a,b.b,b.c,false,hit)) {
          const distance = start.distanceTo(hit);
          if (distance > crossingEpsilonM && distance < length-crossingEpsilonM) return hit.clone();
        }
      }
      return null;
    };
    const Visit = node => {
      if (!node.box.intersectsBox(box)) return null;
      if (node.list) {
        for (const item of node.list) {
          if (!item.box.intersectsBox(box)) continue;
          const point = Edges(triangle,item.triangle) || Edges(item.triangle,triangle);
          if (point) return {point,index:item.index};
        }
        return null;
      }
      return Visit(node.left) || Visit(node.right);
    };
    return Visit(surface.tree);
  };
  return {Surface,Nearest,Interior,Crossing,constants:{weldM,rayEpsilonM,crossingEpsilonM,rays:directions.length}};
}

export function CreateReloadClearanceProbe(THREE) {
  const geometry = CreateReloadClearanceGeometry(THREE), obstacles = new WeakMap(), skins = new WeakMap();
  const Visible = object => {
    for (let item = object; item; item = item.parent) if (!item.visible) return false;
    return true;
  };
  const Materials = mesh => [].concat(mesh.material || []);
  const MaterialVisible = material => material && material.visible !== false && (!material.transparent || material.opacity > 0);
  const Signature = mesh => JSON.stringify([Array.isArray(mesh.material),Materials(mesh).map(MaterialVisible),mesh.geometry.drawRange]);
  const FaceOffsets = mesh => {
    const g=mesh.geometry,visible=Materials(mesh).map(MaterialVisible),offsets=[];
    const count=g.index?.count||g.attributes.position.count,start=g.drawRange?.start||0,end=Math.min(count,start+(g.drawRange?.count??Infinity));
    for(let i=start;i+2<end;i+=3){
      const group=g.groups.find(group=>i>=group.start&&i<group.start+group.count);
      // Single-material meshes render all faces regardless of group indices;
      // arrays render only their explicitly assigned, visible material groups.
      if(Array.isArray(mesh.material)&&!group)continue;
      if(visible[Array.isArray(mesh.material)?group.materialIndex:0])offsets.push(i);
    }
    return offsets;
  };
  const CacheObstacle = mesh => {
    const source = mesh.geometry, signature = Signature(mesh);
    let cached = obstacles.get(source);
    if (!cached) obstacles.set(source,cached=new Map());
    if (cached.has(signature)) return cached.get(signature);
    const p = source.attributes.position, ix = source.index, triangles = [];
    for (const i of FaceOffsets(mesh)) {
      triangles.push(new THREE.Triangle(...[0,1,2].map(k => new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k))));
    }
    const surface = geometry.Surface(triangles); cached.set(signature,surface); return surface;
  };
  const CacheSkin = mesh => {
    const signature=Signature(mesh);
    if (skins.get(mesh)?.signature===signature) return skins.get(mesh);
    const g = mesh.geometry, a = g.attributes, selectedCandidates = [], roles = new Map();
    mesh.skeleton.bones.forEach((bone,i) => {
      const name = bone.name.toLowerCase().replace(/[^a-z0-9]/g,'');
      const found = name.match(/r(finger[0-4][0-2]?|hand|forearm)$/);
      if (found) roles.set(i,found[1].startsWith('finger')?'Finger'+found[1][6]:found[1] === 'hand'?'Hand':'Forearm');
    });
    const role = new Array(a.position.count), faces = [];
    for (let i = 0; i < a.position.count; i++) {
      let total = 0, best = 0, hand = 0, forearm = 0;
      for (let k = 0; k < 4; k++) {
        const owner = roles.get(a.skinIndex.getComponent(i,k)), weight = a.skinWeight.getComponent(i,k);
        if (!owner) continue;
        total += weight; if (owner === 'Hand') hand += weight; if (owner === 'Forearm') forearm += weight;
        if (weight > best) { best = weight; role[i] = owner; }
      }
      if (hand > .03 && forearm > .03) role[i] = 'Wrist';
      if (total >= .05) selectedCandidates.push(i); else role[i] = null;
    }
    const renderedVertices=new Set();
    for (const i of FaceOffsets(mesh)) {
      const ids = [0,1,2].map(k => g.index?g.index.getX(i+k):i+k);
      if (ids.some(index => role[index])) {faces.push({index:i/3,ids});for(const index of ids)renderedVertices.add(index);}
    }
    const selected=selectedCandidates.filter(index=>renderedVertices.has(index));
    const result = {signature,selected,role,faces}; skins.set(mesh,result); return result;
  };
  const Measure = ({weaponGroup,arms,roots,magazine,contactClass}) => {
    weaponGroup.updateWorldMatrix(true,true); arms.root.updateWorldMatrix(true,true);
    const inverse = weaponGroup.matrixWorld.clone().invert(), targets = [], seen = new Set(), skin = [], coverage = {};
    for (const root of roots) root?.traverse(mesh => {
      if (!mesh.isMesh || mesh.isSkinnedMesh || !Visible(mesh) || seen.has(mesh)) return;
      seen.add(mesh); mesh.updateWorldMatrix(true,false);
      let surface = CacheObstacle(mesh); if (!surface.triangles) return;
      const matrix = inverse.clone().multiply(mesh.matrixWorld);
      let scale = matrix.getMaxScaleOnAxis(), transformMode = 'localUniform';
      const columns = [0,1,2].map(axis => new THREE.Vector3().setFromMatrixColumn(matrix,axis));
      const lengths = columns.map(column=>column.length());
      const orthogonal = [[0,1],[0,2],[1,2]].every(([a,b])=>Math.abs(columns[a].dot(columns[b])) <= 1e-6*lengths[a]*lengths[b]);
      if (!orthogonal || Math.max(...lengths)-Math.min(...lengths) > 1e-6*scale) {
        // Released magazines can retain an anisotropic foreground basis. Local
        // ray parity remains affine-invariant, but nearest distance does not.
        // Bake the actual transform into weapon space for exact metric depth
        // and surface witnesses; do not drop the obstacle or multiply by max scale.
        const triangles=[];
        const Bake=node=>{
          if(node.list)for(const {triangle} of node.list)triangles.push(new THREE.Triangle(
            triangle.a.clone().applyMatrix4(matrix),triangle.b.clone().applyMatrix4(matrix),triangle.c.clone().applyMatrix4(matrix)));
          else {Bake(node.left);Bake(node.right);}
        };
        Bake(surface.tree);surface=geometry.Surface(triangles);
        matrix.identity();scale=1;transformMode='bakedNonUniform';
      }
      let part = mesh.userData.debrisKind === 'magazine'?'discardedMagazine':'gun';
      for (let parent = mesh; parent; parent = parent.parent) if (parent === magazine) part = 'magazine';
      targets.push({mesh,surface,matrix,inverse:matrix.clone().invert(),scale,part,transformMode});
    });
    arms.root.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !Visible(mesh)) return;
      mesh.skeleton.update(); const cache = CacheSkin(mesh); if (!cache.selected.length) return;
      const matrix = inverse.clone().multiply(mesh.matrixWorld), points = new Array(mesh.geometry.attributes.position.count);
      const Point = i => points[i] || (points[i] = mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix));
      for (const i of cache.selected) { coverage[cache.role[i]] = (coverage[cache.role[i]]||0)+1; Point(i); }
      skin.push({mesh,cache,Point});
    });
    const rows = new Map();
    const Row = (entry,target,region) => {
      const key = [entry.mesh.uuid,target.mesh.uuid,region].join('|');
      const gripRegion = region === 'Hand' || region.startsWith('Finger');
      const expectedContact = gripRegion && ((target.part === 'magazine' && contactClass === 'magazineGrip')
        || (target.part === 'gun' && contactClass === 'fixedGrip'));
      if (!rows.has(key)) rows.set(key,{skinMesh:entry.mesh.name,materials:Materials(entry.mesh).map(m=>m?.name||''),region,
        obstacle:target.mesh.name,part:target.part,phaseContactClass:contactClass,expectedContact,
        contactClass:expectedContact?(target.part === 'magazine'?'intendedMagazineContact':'fixedGunContact'):'unintendedObstacleContact',
        interiorVertices:0,maxDepthMm:0,crossingSkinTriangles:0,intersectedWholeTriangleAreaMm2:0,ambiguousClosedVertices:0,openBoundsVertices:0});
      return rows.get(key);
    };
    let maxDepthMm = 0, interiorPairs = 0, crossingPairs = 0;
    for (const target of targets) for (const entry of skin) {
      const local = new Map(), Local = i => { if (!local.has(i)) local.set(i,entry.Point(i).clone().applyMatrix4(target.inverse)); return local.get(i); };
      for (const i of entry.cache.selected) {
        const point = Local(i); if (!target.surface.tree.box.containsPoint(point)) continue;
        const inside = geometry.Interior(target.surface,point), row = Row(entry,target,entry.cache.role[i]);
        row.ambiguousClosedVertices += inside.ambiguousClosed; row.openBoundsVertices += inside.openBounds;
        if (inside.witness && inside.depth > 1e-7) {
          const depthMm = inside.depth*target.scale*1000; row.interiorVertices++; interiorPairs++;
          if (depthMm > row.maxDepthMm) { row.maxDepthMm = depthMm; row.deepest = {vertex:i,point:entry.Point(i).toArray(),
            surfacePoint:inside.witness.point.clone().applyMatrix4(target.matrix).toArray(),component:inside.witness.component,votes:inside.witness.votes}; }
          maxDepthMm = Math.max(maxDepthMm,depthMm);
        }
      }
      for (const {index,ids} of entry.cache.faces) {
        const triangle = new THREE.Triangle(...ids.map(Local)), crossing = geometry.Crossing(triangle,target.surface);
        if (!crossing) continue;
        const region = entry.cache.role[ids.find(i=>entry.cache.role[i])], row = Row(entry,target,region);
        row.crossingSkinTriangles++; crossingPairs++;
        row.intersectedWholeTriangleAreaMm2 += new THREE.Triangle(...ids.map(entry.Point)).getArea()*1e6;
        row.crossing ||= {skinTriangle:index,obstacleTriangle:crossing.index,point:crossing.point.clone().applyMatrix4(target.matrix).toArray()};
      }
    }
    return {coverage,skinVertices:skin.reduce((sum,entry)=>sum+entry.cache.selected.length,0),
      skinTriangles:skin.reduce((sum,entry)=>sum+entry.cache.faces.length,0),maxDepthMm,interiorVertexObstaclePairs:interiorPairs,
      crossingTriangleObstaclePairs:crossingPairs,rows:[...rows.values()].filter(row=>row.interiorVertices||row.crossingSkinTriangles||row.ambiguousClosedVertices||row.openBoundsVertices),
      obstacles:targets.map(({mesh,surface,part,transformMode})=>({name:mesh.name,part,transformMode,triangles:surface.triangles,
        closedComponents:surface.components.filter(c=>c.closed).length,openComponents:surface.components.filter(c=>!c.closed).length,
        boundaryEdges:surface.components.reduce((sum,c)=>sum+c.boundaryEdges,0),nonManifoldEdges:surface.components.reduce((sum,c)=>sum+c.nonManifoldEdges,0)}))};
  };
  return {Measure,constants:geometry.constants};
}
