import { Quaternion } from 'three';

const VALUES_PER_NODE = 11; // position, quaternion, scale, visibility
const MAX_BYTES = 32 * 1024 * 1024;
const LINEAR_COMPONENTS = [0, 1, 2, 7, 8, 9];

function writePose(nodes, target, offset = 0) {
  for (const node of nodes) {
    node.position.toArray(target, offset);
    node.quaternion.toArray(target, offset + 3);
    node.scale.toArray(target, offset + 7);
    target[offset + 10] = node.visible ? 1 : 0;
    offset += VALUES_PER_NODE;
  }
}

/** Visual poses only: no inputs, physics state, scores, or simulation replay. */
export class HighlightRecorder {
  constructor({ sampleHz = 30, seconds = 95, maxBytes = MAX_BYTES } = {}) {
    this.requestedHz = Math.max(1, Math.min(30, Number(sampleHz) || 30));
    this.seconds = Math.max(6, Math.min(95, Number(seconds) || 95));
    this.maxBytes = Math.max(4096, Math.min(MAX_BYTES, Number(maxBytes) || MAX_BYTES));
    this.nodes = [];
    this.time = 0;
    this.enabled = false;
  }

  reset(skater) {
    this.nodes = [];
    skater?.root?.traverse(node => this.nodes.push(node));
    this.root = skater?.root;
    this.stride = this.nodes.length * VALUES_PER_NODE;
    this.time = 0;
    this.count = 0;
    this.writeIndex = 0;
    this.moments = [];
    this.events = [];
    this.finished = false;
    this.clips = null;
    // Reserve room for the playback interpolation and restoration snapshots.
    const frameBytes = this.stride * 4 + 8;
    const snapshotReserve = Math.max(32768, this.nodes.length * 512);
    const maximumFrames = Math.floor((this.maxBytes - this.stride * 8 - snapshotReserve) / frameBytes);
    this.capacity = this.stride ? Math.min(Math.ceil(this.seconds * this.requestedHz) + 2, maximumFrames) : 0;
    this.enabled = this.capacity >= 3;
    if (!this.enabled) {
      this.poses = new Float32Array(0);
      this.times = new Float64Array(0);
      this.sampleHz = 0;
      return false;
    }
    this.sampleHz = Math.min(this.requestedHz, (this.capacity - 2) / this.seconds);
    this.interval = 1 / this.sampleHz;
    this.poses = new Float32Array(this.capacity * this.stride);
    this.times = new Float64Array(this.capacity);
    this._capture();
    this.nextSample = this.interval;
    return true;
  }

  get byteLength() { return (this.poses?.byteLength || 0) + (this.times?.byteLength || 0); }

  markEvent(event) {
    if (!this.enabled || this.finished || !event || !['pop','landing','grind','grindEnd','bail','catch'].includes(event.kind)) return false;
    const captured = { kind:event.kind, strength:Number.isFinite(event.strength)?event.strength:.4,
      surface:typeof event.surface==='string'?event.surface:'neutral',
      mapId:typeof event.mapId==='string'?event.mapId:null, time:this.time };
    for(const key of ['point','normal','forward']) if(Array.isArray(event[key])&&event[key].length===3&&event[key].every(Number.isFinite))
      captured[key]=Object.freeze([...event[key]]);
    this.events.push(Object.freeze(captured));
    if(this.events.length>1024)this.events.shift();
    return true;
  }

  record(skater, dt) {
    if (!this.enabled || this.finished || skater?.root !== this.root || !Number.isFinite(dt) || dt < 0) return false;
    this.time += dt;
    if (this.time + 1e-8 < this.nextSample) return false;
    this._capture();
    // Capture an actual rendered pose once, never synthesize missed simulation frames.
    this.nextSample = (Math.floor((this.time + 1e-8) / this.interval) + 1) * this.interval;
    return true;
  }

