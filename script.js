/* =========================================================
   ROMPECABEZAS - script.js
   - Genera piezas con forma real de rompecabezas (tabs/muescas)
     usando SVG + <clipPath>.
   - Maneja el drag & drop, el contador de movimientos,
     el cronómetro y la detección de victoria.
   ========================================================= */

const GRID = 4;                 // tablero 4x4 = 16 piezas
const IMAGE_SRC = "imagen.jpg"; // debe ser una imagen cuadrada
const SVG_NS = "http://www.w3.org/2000/svg";

// Tamaño base de cada pieza en "unidades" del SVG (no son píxeles reales,
// el tamaño en pantalla lo controla la variable CSS --piece-size).
const S = 100;
const TAB_AMP = 18;   // qué tan grande es la protuberancia
const MARGIN = 32;    // espacio extra alrededor para que el tab no se corte

let movesCount = 0;
let placedCount = 0;
let timerInterval = null;
let secondsElapsed = 0;
let draggedPieceEl = null;

const boardEl = document.getElementById("board");
const trayEl = document.getElementById("tray");
const moveCounterEl = document.getElementById("move-counter");
const timerEl = document.getElementById("timer");
const winOverlayEl = document.getElementById("win-overlay");
const winStatsEl = document.getElementById("win-stats");

document.getElementById("reset-btn").addEventListener("click", startNewGame);
document.getElementById("play-again-btn").addEventListener("click", startNewGame);

startNewGame();

/* ---------------------------------------------------------
   Construcción del path de un borde con tab/muesca/recto
   --------------------------------------------------------- */
// p0, p1: puntos {x,y} de inicio y fin del borde (en orden de recorrido)
// type: 0 = recto (borde exterior), 1 / -1 = protuberancia en un sentido u otro
function edgeSegment(p0, p1, type) {
  if (type === 0) {
    return `L ${p1.x},${p1.y}`;
  }

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular consistente con el sentido de recorrido (rotación -90°)
  const px = uy;
  const py = -ux;
  const amp = TAB_AMP * type;

  function pt(t, offset) {
    return {
      x: p0.x + ux * t * len + px * offset,
      y: p0.y + uy * t * len + py * offset,
    };
  }

  const c1 = pt(0.20, 0);
  const c2 = pt(0.20, amp);
  const k1 = pt(0.35, amp);

  const c3 = pt(0.40, amp * 1.5);
  const c4 = pt(0.60, amp * 1.5);
  const k2 = pt(0.65, amp);

  const c5 = pt(0.80, amp);
  const c6 = pt(0.80, 0);

  return `C ${c1.x},${c1.y} ${c2.x},${c2.y} ${k1.x},${k1.y} ` +
         `C ${c3.x},${c3.y} ${c4.x},${c4.y} ${k2.x},${k2.y} ` +
         `C ${c5.x},${c5.y} ${c6.x},${c6.y} ${p1.x},${p1.y}`;
}

// Construye el "d" del path de una pieza (r,c), recorriendo en sentido horario:
// arriba (izq->der), derecha (arr->abajo), abajo (der->izq), izquierda (abajo->arr)
function buildPiecePath(r, c, horizType, vertType) {
  const topLeft = { x: 0, y: 0 };
  const topRight = { x: S, y: 0 };
  const bottomRight = { x: S, y: S };
  const bottomLeft = { x: 0, y: S };

  const topType = r === 0 ? 0 : horizType[r - 1][c];
  const rightType = c === GRID - 1 ? 0 : vertType[r][c];
  const bottomType = r === GRID - 1 ? 0 : horizType[r][c];
  const leftType = c === 0 ? 0 : vertType[r][c - 1];

  let d = `M ${topLeft.x},${topLeft.y} `;
  d += edgeSegment(topLeft, topRight, topType) + " ";
  d += edgeSegment(topRight, bottomRight, rightType) + " ";
  d += edgeSegment(bottomRight, bottomLeft, bottomType) + " ";
  d += edgeSegment(bottomLeft, topLeft, leftType) + " Z";

  return d;
}

/* ---------------------------------------------------------
   Crea el elemento SVG de una pieza
   --------------------------------------------------------- */
