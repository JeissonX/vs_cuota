# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 5 completado. Iniciando Hito 6 (Calibración offline).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: composición estimada del prompt y lista de archivos activas).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Verificación de `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). |
| Semáforo e Insignia | [VERIFICADO] | $T_{\text{frescos}}$ con $k_{\text{cache}} = 0.10$; semáforo sin huecos (ROJO/AMARILLO/VERDE); insignia (>25% Denso, >50% Crítico). |
| Snapshot determinista | [VERIFICADO] | Topes duros validados; secciones de entorno, última interacción, historial acotado, archivos y últimos comandos con exit code. |
| Vigilante de Sesión Activa | [VERIFICADO] | `fs.watch` sobre `.db` y `.db-wal` con debounce de 500ms + sondeo periódico de respaldo. |
| Status Bar & Webview | [VERIFICADO] | Status bar con semáforo e insignia dinámica + Webview panel completo con radiografía exacta, barras de desglose y composición estimada. |
| Comandos de Extensión | [VERIFICADO] | `contextAuditor.copySnapshot`, `contextAuditor.selectSession`, `contextAuditor.openPanel` implementados y registrados en `package.json`. |
| Empaquetado VSIX | [VERIFICADO] | Empaquetado exitoso de `context-auditor-0.1.0.vsix` (14.78 KB) con `.vscodeignore` estricto que excluye scripts y tests. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Empaquetado limpio**: `.vscodeignore` evita la inclusión de código de pruebas o archivos temporales en el paquete `.vsix`.
3. **Valores provisionales**: Umbrales marcados "a calibrar" en UI y README (Gemini 50k/120k; Claude 20k/45k).
4. **Seguridad S1/S2/S3/S4**: Garantizadas en todos los componentes.

## Cómo Compilar y Probar
- Compilar: `npm run compile` o `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npm run typecheck` o `npx tsc --noEmit`
- Tests: `npm test` o `node --import tsx --test test/**/*.test.ts`
- Empaquetar: `npm run package`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [x] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y últimos comandos con exit code).
- [x] Hito 4: Conversación activa (vigilante de WAL con fs.watch + sondeo de respaldo, debounce, quickPick de resolución).
- [x] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
