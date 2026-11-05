/**
 * Coalesce map updates into one serial job. Room state may arrive during a
 * Portals asset load. Dropping that update leaves peers skating different maps.
 */
export class OnlineMapLoadQueue {
  constructor(loader) {
    this.loader=loader;
    this.pending=null;
    this.running=null;
    this.cancelled=false;
  }
  request(id) {
    if(this.cancelled) return Promise.resolve(false);
    this.pending=id;
    if(!this.running) {
      this.running=this.drain();
    }
    return this.running;
  }
  async drain(){
    try{
      while(!this.cancelled&&this.pending!==null){
        const requested=this.pending;
        this.pending=null;
        await this.loader(requested);
      }
      return !this.cancelled;
    }finally{this.running=null;}
  }
  cancel(){this.cancelled=true;this.pending=null;}
}
