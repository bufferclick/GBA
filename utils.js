// utils.js — shared math helpers and global tick state

export const clamp  = (v,a,b) => v<a?a:v>b?b:v;
export const lerp   = (a,b,t) => a+(b-a)*t;
export const damp   = (a,b,l,dt) => lerp(a,b,1-Math.exp(-l*dt));
export const rnd    = (a=1,b) => b===undefined ? Math.random()*a : a+Math.random()*(b-a);
export const rndi   = (a,b) => Math.floor(rnd(a,b+1));
export const pick   = arr => arr[(Math.random()*arr.length)|0];
export const wrapAngle = a => { while(a>Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; };
export const angleDamp = (a,b,l,dt) => a+wrapAngle(b-a)*(1-Math.exp(-l*dt));
export const sstep  = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

export const Tick = {
  t: 0, dt: 0, rawDt: 0,
  scale: 1, targetScale: 1,
  frame: 0,
};

// shared scratch objects (import where needed — never hold across await)
export const _v1 = new (await import('three').then(m=>m)).Vector3();
// ... (the full game uses these from the original; kept minimal here for the module boundary)
