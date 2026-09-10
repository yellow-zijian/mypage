/* Campaign content is separated from simulation so new stages can be authored safely. */
(function(root){
  'use strict';
  const ground=(x,w)=>({x,y:460,w,h:110});
  const ledge=(x,y,w=210,moving=0)=>({x,y,baseY:y,w,h:20,oneway:true,moving});
  const unit=(type,x,y)=>({type,x,...(y==null?{}:{y})});
  const pickup=(type,x,y=420)=>({type,x,y});
  const STAGES=[
    {id:0,title:'雨の境界',subtitle:'企業警備線を突破し、地下への経路を開け。',scene:'city',color:'#7df8ec',width:6200,
      zones:['雨の裏路地','封鎖高架','黒鉄の屋上'],boss:{name:'機動警備・黒鉄',type:'kurogane',hp:680,x:5760,arena:4880,trigger:5050},
      intro:'記録の所在は地下の幹線施設。まずは屋上の警備網を落とす。',ending:'黒鉄、機能停止。奪われた記録の信号は、地下へ続いている。',
      platforms:[ground(0,1050),ground(1200,980),ground(2320,1030),ground(3500,1150),ground(4770,1430),ledge(580,355),ledge(1480,350,240),ledge(1930,355,190),ledge(2500,350,240),ledge(2800,280,240),ledge(3770,350,260),ledge(4140,300,230)],
      checkpoints:[{x:2040,y:460,id:1},{x:4530,y:460,id:2}],
      encounters:[{left:1240,right:1970,trigger:1310,enemyXs:[1390,1620,1830]}],
      enemies:[unit('guard',600),unit('guard',880),unit('guard',1390),unit('shield',1620),unit('gunner',1830),unit('drone',2500,285),unit('guard',2670),unit('charger',3040),unit('drone',3190,300),unit('shield',3680),unit('guard',3930),unit('turret',4180),unit('drone',4380,290)],
      pickups:[pickup('health',690,325),pickup('data',1590,320),pickup('health',2870,250),pickup('data',2990,250),pickup('health',3900,320),pickup('data',4240,270)],
      hazards:[]},
    {id:1,title:'残響の地下鉄',subtitle:'通電する保守路を抜け、追跡機「鳴神」を止めろ。',scene:'subway',color:'#ffd18a',width:6800,
      zones:['廃駅の保守路','送電封鎖区','幹線終端'],boss:{name:'幹線制圧機・鳴神',type:'narukami',hp:840,x:6310,arena:5540,trigger:5700},
      intro:'地下の記録庫へ続く送電路。警備機は侵入者の位置を追い続ける。',ending:'追跡信号、消失。記録庫の鍵を入手した。残るは中枢炉。',
      platforms:[ground(0,1280),ground(1420,1480),ground(3040,1430),ground(4620,2180),ledge(550,350,220),ledge(1010,300,180,35),ledge(1740,340,240),ledge(2140,275,250),ledge(3220,350,250),ledge(3610,285,250,35),ledge(4080,330,230),ledge(4900,340,250)],
      checkpoints:[{x:2710,y:460,id:1},{x:5350,y:460,id:2}],
      encounters:[{left:1600,right:2570,trigger:1670,enemyXs:[1800,2040,2350,2490]}],
      enemies:[unit('gunner',500),unit('charger',880),unit('drone',1110,280),unit('shield',1800),unit('gunner',2040),unit('charger',2350),unit('drone',2490,290),unit('turret',3190),unit('guard',3440),unit('drone',3760,270),unit('gunner',3970),unit('shield',4260),unit('charger',4710),unit('turret',4960),unit('drone',5180,280)],
      pickups:[pickup('data',640,320),pickup('health',1070,265),pickup('data',2240,245),pickup('health',3310,320),pickup('data',3690,250),pickup('health',5020,310)],
      hazards:[{x:3500,y:425,w:90,h:35,period:3.6,offset:0,on:1.2},{x:4070,y:425,w:90,h:35,period:4,offset:1.3,on:1.1},{x:5060,y:425,w:85,h:35,period:3.5,offset:.5,on:1}]},
    {id:2,title:'夜明けの中枢炉',subtitle:'中枢炉の防衛を崩し、記録を街へ解き放て。',scene:'reactor',color:'#ff906c',width:7200,
      zones:['炉心外郭','防衛中枢','黎明の玉座'],boss:{name:'中枢執行者・黎明',type:'reimei',hp:1120,x:6700,arena:5880,trigger:6050},
      intro:'街の記憶を支配する中枢炉。ここで記録を解放すれば、真実は消せない。',ending:'記録は、街へ還った。雨雲の向こうに、朝が見える。',
      platforms:[ground(0,1600),ground(1740,1460),ground(3340,1600),ground(5080,2120),ledge(580,355,230),ledge(1140,290,230),ledge(1910,350,230),ledge(2290,285,260),ledge(2730,335,230),ledge(3470,350,250),ledge(3920,280,260,40),ledge(4480,320,240),ledge(5400,340,250)],
      checkpoints:[{x:3060,y:460,id:1},{x:5660,y:460,id:2}],
      encounters:[{left:1870,right:2980,trigger:1940,enemyXs:[2050,2290,2530,2790,2880]}],
      enemies:[unit('shield',480),unit('gunner',750),unit('charger',1100),unit('drone',1430,285),unit('shield',2050),unit('gunner',2290),unit('charger',2530),unit('turret',2790),unit('drone',2880,280),unit('charger',3440),unit('shield',3700),unit('drone',3980,270),unit('gunner',4220),unit('turret',4590),unit('charger',5170),unit('shield',5460)],
      pickups:[pickup('health',660,325),pickup('data',1240,260),pickup('data',2400,255),pickup('health',2820,305),pickup('data',4010,245),pickup('health',4600,290),pickup('data',5520,310)],
      hazards:[{x:820,y:425,w:90,h:35,period:3.8,offset:.8,on:1.2},{x:3530,y:425,w:95,h:35,period:3.6,offset:0,on:1.3},{x:4320,y:425,w:100,h:35,period:3.8,offset:1.5,on:1.1},{x:5300,y:425,w:80,h:35,period:3.7,offset:1,on:1.2}]}];
  const ENEMIES={
    guard:{name:'刀兵',hp:60,w:32,h:64,speed:85,damage:15,score:250,hint:'赤い予兆に合わせて弾く。'},
    drone:{name:'追尾ドローン',hp:42,w:46,h:30,speed:0,damage:12,score:300,hint:'二段ジャンプで接近。弾は弾き返せる。'},
    shield:{name:'防盾兵',hp:110,w:42,h:68,speed:55,damage:20,score:400,hint:'正面は防御される。強攻撃か背後から崩す。'},
    gunner:{name:'狙撃兵',hp:64,w:32,h:64,speed:65,damage:16,score:350,hint:'射線を見て回避。接近戦が有効。'},
    charger:{name:'突撃兵',hp:78,w:32,h:64,speed:125,damage:18,score:400,hint:'突進を弾いて、長い隙を狙う。'},
    turret:{name:'固定砲台',hp:95,w:54,h:42,speed:0,damage:12,score:350,hint:'三連射の隙に接近。強攻撃でまとめて削る。'}
  };
  const DIFFICULTIES={story:{name:'物語',damage:.55,enemyHP:.8,parry:.26},standard:{name:'標準',damage:1,enemyHP:1,parry:.18},expert:{name:'修羅',damage:1.35,enemyHP:1.15,parry:.13}};
  const UPGRADES={blade:{name:'刃の増幅',description:'刀と必殺技の威力 +12%',cost:2,max:3},vital:{name:'義体補強',description:'最大体力 +20',cost:2,max:3},flow:{name:'循環駆動',description:'気力回復 +20%・ダッシュ短縮',cost:2,max:3}};
  root.RoninContent={STAGES,ENEMIES,DIFFICULTIES,UPGRADES};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.RoninContent;
})(typeof window!=='undefined'?window:globalThis);
