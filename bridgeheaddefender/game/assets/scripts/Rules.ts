export type EncounterKind = 'gate' | 'barrel' | 'enemy' | 'tank';
export interface EncounterSpec { at:number; x:number; kind:EncounterKind; value:number; reward?:number; }
export type WeaponId='rifle'|'shotgun'|'sniper';
export interface Progress { schemaVersion:1; coins:number; damage:number; recruits:number; unlocked:number; selected:number; muted:boolean; weapon?:WeaponId; }
export const WEAPONS={
 rifle:{name:'步枪',unlock:1,interval:.38,damage:1,pellets:1,speed:34,spread:1.4,tankBonus:1,sound:'shoot',description:'稳定连射 · 适合射击数字牌\n每人每次 1 发，间隔 0.38 秒'},
 shotgun:{name:'霰弹枪',unlock:3,interval:.9,damage:.95,pellets:3,speed:36,spread:4.8,tankBonus:1,sound:'shootShotgun',description:'近距离三发散射 · 适合步兵群\n远处弹丸会分散，间隔 0.9 秒'},
 sniper:{name:'重型狙击枪',unlock:7,interval:1.05,damage:4.2,pellets:1,speed:50,spread:0,tankBonus:1.45,sound:'shootSniper',description:'慢速重弹 · 对坦克额外伤害\n过门前可切步枪，间隔 1.05 秒'}
};
export const WEAPON_IDS:WeaponId[]=['rifle','shotgun','sniper'];
export const CHAPTERS = ['登陆战线','交叉火网','重装推进','纵深突围','决战桥头'];
export const LEVELS = ['破晓登陆','钢铁走廊','最后防线','两翼夹击','补给争夺','桥头守卫',
 '火线集结','交叉封锁','逆风推进','红色走廊','装甲前哨','重炮阵地',
 '孤军深入','侧翼突袭','弹雨穿行','钢铁洪流','兵临桥下','装甲壁垒',
 '纵深防线','双线压制','绝地补给','重围突破','火力风暴','铁壁要塞',
 '决战前夜','烽火长桥','精锐阻击','最后集结','终极封锁','桥头决战'];
export const UPGRADE_LIMITS = {damage:40,recruits:20};
export const startingSquad=(recruits:number)=>Math.min(TUNING.maxSquad,TUNING.startSquad+recruits);
export const TUNING = { speed:3.7, maxSquad:48, startSquad:8, fireInterval:.38, bulletSpeed:34, dragGain:0.017, response:24, maxX:3.5, length:154,bulletHalfLength:.22,gateHalfWidth:.68,bulletCullZ:-60,playerProjectiles:512,enemyProjectiles:64 };
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
// Time of first contact of a swept point against a box in relative coordinates.
// This handles fast diagonal shots and moving targets without endpoint tunneling.
export function segmentBoxHit(x0:number,z0:number,x1:number,z1:number,w:number,d:number):number|null {
 let lo=0,hi=1;const dx=x1-x0,dz=z1-z0;
 if(Math.abs(dx)<1e-9){if(x0< -w||x0>w)return null;}else{let a=(-w-x0)/dx,b=(w-x0)/dx;if(a>b){const t=a;a=b;b=t;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}
 if(Math.abs(dz)<1e-9){if(z0< -d||z0>d)return null;}else{let a=(-d-z0)/dz,b=(d-z0)/dz;if(a>b){const t=a;a=b;b=t;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}
 return lo;
}
export const freshProgress=():Progress=>({schemaVersion:1,coins:0,damage:0,recruits:0,unlocked:1,selected:1,muted:false});
export function validateProgress(data:unknown):Progress|null {
 if(!data||typeof data!=='object')return null;
 const p=data as Record<string,unknown>;if(p.schemaVersion!==1)return null;
 const keys=['coins','damage','recruits','unlocked','selected'];
 if(keys.some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k])))return null;
 const unlocked=clamp(Math.floor(p.unlocked as number),1,LEVELS.length);
 const result:Progress={schemaVersion:1,coins:clamp(Math.floor(p.coins as number),0,999999),damage:clamp(Math.floor(p.damage as number),0,UPGRADE_LIMITS.damage),recruits:clamp(Math.floor(p.recruits as number),0,UPGRADE_LIMITS.recruits),unlocked,selected:clamp(Math.floor(p.selected as number),1,unlocked),muted:p.muted===true};
 if(p.weapon!==undefined)result.weapon=WEAPON_IDS.includes(p.weapon as WeaponId)&&WEAPONS[p.weapon as WeaponId].unlock<=unlocked?p.weapon as WeaponId:'rifle';
 return result;
}
// First six prices stay compatible with the shipped economy; later prices grow
// gradually, so a new cap does not turn into thirty near-free purchases.
export const upgradeCost=(level:number)=>50+level*35+Math.max(0,level-5)**2;
export function levelRules(level:number){
 level=clamp(Math.floor(level),1,LEVELS.length);const chapter=Math.floor((level-1)/6),step=(level-1)%6,bossAt=145+chapter*18+step*2;
 return {chapter,step,bossAt,finishDistance:bossAt-19,speed:3.8+(level-1)*.035,
  enemyHP:Math.round(38+level*6+level*level*.22),barrelHP:Math.round(18+level*3.5),
  bossHP:Math.round((1200+level*130+level*level*4)*.75),enemyInterval:2.4-chapter*.25,
  bossInterval:1.8-chapter*.17,projectileSpeed:11+chapter*1.4,
  enemyDamage:1+chapter,bossDamage:4+chapter,spread:chapter===0?(step>=3?2:1):3};
}
export const battleReward=(level:number,won:boolean,earned:number,kills:number,distance:number)=>
 (won?100+level*45:Math.min(65,Math.floor(distance*.5)))+earned+kills*3;
