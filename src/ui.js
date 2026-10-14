// Browser UI: draws the board, handles clicks, and talks to the engine worker.
import { fromFen, toFen, START_FEN, legalMoves, makeMove, inCheck, kingSquare, toSan, gameResult, positionKey, colorOf } from './engine.js';
import { gameReport } from './coach.js';

const $ = (id) => document.getElementById(id);
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };   // solid glyphs, colored with CSS
const glyph = (p) => GLYPH[p.toUpperCase()] + '︎';              // ︎ = show as text, not emoji

// ---- Worker: request/response with promises ----
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let nextId = 0;
const pending = new Map();
worker.onmessage = ({ data }) => { pending.get(data.id)?.(data.result); pending.delete(data.id); };
const ask = (type, payload) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); worker.postMessage({ id, type, ...payload }); });

// ---- Game state ----
let game;   // { state, player, level, history: [{state, san, review}], keys, selected, lastMove, hintSq, busy }

function newGame() {
  const state = fromFen(START_FEN);
  game = { state, player: $('color').value, level: $('level').value, history: [], keys: [positionKey(state)], selected: null, lastMove: null, hintSq: [], busy: false, reviews: [] };
  $('feed').innerHTML = '<p class="muted">New game! Remember the basics: control the center, develop your knights and bishops, and castle early.</p>';
  render();
  if (game.player === 'b') computerMove();
}

// ---- Drawing ----
function render() {
  const s = game.state;
  const board = $('board');
  board.innerHTML = '';
  const order = [...Array(64).keys()];
  if (game.player === 'b') order.reverse();
  const targets = game.selected === null ? [] : legalMoves(s).filter((m) => m.from === game.selected);
  const checkSq = inCheck(s) ? kingSquare(s, s.turn) : -1;

  order.forEach((i, pos) => {
    const sq = document.createElement('div');
    const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
    sq.className = `sq ${dark ? 'dark' : 'light'}`;
    sq.dataset.i = i;
    if (game.lastMove && (i === game.lastMove.from || i === game.lastMove.to)) sq.classList.add('last');
    if (i === game.selected) sq.classList.add('sel');
    if (game.hintSq.includes(i)) sq.classList.add('hint');
    if (i === checkSq) sq.classList.add('check');
    const t = targets.find((m) => m.to === i);
    if (t) sq.classList.add('target', ...(t.captured ? ['capture'] : []));
    const p = s.board[i];
    if (p) sq.innerHTML = `<span class="piece ${colorOf(p)}">${glyph(p)}</span>`;
    // coordinates on the edge squares
    if (pos % 8 === 0) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${8 - Math.floor(i / 8)}</span>`);
    if (pos >= 56) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[i % 8]}</span>`);
    board.appendChild(sq);
  });

  $('moves').innerHTML = game.history.reduce((html, h, n) => {
    const white = toFen(h.before).split(' ')[1] === 'w';
    if (white || n === 0) html += `<li>${white ? h.san : '… ' + h.san}`;
    else html += ` ${h.san}</li>`;
    return html;
  }, '');

  const result = gameResult(s, game.keys);
  if (result.over) {
    $('status').textContent = result.winner ? `${result.winner === game.player ? 'You win' : 'Computer wins'} by ${result.reason}!` : `Draw by ${result.reason}.`;
  } else if (game.busy) {
    $('status').textContent = 'Computer is thinking…';
  } else {
    $('status').textContent = s.turn === game.player ? `Your move${inCheck(s) ? ' (you are in check!)' : ''}` : '';
  }
  return result;
}

// ---- Coach feed ----
function addNote(html, tone = '') {
  const el = document.createElement('div');
  el.className = `note ${tone}`;
  el.innerHTML = html;
  $('feed').prepend(el);
  return el;
}

function showReview(review) {
  const items = review.messages.map((m) => `<li>${m.good ? '✅' : '⚠️'} ${m.text}</li>`).join('');
  const el = addNote(`<span class="tag">${review.san}: ${review.grade.label}</span><ul>${items}</ul>`, review.grade.tone);
  if (['Mistake', 'Blunder'].includes(review.grade.label)) {
    const btn = document.createElement('button');
    btn.textContent = 'Take it back and try again';
    btn.onclick = () => { undo(); btn.remove(); };
    el.appendChild(btn);
  }
}

