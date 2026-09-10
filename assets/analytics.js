/* 訪問者の集計(GoatCounter)。Cookie なし・個人の特定なし。
   ★ SITE に GoatCounter のサイト名(例: huangzijian → https://huangzijian.goatcounter.com)を入れると数え始める。
   空のままなら何もしない。手元(localhost)の確認は数えない。
   出来事を数えたい所では window.__count('名前') を呼ぶ(集計画面に event/名前 として出る) */
(() => {
  const SITE = '';
  window.__count = () => {};
  if (!SITE || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  if (new URLSearchParams(location.search).has('embed')) return;   // 埋め込み(部屋・テレビ)は親で数えるので二重にしない
  window.goatcounter = { path: location.pathname.replace(/\/index\.html$/, '/') };   // ?reveal=1 などの違いで分かれないように
  const s = document.createElement('script');
  s.async = true; s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', `https://${SITE}.goatcounter.com/count`);
  document.head.appendChild(s);
  window.__count = (name) => { try { window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path: 'event/' + name, title: name, event: true }); } catch (e) {} };
})();
