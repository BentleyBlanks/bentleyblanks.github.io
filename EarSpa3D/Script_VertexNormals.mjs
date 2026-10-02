// Same indexed, area-weighted normals as BufferGeometry.computeVertexNormals.
// Direct packed access avoids temporary Vector3 reads for every bristle triangle.
export function UpdatePackedNormals(positions,indices,normals){
 normals.fill(0);
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const x=positions[c]-positions[b],y=positions[c+1]-positions[b+1],z=positions[c+2]-positions[b+2],u=positions[a]-positions[b],v=positions[a+1]-positions[b+1],w=positions[a+2]-positions[b+2];
  const nx=y*w-z*v,ny=z*u-x*w,nz=x*v-y*u;
  normals[a]+=nx;normals[a+1]+=ny;normals[a+2]+=nz;normals[b]+=nx;normals[b+1]+=ny;normals[b+2]+=nz;normals[c]+=nx;normals[c+1]+=ny;normals[c+2]+=nz;
 }
 for(let i=0;i<normals.length;i+=3){const x=normals[i],y=normals[i+1],z=normals[i+2],scale=1/(Math.sqrt(x*x+y*y+z*z)||1);normals[i]=x*scale;normals[i+1]=y*scale;normals[i+2]=z*scale;}
}
