const vector = value => value?.toArray?.() || null;
const state = rider => ({
  position: vector(rider.position), velocity: vector(rider.velocity), normal: vector(rider.normal),
  grounded: rider.grounded, grind: rider.grind?.rail?.name || null, bail: rider.bailTime > 0,
  heading: rider.heading, stance: rider.stance, rollingSign: rider.rollingSign,
  transition: rider.transitionAir?.transitionId || null, phase: rider.transitionAir?.mode || null,
  lipDistance: rider.transitionAir?.frame
    ? rider.position.clone().sub(rider.transitionAir.frame.lipPoint).dot(rider.transitionAir.frame.rampInward) : null,
});

/** Opt-in fixed-step recorder. No gameplay decisions or unbounded history. */
export class CopingTrace {
  constructor(capacity = 720) {
    this.capacity = Math.max(1, Math.min(3600, Math.floor(capacity) || 720));
    this.entries = new Array(this.capacity); this.cursor = 0; this.size = 0; this.frame = 0;
  }
  begin(rider, input, dt) {
    this.current = {frame:this.frame++,dt,input:{...input,directionTaps:[...(input.directionTaps || [])]},
      before:state(rider),decisions:[]};
  }
  decision(kind, data) { this.current?.decisions.push({kind,...data}); }
  contact(kind, support, reason = null) {
    this.decision(kind, {reason,point:vector(support?.position),normal:vector(support?.normal),
      count:support?.count || 0,front:support?.frontSupported || 0,rear:support?.rearSupported || 0,
      contacts:(support?.contacts || []).filter(c=>c.valid).map(c=>({
        point:vector(c.point),normal:vector(c.normal),triangle:c.triangleIndex ?? null,surface:c.surface ?? null,
      }))});
  }
  finish(rider) {
    if(!this.current)return;
    this.current.after=state(rider);this.entries[this.cursor]=this.current;
    this.cursor=(this.cursor+1)%this.capacity;this.size=Math.min(this.size+1,this.capacity);this.current=null;
  }
  snapshot() {
    return structuredClone(Array.from({length:this.size},(_,i)=>
      this.entries[(this.cursor-this.size+i+this.capacity)%this.capacity]));
  }
}
