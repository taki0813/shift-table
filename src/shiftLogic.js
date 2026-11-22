// 抹茶カフェ シフトメーカー：ロジック本体（画面なし・ブラウザでもNodeでも動く）
// 仕様は ロジック仕様.md を参照

export const ROLES = ['register', 'temae', 'milk', 'support'];
export const ROLE_LABEL = { register: 'レジ', temae: 'お点前', milk: 'ミルク', support: 'サポート' };
const FIXED_CAP = { register: 1, temae: 2, milk: 1 };
export const MIN_FLOOR = 4;
export const SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // 8:00〜18:00 の各1時間
const LUNCH_SLOTS = [11, 12, 13];
const EXTENDED_BREAK_SLOTS = [10, 14];

export const DEFAULT_WEIGHTS = {
  dev: 10, // 偏りコストの重み
  newRole: 40, // 未経験ボーナスの重み
  consec: { register: 30, temae: 60, milk: 30, support: 10 }, // 連続ペナルティ（sim/simulate.js の比較で決定）
  doubleBreakMinFloor: 5, // 2人同時休憩は、休憩後も現場にこの人数以上残るときだけ
  longShift: 5, // 割り当てコマがこの数以上の人は「長時間」
  mustRole: 500, // 長時間の人がレジ・お点前・ミルクを1回もやっていないときのペナルティ
  iterations: 3000, // 仕上げの入れ替え回数
  restarts: 5, // 最初から作り直して一番良いものを選ぶ回数
};

// ---------- 小道具 ----------

export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(h) {
  const hh = Math.floor(h);
  return `${hh}:${h - hh >= 0.5 ? '30' : '00'}`;
}

const capOf = (role, floor) => (role === 'support' ? floor - MIN_FLOOR : FIXED_CAP[role]);

// ---------- 段階0：前処理 ----------

export function workHours(s) {
  return s.end - s.start;
}

// 自動判定：6時間超 → あり／ちょうど6時間でお昼を挟む → あり
export function autoNeedsBreak(s) {
  const h = workHours(s);
  if (h > 6) return true;
  if (h === 6 && s.start < 11 && s.end > 14) return true;
  return false;
}

// 休憩スイッチを出す対象（6時間以上の人）
export function canTakeBreak(s) {
  return workHours(s) >= 6;
}

export function needsBreak(s) {
  if (!canTakeBreak(s)) return false;
  if (typeof s.breakOverride === 'boolean') return s.breakOverride; // 休憩スイッチで手動で切り替えた
  if (s.noBreak) return false; // 旧形式
  return autoNeedsBreak(s);
}

const inFull = (s, h) => s.start <= h && s.end >= h + 1;
const inHalf = (s, h) => s.start === h + 0.5 || s.end === h + 0.5;

// ---------- 段階1：休憩の配置 ----------

function placeBreaks(staff, w, warnings) {
  const breakers = staff.map((s, i) => i).filter((i) => needsBreak(staff[i]));
  const fullCount = Object.fromEntries(SLOTS.map((h) => [h, staff.filter((s) => inFull(s, h)).length]));

  // 各人の候補コマとそのコスト
  const options = breakers.map((i) => {
    const s = staff[i];
    const mine = SLOTS.filter((h) => inFull(s, h));
    const first = mine[0];
    const last = mine[mine.length - 1];
    const mid = (s.start + s.end) / 2;
    const cands = [...LUNCH_SLOTS, ...EXTENDED_BREAK_SLOTS]
      .filter((h) => inFull(s, h) && h !== first && h !== last)
      .map((h) => ({
        h,
        cost: (LUNCH_SLOTS.includes(h) ? 0 : 50) + Math.abs(h + 0.5 - mid) * 2,
      }));
    return { i, cands };
  });

  // 全通り試す（休憩対象は多くても数人なので一瞬）
  let best = { cost: Infinity, plan: [] };
  const used = new Map();
  const plan = [];
  function rec(k, cost) {
    if (cost >= best.cost) return;
    if (k === options.length) {
      best = { cost, plan: [...plan] };
      return;
    }
    const { i, cands } = options[k];
    for (const { h, cost: c } of cands) {
      const already = used.get(h) || 0;
      const floorAfter = fullCount[h] - already - 1;
      let pen;
      if (already === 0) pen = floorAfter < MIN_FLOOR ? 200 : 0; // 1人目
      else if (already === 1 && floorAfter >= w.doubleBreakMinFloor) pen = 20; // 2人目：現場に一定人数以上残るときだけ
      else continue;
      used.set(h, already + 1);
      plan.push({ i, h });
      rec(k + 1, cost + c + pen);
      plan.pop();
      used.set(h, already);
    }
    plan.push({ i, h: null }); // 入れられない
    rec(k + 1, cost + 1000);
    plan.pop();
  }
  rec(0, 0);

  const breakAt = new Map(); // staffIndex -> slot
  for (const h of SLOTS) {
    const names = best.plan.filter((p) => p.h === h).map((p) => staff[p.i].name);
    if (names.length >= 2) warnings.push(`${h}時は${names.join('さん・')}さんの2人同時休憩です（現場は${w.doubleBreakMinFloor}人以上残ります）`);
  }
  for (const { i, h } of best.plan) {
    if (h === null) warnings.push(`${staff[i].name}さんの休憩を10〜15時の枠に入れられませんでした`);
    else {
      breakAt.set(i, h);
      if (!LUNCH_SLOTS.includes(h)) warnings.push(`${staff[i].name}さんの休憩をお昼の枠（11〜14時）の外（${h}時）に入れました`);
    }
  }
  return breakAt;
}

