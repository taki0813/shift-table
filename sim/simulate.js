// 使い方: node sim/simulate.js [パターン数]
// ランダムなシフトを大量に作り、重みの組み合わせごとに結果を採点して比べる（実データは使わない）
import { makeShift, evaluate } from '../src/shiftLogic.js';
import { genScenarios } from './scenarios.js';

const N = Number(process.argv[2] || 200);
const scenarios = genScenarios(N);

const grid = [];
for (const dev of [5, 10, 20])
  for (const temae of [15, 30, 60])
    for (const newRole of [10, 20, 40])
      grid.push({ dev, newRole, consec: { register: temae / 2, temae, milk: temae / 2, support: temae / 6 } });

const rows = grid.map((w) => {
  const sum = { maxDev: 0, over1: 0, missing: 0, consecTemae: 0, consecAny: 0, perfect: 0 };
  scenarios.forEach((staff, k) => {
    const e = evaluate(staff, makeShift(staff, { ...w, iterations: 1500, restarts: 3 }, 1000 + k));
    sum.maxDev += e.maxDev;
    sum.over1 += e.over1;
    sum.missing += e.missing;
    sum.consecTemae += e.consecTemae;
    sum.consecAny += e.consecAny;
    if (e.over1 === 0 && e.missing === 0 && e.consecTemae === 0) sum.perfect++;
  });
  return { w, sum };
});

rows.sort((a, b) => b.sum.perfect - a.sum.perfect || a.sum.maxDev - b.sum.maxDev);
console.log(`パターン数: ${N}\n`);
console.log('偏り 点前連続 未経験 | 合格率  最大ズレ平均  ±1超え/日  未経験/日  点前連続/日  連続(全)/日');
for (const { w, sum } of rows) {
  const f = (x) => (x / N).toFixed(2).padStart(6);
  console.log(
    `${String(w.dev).padStart(4)} ${String(w.consec.temae).padStart(8)} ${String(w.newRole).padStart(6)} | ${((sum.perfect / N) * 100).toFixed(0).padStart(4)}%  ${f(sum.maxDev)}        ${f(sum.over1)}     ${f(sum.missing)}     ${f(sum.consecTemae)}       ${f(sum.consecAny)}`
  );
}
