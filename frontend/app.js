(() => {
  const el = (id) => document.getElementById(id);

  const problemSelect = el("problemSelect");
  const leetcodeLink = el("leetcodeLink");
  const resetCodeBtn = el("resetCodeBtn");
  const editBtn = el("editBtn");
  const testSelect = el("testSelect");
  const runBtn = el("runBtn");
  const runAllBtn = el("runAllBtn");
  const statusLine = el("statusLine");
  const playbackRow = el("playbackRow");
  const stepBack = el("stepBack");
  const playPause = el("playPause");
  const stepFwd = el("stepFwd");
  const scrubber = el("scrubber");
  const speedSlider = el("speedSlider");
  const stepCounter = el("stepCounter");
  const canvasViewport = el("canvasViewport");
  const canvasWorld = el("canvasWorld");
  const recenterBtn = el("recenterBtn");
  const givenBar = el("givenBar");
  const connectorOverlay = el("connectorOverlay");
  const canvasCol = document.querySelector(".canvas-col");

  const state = {
    problem: null,
    steps: [],
    currentStep: 0,
    playing: false,
    playTimer: null,
    activeLineHandle: null,
    currentArgs: [], // editable copy of the selected test's args, shown in the given-bar
    // loop awareness: which for/while loops the source has, which variable
    // belongs to which (outer scope vs a specific loop), and, per loop, the
    // 0-based iteration index at every step (for the "at a glance" preview)
    loops: [],
    varScopes: {},       // name -> {outer: bool, loops: [loop indices]} -- static, from the backend's AST scan
    varScope: {},        // name -> {kind:'outer'} | {kind:'loop', loopIndices: [...]}  (derived per-run in precomputeLayout)
    iterIndexAtStep: [],
    loopBoxes: {},        // loopIdx -> { el, track, varsEl }
    loopZones: {},         // loopIdx -> zone, for the vars living inside that loop box
    // canvas layout / render bookkeeping
    customPos: {}, // name or "loop:N" -> {x,y} the user dragged it to; wins over the auto flow layout
    flow: { x: 30, y: 20, rowH: 0 },
    reservedPos: {},
  };

  const FLOW_MARGIN = 30;
  const FLOW_GAP = 22;
  const FLOW_MAX_WIDTH = 840;

  // A "zone" is one region that owns a set of live shapes: the main
  // pannable canvas (absolutely positioned, ghost-measured ahead of time),
  // or the interior of a loop box (plain flex flow — no reservation needed,
  // since flexbox reflows its own children as they grow/shrink for free).
  function makeZone(container, isStatic) {
    return { shapes: {}, rendered: {}, container, isStatic };
  }

  const mainZone = makeZone(canvasWorld, false);

  const pan = { x: 40, y: 30 };
  let scale = 1;
  let dragging = false;
  let dragStart = null;

  // ---------- pan & zoom ----------
  function applyTransform() {
    canvasWorld.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
    redrawConnectorsForCurrentStep(); // pan/zoom moves everything on screen; connector lines must follow
  }
  canvasViewport.addEventListener("mousedown", (e) => {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    canvasViewport.classList.add("dragging");
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    pan.x = dragStart.panX + (e.clientX - dragStart.x);
    pan.y = dragStart.panY + (e.clientY - dragStart.y);
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    canvasViewport.classList.remove("dragging");
  });
  canvasViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvasViewport.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const worldX = (cx - pan.x) / scale;
    const worldY = (cy - pan.y) / scale;
    const delta = -e.deltaY * 0.0015;
    const newScale = Math.min(2.2, Math.max(0.35, scale + delta));
    pan.x = cx - worldX * newScale;
    pan.y = cy - worldY * newScale;
    scale = newScale;
    applyTransform();
  }, { passive: false });

  recenterBtn.addEventListener("click", () => {
    pan.x = 40; pan.y = 30; scale = 1;
    applyTransform();
  });

  applyTransform();

  // ---------- drag & snap: rearrange shapes for side-by-side comparison ----------
  const SNAP_THRESHOLD_SCREEN_PX = 6; // kept constant on screen regardless of zoom
  let guideXEl = null, guideYEl = null;

  function ensureSnapGuides() {
    if (!guideXEl) {
      guideXEl = document.createElement("div");
      guideXEl.className = "snap-guide snap-guide-v";
      canvasWorld.appendChild(guideXEl);
    }
    if (!guideYEl) {
      guideYEl = document.createElement("div");
      guideYEl.className = "snap-guide snap-guide-h";
      canvasWorld.appendChild(guideYEl);
    }
  }

  function showSnapGuides(x, y) {
    ensureSnapGuides();
    guideXEl.style.display = x != null ? "block" : "none";
    if (x != null) guideXEl.style.left = x + "px";
    guideYEl.style.display = y != null ? "block" : "none";
    if (y != null) guideYEl.style.top = y + "px";
  }

  function hideSnapGuides() {
    if (guideXEl) guideXEl.style.display = "none";
    if (guideYEl) guideYEl.style.display = "none";
  }

  // Every other top-level shape currently on the canvas (outer vars + loop
  // boxes), as axis-aligned rects in world space, for snap comparison.
  function collectSnapTargets(excludeToken) {
    const rects = [];
    for (const [name, shape] of Object.entries(mainZone.shapes)) {
      if (name === excludeToken) continue;
      rects.push(rectOf(shape.el));
    }
    for (const [loopIdx, box] of Object.entries(state.loopBoxes)) {
      const token = `loop:${loopIdx}`;
      if (token === excludeToken) continue;
      rects.push(rectOf(box.el));
    }
    return rects;
  }

  function rectOf(el) {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const w = el.offsetWidth, h = el.offsetHeight;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, right: x + w, bottom: y + h };
  }

  // Snaps a candidate position to align with any sibling shape's edges or
  // center, on each axis independently — so two same-sized arrays can be
  // dragged into an exact side-by-side or stacked line-up for comparison.
  function applySnap(w, h, x, y, excludeToken) {
    let snapX = x, snapY = y, guideX = null, guideY = null;
    const threshold = SNAP_THRESHOLD_SCREEN_PX / scale; // convert to world px at the current zoom
    for (const t of collectSnapTargets(excludeToken)) {
      if (Math.abs(x - t.x) < threshold) { snapX = t.x; guideX = t.x; }
      else if (Math.abs(x + w - t.right) < threshold) { snapX = t.right - w; guideX = t.right; }
      else if (Math.abs(x + w / 2 - t.cx) < threshold) { snapX = t.cx - w / 2; guideX = t.cx; }

      if (Math.abs(y - t.y) < threshold) { snapY = t.y; guideY = t.y; }
      else if (Math.abs(y + h - t.bottom) < threshold) { snapY = t.bottom - h; guideY = t.bottom; }
      else if (Math.abs(y + h / 2 - t.cy) < threshold) { snapY = t.cy - h / 2; guideY = t.cy; }
    }
    showSnapGuides(guideX, guideY);
    return { x: snapX, y: snapY };
  }

  // Makes a top-level shape wrapper draggable. Dragging only rearranges —
  // it never changes what's shown — so the final position is remembered in
  // state.customPos and takes priority over the auto flow layout for the
  // rest of this run (including if the shape is torn down and recreated,
  // e.g. a loop box on re-entry).
  function makeDraggable(wrap, token) {
    wrap.classList.add("draggable");
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const startLeft = parseFloat(wrap.style.left) || 0;
      const startTop = parseFloat(wrap.style.top) || 0;
      const w = wrap.offsetWidth, h = wrap.offsetHeight;
      let moved = false;
      wrap.classList.add("dragging");

      function onMove(ev) {
        moved = true;
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        const snapped = applySnap(w, h, startLeft + dx, startTop + dy, token);
        wrap.style.left = snapped.x + "px";
        wrap.style.top = snapped.y + "px";
        redrawConnectorsForCurrentStep(); // keep any index-pointer line glued to the shape while it moves
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        wrap.classList.remove("dragging");
        hideSnapGuides();
        if (moved) {
          state.customPos[token] = { x: parseFloat(wrap.style.left), y: parseFloat(wrap.style.top) };
        }
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  // ---------- index connectors: "this loop is walking through this array" ----------
  // When a loop's own index variable is used to subscript an array directly
  // (e.g. `arr[i]` inside `for i in ...`, detected via AST on the backend),
  // draw a line from the loop track's current position to that array's
  // current cell, and highlight the cell. Spans the given-bar and the
  // pannable canvas alike (whichever one the array happens to live in), so
  // positions are computed in screen space and converted to be relative to
  // the shared .canvas-col container.
  function clearIndexHighlights() {
    document.querySelectorAll(".cell.index-highlight").forEach(c => c.classList.remove("index-highlight"));
  }

  function findArrayCellEl(name, idx) {
    const argIdx = (state.problem?.arg_names || []).indexOf(name);
    if (argIdx !== -1) {
      const item = [...givenBar.querySelectorAll(".given-shape")].find(it => it.querySelector(".caption")?.textContent === name);
      const cell = item?.querySelectorAll(".array-cell")[idx];
      return cell || null;
    }
    const cellFromShape = (shape) => {
      if (!shape) return null;
      if (shape.kind === "array") return shape.cells[idx]?.cell || null;
      if (shape.kind === "linked-list-group") {
        // `heads[i]` here means "the i-th chain" -- point at its first
        // node (or its empty placeholder, which is still a `.cell`).
        const row = shape.body.children[idx];
        return row ? row.querySelector(".cell") : null;
      }
      return null;
    };
    const fromMain = cellFromShape(mainZone.shapes[name]);
    if (fromMain) return fromMain;
    for (const zone of Object.values(state.loopZones)) {
      const found = cellFromShape(zone.shapes[name]);
      if (found) return found;
    }
    return null;
  }

  function drawConnectorLine(fromEl, toEl) {
    const colRect = canvasCol.getBoundingClientRect();
    const fromR = fromEl.getBoundingClientRect();
    const toR = toEl.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fromR.left + fromR.width / 2 - colRect.left);
    line.setAttribute("y1", fromR.top + fromR.height / 2 - colRect.top);
    line.setAttribute("x2", toR.left + toR.width / 2 - colRect.left);
    line.setAttribute("y2", toR.top + toR.height / 2 - colRect.top);
    line.setAttribute("class", "connector-line");
    line.setAttribute("marker-end", "url(#connectorArrow)");
    connectorOverlay.appendChild(line);
  }

  function drawIndexConnectors(locals, chain) {
    connectorOverlay.querySelectorAll("line").forEach(l => l.remove());
    clearIndexHighlights();

    for (const loopIdx of chain) {
      const loopMeta = state.loops[loopIdx];
      const box = state.loopBoxes[loopIdx];
      if (!box || !loopMeta.indexed_arrays?.length || !loopMeta.target) continue;
      const idxVal = locals[loopMeta.target];
      if (typeof idxVal !== "number") continue;

      const trackCurrentEl = box.track.querySelector(".loop-track-cell.current, .loop-track-dot.current");
      if (!trackCurrentEl) continue;

      for (const arrName of loopMeta.indexed_arrays) {
        const cellEl = findArrayCellEl(arrName, idxVal);
        if (!cellEl) continue;
        cellEl.classList.add("index-highlight");
        drawConnectorLine(trackCurrentEl, cellEl);
      }
    }
  }

  // Re-derives the current step's locals/chain and redraws — used whenever
  // something that affects on-screen positions changes (a new step, a
  // drag, a pan/zoom) without needing every caller to track that state.
  function redrawConnectorsForCurrentStep() {
    if (!state.steps.length || !connectorOverlay) return;
    const step = state.steps[state.currentStep];
    if (!step) return;
    const chain = findContainingLoopChain(state.loops, step.line);
    drawIndexConnectors(step.locals || {}, chain);
  }

  // ---------- code editor ----------
  const cm = CodeMirror(el("codeMirrorHost"), {
    value: "",
    mode: "python",
    theme: "algoviz",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 4,
    tabSize: 4,
    viewportMargin: Infinity,
  });

  function setReadOnly(readOnly) {
    cm.setOption("readOnly", readOnly ? "nocursor" : false);
    cm.getWrapperElement().classList.toggle("readonly-mode", readOnly);
    editBtn.classList.toggle("hidden", !readOnly);
  }

  function clearActiveLine() {
    if (state.activeLineHandle != null) {
      cm.removeLineClass(state.activeLineHandle, "background", "cm-active-line-highlight");
      state.activeLineHandle = null;
    }
  }

  function unlockEditing() {
    stopPlaying();
    clearActiveLine();
    setReadOnly(false);
  }

  el("codeMirrorHost").addEventListener("dblclick", () => { if (cm.getOption("readOnly")) unlockEditing(); });
  editBtn.addEventListener("click", unlockEditing);

  // ---------- code persistence: remember your edits per-problem ----------
  // So reloading the page or switching problems and back doesn't discard
  // whatever you were working on in favor of the pristine starter code.
  const CODE_STORAGE_PREFIX = "algoviz:code:";
  function loadStoredCode(problemId) {
    try { return localStorage.getItem(CODE_STORAGE_PREFIX + problemId); } catch { return null; }
  }
  function saveStoredCode(problemId, code) {
    try { localStorage.setItem(CODE_STORAGE_PREFIX + problemId, code); } catch { /* storage unavailable — just skip persisting */ }
  }
  function clearStoredCode(problemId) {
    try { localStorage.removeItem(CODE_STORAGE_PREFIX + problemId); } catch { /* nothing to clear */ }
  }

  let saveTimer = null;
  cm.on("change", () => {
    if (!state.problem) return;
    const problemId = state.problem.id;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveStoredCode(problemId, cm.getValue()), 250);
  });

  // ---------- problem loading ----------
  async function loadProblems() {
    const list = await fetch("/api/problems").then(r => r.json());
    problemSelect.innerHTML = "";
    for (const p of list) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      problemSelect.appendChild(opt);
    }
    if (list.length) await loadProblem(list[0].id);
  }

  async function loadProblem(id) {
    const p = await fetch(`/api/problems/${id}`).then(r => r.json());
    state.problem = p;
    problemSelect.value = id;
    leetcodeLink.href = p.leetcode_url;
    const stored = loadStoredCode(id);
    cm.setValue(stored != null ? stored : p.starter_code);

    testSelect.innerHTML = "";
    p.tests.forEach((t, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = t.name;
      testSelect.appendChild(opt);
    });

    resetCurrentArgs();
    clearRun();
  }

  const cloneArgs = (args) => JSON.parse(JSON.stringify(args));

  function resetCurrentArgs() {
    state.currentArgs = cloneArgs(currentTest().args);
    renderGivenBar();
  }

  problemSelect.addEventListener("change", () => loadProblem(problemSelect.value));
  testSelect.addEventListener("change", () => { resetCurrentArgs(); clearRun(); });
  resetCodeBtn.addEventListener("click", () => {
    if (!state.problem) return;
    cm.setValue(state.problem.starter_code);
    clearStoredCode(state.problem.id); // a real reset, not just an edit that happens to match
    clearRun();
  });

  function clearRun() {
    stopPlaying();
    state.steps = [];
    state.currentStep = 0;
    statusLine.textContent = "";
    statusLine.className = "status";
    playbackRow.classList.add("hidden");
    clearActiveLine();
    setReadOnly(false);
    resetCanvasState();
  }

  function resetCanvasState() {
    canvasWorld.innerHTML = "";
    mainZone.shapes = {};
    mainZone.rendered = {};
    state.flow = { x: FLOW_MARGIN, y: FLOW_MARGIN, rowH: 0 };
    state.reservedPos = {};
    state.customPos = {};
    state.loops = [];
    state.varScopes = {};
    state.varScope = {};
    state.iterIndexAtStep = [];
    state.loopBoxes = {};
    state.loopZones = {};
    guideXEl = null; // canvasWorld.innerHTML just removed these nodes
    guideYEl = null;
    connectorOverlay.querySelectorAll("line").forEach(l => l.remove());
    clearIndexHighlights();
  }

  // ---------- running ----------
  function currentTest() {
    return state.problem.tests[parseInt(testSelect.value, 10)];
  }

  runBtn.addEventListener("click", async () => {
    if (!state.problem) return;
    stopPlaying();
    const test = currentTest();
    statusLine.textContent = "running…";
    statusLine.className = "status";

    const resp = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cm.getValue(), func_name: state.problem.func_name, args: state.currentArgs, problem_id: state.problem.id }),
    }).then(r => r.json());

    resetCanvasState();
    state.loops = resp.loops || [];
    state.varScopes = resp.var_scopes || {};

    if (resp.error) {
      statusLine.textContent = `line ${resp.error.line ?? "?"}: ${resp.error.message}`;
      statusLine.className = "status err";
    } else if (JSON.stringify(state.currentArgs) !== JSON.stringify(test.args)) {
      // input was hand-edited — there's no "expected" to compare against
      statusLine.textContent = `→ ${JSON.stringify(resp.result)} (edited input)`;
      statusLine.className = "status";
    } else {
      const matches = JSON.stringify(resp.result) === JSON.stringify(test.expected);
      statusLine.textContent = matches
        ? `✓ ${JSON.stringify(resp.result)}`
        : `✗ got ${JSON.stringify(resp.result)}, expected ${JSON.stringify(test.expected)}`;
      statusLine.className = "status " + (matches ? "ok" : "err");
    }

    state.steps = resp.steps || [];
    if (state.steps.length) precomputeLayout();
    setReadOnly(state.steps.length > 0);

    playbackRow.classList.toggle("hidden", state.steps.length === 0);
    scrubber.max = Math.max(0, state.steps.length - 1);
    scrubber.value = 0;
    state.currentStep = 0;
    if (state.steps.length) renderStep(0);
  });

  runAllBtn.addEventListener("click", async () => {
    if (!state.problem) return;
    statusLine.textContent = "running all…";
    statusLine.className = "status";
    const resp = await fetch("/api/run_tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cm.getValue(), func_name: state.problem.func_name, problem_id: state.problem.id }),
    }).then(r => r.json());

    const allPass = resp.passed_count === resp.total;
    const failing = resp.outcomes.filter(o => !o.passed);
    let msg = `${resp.passed_count}/${resp.total} passed`;
    if (!allPass) {
      const f = failing[0];
      const detail = f.error ? f.error.message : `got ${JSON.stringify(f.actual)}, expected ${JSON.stringify(f.expected)}`;
      msg += ` — ${f.name}: ${detail}`;
    }
    statusLine.textContent = msg;
    statusLine.className = "status " + (allPass ? "ok" : "err");
  });

  // ---------- playback controls ----------
  stepBack.addEventListener("click", () => { stopPlaying(); renderStep(state.currentStep - 1); });
  stepFwd.addEventListener("click", () => { stopPlaying(); renderStep(state.currentStep + 1); });
  scrubber.addEventListener("input", () => { stopPlaying(); renderStep(parseInt(scrubber.value, 10)); });
  playPause.addEventListener("click", () => { state.playing ? stopPlaying() : startPlaying(); });

  function startPlaying() {
    if (!state.steps.length) return;
    state.playing = true;
    playPause.textContent = "⏸";
    tick();
  }
  function tick() {
    if (!state.playing) return;
    if (state.currentStep >= state.steps.length - 1) { stopPlaying(); return; }
    renderStep(state.currentStep + 1);
    state.playTimer = setTimeout(tick, parseInt(speedSlider.value, 10));
  }
  function stopPlaying() {
    state.playing = false;
    playPause.textContent = "▶";
    if (state.playTimer) clearTimeout(state.playTimer);
    state.playTimer = null;
  }

  // ---------- rendering a step: highlight line + reconcile canvas ----------
  function renderStep(i) {
    if (!state.steps.length) return;
    i = Math.max(0, Math.min(i, state.steps.length - 1));
    state.currentStep = i;
    scrubber.value = i;
    const step = state.steps[i];
    stepCounter.textContent = `${i + 1}/${state.steps.length}`;

    clearActiveLine();
    const lineNo = step.line - 1;
    state.activeLineHandle = cm.addLineClass(lineNo, "background", "cm-active-line-highlight");
    cm.scrollIntoView({ line: lineNo, ch: 0 }, 80);

    reconcileCanvas(step.locals || {}, step.line);
    redrawConnectorsForCurrentStep();
  }

  // ---------- canvas layout ----------
  // Flow layout: shapes are placed left-to-right and measured *after* their
  // real content exists, so a wide shape (e.g. a long logs array) wraps to
  // the next row instead of overlapping its neighbor.
  function placeInFlow(width, height) {
    const f = state.flow;
    if (f.x > FLOW_MARGIN && f.x + width > FLOW_MAX_WIDTH) {
      f.x = FLOW_MARGIN;
      f.y += f.rowH + FLOW_GAP;
      f.rowH = 0;
    }
    const pos = { x: f.x, y: f.y };
    f.x += width + FLOW_GAP;
    f.rowH = Math.max(f.rowH, height);
    return pos;
  }

  function isLinkedListNode(v) {
    return !!v && typeof v === "object" && v.__kind__ === "linked_list";
  }

  function classify(name, value) {
    if (isLinkedListNode(value)) return "linked-list";
    if (Array.isArray(value)) {
      // A `lists: List[Optional[ListNode]]` style parameter -- every
      // present entry is itself a linked-list head -- renders as several
      // parallel chains rather than one row of opaque bracketed cells.
      if (value.length > 0 && value.every(v => v === null || isLinkedListNode(v))) {
        return "linked-list-group";
      }
      const lower = name.toLowerCase();
      if (lower.includes("heap")) return "heap-tree";
      return lower.includes("stack") ? "stack" : "array";
    }
    if (value !== null && typeof value === "object") return "map";
    return "scalar";
  }

  // How "big" a value is, for reserving flow-layout space ahead of time —
  // unified across kinds so precomputeLayout doesn't need per-kind branches.
  function sizeOf(kind, value) {
    if (kind === "scalar") return formatValue(value).length;
    if (kind === "map") return Object.keys(value).length;
    if (kind === "linked-list") return value.values.length;
    return value.length;
  }

  function formatValue(v) {
    if (v === null || v === undefined) return "None";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (Array.isArray(v)) return "[" + v.map(formatValue).join(",") + "]";
    if (isLinkedListNode(v)) return "[" + v.values.map(formatValue).join(",") + "]";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  // ---------- given-bar: the function's parameters, shown + hand-editable ----------
  // Same visual language as the canvas shapes, but every value is
  // contenteditable and commits straight back into state.currentArgs, so
  // you can author a fresh test case without touching the test dropdown.
  function renderGivenBar() {
    givenBar.innerHTML = "";
    if (!state.problem) return;
    const argNames = state.problem.arg_names || [];
    argNames.forEach((name, argIndex) => {
      givenBar.appendChild(buildGivenShape(name, state.currentArgs[argIndex], argIndex));
    });
  }

  function buildGivenShape(name, value, argIndex) {
    const kind = classify(name, value);
    const wrap = document.createElement("div");
    wrap.className = `static-shape ${kind}-shape given-shape`;

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = name;
    wrap.appendChild(caption);

    const body = document.createElement("div");
    if (kind === "array") {
      body.className = "array-row";
      value.forEach((v, cellIdx) => {
        const w = document.createElement("div");
        w.className = "array-cell-wrap";
        const cell = document.createElement("div");
        cell.className = "cell array-cell given-editable";
        cell.contentEditable = "true";
        cell.spellcheck = false;
        cell.textContent = formatValue(v);
        attachCommit(cell, () => commitArrayCell(argIndex, cellIdx, cell));
        const tick = document.createElement("div");
        tick.className = "array-idx";
        tick.textContent = cellIdx;
        w.appendChild(cell);
        w.appendChild(tick);
        body.appendChild(w);
      });
    } else {
      body.className = "scalar-value given-editable";
      body.contentEditable = "true";
      body.spellcheck = false;
      body.textContent = formatValue(value);
      attachCommit(body, () => commitScalar(argIndex, body));
    }
    wrap.appendChild(body);
    return wrap;
  }

  // Wires an editable element's Enter/Escape/blur behavior and reruns the
  // commit callback on blur; on success the whole given-bar re-renders from
  // state (single source of truth), on failure the edit is rejected with a
  // brief red flash instead of silently accepting garbage input.
  function attachCommit(el, tryCommit) {
    const original = el.textContent;
    // select the existing text on focus so typing replaces it, rather than
    // appending after wherever the cursor happened to land
    el.addEventListener("focus", () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); el.textContent = original; el.blur(); }
    });
    el.addEventListener("blur", () => {
      if (tryCommit()) {
        renderGivenBar();
      } else {
        el.textContent = original;
        el.classList.add("invalid-flash");
        setTimeout(() => el.classList.remove("invalid-flash"), 400);
      }
    });
  }

  function coerceLike(original, text) {
    if (typeof original === "number") {
      const n = Number(text);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    if (typeof original === "boolean") {
      if (text !== "True" && text !== "False") return { ok: false };
      return { ok: true, value: text === "True" };
    }
    if (Array.isArray(original)) {
      // e.g. one entry of a `lists: List[List[int]]`-shaped param, shown
      // as bracketed text ("[1,4,5]") in a single given-bar cell -- accept
      // edited JSON array text back, rather than storing the raw string.
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false };
      } catch {
        return { ok: false };
      }
    }
    return { ok: true, value: text };
  }

  function commitScalar(argIndex, el) {
    const result = coerceLike(state.currentArgs[argIndex], el.textContent.trim());
    if (!result.ok) return false;
    state.currentArgs[argIndex] = result.value;
    return true;
  }

  function commitArrayCell(argIndex, cellIdx, cellEl) {
    const result = coerceLike(state.currentArgs[argIndex][cellIdx], cellEl.textContent.trim());
    if (!result.ok) return false;
    state.currentArgs[argIndex][cellIdx] = result.value;
    return true;
  }

  // ---------- reconciliation: diff previous rendered target vs new locals ----------
  // ---------- loop awareness ----------
  // Which loop(s) (outermost..innermost) contain a given source line, based
  // on the start/end line ranges `analyze_loops` found via the AST. A
  // nested loop's range is always a subset of its parent's, so "smallest
  // containing range" = innermost.
  function findContainingLoopChain(loops, line) {
    return loops
      .map((l, idx) => ({ idx, l }))
      .filter(({ l }) => line >= l.start_line && line <= l.end_line)
      .sort((a, b) => (b.l.end_line - b.l.start_line) - (a.l.end_line - a.l.start_line))
      .map(({ idx }) => idx);
  }

  function describeLoop(loopMeta) {
    if (loopMeta.kind === "for") return `for ${loopMeta.target ?? "_"} in ${loopMeta.iter_expr ?? "…"}`;
    return `while ${loopMeta.iter_expr ?? "…"}`;
  }

  // For each loop, the 0-based iteration count at every step — just counts
  // how many times control has returned to that loop's header line. Works
  // identically for `for` and `while` without needing to understand either.
  function computeIterIndices(loops) {
    const counters = loops.map(() => -1);
    const perLoop = loops.map(() => []);
    for (let i = 0; i < state.steps.length; i++) {
      const line = state.steps[i].line;
      loops.forEach((loop, idx) => {
        if (line === loop.start_line) counters[idx]++;
        perLoop[idx][i] = counters[idx];
      });
    }
    return perLoop;
  }

  // Resolves a simple arithmetic token ("n", "5", "n - 2") to a number
  // using whatever's in scope right now — a bound local, a given-bar
  // param, a literal, or one of those plus/minus a literal. Good enough
  // for the common `range(...)` bound expressions without a real
  // expression evaluator.
  function resolveExprNumber(token, locals) {
    if (token == null) return null;
    token = token.trim();
    if (/^-?\d+$/.test(token)) return Number(token);
    if (typeof locals[token] === "number") return locals[token];
    const idx = (state.problem.arg_names || []).indexOf(token);
    if (idx !== -1 && typeof state.currentArgs[idx] === "number") return state.currentArgs[idx];
    const lenMatch = token.match(/^len\((\w+)\)$/);
    if (lenMatch) {
      const name = lenMatch[1];
      if (Array.isArray(locals[name])) return locals[name].length;
      const argIdx = (state.problem.arg_names || []).indexOf(name);
      if (argIdx !== -1 && Array.isArray(state.currentArgs[argIdx])) return state.currentArgs[argIdx].length;
      return null;
    }
    // base +/- digit, where base is a bare name or a `len(name)` call —
    // covers both `n - 2` and the common reverse-iteration idiom
    // `range(len(arr) - 1, -1, -1)`.
    const m = token.match(/^(\w+|len\(\w+\))\s*([+-])\s*(\d+)$/);
    if (m) {
      const base = resolveExprNumber(m[1], locals);
      if (base == null) return null;
      return m[2] === "+" ? base + Number(m[3]) : base - Number(m[3]);
    }
    return null;
  }

  // "At a glance" preview of what a loop will run through. Best case (a
  // `for` over a plain named list, param or local) shows the real sequence
  // with the current position marked; a resolvable `range(...)` — with any
  // combination of start/stop/step, including simple expressions like
  // `n - 2` — shows the actual index track (capped in size, else dots);
  // anything else (a `while` condition, an unresolvable expression) falls
  // back to a plain iteration counter — still true for every loop, just
  // less visual.
  function resolveIterablePreview(loopMeta, locals) {
    const expr = loopMeta.iter_expr;
    if (!expr) return null;
    if (/^[A-Za-z_]\w*$/.test(expr)) {
      if (Array.isArray(locals[expr])) return { type: "array", items: locals[expr] };
      const idx = (state.problem.arg_names || []).indexOf(expr);
      if (idx !== -1 && Array.isArray(state.currentArgs[idx])) return { type: "array", items: state.currentArgs[idx] };
    }
    // Greedy `.*`, not `[^)]*` -- an argument like `len(heads)` has its own
    // closing paren, which a non-greedy/exclusive match would stop at.
    const rangeMatch = expr.match(/^range\((.*)\)$/);
    if (rangeMatch) {
      const parts = rangeMatch[1].split(",").map(s => s.trim()).filter(s => s.length);
      let start = 0, stop = null, step = 1;
      if (parts.length === 1) {
        stop = resolveExprNumber(parts[0], locals);
      } else if (parts.length >= 2) {
        start = resolveExprNumber(parts[0], locals);
        stop = resolveExprNumber(parts[1], locals);
        if (parts.length >= 3) step = resolveExprNumber(parts[2], locals);
      }
      if (start != null && stop != null && step) {
        const count = Math.max(0, Math.ceil((stop - start) / step));
        if (count <= 2000) return { type: "range", start, step, count };
      }
    }
    return null;
  }

  function renderLoopTrack(trackEl, loopMeta, iterIdx, locals) {
    trackEl.innerHTML = "";
    const preview = resolveIterablePreview(loopMeta, locals);
    if (preview && preview.type === "array") {
      trackEl.className = "loop-track";
      preview.items.forEach((v, i) => {
        const cell = document.createElement("div");
        cell.className = "cell loop-track-cell" + (i === iterIdx ? " current" : "");
        cell.textContent = formatValue(v);
        trackEl.appendChild(cell);
      });
    } else if (preview && preview.type === "range" && preview.count <= 40) {
      trackEl.className = "loop-track";
      for (let k = 0; k < preview.count; k++) {
        const cell = document.createElement("div");
        cell.className = "cell loop-track-cell" + (k === iterIdx ? " current" : "");
        cell.textContent = String(preview.start + k * preview.step);
        trackEl.appendChild(cell);
      }
    } else if (preview && preview.type === "range") {
      trackEl.className = "loop-track loop-track-dots";
      for (let k = 0; k < preview.count; k++) {
        const dot = document.createElement("div");
        dot.className = "loop-track-dot" + (k === iterIdx ? " current" : "");
        trackEl.appendChild(dot);
      }
    } else {
      trackEl.className = "loop-track loop-track-counter";
      trackEl.textContent = `iteration ${iterIdx + 1}`;
    }
  }

  function buildLoopBoxElement(loopMeta) {
    const wrap = document.createElement("div");
    wrap.className = "shape loop-shape";
    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = describeLoop(loopMeta);
    wrap.appendChild(caption);
    const box = document.createElement("div");
    box.className = "loop-box";
    const track = document.createElement("div");
    track.className = "loop-track";
    const varsEl = document.createElement("div");
    varsEl.className = "loop-vars";
    box.appendChild(track);
    box.appendChild(varsEl);
    wrap.appendChild(box);
    return { wrap, track, varsEl };
  }

  function createLoopBoxShape(loopIdx) {
    const loopMeta = state.loops[loopIdx];
    const token = `loop:${loopIdx}`;
    const { wrap, track, varsEl } = buildLoopBoxElement(loopMeta);
    wrap.classList.add("entering");
    const pos = state.customPos[token] || state.reservedPos[token] || placeInFlow(200, 100);
    wrap.style.left = pos.x + "px";
    wrap.style.top = pos.y + "px";
    canvasWorld.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove("entering")));
    makeDraggable(wrap, token);

    state.loopBoxes[loopIdx] = { el: wrap, track, varsEl };
    state.loopZones[loopIdx] = makeZone(varsEl, true);
  }

  function removeLoopBoxShape(loopIdx) {
    const box = state.loopBoxes[loopIdx];
    if (!box) return;
    box.el.classList.add("leaving");
    setTimeout(() => box.el.remove(), 220);
    delete state.loopBoxes[loopIdx];
    delete state.loopZones[loopIdx];
  }

  function syncLoopBox(loopIdx, locals) {
    const loopMeta = state.loops[loopIdx];
    const box = state.loopBoxes[loopIdx];
    if (!box) return;
    const iterIdx = (state.iterIndexAtStep[loopIdx] || [])[state.currentStep] ?? 0;
    renderLoopTrack(box.track, loopMeta, iterIdx, locals);

    const zone = state.loopZones[loopIdx];
    const varNames = Object.keys(locals).filter(n => {
      const scope = state.varScope[n];
      return scope && scope.kind === "loop" && scope.loopIndices.includes(loopIdx);
    });
    reconcileZone(zone, locals, varNames);
  }

  // ---------- reconciliation: diff previous rendered target vs new locals ----------
  function reconcileCanvas(locals, line) {
    // function parameters live in the given-bar above, not the main canvas —
    // once you strip those out, the canvas naturally starts with only the
    // outer-scope variables that have actually been assigned so far. A
    // loop's own variables only render while execution is actually inside
    // that loop's line range, grouped inside its loop box instead of here.
    const argNames = new Set(state.problem.arg_names || []);
    const chain = findContainingLoopChain(state.loops, line);
    const chainSet = new Set(chain);

    const outerNames = Object.keys(locals).filter(n => {
      if (n.startsWith("_") || argNames.has(n)) return false;
      const scope = state.varScope[n];
      return !scope || scope.kind === "outer";
    });
    reconcileZone(mainZone, locals, outerNames);

    state.loops.forEach((_loopMeta, loopIdx) => {
      const active = chainSet.has(loopIdx);
      if (active) {
        if (!state.loopBoxes[loopIdx]) createLoopBoxShape(loopIdx);
        syncLoopBox(loopIdx, locals);
      } else if (state.loopBoxes[loopIdx]) {
        removeLoopBoxShape(loopIdx);
      }
    });
  }

  // Small "a stack lives here" glyph shown while a stack variable is empty,
  // so the shape has a visible home on the canvas before anything is pushed.
  const STACK_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="4" y="3.5" width="16" height="5" rx="1"/>
    <rect x="4" y="10" width="16" height="5" rx="1" opacity="0.65"/>
    <rect x="4" y="16.5" width="16" height="5" rx="1" opacity="0.35"/>
  </svg>`;

  // Builds the DOM for a shape without positioning or appending it anywhere.
  // Shared by real rendering and by the offscreen size measurement pass.
  // `isStatic` picks the wrapper class: absolutely-positioned (the main
  // pannable canvas) or plain flow (given-bar, inside a loop box).
  function buildShapeElement(name, kind, value, isStatic) {
    const wrap = document.createElement("div");
    wrap.className = `${isStatic ? "static-shape" : "shape"} ${kind}-shape`;

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = name;
    wrap.appendChild(caption);

    let body, cellRefs = null, stackBody = null, placeholderEl = null, cellsByKey = null;
    if (kind === "stack" || kind === "linked-list") {
      // Same shape either way: a placeholder icon while empty, or a live
      // row of cells once there's something to show. A linked list is
      // just a stack's sibling here -- a sequence of nodes -- rendered
      // with rounded pills + arrows instead of a squared-off tower.
      const items = kind === "linked-list" ? value.values : value;
      const makeNode = kind === "linked-list" ? makeLinkedNode : makeCell;
      body = document.createElement("div");
      body.className = kind === "linked-list" ? "linked-list-outer" : "stack-outer";
      placeholderEl = document.createElement("div");
      placeholderEl.className = kind === "linked-list" ? "linked-list-placeholder" : "stack-placeholder";
      if (kind === "linked-list") placeholderEl.textContent = "∅";
      else placeholderEl.innerHTML = STACK_ICON_SVG;
      stackBody = document.createElement("div");
      stackBody.className = kind === "linked-list" ? "linked-list-row" : "stack-body";
      cellRefs = items.map(v => makeNode(stackBody, v));
      placeholderEl.classList.toggle("hidden", items.length > 0);
      stackBody.classList.toggle("hidden", items.length === 0);
      body.appendChild(placeholderEl);
      body.appendChild(stackBody);
    } else if (kind === "array") {
      body = document.createElement("div");
      body.className = "array-row";
      cellRefs = value.map((v, idx) => makeArrayCell(body, v, idx));
    } else if (kind === "map") {
      body = document.createElement("div");
      body.className = "map-row";
      cellsByKey = {};
      for (const [key, v] of Object.entries(value)) {
        const ref = makeMapCell(key, v);
        body.appendChild(ref.wrap);
        cellsByKey[key] = ref;
      }
    } else if (kind === "linked-list-group") {
      body = document.createElement("div");
      body.className = "linked-list-group";
      renderLinkedListGroupRows(body, value);
    } else if (kind === "heap-tree") {
      body = document.createElement("div");
      body.className = "heap-tree";
      renderHeapTree(body, value);
    } else {
      body = document.createElement("div");
      body.className = "scalar-value";
      body.textContent = formatValue(value);
    }
    wrap.appendChild(body);
    return { wrap, body, cellRefs, stackBody, placeholderEl, cellsByKey };
  }

  function makeCell(container, value) {
    const cell = document.createElement("div");
    cell.className = "cell stack-cell";
    cell.textContent = formatValue(value);
    container.appendChild(cell);
    return cell;
  }

  // A linked-list node: a rounded pill (distinct from an array's shared-
  // border rectangle, since these are separate objects joined by pointers,
  // not one contiguous block). The arrow between nodes is pure CSS
  // (`:not(:first-child)::before`), so add/remove diffing needs no extra
  // bookkeeping to keep the arrows in sync.
  function makeLinkedNode(container, value) {
    const cell = document.createElement("div");
    cell.className = "cell linked-node";
    cell.textContent = formatValue(value);
    container.appendChild(cell);
    return cell;
  }

  // A `lists: List[Optional[ListNode]]`-style parameter: one row per list,
  // each its own little chain. Rebuilt from scratch on every update rather
  // than diffed -- k stays fixed for this problem shape, so the only thing
  // moving is each row's own length, and a full rebuild keeps this simple.
  function renderLinkedListGroupRows(container, headsArray) {
    container.innerHTML = "";
    headsArray.forEach(headVal => {
      const row = document.createElement("div");
      row.className = "linked-list-row";
      const values = isLinkedListNode(headVal) ? headVal.values : [];
      if (values.length === 0) {
        const ph = document.createElement("div");
        ph.className = "cell linked-node linked-node-empty";
        ph.textContent = "∅";
        row.appendChild(ph);
      } else {
        values.forEach(v => {
          const node = document.createElement("div");
          node.className = "cell linked-node";
          node.textContent = formatValue(v);
          row.appendChild(node);
        });
      }
      container.appendChild(row);
    });
  }

  // A heapq list *is* a binary tree -- for index i, children live at
  // 2i+1/2i+2 -- just encoded implicitly instead of with real node
  // objects. Rendered as one, since that's what actually explains why
  // push/pop work, rather than as an opaque flat array. Redrawn from
  // scratch on every update: heap operations reshuffle values across
  // positions (that's the whole point), so there's no stable per-node
  // identity worth animating between steps, unlike a stack or array.
  const HEAP_NODE_H = 30;
  const HEAP_CHAR_W = 7;
  const HEAP_LEVEL_GAP = 22;
  const HEAP_NODE_GAP = 10;

  function renderHeapTree(container, items) {
    container.innerHTML = "";
    const n = items.length;
    if (n === 0) {
      const ph = document.createElement("div");
      ph.className = "heap-tree-placeholder";
      ph.textContent = "∅";
      container.appendChild(ph);
      return;
    }

    const texts = items.map(formatValue);
    const nodeW = Math.max(34, Math.max(...texts.map(t => t.length * HEAP_CHAR_W + 16)));
    const levels = Math.floor(Math.log2(n)) + 1;
    const bottomSlots = 2 ** (levels - 1);
    const slotW = nodeW + HEAP_NODE_GAP;
    const width = bottomSlots * slotW;
    const height = levels * (HEAP_NODE_H + HEAP_LEVEL_GAP);

    function posOf(i) {
      const level = Math.floor(Math.log2(i + 1));
      const firstAtLevel = 2 ** level - 1;
      const slotsAtLevel = 2 ** level;
      const levelWidth = width / slotsAtLevel;
      return {
        x: levelWidth * (i - firstAtLevel + 0.5),
        y: HEAP_NODE_H / 2 + level * (HEAP_NODE_H + HEAP_LEVEL_GAP),
      };
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("class", "heap-tree-svg");

    for (let i = 1; i < n; i++) {
      const parent = Math.floor((i - 1) / 2);
      const p = posOf(parent), c = posOf(i);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", p.x); line.setAttribute("y1", p.y);
      line.setAttribute("x2", c.x); line.setAttribute("y2", c.y);
      line.setAttribute("class", "heap-edge");
      svg.appendChild(line);
    }
    for (let i = 0; i < n; i++) {
      const { x, y } = posOf(i);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - nodeW / 2);
      rect.setAttribute("y", y - HEAP_NODE_H / 2);
      rect.setAttribute("width", nodeW);
      rect.setAttribute("height", HEAP_NODE_H);
      rect.setAttribute("rx", HEAP_NODE_H / 2);
      rect.setAttribute("class", "heap-node-rect" + (i === 0 ? " heap-root" : ""));
      svg.appendChild(rect);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.setAttribute("class", "heap-node-text");
      text.textContent = texts[i];
      svg.appendChild(text);
    }
    container.appendChild(svg);
  }

  function makeArrayCell(container, value, idx) {
    const w = document.createElement("div");
    w.className = "array-cell-wrap";
    const cell = document.createElement("div");
    cell.className = "cell array-cell";
    cell.textContent = formatValue(value);
    const tick = document.createElement("div");
    tick.className = "array-idx";
    tick.textContent = idx;
    w.appendChild(cell);
    w.appendChild(tick);
    container.appendChild(w);
    return { wrap: w, cell };
  }

  // A map cell shows key over value (e.g. a sorted-map/TreeMap-style
  // structure) — not appended to a container here, since map entries can
  // be inserted anywhere in sorted order, not just at the tail.
  function makeMapCell(key, value) {
    const wrap = document.createElement("div");
    wrap.className = "map-cell-wrap";
    const cell = document.createElement("div");
    cell.className = "cell map-cell";
    const keyEl = document.createElement("div");
    keyEl.className = "map-key";
    keyEl.textContent = key;
    const valueEl = document.createElement("div");
    valueEl.className = "map-value";
    const text = formatValue(value);
    valueEl.textContent = text;
    cell.appendChild(keyEl);
    cell.appendChild(valueEl);
    wrap.appendChild(cell);
    return { wrap, cell, keyEl, valueEl, lastValue: text };
  }

  // Ghost-builds a loop box filled with its variables at their max sizes,
  // for the same up-front size reservation the main canvas uses.
  function buildLoopBoxGhost(loopIdx, loopMeta, varNames, maxVal, kindOf, repLocals) {
    const { wrap, track, varsEl } = buildLoopBoxElement(loopMeta);
    renderLoopTrack(track, loopMeta, 0, repLocals || {});
    for (const name of varNames) {
      const { wrap: childWrap } = buildShapeElement(name, kindOf[name], maxVal[name], true);
      varsEl.appendChild(childWrap);
    }
    return wrap;
  }

  // Walk the full trace once to find, per variable, the largest it ever
  // gets and reserve flow-layout space for that size up front. Without
  // this, a stack/array that grows after it's first drawn would grow into
  // whatever shape the flow layout placed next to it. Each variable's home
  // (outer scope, or every loop it's assigned inside) comes from the
  // backend's static AST scan (state.varScopes) rather than trace order —
  // a name can be a loop target in more than one loop (e.g. reused via
  // tuple-unpacking across two sibling `for` loops) and should show up in
  // all of them, which a "first line it's ever seen bound on" heuristic
  // can't express. This pass just orders things for layout and finds each
  // variable's max rendered size; a loop box's own slot is sized from its
  // own variables' max sizes the same way.
  function precomputeLayout() {
    const argNames = new Set(state.problem.arg_names || []);
    const loops = state.loops;
    const order = [];
    const seenTop = new Set();
    const loopSeen = new Set();
    const loopRepLocals = {};
    const varScope = {};
    const maxVal = {};
    const kindOf = {};

    function scopeOf(name) {
      const info = state.varScopes[name];
      if (!info || info.outer || !info.loops || !info.loops.length) return { kind: "outer" };
      return { kind: "loop", loopIndices: info.loops };
    }

    for (let i = 0; i < state.steps.length; i++) {
      const step = state.steps[i];
      const chain = findContainingLoopChain(loops, step.line);

      for (const loopIdx of chain) {
        if (!loopSeen.has(loopIdx)) {
          loopSeen.add(loopIdx);
          order.push(`loop:${loopIdx}`);
          loopRepLocals[loopIdx] = step.locals || {};
        }
      }

      for (const [name, value] of Object.entries(step.locals || {})) {
        if (name.startsWith("_") || argNames.has(name)) continue;
        if (!(name in varScope)) {
          varScope[name] = scopeOf(name);
          if (varScope[name].kind === "outer" && !seenTop.has(name)) {
            seenTop.add(name);
            order.push(name);
          }
        }
        const kind = classify(name, value);
        kindOf[name] = kind;
        if (!(name in maxVal) || sizeOf(kind, value) > sizeOf(kind, maxVal[name])) {
          maxVal[name] = value;
        }
      }
    }

    state.varScope = varScope;
    state.iterIndexAtStep = computeIterIndices(loops);

    const loopVarNames = loops.map(() => []);
    for (const [name, scope] of Object.entries(varScope)) {
      if (scope.kind === "loop") {
        for (const loopIdx of scope.loopIndices) loopVarNames[loopIdx].push(name);
      }
    }

    state.flow = { x: FLOW_MARGIN, y: FLOW_MARGIN, rowH: 0 };
    state.reservedPos = {};
    for (const token of order) {
      let wrap;
      if (token.startsWith("loop:")) {
        const loopIdx = Number(token.slice(5));
        wrap = buildLoopBoxGhost(loopIdx, loops[loopIdx], loopVarNames[loopIdx], maxVal, kindOf, loopRepLocals[loopIdx]);
      } else {
        wrap = buildShapeElement(token, kindOf[token], maxVal[token], false).wrap;
      }
      wrap.style.visibility = "hidden";
      wrap.style.left = "0px";
      wrap.style.top = "0px";
      canvasWorld.appendChild(wrap);
      const w = wrap.offsetWidth, h = wrap.offsetHeight;
      wrap.remove();
      state.reservedPos[token] = placeInFlow(w, h);
    }
  }

  // ---------- generic shape lifecycle, parameterized by zone ----------
  // A zone is either the main canvas (absolutely positioned, pre-reserved
  // slot) or a loop box's interior (plain flex flow, sized by the browser).
  function reconcileZone(zone, locals, names) {
    const nameSet = new Set(names);
    for (const name of Object.keys(zone.shapes)) {
      if (!nameSet.has(name)) removeShapeIn(zone, name);
    }
    for (const name of names) {
      const value = locals[name];
      const kind = classify(name, value);
      if (!zone.shapes[name]) createShapeIn(zone, name, kind, value);
      else updateShapeIn(zone, name, kind, value);
    }
  }

  function createShapeIn(zone, name, kind, value) {
    const { wrap, body, cellRefs, stackBody, placeholderEl, cellsByKey } = buildShapeElement(name, kind, value, zone.isStatic);
    if (!zone.isStatic) {
      wrap.classList.add("entering");
      const pos = state.customPos[name] || state.reservedPos[name] || placeInFlow(160, 60);
      wrap.style.left = pos.x + "px";
      wrap.style.top = pos.y + "px";
    }
    zone.container.appendChild(wrap);
    if (!zone.isStatic) {
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove("entering")));
      makeDraggable(wrap, name);
    }

    zone.shapes[name] = { el: wrap, body, kind, cells: cellRefs, stackBody, placeholderEl, cellsByKey, pendingExit: [] };
    zone.rendered[name] = { kind, cells: Array.isArray(value) ? value.map(formatValue) : null, value: kind === "scalar" ? formatValue(value) : null };
  }

  // Cells mid-exit-animation are removed from the DOM by a delayed timeout,
  // but `shape.cells` already drops them synchronously. If another
  // structural change lands before that timeout fires (fast playback,
  // rapid scrubbing), the stale DOM node would otherwise be left behind,
  // untracked. Flushing it immediately keeps DOM and state in lockstep.
  function flushPendingExits(shape) {
    for (const { node, timer } of shape.pendingExit) {
      clearTimeout(timer);
      node.remove();
    }
    shape.pendingExit = [];
  }

  function scheduleExit(shape, node) {
    node.classList.add("cell-exit");
    const timer = setTimeout(() => {
      node.remove();
      shape.pendingExit = shape.pendingExit.filter(p => p.node !== node);
    }, 220);
    shape.pendingExit.push({ node, timer });
  }

  function updateShapeIn(zone, name, kind, value) {
    const shape = zone.shapes[name];
    const prev = zone.rendered[name];
    flushPendingExits(shape);

    if (kind === "scalar") {
      const text = formatValue(value);
      if (prev.value !== text) {
        shape.body.textContent = text;
        shape.body.classList.add("pulse");
        setTimeout(() => shape.body.classList.remove("pulse"), 260);
      }
      zone.rendered[name] = { kind, value: text };
      return;
    }

    if (kind === "map") {
      // Entries can be inserted anywhere in sorted order, not just the
      // tail, and an existing key's value can change in place (a repeated
      // key just overwrites, it doesn't move) — so this diffs by key and
      // positions each cell explicitly, rather than reusing the array/
      // stack tail-diff below.
      const newKeys = new Set(Object.keys(value));
      for (const key of Object.keys(shape.cellsByKey)) {
        if (!newKeys.has(key)) {
          scheduleExit(shape, shape.cellsByKey[key].wrap);
          delete shape.cellsByKey[key];
        }
      }
      Object.entries(value).forEach(([key, val], idx) => {
        const referenceNode = shape.body.children[idx] || null;
        let ref = shape.cellsByKey[key];
        if (!ref) {
          ref = makeMapCell(key, val);
          shape.cellsByKey[key] = ref;
          shape.body.insertBefore(ref.wrap, referenceNode);
          ref.cell.classList.add("cell-enter");
          requestAnimationFrame(() => requestAnimationFrame(() => ref.cell.classList.remove("cell-enter")));
        } else {
          if (shape.body.children[idx] !== ref.wrap) {
            shape.body.insertBefore(ref.wrap, referenceNode);
          }
          const text = formatValue(val);
          if (ref.lastValue !== text) {
            // update just the value line -- pulseCell would overwrite the
            // whole cell's textContent and wipe out the key label
            ref.valueEl.textContent = text;
            ref.cell.classList.add("cell-pulse");
            setTimeout(() => ref.cell.classList.remove("cell-pulse"), 260);
            ref.lastValue = text;
          }
        }
      });
      zone.rendered[name] = { kind };
      return;
    }

    if (kind === "linked-list-group") {
      // k stays fixed for this shape; only each row's own chain changes.
      // Simplest correct thing is to just redraw every row.
      renderLinkedListGroupRows(shape.body, value);
      zone.rendered[name] = { kind };
      return;
    }

    if (kind === "heap-tree") {
      // Heap operations reshuffle values across positions -- there's no
      // stable per-node identity to diff/animate, so just redraw.
      renderHeapTree(shape.body, value);
      zone.rendered[name] = { kind };
      return;
    }

    const items = kind === "linked-list" ? value.values : value;
    const newCells = items.map(formatValue);
    const oldCells = prev.cells || [];

    if (kind === "stack" || kind === "linked-list") {
      const makeNode = kind === "linked-list" ? makeLinkedNode : makeCell;
      // remove from the end (top / tail) if shrunk
      while (shape.cells.length > newCells.length) {
        const cell = shape.cells.pop();
        scheduleExit(shape, cell);
      }
      // update overlapping values
      const overlap = Math.min(shape.cells.length, newCells.length);
      for (let idx = 0; idx < overlap; idx++) {
        if (oldCells[idx] !== newCells[idx]) pulseCell(shape.cells[idx], newCells[idx]);
      }
      // add new ones at the end (top / tail)
      for (let idx = shape.cells.length; idx < newCells.length; idx++) {
        const cell = makeNode(shape.stackBody, items[idx]);
        cell.classList.add("cell-enter");
        requestAnimationFrame(() => requestAnimationFrame(() => cell.classList.remove("cell-enter")));
        shape.cells.push(cell);
      }
      // swap between the empty-state icon and the actual row of blocks
      shape.placeholderEl.classList.toggle("hidden", newCells.length > 0);
      shape.stackBody.classList.toggle("hidden", newCells.length === 0);
    } else {
      // array: rebuild diff similarly at the tail
      while (shape.cells.length > newCells.length) {
        const { wrap, cell } = shape.cells.pop();
        cell.classList.add("cell-exit");
        scheduleExit(shape, wrap);
      }
      const overlap = Math.min(shape.cells.length, newCells.length);
      for (let idx = 0; idx < overlap; idx++) {
        if (oldCells[idx] !== newCells[idx]) pulseCell(shape.cells[idx].cell, newCells[idx]);
      }
      for (let idx = shape.cells.length; idx < newCells.length; idx++) {
        const ref = makeArrayCell(shape.body, value[idx], idx);
        ref.cell.classList.add("cell-enter");
        requestAnimationFrame(() => requestAnimationFrame(() => ref.cell.classList.remove("cell-enter")));
        shape.cells.push(ref);
      }
    }

    zone.rendered[name] = { kind, cells: newCells };
  }

  function pulseCell(cellEl, text) {
    cellEl.textContent = text;
    cellEl.classList.add("cell-pulse");
    setTimeout(() => cellEl.classList.remove("cell-pulse"), 260);
  }

  function removeShapeIn(zone, name) {
    const shape = zone.shapes[name];
    if (!shape) return;
    shape.el.classList.add("leaving");
    setTimeout(() => shape.el.remove(), 220);
    delete zone.shapes[name];
    delete zone.rendered[name];
  }

  loadProblems();
})();
