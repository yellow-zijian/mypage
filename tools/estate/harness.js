// estate.html から純粋ロジック(@@PURE-BEGIN 〜 @@PURE-END)を抜き出して Node で回す
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('/Users/huangzijian/Desktop/5.project/mypage/pages/estate.html', 'utf8');
const re = /\/\* @@PURE-BEGIN[^*]*\*\/([\s\S]*?)\/\* @@PURE-END[^*]*\*\//g;
let code = '', m;
while ((m = re.exec(html))) code += m[1] + '\n';
if (!code) throw new Error('no PURE blocks');
const fn = new Function(code + `\nreturn { PLANS, DEFS, simulate, validate, findPath, buildGrid, SIM, DOOR, EXIT, canSee, visPoly, makePlan };`);
module.exports = fn();
