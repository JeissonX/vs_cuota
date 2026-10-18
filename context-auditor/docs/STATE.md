# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Todos los hitos (0 al 6) completados con éxito y en verde.
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: composición estimada del prompt y lista de archivos activas).
- **Rama git**: `context-auditor`
- **Artefacto empaquetado**: `context-auditor/context-auditor-0.1.0.vsix` (14.78 KB)

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Verificación de columnas críticas `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). Valida enteros seguros y calcula input fresco `inputNoCache = input - cacheRead`. |
| Semáforo e Insignia | [VERIFICADO] | $T_{\text{frescos}}$ con $k_{\text{cache}} = 0.10$; semáforo sin huecos (ROJO/AMARILLO/VERDE); insignia por ocupación de ventana (>25% Denso, >50% Crítico). |
| Snapshot determinista | [VERIFICADO] | Topes duros validados; secciones de entorno, última interacción, historial acotado, archivos y últimos comandos con exit code. Cero coste de tokens ni llamadas a LLMs. |
| Vigilante de Sesión Activa | [VERIFICADO] | `fs.watch` sobre `.db` y `.db-wal` con debounce de 500ms + sondeo periódico de respaldo (cada 3.5s si ventana tiene foco). Detección de contención en ventana de 2s y fijado manual persistido en `workspaceState`. |
| Status Bar & Webview | [VERIFICADO] | Status bar con semáforo e insignia dinámica + Webview panel completo con radiografía exacta, barras de desglose y composición estimada. |
| Comandos de Extensión | [VERIFICADO] | `contextAuditor.copySnapshot`, `contextAuditor.selectSession`, `contextAuditor.openPanel` implementados y operativos. |
| Calibración Offline | [VERIFICADO] | `scripts/calibrate.mjs` analizó 1.129 pasos de inferencia reales: p75=164.260 tokens, p90=211.770 tokens, $\alpha \approx 7.06$ ms/token, $\beta \approx 0.086$ ms/token. 100% solo lectura sin modificar archivos. |
| Fiabilidad fs.watch en Windows | [HIPÓTESIS] | fs.watch en Windows puede perder eventos en ráfagas de escritura intensiva; mitigado y blindado con el sondeo de respaldo periódico. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Empaquetado limpio**: `.vscodeignore` estricto que asegura que el VSIX solo contenga `dist/extension.js`, `package.json`, `README.md` y `LICENSE.txt`.
3. **Seguridad S1/S2**: `DatabaseSync` estrictamente solo lectura (`readOnly: true`, `PRAGMA busy_timeout = 3000`, `PRAGMA query_only = ON`). Sin dependencias externas ni conexión a red.
4. **Privacidad S3**: Sanitización de rutas con `~` y truncado a 80 chars en logs. `spike_result.json` y `*.vsix` ignorados en git.
5. **Resistencia S4**: Límite de últimos N pasos (por defecto 200). Errores degradan a estado inactivo sin lanzar excepciones.

## Cómo Compilar y Probar
- Compilar: `npm run compile` o `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npm run typecheck` o `npx tsc --noEmit`
- Tests: `npm test` o `node --import tsx --test test/**/*.test.ts` (21 tests unitarios pasando)
- Calibrar: `node scripts/calibrate.mjs` (análisis pasivo de bases de datos locales)
- Empaquetar: `npm run package` (genera `context-auditor-0.1.0.vsix`)
- Instalar VSIX: `code --install-extension context-auditor-0.1.0.vsix`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [x] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y últimos comandos con exit code).
- [x] Hito 4: Conversación activa (vigilante de WAL con fs.watch + sondeo de respaldo, debounce, quickPick de resolución).
- [x] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [x] Hito 6: Calibración offline (scripts/calibrate.mjs).
