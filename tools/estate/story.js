// 各間取りの出来事を時系列で出す(演出の合理性チェック用)
const H=require('./harness.js');
const N=['歩く','見回す','扉を開ける','扉を壊す','鍵/閉める','出口を使う','寝ている','立つ'];
const ids=process.argv.slice(2);
for (const p of H.PLANS){ if(ids.length && !ids.includes(p.id)) continue;
  const r=H.simulate(p);
  console.log(`\n=== ${p.id} ${p.name}  ${r.reason} ${r.escVia} t=${r.tIn.toFixed(1)} margin=${r.margin.toFixed(1)} seen=${r.tSeen===Infinity?'-':r.tSeen.toFixed(1)}`);
  const ev=[];
  for (const [t,i,st] of r.events){ const d=p.DOORS[i]; ev.push([t,`扉${i}(${d.kind}${d.lock?'鍵':''}@${d.mx.toFixed(1)},${d.my.toFixed(1)}) → ${st}`]); }
  for (const [t,x,y,k] of r.noises) ev.push([t,`音 ${k} @${x.toFixed(1)},${y.toFixed(1)}`]);
  let pa=-1,pb=-1;
  r.frames.forEach((f,i)=>{ const t=i*0.08; if(f[7]!==pa){ev.push([t,`A ${N[f[7]]} @${f[0].toFixed(1)},${f[1].toFixed(1)}`]);pa=f[7];} if(f[8]!==pb){ev.push([t,`B ${N[f[8]]} @${f[2].toFixed(1)},${f[3].toFixed(1)}`]);pb=f[8];} if(f[4]&&(i===0||!r.frames[i-1][4])) ev.push([t,'A が B を見つけた']); });
  ev.sort((a,b)=>a[0]-b[0]);
  for (const [t,m] of ev) console.log(t.toFixed(1).padStart(5), m);
}
