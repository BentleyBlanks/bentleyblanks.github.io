import * as THREE from 'three';

export function CreateCareFeedback(scene) {
  const capacity = 64, positions = new Float32Array(capacity * 3), brightness = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {}, vertexShader: `attribute float brightness; varying float glow;
    void main(){glow=brightness;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=4.0+brightness*15.0;}`,
    fragmentShader: `varying float glow;
    void main(){vec2 p=abs(gl_PointCoord-.5)*2.0;float crossRay=pow(max(0.0,1.0-min(p.x*8.0+p.y,p.y*8.0+p.x)),1.8);
    float core=exp(-dot(p,p)*24.0);float alpha=(crossRay+core*.65)*glow;if(alpha<.01)discard;gl_FragColor=vec4(1.0,.77,.32,alpha);}`});
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;points.visible=false;scene.add(points);
  const bursts = [], seen = new WeakSet();let count = 0;
  function Celebrate(piece, appraisal) {
    if (!piece?.mesh || appraisal?.grade !== 5 || !appraisal.sparkle || seen.has(piece.mesh)) return false;
    seen.add(piece.mesh);bursts.push({mesh:piece.mesh,age:0,seed:count++*.71});return true;
  }
  function Update(dt) {
    let index=0;
    for (let b=bursts.length-1;b>=0;b--) {
      const burst=bursts[b];burst.age+=dt;
      if(burst.age>3.8){bursts.splice(b,1);continue;}
      const center=burst.mesh.getWorldPosition(new THREE.Vector3()),fade=Math.min(1,burst.age*7)*Math.min(1,(3.8-burst.age)*2);
      for(let i=0;i<24&&index<capacity;i++,index++){
        const angle=i*2.39996+burst.seed,phase=burst.age*2.5+i*.61,radius=.75+(i%5)*.22;
        positions[index*3]=center.x+Math.cos(angle)*radius;
        positions[index*3+1]=center.y+Math.sin(angle)*radius*.65+Math.sin(phase)*.12;
        positions[index*3+2]=center.z+Math.sin(i*5.1)*radius*.55;
        brightness[index]=fade*(.2+.8*Math.pow(Math.max(0,Math.sin(phase)),4));
      }
    }
    geometry.setDrawRange(0,index);geometry.attributes.position.needsUpdate=true;geometry.attributes.brightness.needsUpdate=true;points.visible=index>0;
  }
  return {Celebrate,Update,Probe:()=>({count,active:bursts.length}),Clear(){bursts.length=0;points.visible=false;},Dispose(){points.removeFromParent();geometry.dispose();material.dispose();}};
}
