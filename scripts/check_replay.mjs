/** Numerical regression checks for frozen forecasts and continuous cameras. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'docs/data/experiment.json'),'utf8'));
const context2d=new Proxy({measureText:t=>({width:String(t).length*8}),
  createLinearGradient:()=>({addColorStop(){}})},
  {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const sandbox={window:{devicePixelRatio:1},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}}};
vm.createContext(sandbox);
for(const file of ['replay.js','scene.js'])vm.runInContext(fs.readFileSync(path.join(root,'docs',file),'utf8'),sandbox);
const {ComparisonReplay,RacingScene}=sandbox.window;
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
for(const scenario of data.scenarios){
  const replay=new ComparisonReplay(scenario,data.config);
  assert.equal(replay.windows.length,4);
  const original=replay.forecast;
  for(let frame=0;frame<360;frame++){
    assert.equal(replay.forecast,original);
    const current=replay.snapshot();
    near(current.time,current.elapsed);
    replay.tick(1/60);
  }
  near(replay.elapsed,6);assert.equal(replay.forecast,original);
  assert.equal(replay.phase,'result');
  for(const method of ['learned','default','constant_velocity']){
    const s=replay.snapshot(method);
    near(s.error,original.metrics[method].fde_m,2e-6);
    near(s.predicted[0],original[method].states.at(-1)[0],2e-6);
    near(s.actual[0],original.actual.states.at(-1)[0],2e-6);
  }
  replay.tick(1.0);assert.equal(replay.forecast,original);
  replay.tick(.4);assert.equal(replay.forecast.origin,30);near(replay.elapsed,0);
  near(replay.snapshot().error,0);
  replay.tick(100);assert.equal(replay.ended,true);near(replay.time,24);
  const time=replay.time;replay.tick(5);assert.equal(replay.time,time);
}
const canvas={getContext:()=>context2d,getBoundingClientRect:()=>({width:900,height:600}),addEventListener(){}};
const scene=new RacingScene(canvas,data);
const replay=new ComparisonReplay(data.scenarios[1],data.config);
scene.setView('follow');
for(const boundary of [.2,1,5,6,12,18]){
  replay.seek(boundary-1e-5);const before=replay.snapshot();scene.updateCamera(before,1/60);const target=[...scene.cameraTarget];
  replay.seek(boundary+1e-5);const after=replay.snapshot();scene.updateCamera(after,1/60);
  assert.ok(Math.hypot(...scene.cameraTarget.map((v,i)=>v-target[i]))<.005,'Camera target must be continuous across data and forecast boundaries');
}
scene.setView('window');replay.seek(1);scene.updateCamera(replay.snapshot(),1/60);const locked=[...scene.focus];
replay.seek(5.9);scene.updateCamera(replay.snapshot(),1/60);
near(scene.focus[0],locked[0]);near(scene.focus[1],locked[1]);
replay.seek(6.01);scene.updateCamera(replay.snapshot(),1/60);
const jump=Math.hypot(scene.focus[0]-locked[0],scene.focus[1]-locked[1]);
const distance=Math.hypot(scene.cameraTarget[0]-locked[0],scene.cameraTarget[1]-locked[1]);
assert.ok(jump<distance*.1,'Fixed camera must ease into the next window');
scene.render(replay.snapshot());
near(scene.lastComparison.actualProgress,replay.snapshot().actual[0]);
near(scene.lastComparison.predictedProgress,replay.snapshot().predicted[0]);
console.log('Replay checks passed: fixed six-second forecasts, final FDE, result holds, synchronized ghost, no automatic wrap, continuous follow target, eased fixed camera.');
