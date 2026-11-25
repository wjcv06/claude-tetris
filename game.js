'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  recordsOnLock(cleared);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  recordsOnGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  recordsOnInit();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (recordsBlockKeys(e)) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ===== RECORDS =====
const RECORDS_KEY = 'tetris.records';
const RECORDS_MAX = 5;
const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const recordsBox = document.getElementById('records-box');
const recordsEntry = document.getElementById('records-entry');
const recordsName = document.getElementById('records-name');
const recordsSave = document.getElementById('records-save');
const recordsNewMsg = document.getElementById('records-new-msg');
const recordsTable = document.getElementById('records-table');
const recordsStats = document.getElementById('records-stats');
const startTable = document.getElementById('start-records-table');
const startStats = document.getElementById('start-records-stats');

let combo = 0;
let records = loadRecords();
let pendingRecord = false;
let pendingScore = 0;
let pendingLines = 0;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!raw || !Array.isArray(raw.top)) return emptyRecords();
    return {
      top: raw.top
        .filter(t => t && typeof t.score === 'number')
        .map(t => ({ name: String(t.name || 'Anónimo').slice(0, 12), score: t.score, lines: t.lines | 0, date: t.date || '' }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RECORDS_MAX),
      bestCombo: Number(raw.bestCombo) || 0,
      maxLines: Number(raw.maxLines) || 0,
    };
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) { /* sin almacenamiento: los records solo duran la sesión */ }
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  return records.top.length < RECORDS_MAX || s > records.top[records.top.length - 1].score;
}

// Índice de inserción (empates: detrás de las existentes)
function insertIndex(s) {
  const i = records.top.findIndex(t => s > t.score);
  return i === -1 ? records.top.length : i;
}

function renderRecordsTable(table, highlightIdx, provisional) {
  const rows = records.top.slice();
  if (provisional) rows.splice(highlightIdx, 0, provisional);
  table.textContent = '';
  const head = table.createTHead().insertRow();
  ['#', 'Nombre', 'Puntos', 'Líneas'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  });
  const body = table.createTBody();
  if (!rows.length) {
    const td = body.insertRow().insertCell();
    td.colSpan = 4;
    td.className = 'records-empty';
    td.textContent = 'Sin records todavía';
    return;
  }
  rows.slice(0, RECORDS_MAX).forEach((t, i) => {
    const tr = body.insertRow();
    if (i === highlightIdx) tr.className = 'highlight';
    [i + 1, t.name, t.score.toLocaleString(), t.lines].forEach(v => {
      tr.insertCell().textContent = v;
    });
  });
}

function renderRecordsStats(el) {
  el.textContent = `Mejor combo: ${records.bestCombo} · Líneas máximas: ${records.maxLines}`;
}

function renderStartScreen() {
  renderRecordsTable(startTable, -1);
  renderRecordsStats(startStats);
}

function recordsOnLock(cleared) {
  if (cleared) {
    combo++;
    if (combo > records.bestCombo) {
      records.bestCombo = combo;
      saveRecords();
    }
  } else {
    combo = 0;
  }
}

function recordsOnInit() {
  submitRecord(); // si había un record sin nombrar, se guarda como 'Anónimo'
  pendingRecord = false;
  startOverlay.classList.add('hidden');
  recordsBox.classList.add('hidden');
}

function recordsOnGameOver() {
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();
  recordsBox.classList.remove('hidden');
  renderRecordsStats(recordsStats);
  if (qualifiesForTop(score)) {
    pendingRecord = true;
    pendingScore = score;
    pendingLines = lines;
    const idx = insertIndex(score);
    renderRecordsTable(recordsTable, idx, { name: '???', score, lines });
    recordsNewMsg.textContent = '¡Nuevo record! Escribe tu nombre';
    recordsEntry.classList.remove('hidden');
    recordsName.value = '';
    recordsName.focus();
  } else {
    recordsEntry.classList.add('hidden');
    renderRecordsTable(recordsTable, -1);
  }
}

function submitRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const name = recordsName.value.trim().slice(0, 12) || 'Anónimo';
  const idx = insertIndex(pendingScore);
  records.top.splice(idx, 0, { name, score: pendingScore, lines: pendingLines, date: new Date().toISOString() });
  records.top = records.top.slice(0, RECORDS_MAX);
  saveRecords();
  recordsEntry.classList.add('hidden');
  renderRecordsTable(recordsTable, idx);
  recordsName.blur();
}

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  records = emptyRecords();
  saveRecords();
  pendingRecord = false;
  recordsEntry.classList.add('hidden');
  renderStartScreen();
  renderRecordsTable(recordsTable, -1);
  renderRecordsStats(recordsStats);
}

// Devuelve true si el keydown no debe llegar al juego
function recordsBlockKeys(e) {
  if (e.target === recordsName) {
    if (e.code === 'Enter') submitRecord();
    return true;
  }
  return !startOverlay.classList.contains('hidden');
}

recordsSave.addEventListener('click', submitRecord);
playBtn.addEventListener('click', init);
document.querySelectorAll('.reset-records-btn').forEach(b => b.addEventListener('click', resetRecords));

renderStartScreen();
startOverlay.classList.remove('hidden');
// ===== FIN RECORDS =====
