import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CanvasCADRenderer} from './canvas-cad-renderer.js';
import {frames,pads,assess,add,sub,scale,mv,mm,tr,rx,ry,clamp} from './wrist-kinematics.js';

const $=s=>document.querySelector(s), base=new URL('./assets/v14r3/',import.meta.url).href;
const names=['Index wag','Index curl','Thumb opposition','Thumb curl'];
// In the palm-facing camera, screen-right is negative world X.
const presets={centre:[0,0,0],left:[20,0,0],right:[-20,0,0],higher:[0,0,4],lower:[0,0,-4],forward:[0,8,0]};
let c,renderer,scene,camera,orbit,box,hand=[],guide,rollAssembly,bendAssembly,worker;
let u,goal,target,result,tracking=true,assist=true,sweeping=false,sweepTime=0,loaded=false;
let busy=false,pending=false,id=0,latest=0,elapsed=0,clock=0,lastUi=0,lastSolve=0;
let manualWrist=[0,0], reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mat4=(r,p=[0,0,0])=>new THREE.Matrix4().set(r[0][0],r[0][1],r[0][2],p[0],r[1][0],r[1][1],r[1][2],p[1],r[2][0],r[2][1],r[2][2],p[2],0,0,0,1);
function stopSweep(){sweeping=false;$('#sweep').textContent='Play box sweep';}
function syncTarget(){
  $('#targetX').value=c.centre[0]-target[0];$('#targetY').value=target[1]-c.centre[1];$('#targetZ').value=target[2];
  $('#targetXValue').textContent=`${(c.centre[0]-target[0]).toFixed(1)} mm`;
  $('#targetYValue').textContent=`${(target[1]-c.centre[1]).toFixed(1)} mm`;
  $('#targetZValue').textContent=`${target[2].toFixed(1)} mm`;
}
function requestSolve(){
  if(!loaded||!tracking)return;
  if(busy){pending=true;return;}
  pending=false;busy=true;latest=++id;
  worker.postMessage({id:latest,target:target.slice(),options:{seed:goal.slice(),wrist:assist,manual:manualWrist,width:c.boxWidth}});
}
function setMode(value){
  tracking=value;stopSweep();
  $('#trackingMode').classList.toggle('active',tracking);$('#manualMode').classList.toggle('active',!tracking);
  $('#targetControls').style.opacity=tracking?'1':'.55';
  $('#targetControls').querySelectorAll('button,input').forEach(e=>e.disabled=!tracking);
  $('#wristAssist').disabled=!tracking;
  if(!tracking){goal=u.slice();manualWrist=goal.slice(4);$('#manualDetails').open=true;}
  syncWrist();if(tracking)requestSolve();
}
function syncWrist(){
  $('#wristAssist').checked=assist;
  $('#wristRoll').disabled=$('#wristBend').disabled=tracking&&assist;
  $('#lockWrist').textContent=assist?'Compare with wrist locked':'Restore wrist tracking';
  $('#assistValue').textContent=!tracking?'Manual':assist?'Enabled':manualWrist.some(v=>Math.abs(v)>.01)?'Manual wrist':'Locked at 0°';
}
function refreshReadings(){
  if(!loaded)return;
  const a=assess(c,u,target),moving=Math.max(...u.map((v,i)=>Math.abs(v-goal[i])))>.6;
  $('#gapValue').textContent=Math.max(...a.face).toFixed(2);
  $('#angleValue').textContent=Math.max(...a.angles).toFixed(1)+'°';
  $('#edgeValue').textContent=(c.boxWidth/2-a.tangent).toFixed(1)+' mm';
  $('#wristRollValue').textContent=u[4].toFixed(1)+'°';$('#wristBendValue').textContent=u[5].toFixed(1)+'°';
  if(tracking&&assist){$('#wristRoll').value=u[4];$('#wristBend').value=u[5];}
  for(let i=0;i<4;i++){
    $(`#read${i}`).textContent=u[i].toFixed(1)+'°';$(`#bar${i}`).style.width=100*(u[i]-c.bounds[0][i])/(c.bounds[1][i]-c.bounds[0][i])+'%';
    $(`#fingerValue${i}`).textContent=u[i].toFixed(1)+'°';if(tracking)$(`#finger${i}`).value=u[i];
  }
  const status=$('#alignment');status.classList.remove('waiting','outside');
  if(!tracking){
    status.classList.add('waiting');$('#reachTitle').textContent='Manual motion';$('#reachText').textContent='Explore each input. Switch to Follow box to solve a new pinch.';
    $('#phase').textContent='Manual joints · green pads, terracotta nail sides';
  }else if(result&&!result.aligned){
    status.classList.add('outside');$('#reachTitle').textContent='Outside the pad-alignment range';
    $('#reachText').textContent='Showing the closest pose found. Move the box back toward the hand'+(!assist?', or restore wrist tracking.':'.');
    $('#phase').textContent='Closest pose · target stays fixed';
  }else if(a.aligned){
    $('#reachTitle').textContent='Pads aligned with the box';$('#reachText').textContent='Both pads meet the geometric placement limits. Physical holding is not tested.';
    $('#phase').textContent=sweeping?'Following the moving box':assist?'Wrist + fingers aligned':'Fingers aligned · wrist held';
  }else{
    status.classList.add('waiting');$('#reachTitle').textContent=moving?'Moving toward the box…':'Adjusting pad alignment…';
    $('#reachText').textContent='The box stays in place while the hand approaches.';
    $('#phase').textContent='Oppose the thumb · curl inward · align the pads';
  }
}
function setupControls(){
  $('#inputReadings').innerHTML=names.map((n,i)=>`<div class="angle-row"><div><span>${n}</span><b id="read${i}">0°</b></div><span class="bar"><i id="bar${i}"></i></span></div>`).join('');
  $('#fingerSliders').innerHTML=names.map((n,i)=>`<label for="finger${i}">${n}<output id="fingerValue${i}">0°</output></label><input id="finger${i}" type="range" min="${c.bounds[0][i]}" max="${c.bounds[1][i]}" step=".5" value="${u[i]}">`).join('');
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{
    stopSweep();target=add(c.centre,presets[b.dataset.preset]);syncTarget();
    document.querySelectorAll('[data-preset]').forEach(e=>e.classList.toggle('active',e===b));requestSolve();
  });
  for(const [selector,i,relative] of [['#targetX',0,true],['#targetY',1,true],['#targetZ',2,false]])$(selector).oninput=e=>{
    stopSweep();target[i]=+e.target.value*(i===0?-1:1)+(relative?c.centre[i]:0);syncTarget();
    document.querySelectorAll('[data-preset]').forEach(e=>e.classList.remove('active'));requestSolve();
  };
  $('#trackingMode').onclick=()=>setMode(true);$('#manualMode').onclick=()=>setMode(false);
  $('#wristAssist').onchange=e=>{assist=e.target.checked;if(!assist){manualWrist=u.slice(4);$('#wristRoll').value=manualWrist[0];$('#wristBend').value=manualWrist[1];}syncWrist();requestSolve();};
  $('#lockWrist').onclick=()=>{
    assist=!assist;manualWrist=[0,0];$('#wristRoll').value=0;$('#wristBend').value=0;
    if(!tracking)setMode(true);syncWrist();requestSolve();
  };
  for(const [selector,i] of [['#wristRoll',4],['#wristBend',5]])$(selector).oninput=e=>{
    manualWrist[i-4]=+e.target.value;if(tracking)requestSolve();else goal[i]=+e.target.value;
  };
  for(let i=0;i<4;i++)$(`#finger${i}`).oninput=e=>{if(tracking)setMode(false);goal[i]=+e.target.value;};
  $('#curlOnly').onclick=()=>{setMode(false);goal=[0,0,0,30,0,0];syncManual();};
  $('#oppOnly').onclick=()=>{setMode(false);goal=[0,0,c.seed[2],0,0,0];syncManual();};
  $('#sweep').onclick=()=>{
    sweeping=!sweeping;sweepTime=0;if(sweeping){target=c.centre.slice();syncTarget();requestSolve();document.querySelectorAll('[data-preset]').forEach(e=>e.classList.remove('active'));}
    $('#sweep').textContent=sweeping?'Pause box sweep':'Play box sweep';
  };
  $('#reset').onclick=()=>{assist=true;manualWrist=[0,0];setMode(true);target=c.centre.slice();goal=c.seed.slice();u=[0,0,0,0,0,0];syncTarget();syncWrist();requestSolve();document.querySelectorAll('[data-preset]').forEach(e=>e.classList.toggle('active',e.dataset.preset==='centre'));};
  $('#replay').onclick=()=>{stopSweep();u=[0,0,0,0,0,0];if(!tracking)setMode(true);requestSolve();};
  $('#notesButton').onclick=()=>{$('#checks').open=true;$('#checks').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});};
  $('#exportPose').onclick=()=>{
    const json={revision:c.revision,units:'mm, degrees',mode:tracking?'tracking':'manual',wrist_assist:assist,target_world_mm:target,box_width_mm:c.boxWidth,box_rotation:c.boxR,inputs_deg:u,solved_inputs_deg:goal,joint_angles_deg:frames(c,u).q,placement:assess(c,u,target),limits:c.bounds,scope:c.scope};
    const url=URL.createObjectURL(new Blob([JSON.stringify(json,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='V14R3_wrist_pose.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  syncTarget();syncWrist();
}
function syncManual(){manualWrist=goal.slice(4);for(let i=0;i<4;i++)$(`#finger${i}`).value=goal[i];$('#wristRoll').value=goal[4];$('#wristBend').value=goal[5];}
function mesh(geo,color,roughness=.65){return new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness}));}
function cylinderX(radius,length,color){const m=mesh(new THREE.CylinderGeometry(radius,radius,length,40),color);m.rotation.z=Math.PI/2;return m;}
function setupWrist(){
  const fixed=new THREE.Group();fixed.matrixAutoUpdate=false;fixed.matrix.copy(mat4(c.W,add(c.P,mv(c.W,c.pivot))));scene.add(fixed);
  const shaft=cylinderX(10.5,40,0x9baeb1);shaft.position.x=-28;fixed.add(shaft);
  const foot=cylinderX(26,5,0x537176);foot.position.x=-50;fixed.add(foot);
  const shell=cylinderX(13,9,0x3d666c);shell.position.x=-10;fixed.add(shell);
  rollAssembly=new THREE.Group();rollAssembly.matrixAutoUpdate=false;scene.add(rollAssembly);
  const ring=cylinderX(13.6,2,0xd6a350);ring.position.x=-6;rollAssembly.add(ring);
  // Symbolic wrist, deliberately not an STL-ready bearing or motor enclosure.
  const axis=mesh(new THREE.CylinderGeometry(5.5,5.5,29,32),0xd6a350);rollAssembly.add(axis);
  for(const y of [-14.5,14.5]){const ear=mesh(new THREE.BoxGeometry(12,4,17),0x3d666c);ear.position.set(-3,y,0);rollAssembly.add(ear);}
  bendAssembly=new THREE.Group();bendAssembly.matrixAutoUpdate=false;scene.add(bendAssembly);
  const ball=mesh(new THREE.SphereGeometry(8,32,20),0xb7c9c6);bendAssembly.add(ball);
  const link=mesh(new THREE.BoxGeometry(8,15,9),0x7e9c97);link.position.x=3;bendAssembly.add(link);
}
async function setupScene(){
  const area=$('#viewport');let software=false;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch(error){renderer=new CanvasCADRenderer();software=true;$('#motionNote').textContent='Software 3D · same motion model';}
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;area.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive 3D V14R3 hand and proposed wrist');
  scene=new THREE.Scene();scene.background=new THREE.Color('#edf2f1');camera=new THREE.PerspectiveCamera(34,1,.5,2000);camera.up.set(0,0,1);
  orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.minDistance=120;orbit.maxDistance=650;orbit.maxPolarAngle=Math.PI*.92;
  const view=name=>{const p={three:[190,300,205],palm:[0,335,154],side:[-325,45,155]}[name];camera.position.set(...p);orbit.target.set(0,24,125);orbit.update();document.querySelectorAll('.view-buttons button').forEach(e=>e.classList.remove('active'));$({three:'#view3D',palm:'#viewPalm',side:'#viewSide'}[name]).classList.add('active');};
  view('three');$('#view3D').onclick=()=>view('three');$('#viewPalm').onclick=()=>view('palm');$('#viewSide').onclick=()=>view('side');
  scene.add(new THREE.HemisphereLight(0xffffff,0x879a99,2.1));for(const [pos,intensity] of [[[100,170,350],3],[[-180,-60,220],1.8]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.set(...pos);scene.add(l);}
  const floor=mesh(new THREE.PlaneGeometry(800,800),0xe6ece9);floor.position.z=30;scene.add(floor);
  const grid=new THREE.GridHelper(400,20,0xcddbd5,0xdce5e0);grid.rotation.x=Math.PI/2;grid.position.z=30.02;grid.material.transparent=true;grid.material.opacity=.45;scene.add(grid);
  setupWrist();
  hand=Array.from({length:8},()=>{const g=new THREE.Group();g.matrixAutoUpdate=false;scene.add(g);return g;});
  const loader=new GLTFLoader();
  let gltf;
  if(software){
    gltf=await loader.loadAsync(base+'hand-light.glb');
  }else{
    const parts=await Promise.all([1,2].map(async i=>{
      const response=await fetch(base+`hand-local.part${i}.bin`);
      if(!response.ok)throw Error('Hand CAD could not load');
      return new Uint8Array(await response.arrayBuffer());
    }));
    const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.byteLength,0));
    let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    gltf=await loader.parseAsync(bytes.buffer,base);
  }
  gltf.scene.traverse(n=>{
    if(!n.isMesh)return;const owner=c.owners[n.name];if(owner===undefined)throw Error('Unassigned CAD part '+n.name);
    const color=n.name.endsWith('_cover')?0x607779:n.name.includes('_rigid_marked')?0xc95238:n.name.includes('_soft_marked')?0x31c280:n.name.includes('_soft')?0xd1ded6:owner<5?0x31616e:0x246e66;
    const m=new THREE.MeshStandardMaterial({color,roughness:.62,metalness:0,side:THREE.DoubleSide});
    if(!n.geometry.attributes.normal)n.geometry.computeVertexNormals();
    const part=new THREE.Mesh(n.geometry,m);part.name=n.name;hand[owner].add(part);
  });
  box=mesh(new THREE.BoxGeometry(c.boxWidth,c.boxWidth,c.boxWidth),0xdf9c3c);box.material.transparent=true;box.material.opacity=.88;box.matrixAutoUpdate=false;scene.add(box);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),new THREE.LineBasicMaterial({color:0x9e6521}));box.add(edge);
  guide=new THREE.Group();scene.add(guide);guide.userData.lines=[];guide.userData.arrows=[];
  for(let i=0;i<2;i++){
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:0x57a585,dashSize:1.2,gapSize:.7,transparent:true,opacity:.8}));guide.add(line);guide.userData.lines.push(line);
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(),7,0x2aa878,2,.8);guide.add(arrow);guide.userData.arrows.push(arrow);
  }
  $('#showGuides').onchange=e=>guide.visible=e.target.checked;
  const resize=()=>{const {width,height}=area.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(area);resize();
}
function render(now){
  requestAnimationFrame(render);const dt=Math.min(.25,(now-clock)/1000||.016);clock=now;elapsed+=dt;
  if(sweeping&&tracking){
    sweepTime+=dt;const t=sweepTime*2*Math.PI/24;
    target=add(c.centre,[18*Math.sin(t),1.5*Math.sin(2*t),1*Math.sin(2*t)]);syncTarget();
    if(now-lastSolve>100){requestSolve();lastSolve=now;}
  }
  const f=reduced?1:1-Math.exp(-dt*4);u=u.map((v,i)=>v+(goal[i]-v)*f);
  const g=frames(c,u);for(let i=0;i<8;i++)hand[i].matrix.copy(mat4(g.r[i],g.p[i]));
  const pivot=add(c.P,mv(c.W,c.pivot));rollAssembly.matrix.copy(mat4(mm(c.W,rx(u[4])),pivot));bendAssembly.matrix.copy(mat4(mm(mm(c.W,rx(u[4])),ry(u[5])),pivot));
  box.matrix.copy(mat4(c.boxR,target));box.visible=tracking;
  const ps=pads(c,g),normal=tr(c.boxR)[0];
  ps.forEach((p,i)=>{const dest=add(target,scale(normal,(i===0?-1:1)*c.boxWidth/2)),line=guide.userData.lines[i];line.geometry.setFromPoints([new THREE.Vector3(...p.p),new THREE.Vector3(...dest)]);line.computeLineDistances();guide.userData.arrows[i].position.set(...p.p);guide.userData.arrows[i].setDirection(new THREE.Vector3(...p.n));line.visible=tracking;});
  if(now-lastUi>100){refreshReadings();lastUi=now;}
  orbit.update();renderer.render(scene,camera);
}
try{
  const r=await fetch(base+'model.json');if(!r.ok)throw Error('Model data could not load');c=await r.json();u=reduced?c.seed.slice():[0,0,0,0,0,0];goal=c.seed.slice();target=c.centre.slice();setupControls();
  worker=new Worker(new URL('./wrist-worker.js',import.meta.url),{type:'module'});worker.postMessage({config:c});
  worker.onmessage=({data})=>{busy=false;if(data.error){$('#phase').textContent='Solver error: '+data.error;return;}if(tracking){result=data.result;goal=result.u;}if(pending)requestSolve();};
  worker.onerror=()=>{$('#reachTitle').textContent='Tracking could not start';$('#reachText').textContent='Reload to retry. The current pose is not a tracking result.';};
  await setupScene();loaded=true;$('#loading').hidden=true;requestSolve();requestAnimationFrame(render);
  fetch(base+'wrist-tests.json').then(r=>r.ok?r.json():Promise.reject()).then(r=>{
    $('#workspaceResult').textContent=`On the ${r.grid.total}-position test grid, ${r.grid.wrist_aligned} positions passed pad alignment with the wrist enabled, compared with ${r.grid.locked_aligned} with it locked. These are sampled geometric results, not physical grasps. Grid: ${r.grid.description}`;
  }).catch(()=>$('#workspaceResult').textContent='The workspace report could not load. Live placement checks still use the limits above.');
}catch(error){
  console.error(error);$('#loading').replaceChildren();const h=document.createElement('strong');h.textContent='The 3D view could not load';const p=document.createElement('span');p.textContent='Reload the page or enable WebGL. '+error.message;$('#loading').append(h,p);
  document.querySelectorAll('.controls button,.controls input,.scene-footer button').forEach(e=>e.disabled=true);$('#phase').textContent='Model unavailable';$('#reachTitle').textContent='No motion result';$('#reachText').textContent='The model has not loaded. No successful simulation is being reported.';
}
