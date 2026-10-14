import test from 'node:test';
import assert from 'node:assert';
import { fromFen, perft, START_FEN } from '../src/engine.js';

// Known perft values from the Chess Programming Wiki prove the move generator is correct,
// including castling, en passant, promotions and pins.
test('start position perft', () => {
  const s = fromFen(START_FEN);
  assert.strictEqual(perft(s, 1), 20);
  assert.strictEqual(perft(s, 2), 400);
  assert.strictEqual(perft(s, 3), 8902);
});

test('"Kiwipete" position perft (castling, en passant, pins)', () => {
  const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.strictEqual(perft(s, 1), 48);
  assert.strictEqual(perft(s, 2), 2039);
  assert.strictEqual(perft(s, 3), 97862);
});

test('position 3 perft (en passant and checks)', () => {
  const s = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.strictEqual(perft(s, 3), 2812);
});

test('position 4 perft (promotions)', () => {
  const s = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.strictEqual(perft(s, 1), 6);
  assert.strictEqual(perft(s, 2), 264);
  assert.strictEqual(perft(s, 3), 9467);
});
