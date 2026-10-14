// The coach: grades each of your moves and explains why in plain language.
import { legalMoves, makeMove, inCheck, isAttacked, toSan, sqName, colorOf } from './engine.js';
import { rankMoves, VALUES, MATE } from './ai.js';

const NAMES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const nameOf = (p) => NAMES[p.toUpperCase()];
const isMate = (score) => Math.abs(score) > MATE - 100;
const same = (a, b) => a.from === b.from && a.to === b.to && (a.promotion || '') === (b.promotion || '');

export const GRADES = [
  { max: 0,   label: 'Best',       tone: 'great' },
  { max: 15,  label: 'Excellent',  tone: 'great' },
  { max: 80,  label: 'Good',       tone: 'good' },
  { max: 160, label: 'Inaccuracy', tone: 'warn' },
  { max: 320, label: 'Mistake',    tone: 'bad' },
  { max: Infinity, label: 'Blunder', tone: 'bad' },
];
export const gradeFor = (loss) => GRADES.find((g) => loss <= g.max);

/** Finds the opponent's best capture right after your move, if it wins material. */
function hangingPiece(after) {
  const ranked = rankMoves(after, 1).filter((r) => r.move.captured);
  if (!ranked.length) return null;
  const top = ranked[0];
  const baseline = rankMoves(after, 1)[0];
  if (!same(top.move, baseline.move)) return null;
  return top.move;
}

/** Plain-language reasons why a move is good, based on chess principles. */
function principles(before, move, moveNumber) {
  const tips = [];
  const type = move.piece.toUpperCase();
  const toFile = move.to % 8, toRow = Math.floor(move.to / 8);
  const center = [27, 28, 35, 36];   // d5 e5 d4 e4
  if (move.castle) tips.push({ good: true, text: 'Castling tucks your king away and connects your rooks. Great habit.' });
  if (moveNumber <= 10) {
    if ((type === 'N' || type === 'B') && [1, 2, 5, 6, 57, 58, 61, 62].includes(move.from) && toFile !== 0 && toFile !== 7) {
      tips.push({ good: true, text: `Developing your ${nameOf(move.piece)} brings a new piece into the game.` });
    }
    if (type === 'Q' && moveNumber <= 5 && !move.captured) {
      tips.push({ good: false, text: 'Bringing the queen out this early lets your opponent attack it while developing their pieces.' });
    }
    if (type === 'N' && (toFile === 0 || toFile === 7)) {
      tips.push({ good: false, text: '"A knight on the rim is dim": knights control fewer squares on the edge of the board.' });
    }
    if (type === 'K' && !move.castle) {
      tips.push({ good: false, text: 'Moving your king early usually costs you the right to castle and leaves it exposed.' });
    }
  }
  if (type === 'P' && center.includes(move.to)) tips.push({ good: true, text: 'Pawns in the center control key squares and give your pieces room.' });
  if (move.promotion) tips.push({ good: true, text: `Promoting a pawn to a ${nameOf(move.promotion)}!` });
  return tips;
}

/**
 * Reviews the move you just played.
 * Returns { grade, loss, san, bestSan, messages[] } where loss is centipawns lost vs the best move.
 */