  _capture() {
    const index = this.writeIndex;
    writePose(this.nodes, this.poses, index * this.stride);
    this.times[index] = this.time;
    this.writeIndex = (index + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    // Slow machines record fewer frames; still retain only the bounded time window.
    // Keep one frame before its boundary for continuous interpolation.
    while (this.count > 2 && this._time(1) < this.time - this.seconds) this.count--;
  }

  _index(chronological) { return (this.writeIndex - this.count + chronological + this.capacity) % this.capacity; }
  _time(chronological) { return this.times[this._index(chronological)]; }

  markMoment({ start, end = this.time, points, label = 'Banked combo' } = {}) {
    if (!this.enabled || this.finished || !Number.isFinite(start) || !Number.isFinite(end)
      || !Number.isFinite(points) || points <= 0 || start < 0 || end < start || end > this.time + 0.25) return false;
    const moment = { start, end, points: Math.round(points), label: String(label).slice(0, 160) };
    // Same settled event must not become three identical highlights.
    if (this.moments.some(item => Math.abs(item.start - start) < 1e-6 && Math.abs(item.end - end) < 1e-6)) return false;
    this.moments = this.moments.filter(item => item.end + 2.5 >= this._time(0));
    this.moments.push(moment);
    // Bounded bookkeeping even if a practice session lasts hours.
    if (this.moments.length > 256) this.moments = this.moments.sort((a, b) => b.points - a.points).slice(0, 256);
    return true;
  }

  finish() {
    if (this.finished) return this.clips;
    if (!this.enabled || this.count < 2) {
      this.finished = true;
      return this.clips = [];
    }
    // Preserve the exact latest pose if the session stopped between sample ticks.
    if (this.time > this._time(this.count - 1) + 1e-8) this._capture();
    this.finished = true;
    const earliest = this._time(0), latest = this._time(this.count - 1);
    const selected = [];
    for (const moment of [...this.moments].sort((a, b) => b.points - a.points || a.end - b.end)) {
      // A ring-buffered event whose trick start is gone is no longer replayable.
      if (moment.start < earliest - 1e-7 || moment.end > latest + 1e-7) continue;
      const start = Math.max(earliest, moment.start - 2.5);
      const end = Math.min(latest, moment.end + 2.5);
      if (end <= start || selected.some(clip => start < clip.end && end > clip.start)) continue;
      const events = this.events.filter(event=>event.time>=start&&event.time<=end);
      // A selected clip may begin in the middle of an existing grind.
      const previousGrind = this.events.filter(event=>event.time<start&&['grind','grindEnd','bail'].includes(event.kind)).at(-1);
      if(previousGrind?.kind==='grind')events.unshift(Object.freeze({...previousGrind,time:start}));
      selected.push({
        start, end, duration: end - start, trickStart: moment.start, trickEnd: moment.end,
        points: moment.points, label: moment.label, nodes: this.nodes,
        stride: this.stride, sampleHz: this.sampleHz,
        events: Object.freeze(events),
        sample: (time, target) => this.sample(time, target),
      });
      if (selected.length === 3) break;
    }
    return this.clips = selected;
  }

  sample(time, target) {
    if (!this.finished || !this.count || !Number.isFinite(time)
      || !(target instanceof Float32Array) || target.length < this.stride) return false;
    const clamped = Math.max(this._time(0), Math.min(this._time(this.count - 1), time));
    let low = 0, high = this.count - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this._time(mid) < clamped) low = mid + 1;
      else high = mid;
    }
    const right = low, left = Math.max(0, right - 1);
    const a = this._index(left) * this.stride, b = this._index(right) * this.stride;
    const span = this._time(right) - this._time(left);
    const mix = span > 0 ? (clamped - this._time(left)) / span : 0;
    for (let k = 0; k < this.stride; k += VALUES_PER_NODE) {
      for (const component of LINEAR_COMPONENTS)
        target[k + component] = this.poses[a + k + component] * (1 - mix) + this.poses[b + k + component] * mix;
      Quaternion.slerpFlat(target, k + 3, this.poses, a + k + 3, this.poses, b + k + 3, mix);
      target[k + 10] = this.poses[(mix < 0.5 ? a : b) + k + 10];
    }
    return true;
  }
}
