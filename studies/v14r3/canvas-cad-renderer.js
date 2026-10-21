// CPU triangle renderer for browsers without WebGL. Uses decimated actual CAD,
// the same scene transforms, solver and orbit controls. No prerecorded motion.
import * as THREE from 'three';
export class CanvasCADRenderer {
  constructor(){this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas unavailable');this.ratio=1;this.cache=new WeakMap();}
  setPixelRatio(v){this.ratio=Math.min(v,1.5);}
  setSize(w,h){this.width=w;this.height=h;this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;this.domElement.style.width=w+'px';this.domElement.style.height=h+'px';}
  render(scene,camera){
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const ctx=this.ctx,w=this.width,h=this.height;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.fillStyle='#edf2f1';ctx.fillRect(0,0,w,h);
    const view=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),draw=[];
    const project=(p,m)=>{const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],q=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [(x/q+1)*w/2,(1-y/q)*h/2,z/q,q];};
    scene.traverseVisible(node=>{
      if(!node.isMesh&&!node.isLine)return;
      const geo=node.geometry,material=Array.isArray(node.material)?node.material[0]:node.material;if(!geo?.attributes.position||!material.visible)return;
      const isLine=node.isLine, m=new THREE.Matrix4().multiplyMatrices(view,node.matrixWorld).elements;
      let cache=this.cache.get(geo);
      if(!cache||isLine){const a=geo.attributes.position,p=[];for(let i=0;i<a.count;i++)p.push([a.getX(i),a.getY(i),a.getZ(i)]);const ix=geo.index?Array.from(geo.index.array):p.map((_,i)=>i);cache={p,ix,n:[]};if(!isLine)for(let i=0;i<ix.length;i+=3){const a=p[ix[i]],b=p[ix[i+1]],c=p[ix[i+2]],u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;cache.n.push(n.map(v=>v/l));}this.cache.set(geo,cache);}
      const points=cache.p.map(p=>project(p,m)),color=material.color.clone().convertLinearToSRGB(),rgb=[color.r*255,color.g*255,color.b*255];
      if(isLine){
        const step=node.isLineSegments?2:1;for(let i=0;i<cache.ix.length-1;i+=step){const a=points[cache.ix[i]],b=points[cache.ix[i+1]];if(a[3]<=0||b[3]<=0)continue;draw.push({p:[a,b],z:(a[2]+b[2])/2-.00001,line:true,col:`rgba(${rgb.join(',')},${material.opacity??1})`});}return;
      }
      const e=node.matrixWorld.elements;
      for(let i=0;i<cache.ix.length;i+=3){
        const a=points[cache.ix[i]],b=points[cache.ix[i+1]],c=points[cache.ix[i+2]];
        if(a[3]<=0||b[3]<=0||c[3]<=0)continue;
        if(Math.max(a[0],b[0],c[0])<0||Math.min(a[0],b[0],c[0])>w||Math.max(a[1],b[1],c[1])<0||Math.min(a[1],b[1],c[1])>h)continue;
        const signed=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        if(signed>=0)continue;
        const n=cache.n[i/3],nx=e[0]*n[0]+e[4]*n[1]+e[8]*n[2],ny=e[1]*n[0]+e[5]*n[1]+e[9]*n[2],nz=e[2]*n[0]+e[6]*n[1]+e[10]*n[2];
        const light=.62+.38*Math.max(0,(-.25*nx+.65*ny+.72*nz)/(Math.hypot(nx,ny,nz)||1));
        draw.push({p:[a,b,c],z:(a[2]+b[2]+c[2])/3,line:false,col:`rgb(${rgb.map(v=>Math.round(v*light)).join(',')})`});
      }
    });
    draw.sort((a,b)=>b.z-a.z);
    ctx.lineWidth=.6;ctx.lineJoin='round';
    for(const d of draw){ctx.beginPath();ctx.moveTo(d.p[0][0],d.p[0][1]);for(let i=1;i<d.p.length;i++)ctx.lineTo(d.p[i][0],d.p[i][1]);ctx.strokeStyle=d.col;if(d.line){ctx.stroke();}else{ctx.closePath();ctx.fillStyle=d.col;ctx.fill();ctx.stroke();}}
  }
}
