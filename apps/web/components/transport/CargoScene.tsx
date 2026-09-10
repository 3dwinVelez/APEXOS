"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import type {PackingPlan,CargoContainer} from "./packing-types";
export default function CargoScene({container,plan,step,selected,onSelect}:{container:CargoContainer;plan:PackingPlan|null;step:number;selected:string;onSelect:(id:string)=>void}) {
  const host=useRef<HTMLDivElement>(null),select=useRef(onSelect); useEffect(()=>{select.current=onSelect;},[onSelect]);
  const [error,setError]=useState("");
  useEffect(()=>{
    const element=host.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch {setError("Este navegador no dispone de WebGL. La tabla conserva el resultado exacto del cubicaje.");return;}
    setError("");renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.setClearColor(0x0d2028,1);element.appendChild(renderer.domElement);renderer.domElement.setAttribute("aria-label","Camión 3D: arrastre para girar, use la rueda para acercar y seleccione un bulto");renderer.domElement.setAttribute("data-testid","cargo-canvas");
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,0.01,150);
    const {length:l,width:w,height:h}=container;
    camera.position.set(l*1.05,h*2.8,w*3.3);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(l/2,h/2,w/2);controls.minDistance=1;controls.maxDistance=40;controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff,0x465f68,2.4));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(l,10,8);scene.add(light);
    const resources:{dispose:()=>void}[]=[];
    function box(x:number,y:number,z:number,a:number,b:number,c:number,color:number,opacity=1,wire=false) {
      const geometry=new THREE.BoxGeometry(a,c,b),material=new THREE.MeshStandardMaterial({color,transparent:opacity<1,opacity,roughness:0.65,depthWrite:opacity===1});resources.push(geometry,material);
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x+a/2,z+c/2,y+b/2);scene.add(mesh);
      const edges=new THREE.EdgesGeometry(geometry),lineMaterial=new THREE.LineBasicMaterial({color:wire?0x8fbac2:0x193a45,transparent:true,opacity:0.7});resources.push(edges,lineMaterial);const outline=new THREE.LineSegments(edges,lineMaterial);outline.position.copy(mesh.position);scene.add(outline);return mesh;
    }
    // Floor, cab, wheels, and transparent walls orient the planner around a real truck.
    box(0,0,-0.12,l,w,0.12,0x536e79);box(-1.2,0,0,1.1,w,Math.min(h,1.9),0x146c63);
    box(0,-0.035,0,l,0.035,h,0x649da5,0.12,true);box(0,w,0,l,0.035,h,0x649da5,0.08,true);box(0,0,0,0.035,w,h,0x649da5,0.13,true);
    for(const x of [0.5,l-1])for(const y of [-0.12,w+0.12]){const g=new THREE.CylinderGeometry(0.32,0.32,0.22,16),m=new THREE.MeshStandardMaterial({color:0x16252c});resources.push(g,m);const wheel=new THREE.Mesh(g,m);wheel.rotation.x=Math.PI/2;wheel.position.set(x,-0.22,y);scene.add(wheel);}
    for(const o of container.obstacles || [])box(o.x,o.y,o.z,o.length,o.width,o.height,0xeaa350,0.7);
    for(const s of container.spaces || []) {const baseGeometry=new THREE.BoxGeometry(s.length,s.height,s.width);resources.push(baseGeometry);const g=new THREE.EdgesGeometry(baseGeometry),m=new THREE.LineBasicMaterial({color:0x65c9c0,transparent:true,opacity:0.4});resources.push(g,m);const lines=new THREE.LineSegments(g,m);lines.position.set(s.x+s.length/2,s.z+s.height/2,s.y+s.width/2);scene.add(lines);}
    const colors=[0x29b6a6,0x559ee9,0xe4b85c,0xa294df,0xed977c,0x7ebc83],targets:THREE.Mesh[]=[];
    const ids=[...new Set(plan?.placements.map(p=>p.order_id || p.id) || [])];
    for(const p of (plan?.placements || []).slice(0,step)){const mesh=box(p.x,p.y,p.z,p.length,p.width,p.height,p.unit_id===selected?0xffe482:colors[ids.indexOf(p.order_id || p.id)%colors.length]);mesh.userData.unit_id=p.unit_id;targets.push(mesh);}
    if(plan?.center_of_gravity && step>=plan.placements.length){const p=plan.center_of_gravity;const geometry=new THREE.SphereGeometry(0.08,12,12),material=new THREE.MeshBasicMaterial({color:0xff596f});resources.push(geometry,material);const marker=new THREE.Mesh(geometry,material);marker.position.set(p.x,p.z,p.y);scene.add(marker);}
    const draw=()=>renderer.render(scene,camera);controls.addEventListener("change",draw);
    let framed = false;
    const resize=()=>{const width=element.clientWidth,height=element.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(!framed){const bounds=new THREE.Box3().setFromObject(scene),sphere=bounds.getBoundingSphere(new THREE.Sphere());const fov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=sphere.radius/Math.sin(fov/2)*1.08;controls.target.copy(sphere.center);camera.position.copy(sphere.center).add(new THREE.Vector3(1,0.9,1.4).normalize().multiplyScalar(distance));controls.update();framed=true;}draw();};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    let down=[0,0];const pointerDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};
    const click=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(targets)[0];if(hit)select.current(String(hit.object.userData.unit_id));};
    renderer.domElement.addEventListener("pointerdown",pointerDown);renderer.domElement.addEventListener("pointerup",click);
    return()=>{observer.disconnect();controls.dispose();resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[container,plan,step,selected]);
  return <div className="relative overflow-hidden rounded-xl border border-line bg-[#0d2028]"><div ref={host} className="h-[420px] min-h-72 w-full"/>{error?<p role="alert" className="absolute inset-x-4 top-4 text-white">{error}</p>:<p className="pointer-events-none absolute bottom-3 left-4 text-xs text-white/70">Cabina a la izquierda · Puerta trasera a la derecha · Arrastrar para girar · Rueda para zoom</p>}</div>;
}