function createPieceElement(r, c, horizType, vertType) {
  const pathD = buildPiecePath(r, c, horizType, vertType);
  const clipId = `clip-${r}-${c}`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${-MARGIN} ${-MARGIN} ${S + MARGIN * 2} ${S + MARGIN * 2}`);
  svg.classList.add("piece");
  svg.setAttribute("draggable", "true");
  svg.dataset.row = r;
  svg.dataset.col = c;

  const defs = document.createElementNS(SVG_NS, "defs");
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", clipId);
  const clipPathShape = document.createElementNS(SVG_NS, "path");
  clipPathShape.setAttribute("d", pathD);
  clipPath.appendChild(clipPathShape);
  defs.appendChild(clipPath);

  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("clip-path", `url(#${clipId})`);

  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", IMAGE_SRC);
  // La imagen completa se posiciona para que el fragmento (r,c) caiga en (0,0)
  image.setAttribute("x", -c * S);
  image.setAttribute("y", -r * S);
  image.setAttribute("width", S * GRID);
  image.setAttribute("height", S * GRID);
  g.appendChild(image);

  const outline = document.createElementNS(SVG_NS, "path");
  outline.setAttribute("d", pathD);
  outline.setAttribute("fill", "none");
  outline.setAttribute("stroke", "rgba(0,0,0,0.35)");
  outline.setAttribute("stroke-width", "2");

  svg.appendChild(defs);
  svg.appendChild(g);
  svg.appendChild(outline);

  return svg;
}

/* ---------------------------------------------------------
   Generación de la matriz de bordes (compartidos entre piezas vecinas)
   --------------------------------------------------------- */
function generateEdgeTypes() {
  // horizType[r][c]: borde horizontal entre la pieza (r,c) y (r+1,c)
  const horizType = [];
  for (let r = 0; r < GRID - 1; r++) {
    const row = [];
    for (let c = 0; c < GRID; c++) {
      row.push(Math.random() < 0.5 ? 1 : -1);
    }
    horizType.push(row);
  }

  // vertType[r][c]: borde vertical entre la pieza (r,c) y (r,c+1)
  const vertType = [];
  for (let r = 0; r < GRID; r++) {
    const row = [];
    for (let c = 0; c < GRID - 1; c++) {
      row.push(Math.random() < 0.5 ? 1 : -1);
    }
    vertType.push(row);
  }

  return { horizType, vertType };
}

/* ---------------------------------------------------------
   Mezclar un arreglo (Fisher-Yates)
   --------------------------------------------------------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------------------------------------------------
   Construcción del tablero (celdas vacías)
   --------------------------------------------------------- */
function buildBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.row = r;
      cell.dataset.col = c;

      cell.addEventListener("dragover", onCellDragOver);
      cell.addEventListener("dragleave", onCellDragLeave);
      cell.addEventListener("drop", onCellDrop);

      boardEl.appendChild(cell);
    }
  }
}

/* ---------------------------------------------------------
   Construcción de la bandeja de piezas (desordenadas)
   --------------------------------------------------------- */
function buildTray() {
  trayEl.innerHTML = "";
  const { horizType, vertType } = generateEdgeTypes();

  const positions = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      positions.push({ r, c });
    }
  }
  shuffle(positions);

  positions.forEach(({ r, c }) => {
    const piece = createPieceElement(r, c, horizType, vertType);
    piece.addEventListener("dragstart", onPieceDragStart);
    piece.addEventListener("dragend", onPieceDragEnd);
    trayEl.appendChild(piece);
  });
}

/* ---------------------------------------------------------
   Eventos de drag & drop
   --------------------------------------------------------- */
function onPieceDragStart(e) {
  draggedPieceEl = e.currentTarget;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", JSON.stringify({
    row: draggedPieceEl.dataset.row,
    col: draggedPieceEl.dataset.col,
  }));
  startTimerIfNeeded();
}

function onPieceDragEnd() {
  draggedPieceEl = null;
}

function onCellDragOver(e) {
  e.preventDefault();
  if (!e.currentTarget.classList.contains("filled")) {
    e.currentTarget.classList.add("drag-over");
  }
}

function onCellDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onCellDrop(e) {
  e.preventDefault();
  const cell = e.currentTarget;
  cell.classList.remove("drag-over");

  if (cell.classList.contains("filled") || !draggedPieceEl) return;

  const data = JSON.parse(e.dataTransfer.getData("text/plain"));
  const correct = String(cell.dataset.row) === String(data.row) &&
                   String(cell.dataset.col) === String(data.col);

  movesCount++;
  moveCounterEl.textContent = movesCount;

  if (correct) {
    cell.appendChild(draggedPieceEl);
    draggedPieceEl.classList.add("placed");
    draggedPieceEl.setAttribute("draggable", "false");
    cell.classList.add("filled");
    placedCount++;

    if (placedCount === GRID * GRID) {
      onPuzzleComplete();
    }
  } else {
    const pieceToShake = draggedPieceEl;
    pieceToShake.classList.add("wrong-shake");
    setTimeout(() => pieceToShake.classList.remove("wrong-shake"), 350);
  }
}

/* ---------------------------------------------------------
   Cronómetro
   --------------------------------------------------------- */
function startTimerIfNeeded() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mm = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const ss = String(secondsElapsed % 60).padStart(2, "0");
    timerEl.textContent = `${mm}:${ss}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

/* ---------------------------------------------------------
   Victoria
   --------------------------------------------------------- */
function onPuzzleComplete() {
  stopTimer();
  winStatsEl.textContent = `Lo lograste en ${movesCount} movimientos y ${timerEl.textContent}.`;
  winOverlayEl.classList.remove("hidden");
}

/* ---------------------------------------------------------
   Nueva partida / reinicio
   --------------------------------------------------------- */
function startNewGame() {
  movesCount = 0;
  placedCount = 0;
  secondsElapsed = 0;
  stopTimer();
  moveCounterEl.textContent = "0";
  timerEl.textContent = "00:00";
  winOverlayEl.classList.add("hidden");

  buildBoard();
  buildTray();
}