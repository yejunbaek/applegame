(function () {
  // ---- Difficulty presets -------------------------------------------------
  // COLS/ROWS/MAX_VALUE are now mutable and set by applyDifficulty() at game
  // start based on the menu selection, instead of being fixed module consts.
  const DIFFICULTIES = {
    easy:   { cols: 10, rows: 6,  maxValue: 5, label: 'Easy' },
    normal: { cols: 17, rows: 10, maxValue: 9, label: 'Normal' },
    hard:   { cols: 19, rows: 12, maxValue: 9, label: 'Hard' },
  };
  const TIME_OPTIONS = [30, 60, 120, 180]; // seconds; 'zen' handled separately
  const DEFAULT_DIFFICULTY = 'normal';
  const DEFAULT_SECONDS = 60;

  const LEVELS = [
    { cols: 6,  rows: 4, maxValue: 3, seconds: 90, target: 10 },
    { cols: 6,  rows: 5, maxValue: 3, seconds: 90, target: 14 },
    { cols: 7,  rows: 5, maxValue: 4, seconds: 80, target: 20 },
    { cols: 8,  rows: 5, maxValue: 4, seconds: 75, target: 26 },
    { cols: 8,  rows: 6, maxValue: 5, seconds: 70, target: 32 },
    { cols: 9,  rows: 6, maxValue: 5, seconds: 65, target: 38 },
    { cols: 10, rows: 7, maxValue: 6, seconds: 60, target: 46 },
    { cols: 11, rows: 7, maxValue: 7, seconds: 55, target: 54 },
    { cols: 12, rows: 8, maxValue: 8, seconds: 50, target: 64 },
    { cols: 14, rows: 9, maxValue: 9, seconds: 50, target: 75 },
  ];

  const LS_SETTINGS_KEY = 'appleGame.settings';
  const LS_BEST_KEY = 'appleGame.bestScores';
  const LS_TUTORIAL_KEY = 'appleGame.tutorialSeen';
  const LS_LEVEL_PROGRESS_KEY = 'appleGame.levelProgress';

  let COLS = DIFFICULTIES[DEFAULT_DIFFICULTY].cols;
  let ROWS = DIFFICULTIES[DEFAULT_DIFFICULTY].rows;
  let MAX_VALUE = DIFFICULTIES[DEFAULT_DIFFICULTY].maxValue;
  let GAME_SECONDS = DEFAULT_SECONDS;

  let selectedDifficulty = DEFAULT_DIFFICULTY;
  let selectedTime = DEFAULT_SECONDS; // number of seconds, or 'zen'
  let zenMode = false;

  let gameMode = 'classic'; // 'classic' | 'levels'
  let currentLevel = 0; // 1-based index into LEVELS when gameMode === 'levels'
  let levelTarget = 0;

  const board = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const selectionBox = document.getElementById('selection-box');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const sumEl = document.getElementById('selected-sum');
  const startOverlay = document.getElementById('start-overlay');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const gameoverTitleEl = document.getElementById('gameover-title');
  const finalScoreEl = document.getElementById('final-score');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const classicBackBtn = document.getElementById('classic-back-btn');
  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseContinueBtn = document.getElementById('pause-continue-btn');
  const pauseRetryBtn = document.getElementById('pause-retry-btn');
  const pauseQuitBtn = document.getElementById('pause-quit-btn');

  const lobbyOverlay = document.getElementById('lobby-overlay');
  const lobbyLevelsBtn = document.getElementById('lobby-levels-btn');
  const lobbyClassicBtn = document.getElementById('lobby-classic-btn');
  const lobbySettingsBtn = document.getElementById('lobby-settings-btn');

  const levelSelectOverlay = document.getElementById('level-select-overlay');
  const levelGridEl = document.getElementById('level-grid');
  const levelSelectBackBtn = document.getElementById('level-select-back-btn');

  const levelResultOverlay = document.getElementById('level-result-overlay');
  const levelResultTitleEl = document.getElementById('level-result-title');
  const levelResultScoreEl = document.getElementById('level-result-score');
  const levelNextBtn = document.getElementById('level-next-btn');
  const levelRetryBtn = document.getElementById('level-retry-btn');
  const levelBackBtn = document.getElementById('level-back-btn');

  const difficultyOptionsEl = document.getElementById('difficulty-options');
  const timerOptionsEl = document.getElementById('timer-options');
  const bestScoreDisplayEl = document.getElementById('best-score-display');
  const gameoverBestEl = document.getElementById('gameover-best');
  const newBestCalloutEl = document.getElementById('new-best-callout');

  const helpBtnMenu = document.getElementById('help-btn-menu');
  const helpBtnHud = document.getElementById('help-btn-hud');
  const pauseBtnHud = document.getElementById('pause-btn-hud');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const tutorialCloseBtn = document.getElementById('tutorial-close-btn');
  const soundToggle = document.getElementById('sound-toggle');
  const bigToggle = document.getElementById('big-toggle');
  const themeToggle = document.getElementById('theme-toggle');

  let cells = []; // {row, col, value, removed, el}
  let cellSize = 0;
  let boardRect = { left: 0, top: 0 };
  let score = 0;
  let timeLeft = GAME_SECONDS;
  let elapsed = 0;
  let timerId = null;
  let running = false;
  let paused = false;
  let tutorialPausedGame = false;

  let dragging = false;
  let startRow = 0, startCol = 0, curRow = 0, curCol = 0;
  // Last rectangle actually rendered to the DOM (for diff-based updates), or
  // null when nothing is currently marked selected.
  let renderedRect = null;
  // rAF-coalescing state for pointermove: we only want to do the (still cheap,
  // but non-zero) selection recompute + DOM write once per animation frame,
  // even if the browser delivers many pointermove events per frame during a
  // fast touch drag.
  let pendingClientX = 0, pendingClientY = 0;
  let moveRafScheduled = false;

  // ---- Settings / persistence ---------------------------------------------
  const settings = loadSettings();
  applySettingsToUI();
  applySettingsToDom();

  const bestScores = loadBestScores();
  const levelProgress = loadLevelProgress();

  // ---- Sound ----------------------------------------------------------------
  let audioCtx = null;
  // Exposed purely so automated tests can confirm the sound code path is
  // (or isn't) invoked without needing actual audio playback.
  window.__appleGameTestHooks = {
    soundPlayCount: 0,
    getSettings: () => ({ ...settings }),
    getBestScores: () => ({ ...bestScores }),
    getState: () => ({
      cols: COLS, rows: ROWS, maxValue: MAX_VALUE,
      running, zenMode, timeLeft, score,
      selectedDifficulty, selectedTime,
      gameMode, currentLevel, levelTarget,
    }),
  };

  function playPopSound() {
    window.__appleGameTestHooks.soundPlayCount++;
    if (!settings.sound) return;
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch (err) {
      // WebAudio unavailable; silently ignore.
    }
  }

  function loadSettings() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(LS_SETTINGS_KEY)); } catch (e) {}
    return Object.assign({ sound: true, big: false, theme: 'dark' }, parsed || {});
  }

  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function applySettingsToUI() {
    setToggleBtn(soundToggle, settings.sound, 'On', 'Off');
    setToggleBtn(bigToggle, settings.big, 'On', 'Off');
    setToggleBtn(themeToggle, settings.theme === 'light', 'Light', 'Dark');
  }

  function setToggleBtn(btn, on, onLabel, offLabel) {
    btn.dataset.on = String(on);
    btn.textContent = on ? onLabel : offLabel;
  }

  function applySettingsToDom() {
    document.body.classList.toggle('big-mode', !!settings.big);
    document.body.classList.toggle('theme-light', settings.theme === 'light');
  }

  function loadBestScores() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(LS_BEST_KEY)); } catch (e) {}
    return Object.assign({ easy: 0, normal: 0, hard: 0 }, parsed || {});
  }

  function saveBestScores() {
    try { localStorage.setItem(LS_BEST_KEY, JSON.stringify(bestScores)); } catch (e) {}
  }

  function loadLevelProgress() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(LS_LEVEL_PROGRESS_KEY)); } catch (e) {}
    return Object.assign({ unlocked: 1, completed: [] }, parsed || {});
  }

  function saveLevelProgress() {
    try { localStorage.setItem(LS_LEVEL_PROGRESS_KEY, JSON.stringify(levelProgress)); } catch (e) {}
  }

  function refreshBestScoreDisplay() {
    bestScoreDisplayEl.textContent = `Best: ${bestScores[selectedDifficulty] || 0}`;
  }

  // ---- Menu option selection -----------------------------------------------
  function setupOptionGroup(container, onSelect, initialValue) {
    const buttons = Array.from(container.querySelectorAll('.option-btn'));
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === String(initialValue));
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.value);
      });
    });
  }

  setupOptionGroup(difficultyOptionsEl, (value) => {
    selectedDifficulty = value;
    refreshBestScoreDisplay();
  }, selectedDifficulty);

  setupOptionGroup(timerOptionsEl, (value) => {
    selectedTime = value === 'zen' ? 'zen' : parseInt(value, 10);
  }, selectedTime);

  refreshBestScoreDisplay();

  // ---- Grid building / layout ----------------------------------------------
  function applyDifficulty(diffKey) {
    const cfg = DIFFICULTIES[diffKey] || DIFFICULTIES[DEFAULT_DIFFICULTY];
    COLS = cfg.cols;
    ROWS = cfg.rows;
    MAX_VALUE = cfg.maxValue;
  }

  function computeEffectiveSeconds(diffKey, baseSeconds) {
    if (diffKey === 'hard') {
      return Math.max(15, Math.round(baseSeconds * 0.8));
    }
    return baseSeconds;
  }

  function buildGrid() {
    board.innerHTML = '';
    cells = [];
    renderedRect = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const value = 1 + Math.floor(Math.random() * MAX_VALUE);
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

  function inRect(rect, r, c) {
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
  }

  // Perf-critical: called on every pointermove during a drag. On Hard mode
  // (228 cells) the old implementation looped over the ENTIRE grid every
  // single call, toggling classList on every cell whether or not its
  // selected-state actually changed. That's the dominant cost of the
  // drag-lag: unnecessary classList writes (each one is a potential style
  // recalc/paint) on cells that were already correct, times up to 228,
  // times however many pointermove events fire per second.
  //
  // Fix: diff the previous rendered rectangle against the new one and only
  // touch cells whose membership actually flipped (entered or left the
  // selection). For a typical drag (growing/shrinking by a row or column at
  // a time) this is O(perimeter delta) instead of O(ROWS*COLS) — a handful
  // of cells instead of all of them. The sum/count readout is computed by
  // iterating only the new rectangle's cells (bounded by selection size, not
  // grid size), which is also far cheaper than a full-grid scan.
  function updateSelectionVisual() {
    const rect = rectBounds();
    selectionBox.style.display = 'block';
    selectionBox.style.left = (rect.c0 * cellSize) + 'px';
    selectionBox.style.top = (rect.r0 * cellSize) + 'px';
    selectionBox.style.width = ((rect.c1 - rect.c0 + 1) * cellSize) + 'px';
    selectionBox.style.height = ((rect.r1 - rect.r0 + 1) * cellSize) + 'px';

    const prev = renderedRect;

    // Un-select cells that were in the previous rect but are not in the new one.
    if (prev) {
      for (let r = prev.r0; r <= prev.r1; r++) {
        for (let c = prev.c0; c <= prev.c1; c++) {
          if (!inRect(rect, r, c)) {
            cellAt(r, c).el.classList.remove('selected');
          }
        }
      }
    }

    // Select cells that are in the new rect but weren't already selected.
    let sum = 0;
    let count = 0;
    for (let r = rect.r0; r <= rect.r1; r++) {
      for (let c = rect.c0; c <= rect.c1; c++) {
        const cell = cellAt(r, c);
        if (cell.removed) continue;
        sum += cell.value;
        count++;
        if (!prev || !inRect(prev, r, c)) {
          cell.el.classList.add('selected');
        }
      }
    }

    renderedRect = rect;
    sumEl.textContent = count > 0 ? sum : '–';
    return { sum, count };
  }

  function clearSelectionVisual() {
    selectionBox.style.display = 'none';
    sumEl.textContent = '–';
    if (renderedRect) {
      for (let r = renderedRect.r0; r <= renderedRect.r1; r++) {
        for (let c = renderedRect.c0; c <= renderedRect.c1; c++) {
          cellAt(r, c).el.classList.remove('selected');
        }
      }
    }
    renderedRect = null;
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
      updateScoreDisplay();
      playPopSound();
      clearSelectionVisual();
      if (gameMode === 'levels' && score >= levelTarget) {
        endLevelGame('win');
        return;
      }
      if (running && !hasValidMove()) {
        if (gameMode === 'levels') {
          endLevelGame('lose');
        } else {
          endGame('nomoves');
        }
        return;
      }
    }
    clearSelectionVisual();
  }

  function updateScoreDisplay() {
    scoreEl.textContent = gameMode === 'levels' ? `${score}/${levelTarget}` : String(score);
  }

  // Any remaining sum-to-10 rectangle left to clear? Removed cells count as 0.
  // For each pair of rows we accumulate the column sums for that row-band,
  // then slide a two-pointer window over columns (valid since all values are
  // >= 0, so the running sum is monotonic) to find a contiguous span that
  // adds up to exactly 10. This is O(ROWS^2 * COLS), cheap enough to run
  // after every successful clear even on the largest (Hard) board.
  function hasValidMove() {
    const colAcc = new Array(COLS).fill(0);
    for (let r0 = 0; r0 < ROWS; r0++) {
      colAcc.fill(0);
      for (let r1 = r0; r1 < ROWS; r1++) {
        for (let c = 0; c < COLS; c++) {
          const cell = cellAt(r1, c);
          colAcc[c] += cell.removed ? 0 : cell.value;
        }
        let windowSum = 0;
        let left = 0;
        for (let right = 0; right < COLS; right++) {
          windowSum += colAcc[right];
          while (windowSum > 10 && left <= right) {
            windowSum -= colAcc[left];
            left++;
          }
          if (windowSum === 10 && left <= right) return true;
        }
      }
    }
    return false;
  }

  function onPointerDown(e) {
    if (!running || paused) return;
    const { row, col } = clientToCell(e.clientX, e.clientY);
    dragging = true;
    startRow = curRow = row;
    startCol = curCol = col;
    updateSelectionVisual();
    boardWrap.setPointerCapture && e.pointerId != null && board.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  // Touch/mouse pointermove can fire far more often than the display can
  // paint (some Android WebViews deliver well over 60 events/sec during a
  // fast drag). Doing a DOM read+write on every single event is wasted work
  // once more than one event lands in the same frame. Instead we just stash
  // the latest coordinates and schedule (at most) one rAF callback to do the
  // actual recompute+DOM write, coalescing any backlog of pointermove events
  // into a single update per animation frame.
  function onPointerMove(e) {
    if (!dragging) return;
    pendingClientX = e.clientX;
    pendingClientY = e.clientY;
    e.preventDefault();
    if (!moveRafScheduled) {
      moveRafScheduled = true;
      requestAnimationFrame(processPendingMove);
    }
  }

  function processPendingMove() {
    moveRafScheduled = false;
    if (!dragging) return;
    const { row, col } = clientToCell(pendingClientX, pendingClientY);
    if (row === curRow && col === curCol) return;
    curRow = row;
    curCol = col;
    updateSelectionVisual();
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
    if (zenMode) {
      elapsed++;
      timeEl.textContent = '∞';
      return;
    }
    timeLeft--;
    timeEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      if (gameMode === 'levels') {
        endLevelGame('lose');
      } else {
        endGame();
      }
    }
  }

  function startGame() {
    gameMode = 'classic';
    applyDifficulty(selectedDifficulty);
    zenMode = selectedTime === 'zen';
    GAME_SECONDS = zenMode ? 0 : computeEffectiveSeconds(selectedDifficulty, selectedTime);

    score = 0;
    elapsed = 0;
    timeLeft = GAME_SECONDS;
    updateScoreDisplay();
    timeEl.textContent = zenMode ? '∞' : String(timeLeft);
    lobbyOverlay.classList.add('hidden');
    levelSelectOverlay.classList.add('hidden');
    levelResultOverlay.classList.add('hidden');
    startOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    buildGrid();
    running = true;
    paused = false;
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function startLevel(levelIndex) {
    const level = LEVELS[levelIndex - 1];
    if (!level) return;
    gameMode = 'levels';
    currentLevel = levelIndex;
    levelTarget = level.target;
    COLS = level.cols;
    ROWS = level.rows;
    MAX_VALUE = level.maxValue;
    zenMode = false;
    GAME_SECONDS = level.seconds;

    score = 0;
    elapsed = 0;
    timeLeft = GAME_SECONDS;
    updateScoreDisplay();
    timeEl.textContent = String(timeLeft);
    lobbyOverlay.classList.add('hidden');
    levelSelectOverlay.classList.add('hidden');
    levelResultOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    buildGrid();
    running = true;
    paused = false;
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function endGame(reason) {
    running = false;
    paused = false;
    clearInterval(timerId);
    dragging = false;
    clearSelectionVisual();
    pauseOverlay.classList.add('hidden');
    finalScoreEl.textContent = score;
    gameoverTitleEl.textContent = reason === 'nomoves' ? 'No More Moves!'
      : reason === 'quit' ? 'Game Over'
      : "Time's Up!";

    const prevBest = bestScores[selectedDifficulty] || 0;
    const isNewBest = score > prevBest;
    if (isNewBest) {
      bestScores[selectedDifficulty] = score;
      saveBestScores();
    }
    newBestCalloutEl.classList.toggle('hidden', !isNewBest);
    gameoverBestEl.textContent = `Best: ${bestScores[selectedDifficulty] || 0}`;
    refreshBestScoreDisplay();

    gameoverOverlay.classList.remove('hidden');
  }

  function endLevelGame(result) {
    running = false;
    paused = false;
    clearInterval(timerId);
    dragging = false;
    clearSelectionVisual();
    pauseOverlay.classList.add('hidden');

    const won = result === 'win';
    if (won) {
      if (levelProgress.completed.indexOf(currentLevel) === -1) {
        levelProgress.completed.push(currentLevel);
      }
      levelProgress.unlocked = Math.max(levelProgress.unlocked, Math.min(currentLevel + 1, LEVELS.length));
      saveLevelProgress();
    }

    levelResultTitleEl.textContent = won ? 'Level Complete!' : "Time's Up!";
    levelResultScoreEl.textContent = `Score: ${score} / ${levelTarget}`;
    levelNextBtn.classList.toggle('hidden', !(won && currentLevel < LEVELS.length));
    levelResultOverlay.classList.remove('hidden');
  }

  function quitLevelToSelect() {
    running = false;
    paused = false;
    clearInterval(timerId);
    dragging = false;
    clearSelectionVisual();
    pauseOverlay.classList.add('hidden');
    showLevelSelect();
  }

  // ---- Lobby / level-select navigation --------------------------------------
  function showLobby() {
    startOverlay.classList.add('hidden');
    levelSelectOverlay.classList.add('hidden');
    levelResultOverlay.classList.add('hidden');
    lobbyOverlay.classList.remove('hidden');
  }

  function showClassicMenu() {
    lobbyOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
  }

  function showLevelSelect() {
    lobbyOverlay.classList.add('hidden');
    levelResultOverlay.classList.add('hidden');
    renderLevelSelect();
    levelSelectOverlay.classList.remove('hidden');
  }

  function renderLevelSelect() {
    levelGridEl.innerHTML = '';
    LEVELS.forEach((level, i) => {
      const levelIndex = i + 1;
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      btn.textContent = String(levelIndex);
      const unlocked = levelIndex <= levelProgress.unlocked;
      const completed = levelProgress.completed.indexOf(levelIndex) !== -1;
      btn.classList.toggle('unlocked', unlocked);
      btn.classList.toggle('completed', completed);
      btn.classList.toggle('locked', !unlocked);
      btn.disabled = !unlocked;
      if (unlocked) {
        btn.addEventListener('click', () => {
          tryFullscreenAndOrientation();
          startLevel(levelIndex);
        });
      }
      levelGridEl.appendChild(btn);
    });
  }

  lobbyLevelsBtn.addEventListener('click', showLevelSelect);
  lobbyClassicBtn.addEventListener('click', showClassicMenu);
  lobbySettingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
  });
  classicBackBtn.addEventListener('click', showLobby);
  levelSelectBackBtn.addEventListener('click', showLobby);

  levelNextBtn.addEventListener('click', () => {
    tryFullscreenAndOrientation();
    startLevel(currentLevel + 1);
  });
  levelRetryBtn.addEventListener('click', () => {
    tryFullscreenAndOrientation();
    startLevel(currentLevel);
  });
  levelBackBtn.addEventListener('click', () => {
    levelResultOverlay.classList.add('hidden');
    showLevelSelect();
  });

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
    startOverlay.classList.remove('hidden');
    gameoverOverlay.classList.add('hidden');
  });

  function openPause() {
    if (!running || paused) return;
    paused = true;
    dragging = false;
    clearSelectionVisual();
    clearInterval(timerId);
    pauseOverlay.classList.remove('hidden');
  }

  function closePauseAndResume() {
    paused = false;
    pauseOverlay.classList.add('hidden');
    if (running) timerId = setInterval(tick, 1000);
  }

  pauseBtnHud.addEventListener('click', openPause);

  pauseContinueBtn.addEventListener('click', closePauseAndResume);

  pauseRetryBtn.addEventListener('click', () => {
    paused = false;
    pauseOverlay.classList.add('hidden');
    if (gameMode === 'levels') {
      startLevel(currentLevel);
    } else {
      startGame();
    }
  });

  pauseQuitBtn.addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    if (gameMode === 'levels') {
      quitLevelToSelect();
    } else {
      endGame('quit');
    }
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ---- Tutorial overlay -------------------------------------------------
  function openTutorial() {
    tutorialPausedGame = running;
    if (running) clearInterval(timerId);
    tutorialOverlay.classList.remove('hidden');
  }
  function closeTutorial() {
    tutorialOverlay.classList.add('hidden');
    try { localStorage.setItem(LS_TUTORIAL_KEY, 'true'); } catch (e) {}
    if (tutorialPausedGame && running) {
      timerId = setInterval(tick, 1000);
    }
    tutorialPausedGame = false;
  }
  helpBtnMenu.addEventListener('click', openTutorial);
  helpBtnHud.addEventListener('click', openTutorial);
  tutorialCloseBtn.addEventListener('click', closeTutorial);

  let hasSeenTutorial = false;
  try { hasSeenTutorial = localStorage.getItem(LS_TUTORIAL_KEY) === 'true'; } catch (e) {}
  if (!hasSeenTutorial) {
    openTutorial();
  }

  // ---- Settings overlay ---------------------------------------------------
  settingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
  });
  settingsCloseBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
  });

  soundToggle.addEventListener('click', () => {
    settings.sound = !settings.sound;
    setToggleBtn(soundToggle, settings.sound, 'On', 'Off');
    saveSettings();
  });
  bigToggle.addEventListener('click', () => {
    settings.big = !settings.big;
    setToggleBtn(bigToggle, settings.big, 'On', 'Off');
    applySettingsToDom();
    saveSettings();
  });
  themeToggle.addEventListener('click', () => {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    setToggleBtn(themeToggle, settings.theme === 'light', 'Light', 'Dark');
    applySettingsToDom();
    saveSettings();
  });

  buildGrid();
})();
