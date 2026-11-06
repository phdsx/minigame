import {_decorator,Component,Node,Camera,Canvas,UITransform,Graphics,Color,Label,LabelOutline,Layers,view,ResolutionPolicy,input,Input,EventKeyboard,KeyCode,EventTouch,EventMouse,Vec3,Vec4,DirectionalLight,sys,game,Game,AudioSource,AudioClip,resources,MeshRenderer,profiler,director,RenderTexture,Sprite,SpriteFrame} from 'cc';
import {Art,Soldier} from './Art';
import {TUNING,LEVELS,CHAPTERS,UPGRADE_LIMITS,WEAPONS,WEAPON_IDS,WeaponId,startingSquad,levelRules,battleReward,Progress,EncounterSpec,encounters,clamp,freshProgress,validateProgress,upgradeCost,segmentBoxHit} from './Rules';
import {APP_VERSION,PRODUCER} from './ProjectInfo';
import {makeSaveFile,readSaveFile,MAX_SAVE_BYTES} from './SaveFiles';
const {ccclass}=_decorator;
type Phase='menu'|'running'|'paused'|'won'|'lost';
interface Actor {spec:EncounterSpec;node:Node;x:number;z:number;prevZ:number;hp:number;maxHp:number;value:number;hits:number;label:Label;tag:Node;bar:Graphics;troops:Soldier[];cooldown:number;dead:boolean;pulse:number;dirty:boolean;positive:boolean;warning:Node|null;aimX:number;volley:number;enraged:boolean;}
interface Shot {node:Node;x:number;z:number;vx:number;vz:number;tailX:number;tailZ:number;damage:number;tankBonus:number;enemy:boolean;active:boolean;}
interface Spark {node:Node;life:number;vx:number;vy:number;vz:number;}
interface CoinFx {node:Node;face:Node;life:number;duration:number;vx:number;vy:number;vz:number;angle:number;spin:number;}
const C={ink:'#174886',muted:'#8EACCA',white:'#FFFFFF',green:'#7BE22C',gold:'#FFE145',blue:'#26B5FF',red:'#FF5948'};
const SAVE_KEY='bridgeheaddefender.save.v1';
const MANUAL_KEY='bridgeheaddefender.save.manual.v1',RESTORE_KEY='bridgeheaddefender.save.before-restore.v1';

@ccclass('Bridgehead')
export class Bridgehead extends Component {
 art!:Art;world!:Node;camera!:Camera;canvas!:Node;overlay!:Node;overlayG!:Graphics;panel!:Node;hud!:Node;
 squadRoot!:Node;soldiers:Soldier[]=[];actors:Actor[]=[];shots:Shot[]=[];sparks:Spark[]=[];roadMarkers:Node[]=[];waves:Node[]=[];
 flashes:{node:Node;life:number;duration:number;impact:boolean}[]=[];coins:CoinFx[]=[];recoil=0;playerShotCursor=0;enemyShotCursor=0;
 software=false;sceneTexture:RenderTexture|null=null;sceneFrame:SpriteFrame|null=null;
 rules=levelRules(1);phase:Phase='menu';progress:Progress=freshProgress();squad=8;x=0;targetX=0;distance=0;clock=0;fire=0;spawned=0;level=1;damageBonus=0;earned=0;kills=0;gatesTaken=0;barrelsTaken=0;reward=0;
 specs:EncounterSpec[]=[];keys=new Set<number>();drag=false;dragPointer:number|'mouse'|null=null;lastPointer=0;hudSquad!:Label;hudLevel!:Label;hudProgress!:Graphics;tip!:Label;banner!:Label;bannerTime=0;bannerNode!:Node;statusText!:Label;
 platePaint=new WeakMap<Node,()=>void>();sound!:AudioSource;music!:AudioSource;clips=new Map<string,AudioClip>();storageOK=true;saveBlocked=false;storageNotice='';timeScale=1;shotCount=0;damageTaken=0;frames:number[]=[];temp=new Vec3();tempWorld=new Vec3();tempEdge=new Vec3();hudTick=0;
 menuScreen:'camp'|'saves'|'credits'|'confirm'|'armory'='camp';saveMessage='';fileInput:HTMLInputElement|null=null;importPending=false;
 weaponButtons:{id:WeaponId;node:Node;label:Label}[]=[];

