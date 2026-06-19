/* =========================================================
   ROMPECABEZAS - script.js
   - Genera piezas cuadradas a partir de la imagen, usando
     la técnica de "sprite grid" con background-position.
   - Maneja el drag & drop, el contador de movimientos,
     el cronómetro, la detección de victoria y el efecto
     de revelación final (fundido + destello de brillo).
   ========================================================= */

const GRID = 4;                 // tablero 4x4 = 16 piezas
const IMAGE_SRC = "imagen.jpg"; // debe ser una imagen cuadrada

let movesCount = 0;
let placedCount = 0;
let timerInterval = null;
let secondsElapsed = 0;

const boardEl = document.getElementById("board");
const boardWrapperEl = document.getElementById("board-wrapper");
const trayEl = document.getElementById("tray");
const moveCounterEl = document.getElementById("move-counter");
const timerEl = document.getElementById("timer");
const winOverlayEl = document.getElementById("win-overlay");
const winStatsEl = document.getElementById("win-stats");

document.getElementById("reset-btn").addEventListener("click", startNewGame);
document.getElementById("play-again-btn").addEventListener("click", startNewGame);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);

startNewGame();

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
   Crea el elemento de una pieza cuadrada
   --------------------------------------------------------- */
function createPieceElement(r, c) {
  const piece = document.createElement("div");
  piece.classList.add("piece");
  piece.dataset.row = r;
  piece.dataset.col = c;

  // Truco de "sprite grid": el fondo se agranda GRID veces y se
  // posiciona en porcentajes para que cada pieza muestre su
  // fragmento exacto de la imagen completa.
  piece.style.backgroundImage = `url(${IMAGE_SRC})`;
  piece.style.backgroundSize = `${GRID * 100}% ${GRID * 100}%`;
  piece.style.backgroundPosition =
    `${(c / (GRID - 1)) * 100}% ${(r / (GRID - 1)) * 100}%`;

  piece.addEventListener("pointerdown", onPointerDown);
  return piece;
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
      boardEl.appendChild(cell);
    }
  }
}

/* ---------------------------------------------------------
   Construcción de la bandeja de piezas (desordenadas)
   --------------------------------------------------------- */
function buildTray() {
  trayEl.innerHTML = "";

  const positions = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      positions.push({ r, c });
    }
  }
  shuffle(positions);

  positions.forEach(({ r, c }) => {
    trayEl.appendChild(createPieceElement(r, c));
  });
}

/* ---------------------------------------------------------
   Arrastre manual con Pointer Events (mouse y touch)
   --------------------------------------------------------- */
let activePiece = null;
let pointerOffsetX = 0;
let pointerOffsetY = 0;
let originParent = null;
let originNextSibling = null;

function onPointerDown(e) {
  const piece = e.currentTarget;
  if (piece.classList.contains("placed")) return;
  e.preventDefault();

  activePiece = piece;
  originParent = piece.parentElement;
  originNextSibling = piece.nextSibling;

  const rect = piece.getBoundingClientRect();
  pointerOffsetX = e.clientX - rect.left;
  pointerOffsetY = e.clientY - rect.top;

  piece.classList.add("dragging");

  // Se "saca" la pieza al body para que pueda flotar libremente
  // por encima de todo mientras se arrastra.
  document.body.appendChild(piece);
  piece.style.position = "fixed";
  piece.style.left = `${rect.left}px`;
  piece.style.top = `${rect.top}px`;
  piece.style.width = `${rect.width}px`;
  piece.style.height = `${rect.height}px`;
  piece.style.zIndex = "1000";
  piece.style.pointerEvents = "none"; // para que elementFromPoint detecte lo de abajo

  startTimerIfNeeded();
}

function onPointerMove(e) {
  if (!activePiece) return;
  activePiece.style.left = `${e.clientX - pointerOffsetX}px`;
  activePiece.style.top = `${e.clientY - pointerOffsetY}px`;

  document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const cell = under ? under.closest(".cell") : null;
  if (cell && !cell.classList.contains("filled")) {
    cell.classList.add("drag-over");
  }
}

function onPointerUp(e) {
  if (!activePiece) return;
  const piece = activePiece;

  document.querySelectorAll(".cell.drag-over").forEach((c) => c.classList.remove("drag-over"));

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const cell = under ? under.closest(".cell") : null;

  // Restaurar el estilo "flotante" antes de reubicar la pieza
  piece.classList.remove("dragging");
  piece.style.position = "";
  piece.style.left = "";
  piece.style.top = "";
  piece.style.width = "";
  piece.style.height = "";
  piece.style.zIndex = "";
  piece.style.pointerEvents = "";

  let placedOk = false;

  if (cell && !cell.classList.contains("filled")) {
    movesCount++;
    moveCounterEl.textContent = movesCount;

    const correct = String(cell.dataset.row) === String(piece.dataset.row) &&
                     String(cell.dataset.col) === String(piece.dataset.col);

    if (correct) {
      cell.appendChild(piece);
      piece.classList.add("placed");
      cell.classList.add("filled");
      placedCount++;
      placedOk = true;

      if (placedCount === GRID * GRID) {
        onPuzzleComplete();
      }
    }
  }

  if (!placedOk) {
    if (originNextSibling && originNextSibling.parentElement === originParent) {
      originParent.insertBefore(piece, originNextSibling);
    } else {
      originParent.appendChild(piece);
    }
    if (cell) {
      piece.classList.add("wrong-shake");
      setTimeout(() => piece.classList.remove("wrong-shake"), 350);
    }
  }

  activePiece = null;
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
   Victoria: fundido + destello de brillo, luego el cartel
   --------------------------------------------------------- */
function onPuzzleComplete() {
  stopTimer();
  winStatsEl.textContent = `Lo lograste en ${movesCount} movimientos y ${timerEl.textContent}.`;

  // Dispara el efecto visual (fundido de la imagen completa + brillo)
  boardWrapperEl.classList.add("solved");

  // Espera a que termine el efecto antes de mostrar el cartel de victoria
  setTimeout(() => {
    winOverlayEl.classList.remove("hidden");
  }, 1300);
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
  boardWrapperEl.classList.remove("solved");

  buildBoard();
  buildTray();
}