# WebChess

Ajedrez 3D en el navegador contra Claude. Las blancas son elfos y las negras orcos: miniaturas esculpidas por código en Blender y renderizadas con three.js.

## Cómo funciona

- **Reglas**: [chess.js](https://github.com/jhlywa/chess.js) valida todas las jugadas, incluidos enroque (pincha el rey y luego la torre), al paso y coronación.
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
  game/      reglas (lógica pura, con tests) y controlador de la partida
  scene/     tablero 3D, ambiente (farolas, braseros, partículas) y acabados procedurales
  ui/        HUD y almacenamiento de credenciales
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

## Despliegue

Cada push a `main` pasa el CI (typecheck, lint, formato, tests y build) y publica `dist/` en **GitHub Pages**. Se sirve en **https://chess.christianpasinrey.es**, definido en `public/CNAME`; en el DNS hay un registro `CNAME` de `chess` apuntando a `christianpasinrey.github.io`.

Para desplegar en una subruta en vez de un subdominio: `VITE_BASE=/webchess/ npm run build`.
