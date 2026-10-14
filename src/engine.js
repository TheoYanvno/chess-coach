// Chess rules: board state, legal move generation, check/checkmate, SAN notation.
// Board: 64 squares, index 0 = a8, 7 = h8, 56 = a1, 63 = h1.
// Pieces: uppercase = white (PNBRQK), lowercase = black, null = empty.

export const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
export const sqIndex = (name) => FILES.indexOf(name[0]) + (8 - Number(name[1])) * 8;
export const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const fileOf = (i) => i % 8;
const rankOf = (i) => Math.floor(i / 8);

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fromFen(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = [];
  for (const ch of placement.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push(null);
    else board.push(ch);
  }
  return {
    board,
    turn,
    castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? -1 : sqIndex(ep),
    halfmove: Number(half ?? 0),
    fullmove: Number(full ?? 1),
  };
}

export function toFen(s) {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) empty++;
      else { if (empty) out += empty; empty = 0; out += p; }
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  return `${out} ${s.turn} ${s.castling || '-'} ${s.ep < 0 ? '-' : sqName(s.ep)} ${s.halfmove} ${s.fullmove}`;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// df = file step, dr = rank step in board rows (row 0 = rank 8)
function step(i, df, dr) {
  const f = fileOf(i) + df, r = rankOf(i) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}

/** Is square `sq` attacked by side `by`? */
export function isAttacked(s, sq, by) {
  const b = s.board;
  const is = (i, type) => i >= 0 && b[i] && colorOf(b[i]) === by && b[i].toUpperCase() === type;
  // pawns: a white pawn attacks upward (toward row 0), so it sits one row below the target
  const pr = by === 'w' ? 1 : -1;
  if (is(step(sq, -1, pr), 'P') || is(step(sq, 1, pr), 'P')) return true;
  for (const [df, dr] of KNIGHT) if (is(step(sq, df, dr), 'N')) return true;
  for (const [df, dr] of KING) if (is(step(sq, df, dr), 'K')) return true;
  const slide = (dirs, types) => dirs.some(([df, dr]) => {
    let i = step(sq, df, dr);
    while (i >= 0) {
      if (b[i]) return colorOf(b[i]) === by && types.includes(b[i].toUpperCase());
      i = step(i, df, dr);
    }
    return false;
  });
  return slide(ROOK_DIRS, 'RQ') || slide(BISHOP_DIRS, 'BQ');
}

export const kingSquare = (s, color) => s.board.indexOf(color === 'w' ? 'K' : 'k');
export const inCheck = (s, color = s.turn) => isAttacked(s, kingSquare(s, color), color === 'w' ? 'b' : 'w');

