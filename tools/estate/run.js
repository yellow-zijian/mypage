const H=require('./harness.js');
const rows=H.validate();
console.table(rows.map(r=>{const o={...r}; delete o.行けない部屋; o.NG=r.行けない部屋.join(','); return o;}));
for (let q=1;q<=5;q++){ const g=rows.filter(r=>r.q===q).sort((a,b)=>b.余裕-a.余裕); console.log('Q'+q, g.map(r=>r.id+':'+r.余裕).join('  '), ' gap=', (g[0].余裕-g[1].余裕).toFixed(1)); }
