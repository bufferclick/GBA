// world.js — road network, graph, collision world, elevation

import * as THREE from 'three';
import { clamp, pick, rnd, rndi } from './utils.js';

export const CONFIG = {
  sunDir:    new THREE.Vector3(-0.42, 0.20, 0.88).normalize(),
  sunColor:  new THREE.Color(1.0, 0.62, 0.34),
  hemiSky:   new THREE.Color(0.42, 0.32, 0.62),
  hemiGround:new THREE.Color(0.30, 0.18, 0.26),
  fogColor:  new THREE.Color(0.30, 0.16, 0.27),
  fogDensity: 0.00085,
  waterY:    -1.2,
};

export const ROADS = [
  { x1:-120,z1:-240,x2:-120,z2:240 },
  { x1: 40, z1:-240,x2: 40, z2:240 },
  { x1: 200,z1:-240,x2: 200,z2:240 },
  { x1: 360,z1:-240,x2: 360,z2:240 },
  { x1:-120,z1:-240,x2: 360,z2:-240 },
  { x1:-120,z1: -80,x2: 360,z2: -80 },
  { x1:-120,z1:  80,x2: 360,z2:  80 },
  { x1:-120,z1: 240,x2: 360,z2: 240 },
  { x1:-440,z1:   0,x2:-120,z2:   0 },
  { x1:-300,z1:-140,x2:-300,z2: 140 },
  { x1:-440,z1:-140,x2:-440,z2: 140 },
  { x1:-440,z1:-140,x2:-300,z2:-140 },
  { x1:-440,z1: 140,x2:-300,z2: 140 },
];

export const ROAD_W = 13, LANE_OFF = 2.6, LANE_OUT = 4.9;
export const SIGNAL_NODES = ['40,-80','40,80','200,-80','200,80'];

export const Graph = { nodes: new Map(), edges: [] };

export function buildGraph() {
  const nodeAt = (x,z) => {
    const k = x+','+z;
    let n = Graph.nodes.get(k);
    if (!n) { n={x,z,k,edges:[],signal:SIGNAL_NODES.includes(k)}; Graph.nodes.set(k,n); }
    return n;
  };
  for (const r of ROADS) {
    const vert = r.x1===r.x2;
    const cuts = [];
    if (vert) {
      cuts.push(r.z1,r.z2);
      for (const o of ROADS) {
        if (o===r||o.z1!==o.z2) continue;
        if (o.z1>=Math.min(r.z1,r.z2)&&o.z1<=Math.max(r.z1,r.z2)&&r.x1>=Math.min(o.x1,o.x2)&&r.x1<=Math.max(o.x1,o.x2)) cuts.push(o.z1);
      }
      cuts.sort((a,b)=>a-b);
      for (let i=0;i<cuts.length-1;i++) {
        if (cuts[i]===cuts[i+1]) continue;
        const a=nodeAt(r.x1,cuts[i]),b=nodeAt(r.x1,cuts[i+1]);
        const e={a,b,len:Math.abs(cuts[i+1]-cuts[i]),fx:0,fz:1,vert:true,bridge:false};
        Graph.edges.push(e);a.edges.push(e);b.edges.push(e);
      }
    } else {
      cuts.push(r.x1,r.x2);
      for (const o of ROADS) {
        if (o===r||o.x1!==o.x2) continue;
        if (o.x1>=Math.min(r.x1,r.x2)&&o.x1<=Math.max(r.x1,r.x2)&&r.z1>=Math.min(o.z1,o.z2)&&r.z1<=Math.max(o.z1,o.z2)) cuts.push(o.x1);
      }
      cuts.sort((a,b)=>a-b);
      for (let i=0;i<cuts.length-1;i++) {
        if (cuts[i]===cuts[i+1]) continue;
        const a=nodeAt(cuts[i],r.z1),b=nodeAt(cuts[i+1],r.z1);
        const mid=(cuts[i]+cuts[i+1])/2;
        const e={a,b,len:cuts[i+1]-cuts[i],fx:1,fz:0,vert:false,bridge:r.z1===0&&mid>-276&&mid<-120};
        Graph.edges.push(e);a.edges.push(e);b.edges.push(e);
      }
    }
  }
}

