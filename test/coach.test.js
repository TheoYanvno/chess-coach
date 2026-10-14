import test from 'node:test';
import assert from 'node:assert';
import { fromFen, legalMoves, START_FEN, sqIndex } from '../src/engine.js';
import { chooseMove, evaluate } from '../src/ai.js';
import { reviewMove, hint, gameReport } from '../src/coach.js';

const find = (s, from, to) => legalMoves(s).find((m) => m.from === sqIndex(from) && m.to === sqIndex(to));

test('start position is balanced', () => {
  assert.strictEqual(evaluate(fromFen(START_FEN)), 0);
});

test('AI takes a free queen', () => {
  const s = fromFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
  const m = chooseMove(s, 'club');
  assert.strictEqual(m.captured, 'q');
});

test('AI finds mate in one', () => {
  const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');   // Ra8#
  const m = chooseMove(s, 'casual');
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