function pseudoMoves(s) {
  const moves = [];
  const b = s.board, me = s.turn, them = me === 'w' ? 'b' : 'w';
  const add = (from, to, extra = {}) => moves.push({ from, to, piece: b[from], captured: b[to], ...extra });

  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (!p || colorOf(p) !== me) continue;
    const type = p.toUpperCase();

    if (type === 'P') {
      const dir = me === 'w' ? -1 : 1;                 // white moves toward row 0
      const startRow = me === 'w' ? 6 : 1, lastRow = me === 'w' ? 0 : 7;
      const pushOrPromote = (to, extra = {}) => {
        if (rankOf(to) === lastRow) for (const promo of 'QRBN') add(from, to, { ...extra, promotion: me === 'w' ? promo : promo.toLowerCase() });
        else add(from, to, extra);
      };
      const one = step(from, 0, dir);
      if (one >= 0 && !b[one]) {
        pushOrPromote(one);
        const two = step(from, 0, 2 * dir);
        if (rankOf(from) === startRow && !b[two]) add(from, two, { double: true });
      }
      for (const df of [-1, 1]) {
        const to = step(from, df, dir);
        if (to < 0) continue;
        if (b[to] && colorOf(b[to]) === them) pushOrPromote(to);
        else if (to === s.ep) add(from, to, { enPassant: true, captured: me === 'w' ? 'p' : 'P' });
      }
    } else if (type === 'N' || type === 'K') {
      for (const [df, dr] of type === 'N' ? KNIGHT : KING) {
        const to = step(from, df, dr);
        if (to >= 0 && colorOf(b[to]) !== me) add(from, to);
      }
      if (type === 'K') {
        const row = me === 'w' ? 7 : 0, home = row * 8 + 4;
        if (from === home && !isAttacked(s, home, them)) {
          const [kSide, qSide] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
          if (s.castling.includes(kSide) && !b[home + 1] && !b[home + 2]
              && !isAttacked(s, home + 1, them) && !isAttacked(s, home + 2, them)) add(from, home + 2, { castle: 'K' });
          if (s.castling.includes(qSide) && !b[home - 1] && !b[home - 2] && !b[home - 3]
              && !isAttacked(s, home - 1, them) && !isAttacked(s, home - 2, them)) add(from, home - 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let to = step(from, df, dr);
        while (to >= 0) {
          if (!b[to]) add(from, to);
          else { if (colorOf(b[to]) === them) add(from, to); break; }
          to = step(to, df, dr);
        }
      }
    }
  }
  return moves;
}

/** Returns a new state with the move applied (the original is not changed). */
export function makeMove(s, m) {
  const b = s.board.slice();
  const me = s.turn;
  b[m.to] = m.promotion || b[m.from];
  b[m.from] = null;
  if (m.enPassant) b[m.to + (me === 'w' ? 8 : -8)] = null;
  if (m.castle) {
    const row = me === 'w' ? 56 : 0;
    if (m.castle === 'K') { b[row + 5] = b[row + 7]; b[row + 7] = null; }
    else { b[row + 3] = b[row]; b[row] = null; }
  }
  let castling = s.castling;
  const strip = (chars) => { for (const c of chars) castling = castling.replace(c, ''); };
  if (m.piece === 'K') strip('KQ');
  if (m.piece === 'k') strip('kq');
  for (const sq of [m.from, m.to]) {
    if (sq === 63) strip('K'); if (sq === 56) strip('Q');
    if (sq === 7) strip('k'); if (sq === 0) strip('q');
  }
  return {
    board: b,
    turn: me === 'w' ? 'b' : 'w',
    castling,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    halfmove: m.captured || m.piece.toUpperCase() === 'P' ? 0 : s.halfmove + 1,
    fullmove: s.fullmove + (me === 'b' ? 1 : 0),
  };
}

export function legalMoves(s) {
  return pseudoMoves(s).filter((m) => !inCheck(makeMove(s, m), s.turn));
}

export function gameResult(s, history = []) {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? { over: true, winner: s.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' };
  if (s.halfmove >= 100) return { over: true, winner: null, reason: 'fifty-move rule' };
  if (insufficientMaterial(s)) return { over: true, winner: null, reason: 'insufficient material' };
  const key = toFen(s).split(' ').slice(0, 4).join(' ');
  if (history.filter((h) => h === key).length >= 3) return { over: true, winner: null, reason: 'threefold repetition' };
  return { over: false };
}

function insufficientMaterial(s) {
  const pieces = s.board.filter(Boolean).map((p) => p.toUpperCase()).filter((p) => p !== 'K');
  return pieces.length === 0 || (pieces.length === 1 && 'NB'.includes(pieces[0]));
}

export const positionKey = (s) => toFen(s).split(' ').slice(0, 4).join(' ');

/** Standard Algebraic Notation, e.g. Nf3, exd5, O-O, e8=Q+, Qxf7# */
export function toSan(s, m) {
  if (m.castle) return suffix(s, m, m.castle === 'K' ? 'O-O' : 'O-O-O');
  const type = m.piece.toUpperCase();
  const capture = m.captured ? 'x' : '';
  let san;
  if (type === 'P') {
    san = (capture ? FILES[fileOf(m.from)] : '') + capture + sqName(m.to) + (m.promotion ? '=' + m.promotion.toUpperCase() : '');
  } else {
    const rivals = legalMoves(s).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
      const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
      dis = !sameFile ? FILES[fileOf(m.from)] : !sameRank ? sqName(m.from)[1] : sqName(m.from);
    }
    san = type + dis + capture + sqName(m.to);
  }
  return suffix(s, m, san);
}

function suffix(s, m, san) {
  const next = makeMove(s, m);
  if (!inCheck(next)) return san;
  return san + (legalMoves(next).length ? '+' : '#');
}

/** Counts leaf nodes; used to verify move generation against known values. */
export function perft(s, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(s)) n += perft(makeMove(s, m), depth - 1);
  return n;
}