export function edgePoint(e,t,dir,lane,out) {
  const fx=e.fx*dir,fz=e.fz*dir;
  const s=dir>0?t:e.len-t;
  out.x=e.a.x+e.fx*s+(-fz)*lane;
  out.z=e.a.z+e.fz*s+(fx)*lane;
  out.fx=fx;out.fz=fz;
  return out;
}
export function randomEdge(excludeBridge) {
  for (let i=0;i<40;i++){const e=pick(Graph.edges);if(!excludeBridge||!e.bridge)return e;}
  return Graph.edges[0];
}
export function nearestNode(x,z) {
  let best=null,bd=1e9;
  for (const n of Graph.nodes.values()){const d=(n.x-x)*(n.x-x)+(n.z-z)*(n.z-z);if(d<bd){bd=d;best=n;}}
  return best;
}

export const Signals = {
  CYCLE:26,GREEN:10,YELLOW:2.6,
  state(forNS){
    const half=this.CYCLE/2;
    let t=_tick().t%this.CYCLE;
    if(!forNS)t=(t+half)%this.CYCLE;
    if(t<this.GREEN)return 0;
    if(t<this.GREEN+this.YELLOW)return 1;
    return 2;
  },
};
// lazy import to avoid circular
let _tickRef=null;
function _tick(){if(!_tickRef){_tickRef=({t:0});import('./utils.js').then(m=>{_tickRef=m.Tick;});}return _tickRef;}

export function bridgeT(x){return clamp((x+140)/-130,0,1);}

export function groundHeightAt(x,z){
  if(x<-130&&x>-280&&Math.abs(z)<9)return Math.sin(Math.PI*bridgeT(x))*9;
  if(x>=64&&x<=148&&z>=-64&&z<=8)return 6;
  if(x>=47&&x<=64&&z>=-40&&z<=-24)return 6*(x-47)/17;
  if(x>=136&&x<=164){if(z>=256&&z<=348)return 2.5;if(z>248&&z<256)return 0.12+(2.5-0.12)*(z-248)/8;}
  if(z>249.5&&x>-136&&x<376){if(z<=292)return -2.2*(z-249.5)/42.5;return -2.2-(z-292)*0.12;}
  const onMain=x>=-136&&x<=376&&z>=-256&&z<=249.5;
  const onPort=x>=-470&&x<=-264&&z>=-190&&z<=190;
  if(!onMain&&!onPort)return -4.5;
  return 0;
}

export function isWaterAt(x,z){return groundHeightAt(x,z)<-1.35;}

