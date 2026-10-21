// Millimetres, degrees. Row-major matrices. Shared by browser worker and Node checks.
export const D=Math.PI/180;
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const norm=a=>Math.hypot(...a);
export const mv=(a,v)=>a.map(r=>dot(r,v));
export const tr=a=>a[0].map((_,i)=>a.map(r=>r[i]));
export const mm=(a,b)=>a.map(r=>tr(b).map(c=>dot(r,c)));
export const eye=()=>[[1,0,0],[0,1,0],[0,0,1]];
export const rx=a=>{let c=Math.cos(a*D),s=Math.sin(a*D);return [[1,0,0],[0,c,-s],[0,s,c]]};
export const ry=a=>{let c=Math.cos(a*D),s=Math.sin(a*D);return [[c,0,s],[0,1,0],[-s,0,c]]};
export const rz=a=>{let c=Math.cos(a*D),s=Math.sin(a*D);return [[c,-s,0],[s,c,0],[0,0,1]]};
export const clamp=(a,lo,hi)=>Math.max(lo,Math.min(hi,a));
export const angle=(a,b)=>Math.acos(clamp(dot(a,b),-1,1))/D;
export function frames(c,u){
  const q=[u[0],u[1],.90*u[1],.42*u[1],u[2],u[3],.90*u[3]];
  const p=Array.from({length:8},()=>[0,0,0]),r=Array.from({length:8},eye);
  p[1]=[-c.lengths[1],0,0];r[1]=rz(-q[0]);
  for(let i=2;i<=4;i++){p[i]=add(p[i-1],mv(r[i-1],[c.lengths[i-1],0,0]));r[i]=mm(r[i-1],ry(q[i-1]));}
  p[5]=c.thumbP;r[5]=mm(mm(mm(c.thumbJ,ry(q[4])),tr(c.thumbJ)),c.thumbR);
  for(let i=6;i<=7;i++){p[i]=add(p[i-1],mv(r[i-1],[c.lengths[i-1],0,0]));r[i]=mm(r[i-1],ry(q[i-1]));}
  const wrist=mm(rx(u[4]),ry(u[5])),world=mm(c.W,wrist);
  const origin=add(c.P,mv(c.W,sub(c.pivot,mv(wrist,c.pivot))));
  return {p:p.map(v=>add(origin,mv(world,v))),r:r.map(a=>mm(world,a)),q,wrist,world,origin};
}
export function pads(c,g){return [4,7].map(i=>{
  const theta=(i===4?-18:-48)*D,n=[-Math.sin(theta),0,-Math.cos(theta)];
  const a=[c.lengths[i]-(i===4?4.7:3.8),0,-(i===4?4:4.9)];
  return {p:add(g.p[i],mv(g.r[i],add(a,scale(n,4.5)))),n:mv(g.r[i],n),nail:mv(g.r[i],[0,0,1]),base:g.p[i]};
});}
export function assess(c,u,target,width=12){
  const f=frames(c,u),ps=pads(c,f),normal=tr(c.boxR)[0];
  const local=ps.map(p=>mv(tr(c.boxR),sub(p.p,target)));
  const face=local.map((p,i)=>Math.abs(p[0]-(i===0?-width/2:width/2)));
  const angles=ps.map((p,i)=>angle(p.n,scale(normal,i===0?1:-1)));
  const tangent=Math.max(...local.flatMap(p=>p.slice(1).map(Math.abs)));
  const nails=ps.map(p=>dot(p.nail,sub(target,p.base)));
  return {face,angles,tangent,nails,pads:ps,local,aligned:Math.max(...face)<.3&&Math.max(...angles)<15&&tangent<=width/2-1.5&&Math.max(...nails)<0};
}
function residual(c,u,target,width){
  const ps=pads(c,frames(c,u)),normal=tr(c.boxR)[0],out=[];
  ps.forEach((p,i)=>{
    const a=mv(tr(c.boxR),sub(p.p,target)),dir=scale(normal,i===0?1:-1);
    out.push(5*(a[0]-(i===0?-width/2:width/2)),.16*a[1],.16*a[2]);
    out.push(7*Math.max(0,Math.abs(a[1])-(width/2-1.7)),7*Math.max(0,Math.abs(a[2])-(width/2-1.7)));
    // Keep pad orientation active before a hard acceptance threshold is reached.
    out.push(...scale(sub(p.n,dir),2.5),10*Math.max(0,Math.cos(13*D)-dot(p.n,dir)));
    out.push(Math.max(0,dot(p.nail,sub(target,p.base))));
  });
  return out;
}
function linear(A,b){
  const n=b.length,a=A.map((r,i)=>[...r,b[i]]);
  for(let i=0;i<n;i++){
    let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;
    [a[i],a[p]]=[a[p],a[i]];if(Math.abs(a[i][i])<1e-14)return null;
    const v=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=v;
    for(let j=0;j<n;j++)if(j!==i){const v=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=v*a[i][k];}
  }return a.map(r=>r[n]);
}
export function solve(c,target,{seed=c.seed,wrist=true,manual=[0,0],width=12,iterations=65}={}){
  const indices=wrist?[0,1,2,3,4,5]:[0,1,2,3];
  let u=seed.map((v,i)=>clamp(v,c.bounds[0][i],c.bounds[1][i]));if(!wrist){u[4]=manual[0];u[5]=manual[1];}
  let r=residual(c,u,target,width),cost=dot(r,r),lambda=.02;
  for(let it=0;it<iterations;it++){
    const J=indices.map(j=>{const v=u.slice();v[j]+=.025;return scale(sub(residual(c,v,target,width),r),40)});
    const A=J.map((col,i)=>J.map((col2,j)=>dot(col,col2)+(i===j?lambda:0)));
    const step=linear(A,J.map(col=>-dot(col,r)));if(!step)break;
    const v=u.slice();indices.forEach((j,i)=>v[j]=clamp(u[j]+clamp(step[i],-9,9),c.bounds[0][j],c.bounds[1][j]));
    const rr=residual(c,v,target,width),cc=dot(rr,rr);
    if(cc<cost){const gain=cost-cc;u=v;r=rr;cost=cc;lambda=Math.max(1e-6,lambda*.5);if(gain<1e-9)break;}
    else {lambda=Math.min(1e8,lambda*5);if(lambda>=1e8)break;}
  }
  return {u,cost,...assess(c,u,target,width)};
}
