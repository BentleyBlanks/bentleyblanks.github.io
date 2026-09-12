import * as THREE from 'three';

// Six sparse shells share the collision-deformed feather mesh and one shader program.
export const FEATHER_FUR_LENGTH = .045;
export const FEATHER_FUR_PASSES = 6;
export function ClearFeatherFur(part, dispose = true) {
  for (const shell of [...part.children]) if (shell.userData.featherShell) {
    part.remove(shell);
    if (dispose) shell.material.dispose(); // Geometry belongs to the parent feather.
  }
}
export function AddFeatherFur(part, createMaterial, clippingPlanes) {
  // Follicles stay attached to the strand when its live positions bend against the wall.
  part.geometry.setAttribute('furRestPosition', new THREE.BufferAttribute(part.userData.fiberRest.slice(), 3));
  for (let i = 1; i <= FEATHER_FUR_PASSES; i++) {
    const material = createMaterial(), compile = material.onBeforeCompile;
    material.name = 'Material_FeatherFurShell';
    material.clippingPlanes = clippingPlanes;
    material.alphaToCoverage = true;
    material.alphaTest = .08;
    material.onBeforeCompile = shader => {
      compile(shader);
      shader.uniforms.furLayer = { value: i / FEATHER_FUR_PASSES };
      shader.uniforms.furLength = { value: FEATHER_FUR_LENGTH };
      shader.vertexShader = 'attribute vec3 furRestPosition;uniform float furLayer;uniform float furLength;varying vec3 furRest;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        furRest=furRestPosition;
        transformed+=normal*furLength*furLayer;
      `);
      shader.fragmentShader = 'uniform float furLayer;varying vec3 furRest;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        vec3 cell=furRest*240.0;
        vec3 key=floor(cell);
        float seed=fract(sin(dot(key,vec3(12.9898,78.233,37.719)))*43758.5453);
        float coverage=1.0-smoothstep(.68-furLayer*.46,.86-furLayer*.46,seed);
        float edge=length(fract(cell).xy-.5);
        coverage*=1.0-smoothstep(.32-furLayer*.15-fwidth(edge),.48-furLayer*.15+fwidth(edge),edge);
        if(coverage<.06)discard;
        diffuseColor.a*=coverage;
        diffuseColor.rgb*=mix(.88,1.06,furLayer);
        #include <alphatest_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'FeatherShellFurV1';
    const shell = new THREE.Mesh(part.geometry, material);
    shell.name = 'Model_FeatherFurShell_' + i;
    shell.userData.featherShell = true;
    shell.frustumCulled = false;
    part.add(shell);
  }
}
