/* Sudoku — PewPlay edition (vanilla JS, no dependencies) */
(function () {
  'use strict';

  var KEY_SAVE = 'sudoku:save';
  var KEY_BEST = 'sudoku:best';
  var KEY_DIFF = 'sudoku:difficulty';

  var DIFFS = {
    easy:   { name: 'Easy',   givens: 40 },
    medium: { name: 'Medium', givens: 33 },
    hard:   { name: 'Hard',   givens: 28 },
    expert: { name: 'Expert', givens: 24 }
  };

  /* ---------- storage helpers (never throw) ---------- */
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  /* ---------- geometry ---------- */
  var ROW = [], COL = [], BOX = [], PEERS = [];
  (function () {
    for (var i = 0; i < 81; i++) {
      ROW[i] = Math.floor(i / 9);
      COL[i] = i % 9;
      BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
    }
    for (i = 0; i < 81; i++) {
      PEERS[i] = [];
      for (var j = 0; j < 81; j++) {
        if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) PEERS[i].push(j);
      }
    }
  })();

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- generator / solver ---------- */
  function candidates(g, i) {
    var used = 0, p = PEERS[i];
    for (var k = 0; k < p.length; k++) if (g[p[k]]) used |= 1 << g[p[k]];
    return (~used) & 0x3FE; // bits 1..9
  }

  function fillGrid(g) {
    var best = -1, bestMask = 0, bestCount = 10;
    for (var i = 0; i < 81; i++) {
      if (g[i]) continue;
      var m = candidates(g, i), c = popcount(m);
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c === 0) return false; }
    }
    if (best < 0) return true;
    var digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (var d = 0; d < 9; d++) {
      if (bestMask & (1 << digits[d])) {
        g[best] = digits[d];
        if (fillGrid(g)) return true;
      }
    }
    g[best] = 0;
    return false;
  }

  function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }

  function countSolutions(g, limit) {
    var best = -1, bestMask = 0, bestCount = 10;
    for (var i = 0; i < 81; i++) {
      if (g[i]) continue;
      var m = candidates(g, i), c = popcount(m);
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c === 0) return 0; }
    }
    if (best < 0) return 1;
    var total = 0;
    for (var d = 1; d <= 9; d++) {
      if (bestMask & (1 << d)) {
        g[best] = d;
        total += countSolutions(g, limit - total);
        if (total >= limit) break;
      }
    }
    g[best] = 0;
    return total;
  }

  function carve(target) {
    var solution = new Array(81).fill(0);
    fillGrid(solution);
    var puzzle = solution.slice();
    var givens = 81, k, a, b, va, vb;
    // first pass: symmetric pairs (nicer looking boards)
    var order = shuffle(Array.from({ length: 41 }, function (_, i) { return i; }));
    for (k = 0; k < order.length && givens > target; k++) {
      a = order[k]; b = 80 - a; va = puzzle[a]; vb = puzzle[b];
      puzzle[a] = 0; puzzle[b] = 0;
      if (countSolutions(puzzle.slice(), 2) !== 1) { puzzle[a] = va; puzzle[b] = vb; }
      else givens -= (a === b ? 1 : 2);
    }
    // second pass: single cells, to reach harder targets
    order = shuffle(Array.from({ length: 81 }, function (_, i) { return i; }));
    for (k = 0; k < 81 && givens > target; k++) {
      a = order[k]; if (!puzzle[a]) continue;
      va = puzzle[a]; puzzle[a] = 0;
      if (countSolutions(puzzle.slice(), 2) !== 1) puzzle[a] = va; else givens--;
    }
    return { puzzle: puzzle, solution: solution, givens: givens };
  }

  function generate(diffKey) {
    var target = DIFFS[diffKey].givens, best = null;
    for (var tries = 0; tries < 8; tries++) {
      var g = carve(target);
      if (!best || g.givens < best.givens) best = g;
      if (best.givens <= target) break;
    }
    return best;
  }

  /* ---------- state ---------- */
  var S = null;          // current game
  var sel = -1;          // selected cell
  var notesMode = false;
  var undoStack = [];
  var lastTick = 0;

  function newGame(diffKey) {
    var g = generate(diffKey);
    S = {
      diff: diffKey,
      given: g.puzzle.map(function (v) { return v > 0; }),
      vals: g.puzzle.slice(),
      notes: new Array(81).fill(0),
      solution: g.solution,
      elapsed: 0,
      won: false
    };
    undoStack = [];
    sel = -1;
    for (var i = 0; i < 81; i++) if (!S.given[i]) { sel = i; break; }
    store(KEY_DIFF, diffKey);
    save();
    renderAll();
  }

  function save() { if (S) store(KEY_SAVE, S); }

  function restore() {
    var s = load(KEY_SAVE);
    if (!s || !s.vals || s.vals.length !== 81 || !DIFFS[s.diff]) return false;
    S = s;
    sel = -1;
    return true;
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), boardEl = $('board'), numsEl = $('nums');
  var cells = [], numBtns = [];

  function buildBoard() {
    var boxes = [];
    for (var b = 0; b < 9; b++) {
      var box = document.createElement('div');
      box.className = 'box';
      boardEl.appendChild(box);
      boxes.push(box);
    }
    // append cells in box order so each box holds its 3x3 cells
    var byBox = [[], [], [], [], [], [], [], [], []];
    for (var i = 0; i < 81; i++) byBox[BOX[i]].push(i);
    for (b = 0; b < 9; b++) {
      for (var k = 0; k < 9; k++) {
        var idx = byBox[b][k];
        var c = document.createElement('div');
        c.className = 'cell';
        c.dataset.i = idx;
        c.setAttribute('role', 'gridcell');
        var v = document.createElement('span');
        v.className = 'v';
        var n = document.createElement('div');
        n.className = 'notes';
        for (var d = 1; d <= 9; d++) {
          var s = document.createElement('span');
          s.textContent = d;
          n.appendChild(s);
        }
        c.appendChild(v);
        c.appendChild(n);
        boxes[b].appendChild(c);
        cells[idx] = c;
      }
    }
    for (var d2 = 1; d2 <= 9; d2++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn num';
      btn.dataset.n = d2;
      btn.innerHTML = '<span class="d">' + d2 + '</span><span class="left"></span>';
      numsEl.appendChild(btn);
      numBtns[d2] = btn;
    }
  }

  function conflicts() {
    var bad = new Array(81).fill(false);
    for (var i = 0; i < 81; i++) {
      var v = S.vals[i];
      if (!v) continue;
      var p = PEERS[i];
      for (var k = 0; k < p.length; k++) if (S.vals[p[k]] === v) { bad[i] = true; break; }
    }
    return bad;
  }

  function renderAll() {
    var bad = conflicts();
    var selVal = sel >= 0 ? S.vals[sel] : 0;
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var filled = 0;
    for (var i = 0; i < 81; i++) {
      var c = cells[i], v = S.vals[i];
      if (v) { filled++; if (!bad[i]) counts[v]++; }
      var cls = 'cell';
      if (S.given[i]) cls += ' given';
      else if (v) cls += ' user';
      if (bad[i]) cls += ' bad';
      if (sel >= 0) {
        if (i === sel) cls += ' sel';
        else if (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]) cls += ' peer';
        if (selVal && v === selVal && i !== sel) cls += ' same';
      }
      if (c.className !== cls) c.className = cls;
      var vs = c.firstChild;
      var txt = v ? String(v) : '';
      if (vs.textContent !== txt) vs.textContent = txt;
      var notes = v ? 0 : S.notes[i];
      if (c._notes !== notes || c._hl !== selVal) {
        c._notes = notes; c._hl = selVal;
        var ns = c.lastChild.children;
        for (var d = 1; d <= 9; d++) {
          var on = (notes >> d) & 1;
          ns[d - 1].className = on ? (d === selVal ? 'on hl' : 'on') : '';
        }
      }
    }
    for (var n = 1; n <= 9; n++) {
      var left = 9 - counts[n];
      numBtns[n].lastChild.textContent = left > 0 ? left : '';
      numBtns[n].classList.toggle('done', left <= 0);
      var noteOn = notesMode && sel >= 0 && !S.vals[sel] && ((S.notes[sel] >> n) & 1);
      numBtns[n].classList.toggle('noted', !!noteOn);
    }
    $('filled').textContent = filled + '/81';
    $('diffLabel').textContent = DIFFS[S.diff].name;
    $('notesBtn').classList.toggle('active', notesMode);
    $('notesBtn').setAttribute('aria-pressed', notesMode ? 'true' : 'false');
    $('notesState').textContent = notesMode ? 'On' : 'Off';
    app.classList.toggle('notes-mode', notesMode);
    $('undoBtn').disabled = undoStack.length === 0 || S.won;
    renderTime();
  }

  function fmt(sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function renderTime() { $('time').textContent = fmt(S.elapsed); }

  /* ---------- actions ---------- */
  function snapshot() { undoStack.push({ vals: S.vals.slice(), notes: S.notes.slice(), sel: sel }); if (undoStack.length > 300) undoStack.shift(); }

  function select(i) {
    if (i < 0 || i > 80) return;
    sel = i;
    renderAll();
  }

  function input(d) {
    if (!S || S.won || sel < 0 || S.given[sel]) return;
    if (notesMode) {
      snapshot();
      if (S.vals[sel]) { S.vals[sel] = 0; S.notes[sel] = 0; }
      S.notes[sel] ^= (1 << d);
    } else {
      snapshot();
      if (S.vals[sel] === d) {
        S.vals[sel] = 0;
      } else {
        S.vals[sel] = d;
        S.notes[sel] = 0;
        var clash = false, p = PEERS[sel];
        for (var k = 0; k < p.length; k++) if (S.vals[p[k]] === d) { clash = true; break; }
        if (!clash) for (k = 0; k < p.length; k++) S.notes[p[k]] &= ~(1 << d);
      }
    }
    afterChange();
  }

  function erase() {
    if (!S || S.won || sel < 0 || S.given[sel]) return;
    if (!S.vals[sel] && !S.notes[sel]) return;
    snapshot();
    S.vals[sel] = 0;
    S.notes[sel] = 0;
    afterChange();
  }

  function undo() {
    if (!S || S.won || !undoStack.length) return;
    var u = undoStack.pop();
    S.vals = u.vals; S.notes = u.notes; sel = u.sel;
    afterChange();
  }

  function toggleNotes() { notesMode = !notesMode; renderAll(); }

  function afterChange() {
    renderAll();
    checkWin();
    save();
  }

  function checkWin() {
    for (var i = 0; i < 81; i++) if (!S.vals[i]) return;
    var bad = conflicts();
    for (i = 0; i < 81; i++) if (bad[i]) return;
    S.won = true;
    var best = load(KEY_BEST) || {};
    var prev = best[S.diff];
    var isBest = !prev || S.elapsed < prev;
    if (isBest) { best[S.diff] = Math.floor(S.elapsed); store(KEY_BEST, best); }
    sel = -1;
    renderAll();
    app.classList.add('won');
    setTimeout(function () { showDialog('win', isBest, prev); }, 900);
  }

  /* ---------- dialog ---------- */
  var overlay = $('overlay');
  function showDialog(kind, isBest, prev) {
    var title = $('dlgTitle'), text = $('dlgText'), res = $('dlgResult'), close = $('dlgClose');
    var choices = overlay.querySelectorAll('.choice');
    for (var i = 0; i < choices.length; i++) choices[i].classList.toggle('current', choices[i].dataset.diff === S.diff);
    if (kind === 'win') {
      title.textContent = 'Puzzle solved!';
      text.textContent = 'Pick a difficulty for your next puzzle.';
      var best = load(KEY_BEST) || {};
      res.hidden = false;
      res.innerHTML =
        '<div><span>Difficulty</span><b>' + DIFFS[S.diff].name + '</b></div>' +
        '<div><span>Time</span><b>' + fmt(S.elapsed) + '</b></div>' +
        '<div><span>Best</span><b>' + (best[S.diff] != null ? fmt(best[S.diff]) : '–') + '</b></div>' +
        (isBest ? '<p class="newbest">' + (prev ? 'New best time!' : 'First win at this level!') + '</p>' : '');
      close.textContent = 'View Board';
    } else {
      title.textContent = 'New Game';
      var inProgress = !S.won && S.vals.some(function (v, i) { return v && !S.given[i]; });
      text.textContent = inProgress ? 'Choose a difficulty. Your current puzzle will be replaced.' : 'Choose a difficulty.';
      res.hidden = true;
      close.textContent = S.won ? 'Close' : 'Keep Playing';
    }
    overlay.hidden = false;
  }
  function hideDialog() { overlay.hidden = true; }

  overlay.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (t && t.dataset.diff) {
      hideDialog();
      app.classList.remove('won');
      notesMode = false;
      newGame(t.dataset.diff);
    } else if (t && t.id === 'dlgClose') {
      hideDialog();
    } else if (e.target === overlay) {
      hideDialog();
    }
  });

  /* ---------- input wiring ---------- */
  boardEl.addEventListener('pointerdown', function (e) {
    var c = e.target.closest('.cell');
    if (!c || !S) return;
    e.preventDefault();
    if (S.won) return;
    select(+c.dataset.i);
  });
  numsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.num');
    if (b) input(+b.dataset.n);
  });
  $('eraseBtn').addEventListener('click', erase);
  $('undoBtn').addEventListener('click', undo);
  $('notesBtn').addEventListener('click', toggleNotes);
  $('newBtn').addEventListener('click', function () { showDialog('new'); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    if (!S) return;
    if (!overlay.hidden) {
      if (e.key === 'Escape') { hideDialog(); e.preventDefault(); }
      return;
    }
    var k = e.key, code = e.code || '';
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { undo(); e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var digit = 0;
    var m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    if (m) digit = +m[1];
    else if (/^[0-9]$/.test(k)) digit = +k;
    else digit = -1;
    if (digit >= 1) {
      if (e.shiftKey) { var was = notesMode; notesMode = true; input(digit); notesMode = was; renderAll(); }
      else input(digit);
      e.preventDefault(); return;
    }
    if (digit === 0 || k === 'Backspace' || k === 'Delete') { erase(); e.preventDefault(); return; }
    var r = sel >= 0 ? ROW[sel] : 4, c = sel >= 0 ? COL[sel] : 4, moved = true;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') r = (r + 8) % 9;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') r = (r + 1) % 9;
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') c = (c + 8) % 9;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') c = (c + 1) % 9;
    else moved = false;
    if (moved) { if (!S.won) select(r * 9 + c); e.preventDefault(); return; }
    if (k === 'n' || k === 'N' || k === ' ') { toggleNotes(); e.preventDefault(); return; }
    if (k === 'Escape') { sel = -1; renderAll(); }
  });

  /* ---------- timer (pauses when hidden or a dialog is open) ---------- */
  function running() { return S && !S.won && overlay.hidden && document.visibilityState !== 'hidden'; }
  setInterval(function () {
    var now = performance.now();
    if (running() && lastTick) {
      var prevSec = Math.floor(S.elapsed);
      S.elapsed += Math.min(1, (now - lastTick) / 1000);
      if (Math.floor(S.elapsed) !== prevSec) {
        renderTime();
        if (Math.floor(S.elapsed) % 5 === 0) save();
      }
    }
    lastTick = now;
  }, 250);
  document.addEventListener('visibilitychange', function () { lastTick = performance.now(); if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);

  /* ---------- layout: make the board as large as possible ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function layout() {
    var cs = getComputedStyle(app);
    var W = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var gap = clamp(Math.min(W, H) * 0.02, 6, 16);

    // Tall: bar / board / numbers row / tools row
    var barT = W < 520 ? 44 : 52;
    var bT = Math.min(W, H);
    for (var it = 0; it < 4; it++) {
      var nh = clamp(bT / 9 * 1.15, 44, 84), th = clamp(bT / 9 * 0.75, 44, 60);
      bT = Math.min(W, H - barT - nh - th - gap * 3);
    }
    var thT = clamp(bT / 9 * 0.75, 44, 60);
    // use spare vertical space for taller number keys
    var nhT = clamp(H - barT - bT - thT - gap * 3, 44, 76);

    // Wide: board | side panel (bar on top, 3x3 pad, tools)
    var bW = H, sw = 0;
    for (it = 0; it < 4; it++) {
      sw = clamp(bW * 0.5, 210, 380);
      bW = Math.min(H, W - sw - gap);
    }
    sw = clamp(bW * 0.5, 210, 380);
    var barW = 3 * 40 + 2 * 6;
    var thW = clamp(bW / 9 * 0.75, 44, 60);
    var nhW = clamp(Math.min((sw - 2 * 8) / 3 * 0.85, (H - barW - thW - gap * 2 - 16) / 3), 40, 110);
    if (bW < 0) bW = 0;

    var wide = bW > bT * 1.04;
    var board = Math.floor(wide ? bW : bT);
    app.classList.toggle('wide', wide);
    app.classList.toggle('tall', !wide);
    var st = app.style;
    var toolCol = ((wide ? clamp(W - board - gap * 1.6, 180, 400) : board) - 16) / 3;
    app.classList.toggle('compact-tools', toolCol < 112);
    st.setProperty('--b', board + 'px');
    st.setProperty('--u', (board / 9).toFixed(2) + 'px');
    st.setProperty('--gap', gap.toFixed(1) + 'px');
    if (wide) {
      sw = Math.floor(clamp(W - board - gap * 1.6, 180, 400));
      st.setProperty('--sw', sw + 'px');
      nhW = clamp(Math.min((sw - 2 * 8) / 3 * 0.85, (H - barW - thW - gap * 2 - 16) / 3), 40, 110);
      st.setProperty('--nh', Math.floor(nhW) + 'px');
      st.setProperty('--th', Math.floor(thW) + 'px');
      st.setProperty('--bar', barW + 'px');
    } else {
      st.setProperty('--sw', board + 'px');
      st.setProperty('--nh', Math.floor(nhT) + 'px');
      st.setProperty('--th', Math.floor(thT) + 'px');
      st.setProperty('--bar', barT + 'px');
    }
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 120); });
  if (window.ResizeObserver) new ResizeObserver(layout).observe(app);

  /* ---------- boot ---------- */
  buildBoard();
  layout();
  if (restore()) {
    if (S.won) app.classList.add('won');
    for (var i = 0; i < 81; i++) if (!S.given[i] && !S.vals[i]) { sel = i; break; }
    renderAll();
  } else {
    var d = load(KEY_DIFF);
    newGame(DIFFS[d] ? d : 'medium');
  }
  lastTick = performance.now();

  // small hook used by automated screenshots/tests
  window.__sudoku = {
    state: function () { return S; },
    select: select, input: input,
    solveAllBut: function (n) {
      var empties = [];
      for (var i = 0; i < 81; i++) if (!S.given[i] && S.vals[i] !== S.solution[i]) empties.push(i);
      for (i = 0; i < empties.length - (n || 0); i++) { S.vals[empties[i]] = S.solution[empties[i]]; S.notes[empties[i]] = 0; }
      renderAll(); save();
      return empties.slice(empties.length - (n || 0));
    }
  };
})();
