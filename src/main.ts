import "./styles/main.css";
import { GameController } from "./game/controller";
import { Board3D } from "./scene/board3d";
import { Hud } from "./ui/hud";

const MODEL_URL = `${import.meta.env.BASE_URL}models/chess.glb`;

function webglAvailable(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");

// Handlers are bound late so the controller can be created after the views it drives.
let controller: GameController | undefined;
const hud = new Hud(root, {
  onNewGame: () => controller?.newGame(),
  onUndo: () => controller?.undo(),
  onSettingsChange: () => controller?.onSettingsChange(),
});

if (!webglAvailable()) {
  hud.finishLoading("Tu navegador no soporta WebGL 2, necesario para el tablero 3D.");
} else {
  const board = new Board3D(hud.stage, (square) => controller?.onSquareClick(square));
  controller = new GameController(board, hud);
  board
    .load(MODEL_URL)
    .then(() => {
      hud.finishLoading();
      controller?.start();
    })
    .catch((err: unknown) => {
      hud.finishLoading(`No se pudo cargar el modelo 3D: ${err instanceof Error ? err.message : String(err)}`);
    });
}
