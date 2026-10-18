(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={Air:0,Stone:1,Dirt:2,Grass:3,Sand:4,Water:5,Basalt:6,Wood:7,Leaves:8,Bedrock:9,Sandstone:10,Snow:11,Ice:12,Cactus:13,BirchWood:14,PineWood:15,PineLeaves:16,Glass:17,Cobblestone:18,Brick:19,TallGrass:20,RedFlower:21,YellowFlower:22,Torch:23,WaterFlow1:24,WaterFlow2:25,WaterFlow3:26,WaterFlow4:27,WaterFlow5:28,WaterFlow6:29,WaterFlow7:30,WaterFalling:31},t={name:`Flowing Water`,render:`water`,solid:!1,hardness:1/0},n=[{name:`Air`,render:`none`,solid:!1,hardness:0},{name:`Stone`,render:`opaque`,solid:!0,hardness:1.2},{name:`Dirt`,render:`opaque`,solid:!0,hardness:.5},{name:`Grass`,render:`opaque`,solid:!0,hardness:.6},{name:`Sand`,render:`opaque`,solid:!0,hardness:.5},{name:`Water`,render:`water`,solid:!1,hardness:1/0},{name:`Basalt`,render:`opaque`,solid:!0,hardness:1.6},{name:`Oak Log`,render:`opaque`,solid:!0,hardness:.9},{name:`Leaves`,render:`opaque`,solid:!0,hardness:.2},{name:`Bedrock`,render:`opaque`,solid:!0,hardness:1/0},{name:`Sandstone`,render:`opaque`,solid:!0,hardness:.9},{name:`Snow`,render:`opaque`,solid:!0,hardness:.3},{name:`Ice`,render:`opaque`,solid:!0,hardness:.5},{name:`Cactus`,render:`opaque`,solid:!0,hardness:.4},{name:`Birch Log`,render:`opaque`,solid:!0,hardness:.9},{name:`Pine Log`,render:`opaque`,solid:!0,hardness:.9},{name:`Pine Needles`,render:`opaque`,solid:!0,hardness:.2},{name:`Glass`,render:`cutout`,solid:!0,hardness:.3},{name:`Cobblestone`,render:`opaque`,solid:!0,hardness:1.4},{name:`Brick`,render:`opaque`,solid:!0,hardness:1.4},{name:`Tall Grass`,render:`cross`,solid:!1,hardness:0},{name:`Red Flower`,render:`cross`,solid:!1,hardness:0},{name:`Yellow Flower`,render:`cross`,solid:!1,hardness:0},{name:`Torch`,render:`cross`,solid:!1,hardness:0,emission:14},t,t,t,t,t,t,t,{name:`Falling Water`,render:`water`,solid:!1,hardness:1/0}],r=n.map(e=>e.name);function i(e){return n[e]??n[0]}function a(e){return i(e).render}function o(e){return i(e).render===`opaque`}function s(t){return t===e.Water||t>=e.WaterFlow1&&t<=e.WaterFalling}function c(t){return t===e.Water||t===e.WaterFalling?0:t>=e.WaterFlow1&&t<=e.WaterFlow7?t-e.WaterFlow1+1:-1}function l(t){if(!Number.isInteger(t)||t<1||t>7)throw RangeError(`bad water level ${t}`);return e.WaterFlow1+t-1}function u(e){let t=c(e);return t<0?0:8-t}function d(e){return i(e).emission??0}function f(t){return t===e.Air||h(t)}function p(t){return t===e.Leaves||t===e.PineLeaves?1:o(t)?-1:0}function m(e){return p(e)===0&&!s(e)}function h(e){return i(e).render===`cross`}function g(e){return i(e).solid}function _(t){return t>e.Air&&!s(t)}function v(t){return t===e.Air||s(t)||h(t)&&t!==e.Torch}function y(e){return!Number.isFinite(i(e).hardness)}function b(e){return i(e).hardness}function x(t,n,r=0){switch(i(t).render){case`opaque`:return!o(n);case`cutout`:return!o(n)&&n!==t;case`water`:return n===e.Air||h(n)?!0:s(n)?r!==2&&r!==3&&u(n)<u(t):r===2&&u(t)<8;default:return!1}}function S(t){if(s(t))return`water`;switch(t){case e.Grass:case e.TallGrass:case e.RedFlower:case e.YellowFlower:return`grass`;case e.Dirt:return`dirt`;case e.Sand:case e.Sandstone:return`sand`;case e.Snow:return`snow`;case e.Wood:case e.BirchWood:case e.PineWood:case e.Cactus:case e.Torch:return`wood`;case e.Glass:case e.Ice:return`glass`;case e.Leaves:case e.PineLeaves:return`leaves`;default:return`stone`}}var C={stone:{filter:`bandpass`,frequency:2400,q:1.3,duration:.05,gain:.55,thump:.3},dirt:{filter:`lowpass`,frequency:700,q:.8,duration:.09,gain:.7,thump:.25},grass:{filter:`lowpass`,frequency:1100,q:.6,duration:.13,gain:.5,thump:.12},leaves:{filter:`bandpass`,frequency:1800,q:.5,duration:.14,gain:.45,thump:.05},sand:{filter:`bandpass`,frequency:3200,q:.7,duration:.17,gain:.45,thump:.08},snow:{filter:`bandpass`,frequency:1500,q:.9,duration:.2,gain:.5,thump:.08},wood:{filter:`bandpass`,frequency:900,q:2.5,duration:.07,gain:.45,thump:.35},glass:{filter:`highpass`,frequency:3500,q:.7,duration:.05,gain:.35,thump:.15},water:{filter:`lowpass`,frequency:1300,q:1,duration:.2,gain:.5,thump:0}},w=class{factory;random;ctx=null;master=null;noise=null;volumeValue=.7;played=0;constructor(e=typeof AudioContext>`u`?null:()=>new AudioContext,t=Math.random){this.factory=e,this.random=t}get volume(){return this.volumeValue}get context(){return this.ctx}unlock(){if(this.factory){if(!this.ctx){this.ctx=this.factory(),this.master=this.ctx.createGain(),this.master.gain.value=this.volumeValue;let e=this.ctx.createDynamicsCompressor();e.threshold.value=-10,e.ratio.value=6,this.master.connect(e).connect(this.ctx.destination);let t=Math.floor(this.ctx.sampleRate*1);this.noise=this.ctx.createBuffer(1,t,this.ctx.sampleRate);let n=this.noise.getChannelData(0);for(let e=0;e<t;e++)n[e]=this.random()*2-1}this.ctx.state===`suspended`&&this.ctx.resume()}}setVolume(e){this.volumeValue=Math.min(1,Math.max(0,e)),this.master&&this.ctx&&this.master.gain.setTargetAtTime(this.volumeValue,this.ctx.currentTime,.02)}get ready(){return!!this.ctx&&this.ctx.state!==`closed`&&this.volumeValue>0}jitter(e){return 1+(this.random()*2-1)*e}burst(e){let t=this.ctx,n=t.createBufferSource();n.buffer=this.noise;let r=t.createBiquadFilter();r.type=e.filter,r.frequency.setValueAtTime(e.frequency,e.at),e.frequencyEnd&&r.frequency.exponentialRampToValueAtTime(e.frequencyEnd,e.at+e.duration),r.Q.value=e.q??1;let i=t.createGain(),a=e.attack??.003;i.gain.setValueAtTime(1e-4,e.at),i.gain.exponentialRampToValueAtTime(e.gain,e.at+a),i.gain.exponentialRampToValueAtTime(1e-4,e.at+e.duration),n.connect(r).connect(i).connect(this.master),n.start(e.at,this.random()*.7,e.duration+.02),this.played++}tone(e){let t=this.ctx,n=t.createOscillator();n.type=e.type,n.frequency.setValueAtTime(e.frequency,e.at),n.frequency.exponentialRampToValueAtTime(e.frequencyEnd,e.at+e.duration);let r=t.createGain();r.gain.setValueAtTime(1e-4,e.at),r.gain.exponentialRampToValueAtTime(e.gain,e.at+.004),r.gain.exponentialRampToValueAtTime(1e-4,e.at+e.duration),n.connect(r).connect(this.master),n.start(e.at),n.stop(e.at+e.duration+.02),this.played++}footstep(e,t=1){if(!this.ready||!(t>0))return;if(e===`water`){this.splash(.25*t);return}let n=C[e],r=this.ctx.currentTime,i=n.gain*t*this.jitter(.15);if(this.burst({at:r,duration:n.duration*this.jitter(.2),filter:n.filter,frequency:n.frequency*this.jitter(.12),q:n.q,gain:i}),e===`sand`||e===`snow`||e===`grass`)for(let e=1;e<=2;e++)this.burst({at:r+e*.03*this.jitter(.3),duration:n.duration*.5,filter:n.filter,frequency:n.frequency*this.jitter(.25),q:n.q,gain:i*.5});n.thump>0&&this.tone({at:r,duration:.07,type:`sine`,frequency:140*this.jitter(.1),frequencyEnd:60,gain:n.thump*t}),e===`wood`&&this.tone({at:r,duration:.09,type:`triangle`,frequency:260*this.jitter(.08),frequencyEnd:170,gain:.18*t})}breakBlock(e){if(!this.ready)return;let t=this.ctx.currentTime;if(e===`glass`){this.burst({at:t,duration:.25,filter:`highpass`,frequency:3e3,gain:.5});for(let e=0;e<5;e++){let e=1800+this.random()*3200;this.tone({at:t+this.random()*.12,duration:.12+this.random()*.15,type:`sine`,frequency:e,frequencyEnd:e*.97,gain:.08})}return}let n=C[e],r=Math.min(4e3,n.frequency*1.3);for(let e=0;e<5;e++){let n=t+e*.028*this.jitter(.3);this.burst({at:n,duration:.07*this.jitter(.3),filter:`bandpass`,frequency:r*this.jitter(.2),frequencyEnd:Math.max(200,r*.3),q:.9,gain:.6*(1-e*.14)})}this.tone({at:t,duration:.12,type:`sine`,frequency:110*this.jitter(.1),frequencyEnd:45,gain:.35})}placeBlock(e){if(!this.ready)return;let t=this.ctx.currentTime;if(e===`water`){this.splash(.6);return}let n=e===`glass`?900:e===`wood`?420:e===`stone`?520:480;this.tone({at:t,duration:.08,type:`sine`,frequency:n*this.jitter(.06),frequencyEnd:n*.35,gain:.5}),this.burst({at:t,duration:.015,filter:`highpass`,frequency:2500,gain:.25}),this.burst({at:t+.005,duration:.06,filter:`lowpass`,frequency:C[e].frequency,gain:.25})}splash(e){if(!this.ready||e<=0)return;let t=this.ctx.currentTime,n=Math.min(1,e);this.burst({at:t,duration:.25+.35*n,filter:`lowpass`,frequency:2600*this.jitter(.1),frequencyEnd:350,q:.7,gain:.3+.5*n,attack:.01});let r=2+Math.round(4*n);for(let e=0;e<r;e++){let e=350+this.random()*500;this.tone({at:t+.05+this.random()*.3,duration:.04+this.random()*.04,type:`sine`,frequency:e,frequencyEnd:e*2.2,gain:.06+.08*n})}}};function T(){return E(new Float32Array(16))}function E(e){return e.fill(0),e[0]=1,e[5]=1,e[10]=1,e[15]=1,e}function D(e,t,n){let r=t[0],i=t[1],a=t[2],o=t[3],s=t[4],c=t[5],l=t[6],u=t[7],d=t[8],f=t[9],p=t[10],m=t[11],h=t[12],g=t[13],_=t[14],v=t[15];for(let t=0;t<4;t++){let y=n[t*4],b=n[t*4+1],x=n[t*4+2],S=n[t*4+3];e[t*4]=r*y+s*b+d*x+h*S,e[t*4+1]=i*y+c*b+f*x+g*S,e[t*4+2]=a*y+l*b+p*x+_*S,e[t*4+3]=o*y+u*b+m*x+v*S}return e}function O(e,t,n,r,i){let a=1/Math.tan(t/2);return e.fill(0),e[0]=a/n,e[5]=a,e[10]=i/(r-i),e[11]=-1,e[14]=i*r/(r-i),e}function k(e,t,n,r){let i=t[0]-n[0],a=t[1]-n[1],o=t[2]-n[2],s=Math.hypot(i,a,o);if(s===0)return E(e);i/=s,a/=s,o/=s;let c=r[1]*o-r[2]*a,l=r[2]*i-r[0]*o,u=r[0]*a-r[1]*i;s=Math.hypot(c,l,u),s===0?(c=0,l=0,u=0):(c/=s,l/=s,u/=s);let d=a*u-o*l,f=o*c-i*u,p=i*l-a*c;return e[0]=c,e[1]=d,e[2]=i,e[3]=0,e[4]=l,e[5]=f,e[6]=a,e[7]=0,e[8]=u,e[9]=p,e[10]=o,e[11]=0,e[12]=-(c*t[0]+l*t[1]+u*t[2]),e[13]=-(d*t[0]+f*t[1]+p*t[2]),e[14]=-(i*t[0]+a*t[1]+o*t[2]),e[15]=1,e}function A(e,t){let n=t[0],r=t[1],i=t[2],a=t[3],o=t[4],s=t[5],c=t[6],l=t[7],u=t[8],d=t[9],f=t[10],p=t[11],m=t[12],h=t[13],g=t[14],_=t[15],v=n*s-r*o,y=n*c-i*o,b=n*l-a*o,x=r*c-i*s,S=r*l-a*s,C=i*l-a*c,w=u*h-d*m,T=u*g-f*m,E=u*_-p*m,D=d*g-f*h,O=d*_-p*h,k=f*_-p*g,A=v*k-y*O+b*D+x*E-S*T+C*w;return A===0||!Number.isFinite(A)?null:(A=1/A,e[0]=(s*k-c*O+l*D)*A,e[1]=(i*O-r*k-a*D)*A,e[2]=(h*C-g*S+_*x)*A,e[3]=(f*S-d*C-p*x)*A,e[4]=(c*E-o*k-l*T)*A,e[5]=(n*k-i*E+a*T)*A,e[6]=(g*b-m*C-_*y)*A,e[7]=(u*C-f*b+p*y)*A,e[8]=(o*O-s*E+l*w)*A,e[9]=(r*E-n*O-a*w)*A,e[10]=(m*S-h*b+_*v)*A,e[11]=(d*b-u*S-p*v)*A,e[12]=(s*T-o*D-c*w)*A,e[13]=(n*D-r*T+i*w)*A,e[14]=(h*y-m*x-g*v)*A,e[15]=(u*x-d*y+f*v)*A,e)}var ee=class{planes=new Float32Array(24);setFromViewProjection(e){let t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15];return this.writePlane(0,p+t,m+n,h+r,g+i),this.writePlane(1,p-t,m-n,h-r,g-i),this.writePlane(2,p+a,m+o,h+s,g+c),this.writePlane(3,p-a,m-o,h-s,g-c),this.writePlane(4,l,u,d,f),this.writePlane(5,p-l,m-u,h-d,g-f),this}writePlane(e,t,n,r,i){let a=Math.hypot(t,n,r)||1,o=e*4;this.planes[o]=t/a,this.planes[o+1]=n/a,this.planes[o+2]=r/a,this.planes[o+3]=i/a}intersectsAabb(e,t,n,r,i,a){let o=this.planes;for(let s=0;s<24;s+=4){let c=o[s],l=o[s+1],u=o[s+2],d=o[s+3],f=c>=0?r:e,p=l>=0?i:t,m=u>=0?a:n;if(c*f+l*p+u*m+d<0)return!1}return!0}},te=new Float32Array([0,1,0]),ne=89*Math.PI/180,re=class e{position=new Float64Array([0,64,0]);yaw=0;pitch=0;fovY=70*Math.PI/180;aspect=16/9;near=.1;far=1500;view=T();projection=T();viewProjection=T();inverseViewProjection=T();frustum=new ee;forward=new Float64Array([0,0,-1]);right=new Float64Array([1,0,0]);target=new Float64Array(3);static forwardFromAngles(e,t,n){let r=Math.cos(t);n[0]=-Math.sin(e)*r,n[1]=Math.sin(t),n[2]=-Math.cos(e)*r}setPitch(e){this.pitch=Math.max(-ne,Math.min(ne,e))}updateMatrices(){e.forwardFromAngles(this.yaw,this.pitch,this.forward),this.right[0]=Math.cos(this.yaw),this.right[1]=0,this.right[2]=-Math.sin(this.yaw);let t=this.position;this.target[0]=t[0]+this.forward[0],this.target[1]=t[1]+this.forward[1],this.target[2]=t[2]+this.forward[2],k(this.view,t,this.target,te),O(this.projection,this.fovY,this.aspect,this.near,this.far),D(this.viewProjection,this.projection,this.view),A(this.inverseViewProjection,this.viewProjection),this.frustum.setFromViewProjection(this.viewProjection)}};function ie(e,t){return t.forward=+!!e.isDown(`KeyW`)-!!e.isDown(`KeyS`),t.strafe=+!!e.isDown(`KeyD`)-!!e.isDown(`KeyA`),t.vertical=(e.isDown(`Space`)||e.isDown(`KeyE`)?1:0)-(e.isDown(`KeyQ`)||e.isDown(`KeyC`)||e.isDown(`ControlLeft`)?1:0),t.boost=e.isDown(`ShiftLeft`)||e.isDown(`ShiftRight`),t}function ae(e,t,n){let r=-Math.sin(t),i=-Math.cos(t),a=Math.cos(t),o=-Math.sin(t),s=r*e.forward+a*e.strafe,c=e.vertical,l=i*e.forward+o*e.strafe,u=Math.hypot(s,c,l);u>0&&(s/=u,c/=u,l/=u),n[0]=s,n[1]=c,n[2]=l}var oe=class{camera;input;baseSpeed=24;boostMultiplier=4;responsiveness=9;sensitivity=.0022;velocity=new Float64Array(3);intent={forward:0,strafe:0,vertical:0,boost:!1};direction=new Float64Array(3);mouse=[0,0];constructor(e,t){this.camera=e,this.input=t}update(e){this.look(),this.move(e)}look(){let[e,t]=this.input.consumeMouse(this.mouse);this.camera.yaw-=e*this.sensitivity,this.camera.setPitch(this.camera.pitch-t*this.sensitivity),this.camera.yaw=se(this.camera.yaw)}move(e){let t=this.input.consumeWheel();t!==0&&(this.baseSpeed=Math.min(400,Math.max(2,this.baseSpeed*.85**t))),ie(this.input,this.intent),ae(this.intent,this.camera.yaw,this.direction);let n=this.baseSpeed*(this.intent.boost?this.boostMultiplier:1),r=1-Math.exp(-this.responsiveness*e);for(let t=0;t<3;t++){let i=this.direction[t]*n;this.velocity[t]=this.velocity[t]+(i-this.velocity[t])*r,Math.abs(this.velocity[t])<1e-4&&(this.velocity[t]=0),this.camera.position[t]=this.camera.position[t]+this.velocity[t]*e}}};function se(e){let t=Math.PI*2;return e-Math.floor((e+Math.PI)/t)*t}var ce=class{keys=new Set;pointerLocked=!1;mouseDX=0;mouseDY=0;wheel=0;clicks=[];presses=[];buttons=new Set;listeners=[];attach(e){let t=(e,t,n)=>{e.addEventListener(t,n),this.listeners.push([e,t,n])};t(window,`keydown`,e=>{let t=e;this.keys.add(t.code),t.repeat||this.presses.push(t.code),this.pointerLocked&&[`Space`,`Tab`].includes(t.code)&&t.preventDefault()}),t(window,`keyup`,e=>this.keys.delete(e.code)),t(window,`blur`,()=>this.keys.clear()),t(e,`click`,()=>{this.pointerLocked||e.requestPointerLock()}),t(e,`contextmenu`,e=>e.preventDefault()),t(document,`pointerlockchange`,()=>{this.pointerLocked=document.pointerLockElement===e,this.pointerLocked||(this.keys.clear(),this.buttons.clear())}),t(document,`mousemove`,e=>{if(!this.pointerLocked)return;let t=e;this.mouseDX+=t.movementX,this.mouseDY+=t.movementY}),t(e,`mousedown`,e=>{if(!this.pointerLocked)return;let t=e.button;this.clicks.push(t),this.buttons.add(t)}),t(window,`mouseup`,e=>this.buttons.delete(e.button)),t(e,`wheel`,e=>{this.wheel+=Math.sign(e.deltaY),e.preventDefault()})}detach(){for(let[e,t,n]of this.listeners)e.removeEventListener(t,n);this.listeners.length=0}isButtonDown(e){return this.buttons.has(e)}isDown(e){return this.keys.has(e)}consumeMouse(e){return e[0]=this.mouseDX,e[1]=this.mouseDY,this.mouseDX=0,this.mouseDY=0,e}consumeWheel(){let e=this.wheel;return this.wheel=0,e}consumePresses(){let e=this.presses;return this.presses=[],e}injectPress(e){this.presses.push(e)}consumeClicks(){let e=this.clicks;return this.clicks=[],e}injectMouse(e,t){this.mouseDX+=e,this.mouseDY+=t}},le=class{progress=0;current=null;update(e,t,n){if(!t||!n||y(n.block))return this.reset(),{stage:-1,broken:null};let r=this.current;(!r||r.x!==n.x||r.y!==n.y||r.z!==n.z||r.block!==n.block)&&(this.current={...n},this.progress=0);let i=b(n.block);if(this.progress=i<=0?1:this.progress+e/i,this.progress>=1){let e=this.current;return this.reset(),{stage:-1,broken:e}}return{stage:Math.min(9,Math.floor(this.progress*10)),broken:null}}reset(){this.progress=0,this.current=null}},j=1024,ue=.35,de=.7;function fe(e,t,n,r){if(e[t+3]<=0)return;e[t+5]=e[t+5]-r*n,e[t]=e[t]+e[t+4]*n,e[t+1]=e[t+1]+e[t+5]*n,e[t+2]=e[t+2]+e[t+6]*n;let i=e[t+7]*.5,a=e[t+8];e[t+1]-i<a&&(e[t+1]=a+i,e[t+5]<0&&(e[t+5]=-e[t+5]*ue,e[t+4]=e[t+4]*de,e[t+6]=e[t+6]*de)),e[t+3]=e[t+3]-n}function pe(e,t,n=22){for(let r=0;r<e.length;r+=12)fe(e,r,t,n)}var me=class{random;data=new Float32Array(j*12);next=0;constructor(e=Math.random){this.random=e}spawnBurst(e,t,n,r,i){let a=this.random,o=16+Math.floor(a()*9),s=this.next;for(let s=0;s<o;s++){let o=this.next*12,s=.1+a()*.1,c=t+.15+a()*.7,l=n+.15+a()*.7,u=r+.15+a()*.7,d=.9+a()*.8,f=this.data;f[o]=c,f[o+1]=l,f[o+2]=u,f[o+3]=d,f[o+4]=(c-t-.5)*5+(a()-.5)*1.5,f[o+5]=2.5+a()*3,f[o+6]=(u-r-.5)*5+(a()-.5)*1.5,f[o+7]=s,f[o+8]=i,f[o+9]=e,f[o+10]=a(),f[o+11]=d,this.next=(this.next+1)%j}return s+o<=1024?[{first:s,count:o}]:[{first:s,count:j-s},{first:0,count:s+o-j}]}step(e){pe(this.data,e)}alive(){let e=0;for(let t=3;t<this.data.length;t+=12)this.data[t]>0&&e++;return e}},he=class extends Error{name=`WebGpuUnavailableError`},ge=class e{adapter;device;canvas;context;format;static DEPTH_FORMAT=`depth24plus`;static OFFSCREEN_FORMAT=`rgba8unorm`;depthTexture=null;depthView=null;width=0;height=0;offscreenTexture=null;offscreenView=null;constructor(e,t,n,r,i){this.adapter=e,this.device=t,this.canvas=n,this.context=r,this.format=i}get offscreen(){return this.context===null}static async create(t,n={}){if(typeof navigator>`u`||!navigator.gpu)throw new he(`WebGPU is not supported by this browser.`);let r=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!r)throw new he(`No suitable WebGPU adapter was found.`);let i=await r.requestDevice({label:`voxel-engine device`,requiredLimits:{maxStorageBufferBindingSize:r.limits.maxStorageBufferBindingSize,maxBufferSize:r.limits.maxBufferSize}}),a=null,o=e.OFFSCREEN_FORMAT;if(!n.offscreen){if(a=t.getContext(`webgpu`),!a)throw new he(`Could not create a WebGPU canvas context.`);o=navigator.gpu.getPreferredCanvasFormat(),a.configure({device:i,format:o,alphaMode:`opaque`})}let s=new e(r,i,t,a,o);return s.resize(),s}resize(){let t=Math.min(window.devicePixelRatio||1,2),n=this.device.limits.maxTextureDimension2D,r=Math.max(1,Math.min(n,Math.floor(this.canvas.clientWidth*t))),i=Math.max(1,Math.min(n,Math.floor(this.canvas.clientHeight*t)));return r===this.width&&i===this.height&&this.depthTexture?!1:(this.width=r,this.height=i,this.canvas.width=r,this.canvas.height=i,this.depthTexture?.destroy(),this.depthTexture=this.device.createTexture({label:`depth buffer`,size:{width:r,height:i},format:e.DEPTH_FORMAT,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),this.depthView=this.depthTexture.createView(),this.offscreen&&(this.offscreenTexture?.destroy(),this.offscreenTexture=this.device.createTexture({label:`offscreen colour target`,size:{width:r,height:i},format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.offscreenView=this.offscreenTexture.createView()),!0)}currentColorView(){return this.context?this.context.getCurrentTexture().createView():this.offscreenView}async captureFrame(){let e=this.offscreenTexture;if(!e)throw Error(`frame capture requires offscreen mode`);let{width:t,height:n}=e,r=Math.ceil(t*4/256)*256,i=this.device.createBuffer({label:`frame capture`,size:r*n,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),a=this.device.createCommandEncoder({label:`frame capture`});a.copyTextureToBuffer({texture:e},{buffer:i,bytesPerRow:r},{width:t,height:n}),this.device.queue.submit([a.finish()]),await i.mapAsync(GPUMapMode.READ);let o=new Uint8Array(i.getMappedRange()),s=new Uint8Array(t*n*4);for(let e=0;e<n;e++)s.set(o.subarray(e*r,e*r+t*4),e*t*4);return i.unmap(),i.destroy(),{width:t,height:n,pixels:s}}get aspect(){return this.width/Math.max(1,this.height)}};async function M(e,t,n){let r=e.createShaderModule({label:t,code:n}),i=await r.getCompilationInfo(),a=i.messages.filter(e=>e.type===`error`);for(let e of i.messages){let r=n.split(`
`)[e.lineNum-1]??``,i=`[${t}] ${e.type} at ${e.lineNum}:${e.linePos}: ${e.message}\n    ${r.trim()}`;e.type===`error`?console.error(i):console.warn(i)}if(a.length>0)throw Error(`WGSL compilation failed for ${t}: ${a.map(e=>`${e.lineNum}:${e.linePos} ${e.message}`).join(`; `)}`);return r}var _e=`// Target-block overlays: wireframe selection box and the mining crack stages.
// ---- begin common.wgsl ----
// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}

// ---- end common.wgsl ----

struct Overlay {
  block: vec4<f32>,  // xyz = minimum corner of the targeted voxel, w = 1 when visible
  params: vec4<f32>, // x = crack stage 0..9 (negative = none)
}

@group(0) @binding(1) var<uniform> overlay: Overlay;
@group(0) @binding(2) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(3) var blockSampler: sampler;

fn cubeCorner(i: u32) -> vec3<f32> {
  return vec3<f32>(f32(i & 1u), f32((i >> 1u) & 1u), f32((i >> 2u) & 1u));
}

// 12 edges × 2 endpoints (line list).
@vertex
fn vs_box(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var edges = array<u32, 24>(0u, 1u, 2u, 3u, 4u, 5u, 6u, 7u, 0u, 2u, 1u, 3u, 4u, 6u, 5u, 7u, 0u, 4u, 1u, 5u, 2u, 6u, 3u, 7u);
  if (overlay.block.w < 0.5) {
    return vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }
  let p = overlay.block.xyz - vec3<f32>(0.002) + cubeCorner(edges[vi]) * 1.004;
  return frame.viewProj * vec4<f32>(p, 1.0);
}

@fragment
fn fs_box() -> @location(0) vec4<f32> {
  return vec4<f32>(0.02, 0.02, 0.02, 0.75);
}

struct CrackOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_crack(@builtin(vertex_index) vi: u32) -> CrackOut {
  var out: CrackOut;
  if (overlay.block.w < 0.5 || overlay.params.x < 0.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let face = vi / 6u;
  var quad = array<vec2<f32>, 6>(vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
                                 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0));
  let c = quad[vi % 6u];
  let axis = face >> 1u;
  let negative = (face & 1u) == 1u;
  let u = (axis + 1u) % 3u;
  let v = (axis + 2u) % 3u;
  var local = vec3<f32>(0.0);
  local[axis] = select(1.0, 0.0, negative);
  local[u] = select(c.x, c.y, negative);
  local[v] = select(c.y, c.x, negative);
  // Slightly larger than the block so the overlay wins the depth test without z-fighting.
  let p = overlay.block.xyz - vec3<f32>(0.003) + local * 1.006;
  out.clip = frame.viewProj * vec4<f32>(p, 1.0);
  out.uv = c;
  return out;
}

@fragment
fn fs_crack(in: CrackOut) -> @location(0) vec4<f32> {
  let stage = i32(overlay.params.x);
  let texel = textureSampleLevel(blockTextures, blockSampler, in.uv, TEX_CRACK_0 + stage, 0.0);
  if (texel.a < 0.5) {
    discard;
  }
  return vec4<f32>(texel.rgb, 0.8);
}
`,ve=`// Block-break debris: compute simulation + instanced cube rendering. Layout in src/fx/particles.ts.
// ---- begin common.wgsl ----
// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}

// ---- end common.wgsl ----

struct SimParams {
  dt: f32,
  gravity: f32,
  count: u32,
  pad: u32,
}

@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> sim: SimParams;

// Mirrors stepParticle() in src/fx/particles.ts.
@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sim.count) {
    return;
  }
  var p0 = particles[i * 3u];      // position, life
  var p1 = particles[i * 3u + 1u]; // velocity, size
  let p2 = particles[i * 3u + 2u]; // floor, block, seed, total life
  if (p0.w <= 0.0) {
    return;
  }
  p1.y -= sim.gravity * sim.dt;
  p0 = vec4<f32>(p0.xyz + p1.xyz * sim.dt, p0.w);
  let half = p1.w * 0.5;
  if (p0.y - half < p2.x) {
    p0.y = p2.x + half;
    if (p1.y < 0.0) {
      p1.y = -p1.y * PARTICLE_RESTITUTION;
      p1.x *= PARTICLE_FRICTION;
      p1.z *= PARTICLE_FRICTION;
    }
  }
  p0.w -= sim.dt;
  particles[i * 3u] = p0;
  particles[i * 3u + 1u] = p1;
}

@group(0) @binding(3) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(4) var blockSampler: sampler;
@group(0) @binding(5) var<storage, read> renderParticles: array<vec4<f32>>;

struct ParticleOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) layer: i32,
  @location(2) light: f32,
  @location(3) world: vec3<f32>,
}

@vertex
fn vs_particle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ParticleOut {
  var out: ParticleOut;
  let p0 = renderParticles[ii * 3u];
  let p1 = renderParticles[ii * 3u + 1u];
  let p2 = renderParticles[ii * 3u + 2u];
  if (p0.w <= 0.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0); // dead: outside the clip volume
    return out;
  }
  // 36 vertices: 6 faces × 2 triangles, CCW seen from outside.
  let face = vi / 6u;
  var quad = array<vec2<f32>, 6>(vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
                                 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0));
  let c = quad[vi % 6u];
  let axis = face >> 1u;
  let negative = (face & 1u) == 1u;
  let u = (axis + 1u) % 3u;
  let v = (axis + 2u) % 3u;
  var local = vec3<f32>(0.0);
  local[axis] = select(0.5, -0.5, negative);
  local[u] = select(c.x, c.y, negative) - 0.5;
  local[v] = select(c.y, c.x, negative) - 0.5;
  // Shrink during the last 0.3 s of life.
  let size = p1.w * clamp(p0.w / 0.3, 0.0, 1.0);
  let world = p0.xyz + local * size;
  out.clip = frame.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  // A random quarter of the block texture, so each fragment shows a piece of the broken block.
  out.uv = vec2<f32>(fract(p2.z * 7.13), fract(p2.z * 3.71)) * 0.75 + c * 0.25;
  out.layer = textureLayer(u32(p2.y), face);
  var n = vec3<f32>(0.0);
  n[axis] = select(1.0, -1.0, negative);
  out.light = max(dot(n, frame.lightDir.xyz), 0.0);
  return out;
}

@fragment
fn fs_particle(in: ParticleOut) -> @location(0) vec4<f32> {
  let texel = textureSampleLevel(blockTextures, blockSampler, in.uv, in.layer, 0.0);
  if (texel.a < 0.5) {
    discard;
  }
  var albedo = texel.rgb;
  if (tintMode(in.layer) != 0u) {
    albedo *= pow(vec3<f32>(0.42, 0.7, 0.28), vec3<f32>(2.2)) * 1.75; // generic foliage green for grass/leaf debris
  }
  let direct = frame.lightColor.rgb * frame.lightDir.w * in.light / PI;
  let ambient = frame.skyZenith.rgb * 0.7 + frame.skyHorizon.rgb * 0.3 + vec3<f32>(0.02);
  let color = albedo * (direct + ambient);
  let dir = normalize(in.world - frame.cameraPos.xyz);
  return vec4<f32>(toDisplay(mix(color, skyColor(dir), fogAmount(in.world))), 1.0);
}
`,ye=`// Depth-only shadow pass: renders the opaque chunk geometry into one cascade layer of the
// depth32float shadow map array, using the same vertex pulling as the terrain pipeline.
// ---- begin common.wgsl ----
// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}

// ---- end common.wgsl ----

@group(0) @binding(1) var<storage, read> vertices: array<u32>;
@group(0) @binding(2) var<storage, read> chunkOrigins: array<vec4<i32>>;

override VERTEX_CAPACITY: u32 = 24576u;
override CASCADE: u32 = 0u;

@vertex
fn vs_shadow(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  let packed = vertices[vi];
  let origin = vec3<f32>(chunkOrigins[vi / VERTEX_CAPACITY].xyz);
  let local = vec3<f32>(f32(packed & 63u), f32((packed >> 6u) & 63u), f32((packed >> 12u) & 63u));
  let world = vec4<f32>(origin + local, 1.0);
  if (CASCADE == 0u) {
    return frame.shadowViewProj0 * world;
  }
  return frame.shadowViewProj1 * world;
}
`,be=`// Full-screen sky pass drawn before the terrain: gradient dome, sun and moon discs, stars.
// ---- begin common.wgsl ----
// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}

// ---- end common.wgsl ----

struct SkyOut {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> SkyOut {
  // Single oversized triangle covering the viewport.
  let uv = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  let ndc = uv * 2.0 - 1.0;
  var out: SkyOut;
  out.position = vec4<f32>(ndc, 1.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs_main(in: SkyOut) -> @location(0) vec4<f32> {
  let farPoint = frame.invViewProj * vec4<f32>(in.ndc, 1.0, 1.0);
  let dir = normalize(farPoint.xyz / farPoint.w - frame.cameraPos.xyz);
  var col = skyColor(dir);
  let above = smoothstep(-0.02, 0.02, dir.y);

  // Sun disc.
  let mu = dot(dir, frame.sunDir.xyz);
  col += frame.sunColor.rgb * 24.0 * frame.sunDir.w * smoothstep(0.99955, 0.99975, mu);

  // Moon disc with a little shading.
  let moonMu = dot(dir, -frame.sunDir.xyz);
  let moon = smoothstep(0.99965, 0.9998, moonMu) * frame.sunColor.w;
  col += MOON_COLOR * 1.6 * moon * (0.8 + 0.2 * hash31(floor(dir * 900.0)));

  // Stars: sparse hashed cells on the direction sphere, twinkling slightly.
  let cell = floor(dir * 220.0);
  let h = hash31(cell);
  let twinkle = 0.7 + 0.3 * sin(frame.cameraPos.w * (1.5 + h * 3.0) + h * 40.0);
  let star = step(0.9965, h) * twinkle * above;
  col += vec3<f32>(0.9, 0.95, 1.0) * star * frame.skyZenith.w * 1.5;

  return vec4<f32>(toDisplay(col), 1.0);
}
`,xe=`// Terrain render pipelines: vertex pulling from the compute-generated vertex pools, drawn with
// drawIndexedIndirect. Blocks are textured from a 16×16 pixel-art texture array, tinted per biome
// (climate evaluated per vertex, so tints blend smoothly), lit by the sun/moon with cascaded
// shadow maps and by the flood-filled voxel light (skylight + torch light, smoothed per vertex by
// the mesher). The chunk slot is recovered from vertex_index because each indirect record's
// baseVertex is slot * VERTEX_CAPACITY; the quad's light word sits at LIGHT_OFFSET + vertex / 4.
// ---- begin common.wgsl ----
// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}

// ---- end common.wgsl ----
// ---- begin climate.wgsl ----
// Climate model shared by world generation and terrain shading. Mirrors src/world/terrain.ts.
// ---- begin noise.wgsl ----
// Deterministic hashed-gradient simplex noise. Mirrors src/world/noise.ts exactly.

fn hash3(x: i32, y: i32, z: i32, seed: u32) -> u32 {
  var h = seed ^ (bitcast<u32>(x) * 0x8da6b343u) ^ (bitcast<u32>(y) * 0xd8163841u) ^ (bitcast<u32>(z) * 0xcb1ab31fu);
  h = h ^ (h >> 16u);
  h = h * 0x85ebca6bu;
  h = h ^ (h >> 13u);
  h = h * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  return h;
}

fn grad3(hash: u32, x: f32, y: f32, z: f32) -> f32 {
  let h = hash & 15u;
  let u = select(y, x, h < 8u);
  let v = select(select(z, x, h == 12u || h == 14u), y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-v, v, (h & 2u) == 0u);
}

fn grad2(hash: u32, x: f32, y: f32) -> f32 {
  let h = hash & 7u;
  let u = select(y, x, h < 4u);
  let v = select(x, y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-2.0 * v, 2.0 * v, (h & 2u) == 0u);
}

const RIDGE_SOFTNESS: f32 = 0.1;
const NOISE_F2: f32 = 0.3660254037844386;
const NOISE_G2: f32 = 0.21132486540518713;
const NOISE_F3: f32 = 0.3333333333333333;
const NOISE_G3: f32 = 0.16666666666666666;

fn simplex2(x: f32, y: f32, seed: u32) -> f32 {
  let s = (x + y) * NOISE_F2;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let t = (fi + fj) * NOISE_G2;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let i = i32(fi);
  let j = i32(fj);
  let i1 = select(0, 1, x0 > y0);
  let j1 = 1 - i1;
  let x1 = x0 - f32(i1) + NOISE_G2;
  let y1 = y0 - f32(j1) + NOISE_G2;
  let x2 = x0 - 1.0 + 2.0 * NOISE_G2;
  let y2 = y0 - 1.0 + 2.0 * NOISE_G2;
  var n = 0.0;
  var t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad2(hash3(i, j, 0, seed), x0, y0);
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0.0) {
    t1 = t1 * t1;
    n += t1 * t1 * grad2(hash3(i + i1, j + j1, 0, seed), x1, y1);
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0.0) {
    t2 = t2 * t2;
    n += t2 * t2 * grad2(hash3(i + 1, j + 1, 0, seed), x2, y2);
  }
  return 40.0 * n;
}

fn simplex3(x: f32, y: f32, z: f32, seed: u32) -> f32 {
  let s = (x + y + z) * NOISE_F3;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let fk = floor(z + s);
  let t = (fi + fj + fk) * NOISE_G3;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let z0 = z - (fk - t);
  var o1 = vec3<i32>(0, 0, 0);
  var o2 = vec3<i32>(0, 0, 0);
  if (x0 >= y0) {
    if (y0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 1, 0); }
    else if (x0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 0, 1); }
    else { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(1, 0, 1); }
  } else {
    if (y0 < z0) { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(0, 1, 1); }
    else if (x0 < z0) { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(0, 1, 1); }
    else { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(1, 1, 0); }
  }
  let p0 = vec3<f32>(x0, y0, z0);
  let p1 = p0 - vec3<f32>(o1) + vec3<f32>(NOISE_G3);
  let p2 = p0 - vec3<f32>(o2) + vec3<f32>(2.0 * NOISE_G3);
  let p3 = p0 - vec3<f32>(1.0) + vec3<f32>(3.0 * NOISE_G3);
  let c = vec3<i32>(i32(fi), i32(fj), i32(fk));
  var n = 0.0;
  var t0 = 0.6 - dot(p0, p0);
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad3(hash3(c.x, c.y, c.z, seed), p0.x, p0.y, p0.z);
  }
  var t1 = 0.6 - dot(p1, p1);
  if (t1 > 0.0) {
    t1 = t1 * t1;
    let q = c + o1;
    n += t1 * t1 * grad3(hash3(q.x, q.y, q.z, seed), p1.x, p1.y, p1.z);
  }
  var t2 = 0.6 - dot(p2, p2);
  if (t2 > 0.0) {
    t2 = t2 * t2;
    let q = c + o2;
    n += t2 * t2 * grad3(hash3(q.x, q.y, q.z, seed), p2.x, p2.y, p2.z);
  }
  var t3 = 0.6 - dot(p3, p3);
  if (t3 > 0.0) {
    t3 = t3 * t3;
    let q = c + vec3<i32>(1, 1, 1);
    n += t3 * t3 * grad3(hash3(q.x, q.y, q.z, seed), p3.x, p3.y, p3.z);
  }
  return 32.0 * n;
}

fn fbm2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    sum += amp * simplex2(x * freq, y * freq, seed + o);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// Ridged multifractal with rounded crests (mirrors ridged2 in src/world/noise.ts).
fn ridged2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    let n = simplex2(x * freq, y * freq, seed + o);
    let r = max(0.0, 1.0 - sqrt(n * n + RIDGE_SOFTNESS * RIDGE_SOFTNESS));
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// ---- end noise.wgsl ----

const BIOME_PLAINS: u32 = 0u;
const BIOME_DESERT: u32 = 1u;
const BIOME_SNOWY: u32 = 2u;
const BIOME_FOREST: u32 = 3u;

fn temperatureAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0011, z * 0.0011, 3u, seed + 501u);
}

fn humidityAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0013, z * 0.0013, 3u, seed + 502u);
}

// Smooth biome weights (plains, desert, snowy, forest); non-negative and summing to 1.
fn biomeWeights(temperature: f32, humidity: f32) -> vec4<f32> {
  let cold = 1.0 - smoothstep(-0.28, -0.12, temperature);
  let hot = smoothstep(0.1, 0.26, temperature);
  let dry = 1.0 - smoothstep(-0.08, 0.06, humidity);
  let wet = smoothstep(0.06, 0.2, humidity);
  let desert = hot * dry * (1.0 - cold);
  let snowy = cold;
  let forest = (1.0 - cold) * (1.0 - desert) * wet;
  let plains = max(0.0, 1.0 - desert - snowy - forest);
  return vec4<f32>(plains, desert, snowy, forest);
}

fn dominantBiome(w: vec4<f32>) -> u32 {
  var best = 0u;
  var bestWeight = w.x;
  if (w.y > bestWeight) { best = 1u; bestWeight = w.y; }
  if (w.z > bestWeight) { best = 2u; bestWeight = w.z; }
  if (w.w > bestWeight) { best = 3u; }
  return best;
}

// Procedural grass/foliage palette: bilinear over (temperature, humidity), darker in forests.
fn grassTint(temperature: f32, humidity: f32) -> vec3<f32> {
  let t = clamp(temperature * 1.6 + 0.5, 0.0, 1.0);
  let h = clamp(humidity * 1.6 + 0.5, 0.0, 1.0);
  let cold = mix(vec3<f32>(0.46, 0.6, 0.42), vec3<f32>(0.3, 0.5, 0.36), h);
  let hot = mix(vec3<f32>(0.72, 0.66, 0.3), vec3<f32>(0.28, 0.62, 0.14), h);
  let forest = biomeWeights(temperature, humidity).w;
  let shade = 1.0 - 0.3 * forest;
  return mix(cold, hot, t) * shade;
}

// ---- end climate.wgsl ----

@group(0) @binding(1) var<storage, read> vertices: array<u32>;
@group(0) @binding(2) var<storage, read> chunkOrigins: array<vec4<i32>>;
@group(0) @binding(3) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(4) var blockSampler: sampler;
@group(0) @binding(5) var shadowMap: texture_depth_2d_array;
@group(0) @binding(6) var shadowSampler: sampler_comparison;
// Scene depth after the opaque pass (water pipeline only; bound read-only).
@group(1) @binding(0) var sceneDepth: texture_depth_2d;

// Vertex capacity of one chunk slot in the bound pool (opaque, water or cutout pipeline).
override VERTEX_CAPACITY: u32 = 24576u;
// First light word of the bound pool (mesh slots × VERTEX_CAPACITY).
override LIGHT_OFFSET: u32 = 0u;

const TORCH_COLOR: vec3<f32> = vec3<f32>(1.0, 0.63, 0.32);

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) ao: f32,
  @location(2) @interpolate(flat) face: u32,
  @location(3) @interpolate(flat) block: u32,
  @location(4) tint: vec3<f32>,
  @location(5) viewDepth: f32,
  // Cross plants: (u, v) inside the voxel (v = 0 at the top).
  @location(6) plantUV: vec2<f32>,
  // Smoothed voxel light: x = skylight, y = block (torch) light, both 0..1.
  @location(7) light: vec2<f32>,
}

fn isWater(b: u32) -> bool {
  return b == BLOCK_WATER || (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FALLING);
}

// How far the top edge of a water cell sits below the cell top (flowing water drops per level).
fn waterDrop(b: u32) -> f32 {
  var surface = 8.0;
  if (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FLOW7) {
    surface = f32(8u - (b - BLOCK_WATER_FLOW1 + 1u));
  }
  return 1.0 - surface / 8.0 * 0.88;
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let packed = vertices[vi];
  let slot = vi / VERTEX_CAPACITY;
  let origin = vec3<f32>(chunkOrigins[slot].xyz);
  let local = vec3<f32>(f32(packed & 63u), f32((packed >> 6u) & 63u), f32((packed >> 12u) & 63u));
  let face = (packed >> 18u) & 7u;
  let ao = (packed >> 21u) & 3u;
  let block = (packed >> 23u) & 31u;
  var world = origin + local;
  let corner = vi & 3u;
  if (isWater(block) && face != 3u) {
    // Water quads are never rotated (their AO is uniform), so the corner index tells which
    // vertices are on the top edge: lower them to the water surface (sources sit 0.12 below the
    // block top, flowing water lower per level; waterfall sides stay full height).
    let c = select(corner, (4u - corner) & 3u, (face & 1u) == 1u);
    let cu = c == 1u || c == 2u;
    let cv = c >= 2u;
    let top = face == 2u || (face <= 1u && cu) || (face >= 4u && cv);
    if (top && (face == 2u || block != BLOCK_WATER_FALLING)) {
      world.y -= waterDrop(block);
    }
  }
  var out: VertexOut;
  out.plantUV = vec2<f32>(select(0.0, 1.0, corner == 1u || corner == 2u), select(1.0, 0.0, corner >= 2u));
  let lightWord = vertices[LIGHT_OFFSET + (vi >> 2u)];
  let lightByte = (lightWord >> (corner * 8u)) & 0xffu;
  out.light = vec2<f32>(f32(lightByte >> 4u), f32(lightByte & 15u)) / 15.0;
  if (face >= 6u && corner >= 2u && block != BLOCK_TORCH) {
    // Gentle wind sway on the top edge of plants.
    let t = frame.cameraPos.w;
    world.x += sin(t * 1.7 + world.z * 0.9 + world.x * 0.3) * 0.06;
    world.z += cos(t * 1.3 + world.x * 0.8) * 0.06;
  }
  out.clip = frame.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  // AO levels 0..3 → light factor, slightly curved for contrast.
  let aoLinear = f32(ao) / 3.0;
  out.ao = mix(0.28, 1.0, aoLinear * aoLinear * 0.35 + aoLinear * 0.65);
  out.face = face;
  out.block = block;
  let seed = worldSeed();
  out.tint = grassTint(temperatureAt(world.x, world.z, seed), humidityAt(world.x, world.z, seed));
  out.viewDepth = dot(world - frame.cameraPos.xyz, frame.cameraDir.xyz);
  return out;
}

fn faceNormal(face: u32) -> vec3<f32> {
  if (face >= 6u) {
    return vec3<f32>(0.0, 1.0, 0.0); // plants are lit like the ground they grow on
  }
  var n = vec3<f32>(0.0, 0.0, 0.0);
  n[face >> 1u] = select(1.0, -1.0, (face & 1u) == 1u);
  return n;
}

// Texture coordinates of a face in voxel units: top/bottom use (x, z); side faces use a
// horizontal axis and -y so the texture's top row sits at the top of the block.
fn faceUV(world: vec3<f32>, face: u32) -> vec2<f32> {
  switch face {
    case 0u: { return vec2<f32>(-world.z, -world.y); }
    case 1u: { return vec2<f32>(world.z, -world.y); }
    case 4u: { return vec2<f32>(world.x, -world.y); }
    case 5u: { return vec2<f32>(-world.x, -world.y); }
    default: { return world.xz; }
  }
}

fn roughnessOf(block: u32) -> f32 {
  switch block {
    case BLOCK_WATER, BLOCK_WATER_FALLING: { return 0.06; }
    case BLOCK_ICE, BLOCK_GLASS: { return 0.12; }
    case BLOCK_BASALT: { return 0.55; }
    case BLOCK_LEAVES, BLOCK_PINE_LEAVES: { return 0.7; }
    case BLOCK_STONE, BLOCK_BEDROCK, BLOCK_COBBLESTONE: { return 0.8; }
    default: { return 0.9; }
  }
}

// Applies the biome tint according to the layer's tint mode (see TINTED_LAYERS).
fn tinted(texel: vec4<f32>, layer: i32, tint: vec3<f32>) -> vec3<f32> {
  let mode = tintMode(layer);
  // The palette is authored in sRGB; the grey tintable textures average ≈ 0.57 linear.
  let linearTint = pow(tint, vec3<f32>(2.2)) * 1.75;
  if (mode == 1u) {
    return texel.rgb * linearTint;
  }
  if (mode == 2u) {
    return mix(texel.rgb, texel.rgb * linearTint, texel.a);
  }
  return texel.rgb;
}

// ---------------------------------------------------------------------------------- shadows

fn sampleCascade(cascade: i32, world: vec3<f32>, n: vec3<f32>, nDotL: f32) -> f32 {
  let texel = select(frame.shadowSplits.w, frame.shadowSplits.z, cascade == 0);
  // Normal offset grows with the slope to the light: prevents acne on grazing faces.
  let slope = clamp(sqrt(max(1.0 - nDotL * nDotL, 0.0)) / max(nDotL, 0.05), 0.0, 5.0);
  let p = world + n * texel * (1.0 + 1.2 * slope);
  var clipPos = frame.shadowViewProj1 * vec4<f32>(p, 1.0);
  if (cascade == 0) {
    clipPos = frame.shadowViewProj0 * vec4<f32>(p, 1.0);
  }
  let uv = vec2<f32>(clipPos.x * 0.5 + 0.5, 0.5 - clipPos.y * 0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0)) || clipPos.z > 1.0) {
    return 1.0;
  }
  let depth = clipPos.z - 0.0004;
  // 3×3 PCF; each tap is itself bilinearly filtered by the comparison sampler.
  let texelStep = frame.shadowParams.z;
  var lit = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let offset = vec2<f32>(f32(dx), f32(dy)) * texelStep;
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, cascade, depth);
    }
  }
  return lit / 9.0;
}

// Fraction of direct light reaching \`world\` (1 = fully lit).
fn shadowFactor(world: vec3<f32>, n: vec3<f32>, viewDepth: f32) -> f32 {
  if (frame.shadowParams.x < 0.5) {
    return 1.0;
  }
  let nDotL = dot(n, frame.lightDir.xyz);
  if (nDotL <= 0.0) {
    return 0.0;
  }
  let split0 = frame.shadowSplits.x;
  let shadowFar = frame.shadowSplits.y;
  if (viewDepth >= shadowFar) {
    return 1.0;
  }
  let blend = frame.shadowParams.y;
  if (viewDepth < split0) {
    let near = sampleCascade(0, world, n, nDotL);
    // Cross-fade into cascade 1 over the last part of cascade 0 (no visible seam).
    let t = smoothstep(split0 * (1.0 - blend), split0, viewDepth);
    if (t <= 0.0) {
      return near;
    }
    return mix(near, sampleCascade(1, world, n, nDotL), t);
  }
  let far = sampleCascade(1, world, n, nDotL);
  return mix(far, 1.0, smoothstep(shadowFar * (1.0 - blend), shadowFar, viewDepth));
}

// ---------------------------------------------------------------------------------- lighting

// Directional key light (GGX / Smith / Schlick) with shadows, hemispherical sky ambient with baked
// AO, and warm torch light. \`light\` is the voxel light (sky, block): skylight gates the sun (voxels
// the flood fill says are enclosed never see it, even beyond the shadow maps) and scales the sky
// ambient quadratically, so caves fall off into darkness; block light adds a torch-coloured term.
fn shade(albedo: vec3<f32>, n: vec3<f32>, world: vec3<f32>, ao: f32, roughness: f32, f0: f32, shadow: f32, light: vec2<f32>) -> vec3<f32> {
  let l = frame.lightDir.xyz;
  let v = normalize(frame.cameraPos.xyz - world);
  let h = normalize(l + v);
  let nDotL = max(dot(n, l), 0.0);
  let nDotV = max(dot(n, v), 1e-3);
  let nDotH = max(dot(n, h), 0.0);
  let vDotH = max(dot(v, h), 0.0);
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = nDotH * nDotH * (a2 - 1.0) + 1.0;
  let distribution = a2 / (PI * denom * denom);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let geometry = (nDotV / (nDotV * (1.0 - k) + k)) * (nDotL / (nDotL * (1.0 - k) + k));
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
  let specular = distribution * geometry * fresnel / max(4.0 * nDotV * nDotL, 1e-3);
  let radiance = frame.lightColor.rgb * frame.lightDir.w;
  let sky = light.x;
  let sunVisible = smoothstep(0.2, 0.75, sky);
  let direct = ((1.0 - fresnel) * albedo / PI + specular) * radiance * nDotL * shadow * sunVisible;
  // Hemispherical sky light: horizon-tinted from below, zenith-tinted from above.
  let skyAmbient = mix(frame.skyHorizon.rgb * 0.5, frame.skyZenith.rgb * 0.7 + frame.skyHorizon.rgb * 0.35, n.y * 0.5 + 0.5);
  let bounce = vec3<f32>(0.12, 0.10, 0.08) * max(-n.y, 0.0) * frame.lightColor.w;
  let night = vec3<f32>(0.012, 0.016, 0.03);
  let skyFactor = sky * sky;
  let torch = TORCH_COLOR * (pow(light.y, 2.4) * 1.9);
  let cave = vec3<f32>(0.004, 0.005, 0.007);
  let ambient = albedo * ((skyAmbient + bounce + night) * skyFactor + torch + cave) * ao;
  return direct * mix(0.5, 1.0, ao) + ambient;
}

fn finish(color: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let dir = normalize(world - frame.cameraPos.xyz);
  return toDisplay(mix(color, skyColor(dir), fogAmount(world)));
}

@fragment
fn fs_opaque(in: VertexOut) -> @location(0) vec4<f32> {
  let uv = faceUV(in.world, in.face);
  let ddx = dpdx(uv);
  let ddy = dpdy(uv);
  let n = faceNormal(in.face);
  let layer = textureLayer(in.block, in.face);
  let texel = textureSampleGrad(blockTextures, blockSampler, fract(uv), layer, ddx, ddy);
  // Subtle per-block tone variation breaks up repetition of the 16×16 tiles.
  let cell = floor(in.world - n * 0.5);
  let tone = 0.94 + 0.12 * hash31(cell + vec3<f32>(0.37, 11.1, 5.3));
  let albedo = tinted(texel, layer, in.tint) * tone;
  let shadow = shadowFactor(in.world, n, in.viewDepth);
  let color = shade(albedo, n, in.world, in.ao, roughnessOf(in.block), 0.04, shadow, in.light);
  return vec4<f32>(finish(color, in.world), 1.0);
}

// Alpha-tested geometry: glass faces, cross plants and torches.
@fragment
fn fs_cutout(in: VertexOut) -> @location(0) vec4<f32> {
  let cross = in.face >= 6u;
  let worldUV = faceUV(in.world, in.face);
  let uv = select(worldUV, in.plantUV, cross);
  let ddx = dpdx(uv);
  let ddy = dpdy(uv);
  let layer = textureLayer(in.block, in.face);
  let sampleUV = select(fract(uv), clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), cross);
  let texel = textureSampleGrad(blockTextures, blockSampler, sampleUV, layer, ddx, ddy);
  if (texel.a < 0.5) {
    discard;
  }
  let n = faceNormal(in.face);
  let albedo = tinted(texel, layer, in.tint);
  let shadow = shadowFactor(in.world, n, in.viewDepth);
  let ao = select(in.ao, 1.0, cross);
  var color = shade(albedo, n, in.world, ao, roughnessOf(in.block), 0.04, shadow, in.light);
  if (in.block == BLOCK_TORCH && in.plantUV.y < 0.42) {
    color = albedo * 3.2; // the flame glows
  }
  return vec4<f32>(finish(color, in.world), 1.0);
}

const WATER_SHALLOW: vec3<f32> = vec3<f32>(0.10, 0.42, 0.45);
const WATER_DEEP: vec3<f32> = vec3<f32>(0.015, 0.07, 0.16);

@fragment
fn fs_water(in: VertexOut) -> @location(0) vec4<f32> {
  let t = frame.cameraPos.w;
  // Two texture layers scrolled against each other with a small sine warp: animated UV waves.
  let base = faceUV(in.world, in.face);
  let warp = vec2<f32>(sin(base.y * 0.9 + t * 1.3), cos(base.x * 0.8 + t * 1.1)) * 0.08;
  let uv1 = base * 0.5 + vec2<f32>(t * 0.05, t * 0.02) + warp;
  let uv2 = base * 0.35 - vec2<f32>(t * 0.03, t * 0.045) - warp;
  let d1x = dpdx(uv1);
  let d1y = dpdy(uv1);
  let d2x = dpdx(uv2);
  let d2y = dpdy(uv2);
  let tex = 0.5 * (textureSampleGrad(blockTextures, blockSampler, fract(uv1), TEX_WATER, d1x, d1y).rgb +
    textureSampleGrad(blockTextures, blockSampler, fract(uv2), TEX_WATER, d2x, d2y).rgb);

  var n = faceNormal(in.face);
  if (in.face == 2u) {
    // Animated ripples: analytic derivatives of a few travelling sine waves.
    let p = in.world.xz;
    let dx = cos(p.x * 1.1 + t * 1.3) * 0.6 + cos((p.x + p.y) * 0.7 + t * 0.9) * 0.4;
    let dz = cos(p.y * 1.3 - t * 1.1) * 0.6 + cos((p.x - p.y) * 0.8 + t * 1.7) * 0.4;
    n = normalize(vec3<f32>(dx * 0.05, 1.0, dz * 0.05));
  }

  // Depth-based transparency: the thicker the water column in front of the opaque scene, the more
  // it absorbs (and the darker/bluer it gets).
  let scene = textureLoad(sceneDepth, vec2<i32>(in.clip.xy), 0);
  let thickness = max(linearDepth(scene) - linearDepth(in.clip.z), 0.0);
  let absorb = 1.0 - exp(-thickness * 0.3);
  let albedo = mix(WATER_SHALLOW, WATER_DEEP, absorb) * (0.75 + 0.5 * tex);

  let v = normalize(frame.cameraPos.xyz - in.world);
  let cosTheta = abs(dot(n, v));
  let fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  let shadow = shadowFactor(in.world, faceNormal(in.face), in.viewDepth);
  let lit = shade(albedo, n, in.world, in.ao, 0.06, 0.02, shadow, in.light);
  // Enclosed water (caves) does not mirror the sky.
  let reflection = skyColor(reflect(-v, n)) * (0.08 + 0.92 * in.light.x * in.light.x);
  var color = mix(lit, reflection, fresnel);
  var alpha = clamp(mix(0.18, 0.93, absorb) + fresnel * 0.5, 0.0, 0.97);
  let fog = fogAmount(in.world);
  color = mix(color, skyColor(-v), fog);
  alpha = mix(alpha, 1.0, fog);
  return vec4<f32>(toDisplay(color), alpha);
}
`,N=32768,Se=32768,Ce=65536;function P(e){return Math.floor(Math.floor(e)/32)}function we(e,t,n){return e|t<<5|n<<10}function F(e,t,n){return((e+Se)*Ce+(t+Se))*Ce+(n+Se)}function Te(e,t,n){return e+1+(t+1)*3+(n+1)*9}function Ee(e,t,n,r){return r.dx=e<0?-1:+(e>=32),r.dy=t<0?-1:+(t>=32),r.dz=n<0?-1:+(n>=32),r.lx=e-r.dx*32,r.ly=t-r.dy*32,r.lz=n-r.dz*32,r}function I(e,t,n,r,i,a){return(e|t<<6|n<<12|r<<18|i<<21|a<<23)>>>0}var De=[0,1,2,0,2,3];function Oe(e,t,n,r){return(e|t<<8|n<<16|r<<24)>>>0}var ke=6144,Ae=1024,je=2048,Me=ke*4,Ne=Ae*4,Pe=je*4,L=34,Fe=L*L*L,Ie=Math.ceil(Fe/4);function Le(e,t,n){return e+L*(t+L*n)}var Re=30720,ze=5120,Be=10240,Ve=4294967295;function R(e,t,n,r){let i=(r^Math.imul(e,2376512323)^Math.imul(t,3625334849)^Math.imul(n,3407524639))>>>0;return i^=i>>>16,i=Math.imul(i,2246822507),i^=i>>>13,i=Math.imul(i,3266489909),i^=i>>>16,i>>>0}function He(e,t,n,r){let i=e&15,a=i<8?t:n,o=i<4?n:i===12||i===14?t:r;return(i&1?-a:a)+(i&2?-o:o)}function Ue(e,t,n){let r=e&7,i=r<4?t:n,a=r<4?n:t;return(r&1?-i:i)+(r&2?-2*a:2*a)}var We=.5*(Math.sqrt(3)-1),Ge=(3-Math.sqrt(3))/6,Ke=1/3,z=1/6;function qe(e,t,n){let r=(e+t)*We,i=Math.floor(e+r),a=Math.floor(t+r),o=(i+a)*Ge,s=e-(i-o),c=t-(a-o),l=+(s>c),u=1-l,d=s-l+Ge,f=c-u+Ge,p=s-1+2*Ge,m=c-1+2*Ge,h=0,g=.5-s*s-c*c;g>0&&(g*=g,h+=g*g*Ue(R(i,a,0,n),s,c));let _=.5-d*d-f*f;_>0&&(_*=_,h+=_*_*Ue(R(i+l,a+u,0,n),d,f));let v=.5-p*p-m*m;return v>0&&(v*=v,h+=v*v*Ue(R(i+1,a+1,0,n),p,m)),40*h}function Je(e,t,n,r){let i=(e+t+n)*Ke,a=Math.floor(e+i),o=Math.floor(t+i),s=Math.floor(n+i),c=(a+o+s)*z,l=e-(a-c),u=t-(o-c),d=n-(s-c),f,p,m,h,g,_;l>=u?u>=d?(f=1,p=0,m=0,h=1,g=1,_=0):l>=d?(f=1,p=0,m=0,h=1,g=0,_=1):(f=0,p=0,m=1,h=1,g=0,_=1):u<d?(f=0,p=0,m=1,h=0,g=1,_=1):l<d?(f=0,p=1,m=0,h=0,g=1,_=1):(f=0,p=1,m=0,h=1,g=1,_=0);let v=l-f+z,y=u-p+z,b=d-m+z,x=l-h+2*z,S=u-g+2*z,C=d-_+2*z,w=l-1+3*z,T=u-1+3*z,E=d-1+3*z,D=0,O=.6-l*l-u*u-d*d;O>0&&(O*=O,D+=O*O*He(R(a,o,s,r),l,u,d));let k=.6-v*v-y*y-b*b;k>0&&(k*=k,D+=k*k*He(R(a+f,o+p,s+m,r),v,y,b));let A=.6-x*x-S*S-C*C;A>0&&(A*=A,D+=A*A*He(R(a+h,o+g,s+_,r),x,S,C));let ee=.6-w*w-T*T-E*E;return ee>0&&(ee*=ee,D+=ee*ee*He(R(a+1,o+1,s+1,r),w,T,E)),32*D}function Ye(e,t,n,r){let i=0,a=1,o=1,s=0;for(let c=0;c<n;c++)i+=a*qe(e*o,t*o,r+c>>>0),s+=a,a*=.5,o*=2;return i/s}var Xe=.1;function Ze(e,t,n,r){let i=0,a=1,o=1,s=0;for(let c=0;c<n;c++){let n=qe(e*o,t*o,r+c>>>0),l=Math.max(0,1-Math.sqrt(n*n+Xe*Xe));i+=a*l*l,s+=a,a*=.5,o*=2}return i/s}function B(e,t,n){let r=Math.min(Math.max((n-e)/(t-e),0),1);return r*r*(3-2*r)}var Qe=`grass_top.grass_side.dirt.stone.sand.wood_side.wood_top.leaves.water.basalt.bedrock.sandstone_side.sandstone_top.snow.ice.cactus_side.cactus_top.birch_side.pine_side.pine_leaves.glass.cobblestone.brick.tall_grass.red_flower.yellow_flower.torch.crack_0.crack_1.crack_2.crack_3.crack_4.crack_5.crack_6.crack_7.crack_8.crack_9`.split(`.`),$e=Object.fromEntries(Qe.map((e,t)=>[e,t]));Math.log2(16)+1;var et={[e.Stone]:[`stone`,`stone`,`stone`],[e.Dirt]:[`dirt`,`dirt`,`dirt`],[e.Grass]:[`grass_top`,`grass_side`,`dirt`],[e.Sand]:[`sand`,`sand`,`sand`],[e.Water]:[`water`,`water`,`water`],[e.Basalt]:[`basalt`,`basalt`,`basalt`],[e.Wood]:[`wood_top`,`wood_side`,`wood_top`],[e.Leaves]:[`leaves`,`leaves`,`leaves`],[e.Bedrock]:[`bedrock`,`bedrock`,`bedrock`],[e.Sandstone]:[`sandstone_top`,`sandstone_side`,`sandstone_top`],[e.Snow]:[`snow`,`snow`,`snow`],[e.Ice]:[`ice`,`ice`,`ice`],[e.Cactus]:[`cactus_top`,`cactus_side`,`cactus_top`],[e.BirchWood]:[`wood_top`,`birch_side`,`wood_top`],[e.PineWood]:[`wood_top`,`pine_side`,`wood_top`],[e.PineLeaves]:[`pine_leaves`,`pine_leaves`,`pine_leaves`],[e.Glass]:[`glass`,`glass`,`glass`],[e.Cobblestone]:[`cobblestone`,`cobblestone`,`cobblestone`],[e.Brick]:[`brick`,`brick`,`brick`],[e.TallGrass]:[`tall_grass`,`tall_grass`,`tall_grass`],[e.RedFlower]:[`red_flower`,`red_flower`,`red_flower`],[e.YellowFlower]:[`yellow_flower`,`yellow_flower`,`yellow_flower`],[e.Torch]:[`torch`,`torch`,`torch`],[e.WaterFlow1]:[`water`,`water`,`water`],[e.WaterFlow2]:[`water`,`water`,`water`],[e.WaterFlow3]:[`water`,`water`,`water`],[e.WaterFlow4]:[`water`,`water`,`water`],[e.WaterFlow5]:[`water`,`water`,`water`],[e.WaterFlow6]:[`water`,`water`,`water`],[e.WaterFlow7]:[`water`,`water`,`water`],[e.WaterFalling]:[`water`,`water`,`water`]},tt={grass_top:`full`,grass_side:`masked`,leaves:`full`,tall_grass:`full`};function nt(){let e=[`fn textureLayer(block: u32, face: u32) -> i32 {`,`  var t = 0;`,`  var s = 0;`,`  var b = 0;`,`  switch block {`];for(let t=1;t<32;t++){let[n,r,i]=et[t];e.push(`    case ${t}u: { t = ${$e[n]}; s = ${$e[r]}; b = ${$e[i]}; }`)}e.push(`    default: {}`,`  }`,`  if (face == 2u) { return t; }`,`  if (face == 3u) { return b; }`,`  return s;`,`}`),e.push(`fn tintMode(layer: i32) -> u32 {`,`  switch layer {`);for(let[t,n]of Object.entries(tt))e.push(`    case ${$e[t]}: { return ${n===`full`?1:2}u; }`);return e.push(`    default: { return 0u; }`,`  }`,`}`),e.join(`
`)}function V(e,t,n,r=0){return R(e,t,n*131+r,24301)/4294967296}function H(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function rt(e,t,n){return[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n]}var it=[.78,.78,.78],at=[.47,.33,.21],ot=[.52,.52,.54],st=[.87,.81,.6],ct=[.84,.75,.52],lt=[.4,.29,.17],ut=[.66,.51,.31],dt=[.2,.42,.66],ft=[.2,.2,.24],pt=[.3,.3,.31],mt=[.93,.95,.98],ht=[.62,.78,.95],gt=[.28,.55,.22],_t=[.88,.87,.82],vt=[.3,.21,.13],yt=[.16,.33,.2],bt=[.6,.28,.22],xt=[.72,.7,.66];function St(e,t,n){let r=V(e,t,n);return r<.12?H(at,.72):r>.93?H(at,1.22):H(at,.92+.14*V(e,t,n,1))}function U(e){return[e[0],e[1],e[2],1]}function Ct(e,t,n){let r=0,i=2+e;for(let a=0;a<i;a++){let i=7.5+(V(a,0,99,1)-.5)*4,o=7.5+(V(a,0,99,2)-.5)*4,s=V(a,0,99,3)*Math.PI*2,c=3+e;for(let e=0;e<c;e++){Math.floor(i)===t&&Math.floor(o)===n&&(r=1);let c=(V(a,e,99,4)-.5)*1.2;i+=Math.cos(s+c),o+=Math.sin(s+c)}}return r}function wt(e,t,n){let r=V(t,n,e),i=Qe[e];if(i.startsWith(`crack_`))return[.08,.07,.06,Ct(Number(i.slice(6)),t,n)];switch(i){case`grass_top`:return U(H(it,r<.15?.8:r>.9?1.12:.92+.12*V(t,n,e,1)));case`grass_side`:return n<3+ +(V(t,0,e,7)<.5)+ +(V(t,0,e,8)<.25)?[...H(it,.88+.14*r),1]:[...St(t,n,e),0];case`dirt`:return U(St(t,n,e));case`stone`:{let i=V(t>>2,n>>2,e,3);return U(H(ot,V(t,n,e,4)<.06?.7:.86+.12*i+.08*r))}case`sand`:return U(H(st,r<.1?.88:.95+.08*V(t,n,e,1)));case`wood_side`:return U(H(lt,(V(t,0,e,5)<.3?.75:1)*(.9+.12*r)));case`wood_top`:{let e=Math.hypot(t-7.5,n-7.5);return U(e>6.8?H(lt,.9+.1*r):H(ut,(Math.floor(e)%2==0?1:.82)*(.94+.08*r)))}case`leaves`:return U(r<.18?H(it,.5):H(it,.78+.28*V(t,n,e,1)));case`water`:{let e=Math.sin((t+n*.5)*.9)*.5+.5;return U(rt(dt,H(dt,1.35),e*.35+r*.1))}case`basalt`:return U(H(ft,(t%5==0?.7:1)*(.85+.25*r)));case`bedrock`:return U(H(pt,r<.4?.35+.2*r:.8+.4*V(t,n,e,1)));case`sandstone_side`:return U(H(ct,(Math.floor(n/4)%2==0?1:.9)*(n%4==3?.85:.96+.06*r)));case`sandstone_top`:return U(H(ct,.95+.08*r));case`snow`:return U(H(mt,.95+.05*r));case`ice`:return U(H(ht,((t+n)%7==0?1.12:1)*(.94+.06*r)));case`cactus_side`:{let i=t%4==1?.8:1;return U(V(t,n,e,2)<.06?[.9,.88,.7]:H(gt,i*(.92+.1*r)))}case`cactus_top`:return U(H(gt,Math.hypot(t-7.5,n-7.5)<3?1.15:.95+.06*r));case`birch_side`:return U(V(Math.floor(t/3),n,e,6)<.12?[.18,.17,.15]:H(_t,.94+.08*r));case`pine_side`:return U(H(vt,(V(t,0,e,5)<.35?.78:1)*(.9+.12*r)));case`pine_leaves`:return U(r<.2?H(yt,.6):H(yt,.85+.3*V(t,n,e,1)));case`glass`:{let e=t===0||n===0||t===15||n===15,r=(t-n===3||t-n===4)&&t>3&&t<12;return e?[.82,.9,.94,1]:r?[.95,.98,1,1]:[0,0,0,0]}case`cobblestone`:{let i=99,a=99,o=0;for(let r=-1;r<=1;r++)for(let s=-1;s<=1;s++){let c=Math.floor(t/5)+s,l=Math.floor(n/5)+r,u=c*5+V(c,l,e,1)*5,d=l*5+V(c,l,e,2)*5,f=Math.hypot(t+.5-u,n+.5-d);f<i?(a=i,i=f,o=c*31+l):f<a&&(a=f)}return a-i<.9?U(H(ot,.55)):U(H(ot,.8+.25*V(o,0,e,3)+.06*r))}case`brick`:{let i=Math.floor(n/4),a=i%2==0?0:4;return U(n%4==3||(t+a)%8==7?H(xt,.95+.05*r):H(bt,.88+.18*V(Math.floor((t+a)/8),i,e,1)+.06*r))}case`tall_grass`:return t%3!=2&&n>=3+Math.floor(V(t,0,e,9)*9)?[...H(it,.75+.3*r),1]:[0,0,0,0];case`red_flower`:case`yellow_flower`:{let e=Math.hypot(t-7.5,n-5)<2.6;return Math.hypot(t-7.5,n-5)<1?[.95,.85,.3,1]:e?i===`red_flower`?[.85,.12,.1,1]:[.98,.85,.15,1]:(t===7||t===8)&&n>6||n===11&&(t===5||t===6)||n===10&&(t===9||t===10)?[.2,.5,.15,1]:[0,0,0,0]}case`torch`:{let e=Math.hypot((t-7.5)*1.3,n-4.2);return e<1.2?[1,.97,.75,1]:e<2.3?[1,.78,.25,1]:e<2.9&&n>=3?[.95,.45,.1,1]:(t===7||t===8)&&n>=6?[...H(lt,t===7?1.15:.9),1]:[0,0,0,0]}default:return[1,0,1,1]}}var Tt=e=>e<=.04045?e/12.92:((e+.055)/1.055)**2.4,Et=e=>e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055;function Dt(){let e=Qe.length,t=16,n=new Float32Array(t*t*e*4);for(let r=0;r<e;r++)for(let e=0;e<t;e++)for(let i=0;i<t;i++){let a=wt(r,i,e),o=((r*t+e)*t+i)*4;for(let e=0;e<3;e++)n[o+e]=Tt(Math.min(1,Math.max(0,a[e])));n[o+3]=a[3]}let r=[];for(;;){let i=new Uint8Array(t*t*e*4);for(let r=0;r<t*t*e;r++){for(let e=0;e<3;e++)i[r*4+e]=Math.round(Et(n[r*4+e])*255);i[r*4+3]=Math.round(n[r*4+3]*255)}if(r.push(i),t===1)break;let a=t/2,o=new Float32Array(a*a*e*4);for(let r=0;r<e;r++)for(let e=0;e<a;e++)for(let i=0;i<a;i++){let s=0,c=[0,0,0,0];for(let a=0;a<2;a++)for(let o=0;o<2;o++){let l=((r*t+e*2+a)*t+i*2+o)*4,u=Math.max(n[l+3],.001);for(let e=0;e<3;e++)c[e]+=n[l+e]*u;c[3]+=n[l+3],s+=u}let l=((r*a+e)*a+i)*4;for(let e=0;e<3;e++)o[l+e]=c[e]/s;o[l+3]=c[3]/4}n=o,t=a}return{size:16,layers:e,mips:r}}function Ot(e){let t=Dt(),n=e.createTexture({label:`block textures`,size:{width:t.size,height:t.size,depthOrArrayLayers:t.layers},format:`rgba8unorm-srgb`,mipLevelCount:t.mips.length,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return t.mips.forEach((r,i)=>{let a=t.size>>i;e.queue.writeTexture({texture:n,mipLevel:i},r,{bytesPerRow:a*4,rowsPerImage:a},{width:a,height:a,depthOrArrayLayers:t.layers})}),{texture:n,sampler:e.createSampler({label:`block sampler`,magFilter:`nearest`,minFilter:`linear`,mipmapFilter:`linear`,addressModeU:`repeat`,addressModeV:`repeat`})}}var kt=36,At=N*8/32,jt=kt+At;function Mt(e){if(e<=1)return 0;if(e<=2)return 1;if(e<=4)return 2;if(e<=16)return 4;if(e<=256)return 8;if(e<=65536)return 16;throw RangeError(`palette size ${e} exceeds 65536 entries`)}function Nt(e){return N*e/32}var Pt=class t{bitsValue=0;indexShift=0;bitShift=0;mask=0;data=null;palette=[];counts=[];lookup=new Map;constructor(t=e.Air){this.palette.push(t),this.counts.push(N),this.lookup.set(t,0)}get bits(){return this.bitsValue}get paletteEntries(){return this.palette}get liveEntries(){let e=0;for(let t of this.counts)t>0&&e++;return e}get dataByteLength(){return this.data?this.data.byteLength:0}get rawData(){return this.data}countOf(e){let t=this.lookup.get(e);return t===void 0?0:this.counts[t]}get nonAirCount(){return N-this.countOf(e.Air)}uniformBlock(){for(let e=0;e<this.counts.length;e++)if(this.counts[e]===32768)return this.palette[e];return-1}get(e){if(this.bitsValue===0)return this.palette[0];let t=this.data[e>>>this.indexShift],n=(e&(1<<this.indexShift)-1)<<this.bitShift;return this.palette[t>>>n&this.mask]}getLocal(e,t,n){return this.get(we(e,t,n))}set(e,t){let n=this.getPaletteIndex(e);if(this.palette[n]===t)return!1;this.counts[n]--;let r=this.acquireEntry(t);return this.counts[r]++,r!==n&&this.writeIndex(e,r),!0}setLocal(e,t,n,r){return this.set(we(e,t,n),r)}fill(e){this.palette.length=0,this.counts.length=0,this.lookup.clear(),this.palette.push(e),this.counts.push(N),this.lookup.set(e,0),this.setBits(0),this.data=null}compact(){if(this.liveEntries===this.palette.length&&Mt(this.palette.length)===this.bitsValue)return;let e=this.toDense(),n=t.fromDense(e);this.adopt(n)}toDense(e=new Uint16Array(N)){if(this.bitsValue===0)return e.fill(this.palette[0]),e;let t=this.data,n=1<<this.indexShift,r=this.bitsValue,i=this.mask,a=this.palette,o=0;for(let s=0;s<t.length;s++){let c=t[s];for(let t=0;t<n;t++)e[o++]=a[c&i],c>>>=r}return e}static fromDense(e){if(e.length!==32768)throw RangeError(`expected ${N} voxels, got ${e.length}`);let n=new t(e[0]),r=[],i=[],a=new Map,o=new Uint16Array(N);for(let t=0;t<N;t++){let n=e[t],s=a.get(n);s===void 0&&(s=r.length,r.push(n),i.push(0),a.set(n,s)),i[s]++,o[t]=s}n.palette.length=0,n.counts.length=0,n.lookup.clear(),r.forEach((e,t)=>{n.palette.push(e),n.counts.push(i[t]),n.lookup.set(e,t)});let s=Mt(r.length);return n.setBits(s),n.data=s===0?null:Ft(o,s),n}gpuWordCount(){return kt+Nt(this.bitsValue)}writeGpuLayout(e,t=0){let n=()=>this.bitsValue<=8&&this.palette.length<=32;if(n()||this.compact(),!n())throw RangeError(`chunk palette (${this.palette.length} entries) exceeds GPU limit of 32`);e[t]=this.bitsValue,e[t+1]=this.palette.length,e[t+2]=this.nonAirCount,e[t+3]=0;for(let n=0;n<32;n++)e[t+4+n]=n<this.palette.length?this.palette[n]:0;return this.data&&e.set(this.data,t+kt),this.gpuWordCount()}static fromGpuLayout(e,n=0){let r=e[n],i=e[n+1];if(r!==0&&r!==1&&r!==2&&r!==4&&r!==8)throw RangeError(`invalid GPU bits ${r}`);if(i<1||i>32)throw RangeError(`invalid palette length ${i}`);let a=e.subarray(n+4,n+4+32),o=new Uint16Array(N);if(r===0)o.fill(a[0]);else{let t=32/r,s=(1<<r)-1,c=n+kt,l=0;for(let n=0;n<Nt(r);n++){let u=e[c+n];for(let e=0;e<t;e++){let e=u&s;if(e>=i)throw RangeError(`palette index ${e} out of range at voxel ${l}`);o[l++]=a[e],u>>>=r}}}return t.fromDense(o)}getPaletteIndex(e){return this.bitsValue===0?0:this.data[e>>>this.indexShift]>>>((e&(1<<this.indexShift)-1)<<this.bitShift)&this.mask}writeIndex(e,t){let n=this.data,r=e>>>this.indexShift,i=(e&(1<<this.indexShift)-1)<<this.bitShift;n[r]=(n[r]&~(this.mask<<i)|t<<i)>>>0}acquireEntry(e){let t=this.lookup.get(e);if(t!==void 0)return t;for(let t=0;t<this.counts.length;t++)if(this.counts[t]===0)return this.lookup.delete(this.palette[t]),this.palette[t]=e,this.lookup.set(e,t),t;let n=this.palette.length;this.palette.push(e),this.counts.push(0),this.lookup.set(e,n);let r=Mt(this.palette.length);return r!==this.bitsValue&&this.repack(r),n}repack(e){let t=new Uint16Array(N);if(this.bitsValue!==0)for(let e=0;e<N;e++)t[e]=this.getPaletteIndex(e);this.setBits(e),this.data=e===0?null:Ft(t,e)}setBits(e){this.bitsValue=e,this.bitShift=e===0?0:Math.log2(e),this.indexShift=e===0?0:5-this.bitShift,this.mask=e===0?0:(1<<e)-1}adopt(e){this.palette.length=0,this.counts.length=0,this.lookup.clear(),e.palette.forEach((t,n)=>{this.palette.push(t),this.counts.push(e.counts[n]),this.lookup.set(t,n)}),this.setBits(e.bitsValue),this.data=e.data}};function Ft(e,t){let n=32/t,r=new Uint32Array(Nt(t));for(let i=0;i<r.length;i++){let a=0,o=i*n;for(let r=n-1;r>=0;r--)a=a<<t|e[o+r];r[i]=a>>>0}return r}var It=-64,Lt=127,W={Plains:0,Desert:1,SnowyMountains:2,Forest:3},Rt=[`Plains`,`Desert`,`Snowy Mountains`,`Dense Forest`],zt={Oak:0,Birch:1,Pine:2,Cactus:3};function Bt(e,t,n){return Ye(e*.0011,t*.0011,3,n+501>>>0)}function Vt(e,t,n){return Ye(e*.0013,t*.0013,3,n+502>>>0)}function Ht(e,t){let n=1-B(-.28,-.12,e),r=B(.1,.26,e),i=1-B(-.08,.06,t),a=B(.06,.2,t),o=r*i*(1-n),s=n,c=(1-n)*(1-o)*a;return[Math.max(0,1-o-s-c),o,s,c]}function Ut(e){let t=W.Plains,n=e[0];return e[1]>n&&(t=1,n=e[1]),e[2]>n&&(t=2,n=e[2]),e[3]>n&&(t=3),t}function Wt(e,t,n){let r=Bt(e,t,n),i=Vt(e,t,n),a=Ht(r,i);return{continental:Ye(e*.0022,t*.0022,5,n),temperature:r,humidity:i,weights:a,biome:Ut(a)}}var Gt=[-1,-.4,-.15,-.04,.1,.35,.6,1],Kt=[-38,-22,-6,1,5,12,20,28];function qt(e){let t=Kt[0];for(let n=0;n<7;n++){let r=Gt[n],i=Gt[n+1];e>=r&&(t=Kt[n]+(Kt[n+1]-Kt[n])*Math.min((e-r)/(i-r),1))}return t}function Jt(e,t,n,r=Wt(e,t,n)){let i=r.continental,a=r.weights,o=1-B(.4,.75,Ye(e*.0045,t*.0045,3,n+11>>>0)*.5+.5),s=B(-.12,.08,i),c=a[0]*7+a[1]*4+a[2]*12+a[3]*10,l=Ye(e*.013,t*.013,4,n+22>>>0)*c*(.3+.7*o)*(.35+.65*s),u=Ze(e*.0048,t*.0048,4,n+33>>>0),d=64*(.75+.6*a[2]-.45*a[1]),f=u*u*d*B(.18,.5,i)*o,p=Ze(e*.018,t*.03,2,n+44>>>0)*6*a[1]*s;return qt(i)+l+f+p}function Yt(e){return 4*(1-.75*B(28,64,e))}function Xt(e,t,n,r,i){return r-t+Je(e*.03,t*.03,n*.03,i+45>>>0)*Yt(t)}function Zt(e,t,n,r,i){if(t<-40||t>20||r<=5)return!1;let a=B(-40,-34,t)*(1-B(14,20,t)),o=e*.022,s=t*.034,c=n*.022,l=Je(o,s,c,i+55>>>0)+.5*Je(o*2,s*2,c*2,i+56>>>0),u=Je(o,s,c,i+66>>>0)+.5*Je(o*2,s*2,c*2,i+67>>>0),d=1-Math.abs(l),f=1-Math.abs(u),p=1-.11*a;return d>p&&f>p}function Qt(e,t,n,r){let i=Math.floor(n);for(let a=i+6;a>=i-6;a--)if(Xt(e,a,t,n,r)>0)return a;return i-6-1}function $t(e,t,n){return Qt(e,t,Jt(e,t,n),n)}function en(t,n){return n===W.SnowyMountains?t>70?e.Stone:e.Snow:t<=2||n===W.Desert?e.Sand:t>62?e.Stone:e.Grass}var tn=[26,46,90,218];function nn(t,n,r){let i=R(t,1,n,r+77>>>0),a=t*8+2+(i&3),o=n*8+2+(i>>>2&3),s=Wt(a,o,r),c=s.biome;if((i>>>4&255)>=tn[c])return null;let l=Qt(a,o,Jt(a,o,r,s),r),u=en(l,c),d;if(c===W.Desert){if(u!==e.Sand||l<=2)return null;d=zt.Cactus}else if(c===W.SnowyMountains){if(u!==e.Snow||l<=2)return null;d=zt.Pine}else{if(u!==e.Grass)return null;d=c===W.Forest&&(i>>>20&1)==1?zt.Birch:zt.Oak}let f=[4,5,6,2],p=d===zt.Pine?4:3,m=l+f[d]+(i>>>12)%p;if(m+3>Lt)return null;let h=[[2,0],[-2,0],[0,2],[0,-2]];for(let e=0;e<4;e++)if($t(a+h[e][0],o+h[e][1],r)>l+2)return null;return{kind:d,x:a,z:o,base:l,top:m}}var rn=[e.Wood,e.BirchWood,e.PineWood,e.Cactus];function an(t,n,r,i,a){if(!i)return e.Air;let o=Math.abs(t-i.x),s=Math.abs(r-i.z);if(o===0&&s===0&&n>i.base&&n<=i.top)return rn[i.kind];let c=n-i.top;if(i.kind===zt.Cactus)return e.Air;if(i.kind===zt.Pine){if(c>1||n<=i.base+2)return e.Air;let t=1-c,r=t===0?0:t===1||t%2==0?1:2;return(t===1?o+s<=1:o<=r&&s<=r&&(r!==2||o!==2||s!==2))?e.PineLeaves:e.Air}return c>=-2&&c<=-1&&o<=2&&s<=2&&(o!==2||s!==2||!(R(t,n,r,a+88>>>0)&1))||c>=0&&c<=1&&o<=1&&s<=1&&(c!==1||o!==1||s!==1)?e.Leaves:e.Air}function on(t,n,r,i,a){if(i!==W.Plains&&i!==W.Forest)return e.Air;let o=R(t,n,r,a+333>>>0)%1e3,s=i===W.Plains?160:100,c=i===W.Plains?40:15;return o<s?e.TallGrass:o<s+c?o&1?e.YellowFlower:e.RedFlower:e.Air}function sn(t,n,r,i,a,o,s){let c=Xt(t,n,r,i,s);if(c<=0){let c=an(t,n,r,o,s);return c===e.Air?n<=0?a===W.SnowyMountains&&n===0?e.Ice:e.Water:n-1<=i+4+1&&Xt(t,n-1,r,i,s)>0&&en(n-1,a)===e.Grass?on(t,n,r,a,s):e.Air:c}if(n<=It+R(t,0,r,s+99>>>0)%3)return e.Bedrock;if(Zt(t,n,r,c,s))return e.Air;if(Xt(t,n+1,r,i,s)<=0)return en(n,a);let l=Xt(t,n+4,r,i,s)<=0,u=n<=2||a===W.Desert;return l?u?e.Sand:n>62?e.Stone:e.Dirt:a===W.Desert&&Xt(t,n+9,r,i,s)<=0?e.Sandstone:n<-44+Je(t*.04,n*.04,r*.04,s+111>>>0)*4?e.Basalt:e.Stone}function cn(e,t,n,r,i=new Uint16Array(N)){let a=e*32,o=t*32,s=n*32,c=[];for(let e=0;e<4;e++)for(let t=0;t<4;t++)c.push(nn(a/8+t,s/8+e,r));for(let e=0;e<32;e++)for(let t=0;t<32;t++){let n=Wt(a+t,s+e,r),l=Jt(a+t,s+e,r,n),u=c[Math.floor(e/8)*4+Math.floor(t/8)];for(let c=0;c<32;c++)i[we(t,c,e)]=sn(a+t,o+c,s+e,l,n.biome,u,r)}return i}function ln(e){return e.replace(/([a-z])([A-Z])/g,`$1_$2`).toUpperCase()}var G={none:0,opaque:1,water:2,cutout:3,cross:4},un=[[`CHUNK_SIZE`,32,`u32`],[`CHUNK_SIZE_I`,32,`i32`],[`CHUNK_VOLUME`,N,`u32`],[`SLOT_WORDS`,jt,`u32`],[`GPU_PALETTE_OFFSET`,4,`u32`],[`GPU_DATA_OFFSET`,kt,`u32`],[`PADDED_SIZE`,L,`u32`],[`PADDED_SIZE_I`,L,`i32`],[`PADDED_VOLUME`,Fe,`u32`],[`PADDED_WORDS`,Ie,`u32`],[`MESH_JOB_WORDS`,32,`u32`],[`MESH_JOB_NEIGHBOR_OFFSET`,4,`u32`],[`NO_SLOT`,Ve,`u32`],[`OPAQUE_QUAD_CAPACITY`,ke,`u32`],[`WATER_QUAD_CAPACITY`,Ae,`u32`],[`OPAQUE_VERTEX_CAPACITY`,Me,`u32`],[`CUTOUT_QUAD_CAPACITY`,je,`u32`],[`CUTOUT_VERTEX_CAPACITY`,Pe,`u32`],[`MESH_POOLS`,3,`u32`],[`RC_NONE`,G.none,`u32`],[`RC_OPAQUE`,G.opaque,`u32`],[`RC_WATER`,G.water,`u32`],[`RC_CUTOUT`,G.cutout,`u32`],[`RC_CROSS`,G.cross,`u32`],[`WATER_VERTEX_CAPACITY`,Ne,`u32`],[`INDIRECT_ARGS_WORDS`,5,`u32`],[`MESH_COUNTER_WORDS`,3,`u32`],...Object.entries(e).map(([e,t])=>[`BLOCK_${ln(e)}`,t,`u32`]),[`SEA_LEVEL`,0,`i32`],[`WORLD_MIN_Y`,It,`i32`],[`BEACH_MAX_Y`,2,`i32`],[`GRASS_MAX_Y`,62,`i32`],[`CAVE_MIN_Y`,-40,`i32`],[`CAVE_MAX_Y`,20,`i32`],[`CAVE_MIN_DENSITY`,5,`f32`],[`DETAIL_AMPLITUDE`,4,`f32`],[`SURFACE_SEARCH`,6,`i32`],[`TREE_CELL`,8,`i32`],[`TREE_RADIUS`,2,`i32`],[`WORLD_MAX_Y`,Lt,`i32`],[`PEAK_Y`,70,`i32`],[`DETAIL_FADE_START`,28,`f32`],[`DETAIL_FADE_END`,64,`f32`],[`MAX_GPU_PALETTE`,32,`u32`],[`PARTICLE_RESTITUTION`,ue,`f32`],[`PARTICLE_FRICTION`,de,`f32`],...Qe.map((e,t)=>[`TEX_${e.toUpperCase()}`,t,`i32`])];function dn(e,t){switch(t){case`u32`:if(!Number.isInteger(e)||e<0||e>4294967295)throw RangeError(`bad u32 ${e}`);return`${e}u`;case`i32`:if(!Number.isInteger(e))throw RangeError(`bad i32 ${e}`);return e<0?`(${e}i)`:`${e}i`;case`f32`:return Number.isInteger(e)?`${e}.0`:`${e}`}}function fn(){let e=new Map;for(let t=0;t<32;t++){let n=G[a(t)];e.set(n,[...e.get(n)??[],t])}let t=[`fn blockRenderClass(block: u32) -> u32 {`,`  switch block {`];for(let[n,r]of e)n!==G.none&&t.push(`    case ${r.map(e=>`${e}u`).join(`, `)}: { return ${n}u; }`);return t.push(`    default: { return ${G.none}u; }`,`  }`,`}`),t.join(`
`)}function pn(){return[`// ---- generated by src/gpu/shader-prelude.ts ----`,...un.map(([e,t,n])=>`const ${e}: ${n} = ${dn(t,n)};`),fn(),nt(),``].join(`
`)}function K(e){return`${pn()}\n${e}`}function mn(e){return e>>4}function hn(e){return e&15}var gn=class{data=null;fill;constructor(e=0){this.fill=e}get(e){return this.data?this.data[e]:this.fill}set(e,t){if(!this.data){if(t===this.fill)return;this.data=new Uint8Array(N).fill(this.fill)}this.data[e]=t}reset(e){this.data=null,this.fill=e}get byteLength(){return this.data?this.data.byteLength:0}},_n=new Int8Array(32),vn=new Uint8Array(32),q=new Uint8Array(32);for(let e=0;e<32;e++)_n[e]=p(e),vn[e]=+!!m(e),q[e]=d(e);var yn=[...q.keys()].filter(e=>q[e]>0),J={Sky:0,Block:1},bn=[J.Sky,J.Block],xn=[1,-1,0,0,0,0],Sn=[0,0,1,-1,0,0],Cn=[0,0,0,0,1,-1],wn=3,Tn=[1,-1,32,-32,1024,-1024],En=class{chunks=[];index=new Int32Array(4096);level=new Uint8Array(4096);head=0;tail=0;push(e,t,n){if(this.tail===this.index.length){if(this.head>0&&this.head>=this.tail/2)this.index.copyWithin(0,this.head,this.tail),this.level.copyWithin(0,this.head,this.tail),this.chunks.copyWithin(0,this.head,this.tail),this.tail-=this.head,this.chunks.length=this.tail,this.head=0;else{let e=new Int32Array(this.index.length*2);e.set(this.index),this.index=e;let t=new Uint8Array(this.level.length*2);t.set(this.level),this.level=t}}this.chunks[this.tail]=e,this.index[this.tail]=t,this.level[this.tail]=n,this.tail++}get empty(){return this.head===this.tail}clear(){this.head=0,this.tail=0,this.chunks.length=0}};function Dn(e,t,n){let r=e.light.get(t);return n===J.Sky?r>>4:r&15}function On(e,t,n,r){let i=_n[t];return i<0?0:n===J.Sky&&r===wn&&e===15&&vn[t]?15:Math.max(0,e-1-i)}var kn=class{world;add=[new En,new En];remove=[new En,new En];work=0;constructor(e){this.world=e}write(e,t,n,r){let i=e.light.get(t),a=n===J.Sky?i&15|r<<4:i&240|r;a!==i&&(e.light.set(t,a),this.world.lightChanged(e,t&31,t>>5&31,t>>10))}step(e,t,n,r){let i=t&31,a=t>>5&31,o=t>>10,s=i+xn[n],c=a+Sn[n],l=o+Cn[n];if((s|c|l)>=0&&s<32&&c<32&&l<32)return r.chunk=e,r.index=t+Tn[n],!0;let u=this.world.chunkAt(e.cx+xn[n],e.cy+Sn[n],e.cz+Cn[n]);return!u||!u.lit||!u.data?!1:(r.chunk=u,r.index=s&31|(c&31)<<5|(l&31)<<10,!0)}cursor={chunk:null,index:0};propagate(){for(let e of bn){let t=this.remove[e],n=this.add[e],r=this.cursor;for(;t.head<t.tail;){let i=t.chunks[t.head],a=t.index[t.head],o=t.level[t.head];t.head++,this.work++;for(let s=0;s<6;s++){if(!this.step(i,a,s,r))continue;let c=Dn(r.chunk,r.index,e);if(c!==0){if(c<o||e===J.Sky&&s===wn&&o===15&&c===15){if(this.write(r.chunk,r.index,e,0),t.push(r.chunk,r.index,c),e===J.Block){let t=q[r.chunk.data.get(r.index)];t>0&&(this.write(r.chunk,r.index,e,t),n.push(r.chunk,r.index,t))}}else n.push(r.chunk,r.index,c)}}}for(t.clear();n.head<n.tail;){let t=n.chunks[n.head],i=n.index[n.head];n.head++;let a=Dn(t,i,e);if(!(a<=1)){this.work++;for(let o=0;o<6;o++){if(!this.step(t,i,o,r))continue;let s=On(a,r.chunk.data.get(r.index),e,o);s>Dn(r.chunk,r.index,e)&&(this.write(r.chunk,r.index,e,s),n.push(r.chunk,r.index,s))}}}n.clear()}}lightChunk(e){let t=e.data;if(!t)throw Error(`cannot light a chunk without voxel data`);let n=e.cy>=this.world.maxChunkY?null:this.world.chunkAt(e.cx,e.cy+1,e.cz),r=e.cy>=this.world.maxChunkY,i=n&&n.lit&&n.data?n:null,a=t.uniformBlock(),o=e.light;o.reset(0),e.lit=!0;let s=r||i!==null&&i.light.data===null&&i.light.fill===240;if(a>=0&&s&&vn[a]?o.reset(240):(a<0||_n[a]>=0)&&this.skyColumns(e,r,i),yn.some(e=>t.countOf(e)>0))for(let n=0;n<N;n++){let r=q[t.get(n)];r>0&&(this.write(e,n,J.Block,r),this.add[J.Block].push(e,n,r))}this.exchangeBorders(e),this.propagate()}skyColumns(e,t,n){let r=e.data,i=e.light,a=this.add[J.Sky],o=new Int8Array(1024).fill(32);for(let s=0;s<32;s++)for(let c=0;c<32;c++){let l=t?15:0;if(n&&(l=n.light.get(c|s<<10)>>4),l===0||l<15)continue;let u=31;for(;u>=0;u--){let e=c|u<<5|s<<10;if(!vn[r.get(e)])break;i.set(e,240)}o[c+s*32]=u+1,u>=0&&u+1<32&&a.push(e,c|u+1<<5|s<<10,15)}for(let t=0;t<32;t++)for(let n=0;n<32;n++){let r=o[n+t*32],i=r;n>0&&(i=Math.max(i,o[n-1+t*32])),n<31&&(i=Math.max(i,o[n+1+t*32])),t>0&&(i=Math.max(i,o[n+(t-1)*32])),t<31&&(i=Math.max(i,o[n+(t+1)*32]));for(let o=r;o<i&&o<32;o++)a.push(e,n|o<<5|t<<10,15)}}exchangeBorders(e){for(let t=0;t<6;t++){let n=this.world.chunkAt(e.cx+xn[t],e.cy+Sn[t],e.cz+Cn[t]);if(!n||!n.lit||!n.data)continue;let r=t>>1,i=!(t&1),a=i?31:0,o=i?0:31,s=t^1;for(let i=0;i<32;i++)for(let c=0;c<32;c++){let l,u;r===0?(l=a|c<<5|i<<10,u=o|c<<5|i<<10):r===1?(l=c|a<<5|i<<10,u=c|o<<5|i<<10):(l=c|i<<5|a<<10,u=c|i<<5|o<<10);let d=e.light.get(l),f=n.light.get(u);if(d===f&&d===0)continue;let p=e.data.get(l),m=n.data.get(u);for(let r of bn){let i=r===J.Sky?d>>4:d&15,a=r===J.Sky?f>>4:f&15;i>1&&On(i,m,r,t)>a&&this.add[r].push(e,l,i),a>1&&On(a,p,r,s)>i&&this.add[r].push(n,u,a)}}}}blockChanged(e,t,n){if(!e.lit||!e.data)return;let r=e.data.get(t);if(r===n)return;let i=this.cursor;for(let n of bn){let a=Dn(e,t,n);if(a>0&&(this.write(e,t,n,0),this.remove[n].push(e,t,a)),n===J.Block&&q[r]>0&&(this.write(e,t,n,q[r]),this.add[n].push(e,t,q[r])),_n[r]>=0){for(let r=0;r<6;r++){if(!this.step(e,t,r,i))continue;let a=Dn(i.chunk,i.index,n);a>0&&this.add[n].push(i.chunk,i.index,a)}n===J.Sky&&e.cy>=this.world.maxChunkY&&(t>>5&31)==31&&vn[r]&&(this.write(e,t,n,15),this.add[n].push(e,t,15))}}this.propagate()}};function An(e,t=new Uint8Array(Fe)){let n=L;for(let r=0;r<n;r++){let i=r===0?-1:+(r===n-1),a=r-1&31;for(let o=0;o<n;o++){let s=o===0?-1:+(o===n-1),c=o-1&31,l=(r*n+o)*n,u=c<<5|a<<10,d=(s+1)*3+(i+1)*9,f=e[d],p=e[d+1],m=e[d+2];t[l]=f?f.get(u|31):240,p?p.data?t.set(p.data.subarray(u,u+32),l+1):t.fill(p.fill,l+1,l+1+32):t.fill(240,l+1,l+1+32),t[l+n-1]=m?m.get(u):240}}return t}var jn=`// Gather pass: decodes the palette-compressed voxel slots of a chunk and its 26 neighbours into a
// dense 34³ volume (8 bits per voxel, 4 voxels per word) for the mesher.
// Dispatch: (ceil(PADDED_WORDS / 64), jobCount, 1).

@group(0) @binding(0) var<storage, read> voxels: array<u32>;
@group(0) @binding(1) var<storage, read> jobs: array<u32>;
@group(0) @binding(2) var<storage, read_write> padded: array<u32>;

fn readVoxel(slot: u32, index: u32) -> u32 {
  if (slot == NO_SLOT) {
    return BLOCK_AIR;
  }
  let base = slot * SLOT_WORDS;
  let bits = voxels[base];
  if (bits == 0u) {
    return voxels[base + GPU_PALETTE_OFFSET];
  }
  let bitIndex = index * bits;
  let word = voxels[base + GPU_DATA_OFFSET + (bitIndex >> 5u)];
  let paletteIndex = (word >> (bitIndex & 31u)) & ((1u << bits) - 1u);
  return voxels[base + GPU_PALETTE_OFFSET + paletteIndex];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = gid.x;
  if (w >= PADDED_WORDS) {
    return;
  }
  let jobBase = gid.y * MESH_JOB_WORDS;
  var packed = 0u;
  for (var k = 0u; k < 4u; k++) {
    let p = w * 4u + k;
    if (p < PADDED_VOLUME) {
      let padPos = vec3<u32>(p % PADDED_SIZE, (p / PADDED_SIZE) % PADDED_SIZE, p / (PADDED_SIZE * PADDED_SIZE));
      let l = vec3<i32>(padPos) - vec3<i32>(1);
      let d = select(vec3<i32>(0), vec3<i32>(-1), l < vec3<i32>(0)) +
              select(vec3<i32>(0), vec3<i32>(1), l >= vec3<i32>(CHUNK_SIZE_I));
      let neighbor = u32((d.x + 1) + (d.y + 1) * 3 + (d.z + 1) * 9);
      let slot = jobs[jobBase + MESH_JOB_NEIGHBOR_OFFSET + neighbor];
      let local = vec3<u32>(l - d * CHUNK_SIZE_I);
      let block = readVoxel(slot, local.x | (local.y << 5u) | (local.z << 10u));
      packed |= (block & 0xffu) << (k * 8u);
    }
  }
  padded[gid.y * PADDED_WORDS + w] = packed;
}
`,Mn=`// GPU greedy mesher with face culling, per-vertex ambient occlusion and smooth voxel lighting.
//
// Dispatch: (32 slices, 6 face directions, jobCount); one workgroup = one 32×32 slice of one face
// direction of one chunk, one invocation per row (phase 1) and per column (phase 2).
//
//  Phase 1  Each invocation walks its row, computes the face key of every cell and records maximal
//           runs of equal keys into workgroup memory at the run's start cell. A key has two words:
//             x: block id | four 2-bit corner AO levels << 5   (| run length << 16 in \`runs\`)
//             y: four corner light bytes (skylight << 4 | block light), smoothed over the four
//                voxels around each corner on the face's outer side.
//  Phase 2  Each invocation owns one run-start column and merges vertically adjacent runs with
//           identical start, length and key into a single quad.
//
// Quads are appended to the chunk's fixed-capacity region of one of three vertex pools (opaque,
// water, cutout) through atomic counters, and the matching drawIndexedIndirect record's indexCount
// is bumped atomically. Each pool keeps one light word per quad after its vertex region. Cross
// plants and torches are emitted as two diagonal quads by the +X workgroups. The same algorithm is
// implemented on the CPU in src/world/mesher.ts.

@group(0) @binding(0) var<storage, read> padded: array<u32>;
@group(0) @binding(1) var<storage, read> jobs: array<u32>;
@group(0) @binding(2) var<storage, read_write> opaqueVertices: array<u32>;
@group(0) @binding(3) var<storage, read_write> waterVertices: array<u32>;
@group(0) @binding(4) var<storage, read_write> cutoutVertices: array<u32>;
// drawIndexedIndirect records: MESH_POOLS per slot, pool order opaque, water, cutout.
@group(0) @binding(5) var<storage, read_write> indirectArgs: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> counters: array<atomic<u32>>;
// Padded (34³) light volumes uploaded by the CPU light engine, same layout as \`padded\`.
@group(0) @binding(7) var<storage, read> paddedLight: array<u32>;

// Number of mesh slots in the pools (the light words start after MESH_SLOTS * VERTEX_CAPACITY).
override MESH_SLOTS: u32 = 1u;

const KEY_AO_SHIFT: u32 = 5u;
const AO_OPEN_KEY: u32 = 0x1fe0u; // all four corners unoccluded (level 3)

var<workgroup> runs: array<vec2<u32>, 1024>;
var<private> paddedBase: u32;

fn paddedIndexOf(p: vec3<i32>) -> u32 {
  return u32((p.x + 1) + PADDED_SIZE_I * ((p.y + 1) + PADDED_SIZE_I * (p.z + 1)));
}

// Voxel at chunk-local coordinates in [-1, 32].
fn sampleVoxel(p: vec3<i32>) -> u32 {
  let idx = paddedIndexOf(p);
  return (padded[paddedBase + (idx >> 2u)] >> ((idx & 3u) * 8u)) & 0xffu;
}

// Light byte (sky << 4 | block) at chunk-local coordinates in [-1, 32].
fn sampleLight(p: vec3<i32>) -> u32 {
  let idx = paddedIndexOf(p);
  return (paddedLight[paddedBase + (idx >> 2u)] >> ((idx & 3u) * 8u)) & 0xffu;
}

fn isOpaqueBlock(b: u32) -> bool {
  return blockRenderClass(b) == RC_OPAQUE;
}

fn isWaterBlock(b: u32) -> bool {
  return b == BLOCK_WATER || (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FALLING);
}

// Water surface height in eighths (8 = full cell).
fn waterSurface(b: u32) -> u32 {
  if (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FLOW7) {
    return 8u - (b - BLOCK_WATER_FLOW1 + 1u);
  }
  return select(0u, 8u, isWaterBlock(b));
}

// Mirrors isFaceVisible() in src/world/block.ts.
fn isFaceVisible(block: u32, neighbor: u32, dir: u32) -> bool {
  let cls = blockRenderClass(block);
  if (cls == RC_OPAQUE) {
    return !isOpaqueBlock(neighbor);
  }
  if (cls == RC_CUTOUT) {
    return !isOpaqueBlock(neighbor) && neighbor != block;
  }
  if (cls == RC_WATER) {
    if (neighbor == BLOCK_AIR || blockRenderClass(neighbor) == RC_CROSS) {
      return true;
    }
    if (isWaterBlock(neighbor)) {
      return dir != 2u && dir != 3u && waterSurface(neighbor) < waterSurface(block);
    }
    return dir == 2u && waterSurface(block) < 8u;
  }
  return false;
}

fn occluder(p: vec3<i32>) -> u32 {
  return select(0u, 1u, isOpaqueBlock(sampleVoxel(p)));
}

fn axisVector(axis: u32) -> vec3<i32> {
  var v = vec3<i32>(0, 0, 0);
  v[axis] = 1;
  return v;
}

// Rounded mean of \`sum\` over \`n\` samples.
fn roundedMean(sum: u32, n: u32) -> u32 {
  return (sum * 2u + n) / (n * 2u);
}

fn faceKey(dir: u32, s: i32, i: i32, j: i32) -> vec2<u32> {
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  var p = vec3<i32>(0, 0, 0);
  p[a] = s;
  p[u] = i;
  p[v] = j;
  let block = sampleVoxel(p);
  if (block == BLOCK_AIR) {
    return vec2<u32>(0u, 0u);
  }
  let q = p + axisVector(a) * select(1, -1, (dir & 1u) == 1u);
  let neighbor = sampleVoxel(q);
  if (!isFaceVisible(block, neighbor, dir)) {
    return vec2<u32>(0u, 0u);
  }
  let U = axisVector(u);
  let V = axisVector(v);
  let water = isWaterBlock(block);
  var key = block;
  if (water) {
    key |= AO_OPEN_KEY;
  }
  var light = 0u;
  let lq = sampleLight(q);
  for (var c = 0u; c < 4u; c++) {
    let du = select(-1, 1, c == 1u || c == 2u);
    let dv = select(-1, 1, c >= 2u);
    let side1 = occluder(q + U * du);
    let side2 = occluder(q + V * dv);
    let corner = occluder(q + U * du + V * dv);
    if (!water) {
      let ao = select(3u - (side1 + side2 + corner), 0u, side1 == 1u && side2 == 1u);
      key |= ao << (KEY_AO_SHIFT + c * 2u);
    }
    // Smooth light: average of the transparent voxels around the corner.
    var sky = lq >> 4u;
    var blk = lq & 15u;
    var n = 1u;
    if (side1 == 0u) {
      let l = sampleLight(q + U * du);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    if (side2 == 0u) {
      let l = sampleLight(q + V * dv);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    if (corner == 0u && !(side1 == 1u && side2 == 1u)) {
      let l = sampleLight(q + U * du + V * dv);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    light |= ((roundedMean(sky, n) << 4u) | roundedMean(blk, n)) << (c * 8u);
  }
  return vec2<u32>(key, light);
}

fn poolCapacity(pool: u32) -> vec2<u32> {
  if (pool == 1u) {
    return vec2<u32>(WATER_QUAD_CAPACITY, WATER_VERTEX_CAPACITY);
  }
  if (pool == 2u) {
    return vec2<u32>(CUTOUT_QUAD_CAPACITY, CUTOUT_VERTEX_CAPACITY);
  }
  return vec2<u32>(OPAQUE_QUAD_CAPACITY, OPAQUE_VERTEX_CAPACITY);
}

// Reserves a quad in \`pool\`; returns the first vertex index, or 0xffffffff when full.
fn reserveQuad(slot: u32, pool: u32) -> u32 {
  let quad = atomicAdd(&counters[slot * MESH_COUNTER_WORDS + pool], 1u);
  let cap = poolCapacity(pool);
  if (quad >= cap.x) {
    return 0xffffffffu; // Slot full: the overflow is visible to the CPU through the counter.
  }
  atomicAdd(&indirectArgs[(slot * MESH_POOLS + pool) * INDIRECT_ARGS_WORDS], 6u);
  return slot * cap.y + quad * 4u;
}

fn writeWord(pool: u32, index: u32, value: u32) {
  if (pool == 0u) {
    opaqueVertices[index] = value;
  } else if (pool == 1u) {
    waterVertices[index] = value;
  } else {
    cutoutVertices[index] = value;
  }
}

// Light word of the quad whose first vertex is \`base\`.
fn writeQuadLight(pool: u32, base: u32, light: u32) {
  writeWord(pool, MESH_SLOTS * poolCapacity(pool).y + (base >> 2u), light);
}

fn poolOf(block: u32) -> u32 {
  let cls = blockRenderClass(block);
  if (cls == RC_WATER) {
    return 1u;
  }
  if (cls == RC_CUTOUT || cls == RC_CROSS) {
    return 2u;
  }
  return 0u;
}

fn packVertex(p: vec3<u32>, face: u32, ao: u32, block: u32) -> u32 {
  return p.x | (p.y << 6u) | (p.z << 12u) | (face << 18u) | (ao << 21u) | (block << 23u);
}

fn emitQuad(slot: u32, dir: u32, s: u32, i: u32, j: u32, w: u32, h: u32, key: vec2<u32>) {
  let block = key.x & 31u;
  let pool = poolOf(block);
  let base = reserveQuad(slot, pool);
  if (base == 0xffffffffu) {
    return;
  }
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  let negative = (dir & 1u) == 1u;
  let plane = select(s + 1u, s, negative);
  let ao = vec4<u32>(
    (key.x >> KEY_AO_SHIFT) & 3u,
    (key.x >> (KEY_AO_SHIFT + 2u)) & 3u,
    (key.x >> (KEY_AO_SHIFT + 4u)) & 3u,
    (key.x >> (KEY_AO_SHIFT + 6u)) & 3u,
  );
  // Rotate the quad so its shared diagonal joins the brighter corners (AO anisotropy fix).
  let rotate = select(0u, 1u, ao.x + ao.z < ao.y + ao.w);
  var light = 0u;
  for (var k = 0u; k < 4u; k++) {
    let order = (k + rotate) & 3u;
    // Positive faces: (0,0) (1,0) (1,1) (0,1); negative faces reverse the winding.
    let corner = select(order, (4u - order) & 3u, negative);
    let cu = select(0u, 1u, corner == 1u || corner == 2u);
    let cv = select(0u, 1u, corner >= 2u);
    var pos = vec3<u32>(0u, 0u, 0u);
    pos[a] = plane;
    pos[u] = i + cu * w;
    pos[v] = j + cv * h;
    writeWord(pool, base + k, packVertex(pos, dir, ao[corner], block));
    light |= ((key.y >> (corner * 8u)) & 0xffu) << (k * 8u);
  }
  writeQuadLight(pool, base, light);
}

// Two diagonal quads (face codes 6 and 7) for a cross plant or torch at cell p. Mirrors emitCross().
fn emitCross(slot: u32, p: vec3<u32>, block: u32) {
  let l = sampleLight(vec3<i32>(p));
  let light = l | (l << 8u) | (l << 16u) | (l << 24u);
  let a = reserveQuad(slot, 2u);
  if (a != 0xffffffffu) {
    writeWord(2u, a, packVertex(p, 6u, 3u, block));
    writeWord(2u, a + 1u, packVertex(p + vec3<u32>(1u, 0u, 1u), 6u, 3u, block));
    writeWord(2u, a + 2u, packVertex(p + vec3<u32>(1u, 1u, 1u), 6u, 3u, block));
    writeWord(2u, a + 3u, packVertex(p + vec3<u32>(0u, 1u, 0u), 6u, 3u, block));
    writeQuadLight(2u, a, light);
  }
  let b = reserveQuad(slot, 2u);
  if (b != 0xffffffffu) {
    writeWord(2u, b, packVertex(p + vec3<u32>(1u, 0u, 0u), 7u, 3u, block));
    writeWord(2u, b + 1u, packVertex(p + vec3<u32>(0u, 0u, 1u), 7u, 3u, block));
    writeWord(2u, b + 2u, packVertex(p + vec3<u32>(0u, 1u, 1u), 7u, 3u, block));
    writeWord(2u, b + 3u, packVertex(p + vec3<u32>(1u, 1u, 0u), 7u, 3u, block));
    writeQuadLight(2u, b, light);
  }
}

@compute @workgroup_size(32)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) t: u32) {
  let s = wg.x;
  let dir = wg.y;
  let job = wg.z;
  paddedBase = job * PADDED_WORDS;
  let slot = jobs[job * MESH_JOB_WORDS];

  // Phase 1: maximal runs of identical face keys along row t.
  for (var i = 0u; i < CHUNK_SIZE; i++) {
    runs[t * CHUNK_SIZE + i] = vec2<u32>(0u, 0u);
  }
  var runKey = vec2<u32>(0u, 0u);
  var runStart = 0u;
  for (var i = 0u; i <= CHUNK_SIZE; i++) {
    var key = vec2<u32>(0u, 0u);
    if (i < CHUNK_SIZE) {
      key = faceKey(dir, i32(s), i32(i), i32(t));
      // +X workgroups also emit cross plants of their slice (cell x = s, y = i, z = t).
      if (dir == 0u) {
        let cell = vec3<u32>(s, i, t);
        let block = sampleVoxel(vec3<i32>(cell));
        if (blockRenderClass(block) == RC_CROSS) {
          emitCross(slot, cell, block);
        }
      }
    }
    if (any(key != runKey)) {
      if (runKey.x != 0u) {
        runs[t * CHUNK_SIZE + runStart] = vec2<u32>(runKey.x | ((i - runStart) << 16u), runKey.y);
      }
      runKey = key;
      runStart = i;
    }
  }
  workgroupBarrier();

  // Phase 2: merge identical runs that start in column t down the slice.
  var open = vec2<u32>(0u, 0u);
  var startJ = 0u;
  for (var j = 0u; j <= CHUNK_SIZE; j++) {
    var r = vec2<u32>(0u, 0u);
    if (j < CHUNK_SIZE) {
      r = runs[j * CHUNK_SIZE + t];
    }
    if (open.x != 0u && all(r == open)) {
      continue;
    }
    if (open.x != 0u) {
      emitQuad(slot, dir, s, t, startJ, open.x >> 16u, j - startJ, vec2<u32>(open.x & 0xffffu, open.y));
    }
    open = r;
    startJ = j;
  }
}
`,Nn=`// World generation compute pass (mirrors src/world/terrain.ts).
// One invocation fills one 32-bit word of a chunk's voxel slot = 4 voxels along X at 8 bits each,
// using an identity palette (palette index == block id). Dispatch: (128, jobCount, 1).
// ---- begin climate.wgsl ----
// Climate model shared by world generation and terrain shading. Mirrors src/world/terrain.ts.
// ---- begin noise.wgsl ----
// Deterministic hashed-gradient simplex noise. Mirrors src/world/noise.ts exactly.

fn hash3(x: i32, y: i32, z: i32, seed: u32) -> u32 {
  var h = seed ^ (bitcast<u32>(x) * 0x8da6b343u) ^ (bitcast<u32>(y) * 0xd8163841u) ^ (bitcast<u32>(z) * 0xcb1ab31fu);
  h = h ^ (h >> 16u);
  h = h * 0x85ebca6bu;
  h = h ^ (h >> 13u);
  h = h * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  return h;
}

fn grad3(hash: u32, x: f32, y: f32, z: f32) -> f32 {
  let h = hash & 15u;
  let u = select(y, x, h < 8u);
  let v = select(select(z, x, h == 12u || h == 14u), y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-v, v, (h & 2u) == 0u);
}

fn grad2(hash: u32, x: f32, y: f32) -> f32 {
  let h = hash & 7u;
  let u = select(y, x, h < 4u);
  let v = select(x, y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-2.0 * v, 2.0 * v, (h & 2u) == 0u);
}

const RIDGE_SOFTNESS: f32 = 0.1;
const NOISE_F2: f32 = 0.3660254037844386;
const NOISE_G2: f32 = 0.21132486540518713;
const NOISE_F3: f32 = 0.3333333333333333;
const NOISE_G3: f32 = 0.16666666666666666;

fn simplex2(x: f32, y: f32, seed: u32) -> f32 {
  let s = (x + y) * NOISE_F2;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let t = (fi + fj) * NOISE_G2;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let i = i32(fi);
  let j = i32(fj);
  let i1 = select(0, 1, x0 > y0);
  let j1 = 1 - i1;
  let x1 = x0 - f32(i1) + NOISE_G2;
  let y1 = y0 - f32(j1) + NOISE_G2;
  let x2 = x0 - 1.0 + 2.0 * NOISE_G2;
  let y2 = y0 - 1.0 + 2.0 * NOISE_G2;
  var n = 0.0;
  var t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad2(hash3(i, j, 0, seed), x0, y0);
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0.0) {
    t1 = t1 * t1;
    n += t1 * t1 * grad2(hash3(i + i1, j + j1, 0, seed), x1, y1);
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0.0) {
    t2 = t2 * t2;
    n += t2 * t2 * grad2(hash3(i + 1, j + 1, 0, seed), x2, y2);
  }
  return 40.0 * n;
}

fn simplex3(x: f32, y: f32, z: f32, seed: u32) -> f32 {
  let s = (x + y + z) * NOISE_F3;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let fk = floor(z + s);
  let t = (fi + fj + fk) * NOISE_G3;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let z0 = z - (fk - t);
  var o1 = vec3<i32>(0, 0, 0);
  var o2 = vec3<i32>(0, 0, 0);
  if (x0 >= y0) {
    if (y0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 1, 0); }
    else if (x0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 0, 1); }
    else { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(1, 0, 1); }
  } else {
    if (y0 < z0) { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(0, 1, 1); }
    else if (x0 < z0) { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(0, 1, 1); }
    else { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(1, 1, 0); }
  }
  let p0 = vec3<f32>(x0, y0, z0);
  let p1 = p0 - vec3<f32>(o1) + vec3<f32>(NOISE_G3);
  let p2 = p0 - vec3<f32>(o2) + vec3<f32>(2.0 * NOISE_G3);
  let p3 = p0 - vec3<f32>(1.0) + vec3<f32>(3.0 * NOISE_G3);
  let c = vec3<i32>(i32(fi), i32(fj), i32(fk));
  var n = 0.0;
  var t0 = 0.6 - dot(p0, p0);
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad3(hash3(c.x, c.y, c.z, seed), p0.x, p0.y, p0.z);
  }
  var t1 = 0.6 - dot(p1, p1);
  if (t1 > 0.0) {
    t1 = t1 * t1;
    let q = c + o1;
    n += t1 * t1 * grad3(hash3(q.x, q.y, q.z, seed), p1.x, p1.y, p1.z);
  }
  var t2 = 0.6 - dot(p2, p2);
  if (t2 > 0.0) {
    t2 = t2 * t2;
    let q = c + o2;
    n += t2 * t2 * grad3(hash3(q.x, q.y, q.z, seed), p2.x, p2.y, p2.z);
  }
  var t3 = 0.6 - dot(p3, p3);
  if (t3 > 0.0) {
    t3 = t3 * t3;
    let q = c + vec3<i32>(1, 1, 1);
    n += t3 * t3 * grad3(hash3(q.x, q.y, q.z, seed), p3.x, p3.y, p3.z);
  }
  return 32.0 * n;
}

fn fbm2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    sum += amp * simplex2(x * freq, y * freq, seed + o);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// Ridged multifractal with rounded crests (mirrors ridged2 in src/world/noise.ts).
fn ridged2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    let n = simplex2(x * freq, y * freq, seed + o);
    let r = max(0.0, 1.0 - sqrt(n * n + RIDGE_SOFTNESS * RIDGE_SOFTNESS));
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// ---- end noise.wgsl ----

const BIOME_PLAINS: u32 = 0u;
const BIOME_DESERT: u32 = 1u;
const BIOME_SNOWY: u32 = 2u;
const BIOME_FOREST: u32 = 3u;

fn temperatureAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0011, z * 0.0011, 3u, seed + 501u);
}

fn humidityAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0013, z * 0.0013, 3u, seed + 502u);
}

// Smooth biome weights (plains, desert, snowy, forest); non-negative and summing to 1.
fn biomeWeights(temperature: f32, humidity: f32) -> vec4<f32> {
  let cold = 1.0 - smoothstep(-0.28, -0.12, temperature);
  let hot = smoothstep(0.1, 0.26, temperature);
  let dry = 1.0 - smoothstep(-0.08, 0.06, humidity);
  let wet = smoothstep(0.06, 0.2, humidity);
  let desert = hot * dry * (1.0 - cold);
  let snowy = cold;
  let forest = (1.0 - cold) * (1.0 - desert) * wet;
  let plains = max(0.0, 1.0 - desert - snowy - forest);
  return vec4<f32>(plains, desert, snowy, forest);
}

fn dominantBiome(w: vec4<f32>) -> u32 {
  var best = 0u;
  var bestWeight = w.x;
  if (w.y > bestWeight) { best = 1u; bestWeight = w.y; }
  if (w.z > bestWeight) { best = 2u; bestWeight = w.z; }
  if (w.w > bestWeight) { best = 3u; }
  return best;
}

// Procedural grass/foliage palette: bilinear over (temperature, humidity), darker in forests.
fn grassTint(temperature: f32, humidity: f32) -> vec3<f32> {
  let t = clamp(temperature * 1.6 + 0.5, 0.0, 1.0);
  let h = clamp(humidity * 1.6 + 0.5, 0.0, 1.0);
  let cold = mix(vec3<f32>(0.46, 0.6, 0.42), vec3<f32>(0.3, 0.5, 0.36), h);
  let hot = mix(vec3<f32>(0.72, 0.66, 0.3), vec3<f32>(0.28, 0.62, 0.14), h);
  let forest = biomeWeights(temperature, humidity).w;
  let shade = 1.0 - 0.3 * forest;
  return mix(cold, hot, t) * shade;
}

// ---- end climate.wgsl ----

struct GenParams {
  seed: u32,
  jobCount: u32,
  pad0: u32,
  pad1: u32,
}

struct GenJob {
  chunk: vec3<i32>,
  slot: u32,
}

@group(0) @binding(0) var<uniform> params: GenParams;
@group(0) @binding(1) var<storage, read> jobs: array<GenJob>;
@group(0) @binding(2) var<storage, read_write> voxels: array<u32>;

// Per-workgroup caches: target height and biome of the 32 columns of this z row, and the trees of
// the four TREE_CELL-wide cells those columns fall into (a workgroup never straddles a cell in z).
var<workgroup> columnTarget: array<f32, 32>;
var<workgroup> columnBiome: array<u32, 32>;
var<workgroup> treeData: array<vec4<i32>, 4>; // x, z, base, top (base = TREE_NONE when absent)
var<workgroup> treeKind: array<u32, 4>;

const TREE_NONE: i32 = -100000;
const TREE_OAK: u32 = 0u;
const TREE_BIRCH: u32 = 1u;
const TREE_PINE: u32 = 2u;
const TREE_CACTUS: u32 = 3u;

struct Column {
  target_height: f32,
  biome: u32,
}

fn continentalHeight(c: f32) -> f32 {
  var cs = array<f32, 8>(-1.0, -0.4, -0.15, -0.04, 0.1, 0.35, 0.6, 1.0);
  var hs = array<f32, 8>(-38.0, -22.0, -6.0, 1.0, 5.0, 12.0, 20.0, 28.0);
  var h = hs[0];
  for (var i = 0; i < 7; i++) {
    let c0 = cs[i];
    let c1 = cs[i + 1];
    if (c >= c0) {
      h = hs[i] + (hs[i + 1] - hs[i]) * min((c - c0) / (c1 - c0), 1.0);
    }
  }
  return h;
}

fn column(x: f32, z: f32, seed: u32) -> Column {
  let w = biomeWeights(temperatureAt(x, z, seed), humidityAt(x, z, seed));
  let c = fbm2(x * 0.0022, z * 0.0022, 5u, seed);
  let erosion = fbm2(x * 0.0045, z * 0.0045, 3u, seed + 11u) * 0.5 + 0.5;
  let roughness = 1.0 - smoothstep(0.4, 0.75, erosion);
  let land = smoothstep(-0.12, 0.08, c);
  let hillAmp = w.x * 7.0 + w.y * 4.0 + w.z * 12.0 + w.w * 10.0;
  let hills = fbm2(x * 0.013, z * 0.013, 4u, seed + 22u) * hillAmp * (0.3 + 0.7 * roughness) * (0.35 + 0.65 * land);
  let ridge = ridged2(x * 0.0048, z * 0.0048, 4u, seed + 33u);
  let mountainAmp = 64.0 * (0.75 + 0.6 * w.z - 0.45 * w.y);
  let mountains = ridge * ridge * mountainAmp * smoothstep(0.18, 0.5, c) * roughness;
  let dunes = ridged2(x * 0.018, z * 0.03, 2u, seed + 44u) * 6.0 * w.y * land;
  return Column(continentalHeight(c) + hills + mountains + dunes, dominantBiome(w));
}

fn detailAmplitude(y: f32) -> f32 {
  return DETAIL_AMPLITUDE * (1.0 - 0.75 * smoothstep(DETAIL_FADE_START, DETAIL_FADE_END, y));
}

fn terrainDensity(x: i32, y: i32, z: i32, height: f32, seed: u32) -> f32 {
  let fy = f32(y);
  return height - fy + simplex3(f32(x) * 0.03, fy * 0.03, f32(z) * 0.03, seed + 45u) * detailAmplitude(fy);
}

fn isCave(x: i32, y: i32, z: i32, density: f32, seed: u32) -> bool {
  if (y < CAVE_MIN_Y || y > CAVE_MAX_Y || density <= CAVE_MIN_DENSITY) {
    return false;
  }
  let fy = f32(y);
  let fade = smoothstep(-40.0, -34.0, fy) * (1.0 - smoothstep(14.0, 20.0, fy));
  let px = f32(x) * 0.022;
  let py = fy * 0.034;
  let pz = f32(z) * 0.022;
  let w1 = simplex3(px, py, pz, seed + 55u) + 0.5 * simplex3(px * 2.0, py * 2.0, pz * 2.0, seed + 56u);
  let w2 = simplex3(px, py, pz, seed + 66u) + 0.5 * simplex3(px * 2.0, py * 2.0, pz * 2.0, seed + 67u);
  let ridge1 = 1.0 - abs(w1);
  let ridge2 = 1.0 - abs(w2);
  let threshold = 1.0 - 0.11 * fade;
  return ridge1 > threshold && ridge2 > threshold;
}

fn columnSurface(x: i32, z: i32, height: f32, seed: u32) -> i32 {
  let base = i32(floor(height));
  for (var y = base + SURFACE_SEARCH; y >= base - SURFACE_SEARCH; y--) {
    if (terrainDensity(x, y, z, height, seed) > 0.0) {
      return y;
    }
  }
  return base - SURFACE_SEARCH - 1;
}

fn surfaceHeight(x: i32, z: i32, seed: u32) -> i32 {
  return columnSurface(x, z, column(f32(x), f32(z), seed).target_height, seed);
}

fn surfaceBlock(y: i32, biome: u32) -> u32 {
  if (biome == BIOME_SNOWY) {
    return select(BLOCK_SNOW, BLOCK_STONE, y > PEAK_Y);
  }
  if (y <= BEACH_MAX_Y || biome == BIOME_DESERT) {
    return BLOCK_SAND;
  }
  if (y > GRASS_MAX_Y) {
    return BLOCK_STONE;
  }
  return BLOCK_GRASS;
}

// Mirrors treeInCell(): returns (x, z, base, top) and writes the kind; base = TREE_NONE if absent.
fn treeInCell(cellX: i32, cellZ: i32, seed: u32, kindOut: ptr<function, u32>) -> vec4<i32> {
  let none = vec4<i32>(0, 0, TREE_NONE, 0);
  let h = hash3(cellX, 1, cellZ, seed + 77u);
  let x = cellX * TREE_CELL + TREE_RADIUS + i32(h & 3u);
  let z = cellZ * TREE_CELL + TREE_RADIUS + i32((h >> 2u) & 3u);
  let col = column(f32(x), f32(z), seed);
  let biome = col.biome;
  var chance = array<u32, 4>(26u, 46u, 90u, 218u);
  if (((h >> 4u) & 255u) >= chance[biome]) {
    return none;
  }
  let base = columnSurface(x, z, col.target_height, seed);
  let ground = surfaceBlock(base, biome);
  var kind = TREE_OAK;
  if (biome == BIOME_DESERT) {
    if (ground != BLOCK_SAND || base <= BEACH_MAX_Y) {
      return none;
    }
    kind = TREE_CACTUS;
  } else if (biome == BIOME_SNOWY) {
    if (ground != BLOCK_SNOW || base <= BEACH_MAX_Y) {
      return none;
    }
    kind = TREE_PINE;
  } else {
    if (ground != BLOCK_GRASS) {
      return none;
    }
    if (biome == BIOME_FOREST && ((h >> 20u) & 1u) == 1u) {
      kind = TREE_BIRCH;
    }
  }
  var heights = array<i32, 4>(4, 5, 6, 2);
  let variation = select(3u, 4u, kind == TREE_PINE);
  let top = base + heights[kind] + i32((h >> 12u) % variation);
  if (top + 3 > WORLD_MAX_Y) {
    return none;
  }
  // Clearance: no cliff face may cut through the canopy.
  var offsets = array<vec2<i32>, 4>(
    vec2<i32>(TREE_RADIUS, 0), vec2<i32>(-TREE_RADIUS, 0), vec2<i32>(0, TREE_RADIUS), vec2<i32>(0, -TREE_RADIUS));
  for (var i = 0; i < 4; i++) {
    if (surfaceHeight(x + offsets[i].x, z + offsets[i].y, seed) > base + 2) {
      return none;
    }
  }
  *kindOut = kind;
  return vec4<i32>(x, z, base, top);
}

fn treeBlock(x: i32, y: i32, z: i32, tree: vec4<i32>, kind: u32, seed: u32) -> u32 {
  if (tree.z == TREE_NONE) {
    return BLOCK_AIR;
  }
  let dx = abs(x - tree.x);
  let dz = abs(z - tree.y);
  if (dx == 0 && dz == 0 && y > tree.z && y <= tree.w) {
    var trunks = array<u32, 4>(BLOCK_WOOD, BLOCK_BIRCH_WOOD, BLOCK_PINE_WOOD, BLOCK_CACTUS);
    return trunks[kind];
  }
  let dy = y - tree.w;
  if (kind == TREE_CACTUS) {
    return BLOCK_AIR;
  }
  if (kind == TREE_PINE) {
    if (dy > 1 || y <= tree.z + 2) {
      return BLOCK_AIR;
    }
    let level = 1 - dy;
    var radius = select(2, 1, level % 2 == 0);
    if (level == 0) {
      radius = 0;
    } else if (level == 1) {
      radius = 1;
    }
    var inside = dx <= radius && dz <= radius && !(radius == 2 && dx == 2 && dz == 2);
    if (level == 1) {
      inside = dx + dz <= 1;
    }
    return select(BLOCK_AIR, BLOCK_PINE_LEAVES, inside);
  }
  if (dy >= -2 && dy <= -1 && dx <= 2 && dz <= 2) {
    let corner = dx == 2 && dz == 2;
    if (!corner || (hash3(x, y, z, seed + 88u) & 1u) == 0u) {
      return BLOCK_LEAVES;
    }
  }
  if (dy >= 0 && dy <= 1 && dx <= 1 && dz <= 1 && !(dy == 1 && dx == 1 && dz == 1)) {
    return BLOCK_LEAVES;
  }
  return BLOCK_AIR;
}

fn plantAt(x: i32, y: i32, z: i32, biome: u32, seed: u32) -> u32 {
  if (biome != BIOME_PLAINS && biome != BIOME_FOREST) {
    return BLOCK_AIR;
  }
  let r = hash3(x, y, z, seed + 333u) % 1000u;
  let grass = select(100u, 160u, biome == BIOME_PLAINS);
  let flowers = select(15u, 40u, biome == BIOME_PLAINS);
  if (r < grass) {
    return BLOCK_TALL_GRASS;
  }
  if (r < grass + flowers) {
    return select(BLOCK_YELLOW_FLOWER, BLOCK_RED_FLOWER, (r & 1u) == 0u);
  }
  return BLOCK_AIR;
}

fn terrainBlock(x: i32, y: i32, z: i32, height: f32, biome: u32, tree: vec4<i32>, kind: u32, seed: u32) -> u32 {
  let density = terrainDensity(x, y, z, height, seed);
  if (density <= 0.0) {
    let t = treeBlock(x, y, z, tree, kind, seed);
    if (t != BLOCK_AIR) {
      return t;
    }
    if (y <= SEA_LEVEL) {
      return select(BLOCK_WATER, BLOCK_ICE, biome == BIOME_SNOWY && y == SEA_LEVEL);
    }
    if (f32(y - 1) <= height + DETAIL_AMPLITUDE + 1.0 && terrainDensity(x, y - 1, z, height, seed) > 0.0 &&
        surfaceBlock(y - 1, biome) == BLOCK_GRASS) {
      return plantAt(x, y, z, biome, seed);
    }
    return BLOCK_AIR;
  }
  if (y <= WORLD_MIN_Y + i32(hash3(x, 0, z, seed + 99u) % 3u)) {
    return BLOCK_BEDROCK;
  }
  if (isCave(x, y, z, density, seed)) {
    return BLOCK_AIR;
  }
  if (terrainDensity(x, y + 1, z, height, seed) <= 0.0) {
    return surfaceBlock(y, biome);
  }
  let shallow = terrainDensity(x, y + 4, z, height, seed) <= 0.0;
  let sandy = y <= BEACH_MAX_Y || biome == BIOME_DESERT;
  if (shallow) {
    if (sandy) {
      return BLOCK_SAND;
    }
    return select(BLOCK_DIRT, BLOCK_STONE, y > GRASS_MAX_Y);
  }
  if (biome == BIOME_DESERT && terrainDensity(x, y + 9, z, height, seed) <= 0.0) {
    return BLOCK_SANDSTONE;
  }
  let fx = f32(x) * 0.04;
  let fy = f32(y) * 0.04;
  let fz = f32(z) * 0.04;
  if (f32(y) < -44.0 + simplex3(fx, fy, fz, seed + 111u) * 4.0) {
    return BLOCK_BASALT;
  }
  return BLOCK_STONE;
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let job = jobs[wg.y];
  let word = wg.x * 64u + li; // 0 .. 8191: 4 voxels along X per word
  let origin = job.chunk * CHUNK_SIZE_I;
  let lz = word >> 8u; // constant across the workgroup (64 words never straddle a z slice)
  let wz = origin.z + i32(lz);

  if (li < 32u) {
    let col = column(f32(origin.x + i32(li)), f32(wz), params.seed);
    columnTarget[li] = col.target_height;
    columnBiome[li] = col.biome;
  } else if (li < 36u) {
    let cellX = origin.x / TREE_CELL + i32(li - 32u);
    let cellZ = i32(floor(f32(wz) / f32(TREE_CELL)));
    var kind = 0u;
    treeData[li - 32u] = treeInCell(cellX, cellZ, params.seed, &kind);
    treeKind[li - 32u] = kind;
  }
  workgroupBarrier();

  let ly = (word >> 3u) & 31u;
  let lx0 = (word & 7u) * 4u;
  let cell = lx0 / u32(TREE_CELL);
  let tree = treeData[cell];
  let kind = treeKind[cell];
  var packed = 0u;
  for (var k = 0u; k < 4u; k++) {
    let lx = lx0 + k;
    let block = terrainBlock(origin.x + i32(lx), origin.y + i32(ly), wz, columnTarget[lx], columnBiome[lx], tree, kind, params.seed);
    packed |= block << (k * 8u);
  }
  let base = job.slot * SLOT_WORDS;
  voxels[base + GPU_DATA_OFFSET + word] = packed;

  // Header: 8 bits per index, identity palette.
  if (word < GPU_DATA_OFFSET) {
    var value = 0u;
    if (word == 0u) {
      value = 8u;
    } else if (word == 1u) {
      value = MAX_GPU_PALETTE;
    } else if (word >= GPU_PALETTE_OFFSET) {
      value = word - GPU_PALETTE_OFFSET;
    }
    voxels[base + word] = value;
  }
}
`,Y=jt*4,Pn=Re*4,Fn=ze*4,In=Be*4;function Ln(e,t){return(e*3+t)*20}var Rn=[Me,Ne,Pe],zn=Ie*4,Bn=At/64,Vn=Math.ceil(Ie/64);function Hn(e,t){let n=Math.min(e.maxStorageBufferBindingSize,e.maxBufferSize);return{voxelSlots:Math.max(1,Math.min(t.voxelSlots,Math.floor(n/Y))),meshSlots:Math.max(1,Math.min(t.meshSlots,Math.floor(n/Pn)))}}var Un=class e{device;config;genPipeline;gatherPipeline;meshPipeline;voxelPool;opaqueVertices;waterVertices;cutoutVertices;indirectArgs;counters;chunkOrigins;indexBuffer;padded;paddedLight;lightScratch=new Uint8Array(zn);genParams;genJobs;meshJobs;genJobData;meshJobData;argsReset=new Uint32Array(15);counterReset=new Uint32Array(3);originData=new Int32Array(4);uploadScratch=new Uint32Array(jt);genBindGroup;gatherBindGroup;meshBindGroup;constructor(e,t,n,r,i){this.device=e,this.config=t,this.genPipeline=n,this.gatherPipeline=r,this.meshPipeline=i;let{voxelSlots:a,meshSlots:o,maxGenJobs:s,maxMeshJobs:c}=t,l=GPUBufferUsage.STORAGE;this.voxelPool=e.createBuffer({label:`voxel pool`,size:a*Y,usage:l|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),this.opaqueVertices=e.createBuffer({label:`opaque vertex pool`,size:o*Pn,usage:l}),this.waterVertices=e.createBuffer({label:`water vertex pool`,size:o*Fn,usage:l}),this.cutoutVertices=e.createBuffer({label:`cutout vertex pool`,size:o*In,usage:l}),this.indirectArgs=e.createBuffer({label:`indirect args`,size:o*3*20,usage:l|GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST}),this.counters=e.createBuffer({label:`mesh quad counters`,size:o*3*4,usage:l|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),this.chunkOrigins=e.createBuffer({label:`chunk origins`,size:o*16,usage:l|GPUBufferUsage.COPY_DST}),this.padded=e.createBuffer({label:`padded voxel scratch`,size:c*zn,usage:l}),this.paddedLight=e.createBuffer({label:`padded light volumes`,size:c*zn,usage:l|GPUBufferUsage.COPY_DST}),this.genParams=e.createBuffer({label:`worldgen params`,size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.genJobs=e.createBuffer({label:`worldgen jobs`,size:s*16,usage:l|GPUBufferUsage.COPY_DST}),this.meshJobs=e.createBuffer({label:`mesh jobs`,size:c*32*4,usage:l|GPUBufferUsage.COPY_DST}),this.genJobData=new Int32Array(s*4),this.meshJobData=new Uint32Array(c*32);let u=new Uint16Array(ke*6);for(let e=0;e<ke;e++)for(let t=0;t<6;t++)u[e*6+t]=e*4+De[t];this.indexBuffer=e.createBuffer({label:`quad indices`,size:u.byteLength,usage:GPUBufferUsage.INDEX,mappedAtCreation:!0}),new Uint16Array(this.indexBuffer.getMappedRange()).set(u),this.indexBuffer.unmap();let d=new Uint32Array(o*3*5);for(let e=0;e<o;e++)for(let t=0;t<3;t++){let n=(e*3+t)*5;d[n+1]=1,d[n+3]=e*Rn[t]}e.queue.writeBuffer(this.indirectArgs,0,d),e.queue.writeBuffer(this.genParams,0,new Uint32Array([t.seed>>>0,0,0,0])),this.genBindGroup=e.createBindGroup({label:`worldgen bind group`,layout:n.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.genParams}},{binding:1,resource:{buffer:this.genJobs}},{binding:2,resource:{buffer:this.voxelPool}}]}),this.gatherBindGroup=e.createBindGroup({label:`gather bind group`,layout:r.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.voxelPool}},{binding:1,resource:{buffer:this.meshJobs}},{binding:2,resource:{buffer:this.padded}}]}),this.meshBindGroup=e.createBindGroup({label:`mesh bind group`,layout:i.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.padded}},{binding:1,resource:{buffer:this.meshJobs}},{binding:2,resource:{buffer:this.opaqueVertices}},{binding:3,resource:{buffer:this.waterVertices}},{binding:4,resource:{buffer:this.cutoutVertices}},{binding:5,resource:{buffer:this.indirectArgs}},{binding:6,resource:{buffer:this.counters}},{binding:7,resource:{buffer:this.paddedLight}}]})}static async create(t,n){let[r,i,a]=await Promise.all([M(t,`worldgen.wgsl`,K(Nn)),M(t,`gather.wgsl`,K(jn)),M(t,`mesh.wgsl`,K(Mn))]),[o,s,c]=await Promise.all([t.createComputePipelineAsync({label:`worldgen`,layout:`auto`,compute:{module:r,entryPoint:`main`}}),t.createComputePipelineAsync({label:`gather`,layout:`auto`,compute:{module:i,entryPoint:`main`}}),t.createComputePipelineAsync({label:`greedy mesh`,layout:`auto`,compute:{module:a,entryPoint:`main`,constants:{MESH_SLOTS:n.meshSlots}}})]);return new e(t,n,o,s,c)}get allocatedBytes(){return this.voxelPool.size+this.opaqueVertices.size+this.waterVertices.size+this.cutoutVertices.size+this.indirectArgs.size+this.counters.size+this.chunkOrigins.size+this.padded.size+this.paddedLight.size+this.indexBuffer.size}encodeGeneration(e,t,n){if(t.length===0)return;if(t.length>this.config.maxGenJobs)throw RangeError(`too many generation jobs`);let r=this.genJobData;t.forEach((e,t)=>{r[t*4]=e.record.cx,r[t*4+1]=e.record.cy,r[t*4+2]=e.record.cz,r[t*4+3]=e.voxelSlot}),this.device.queue.writeBuffer(this.genJobs,0,r,0,t.length*4);let i=e.beginComputePass({label:`worldgen pass`});i.setPipeline(this.genPipeline),i.setBindGroup(0,this.genBindGroup),i.dispatchWorkgroups(Bn,t.length,1),i.end(),n&&t.forEach((t,r)=>{e.copyBufferToBuffer(this.voxelPool,t.voxelSlot*Y,n,r*Y,Y)})}encodeMeshing(e,t,n){if(t.length===0)return;if(t.length>this.config.maxMeshJobs)throw RangeError(`too many mesh jobs`);let r=this.device.queue,i=this.meshJobData;i.fill(0),t.forEach((e,t)=>{let n=e.meshSlot;i[t*32]=n,i.set(e.neighborSlots,t*32+4);for(let e=0;e<3;e++)this.argsReset.set([0,1,0,n*Rn[e],0],e*5);r.writeBuffer(this.indirectArgs,Ln(n,0),this.argsReset),r.writeBuffer(this.counters,n*3*4,this.counterReset),this.originData.set([e.record.cx*32,e.record.cy*32,e.record.cz*32,0]),r.writeBuffer(this.chunkOrigins,n*16,this.originData),An(e.neighborLight,this.lightScratch),r.writeBuffer(this.paddedLight,t*zn,this.lightScratch)}),r.writeBuffer(this.meshJobs,0,i,0,t.length*32);let a=e.beginComputePass({label:`gather pass`});a.setPipeline(this.gatherPipeline),a.setBindGroup(0,this.gatherBindGroup),a.dispatchWorkgroups(Vn,t.length,1),a.end();let o=e.beginComputePass({label:`greedy mesh pass`});o.setPipeline(this.meshPipeline),o.setBindGroup(0,this.meshBindGroup),o.dispatchWorkgroups(32,6,t.length),o.end(),n&&t.forEach((t,r)=>{e.copyBufferToBuffer(this.counters,t.meshSlot*3*4,n,r*3*4,12)})}uploadChunk(e,t){let n=t.writeGpuLayout(this.uploadScratch);this.device.queue.writeBuffer(this.voxelPool,e*Y,this.uploadScratch,0,n)}destroy(){for(let e of[this.voxelPool,this.opaqueVertices,this.waterVertices,this.cutoutVertices,this.indirectArgs,this.counters,this.chunkOrigins,this.indexBuffer,this.padded,this.paddedLight,this.genParams,this.genJobs,this.meshJobs])e.destroy()}},Wn=2048,Gn=class e{device;world;p;g;depthLayout;shadowViews;overlayBuffer;particleBuffer;simBuffer;textures;depthGroupView=null;depthGroup=null;overlayData=new Float32Array(8);simData=new ArrayBuffer(16);constructor(e,t,n,r,i,a,o,s,c,l){this.device=e,this.world=t,this.p=n,this.g=r,this.depthLayout=i,this.shadowViews=a,this.overlayBuffer=o,this.particleBuffer=s,this.simBuffer=c,this.textures=l}destroy(){for(let e of[this.overlayBuffer,this.particleBuffer,this.simBuffer])e.destroy();for(let e of this.textures)e.destroy()}static async create(t,n,r,i){let[a,o,s,c,l]=await Promise.all([M(t,`sky.wgsl`,K(be)),M(t,`terrain.wgsl`,K(xe)),M(t,`shadow.wgsl`,K(ye)),M(t,`overlay.wgsl`,K(_e)),M(t,`particles.wgsl`,K(ve))]),u=GPUShaderStage.VERTEX,d=GPUShaderStage.FRAGMENT,f=(e,t)=>({binding:e,visibility:t,buffer:{type:`uniform`}}),p=t.createBindGroupLayout({label:`sky layout`,entries:[f(0,u|d)]}),m=t.createBindGroupLayout({label:`terrain layout`,entries:[f(0,u|d),{binding:1,visibility:u,buffer:{type:`read-only-storage`}},{binding:2,visibility:u,buffer:{type:`read-only-storage`}},{binding:3,visibility:d,texture:{sampleType:`float`,viewDimension:`2d-array`}},{binding:4,visibility:d,sampler:{type:`filtering`}},{binding:5,visibility:d,texture:{sampleType:`depth`,viewDimension:`2d-array`}},{binding:6,visibility:d,sampler:{type:`comparison`}}]}),h=t.createBindGroupLayout({label:`scene depth layout`,entries:[{binding:0,visibility:d,texture:{sampleType:`depth`}}]}),g=t.createBindGroupLayout({label:`shadow layout`,entries:[f(0,u),{binding:1,visibility:u,buffer:{type:`read-only-storage`}},{binding:2,visibility:u,buffer:{type:`read-only-storage`}}]}),_=t.createBindGroupLayout({label:`overlay layout`,entries:[f(0,u|d),f(1,u|d),{binding:2,visibility:d,texture:{sampleType:`float`,viewDimension:`2d-array`}},{binding:3,visibility:d,sampler:{type:`filtering`}}]}),v=t.createBindGroupLayout({label:`particle render layout`,entries:[f(0,u|d),{binding:3,visibility:d,texture:{sampleType:`float`,viewDimension:`2d-array`}},{binding:4,visibility:d,sampler:{type:`filtering`}},{binding:5,visibility:u,buffer:{type:`read-only-storage`}}]}),y=Ot(t),b=y.texture.createView({dimension:`2d-array`}),x=t.createTexture({label:`cascaded shadow map`,size:{width:Wn,height:Wn,depthOrArrayLayers:2},format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),S=x.createView({dimension:`2d-array`}),C=Array.from({length:2},(e,t)=>x.createView({dimension:`2d`,baseArrayLayer:t,arrayLayerCount:1})),w=t.createSampler({label:`shadow comparison sampler`,compare:`less-equal`,magFilter:`linear`,minFilter:`linear`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`}),T=ge.DEPTH_FORMAT,E={color:{srcFactor:`src-alpha`,dstFactor:`one-minus-src-alpha`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}},D=t.createPipelineLayout({bindGroupLayouts:[m]}),O=(e,i,a,s,c,l=D,u=!0)=>t.createRenderPipelineAsync({label:e,layout:l,vertex:{module:o,entryPoint:`vs_main`,constants:{VERTEX_CAPACITY:a,LIGHT_OFFSET:a*r.config.meshSlots}},fragment:{module:o,entryPoint:i,targets:[{format:n,...c?{blend:c}:{}}]},primitive:{topology:`triangle-list`,cullMode:s,frontFace:`ccw`},depthStencil:{format:T,depthWriteEnabled:u,depthCompare:`less`}}),k=t.createPipelineLayout({bindGroupLayouts:[_]}),A={format:T,depthWriteEnabled:!1,depthCompare:`less-equal`},ee=t.createComputePipelineAsync({label:`particle simulation`,layout:`auto`,compute:{module:l,entryPoint:`simulate`}}),[te,ne,re,ie,ae,oe,se,ce,le]=await Promise.all([t.createRenderPipelineAsync({label:`sky pipeline`,layout:t.createPipelineLayout({bindGroupLayouts:[p]}),vertex:{module:a,entryPoint:`vs_main`},fragment:{module:a,entryPoint:`fs_main`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:T,depthWriteEnabled:!1,depthCompare:`always`}}),O(`opaque terrain pipeline`,`fs_opaque`,Me,`back`),O(`cutout pipeline`,`fs_cutout`,Pe,`none`),O(`water pipeline`,`fs_water`,Ne,`none`,E,t.createPipelineLayout({bindGroupLayouts:[m,h]}),!1),...Array.from({length:2},(e,n)=>t.createRenderPipelineAsync({label:`shadow pipeline ${n}`,layout:t.createPipelineLayout({bindGroupLayouts:[g]}),vertex:{module:s,entryPoint:`vs_shadow`,constants:{VERTEX_CAPACITY:Me,CASCADE:n}},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`,depthBiasSlopeScale:1.5}})),t.createRenderPipelineAsync({label:`target box pipeline`,layout:k,vertex:{module:c,entryPoint:`vs_box`},fragment:{module:c,entryPoint:`fs_box`,targets:[{format:n,blend:E}]},primitive:{topology:`line-list`},depthStencil:A}),t.createRenderPipelineAsync({label:`crack overlay pipeline`,layout:k,vertex:{module:c,entryPoint:`vs_crack`},fragment:{module:c,entryPoint:`fs_crack`,targets:[{format:n,blend:E}]},primitive:{topology:`triangle-list`,cullMode:`back`,frontFace:`ccw`},depthStencil:A}),t.createRenderPipelineAsync({label:`particle pipeline`,layout:t.createPipelineLayout({bindGroupLayouts:[v]}),vertex:{module:l,entryPoint:`vs_particle`},fragment:{module:l,entryPoint:`fs_particle`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`,frontFace:`ccw`},depthStencil:{format:T,depthWriteEnabled:!1,depthCompare:`less`}})]),ue=await ee,de=t.createBuffer({label:`overlay uniforms`,size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),fe=t.createBuffer({label:`particles`,size:j*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),pe=t.createBuffer({label:`particle sim params`,size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),me={binding:0,resource:{buffer:i}},he=(e,n)=>t.createBindGroup({label:e,layout:m,entries:[me,{binding:1,resource:{buffer:n}},{binding:2,resource:{buffer:r.chunkOrigins}},{binding:3,resource:b},{binding:4,resource:y.sampler},{binding:5,resource:S},{binding:6,resource:w}]}),N={sky:t.createBindGroup({label:`sky bind group`,layout:p,entries:[me]}),opaque:he(`opaque terrain bind group`,r.opaqueVertices),cutout:he(`cutout bind group`,r.cutoutVertices),water:he(`water bind group`,r.waterVertices),shadow:t.createBindGroup({label:`shadow bind group`,layout:g,entries:[me,{binding:1,resource:{buffer:r.opaqueVertices}},{binding:2,resource:{buffer:r.chunkOrigins}}]}),overlay:t.createBindGroup({label:`overlay bind group`,layout:_,entries:[me,{binding:1,resource:{buffer:de}},{binding:2,resource:b},{binding:3,resource:y.sampler}]}),particles:t.createBindGroup({label:`particle render bind group`,layout:v,entries:[me,{binding:3,resource:b},{binding:4,resource:y.sampler},{binding:5,resource:{buffer:fe}}]}),simulate:t.createBindGroup({label:`particle sim bind group`,layout:ue.getBindGroupLayout(0),entries:[{binding:1,resource:{buffer:fe}},{binding:2,resource:{buffer:pe}}]})};return new e(t,r,{sky:te,opaque:ne,cutout:re,water:ie,shadow:[ae,oe],box:se,crack:ce,particles:le,simulate:ue},N,h,C,de,fe,pe,[y.texture,x])}uploadParticles(e,t){for(let n of t)this.device.queue.writeBuffer(this.particleBuffer,n.first*48,e,n.first*12,n.count*12)}simulateParticles(e,t){let n=new Float32Array(this.simData),r=new Uint32Array(this.simData);n[0]=t,n[1]=22,r[2]=j,this.device.queue.writeBuffer(this.simBuffer,0,this.simData);let i=e.beginComputePass({label:`particle simulation`});i.setPipeline(this.p.simulate),i.setBindGroup(0,this.g.simulate),i.dispatchWorkgroups(Math.ceil(j/64)),i.end()}render(e,t,n,r,i){let a=this.world.indirectArgs,o=this.world.indexBuffer;r.shadow.forEach((t,n)=>{let r=e.beginRenderPass({label:`shadow cascade ${n}`,colorAttachments:[],depthStencilAttachment:{view:this.shadowViews[n],depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(t.length>0){r.setIndexBuffer(o,`uint16`),r.setPipeline(this.p.shadow[n]),r.setBindGroup(0,this.g.shadow);for(let e of t)r.drawIndexedIndirect(a,Ln(e,0))}r.end()});let s=e.beginRenderPass({label:`main render pass`,colorAttachments:[{view:t,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}],depthStencilAttachment:{view:n,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(this.p.sky),s.setBindGroup(0,this.g.sky),s.draw(3),s.setIndexBuffer(o,`uint16`),r.opaque.length>0){s.setPipeline(this.p.opaque),s.setBindGroup(0,this.g.opaque);for(let e of r.opaque)s.drawIndexedIndirect(a,Ln(e,0))}if(r.cutout.length>0){s.setPipeline(this.p.cutout),s.setBindGroup(0,this.g.cutout);for(let e of r.cutout)s.drawIndexedIndirect(a,Ln(e,2))}s.end();let c=this.overlayData;c.fill(0),i.target&&(c.set(i.target,0),c[3]=1),c[4]=i.crackStage,this.device.queue.writeBuffer(this.overlayBuffer,0,c);let l=e.beginRenderPass({label:`water and overlay pass`,colorAttachments:[{view:t,loadOp:`load`,storeOp:`store`}],depthStencilAttachment:{view:n,depthReadOnly:!0}});if(l.setPipeline(this.p.particles),l.setBindGroup(0,this.g.particles),l.draw(36,j),r.water.length>0){l.setIndexBuffer(o,`uint16`),l.setPipeline(this.p.water),l.setBindGroup(0,this.g.water),l.setBindGroup(1,this.sceneDepthGroup(n));for(let e of r.water)l.drawIndexedIndirect(a,Ln(e,1))}i.target&&(l.setBindGroup(0,this.g.overlay),i.crackStage>=0&&(l.setPipeline(this.p.crack),l.draw(36)),l.setPipeline(this.p.box),l.draw(24)),l.end()}sceneDepthGroup(e){return(this.depthGroupView!==e||!this.depthGroup)&&(this.depthGroupView=e,this.depthGroup=this.device.createBindGroup({label:`scene depth bind group`,layout:this.depthLayout,entries:[{binding:0,resource:e}]})),this.depthGroup}},Kn=class{size;free=[];all=[];constructor(e,t,n,r){this.size=t;for(let i=0;i<n;i++){let n=e.createBuffer({label:`${r} staging ${i}`,size:t,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});this.free.push(n),this.all.push(n)}}get available(){return this.free.length}acquire(){return this.free.pop()??null}async read(e,t,n){try{await e.mapAsync(GPUMapMode.READ,0,t);try{return n(e.getMappedRange(0,t))}finally{e.unmap()}}finally{this.free.push(e)}}release(e){this.free.push(e)}destroy(){for(let e of this.all)e.destroy()}},X=1e-5;function qn(e,t,n,r,i,a){return{minX:e,minY:t,minZ:n,maxX:r,maxY:i,maxZ:a}}function Jn(e,t){return t===0?e.minX:t===1?e.minY:e.minZ}function Yn(e,t){return t===0?e.maxX:t===1?e.maxY:e.maxZ}function Xn(e,t,n){t===0?(e.minX+=n,e.maxX+=n):t===1?(e.minY+=n,e.maxY+=n):(e.minZ+=n,e.maxZ+=n)}function Zn(e,t){let n=Math.floor(e.minX+X),r=Math.ceil(e.maxX-X)-1,i=Math.floor(e.minY+X),a=Math.ceil(e.maxY-X)-1,o=Math.floor(e.minZ+X),s=Math.ceil(e.maxZ-X)-1;for(let e=i;e<=a;e++)for(let i=o;i<=s;i++)for(let a=n;a<=r;a++)if(t(a,e,i))return!0;return!1}function Qn(e,t,n,r){if(n===0)return 0;let i=(t+1)%3,a=(t+2)%3,o=Math.floor(Jn(e,i)+X),s=Math.ceil(Yn(e,i)-X)-1,c=Math.floor(Jn(e,a)+X),l=Math.ceil(Yn(e,a)-X)-1,u=e=>{for(let n=o;n<=s;n++)for(let i=c;i<=l;i++)if(t===0?r(e,n,i):t===1?r(i,e,n):r(n,i,e))return!0;return!1};if(n>0){let r=Yn(e,t),i=Math.ceil(r-X),a=Math.ceil(r+n)-1;for(let e=i;e<=a;e++)if(u(e))return Math.max(0,Math.min(n,e-r))}else{let r=Jn(e,t),i=Math.floor(r+X)-1,a=Math.floor(r+n);for(let e=i;e>=a;e--)if(u(e))return Math.min(0,Math.max(n,e+1-r))}return n}function $n(e,t,n,r,i){let a=Qn(e,1,n,i);Xn(e,1,a);let o=Qn(e,0,t,i);Xn(e,0,o);let s=Qn(e,2,r,i);return Xn(e,2,s),{dx:o,dy:a,dz:s,hitX:o!==t,hitY:a!==n,hitZ:s!==r}}var er={width:.6,height:1.8,eyeHeight:1.6,gravity:27.44,jumpHeight:1.25,walkSpeed:4.3,sprintSpeed:7,groundResponse:14,airResponse:2.5,waterResponse:5,stepHeight:1,maxFallSpeed:60,swimSpeed:3.2,timestep:1/120},tr=class{config;position=new Float64Array(3);velocity=new Float64Array(3);grounded=!1;inWater=!1;stepOffset=0;accumulator=0;box=qn(0,0,0,0,0,0);constructor(e={}){this.config={...er,...e}}get jumpSpeed(){return Math.sqrt(2*this.config.gravity*this.config.jumpHeight)}eye(e){e[0]=this.position[0],e[1]=this.position[1]+this.config.eyeHeight+this.stepOffset,e[2]=this.position[2]}setFromEye(e,t,n){this.position[0]=e,this.position[1]=t-this.config.eyeHeight,this.position[2]=n,this.velocity.fill(0),this.stepOffset=0,this.accumulator=0,this.grounded=!1}bounds(e=this.box){let t=this.config.width/2,n=this.position;return e.minX=n[0]-t,e.maxX=n[0]+t,e.minY=n[1],e.maxY=n[1]+this.config.height,e.minZ=n[2]-t,e.maxZ=n[2]+t,e}resolveEmbedded(e,t=64){for(let n=0;n<=t;n++){if(!Zn(this.bounds(),e))return!0;this.position[1]=Math.floor(this.position[1])+1}return!1}update(e,t,n,r){this.accumulator=Math.min(this.accumulator+e,.25);let i=this.config.timestep;for(;this.accumulator>=i;)this.tick(i,t,n,r),this.accumulator-=i}tick(e,t,n,r){let i=this.config,a=this.position,o=this.velocity;this.inWater=r.water(Math.floor(a[0]),Math.floor(a[1]+i.height*.4),Math.floor(a[2]));let s=-Math.sin(n)*t.forward+Math.cos(n)*t.strafe,c=-Math.cos(n)*t.forward-Math.sin(n)*t.strafe,l=Math.hypot(s,c);l>1&&(s/=l,c/=l);let u=t.sprint?i.sprintSpeed:i.walkSpeed;this.inWater&&(u*=.55);let d=this.inWater?i.waterResponse:this.grounded?i.groundResponse:i.airResponse,f=1-Math.exp(-d*e);o[0]+=(s*u-o[0])*f,o[2]+=(c*u-o[2])*f,this.inWater?(o[1]-=i.gravity*.2*e,o[1]*=Math.exp(-3*e),t.jump&&(o[1]=Math.min(o[1]+i.gravity*.6*e,i.swimSpeed))):(o[1]-=i.gravity*e,t.jump&&this.grounded&&(o[1]=this.jumpSpeed,this.grounded=!1)),o[1]=Math.max(o[1],-i.maxFallSpeed);let p=this.grounded,m=this.bounds(),h={...m},g=o[0]*e,_=o[1]*e,v=o[2]*e,y=$n(m,g,_,v,r.solid),b=!1;if(p&&(y.hitX||y.hitZ)&&i.stepHeight>0){let e={...h},t=Qn(e,1,i.stepHeight,r.solid);Xn(e,1,t);let n=$n(e,g,0,v,r.solid);Xn(e,1,Qn(e,1,-t,r.solid)),Math.hypot(n.dx,n.dz)-Math.hypot(y.dx,y.dz)>1e-6&&e.minY>h.minY&&(this.stepOffset-=e.minY-h.minY,Object.assign(m,e),y=n,b=!0)}a[0]=(m.minX+m.maxX)/2,a[1]=m.minY,a[2]=(m.minZ+m.maxZ)/2,y.hitX&&(o[0]=0),y.hitZ&&(o[2]=0),y.hitY&&(o[1]=0),this.grounded=b||y.hitY&&_<0,this.stepOffset*=Math.exp(-14*e),Math.abs(this.stepOffset)<.001&&(this.stepOffset=0)}},nr=class{chunks=new Map;dirty=new Set;record(e,t,n,r){let i=rr(P(e),P(t),P(n)),a=this.chunks.get(i);a||(a=new Map,this.chunks.set(i,a)),a.set(we(e&31,t&31,n&31),r),this.dirty.add(i)}editsFor(e,t,n){return this.chunks.get(rr(e,t,n))}load(e,t){t.size>0&&this.chunks.set(e,t)}get chunkCount(){return this.chunks.size}get editCount(){let e=0;for(let t of this.chunks.values())e+=t.size;return e}get dirtyCount(){return this.dirty.size}takeDirty(){let e=[];for(let t of this.dirty)e.push([t,lr(this.chunks.get(t)??new Map)]);return this.dirty.clear(),e}markDirty(e){for(let t of e)this.dirty.add(t)}clear(){this.chunks.clear(),this.dirty.clear()}};function rr(e,t,n){return`${e},${t},${n}`}function ir(e){let t=/^(-?\d+),(-?\d+),(-?\d+)$/.exec(e);return t?[Number(t[1]),Number(t[2]),Number(t[3])]:null}var ar=86,or=68,sr=1,cr=8;function lr(e){let t=e.size,n=new Uint8Array(cr+t*3),r=new DataView(n.buffer);n[0]=ar,n[1]=or,n[2]=sr,r.setUint32(4,t,!0);let i=0,a=[...e.keys()].sort((e,t)=>e-t);for(let o of a)r.setUint16(cr+i*2,o,!0),n[cr+t*2+i]=e.get(o),i++;return n}function ur(e){if(e.length<cr||e[0]!==ar||e[1]!==or)throw Error(`not a chunk edit record`);if(e[2]!==sr)throw Error(`unsupported chunk edit version ${e[2]}`);let t=new DataView(e.buffer,e.byteOffset,e.byteLength),n=t.getUint32(4,!0);if(e.length!==cr+n*3)throw Error(`truncated chunk edit record`);let r=new Map;for(let i=0;i<n;i++){let a=t.getUint16(cr+i*2,!0);if(a>=32768)throw Error(`voxel index out of range`);r.set(a,e[cr+n*2+i])}return r}var dr=class{capacity;freeList;allocated;freeCount;constructor(e){if(this.capacity=e,!Number.isInteger(e)||e<=0)throw RangeError(`invalid slot capacity ${e}`);this.freeList=new Int32Array(e),this.allocated=new Uint8Array(e);for(let t=0;t<e;t++)this.freeList[t]=e-1-t;this.freeCount=e}get used(){return this.capacity-this.freeCount}get available(){return this.freeCount}alloc(){if(this.freeCount===0)return-1;let e=this.freeList[--this.freeCount];return this.allocated[e]=1,e}free(e){if(e<0||e>=this.capacity||this.allocated[e]===0)throw Error(`slot ${e} is not allocated`);this.allocated[e]=0,this.freeList[this.freeCount++]=e}isAllocated(e){return e>=0&&e<this.capacity&&this.allocated[e]===1}},fr={radius:8,minChunkY:-2,maxChunkY:3,voxelSlots:1536,meshSlots:640,unloadMargin:1.5},pr=class{chunks=new Map;voxelSlots;meshSlots;config;light;edits=null;lightQueue=[];lightQueueHead=0;touched=[];centerX=NaN;centerY=0;centerZ=NaN;meshQueue=new Set;uploadQueue=new Set;pendingSorted=[];pendingDirty=!0;constructor(e={}){this.config={...fr,...e},this.voxelSlots=new dr(this.config.voxelSlots),this.meshSlots=new dr(this.config.meshSlots),this.light=new kn(this)}get maxChunkY(){return this.config.maxChunkY}chunkAt(e,t,n){return this.chunks.get(F(e,t,n))}lightChanged(e,t,n,r){let i=e;i.lightTouch===0&&this.touched.push(i);let a=t===0?-1:+(t===31),o=n===0?-1:+(n===31),s=r===0?-1:+(r===31),c=i.lightTouch|8192;if(a|o|s)for(let e=0;e<=+!!s;e++)for(let t=0;t<=+!!o;t++)for(let n=0;n<=+!!a;n++)c|=1<<Te(n*a,t*o,e*s);i.lightTouch=c}flushLightChanges(){for(let e of this.touched){let t=e.lightTouch;e.lightTouch=0;for(let n=0;n<27;n++){if(!(t&1<<n))continue;let r=n%3-1,i=Math.floor(n/3)%3-1,a=Math.floor(n/9)-1,o=n===13?e:this.chunks.get(F(e.cx+r,e.cy+i,e.cz+a));o&&this.chunks.get(o.key)===o&&o.state===`ready`&&o.lit&&o.data&&o.data.nonAirCount>0&&this.requestMesh(o)}}this.touched.length=0}get lightQueueSize(){return this.lightQueue.length-this.lightQueueHead}processLighting(e=1/0,t=()=>performance.now()){let n=e===1/0?0:t(),r=0;for(;this.lightQueueHead<this.lightQueue.length;){let i=this.lightQueue[this.lightQueueHead++];if(this.chunks.get(i.key)===i&&i.state===`ready`&&!i.lit&&i.data&&(this.light.lightChunk(i),r++,e!==1/0&&t()-n>=e))break}return this.lightQueueHead===this.lightQueue.length&&(this.lightQueue.length=0,this.lightQueueHead=0),this.flushLightChanges(),r}get center(){return{x:this.centerX,y:this.centerY,z:this.centerZ}}getChunk(e,t,n){return this.chunks.get(F(e,t,n))}isDesired(e,t,n){if(t<this.config.minChunkY||t>this.config.maxChunkY)return!1;let r=e-this.centerX,i=n-this.centerZ;return r*r+i*i<=this.config.radius*this.config.radius}updateCenter(e,t,n){let r=e!==this.centerX||n!==this.centerZ;if(t!==this.centerY&&(this.pendingDirty=!0),this.centerY=t,!r)return[];this.centerX=e,this.centerZ=n,this.pendingDirty=!0;let i=[],a=this.config.radius+this.config.unloadMargin;for(let t of this.chunks.values()){let r=t.cx-e,o=t.cz-n;r*r+o*o>a*a&&i.push(t)}for(let e of i)this.unload(e);let o=Math.ceil(this.config.radius);for(let t=-o;t<=o;t++)for(let r=-o;r<=o;r++)if(!(r*r+t*t>this.config.radius*this.config.radius))for(let i=this.config.minChunkY;i<=this.config.maxChunkY;i++){let a=F(e+r,i,n+t);this.chunks.has(a)||this.chunks.set(a,mr(a,e+r,i,n+t))}return i}unload(e){e.voxelSlot>=0&&this.voxelSlots.free(e.voxelSlot),e.meshSlot>=0&&this.meshSlots.free(e.meshSlot),e.voxelSlot=-1,e.meshSlot=-1,e.hasMesh=!1,e.data=null,this.meshQueue.delete(e),this.uploadQueue.delete(e),this.chunks.delete(e.key)}priority(e){let t=e.cx-this.centerX,n=e.cy-this.centerY,r=e.cz-this.centerZ;return t*t+r*r+n*n*.5}generationPriority(e){let t=e.cx-this.centerX,n=e.cz-this.centerZ;return(t*t+n*n)*64+(this.config.maxChunkY-e.cy)}nextGenerationBatch(e){this.pendingDirty&&=(this.pendingSorted=[...this.chunks.values()].filter(e=>e.state===`pending`),this.pendingSorted.sort((e,t)=>this.generationPriority(t)-this.generationPriority(e)),!1);let t=[];for(;t.length<e&&this.pendingSorted.length>0;){let e=this.pendingSorted[this.pendingSorted.length-1];if(this.chunks.get(e.key)!==e||e.state!==`pending`){this.pendingSorted.pop();continue}let n=this.voxelSlots.alloc();if(n<0)break;this.pendingSorted.pop(),e.state=`generating`,e.voxelSlot=n,e.genToken++,t.push({record:e,token:e.genToken,voxelSlot:n})}return t}get pendingCount(){let e=0;for(let t of this.chunks.values())t.state===`pending`&&e++;return e}completeGeneration(t,n){let r=t.record;if(this.chunks.get(r.key)!==r||r.state!==`generating`||r.genToken!==t.token)return!1;r.state=`ready`,r.data=n;let i=this.edits?.editsFor(r.cx,r.cy,r.cz);if(i&&i.size>0){for(let[e,t]of i)n.set(e,t);r.uploadPending=!0,this.uploadQueue.add(r)}return this.lightQueue.push(r),n.uniformBlock()===e.Air?(this.voxelSlots.free(r.voxelSlot),r.voxelSlot=-1,this.uploadQueue.delete(r),!0):(this.requestMesh(r),this.forEachNeighbor(r,e=>{e.state===`ready`&&e.data&&e.data.nonAirCount>0&&this.requestMesh(e)}),!0)}requestMesh(e){e.needsMesh=!0,this.meshQueue.add(e)}forEachNeighbor(e,t){for(let n=-1;n<=1;n++)for(let r=-1;r<=1;r++)for(let i=-1;i<=1;i++){if(i===0&&r===0&&n===0)continue;let a=this.chunks.get(F(e.cx+i,e.cy+r,e.cz+n));a&&t(a)}}neighborsSettled(e){for(let t=-1;t<=1;t++)for(let n=-1;n<=1;n++)for(let r=-1;r<=1;r++){let i=e.cx+r,a=e.cy+n,o=e.cz+t,s=this.chunks.get(F(i,a,o));if(s){if(s.state!==`ready`||!s.lit)return!1}else if(this.isDesired(i,a,o))return!1}return!0}nextMeshBatch(e){if(this.meshQueue.size===0)return[];let t=[...this.meshQueue].filter(e=>e.state===`ready`&&this.neighborsSettled(e));t.sort((e,t)=>this.priority(e)-this.priority(t));let n=[];for(let r of t){if(n.length>=e)break;if(r.meshSlot<0){let e=this.meshSlots.alloc();if(e<0)break;r.meshSlot=e,r.hasMesh=!1}r.needsMesh=!1,this.meshQueue.delete(r),r.meshVersion++,r.hasMesh=!0,r.opaqueQuads=-1,r.waterQuads=-1,r.cutoutQuads=-1,n.push({record:r,version:r.meshVersion,meshSlot:r.meshSlot,neighborSlots:this.neighborSlots(r),neighborLight:this.neighborLight(r)})}return n}get meshQueueSize(){return this.meshQueue.size}neighborSlots(e,t=new Uint32Array(27)){for(let n=-1;n<=1;n++)for(let r=-1;r<=1;r++)for(let i=-1;i<=1;i++){let a=i===0&&r===0&&n===0?e:this.chunks.get(F(e.cx+i,e.cy+r,e.cz+n)),o=a&&a.state===`ready`?a.voxelSlot:-1;t[Te(i,r,n)]=o>=0?o:Ve}return t}neighborLight(e){let t=Array(27);for(let n=-1;n<=1;n++)for(let r=-1;r<=1;r++)for(let i=-1;i<=1;i++){let a=i===0&&r===0&&n===0?e:this.chunks.get(F(e.cx+i,e.cy+r,e.cz+n));t[Te(i,r,n)]=a&&a.lit&&a.state===`ready`?a.light:null}return t}completeMesh(e,t,n,r=0){let i=e.record;return this.chunks.get(i.key)!==i||i.meshVersion!==e.version||i.meshSlot!==e.meshSlot?!1:(i.opaqueQuads=t,i.waterQuads=n,i.cutoutQuads=r,t===0&&n===0&&r===0&&(this.meshSlots.free(i.meshSlot),i.meshSlot=-1,i.hasMesh=!1),!0)}getLight(e,t,n){let r=this.getChunk(P(e),P(t),P(n));return!r||!r.lit?240:r.light.get(we(e&31,t&31,n&31))}getBlock(e,t,n){let r=this.getChunk(P(e),P(t),P(n));return!r||r.state!==`ready`||!r.data?-1:r.data.get(we(e&31,t&31,n&31))}setBlock(t,n,r,i){let a=P(t),o=P(n),s=P(r),c=this.getChunk(a,o,s);if(!c||c.state!==`ready`||!c.data)return!1;let l=t&31,u=n&31,d=r&31,f=we(l,u,d),p=c.data.get(f);if(p===i)return!1;if(c.voxelSlot<0){let e=this.voxelSlots.alloc();if(e<0)return!1;c.voxelSlot=e}c.data.set(f,i),this.light.blockChanged(c,f,p),this.flushLightChanges(),c.data.uniformBlock()===e.Air?(this.voxelSlots.free(c.voxelSlot),c.voxelSlot=-1,this.uploadQueue.delete(c)):(c.uploadPending=!0,this.uploadQueue.add(c)),this.requestMesh(c);let m=l===0?[-1,0]:l===31?[0,1]:[0],h=u===0?[-1,0]:u===31?[0,1]:[0],g=d===0?[-1,0]:d===31?[0,1]:[0];for(let e of g)for(let t of h)for(let n of m){if(n===0&&t===0&&e===0)continue;let r=this.getChunk(a+n,o+t,s+e);r&&r.state===`ready`&&r.data&&r.data.nonAirCount>0&&this.requestMesh(r)}return!0}takeUploads(){let e=[...this.uploadQueue].filter(e=>e.voxelSlot>=0&&e.data);for(let t of e)t.uploadPending=!1;return this.uploadQueue.clear(),e}*drawable(){for(let e of this.chunks.values())e.meshSlot>=0&&e.hasMesh&&(yield e)}countByState(){let e={pending:0,generating:0,ready:0};for(let t of this.chunks.values())e[t.state]++;return e}};function mr(e,t,n,r){return{key:e,cx:t,cy:n,cz:r,state:`pending`,data:null,voxelSlot:-1,meshSlot:-1,needsMesh:!1,hasMesh:!1,meshVersion:0,genToken:0,opaqueQuads:-1,waterQuads:-1,cutoutQuads:-1,uploadPending:!1,light:new gn(0),lit:!1,lightTouch:0}}var hr={tickInterval:.25,maxUpdatesPerTick:4096,maxTicksPerUpdate:2},gr=1<<19,_r=512;function vr(e,t,n){return((e+gr)*1048576+(n+gr))*1024+(t+_r)}var yr=[[1,0],[-1,0],[0,1],[0,-1]];function br(e){return e<0||!s(e)&&!f(e)}var xr=class{world;config;pending=new Set;next=new Set;accumulator=0;lastChanges=0;totalChanges=0;ticks=0;constructor(e,t={}){this.world=e,this.config={...hr,...t}}get queued(){return this.pending.size+this.next.size}schedule(e,t,n){this.next.add(vr(e,t,n))}scheduleAround(e,t,n){this.schedule(e,t,n),this.schedule(e+1,t,n),this.schedule(e-1,t,n),this.schedule(e,t+1,n),this.schedule(e,t-1,n),this.schedule(e,t,n+1),this.schedule(e,t,n-1)}clear(){this.pending.clear(),this.next.clear(),this.accumulator=0}update(e){this.accumulator+=e;let t=0;for(let e=0;e<this.config.maxTicksPerUpdate&&this.accumulator>=this.config.tickInterval;e++)this.accumulator-=this.config.tickInterval,t+=this.tick();return this.accumulator=Math.min(this.accumulator,this.config.tickInterval),t}desiredState(t,n,r){let i=this.world,a=i.getBlock(t,n,r);if(a<0||a===e.Water||!s(a)&&!f(a))return a;if(s(i.getBlock(t,n+1,r)))return e.WaterFalling;let o=8;for(let[a,l]of yr){let u=i.getBlock(t+a,n,r+l);if(!s(u))continue;let d=i.getBlock(t+a,n-1,r+l);f(d)||s(d)&&d!==e.Water||(br(d)||u===e.Water)&&(o=Math.min(o,c(u)+1))}return o<=7?l(o):s(a)?e.Air:a}tick(){for(let e of this.next)this.pending.add(e);this.next.clear();let e=[],t=0;for(let n of this.pending){if(t>=this.config.maxUpdatesPerTick)break;this.pending.delete(n),t++;let r=n%1024-_r,i=Math.floor(n/1024),a=i%1048576-gr,o=Math.floor(i/1048576)-gr,s=this.world.getBlock(o,r,a),c=this.desiredState(o,r,a);c!==s&&e.push(o,r,a,c)}let n=0;for(let t=0;t<e.length;t+=4){let r=e[t],i=e[t+1],a=e[t+2];this.world.setBlock(r,i,a,e[t+3])&&(n++,this.scheduleAround(r,i,a))}return this.ticks++,this.lastChanges=n,this.totalChanges+=n,n}};function Sr(e,t,n,r,i,a,o,s,c){let l=Math.hypot(r,i,a);if(l===0)return null;r/=l,i/=l,a/=l;let u=Math.floor(e),d=Math.floor(t),f=Math.floor(n),p=r>0?1:r<0?-1:0,m=i>0?1:i<0?-1:0,h=a>0?1:a<0?-1:0,g=p===0?1/0:Math.abs(1/r),_=m===0?1/0:Math.abs(1/i),v=h===0?1/0:Math.abs(1/a),y=p>0?(u+1-e)*g:p<0?(e-u)*g:1/0,b=m>0?(d+1-t)*_:m<0?(t-d)*_:1/0,x=h>0?(f+1-n)*v:h<0?(n-f)*v:1/0,S=0,C=0,w=0,T=0;for(;T<=o;){let e=s(u,d,f);if(c(e))return{x:u,y:d,z:f,nx:S,ny:C,nz:w,distance:T,block:e};y<b&&y<x?(u+=p,T=y,y+=g,S=-p,C=0,w=0):b<x?(d+=m,T=b,b+=_,S=0,C=-m,w=0):(f+=h,T=x,x+=v,S=0,C=0,w=-h)}return null}function Cr(e,t,n,r){let i=[e];for(let a=1;a<n;a++){let o=a/n,s=e*(t/e)**+o,c=e+(t-e)*o;i.push(r*s+(1-r)*c)}return i.push(t),i}function wr(e,t,n){let r=Math.tan(e.fovY/2),i=r*e.aspect,a=[];for(let o of[t,n])for(let t of[-1,1])for(let n of[-1,1]){let s=[0,0,0];for(let a=0;a<3;a++)s[a]=e.position[a]+e.forward[a]*o+e.right[a]*n*o*i+e.up[a]*t*o*r;a.push(s)}return a}function Tr(e){let t=Math.hypot(e[0],e[1],e[2]),n=[e[0]/t,e[1]/t,e[2]/t],r=Math.abs(n[1])>.99?[0,0,1]:[0,1,0],i=[r[1]*n[2]-r[2]*n[1],r[2]*n[0]-r[0]*n[2],r[0]*n[1]-r[1]*n[0]],a=Math.hypot(i[0],i[1],i[2]);i=i.map(e=>e/a);let o=[n[1]*i[2]-n[2]*i[1],n[2]*i[0]-n[0]*i[2],n[0]*i[1]-n[1]*i[0]];return{x:i,y:o,z:n}}function Er(e,t,n,r,i,a){let o=[0,0,0];for(let t of e)for(let n=0;n<3;n++)o[n]+=t[n]/e.length;let s=0;for(let t of e)s=Math.max(s,Math.hypot(t[0]-o[0],t[1]-o[1],t[2]-o[2]));s=Math.ceil(s*4)/4;let c=2*s/n,{x:l,y:u,z:d}=Tr(t),f=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],p=Math.floor(f(l,o)/c)*c,m=Math.floor(f(u,o)/c)*c,h=f(d,o),g=T();g[0]=l[0],g[4]=l[1],g[8]=l[2],g[1]=u[0],g[5]=u[1],g[9]=u[2],g[2]=d[0],g[6]=d[1],g[10]=d[2],g[12]=0,g[13]=0,g[14]=0,g[15]=1;let _=h+s+r,v=h-s,y=T();return y.fill(0),y[0]=1/s,y[5]=1/s,y[10]=-1/(_-v),y[12]=-p/s,y[13]=-m/s,y[14]=_/(_-v),y[15]=1,{viewProj:D(T(),y,g),near:i,far:a,center:o,radius:s,texelSize:c}}function Dr(e,t,n,r,i,a,o,s){let c=Cr(n,r,i,a),l=[];for(let n=0;n<i;n++){let r=wr(e,c[n],c[n+1]);l.push(Er(r,t,o,s,c[n],c[n+1]))}return l}var Or=[e.Stone,e.Dirt,e.Grass,e.Sand,e.Wood,e.Glass,e.Brick,e.Torch,e.Water],kr=[64,64,32,64,64,32,64,32,16];function Ar(t){return t===e.Water?`Water Bucket`:r[t]??`?`}function jr(t){switch(t){case e.BirchWood:case e.PineWood:return e.Wood;case e.Cobblestone:return e.Stone;case e.Snow:return e.Dirt;default:return t}}var Mr=class{selected=0;counts=[...kr];get block(){return Or[this.selected]}get count(){return this.counts[this.selected]}select(e){Number.isInteger(e)&&e>=0&&e<Or.length&&(this.selected=e)}scroll(e){let t=Or.length;this.selected=((this.selected+e)%t+t)%t}consume(){return this.counts[this.selected]<=0?!1:(this.counts[this.selected]--,!0)}collect(e){let t=Or.indexOf(jr(e));return t>=0&&(this.counts[t]=Math.min(999,this.counts[t]+1)),t}save(){return{selected:this.selected,counts:[...this.counts]}}load(e){this.select(e.selected),e.counts.forEach((e,t)=>{t<this.counts.length&&Number.isInteger(e)&&(this.counts[t]=Math.max(0,Math.min(999,e)))})}static slotForKey(e){let t=/^Digit([1-9])$/.exec(e);return t?Number(t[1])-1:-1}},Nr=[.55,.85,.4],Pr=48;function Fr(e){let t=$e[e],n=tt[e],r=document.createElement(`canvas`);r.width=16,r.height=16;let i=r.getContext(`2d`),a=i.createImageData(16,16);for(let r=0;r<16;r++)for(let i=0;i<16;i++){let[o,s,c,l]=wt(t,i,r),u=(r*16+i)*4,d=n===`full`||n===`masked`&&l>.5?Nr:[1,1,1];a.data[u]=o*d[0]*255,a.data[u+1]=s*d[1]*255,a.data[u+2]=c*d[2]*255,a.data[u+3]=n===`masked`?255:e===`glass`?Math.max(l*255,50):e===`water`?215:l*255}return i.putImageData(a,0,0),r}function Ir(e){let[t,n]=et[e],r=document.createElement(`canvas`);r.width=Pr,r.height=Pr;let i=r.getContext(`2d`);if(i.imageSmoothingEnabled=!1,h(e))return i.drawImage(Fr(n),4,4,40,40),r.toDataURL();let a=(e,t,n,r,a)=>{i.setTransform(n[0]/16,n[1]/16,r[0]/16,r[1]/16,t[0],t[1]),i.drawImage(e,0,0),a>0&&(i.globalAlpha=a,i.fillStyle=`#000`,i.globalCompositeOperation=`source-atop`,i.fillRect(0,0,16,16),i.globalCompositeOperation=`source-over`,i.globalAlpha=1)},o=Fr(t),s=Fr(n);return a(o,[4,14],[20,-11],[20,11],0),a(s,[4,14],[20,11],[0,21],.22),a(s,[24,25],[20,-11],[0,21],.4),i.setTransform(1,0,0,1,0,0),r.toDataURL()}var Lr=class{model;slots=[];countEls=[];label;shown=``;constructor(e,t){this.model=t,e.replaceChildren(),e.classList.add(`hotbar`),Or.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`hotbar-slot`,r.title=Ar(t);let i=document.createElement(`img`);i.src=Ir(t),i.alt=Ar(t),i.draggable=!1;let a=document.createElement(`span`);a.className=`hotbar-key`,a.textContent=String(n+1);let o=document.createElement(`span`);o.className=`hotbar-count`,r.append(i,a,o),e.append(r),this.slots.push(r),this.countEls.push(o)}),this.label=document.createElement(`div`),this.label.className=`hotbar-label`,e.append(this.label),this.update()}bind(e){this.model=e,this.shown=``,this.update()}update(){let e=`${this.model.selected}:${this.model.counts.join(`,`)}`;e!==this.shown&&(this.shown=e,this.slots.forEach((e,t)=>{e.classList.toggle(`active`,t===this.model.selected),e.classList.toggle(`empty`,this.model.counts[t]===0),this.countEls[t].textContent=String(this.model.counts[t])}),this.label.textContent=`${Ar(this.model.block)} × ${this.model.count}`)}},Rr=class{windowMs;maxDelta;fps=0;frameMs=0;last=-1;windowStart=-1;windowFrames=0;constructor(e=500,t=.1){this.windowMs=e,this.maxDelta=t}tick(e){if(this.last<0)return this.last=e,this.windowStart=e,0;let t=Math.max(0,e-this.last);this.last=e,this.frameMs=this.frameMs===0?t:this.frameMs+(t-this.frameMs)*.1,this.windowFrames++;let n=e-this.windowStart;return n>=this.windowMs&&(this.fps=this.windowFrames*1e3/n,this.windowFrames=0,this.windowStart=e),Math.min(this.maxDelta,t/1e3)}},zr=[.12,.3,.72],Br=[.52,.66,.84],Vr=[.16,.18,.38],Hr=[.95,.47,.22],Ur=[.004,.008,.025],Wr=[.02,.03,.065],Gr=[1,.93,.8],Kr=[1,.5,.22],qr=[.55,.65,1],Jr=3.1,Yr=.3;function Xr(e,t,n){let r=Math.min(Math.max((n-e)/(t-e),0),1);return r*r*(3-2*r)}function Zr(e,t,n){return[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n]}function Qr(e){return e-Math.floor(e)}function $r(e){let t=(Qr(e)-.25)*Math.PI*2,n=Math.cos(t),r=Math.sin(t)*.93,i=.36,a=Math.hypot(n,r,i);return[n/a,r/a,i/a]}function ei(e){let t=$r(e),n=t[1],r=Xr(-.06,.28,n),i=Math.exp(-((n/.14)**2))*Xr(-.3,-.05,n),a=Zr(Zr(Ur,zr,r),Vr,i*.45),o=Zr(Zr(Wr,Br,r),Hr,i*.75),s=Zr(Kr,Gr,Xr(0,.4,n)),c=Xr(-.04,.02,n),l=Xr(-.04,.02,-n),u=Jr*Xr(-.03,.14,n),d=Yr*Xr(-.03,.14,-n),f=u>=d,p=[-t[0],-t[1],-t[2]];return{sunDir:t,lightDir:f?t:p,lightColor:f?s:qr,lightIntensity:f?u:d,sunColor:s,sunVisibility:c,moonVisibility:l,starVisibility:1-Xr(-.25,.02,n),zenith:a,horizon:o,daylight:r}}function ti(e){let t=Math.floor(Qr(e)*24*60),n=String(Math.floor(t/60)).padStart(2,`0`),r=String(t%60).padStart(2,`0`),i=$r(e)[1];return`${n}:${r} ${i>.25?`Day`:i>-.12?Qr(e)<.5?`Dawn`:`Dusk`:`Night`}`}var ni=new Intl.NumberFormat(`en-US`),ri=class{root;intervalMs;rows=new Map;lastUpdate=-1/0;shown=!1;constructor(e,t=200){this.root=e,this.intervalMs=t,e.replaceChildren(),e.classList.add(`stats`),e.hidden=!0;for(let[t,n]of[[`fps`,`FPS`],[`frame`,`Frame time`],[`chunks`,`Active chunks`],[`triangles`,`Triangles`],[`position`,`XYZ`],[`biome`,`Biome`],[`mode`,`Mode`],[`grounded`,`Player`],[`time`,`Time of day`],[`light`,`Light`],[`shadows`,`Shadows`],[`streaming`,`Streaming`],[`meshed`,`Meshed / visible`],[`vertices`,`Vertices`],[`slots`,`GPU slots`],[`memory`,`Memory`],[`chunk`,`Chunk`],[`look`,`Yaw / pitch`],[`speed`,`Speed`],[`target`,`Target`],[`place`,`Holding`],[`mining`,`Mining`],[`particles`,`Particles`],[`world`,`World`]]){let r=document.createElement(`div`);r.className=`stats-row`;let i=document.createElement(`span`);i.className=`stats-label`,i.textContent=n;let a=document.createElement(`span`);a.className=`stats-value`,r.append(i,a),e.append(r),this.rows.set(t,a)}}get visible(){return this.shown}set visible(e){this.shown=e,this.root.hidden=!e,this.lastUpdate=-1/0}update(e,t){!this.shown||t-this.lastUpdate<this.intervalMs||(this.lastUpdate=t,this.set(`fps`,e.fps.toFixed(0)),this.set(`mode`,e.mode),this.set(`grounded`,e.grounded),this.set(`time`,e.timeOfDay),this.set(`frame`,`${e.frameMs.toFixed(2)} ms`),this.set(`chunks`,`${ni.format(e.chunksLoaded)} loaded · ${ni.format(e.meshedChunks)} meshed`),this.set(`streaming`,`${e.chunksPending} queued · ${e.chunksGenerating} gen · ${e.lightQueue} light · ${e.meshQueue} mesh`),this.set(`light`,e.light),this.set(`world`,`seed ${e.seed} · ${ni.format(e.edits)} edits · ${ni.format(e.fluidCells)} water cells`),this.set(`meshed`,`${e.meshedChunks} / ${e.visibleChunks}${e.overflowChunks?` (${e.overflowChunks} overflow)`:``}`),this.set(`vertices`,ni.format(e.vertices)),this.set(`triangles`,ni.format(e.triangles)),this.set(`slots`,`voxel ${e.voxelSlotsUsed}/${e.voxelSlotsTotal} · mesh ${e.meshSlotsUsed}/${e.meshSlotsTotal}`),this.set(`memory`,`GPU ${e.gpuMemoryMB.toFixed(0)} MB · CPU voxels ${ni.format(Math.round(e.cpuVoxelKB))} KB`),this.set(`position`,`${e.camera.x.toFixed(1)}, ${e.camera.y.toFixed(1)}, ${e.camera.z.toFixed(1)}`),this.set(`chunk`,`${e.chunk.x}, ${e.chunk.y}, ${e.chunk.z}`),this.set(`look`,`${(e.camera.yaw*180/Math.PI).toFixed(0)}° / ${(e.camera.pitch*180/Math.PI).toFixed(0)}°`),this.set(`speed`,`${e.speed.toFixed(1)} m/s`),this.set(`target`,e.target),this.set(`place`,e.placeBlock),this.set(`biome`,e.biome),this.set(`shadows`,e.shadows),this.set(`mining`,e.mining),this.set(`particles`,String(e.particles)))}set(e,t){let n=this.rows.get(e);n&&n.textContent!==t&&(n.textContent=t)}},Z={viewProj:0,invViewProj:16,shadowViewProj0:32,shadowViewProj1:48,cameraPos:64,cameraDir:68,lightDir:72,lightColor:76,sunDir:80,sunColor:84,skyZenith:88,skyHorizon:92,fog:96,viewport:100,clip:104,shadowSplits:108,shadowParams:112},ii=class{device;data=new Float32Array(116);bits=new Uint32Array(this.data.buffer);buffer;constructor(e){this.device=e,this.buffer=e.createBuffer({label:`frame uniforms`,size:464,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}setCamera(e,t,n,r,i,a,o){this.data.set(e,Z.viewProj),this.data.set(t,Z.invViewProj),this.setVec4(Z.cameraPos,n[0],n[1],n[2],i),this.data[Z.cameraDir]=r[0],this.data[Z.cameraDir+1]=r[1],this.data[Z.cameraDir+2]=r[2],this.setVec4(Z.clip,a,o,0,0)}setSeed(e){this.bits[Z.cameraDir+3]=e>>>0}setShadows(e){if(!e){this.setVec4(Z.shadowParams,0,0,0,0);return}this.data.set(e.viewProj[0],Z.shadowViewProj0),this.data.set(e.viewProj[1],Z.shadowViewProj1),this.setVec4(Z.shadowSplits,e.splitFar[0],e.splitFar[1],e.texelSize[0],e.texelSize[1]),this.setVec4(Z.shadowParams,1,e.blend,1/e.resolution,0)}setSky(e){let{lightDir:t,lightColor:n,sunDir:r,sunColor:i,zenith:a,horizon:o}=e;this.setVec4(Z.lightDir,t[0],t[1],t[2],e.lightIntensity),this.setVec4(Z.lightColor,n[0],n[1],n[2],e.daylight),this.setVec4(Z.sunDir,r[0],r[1],r[2],e.sunVisibility),this.setVec4(Z.sunColor,i[0],i[1],i[2],e.moonVisibility),this.setVec4(Z.skyZenith,a[0],a[1],a[2],e.starVisibility),this.setVec4(Z.skyHorizon,o[0],o[1],o[2],0)}setFog(e,t,n,r){this.setVec4(Z.fog,e,t,n,r)}setViewport(e,t){this.setVec4(Z.viewport,e,t,1/e,1/t)}upload(){this.device.queue.writeBuffer(this.buffer,0,this.data)}setVec4(e,t,n,r,i){this.data[e]=t,this.data[e+1]=n,this.data[e+2]=r,this.data[e+3]=i}},ai={seed:1337,radius:fr.radius,generationBatch:8,meshBatch:12,timeOfDay:.32,dayLength:600,fov:70,fogDensity:1,shadows:!0},oi=8,si=160,ci=.75,li=120,ui=2,di=6,fi=2.1,pi=1.6,mi=class t{gpu;world;renderer;uniforms;overlay;options;camera=new re;input=new ce;controller;player=new tr;mode=`freecam`;timeOfDay;timePaused=!1;paused=!1;attract=!1;physicsReady=!1;playerWorld;chunks;fluids;delta;timer=new Rr;genStaging;meshStaging;raf=0;running=!1;framesInFlight=0;completedFrames=0;startTime=-1;hotbar=new Mr;mining=new le;particles=new me;sound=null;crackStage=-1;blocksBroken=0;blocksPlaced=0;lastBurstSize=0;shadowsEnabled;fogEnd=0;fogDensityScale=1;stepDistance=0;swimDistance=0;wasInWater=!1;wasGrounded=!0;fallSpeed=0;moveIntent={forward:0,strafe:0,vertical:0,boost:!1};target=null;visibleChunks=0;draws={opaque:[],cutout:[],water:[],shadow:Array.from({length:2},()=>[])};cascadeSpheres=[];sortScratch=[];waterScratch=[];inflight=new Set;lastError=null;destroyed=!1;constructor(e,t,n,r,i,a,o){this.gpu=e,this.world=t,this.renderer=n,this.uniforms=r,this.overlay=i,this.options=a,this.chunks=new pr({radius:a.radius,voxelSlots:t.config.voxelSlots,meshSlots:t.config.meshSlots}),this.delta=o?.delta??new nr,this.chunks.edits=this.delta,this.fluids=new xr({getBlock:(e,t,n)=>this.chunks.getBlock(e,t,n),setBlock:(e,t,n,r)=>this.writeBlock(e,t,n,r)}),this.controller=new oe(this.camera,this.input),this.timeOfDay=Qr(a.timeOfDay),this.shadowsEnabled=a.shadows;let c=(e,t,n)=>{let r=this.chunks.getBlock(e,t,n);return r<0||g(r)};this.playerWorld={solid:c,water:(e,t,n)=>s(this.chunks.getBlock(e,t,n))},this.genStaging=new Kn(e.device,a.generationBatch*Y,3,`worldgen readback`),this.meshStaging=new Kn(e.device,a.meshBatch*3*4,4,`mesh readback`);let l=Math.max($t(0,0,a.seed),0)+12;this.camera.position[0]=.5,this.camera.position[1]=l,this.camera.position[2]=.5,this.camera.pitch=-.25,this.setFov(a.fov),this.fogEnd=a.radius*32-8,this.camera.far=Math.max(600,this.fogEnd*1.6),this.setFogDensity(a.fogDensity),r.setSeed(a.seed),o?.player&&this.restore(o.player)}static async create(e,n,r={},i=null){let a={...ai,...r},o=Math.ceil(Math.PI*(a.radius+2)*(a.radius+2)),s=fr.maxChunkY-fr.minChunkY+1,c=Hn(e.device.limits,{voxelSlots:o*s,meshSlots:Math.ceil(o*s*.6)}),l=await Un.create(e.device,{...c,maxGenJobs:a.generationBatch,maxMeshJobs:a.meshBatch,seed:a.seed}),u=new ii(e.device),d=await Gn.create(e.device,e.format,l,u.buffer),f=n?new ri(n):null,p=new t(e,l,d,u,f,a,i);return p.input.attach(e.canvas),p}start(){this.running||(this.running=!0,this.raf=requestAnimationFrame(this.frame))}stop(){this.running=!1,cancelAnimationFrame(this.raf)}async flush(){for(await this.gpu.device.queue.onSubmittedWorkDone();this.inflight.size>0;)await Promise.all([...this.inflight])}get placeBlock(){return this.hotbar.block}setFov(e){this.options.fov=Math.min(110,Math.max(30,e)),this.camera.fovY=this.options.fov*Math.PI/180}setFogDensity(e){this.fogDensityScale=Math.min(4,Math.max(0,e)),this.options.fogDensity=this.fogDensityScale,this.uniforms.setFog(this.fogEnd,.8/this.fogEnd*this.fogDensityScale,.02,0)}frame=e=>{if(this.running){this.raf=requestAnimationFrame(this.frame);try{this.step(e)}catch(e){throw this.lastError=e,this.stop(),e}}};step(e){if(this.framesInFlight>=ui)return;this.startTime<0&&(this.startTime=e);let t=this.timer.tick(e);this.gpu.resize()&&this.uniforms.setViewport(this.gpu.width,this.gpu.height),this.camera.aspect=this.gpu.aspect;let n=!this.paused&&!this.attract;n?(this.handleHotkeys(),this.controller.look(),this.mode===`walk`?(this.hotbar.scroll(Math.sign(this.input.consumeWheel())),this.updatePlayer(t)):this.controller.move(t)):(this.input.consumePresses(),this.input.consumeClicks(),this.input.consumeWheel(),this.input.consumeMouse([0,0]),this.attract&&(this.camera.yaw+=t*.04)),!this.paused&&!this.timePaused&&this.options.dayLength>0&&(this.timeOfDay=Qr(this.timeOfDay+t/this.options.dayLength));let r=ei(this.timeOfDay);this.uniforms.setSky(r),this.camera.updateMatrices(),this.updateTarget(),n?(this.handleClicks(),this.updateMining(t),this.fluids.update(t)):this.crackStage=-1,this.updateShadows(r.lightDir,r.lightIntensity);let i=this.camera.position;this.chunks.updateCenter(P(i[0]),P(i[1]),P(i[2])),this.chunks.processLighting(di);let a=this.gpu.device;for(let e of this.chunks.takeUploads())this.world.uploadChunk(e.voxelSlot,e.data);let o=a.createCommandEncoder({label:`frame`}),s=[],c=null;this.genStaging.available>0&&(s=this.chunks.nextGenerationBatch(this.options.generationBatch),s.length>0&&(c=this.genStaging.acquire())),this.world.encodeGeneration(o,s,c);let l=[],u=null;this.meshStaging.available>0&&(l=this.chunks.nextMeshBatch(this.options.meshBatch),l.length>0&&(u=this.meshStaging.acquire())),this.world.encodeMeshing(o,l,u),this.buildDrawLists(),this.uniforms.setCamera(this.camera.viewProjection,this.camera.inverseViewProjection,i,this.camera.forward,(e-this.startTime)/1e3,this.camera.near,this.camera.far),this.uniforms.upload(),this.renderer.simulateParticles(o,this.paused?0:t);let d=this.gpu.currentColorView(),f=this.target;this.renderer.render(o,d,this.gpu.depthView,this.draws,{target:f&&n?[f.x,f.y,f.z]:null,crackStage:this.crackStage}),a.queue.submit([o.finish()]),this.framesInFlight++,a.queue.onSubmittedWorkDone().then(()=>{this.framesInFlight--,this.completedFrames++},()=>{this.framesInFlight--}),c&&this.track(this.readGeneration(c,s)),u&&this.track(this.readMeshCounts(u,l)),this.overlay?.update(this.collectStats(),e)}track(e){let t=e.catch(e=>{this.destroyed||(this.lastError=e,console.error(e))}).finally(()=>this.inflight.delete(t));this.inflight.add(t)}readGeneration(e,t){return this.genStaging.read(e,t.length*Y,e=>{let n=new Uint32Array(e);t.forEach((e,t)=>{this.chunks.completeGeneration(e,Pt.fromGpuLayout(n,t*jt))})})}readMeshCounts(e,t){return this.meshStaging.read(e,t.length*3*4,e=>{let n=new Uint32Array(e);t.forEach((e,t)=>{this.chunks.completeMesh(e,n[t*3],n[t*3+1],n[t*3+2])})})}buildDrawLists(){let e=this.sortScratch,t=this.waterScratch;e.length=0,t.length=0,this.draws.cutout.length=0;for(let e of this.draws.shadow)e.length=0;let n=this.camera.frustum,r=this.camera.position,i=16*Math.sqrt(3),a=0;for(let o of this.chunks.drawable()){let s=o.cx*32,c=o.cy*32,l=o.cz*32;if(o.opaqueQuads!==0&&this.cascadeSpheres.forEach((e,t)=>{Math.hypot(s+16-e.center[0],c+16-e.center[1],l+16-e.center[2])<=e.radius+i&&this.draws.shadow[t].push(o.meshSlot)}),!n.intersectsAabb(s,c,l,s+32,c+32,l+32))continue;a++;let u=s+16-r[0],d=c+16-r[1],f=l+16-r[2],p=u*u+d*d+f*f;o.opaqueQuads!==0&&e.push({slot:o.meshSlot,d:p}),o.waterQuads!==0&&t.push({slot:o.meshSlot,d:p}),o.cutoutQuads!==0&&this.draws.cutout.push(o.meshSlot)}e.sort((e,t)=>e.d-t.d),t.sort((e,t)=>t.d-e.d),this.draws.opaque.length=0,this.draws.water.length=0;for(let t of e)this.draws.opaque.push(t.slot);for(let e of t)this.draws.water.push(e.slot);this.visibleChunks=a}updateShadows(e,t){let n=this.camera;if(!this.shadowsEnabled||t<=.01||e[1]<.03){this.cascadeSpheres=[],this.uniforms.setShadows(null);return}let r=n.forward,i=n.right,a=[i[1]*r[2]-i[2]*r[1],i[2]*r[0]-i[0]*r[2],i[0]*r[1]-i[1]*r[0]],o=Math.min(si,this.options.radius*32),s=Dr({position:n.position,forward:r,right:i,up:a,fovY:n.fovY,aspect:n.aspect},e,n.near,o,2,ci,Wn,li);this.cascadeSpheres=s.map(e=>({center:e.center,radius:e.radius+li})),this.uniforms.setShadows({viewProj:[s[0].viewProj,s[1].viewProj],splitFar:[s[0].far,s[1].far],texelSize:[s[0].texelSize,s[1].texelSize],resolution:Wn,blend:.15})}writeBlock(e,t,n,r){return this.chunks.setBlock(e,t,n,r)?(this.delta.record(e,t,n,r),!0):!1}editBlock(e,t,n,r){return this.writeBlock(e,t,n,r)?(this.fluids.scheduleAround(e,t,n),!0):!1}updateMining(e){let t=this.target,n=this.mining.update(e,this.input.isButtonDown(0),t?{x:t.x,y:t.y,z:t.z,block:t.block}:null);this.crackStage=n.stage,n.broken&&this.breakBlock(n.broken.x,n.broken.y,n.broken.z)}breakBlock(t,n,r){let i=this.chunks.getBlock(t,n,r);if(i<=0||s(i)||!this.editBlock(t,n,r,e.Air))return!1;let a=n-8;for(let e=n-1;e>=n-8;e--){let n=this.chunks.getBlock(t,e,r);if(n<0||g(n)){a=e+1;break}}let o=this.particles.spawnBurst(i,t,n,r,a);return this.renderer.uploadParticles(this.particles.data,o),this.blocksBroken++,this.lastBurstSize=o.reduce((e,t)=>e+t.count,0),this.hotbar.collect(i),this.sound?.breakBlock(S(i)),this.updateTarget(),!0}placeAt(e,t,n){let r=this.chunks.getBlock(e,t,n),i=this.placeBlock;return r<0||!v(r)||r===i||this.hotbar.count<=0||this.mode===`walk`&&g(i)&&Zn(this.player.bounds(),(r,i,a)=>r===e&&i===t&&a===n)||!this.editBlock(e,t,n,i)?!1:(this.hotbar.consume(),this.blocksPlaced++,this.sound?.placeBlock(S(i)),!0)}updateTarget(){let e=this.camera.position,t=this.camera.forward;this.target=Sr(e[0],e[1],e[2],t[0],t[1],t[2],oi,(e,t,n)=>this.chunks.getBlock(e,t,n),_)}handleHotkeys(){for(let e of this.input.consumePresses()){let t=Mr.slotForKey(e);t>=0?this.hotbar.select(t):e===`KeyV`?this.setMode(this.mode===`walk`?`freecam`:`walk`):e===`KeyT`?this.timePaused=!this.timePaused:e===`KeyG`?this.shadowsEnabled=!this.shadowsEnabled:e===`BracketRight`?this.timeOfDay=Qr(this.timeOfDay+1/24):e===`BracketLeft`&&(this.timeOfDay=Qr(this.timeOfDay-1/24))}}setMode(e){if(e===this.mode)return;let t=this.camera.position;e===`walk`?(this.player.setFromEye(t[0],t[1],t[2]),this.player.resolveEmbedded(this.playerWorld.solid)):this.controller.velocity.set(this.player.velocity),this.mode=e}updatePlayer(e){let t=this.player.position,n=Math.floor(t[0]),r=Math.floor(t[1]),i=Math.floor(t[2]);if(this.physicsReady=this.chunks.getBlock(n,r,i)>=0&&this.chunks.getBlock(n,r-1,i)>=0,this.physicsReady){let n=[t[0],t[2]],r=ie(this.input,this.moveIntent);this.player.update(e,{forward:r.forward,strafe:r.strafe,jump:this.input.isDown(`Space`),sprint:r.boost},this.camera.yaw,this.playerWorld),this.updateFootsteps(Math.hypot(t[0]-n[0],t[2]-n[1]))}this.player.eye(this.camera.position)}updateFootsteps(e){let t=this.player,n=t.position,r=t.velocity[1];if(t.inWater&&!this.wasInWater&&(this.sound?.splash(Math.min(1,.25+Math.max(0,-this.fallSpeed)/14)),this.swimDistance=0),t.inWater)this.swimDistance+=e,this.swimDistance>pi&&(this.swimDistance=0,this.sound?.splash(.2));else if(t.grounded){let t=this.chunks.getBlock(Math.floor(n[0]),Math.floor(n[1]-.05),Math.floor(n[2]));!this.wasGrounded&&this.fallSpeed<-7&&t>0&&this.sound?.footstep(S(t),Math.min(1.5,-this.fallSpeed/12)),this.stepDistance+=e,this.stepDistance>fi&&t>0&&(this.stepDistance=0,this.sound?.footstep(S(t),.8))}this.wasInWater=t.inWater,this.wasGrounded=t.grounded,this.fallSpeed=r}handleClicks(){for(let e of this.input.consumeClicks()){let t=this.target;t&&e===2&&(this.placeAt(t.x+t.nx,t.y+t.ny,t.z+t.nz),this.updateTarget())}}snapshot(){let e=this.camera.position;return{position:[e[0],e[1],e[2]],yaw:this.camera.yaw,pitch:this.camera.pitch,mode:this.mode,timeOfDay:this.timeOfDay,hotbar:this.hotbar.save()}}restore(e){this.camera.position.set(e.position),this.camera.yaw=e.yaw,this.camera.setPitch(e.pitch),this.timeOfDay=Qr(e.timeOfDay),this.hotbar.load(e.hotbar),e.mode===`walk`&&(this.mode=`walk`,this.player.setFromEye(e.position[0],e.position[1],e.position[2]))}collectStats(){let e=this.chunks.countByState(),t=0,n=0,i=0,a=0;for(let e of this.chunks.drawable()){t++;let r=Math.max(0,e.opaqueQuads),a=Math.max(0,e.waterQuads),o=Math.max(0,e.cutoutQuads);(r>6144||a>1024||o>2048)&&i++,n+=(Math.min(r,ke)+Math.min(a,Ae)+Math.min(o,je))*4}for(let e of this.chunks.chunks.values())e.data&&(a+=e.data.dataByteLength+e.light.byteLength+64);let o=this.camera.position,s=this.mode===`walk`?this.player.velocity:this.controller.velocity,c=this.target,l=this.chunks.getLight(Math.floor(o[0]),Math.floor(o[1]),Math.floor(o[2]));return{fps:this.timer.fps,frameMs:this.timer.frameMs,chunksLoaded:e.ready,chunksPending:e.pending,chunksGenerating:e.generating,meshQueue:this.chunks.meshQueueSize,lightQueue:this.chunks.lightQueueSize,fluidCells:this.fluids.queued,meshedChunks:t,visibleChunks:this.visibleChunks,vertices:n,triangles:n/2,overflowChunks:i,voxelSlotsUsed:this.chunks.voxelSlots.used,voxelSlotsTotal:this.chunks.voxelSlots.capacity,meshSlotsUsed:this.chunks.meshSlots.used,meshSlotsTotal:this.chunks.meshSlots.capacity,gpuMemoryMB:this.world.allocatedBytes/1048576,cpuVoxelKB:a/1024,camera:{x:o[0],y:o[1],z:o[2],yaw:this.camera.yaw,pitch:this.camera.pitch},chunk:{x:P(o[0]),y:P(o[1]),z:P(o[2])},speed:Math.hypot(s[0],s[1],s[2]),mode:this.mode===`walk`?`Walking (V)`:`Freecam (V)`,grounded:this.mode===`walk`?this.physicsReady?this.player.inWater?`swimming`:this.player.grounded?`grounded`:`airborne`:`waiting for terrain`:`—`,timeOfDay:`${ti(this.timeOfDay)}${this.timePaused?` (paused)`:``}`,target:c?`${r[c.block]} @ ${c.x}, ${c.y}, ${c.z}`:`—`,placeBlock:`${this.hotbar.selected+1}: ${Ar(this.placeBlock)} × ${this.hotbar.count}`,biome:Rt[Wt(Math.floor(o[0]),Math.floor(o[2]),this.options.seed).biome],light:`sky ${mn(l)} · block ${hn(l)}`,mining:this.crackStage>=0?`${Math.round(this.mining.progress*100)} % (stage ${this.crackStage})`:`—`,particles:this.particles.alive(),shadows:this.cascadeSpheres.length>0?`2 cascades`:`off`,edits:this.delta.editCount,seed:this.options.seed}}async shutdown(){this.stop();try{await this.flush()}catch{}this.destroy()}destroy(){this.destroyed=!0,this.stop(),this.input.detach(),this.genStaging.destroy(),this.meshStaging.destroy(),this.renderer.destroy(),this.uniforms.buffer.destroy(),this.world.destroy()}},hi=240;function gi(t,n=new Uint8Array(Fe)){let r={dx:0,dy:0,dz:0,lx:0,ly:0,lz:0};for(let i=0;i<L;i++)for(let a=0;a<L;a++)for(let o=0;o<L;o++){Ee(o-1,a-1,i-1,r);let s=t[Te(r.dx,r.dy,r.dz)];n[Le(o,a,i)]=s?s.getLocal(r.lx,r.ly,r.lz):e.Air}return n}var _i=5,vi=8160;function yi(e,t){return Math.floor((e*2+t)/(t*2))}function bi(t,n){let r={opaque:[],water:[],cutout:[],opaqueLight:[],waterLight:[],cutoutLight:[]},i=new Uint32Array(1024),a=new Uint32Array(1024),c=[0,0,0],l=[0,0,0],u=(e,n,r)=>t[Le(e+1,n+1,r+1)],d=(e,t,r)=>n?n[Le(e+1,t+1,r+1)]:hi,f=(e,t,n)=>+!!o(u(e,t,n));for(let t=0;t<6;t++){let n=t>>1,o=(n+1)%3,p=(n+2)%3,m=t&1?-1:1;for(let h=0;h<32;h++){i.fill(0),a.fill(0);for(let r=0;r<32;r++){let g=0,_=0,v=0;for(let y=0;y<=32;y++){let b=0,S=0;if(y<32){c[n]=h,c[o]=y,c[p]=r;let i=u(c[0],c[1],c[2]);l[0]=c[0],l[1]=c[1],l[2]=c[2],l[n]=l[n]+m;let a=u(l[0],l[1],l[2]);i!==e.Air&&x(i,a,t)&&(b=i|(s(i)?vi:Si(l,o,p,f)),S=Ci(l,o,p,f,d))}(b!==g||S!==_)&&(g!==0&&(i[r*32+v]=g|y-v<<16,a[r*32+v]=_),g=b,_=S,v=y)}}for(let e=0;e<32;e++){let n=0,o=0,s=0;for(let c=0;c<=32;c++){let l=c<32?i[c*32+e]:0,u=c<32?a[c*32+e]:0;(n===0||l!==n||u!==o)&&(n!==0&&wi(t,h,e,s,n>>>16,c-s,n&65535,o,r),n=l,o=u,s=c)}}}}for(let e=0;e<32;e++)for(let t=0;t<32;t++)for(let n=0;n<32;n++){let i=u(n,t,e);if(h(i)){xi(n,t,e,i,r.cutout);let a=d(n,t,e),o=Oe(a,a,a,a);r.cutoutLight.push(o,o)}}return{opaque:Uint32Array.from(r.opaque),water:Uint32Array.from(r.water),cutout:Uint32Array.from(r.cutout),opaqueLight:Uint32Array.from(r.opaqueLight),waterLight:Uint32Array.from(r.waterLight),cutoutLight:Uint32Array.from(r.cutoutLight),opaqueQuads:r.opaque.length/4,waterQuads:r.water.length/4,cutoutQuads:r.cutout.length/4}}function xi(e,t,n,r,i){i.push(I(e,t,n,6,3,r),I(e+1,t,n+1,6,3,r),I(e+1,t+1,n+1,6,3,r),I(e,t+1,n,6,3,r),I(e+1,t,n,7,3,r),I(e,t,n+1,7,3,r),I(e,t+1,n+1,7,3,r),I(e+1,t+1,n,7,3,r))}function Si(e,t,n,r){let i=0,a=[0,0,0];for(let o=0;o<4;o++){let s=o===1||o===2?1:-1,c=o>=2?1:-1;a[0]=e[0],a[1]=e[1],a[2]=e[2],a[t]=a[t]+s;let l=r(a[0],a[1],a[2]);a[t]=e[t],a[n]=a[n]+c;let u=r(a[0],a[1],a[2]);a[t]=a[t]+s;let d=r(a[0],a[1],a[2]),f=l&&u?0:3-(l+u+d);i|=f<<_i+o*2}return i}function Ci(e,t,n,r,i){let a=i(e[0],e[1],e[2]),o=[0,0,0],s=0;for(let c=0;c<4;c++){let l=c===1||c===2?1:-1,u=c>=2?1:-1,d=a>>4,f=a&15,p=1,m=()=>{let e=i(o[0],o[1],o[2]);d+=e>>4,f+=e&15,p++};o[0]=e[0],o[1]=e[1],o[2]=e[2],o[t]=o[t]+l;let h=r(o[0],o[1],o[2]);h||m(),o[t]=e[t],o[n]=o[n]+u;let g=r(o[0],o[1],o[2]);g||m(),o[t]=o[t]+l,!r(o[0],o[1],o[2])&&!(h&&g)&&m(),s|=(yi(d,p)<<4|yi(f,p))<<c*8}return s>>>0}function wi(e,t,n,r,i,o,s,c,l){let u=e>>1,d=(u+1)%3,f=(u+2)%3,p=(e&1)==1,m=s&31,h=[0,1,2,3].map(e=>s>>_i+e*2&3),g=p?t:t+1,_=p?[0,3,2,1]:[0,1,2,3],v=h[0]+h[2]<h[1]+h[3],y=a(m),b=y===`water`?l.water:y===`cutout`?l.cutout:l.opaque,x=y===`water`?l.waterLight:y===`cutout`?l.cutoutLight:l.opaqueLight,S=[0,0,0],C=[0,0,0,0];for(let t=0;t<4;t++){let a=_[t+ +!!v&3],s=+(a===1||a===2),l=+(a>=2);S[u]=g,S[d]=n+s*i,S[f]=r+l*o,b.push(I(S[0],S[1],S[2],e,h[a],m)),C[t]=c>>>a*8&255}x.push(Oe(C[0],C[1],C[2],C[3]))}function Ti(e,t=32){let n={chunksCompared:0,voxelsCompared:0,voxelMismatches:0,meshesCompared:0,meshMismatches:[]},r=e.chunks;for(let i of r.chunks.values()){if(n.chunksCompared>=t)break;if(i.state!==`ready`||!i.data)continue;let a=i.data.toDense(),o=cn(i.cx,i.cy,i.cz,e.options.seed);for(let e=0;e<a.length;e++)a[e]!==o[e]&&n.voxelMismatches++;if(n.voxelsCompared+=a.length,n.chunksCompared++,i.needsMesh||i.meshVersion===0||i.opaqueQuads<0)continue;let s=[],c=!0;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++)for(let n=-1;n<=1;n++){let a=i.cy+t,o=r.chunks.get(F(i.cx+n,a,i.cz+e));a>=r.config.minChunkY&&a<=r.config.maxChunkY&&(!o||o.state!==`ready`)&&(c=!1),s.push(o&&o.state===`ready`&&o.data?o.data:null)}if(!c)continue;let l=bi(gi(s),An(r.neighborLight(i)));n.meshesCompared++,(l.opaqueQuads!==i.opaqueQuads||l.waterQuads!==i.waterQuads||l.cutoutQuads!==i.cutoutQuads)&&n.meshMismatches.push({chunk:[i.cx,i.cy,i.cz],gpu:[i.opaqueQuads,i.waterQuads,i.cutoutQuads],cpu:[l.opaqueQuads,l.waterQuads,l.cutoutQuads]})}return n}function Ei(e){let t={engine:e,stats:()=>e.collectStats(),settled:()=>{let t=e.chunks.center,n=e.camera.position;if(t.x!==P(n[0])||t.z!==P(n[2]))return!1;let r=e.chunks.countByState();return r.pending===0&&r.generating===0&&e.chunks.meshQueueSize===0&&e.chunks.lightQueueSize===0&&e.fluids.queued===0&&[...e.chunks.drawable()].every(e=>e.opaqueQuads>=0)},parity:t=>Ti(e,t),teleport:(t,n,r,i,a)=>{e.camera.position[0]=t,e.camera.position[1]=n,e.camera.position[2]=r,e.controller.velocity.fill(0),i!==void 0&&(e.camera.yaw=i),a!==void 0&&e.camera.setPitch(a)},setBlock:(t,n,r,i)=>e.editBlock(t,n,r,i),place:(t,n,r)=>e.placeAt(t,n,r),block:(t,n,r)=>e.chunks.getBlock(t,n,r),light:(t,n,r)=>{let i=e.chunks.getLight(t,n,r);return{sky:i>>4,block:i&15}},surfaceAt:(t,n)=>{let r=(e.chunks.config.maxChunkY+1)*32-1,i=e.chunks.config.minChunkY*32;for(let a=r;a>=i;a--)if(o(e.chunks.getBlock(t,a,n)))return a;return null},setMode:t=>e.setMode(t),breakBlock:(t,n,r)=>e.breakBlock(t,n,r),findBiome:t=>{let n=e.options.seed;for(let e=0;e<4e3;e+=48){let r=Math.max(1,Math.floor(2*Math.PI*e/48));for(let i=0;i<r;i++){let a=i/r*Math.PI*2,o=Math.round(Math.cos(a)*e),s=Math.round(Math.sin(a)*e);if(Wt(o,s,n).biome===t&&$t(o,s,n)>6)return[o,s]}}return null},particlesAlive:()=>e.particles.alive(),setTime:(t,n=!0)=>{e.timeOfDay=t-Math.floor(t),e.timePaused=n},player:()=>{let t=e.player;return{x:t.position[0],y:t.position[1],z:t.position[2],grounded:t.grounded,inWater:t.inWater,embedded:Zn(t.bounds({minX:0,minY:0,minZ:0,maxX:0,maxY:0,maxZ:0}),(t,n,r)=>o(e.chunks.getBlock(t,n,r)))}},screenshot:async()=>{let t=await e.gpu.captureFrame(),n=document.createElement(`canvas`);return n.width=t.width,n.height=t.height,n.getContext(`2d`).putImageData(new ImageData(new Uint8ClampedArray(t.pixels),t.width,t.height),0,0),n.toDataURL(`image/png`)}};return globalThis.__voxel=t,t}var Di=class{data=new Map;async get(e){return this.data.get(e)}async putMany(e){for(let[t,n]of e)this.data.set(t,n instanceof Uint8Array?n.slice():structuredClone(n))}async entries(e){return[...this.data].filter(([t])=>t.startsWith(e))}async clear(){this.data.clear()}};function Oi(e){return new Promise((t,n)=>{e.onsuccess=()=>t(e.result),e.onerror=()=>n(e.error??Error(`IndexedDB request failed`))})}function ki(e){return new Promise((t,n)=>{e.oncomplete=()=>t(),e.onabort=()=>n(e.error??Error(`IndexedDB transaction aborted`)),e.onerror=()=>n(e.error??Error(`IndexedDB transaction failed`))})}var Ai=class e{db;storeName;constructor(e,t){this.db=e,this.storeName=t}static async open(t=`webgpu-voxel-engine`,n=`world`){if(typeof indexedDB>`u`)throw Error(`IndexedDB is not available`);let r=indexedDB.open(t,1);r.onupgradeneeded=()=>{r.result.objectStoreNames.contains(n)||r.result.createObjectStore(n)};let i=await Oi(r);return new e(i,n)}async get(e){return Oi(this.db.transaction(this.storeName,`readonly`).objectStore(this.storeName).get(e))}async putMany(e){if(e.length===0)return;let t=this.db.transaction(this.storeName,`readwrite`),n=t.objectStore(this.storeName);for(let[t,r]of e)n.put(r,t);await ki(t)}async entries(e){let t=this.db.transaction(this.storeName,`readonly`).objectStore(this.storeName),n=IDBKeyRange.bound(e,`${e}￿`),[r,i]=await Promise.all([Oi(t.getAllKeys(n)),Oi(t.getAll(n))]);return r.map((e,t)=>[String(e),i[t]])}async clear(){let e=this.db.transaction(this.storeName,`readwrite`);e.objectStore(this.storeName).clear(),await ki(e)}close(){this.db.close()}};function ji(e){let t=e;return!!t&&Array.isArray(t.position)&&t.position.length===3&&t.position.every(Number.isFinite)&&Number.isFinite(t.yaw)&&Number.isFinite(t.pitch)&&(t.mode===`walk`||t.mode===`freecam`)&&Number.isFinite(t.timeOfDay)&&!!t.hotbar&&Array.isArray(t.hotbar.counts)}var Mi=class{kv;seed;prefix;constructor(e,t){this.kv=e,this.seed=t,this.prefix=`w${t>>>0}/`}async load(){let e=new nr;for(let[t,n]of await this.kv.entries(`${this.prefix}c/`)){let r=t.slice(this.prefix.length+2);if(ir(r)&&n instanceof Uint8Array)try{e.load(r,ur(n))}catch(e){console.warn(`skipping corrupt chunk record ${t}:`,e)}}let t=await this.kv.get(`${this.prefix}player`);return{delta:e,player:ji(t)?t:null}}async save(e,t){let n=e.takeDirty(),r=n.map(([e,t])=>[`${this.prefix}c/${e}`,t]);t&&r.push([`${this.prefix}player`,t]);try{await this.kv.putMany(r)}catch(t){throw e.markDirty(n.map(([e])=>e)),t}return n.length}async reset(){await this.kv.clear()}},Ni={volume:[0,1],fov:[60,110],renderDistance:[4,14],fogDensity:[.25,2]},Pi={volume:.7,fov:75,renderDistance:8,shadows:!0,fogDensity:1},Fi=`voxel.settings.v1`,Ii=`voxel.seed.v1`;function Li(e,[t,n],r,i=!1){let a=typeof e==`number`?e:typeof e==`string`?Number(e):NaN;if(!Number.isFinite(a))return r;let o=Math.min(n,Math.max(t,a));return i?Math.round(o):o}function Ri(e){let t=e&&typeof e==`object`?e:{};return{volume:Li(t.volume,Ni.volume,Pi.volume),fov:Li(t.fov,Ni.fov,Pi.fov,!0),renderDistance:Li(t.renderDistance,Ni.renderDistance,Pi.renderDistance,!0),shadows:typeof t.shadows==`boolean`?t.shadows:Pi.shadows,fogDensity:Li(t.fogDensity,Ni.fogDensity,Pi.fogDensity)}}function zi(){try{return typeof localStorage>`u`?null:localStorage}catch{return null}}function Bi(e=zi()){try{let t=e?.getItem(Fi);return Ri(t?JSON.parse(t):null)}catch{return{...Pi}}}function Vi(e,t=zi()){try{t?.setItem(Fi,JSON.stringify(e))}catch{}}function Hi(e){let t=e.trim();if(t===``)return null;if(/^-?\d+$/.test(t))return Math.abs(Number.parseInt(t,10))%2147483648;let n=2166136261;for(let e=0;e<t.length;e++)n^=t.charCodeAt(e),n=Math.imul(n,16777619);return(n>>>0)%2147483648}function Ui(e=Math.random){return Math.floor(e()*2147483647)}function Wi(e=zi()){try{let t=e?.getItem(Ii);return t?Hi(t):null}catch{return null}}function Gi(e,t=zi()){try{t?.setItem(Ii,String(e))}catch{}}var Ki=3e4;function Q(e){let t=document.getElementById(e);if(!t)throw Error(`missing #${e}`);return t}var qi=class{gpu;options;engine=null;state=`loading`;sound=new w;settings=Bi();store=null;kv=null;persistent=!0;hotbar=null;hadLock=!1;saving=null;busy=!1;resetArmed=0;toastTimer=0;freshWorld=!1;debugVisible=!1;saves=0;canvas;el={hud:Q(`hud`),hotbar:Q(`hotbar`),toast:Q(`toast`),stats:Q(`stats`),title:Q(`title`),seedInput:Q(`seed-input`),randomSeed:Q(`random-seed`),play:Q(`play`),status:Q(`title-status`),progress:Q(`title-progress`),pause:Q(`pause`),resume:Q(`resume`),seedDisplay:Q(`seed-display`),volume:Q(`set-volume`),fov:Q(`set-fov`),distance:Q(`set-distance`),shadows:Q(`set-shadows`),fog:Q(`set-fog`),volumeValue:Q(`volume-value`),fovValue:Q(`fov-value`),distanceValue:Q(`distance-value`),fogValue:Q(`fog-value`),distanceNote:Q(`distance-note`),quit:Q(`quit`),reset:Q(`reset`),pauseNote:Q(`pause-note`),saveState:Q(`save-state`)};constructor(e,t){this.gpu=e,this.options=t,this.canvas=e.canvas,globalThis.__game=this}async boot(){try{this.kv=await Ai.open()}catch(e){console.warn(`IndexedDB unavailable, progress will not be saved:`,e),this.kv=new Di,this.persistent=!1}this.bindUi(),this.sound.setVolume(this.settings.volume);let e=this.options.seed??Wi()??1337;this.el.seedInput.value=String(e),await this.openWorld(e),this.options.autostart?this.enterPlaying():this.setState(`title`),window.setInterval(()=>{(this.state===`playing`||this.state===`paused`)&&this.save(!0)},Ki);let t=()=>{this.state!==`loading`&&this.save(!1)};document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`hidden`&&t()}),window.addEventListener(`pagehide`,t),requestAnimationFrame(this.tick)}get radius(){return this.options.radius??this.settings.renderDistance}async openWorld(e,t){this.busy=!0;try{if(this.engine){await this.save(!1);let e=this.engine;this.engine=null,await e.shutdown()}this.store=new Mi(this.kv,e);let n=t??await this.store.load();this.freshWorld=!n.player;let r=await mi.create(this.gpu,this.el.stats,{...this.options.engine,seed:e,radius:this.radius,fov:this.settings.fov,fogDensity:this.settings.fogDensity,shadows:this.settings.shadows},n);r.sound=this.sound,r.overlay&&(r.overlay.visible=this.debugVisible),r.attract=this.state===`title`||this.state===`loading`,r.paused=this.state===`paused`,this.engine=r,this.hotbar?this.hotbar.bind(r.hotbar):this.hotbar=new Lr(this.el.hotbar,r.hotbar),Ei(r),r.start(),Gi(e),this.el.seedDisplay.textContent=String(e)}finally{this.busy=!1}}async save(e){let t=this.engine,n=this.store;if(!t||!n)return 0;this.saving&&await this.saving.catch(()=>0),this.saving=n.save(t.delta,t.snapshot());try{let t=await this.saving;return this.saves++,e&&this.toast(this.persistent?`World saved${t>0?` · ${t} chunk${t===1?``:`s`} updated`:``}`:`Saving unavailable in this browser`),this.el.saveState.textContent=this.persistent?`Last saved ${new Date().toLocaleTimeString()}`:`Saving unavailable (private browsing?)`,t}catch(t){return console.error(`save failed`,t),e&&this.toast(`Save failed`),0}finally{this.saving=null}}setState(e){this.state=e,document.body.dataset.state=e;let t=this.engine;t&&(t.attract=e===`title`,t.paused=e===`paused`),this.el.title.hidden=e!==`title`,this.el.pause.hidden=e!==`paused`,this.el.hud.hidden=e!==`playing`&&e!==`paused`,e===`paused`&&this.syncSettingsUi(),e!==`paused`&&this.disarmReset()}enterPlaying(){this.freshWorld&&this.engine&&!this.options.autostart&&this.engine.setMode(`walk`),this.freshWorld=!1,this.setState(`playing`)}requestLock(){try{this.canvas.requestPointerLock()?.catch?.(()=>this.lockFailed())}catch{this.lockFailed()}}lockFailed(){this.state===`playing`&&!this.options.autostart&&(this.setState(`paused`),this.el.pauseNote.textContent=`Click Resume to grab the mouse again.`)}onLockChange=()=>{document.pointerLockElement===this.canvas?(this.hadLock=!0,this.el.pauseNote.textContent=``,(this.state===`paused`||this.state===`title`)&&this.enterPlaying()):this.state===`playing`&&this.hadLock&&(this.setState(`paused`),this.save(!0))};async play(){if(this.busy)return;this.sound.unlock();let e=Hi(this.el.seedInput.value)??Ui();this.el.seedInput.value=String(e),this.requestLock(),(!this.engine||e!==this.engine.options.seed)&&(this.el.status.textContent=`Generating world…`,await this.openWorld(e)),(this.state===`title`||this.state===`playing`)&&this.enterPlaying()}async resume(){if(!this.busy&&this.engine){if(this.sound.unlock(),this.requestLock(),this.radius!==this.engine.options.radius){this.el.pauseNote.textContent=`Applying render distance…`;let e={delta:this.engine.delta,player:this.engine.snapshot()};await this.openWorld(this.engine.options.seed,e),this.el.pauseNote.textContent=``}(this.options.autostart||document.pointerLockElement===this.canvas)&&this.enterPlaying()}}async quitToTitle(){await this.save(!0),document.pointerLockElement&&document.exitPointerLock(),this.el.seedInput.value=String(this.engine?.options.seed??``),this.setState(`title`)}disarmReset(){this.resetArmed=0,this.el.reset.textContent=`Reset World`,this.el.reset.classList.remove(`armed`)}async resetWorld(){if(this.busy||!this.engine||!this.kv)return;if(!this.resetArmed||performance.now()-this.resetArmed>4e3){this.resetArmed=performance.now(),this.el.reset.textContent=`Click again to erase all saves`,this.el.reset.classList.add(`armed`);return}this.disarmReset();let e=this.engine.options.seed;await this.saving?.catch(()=>0),await this.kv.clear();let t=this.engine;t.delta.clear(),this.engine=null,await t.shutdown(),this.setState(`title`),await this.openWorld(e,{delta:new nr,player:null}),this.toast(`World reset · local saves erased`)}bindUi(){let e=this.el;e.play.addEventListener(`click`,()=>void this.play()),e.seedInput.addEventListener(`keydown`,e=>{e.key===`Enter`&&this.play()}),e.randomSeed.addEventListener(`click`,()=>{e.seedInput.value=String(Ui())}),e.resume.addEventListener(`click`,()=>void this.resume()),e.quit.addEventListener(`click`,()=>void this.quitToTitle()),e.reset.addEventListener(`click`,()=>void this.resetWorld()),document.addEventListener(`pointerlockchange`,this.onLockChange),window.addEventListener(`keydown`,e=>{if(e.code===`F3`){e.preventDefault(),this.debugVisible=!this.debugVisible;let t=this.engine?.overlay;t&&(t.visible=this.debugVisible)}});let t=(e,[t,n],r)=>{e.min=String(t),e.max=String(n),e.step=String(r)};t(e.volume,[0,100],1),t(e.fov,Ni.fov,1),t(e.distance,Ni.renderDistance,1),t(e.fog,[Ni.fogDensity[0]*100,Ni.fogDensity[1]*100],5);let n=()=>{let t=this.settings;t.volume=Number(e.volume.value)/100,t.fov=Number(e.fov.value),t.renderDistance=Number(e.distance.value),t.shadows=e.shadows.checked,t.fogDensity=Number(e.fog.value)/100,Vi(t),this.sound.setVolume(t.volume);let n=this.engine;n&&(n.setFov(t.fov),n.setFogDensity(t.fogDensity),n.shadowsEnabled=t.shadows),this.renderSettingLabels()};for(let t of[e.volume,e.fov,e.distance,e.shadows,e.fog])t.addEventListener(`input`,n);this.syncSettingsUi()}syncSettingsUi(){let e=this.el,t=this.settings;this.engine&&(t.shadows=this.engine.shadowsEnabled),e.volume.value=String(Math.round(t.volume*100)),e.fov.value=String(t.fov),e.distance.value=String(t.renderDistance),e.shadows.checked=t.shadows,e.fog.value=String(Math.round(t.fogDensity*100)),this.renderSettingLabels()}renderSettingLabels(){let e=this.el,t=this.settings;e.volumeValue.textContent=`${Math.round(t.volume*100)}%`,e.fovValue.textContent=`${t.fov}°`,e.distanceValue.textContent=`${t.renderDistance} chunks`,e.fogValue.textContent=`${Math.round(t.fogDensity*100)}%`;let n=this.engine&&this.radius!==this.engine.options.radius;e.distanceNote.textContent=this.options.radius===null?n?`Applies when you resume (the world reloads around you)`:``:`Fixed by the URL (?radius=)`}toast(e){let t=this.el.toast;t.textContent=e,t.classList.add(`show`),window.clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>t.classList.remove(`show`),2600)}tick=()=>{if(requestAnimationFrame(this.tick),this.hotbar?.update(),this.state===`title`&&this.engine){let e=this.engine.chunks.countByState(),t=e.pending+e.generating+e.ready,n=t===0?0:e.ready/t,r=this.engine.chunks.meshQueueSize+this.engine.chunks.lightQueueSize,i=n>=1&&r===0;this.el.progress.style.width=`${Math.round(n*100)}%`,this.el.status.textContent=this.busy?`Generating world…`:i?`World ready · seed ${this.engine.options.seed}`:`Generating terrain… ${Math.round(n*100)}%`,this.el.title.classList.toggle(`ready`,i)}}},Ji=document.querySelector(`#viewport`),Yi=document.querySelector(`#error`);function Xi(e,t){Yi.hidden=!1,Yi.querySelector(`h2`).textContent=e,Yi.querySelector(`p`).textContent=t}function Zi(e,t,n,r){let i=e.get(t),a=i===null?NaN:Number.parseInt(i,10);return Number.isFinite(a)?Math.min(r,Math.max(n,a)):null}function Qi(e,t){let n=Number.parseFloat(e.get(t)??``);return Number.isFinite(n)?n:null}var $=new URLSearchParams(location.search),$i=$.get(`offscreen`)===`1`,ea={},ta=Zi($,`gen`,1,32),na=Zi($,`mesh`,1,64),ra=Qi($,`time`),ia=Qi($,`daylen`);ta!==null&&(ea.generationBatch=ta),na!==null&&(ea.meshBatch=na),ea.timeOfDay=ra??ai.timeOfDay,ia!==null&&(ea.dayLength=ia);try{let e=await ge.create(Ji,{offscreen:$i}),t=e.device;t.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),Xi(`WebGPU validation error`,t)}),t.lost.then(e=>{console.error(`GPU device lost (${e.reason}): ${e.message}`),e.reason!==`destroyed`&&Xi(`GPU device lost`,`${e.message||String(e.reason)}\nReload the page to continue.`)}),await new qi(e,{autostart:$.get(`autostart`)===`1`||$i&&$.get(`autostart`)!==`0`,seed:Zi($,`seed`,0,2147483647),radius:Zi($,`radius`,2,24),engine:ea}).boot()}catch(e){console.error(e),e instanceof he?Xi(`WebGPU unavailable`,`${e.message}\nVoxel Frontier needs WebGPU: try a recent Chrome or Edge (113+), or Safari 26.`):Xi(`Failed to start`,e instanceof Error?e.message:String(e))}
//# sourceMappingURL=index-BHAExLeM.js.map