// Computer player: evaluation + alpha-beta search with quiescence.
import { legalMoves, makeMove, inCheck, colorOf } from './engine.js';

export const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
export const MATE = 100000;

// Piece-square tables from white's point of view (index 0 = a8). Reward good squares.
const PST = {
  P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
      -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
      -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
      0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
};

/** Score in centipawns from white's point of view. */
export function evaluate(s) {
  let score = 0;
  s.board.forEach((p, i) => {
    if (!p) return;
    const type = p.toUpperCase();
    const white = colorOf(p) === 'w';
    const pst = PST[type][white ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8)];   // mirror for black
    score += (white ? 1 : -1) * (VALUES[type] + pst);
  });
  // Keeping the option to castle is worth something in the opening and middlegame
  if (/[KQ]/.test(s.castling)) score += 25;
  if (/[kq]/.test(s.castling)) score -= 25;
  return score;
}

// Captures of valuable pieces by cheap pieces first (MVV-LVA) makes alpha-beta much faster.
const orderScore = (m) => (m.captured ? 10 * VALUES[m.captured.toUpperCase()] - VALUES[m.piece.toUpperCase()] : 0) + (m.promotion ? 800 : 0);
export const ordered = (moves) => moves.sort((a, b) => orderScore(b) - orderScore(a));

// Only look at captures at the end of the search so we don't stop in the middle of a trade.
function quiesce(s, alpha, beta, depth = 0) {
  const stand = (s.turn === 'w' ? 1 : -1) * evaluate(s);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth > 6) return alpha;
  for (const m of ordered(legalMoves(s).filter((x) => x.captured || x.promotion))) {
    const score = -quiesce(makeMove(s, m), -beta, -alpha, depth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** Negamax with alpha-beta pruning. Returns a score for the side to move. */
export function search(s, depth, alpha = -Infinity, beta = Infinity, ply = 0) {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;    // faster mates score higher
  if (depth === 0) return quiesce(s, alpha, beta);
  for (const m of ordered(moves)) {
    const score = -search(makeMove(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** Scores every legal move (for the side to move), best first. */
export function rankMoves(s, depth) {
  return ordered(legalMoves(s))
    .map((move) => ({ move, score: -search(makeMove(s, move), depth - 1, -Infinity, Infinity, 1) }))
    .sort((a, b) => b.score - a.score);
}

export const LEVELS = {
  easy:         { depth: 1, randomness: 150, label: 'Easy' },
  medium:       { depth: 2, randomness: 40,  label: 'Medium' },
  hard:         { depth: 3, randomness: 0,   label: 'Hard' },
  // Professional searches deeper and deeper until its time runs out, then plays the best move it fully checked
  professional: { depth: 5, randomness: 0,   label: 'Professional', timeMs: 2500 },
};

// Old level names still work (saved links, older tests)
const ALIASES = { beginner: 'easy', casual: 'medium', club: 'hard' };
export const levelOf = (name) => LEVELS[name] ?? LEVELS[ALIASES[name]] ?? LEVELS.medium;

class OutOfTime extends Error {}

/** Like search(), but gives up (throws) once the clock passes the deadline. */
function timedSearch(s, depth, alpha, beta, ply, deadline, now) {
  if (now() > deadline) throw new OutOfTime();
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (depth === 0) return quiesce(s, alpha, beta);
  for (const m of ordered(moves)) {
    const score = -timedSearch(makeMove(s, m), depth - 1, -beta, -alpha, ply + 1, deadline, now);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/**
 * Iterative deepening: search depth 1, then 2, then 3... until the time budget is used up.
 * Each finished depth puts its best move first for the next one, which makes alpha-beta prune far more.
 * Returns the ranking from the deepest search that finished, and how deep that was.
 */
export function rankMovesTimed(s, { maxDepth = 5, timeMs = 2500, now = () => Date.now() } = {}) {
  const deadline = now() + timeMs;
  let moves = ordered(legalMoves(s));
  let best = moves.map((move) => ({ move, score: 0 }));
  let reached = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const ranked = [];
      let alpha = -Infinity;
      for (const move of moves) {
        // Only the best move needs an exact score. Others are searched with a narrow window, and if they
        // can't beat the best so far they are ranked just below it rather than tied with it.
        const score = -timedSearch(makeMove(s, move), depth - 1, -Infinity, -alpha, 1, deadline, now);
        ranked.push({ move, score: score > alpha ? score : Math.min(score, alpha - 1) });
        if (score > alpha) alpha = score;
      }
      best = ranked.sort((a, b) => b.score - a.score);
      moves = best.map((r) => r.move);
      reached = depth;
      if (best[0].score > MATE - 100) break;          // found a forced mate, no need to look further
    } catch (err) {
      if (!(err instanceof OutOfTime)) throw err;
      break;
    }
  }
  return { ranked: best, depth: reached };
}

/** Picks the computer's move. Easier levels sometimes choose a slightly worse move on purpose. */
export function chooseMove(s, level = 'medium', rand = Math.random) {
  const { depth, randomness, timeMs } = levelOf(level);
  const ranked = timeMs ? rankMovesTimed(s, { maxDepth: depth, timeMs }).ranked : rankMoves(s, depth);
  const best = ranked[0].score;
  const choices = ranked.filter((r) => r.score >= best - randomness);
  return choices[Math.floor(rand() * choices.length)].move;
}
