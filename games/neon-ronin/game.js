/* 雨刃 / campaign UI, canvas renderer and local save adapter. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),{Game,STAGES,ENEMIES,UPGRADES,cleanProfile,clamp}=Ronin;
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const defaults={left:'KeyA',right:'KeyD',jump:'KeyW',attack:'KeyJ',dash:'KeyK',parry:'KeyL',heavy:'KeyI',ultimate:'KeyR',down:'KeyS'};
const actionNames={left:'左移動',right:'右移動',jump:'ジャンプ',attack:'連撃',dash:'ダッシュ',parry:'弾き',heavy:'強攻撃',ultimate:'必殺技',down:'急降下'};
const validCode=s=>typeof s==='string'&&/^(Key[A-Z]|Arrow(Left|Right|Up|Down)|Space|ShiftLeft|ShiftRight|Digit[0-9])$/.test(s)&&s!=='KeyP';
const physical=new Set(),touchPointers=new Map(),held={};let padInput={},padStart=false,ready=false,last=0,acc=0,ambient=0,muted=false,audio=null,toastEnd=0,dialogPaused=false,binding=null,storageFailed=false;
let hitFlashes=[];
let images={},frames=[],enemyFrames=[],unitFrames=[],saved=readSave(),prefs=readPrefs();let reduced=prefs.reduced,lowEffects=prefs.lowEffects;
const touch=window.matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
function readSave(){try{const v=JSON.parse(localStorage.getItem('ame-yaiba-v2')||'null');if(v?.version===2)return v;const old=JSON.parse(localStorage.getItem('ame-yaiba-v1')||'null');if(old)return{version:2,profile:cleanProfile({best:[old.best||0]}),run:old.checkpoint?{stage:0,checkpoint:old.checkpoint}:null};}catch{}return null;}
function readPrefs(){let v={};try{v=JSON.parse(localStorage.getItem('ame-yaiba-settings-v2')||'{}')||{};}catch{}if(!v.controlsVersion&&v.bindings){const old={left:'ArrowLeft',right:'ArrowRight',jump:'Space'};for(const k of Object.keys(old))if(v.bindings[k]===old[k])v.bindings[k]=defaults[k];}const bindings={...defaults};const used=new Set();for(const k of Object.keys(bindings)){const val=v.bindings?.[k];if(validCode(val)&&!used.has(val)){bindings[k]=val;used.add(val);}}if(new Set(Object.values(bindings)).size<Object.keys(defaults).length)Object.assign(bindings,defaults);return{controlsVersion:1,bindings,volume:Number.isFinite(v.volume)?clamp(v.volume,0,100):60,reduced:typeof v.reduced==='boolean'?v.reduced:window.matchMedia('(prefers-reduced-motion: reduce)').matches,lowEffects:!!v.lowEffects,difficulty:Ronin.DIFFICULTIES[v.difficulty]?v.difficulty:(Ronin.DIFFICULTIES[saved?.profile?.difficulty]?saved.profile.difficulty:'standard')};}
function save(){saved=game.exportSave();try{localStorage.setItem('ame-yaiba-v2',JSON.stringify(saved));}catch{if(!storageFailed){say('この環境では保存できません。現在のプレイは続けられます。',4);storageFailed=true;}}}
function savePrefs(){try{localStorage.setItem('ame-yaiba-settings-v2',JSON.stringify(prefs));}catch{}}
// Layered synthesized Foley and machinery, with a shared limiter and no external audio requests.
let mix=null,noiseBuffer=null,bed=null,bedFilter=null,lastSound={};
function audioReady(){
 if(muted)return false;
 try{if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();mix=audio.createGain();const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.16;mix.connect(limiter);limiter.connect(audio.destination);
 noiseBuffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 bed=audio.createGain();bed.gain.value=0;bed.connect(mix);const air=audio.createBufferSource(),filter=audio.createBiquadFilter();air.buffer=noiseBuffer;air.loop=true;filter.type='lowpass';filter.frequency.value=350;bedFilter=filter;air.connect(filter);filter.connect(bed);air.start();}
 mix.gain.setTargetAtTime(prefs.volume/100*.65,audio.currentTime,.025);if(audio.state==='suspended')void audio.resume();return true;}catch{return false;}
}
function voice(freq,end,duration,volume,type='sine',delay=0,pan=0){
 if(!audioReady())return;const now=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),now+duration);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.003);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);const p=audio.createStereoPanner();p.pan.value=pan;g.connect(p);p.connect(mix);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};o.start(now);o.stop(now+duration+.01);
}
function noise(duration,volume,freq,end=0,delay=0,pan=0){
 if(!audioReady())return;const now=audio.currentTime+delay,o=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain(),p=audio.createStereoPanner();o.buffer=noiseBuffer;f.type='bandpass';f.Q.value=.8;f.frequency.setValueAtTime(freq,now);if(end)f.frequency.exponentialRampToValueAtTime(end,now+duration);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(volume,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+duration);p.pan.value=pan;o.connect(f);f.connect(g);g.connect(p);p.connect(mix);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();p.disconnect();};o.start(now,Math.random());o.stop(now+duration+.01);
}
function tone(freq,duration=.1,type='sine',volume=.04,endFreq=0){voice(freq,endFreq||freq,duration,volume,type);}
function soundFX(type,data={}){
 if(!audio)return;
 if(!audioReady())return;const now=audio.currentTime;
 // Simultaneous hits/columns share a sound; keep dense fights clear.
 if(now-(lastSound[type]??-99)<(type==='attack-fired'?.08:.025))return;lastSound[type]=now;
 const pan=Number.isFinite(data.x)?clamp((data.x-game.camera-480)/650,-.8,.8):0,v=.96+Math.random()*.08;
 if(type==='slash'||type==='enemy-slash'){const heavy=data.kind==='heavy',vol=type==='enemy-slash'?.11:.23;noise(heavy?.26:.14,vol,heavy?1200:3200,600,0,pan);voice(heavy?170:330*v,70,heavy?.22:.12,.07,'triangle',0,pan);}
 if(type==='hit'){const heavy=data.kind==='heavy';noise(.12,heavy?.4:.26,1800,450,0,pan);voice(heavy?115:190*v,40,heavy?.25:.12,heavy?.3:.18,'sine',0,pan);voice(1900*v,700,.15,.035,'triangle',.012,pan);}
 if(type==='parry-success'||type==='guard-break'){noise(.08,.25,5200,1800);for(let i=0;i<3;i++)voice(1200*(1+i*.71),1000*(1+i*.71),.3+i*.1,.08/(i+1),'sine',i*.006);voice(130,50,.14,.15);}
 if(type==='jump')noise(.09,.09,900,240);
 if(type==='step'){noise(.05,.08,900,350);voice(90,45,.045,.06);}
 if(type==='land'){noise(.12,.15,700,160);voice(110,38,.13,.13);}
 if(type==='hurt'){noise(.2,.2,500,100);voice(80,28,.25,.24,'triangle');}
 if(type==='shot'){noise(.065,.1,4800,1200,0,pan);voice(700,160,.09,.08,'triangle',0,pan);}
 if(type==='kill'){noise(.3,.14,2400,180,0,pan);voice(150,35,.3,.15,'triangle',0,pan);}
 if(type==='attack-fired'){noise(.35,.28,3900,250,0,pan);voice(data.label==='炉心崩落'?95:150,35,.35,.22,'triangle',0,pan);}
 if(type==='boss-windup'){voice(110,440,.45,.06,'triangle');noise(.4,.04,400,2600);}
 if(type==='ultimate'){noise(.4,.18,250,4800);voice(70,210,.35,.16,'triangle');noise(.6,.4,5000,180,.11);voice(130,26,.65,.32,'sine',.11);for(let i=0;i<3;i++)voice(900+i*310,190,.45,.035,'triangle',.13+i*.035);}
}
function say(text,duration=3){$('toast').textContent=text;toastEnd=ambient+duration;$('toast').style.opacity='1';}
const game=new Game((type,data)=>{
 soundFX(type,data);if(type==='hit')hitFlashes.push({x:data.x,y:data.y,life:.14,heavy:data.kind==='heavy'});
 if(type==='hint')say(data.text,4);
 if(type==='start'){$('chapter').textContent=['第一章','第二章','第三章'][data.stage];$('chapter-name').textContent=STAGES[data.stage].title;}
 if(type==='parry-ready')tone(450,.07,'triangle',.025,850);
 if(type==='parry-success'){tone(1300,.2,'sine',.07,600);say('弾き成功 ／ 次の一撃を強化',1.1);}
 if(type==='counter')tone(260,.12,'square',.03,80);
 if(type==='guard-break'){say('防御崩し',1.2);tone(110,.2,'square',.05,35);}
 if(type==='blocked')tone(450,.06,'square',.015,180);
 if(type==='ultimate'){tone(130,.6,'sawtooth',.04,700);say('終ノ一閃',1);}
 if(type==='zone')$('zone').textContent=STAGES[game.stageId].zones[data.zone];
 if(type==='checkpoint'){save();say('チェックポイント記録 ／ 体力・気力回復');tone(620,.3,'sine',.06,1000);}
 if(type==='health'){say('体力 +35',1.3);tone(580,.15,'sine',.04,900);}
 if(type==='data'){save();say('記録片 +1 ／ SCORE +500',1.3);tone(900,.17,'sine',.04,1300);}
 if(type==='upgrade'){save();renderShop();tone(700,.2,'sine',.04,1200);}
 if(type==='encounter')say('警備封鎖 ／ 敵を倒して先へ',2.5);
 if(type==='encounter-clear'){say('封鎖解除 +500',2);tone(660,.3,'triangle',.04,880);}
 if(type==='boss-start'){say(game.boss.name+'\n攻撃の予兆を見極めろ。',3);$('mission').textContent=game.boss.name+'を撃破';tone(50,.6,'sawtooth',.05,35);}
 if(type==='boss-phase')say('防衛出力上昇 ／ 第'+game.boss.phase+'形態',2);
 if(type==='boss-defeated'){say('防衛機構、停止。',1.3);tone(90,.9,'triangle',.08,30);}
 if(type==='death')showScreen('death');
 if(type==='stage-clear'){save();$('clear-title').textContent=data.stage===2?'夜明けは、あなたの手に。':'第'+(data.stage+1)+'章、完了。';$('clear-story').textContent=STAGES[data.stage].ending;$('rank').textContent=data.rank;$('final-score').textContent=data.score.toLocaleString('ja-JP');$('final-time').textContent=formatTime(data.time);$('best').textContent='BEST '+game.profile.best[data.stage].toLocaleString('ja-JP')+'  ／  弾き '+data.parries+'回';$('next-stage').hidden=data.stage===2;$('next-stage').textContent=data.stage<2?'次の章へ — '+STAGES[data.stage+1].title:'物語完了';renderShop();showScreen('win');tone(520,.5,'sine',.05,1040);}
});
window.roninGame=game;
if(saved){game.profile=cleanProfile(saved.profile);if(!saved.run||!Number.isInteger(saved.run.stage)||saved.run.stage<0||saved.run.stage>game.profile.unlocked||saved.run.stage>2)saved.run=null;}
function keyName(c){return c.replace('Key','').replace('Digit','').replace('ArrowLeft','←').replace('ArrowRight','→').replace('ArrowUp','↑').replace('ArrowDown','↓').replace('Space','SPACE').replace('ShiftLeft','SHIFT').replace('ShiftRight','R SHIFT');}
function mappedAction(code){const custom=Object.keys(prefs.bindings).find(k=>prefs.bindings[k]===code);if(custom)return custom;const aliases={ArrowLeft:'left',ArrowRight:'right',Space:'jump',ArrowUp:'jump',ArrowDown:'down',KeyZ:'attack',KeyX:'dash',ShiftLeft:'dash',ShiftRight:'dash',KeyC:'parry',KeyV:'heavy',KeyO:'ultimate'};return aliases[code];}
function syncHeld(){for(const k of Object.keys(defaults))held[k]=[...physical].some(c=>mappedAction(c)===k)||[...touchPointers.values()].includes(k)||!!padInput[k];}
function clearInput(){physical.clear();touchPointers.clear();padInput={};syncHeld();game.prev={};}
function showScreen(screen){for(const s of ['title','pause','death','win'])$(s==='title'?'title':s+'-screen').hidden=s!==screen;const play=screen==='playing';$('hud').hidden=!play;$('ability-hud').hidden=!play;$('touch-controls').hidden=!(play&&touch);$('pause').disabled=!play;if(!play){clearInput();$('boss-hud').hidden=true;}if(screen==='title')$('continue').hidden=!saved?.run;if(screen==='pause')$('resume').focus();if(screen==='death')$('retry').focus();if(screen==='win')($('next-stage').hidden?$('again'):$('next-stage')).focus();}
function begin(stage=0,checkpoint=0){if(!ready)return;clearInput();game.profile.difficulty=prefs.difficulty;game.reset(checkpoint,stage);startView();}
function startView(){audioReady();if(bedFilter)bedFilter.frequency.setTargetAtTime([650,280,140][game.stageId],audio.currentTime,.5);previousCamera=game.camera;acc=0;motionHistory=new WeakMap();hitFlashes=[];$('mission').textContent=game.level.subtitle;showScreen('playing');canvas.focus({preventScroll:true});save();}
function pause(){if(bed)bed.gain.setTargetAtTime(0,audio.currentTime,.04);if(game.mode==='playing'){game.mode='paused';showScreen('pause');}}
function resume(){audioReady();if(game.mode==='paused'){game.mode='playing';showScreen('playing');canvas.focus({preventScroll:true});last=performance.now();acc=0;}}
function toTitle(){game.mode='title';showScreen('title');$('start').focus();}
$('start').onclick=()=>{if(!ready)return;if(saved?.run&&!window.confirm('現在の旅の進行と義体強化をリセットして始めます。章の解放と最高スコアは残ります。'))return;game.newCampaign(prefs.difficulty);startView();};
$('continue').onclick=()=>{if(ready&&saved&&game.loadSave(saved)){game.profile.difficulty=prefs.difficulty;game.retry();startView();}};
$('pause').onclick=pause;$('resume').onclick=resume;
for(const id of ['restart','retry'])$(id).onclick=()=>{game.profile.difficulty=prefs.difficulty;game.retry();startView();};
$('again').onclick=()=>begin(game.stageId);$('next-stage').onclick=()=>{if(game.stageId<2)begin(game.stageId+1);};
for(const id of ['quit','death-title','win-title'])$(id).onclick=toTitle;
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'音 OFF':'音 ON';$('sound').setAttribute('aria-pressed',String(!muted));$('sound').setAttribute('aria-label',muted?'音をオンにする':'音をオフにする');if(muted&&mix)mix.gain.setTargetAtTime(0,audio.currentTime,.02);else tone(660,.15);};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else say('全画面表示は、このブラウザでは利用できません。');}catch{say('全画面表示を開始できませんでした。');}};
function openDialog(id){dialogPaused=game.mode==='playing';if(dialogPaused)pause();$(id).showModal();}
for(const name of ['help','settings','chapters']){$('close-'+name).onclick=()=>$(name==='chapters'?'chapters-dialog':name+'-dialog').close();$(name+'-dialog').addEventListener('close',()=>{binding=null;if(dialogPaused){dialogPaused=false;resume();}});}
$('help').onclick=()=>openDialog('help-dialog');
function settings(){renderKeys();$('difficulty').value=prefs.difficulty;$('volume').value=prefs.volume;$('reduce-motion').checked=reduced;$('low-effects').checked=lowEffects;openDialog('settings-dialog');}
$('settings-open').onclick=settings;$('pause-settings').onclick=settings;
$('difficulty').onchange=e=>{prefs.difficulty=e.target.value;savePrefs();};$('volume').oninput=e=>{prefs.volume=Number(e.target.value);if(mix&&!muted)mix.gain.setTargetAtTime(prefs.volume/100*.65,audio.currentTime,.025);savePrefs();};
$('reduce-motion').onchange=e=>{reduced=prefs.reduced=e.target.checked;savePrefs();};$('low-effects').onchange=e=>{lowEffects=prefs.lowEffects=e.target.checked;savePrefs();};
function renderKeys(){const list=$('keybind-list');list.replaceChildren();for(const [k,label]of Object.entries(actionNames)){const b=document.createElement('button');b.className='keybind';b.innerHTML='<span>'+label+'</span><b>'+keyName(prefs.bindings[k])+'</b>';b.onclick=()=>{binding=k;renderKeys();$('binding-status').textContent=label+'に使うキーを押してください。ESCで取り消し。';};if(binding===k)b.className+=' listening';list.appendChild(b);}const bar=document.querySelector('.controlbar>div');if(bar){bar.innerHTML='<kbd>'+keyName(prefs.bindings.left)+'</kbd><kbd>'+keyName(prefs.bindings.right)+'</kbd><span>移動</span>'+Object.keys(actionNames).filter(k=>!['left','right'].includes(k)).map(k=>'<kbd>'+keyName(prefs.bindings[k])+'</kbd><span>'+actionNames[k]+'</span>').join('');}}
$('reset-keys').onclick=()=>{prefs.bindings={...defaults};binding=null;savePrefs();renderKeys();$('binding-status').textContent='初期キーに戻しました。';};
function renderShop(){const list=$('upgrade-list');list.replaceChildren();$('shards-shop').textContent='記録片 '+game.profile.shards;for(const [key,u]of Object.entries(UPGRADES)){const level=game.profile.upgrades[key],cost=u.cost+level,b=document.createElement('button');b.className='upgrade';b.disabled=level>=u.max||game.profile.shards<cost;b.innerHTML='<strong>'+u.name+' '+level+'/'+u.max+'</strong><small>'+u.description+'</small><em>'+(level>=u.max?'最大強化':'記録片 '+cost)+'</em>';b.onclick=()=>game.buyUpgrade(key);list.appendChild(b);}}
$('stage-select').onclick=()=>{const list=$('chapter-list');list.replaceChildren();for(const s of STAGES){const b=document.createElement('button');b.className='chapter-choice';b.disabled=!ready||s.id>game.profile.unlocked;b.innerHTML='<div><span>CHAPTER 0'+(s.id+1)+'</span><b>'+s.title+'</b></div><small>'+(b.disabled?'未解放':'BEST '+game.profile.best[s.id])+'</small>';b.onclick=()=>{$('chapters-dialog').close();if(s.id<=game.profile.unlocked)begin(s.id);};list.appendChild(b);}openDialog('chapters-dialog');};
document.addEventListener('keydown',e=>{
 if(binding){e.preventDefault();if(e.code==='Escape'){binding=null;$('binding-status').textContent='変更を取り消しました。';renderKeys();return;}if(!validCode(e.code)){$('binding-status').textContent='このキーは使えません。別のキーを押してください。';return;}const other=Object.keys(prefs.bindings).find(k=>k!==binding&&prefs.bindings[k]===e.code);if(other)prefs.bindings[other]=prefs.bindings[binding];prefs.bindings[binding]=e.code;binding=null;savePrefs();renderKeys();$('binding-status').textContent='キー設定を保存しました。';return;}
 if(['help-dialog','settings-dialog','chapters-dialog'].some(id=>$(id).open))return;
 if(['Escape','KeyP'].includes(e.code)&&!e.repeat){e.preventDefault();if(game.mode==='playing')pause();else if(game.mode==='paused')resume();return;}
 if(mappedAction(e.code)&&game.mode==='playing'){e.preventDefault();physical.add(e.code);syncHeld();}
});
document.addEventListener('keyup',e=>{physical.delete(e.code);syncHeld();});
window.addEventListener('blur',()=>{clearInput();pause();if(audio?.state==='running')void audio.suspend();});window.addEventListener('gamepaddisconnected',()=>{padInput={};clearInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
for(const b of document.querySelectorAll('[data-key]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchPointers.set(e.pointerId,b.dataset.key);syncHeld();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,e=>{touchPointers.delete(e.pointerId);syncHeld();});}
function pollGamepad(){const gp=navigator.getGamepads?.()?.[0];if(!gp){padInput={};padStart=false;syncHeld();return;}const b=i=>!!gp.buttons[i]?.pressed;padInput={left:(gp.axes[0]||0)<-.25||b(14),right:(gp.axes[0]||0)>.25||b(15),jump:b(0),attack:b(2),dash:b(1),heavy:b(3),parry:b(4),ultimate:b(5)};if(b(9)&&!padStart){if(game.mode==='playing')pause();else if(game.mode==='paused')resume();}padStart=b(9);syncHeld();}
function formatTime(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');}
  // Treat neutral matte pixels as transparent at load time. Connected regions
  // preserve isolated metal highlights; atlas files themselves stay untouched.
  function prepareAtlas(img,mode="matte"){
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
    const im=g.getImageData(0,0,c.width,c.height),d=im.data,n=c.width*c.height,seen=new Uint8Array(n),queue=new Int32Array(n),w=c.width;
    if(mode==="green"){for(let i=0;i<n;i++){const r=d[i*4],gg=d[i*4+1],b=d[i*4+2];if(gg>120&&gg>r*1.65&&gg>b*1.65)d[i*4+3]=0;}g.putImageData(im,0,0);return c;}
    const matte=i=>{const r=d[i*4],gg=d[i*4+1],b=d[i*4+2];return Math.min(r,gg,b)>85&&Math.max(r,gg,b)-Math.min(r,gg,b)<22;};
    for(let i=0;i<n;i++){if(seen[i]||!matte(i))continue;let a=0,z=1;queue[0]=i;seen[i]=1;
      while(a<z){const k=queue[a++],x=k%w;for(const j of [x>0?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(j>=0&&j<n&&!seen[j]&&matte(j)){seen[j]=1;queue[z++]=j;}}
      if(z>55)for(let k=0;k<z;k++)d[queue[k]*4+3]=0;
    }
    g.putImageData(im,0,0);return c;
  }
let motionHistory=new WeakMap(),renderAlpha=1,previousCamera=0,stepDistance=0,landPulse=0;
function rememberMotion(){previousCamera=game.camera;for(const e of [game.player,game.boss,...game.enemies,...game.projectiles,...game.particles])motionHistory.set(e,{x:e.x,y:e.y,grounded:e.grounded});}
function renderEntity(e){const old=motionHistory.get(e);if(!old||Math.abs(e.x-old.x)>90||Math.abs(e.y-old.y)>90)return e;return{...e,x:old.x+(e.x-old.x)*renderAlpha,y:old.y+(e.y-old.y)*renderAlpha};}
function motionSounds(){const p=game.player,old=motionHistory.get(p);if(!old)return;if(p.grounded&&!old.grounded){landPulse=.16;soundFX('land');}if(p.grounded&&Math.abs(p.vx)>60&&p.dash<=0){stepDistance+=Math.abs(p.x-old.x);if(stepDistance>65){stepDistance%=65;soundFX('step');}}else stepDistance=0;}
  // Authored source rectangles/foot anchors, normalized to the returned atlas.
  const HERO=[
    [45,15,307,436,184,443],[415,54,426,397,679,443],[934,57,315,394,1093,443],[1318,55,430,395,1560,443],
    [12,465,392,322,235,755],[412,565,449,305,670,864],[883,541,566,331,1080,864],[1390,449,369,422,1580,864]
  ];
  const ENEMY=[
    [65,44,267,359,255,395],[420,86,435,315,692,391],[970,87,284,255,1116,300],[1401,83,364,298,1542,300],
    [0,447,429,405,269,840],[472,409,413,442,680,839],[882,475,501,376,1190,838],[1390,410,368,442,1595,839]
  ];
  function makeFrames(atlas,spec){const sx=atlas.width/1774,sy=atlas.height/887;return spec.map(v=>({atlas,x:v[0]*sx,y:v[1]*sy,w:v[2]*sx,h:v[3]*sy,ax:(v[4]-v[0])*sx,ay:(v[5]-v[1])*sy,scale:1/sx}));}
  function sprite(f,x,y,dir=1,scale=.18,alpha=1,flash=false,breath=1,tilt=0,stretch=1){if(!f)return;ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(dir*scale*f.scale*stretch,scale*f.scale*breath);ctx.globalAlpha=alpha;if(flash)ctx.filter='brightness(2.5)';ctx.drawImage(f.atlas,f.x,f.y,f.w,f.h,-f.ax,-f.ay,f.w,f.h);ctx.restore();}
  function heroFrame(){const p=game.player;if(p.dash>0)return 5;if(p.parry>0)return 0;if(p.attack>0)return p.attackKind==='heavy'||p.combo===3?7:6;if(!p.grounded)return 4;if(Math.abs(p.vx)>35)return[1,2,3,2][Math.floor(Math.abs(p.x)/18)%4];return 0;}
  function glowRect(x,y,w,h,color,blur=12){ctx.save();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=lowEffects?0:blur;ctx.fillRect(x,y,w,h);ctx.restore();}
  function background(cam,t){
    ctx.fillStyle='#06101e';ctx.fillRect(0,0,960,540);
    const bg=images[game.level.scene];if(bg){const width=1215,height=810,offset=-((cam*.24)%width);for(let k=-1;k<2;k++)ctx.drawImage(bg,offset+k*width,-100,width,height);}
    const shade=ctx.createLinearGradient(0,0,0,540);shade.addColorStop(0,'#040d1915');shade.addColorStop(.6,'#07142530');shade.addColorStop(1,'#060d21dd');ctx.fillStyle=shade;ctx.fillRect(0,0,960,540);
    if(!reduced&&!lowEffects&&game.stageId===0){ctx.strokeStyle='#8fcde62a';ctx.lineWidth=.6;ctx.beginPath();for(let i=0;i<130;i++){const x=((i*97.71-t*125-cam*.6)%1050+1050)%1050-35,y=(i*83.3+t*(270+(i%4)*50))%570-20;ctx.moveTo(x,y);ctx.lineTo(x-6,y+20);}ctx.stroke();}
  }
  function platforms(cam,t){for(const f of game.level.platforms){const x=Math.round(f.x-cam);if(x+f.w<0||x>960)continue;
    ctx.fillStyle=f.oneway?'#10222f':'#071221';ctx.fillRect(x,f.y,f.w,f.h);
    ctx.fillStyle='#203447';ctx.fillRect(x,f.y+4,f.w,5);ctx.fillStyle='#355166';ctx.fillRect(x,f.y,f.w,2);
    ctx.fillStyle=f.oneway?'#60d8d8':'#577e90';ctx.fillRect(x+3,f.y,f.w-6,1);
    if(f.oneway){glowRect(x+8,f.y+6,24,2,'#62dcd6',6);glowRect(x+f.w-32,f.y+6,24,2,'#62dcd6',6);ctx.fillStyle='#0a1423';ctx.fillRect(x+20,f.y+f.h,9,10);ctx.fillRect(x+f.w-30,f.y+f.h,9,10);}
    else{ctx.strokeStyle='#223149';ctx.lineWidth=1;for(let j=0;j<f.w;j+=80){ctx.strokeRect(x+j+4,f.y+14,72,29);ctx.fillStyle='#223544';ctx.fillRect(x+j+9,f.y+19,2,2);ctx.fillRect(x+j+69,f.y+38,2,2);}
      ctx.fillStyle='#2b3546';for(let j=0;j<f.w;j+=27)ctx.fillRect(x+j,f.y+55,15,2);
      ctx.save();ctx.beginPath();ctx.rect(x,f.y+2,f.w,6);ctx.clip();for(let j=0;j<f.w;j+=140){ctx.fillStyle=j%280===0?'#73f4dd44':'#f561ae44';ctx.fillRect(x+j,f.y+2,75,1);}ctx.restore();
      if(f.x>0){glowRect(x+3,f.y+8,3,14,'#e3a86e',5);}glowRect(x+f.w-6,f.y+8,3,14,'#e3a86e',5);
    }
  }}
  function checkpoints(cam,t){for(const cp of game.level.checkpoints){const x=cp.x-cam;if(x<-80||x>1040)continue;const active=game.checkpoint>=cp.id;
    ctx.fillStyle='#102d3a';ctx.fillRect(x-11,cp.y-50,22,50);ctx.strokeStyle='#437e87';ctx.strokeRect(x-11,cp.y-50,22,50);
    glowRect(x-8,cp.y-45,16,21,active?'#72f5ce':'#61cff9',12);ctx.fillStyle='#0a263a';ctx.fillRect(x-4,cp.y-41,8,3);ctx.fillRect(x-4,cp.y-34,8,3);
    ctx.fillStyle=active?'#8cebd6':'#b8dce9';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(active?'記録済み':'記録端末',x,cp.y-64);ctx.textAlign='left';
    ctx.strokeStyle='#57e6d444';ctx.beginPath();ctx.ellipse(x,cp.y-2,24+Math.sin(t*3)*3,4,0,0,Math.PI*2);ctx.stroke();
  }}
  function pickups(cam,t){for(const p of game.pickups){if(p.collected)continue;const x=p.x-cam+12,y=p.y+10+Math.sin(t*3+p.x)*4;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillStyle='#10323c';ctx.strokeStyle=p.type==='health'?'#70ffd1':'#ffd77e';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=10;ctx.fillRect(-7,-7,14,14);ctx.strokeRect(-7,-7,14,14);ctx.rotate(-Math.PI/4);ctx.fillStyle=ctx.strokeStyle;
    if(p.type==='health'){ctx.fillRect(-4,-1,8,2);ctx.fillRect(-1,-4,2,8);}else{ctx.fillRect(-2,-4,4,8);}ctx.restore();
  }}
  function enemy(e,cam){if(e.dead)return;e=renderEntity(e);const x=e.x+e.w/2-cam;if(x<-160||x>1120)return;
    const basic=e.type==='guard'||e.type==='drone';let f,scale;
    if(basic){f=enemyFrames[e.type==='drone'?2+Math.floor(e.age*5)%2:e.state==='attack'?1:0];scale=e.type==='drone'?.18:.205;}
    else{f=unitFrames[{shield:0,gunner:1,charger:2,turret:3}[e.type]];scale=e.type==='turret'?.16:.18;}
    const hovering=e.type==='drone',walking=e.state==='idle'&&!hovering&&e.type!=='turret',coil=e.state==='windup'?Math.sin(clamp(1-e.timer/.85,0,1)*Math.PI)*.055:0;const bob=hovering?Math.sin(e.age*4)*2:walking?-Math.abs(Math.sin(e.x*.08))*1.6:0,lean=e.flash>0?-e.dir*Math.sin(e.flash/.12*Math.PI)*.12:e.state==='attack'?e.dir*.08:-e.dir*coil;
    sprite(f,x,e.y+e.h+bob,-e.dir,scale,1,e.flash>0&&!reduced,1-coil,reduced?0:lean,1+coil*.4);
    if(e.state==='windup'){
      if(e.type==='gunner'||e.type==='turret'){ctx.strokeStyle='#ffbf7377';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(x,e.y+e.h*.45);ctx.lineTo(e.aimX-cam,e.aimY);ctx.stroke();ctx.setLineDash([]);}
      ctx.fillStyle=e.type==='gunner'||e.type==='turret'?'#ffcd84':'#ff6c92';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('!',x,e.y-18);ctx.textAlign='left';
    }
    if(e.broken>0){ctx.fillStyle='#ffdf92';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('崩し',x,e.y-14);ctx.textAlign='left';}
    if(e.hp<e.maxHp){ctx.fillStyle='#182833';ctx.fillRect(x-18,e.y-9,36,3);ctx.fillStyle='#f378a7';ctx.fillRect(x-18,e.y-9,36*e.hp/e.maxHp,3);}
  }
  function boss(cam,t){const b=renderEntity(game.boss);if(b.dead||!b.active)return;const x=b.x+b.w/2-cam;
    let f,scale;if(b.type==='kurogane'){f=enemyFrames[b.state==='windup'?5:b.state==='sweep'||b.state==='charge'?6:b.state==='recover'?7:4];scale=.295;}
    else{f=unitFrames[b.type==='narukami'?4:5];scale=b.type==='narukami'?.29:.31;}
    if(b.state==='windup'){
      const labels=b.type==='kurogane'?['斬撃','突進','射撃']:b.type==='narukami'?['レール砲 / 跳躍','拡散射撃','落雷 / 回避','突進']:['突進','斬撃','炉心崩落 / 回避','連鎖射撃'];
      glowRect(x-30,b.y-18,60,3,'#ff4c88',16);ctx.fillStyle='#ffd6b2';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(labels[b.move],x,b.y-32);ctx.textAlign='left';
    }
    sprite(f,x,b.y+b.h,-b.dir,scale,1,b.flash>0&&!reduced,1+Math.sin(t*2)*.008,reduced?0:b.flash>0?-b.dir*.07:b.state==='charge'?b.dir*.10:b.state==='windup'?-b.dir*Math.sin(clamp(b.timer,0,1)*Math.PI)*.045:Math.sin(t*1.5)*.01);
    if(b.state==='charge'){ctx.fillStyle='#f7519444';ctx.fillRect(x-b.dir*100,b.y+b.h-8,100,4);}
    if(b.broken>0){ctx.font='12px sans-serif';ctx.fillStyle='#ffe5a6';ctx.textAlign='center';ctx.fillText('反撃の好機',x,b.y-18);ctx.textAlign='left';}
  }
  // Deterministic, simulation-timed energy effects. These never alter hit boxes.
  function energyPath(points,color,width,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.restore();
  }
  function energyGlow(x,y,rx,ry,color,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,color);g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function discharge(x,y,w,h,seed,color,alpha=1){
    const tick=reduced?0:Math.floor(game.age*24),points=[];
    const noise=n=>{const v=Math.sin(n*127.1+seed*31.7+tick*8.3)*43758.5453;return v-Math.floor(v);};
    for(let i=0;i<=12;i++)points.push([x+w/2+(i===0||i===12?0:(noise(i)-.5)*w*.65),y+h*i/12]);
    if(!lowEffects)energyPath(points,color,9,alpha*.16);
    energyPath(points,color,3,alpha);energyPath(points,'#f1ffff',1,alpha);
    if(!lowEffects)for(let i=3;i<11;i+=3){const p=points[i],side=noise(i+30)>.5?1:-1;energyPath([p,[p[0]+side*w*.23,p[1]+h*.06],[p[0]+side*w*.38,p[1]+h*.15]],color,1,alpha*.65);}
  }
  function impact(x,y,w,color,progress){
    const fade=1-progress;
    energyGlow(x,y,w*.9,18,color,fade*.8);
    ctx.save();ctx.globalAlpha=fade;ctx.strokeStyle=color;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(x,y,w*(.25+progress*.6),3+progress*6,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    if(!lowEffects)for(let i=0;i<9;i++){const dir=(i-4)/4,reach=(12+i%3*10)*progress;energyPath([[x+dir*reach,y-Math.sin((i+1)*.8)**2*38*progress],[x+dir*(reach+3),y-Math.sin((i+1)*.8)**2*38*progress-3]],color,1,fade);}
  }
  function floorWarning(x,y,w,progress,color){
    energyGlow(x+w/2,y,w*.65,10,color,.25+progress*.25);
    energyPath([[x,y-5],[x,y],[x+w,y],[x+w,y-5]],color,1,.8);
    energyPath([[x+w*(1-progress)/2,y-2],[x+w*(1+progress)/2,y-2]],color,3,.9);
    for(const side of [-1,1]){const cx=x+w/2+side*(w*.45+8*(1-progress));energyPath([[cx-side*4,y-10],[cx,y-7],[cx-side*4,y-4]],color,1,.8);}
  }
  function dangers(cam,t){
    ctx.save();
    for(const h of game.hazards){const x=h.x-cam;if(x+h.w<0||x>960)continue;
      const y=h.y+h.h;ctx.fillStyle='#172c36';ctx.fillRect(x,y-4,h.w,4);
      for(let k=0;k<h.w;k+=14){ctx.fillStyle=h.active?'#a6fbff':h.warning?'#ffbd64':'#425266';ctx.fillRect(x+k,y-3,7,2);}
      if(h.warning)floorWarning(x,y,h.w,.65,'#ffbf68');
      if(h.active){energyGlow(x+h.w/2,y-7,h.w*.6,20,'#51daff',.5);for(let k=0;k<h.w;k+=22)discharge(x+k,h.y,22,h.h,k+h.x,'#64e9ff',.9);}
    }
    for(const a of game.attacks){const x=a.x-cam;if(x+a.w<-50||x>1010)continue;
      const warning=a.delay>0,progress=warning?clamp(1-a.delay/(a.maxDelay||.85),0,1):clamp(1-a.life/(a.maxLife||.35),0,1);
      const vertical=a.h>a.w,reactor=a.label==='炉心崩落',color=reactor?'#ff9654':'#64e9ff',floor=a.y+a.h;
      if(warning){
        if(vertical){floorWarning(x,floor,a.w,progress,'#ffc16a');energyGlow(x+a.w/2,a.y,15,10,color,.3+progress*.4);
          energyPath([[x+a.w/2,a.y],[x+a.w/2,floor]],'#ffc16a',1,.12+progress*.14);
          if(progress>.65)discharge(x+a.w*.3,a.y,a.w*.4,a.h*.22,a.x,color,(progress-.65)*1.5);
        }else{const cy=a.y+a.h/2;energyPath([[x,cy],[x+a.w,cy]],'#ffc16a',1,.5);for(let k=Math.max(x,0);k<Math.min(x+a.w,960);k+=75)energyPath([[k,cy-4],[k+9,cy],[k,cy+4]],'#ffc16a',1,progress);}
        continue;
      }
      const alpha=reduced?.7:Math.min(1,(1-progress)*3);
      if(vertical){
        floorWarning(x,floor,a.w,1,color);
        energyGlow(x+a.w/2,a.y+a.h/2,a.w*.8,a.h*.65,color,.24*alpha);
        if(reactor){
          const heat=ctx.createLinearGradient(x,0,x+a.w,0);heat.addColorStop(0,'#ff6b1800');heat.addColorStop(.3,'#ff75182b');heat.addColorStop(.5,'#ffdda466');heat.addColorStop(.7,'#ff75182b');heat.addColorStop(1,'#ff6b1800');
          ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=heat;ctx.fillRect(x,a.y,a.w,a.h);ctx.restore();
          for(let j=0;j<3;j++){const cx=x+a.w*(.25+j*.25),pts=[];for(let k=0;k<=16;k++)pts.push([cx+Math.sin(k*1.3+j*2+(reduced?0:game.age*15))*a.w*.11,a.y+k*a.h/16]);energyPath(pts,j===1?'#ffeab5':color,j===1?4:2,alpha);}
          discharge(x,a.y,a.w,a.h,a.x,'#ffcb78',alpha*.6);
        }else discharge(x,a.y,a.w,a.h,a.x,color,alpha);
        impact(x+a.w/2,floor,a.w,color,progress);
      }else{
        const cy=a.y+a.h/2,wave=a.label==='衝撃波';
        ctx.save();ctx.beginPath();ctx.rect(Math.max(-30,x),a.y,Math.min(1020,a.w),a.h);ctx.clip();
        energyGlow(x+a.w/2,cy,a.w*.6,a.h*.8,color,.5*alpha);
        const pts=[];for(let k=Math.max(-20,x);k<=Math.min(980,x+a.w);k+=8)pts.push([k,cy+(wave?Math.sin(k*.07-game.age*25)*a.h*.3:Math.sin(k*.05)*2)]);
        energyPath(pts,color,wave?4:7,alpha*.4);energyPath(pts,'#d5fcff',wave?1.5:2,alpha);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawHero(cam,t){const p=renderEntity(game.player),x=p.x+p.w/2-cam;
    for(const gh of game.ghosts)sprite(frames[5],gh.x+p.w/2-cam,gh.y+p.h,gh.dir,.18,gh.life*2);
    if(p.grounded){ctx.fillStyle='#72e6ea16';ctx.beginPath();ctx.ellipse(x,p.y+p.h+2,27,3,0,0,Math.PI*2);ctx.fill();}
    const alpha=p.invuln>0&&p.dash<=0?(Math.floor(t*18)%2?.45:1):1;
    const total=p.attackKind==='heavy'?.58:p.combo===3?.36:.27,progress=clamp(1-p.attack/total,0,1),swing=p.attack>0?Math.sin(progress*Math.PI):0;
    const stride=p.grounded&&Math.abs(p.vx)>35&&p.attack<=0?Math.abs(Math.sin(p.x/18*Math.PI/2)):0;
    const tilt=reduced?0:p.stun>0?-p.dir*.12:p.dash>0?p.dir*.10:p.attack>0?p.dir*(-.09+progress*.21):clamp(p.vx/275,-1,1)*.055;
    const squash=reduced?0:landPulse*.22;
    sprite(frames[heroFrame()],x+p.dir*swing*4,p.y+p.h-stride*1.8,p.dir,.18,alpha,false,1-squash+(p.grounded?Math.sin(t*3)*.004:clamp(-p.vy/15000,-.025,.035)),tilt,1+squash);
    if(p.attack>0&&!reduced&&!lowEffects&&progress>.22&&progress<.8){ctx.save();ctx.globalCompositeOperation='lighter';energyGlow(x+p.dir*40,p.y+32,45,24,p.attackKind==='heavy'?'#ffce83':'#65ffe7',.12*swing);ctx.restore();}
    if(p.attack>.04&&progress>.16&&progress<.92){ctx.save();ctx.translate(x,p.y+28);ctx.scale(p.dir,1);const color=p.attackKind==='heavy'?'#ffe0a4':'#aaffec',radius=p.attackKind==='heavy'?92:76,angle=-1.55+progress*3.2,reverse=p.combo===2?-1:1;
      for(let i=5;i>=0;i--){ctx.strokeStyle=color;ctx.globalAlpha=(1-i/6)*Math.sin(progress*Math.PI)*.8;ctx.lineWidth=(p.attackKind==='heavy'?5:3)*(1-i*.10);ctx.beginPath();ctx.ellipse(16,0,radius-i*2,42-i,0,reverse*(angle-.75-i*.10),reverse*angle,reverse<0);ctx.stroke();}ctx.restore();}
  }

  function render(t){const cam=game.mode==='title'?300+Math.sin(t*.08)*70:previousCamera+(game.camera-previousCamera)*renderAlpha;
    ctx.save();if(game.mode==='playing'&&!reduced&&game.shake>0)ctx.translate(Math.sin(t*119)*game.shake,Math.cos(t*137)*game.shake*.55);
    background(cam,t);platforms(cam,t);dangers(cam,t);checkpoints(cam,t);pickups(cam,t);
    if(game.mode!=='title'){
      if(game.bossGate||game.encounter){for(const x0 of game.encounter?[game.encounter.left,game.encounter.right]:[game.level.boss.arena,game.level.width-15]){const x=x0-cam;ctx.fillStyle='#f64f8833';ctx.fillRect(x,290,4,170);glowRect(x,290,1,170,'#ff6797',8);}}
      for(const e of game.enemies)enemy(e,cam);boss(cam,t);drawHero(cam,t);
      for(const raw of game.projectiles){const q=renderEntity(raw);const x=q.x+q.w/2-cam,y=q.y+q.h/2,angle=Math.atan2(q.vy,q.vx),color=q.friendly?'#92ffdd':game.stageId===2?'#ffae67':'#ff659d';
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);energyGlow(0,0,16,7,color,.6);energyPath([[-20,0],[4,0]],color,3,.55);energyPath([[-5,0],[4,0]],'#f3ffff',2,1);ctx.restore();}
      const p=game.player;if(p.parry>0){ctx.strokeStyle='#ffe2a7';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x+14-cam,p.y+30,43,p.dir>0?-1.1:Math.PI-1.1,p.dir>0?1.1:Math.PI+1.1);ctx.stroke();ctx.lineWidth=1;}
      if(p.counter>0){glowRect(p.x+4-cam,p.y-9,20,2,'#ffe2a7',8);}
      for(const r of game.rings){const q=1-r.life/r.max;ctx.globalAlpha=1-q;ctx.strokeStyle=r.color;ctx.lineWidth=r.r>100?5:2;ctx.beginPath();ctx.ellipse(r.x-cam,r.y,r.r*q,Math.min(140,r.r*q),0,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;}ctx.globalAlpha=1;
      for(const raw of game.particles){const fx=renderEntity(raw);ctx.globalAlpha=clamp(fx.life/fx.max,0,1);ctx.fillStyle=fx.color;ctx.fillRect(fx.x-cam,fx.y,fx.size+1,fx.size);}ctx.globalAlpha=1;
      for(const f of hitFlashes){const a=f.life/.14;ctx.save();ctx.globalAlpha=a;ctx.translate(f.x-cam,f.y);ctx.rotate(-.4);const len=(f.heavy?44:28)*(1-a*.5);energyPath([[-len,0],[len,0]],f.heavy?'#ffe2aa':'#c8fff3',2,a);energyPath([[0,-len*.45],[0,len*.45]],'#ffffff',1,a);energyGlow(0,0,len,len*.6,'#a2ffe6',a*.4);ctx.restore();}
      if(game.comboCount>=2&&game.comboTimer>0){ctx.fillStyle='#a6ffed';ctx.textAlign='right';ctx.font='italic 24px sans-serif';ctx.fillText(game.comboCount+' HIT',912,125);ctx.font='10px sans-serif';ctx.fillText('連撃',912,143);ctx.textAlign='left';}
    }
    // Fine foreground rain and wet floor glints, kept below readable HUD.
    if(!reduced&&!lowEffects&&game.stageId===0){ctx.strokeStyle='#b1edfa33';ctx.lineWidth=.7;ctx.beginPath();for(let i=0;i<38;i++){const x=((i*117-t*155-cam*.85)%1010+1010)%1010,y=(i*59+t*510)%600-35;ctx.moveTo(x,y);ctx.lineTo(x-9,y+29);}ctx.stroke();}
    const vignette=ctx.createRadialGradient(480,270,190,480,270,560);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#0206128a');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);ctx.restore();
  }
function ui(){const p=game.player;$('hptext').textContent=p.hp+' / '+game.maxHp;$('health').style.width=p.hp/game.maxHp*100+'%';$('health').style.background=p.hp<game.maxHp*.3?'#f76491':'#7df8ec';$('dashbar').style.width=(1-p.dashCooldown/game.dashMax)*100+'%';$('dashlabel').textContent=p.dashCooldown>0?'ダッシュ充填中':'ダッシュ準備完了';$('stamina').style.width=p.stamina+'%';$('stamina-text').textContent=Math.floor(p.stamina);$('focusbar').style.width=p.focus+'%';$('focus-text').textContent=Math.floor(p.focus)+'%';$('ultimate-label').textContent=keyName(prefs.bindings.ultimate)+' / 終ノ一閃';$('ultimate-label').className=p.focus>=100?'ready-ultimate':'';$('shards-hud').textContent='記録片 '+game.profile.shards;$('score').textContent=String(game.score).padStart(6,'0');$('progress').firstElementChild.style.width=clamp(p.x/game.level.width*100,0,100)+'%';$('boss-hud').hidden=!(game.boss.active&&!game.boss.dead&&game.mode==='playing');$('boss-name').textContent=game.boss.name;$('bosshp').style.width=game.boss.hp/game.boss.maxHp*100+'%';$('bossphase').textContent='第'+game.boss.phase+'形態';if(ambient>toastEnd)$('toast').style.opacity='0';}
function loop(now){const dt=last?Math.min((now-last)/1000,.06):0;last=now;ambient+=dt;if(ready){pollGamepad();acc+=dt;while(acc>=1/60){rememberMotion();game.update(1/60,held);if(game.mode==='playing')motionSounds();acc-=1/60;}renderAlpha=game.mode==='playing'?acc*60:1;landPulse=Math.max(0,landPulse-dt);if(game.mode==='playing')hitFlashes=hitFlashes.filter(f=>(f.life-=dt)>0);if(bed)bed.gain.setTargetAtTime(!muted&&game.mode==='playing'?.025:0,audio.currentTime,.15);render(ambient);ui();}requestAnimationFrame(loop);}
async function loadImage(name,url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[name]=im;resolve(im);};im.onerror=()=>reject(new Error('素材を読み込めません: '+name));im.src=url;});}
async function boot(){try{
 await Promise.all(['hero','enemies','city','concept','subway','reactor','units'].map(n=>loadImage(n,'./assets/'+n+'.png')));
 frames=makeFrames(prepareAtlas(images.hero),HERO);enemyFrames=makeFrames(prepareAtlas(images.enemies),ENEMY);
 const atlas=prepareAtlas(images.units,'green'),sx=atlas.width/1536,sy=atlas.height/1024;
 const rects=[[132,40,300,430,290,461],[545,25,365,445,790,461],[1125,25,285,455,1265,470],[40,576,438,333,255,899],[537,511,465,455,770,955],[1142,502,355,495,1300,987]];
 unitFrames=rects.map(v=>({atlas,x:v[0]*sx,y:v[1]*sy,w:v[2]*sx,h:v[3]*sy,ax:(v[4]-v[0])*sx,ay:(v[5]-v[1])*sy,scale:1/sx}));
 const portrait=document.createElement('canvas');portrait.width=390;portrait.height=510;portrait.getContext('2d').drawImage(images.concept,12,91,389,508,0,0,390,510);$('title').querySelector('.title-portrait').replaceChildren(portrait);
 ready=true;$('start').disabled=false;$('start').innerHTML='新しい旅をはじめる <span>→</span>';renderKeys();showScreen('title');
}catch(err){$('start').textContent='再読み込み';$('start').disabled=false;$('start').onclick=()=>location.reload();say('素材の読み込みに失敗しました。再読み込みしてください。',10000);console.error(err);}}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'read_game_status',title:'ゲームの状態を確認',description:'Read chapter, health, stamina, focus, upgrades and boss state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Empty object required');return game.snapshot();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
boot();requestAnimationFrame(loop);
})();
