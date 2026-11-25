import * as THREE from './vendor/three.module.js';

export function startMotion(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(37,1,.1,50);
  camera.position.set(0,0,9);
  const arcs=new THREE.Group();
  scene.add(arcs);
  for(let i=0;i<3;i++){
    const radius=2.06+i*.22;
    const points=[];
    for(let j=0;j<=42;j++){
      const angle=.05+j/42*(Math.PI-.1);
      points.push(new THREE.Vector3(radius*Math.cos(angle),.65*radius*Math.sin(angle)-.65+i*.32,i*.19));
    }
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,.035+i*.006,7,false);
    const material=new THREE.MeshBasicMaterial({color:[0x6f9aff,0x9fc6ff,0xd7eaff][i],transparent:true,opacity:.91});
    arcs.add(new THREE.Mesh(tube,material));
  }
  function resize(){
    const {clientWidth:w,clientHeight:h}=canvas;
    if(!w||!h)return;
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  canvas.parentElement.classList.add('ready');
  function frame(ms){
    const t=ms/2300;
    arcs.rotation.set(.38+Math.sin(t)*.12,-.29+Math.cos(t*.78)*.16,.24);
    arcs.position.y=-.4+Math.sin(t*.7)*.1;
    renderer.render(scene,camera);
  }
  new IntersectionObserver(([entry])=>{
    renderer.setAnimationLoop(entry.isIntersecting?frame:null);
  }).observe(canvas);
}
