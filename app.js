/* Basic Minesweeper (no dependencies) */
(() => {
  /** @typedef {{x:number,y:number,isMine:boolean,adj:number,open:boolean,flagged:boolean}} Cell */

  const boardEl = document.getElementById("board");
  const presetEl = document.getElementById("preset");
  const newGameEl = document.getElementById("newGame");
  const minesLeftEl = document.getElementById("minesLeft");
  const timeEl = document.getElementById("time");
  const statusEl = document.getElementById("status");
  const customControlsEl = document.getElementById("customControls");
  const customWEl = document.getElementById("customW");
  const customHEl = document.getElementById("customH");
  const customMEl = document.getElementById("customM");

  const PRESETS = {
    beginner: { w: 9, h: 9, mines: 10 },
    intermediate: { w: 16, h: 16, mines: 40 },
    expert: { w: 30, h: 16, mines: 99 },
  };

  /** @type {{w:number,h:number,mines:number,firstClickDone:boolean,over:boolean,won:boolean,flags:number,opened:number,grid:Cell[][],timerId:number|null,startAt:number|null}} */
  let state;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function neighbors(x, y) {
    /** @type {{x:number,y:number}[]} */
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < state.w && ny >= 0 && ny < state.h) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  function setStatus(text, kind = "") {
    statusEl.textContent = text || "";
    statusEl.classList.remove("win", "lose");
    if (kind) statusEl.classList.add(kind);
  }

  function updateHUD() {
    minesLeftEl.textContent = String(state.mines - state.flags);
    if (!state.startAt) timeEl.textContent = "0";
  }

  function stopTimer() {
    if (!state) return;
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function ensureTimerRunning() {
    if (state.timerId) return;
    state.timerId = window.setInterval(() => {
      if (!state.startAt) return;
      const sec = Math.floor((Date.now() - state.startAt) / 1000);
      timeEl.textContent = String(sec);
    }, 250);
  }

  function buildEmptyGrid() {
    /** @type {Cell[][]} */
    const g = [];
    for (let y = 0; y < state.h; y++) {
      const row = [];
      for (let x = 0; x < state.w; x++) {
        row.push({ x, y, isMine: false, adj: 0, open: false, flagged: false });
      }
      g.push(row);
    }
    return g;
  }

  function placeMinesAvoiding(safeSet) {
    // safeSet: Set of "x,y" that must not contain mines
    const total = state.w * state.h;
    const allowed = [];
    for (let i = 0; i < total; i++) {
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      const k = `${x},${y}`;
      if (!safeSet.has(k)) allowed.push({ x, y });
    }

    const maxMines = allowed.length - 1;
    state.mines = clamp(state.mines, 1, Math.max(1, maxMines));

    // Fisher-Yates shuffle (partial)
    for (let i = allowed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allowed[i], allowed[j]] = [allowed[j], allowed[i]];
    }

    for (let i = 0; i < state.mines; i++) {
      const { x, y } = allowed[i];
      state.grid[y][x].isMine = true;
    }
  }

  function recomputeAdjacency() {
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const c = state.grid[y][x];
        if (c.isMine) {
          c.adj = 0;
          continue;
        }
        let n = 0;
        for (const p of neighbors(x, y)) if (state.grid[p.y][p.x].isMine) n++;
        c.adj = n;
      }
    }
  }

  function getCellEl(x, y) {
    return boardEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  }

  function render() {
    boardEl.style.gridTemplateColumns = `repeat(${state.w}, 34px)`;
    boardEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const btn = document.createElement("button");
        btn.className = "cell";
        btn.type = "button";
        btn.setAttribute("role", "gridcell");
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.setAttribute("aria-label", `Клетка ${x + 1}, ${y + 1}`);
        frag.appendChild(btn);
      }
    }
    boardEl.appendChild(frag);
    paintAll();
  }

  function paintCell(c) {
    const el = /** @type {HTMLButtonElement|null} */ (getCellEl(c.x, c.y));
    if (!el) return;

    el.classList.toggle("open", c.open);
    el.classList.toggle("flagged", c.flagged);
    el.classList.toggle("mine", c.isMine);
    el.classList.remove("wrong-flag");
    el.textContent = "";

    if (c.open && !c.isMine && c.adj > 0) {
      el.textContent = String(c.adj);
      el.classList.add(`num${c.adj}`);
    } else {
      for (let i = 1; i <= 8; i++) el.classList.remove(`num${i}`);
    }

    // Disable after open or when game is over
    el.disabled = state.over ? true : c.open;
  }

  function paintAll() {
    for (let y = 0; y < state.h; y++) for (let x = 0; x < state.w; x++) paintCell(state.grid[y][x]);
    minesLeftEl.textContent = String(state.mines - state.flags);
  }

  function openCell(x, y) {
    if (state.over) return;
    const c = state.grid[y][x];
    if (c.open || c.flagged) return;

    // First click: generate mines so that this cell + its neighbors are safe
    if (!state.firstClickDone) {
      state.firstClickDone = true;
      state.startAt = Date.now();
      ensureTimerRunning();

      const safe = new Set([`${x},${y}`]);
      for (const p of neighbors(x, y)) safe.add(`${p.x},${p.y}`);
      placeMinesAvoiding(safe);
      recomputeAdjacency();
      updateHUD();
    }

    c.open = true;
    state.opened++;

    if (c.isMine) {
      loseAt(x, y);
      return;
    }

    // Flood fill on zeros
    if (c.adj === 0) {
      const q = [{ x, y }];
      const seen = new Set([`${x},${y}`]);
      while (q.length) {
        const p = q.shift();
        if (!p) break;
        for (const n of neighbors(p.x, p.y)) {
          const cc = state.grid[n.y][n.x];
          if (cc.open || cc.flagged) continue;
          cc.open = true;
          state.opened++;
          if (cc.adj === 0) {
            const k = `${n.x},${n.y}`;
            if (!seen.has(k)) {
              seen.add(k);
              q.push({ x: n.x, y: n.y });
            }
          }
        }
      }
    }

    paintAll();
    checkWin();
  }

  function toggleFlag(x, y) {
    if (state.over) return;
    const c = state.grid[y][x];
    if (c.open) return;
    c.flagged = !c.flagged;
    state.flags += c.flagged ? 1 : -1;
    paintCell(c);
    minesLeftEl.textContent = String(state.mines - state.flags);
    checkWin();
  }

  function chordOpen(x, y) {
    if (state.over) return;
    const c = state.grid[y][x];
    if (!c.open || c.isMine || c.adj === 0) return;

    let f = 0;
    const neigh = neighbors(x, y);
    for (const p of neigh) if (state.grid[p.y][p.x].flagged) f++;
    if (f !== c.adj) return;

    for (const p of neigh) openCell(p.x, p.y);
  }

  function loseAt() {
    state.over = true;
    state.won = false;
    stopTimer();

    // Reveal all mines; mark wrong flags
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const c = state.grid[y][x];
        if (c.isMine) c.open = true;
        if (c.flagged && !c.isMine) {
          c.open = true;
          const el = getCellEl(x, y);
          if (el) el.classList.add("wrong-flag");
        }
      }
    }
    paintAll();
    setStatus("Поражение. Нажми «Новая игра».", "lose");
  }

  function checkWin() {
    if (state.over || !state.firstClickDone) return;
    const totalSafe = state.w * state.h - state.mines;
    if (state.opened !== totalSafe) return;

    state.over = true;
    state.won = true;
    stopTimer();
    // Auto-flag all mines
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const c = state.grid[y][x];
        if (c.isMine) c.flagged = true;
      }
    }
    state.flags = state.mines;
    paintAll();
    setStatus("Победа!", "win");
  }

  function parseConfig() {
    const preset = presetEl.value;
    if (preset !== "custom") {
      const p = PRESETS[preset] || PRESETS.beginner;
      return { ...p };
    }
    const w = clamp(Number(customWEl.value || 12), 5, 40);
    const h = clamp(Number(customHEl.value || 12), 5, 30);
    const mines = clamp(Number(customMEl.value || 20), 1, 999);
    return { w, h, mines };
  }

  function newGame() {
    try {
      stopTimer();
      const cfg = parseConfig();
      state = {
        ...cfg,
        firstClickDone: false,
        over: false,
        won: false,
        flags: 0,
        opened: 0,
        grid: [],
        timerId: null,
        startAt: null,
      };
      state.grid = buildEmptyGrid();
      render();
      updateHUD();
      setStatus("Новая игра. Первый клик всегда безопасен.");
      // Helpful for debugging "button does nothing"
      // eslint-disable-next-line no-console
      console.log("[minesweeper] new game", cfg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[minesweeper] newGame failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Ошибка при старте новой игры: ${msg}`, "lose");
    }
  }

  // Events
  boardEl.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    if (!t || !t.classList.contains("cell")) return;
    const x = Number(t.dataset.x);
    const y = Number(t.dataset.y);
    const c = state.grid[y][x];
    if (c.open) chordOpen(x, y);
    else openCell(x, y);
  });

  boardEl.addEventListener("contextmenu", (e) => {
    const t = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    if (!t || !t.classList.contains("cell")) return;
    e.preventDefault();
    const x = Number(t.dataset.x);
    const y = Number(t.dataset.y);
    toggleFlag(x, y);
  });

  presetEl.addEventListener("change", () => {
    const isCustom = presetEl.value === "custom";
    customControlsEl.hidden = !isCustom;
    newGame();
  });
  newGameEl.addEventListener("click", () => newGame());

  // Start
  newGame();
})();