// ---------- 段階2：役職の割り当て ----------

function buildFrame(staff, breakAt, warnings) {
  // 各コマの現場メンバー（1時間フルでいて、休憩中でない人）
  const floors = SLOTS.map((h) => staff.map((s, i) => i).filter((i) => inFull(staff[i], h) && breakAt.get(i) !== h));
  const active = floors.map((f) => f.length >= MIN_FLOOR);
  floors.forEach((f, t) => {
    if (!active[t]) warnings.push(`${SLOTS[t]}時のコマは現場が${f.length}人のため割り当てしていません`);
  });

  // 期待回数
  const expected = staff.map(() => Object.fromEntries(ROLES.map((r) => [r, 0])));
  floors.forEach((f, t) => {
    if (!active[t]) return;
    for (const i of f) for (const r of ROLES) expected[i][r] += capOf(r, f.length) / f.length;
  });

  // 割り当て可能なコマの残り数（未経験ボーナス用）
  const remaining = staff.map((_, i) => SLOTS.map((_, t) => floors.slice(t).filter((f, k) => active[t + k] && f.includes(i)).length));
  const activeCount = staff.map((_, i) => remaining[i][0]);
  return { floors, active, expected, remaining, activeCount };
}

// 長時間の人が必ず1回は経験すべき役職
const MUST_ROLES = ['register', 'temae', 'milk'];
function isMust(frame, w, i, r) {
  return MUST_ROLES.includes(r) && frame.activeCount[i] >= w.longShift;
}

// そのコマで考えられる割り当てを全部列挙（レジ1・お点前2・ミルク1・残りサポート）
function enumerateAssignments(f) {
  const out = [];
  const n = f.length;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      for (let c = b + 1; c < n; c++) {
        if (c === a) continue;
        for (let d = 0; d < n; d++) {
          if (d === a || d === b || d === c) continue;
          const roles = new Array(n).fill('support');
          roles[a] = 'register';
          roles[b] = 'temae';
          roles[c] = 'temae';
          roles[d] = 'milk';
          out.push(roles);
        }
      }
    }
  return out;
}

function greedy(staff, frame, w, rng) {
  const { floors, active, expected, remaining } = frame;
  const actual = staff.map(() => Object.fromEntries(ROLES.map((r) => [r, 0])));
  const assign = SLOTS.map(() => new Map()); // slot -> (staffIndex -> role)

  floors.forEach((f, t) => {
    if (!active[t]) return;
    const cost = (i, r) => {
      const d = expected[i][r] - actual[i][r];
      let c = w.dev * (1 - 2 * d);
      // 長時間の人の必須役職は、残り1〜2コマになったら強く優先する（それ以外は通常の未経験ボーナス）
      if (actual[i][r] === 0) c -= (isMust(frame, w, i, r) && remaining[i][t] <= 2 ? w.mustRole / 5 : w.newRole) / remaining[i][t];
      if (t > 0 && assign[t - 1].get(i) === r) c += w.consec[r];
      return c;
    };
    const table = f.map((i) => Object.fromEntries(ROLES.map((r) => [r, cost(i, r)])));
    let bestCost = Infinity;
    let bests = [];
    for (const roles of enumerateAssignments(f)) {
      let sum = 0;
      for (let k = 0; k < f.length; k++) sum += table[k][roles[k]];
      if (sum < bestCost - 1e-9) {
        bestCost = sum;
        bests = [roles];
      } else if (Math.abs(sum - bestCost) <= 1e-9) bests.push(roles);
    }
    const chosen = bests[Math.floor(rng() * bests.length)];
    f.forEach((i, k) => {
      assign[t].set(i, chosen[k]);
      actual[i][chosen[k]]++;
    });
  });
  return assign;
}

// 1日全体の評価（小さいほど良い）
function objective(staff, frame, assign, w) {
  const { expected } = frame;
  const actual = countActual(staff, assign);
  let obj = 0;
  staff.forEach((_, i) => {
    for (const r of ROLES) {
      const dev = actual[i][r] - expected[i][r];
      obj += w.dev * dev * dev;
      if (actual[i][r] === 0 && isMust(frame, w, i, r)) obj += w.mustRole;
      else if (actual[i][r] === 0 && expected[i][r] >= 0.5) obj += w.newRole;
    }
  });
  for (let t = 1; t < SLOTS.length; t++)
    for (const [i, r] of assign[t]) if (assign[t - 1].get(i) === r) obj += w.consec[r];
  return obj;
}

