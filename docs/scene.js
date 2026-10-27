/* Dependency-free projected 3D circuit renderer. Geometry comes from experiment.json. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const mix = (a, b, t) => a + (b - a) * t;
  class RacingScene {
    constructor(canvas, experiment, {hero = false} = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.data = experiment;
      this.track = experiment.track; this.hero = hero; this.yaw = -.48;
      this.elevation = hero ? .78 : .68; this.view = hero ? 'circuit' : 'follow';
      this.zoom = 1; this.width = 1; this.height = 1; this.focus = [0, 0];
      this.visible = true; this.decor = this.makeDecor();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas); this.resize();
      this.observer = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; });
      this.observer.observe(canvas);
      if (!hero) this.bindCamera();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.width = r.width; this.height = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    bindCamera() {
      let drag = null;
      this.canvas.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        drag = [e.clientX, e.clientY, this.yaw, this.elevation];
        this.canvas.setPointerCapture(e.pointerId);
      });
      this.canvas.addEventListener('pointermove', e => {
        if (!drag) return;
        this.yaw = drag[2] + (e.clientX - drag[0]) * .007;
        this.elevation = Math.max(.30, Math.min(1.48, drag[3] + (e.clientY - drag[1]) * .005));
      });
      this.canvas.addEventListener('pointerup', () => { drag = null; });
      this.canvas.addEventListener('pointercancel', () => { drag = null; });
      this.canvas.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') this.yaw -= .12;
        if (e.key === 'ArrowRight') this.yaw += .12;
        if (e.key === 'ArrowUp') this.elevation = Math.min(1.48, this.elevation + .08);
        if (e.key === 'ArrowDown') this.elevation = Math.max(.3, this.elevation - .08);
        if (e.key === '+') this.zoom = Math.min(1.6, this.zoom + .1);
        if (e.key === '-') this.zoom = Math.max(.65, this.zoom - .1);
        if (e.key === '0') this.setView(this.view);
      });
    }
    setView(view) {
      this.view = view; this.yaw = -.48; this.elevation = view === 'top' ? Math.PI / 2 : .68; this.zoom = 1;
    }
    at(s) {
      const t = this.track, p = ((s % t.length) + t.length) % t.length;
      const position = p / t.length * (t.xy.length - 1);
      const i = Math.floor(position), f = position - i;
      const a = t.xy[i], b = t.xy[i + 1];
      return [mix(a[0], b[0], f), mix(a[1], b[1], f), Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    project(x, y, z = 0) {
      const dx = x - this.focus[0], dy = y - this.focus[1];
      const xr = dx * this.cos - dy * this.sin, yr = dx * this.sin + dy * this.cos;
      return [this.width * .50 + xr * this.scale,
              this.height * (this.hero ? .52 : .55) + (yr * this.pitch - z * this.rise) * this.scale];
    }
    poly(points, fill, stroke = null, width = 1) {
      const c = this.ctx;
      c.beginPath(); points.forEach((p, i) => {const q = this.project(...p); i ? c.lineTo(...q) : c.moveTo(...q);});
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    line(points, color, width = 1, dash = []) {
      if (points.length < 2) return;
      const c = this.ctx; c.beginPath();
      points.forEach((p, i) => {const q = this.project(...p); i ? c.lineTo(...q) : c.moveTo(...q);});
      c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); c.setLineDash([]);
    }
    makeDecor() {
      let seed = 94;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const objects = [];
      for (let i = 0; i < 270; i++) {
        const x = random() * 600 - 300, y = random() * 360 - 180;
        let distance = Infinity;
        for (let k = 0; k < this.track.xy.length; k += 3) distance = Math.min(distance, Math.hypot(x - this.track.xy[k][0], y - this.track.xy[k][1]));
        if (distance > 26 && !(y < -137 && x > -150 && x < 100))
          objects.push({x, y, height: 5 + random() * 8, size: 3 + random() * 3, kind: 'tree', shade: random()});
      }
      for (let i = 0; i < 8; i++) objects.push({x: -124 + i * 23, y: -162, kind: 'garage'});
      objects.push({x: 184, y: -156, kind: 'stand'});
      objects.push({x: -182, y: 116, kind: 'stand'});
      return objects;
    }
    box(x, y, width, depth, height, color, roof, heading = 0, z = 0) {
      const cs = Math.cos(heading), sn = Math.sin(heading);
      const p = (dx, dy, dz) => [x + dx * cs - dy * sn, y + dx * sn + dy * cs, z + dz];
      const lower = [p(-width/2,-depth/2,0),p(width/2,-depth/2,0),p(width/2,depth/2,0),p(-width/2,depth/2,0)];
      const upper = [p(-width/2,-depth/2,height),p(width/2,-depth/2,height),p(width/2,depth/2,height),p(-width/2,depth/2,height)];
      for (let i = 0; i < 4; i++) { const j = (i+1)%4; this.poly([lower[i],lower[j],upper[j],upper[i]],color); }
      this.poly(upper,roof);
    }
    tree(tree) {
      const {x,y,height:h,size:r} = tree, c = this.ctx;
      const shadow = this.project(x+2,y+3,0); c.fillStyle = '#09120b33';
      c.beginPath(); c.ellipse(shadow[0],shadow[1],r*this.scale*1.1,r*this.scale*.50,0,0,TAU); c.fill();
      this.line([[x,y,0],[x,y,h*.6]], '#413d2e', Math.max(1, this.scale*.7));
      const shades = tree.shade > .5 ? ['#526846','#41573a','#30462f'] : ['#435b3d','#374c33','#2a3f2c'];
      for (let j = 0; j < 2; j++) {
        const z = h*.20 + j*h*.20, radius = r*(1-j*.20), top = h*(.78+j*.22);
        this.poly([[x-radius,y-radius,z],[x+radius,y-radius,z],[x,y,top]],shades[0]);
        this.poly([[x+radius,y-radius,z],[x+radius,y+radius,z],[x,y,top]],shades[1]);
        this.poly([[x+radius,y+radius,z],[x-radius,y+radius,z],[x,y,top]],shades[2]);
        this.poly([[x-radius,y+radius,z],[x-radius,y-radius,z],[x,y,top]],shades[1]);
      }
    }
    ground() {
      const c = this.ctx, w = this.width, h = this.height;
      c.clearRect(0,0,w,h);
      const bg = c.createRadialGradient(w*.52,h*.5,20,w*.52,h*.5,w*.75);
      bg.addColorStop(0,this.hero ? '#263024' : '#2d3827'); bg.addColorStop(1,this.hero ? '#101211' : '#1b231a');
      c.fillStyle=bg; c.fillRect(0,0,w,h);
      if (this.view !== 'follow') {
        const corners=[[-318,-202], [312,-202], [312,174],[-318,174]];
        for(let i=0;i<4;i++) {const j=(i+1)%4;this.poly([[...corners[i],-10],[...corners[j],-10],[...corners[j],-1],[...corners[i],-1]],'#1a2319');}
        this.poly(corners.map(p=>[...p,-1]),'#2a3526','#435039',.7);
      }
      const x0=this.view==='follow'?-1000:-310,x1=this.view==='follow'?1000:310;
      const y0=this.view==='follow'?-1000:-200,y1=this.view==='follow'?1000:170;
      for(let x=x0;x<=x1;x+=30) this.line([[x,y0,-.8],[x,y1,-.8]],'#71846712',.7);
      for(let y=y0;y<=y1;y+=30) this.line([[x0,y,-.8],[x1,y,-.8]],'#71846712',.7);
      // Paddock apron and lane markings.
      this.poly([[-150,-181,0],[70,-181,0],[70,-145,0],[-150,-145,0]],'#353b31');
      for(let i=0;i<19;i++) this.line([[-146+i*11,-177,.1],[-146+i*11,-166,.1]],'#6b756355',.7);
      const {left,right,xy} = this.track;
      for(let i=0;i<xy.length-1;i++) {
        const j=i+1;
        this.poly([[...left[i],0],[...left[j],0],[...right[j],0],[...right[i],0]], i%7===0?'#474e43':'#444b40');
        for (const edge of [left,right]) {
          const outer = (k) => {const dx=edge[k][0]-xy[k][0],dy=edge[k][1]-xy[k][1],n=Math.hypot(dx,dy);return[edge[k][0]+dx/n*1.65,edge[k][1]+dy/n*1.65,.1];};
          this.poly([[...edge[i],.1],[...edge[j],.1],outer(j),outer(i)], Math.floor(i/3)%2?'#ccc8b4':'#b66a4b');
        }
      }
      this.line(left.map(p=>[...p,.1]),'#cbd1b340',Math.max(.6,this.scale*.22));
      this.line(right.map(p=>[...p,.1]),'#cbd1b340',Math.max(.6,this.scale*.22));
      // Subtle center dashes, all positioned on the exported circuit.
      for(let i=0;i<xy.length-2;i+=9) this.line([[...xy[i],.15],[...xy[i+2],.15]],'#aeb49e26',Math.max(.5,this.scale*.35));
      const start = this.at(100), tangent=[Math.cos(start[2]),Math.sin(start[2])], normal=[-tangent[1],tangent[0]];
      for(let row=0;row<2;row++) for(let col=0;col<8;col++) {
        const p=(r,k)=>[start[0]+tangent[0]*r*1.1+normal[0]*(k-4)*1.5,start[1]+tangent[1]*r*1.1+normal[1]*(k-4)*1.5,.2];
        this.poly([p(row,col),p(row+1,col),p(row+1,col+1),p(row,col+1)],(col+row)%2?'#222920':'#dadccb');
      }
      // Guardrails and spaced uprights.
      for(let i=0;i<xy.length-3;i+=4) {
        const edge=right, p=(k,z)=>{const dx=edge[k][0]-xy[k][0],dy=edge[k][1]-xy[k][1];return[edge[k][0]+dx*.6,edge[k][1]+dy*.6,z];};
        this.line([p(i,1.1),p(i+3,1.1)],'#88947b65',Math.max(.6,this.scale*.35));
        if(i%8===0)this.line([p(i,0),p(i,1.7)],'#8d998269',Math.max(.5,this.scale*.3));
      }
    }
    car(s, color, ghost = false) {
      const c=this.ctx,[x,y,heading]=this.at(s),sc=Math.cos(heading),sn=Math.sin(heading);
      const p=(u,v,z)=>[x+u*sc-v*sn,y+u*sn+v*sc,z];
      c.save(); if(ghost)c.globalAlpha=.74;
      this.poly([p(-5,-3,0),p(5,-3,0),p(5,3,0),p(-5,3,0)],'#08100655');
      for(const u of [-2.9,2.6]) for(const v of [-1.9,1.9]){
        const a=p(u,v,.4);this.box(a[0],a[1],2.2,1.15,1.3,'#121610','#272d22',heading,.4);
      }
      this.poly([p(-4,-1.4,1),p(2.7,-1.2,1),p(4.5,-.45,1),p(4.5,.45,1),p(2.7,1.2,1),p(-4,1.4,1)],color);
      this.poly([p(-2.6,-1.4,1.1),p(.8,-1.1,1.1),p(.5,-.75,2.2),p(-2.2,-.8,2.2)],'#ffffff55');
      this.poly([p(-2.2,-.8,2.2),p(.5,-.75,2.2),p(.5,.75,2.2),p(-2.2,.8,2.2)],color);
      this.poly([p(.5,-.75,2.2),p(1.6,-1,1.1),p(1.6,1,1.1),p(.5,.75,2.2)],'#202c25');
      this.poly([p(-1.9,-.6,2.22),p(-.4,-.6,2.22),p(-.4,.6,2.22),p(-1.9,.6,2.22)],'#1e2821');
      this.poly([p(-4.1,-2.4,1.75),p(-3.3,-2.4,1.75),p(-3.3,2.4,1.75),p(-4.1,2.4,1.75)],'#e3e6d4');
      this.poly([p(3.5,-2.2,.7),p(4.1,-2.2,.7),p(4.1,2.2,.7),p(3.5,2.2,.7)],color);
      this.poly([p(1.6,-.16,1.2),p(4.3,-.16,1.2),p(4.3,.16,1.2),p(1.6,.16,1.2)],ghost?'#332219':'#f78a59');
      c.restore();
    }
    label(position, title, color, lift=20) {
      const c=this.ctx,p=this.project(position[0],position[1],position[2]||0);
      c.save();c.font=`${this.hero?8:9}px monospace`; const width=c.measureText(title).width+16;
      if(p[0]<-100||p[0]>this.width+100||p[1]<-100||p[1]>this.height+100){c.restore();return;}
      c.strokeStyle=color+'88';c.lineWidth=.7;c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[1]-lift);c.stroke();
      c.fillStyle='#162015e8';c.fillRect(p[0]-width/2,p[1]-lift-18,width,19);
      c.strokeStyle=color+'88';c.strokeRect(p[0]-width/2,p[1]-lift-18,width,19);
      c.fillStyle=color;c.textAlign='center';c.fillText(title,p[0],p[1]-lift-5);c.restore();
    }
    render(scenario, time, horizon=6, showTruth=true, showBars=true) {
      if(!this.visible||!this.width)return;
      const race=scenario.race, dt=this.data.config.dt;
      const index=Math.min(race.states.length-2,Math.floor(time/dt)),fraction=time/dt-index;
      const progress=mix(race.states[index][0],race.states[index+1][0],fraction);
      const forecast=race.forecasts[Math.min(race.forecasts.length-1,Math.floor(time))];
      const count=Math.min(forecast.learned.states.length-1,Math.round(horizon/dt));
      const start=Math.min(count-1,Math.max(0,Math.floor((time-forecast.time)/dt)));
      const actualPosition=this.at(progress),future=this.at(forecast.learned.states[count][0]);
      if(this.view==='follow')this.focus=[mix(actualPosition[0],future[0],.43),mix(actualPosition[1],future[1],.43)];
      else this.focus=[0,-10];
      this.cos=Math.cos(this.yaw);this.sin=Math.sin(this.yaw);this.pitch=Math.sin(this.elevation);this.rise=Math.cos(this.elevation);
      this.scale=Math.min(this.width/690,this.height/450)*this.zoom*(this.view==='follow'?2.7:1.05);
      this.ground();
      const c=this.ctx;
      // Historical observation trail and forward speed ribbon.
      const history=race.xy.slice(Math.max(0,index-22),index+1).map(p=>[...p,.3]);
      this.line(history,'#f2f1da70',Math.max(1.5,this.scale*1.5));
      const points=forecast.learned.xy.slice(start,count+1).map(p=>[...p,.5]);
      c.save();c.shadowColor='#ff9b4f';c.shadowBlur=12;this.line(points,'#ff875b',Math.max(2,this.scale*1.2));c.restore();
      if(showTruth)this.line(forecast.actual.xy.slice(start,count+1).map(p=>[...p,.7]),'#c0e4ad',Math.max(1.1,this.scale*.55),[4,5]);
      const objects=this.decor.slice();
      const depth=o=>o.x*this.sin+o.y*this.cos;
      objects.sort((a,b)=>depth(a)-depth(b));
      for(const o of objects) {
        const p=this.project(o.x,o.y,0);if(p[0]<-70||p[0]>this.width+70||p[1]<-70||p[1]>this.height+90)continue;
        if(o.kind==='tree')this.tree(o);
        else if(o.kind==='garage'){
          this.box(o.x,o.y,20,13,5,'#4e5547','#87917a');
          this.poly([[o.x-10,o.y-6.5,5.1],[o.x+10,o.y-6.5,5.1],[o.x+10,o.y-1,5.1],[o.x-10,o.y-1,5.1]],'#bac0aa');
          for(let k=0;k<3;k++)this.box(o.x-6+k*6,o.y+6.6,4.5,.3,3.2,'#263021','#293523');
        }else{
          for(let r=0;r<5;r++)this.box(o.x,o.y+r*2,38,2,r*.65+.6,'#4a5540',r%2?'#9ea68e':'#707e61');
          this.box(o.x,o.y+3,42,14,.7,'#59674e','#acb39b',0,7);
        }
      }
      if(showBars){
        for(let i=start+(start%2);i<=count;i+=2){
          const p=forecast.learned.xy[i],v=forecast.learned.states[i][1],height=3+v*.32;
          const a=this.project(p[0],p[1],.7),b=this.project(p[0],p[1],height);
          const gradient=c.createLinearGradient(...a,...b);gradient.addColorStop(0,'#ff845217');gradient.addColorStop(1,'#ff9c66d9');
          c.strokeStyle=gradient;c.lineWidth=Math.max(2,this.scale*1.2);c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();
          c.fillStyle='#ffc392';c.beginPath();c.arc(...b,Math.max(1,this.scale*.6),0,TAU);c.fill();
        }
      }
      this.car(progress,'#f1eed9');this.car(forecast.learned.states[count][0],'#ff8758',true);
      if(showTruth){
        const end=forecast.actual.xy[count],p=this.project(end[0],end[1],.8);
        c.strokeStyle='#c4eab0';c.lineWidth=1.5;c.beginPath();c.ellipse(...p,Math.max(4,this.scale*3),Math.max(2,this.scale*1.5),0,0,TAU);c.stroke();
        if(!this.hero)this.label([...end,1],`ACTUAL +${horizon}s`,'#b4d8a4',9);
      }
      this.label([future[0],future[1],4],`PREDICTED +${horizon}s`,'#ff9b6e',this.hero?20:45);
      if(!this.hero)this.label([actualPosition[0],actualPosition[1],3],'OBSERVED','#e0e5d2',22);
      // A fine vignette anchors the scene inside the interface.
      const fade=c.createLinearGradient(0,0,0,this.height);fade.addColorStop(0,'#10190f45');fade.addColorStop(.25,'#10190f00');fade.addColorStop(.70,'#10190f00');fade.addColorStop(1,'#10190f70');c.fillStyle=fade;c.fillRect(0,0,this.width,this.height);
    }
  }
  window.RacingScene=RacingScene;
})();
