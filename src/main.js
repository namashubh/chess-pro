import { Chess } from 'chess.js';
import Peer from 'peerjs';
import { createIcons, icons } from 'lucide';
import { createChessboard } from './chessboard3d.js';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const pieceGlyph = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const flatPieceGlyph = { w: pieceGlyph.b, b: pieceGlyph.b };
const levels = { Normal: 1, Hard: 2, Pro: 3 };
const durations = { '3 min': 180, '5 min': 300, '15 min': 900, 'No limit': 0 };
const getSavedName = (color, fallback) => localStorage.getItem(`chessclub-player-${color}`)?.trim().slice(0, 18) || fallback;

const state = {
  game: new Chess(),
  mode: 'computer',
  boardView: '3d',
  showMoveGuide: true,
  names: { w: getSavedName('white', 'You'), b: getSavedName('black', 'Black') },
  remoteName: 'Opponent',
  difficulty: 'Normal',
  timeControl: '5 min',
  clocks: { w: 300, b: 300 },
  timer: null,
  clockTurn: 'w',
  lastClockAt: 0,
  selected: null,
  legalMoves: [],
  lastMove: null,
  flipped: false,
  peer: null,
  connection: null,
  side: 'w',
  roomCode: '',
  started: false,
  gameOver: false,
  thinking: false,
};

const app = document.querySelector('#app');
let chessboard3d = null;

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function getInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || 'P';
}

