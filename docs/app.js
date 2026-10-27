(() => {
  'use strict';
  const data=window.RACING_EXPERIMENT;
  const $=id=>document.getElementById(id);
  if(!data){$('profile-description').textContent='Experiment data could not be loaded. Run the Python experiment to regenerate docs/data/experiment.js.';return;}
  const colors={learned:'#ff8452',actual:'#b4d8a4',default:'#b5b3db',constant_velocity:'#7a8970'};
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene=new window.RacingScene($('race-canvas'),data);
  const hero=new window.RacingScene($('hero-canvas'),data,{hero:true});
  let profile=data.scenarios[1],time=0,horizon=6,playing=!reduceMotion,speed=1,lastStamp=0,lastDraw=0,lastForecast=-1;
  let truth=true,bars=true;
  const svgNS='http://www.w3.org/2000/svg';
  function element(tag,attributes,parent,text){
    const node=document.createElementNS(svgNS,tag);
    for(const [k,v] of Object.entries(attributes||{}))node.setAttribute(k,v);
    if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;
  }
  function chart(svg,{series,xMax=6,yMin=0,yMax=40,xLabel='Prediction horizon · s',yTicks=4,log=false}){
    const [, ,width,height]=svg.getAttribute('viewBox').split(' ').map(Number);
    svg.replaceChildren();
    const pad={l:40,r:14,t:13,b:36},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
    const x=v=>pad.l+v/xMax*w;
    const ly=v=>log?Math.log10(Math.max(1e-10,v)):v;
    const y=v=>pad.t+(ly(yMax)-ly(v))/(ly(yMax)-ly(yMin)||1)*h;
    for(let i=0;i<=yTicks;i++){
      const v=log?10**(ly(yMin)+(ly(yMax)-ly(yMin))*i/yTicks):yMin+(yMax-yMin)*i/yTicks;
      element('line',{x1:pad.l,x2:width-pad.r,y1:y(v),y2:y(v),stroke:'#728566',opacity:.20,'stroke-dasharray':i?'2 5':'0'},svg);
      element('text',{x:pad.l-9,y:y(v)+3,fill:'#93a486','font-size':9,'font-family':'monospace','text-anchor':'end'},svg,log?v.toExponential(0):(Math.abs(v)<1&&v!==0?v.toFixed(1):v.toFixed(0)));
    }
    for(let i=0;i<=3;i++){
      const v=xMax*i/3;element('text',{x:x(v),y:height-17,fill:'#93a486','font-size':9,'font-family':'monospace','text-anchor':'middle'},svg,v%1?v.toFixed(1):String(v));
    }
    element('text',{x:width/2,y:height-1,fill:'#849678','font-size':8,'font-family':'monospace','text-anchor':'middle'},svg,xLabel);
    for(const s of series){
      const points=s.values.map((p,i)=>`${i?'L':'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' ');
      if(s.fill){element('path',{d:`${points} L${x(s.values[s.values.length-1][0])},${y(yMin)} L${x(s.values[0][0])},${y(yMin)} Z`,fill:s.color,opacity:.07},svg);}
      element('path',{d:points,fill:'none',stroke:s.color,'stroke-width':s.width||2,'stroke-dasharray':s.dash||'0','stroke-linecap':'round','stroke-linejoin':'round'},svg);
    }
  }
  function currentForecast(){return profile.race.forecasts[Math.min(profile.race.forecasts.length-1,Math.floor(time))];}
  function updateForecast(){
    const forecast=currentForecast(),ts=Array.from({length:data.config.intervals+1},(_,i)=>i*data.config.dt);
    $('forecast-ade').textContent=forecast.metrics.learned.ade_m.toFixed(2);
    const slack=forecast.learned.constraint_relaxation;
    $('relaxation').textContent=slack>1e-6?`Envelope relaxed by ${slack.toFixed(3)} m/s² for this forecast`:'Hard acceleration bounds satisfied';
    $('relaxation').style.color=slack>1e-6?'#efb18c':'';
    const series=['constant_velocity','default','actual','learned'].map(key=>({
      color:colors[key],values:forecast[key].states.map((x,i)=>[ts[i],x[1]]),dash:key==='actual'?'4 4':key==='constant_velocity'?'2 5':'0',fill:key==='learned',width:key==='learned'?2.5:1.5
    }));
    const all=series.flatMap(s=>s.values.map(p=>p[1]));
    chart($('speed-chart'),{series,yMin:Math.max(0,Math.floor((Math.min(...all)-2)/5)*5),yMax:Math.ceil((Math.max(...all)+2)/5)*5});
    const errors=['constant_velocity','default','learned'].map(key=>({color:colors[key],values:forecast[key].xy.map((p,i)=>[ts[i],Math.hypot(p[0]-forecast.actual.xy[i][0],p[1]-forecast.actual.xy[i][1])]),dash:key==='constant_velocity'?'3 5':'0',fill:key==='learned'}));
    chart($('error-chart'),{series:errors,yMax:Math.max(2,Math.ceil(Math.max(...errors.flatMap(s=>s.values.map(p=>p[1])))/5)*5)});
    lastForecast=Math.floor(time);
  }
  function updateWeights(){
    const holder=$('weight-comparison');holder.replaceChildren();
    for(const key of ['acceleration','jerk']){
      const trueValue=profile.true_weights[key],learned=profile.learned_weights[key],max=Math.max(trueValue,learned)*1.2;
      const row=document.createElement('div');row.className='weight-row';
      const header=document.createElement('div');header.className='weight-row-header';
      const label=document.createElement('span');label.textContent=key==='acceleration'?'Acceleration penalty · wₐ':'Jerk penalty · wⱼ';
      const value=document.createElement('span');value.textContent=learned.toFixed(4);header.append(label,value);row.append(header);
      for(const [v,color] of [[trueValue,colors.actual],[learned,colors.learned]]){
        const bar=document.createElement('div');bar.className='weight-bar';const fill=document.createElement('i');fill.style.width=`${v/max*100}%`;fill.style.background=color;bar.append(fill);row.append(bar);
      }
      const caption=document.createElement('div');caption.className='weight-row-labels';
      const a=document.createElement('span');a.textContent=`TRUE ${trueValue.toFixed(4)}`;const b=document.createElement('span');b.textContent=`FITTED ${learned.toFixed(4)}`;caption.append(a,b);row.append(caption);holder.append(row);
    }
    const f=profile.fit;
    $('fit-reduction').textContent=`${((1-f.final_loss/f.initial_loss)*100).toFixed(1)}% lower loss`;
    const values=f.history.map(p=>[p.evaluation,p.loss]);
    chart($('fit-chart'),{series:[{values,color:colors.learned}],xMax:Math.max(1,values[values.length-1][0]),yMin:Math.max(1e-7,f.final_loss*.5),yMax:f.initial_loss*1.2,log:true,yTicks:3,xLabel:'Objective evaluations · best loss so far'});
  }
  function selectProfile(id){
    profile=data.scenarios.find(s=>s.id===id);time=0;lastForecast=-1;
    document.querySelectorAll('[data-profile]').forEach(b=>{const selected=b.dataset.profile===id;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    $('profile-name').textContent=profile.name;$('profile-description').textContent=profile.description;
    $('profile-index').textContent=String(data.scenarios.indexOf(profile)+1).padStart(2,'0');
    $('weight-a').textContent=profile.learned_weights.acceleration.toFixed(3);$('weight-j').textContent=profile.learned_weights.jerk.toFixed(3);
    const duration=profile.race.forecasts[profile.race.forecasts.length-1].time;
    $('timeline').max=duration;$('play-duration').textContent=`${duration.toFixed(1)} s`;
    updateWeights();updateForecast();render();
  }
  function drawEnvelope(){
    const svg=$('envelope-chart');svg.replaceChildren();
    const w=560,h=350,pad={l:48,r:17,t:15,b:44},xmin=-14,xmax=14,ymin=-12,ymax=9;
    const x=v=>pad.l+(v-xmin)/(xmax-xmin)*(w-pad.l-pad.r),y=v=>pad.t+(ymax-v)/(ymax-ymin)*(h-pad.t-pad.b);
    for(const v of [-10,-5,0,5,10]){
      element('line',{x1:x(v),x2:x(v),y1:pad.t,y2:h-pad.b,stroke:'#6f815f',opacity:v===0?.45:.2,'stroke-dasharray':v===0?'0':'2 5'},svg);
      element('text',{x:x(v),y:h-pad.b+17,fill:'#96a787','font-size':9,'font-family':'monospace','text-anchor':'middle'},svg,v);
    }
    for(const v of [-10,-5,0,5]){
      element('line',{x1:pad.l,x2:w-pad.r,y1:y(v),y2:y(v),stroke:'#6f815f',opacity:v===0?.45:.2,'stroke-dasharray':v===0?'0':'2 5'},svg);
      element('text',{x:pad.l-12,y:y(v)+3,fill:'#96a787','font-size':9,'font-family':'monospace','text-anchor':'end'},svg,v);
    }
    data.calibration.samples.forEach((p,i)=>{if(p[0]<xmin||p[0]>xmax||p[1]<ymin||p[1]>ymax)return;element('circle',{cx:x(p[0]),cy:y(p[1]),r:i<6?2.3:1.6,fill:i<6?'#d6a07a':'#8f9e80',opacity:i<6?.75:.35},svg);});
    for(const [key,color,dash] of [['true_vertices',colors.actual,'5 4'],['estimated_vertices',colors.learned,'0']]){
      const points=data.calibration[key].map(p=>`${x(p[0])},${y(p[1])}`).join(' ');
      element('polygon',{points,fill:color,'fill-opacity':.03,stroke:color,'stroke-width':1.8,'stroke-dasharray':dash},svg);
    }
    element('text',{x:w/2,y:h-5,fill:'#96a787','font-size':9,'font-family':'monospace','text-anchor':'middle'},svg,'Lateral acceleration · m/s²');
    element('text',{x:12,y:h/2,fill:'#96a787','font-size':9,'font-family':'monospace',transform:`rotate(-90 12 ${h/2})`,'text-anchor':'middle'},svg,'Longitudinal acceleration · m/s²');
  }
  function results(){
    $('overall-ade').replaceChildren(document.createTextNode(data.metrics.learned.ade_m.toFixed(2)),Object.assign(document.createElement('small'),{textContent:'m'}));
    const reduction=(1-data.metrics.learned.ade_m/data.metrics.constant_velocity.ade_m)*100;
    $('improvement').replaceChildren(document.createTextNode(Math.abs(reduction).toFixed(0)),Object.assign(document.createElement('small'),{textContent:'%'}));
    $('improvement-caption').textContent=reduction>=0?'Reduction in average position error':'Increase in average position error';
    const count=data.scenarios.reduce((s,p)=>s+p.race.forecasts.length,0);
    $('forecast-count').replaceChildren(document.createTextNode(count),Object.assign(document.createElement('small'),{textContent:'× 6 s'}));
    const body=$('benchmark-body');
    for(const [method,name] of [['learned','Learned preferences'],['default','Default weights'],['constant_velocity','Constant velocity']]){
      const row=document.createElement('tr');if(method==='learned')row.className='learned';
      const nameCell=document.createElement('td'),dot=document.createElement('i');dot.style.background=colors[method];nameCell.append(dot,document.createTextNode(name));row.append(nameCell);
      for(const value of [...data.scenarios.map(s=>s.metrics[method].ade_m),data.metrics[method].ade_m]){const td=document.createElement('td');td.textContent=value.toFixed(2);row.append(td);}body.append(row);
    }
  }
  function render(){
    const duration=Number($('timeline').max),frame=Math.min(profile.race.states.length-1,Math.round(time/data.config.dt));
    $('timeline').value=Math.min(time,duration);$('play-time').textContent=time.toFixed(1).padStart(4,'0');$('scene-time').textContent=`T + ${time.toFixed(1).padStart(4,'0')} s`;
    $('live-speed').textContent=(profile.race.states[frame][1]*3.6).toFixed(0);
    scene.render(profile,time,horizon,truth,bars);hero.render(profile,time,6,true,true);
  }
  function setPlaying(value){playing=value;$('play-toggle').textContent=playing?'Ⅱ':'▶';$('play-toggle').setAttribute('aria-label',playing?'Pause replay':'Play replay');}
  function animate(stamp){
    const delta=Math.min(.1,(stamp-(lastStamp||stamp))/1000);lastStamp=stamp;
    if(playing&&!document.hidden)time=(time+delta*speed)%(Number($('timeline').max)+.001);
    if(Math.floor(time)!==lastForecast)updateForecast();
    if(stamp-lastDraw>32){render();lastDraw=stamp;}
    requestAnimationFrame(animate);
  }
  document.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>selectProfile(b.dataset.profile)));
  document.querySelectorAll('[data-horizon]').forEach(b=>b.addEventListener('click',()=>{
    horizon=Number(b.dataset.horizon);document.querySelectorAll('[data-horizon]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();
  }));
  $('play-toggle').addEventListener('click',()=>setPlaying(!playing));
  $('timeline').addEventListener('input',e=>{time=Number(e.target.value);setPlaying(false);updateForecast();render();});
  $('replay-speed').addEventListener('click',()=>{speed=speed===1?2:speed===2?.5:1;$('replay-speed').textContent=`${speed}×`;});
  $('show-truth').addEventListener('change',e=>{truth=e.target.checked;render();});
  $('show-bars').addEventListener('change',e=>{bars=e.target.checked;render();});
  for(const view of ['follow','circuit','top'])$(view+'-camera').addEventListener('click',()=>{
    scene.setView(view);for(const v of ['follow','circuit','top'])$(v+'-camera').setAttribute('aria-pressed',String(v===view));render();
  });
  $('reset-camera').addEventListener('click',()=>{scene.setView(scene.view);render();});
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  async function copy(text){
    try{await navigator.clipboard.writeText(text);toast('Copied to clipboard');}
    catch{
      const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.left='-9999px';document.body.append(input);input.select();
      const success=document.execCommand('copy');input.remove();toast(success?'Copied to clipboard':'Select the text and copy it manually.');
    }
  }
  $('copy-install').addEventListener('click',() => copy($('install-code').textContent));
  $('copy-citation').addEventListener('click',()=>copy(`@inproceedings{reiter2022inverse,
  title={An Inverse Optimal Control Approach for Trajectory Prediction of Autonomous Race Cars},
  author={Reiter, Rudolf and Messerer, Florian and Schratter, Markus and Watzenig, Daniel and Diehl, Moritz},
  booktitle={2022 European Control Conference (ECC)},
  year={2022},
  doi={10.23919/ECC55457.2022.9838100},
  eprint={2204.01494},
  archivePrefix={arXiv}
}`));
  results();drawEnvelope();selectProfile('balanced');setPlaying(playing);requestAnimationFrame(animate);
  // A small read-only status hook supports deterministic visual regression checks.
  window.racingStatus=()=>({profile:profile.id,time,horizon,playing,view:scene.view,forecast:currentForecast().origin});
})();
