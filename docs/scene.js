/* Dependency-free projected 3D circuit renderer. Geometry comes from experiment.json. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const mix = (a, b, t) => a + (b - a) * t;
  class RacingScene {
    constructor(canvas, experiment, {hero = false} = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.data = experiment;
      this.track = experiment.track; this.hero = hero; this.yaw = -.48;
      this.elevation = .78; this.view = hero ? 'circuit' : 'window';
      this.zoom = 1; this.width = 1; this.height = 1; this.focus = [0, 0];
      this.cameraReady = false; this.cameraMoving = false;
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
      this.needsRender = true;
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
        this.needsRender = true;
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
        this.needsRender = true;
      });
    }
    setView(view) {
      this.view = view; this.yaw = -.48; this.elevation = view === 'top' ? Math.PI / 2 : .78; this.zoom = 1;
      this.resetCamera();
    }
    resetCamera() { this.cameraReady = false; }
    at(s) {
      const t = this.track, p = ((s % t.length) + t.length) % t.length;
      const position = p / t.length * (t.xy.length - 1);
      const i = Math.floor(position), f = position - i;
      const count = t.xy.length - 1;
      const point = offset => t.xy[(i + offset + count) % count];
      const points = [point(-1),point(0),point(1),point(2)];
      const value = [], tangent = [];
      for (let axis = 0; axis < 2; axis++) {
        const [a,b,c,d] = points.map(point => point[axis]);
        value.push(.5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f));
        tangent.push(.5*((-a+c)+2*(2*a-5*b+4*c-d)*f+3*(-a+3*b-3*c+d)*f*f));
      }
      return [...value, Math.atan2(tangent[1], tangent[0])];
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
      for (let i = 0; i < 130; i++) {
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
      const shades = tree.shade > .5 ? ['#bfd0b2','#aebfa2','#9eaf93'] : ['#b2c6a7','#a5ba9a','#94aa8b'];
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
      c.fillStyle='#f2f5ef'; c.fillRect(0,0,w,h);
      if (this.view === 'circuit' || this.view === 'top') {
        const corners=[[-318,-202], [312,-202], [312,174],[-318,174]];
        for(let i=0;i<4;i++) {const j=(i+1)%4;this.poly([[...corners[i],-10],[...corners[j],-10],[...corners[j],-1],[...corners[i],-1]],'#d1d9cb');}
        this.poly(corners.map(p=>[...p,-1]),'#eaf0e5','#c2ccbc',.7);
      }
      const x0=this.view==='follow'?-1000:-310,x1=this.view==='follow'?1000:310;
      const y0=this.view==='follow'?-1000:-200,y1=this.view==='follow'?1000:170;
      for(let x=x0;x<=x1;x+=30) this.line([[x,y0,-.8],[x,y1,-.8]],'#71846712',.7);
      for(let y=y0;y<=y1;y+=30) this.line([[x0,y,-.8],[x1,y,-.8]],'#71846712',.7);
      // Paddock apron and lane markings.
      this.poly([[-150,-181,0],[70,-181,0],[70,-145,0],[-150,-145,0]],'#d4dad4');
      for(let i=0;i<19;i++) this.line([[-146+i*11,-177,.1],[-146+i*11,-166,.1]],'#6b756355',.7);
      const {left,right,xy} = this.track;
      // Fill the road as one ring: separate antialiased quads leave distracting
      // transverse seams and require hundreds of extra fills per frame.
      this.poly([...left.map(p=>[...p,0]),...right.slice().reverse().map(p=>[...p,0])],'#cbd1d0');
      for(let i=0;i<xy.length-1;i++) {
        const j=i+1;
        for (const edge of [left,right]) {
          const outer = (k) => {const dx=edge[k][0]-xy[k][0],dy=edge[k][1]-xy[k][1],n=Math.hypot(dx,dy);return[edge[k][0]+dx/n*1.65,edge[k][1]+dy/n*1.65,.1];};
          this.poly([[...edge[i],.1],[...edge[j],.1],outer(j),outer(i)], Math.floor(i/3)%2?'#ffffff':'#8d9e94');
        }
      }
      this.line(left.map(p=>[...p,.1]),'#cbd1b340',Math.max(.6,this.scale*.22));
      this.line(right.map(p=>[...p,.1]),'#cbd1b340',Math.max(.6,this.scale*.22));
      // Subtle center dashes, all positioned on the exported circuit.
      for(let i=0;i<xy.length-2;i+=9) this.line([[...xy[i],.15],[...xy[i+2],.15]],'#ffffffaa',Math.max(.5,this.scale*.35));
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
      c.save();c.font='14px sans-serif'; const width=c.measureText(title).width+20;
      if(p[0]<-100||p[0]>this.width+100||p[1]<-100||p[1]>this.height+100){c.restore();return;}
      c.strokeStyle=color+'88';c.lineWidth=.7;c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[1]-lift);c.stroke();
      c.fillStyle='#ffffffee';c.fillRect(p[0]-width/2,p[1]-lift-24,width,29);
      c.strokeStyle=color+'88';c.strokeRect(p[0]-width/2,p[1]-lift-24,width,29);
      c.fillStyle=color;c.textAlign='center';c.fillText(title,p[0],p[1]-lift-5);c.restore();
    }
    updateCamera(snapshot, frameSeconds) {
      const actual = this.at(snapshot.actual[0]);
      this.cos=Math.cos(this.yaw); this.sin=Math.sin(this.yaw);
      this.pitch=Math.sin(this.elevation); this.rise=Math.cos(this.elevation);
      let target = [0,-10];
      const baseScale = Math.min(this.width/690,this.height/450)*this.zoom;
      let targetScale = baseScale*1.05;
      if (this.view === 'follow') {
        // No forecast-dependent camera target: an update cannot jerk the view.
        target = [actual[0]+Math.cos(actual[2])*12, actual[1]+Math.sin(actual[2])*12];
        targetScale = baseScale*3.0;
      } else if (this.view === 'window') {
        const xy = snapshot.forecast.actual.xy;
        const xs = xy.map(p=>p[0]), ys = xy.map(p=>p[1]);
        target = [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
        const projected = xy.map(p=>[(p[0]-target[0])*this.cos-(p[1]-target[1])*this.sin,
          ((p[0]-target[0])*this.sin+(p[1]-target[1])*this.cos)*this.pitch]);
        const px=projected.map(p=>p[0]), py=projected.map(p=>p[1]);
        targetScale = Math.min(baseScale*3.0,
          (this.width-110)/(Math.max(...px)-Math.min(...px)+35),
          (this.height-150)/(Math.max(...py)-Math.min(...py)+30));
      }
      this.cameraTarget = target;
      const alpha = this.cameraReady ? 1-Math.exp(-Math.max(0,frameSeconds)/.30) : 1;
      this.focus = this.focus.map((x,i)=>mix(x,target[i],alpha));
      this.scale = this.cameraReady ? mix(this.scale,targetScale,alpha) : targetScale;
      this.cameraMoving = Math.hypot(this.focus[0]-target[0],this.focus[1]-target[1]) > .02
        || Math.abs(this.scale-targetScale) > .001;
      this.cameraReady = true;
    }
    render(snapshot, {showPath=true, showBars=false, frameSeconds=1/60} = {}) {
      if(!this.visible||!this.width)return;
      const {forecast, actual, predicted, elapsed, horizon, method} = snapshot;
      const actualPosition=this.at(actual[0]), ghostPosition=this.at(predicted[0]);
      this.updateCamera(snapshot,frameSeconds);
      this.ground();
      const c=this.ctx;
      // The entire path belongs to one fixed-origin forecast for this window.
      if(showPath) {
        this.line(forecast[method].xy.map(p=>[...p,.5]),'#c44d1d88',Math.max(1.5,this.scale*.7),[6,5]);
        const completed = Math.floor(elapsed/this.data.config.dt);
        const actualTrail = forecast.actual.xy.slice(0,completed+1).map(p=>[...p,.7]);
        actualTrail.push([actualPosition[0],actualPosition[1],.7]);
        this.line(actualTrail,'#2166ac',Math.max(1.5,this.scale*.6));
      }
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
        for(let i=0;i<forecast[method].states.length;i+=3){
          const p=forecast[method].xy[i],v=forecast[method].states[i][1],height=3+v*.22;
          this.line([[...p,.7],[...p,height]],'#c44d1d88',Math.max(1,this.scale*.6));
        }
      }
      // Both cars represent the SAME elapsed time, never a moving endpoint.
      this.car(predicted[0],'#e17a3b',true);
      this.car(actual[0],'#2166ac');
      const ghostPixel=this.project(ghostPosition[0],ghostPosition[1],.8);
      c.strokeStyle='#b44819'; c.lineWidth=2; c.setLineDash([4,3]);
      c.beginPath();c.ellipse(...ghostPixel,Math.max(7,this.scale*5.5),Math.max(4,this.scale*2.8),0,0,TAU);c.stroke();c.setLineDash([]);
      this.line([[actualPosition[0],actualPosition[1],2],[ghostPosition[0],ghostPosition[1],2]],'#8e3d18',2);
      const currentTime=`+${elapsed.toFixed(1)} s`;
      this.label([actualPosition[0],actualPosition[1],3],`Actual car · ${currentTime}`,'#2166ac',22);
      this.label([ghostPosition[0],ghostPosition[1],3],`Prediction ghost · ${currentTime}`,'#a83e16',75);
      this.lastComparison = {actualProgress:actual[0],predictedProgress:predicted[0],elapsed,
        origin:forecast.origin,focus:[...this.focus],target:[...this.cameraTarget],scale:this.scale};

    }
  }
  window.RacingScene=RacingScene;
})();
