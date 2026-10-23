# WebChess

Ajedrez 3D en el navegador contra Claude o contra un BOT (Stockfish). Las blancas son elfos y las negras orcos: miniaturas esculpidas por código en Blender y renderizadas con three.js.

## Cómo funciona

- **Reglas**: [chess.js](https://github.com/jhlywa/chess.js) valida todas las jugadas, incluidos enroque (pincha el rey y luego la torre), al paso y coronación.
- **Rival**: los botones «vs Claude» y «vs BOT» eligen contra quién juegas; el cambio se aplica en la siguiente jugada del rival.

### vs BOT

- **Motor**: [Stockfish.js](https://github.com/nmrugg/stockfish.js) 19, versión _lite_ de un hilo compilada a WebAssembly. Corre en un Web Worker dentro del navegador: sin API key, sin coste y sin servidor. Se descarga (~1,2 MB comprimido) la primera vez que juega el BOT.
- **Dificultad**: Novato y Fácil usan `Skill Level` con búsqueda poco profunda; Intermedio (1500), Avanzado (1900) y Experto (2400) limitan la fuerza por Elo con `UCI_Elo`; Maestro juega sin límite.
- **Licencia**: Stockfish es GPLv3. Los binarios se sirven desde `engine/` junto a su licencia (`engine/COPYING.txt`); el código fuente está en el repositorio enlazado.

### vs Claude

- **IA**: en cada turno se envía a Claude solo la posición actual (matriz 8×8, FEN y jugadas legales), sin historial, así cada jugada cuesta muy poco. La respuesta es JSON con salida estructurada; si la jugada no es legal se reintenta hasta 3 veces.
- **Niveles**: Principiante (Haiku 5.5, esfuerzo bajo), Intermedio (Sonnet 5.5, bajo), Avanzado (Opus 5.5, medio) y Maestro (Opus 5.5, alto). El panel muestra el consumo estimado de la sesión.
- **Tu API key** se usa directamente desde el navegador contra `api.anthropic.com`. Por defecto se guarda solo en la sesión (`sessionStorage`); marca «Recordar la key» para guardarla en este navegador. La CSP de producción solo permite conexiones a la propia web y a la API de Anthropic.
  - Si tu key no está ligada a un workspace, rellena también el **Workspace ID** (`wrkspc_...`).

## Desarrollo

Requisitos: Node 22 (`.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + formato + tests
npm run build      # build de producción en dist/
npm run preview    # sirve dist/ en local
```

## Estructura

```
src/
  ai/        niveles, construcción del prompt y cliente de la API
  engine/    Stockfish: niveles y protocolo UCI (lógica pura, con tests) y el worker
  game/      reglas (lógica pura, con tests) y controlador de la partida
  scene/     tablero 3D, ambiente (farolas, braseros, partículas) y acabados procedurales
  ui/        HUD y almacenamiento de credenciales y preferencias
blender/     escultura de piezas, tablero y entorno (Python para Blender)
public/      modelo comprimido (models/chess.glb) y favicon
```

## Modelo 3D

Todo el set se genera con Blender en modo headless; no hay modelos hechos a mano.

```bash
npm run model                      # exporta con Blender y comprime con meshopt → public/models/chess.glb
RENDER=1 npm run model:export      # además, render de la alineación de piezas para revisarlas
BLENDER=/ruta/a/blender npm run model   # si Blender no está en /Applications
```

- `blender/figures.py`: figuras (cuerpos con metaballs + armas, escudos, monturas, torres).
- `blender/build_pieces.py`: tablero, glifos, estrado, farolas, braseros y exportación.
- `blender/geo.py`: utilidades geométricas compartidas.

El `.glb` comprimido se versiona en el repo porque el CI no ejecuta Blender.
