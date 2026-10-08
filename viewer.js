import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const poses = {stowed:{value:0,label:'Stowed'},partial:{value:.4,label:'Partially open'},presentation:{value:.7,label:'Presentation'},deployed:{value:1,label:'Fully deployed'}};
const canvas=document.querySelector('#canvas'),stage=document.querySelector('#stage');
const loading=document.querySelector('#loading'),status=document.querySelector('#pose-status');
const buttons=[...document.querySelectorAll('[data-pose]')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer,model,mixer,actions=[],transition=null,current=1,selected='deployed',ready=false;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,.05,60);
let controls;
function fail(error){console.error(error);loading.hidden=false;loading.querySelector('.spinner').hidden=true;document.querySelector('#load-message').textContent='The 3D viewer could not load';document.querySelector('#load-detail').textContent='Please reload, or try a browser with WebGL enabled.';document.querySelector('#retry').hidden=false;}
document.querySelector('#retry').addEventListener('click',()=>location.reload());
try {
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.minDistance=2;controls.maxDistance=14;controls.maxPolarAngle=Math.PI*.49;controls.target.set(.9,.85,0);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x65758a,.8));
 const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(1,5,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.5,far:15});key.shadow.bias=-.00015;scene.add(key);
 const fill=new THREE.DirectionalLight(0xc9dfff,.7);fill.position.set(-3,2,-4);scene.add(fill);
 // A subtle reference floor keeps the ramp's ground contact legible.
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.004;ground.receiveShadow=true;scene.add(ground);
 let lastFit=null;const resize=()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();const fit=homeDistance();if(lastFit!==null){camera.position.sub(controls.target).multiplyScalar(fit/lastFit).add(controls.target);}lastFit=fit;};
 new ResizeObserver(resize).observe(stage);resize();resetView();
 canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(event.key))return;event.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(event.key==='ArrowLeft')s.theta-=.12;if(event.key==='ArrowRight')s.theta+=.12;if(event.key==='ArrowUp')s.phi=Math.max(.1,s.phi-.12);if(event.key==='ArrowDown')s.phi=Math.min(Math.PI*.49,s.phi+.12);if(event.key==='+')s.radius=Math.max(2,s.radius*.9);if(event.key==='-')s.radius=Math.min(14,s.radius*1.1);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('WebGL context lost'));});
 const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 loader.load('./assets/feal-irv242.glb',gltf=>{
  model=gltf.scene;scene.add(model);mixer=new THREE.AnimationMixer(model);
  if(!gltf.animations.length){fail(new Error('Model has no baked animation'));return;}
  for(const clip of gltf.animations){const action=mixer.clipAction(clip);action.play();action.paused=true;actions.push(action);}
  model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const mat of mats){mat.envMapIntensity=1.0;}}});
  ready=true;setProgress(poses[selected].value);loading.hidden=true;buttons.forEach(b=>b.disabled=false);document.querySelector('#reset').disabled=false;draco.dispose();
  document.documentElement.dataset.ready='true';registerAgentTool();
 },progress=>{document.querySelector('#load-detail').textContent=progress.total?`Loading model · ${Math.round(progress.loaded/progress.total*100)}%`:'Loading the 3D model…';},fail);
 renderer.setAnimationLoop(now=>{if(transition){const t=Math.min((now-transition.start)/transition.duration,1),ease=t*t*(3-2*t);setProgress(THREE.MathUtils.lerp(transition.from,transition.to,ease));if(t===1){transition=null;status.textContent=poses[selected].label;}}controls.update();renderer.render(scene,camera);});
} catch(error){fail(error);}
function setProgress(value){current=value;for(const action of actions)action.time=value*action.getClip().duration;mixer?.update(0);}
function selectPose(name){if(!Object.hasOwn(poses,name))throw new Error('Unknown pose');if(!ready)throw new Error('Model is still loading');selected=name;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===name)));if(reduced.matches){transition=null;setProgress(poses[name].value);status.textContent=poses[name].label;}else{transition={from:current,to:poses[name].value,start:performance.now(),duration:600+Math.abs(current-poses[name].value)*1300};status.textContent=`Moving to ${poses[name].label.toLowerCase()}…`;}}
function homeDistance(){const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));return Math.max(1.4/tangent,1.65/(tangent*camera.aspect))*1.12;}
function resetView(){controls.target.set(.9,.85,0);camera.position.copy(controls.target).add(new THREE.Vector3(3,2.2,4.8).normalize().multiplyScalar(homeDistance()));controls.update();}
buttons.forEach(b=>b.addEventListener('click',()=>selectPose(b.dataset.pose)));document.querySelector('#reset').addEventListener('click',resetView);
async function registerAgentTool(){const context=document.modelContext;if(!context?.registerTool)return;try{await context.registerTool({name:'set_ramp_pose',description:'Animate the FEAL ramp to a predefined position while preserving the viewing angle.',inputSchema:{type:'object',properties:{pose:{type:'string',enum:Object.keys(poses)}},required:['pose'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async({pose})=>{selectPose(pose);while(transition)await new Promise(r=>setTimeout(r,50));return {pose:selected,deployment:current};}});}catch(error){console.warn('Optional browser tool unavailable',error);}}
// Read-only diagnostics for local export/interaction verification.
window.rampViewer={selectPose,getState:()=>({ready,pose:selected,progress:current,animating:!!transition,camera:camera.position.toArray(),target:controls?.target.toArray(),clips:actions.map(a=>({name:a.getClip().name,duration:a.getClip().duration})),drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,parts:model?.children.length})};
