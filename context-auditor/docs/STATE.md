# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 4 completado. Iniciando Hito 5 (Interfaz y empaquetado).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: composición estimada y lista de archivos activas).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Comprobación de `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). |
| Semáforo e Insignia | [VERIFICADO] | $T_{\text{frescos}}$ con $k_{\text{cache}} = 0.10$; semáforo sin huecos (ROJO/AMARILLO/VERDE); insignia (>25% Denso, >50% Crítico). |
| Snapshot determinista | [VERIFICADO] | Topes duros validados; secciones de entorno, última interacción, historial acotado, archivos y últimos comandos con exit code. |
| Vigilante de Sesión Activa | [VERIFICADO] | `fs.watch` sobre `.db` y `.db-wal` con debounce de 500ms + sondeo periódico de respaldo (cada 3.5s si ventana tiene foco). |
| Detección de Contención | [VERIFICADO] | Alerta de contención si más de una base recibe escrituras en una ventana de 2 segundos. |
| Fijado de Sesión (Pinned) | [VERIFICADO] | QuickPick permite fijar manualmente una sesión específica, persistida en `workspaceState`, prevaleciendo sobre la más reciente. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Vigilancia Híbrida**: `fs.watch` reactivo para cambios instantáneos + sondeo periódico de respaldo para garantizar robustez ante posibles eventos omitidos por el kernel de Windows.
3. **Persistencia de sesión**: `context.workspaceState` guarda `contextAuditor.pinnedSessionId`. Opción de "Detección automática" para restaurar el comportamiento dinámico.

## Cómo Compilar y Probar
- Compilar: `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npx tsc --noEmit`
- Tests: `node --import tsx --test test/**/*.test.ts`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [x] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y últimos comandos con exit code).
- [x] Hito 4: Conversación activa (vigilante de WAL con fs.watch + sondeo de respaldo, debounce, quickPick de resolución).
- [ ] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
