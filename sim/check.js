// 使い方: node sim/check.js [パターン数]
// 標準の重みで、ランダムなシフトを採点して集計する（実データは使わない）
import { makeShift, evaluate } from '../src/shiftLogic.js';
import { genScenarios } from './scenarios.js';

const N = Number(process.argv[2] || 200);
const keys = ['mustMissing', 'missing4', 'supportMissingLong', 'over1', 'consecTemae', 'consecAny', 'breakOutside', 'breakMissing'];
const label = {
  mustMissing: '長時間(5コマ以上)なのにレジ/点前/ミルク未経験',
  missing4: '4コマの人のレジ/点前/ミルク未経験',
  supportMissingLong: '長時間なのにサポート未経験',
  over1: '期待回数との差が1回を超えた',
  consecTemae: 'お点前の連続',
  consecAny: '同じ役職の連続（全役職）',
  breakOutside: '休憩がお昼枠の外',
  breakMissing: '休憩を入れられなかった',
};
const sum = Object.fromEntries(keys.map((k) => [k, 0]));
const days = Object.fromEntries(keys.map((k) => [k, 0]));
let maxDev = 0;
const t0 = Date.now();
genScenarios(N).forEach((staff, k) => {
  const e = evaluate(staff, makeShift(staff, {}, 1000 + k));
  maxDev += e.maxDev;
  for (const key of keys) {
    sum[key] += e[key];
    if (e[key] > 0) days[key]++;
  }
});
console.log(`パターン数 ${N}（1日あたり平均 ${((Date.now() - t0) / N).toFixed(0)}ms）\n`);
for (const k of keys) console.log(`${label[k].padEnd(28, '　')} 発生した日 ${String(days[k]).padStart(3)}日（${((days[k] / N) * 100).toFixed(0)}%）  合計 ${sum[k]}件`);
console.log(`\n最大ズレの平均 ${(maxDev / N).toFixed(2)}回`);
