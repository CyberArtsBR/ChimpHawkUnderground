import * as THREE from 'three';
import { surfaceTagFor, validatedSurfaceTag } from '../game/SurfaceAudio.js';
import { BailLiquid } from './BailLiquid.js';

const finite = v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const clamp = THREE.MathUtils.clamp;
/** Enhancement pass (2026-11): bigger, clearer dust and sparks. One place to tune them. */
export const FX_TUNING = Object.freeze({
  dustPool: 160, sparkPool: 460,
  landingCount: [6, 18],       // puffs at soft … hard landings (times the surface's dust amount)
  landingSize: [0.3, 0.3],     // base + severity
  landingLife: [0.5, 0.4],     // base + random
  landingOpacity: [0.16, 0.14],
  bailDustCount: 26, bailDustSize: 0.45, bailDustLife: 1.0, bailDustOpacity: 0.2,
  sparkRate: 3.1,              // multiplier on the original spark rate
  sparkSize: [0.11, 0.08], sparkLife: [0.26, 0.36], sparkBack: [1.5, 2.8], sparkUp: [0.6, 2.2], sparkGravity: 12,
  emberChance: .28, emberSize: [0.05, 0.04], emberLife: [0.8, 0.6], emberGravity: 4.5,
  grindLight: 2.8, grindLightFlicker: 1.8, grindLightDistance: 4.5,
});

export const SURFACE_PARTICLES = Object.freeze({
  neutral: {dust:.35,tint:[.65,.66,.65],grind:.2,sparks:false},
  concrete: {dust:.4,tint:[.73,.74,.73],grind:.45,sparks:false},
  wood: {dust:.18,tint:[.57,.48,.37],grind:.12,sparks:false},
  metal: {dust:0,tint:[.65,.68,.72],grind:.6,sparks:true},
  rubber: {dust:0,tint:[.4,.42,.43],grind:0,sparks:false},
});

const VERTEX = `
attribute float particleSize;
attribute float opacity;
attribute vec3 tint;
attribute vec3 motion;
attribute float streak;
uniform float viewportHeight;
varying vec3 vTint;
varying float vOpacity;
varying float vStreak;
varying float vAngle;
void main() {
  vec4 p=modelViewMatrix*vec4(position,1.0);
  vec3 travel=mat3(modelViewMatrix)*motion;
  vAngle=atan(travel.y,travel.x);
  vTint=tint;vOpacity=opacity;vStreak=streak;
  gl_PointSize=clamp(particleSize*viewportHeight/max(1.0,-p.z),1.0,72.0);
  gl_Position=projectionMatrix*p;
}`;
const FRAGMENT = `
varying vec3 vTint;
varying float vOpacity;
varying float vStreak;
varying float vAngle;
void main() {
  vec2 p=gl_PointCoord*2.0-1.0;
  float c=cos(vAngle),s=sin(vAngle);
  vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);
  float radius=mix(length(p),length(q*vec2(.95,4.8)),vStreak);
  float edge=1.0-smoothstep(.0,1.0,radius);
  float alpha=edge*edge*vOpacity;
  if(alpha<.004)discard;
  gl_FragColor=vec4(vTint,alpha);
  #include <colorspace_fragment>
}`;