export const Colliders = {
  boxes:[],grid:new Map(),CELL:26,_stamp:0,_seen:null,
  addBox(minX,minZ,maxX,maxZ,y0,y1){
    const idx=this.boxes.length;
    this.boxes.push({minX,minZ,maxX,maxZ,y0,y1});
    const c=this.CELL;
    for(let ix=Math.floor(minX/c);ix<=Math.floor(maxX/c);ix++)
      for(let iz=Math.floor(minZ/c);iz<=Math.floor(maxZ/c);iz++){
        const k=(ix+1024)*4096+(iz+1024);
        let arr=this.grid.get(k);if(!arr){arr=[];this.grid.set(k,arr);}
        arr.push(idx);
      }
    return idx;
  },
  finalize(){this._seen=new Int32Array(this.boxes.length);},
  _res:{x:0,z:0,hit:false,nx:0,nz:0},
  resolveCircle(px,pz,r,y0,y1){
    const res=this._res;
    res.x=px;res.z=pz;res.hit=false;res.nx=0;res.nz=0;
    const c=this.CELL;
    for(let ix=Math.floor((px-r)/c);ix<=Math.floor((px+r)/c);ix++)
      for(let iz=Math.floor((pz-r)/c);iz<=Math.floor((pz+r)/c);iz++){
        const arr=this.grid.get((ix+1024)*4096+(iz+1024));
        if(!arr)continue;
        for(let i=0;i<arr.length;i++){
          const b=this.boxes[arr[i]];
          if(y1<b.y0||y0>b.y1)continue;
          const cx=clamp(res.x,b.minX,b.maxX),cz=clamp(res.z,b.minZ,b.maxZ);
          let dx=res.x-cx,dz=res.z-cz,d2=dx*dx+dz*dz;
          if(d2>=r*r)continue;
          if(d2<1e-9){
            const pxl=res.x-b.minX,pxr=b.maxX-res.x,pzl=res.z-b.minZ,pzr=b.maxZ-res.z;
            const m=Math.min(pxl,pxr,pzl,pzr);
            if(m===pxl){res.x=b.minX-r;dx=-1;dz=0;}
            else if(m===pxr){res.x=b.maxX+r;dx=1;dz=0;}
            else if(m===pzl){res.z=b.minZ-r;dx=0;dz=-1;}
            else{res.z=b.maxZ+r;dx=0;dz=1;}
            res.hit=true;res.nx+=dx;res.nz+=dz;
          } else {
            const d=Math.sqrt(d2),push=(r-d)/d;
            res.x+=dx*push;res.z+=dz*push;
            res.hit=true;res.nx+=dx/d;res.nz+=dz/d;
          }
        }
      }
    if(res.hit){const n=Math.hypot(res.nx,res.nz)||1;res.nx/=n;res.nz/=n;}
    return res;
  },
  _rayN:{x:0,y:0,z:0},
  raycast(ox,oy,oz,dx,dy,dz,maxD){
    this._stamp++;
    const stamp=this._stamp,seen=this._seen;
    const c=this.CELL;
    let bestD=-1;
    const steps=Math.ceil(maxD/(c*0.5))+1;
    for(let s=0;s<=steps;s++){
      const t=Math.min(s*c*0.5,maxD);
      const wx=ox+dx*t,wz=oz+dz*t;
      const ix=Math.floor(wx/c),iz=Math.floor(wz/c);
      for(let jx=ix-1;jx<=ix+1;jx++)for(let jz=iz-1;jz<=iz+1;jz++){
        const arr=this.grid.get((jx+1024)*4096+(jz+1024));
        if(!arr)continue;
        for(let i=0;i<arr.length;i++){
          const bi=arr[i];if(seen[bi]===stamp)continue;seen[bi]=stamp;
          const b=this.boxes[bi];
          let tmin=0,tmax=maxD,nAxis=-1,nSign=0;
          if(Math.abs(dx)<1e-9){if(ox<b.minX||ox>b.maxX)continue;}
          else{let t1=(b.minX-ox)/dx,t2=(b.maxX-ox)/dx,sgn=-1;if(t1>t2){const tt=t1;t1=t2;t2=tt;sgn=1;}if(t1>tmin){tmin=t1;nAxis=0;nSign=sgn;}tmax=Math.min(tmax,t2);if(tmin>tmax)continue;}
          if(Math.abs(dy)<1e-9){if(oy<b.y0||oy>b.y1)continue;}
          else{let t1=(b.y0-oy)/dy,t2=(b.y1-oy)/dy,sgn=-1;if(t1>t2){const tt=t1;t1=t2;t2=tt;sgn=1;}if(t1>tmin){tmin=t1;nAxis=1;nSign=sgn;}tmax=Math.min(tmax,t2);if(tmin>tmax)continue;}
          if(Math.abs(dz)<1e-9){if(oz<b.minZ||oz>b.maxZ)continue;}
          else{let t1=(b.minZ-oz)/dz,t2=(b.maxZ-oz)/dz,sgn=-1;if(t1>t2){const tt=t1;t1=t2;t2=tt;sgn=1;}if(t1>tmin){tmin=t1;nAxis=2;nSign=sgn;}tmax=Math.min(tmax,t2);if(tmin>tmax)continue;}
          if(tmin<=0||tmin>maxD)continue;
          if(bestD<0||tmin<bestD){bestD=tmin;const N=this._rayN;N.x=nAxis===0?nSign:0;N.y=nAxis===1?nSign:0;N.z=nAxis===2?nSign:0;}
        }
      }
      if(bestD>=0&&bestD<t)break;
    }
    return bestD;
  },
  losBlocked(ax,ay,az,bx,by,bz){
    const dx=bx-ax,dy=by-ay,dz=bz-az,d=Math.hypot(dx,dy,dz);
    if(d<0.001)return false;
    const hit=this.raycast(ax,ay,az,dx/d,dy/d,dz/d,d);
    return hit>=0&&hit<d-0.5;
  },
};

export const CityData = { parkSpots:[], sidewalks:[], lightSpots:[], blocks:[] };
