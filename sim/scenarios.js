// ランダムなシフトのパターンを作る（実データは使わない）
import { makeRng, SLOTS } from '../src/shiftLogic.js';

let rng = makeRng(42);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// 4〜6人程度が同時にいる、ありがちな1日を作る
function genScenario(id) {
  for (;;) {
    const staff = [];
    for (let guard = 0; guard < 40; guard++) {
      const lacking = SLOTS.filter((h) => staff.filter((s) => s.start <= h && s.end >= h + 1).length < 4);
      if (!lacking.length) break;
      const h = pick(lacking);
      const len = pick([3.5, 4, 5, 5.5, 6, 6, 6, 7, 8, 9, 10]);
      let start = h - Math.floor(rng() * (len - 1) * 2) / 2;
      start = Math.min(Math.max(start, 7), 19 - len);
      if (rng() < 0.75) start = Math.round(start); // 基本は00分
      staff.push({ name: `S${id}-${staff.length + 1}`, start, end: start + len, noBreak: rng() < 0.1 });
    }
    const maxConc = Math.max(...SLOTS.map((h) => staff.filter((s) => s.start <= h && s.end >= h + 1).length));
    if (maxConc <= 7) return staff;
  }
}

export function genScenarios(n, seed = 42) {
  rng = makeRng(seed);
  return Array.from({ length: n }, (_, k) => genScenario(k));
}