// ---- Moves ----
async function playMove(move) {
  const before = game.state;
  const san = toSan(before, move);
  game.state = makeMove(before, move);
  game.keys.push(positionKey(game.state));
  game.history.push({ before, san, move, byPlayer: before.turn === game.player });
  game.lastMove = move;
  game.selected = null;
  game.hintSq = [];
  return render();
}

async function playerMove(move) {
  const before = game.state;
  const moveNumber = before.fullmove;
  game.busy = true;
  const result = await playMove(move);
  const entry = game.history.at(-1);
  if ($('coachToggle').checked) {
    const review = await ask('review', { fen: toFen(before), move, moveNumber });
    entry.review = review;
    game.reviews.push(review);
    if (game.history.at(-1) === entry) showReview(review);   // ignore if the move was taken back meanwhile
  }
  if (result.over) return endGame(result);
  await computerMove();
}

async function computerMove() {
  game.busy = true;
  render();
  const fenAtStart = toFen(game.state);
  const move = await ask('move', { fen: fenAtStart, level: game.level });
  if (toFen(game.state) !== fenAtStart) return;                  // game changed while thinking
  await new Promise((r) => setTimeout(r, 250));
  game.busy = false;
  const result = await playMove(move);
  if (result.over) endGame(result);
}

function endGame(result) {
  game.busy = false;
  render();
  const report = gameReport(game.reviews);
  const verdict = result.winner ? (result.winner === game.player ? 'You won' : 'You lost') : 'Draw';
  $('reportBody').innerHTML = `
    <p><strong>${verdict}</strong> by ${result.reason}.</p>
    ${report ? `
      <p class="stat">${report.accuracy}% accuracy</p>
      <p>${Object.entries(report.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
      <p><strong>Focus for next game:</strong> ${report.focus}</p>` : ''}`;
  $('report').showModal();
}

function undo() {
  if (!game.history.length) return;
  // take back the computer's reply and your move, so it's your turn again
  do {
    const last = game.history.pop();
    game.state = last.before;
    game.keys.pop();
    if (last.review) game.reviews.splice(game.reviews.indexOf(last.review), 1);
  } while (game.history.length && game.state.turn !== game.player);
  game.lastMove = game.history.at(-1)?.move ?? null;
  game.selected = null;
  game.hintSq = [];
  game.busy = false;
  addNote('<span class="tag">Took back the last move.</span> Look again: what is your opponent threatening?', 'tip');
  render();
  if (game.state.turn !== game.player) computerMove();
}

async function showHint() {
  if (game.busy || game.state.turn !== game.player) return;
  const h = await ask('hint', { fen: toFen(game.state) });
  game.hintSq = [h.move.from];
  render();
  const el = addNote(`<span class="tag">Hint</span><ul>${h.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`, 'tip');
  const btn = document.createElement('button');
  btn.textContent = 'Show the move';
  btn.onclick = () => { game.hintSq = [h.move.from, h.move.to]; render(); btn.replaceWith(Object.assign(document.createElement('p'), { textContent: `Suggested move: ${h.san}` })); };
  el.appendChild(btn);
}

function choosePromotion(color) {
  return new Promise((resolve) => {
    $('promoChoices').innerHTML = '';
    for (const p of 'QRBN') {
      const b = document.createElement('button');
      b.innerHTML = `<span class="piece ${color}">${glyph(p)}</span>`;
      b.onclick = () => { $('promo').close(); resolve(color === 'w' ? p : p.toLowerCase()); };
      $('promoChoices').appendChild(b);
    }
    $('promo').showModal();
  });
}

// ---- Input ----
$('board').addEventListener('click', async (e) => {
  const sq = e.target.closest('.sq');
  if (!sq || game.busy || game.state.turn !== game.player || gameResult(game.state, game.keys).over) return;
  const i = Number(sq.dataset.i);
  const moves = legalMoves(game.state);
  if (game.selected !== null) {
    let candidates = moves.filter((m) => m.from === game.selected && m.to === i);
    if (candidates.length > 1) {
      const promo = await choosePromotion(game.player);
      candidates = candidates.filter((m) => m.promotion === promo);
    }
    if (candidates.length) return playerMove(candidates[0]);
  }
  game.selected = colorOf(game.state.board[i]) === game.player ? i : null;
  render();
});

$('new').onclick = newGame;
$('undo').onclick = () => { if (!game.busy) undo(); };
$('hint').onclick = showHint;
$('level').onchange = () => { game.level = $('level').value; };

newGame();