 async start(){
  view.setDesignResolutionSize(720,1280,ResolutionPolicy.SHOW_ALL);
  // Avoid a 4–9x framebuffer cost on high-DPI Web displays; UI coordinates
  // remain at the same 720x1280 design resolution.
  view.enableRetina(false);
  profiler.hideStats();
  this.software=/swiftshader|llvmpipe|softpipe|software/i.test(director.root!.device.renderer);this.loadSave();this.level=this.progress.selected;this.art=new Art();this.makeWorld();this.makeUI();this.makeAudio();this.syncSquad();this.showMenu();
  input.on(Input.EventType.KEY_DOWN,this.keyDown,this);input.on(Input.EventType.KEY_UP,this.keyUp,this);
  input.on(Input.EventType.TOUCH_START,this.touchStart,this);input.on(Input.EventType.TOUCH_MOVE,this.touchMove,this);input.on(Input.EventType.TOUCH_END,this.release,this);input.on(Input.EventType.TOUCH_CANCEL,this.release,this);
  input.on(Input.EventType.MOUSE_DOWN,this.mouseDown,this);input.on(Input.EventType.MOUSE_MOVE,this.mouseMove,this);input.on(Input.EventType.MOUSE_UP,this.release,this);
  game.on(Game.EVENT_HIDE,this.onHide,this);
  (globalThis as any).__bridgehead=this;
 }
 makeWorld(){
  this.world=new Node('World');this.node.addChild(this.world);
  const cn=new Node('Battle camera');this.node.addChild(cn);cn.setPosition(0,17,25);cn.lookAt(new Vec3(0,0,-2));this.camera=cn.addComponent(Camera);this.camera.fov=48;this.camera.near=.1;this.camera.far=400;this.camera.clearColor=new Color(12,137,244);this.camera.visibility=Layers.Enum.DEFAULT;
  const sun=new Node('Sun');this.node.addChild(sun);sun.setRotationFromEuler(-53,-28,0);const light=sun.addComponent(DirectionalLight);light.color=new Color(255,239,207);light.illuminance=42000;
  const globals=this.node.scene.globals;globals.skybox.enabled=false;globals.ambient.skyIllum=22000;globals.ambient.skyColor=new Vec4(.75,.86,.93,1);globals.ambient.groundAlbedo=new Vec4(.5,.6,.6,1);
  this.art.ocean(this.world);
  this.art.box(this.world,'#809AB7',0,-.5,-145,10.4,.9,340);
  this.art.box(this.world,'#E6E9EF',0,0,-145,9.65,.15,340);
  for(const x of [-4.91,4.91]){this.art.box(this.world,'#B4C2D1',x,.23,-145,.32,.40,340);this.art.box(this.world,'#F6FAFF',x,.46,-145,.34,.09,340);this.art.box(this.world,'#718CA5',x,.32,-145,.35,.07,340);}
  for(let i=0;i<24;i++){const m=new Node('Road markers');this.world.addChild(m);this.art.box(m,'#FFFFFF',0,.09,0,.13,.01,1.8);for(const x of [-4.43,4.43]){this.art.box(m,'#FFFFFF',x,.09,0,.13,.01,4.8);this.art.box(m,'#9CAEC1',x*1.1,.52,0,.20,.10,1.15);}m.setPosition(0,0,13-i*4.8);this.roadMarkers.push(m);}
  for(let i=0;i<24;i++){const x=(i%2===0?-1:1)*(6+(i*7.31)%24),z=-85+(i*4.73)%110;const w=this.art.oval(this.world,'Water glint',i%3?'#63CEFF44':'#B6EFFF60',x,-.88,z,.8+(i%4)*.7,.018,.10+(i%3)*.045);w.setRotationFromEuler(0,-15,0);this.waves.push(w);}
  this.squadRoot=new Node('Player formation');this.world.addChild(this.squadRoot);this.squadRoot.setPosition(0,.11,5.6);
  for(let i=0;i<TUNING.maxSquad;i++){const s=this.art.soldier(this.squadRoot);s.node.active=false;this.soldiers.push(s);}
  for(const id of WEAPON_IDS){const preview=this.art.tracer(this.world,false,id);preview.destroy();}
  // All transient projectiles and particles are pooled. Meshes and materials are shared.
  for(let i=0;i<TUNING.playerProjectiles+TUNING.enemyProjectiles;i++){const enemy=i>=TUNING.playerProjectiles,n=this.art.tracer(this.world,enemy);n.active=false;this.shots.push({node:n,x:0,z:0,vx:0,vz:0,tailX:0,tailZ:0,damage:0,tankBonus:1,enemy,active:false});}
  for(let i=0;i<80;i++){const impact=i>=48,n=this.art.muzzle(this.world,impact);n.active=false;this.flashes.push({node:n,life:0,duration:1,impact});}
  for(let i=0;i<60;i++){const n=this.art.shape(this.world,'Round spark','spark',i%2?'#FFECC1':'#F5CD79',0,-10,0,.09,.09,.09,true);n.active=false;this.sparks.push({node:n,life:0,vx:0,vy:0,vz:0});}
  for(let i=0;i<24;i++){const n=this.art.rewardCoin(this.world);n.active=false;this.coins.push({node:n,face:n.children[0],life:0,duration:1,vx:0,vy:0,vz:0,angle:0,spin:0});}
 }
 makeUI(){
  const cn=new Node('Interface camera');this.node.addChild(cn);cn.setPosition(0,0,1000);const c=cn.addComponent(Camera);c.projection=Camera.ProjectionType.ORTHO;c.orthoHeight=640;c.visibility=Layers.Enum.UI_2D;c.priority=10;c.clearFlags=Camera.ClearFlag.DEPTH_ONLY;
  this.canvas=this.uiNode(this.node,'Interface',0,0,720,1280);this.canvas.addComponent(Canvas).cameraComponent=c;
  if(this.software){this.sceneTexture=new RenderTexture();this.sceneTexture.reset({width:504,height:896});this.sceneTexture.setFilters(RenderTexture.Filter.LINEAR,RenderTexture.Filter.LINEAR);this.camera.targetTexture=this.sceneTexture;this.sceneFrame=new SpriteFrame();this.sceneFrame.texture=this.sceneTexture;const image=this.uiNode(this.canvas,'Scaled 3D scene',0,0,720,1280),sprite=image.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.sceneFrame;c.clearFlags=Camera.ClearFlag.SOLID_COLOR;c.clearColor=new Color(9,79,140);}
  this.hud=this.uiNode(this.canvas,'Battle HUD',0,0,720,1280);
  this.hudLevel=this.label(this.hud,'',0,563,33,470,48,C.white);this.outline(this.hudLevel);
  this.hudSquad=this.label(this.hud,'',-250,553,34,190,52,C.white);this.outline(this.hudSquad);
  this.hudProgress=this.uiNode(this.hud,'Advance',0,516,360,12).addComponent(Graphics);
  this.button(this.hud,'Ⅱ',285,551,90,90,()=>this.togglePause(),'#FFFFFF',C.ink,32);
  this.tip=this.label(this.hud,'左右拖动 · 自动开火',0,-482,27,660,50,C.white);this.outline(this.tip,3);
  for(let i=0;i<WEAPON_IDS.length;i++){const id=WEAPON_IDS[i],node=this.button(this.hud,'',-214+i*214,-553,200,86,()=>this.equipWeapon(id),'#FFFFFF',C.ink,25);this.weaponButtons.push({id,node,label:node.children[0].getComponent(Label)!});this.platePaint.set(node,()=>this.paintWeaponButton(id));}
  this.bannerNode=this.uiNode(this.hud,'Combat message',0,-90,590,64);this.banner=this.label(this.bannerNode,'',0,0,27,590,64,C.green);this.banner.cacheMode=Label.CacheMode.CHAR;this.outline(this.banner,3);this.bannerNode.active=false;
  this.overlay=this.uiNode(this.canvas,'Overlay',0,0,720,1280);this.overlayG=this.overlay.addComponent(Graphics);
  this.panel=this.uiNode(this.overlay,'Menu',0,0,720,1280);
  this.statusText=this.label(this.canvas,this.storageNotice,0,-610,20,680,38,C.gold);
 }
 uiNode(parent:Node,name:string,x:number,y:number,w:number,h:number){const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.setPosition(x,y);n.addComponent(UITransform).setContentSize(w,h);return n;}
 plate(parent:Node,x:number,y:number,w:number,h:number,color:string,r=16,alpha=255){const n=this.uiNode(parent,'Panel',x,y,w,h);const g=n.addComponent(Graphics);const paint=()=>{g.clear();const c=new Color().fromHEX(color);g.fillColor=new Color(c.r,c.g,c.b,alpha);g.roundRect(-w/2,-h/2,w,h,r);g.fill();};this.platePaint.set(n,paint);paint();return n;}
 label(parent:Node,text:string,x:number,y:number,size:number,w:number,h:number,color=C.white){const n=this.uiNode(parent,'Text',x,y,w,h);const l=n.addComponent(Label);l.string=text;l.fontSize=size;l.lineHeight=size+9;l.color=new Color().fromHEX(color);l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;l.overflow=Label.Overflow.CLAMP;l.isBold=true;return l;}
 outline(label:Label,width=3){const o=label.node.addComponent(LabelOutline);o.color=new Color(20,44,74);o.width=width;return label;}
 coinIcon(parent:Node,x:number,y:number,size:number){const n=this.uiNode(parent,'Round coin icon',x,y,size,size),g=n.addComponent(Graphics),r=size/2;g.fillColor=new Color().fromHEX('#A9670C');g.circle(0,-r*.07,r);g.fill();g.fillColor=new Color().fromHEX('#FFD965');g.circle(0,r*.025,r*.90);g.fill();g.fillColor=new Color().fromHEX('#F0B62C');g.circle(0,r*.025,r*.70);g.fill();g.strokeColor=new Color().fromHEX('#FFF0A7');g.lineWidth=Math.max(1.2,size*.035);g.circle(0,r*.025,r*.72);g.stroke();g.fillColor=new Color().fromHEX('#FFF2B6');for(let i=0;i<10;i++){const a=i*Math.PI/5,rad=r*(i%2?.23:.48),px=Math.sin(a)*rad,py=Math.cos(a)*rad+r*.025;if(i===0)g.moveTo(px,py);else g.lineTo(px,py);}g.close();g.fill();g.strokeColor=new Color(255,251,213,210);g.arc(0,r*.025,r*.83,.6,2.65,false);g.stroke();return n;}
 moneyLabel(parent:Node,text:string,x:number,y:number,size:number,width:number,height:number,color=C.gold){const n=this.uiNode(parent,'Coin amount',x,y,width,height),icon=size*1.05,units=Array.from(text).reduce((sum,ch)=>sum+(/[^\x00-\xff]/.test(ch)?1:.65),0),tw=Math.min(width-icon-14,Math.ceil(size*units+12)),left=-(tw+icon+12)/2;this.coinIcon(n,left+icon/2,0,icon);return this.label(n,text,left+icon+12+tw/2,0,size,tw,height,color);}
 button(parent:Node,text:string,x:number,y:number,w:number,h:number,action:()=>void,bg=C.green,fg=C.ink,size=26){const n=this.plate(parent,x,y,w,h,bg,16);this.label(n,text,0,0,size,w-20,h-4,fg);n.on(Node.EventType.TOUCH_START,()=>{n.setScale(.97,.97);this.release();},this);n.on(Node.EventType.TOUCH_CANCEL,()=>n.setScale(1,1),this);n.on(Node.EventType.TOUCH_END,()=>{n.setScale(1,1);this.play('tap');action();},this);return n;}
 redrawPlates(n:Node){if(!n.activeInHierarchy)return;this.platePaint.get(n)?.();for(const child of n.children)this.redrawPlates(child);}
 clearPanel(alpha=180){for(const child of this.panel.children.slice())child.destroy();this.panel.removeAllChildren();this.overlay.active=true;this.overlayG.clear();this.overlayG.fillColor=new Color(7,26,40,alpha);this.overlayG.rect(-2000,-2000,4000,4000);this.overlayG.fill();}
 showMenu(page=Math.floor((this.progress.selected-1)/6)){
  this.menuScreen='camp';
  this.clearActors();this.release();this.music.pause();for(const s of this.shots){s.active=false;s.node.active=false;}for(const c of this.coins){c.life=0;c.node.active=false;}for(const f of this.flashes){f.life=0;f.node.active=false;}this.phase='menu';this.level=this.progress.selected;this.hud.active=false;this.clearPanel(0);
  this.outline(this.label(this.panel,'桥头防线',0,487,75,650,105),5);
  this.outline(this.label(this.panel,'BUILD YOUR ARMY',0,411,23,650,42,C.gold),2);
  this.button(this.panel,`武器库 · ${this.weapon.name}`,0,121,420,66,()=>this.showArmory(),'#FFFFFF',C.ink,26);
  const card=this.plate(this.panel,0,324,560,76,'#FFFFFF',20,238);
  this.label(card,`第 ${this.level} / ${LEVELS.length} 关 · ${LEVELS[this.level-1]}`,0,0,29,530,58,C.ink);
  page=clamp(page,0,CHAPTERS.length-1);
  this.outline(this.label(this.panel,`第 ${page+1} 章 · ${CHAPTERS[page]}`,0,52,29,650,46,C.white));
  this.button(this.panel,'‹',-294,-25,54,88,()=>this.showMenu((page+CHAPTERS.length-1)%CHAPTERS.length),'#284757',C.white,36);
  for(let slot=0;slot<6;slot++){const i=page*6+slot+1;this.button(this.panel,i<=this.progress.unlocked?`${i}`:`${i}\n锁定`,-210+slot*84,-25,76,88,()=>{if(i<=this.progress.unlocked){this.progress.selected=i;this.save();this.showMenu();}else{this.statusText.string=`先突破第 ${i-1} 关`;this.unschedule(this.clearStatus);this.scheduleOnce(this.clearStatus,2);}},i===this.level?C.green:'#284757',i===this.level?C.ink:'#CEDFD9',23);}
  this.button(this.panel,'›',294,-25,54,88,()=>this.showMenu((page+1)%CHAPTERS.length),'#284757',C.white,36);
  this.button(this.panel,'开始战斗   ▶',0,-133,616,92,()=>this.begin());
  this.outline(this.moneyLabel(this.panel,`金币 ${this.progress.coins}`,0,-223,29,620,46,C.gold));
  this.upgradeButton('damage',-157,-315,'火力',`单弹伤害 ${(1+this.progress.damage*.15).toFixed(2)}`);
  this.upgradeButton('recruits',157,-315,'兵力',`初始 ${startingSquad(this.progress.recruits)} / ${TUNING.maxSquad} 人`);
  this.button(this.panel,'存档管理',-210,-431,196,88,()=>this.showSaves(),'#FFFFFF',C.ink,24);
  this.button(this.panel,'制作人介绍',0,-431,196,88,()=>this.showCredits(),'#FFFFFF',C.ink,24);
  this.button(this.panel,this.progress.muted?'声音 关':'声音 开',210,-431,196,88,()=>{this.progress.muted=!this.progress.muted;this.save();this.applySound();this.showMenu();},'#FFFFFF',C.ink,24);
  this.outline(this.label(this.panel,'左右拖动军队 · 自动射击\nA / D 移动 · 空格暂停 · R 重试',0,-536,25,650,84,C.white),2);
  this.squad=startingSquad(this.progress.recruits);this.x=0;this.targetX=0;this.squadRoot.setPosition(0,.11,-10.5);this.squadRoot.setScale(1.7,1.7,1.7);this.squadRoot.setRotationFromEuler(0,180,0);this.syncSquad();this.refreshWeapons();this.refreshHUD();
 }
 get weapon(){return WEAPONS[this.progress.weapon||'rifle'];}
 paintWeaponButton(id:WeaponId){const b=this.weaponButtons.find(b=>b.id===id);if(!b)return;const spec=WEAPONS[id],locked=this.progress.unlocked<spec.unlock,selected=(this.progress.weapon||'rifle')===id,g=b.node.getComponent(Graphics)!;g.clear();g.fillColor=new Color().fromHEX(locked?'#46617B':selected?C.green:'#FFFFFF');g.roundRect(-100,-43,200,86,14);g.fill();b.label.string=locked?`${spec.name}\n第 ${spec.unlock} 关解锁`:`${WEAPON_IDS.indexOf(id)+1} · ${spec.name}`;b.label.color=new Color().fromHEX(locked?'#DFE8F0':C.ink);}
 refreshWeapons(){for(const b of this.weaponButtons)this.paintWeaponButton(b.id);for(const s of this.soldiers)this.art.setWeapon(s,this.progress.weapon||'rifle');}
 equipWeapon(id:WeaponId){if(this.progress.unlocked<WEAPONS[id].unlock){this.toast(`第 ${WEAPONS[id].unlock} 关解锁${WEAPONS[id].name}`,C.gold);return false;}if((this.progress.weapon||'rifle')===id)return true;this.progress.weapon=id;if(this.phase==='running')this.fire=Math.max(this.fire,.25,this.weapon.interval*.4);this.refreshWeapons();this.save();if(this.phase==='running')this.toast(`切换 · ${this.weapon.name}`,C.gold);return true;}
 showArmory(){this.menuScreen='armory';this.clearPanel(235);this.label(this.panel,'武器库',0,460,48,650,72);for(let i=0;i<WEAPON_IDS.length;i++){const id=WEAPON_IDS[i],w=WEAPONS[id],locked=this.progress.unlocked<w.unlock,selected=(this.progress.weapon||'rifle')===id,card=this.button(this.panel,'',0,270-i*200,620,170,()=>{if(!locked){this.equipWeapon(id);this.showArmory();}},selected?C.green:locked?'#3C5670':'#FFFFFF');this.label(card,`${w.name} · ${locked?`第 ${w.unlock} 关解锁`:selected?'已装备':'点击装备'}`,0,49,29,580,44,locked?'#DFE8F0':C.ink);this.label(card,w.description,0,-25,25,576,91,locked?'#C9D6E2':'#38638C');}this.label(this.panel,'战斗中点击底部武器，或按 1 / 2 / 3 切换\n切换会保留射击间隔，不能取消冷却。',0,-337,25,650,80,'#C8DED6');this.button(this.panel,'返回营地',0,-455,540,88,()=>this.showMenu(),'#FFFFFF',C.ink,28);}
 progressSummary(p:Progress){return `已解锁 ${p.unlocked} / ${LEVELS.length} 关 · 当前第 ${p.selected} 关\n金币 ${p.coins} · 火力 ${p.damage} 级 · 兵力 ${p.recruits} 级`;}
 saveFeedback(message:string){this.saveMessage=message;this.showSaves();}
 showSaves(){
  this.menuScreen='saves';this.clearPanel(235);
  this.label(this.panel,'存档管理',0,463,48,650,72);
  this.label(this.panel,'自动记录进度，也可单独建立手动存档',0,392,25,660,50,'#C8DED6');
  const auto=this.plate(this.panel,0,285,620,142,'#FFFFFF');
  this.label(auto,this.saveBlocked?'自动存档 · 原始数据已保护':this.storageOK?'自动存档 · 已开启':'自动存档 · 暂不可用',0,42,26,580,40,C.ink);
  this.label(auto,this.progressSummary(this.progress),0,-17,24,580,82,'#38638C');
  let manual:ReturnType<typeof readSaveFile>=null,hasUndo=false;
  try{manual=readSaveFile(sys.localStorage.getItem(MANUAL_KEY)||'');hasUndo=!!sys.localStorage.getItem(RESTORE_KEY);}catch{}
  const slot=this.plate(this.panel,0,114,620,156,'#244665');
  this.label(slot,`手动存档 · ${WEAPONS[manual?.progress.weapon||'rifle'].name}`,0,48,27,580,40,C.gold);
  this.label(slot,manual?this.progressSummary(manual.progress):'尚无可读取的手动存档\n点击「手动保存」建立独立备份',0,-8,25,580,82,C.white);
  if(manual?.savedAt)this.label(this.panel,`保存于 ${new Date(manual.savedAt).toLocaleString('zh-CN',{hour12:false})}`,0,8,23,650,40,'#C8DED6');
  this.button(this.panel,'手动保存',-157,-66,302,88,()=>this.manualSave());
  this.button(this.panel,'读取手动存档',157,-66,302,88,()=>{if(manual)this.confirmRestore(manual.progress,'手动存档');else this.saveFeedback('没有可读取的手动存档，请先保存。');},manual?'#FFFFFF':'#496078',manual?C.ink:'#E0E7EF',25);
  this.button(this.panel,'导出存档文件',-157,-178,302,88,()=>this.exportSave(),'#FFFFFF',C.ink,25);
  this.button(this.panel,this.importPending?'正在选择文件…':'导入存档文件',157,-178,302,88,()=>this.chooseSaveFile(),'#FFFFFF',C.ink,25);
  if(hasUndo)this.button(this.panel,'撤销上次读取',0,-283,480,76,()=>this.confirmUndo(),'#365877',C.white,25);
  this.label(this.panel,this.saveMessage||'文件保存在你选择的位置，可用于更换浏览器。',0,hasUndo?-361:-300,25,636,90,this.saveMessage?C.gold:'#C8DED6');
  this.button(this.panel,'返回营地',0,-470,540,88,()=>{this.saveMessage='';this.showMenu();},'#FFFFFF',C.ink,28);
 }
 manualSave(){
  try{
   const previous=sys.localStorage.getItem(MANUAL_KEY);
   if(previous)sys.localStorage.setItem(MANUAL_KEY+'.backup',previous);
   sys.localStorage.setItem(MANUAL_KEY,JSON.stringify(makeSaveFile(this.progress,APP_VERSION)));
   this.save();this.saveFeedback(this.storageOK&&!this.saveBlocked?'手动存档已保存。':'手动存档已保存；自动存档仍处于保护状态。');
  }catch{this.saveFeedback('保存失败，原有手动存档仍保留。\n可尝试导出文件备份。');}
 }
 exportSave(){
  try{
   if(typeof document==='undefined')throw new Error('Web unavailable');
   const blob=new Blob([JSON.stringify(makeSaveFile(this.progress,APP_VERSION),null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`桥头防线-存档-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.style.display='none';document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);
   this.saveFeedback(this.saveBlocked?'已导出当前临时进度；原始自动存档仍受保护。':'已发起下载，请在浏览器下载列表中查看。');
  }catch{this.saveFeedback('浏览器未能导出文件，请先使用手动保存。');}
 }
 chooseSaveFile(){
  if(this.importPending)return;
  if(typeof document==='undefined'){this.saveFeedback('当前环境不支持文件选择。');return;}
  const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.style.display='none';document.body.appendChild(picker);this.fileInput=picker;this.importPending=true;
  const clear=()=>{picker.remove();if(this.fileInput===picker)this.fileInput=null;this.importPending=false;};
  picker.oncancel=()=>{clear();if(this.isValid)this.saveFeedback('已取消导入，进度未改变。');};
  picker.onchange=async()=>{
   const file=picker.files?.[0];clear();if(!file||!this.isValid)return;
   if(file.size>MAX_SAVE_BYTES){this.saveFeedback('文件过大，请选择桥头防线的 JSON 存档。');return;}
   try{const parsed=readSaveFile(await file.text());if(!this.isValid)return;if(!parsed){this.saveFeedback('文件无效或版本不支持，现有进度未改变。');return;}this.confirmRestore(parsed.progress,'导入文件');}
   catch{if(this.isValid)this.saveFeedback('读取文件失败，现有进度未改变。');}
  };
  picker.click();
 }
 confirmRestore(p:Progress,source:string){
  this.menuScreen='confirm';this.clearPanel(240);this.label(this.panel,`读取${source}`,0,375,43,650,70);
  this.label(this.panel,`将读取以下进度 · ${WEAPONS[p.weapon||'rifle'].name}`,0,278,28,620,48,'#C8DED6');
  const card=this.plate(this.panel,0,145,620,160,'#FFFFFF');this.label(card,this.progressSummary(p),0,0,28,580,120,C.ink);
  this.label(this.panel,'当前进度会先备份，可在存档管理中撤销。\n手动存档不会因读取文件而被覆盖。',0,-20,27,650,112,C.gold);
  this.button(this.panel,'备份当前进度并读取',0,-175,600,92,()=>this.restoreProgress(p),C.green,C.ink,28);
  this.button(this.panel,'取消',0,-300,540,88,()=>this.showSaves(),'#FFFFFF',C.ink,28);
 }
 restoreProgress(p:Progress){
  const target=validateProgress(p);if(!target){this.saveFeedback('存档校验失败，进度未改变。');return;}
  try{
   const primary=sys.localStorage.getItem(SAVE_KEY),backup=sys.localStorage.getItem(SAVE_KEY+'.backup');
   sys.localStorage.setItem(RESTORE_KEY,JSON.stringify({progress:{...this.progress},primary,backup}));
   const text=JSON.stringify(target);this.writeStoragePair(text,text);
   this.progress=target;this.storageOK=true;this.saveBlocked=false;this.storageNotice='';this.applySound();this.clearStatus();this.saveFeedback('读取成功。返回营地即可继续；支持撤销上次读取。');
  }catch{
   this.saveFeedback('未能完成读取，当前进度未切换。\n读取前的数据已尽可能保留。');
  }
 }
 writeStoragePair(primary:string|null,backup:string|null){
  const oldPrimary=sys.localStorage.getItem(SAVE_KEY),oldBackup=sys.localStorage.getItem(SAVE_KEY+'.backup');
  const write=(key:string,raw:string|null)=>{if(raw===null)sys.localStorage.removeItem(key);else sys.localStorage.setItem(key,raw);};
  try{write(SAVE_KEY,primary);write(SAVE_KEY+'.backup',backup);}
  catch(error){
   try{write(SAVE_KEY,oldPrimary);write(SAVE_KEY+'.backup',oldBackup);}
   catch{this.storageOK=false;this.storageNotice='存储写入中断，读取前的数据仍在恢复备份中';this.clearStatus();}
   throw error;
  }
 }
 confirmUndo(){
  this.menuScreen='confirm';this.clearPanel(240);this.label(this.panel,'撤销上次读取',0,240,43,650,70);
  this.label(this.panel,'恢复到最近一次读取之前的进度。\n读取之后的新进度将被替换。',0,100,28,650,112,C.gold);
  this.button(this.panel,'确认撤销',0,-80,540,92,()=>{
   try{const old=JSON.parse(sys.localStorage.getItem(RESTORE_KEY)||'null'),p=validateProgress(old?.progress);if(!p||!(old.primary===null||typeof old.primary==='string')||!(old.backup===null||typeof old.backup==='string'))throw new Error('Invalid undo');
    this.writeStoragePair(old.primary,old.backup);
    this.progress=p;this.loadSave();this.applySound();sys.localStorage.removeItem(RESTORE_KEY);this.saveFeedback('已恢复读取前的进度。');
   }catch{this.saveFeedback('撤销失败，备份仍保留，请勿清理浏览器数据。');}
  },C.green,C.ink,28);
  this.button(this.panel,'取消',0,-205,540,88,()=>this.showSaves(),'#FFFFFF',C.ink,28);
 }
 showCredits(){
  this.menuScreen='credits';this.clearPanel(235);this.label(this.panel,'制作人介绍',0,430,48,650,72);
  const card=this.plate(this.panel,0,177,620,340,'#FFFFFF');
  this.label(card,'制作人',0,115,28,570,48,'#38638C');this.label(card,PRODUCER.name,0,46,43,570,70,C.ink);
  this.label(card,PRODUCER.intro,0,-54,28,560,100,'#38638C');
  this.button(this.panel,'访问游戏项目主页  ↗',0,-65,540,84,()=>{if(typeof window!=='undefined')window.open(PRODUCER.homepage,'_blank','noopener,noreferrer');},C.green,C.ink,28);
  this.label(this.panel,'集结军队，选择路线，突破 30 道防线。\n用走位、射击与成长迎战桥头守军。',0,-173,28,650,100,C.white);
  this.label(this.panel,`Web 试玩版 ${APP_VERSION}\n本项目自行制作模型、动画与音效。`,0,-280,25,650,95,'#C8DED6');
  this.button(this.panel,'返回营地',0,-440,540,88,()=>this.showMenu(),'#FFFFFF',C.ink,28);
 }
 upgradeButton(kind:'damage'|'recruits',x:number,y:number,title:string,info:string){const lv=this.progress[kind],cost=upgradeCost(lv),max=lv>=UPGRADE_LIMITS[kind];const n=this.button(this.panel,'',x,y,302,126,()=>this.buy(kind),'#FFFFFF');this.label(n,`${title} Lv.${lv} / ${UPGRADE_LIMITS[kind]}`,0,32,26,280,38,C.ink);this.label(n,info,0,0,22,280,34,'#38638C');if(max)this.label(n,'已满级',0,-34,24,280,36,C.ink);else this.moneyLabel(n,`${cost}`,0,-34,24,280,36,this.progress.coins>=cost?'#9A5B04':'#798C9B');}
 buy(kind:'damage'|'recruits'){const lv=this.progress[kind],cost=upgradeCost(lv);if(lv>=UPGRADE_LIMITS[kind])return;if(this.progress.coins<cost){this.statusText.string='资金不足：完成行动即可获得金币';this.unschedule(this.clearStatus);this.scheduleOnce(this.clearStatus,2);return;}this.progress.coins-=cost;this.progress[kind]++;this.save();this.showMenu();this.play('power');}
 begin(){
  this.squadRoot.setScale(1,1,1);this.squadRoot.setRotationFromEuler(0,0,0);
  this.recoil=0;for(const f of this.flashes){f.life=0;f.node.active=false;}
  for(const c of this.coins){c.life=0;c.node.active=false;}
  this.clearActors();for(const s of this.shots){s.active=false;s.node.active=false;}for(const s of this.sparks){s.life=0;s.node.active=false;}
  this.phase='running';this.overlay.active=false;this.hud.active=true;this.redrawPlates(this.hud);this.level=this.progress.selected;this.rules=levelRules(this.level);this.specs=encounters(this.level);this.distance=0;this.clock=0;this.fire=.1;this.spawned=0;this.earned=0;this.kills=0;this.gatesTaken=0;this.barrelsTaken=0;this.damageBonus=0;this.reward=0;this.shotCount=0;this.damageTaken=0;this.x=0;this.targetX=0;this.squad=startingSquad(this.progress.recruits);this.squadRoot.setPosition(0,.11,5.6);this.roadMarkers.forEach((m,i)=>m.setPosition(0,0,13-i*4.8));this.waves.forEach((w,i)=>w.setPosition(w.position.x,-.88,-85+(i*4.73)%110));this.hudTick=0;this.release();this.keys.clear();this.syncSquad();this.refreshWeapons();this.toast('提前瞄准数字牌 · 转绿后通过');this.music.play();this.applySound();this.refreshHUD();
 }
 togglePause(){if(this.phase==='running'){this.phase='paused';this.release();this.keys.clear();this.music.pause();this.clearPanel(185);this.label(this.panel,'行动暂停',0,180,48,600,75);this.label(this.panel,'调整呼吸，重新集结。',0,96,24,600,45,'#BCD1CC');this.button(this.panel,'继续行动',0,-12,510,86,()=>{this.phase='running';this.overlay.active=false;this.music.play();});this.button(this.panel,'返回营地',0,-121,510,76,()=>{this.clearActors();this.showMenu();},'#284757',C.white);}else if(this.phase==='paused'){this.phase='running';this.overlay.active=false;this.music.play();}}
 finish(won:boolean){if(this.phase!=='running')return;this.phase=won?'won':'lost';for(const a of this.actors)if(a.warning)a.warning.active=false;this.refreshHUD();for(const s of this.shots){s.active=false;s.node.active=false;}this.release();this.keys.clear();this.music.pause();this.reward=Math.min(battleReward(this.level,won,this.earned,this.kills,this.distance),Math.max(0,999999-this.progress.coins));this.progress.coins+=this.reward;if(won)this.progress.unlocked=Math.min(LEVELS.length,Math.max(this.progress.unlocked,this.level+1));this.save();this.play(won?'win':'lose');this.clearPanel(205);this.label(this.panel,won?'防线已突破':'军队需要增援',0,290,49,660,80,won?C.green:C.red);this.label(this.panel,won?`${LEVELS[this.level-1]} · 行动成功`:'回营升级，换一条路线再试一次',0,209,25,640,50);this.moneyLabel(this.panel,`获得 ${this.reward}`,0,108,46,600,70,C.gold);this.label(this.panel,`击破 ${this.kills} 支敌军   ·   通过 ${this.gatesTaken} 道门\n剩余兵力 ${this.squad}   ·   补给 ${this.barrelsTaken} 份`,0,17,24,620,85,'#C8DED6');this.button(this.panel,won&&this.level<LEVELS.length?'下一场行动  →':'再次出击',0,-111,570,88,()=>{if(won&&this.level<LEVELS.length){this.progress.selected=this.level+1;this.save();}this.begin();});this.button(this.panel,'返回营地 / 升级',0,-222,570,78,()=>{this.clearActors();this.showMenu();},'#284757',C.white);if(won&&this.level===LEVELS.length)this.label(this.panel,'30 道防线全部突破！可返回营地挑战。',0,-329,22,650,60,C.green);}
 makeAudio(){this.sound=this.node.addComponent(AudioSource);const m=new Node('Music');this.node.addChild(m);this.music=m.addComponent(AudioSource);this.music.loop=true;for(const name of ['shoot','shootShotgun','shootSniper','hit','power','hurt','win','lose','tap','music'])resources.load(`audio/${name}`,AudioClip,(err,clip)=>{if(err||!clip)return;this.clips.set(name,clip);if(name==='music'){this.music.clip=clip;this.applySound();}});}
 play(name:string){const clip=this.clips.get(name);if(clip&&!this.progress.muted)this.sound.playOneShot(clip,name==='shoot'?.18:.65);}
 applySound(){this.music.volume=this.progress.muted?0:.19;this.sound.volume=this.progress.muted?0:1;}
 loadSave(){
  this.storageOK=true;this.saveBlocked=false;this.storageNotice='';
  try{
   const raw=sys.localStorage.getItem(SAVE_KEY),backup=sys.localStorage.getItem(SAVE_KEY+'.backup');
   const parse=(text:string|null):unknown=>{try{return text?JSON.parse(text):null;}catch{return null;}};
   const primaryData=parse(raw),backupData=parse(backup);
   const newer=(data:unknown)=>!!data&&typeof data==='object'&&typeof (data as any).schemaVersion==='number'&&(data as any).schemaVersion>1;
   if(newer(primaryData)||newer(backupData)){this.saveBlocked=true;this.storageNotice='存档来自更新版本，原数据已保留；当前进度暂存';}
   const primary=validateProgress(primaryData),fallback=validateProgress(backupData);
   if(primary)this.progress=primary;
   else if(fallback){this.progress=fallback;if(!this.saveBlocked){sys.localStorage.setItem(SAVE_KEY,JSON.stringify(fallback));this.storageNotice='已从备份恢复进度';}}
   else if(raw||backup){this.storageOK=false;this.saveBlocked=true;if(!this.storageNotice)this.storageNotice='存档损坏，原数据已保留；当前进度暂存';}
  }catch{this.storageOK=false;this.storageNotice='存档暂不可用，本次进度仅在当前游戏保留';}
  this.clearStatus();
 }
 save(){
  if(this.saveBlocked){this.clearStatus();return;}
  try{
   const prev=sys.localStorage.getItem(SAVE_KEY);let valid=false;try{valid=!!prev&&!!validateProgress(JSON.parse(prev));}catch{}
   if(valid){try{sys.localStorage.setItem(SAVE_KEY+'.backup',prev!);}catch{/* A full backup slot must not prevent replacing the primary save. */}}
   sys.localStorage.setItem(SAVE_KEY,JSON.stringify(this.progress));this.storageOK=true;this.storageNotice='';
  }catch{this.storageOK=false;this.storageNotice='存档暂不可用，本次进度仅在当前游戏保留';}
  this.clearStatus();
 }
 clearStatus(){if(this.statusText)this.statusText.string=this.storageNotice;}
 touchStart(e:EventTouch){if(this.phase!=='running'||this.dragPointer!==null)return;this.dragPointer=e.getID()??0;this.drag=true;this.lastPointer=e.getUILocation().x;}
 touchMove(e:EventTouch){if(!this.drag||this.phase!=='running'||this.dragPointer!==(e.getID()??0))return;const x=e.getUILocation().x;this.targetX=clamp(this.targetX+(x-this.lastPointer)*TUNING.dragGain,-TUNING.maxX,TUNING.maxX);this.lastPointer=x;}
 mouseDown(e:EventMouse){if(this.phase!=='running'||e.getButton()!==0||this.dragPointer!==null)return;this.dragPointer='mouse';this.drag=true;this.lastPointer=e.getUILocation().x;}
 mouseMove(e:EventMouse){if(!this.drag||this.phase!=='running'||this.dragPointer!=='mouse')return;const x=e.getUILocation().x;this.targetX=clamp(this.targetX+(x-this.lastPointer)*TUNING.dragGain,-TUNING.maxX,TUNING.maxX);this.lastPointer=x;}
 release(e?:EventTouch|EventMouse){const id=e&&'getID' in e?(e.getID()??0):'mouse';if(e&&this.dragPointer!==id)return;this.drag=false;this.dragPointer=null;}
 keyDown(e:EventKeyboard){if(this.keys.has(e.keyCode))return;this.keys.add(e.keyCode);if(e.keyCode===KeyCode.ESCAPE&&this.phase==='menu'&&this.menuScreen!=='camp'){this.showMenu();return;}if(this.phase==='running'&&e.keyCode>=KeyCode.DIGIT_1&&e.keyCode<=KeyCode.DIGIT_3)this.equipWeapon(WEAPON_IDS[e.keyCode-KeyCode.DIGIT_1]);if(e.keyCode===KeyCode.SPACE)this.togglePause();if(e.keyCode===KeyCode.KEY_R&&this.phase!=='menu')this.begin();if(e.keyCode===KeyCode.ENTER&&this.phase==='menu'&&this.menuScreen==='camp')this.begin();}
 keyUp(e:EventKeyboard){this.keys.delete(e.keyCode);}
 onHide(){this.release();this.keys.clear();if(this.phase==='running')this.togglePause();}
 syncSquad(){const cols=Math.min(6,Math.ceil(Math.sqrt(this.squad*1.1)));for(let i=0;i<this.soldiers.length;i++){const s=this.soldiers[i],wasActive=s.node.active;s.node.active=i<this.squad;if(i<this.squad){if(!wasActive)s.bornAt=this.clock;const row=Math.floor(i/cols),count=Math.min(cols,this.squad-row*cols);s.node.setPosition((i%cols-(count-1)/2)*.73,0,row*.65);}}}
 toast(text:string,color=C.green){this.banner.string=text;this.banner.color=new Color().fromHEX(color);this.bannerTime=2.15;this.bannerNode.active=true;this.redrawPlates(this.bannerNode);}
 spawn(spec:EncounterSpec){
  const node=new Node(spec.kind);this.world.addChild(node);const z=5.6+this.distance-spec.at,a:Actor={spec,node,x:spec.x,z,prevZ:z,hp:spec.value,maxHp:spec.value,value:spec.value,hits:0,label:null!,tag:null!,bar:null!,troops:[],cooldown:2,dead:false,pulse:0,dirty:false,positive:spec.value>=0,warning:null,aimX:0,volley:0,enraged:false};node.setPosition(a.x,.12,a.z);
  if(spec.kind==='gate'){for(const x of [-2.02,2.02]){this.art.box(node,spec.value>=0?'#188C2F':'#AE292D',x,1.5,0,.16,3,.22).name='Gate post';this.art.box(node,'#FFFFFF',x,3,0,.21,.12,.28);}this.art.shape(node,'Gate board','box',spec.value>=0?'#48E525BB':'#FF453DBB',0,1.7,0,1.36,1.7,.08,true);this.art.box(node,spec.value>=0?'#8DFF45':'#FF7972',0,2.94,0,4.15,.12,.18).name='Gate rail';this.art.shape(node,'Gate field','box',spec.value>=0?'#5AFF3530':'#FF3D3930',0,.68,0,4,1.15,.06,true);this.art.box(node,spec.value>=0?'#7CEB44':'#FF6557',0,.04,0,4.15,.04,.55).name='Gate threshold';}
  if(spec.kind==='barrel')this.art.barrel(node);
  if(spec.kind==='enemy'){for(let i=0;i<6;i++){const s=this.art.soldier(node,true);s.node.setPosition((i%3-1)*.70,0,Math.floor(i/3)*.78);s.node.setRotationFromEuler(0,180,0);a.troops.push(s);}}
  if(spec.kind==='tank')this.art.tank(node);
  if(spec.kind==='enemy'||spec.kind==='tank'){a.warning=new Node('Incoming fire');this.world.addChild(a.warning);for(let i=0;i<3;i++)this.art.oval(a.warning,'Aim zone','#FF3F4699',0,0,0,2.7,.025,1.3);a.warning.active=false;}
  const tag=this.uiNode(this.hud,'Target label',0,0,220,105);a.tag=tag;a.label=this.label(tag,'',0,6,spec.kind==='gate'?66:42,216,90,C.white);this.outline(a.label,spec.kind==='gate'?4:3);a.bar=this.uiNode(tag,'Health',0,-31,110,8).addComponent(Graphics);this.actors.push(a);this.updateTag(a);
 }
 updateTag(a:Actor){if(a.dead)return;a.dirty=false;const kind=a.spec.kind;if(kind==='gate'){const positive=a.value>=0;if(positive!==a.positive){a.positive=positive;for(const n of a.node.children){let color='';if(n.name==='Gate board')color=positive?'#48E525BB':'#FF453DBB';if(n.name==='Gate field')color=positive?'#5AFF3530':'#FF3D3930';if(n.name==='Gate threshold')color=positive?'#7CEB44':'#FF6557';if(n.name==='Gate post')color=positive?'#188C2F':'#AE292D';if(n.name==='Gate rail')color=positive?'#8DFF45':'#FF7972';if(color)n.getComponent(MeshRenderer)?.setSharedMaterial(this.art.color(color,n.name==='Gate board'||n.name==='Gate field'),0);}}}a.label.string=kind==='gate'?`${a.value>=0?'+':''}${a.value}`:`${Math.ceil(a.hp)}`;if(kind!=='gate'){a.bar.clear();a.bar.fillColor=new Color().fromHEX('#203E61');a.bar.roundRect(-57,-4,114,9,4);a.bar.fill();a.bar.fillColor=new Color().fromHEX(kind==='barrel'?C.gold:C.red);a.bar.roundRect(-55,-2,Math.max(1,110*a.hp/a.maxHp),5,2);a.bar.fill();}}
 removeActor(a:Actor){if(a.dead)return;a.dead=true;a.node.destroy();a.tag.destroy();a.warning?.destroy();}
 clearActors(){for(const a of this.actors)this.removeActor(a);this.actors=[];}
 shoot(enemy=false,x=0,z=0,vx=0,vz=0,damage=1,tankBonus=1,weaponId:WeaponId='rifle'){const size=enemy?TUNING.enemyProjectiles:TUNING.playerProjectiles,base=enemy?TUNING.playerProjectiles:0,cursor=enemy?this.enemyShotCursor:this.playerShotCursor;let s:Shot|null=null;for(let i=0;i<size;i++){const index=(cursor+i)%size,candidate=this.shots[base+index];if(!candidate.active){s=candidate;if(enemy)this.enemyShotCursor=(index+1)%size;else this.playerShotCursor=(index+1)%size;break;}}if(!s)return false;s.active=true;s.x=x;s.z=z;s.vx=vx;s.vz=vz;s.damage=damage;s.tankBonus=tankBonus;const squash=!enemy&&weaponId==='shotgun'?.45:1;s.node.setScale(1,1,squash);s.node.getComponent(MeshRenderer)!.mesh=this.art.meshes[enemy?'red-bullet':weaponId==='rifle'?'gold-bullet':weaponId+'-bullet'];const tail=TUNING.bulletHalfLength*squash/Math.max(1e-9,Math.hypot(vx,vz));s.tailX=vx*tail;s.tailZ=vz*tail;s.node.active=true;s.node.setPosition(x-s.tailX,1.02,z-s.tailZ);s.node.setRotationFromEuler(0,Math.atan2(-vx,-vz)*180/Math.PI,0);return true;}
 flash(x:number,z:number,impact=false){const f=this.flashes.find(f=>f.life<=0&&f.impact===impact);if(!f)return;f.life=f.duration=impact?.16:.075;f.node.active=true;f.node.setPosition(x,1.02,z);f.node.setScale(impact?.45:1,1,impact?.45:1);f.node.setRotationFromEuler(0,this.shotCount*37%180,0);}
 coinBurst(x:number,z:number,amount:number){let emitted=0;for(const c of this.coins){if(c.life>0)continue;const a=emitted*2.4;c.life=c.duration=1.15+(emitted%3)*.08;c.vx=Math.cos(a)*3.2;c.vy=3.1+(emitted%3)*.3;c.vz=Math.sin(a)*2.4;c.angle=emitted*47;c.spin=240+emitted*17;c.node.setPosition(x+Math.cos(a)*.3,.75+(emitted%2)*.08,z+Math.sin(a)*.3);c.node.setScale(.75,.75,.75);c.node.setRotationFromEuler(58,0,8);c.face.setRotationFromEuler(0,c.angle,0);c.node.active=true;if(++emitted>=Math.min(amount,12))break;}}
 burst(x:number,z:number,n=12){let count=0;for(const s of this.sparks){if(s.life>0)continue;s.life=.5+Math.random()*.3;s.node.active=true;s.node.setPosition(x,.65,z);s.vx=(Math.random()-.5)*5;s.vy=2+Math.random()*4;s.vz=(Math.random()-.5)*5;if(++count>=n)break;}}
 hitActor(a:Actor,damage:number){
  if(this.phase!=='running'||a.dead||!Number.isFinite(damage)||damage<=0)return;
  if(a.spec.kind==='gate'){
   a.hits++;a.value++;a.pulse=.12;a.dirty=true;
   return;
  }
  a.hp=Math.max(0,a.hp-damage);a.pulse=.10;a.dirty=true;
  if(a.hp>0)return;
  this.burst(a.x,a.z,a.spec.kind==='tank'?35:14);
  if(a.spec.kind==='barrel'){
   const gain=Math.min(a.spec.reward||6,TUNING.maxSquad-this.squad);this.squad+=gain;this.damageBonus+=.04;this.barrelsTaken++;this.earned+=8;this.syncSquad();
   this.coinBurst(a.x,a.z,8);this.toast(gain>0?`补给 +${gain} 士兵 · +8 金币`:'编队已满员 · 火力提升 · +8 金币',C.gold);this.play('power');
  }else{this.kills++;const coins=a.spec.kind==='tank'?35:6;this.earned+=coins;this.coinBurst(a.x,a.z,coins);this.toast(a.spec.kind==='tank'?'坦克摧毁 · +35 金币':'敌军击破 · +6 金币',C.gold);this.play('hit');}
  this.removeActor(a);
 }
 hurt(count:number){if(this.phase!=='running'||!Number.isFinite(count)||count<=0)return;const lost=Math.min(this.squad,Math.ceil(count));if(lost===0)return;this.squad-=lost;this.damageTaken+=lost;this.syncSquad();this.refreshHUD();this.burst(this.x,6,8);this.play('hurt');this.toast(`失去 ${lost} 名士兵`,C.red);if(this.squad===0)this.finish(false);}
 enemyAttack(a:Actor,dt:number){
  if(this.phase!=='running'||a.dead)return;
  const r=this.rules,tank=a.spec.kind==='tank';
  if(!tank&&a.spec.kind!=='enemy')return;
  if(a.z<(tank?-31:-26))return;
  if(tank&&!a.enraged&&a.hp<a.maxHp*.5){a.enraged=true;this.toast('坦克进入狂攻 · 留意红色落点',C.red);}
  const interval=(tank?r.bossInterval:r.enemyInterval)*(a.enraged?.8:1);
  const before=a.cooldown;a.cooldown-=dt;
  if(before>.65&&a.cooldown<=.65){
   // Lock the aim during the tell, leaving a real reaction window. Later tank
   // volleys alternate aimed spread and left/right lane suppression.
   a.aimX=tank&&r.chapter>=2&&a.volley%3===2?(a.volley%2?-2.35:2.35):this.x;
   if(a.warning){const count=tank?r.spread:(r.chapter>=2&&a.volley%2===1?2:1);a.warning.setPosition(a.aimX,.10,5.6);for(let i=0;i<3;i++){const n=a.warning.children[i];n.active=i<count;n.setPosition((i-(count-1)/2)*(tank?2.4:1.8),0,0);}a.warning.active=true;}
  }
  if(a.warning?.active){const s=1+.08*Math.sin(this.clock*22);a.warning.setScale(s,1,s);}
  if(a.cooldown>0)return;
  a.warning&&(a.warning.active=false);a.cooldown=interval;
  const count=tank?r.spread:(r.chapter>=2&&a.volley%2===1?2:1),vz=r.projectileSpeed;
  for(let i=0;i<count;i++){
   const offset=(i-(count-1)/2)*(tank?2.4:1.8),aim=a.aimX+offset;
   const vx=(aim-a.x)/Math.max(.45,(5.6-a.z-1)/vz);
   this.shoot(true,a.x,a.z+1,vx,vz,tank?r.bossDamage:r.enemyDamage);
   this.flash(a.x,a.z+1);
  }
  a.volley++;
 }
 update(realDt:number){
  if(!this.art||!this.hud)return;this.frames.push(realDt);if(this.frames.length>180)this.frames.shift();if(this.phase==='paused')return;let dt=Math.min(realDt,.05)*this.timeScale;dt=Math.min(dt,.12);this.clock+=dt;
  this.recoil=Math.max(0,this.recoil-dt*14);for(const f of this.flashes){if(f.life<=0)continue;f.life-=dt;if(f.life<=0){f.node.active=false;continue;}const p=1-f.life/f.duration,size=f.impact?.45+p*1.4:1-p*.65;f.node.setScale(size,1,size);}
  if(this.phase==='running')this.tick(dt);else if(this.phase==='menu')for(let i=0;i<this.squad;i++)this.art.animate(this.soldiers[i],this.clock,false);
  for(const s of this.sparks){if(s.life<=0)continue;s.life-=dt;s.vy-=dt*10;const p=s.node.position;s.node.setPosition(p.x+s.vx*dt,p.y+s.vy*dt,p.z+s.vz*dt);s.node.setRotationFromEuler(this.clock*300,this.clock*180,0);const size=.09*Math.max(0,Math.min(1,s.life/.18));s.node.setScale(size,size,size);if(s.life<=0)s.node.active=false;}
  for(const c of this.coins){if(c.life<=0)continue;c.life-=dt;if(c.life<=0){c.node.active=false;continue;}const age=c.duration-c.life,p=c.node.position;if(age<.38){c.vy-=dt*7;c.node.setPosition(p.x+c.vx*dt,p.y+c.vy*dt,p.z+c.vz*dt);}else{const pull=1-Math.exp(-dt*9);c.node.setPosition(p.x+(this.x-p.x)*pull,p.y+(1.05-p.y)*pull,p.z+(6.1-p.z)*pull);}c.angle+=c.spin*dt;c.node.setRotationFromEuler(58+Math.sin(c.angle*.02)*8,0,8);c.face.setRotationFromEuler(0,c.angle,0);const size=Math.min(1,c.life/.16)*(.82+Math.min(.18,age*.8));c.node.setScale(size,size,size);}
  if(this.bannerTime>0){this.bannerTime-=dt;if(this.bannerTime<=0)this.bannerNode.active=false;}
  this.updateTags();
 }
 tick(dt:number){
  if(this.phase!=='running')return;
  const prevPlayerX=this.x,move=(this.keys.has(KeyCode.ARROW_RIGHT)||this.keys.has(KeyCode.KEY_D)?1:0)-(this.keys.has(KeyCode.ARROW_LEFT)||this.keys.has(KeyCode.KEY_A)?1:0);const limit=this.movementLimit;if(move)this.targetX+=move*6*dt;this.targetX=clamp(this.targetX,-limit,limit);this.x=clamp(this.x+(this.targetX-this.x)*(1-Math.exp(-TUNING.response*dt)),-limit,limit);this.squadRoot.setPosition(this.x,.11,5.6);
  const boss=this.actors.find(a=>!a.dead&&a.spec.kind==='tank'&&a.z>-13);const advance=boss?0:this.rules.speed*dt;this.distance+=advance;
  for(const m of this.roadMarkers){const z=m.position.z+advance;m.setPosition(0,0,z>17?z-115.2:z);}for(const w of this.waves){const z=w.position.z+advance*.65;w.setPosition(w.position.x,-.88,z>22?z-110:z);}
  while(this.spawned<this.specs.length&&this.specs[this.spawned].at<this.distance+59)this.spawn(this.specs[this.spawned++]);
  for(let i=0;i<this.squad;i++)this.art.animate(this.soldiers[i],this.clock,!boss,this.recoil);
  this.fire-=dt;if(this.fire<=0){const w=this.weapon,id=this.progress.weapon||'rifle';this.fire+=w.interval;const damage=(1+this.progress.damage*.15+this.damageBonus)*w.damage;for(let i=0;i<this.squad;i++){const p=this.soldiers[i].node.position,sx=this.x+p.x+.24,sz=5.6+p.z-(id==='sniper'?1.27:id==='shotgun'?.95:1.02);let emitted=false;for(let k=0;k<w.pellets;k++){const vx=id==='rifle'?Math.sin(i*2.399+Math.floor(this.clock/w.interval)*1.7)*w.spread:(k-(w.pellets-1)/2)*w.spread;if(this.shoot(false,sx,sz,vx,-w.speed,damage,w.tankBonus,id)){this.shotCount++;emitted=true;}}if(emitted)this.flash(sx,sz);}this.recoil=id==='sniper'?1.55:id==='shotgun'?1.3:1;this.play(w.sound);}
  for(const a of this.actors){if(a.dead)continue;a.prevZ=a.z;a.pulse=Math.max(0,a.pulse-dt);if(a.spec.kind==='tank'&&a.z> -22&&a.hits===0){a.hits=1;this.toast('坦克来袭 · 引开瞄准，换边躲避',C.red);}a.z+=advance;if(a.spec.kind==='enemy')a.z+=dt*.85;a.node.setPosition(a.x,.12,a.z);a.node.setScale(1+(a.node.scale.x-1)*Math.exp(-dt*16),1,1);for(const s of a.troops)this.art.animate(s,this.clock);this.enemyAttack(a,dt);

  }
  if(this.phase!=='running')return;
  for(const s of this.shots){if(!s.active)continue;const px=s.x,pz=s.z;s.x+=s.vx*dt;s.z+=s.vz*dt;if(s.enemy){const contact=segmentBoxHit(px-prevPlayerX,pz-5.6,s.x-this.x,s.z-5.6,1.1+this.squad*.015,.4);if(contact!==null){s.active=false;this.hurt(s.damage);if(this.phase!=='running')return;}}else {let nearest:Actor|null=null,first=Infinity;for(const a of this.actors){if(a.dead)continue;const kind=a.spec.kind,w=kind==='gate'?TUNING.gateHalfWidth:kind==='tank'?1.65:kind==='barrel'?.75:1.05,d=kind==='gate'?.12:kind==='tank'?1.75:kind==='barrel'?.75:1.2,contact=segmentBoxHit(px-a.x,pz-a.prevZ,s.x-a.x,s.z-a.z,w,d);if(contact!==null&&contact<first){nearest=a;first=contact;}}if(nearest){this.hitActor(nearest,s.damage*(nearest.spec.kind==="tank"?s.tankBonus:1));this.flash(px+(s.x-px)*first,pz+(s.z-pz)*first,true);s.active=false;}}if(s.z<TUNING.bulletCullZ||s.z>18||Math.abs(s.x)>12)s.active=false;if(s.active)s.node.setPosition(s.x-s.tailX,1.02,s.z-s.tailZ);else s.node.active=false;}
  // Resolve real swept hits before gates/body contacts in this same frame.
  for(const a of this.actors){if(a.dead)continue;if(a.z>=5.4){if(a.spec.kind==='gate'){if(Math.abs(this.x-a.x)<2.3){this.gatesTaken++;if(a.value>=0){const gain=Math.min(a.value,TUNING.maxSquad-this.squad);this.squad+=gain;this.syncSquad();this.toast(gain>0?`军队集结  +${gain}`:'编队已满员');this.play('power');}else this.hurt(-a.value);}this.removeActor(a);}else if(a.spec.kind==='barrel'){this.removeActor(a);}else {if(Math.abs(this.x-a.x)<2.2)this.hurt(Math.min(16,Math.ceil(a.hp*.24)));this.removeActor(a);}}if(this.phase!=="running")return;}
  for(let i=this.actors.length-1;i>=0;i--)if(this.actors[i].dead)this.actors.splice(i,1);if(this.phase==='running'&&this.spawned===this.specs.length&&!this.actors.some(a=>a.spec.kind==='tank')&&this.distance>this.rules.finishDistance)this.finish(true);
  this.hudTick+=dt;if(this.hudTick>.1){this.hudTick=0;this.refreshHUD();}
 }
 get movementLimit(){const cols=Math.min(6,Math.ceil(Math.sqrt(this.squad*1.1)));return Math.min(TUNING.maxX,4.42-(cols-1)*.365);}
 projectWorld(point:Vec3,out:Vec3){if(this.sceneTexture){this.camera.worldToScreen(point,out);out.x=out.x/this.sceneTexture.width*720-360;out.y=out.y/this.sceneTexture.height*1280-640;}else{this.camera.convertToUINode(point,this.hud,out);out.x-=360;out.y-=640;}out.z=0;return out;}
 updateTags(){for(const a of this.actors){if(a.dead)continue;if(a.dirty)this.updateTag(a);if(a.z>=12||a.z<=-46){a.tag.active=false;continue;}const gate=a.spec.kind==='gate',height=gate?2.05:a.spec.kind==='tank'?3.1:2.45;this.tempWorld.set(a.x,height,a.z);this.projectWorld(this.tempWorld,this.temp);a.tag.setPosition(this.temp);const wasVisible=a.tag.active;a.tag.active=this.temp.y<478;if(!a.tag.active)continue;if(!wasVisible){this.redrawPlates(a.tag);this.updateTag(a);}this.tempWorld.x+=2;this.projectWorld(this.tempWorld,this.tempEdge);const projectedHalfWidth=Math.abs(this.tempEdge.x-this.temp.x),scale=(gate?projectedHalfWidth/110*.55:clamp(projectedHalfWidth/110,.55,1.1))*(1+a.pulse*.45);a.tag.setScale(scale,scale);}}
 refreshHUD(){this.hudLevel.string=`第 ${this.level} 关`;this.hudSquad.string=`${this.squad} 人`;const g=this.hudProgress;g.clear();g.fillColor=new Color(18,66,123,190);g.roundRect(-180,-5,360,10,5);g.fill();g.fillColor=new Color().fromHEX(C.gold);g.roundRect(-180,-5,Math.max(10,360*(this.phase==='won'?1:Math.min(1,this.distance/this.rules.finishDistance))),10,5);g.fill();this.tip.node.active=this.distance<12;this.tip.string=this.distance<16?'◀  左右拖动，瞄准数字牌  ▶':this.actors.some(a=>a.spec.kind==='tank'&&!a.dead)?'引开红色瞄准 · 换边躲避炮弹':'击破补给桶 · 向绿色门移动';}
 snapshot(){return {weapon:this.progress.weapon||'rifle',phase:this.phase,level:this.level,squad:this.squad,x:this.x,targetX:this.targetX,distance:this.distance,coins:this.progress.coins,unlocked:this.progress.unlocked,damage:this.progress.damage,recruits:this.progress.recruits,kills:this.kills,gates:this.gatesTaken,barrels:this.barrelsTaken,shots:this.shotCount,damageTaken:this.damageTaken,storageOK:this.storageOK,actors:this.actors.filter(a=>!a.dead).map(a=>({kind:a.spec.kind,x:a.x,z:a.z,hp:a.hp,value:a.value})),meanFrameMs:this.frames.reduce((a,b)=>a+b,0)/Math.max(1,this.frames.length)*1000};}
 onDestroy(){this.fileInput?.remove();this.fileInput=null;input.off(Input.EventType.KEY_DOWN,this.keyDown,this);input.off(Input.EventType.KEY_UP,this.keyUp,this);input.off(Input.EventType.TOUCH_START,this.touchStart,this);input.off(Input.EventType.TOUCH_MOVE,this.touchMove,this);input.off(Input.EventType.TOUCH_END,this.release,this);input.off(Input.EventType.TOUCH_CANCEL,this.release,this);input.off(Input.EventType.MOUSE_DOWN,this.mouseDown,this);input.off(Input.EventType.MOUSE_MOVE,this.mouseMove,this);input.off(Input.EventType.MOUSE_UP,this.release,this);game.off(Game.EVENT_HIDE,this.onHide,this);delete (globalThis as any).__bridgehead;if(this.camera)this.camera.targetTexture=null;this.sceneFrame?.destroy();this.sceneTexture?.destroy();this.art?.dispose();}
}
