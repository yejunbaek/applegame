(function () {
  const COLS = 17;
  const ROWS = 10;
  const GAME_SECONDS = 60;

  const board = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const selectionBox = document.getElementById('selection-box');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const sumEl = document.getElementById('selected-sum');
  const startOverlay = document.getElementById('start-overlay');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const finalScoreEl = document.getElementById('final-score');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');

  let cells = []; // {row, col, value, removed, el}
  let cellSize = 0;
  let boardRect = { left: 0, top: 0 };
  let score = 0;
  let timeLeft = GAME_SECONDS;
  let timerId = null;
  let running = false;

  let dragging = false;
  let startRow = 0, startCol = 0, curRow = 0, curCol = 0;

  function buildGrid() {
    board.innerHTML = '';
    cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const value = 1 + Math.floor(Math.random() * 9);
        const el = document.createElement('div');
        el.className = 'apple';
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = value;
        el.appendChild(num);
        board.appendChild(el);
        cells.push({ row: r, col: c, value, removed: false, el });
      }
    }
    layout();
  }

  function layout() {
    const wrapRect = boardWrap.getBoundingClientRect();
    const availW = wrapRect.width * 0.98;
    const availH = wrapRect.height * 0.98;
    cellSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
    board.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
    board.style.gridTemplateRows = `repeat(${ROWS}, ${cellSize}px)`;
    board.style.width = (cellSize * COLS) + 'px';
    board.style.height = (cellSize * ROWS) + 'px';
    requestAnimationFrame(() => {
      const r = board.getBoundingClientRect();
      boardRect = { left: r.left, top: r.top };
    });
  }

  function cellAt(row, col) {
    return cells[row * COLS + col];
  }

  function clientToCell(clientX, clientY) {
    const x = clientX - boardRect.left;
    const y = clientY - boardRect.top;
    let col = Math.floor(x / cellSize);
    let row = Math.floor(y / cellSize);
    col = Math.max(0, Math.min(COLS - 1, col));
    row = Math.max(0, Math.min(ROWS - 1, row));
    return { row, col };
  }

  function rectBounds() {
    return {
      r0: Math.min(startRow, curRow),
      r1: Math.max(startRow, curRow),
      c0: Math.min(startCol, curCol),
      c1: Math.max(startCol, curCol),
    };
  }

  function updateSelectionVisual() {
    const { r0, r1, c0, c1 } = rectBounds();
    selectionBox.style.display = 'block';
    selectionBox.style.left = (c0 * cellSize) + 'px';
    selectionBox.style.top = (r0 * cellSize) + 'px';
    selectionBox.style.width = ((c1 - c0 + 1) * cellSize) + 'px';
    selectionBox.style.height = ((r1 - r0 + 1) * cellSize) + 'px';

    let sum = 0;
    let count = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = cellAt(r, c);
        const inRect = r >= r0 && r <= r1 && c >= c0 && c <= c1;
        if (inRect && !cell.removed) {
          cell.el.classList.add('selected');
          sum += cell.value;
          count++;
        } else {
          cell.el.classList.remove('selected');
        }
      }
    }
    sumEl.textContent = count > 0 ? sum : '–';
    return { sum, count };
  }

  function clearSelectionVisual() {
    selectionBox.style.display = 'none';
    sumEl.textContent = '–';
    cells.forEach(c => c.el.classList.remove('selected'));
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const { r0, r1, c0, c1 } = rectBounds();
    let sum = 0;
    const matched = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cellAt(r, c);
        if (!cell.removed) {
          sum += cell.value;
          matched.push(cell);
        }
      }
    }
    if (sum === 10 && matched.length > 0) {
      matched.forEach(cell => {
        cell.removed = true;
        cell.el.classList.add('removed');
      });
      score += matched.length;
      scoreEl.textContent = score;
    }
    clearSelectionVisual();
  }

  function onPointerDown(e) {
    if (!running) return;
    const { row, col } = clientToCell(e.clientX, e.clientY);
    dragging = true;
    startRow = curRow = row;
    startCol = curCol = col;
    updateSelectionVisual();
    boardWrap.setPointerCapture && e.pointerId != null && board.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const { row, col } = clientToCell(e.clientX, e.clientY);
    if (row === curRow && col === curCol) return;
    curRow = row;
    curCol = col;
    updateSelectionVisual();
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    endDrag();
    e.preventDefault();
  }

  board.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  function tick() {
    timeLeft--;
    timeEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      endGame();
    }
  }

  function startGame() {
    score = 0;
    timeLeft = GAME_SECONDS;
    scoreEl.textContent = '0';
    timeEl.textContent = String(timeLeft);
    startOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    buildGrid();
    running = true;
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function endGame() {
    running = false;
    clearInterval(timerId);
    dragging = false;
    clearSelectionVisual();
    finalScoreEl.textContent = score;
    gameoverOverlay.classList.remove('hidden');
  }

  function tryFullscreenAndOrientation() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }

  startBtn.addEventListener('click', () => {
    tryFullscreenAndOrientation();
    startGame();
  });
  restartBtn.addEventListener('click', () => {
    startGame();
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  buildGrid();
})();
