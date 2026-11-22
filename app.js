import { makeShift, needsBreak, canTakeBreak, workHours, fmtTime, ROLES, ROLE_LABEL, SLOTS } from './src/shiftLogic.js';

const STORAGE_KEY = 'shift-maker:v1';
const TIMES = [];
for (let h = 7; h <= 19; h += 0.5) TIMES.push(h);

// 架空のサンプル（実在の人のデータは入れない）
const SAMPLE = [
  { name: 'スタッフA', start: 7, end: 13 },
  { name: 'スタッフB', start: 7, end: 13 },
  { name: 'スタッフC', start: 8, end: 18 },
  { name: 'スタッフD', start: 8, end: 17 },
  { name: 'スタッフE', start: 8.5, end: 14.5 },
  { name: 'スタッフF', start: 11, end: 17 },
  { name: 'スタッフG', start: 13, end: 19 },
  { name: 'スタッフH', start: 14, end: 19 },
  { name: 'スタッフI', start: 15.5, end: 19 },
];

const $ = (id) => document.getElementById(id);
const els = {
  date: $('date'),
  list: $('staff-list'),
  add: $('add'),
  sample: $('sample'),
  clear: $('clear'),
  make: $('make'),
  remake: $('remake'),
  error: $('input-error'),
  result: $('result'),
  resultTitle: $('result-title'),
  warnings: $('warnings'),
  shift: $('shift'),
  counts: $('counts'),
  print: $('print'),
  empty: $('empty'),
  dateLabel: $('date-label'),
  staffCount: $('staff-count'),
};

let state = load() ?? { date: todayStr(), staff: [] };
let seed = 1;
let shown = false; // 一度シフトを作ったら、入力を変えるたびに自動で作り直す

// ---------- 保存 ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.staff)) return s;
  } catch {}
  return null;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateText(str) {
  const d = str ? new Date(str + 'T00:00') : null;
  if (!d || isNaN(d)) return '日付を選択';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}
function renderDate() {
  els.dateLabel.textContent = dateText(state.date);
  document.title = state.date ? `シフト表 ${dateText(state.date)}` : 'シフト表';
}

// ---------- 入力欄 ----------
function timeSelect(value, cls, label) {
  const sel = document.createElement('select');
  sel.className = cls;
  sel.setAttribute('aria-label', label);
  for (const t of TIMES) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = fmtTime(t);
    if (t === value) o.selected = true;
    sel.append(o);
  }
  return sel;
}

