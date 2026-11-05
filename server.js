// Portals server-side room referee. Client movement/scores remain casual.
const MAPS=['skate-paradise','orbit','grand-warehouse'], ready=new Set(),scores=new Map(),names=new Map(),banned=new Set(),last=new Set();
let host=null,mode='free',map='grand-warehouse',phase='free',round=0,deadline=0,lastDeadline=0,pending=null;
const players=()=>server.players().slice(0,4),has=id=>players().some(p=>p.id===id);
function ensureHost(){if(!has(host))host=players()[0]?.id||null}
function rows(){return [...scores].filter(([id])=>has(id)).map(([id,s])=>({id,name:names.get(id)||players().find(p=>p.id===id)?.displayName||'Guest',...s})).sort((a,b)=>b.points-a.points||b.combo-a.combo||a.id.localeCompare(b.id))}
function snapshot(){ensureHost();return {v:1,host,map,mode,phase,round,deadline,lastDeadline,pending,ready:[...ready].filter(has),names:Object.fromEntries([...names].filter(([id])=>has(id))),scores:rows(),participants:players().map(p=>p.id)}}
function publish(){server.setState('server:online',snapshot())}
function reset(){ready.clear();scores.clear();last.clear();phase=mode==='free'?'free':'lobby';deadline=0;lastDeadline=0;publish()}
function finish(){if(phase==='results')return;phase='results';deadline=0;lastDeadline=0;last.clear();ready.clear();publish();server.send({kind:'online:results',rows:rows(),round})}
function change(next){map=MAPS.includes(next.map)?next.map:map;mode=['jam','free'].includes(next.mode)?next.mode:mode;pending=null;reset();server.send({kind:'online:change',map,mode})}
const previous=server.getState('server:online');
if(previous&&typeof previous==='object'){map=MAPS.includes(previous.map)?previous.map:map;mode=['free','jam'].includes(previous.mode)?previous.mode:mode;round=Number(previous.round)||0;if(['countdown','jam','last'].includes(previous.phase)){phase=previous.phase;deadline=Number(previous.deadline)||0;lastDeadline=Number(previous.lastDeadline)||0;if(!deadline||deadline<Date.now()-65000)phase='results'}}
server.on('playerjoin',p=>{if(server.players().length>4||banned.has(p.id)){server.kick(p.id);return}ensureHost();publish()});
server.on('playerleave',p=>{ready.delete(p.id);names.delete(p.id);last.delete(p.id);if(host===p.id)host=null;ensureHost();if(phase==='last'&&!last.size)finish();else publish()});
server.on('message',(d,from)=>{
 if(!d||typeof d!=='object'||!has(from)||banned.has(from))return;
 if(d.kind==='online:hello'){const value=String(d.name||'').trim();names.set(from,/^[A-Za-z0-9 _-]{3,16}$/.test(value)?value:(players().find(p=>p.id===from)?.displayName||'Guest').slice(0,16));publish()}
 else if(d.kind==='online:ready'&&['free','lobby','results'].includes(phase)){if(d.ready===true)ready.add(from);else ready.delete(from);publish()}
 else if(d.kind==='online:start'&&from===host&&['free','lobby','results'].includes(phase)&&mode==='jam'){
  const participants=[...ready].filter(has);if(participants.length<2)return;scores.clear();last.clear();
  for(const id of participants)scores.set(id,{points:0,combo:0,active:false,done:false});
  round++;phase='countdown';deadline=Date.now()+3000;publish()
 }
 else if(d.kind==='online:score'&&['jam','last'].includes(phase)&&scores.has(from)){
  const s=scores.get(from),pts=Number(d.points),combo=Number(d.combo);
  if(s.done||!Number.isSafeInteger(pts)||pts<0||pts>1e9||!Number.isSafeInteger(combo)||combo<0||combo>1e9)return;
  if(phase==='last'&&!last.has(from))return;
  s.points=Math.max(s.points,pts);s.combo=Math.max(s.combo,combo);s.active=d.active===true;
  if(phase==='last'&&!s.active){s.done=true;last.delete(from)}
  if(phase==='last'&&!last.size)finish();else publish()
 }
 else if(d.kind==='online:done'&&phase==='last'&&last.has(from)){last.delete(from);scores.get(from).done=true;if(!last.size)finish();else publish()}
 else if(d.kind==='online:settings'&&from===host){const next={map:d.map,mode:d.mode};
   if(['jam','last','countdown'].includes(phase)){if(d.apply==='now'){server.send({kind:'online:cancelled',round});change(next)}else{pending=next;publish()}}
   else change(next)
 }
 else if(d.kind==='online:next'&&from===host&&phase==='results'){if(pending)change(pending);else reset()}
 else if(d.kind==='online:kick'&&from===host&&['free','lobby','results'].includes(phase)&&d.target!==host&&has(d.target)){banned.add(d.target);server.kick(d.target)}
});
server.setInterval(()=>{
 const t=Date.now();
 if(phase==='countdown'&&t>=deadline){phase='jam';deadline=t+90000;server.send({kind:'online:begin',round});publish()}
 else if(phase==='jam'&&t>=deadline){phase='last';lastDeadline=t+60000;for(const [id,s] of scores){if(s.active&&has(id))last.add(id);else s.done=true}if(!last.size)finish();else publish()}
 else if(phase==='last'&&t>=lastDeadline)finish();
 if(['countdown','jam','last'].includes(phase))server.send({kind:'online:clock',phase,remaining:Math.max(0,Math.ceil(((phase==='last'?lastDeadline:deadline)-t)/1000))});
},1000);
publish();