function makePool(name,count,additive) {
  const geometry=new THREE.BufferGeometry();
  const arrays={position:new Float32Array(count*3),motion:new Float32Array(count*3),tint:new Float32Array(count*3),
    particleSize:new Float32Array(count),opacity:new Float32Array(count),streak:new Float32Array(count)};
  for(const key of Object.keys(arrays))geometry.setAttribute(key,new THREE.BufferAttribute(arrays[key],
    ['position','motion','tint'].includes(key)?3:1).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.ShaderMaterial({name,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    uniforms:{viewportHeight:{value:720}},transparent:true,depthWrite:false,depthTest:true,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:false});
  const points=new THREE.Points(geometry,material);points.name=name;points.frustumCulled=false;points.visible=false;
  return {points,arrays,count,cursor:0,age:new Float32Array(count),duration:new Float32Array(count),
    initialSize:new Float32Array(count),initialOpacity:new Float32Array(count),gravity:new Float32Array(count)};
}

/** Presentation-only skating particles. Two particle draws and up to three
 * short-lived bail puddles, no textures,
 * physics probes or per-update buffer/object allocation. Hide root during the
 * selective bloom pass: these fine details belong to the normal scene pass.
 */
export class SkateEffects {
  constructor(scene=null) {
    this.root=new THREE.Group();this.root.name='Skating contact effects';this.root.userData.skateEffects=true;
    this.dust=makePool('Soft landing dust',FX_TUNING.dustPool,false);
    this.glints=makePool('Grind sparks and trick traces',FX_TUNING.sparkPool,true);
    this.root.add(this.dust.points,this.glints.points);scene?.add(this.root);
    this.previousPosition=new THREE.Vector3();this.previousVelocity=new THREE.Vector3();
    this.origin=new THREE.Vector3();this.forward=new THREE.Vector3();this.normal=new THREE.Vector3();this.side=new THREE.Vector3();this.tangent=new THREE.Vector3();
    this.initialized=false;this.previousGrounded=true;this.previousSerial=0;this.airDuration=0;
    this.grindBudget=0;this.traceBudget=0;this.landingLatch=false;this.scale=1;this.performance=false;
    this.lastBailImpact=null;
    this.bailLiquid=new BailLiquid(this.root);
    // A real flickering light at the grind contact (always present, dark when idle).
    this.grindLight=new THREE.PointLight('#ffab4a',0,FX_TUNING.grindLightDistance,2);
    this.grindLight.name='Grind spark light';
    this.root.add(this.grindLight);
    this.puddles=this.bailLiquid.puddles;
  }

  setQuality(settings) {
    this.scale=clamp(Number(settings?.vfxScale)||1,.25,1.5);
    this.performance=settings?.name==='performance';
    if(this.performance){this.clearPool(this.glints);this.grindBudget=0;this.traceBudget=0;}
  }

  setLiquidEnabled(value) { this.bailLiquid.setEnabled(value); }

  setSize(height,pixelRatio=1) {
    // The shader sizes points in drawing-buffer pixels. Use the actual render
    // ratio, including sub-native resolution and high-DPI native rendering,
    // to keep their apparent CSS size independent of the graphics preset.
    const h=Number(height),ratio=Number(pixelRatio);
    const pixels=(Number.isFinite(h)&&h>0?h:720)*(Number.isFinite(ratio)&&ratio>0?ratio:1);
    this.dust.points.material.uniforms.viewportHeight.value=pixels;
    this.glints.points.material.uniforms.viewportHeight.value=pixels;
  }

  clearPool(pool) {
    pool.age.fill(0);pool.duration.fill(0);pool.arrays.opacity.fill(0);pool.cursor=0;
    pool.points.geometry.attributes.opacity.needsUpdate=true;pool.points.visible=false;
  }

  reset(skater=null) {
    this.bailLiquid.reset();
    this.lastBailImpact=skater?.rider?.ragdoll?.groundImpact||null;
    this.clearPool(this.dust);this.clearPool(this.glints);
    if(this.grindLight)this.grindLight.intensity=0;
    this.grindBudget=0;this.traceBudget=0;this.airDuration=0;this.landingLatch=false;
    this.initialized=finite(skater?.position);
    if(this.initialized)this.remember(skater);
  }

  remember(skater) {
    this.previousPosition.copy(skater.position);
    if(finite(skater.velocity))this.previousVelocity.copy(skater.velocity);else this.previousVelocity.set(0,0,0);
    this.previousGrounded=Boolean(skater.grounded);
    this.previousSerial=skater.respawnSerial||0;
    this.landingLatch=Boolean(skater.justLanded);
  }

  emit(pool,x,y,z,vx,vy,vz,size,life,opacity,r,g,b,streak,gravity) {
    const i=pool.cursor;pool.cursor=(i+1)%pool.count;const k=i*3;
    pool.arrays.position[k]=x;pool.arrays.position[k+1]=y;pool.arrays.position[k+2]=z;
    pool.arrays.motion[k]=vx;pool.arrays.motion[k+1]=vy;pool.arrays.motion[k+2]=vz;
    pool.arrays.tint[k]=r;pool.arrays.tint[k+1]=g;pool.arrays.tint[k+2]=b;
    pool.arrays.streak[i]=streak;pool.initialSize[i]=size;pool.initialOpacity[i]=opacity;
    pool.arrays.particleSize[i]=size;pool.arrays.opacity[i]=opacity;
    pool.age[i]=0;pool.duration[i]=life;pool.gravity[i]=gravity;
    pool.points.visible=true;
  }

  stepPool(pool,dt,dust) {
    let visible=false;const a=pool.arrays;
    for(let i=0;i<pool.count;i++) {
      if(pool.duration[i]===0)continue;
      const age=pool.age[i]+dt;pool.age[i]=age;
      if(age>=pool.duration[i]){pool.duration[i]=0;a.opacity[i]=0;continue;}
      visible=true;const k=i*3,t=age/pool.duration[i];
      a.motion[k+1]-=pool.gravity[i]*dt;
      a.position[k]+=a.motion[k]*dt;a.position[k+1]+=a.motion[k+1]*dt;a.position[k+2]+=a.motion[k+2]*dt;
      a.opacity[i]=pool.initialOpacity[i]*(1-t)*(1-t);
      a.particleSize[i]=pool.initialSize[i]*(dust?1+t*1.8:1-t*.35);
    }
    pool.points.visible=visible;
    for(const key in pool.points.geometry.attributes)pool.points.geometry.attributes[key].needsUpdate=true;
  }

  landing(skater,impact,tag=surfaceTagFor(skater)) {
    const n=this.normal;const p=this.origin;const f=this.forward;
    const severity=clamp(impact/9,.15,1),profile=SURFACE_PARTICLES[validatedSurfaceTag(tag)];
    const [baseCount,extraCount]=FX_TUNING.landingCount;
    const count=Math.round((baseCount+severity*extraCount)*profile.dust*this.scale*(this.performance ? .45 : 1));
    this.tangent.copy(f).projectOnPlane(n).normalize();this.side.crossVectors(this.tangent,n).normalize();
    for(let i=0;i<count;i++) {
      const angle=Math.random()*Math.PI*2,spread=.25+Math.random()*.55;
      const side=(i%2?1:-1)*.11,along=(i%4<2?1:-1)*.22;
      const x=p.x+this.tangent.x*along+this.side.x*side+n.x*.025,y=p.y+this.tangent.y*along+this.side.y*side+n.y*.025,z=p.z+this.tangent.z*along+this.side.z*side+n.z*.025;
      this.emit(this.dust,x,y,z,Math.cos(angle)*spread+n.x*.25,.10+n.y*.12,Math.sin(angle)*spread+n.z*.25,
        FX_TUNING.landingSize[0]+severity*FX_TUNING.landingSize[1],FX_TUNING.landingLife[0]+Math.random()*FX_TUNING.landingLife[1],
        FX_TUNING.landingOpacity[0]+severity*FX_TUNING.landingOpacity[1],...profile.tint,0,-.12);
    }
  }

  /** A dust cloud where the rider hits the ground in a bail (alongside the bail splat). */
  bailDust(impact) {
    const p=impact?.point;
    if(!p||![p.x,p.y,p.z].every(Number.isFinite))return;
    const t=FX_TUNING,count=Math.round(t.bailDustCount*this.scale*(this.performance ? .45 : 1));
    const tint=SURFACE_PARTICLES.concrete.tint;
    for(let i=0;i<count;i++) {
      const angle=Math.random()*Math.PI*2,spread=.6+Math.random()*1.4;
      this.emit(this.dust,p.x,p.y+.06,p.z,Math.cos(angle)*spread,.25+Math.random()*.7,Math.sin(angle)*spread,
        t.bailDustSize*(0.7+Math.random()*0.6),t.bailDustLife*(0.7+Math.random()*0.6),t.bailDustOpacity,...tint,0,-.1);
    }
  }

  grindParticle(profile) {
    const side=(Math.random()-.5)*1.4;
    if(profile.sparks) {
      const t=FX_TUNING,back=t.sparkBack[0]+Math.random()*t.sparkBack[1];
      // White-hot to orange streaks.
      const heat=Math.random();
      this.emit(this.glints,this.origin.x,this.origin.y+.025,this.origin.z,
        -this.forward.x*back+this.forward.z*side,t.sparkUp[0]+Math.random()*t.sparkUp[1],-this.forward.z*back-this.forward.x*side,
        t.sparkSize[0]+Math.random()*t.sparkSize[1],t.sparkLife[0]+Math.random()*t.sparkLife[1],.95,1,.72+heat*.28,.3+heat*.45,1,t.sparkGravity);
      // Slow orange embers drifting down.
      if(Math.random()<t.emberChance)this.emit(this.glints,this.origin.x,this.origin.y+.03,this.origin.z,
        -this.forward.x*.5+this.forward.z*side*.6,.4+Math.random()*.8,-this.forward.z*.5-this.forward.x*side*.6,
        t.emberSize[0]+Math.random()*t.emberSize[1],t.emberLife[0]+Math.random()*t.emberLife[1],.85,1,.45,.12,0,t.emberGravity);
    } else {
      this.emit(this.dust,this.origin.x,this.origin.y+.02,this.origin.z,
        -this.forward.x*.35+this.forward.z*side,.08,-this.forward.z*.35-this.forward.x*side,
        .09,.2,.09,...profile.tint,0,.1);
    }
  }

  // Recorded presentation events never read or mutate the live skater/score.
  playRecordedEvent(event, surface = null) {
    if(!event||!Array.isArray(event.point)||event.point.length!==3||!event.point.every(Number.isFinite))return false;
    this.origin.fromArray(event.point);
    if(Array.isArray(event.normal)&&event.normal.length===3&&event.normal.every(Number.isFinite))this.normal.fromArray(event.normal).normalize();else this.normal.set(0,1,0);
    if(this.normal.lengthSq()<.1)this.normal.set(0,1,0);
    if(Array.isArray(event.forward)&&event.forward.length===3&&event.forward.every(Number.isFinite))this.forward.fromArray(event.forward).normalize();else this.forward.set(0,0,-1);
    const tag=validatedSurfaceTag(event.surface||event.audioSurfaceTag);
    if(event.kind==='landing')this.landing(null,(Number(event.strength)||.4)*9,tag);
    else if(event.kind==='grind'&&!this.performance){const profile=SURFACE_PARTICLES[tag];for(let i=0;i<Math.round(profile.grind*4);i++)this.grindParticle(profile);}
    else if(event.kind==='bail'){this.bailLiquid.spawn({point:this.origin,normal:this.normal,speed:(Number(event.strength)||.4)*10},this.performance,surface);this.bailDust({point:this.origin});}
    else return false;
    return true;
  }

  updateReplay(delta) {
    if(!Number.isFinite(delta)||delta<=0)return;
    // Preserve the full source-time interval while keeping integration stable.
    let remaining=delta;
    while(remaining>1e-8){const dt=Math.min(remaining,.05);
      this.stepPool(this.dust,dt,true);this.stepPool(this.glints,dt,false);this.bailLiquid.update(dt);remaining-=dt;}
  }

  update(delta,skater) {
    const dt=clamp(Number(delta)||0,0,.05);
    if(!finite(skater?.position)||dt<=0)return;
    // A location switch, replay seek or respawn is not a physical landing.
    if(!this.initialized||(skater.respawnSerial||0)!==this.previousSerial
      ||this.previousPosition.distanceToSquared(skater.position)>36){this.reset(skater);return;}
    this.stepPool(this.dust,dt,true);this.stepPool(this.glints,dt,false);
    this.bailLiquid.update(dt);
    const impactEvent=skater.rider?.ragdoll?.groundImpact;
    if(skater.bailTime>0&&impactEvent&&impactEvent!==this.lastBailImpact){
      this.lastBailImpact=impactEvent;
      this.bailLiquid.spawn(impactEvent,this.performance,skater.surface);
      this.bailDust(impactEvent);
    }
    if(skater.bailTime>0){this.airDuration=0;this.grindBudget=0;this.traceBudget=0;this.remember(skater);return;}
    this.origin.copy(skater.position);
    this.normal.copy(finite(skater.normal)?skater.normal:THREE.Object3D.DEFAULT_UP);
    this.forward.copy(finite(skater.forward)?skater.forward:THREE.Object3D.DEFAULT_UP);
    const speed=Math.abs(Number(skater.speed)||0);
    const grounded=Boolean(skater.grounded);
    const landed=grounded&&(!this.previousGrounded||(skater.justLanded&&!this.landingLatch));
    const impact=Math.max(0,-this.previousVelocity.dot(this.normal));
    if(landed&&this.airDuration>.08&&impact>1.1&&!skater.grind&&!skater.wallRide)this.landing(skater,impact);
    if(grounded||skater.grind||skater.wallRide)this.airDuration=0;else this.airDuration+=dt;
    const sparking=!this.performance&&skater.grind&&speed>2&&SURFACE_PARTICLES[surfaceTagFor(skater)].sparks;
    const target=sparking?FX_TUNING.grindLight+Math.random()*FX_TUNING.grindLightFlicker:0;
    this.grindLight.intensity+=(target-this.grindLight.intensity)*Math.min(1,dt*(sparking?30:10));
    if(this.grindLight.intensity>.01)this.grindLight.position.set(this.origin.x,this.origin.y+.25,this.origin.z);
    if(!this.performance&&skater.grind&&speed>2) {
      const tag=surfaceTagFor(skater),profile=SURFACE_PARTICLES[tag];
      this.grindBudget+=dt*(7+Math.min(speed,20)*.6)*this.scale*profile.grind*FX_TUNING.sparkRate;
      while(this.grindBudget>=1) { this.grindBudget--;this.grindParticle(profile); }
    } else this.grindBudget=0;
    // Short, faint board-edge traces only during fast, active airborne tricks.
    if(!this.performance&&!grounded&&!skater.grind&&speed>11&&(skater.flipState||skater.grabState)) {
      this.traceBudget+=dt*20*this.scale;
      while(this.traceBudget>=1) {
        this.traceBudget--;const side=(this.glints.cursor%2?1:-1)*.105;
        this.emit(this.glints,this.origin.x+this.forward.z*side,this.origin.y+.04,this.origin.z-this.forward.x*side,
          -this.forward.x*.6,0,-this.forward.z*.6,.11,.14,.14,.56,.77,1,1,0);
      }
    } else this.traceBudget=0;
    this.remember(skater);
  }

  dispose() {
    this.bailLiquid.dispose();
    this.root.removeFromParent();
    this.dust.points.geometry.dispose();this.dust.points.material.dispose();
    this.glints.points.geometry.dispose();this.glints.points.material.dispose();
  }
}
