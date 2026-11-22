// 使い方: node sim/run.js private/2026-11-23.json [seed]
//         node sim/run.js private/2026-11-16_30.json 2026-11-23 [seed]   （複数日のファイルから1日を選ぶ）
// 1日分のシフトを作って、表と役職回数を表示する
import { readFileSync } from 'node:fs';
import { makeShift, evaluate, ROLES, ROLE_LABEL, fmtTime, needsBreak } from '../src/shiftLogic.js';

const args = process.argv.slice(2);
const data = JSON.parse(readFileSync(args[0], 'utf8'));
const staff = Array.isArray(data) ? data : data[args[1]];
const seedArg = Array.isArray(data) ? args[1] : args[2];
const seed = seedArg ? Number(seedArg) : 1;
const res = makeShift(staff, {}, seed);

const pad = (s, n) => {
  const width = [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - width));
};
const short = { オープン: 'OPEN', クローズ: 'CLOSE', レジ: 'レジ', お点前: '点前', ミルク: 'ミルク', サポート: 'サポ', 'サポート(30分)': 'サポ½', 休憩: '休憩', '（未割当）': '未割当' };

console.log('■ シフト表');
console.log(pad('', 8) + res.hours.map((h) => pad(`${h}時`, 7)).join(''));
staff.forEach((s, i) => console.log(pad(s.name, 8) + res.table[i].map((c) => pad(short[c] ?? (c || '・'), 7)).join('')));

console.log('\n■ 役職回数（実績 / 期待回数）');
console.log(pad('', 8) + pad('勤務', 14) + pad('休憩', 6) + ROLES.map((r) => pad(ROLE_LABEL[r], 14)).join(''));
staff.forEach((s, i) => {
  const cells = ROLES.map((r) => pad(`${res.actual[i][r]} / ${res.expected[i][r].toFixed(1)}`, 14));
  console.log(pad(s.name, 8) + pad(`${fmtTime(s.start)}-${fmtTime(s.end)}`, 14) + pad(needsBreak(s) ? 'あり' : 'なし', 6) + cells.join(''));
});

console.log('\n■ 警告');
console.log(res.warnings.length ? res.warnings.map((w) => '・' + w).join('\n') : '（なし）');

console.log('\n■ 採点');
console.log(evaluate(staff, res));
