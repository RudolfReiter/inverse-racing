(() => {
  'use strict';
  const data=window.RACING_EXPERIMENT, $=id=>document.getElementById(id);
  if(!data){$('profile-description').textContent='Experiment data is unavailable. Regenerate it with the Python experiment.';return;}
  const colors={learned:'#b44819',actual:'#2166ac',default:'#75559b',constant_velocity:'#697682'};
  const descriptions={smooth:['Smooth driver','Higher acceleration and jerk penalties.'],balanced:['Balanced driver','Moderate acceleration and jerk penalties.'],attack:['Aggressive driver','Lower acceleration and jerk penalties.']};
  const cameraViews=['window','follow','circuit','top'];
  const scene=new window.RacingScene($('race-canvas'),data);
  let profile=data.scenarios[1],method='learned',playing=false,speed=1,lastStamp=null,dirty=true;
  let showPath=true,showBars=false,lastForecast=null,lastTime=null,lastPhase=null;
  const replay=new window.ComparisonReplay(profile,data.config);
  const ns='http://www.w3.org/2000/svg';
  const chartCursors={};
  const number=(x,digits=2)=>Number(x.toFixed(digits)).toString();
  function element(tag,attributes,parent,text){
    const node=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attributes||{}))node.setAttribute(key,value);
    if(text!==undefined)node.textContent=text;
    if(parent)parent.appendChild(node);
    return node;
  }
  function size(svg,height){
    const width=Math.max(220,Math.round(svg.getBoundingClientRect().width||560));
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    return {width,height};
  }
  function niceMax(value){
    const power=10**Math.floor(Math.log10(Math.max(value,1e-6)));
    return [1,2,5,10].find(x=>x*power>=value)*power;
  }
  function chart(svg,{series,xMax=6,yMin=0,yMax=40,xLabel='Time since forecast (s)',unit='',height=280,log=false,cursor=false}){
    const {width}=size(svg,height);svg.replaceChildren();
    const p={l:56,r:15,t:29,b:53},w=width-p.l-p.r,h=height-p.t-p.b;
    const x=v=>p.l+v/xMax*w,ly=v=>log?Math.log10(Math.max(1e-12,v)):v;
    const y=v=>p.t+(ly(yMax)-ly(v))/(ly(yMax)-ly(yMin)||1)*h;
    for(let i=0;i<=4;i++){
      const value=log?10**(ly(yMin)+(ly(yMax)-ly(yMin))*i/4):yMin+(yMax-yMin)*i/4;
      element('line',{x1:p.l,x2:width-p.r,y1:y(value),y2:y(value),stroke:'#e2e7ec'},svg);
      element('text',{x:p.l-9,y:y(value)+5,fill:'#526170','font-size':14,'text-anchor':'end'},svg,log?value.toExponential(0):number(value));
    }
    for(let i=0;i<=3;i++)element('text',{x:x(xMax*i/3),y:height-29,fill:'#526170','font-size':14,'text-anchor':'middle'},svg,number(xMax*i/3,1));
    element('text',{x:p.l,y:16,fill:'#526170','font-size':14},svg,unit);
    element('text',{x:width/2,y:height-5,fill:'#526170','font-size':14,'text-anchor':'middle'},svg,xLabel);
    for(const s of series){
      const points=s.values.map((point,i)=>`${i?'L':'M'}${x(point[0])},${y(point[1])}`).join(' ');
      element('path',{d:points,fill:'none',stroke:s.color,'stroke-width':s.width||2,'stroke-dasharray':s.dash||'0','stroke-linecap':'round','stroke-linejoin':'round'},svg);
    }
    if(cursor){
      const line=element('line',{x1:x(0),x2:x(0),y1:p.t,y2:height-p.b,stroke:'#32475b','stroke-width':1.2,'stroke-dasharray':'3 3'},svg);
      const dot=element('circle',{cx:x(0),cy:y(0),r:4,fill:colors[method],stroke:'#fff','stroke-width':1.5},svg);
      chartCursors[svg.getAttribute('id')]={line,dot,x,y};
    }
  }
  function updateForecast(){
    const f=replay.forecast,ts=Array.from({length:data.config.intervals+1},(_,i)=>i*data.config.dt);
    $('forecast-origin').textContent=`Forecast made at ${f.time.toFixed(1)} s`;
    $('forecast-ade').textContent=`${f.metrics[method].ade_m.toFixed(2)} m`;
    const slack=f[method].constraint_relaxation||0;
    $('relaxation').textContent=method==='constant_velocity'?'This baseline does not enforce acceleration limits.':slack>1e-6?`Acceleration bounds relaxed by ${slack.toFixed(3)} m/s².`:'Hard acceleration bounds satisfied.';
    const series=['constant_velocity','default','learned','actual'].map(key=>({color:colors[key],values:f[key].states.map((state,i)=>[ts[i],state[1]]),dash:key==='actual'?'5 4':key==='constant_velocity'?'3 4':'0',width:key===method||key==='actual'?2.5:1.5}));
    const speeds=series.flatMap(s=>s.values.map(p=>p[1]));
    chart($('speed-chart'),{series,yMin:Math.max(0,Math.floor(Math.min(...speeds)-1)),yMax:Math.ceil(Math.max(...speeds)+1),unit:'Speed (m/s)',cursor:true});
    const errors=['constant_velocity','default','learned'].map(key=>({color:colors[key],values:f[key].xy.map((point,i)=>[ts[i],Math.hypot(point[0]-f.actual.xy[i][0],point[1]-f.actual.xy[i][1])]),dash:key==='constant_velocity'?'3 4':'0',width:key===method?2.5:1.5}));
    chart($('error-chart'),{series:errors,yMax:niceMax(Math.max(.5,...errors.flatMap(s=>s.values.map(p=>p[1])))),unit:'Position error (m)',cursor:true});
    createGapRuler();lastForecast=f;
  }
  let gapRuler;
  function createGapRuler(){
    const svg=$('gap-chart'),{width}=size(svg,105);svg.replaceChildren();
    const f=replay.forecast;
    const range=niceMax(Math.max(2,...f[method].states.map((state,i)=>Math.abs(state[0]-f.actual.states[i][0]))));
    const x=value=>width/2+value/range*(width/2-25);
    element('line',{x1:25,x2:width-25,y1:50,y2:50,stroke:'#aebbc8','stroke-width':2},svg);
    for(const value of [-range,0,range]){
      element('line',{x1:x(value),x2:x(value),y1:45,y2:56,stroke:'#8494a4'},svg);
      element('text',{x:x(value),y:79,fill:'#526170','font-size':14,'text-anchor':'middle'},svg,value===0?'Actual':`${value>0?'+':''}${number(value)} m`);
    }
    const span=element('line',{x1:x(0),x2:x(0),y1:50,y2:50,stroke:colors.learned,'stroke-width':4},svg);
    element('circle',{cx:x(0),cy:50,r:5,fill:colors.actual,stroke:'#fff','stroke-width':1.5},svg);
    const stem=element('line',{x1:x(0),x2:x(0),y1:27,y2:48,stroke:colors.learned,'stroke-width':2},svg);
    const ghost=element('circle',{cx:x(0),cy:27,r:5,fill:'#fff',stroke:colors.learned,'stroke-width':2},svg);
    const label=element('text',{x:x(0),y:15,fill:colors.learned,'font-size':14,'text-anchor':'middle'},svg,'Ghost');
    gapRuler={x,span,stem,ghost,label,width};
  }
  function updateWeights(){
    const holder=$('weight-comparison');holder.replaceChildren();
    for(const key of ['acceleration','jerk']){
      const actual=profile.true_weights[key],fitted=profile.learned_weights[key],max=Math.max(actual,fitted)*1.2;
      const row=document.createElement('div');row.className='weight-row';
      const header=document.createElement('div');header.className='weight-row-header';
      const label=document.createElement('span');label.textContent=key==='acceleration'?'Acceleration penalty, wₐ':'Jerk penalty, wⱼ';
      const value=document.createElement('span');value.textContent=fitted.toFixed(4);header.append(label,value);row.append(header);
      for(const [v,color] of [[actual,colors.actual],[fitted,colors.learned]]){
        const bar=document.createElement('div');bar.className='weight-bar';const fill=document.createElement('i');fill.style.width=`${v/max*100}%`;fill.style.background=color;bar.append(fill);row.append(bar);
      }
      const caption=document.createElement('div');caption.className='weight-row-labels';
      const a=document.createElement('span');a.textContent=`True: ${actual.toFixed(4)}`;const b=document.createElement('span');b.textContent=`Fitted: ${fitted.toFixed(4)}`;caption.append(a,b);row.append(caption);holder.append(row);
    }
    const f=profile.fit;$('fit-reduction').textContent=`${((1-f.final_loss/f.initial_loss)*100).toFixed(1)}% reduction in training loss`;
    const values=f.history.map(p=>[p.evaluation,p.loss]);
    chart($('fit-chart'),{series:[{values,color:colors.learned}],xMax:Math.max(1,values.at(-1)[0]),yMin:Math.max(1e-7,f.final_loss*.5),yMax:f.initial_loss*1.2,log:true,height:240,xLabel:'Objective evaluations',unit:'Best loss (log scale)'});
  }
  function selectProfile(id){
    profile=data.scenarios.find(s=>s.id===id);replay.setScenario(profile);setPlaying(false);scene.resetCamera();
    document.querySelectorAll('[data-profile]').forEach(b=>{const selected=b.dataset.profile===id;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    $('profile-name').textContent=descriptions[id][0];$('profile-description').textContent=descriptions[id][1];$('timeline').max=replay.duration;
    updateWeights();updateForecast();dirty=true;
  }
  function drawEnvelope(){
    const svg=$('envelope-chart'),{width:w,height:h}=size(svg,350);svg.replaceChildren();
    const p={l:57,r:16,t:18,b:60},x=v=>p.l+(v+14)/28*(w-p.l-p.r),y=v=>p.t+(9-v)/21*(h-p.t-p.b);
    for(const v of [-10,0,10]){
      element('line',{x1:x(v),x2:x(v),y1:p.t,y2:h-p.b,stroke:'#e2e7ec'},svg);
      element('text',{x:x(v),y:h-p.b+23,fill:'#526170','font-size':14,'text-anchor':'middle'},svg,v);
    }
    for(const v of [-10,-5,0,5]){
      element('line',{x1:p.l,x2:w-p.r,y1:y(v),y2:y(v),stroke:'#e2e7ec'},svg);
      element('text',{x:p.l-10,y:y(v)+5,fill:'#526170','font-size':14,'text-anchor':'end'},svg,v);
    }
    data.calibration.samples.forEach((point,i)=>{if(point[0]<-14||point[0]>14||point[1]<-12||point[1]>9)return;element('circle',{cx:x(point[0]),cy:y(point[1]),r:i<6?3:1.9,fill:i<6?'#a83e16':'#697682',opacity:i<6?.8:.35},svg);});
    for(const [key,color,dash] of [['true_vertices',colors.actual,'5 4'],['estimated_vertices',colors.learned,'0']])element('polygon',{points:data.calibration[key].map(point=>`${x(point[0])},${y(point[1])}`).join(' '),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':dash},svg);
    element('text',{x:w/2,y:h-8,fill:'#526170','font-size':14,'text-anchor':'middle'},svg,'Lateral acceleration (m/s²)');
    element('text',{x:16,y:h/2,fill:'#526170','font-size':14,transform:`rotate(-90 16 ${h/2})`,'text-anchor':'middle'},svg,'Longitudinal acceleration (m/s²)');
  }
  function results(){
    const metric=(id,value,unit)=>$(id).replaceChildren(document.createTextNode(value),Object.assign(document.createElement('small'),{textContent:unit}));
    metric('overall-ade',data.metrics.learned.ade_m.toFixed(2),'m');
    const reduction=(1-data.metrics.learned.ade_m/data.metrics.constant_velocity.ade_m)*100;
    metric('improvement',Math.abs(reduction).toFixed(0),'%');$('improvement-caption').textContent=reduction>=0?'Reduction in mean position error':'Increase in mean position error';
    metric('forecast-count',data.scenarios.reduce((sum,s)=>sum+s.race.forecasts.length,0),'× 6 s');
    const body=$('benchmark-body');
    for(const [key,name] of [['learned','Learned preferences'],['default','Default weights'],['constant_velocity','Constant velocity']]){
      const row=document.createElement('tr');if(key==='learned')row.className='learned';
      const nameCell=document.createElement('td'),dot=document.createElement('i');dot.style.background=colors[key];nameCell.append(dot,document.createTextNode(name));row.append(nameCell);
      for(const value of [...data.scenarios.map(s=>s.metrics[key].ade_m),data.metrics[key].ade_m]){const td=document.createElement('td');td.textContent=value.toFixed(2);row.append(td);}body.append(row);
    }
  }
  function updateComparison(snapshot){
    $('timeline').value=snapshot.time;$('play-time').textContent=`${snapshot.time.toFixed(1)} / ${replay.duration.toFixed(1)} s`;
    $('scene-time').textContent=`Elapsed ${snapshot.elapsed.toFixed(1)} / 6.0 s`;
    $('comparison-phase').textContent=snapshot.phase==='result'?'Six-second result':playing?'Prediction held fixed':'Paused — prediction held fixed';
    $('current-error').textContent=snapshot.error.toFixed(2);$('live-speed').textContent=`${(snapshot.actual[1]*3.6).toFixed(1)} km/h`;
    const d=snapshot.alongPathError;
    $('gap-description').textContent=Math.abs(d)<.005?'The two positions coincide.':`The ghost is ${Math.abs(d).toFixed(2)} m ${d>0?'ahead':'behind'} along the path.`;
    const x=gapRuler.x(d);gapRuler.span.setAttribute('x2',x);gapRuler.stem.setAttribute('x1',x);gapRuler.stem.setAttribute('x2',x);gapRuler.ghost.setAttribute('cx',x);gapRuler.label.setAttribute('x',Math.max(25,Math.min(gapRuler.width-25,x)));
    for(const [id,value] of [['speed-chart',snapshot.predicted[1]],['error-chart',snapshot.error]]){
      const cursor=chartCursors[id],cx=cursor.x(snapshot.elapsed);
      cursor.line.setAttribute('x1',cx);cursor.line.setAttribute('x2',cx);cursor.dot.setAttribute('cx',cx);cursor.dot.setAttribute('cy',cursor.y(value));
    }
    $('next-window').disabled=replay.index>=replay.windows.length-1;
  }
  function render(seconds=1/60){
    if(replay.forecast!==lastForecast)updateForecast();
    const snapshot=replay.snapshot(method);updateComparison(snapshot);
    scene.render(snapshot,{showPath,showBars,frameSeconds:seconds});dirty=false;scene.needsRender=false;
    lastTime=snapshot.time;lastPhase=snapshot.phase;
  }
  function setPlaying(value){
    playing=value;$('play-toggle').textContent=value?'Pause':replay.ended?'Replay drive':'Play';
    $('play-toggle').setAttribute('aria-label',value?'Pause comparison':replay.ended?'Replay the full drive':'Play comparison');dirty=true;
  }
  function animate(stamp){
    const delta=lastStamp===null?0:Math.min(.05,(stamp-lastStamp)/1000);lastStamp=stamp;
    if(playing&&!document.hidden&&scene.visible){replay.tick(delta*speed);if(replay.ended)setPlaying(false);}
    if(dirty||scene.needsRender||scene.cameraMoving||replay.time!==lastTime||replay.phase!==lastPhase)render(delta);
    requestAnimationFrame(animate);
  }
  document.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>selectProfile(b.dataset.profile)));
  $('prediction-model').addEventListener('change',e=>{method=e.target.value;updateForecast();dirty=true;});
  $('play-toggle').addEventListener('click',()=>{if(replay.ended){replay.setScenario(profile);scene.resetCamera();}setPlaying(!playing);});
  $('timeline').addEventListener('input',e=>{replay.seek(Number(e.target.value));setPlaying(false);scene.resetCamera();dirty=true;render();});
  $('restart-window').addEventListener('click',()=>{replay.elapsed=0;replay.holdRemaining=0;replay.ended=false;setPlaying(false);scene.resetCamera();render();});
  $('next-window').addEventListener('click',()=>{if(replay.advanceWindow()){setPlaying(false);render();}});
  $('replay-speed').addEventListener('click',()=>{speed=speed===1?.5:speed===.5?2:1;$('replay-speed').textContent=`${speed}×`;});
  $('show-path').addEventListener('change',e=>{showPath=e.target.checked;dirty=true;});
  $('show-bars').addEventListener('change',e=>{showBars=e.target.checked;dirty=true;});
  for(const view of cameraViews)$(view+'-camera').addEventListener('click',()=>{scene.setView(view);for(const v of cameraViews)$(v+'-camera').setAttribute('aria-pressed',String(v===view));dirty=true;});
  $('reset-camera').addEventListener('click',()=>{scene.setView(scene.view);dirty=true;});
  window.addEventListener('resize',()=>{drawEnvelope();updateWeights();updateForecast();dirty=true;});
  document.addEventListener('visibilitychange',()=>{lastStamp=null;});
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  async function copy(text){
    try{await navigator.clipboard.writeText(text);toast('Copied to clipboard');}
    catch{const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.left='-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();toast(ok?'Copied to clipboard':'Select the text and copy it manually.');}
  }
  $('copy-install').addEventListener('click',()=>copy($('install-code').textContent));
  $('copy-citation').addEventListener('click',()=>copy(`@inproceedings{reiter2022inverse,
  title={An Inverse Optimal Control Approach for Trajectory Prediction of Autonomous Race Cars},
  author={Reiter, Rudolf and Messerer, Florian and Schratter, Markus and Watzenig, Daniel and Diehl, Moritz},
  booktitle={2022 European Control Conference (ECC)},
  year={2022},
  doi={10.23919/ECC55457.2022.9838100},
  eprint={2204.01494},
  archivePrefix={arXiv}
}`));
  results();drawEnvelope();selectProfile('balanced');render();requestAnimationFrame(animate);
  window.racingStatus=()=>({profile:profile.id,time:replay.time,elapsed:replay.elapsed,phase:replay.phase,playing,ended:replay.ended,method,view:scene.view,forecast:replay.forecast.origin,error:replay.snapshot(method).error,camera:scene.lastComparison});
})();
