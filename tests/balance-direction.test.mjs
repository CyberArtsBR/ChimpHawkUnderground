import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateInput } from '../src/input/SkateInput.js';
import { SkillStreetPhysics } from '../src/game/SkillStreetPhysics.js';
import { createBalanceState } from '../src/game/SkateSystems.js';

function playerInput(device, direction) {
  const oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const handlers={};
  globalThis.window={addEventListener(type,fn){handlers[type]=fn;},removeEventListener(){}};
  const pad={id:'balance-test',index:0,connected:true,axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false}))};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>device==='keyboard'?[]:[pad]}});
  try{
    const input=new SkateInput({addEventListener(){},removeEventListener(){}});input.enabled=true;
    if(device==='keyboard'){
      const code={left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS'}[direction];
      handlers.keydown({code,repeat:false,target:{tagName:'BODY'},preventDefault(){}});
    }else if(device==='stick'){
      if(direction==='left')pad.axes[0]=-1;if(direction==='right')pad.axes[0]=1;
      if(direction==='up')pad.axes[1]=-1;if(direction==='down')pad.axes[1]=1;
    }else{
      pad.buttons[{up:12,down:13,left:14,right:15}[direction]].pressed=true;
    }
    const result=input.read();input.dispose();return result;
  }finally{
    globalThis.window=oldWindow;
    if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
  }
}

function balanceAfter(mode, initial, input) {
  const runtime=Object.create(SkillStreetPhysics.prototype),state=createBalanceState(0);
  Object.assign(state,{value:initial,velocity:0,bias:0,disturbance:0});
  runtime.tricks={manualInfo:()=>({difficulty:1,durationRate:28}),comboDuration:()=>0,addDuration(){},combo:[]};
  runtime.steer=0;runtime.manualInstability=0;runtime.manualTime=0;runtime.manualBalanceState=state;
  if(mode==='manual'||mode==='noseManual')runtime.manual=mode;
  else runtime.grind={time:0,instability:0,speed:8,profile:{difficulty:1,durationRate:28},balanceState:state};
  for(let frame=0;frame<20;frame++){
    const success=mode==='grind'?runtime.updateGrindBalance(1/120,input):runtime.updateManualBalance(1/120,input,8);
    assert.equal(success,true,'small balance correction should not end the trick');
  }
  return state.value;
}

for(const device of ['keyboard','stick','dpad']){
  for(const mode of ['grind','manual','noseManual']){
    test(`${device}: ${mode} corrects toward center with the opposite direction`,()=>{
      const positive=mode==='grind'?'left':'down';
      const negative=mode==='grind'?'right':'up';
      for(const [initial,correct,wrong] of [[.45,positive,negative],[-.45,negative,positive]]){
        const corrected=balanceAfter(mode,initial,playerInput(device,correct));
        const worsened=balanceAfter(mode,initial,playerInput(device,wrong));
        assert.ok(Math.abs(corrected)<Math.abs(initial),`${mode} ${initial}: ${correct} should recover (${corrected})`);
        assert.ok(Math.abs(worsened)>Math.abs(initial),`${mode} ${initial}: ${wrong} should worsen (${worsened})`);
      }
    });
  }
}
