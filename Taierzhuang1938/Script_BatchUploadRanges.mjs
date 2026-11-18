// BatchedMesh queues ranges while filling a new geometry. Three's WebGLAttributes
// creates each GPU buffer from the whole array, but only clears ranges on later
// bufferSubData calls. Consume the initial ranges after the actual upload, not
// after Prime: hidden groups may first draw later, or grow into a new geometry.
function Uploaded() { this.clearUpdateRanges(); }
export function TrackBatchUploads(group) {
  const geometry=group.mesh.geometry;
  if(group.uploadGeometry===geometry)return;
  for(const attribute of Object.values(geometry.attributes))attribute.onUpload(Uploaded);
  geometry.index?.onUpload(Uploaded);
  group.uploadGeometry=geometry;
}
