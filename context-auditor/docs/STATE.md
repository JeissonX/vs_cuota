# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 3 completado. Iniciando Hito 4 (Conversación activa).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Verifica `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). |
| Semáforo e Insignia | [VERIFICADO] | $T_{\text{frescos}}$ con $k_{\text{cache}} = 0.10$; semáforo sin huecos (ROJO/AMARILLO/VERDE); insignia (>25% Denso, >50% Crítico). |
| Topes duros de Snapshot | [VERIFICADO] | Git resumen (20 líneas / 1.000 chars); `last_assistant` (400 chars finales); `last_user` (300 chars); `first_user` (300 chars); intermedios (máx 2 x 150 chars); archivos (máx 8); comandos (máx 3). |
| Sección 'Últimos Comandos' | [VERIFICADO] | Incluida con éxito en el snapshot al haber verificado en el spike que `step_type = 21` almacena el comando y el código de salida numérico (`exitCode`). |
| Invocación Git segura | [VERIFICADO] | `execFile` con timeout de 3.000 ms y argumentos directos sin shell para `rev-parse`, `status -s` y `diff --stat`. |
| Privacidad en Snapshot | [VERIFICADO] | Sanitización rigurosa de rutas reemplazando carpetas personales con `~`. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Topes duros**: En caso de ausencia, fallback a `[No disponible]` y `[Consultar git status]`.
3. **Sección 'Últimos comandos'**: Activa gracias a la deserialización exitosa de `step_type = 21`.

## Cómo Compilar y Probar
- Compilar: `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npx tsc --noEmit`
- Tests: `node --import tsx --test test/**/*.test.ts`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [x] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y últimos comandos con exit code).
- [ ] Hito 4: Conversación activa (vigilante de WAL con fs.watch + sondeo de respaldo, debounce, quickPick de resolución).
- [ ] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