function render() {
  const game = state.game;
  const turn = game.turn();
  const topSide = state.mode === 'local' ? 'b' : state.mode === 'online' && state.side === 'b' ? 'w' : 'b';
  const bottomSide = topSide === 'w' ? 'b' : 'w';
  const nameForSide = (color) => {
    if (state.mode === 'computer' && color === 'b') return `Computer · ${state.difficulty}`;
    if (state.mode === 'online' && color !== state.side) return state.remoteName;
    return state.names[color];
  };
  const topName = nameForSide(topSide);
  const bottomName = nameForSide(bottomSide);
  const profileName = nameForSide(state.mode === 'online' ? state.side : 'w');
  const profileColor = state.mode === 'online' ? state.side : 'w';
  const topActive = state.started && turn === topSide && !state.gameOver;
  const bottomActive = state.started && turn === bottomSide && !state.gameOver;
  const boardRows = Array.from({ length: 8 }, (_, row) => {
    const rank = state.flipped ? row + 1 : 8 - row;
    return Array.from({ length: 8 }, (_, col) => {
      const file = files[state.flipped ? 7 - col : col];
      const square = `${file}${rank}`;
      const piece = game.get(square);
      const isLight = (files.indexOf(file) + rank) % 2 === 1;
      const isLast = state.lastMove?.from === square || state.lastMove?.to === square;
      const isSelected = state.selected === square;
      const isCheck = piece?.type === 'k' && piece.color === turn && game.isCheck();
      const labels = `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`;
      return `<button class="square ${isLight ? 'light' : 'dark'} ${isLast ? 'last-move' : ''} ${isSelected ? 'selected' : ''} ${isCheck ? 'in-check' : ''}" data-square="${square}" aria-label="${labels}" ${!state.started || state.gameOver || state.thinking ? 'disabled' : ''}>
        ${piece ? `<span class="piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}">${flatPieceGlyph[piece.color][piece.type]}</span>` : ''}
        ${state.showMoveGuide && state.legalMoves.some((move) => move.to === square) ? `<span class="move-dot ${piece ? 'capture-dot' : ''}"></span>` : ''}
        ${col === 0 ? `<span class="coordinate rank-coordinate">${rank}</span>` : ''}
        ${row === 7 ? `<span class="coordinate file-coordinate">${file}</span>` : ''}
      </button>`;
    }).join('');
  }).map((row) => `<div class="board-row">${row}</div>`).join('');
  const history = game.history({ verbose: true });
  const moveRows = [];
  for (let index = 0; index < history.length; index += 2) {
    moveRows.push(`<div class="move-row"><span class="move-number">${String(index / 2 + 1).padStart(2, '0')}</span><span>${history[index]?.san ?? ''}</span><span>${history[index + 1]?.san ?? ''}</span></div>`);
  }
  const captured = { w: [], b: [] };
  for (const move of history) {
    if (move.captured) captured[move.color].push(move.captured);
  }
  const topCaptured = topSide === 'w' ? captured.b : captured.w;
  const bottomCaptured = bottomSide === 'w' ? captured.b : captured.w;
  const topCapturedGlyphs = topCaptured.map((type) => pieceGlyph[bottomSide][type]).join('');
  const bottomCapturedGlyphs = bottomCaptured.map((type) => pieceGlyph[topSide][type]).join('');
  const status = state.started ? getStatus() : 'Ready when you are';

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="Chess Club home"><span class="brand-mark">♞</span><span>chess<span class="brand-light">club</span></span></a>
      <div class="topbar-center"><span class="live-dot"></span><span>${state.mode === 'online' && state.connection ? 'CONNECTED' : state.started ? 'GAME IN PROGRESS' : 'READY TO PLAY'}</span></div>
      <button class="icon-button profile-button" id="profile-button" aria-label="Edit player names" title="Edit player names"><span>${escapeHtml(getInitials(profileName))}</span></button>
    </header>
    <main class="layout">
      <section class="play-column" aria-label="Chess game">
        <div class="game-heading"><div><div class="eyebrow">YOUR NEXT MOVE</div><h1>Play a game</h1></div><div class="game-heading-actions"><div class="board-view-control segmented" role="group" aria-label="Board view"><button data-board-view="2d" class="${state.boardView === '2d' ? 'active-segment' : ''}" aria-pressed="${state.boardView === '2d'}">2D</button><button data-board-view="3d" class="${state.boardView === '3d' ? 'active-segment' : ''}" aria-pressed="${state.boardView === '3d'}">3D</button></div><div class="move-guide-control segmented" role="group" aria-label="Move instructions"><button data-move-guide="on" class="${state.showMoveGuide ? 'active-segment' : ''}" aria-pressed="${state.showMoveGuide}">Guide on</button><button data-move-guide="off" class="${!state.showMoveGuide ? 'active-segment' : ''}" aria-pressed="${!state.showMoveGuide}">off</button></div><button class="icon-button" id="flip-button" title="Flip board" aria-label="Flip board"><i data-lucide="flip-vertical-2"></i></button><button class="icon-button" id="new-game-button" title="New game" aria-label="New game"><i data-lucide="rotate-ccw"></i></button></div></div>
        <div class="player-strip ${topActive ? 'active-player' : ''}"><div class="player-avatar ${topSide === 'b' ? 'avatar-dark' : ''}">${state.mode === 'computer' && topSide === 'b' ? '♟' : escapeHtml(getInitials(topName))}</div><div class="player-meta"><strong>${escapeHtml(topName)}</strong><span>${topSide === 'w' ? 'White' : 'Black'}${state.mode === 'online' ? ` · ${topSide === state.side ? 'You' : 'Opponent'}` : ''}${state.mode === 'online' && state.roomCode ? ` · ${escapeHtml(state.roomCode)}` : ''}</span></div><span class="captured-pieces">${topCapturedGlyphs}</span><div class="clock ${topActive ? 'clock-active' : ''} ${state.clocks[topSide] <= 10 && state.clocks[topSide] > 0 ? 'clock-low' : ''}">${durations[state.timeControl] ? formatTime(state.clocks[topSide]) : '∞'}</div></div>
        <div class="board-frame board-frame-${state.boardView}">${state.boardView === '3d' ? '<div class="chessboard-mount" id="chessboard-mount"></div>' : `<div class="chessboard">${boardRows}</div>`}</div>
        <div class="player-strip bottom-player ${bottomActive ? 'active-player' : ''}"><div class="player-avatar ${bottomSide === 'b' ? 'avatar-dark' : ''}">${state.mode === 'computer' && bottomSide === 'b' ? '♟' : escapeHtml(getInitials(bottomName))}</div><div class="player-meta"><strong>${escapeHtml(bottomName)}</strong><span>${bottomSide === 'w' ? 'White' : 'Black'}${state.mode === 'online' ? ` · ${bottomSide === state.side ? 'You' : 'Opponent'}` : ''}${state.mode === 'computer' && bottomSide === 'b' ? ` · ${state.difficulty}` : ''}</span></div><span class="captured-pieces">${bottomCapturedGlyphs}</span><div class="clock ${bottomActive ? 'clock-active' : ''} ${state.clocks[bottomSide] <= 10 && state.clocks[bottomSide] > 0 ? 'clock-low' : ''}">${durations[state.timeControl] ? formatTime(state.clocks[bottomSide]) : '∞'}</div></div>
        <div class="game-status ${state.gameOver ? 'finished' : ''}"><span class="status-indicator"></span><span>${escapeHtml(status)}</span><span class="turn-label">${state.gameOver ? '' : `${turn === 'w' ? 'White' : 'Black'} to move`}</span></div>
        ${state.showMoveGuide ? `<div class="move-guide-hint"><i data-lucide="mouse-pointer-2"></i><span>${!state.started ? 'Start game when you are ready' : state.selected ? 'Choose a highlighted square' : 'Select a piece to see legal moves'}</span></div>` : ''}
      </section>
      <aside class="side-panel">
        <div class="mode-switch" role="tablist" aria-label="Game mode"><button data-mode="computer" class="mode-tab ${state.mode === 'computer' ? 'selected-tab' : ''}" role="tab" aria-selected="${state.mode === 'computer'}"><i data-lucide="cpu"></i><span>Computer</span></button><button data-mode="online" class="mode-tab ${state.mode === 'online' ? 'selected-tab' : ''}" role="tab" aria-selected="${state.mode === 'online'}"><i data-lucide="globe-2"></i><span>Online</span></button><button data-mode="local" class="mode-tab ${state.mode === 'local' ? 'selected-tab' : ''}" role="tab" aria-selected="${state.mode === 'local'}"><i data-lucide="users-round"></i><span>2 players</span></button></div>
        ${state.mode === 'online' ? renderOnlinePanel() : ''}
        <div class="panel-section setup-section"><div class="section-title">GAME SETTINGS</div>
          ${state.mode === 'computer' ? `<div class="setting-row"><div class="setting-copy"><strong>Difficulty</strong><span>Choose your opponent</span></div><div class="segmented difficulty-control">${Object.keys(levels).map((level) => `<button data-difficulty="${level}" class="${state.difficulty === level ? 'active-segment' : ''}">${level}</button>`).join('')}</div></div>` : ''}
          <div class="setting-row"><div class="setting-copy"><strong>Time control</strong><span>${durations[state.timeControl] ? 'Per player' : 'Untimed game'}</span></div><div class="time-grid">${Object.keys(durations).map((time) => `<button data-time="${time}" class="time-option ${state.timeControl === time ? 'active-time' : ''}">${time === 'No limit' ? '∞' : time}<span>${time === 'No limit' ? 'No limit' : 'each'}</span></button>`).join('')}</div></div>
          <button class="start-button" id="start-button"><i data-lucide="${state.started && !state.gameOver ? 'rotate-ccw' : 'play'}"></i><span>${state.started && !state.gameOver ? 'New game' : state.gameOver ? 'Play again' : 'Start game'}</span></button>
        </div>
        <div class="panel-section moves-section"><div class="section-heading"><div class="section-title">MOVE HISTORY</div><span class="move-count">${history.length} PLY</span></div><div class="move-list" id="move-list">${moveRows.length ? moveRows.join('') : '<div class="empty-moves">Your first move is waiting.</div>'}</div><div class="move-actions"><button class="text-action" id="undo-button" ${history.length && !state.thinking ? '' : 'disabled'}><i data-lucide="undo-2"></i>Undo</button><button class="text-action" id="resign-button" ${state.gameOver || !history.length ? 'disabled' : ''}><i data-lucide="flag"></i>Resign</button></div></div>
        <div class="panel-footer"><span class="secure-icon"><i data-lucide="shield-check"></i></span><span>${state.mode === 'online' ? 'Peer-to-peer connection' : 'Your games stay on this device'}</span><button class="icon-button small-icon" title="Game information" aria-label="Game information"><i data-lucide="info"></i></button></div>
      </aside>
    </main>
    <footer class="page-footer"><span>CHESS CLUB <span class="footer-dot">·</span> PLAY YOUR WAY</span><span>Created by Shubham Nama</span></footer>
    <div id="promotion-dialog" class="dialog-backdrop hidden" role="dialog" aria-modal="true" aria-label="Choose promotion"><div class="promotion-dialog"><div class="section-title">PROMOTE PAWN</div><div class="promotion-options">${['q', 'r', 'b', 'n'].map((type) => `<button data-promote="${type}" aria-label="Promote to ${type}">${pieceGlyph[turn][type]}</button>`).join('')}</div></div></div>
    <div id="join-dialog" class="dialog-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="join-dialog-title"><form class="join-dialog" id="join-room-form"><div class="section-title" id="join-dialog-title">JOIN A FRIEND</div><label for="room-code-input">Room code</label><input id="room-code-input" name="roomCode" autocomplete="off" maxlength="6" placeholder="ABC123" required /><div class="dialog-actions"><button class="text-action" type="button" id="cancel-join-button">Cancel</button><button class="start-button" type="submit"><i data-lucide="log-in"></i>Join room</button></div></form></div>
    <div id="profile-dialog" class="dialog-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><form class="profile-dialog" id="profile-form"><div class="section-title" id="profile-dialog-title">PLAYER NAMES</div><label for="profile-name-input">${state.mode === 'local' ? 'White player' : 'Your name'}</label><input id="profile-name-input" name="playerName" maxlength="18" autocomplete="nickname" value="${escapeHtml(state.names[profileColor])}" required />${state.mode === 'local' ? `<label for="second-player-name-input">Black player</label><input id="second-player-name-input" name="secondPlayerName" maxlength="18" autocomplete="off" value="${escapeHtml(state.names.b)}" required />` : ''}<div class="dialog-actions"><button class="text-action" type="button" id="cancel-profile-button">Cancel</button><button class="start-button" type="submit"><i data-lucide="check"></i>Save names</button></div></form></div>
  `;

  app.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  app.querySelectorAll('[data-board-view]').forEach((button) => button.addEventListener('click', () => { state.boardView = button.dataset.boardView; render(); }));
  app.querySelectorAll('[data-move-guide]').forEach((button) => button.addEventListener('click', () => { state.showMoveGuide = button.dataset.moveGuide === 'on'; render(); }));
  app.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => { state.difficulty = button.dataset.difficulty; render(); }));
  app.querySelectorAll('[data-time]').forEach((button) => button.addEventListener('click', () => { state.timeControl = button.dataset.time; resetGame(); }));
  app.querySelector('#start-button').addEventListener('click', startGame);
  app.querySelector('#profile-button').addEventListener('click', () => {
    const dialog = app.querySelector('#profile-dialog');
    dialog.classList.remove('hidden');
    app.querySelector('#profile-name-input').focus();
  });
  app.querySelector('#cancel-profile-button').addEventListener('click', () => app.querySelector('#profile-dialog').classList.add('hidden'));
  app.querySelector('#profile-dialog').addEventListener('click', (event) => {
    if (event.target === app.querySelector('#profile-dialog')) app.querySelector('#profile-dialog').classList.add('hidden');
  });
  app.querySelector('#profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const profileName = app.querySelector('#profile-name-input').value.trim().slice(0, 18);
    if (!profileName) return;
    state.names[profileColor] = profileName;
    localStorage.setItem(`chessclub-player-${profileColor === 'w' ? 'white' : 'black'}`, profileName);
    if (state.mode === 'local') {
      const secondName = app.querySelector('#second-player-name-input').value.trim().slice(0, 18);
      if (secondName) state.names.b = secondName;
      localStorage.setItem('chessclub-player-black', state.names.b);
    }
    if (state.mode === 'online' && state.connection) state.connection.send({ type: 'profile', name: profileName });
    render();
  });
  app.querySelector('#new-game-button').addEventListener('click', resetGame);
  app.querySelector('#flip-button').addEventListener('click', () => { state.flipped = !state.flipped; render(); });
  app.querySelector('#undo-button').addEventListener('click', undoMove);
  app.querySelector('#resign-button').addEventListener('click', resign);
  app.querySelectorAll('[data-promote]').forEach((button) => button.addEventListener('click', () => completePromotion(button.dataset.promote)));
  app.querySelector('#move-list').scrollTop = app.querySelector('#move-list').scrollHeight;
  app.querySelectorAll('[data-square]').forEach((button) => button.addEventListener('click', () => handleSquareClick(button.dataset.square)));
  const mount = app.querySelector('#chessboard-mount');
  if (mount) {
    if (!chessboard3d) chessboard3d = createChessboard(mount, handleSquareClick);
    else chessboard3d.mount(mount);
    const checkedKing = game.isCheck()
      ? game.board().flatMap((rank, row) => rank.map((piece, column) => piece?.type === 'k' && piece.color === turn ? `${files[column]}${8 - row}` : null)).find(Boolean)
      : null;
    chessboard3d.update({
      fen: game.fen(),
      board: game.board(),
      selected: state.selected,
      legalMoves: state.showMoveGuide ? state.legalMoves.map((move) => move.to) : [],
      lastMove: state.lastMove,
      checkedKing,
      flipped: state.flipped,
    });
  }
  bindOnlinePanel();
  createIcons({ icons });
}

function renderOnlinePanel() {
  return `<div class="online-panel"><div class="section-title">PLAY WITH A FRIEND</div><div class="online-actions"><button class="secondary-button" id="create-room-button"><i data-lucide="plus"></i>Create room</button><button class="secondary-button" id="join-room-button"><i data-lucide="log-in"></i>Join room</button></div>${state.roomCode ? `<div class="room-code-box"><span>ROOM CODE</span><strong>${escapeHtml(state.roomCode)}</strong><button class="icon-button copy-button" id="copy-code-button" aria-label="Copy room code" title="Copy room code"><i data-lucide="copy"></i></button></div>${state.connection ? '<div class="connection-label"><span class="live-dot"></span>Friend connected</div>' : '<div class="connection-label waiting-label"><span class="waiting-dot"></span>Waiting for your friend…</div>'}` : ''}</div>`;
}

function bindOnlinePanel() {
  const create = app.querySelector('#create-room-button');
  const join = app.querySelector('#join-room-button');
  const copy = app.querySelector('#copy-code-button');
  const dialog = app.querySelector('#join-dialog');
  create?.addEventListener('click', createRoom);
  join?.addEventListener('click', () => {
    dialog.classList.remove('hidden');
    app.querySelector('#room-code-input').focus();
  });
  app.querySelector('#cancel-join-button')?.addEventListener('click', () => dialog.classList.add('hidden'));
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.classList.add('hidden'); });
  app.querySelector('#join-room-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    dialog.classList.add('hidden');
    joinRoom(app.querySelector('#room-code-input').value);
  });
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      copy.innerHTML = '<i data-lucide="check"></i>';
      createIcons({ icons });
      setTimeout(() => { if (copy.isConnected) { copy.innerHTML = '<i data-lucide="copy"></i>'; createIcons({ icons }); } }, 1400);
    } catch { copy.title = `Room code: ${state.roomCode}`; }
  });
}

function getStatus() {
  const game = state.game;
  if (!state.started) return 'Ready to play';
  if (state.gameOver) {
    if (game.isCheckmate()) return `${game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`;
    if (game.isDraw()) return 'Game drawn';
    if (state.clocks.w <= 0 || state.clocks.b <= 0) return `${state.clocks.w <= 0 ? 'Black' : 'White'} wins on time`;
    return 'Game ended';
  }
  if (game.isCheckmate()) return `${game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`;
  if (game.isStalemate()) return 'Draw by stalemate';
  if (game.isThreefoldRepetition()) return 'Draw by repetition';
  if (game.isInsufficientMaterial()) return 'Draw: insufficient material';
  if (game.isDraw()) return 'Draw by the 50-move rule';
  return game.isCheck() ? 'Check' : 'Game in progress';
}

function resetGame(announce = true) {
  clearInterval(state.timer);
  state.game = new Chess();
  state.flipped = false;
  state.clocks = { w: durations[state.timeControl], b: durations[state.timeControl] };
  state.selected = null;
  state.legalMoves = [];
  state.lastMove = null;
  state.started = false;
  state.gameOver = false;
  state.thinking = false;
  if (state.mode !== 'online') state.side = 'w';
  if (announce && state.connection) state.connection.send({ type: 'reset', timeControl: state.timeControl });
  startClock();
  render();
}

function startGame() {
  if (state.started && !state.gameOver) {
    resetGame();
    return;
  }
  if (state.gameOver) resetGame();
  state.started = true;
  state.gameOver = false;
  startClock();
  if (state.connection) state.connection.send({ type: 'start', timeControl: state.timeControl });
  render();
}

function setMode(mode) {
  if (state.mode === mode) return;
  if (state.peer) {
    state.connection?.close();
    state.peer.destroy();
  }
  state.peer = null;
  state.connection = null;
  state.roomCode = '';
  state.remoteName = 'Opponent';
  state.mode = mode;
  resetGame();
}

function startClock() {
  clearInterval(state.timer);
  if (!state.started || !durations[state.timeControl]) return;
  state.clockTurn = state.game.turn();
  state.lastClockAt = performance.now();
  state.timer = setInterval(() => {
    updateClock();
    render();
  }, 1000);
}

function updateClock() {
  if (!state.started || !durations[state.timeControl] || state.gameOver) return;
  const now = performance.now();
  const elapsed = (now - state.lastClockAt) / 1000;
  state.lastClockAt = now;
  state.clocks[state.clockTurn] = Math.max(0, state.clocks[state.clockTurn] - elapsed);
  if (state.clocks[state.clockTurn] === 0) {
    state.gameOver = true;
    clearInterval(state.timer);
  }
}

function handleSquareClick(square) {
  if (!state.started || state.gameOver || state.thinking || (state.mode === 'online' && state.game.turn() !== state.side)) return;
  const piece = state.game.get(square);
  if (state.selected && state.legalMoves.some((move) => move.to === square)) {
    const candidate = state.legalMoves.find((move) => move.to === square);
    if (candidate.promotion) {
      showPromotionDialog(state.selected, square);
      return;
    }
    makeMove({ from: state.selected, to: square });
    return;
  }
  if (piece?.color === state.game.turn()) {
    state.selected = square;
    state.legalMoves = state.game.moves({ square, verbose: true });
  } else {
    state.selected = null;
    state.legalMoves = [];
  }
  render();
}

function makeMove(move) {
  try {
    if (!state.started || state.gameOver) return;
    updateClock();
    if (state.gameOver) { render(); return; }
    const result = state.game.move(move);
    if (state.mode === 'local') state.flipped = state.game.turn() === 'b';
    state.clockTurn = state.game.turn();
    state.lastClockAt = performance.now();
    state.lastMove = { from: result.from, to: result.to };
    state.selected = null;
    state.legalMoves = [];
    state.gameOver = state.game.isGameOver();
    if (state.connection) state.connection.send({ type: 'move', move: { from: result.from, to: result.to, promotion: result.promotion } });
    if (state.gameOver) clearInterval(state.timer);
    render();
    if (state.mode === 'computer' && !state.gameOver && state.game.turn() === 'b') scheduleComputerMove();
  } catch (error) {
    console.error('Unable to make chess move:', error);
  }
}

function showPromotionDialog(from, to) {
  const dialog = app.querySelector('#promotion-dialog');
  dialog.classList.remove('hidden');
  dialog.querySelectorAll('[data-promote]').forEach((button) => {
    button.onclick = () => {
      dialog.classList.add('hidden');
      makeMove({ from, to, promotion: button.dataset.promote });
    };
  });
}

function completePromotion(type) {
  const button = app.querySelector(`[data-promote="${type}"]`);
  button?.click();
}

function scheduleComputerMove() {
  state.thinking = true;
  render();
  setTimeout(() => {
    if (!state.started || state.gameOver || state.mode !== 'computer') { state.thinking = false; return; }
    const move = chooseComputerMove(levels[state.difficulty]);
    state.thinking = false;
    if (move) makeMove(move);
  }, 280);
}

function chooseComputerMove(depth) {
  const moves = state.game.moves({ verbose: true });
  if (!moves.length) return null;
  let bestScore = -Infinity;
  let bestMoves = [];
  for (const move of moves) {
    state.game.move(move);
    const score = -search(depth - 1, -Infinity, Infinity, 'w');
    state.game.undo();
    if (score > bestScore) { bestScore = score; bestMoves = [move]; }
    else if (score === bestScore) bestMoves.push(move);
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function search(depth, alpha, beta, color) {
  if (state.game.isCheckmate()) return -100000 - depth;
  if (state.game.isDraw()) return 0;
  if (depth <= 0) return evaluatePosition(color);
  let best = -Infinity;
  const moves = state.game.moves({ verbose: true }).sort((a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)));
  for (const move of moves) {
    state.game.move(move);
    const score = -search(depth - 1, -beta, -alpha, color === 'w' ? 'b' : 'w');
    state.game.undo();
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

function evaluatePosition(color) {
  const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
  let score = 0;
  const board = state.game.board();
  for (let row = 0; row < 8; row += 1) {
    const rank = 8 - row;
    for (let column = 0; column < 8; column += 1) {
      const piece = board[row][column];
      if (!piece) continue;
      const advance = piece.color === 'w' ? rank - 2 : 7 - rank;
      const center = 3.5 - (Math.abs(column - 3.5) + Math.abs(rank - 4.5)) / 2;
      let value = values[piece.type];
      if (piece.type === 'p') value += advance * 9 + center * 4;
      if (piece.type === 'n' || piece.type === 'b') value += center * 9;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

function undoMove() {
  if (!state.started || !state.game.history().length || state.gameOver || state.thinking) return;
  state.game.undo();
  if (state.mode === 'computer' && state.game.history().length) state.game.undo();
  if (state.mode === 'local') state.flipped = state.game.turn() === 'b';
  state.lastMove = state.game.history({ verbose: true }).at(-1) ?? null;
  if (state.lastMove) state.lastMove = { from: state.lastMove.from, to: state.lastMove.to };
  state.selected = null;
  state.legalMoves = [];
  if (state.mode !== 'online') state.side = 'w';
  state.clockTurn = state.game.turn();
  state.lastClockAt = performance.now();
  if (durations[state.timeControl]) state.clocks[state.game.turn()] = Math.max(1, state.clocks[state.game.turn()]);
  render();
}

function resign() {
  if (!state.started || state.gameOver || !state.game.history().length) return;
  state.gameOver = true;
  clearInterval(state.timer);
  render();
}

function createRoom() {
  if (state.peer) state.peer.destroy();
  state.side = 'w';
  state.remoteName = 'Opponent';
  state.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  state.peer = new Peer(`chessclub-${state.roomCode}`);
  resetGame(false);
  state.peer.on('open', () => render());
  state.peer.on('connection', (connection) => {
    state.connection = connection;
    wireConnection(connection);
    render();
  });
  state.peer.on('error', (error) => {
    console.error('Online room error:', error);
    window.alert('Could not create the room. Check your internet connection and try again.');
    state.roomCode = '';
    render();
  });
  render();
}

function joinRoom(code) {
  if (!code?.trim()) return;
  const normalized = code.trim().toUpperCase();
  if (state.peer) state.peer.destroy();
  state.side = 'b';
  state.remoteName = 'Opponent';
  state.roomCode = normalized;
  state.peer = new Peer();
  resetGame(false);
  state.peer.on('open', () => {
    state.connection = state.peer.connect(`chessclub-${normalized}`, { reliable: true });
    state.connection.on('open', () => {
      wireConnection(state.connection);
      render();
    });
    state.connection.on('error', (error) => {
      console.error('Could not join online room:', error);
      window.alert('Could not join that room. Check the code and try again.');
      state.connection = null;
      state.roomCode = '';
      render();
    });
  });
  state.peer.on('error', (error) => {
    console.error('Online connection error:', error);
    window.alert('Could not connect. Check your internet connection and try again.');
    state.roomCode = '';
    render();
  });
  render();
}

function wireConnection(connection) {
  const sendProfile = () => {
    connection.send({ type: 'profile', name: state.names[state.side] });
  };
  if (connection.open) sendProfile();
  connection.on('open', () => {
    sendProfile();
    render();
  });
  connection.on('data', (data) => {
    if (data?.type === 'profile' && typeof data.name === 'string') {
      state.remoteName = data.name.trim().slice(0, 18) || 'Opponent';
      render();
      return;
    }
    if (data?.type === 'reset') {
      if (durations[data.timeControl] !== undefined) state.timeControl = data.timeControl;
      resetGame(false);
      return;
    }
    if (data?.type === 'start') {
      if (state.started) return;
      if (durations[data.timeControl] !== undefined) {
        state.timeControl = data.timeControl;
        state.clocks = { w: durations[state.timeControl], b: durations[state.timeControl] };
      }
      state.started = true;
      state.gameOver = false;
      startClock();
      render();
      return;
    }
    if (data?.type === 'move' && data.move) {
      try {
        if (!state.started) return;
        updateClock();
        if (state.gameOver) { render(); return; }
        const result = state.game.move(data.move);
        if (state.mode === 'local') state.flipped = state.game.turn() === 'b';
        state.clockTurn = state.game.turn();
        state.lastClockAt = performance.now();
        state.lastMove = { from: result.from, to: result.to };
        state.gameOver = state.game.isGameOver();
        if (state.gameOver) clearInterval(state.timer);
        render();
      } catch (error) {
        console.error('Received an invalid online move:', error);
      }
    }
  });
  connection.on('close', () => {
    state.connection = null;
    render();
  });
}

resetGame();
