import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {VfxSystem} from './Script_Vfx.mjs';
import {ParticleSystem} from './Script_ParticleModules.mjs';
import {ParticleChannel} from './Script_ParticleChannel.mjs';

// Run the production Tracer -> ParticleChannel -> ParticleSystem path without
// allocating GPU buffers. Short hits must not crash AI or overshoot the target.
for (const speed of [240, 480, 960]) {
  for (const distance of [0, .049, .05, .1, speed * .001 - .000001, speed * .001, 1, 100, 2000]) {
    const system = new ParticleSystem({main:{startLifetime:1,startSpeed:1,startSize:1},emission:{enabled:false}});
    system.Play();
    const channel = {system, config:{renderer:'billboard'}, particleId:'streak', effects:{
      systems:new Map([['streak',{system}]]), Get:()=>({restartPending:false}), shared:{uTime:{value:0}},
    }};
    const vfx = {time:0,random:()=>.5,pools:{streak:{Spawn(input,time){
      return ParticleChannel.prototype.Spawn.call(channel,input,time);
    }}}};
    assert.doesNotThrow(()=>VfxSystem.prototype.Tracer.call(vfx,new Vector3(),new Vector3(distance,0,0),{speed}));
    const visible = distance >= .05 && distance / speed >= .001;
    assert.equal(system.emitted, visible ? 1 : 0, `distance=${distance}, speed=${speed}`);
    if (visible) {
      const particle = system.particles[0];
      assert.equal(particle.life, Math.min(distance / speed,1.2));
      assert.deepEqual(particle.velocity,[speed,0,0]);
      assert.ok(particle.life * speed <= distance + 1e-9, 'trail never extends past the hit');
      system.Update(particle.life + .02);
      assert.equal(system.particles.length,0,'trail expires normally');
    }
  }
}
assert.throws(()=>new ParticleSystem({}).EmitRecord({life:.0002}),/particle.life/,'strict particle lifetime validation remains enabled');
console.log('PASS TracerLifetime: short hits skipped, valid speed/lifetime preserved, particles expire and strict validation retained');
