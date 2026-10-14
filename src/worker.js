// Runs the engine off the main thread so the board stays responsive while the computer thinks.
import { fromFen } from './engine.js';
import { chooseMove } from './ai.js';
import { reviewMove, hint } from './coach.js';

self.onmessage = ({ data }) => {
  const { id, type, fen } = data;
  const s = fromFen(fen);
  let result;
  if (type === 'move') result = chooseMove(s, data.level);
  if (type === 'review') result = reviewMove(s, data.move, { depth: 2, moveNumber: data.moveNumber });
  if (type === 'hint') result = hint(s);
  self.postMessage({ id, result });
};