function countActual(staff, assign) {
  const actual = staff.map(() => Object.fromEntries(ROLES.map((r) => [r, 0])));
  for (const m of assign) for (const [i, r] of m) actual[i][r]++;
  return actual;
}

// 仕上げ：同じコマの2人の役職を入れ替えて、良くなれば採用
function improve(staff, frame, assign, w, rng) {
  let obj = objective(staff, frame, assign, w);
  const activeIdx = frame.active.map((a, t) => (a ? t : -1)).filter((t) => t >= 0);
  if (!activeIdx.length) return { assign, obj };
  for (let it = 0; it < w.iterations; it++) {
    const t = activeIdx[Math.floor(rng() * activeIdx.length)];
    const f = frame.floors[t];
    const x = f[Math.floor(rng() * f.length)];
    const y = f[Math.floor(rng() * f.length)];
    const rx = assign[t].get(x);
    const ry = assign[t].get(y);
    if (x === y || rx === ry) continue;
    assign[t].set(x, ry);
    assign[t].set(y, rx);
    const o = objective(staff, frame, assign, w);
    if (o <= obj) obj = o;
    else {
      assign[t].set(x, rx);
      assign[t].set(y, ry);
    }
  }
  return { assign, obj };
}

// ---------- メイン ----------

export function makeShift(staff, weights = DEFAULT_WEIGHTS, seed = Date.now()) {
  const w = { ...DEFAULT_WEIGHTS, ...weights, consec: { ...DEFAULT_WEIGHTS.consec, ...(weights.consec || {}) } };
  const rng = makeRng(seed);
  const warnings = [];
  const breakAt = placeBreaks(staff, w, warnings);
  const frame = buildFrame(staff, breakAt, warnings);

  let best = null;
  for (let k = 0; k < w.restarts; k++) {
    const res = improve(staff, frame, greedy(staff, frame, w, rng), w, rng);
    if (!best || res.obj < best.obj) best = res;
  }
  const actual = countActual(staff, best.assign);

  // 表示用の表（1行＝1人、7時〜18時）
  const hours = [7, ...SLOTS, 18];
  const table = staff.map((s, i) =>
    hours.map((h) => {
      if (h === 7) return s.start <= 7 ? 'オープン' : '';
      if (h === 18) return s.end > 18 ? 'クローズ' : '';
      if (breakAt.get(i) === h) return '休憩';
      const t = SLOTS.indexOf(h);
      if (best.assign[t].has(i)) return ROLE_LABEL[best.assign[t].get(i)];
      if (inFull(s, h)) return '（未割当）';
      if (inHalf(s, h)) return 'サポート(30分)';
      return '';
    })
  );

  return { hours, table, breakAt, expected: frame.expected, actual, warnings, objective: best.obj, assign: best.assign, frame };
}

// 結果の採点（シミュレーション用）
export function evaluate(staff, result) {
  const { expected, actual, assign, breakAt, warnings, frame } = result;
  let maxDev = 0;
  let over1 = 0;
  let missing = 0;
  let mustMissing = 0; // 長時間（5コマ以上）なのにレジ・お点前・ミルクのどれかが0回
  let missing4 = 0; // 4コマの人の未経験（レジ・お点前・ミルク）
  let supportMissingLong = 0; // 長時間なのにサポート0回（期待0.5回以上）
  staff.forEach((_, i) => {
    const k = frame.activeCount[i];
    for (const r of ROLES) {
      const dev = Math.abs(actual[i][r] - expected[i][r]);
      maxDev = Math.max(maxDev, dev);
      if (dev > 1 + 1e-9) over1++;
      if (actual[i][r] === 0 && expected[i][r] >= 0.5) missing++;
      if (actual[i][r] === 0 && MUST_ROLES.includes(r)) {
        if (k >= 5) mustMissing++;
        else if (k === 4) missing4++;
      }
      if (r === 'support' && k >= 5 && actual[i][r] === 0 && expected[i][r] >= 0.5) supportMissingLong++;
    }
  });
  let consecTemae = 0;
  let consecAny = 0;
  for (let t = 1; t < SLOTS.length; t++)
    for (const [i, r] of assign[t])
      if (assign[t - 1].get(i) === r) {
        consecAny++;
        if (r === 'temae') consecTemae++;
      }
  const breakOutside = [...breakAt.values()].filter((h) => !LUNCH_SLOTS.includes(h)).length;
  const breakMissing = staff.filter((s, i) => needsBreak(s) && !breakAt.has(i)).length;
  return { maxDev, over1, missing, mustMissing, missing4, supportMissingLong, consecTemae, consecAny, breakOutside, breakMissing, warnings: warnings.length };
}
