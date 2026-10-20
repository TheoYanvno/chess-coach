import test from 'node:test';
import assert from 'node:assert';
import { fromFen, legalMoves, START_FEN, sqIndex } from '../src/engine.js';
import { chooseMove, evaluate, rankMovesTimed, levelOf, LEVELS } from '../src/ai.js';
import { reviewMove, hint, gameReport } from '../src/coach.js';

const find = (s, from, to) => legalMoves(s).find((m) => m.from === sqIndex(from) && m.to === sqIndex(to));

test('start position is balanced', () => {
  assert.strictEqual(evaluate(fromFen(START_FEN)), 0);
});

test('AI takes a free queen', () => {
  const s = fromFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
  const m = chooseMove(s, 'hard');
  assert.strictEqual(m.captured, 'q');
});

test('AI finds mate in one', () => {
  const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');   // Ra8#
  const m = chooseMove(s, 'medium');
  assert.strictEqual(m.to, sqIndex('a8'));
});

test('coach flags hanging the queen as a blunder', () => {
  // 1.e4 e5 2.Qh5 Nc6 3.Qxe5?? (Nxe5)
  const s = fromFen('r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3');
  const review = reviewMove(s, find(s, 'h5', 'e5'));
  assert.strictEqual(review.grade.label, 'Blunder');
  assert.ok(review.messages.some((m) => m.text.includes('queen')));
});

test('coach praises a good developing move', () => {
  const s = fromFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const review = reviewMove(s, find(s, 'g1', 'f3'));
  assert.ok(['Best', 'Good'].includes(review.grade.label));
  assert.ok(review.messages.some((m) => m.good && m.text.includes('knight')));
});

test('coach points out a missed mate', () => {
  const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const review = reviewMove(s, find(s, 'a1', 'a2'));
  assert.ok(review.messages.some((m) => m.text.includes('checkmate')));
});

test('hint warns about an attacked piece', () => {
  const s = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
  const h = hint(s);
  assert.strictEqual(h.move.captured, 'q');
});

test('game report gives an accuracy score', () => {
  const s = fromFen(START_FEN);
  const r = gameReport([reviewMove(s, find(s, 'e2', 'e4'))]);
  assert.ok(r.accuracy > 80);
});

test('four difficulty levels, each searching at least as deep as the one below', () => {
  assert.deepStrictEqual(Object.keys(LEVELS), ['easy', 'medium', 'hard', 'professional']);
  const depths = Object.values(LEVELS).map((l) => l.depth);
  assert.ok(depths.every((d, i) => i === 0 || d >= depths[i - 1]));
  assert.strictEqual(levelOf('club'), LEVELS.hard);          // old names still work
});

test('professional plays the back-rank mate', () => {
  const s = fromFen('6k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1');   // Rd8# and Re8# both mate
  const m = chooseMove(s, 'professional');
  assert.ok([sqIndex('e8'), sqIndex('d8')].includes(m.to));
});

test('professional wins material a shallow search would miss (a fork two moves deep)', () => {
  // Nc7+ forks king and rook: only a search of 3+ plies sees the rook falling
  const s = fromFen('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
  const m = chooseMove(s, 'professional');
  assert.strictEqual(m.to, sqIndex('c7'));
});

test('the timed search stops when time is up and still returns a legal move', () => {
  let t = 0;
  const clock = () => (t += 5);                                      // every check moves the clock 5 ms
  const s = fromFen(START_FEN);
  const { ranked, depth } = rankMovesTimed(s, { maxDepth: 6, timeMs: 400, now: clock });
  assert.ok(depth >= 1 && depth < 6);
  assert.ok(legalMoves(s).some((m) => m.from === ranked[0].move.from && m.to === ranked[0].move.to));
});