export function reviewMove(before, move, { depth = 2, moveNumber = 1 } = {}) {
  const ranked = rankMoves(before, depth);
  const best = ranked[0];
  const played = ranked.find((r) => same(r.move, move));
  const loss = Math.max(0, best.score - played.score);
  const grade = isMate(best.score) && best.score > 0 && !isMate(played.score) ? gradeFor(Infinity) : gradeFor(loss);
  const after = makeMove(before, move);
  const san = toSan(before, move);
  const bestSan = toSan(before, best.move);
  const messages = [];

  if (!legalMoves(after).length && inCheck(after)) {
    return { grade: GRADES[0], loss: 0, san, bestSan, messages: [{ good: true, text: 'Checkmate! You found the finishing blow.' }] };
  }

  // Missed a forced checkmate
  if (isMate(best.score) && best.score > 0 && !same(best.move, move)) {
    const n = Math.ceil((MATE - best.score) / 2);
    messages.push({ good: false, text: `You had a forced checkmate${n > 1 ? ` in ${n}` : ''} starting with ${bestSan}. Look for checks first!` });
  }
  // Walked into a checkmate
  if (isMate(played.score) && played.score < 0) {
    messages.push({ good: false, text: 'This move allows your opponent to force checkmate. Before moving, ask: "What checks does my opponent have?"' });
  }

  // Left a piece hanging
  const threat = hangingPiece(after);
  if (threat && loss >= 120 && colorOf(threat.captured) === before.turn) {
    const defended = rankMoves(makeMove(after, threat), 1)[0];
    const net = VALUES[threat.captured.toUpperCase()] - (defended?.move.to === threat.to ? VALUES[threat.piece.toUpperCase()] : 0);
    if (net > 0) {
      messages.push({ good: false, text: `Your ${nameOf(threat.captured)} on ${sqName(threat.to)} can be taken by the ${nameOf(threat.piece)} on ${sqName(threat.from)}. Check that every piece is protected before you move.` });
    }
  }

  // Missed a free (or clearly winning) capture: value taken minus what we lose if they recapture
  const enemy = before.turn === 'w' ? 'b' : 'w';
  const captureGain = (m) => m.captured
    ? VALUES[m.captured.toUpperCase()] - (isAttacked(makeMove(before, m), m.to, enemy) ? VALUES[m.piece.toUpperCase()] : 0)
    : 0;
  if (best.move.captured && captureGain(best.move) >= 100 && !same(best.move, move) && loss >= 80 && !isMate(best.score)) {
    messages.push({ good: false, text: `You could have won material with ${bestSan}, capturing the ${nameOf(best.move.captured)} on ${sqName(best.move.to)}.` });
  }

  // King safety: moved into a check-heavy spot or ignored a check threat
  if (inCheck(after) && !move.captured && grade.tone === 'great') {
    messages.push({ good: true, text: 'A strong check that keeps the pressure on.' });
  }

  messages.push(...principles(before, move, moveNumber));

  if (!messages.some((m) => !m.good) && loss > 80) {
    messages.push({ good: false, text: `${bestSan} was stronger here. Compare the two moves: what does ${bestSan} attack or defend?` });
  }
  if (!messages.length) {
    const text = same(best.move, move) ? 'That matches the coach’s top choice.'
      : grade.tone === 'great' ? `About as strong as the top move (${bestSan}).`
      : 'Solid move that keeps the position balanced.';
    messages.push({ good: true, text });
  }
  return { grade, loss, san, bestSan, messages };
}

/** A hint before you move: points out threats and suggests the best move. */
export function hint(s, depth = 2) {
  const ranked = rankMoves(s, depth);
  const best = ranked[0];
  const notes = [];
  if (inCheck(s)) notes.push('You are in check, so you must move your king, block, or capture the checking piece.');
  // What is the opponent threatening right now? (pretend it is their turn)
  const flipped = { ...s, turn: s.turn === 'w' ? 'b' : 'w', ep: -1 };
  if (!inCheck(flipped)) {
    const theirBest = rankMoves(flipped, 1)[0];
    if (theirBest?.move.captured && colorOf(theirBest.move.captured) === s.turn) {
      notes.push(`Watch out: your ${nameOf(theirBest.move.captured)} on ${sqName(theirBest.move.to)} is under attack.`);
    }
  }
  const enemy = s.turn === 'w' ? 'b' : 'w';
  const free = best.move.captured && VALUES[best.move.captured.toUpperCase()] - (isAttacked(makeMove(s, best.move), best.move.to, enemy) ? VALUES[best.move.piece.toUpperCase()] : 0) >= 100;
  if (free) notes.push(`There is material to win: look at the ${nameOf(best.move.captured)} on ${sqName(best.move.to)}.`);
  else if (isMate(best.score) && best.score > 0) notes.push('There is a forced checkmate. Look at every check!');
  else notes.push(`Consider moving your ${nameOf(best.move.piece)} from ${sqName(best.move.from)}.`);
  return { move: best.move, san: toSan(s, best.move), notes };
}

/** End-of-game report: accuracy and the most useful lesson. */
export function gameReport(reviews) {
  if (!reviews.length) return null;
  const counts = {};
  for (const r of reviews) counts[r.grade.label] = (counts[r.grade.label] || 0) + 1;
  // Accuracy: 100% for no loss, sliding down as average loss grows
  const avgLoss = reviews.reduce((sum, r) => sum + Math.min(r.loss, 1000), 0) / reviews.length;
  const accuracy = Math.round(100 * Math.exp(-avgLoss / 250));
  const lessons = reviews.flatMap((r) => r.messages.filter((m) => !m.good).map((m) => m.text));
  const hanging = lessons.filter((t) => t.includes('can be taken')).length;
  const missed = lessons.filter((t) => t.includes('could have won')).length;
  let focus = 'Keep it up: you played soundly. Next, try a higher level.';
  if (hanging >= 2) focus = 'Focus on protecting your pieces: before every move, check what your opponent can capture.';
  else if (missed >= 2) focus = 'Look for captures and checks on every move. You missed some free material.';
  else if (counts.Blunder) focus = 'Slow down on critical moves. One blunder can decide a game.';
  return { accuracy, counts, focus };
}
