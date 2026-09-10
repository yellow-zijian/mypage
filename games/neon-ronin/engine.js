/* 雨刃 / campaign simulation. Fixed timestep, deterministic combat, no network. */
(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./content.js'):root.RoninContent;
const {STAGES,ENEMIES,DIFFICULTIES,UPGRADES}=C;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const safeInt=(v,max=1e8)=>Number.isFinite(v)?Math.floor(clamp(v,0,max)):0;
function cleanProfile(raw={}){
 const r=raw&&typeof raw==='object'?raw:{};
 return {unlocked:safeInt(r.unlocked,2),shards:safeInt(r.shards,100),difficulty:DIFFICULTIES[r.difficulty]?r.difficulty:'standard',
 upgrades:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,safeInt(r.upgrades?.[k],3)])),
 claimed:Array.isArray(r.claimed)?r.claimed.filter(v=>typeof v==='string'&&/^\d+:\d+$/.test(v)).slice(0,50):[],
 cleared:Array.isArray(r.cleared)?[...new Set(r.cleared.filter(v=>[0,1,2].includes(v)))]:[],
 best:[0,1,2].map(i=>safeInt(r.best?.[i])),records:Array.isArray(r.records)?r.records.slice(0,3).map(v=>v&&typeof v==='object'?{score:safeInt(v.score),time:safeInt(v.time),damage:safeInt(v.damage),parries:safeInt(v.parries)}:null):[]};
}
class Game{
 constructor(emit=()=>{}){this.emit=emit;this.profile=cleanProfile();this.stageId=0;this.reset(0,0);this.mode='title';}
 get difficulty(){return DIFFICULTIES[this.profile.difficulty];}
 get maxHp(){return 100+this.profile.upgrades.vital*20;}
 get dashMax(){return .72-this.profile.upgrades.flow*.06;}
 event(type,data={}){this.emit(type,data);}
 newCampaign(difficulty='standard'){const old=this.profile;this.profile=cleanProfile({unlocked:old.unlocked,best:old.best,difficulty});this.reset(0,0);}
 loadSave(raw){if(!raw||raw.version!==2)return false;this.profile=cleanProfile(raw.profile);
 const s=raw.run;if(s&&Number.isInteger(s.stage)&&s.stage>=0&&s.stage<=this.profile.unlocked&&s.stage<3){this.reset(safeInt(s.checkpoint,2),s.stage,{score:safeInt(s.score),time:safeInt(s.time),damage:safeInt(s.damage),kills:safeInt(s.kills),parries:safeInt(s.parries)});return true;}return false;}
 exportSave(){return {version:2,profile:JSON.parse(JSON.stringify(this.profile)),run:this.savePoint?{...this.savePoint}:null};}
 startStage(id){if(!Number.isInteger(id)||id<0||id>this.profile.unlocked||id>2)return false;this.reset(0,id);return true;}
 retry(){const s=this.savePoint||{stage:this.stageId,checkpoint:0};this.reset(s.checkpoint,s.stage,s);}
 reset(checkpoint=0,stageId=this.stageId,stats={}){
  this.stageId=safeInt(stageId,2);const def=STAGES[this.stageId];this.level={...def,platforms:def.platforms.map(p=>({...p}))};
  this.checkpoint=safeInt(checkpoint,2);const start=this.checkpoint?def.checkpoints[this.checkpoint-1].x+25:120;
  this.player={x:start,y:388,w:28,h:64,vx:0,vy:0,dir:1,hp:this.maxHp,stamina:100,focus:0,grounded:false,jumps:0,coyote:0,jumpBuffer:0,dashBuffer:0,parryBuffer:0,heavyBuffer:0,ultimateBuffer:0,dash:0,dashCooldown:0,invuln:0,attack:0,attackBuffer:0,attackId:0,attackKind:'light',combo:0,comboWindow:0,parry:0,parryCooldown:0,counter:0,ultimate:0,stun:0,hitTargets:new Set()};
  this.enemies=def.enemies.filter(e=>e.x>start-90).map((e,i)=>{const d=ENEMIES[e.type],hp=Math.round(d.hp*this.difficulty.enemyHP);return {...d,...e,id:i,y:e.y??460-d.h,baseY:e.y??460-d.h,home:e.x,dir:-1,hp,maxHp:hp,state:'idle',timer:.8+(i%3)*.2,flash:0,stun:0,broken:0,posture:0,age:i,dead:false,shotCount:0,vx:0};});
  const bd=def.boss,bh=bd.type==='narukami'?94:bd.type==='reimei'?130:110;
  this.boss={...bd,y:460-bh,w:bd.type==='narukami'?108:80,h:bh,maxHp:Math.round(bd.hp*this.difficulty.enemyHP),hp:Math.round(bd.hp*this.difficulty.enemyHP),dir:-1,state:'sleep',timer:0,active:false,dead:false,move:-1,flash:0,stun:0,broken:0,posture:0,phase:1,vx:0,attackId:0};
  this.pickups=def.pickups.map((p,i)=>({...p,id:`${this.stageId}:${i}`,w:24,h:24,collected:p.type==='data'&&this.profile.claimed.includes(`${this.stageId}:${i}`)}));
  this.encounters=def.encounters.map(e=>({...e,active:false,done:start>e.right}));this.encounter=null;
  this.hazards=def.hazards.map(h=>({...h,active:false,warning:false}));this.attacks=[];this.projectiles=[];this.particles=[];this.ghosts=[];this.rings=[];
  this.score=safeInt(stats.score);this.time=safeInt(stats.time);this.damageTaken=safeInt(stats.damage);this.kills=safeInt(stats.kills);this.parries=safeInt(stats.parries);this.comboCount=0;this.comboTimer=0;
  this.hitstop=0;this.camera=clamp(start-230,0,def.width-960);this.shake=0;this.age=0;this.bossGate=false;this.endTimer=0;this.prev={};this.zone=-1;this.mode='playing';
  this.savePoint={stage:this.stageId,checkpoint:this.checkpoint,score:this.score,time:this.time,damage:this.damageTaken,kills:this.kills,parries:this.parries};
  this.event('start',{checkpoint:this.checkpoint,stage:this.stageId});this.event('hint',{text:this.checkpoint?'記録を復元。先へ進もう。':def.intro});
 }
 buyUpgrade(key){const u=UPGRADES[key];if(!u||!['stageclear','won','title'].includes(this.mode))return false;const level=this.profile.upgrades[key],cost=u.cost+level;if(level>=u.max||this.profile.shards<cost)return false;this.profile.shards-=cost;this.profile.upgrades[key]++;this.player.hp=this.maxHp;this.event('upgrade',{key});return true;}
 burst(x,y,color,count=14,power=180){for(let i=0;i<count;i++){const a=i*2.399+this.age*3,speed=power*(.35+(i%7)/9);this.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-45,life:.3+(i%5)*.075,max:.65,color,size:i%3+1});}if(this.particles.length>280)this.particles.splice(0,this.particles.length-280);}
 attack(kind='light'){
  const p=this.player;if(p.stun>0||p.dash>0||p.parry>0||p.ultimate>0)return false;
  if(kind==='heavy'&&p.stamina<32)return false;
  p.combo=kind==='heavy'?3:p.comboWindow>0?p.combo%3+1:1;p.comboWindow=.76;p.attackKind=kind;p.attack=kind==='heavy'?.58:p.combo===3?.36:.27;p.attackId++;p.hitTargets.clear();p.attackBuffer=0;p.heavyBuffer=0;
  if(kind==='heavy')p.stamina-=32;if(p.grounded)p.vx=p.dir*(kind==='heavy'?90:170);
  this.event('slash',{combo:p.combo,kind});return true;
 }
 parry(){const p=this.player;if(p.parryCooldown>0||p.stun>0||p.stamina<10||p.dash>0||p.ultimate>0)return false;p.parry=this.difficulty.parry;p.parryCooldown=.48;p.stamina-=10;p.attack=0;p.parryBuffer=0;this.event('parry-ready');return true;}
 successfulParry(source){const p=this.player;p.stamina=clamp(p.stamina+28,0,100);p.focus=clamp(p.focus+23,0,100);p.counter=.95;p.invuln=.16;this.parries++;this.score+=80;this.hitstop=.07;this.shake=3;this.rings.push({x:p.x+14,y:p.y+25,life:.3,max:.3,r:55,color:'#ffd996'});this.burst(p.x+14,p.y+24,'#ffe2a0',18,240);if(source){source.stun=source===this.boss?.9:1.2;source.broken=1.3;source.state='recover';source.timer=1.2;}this.event('parry-success');}
 damagePlayer(amount,sourceX,source=null,parryable=true){const p=this.player;if(this.mode!=='playing'||this.endTimer>0||p.dash>0||p.invuln>0||p.ultimate>0)return false;
  if(parryable&&p.parry>0&&(sourceX-p.x)*p.dir>=-24){this.successfulParry(source);return 'parried';}
  amount=Math.max(1,Math.round(amount*this.difficulty.damage));p.hp=Math.max(0,p.hp-amount);this.damageTaken+=amount;p.invuln=.9;p.stun=.18;p.attack=0;p.vx=(p.x<sourceX?-1:1)*220;p.vy=-165;this.shake=6;this.comboCount=0;
  this.burst(p.x+14,p.y+32,'#f76398',14);this.event('hurt',{hp:p.hp});if(p.hp<=0){this.mode='dead';this.event('death');}return true;
 }
 hitEnemy(e,base,dir,kind='light'){
  if(e.dead)return;const p=this.player;let damage=base*(1+this.profile.upgrades.blade*.12);
  if(p.counter>0&&kind!=='reflected'){damage*=1.5;p.counter=0;this.event('counter');}
  const front=(p.x-e.x)*e.dir>0;
  if(e.type==='shield'&&e.broken<=0&&front&&kind==='light'){damage*=.12;e.posture+=30;this.event('blocked');if(e.posture>=90){e.broken=1.8;e.stun=1;e.posture=0;this.event('guard-break');}}
  if(kind==='heavy'){e.broken=1.4;e.stun=e===this.boss?.15:.75;e.posture=0;}
  e.hp=Math.max(0,e.hp-Math.round(damage));e.flash=.12;e.stun=Math.max(e.stun,.1);this.comboCount++;this.comboTimer=2.5;p.focus=clamp(p.focus+(kind==='ultimate'?0:5),0,100);this.hitstop=Math.max(this.hitstop,.04);this.shake=kind==='heavy'?6:3;
  this.burst(e.x+e.w/2,e.y+e.h*.5,kind==='heavy'?'#ffd49c':'#79ffe7',14,220);this.event('hit');
  if(e.hp<=0){e.dead=true;this.kills++;this.score+=e===this.boss?5000:e.score;p.focus=clamp(p.focus+(e===this.boss||kind==='ultimate'?0:12),0,100);this.burst(e.x+e.w/2,e.y+e.h/2,'#ed66a1',24,230);this.event('kill');if(e===this.boss){this.endTimer=1.5;this.shake=12;this.bossGate=false;p.invuln=4;this.projectiles=[];this.attacks=[];this.event('boss-defeated');}}
  else this.score+=15;
 }
 ultimate(){const p=this.player;if(p.focus<100||p.stun>0||p.ultimate>0)return false;p.focus=0;p.ultimate=.8;p.invuln=1;p.attack=0;p.dash=0;p.ultimateBuffer=0;this.hitstop=.09;this.shake=12;this.rings.push({x:p.x+14,y:p.y+25,r:470,life:.65,max:.65,color:'#b2fff0'});
  for(const e of [...this.enemies,this.boss])if(!e.dead&&(e!==this.boss||e.active)&&Math.abs(e.x-p.x)<470)this.hitEnemy(e,e===this.boss?180:170,p.dir,'ultimate');
  this.projectiles=[];this.event('ultimate');return true;
 }
 addAttack(box,damage,delay=.6,duration=.2,parryable=false,source=this.boss,label=''){this.attacks.push({...box,damage,delay,maxDelay:delay,life:duration,maxLife:duration,parryable,source,label,hit:false});}
 shoot(e,targetX,targetY,speed=260,count=1,spread=.16){const x=e.x+e.w/2,y=e.y+e.h*.45,a=Math.atan2(targetY-y,targetX-x);for(let i=0;i<count;i++){const t=a+(i-(count-1)/2)*spread;this.projectiles.push({x,y,w:12,h:8,vx:Math.cos(t)*speed,vy:Math.sin(t)*speed,life:4.5,damage:e.damage||16,friendly:false});}this.event('shot');}
 update(dt,input={}){
  if(this.mode!=='playing')return;dt=clamp(dt,0,1/30);this.time+=dt;this.age+=dt;const p=this.player;
  const pressed={};for(const k of ['jump','attack','dash','parry','heavy','ultimate'])pressed[k]=!!input[k]&&!this.prev[k];this.prev={...input};
  for(const k of ['jump','dash','parry','heavy','ultimate'])if(pressed[k])p[k+'Buffer']=.15;
  if(input.attack)p.attackBuffer=.15;
  if(this.hitstop>0){this.hitstop-=dt;return;}
  for(const k of ['dash','dashCooldown','invuln','attack','attackBuffer','comboWindow','stun','jumpBuffer','dashBuffer','parryBuffer','heavyBuffer','ultimateBuffer','parry','parryCooldown','counter','ultimate'])p[k]=Math.max(0,p[k]-dt);
  p.stamina=clamp(p.stamina+dt*(22+this.profile.upgrades.flow*4.4)*(p.attack>0?.35:1),0,100);
  this.shake=Math.max(0,this.shake-dt*22);this.comboTimer-=dt;if(this.comboTimer<=0)this.comboCount=0;
  if(p.ultimateBuffer>0)this.ultimate();
  if(p.dashBuffer>0&&p.dashCooldown<=0&&p.stun<=0&&p.stamina>=18&&p.ultimate<=0){p.dash=.18;p.dashCooldown=this.dashMax;p.dashBuffer=0;p.stamina-=18;p.invuln=Math.max(p.invuln,.20);p.attack=0;p.parry=0;if(input.left!==input.right&&(input.left||input.right))p.dir=input.left?-1:1;p.vy=0;this.event('dash');}
  if(p.parryBuffer>0)this.parry();
  if(p.heavyBuffer>0&&p.attack<=.035)this.attack('heavy');else if(p.attackBuffer>0&&p.attack<=.035)this.attack('light');
  if(p.grounded)p.coyote=.10;else p.coyote=Math.max(0,p.coyote-dt);
  if(p.jumpBuffer>0&&p.stun<=0&&p.dash<=0&&p.ultimate<=0&&(p.coyote>0||p.jumps<2)){if(p.coyote>0)p.jumps=0;p.vy=p.jumps===0?-610:-545;p.jumps++;p.grounded=false;p.coyote=0;p.jumpBuffer=0;this.burst(p.x+14,p.y+p.h,'#82e6e0',6,80);this.event('jump');}
  const oldY=p.y;
  for(const f of this.level.platforms)if(f.moving){const old=f.y;f.y=f.baseY+Math.sin(this.age*1.1+f.x)*f.moving;if(p.grounded&&Math.abs(p.y+p.h-old)<3&&p.x+p.w>f.x&&p.x<f.x+f.w)p.y+=f.y-old;}
  if(p.dash>0){p.vx=p.dir*820;p.vy=0;if(Math.floor(this.age*60)%2===0)this.ghosts.push({x:p.x,y:p.y,dir:p.dir,life:.2});}
  else{if(p.stun<=0){const axis=(input.right?1:0)-(input.left?1:0);if(axis&&p.attack<=0&&p.parry<=0)p.dir=axis;const speed=axis*275*(p.attack>0?.5:1)*(p.parry>0?.2:1);p.vx+=(speed-p.vx)*Math.min(1,dt*(p.grounded?22:12));}if(input.down&&!input.jump&&!p.grounded&&p.stun<=0&&p.ultimate<=0)p.vy=Math.max(p.vy,650);p.vy=Math.min(850,p.vy+1550*dt);}
  p.x+=p.vx*dt;p.y+=p.vy*dt;const left=this.bossGate?this.level.boss.arena:this.encounter?.left||0,right=this.encounter?this.encounter.right-p.w:this.level.width-p.w-15;p.x=clamp(p.x,left,right);p.grounded=false;
  if(p.vy>=0)for(const f of this.level.platforms){if(p.x+p.w>f.x&&p.x<f.x+f.w&&oldY+p.h<=f.y+4&&p.y+p.h>=f.y){p.y=f.y-p.h;p.vy=0;p.grounded=true;p.jumps=0;break;}}
  if(p.y>650){if(this.endTimer>0){p.x=this.level.boss.arena+150;p.y=396;p.vy=0;}else{p.invuln=0;p.dash=0;this.damagePlayer(25,p.x,null,false);if(this.mode==='playing'){const f=this.level.platforms.filter(f=>!f.oneway&&f.x+f.w<p.x+30).pop()||this.level.platforms[0];p.x=Math.min(f.x+f.w-65,p.x);p.y=f.y-p.h;p.vx=0;p.vy=0;p.invuln=1.3;}}}
  if(this.mode!=='playing')return;
  const zone=p.x<this.level.width*.35?0:p.x<this.level.boss.arena?1:2;if(zone!==this.zone){this.zone=zone;this.event('zone',{zone});}
  for(const c of this.level.checkpoints)if(this.checkpoint<c.id&&Math.abs(p.x-c.x)<55&&Math.abs(p.y+p.h-c.y)<30){this.checkpoint=c.id;p.hp=this.maxHp;p.stamina=100;this.savePoint={stage:this.stageId,checkpoint:c.id,score:this.score,time:this.time,damage:this.damageTaken,kills:this.kills,parries:this.parries};this.event('checkpoint',{id:c.id});this.burst(c.x,c.y-38,'#7df8ec',22,130);}
  for(const item of this.pickups)if(!item.collected&&overlap(p,item)){item.collected=true;if(item.type==='health'){p.hp=Math.min(this.maxHp,p.hp+35);this.event('health');}else{this.score+=500;this.profile.shards++;this.profile.claimed.push(item.id);this.event('data');}this.burst(item.x,item.y,'#79f3ed',10,100);}
  for(const e of this.encounters){if(!e.done&&!e.active&&p.x>=e.trigger&&p.x<e.right){e.active=true;this.encounter=e;this.event('encounter');}if(e.active){const alive=this.enemies.some(n=>!n.dead&&e.enemyXs.includes(n.home));if(!alive){e.done=true;e.active=false;this.encounter=null;this.score+=500;this.event('encounter-clear');}}}
  if(p.x>this.level.boss.trigger&&!this.boss.active){this.boss.active=true;this.boss.state='recover';this.boss.timer=1.3;this.bossGate=true;this.event('boss-start');}
  const heavy=p.attackKind==='heavy',active=heavy?p.attack>.13&&p.attack<.39:p.attack>.055&&p.attack<.24;
  const range=heavy?157:116,attackBox={x:p.dir>0?p.x+5:p.x-range+20,y:p.y-12,w:range,h:88};
  for(const e of this.enemies){if(e.dead)continue;for(const k of ['flash','stun','broken'])e[k]=Math.max(0,e[k]-dt);e.age+=dt;
   if(active&&!p.hitTargets.has(e)&&overlap(attackBox,e)){p.hitTargets.add(e);this.hitEnemy(e,heavy?70:p.combo===3?42:28,p.dir,p.attackKind);}if(!e.dead)this.updateEnemy(e,dt);}
  const b=this.boss;for(const k of ['flash','stun','broken'])b[k]=Math.max(0,b[k]-dt);
  if(b.active&&!b.dead){if(active&&!p.hitTargets.has(b)&&overlap(attackBox,b)){p.hitTargets.add(b);this.hitEnemy(b,heavy?76:p.combo===3?45:30,p.dir,p.attackKind);}if(!b.dead)this.updateBoss(dt);}
  for(const a of this.attacks){a.delay-=dt;if(a.delay>0)continue;a.life-=dt;if(!a.hit&&overlap(p,a)){const result=this.damagePlayer(a.damage,a.source?.x??a.x,a.source,a.parryable);if(result)a.hit=true;}}
  this.attacks=this.attacks.filter(a=>a.life>0);
  for(const h of this.hazards){const t=(this.age+h.offset)%h.period;h.warning=t>h.period-h.on-.7&&t<h.period-h.on;h.active=t>=h.period-h.on;if(h.active&&overlap(p,h))this.damagePlayer(18,h.x,null,false);}
  for(const q of this.projectiles){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;
   if(q.friendly){for(const e of [...this.enemies,b])if(!e.dead&&(e!==b||b.active)&&overlap(q,e)){this.hitEnemy(e,55,p.dir,'reflected');q.life=0;break;}}
   else if(p.parry>0&&overlap({x:p.dir>0?p.x:p.x-28,y:p.y-8,w:58,h:80},q)){this.successfulParry();q.friendly=true;q.vx=p.dir*Math.max(380,Math.abs(q.vx)*1.5);q.vy=0;q.life=2;}
   else if(active&&overlap(attackBox,q)){q.life=0;this.burst(q.x,q.y,'#7df8ec',6);this.score+=10;}
   else if(overlap(p,q)){const result=this.damagePlayer(q.damage,q.x,null,false);if(result)q.life=0;}}
  this.projectiles=this.projectiles.filter(q=>q.life>0).slice(-100);
  for(const f of this.particles){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=450*dt;}this.particles=this.particles.filter(f=>f.life>0);this.ghosts=this.ghosts.filter(f=>(f.life-=dt)>0);this.rings=this.rings.filter(f=>(f.life-=dt)>0);
  const target=clamp(p.x-360+p.dir*45,this.bossGate?this.level.boss.arena-40:0,this.level.width-960);this.camera+=(target-this.camera)*Math.min(1,dt*6);
  if(this.endTimer>0){this.endTimer-=dt;if(this.endTimer<=0)this.completeStage();}
 }
 updateEnemy(e,dt){const p=this.player,dist=p.x+p.w/2-(e.x+e.w/2);if(Math.abs(dist)>760||e.stun>0)return;
  if(e.type==='drone'){e.y=e.baseY+Math.sin(e.age*2)*16;e.dir=dist<0?-1:1;if(Math.abs(dist)<510){e.timer-=dt;if(e.timer<=0){this.shoot(e,p.x,p.y+25,225);e.timer=1.8;}e.state=e.timer<.45?'windup':'idle';}return;}
  if(e.state==='windup'){e.timer-=dt;if(e.timer<=0){e.state='attack';e.timer=.22;
   if(e.type==='gunner'||e.type==='turret'){this.shoot(e,e.aimX,e.aimY,e.type==='gunner'?340:230,e.type==='turret'?3:1,.13);e.timer=.2;}
   else if(e.type==='charger'){e.vx=e.dir*470;e.timer=.37;}
   else{const box={x:e.dir>0?e.x+8:e.x-66,y:e.y-6,w:94,h:e.h+10};if(overlap(p,box))this.damagePlayer(e.damage,e.x,e,true);this.event('enemy-slash');}}}
  else if(e.state==='attack'){if(e.type==='charger'){const nx=e.x+e.vx*dt;if(this.level.platforms.some(f=>!f.oneway&&nx>f.x&&nx+e.w<f.x+f.w))e.x=nx;if(overlap(p,{x:e.x-8,y:e.y,w:e.w+16,h:e.h}))this.damagePlayer(e.damage,e.x,e,true);}e.timer-=dt;if(e.timer<=0){e.state='recover';e.timer=e.type==='charger'?.8:e.type==='turret'?1.35:.8;}}
  else if(e.state==='recover'){e.timer-=dt;if(e.timer<=0)e.state='idle';}
  else{e.dir=dist<0?-1:1;const ranged=e.type==='gunner'||e.type==='turret',range=ranged?550:e.type==='charger'?260:88;
   if(Math.abs(dist)<range&&Math.abs(p.y-e.y)<(ranged?330:100)){e.state='windup';e.timer=e.type==='gunner'?.85:e.type==='turret'?.7:e.type==='charger'?.62:.46;e.aimX=p.x+14;e.aimY=p.y+30;}
   else if(Math.abs(dist)<430){const nx=e.x+e.dir*e.speed*dt;if(this.level.platforms.some(f=>!f.oneway&&nx+e.w/2>f.x+12&&nx+e.w/2<f.x+f.w-12))e.x=nx;}}
 }
 updateBoss(dt){const b=this.boss,p=this.player;if(b.stun>0)return;b.timer-=dt;
  const phase=b.type==='reimei'?(b.hp/b.maxHp<.3?3:b.hp/b.maxHp<.65?2:1):b.hp<b.maxHp*.5?2:1;
  if(phase>b.phase){b.phase=phase;this.event('boss-phase');}
  if(b.type==='narukami')b.y=350+Math.sin(this.age*1.5)*13;
  if(b.state==='recover'){if(b.timer<=0){b.dir=p.x<b.x?-1:1;b.move=(b.move+1)%(b.type==='kurogane'?3:4);b.state='windup';b.timer=b.phase>1?.65:.9;b.attackId++;b.targetX=p.x+14;this.event('boss-windup',{move:b.move});}}
  else if(b.state==='windup'&&b.timer<=0){
   if(b.type==='kurogane'){
    if(b.move===0){b.state='sweep';b.timer=.27;}else if(b.move===1){b.state='charge';b.timer=.55;b.vx=b.dir*(b.phase>1?650:520);}else{b.state='volley';b.timer=.25;this.shoot(b,p.x,p.y+35,280,b.phase>1?5:3,.17);}}
   else if(b.type==='narukami'){
    b.state='volley';b.timer=.45;
    if(b.move===0){this.addAttack({x:this.level.boss.arena,y:410,w:this.level.width-this.level.boss.arena,h:25},24,.55,.45,false,b,'低位レール砲');}
    if(b.move===1)this.shoot(b,p.x,p.y+30,245,b.phase>1?7:5,.16);
    if(b.move===2){for(let i=-1;i<=1;i++)this.addAttack({x:clamp(b.targetX+i*125,this.level.boss.arena+20,this.level.width-80),y:230,w:54,h:230},22,.7+Math.abs(i)*.12,.22,false,b,'追尾落雷');}
    if(b.move===3){b.state='charge';b.vx=b.dir*490;b.timer=.58;}}
   else{
    if(b.move===0){b.state='charge';b.vx=b.dir*(b.phase>1?740:580);b.timer=.48;}
    if(b.move===1){b.state='sweep';b.timer=.32;}
    if(b.move===2){b.state='volley';b.timer=.3;const gap=clamp(b.targetX+160,this.level.boss.arena+180,this.level.width-180);for(let x=this.level.boss.arena+30;x<this.level.width-60;x+=110)if(Math.abs(x-gap)>105)this.addAttack({x,y:230,w:62,h:230},26,.85,.35,false,b,'炉心崩落');}
    if(b.move===3){b.state='volley';b.timer=.4;this.shoot(b,p.x,p.y+32,280,b.phase===3?9:5,.14);if(b.phase>=2)this.addAttack({x:this.level.boss.arena,y:425,w:this.level.width-this.level.boss.arena,h:30},20,.8,.35,false,b,'衝撃波');}}
   this.event('enemy-slash');
  }else if(b.state==='charge'){b.x=clamp(b.x+b.vx*dt,this.level.boss.arena+35,this.level.width-125);if(overlap(p,{x:b.x-15,y:b.y+8,w:b.w+30,h:b.h-8}))this.damagePlayer(b.type==='reimei'?26:22,b.x,b,true);if(b.timer<=0){b.state='recover';b.timer=b.phase>1?.75:1;}}
  else if(b.state==='sweep'){const box={x:b.dir>0?b.x+20:b.x-135,y:b.y+20,w:190,h:b.h-10};if(overlap(p,box))this.damagePlayer(25,b.x,b,true);if(b.timer<=0){b.state='recover';b.timer=1;}}
  else if(b.state==='volley'&&b.timer<=0){b.state='recover';b.timer=b.phase>1?.8:1.15;}
 }
 completeStage(){this.score+=Math.max(0,Math.round(1800-this.time*3))+this.player.hp*8;const id=this.stageId,first=!this.profile.cleared.includes(id);if(first){this.profile.shards+=3;this.profile.cleared.push(id);}this.profile.unlocked=Math.max(this.profile.unlocked,Math.min(2,id+1));this.profile.best[id]=Math.max(this.profile.best[id],this.score);const record={score:this.score,time:Math.round(this.time),damage:this.damageTaken,parries:this.parries};this.profile.records[id]=record;this.mode=id===2?'won':'stageclear';this.savePoint=id<2?{stage:id+1,checkpoint:0,score:0,time:0,damage:0,kills:0,parries:0}:null;this.event('stage-clear',{...record,stage:id,first,rank:this.damageTaken===0?'S':this.damageTaken<100?'A':this.damageTaken<230?'B':'C'});}
 snapshot(){const p=this.player;return{mode:this.mode,stage:this.stageId,title:this.level.title,checkpoint:this.checkpoint,player:{x:Math.round(p.x),y:Math.round(p.y),hp:p.hp,maxHp:this.maxHp,stamina:Math.round(p.stamina),focus:Math.round(p.focus),jumps:p.jumps,dashReady:p.dashCooldown<=0},score:this.score,time:Math.round(this.time),shards:this.profile.shards,upgrades:{...this.profile.upgrades},enemiesRemaining:this.enemies.filter(e=>!e.dead).length,encounter:!!this.encounter,boss:{type:this.boss.type,active:this.boss.active,hp:this.boss.hp,state:this.boss.state,phase:this.boss.phase}};}
}
root.Ronin={Game,LEVEL:STAGES[0],STAGES,ENEMIES,DIFFICULTIES,UPGRADES,cleanProfile,clamp,overlap};if(typeof module!=='undefined'&&module.exports)module.exports=root.Ronin;
})(typeof window!=='undefined'?window:globalThis);
