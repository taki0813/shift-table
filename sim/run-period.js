// 使い方: node sim/run-period.js private/2026-11-16_30.json
// 複数日のシフトをまとめて作り、日ごとの採点と警告を一覧にする
import { readFileSync } from 'node:fs';
import { makeShift, evaluate, SLOTS, needsBreak } from '../src/shiftLogic.js';

const days = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tot = { mustMissing: 0, missing4: 0, over1: 0, consecTemae: 0, consecAny: 0 };
for (const [date, staff] of Object.entries(days)) {
  const res = makeShift(staff, {}, 1);
  const e = evaluate(staff, res);
  for (const k of Object.keys(tot)) tot[k] += e[k];
  const floor = SLOTS.map((h, t) => res.frame.floors[t].length).join(' ');
  const breakers = staff.filter(needsBreak).map((s) => s.name).join('・') || 'なし';
  console.log(`\n■ ${date}（${staff.length}人） 現場人数 8〜17時: ${floor}   休憩: ${breakers}`);
  console.log(`  最大ズレ ${e.maxDev.toFixed(2)} / ±1超え ${e.over1} / 長時間の未経験 ${e.mustMissing} / 4コマの未経験 ${e.missing4} / お点前連続 ${e.consecTemae} / 連続(全) ${e.consecAny}`);
  for (const w of res.warnings) console.log('  ⚠ ' + w);
}
console.log('\n■ 15日合計', tot);
