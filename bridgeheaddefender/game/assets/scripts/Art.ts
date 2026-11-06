import {Node,Mesh,MeshRenderer,Material,Color,Mat4,Vec3,primitives,utils} from 'cc';
import {WeaponId} from './Rules';

export interface Soldier { node:Node; body:Node; legs:Node[]; gun:Node; phase:number; bornAt:number; }
export class Art {
 private materials=new Map<string,Material>();
 private source=new Map<Mesh,ReturnType<typeof primitives.box>>();
 private parts=new WeakMap<Node,{color:string;unlit:boolean}>();
 private mesh(geometry:ReturnType<typeof primitives.box>){const lo=new Vec3(Infinity,Infinity,Infinity),hi=new Vec3(-Infinity,-Infinity,-Infinity);for(let i=0;i<geometry.positions.length;i+=3){const p=geometry.positions;lo.x=Math.min(lo.x,p[i]);lo.y=Math.min(lo.y,p[i+1]);lo.z=Math.min(lo.z,p[i+2]);hi.x=Math.max(hi.x,p[i]);hi.y=Math.max(hi.y,p[i+1]);hi.z=Math.max(hi.z,p[i+2]);}geometry.minPos=lo;geometry.maxPos=hi;return utils.createMesh(geometry);}
 // Fewer latitude rings than the generic sphere; smooth normals retain the
 // rounded silhouette without tessellating every boot and hand like a helmet.
 private globe(sides=12,rings=6,cap=false){const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];for(let j=0;j<=rings;j++){const theta=j/rings*Math.PI*(cap?.5:1);for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2,x=Math.sin(theta)*Math.cos(a),y=Math.cos(theta),z=Math.sin(theta)*Math.sin(a);positions.push(x*.5,y*.5,z*.5);normals.push(x,y,z);uvs.push(i/sides,j/rings);if(i<sides&&j<rings){const k=j*(sides+1)+i;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}}}return {positions,normals,uvs,indices};}
 private star(points=5,inner=.22){const positions=[0,0,0],normals=[0,1,0],indices:number[]=[];for(let i=0;i<points*2;i++){const a=i/points*Math.PI,r=i%2?inner:.5;positions.push(Math.sin(a)*r,0,Math.cos(a)*r);normals.push(0,1,0);}for(let i=0;i<points*2;i++)indices.push(0,i+1,(i+1)%(points*2)+1);return {positions,normals,indices};}
 private ring(){const positions:number[]=[],normals:number[]=[],indices:number[]=[];for(let i=0;i<=16;i++){const a=i/16*Math.PI*2;for(const r of [.37,.5]){positions.push(Math.sin(a)*r,0,Math.cos(a)*r);normals.push(0,1,0);}if(i<16){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}return {positions,normals,indices};}
 // Smooth normals retain rounded toy silhouettes with shared vertex lighting.
 private shaded(geometry:ReturnType<typeof primitives.box>){const normals=geometry.normals||[];geometry.colors=[];for(let i=0;i<geometry.positions.length;i+=3){const d=Math.max(0,-.45*(normals[i]||0)+.78*(normals[i+1]||0)+.43*(normals[i+2]||0));const light=.53+.47*d;geometry.colors.push(light,light,light,1);}const mesh=this.mesh(geometry);this.source.set(mesh,geometry);return mesh;}
 readonly meshes:Record<string,Mesh>={box:this.shaded(primitives.box()),sphere:this.shaded(this.globe()),spark:this.shaded(this.globe(8,4)),star:this.shaded(this.star()),flare:this.shaded(this.star(6,.12)),ring:this.shaded(this.ring()),helmet:this.shaded(this.globe(16,5,true)),cylinder:this.shaded(primitives.cylinder(.5,.5,1,{radialSegments:12})),coin:this.shaded(primitives.cylinder(.5,.5,1,{radialSegments:24})),capsule:this.shaded(primitives.capsule(.5,.5,2,{sides:8,heightSegments:8}))};
 color(hex:string,unlit=false){const key=hex+unlit;let m=this.materials.get(key);if(!m){m=new Material();const c=new Color().fromHEX(hex);m.initialize({effectName:'builtin-unlit',technique:c.a<255?1:0,defines:{USE_VERTEX_COLOR:!unlit,USE_INSTANCING:true}});m.setProperty('mainColor',c);this.materials.set(key,m);}return m;}
 shape(parent:Node,name:string,shape:string,color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,unlit=false){const n=new Node(name);parent.addChild(n);n.setPosition(x,y,z);n.setScale(sx,sy,sz);const r=n.addComponent(MeshRenderer);r.mesh=this.meshes[shape];r.setSharedMaterial(this.color(color,unlit),0);this.parts.set(n,{color,unlit});return n;}
 private compact(root:Node,key:string){
  const parts=root.children.filter(n=>!!n.getComponent(MeshRenderer));let mesh=this.meshes[key];
  if(!mesh){const positions:number[]=[],colors:number[]=[],normals:number[]=[],indices:number[]=[];const inv=new Mat4();Mat4.invert(inv,root.worldMatrix);
   for(const n of parts){const geo=this.source.get(n.getComponent(MeshRenderer)!.mesh!)!,part=this.parts.get(n)!,c=new Color().fromHEX(part.color),matrix=new Mat4();Mat4.multiply(matrix,inv,n.worldMatrix);const offset=positions.length/3;
    for(let i=0;i<geo.positions.length;i+=3){const v=new Vec3(geo.positions[i],geo.positions[i+1],geo.positions[i+2]);Vec3.transformMat4(v,v,matrix);positions.push(v.x,v.y,v.z);normals.push(0,1,0);const j=i/3*4;colors.push(c.r/255*(geo.colors?.[j]??1),c.g/255*(geo.colors?.[j+1]??1),c.b/255*(geo.colors?.[j+2]??1),1);}for(const index of geo.indices||[])indices.push(offset+index);
   }mesh=this.mesh({positions,colors,normals,indices});this.meshes[key]=mesh;
  }
  for(const n of parts){n.removeFromParent();n.destroy();}const n=new Node('Combined model');root.addChild(n);const r=n.addComponent(MeshRenderer);r.mesh=mesh;r.setSharedMaterial(this.color('#FFFFFF'),0);
 }
 box(p:Node,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number){return this.shape(p,'Block','box',c,x,y,z,sx,sy,sz);}
 oval(p:Node,name:string,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number){return this.shape(p,name,'sphere',c,x,y,z,sx,sy,sz);}
 soldier(parent:Node,enemy=false):Soldier {
  const n=new Node(enemy?'Red infantry':'Blue infantry');parent.addChild(n);
  this.shape(n,'Soft shadow','cylinder','#142B4940',.16,.015,.14,.99,.012,.75,true);
  const body=new Node('Animated body');n.addChild(body);
  const blue=enemy?'#EC3C36':'#079FF4',dark=enemy?'#7F292D':'#133D75';
  const legs:Node[]=[];
  const bodyKey=enemy?'red-body':'blue-body';
  // Reuse the already baked model directly. Previously every additional
  // soldier rebuilt dozens of temporary renderers only to destroy them again
  // inside compact(), including during the late-stage enemy spawn peaks.
  if(this.meshes[bodyKey]&&this.meshes['infantry-leg']){
   const combined=(parent:Node,key:string)=>{const part=new Node('Combined model');parent.addChild(part);const r=part.addComponent(MeshRenderer);r.mesh=this.meshes[key];r.setSharedMaterial(this.color('#FFFFFF'),0);};
   for(const x of [-.16,.16]){const leg=new Node('Running leg');body.addChild(leg);leg.setPosition(x,.30,0);combined(leg,'infantry-leg');legs.push(leg);}
   combined(body,bodyKey);return {node:n,body,legs,gun:this.gun(body,'rifle'),phase:Math.random()*6.28,bornAt:-1000};
  }
  for(const x of [-.16,.16]){const leg=new Node('Running leg');body.addChild(leg);leg.setPosition(x,.30,0);this.shape(leg,'Trouser','capsule','#8D7854',0,-.06,0,.19,.15,.22);this.oval(leg,'Boot','#26333D',0,-.19,-.055,.235,.18,.35);legs.push(leg);}
  this.oval(body,'Khaki jacket','#CFB37B',0,.61,0,.62,.68,.40);
  this.box(body,dark,0,.70,.165,.42,.35,.10);
  this.box(body,'#6C5336',0,.41,0,.55,.085,.38);
  this.oval(body,'Backpack trim',dark,0,.64,.23,.48,.47,.23);
  this.oval(body,'Backpack',blue,0,.67,.28,.34,.36,.16);
  for(const x of [-.19,.19])this.box(body,'#B38C54',x,.69,.205,.045,.44,.045);
  this.oval(body,'Face','#FFCE94',0,1.01,-.055,.54,.53,.49);
  for(const x of [-.105,.105])this.oval(body,'Eye','#23354D',x,1.015,-.282,.063,.078,.035);
  this.oval(body,'Nose','#FFE1AE',0,.952,-.304,.105,.105,.095);
  this.box(body,'#A76542',0,.879,-.275,.115,.021,.025);
  this.oval(body,'Helmet dark rim',dark,0,1.12,0,.80,.12,.75);
  this.shape(body,'Dome helmet','helmet',blue,0,1.12,.015,.77,.78,.72);
  this.oval(body,'Helmet highlight',enemy?'#FF9484':'#76D8FF',-.15,1.40,.10,.16,.035,.22);
  this.box(body,dark,0,1.15,.36,.49,.09,.035);
  for(const x of [-.31,.31]){const arm=this.shape(body,'Sleeve','capsule','#D6B272',x,.70,-.05,.205,.12,.22);arm.setRotationFromEuler(-55,0,x<0?-18:18);this.oval(body,'Hand','#F9C789',x<0?.03:.25,.67,-.31,.18,.19,.20);}
  this.compact(body,enemy?'red-body':'blue-body');for(const leg of legs)this.compact(leg,'infantry-leg');
  return {node:n,body,legs,gun:this.gun(body,'rifle'),phase:Math.random()*6.28,bornAt:-1000};
 }
 gun(parent:Node,id:WeaponId){
  const root=new Node('Weapon');parent.addChild(root);const key=`weapon-${id}`;
  if(!this.meshes[key]){
   this.box(root,id==='sniper'?'#244B58':'#6D4C30',.24,.70,-.24,.17,.18,.40);
   this.box(root,'#29323C',.24,.75,-.46,id==='shotgun'?.25:.15,.17,id==='sniper'?.70:.48);
   if(id==='shotgun')for(const x of [.17,.31])this.shape(root,'Twin barrel','cylinder','#657C8A',x,.78,-.74,.10,.38,.10).setRotationFromEuler(90,0,0);
   else this.shape(root,'Gun barrel','cylinder',id==='sniper'?'#75C9DF':'#344658',.24,.78,id==='sniper'?-.99:-.84,.085,id==='sniper'?.55:.35,.085).setRotationFromEuler(90,0,0);
   if(id==='sniper'){this.shape(root,'Scope','cylinder','#203A50',.24,.94,-.47,.14,.34,.14).setRotationFromEuler(90,0,0);this.oval(root,'Scope lens','#69DDF5',.24,.94,-.65,.12,.12,.025);}
   if(id==='shotgun')this.box(root,'#C98637',.24,.71,-.62,.26,.13,.20);
   this.compact(root,key);
  }else{const n=new Node('Combined model');root.addChild(n);const r=n.addComponent(MeshRenderer);r.mesh=this.meshes[key];r.setSharedMaterial(this.color('#FFFFFF'),0);}
  return root;
 }
 setWeapon(s:Soldier,id:WeaponId){const key=`weapon-${id}`;if(!this.meshes[key]){const preview=this.gun(s.body,id);preview.destroy();}s.gun.children[0].getComponent(MeshRenderer)!.mesh=this.meshes[key];s.gun.name=`Weapon ${id}`;}
 animate(s:Soldier,t:number,moving=true,recoil=0){const phase=t*10+s.phase,age=t-s.bornAt,p=age<0?1:Math.min(1,age/.28),q=p-1,size=p>=1?1:.65+.35*(1+2.70158*q*q*q+1.70158*q*q);s.node.setScale(size,size,size);s.body.setPosition(0,moving?.015+(1-Math.cos(phase*2))*.018:Math.sin(t*2+s.phase)*.009,recoil*.055);s.body.setRotationFromEuler((moving?-4:0)+recoil*5,Math.sin(t*.8+s.phase)*(moving?.7:1.6),Math.sin(phase)*(moving?1.5:.25));for(let i=0;i<2;i++){const stride=Math.sin(phase+i*Math.PI);s.legs[i].setRotationFromEuler(moving?stride*30:0,0,0);s.legs[i].setPosition(i===0?-.16:.16,.30+(moving?Math.max(0,stride)*.035:0),0);}}
 tracer(parent:Node,enemy=false,weapon:WeaponId='rifle'){
  const key=enemy?'red-bullet':weapon==='rifle'?'gold-bullet':`${weapon}-bullet`;if(!this.meshes[key]){const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[],profile=[[.22,0],[.195,.056],[.12,.075],[-.10,.075],[-.18,.045],[-.22,0]],sides=10;
   for(let j=0;j<profile.length;j++)for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2,r=profile[j][1],x=Math.cos(a),y=Math.sin(a);positions.push(x*r,y*r,profile[j][0]);normals.push(x,y,0);const c=new Color().fromHEX(j>=4?'#FFF3C2':enemy?(j<2?'#9C2940':'#FF6552'):weapon==='sniper'?(j<2?'#47A4D4':'#C8F8FF'):weapon==='shotgun'?'#FFB45C':(j<2?'#AA5C13':'#F9C74B')),shade=.62+.38*Math.max(0,-x*.4+y*.8);colors.push(c.r/255*shade,c.g/255*shade,c.b/255*shade,1);if(j<profile.length-1&&i<sides){const k=j*(sides+1)+i;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}}
   this.meshes[key]=this.mesh({positions,normals,colors,indices});
  }const n=new Node(enemy?'Enemy bullet':'Player bullet');parent.addChild(n);const r=n.addComponent(MeshRenderer);r.mesh=this.meshes[key];r.setSharedMaterial(this.color('#FFFFFF'),0);return n;
 }
 muzzle(parent:Node,impact=false){const n=new Node(impact?'Impact flash':'Muzzle flash');parent.addChild(n);this.shape(n,'Light',impact?'ring':'flare',impact?'#FFE8AD':'#FFD24A',0,0,0,impact?.44:.40,.06,impact?.44:.40);this.oval(n,'Hot core','#FFF5D6',0,.02,0,.14,.045,.14);this.compact(n,impact?'impact-flash':'muzzle');return n;}
 rewardCoin(parent:Node){const n=new Node('Reward coin');parent.addChild(n);this.shape(n,'Coin edge','coin','#B87912',0,0,0,.56,.09,.56);this.shape(n,'Coin rim','coin','#FFE181',0,.054,0,.54,.035,.54);this.shape(n,'Coin face','coin','#F6BF35',0,.078,0,.43,.018,.43);this.shape(n,'Coin stamp','star','#FFF2AE',0,.092,0,.26,.02,.26);this.compact(n,'reward-coin');return n;}
 barrel(parent:Node){this.shape(parent,'Drum shadow','cylinder','#152C4D44',.15,.015,.15,1.7,.015,1.45,true);this.shape(parent,'Supply drum','cylinder','#CF7025',0,.88,0,1.5,1.76,1.5);for(const y of [.18,.87,1.56])this.shape(parent,'Drum hoop','cylinder','#8C481E',0,y,0,1.56,.10,1.56);this.shape(parent,'Drum lid','cylinder','#F3AC54',0,1.78,0,1.5,.08,1.5);this.shape(parent,'Lid inset','cylinder','#B86528',.29,1.83,-.21,.22,.025,.22);this.box(parent,'#FFE2A5',0,1,.76,.55,.16,.025);this.box(parent,'#FFE2A5',0,1,.76,.16,.55,.025);}
 tank(parent:Node){const n=new Node('Siege tank');parent.addChild(n);this.shape(n,'Tank shadow','cylinder','#182D4F55',.3,.02,.25,3.3,.02,3.9,true);this.box(n,'#303A49',0,.40,0,3,.65,3.4);this.oval(n,'Armoured hull','#E85B42',0,.94,0,2.8,1.15,3.25);this.oval(n,'Turret','#FC7952',0,1.52,-.12,1.9,.95,1.9);this.box(n,'#A13A34',0,1.55,1.35,.32,.32,2.25);this.box(n,'#3C3342',0,1.55,2.4,.46,.43,.42);for(const x of [-1.27,1.27]){this.box(n,'#303541',x,.38,0,.55,.69,3.5);for(let i=0;i<6;i++)this.oval(n,'Track wheel','#667382',x,.34,-1.4+i*.56,.57,.57,.57);for(let i=0;i<10;i++)this.box(n,'#172B3E',x,.75,-1.52+i*.34,.59,.07,.13);}this.shape(n,'Commander hatch','cylinder','#A83A32',0,2.03,-.20,.63,.12,.63);return n;}
 ocean(parent:Node){
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];const size=180,steps=56;
  for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const x=-size+i*size*2/steps,z=-340+j*400/steps;positions.push(x,-1.05,z);normals.push(0,1,0);const swell=Math.sin(x*.49+z*.34)*Math.sin(z*.7-x*.12),ripple=Math.pow(Math.max(0,Math.sin(x*2.4+z*3.1+Math.sin(z*.7))),18);const f=.5+swell*.24;colors.push(.012+ripple*.10,.34+f*.15+ripple*.16,.75+f*.20+ripple*.06,1);if(i<steps&&j<steps){const a=j*(steps+1)+i;indices.push(a,a+steps+1,a+1,a+1,a+steps+1,a+steps+2);}}
  const mesh=this.mesh({positions,normals,colors,indices});this.meshes.ocean=mesh;const n=new Node('Blue water');parent.addChild(n);const r=n.addComponent(MeshRenderer);r.mesh=mesh;r.setSharedMaterial(this.color('#FFFFFF'),0);
 }
 dispose(){for(const m of this.materials.values())m.destroy();for(const m of Object.values(this.meshes))m.destroy();}
}