export function encounters(level:number):EncounterSpec[]{
 level=clamp(Math.floor(level),1,LEVELS.length);const r=levelRules(level),{chapter,step}=r;
 const list:EncounterSpec[]=[];
 const gates=(at:number,left:number,right:number)=>{list.push({at,x:-2.35,kind:'gate',value:left},{at,x:2.35,kind:'gate',value:right});};
 const side=level%2===0?-1:1,enemy=(at:number,x:number,mult=1)=>list.push({at,x,kind:'enemy',value:Math.round(r.enemyHP*mult)});
 const pair=(at:number,safe:number,risky:number,flip:boolean)=>gates(at,flip?risky:safe,flip?safe:risky);
 // The first chapter teaches aiming; later chapters ask players to charge a
 // negative gate before crossing. Every accepted projectile still adds one.
 pair(22,-([63,55,65,63,65,67][step]+[0,22,32,40,42][chapter]),-(160+chapter*60),side<0);
 list.push({at:38,x:-2.15*side,kind:'barrel',value:r.barrelHP,reward:2});enemy(43,2.35*side);
 // Regular stages have one recruitment opportunity. Chapter finales offer a
 // second, late reinforcement choice rather than an immediate growth loop.
 if(step===5)pair(101,-(90+chapter*6),-(330+level*15),side>0);
 enemy(77+step,step%3===0?0:-2.35*side,1.2);
 list.push({at:87+step,x:2.35*side,kind:'barrel',value:Math.round(r.barrelHP*1.25),reward:3});
 enemy(117+step,-2.45,1.35);enemy(121+step,2.45,1.35);
 if(level>=3)enemy(50+step,-2.35*side,.85);
 if(level>=5)enemy(94+step,-2.35*side,1.1);
 // Additional authored chapter beats combine flanking formations and optional
 // supplies; actors keep bounded spacing rather than thirty copies of level 1.
 for(let c=1;c<=chapter;c++){
  const at=128+(c-1)*18+step*2;
  enemy(at,c%2?2.35*side:-2.35*side,1.2+c*.12);
  enemy(at+6,c%2?-2.35*side:2.35*side,1.1+c*.1);
  if(c%2===0)list.push({at:at+10,x:0,kind:'barrel',value:r.barrelHP,reward:2});
 }
 if(chapter>=2)list.push({at:r.bossAt-12,x:0,kind:'barrel',value:Math.round(r.barrelHP*1.1),reward:4});
 list.push({at:r.bossAt,x:0,kind:'tank',value:r.bossHP});return list.sort((a,b)=>a.at-b.at);
}
