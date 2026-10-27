/** Exercise application state and controls in a lightweight DOM model.
 * This catches runtime/state errors; browser layout and pointer behavior still
 * require a real browser. No dependency or browser download is needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context2d=new Proxy({measureText:t=>({width:String(t).length*6}),
  createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
  {get:(obj,key)=>key in obj?obj[key]:()=>{},set:(obj,key,value)=>(obj[key]=value,true)});
class Node{
  constructor(tag='div',attrs={}){this.tag=tag;this.attributes=attrs;this.style={};this.dataset={};this.children=[];this.events={};this.classList={toggle(){},add(){},remove(){}};this.textContent='';this.value=attrs.value||'';this.max=attrs.max;this.checked='checked' in attrs;
    for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5)]=v;
  }
  append(...children){this.children.push(...children);}appendChild(n){this.append(n);return n;}replaceChildren(...c){this.children=c;}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
  addEventListener(k,f){this.events[k]=f;}click(){this.events.click?.({target:this});}
  getBoundingClientRect(){return {width:1000,height:600};}getContext(){return context2d;}setPointerCapture(){}remove(){}select(){}
}
const nodes=[];
const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const attrs={};for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[attr[1]]=attr[2];
  if(/\bchecked\b/.test(match[2]))attrs.checked='';nodes.push(new Node(match[1],attrs));
}
const find=id=>nodes.find(n=>n.attributes.id===id);
const all=selector=>nodes.filter(n=>selector.startsWith('[data-')&&selector.slice(1,-1) in n.attributes);
const doc={getElementById:find,querySelectorAll:all,createElementNS:(_,tag)=>new Node(tag),createElement:tag=>new Node(tag),createTextNode:text=>({textContent:String(text)}),body:new Node(),hidden:false};
let frame;
const win={devicePixelRatio:1,matchMedia:()=>({matches:true})};
const sandbox={window:win,document:doc,navigator:{clipboard:{writeText:async()=>{}}},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},requestAnimationFrame:fn=>{frame=fn;},setTimeout:()=>1,clearTimeout(){},console};
vm.createContext(sandbox);
for(const file of ['data/experiment.js','scene.js','app.js'])vm.runInContext(fs.readFileSync(path.join(root,'docs',file),'utf8'),sandbox,{filename:file});
assert.equal(win.racingStatus().profile,'balanced');assert.equal(win.racingStatus().playing,false);
nodes.find(n=>n.dataset.profile==='attack').click();assert.equal(win.racingStatus().profile,'attack');
nodes.find(n=>n.dataset.horizon==='2').click();assert.equal(win.racingStatus().horizon,2);
find('timeline').value='7.4';find('timeline').events.input({target:find('timeline')});assert.equal(win.racingStatus().time,7.4);
assert.equal(win.racingStatus().forecast,35);
find('circuit-camera').click();assert.equal(win.racingStatus().view,'circuit');
find('top-camera').click();assert.equal(win.racingStatus().view,'top');
find('play-toggle').click();assert.equal(win.racingStatus().playing,true);frame(100);frame(150);assert.ok(win.racingStatus().time>7.4);
find('show-truth').checked=false;find('show-truth').events.change({target:find('show-truth')});
find('show-bars').checked=false;find('show-bars').events.change({target:find('show-bars')});
assert.equal(find('benchmark-body').children.length,3);assert.ok(find('speed-chart').children.length>10);
console.log('Application-state checks passed: data load, driver, horizon, timeline, cameras, playback, overlays, charts, results. Browser layout remains unverified.');
