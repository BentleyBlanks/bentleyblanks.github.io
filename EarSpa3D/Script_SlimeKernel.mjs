// One bounded, synchronous scratch arena. No per-body WASM allocation or ownership.
let kernel=null,initializing=null;
export async function InitializeSlimeKernel(bytes=null){
 if(initializing)return initializing;
 initializing=(async()=>{
  try{
   if(!bytes){const response=await fetch(new URL('./Script_SlimeKernel.wasm?v=ear043-runtime-performance-20261003',import.meta.url));if(!response.ok)throw new Error('Slime kernel '+response.status);bytes=await response.arrayBuffer();}
   const {instance}=await WebAssembly.instantiate(bytes,{});kernel=instance.exports;return true;
  }catch{return false;}// Unsupported/offline WASM keeps the identical JS solver.
 })();return initializing;
}
export function SlimeKernelScratch(pointLength,edgeLength,tetLength,anchorLength,gripLength){
 if(!kernel)return null;
 const bytes=(pointLength+edgeLength+tetLength+anchorLength+pointLength/3*7+gripLength)*8;
 // Stay within the module's 4 MiB maximum. Larger future bodies use JS safely.
 if(bytes>4194304)return null;
 if(kernel.memory.buffer.byteLength<bytes)kernel.memory.grow(Math.ceil((bytes-kernel.memory.buffer.byteLength)/65536));
 const edgeOffset=pointLength*8,tetOffset=edgeOffset+edgeLength*8,anchorOffset=tetOffset+tetLength*8,planeOffset=anchorOffset+anchorLength*8,gripOffset=planeOffset+pointLength/3*56;
 return {points:new Float64Array(kernel.memory.buffer,0,pointLength),edges:new Float64Array(kernel.memory.buffer,edgeOffset,edgeLength),tets:new Float64Array(kernel.memory.buffer,tetOffset,tetLength),
  anchors:new Float64Array(kernel.memory.buffer,anchorOffset,anchorLength),planes:new Float64Array(kernel.memory.buffer,planeOffset,pointLength/3*7),grip:new Float64Array(kernel.memory.buffer,gripOffset,gripLength),
  Project(anchorEnd,hasPlanes,gripCount,iterations,volumeAlpha,anchorAlpha,gripAlpha,cap,floor){return kernel.Project(0,edgeOffset,edgeLength,tetOffset,tetLength,anchorOffset,anchorEnd,planeOffset,hasPlanes,gripOffset,gripCount,pointLength/3,iterations,volumeAlpha,anchorAlpha,gripAlpha,cap,floor??0,floor===null?0:1);}};
}
export function SlimeKernelProbe(){return {backend:kernel?'wasm-f64':'javascript-f64',scratchBytes:kernel?.memory.buffer.byteLength||0};}