function renderStaff() {
  els.list.replaceChildren();
  state.staff.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'staff-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'name';
    name.placeholder = '名前';
    name.value = s.name;
    name.setAttribute('aria-label', '名前');
    name.addEventListener('input', () => {
      s.name = name.value;
      changed(false);
    });

    const start = timeSelect(s.start, 'start', '出勤');
    const end = timeSelect(s.end, 'end', '退勤');
    start.addEventListener('change', () => {
      s.start = Number(start.value);
      changed(true);
    });
    end.addEventListener('change', () => {
      s.end = Number(end.value);
      changed(true);
    });

    const hours = document.createElement('span');
    const h = workHours(s);
    hours.className = 'hours' + (h <= 0 ? ' bad' : '');
    hours.textContent = h > 0 ? `${h}h` : '—';

    let brk;
    if (canTakeBreak(s)) {
      brk = document.createElement('button');
      brk.type = 'button';
      brk.className = 'brk switch';
      const on = needsBreak(s);
      brk.setAttribute('role', 'switch');
      brk.setAttribute('aria-checked', String(on));
      brk.setAttribute('aria-label', `${s.name || 'このスタッフ'}の休憩（60分）`);
      brk.title = on ? '休憩あり（60分）。押すと休憩なしにします' : '休憩なし。押すと休憩ありにします';
      brk.addEventListener('click', () => {
        s.breakOverride = !on;
        delete s.noBreak;
        changed(true);
      });
    } else {
      brk = document.createElement('span');
      brk.className = 'brk break-none';
      brk.textContent = '—';
      brk.title = '6時間未満なので休憩はありません';
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${s.name || 'このスタッフ'}を削除`);
    remove.addEventListener('click', () => {
      state.staff.splice(idx, 1);
      changed(true);
    });

    row.append(name, start, end, hours, brk, remove);
    els.list.append(row);
  });
  els.staffCount.textContent = state.staff.length ? `${state.staff.length}人` : '';
}

// rerenderInputs: 入力欄を描き直すか（名前入力中はフォーカスが外れないよう描き直さない）
function changed(rerenderInputs) {
  save();
  if (rerenderInputs) renderStaff();
  if (shown) generate();
}

// ---------- シフト作成 ----------
function validate() {
  const staff = state.staff;
  if (!staff.length) return 'スタッフを入力してください';
  const noName = staff.findIndex((s) => !s.name.trim());
  if (noName >= 0) return `${noName + 1}行目の名前が空です`;
  const bad = staff.find((s) => s.end <= s.start);
  if (bad) return `${bad.name}さんの退勤が出勤より前になっています`;
  const names = staff.map((s) => s.name.trim());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return `「${dup}」が2人います。名前を区別してください`;
  return '';
}

function generate() {
  const err = validate();
  els.error.textContent = err;
  if (err) {
    els.result.hidden = true;
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;
  // 表は出勤の早い順に並べる
  const staff = [...state.staff]
    .map((s) => ({ ...s, name: s.name.trim() }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const res = makeShift(staff, {}, seed);
  renderResult(staff, res);
  els.result.hidden = false;
  els.remake.hidden = false;
  shown = true;
}

const CELL_CLASS = {
  レジ: 'role-register',
  お点前: 'role-temae',
  ミルク: 'role-milk',
  サポート: 'role-support',
  'サポート(30分)': 'role-support-half',
  休憩: 'role-break',
  オープン: 'oc',
  クローズ: 'oc',
  '（未割当）': 'role-unassigned',
};
const CELL_TEXT = { 'サポート(30分)': 'サポート\n30分', '（未割当）': '—' };

function renderResult(staff, res) {
  els.resultTitle.textContent = 'シフト表';

  // 警告
  els.warnings.replaceChildren(
    ...res.warnings.map((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      return li;
    })
  );

  // シフト表
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(th('', 'name'), ...res.hours.map((h) => th(`${h}時`)));
  thead.append(hr);

  const tbody = document.createElement('tbody');
  staff.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.append(th(s.name, 'name'));
    for (const c of res.table[i]) {
      const td = document.createElement('td');
      td.textContent = CELL_TEXT[c] ?? c;
      if (CELL_CLASS[c]) td.className = CELL_CLASS[c];
      tr.append(td);
    }
    tbody.append(tr);
  });

  const tfoot = document.createElement('tfoot');
  const fr = document.createElement('tr');
  fr.append(th('現場の人数', 'name'));
  for (const h of res.hours) {
    const td = document.createElement('td');
    const t = SLOTS.indexOf(h);
    if (t >= 0) {
      const n = res.frame.floors[t].length;
      td.textContent = `${n}人`;
      if (n < 4) td.className = 'low';
    }
    fr.append(td);
  }
  tfoot.append(fr);
  els.shift.replaceChildren(thead, tbody, tfoot);

  // 役職の回数
  const ch = document.createElement('thead');
  const chr = document.createElement('tr');
  chr.append(th('', 'name'), th('勤務'), th('休憩'), ...ROLES.map((r) => th(ROLE_LABEL[r])));
  ch.append(chr);
  const cb = document.createElement('tbody');
  staff.forEach((s, i) => {
    const tr = document.createElement('tr');
    const workCell = td(`${fmtTime(s.start)}〜${fmtTime(s.end)}`);
    const breakCell = td(res.breakAt.has(i) ? `${res.breakAt.get(i)}時〜` : needsBreak(s) ? '入らず' : '—');
    workCell.className = breakCell.className = 'sub';
    tr.append(th(s.name, 'name'), workCell, breakCell);
    for (const r of ROLES) {
      const a = res.actual[i][r];
      const e = res.expected[i][r];
      const cell = td(`${a} / ${e.toFixed(1)}`);
      if (Math.abs(a - e) > 1) cell.className = 'over';
      else if (a === 0 && r !== 'support' && res.frame.activeCount[i] >= 5) cell.className = 'zero-must';
      tr.append(cell);
    }
    cb.append(tr);
  });
  els.counts.replaceChildren(ch, cb);
}

function th(text, cls) {
  const el = document.createElement('th');
  el.textContent = text;
  if (cls) el.className = cls;
  if (cls === 'name') el.scope = 'row';
  return el;
}
function td(text) {
  const el = document.createElement('td');
  el.textContent = text;
  return el;
}

// ---------- ボタン ----------
els.date.value = state.date || todayStr();
els.date.addEventListener('change', () => {
  state.date = els.date.value;
  renderDate();
  changed(false);
});
els.add.addEventListener('click', () => {
  const last = state.staff[state.staff.length - 1];
  state.staff.push({ name: '', start: last ? last.start : 8, end: last ? last.end : 17 });
  changed(true);
  const inputs = els.list.querySelectorAll('input.name');
  inputs[inputs.length - 1]?.focus();
});
els.sample.addEventListener('click', () => {
  if (state.staff.length && !confirm('今の入力をサンプルに置き換えますか？')) return;
  state.staff = SAMPLE.map((s) => ({ ...s }));
  changed(true);
});
els.clear.addEventListener('click', () => {
  if (!state.staff.length || !confirm('スタッフを全部消しますか？')) return;
  state.staff = [];
  shown = false;
  els.result.hidden = true;
  els.empty.hidden = false;
  els.remake.hidden = true;
  changed(true);
});
els.make.addEventListener('click', () => {
  seed = 1;
  generate();
  if (!els.result.hidden) els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
els.remake.addEventListener('click', () => {
  seed = Math.floor(Math.random() * 1e9);
  generate();
});
els.print.addEventListener('click', () => window.print());

renderDate();
renderStaff();
