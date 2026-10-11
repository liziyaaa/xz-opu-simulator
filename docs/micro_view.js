/* Dimensions in mm. This is a scaled focal-plane view, not a measured PSF. */
'use strict';
window.HD65Optics={
 profile(mode){
  const cd=mode==='cd',wavelengthNm=cd?790:650,na=cd?.47:.60;
  return {mode:cd?'cd':'dvd',wavelengthNm,na,diameterUm:1.22*wavelengthNm/1000/na,
   focalLengthMm:cd?3.07:3.05,discWorkingDistanceMm:cd?1.30:1.67,measured:false,
   definition:'Ideal Airy central disk, diameter to first dark ring; not measured sample spot'};
 }
};
window.MicroFocusView=class {
 constructor(scene,host){
  this.scene=scene;this.host=host;this.spanUm=100;this.focus=new THREE.Vector3(137.5,209.5,78.5);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0xf0f5f8,0);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;host.prepend(this.renderer.domElement);
  this.camera=new THREE.OrthographicCamera(-.1,.1,.1,-.1,.01,2500);
  this.group=new THREE.Group();this.group.visible=false;scene.add(this.group);
  // A circle in the fixed focal plane, never a large marker tracking the sample.
  this.spot=new THREE.Mesh(new THREE.CircleGeometry(.001,64),new THREE.MeshBasicMaterial({color:0x08d4d0,side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:true,opacity:.88}));
  this.spot.rotation.x=-Math.PI/2;this.spot.position.copy(this.focus);this.spot.renderOrder=50;this.group.add(this.spot);
  const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(0,.05,0)];
  this.guide=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x2697ad,dashSize:.003,gapSize:.002,depthTest:false,transparent:true,opacity:.7}));
  this.guide.position.copy(this.focus);this.guide.computeLineDistances();this.guide.renderOrder=49;this.group.add(this.guide);
  this.setMode('dvd');
 }
 setMode(mode){
  this.optics=HD65Optics.profile(mode);this.spot.geometry.dispose();
  this.spot.geometry=new THREE.CircleGeometry(this.optics.diameterUm/2000,64);
  this.host.dataset.spotDiameterUm=String(this.optics.diameterUm);
  document.getElementById('spot-info').textContent=`${this.optics.mode.toUpperCase()} · λ ${this.optics.wavelengthNm} nm · NA ${this.optics.na.toFixed(2)} · 理论焦斑 Ø ${this.optics.diameterUm.toFixed(3)} µm`;
 }
 sync(mainCamera){
  const direction=mainCamera.getWorldDirection(new THREE.Vector3());
  this.camera.position.copy(this.focus).addScaledVector(direction,-150);
  this.camera.up.copy(mainCamera.up);this.camera.lookAt(this.focus);this.resize();
 }
 resize(){
  const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
  const span=this.spanUm/1000;this.camera.left=-span*w/h/2;this.camera.right=span*w/h/2;
  this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();
  this.renderer.setSize(w,h);this.host.dataset.spanUm=String(this.spanUm);
  const available=this.spanUm*w/h*.22,order=10**Math.floor(Math.log10(available));
  const length=[1,2,5,10].map(n=>n*order).filter(n=>n<=available).at(-1)||order/2;
  const bar=document.getElementById('micro-scale');bar.style.width=`${length/this.spanUm*h}px`;
  bar.textContent=`${length} µm`;bar.dataset.lengthUm=String(length);
  document.getElementById('micro-fov').textContent=`视野 ${((this.camera.right-this.camera.left)*1000).toFixed(1)} × ${this.spanUm} µm · 等比例`;
 }
 render(hiddenMarkers){
  const visible=hiddenMarkers.map(o=>o.visible);
  hiddenMarkers.forEach(o=>o.visible=false);this.group.visible=true;
  try{this.renderer.render(this.scene,this.camera);}finally{
   this.group.visible=false;hiddenMarkers.forEach((o,i)=>o.visible=visible[i]);
  }
 }
};
