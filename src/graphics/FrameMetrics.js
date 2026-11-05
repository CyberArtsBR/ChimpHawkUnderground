/** Render submissions and optional asynchronous GPU timings, never display refresh claims. */
export class FrameMetrics {
  constructor(renderer, node = null) {
    this.renderer=renderer;this.node=node;this.enabled=false;this.samples=[];this.pending=[];
    this.gl=renderer.getContext();this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.last=null;this.lastPublish=0;this.gpuSampleSerial=0;this.value={};
  }
  setEnabled(enabled){this.suspend();this.enabled=Boolean(enabled);if(this.node)this.node.hidden=!enabled;}
  begin(now=performance.now()){
    if(!this.enabled)return;
    this.started=now;this.oldAutoReset=this.renderer.info.autoReset;this.recording=true;
    this.renderer.info.autoReset=false;this.renderer.info.reset();
    const gl=this.gl,ext=this.extension;
    if(ext&&this.pending.length<4&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){
      this.query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,this.query);
    }
  }
  end(now=performance.now()){
    if(!this.enabled)return;
    const gl=this.gl,ext=this.extension;
    if(this.query){gl.endQuery(ext.TIME_ELAPSED_EXT);this.pending.push(this.query);this.query=null;}
    let gpuMs=null;
    const disjoint=ext&&gl.getParameter(ext.GPU_DISJOINT_EXT);
    while(this.pending.length&&(disjoint||gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE))){
      const query=this.pending.shift();
      if(!disjoint){gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;this.gpuSampleSerial++;}
      gl.deleteQuery(query);
    }
    if(this.last!==null)this.samples.push({at:now,ms:now-this.last});this.last=now;
    while(this.samples.length&&this.samples[0].at<now-2000)this.samples.shift();
    const {calls,triangles}=this.renderer.info.render;
    this.renderer.info.autoReset=this.oldAutoReset;this.recording=false;
    this.value={...this.value,cpuSubmitMs:now-this.started,calls,triangles,
      cpuSubmitScope:'graphicsPipeline.render',
      geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,
      gpuSupported:Boolean(ext),gpuSampleSerial:this.gpuSampleSerial,gpuSampleFresh:gpuMs!==null,
      ...(disjoint?{gpuMs:null}:gpuMs!==null?{gpuMs}:{}),measurement:'submitted frames'};
    if(now-this.lastPublish<500||!this.samples.length)return;
    this.lastPublish=now;const sorted=this.samples.map(s=>s.ms).sort((a,b)=>a-b);
    const mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
    Object.assign(this.value,{fps:1000/mean,meanMs:mean,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],
      overBudget:sorted.filter(ms=>ms>1000/144).length,samples:sorted.length});
    if(this.node)this.node.textContent=`${Math.round(this.value.fps)} FPS · ${mean.toFixed(1)} ms`;
  }
  suspend(){
    this.last=null;this.samples.length=0;
    // Queries crossing a pause/map transition must not be attributed to the
    // next route. Keep the serial monotonic so collectors can deduplicate it.
    if(this.query){this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.gl.deleteQuery(this.query);this.query=null;}
    for(const query of this.pending)this.gl.deleteQuery(query);
    this.pending.length=0;
    if(this.recording){this.renderer.info.autoReset=this.oldAutoReset;this.recording=false;}
    Object.assign(this.value,{gpuMs:null,gpuSampleFresh:false,gpuSampleSerial:this.gpuSampleSerial});
  }
  dispose(){this.suspend();this.node?.remove();}
}
