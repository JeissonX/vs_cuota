# Context Auditor — Estado Actual del Proyecto (Hito 9)

## Resumen Ejecutivo
- **Hito actual**: Hito 9 completado (Investigación de solo lectura + perfil de umbrales + detección dinámica de modelos).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: composición estimada del prompt y lista de archivos activas).
- **Rama git**: `context-auditor`
- **Artefacto empaquetado**: `context-auditor/context-auditor-0.1.2.vsix`

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Mapeo de step_type** | `[VERIFICADO CON DATOS REALES]` | Comprobado en 6 bases SQLite reales con 1.346 pasos:<br>• `step_type = 14`: Prompts del usuario (texto en `step_payload.19.2`).<br>• `step_type = 15`: Inferencia del modelo (tokens en `metadata.9`: 9.5 input, 9.6 cache/enum, 9.2 thoughts, 9.3 output; texto en `step_payload.20.1`, thoughts en `20.3`).<br>• `step_type = 21`: `run_command` (args JSON en `5.4.3`, exit code en `28.6`, stdout en `28.21.1`).<br>• `step_type = 5`: `write_to_file` (args JSON en `5.4.3`, URI en `10.1.2.2.5`).<br>• `step_type = 8`: `view_file` (args JSON en `5.4.3`, URI en `14.1`). |
| **Origen de la Caché y Auditoría de Campos** | `[VERIFICADO CON DATOS REALES]` | `[NO HAY]` señal local de caché:<br>• agpro-quota calcula acierto sumando `metadata.9.6`, pero 9.6 vale constantemente 24 (Gemini) o 26 (Claude) como enumerado de modelo/estado.<br>• Auditoría de los 38 caminos numéricos en `metadata` y de `gen_metadata`: ninguno correlaciona con reuso de prompt.<br>• UI adaptada para indicar "Caché: no disponible localmente", $k_{\text{cache}}$ queda sin efecto. |
| **Estructura de Timestamps y Latencia vs. Input** | `[VERIFICADO CON DATOS REALES]` | Comprobado en 1.241 pasos con timestamps:<br>• Campo 6 es el **TTFT (Time To First Token)**: `(fin - campo 6)` correlaciona $r > 0.85$ con `Output`.<br>• Regresión multivariante: $\beta_{\text{input}} \approx 16$ ms/1k tokens (Gemini) frente a $\beta_0 = 2.14$s de conexión HTTP y dispersión estocástica de red ($p_{90} > 10$s, RMSE 2.91s).<br>• La latencia **NO** crece de forma útil con el Input. Criterio de latencia estrictamente desactivado. |
| **Distribución de Tokens y Muestreo Multi-Sesión** | `[VERIFICADO CON DATOS REALES]` | Comprobado en las 6 bases `.db`:<br>• 1.328 pasos de Gemini distribuidos en 6 sesiones (mediana de picos de sesión: 193.6k tokens; mediana de medias: 94.5k tokens). Las 2 sesiones más largas agrupan el 74.6% de los pasos.<br>• 18 pasos de Claude concentrados al 100% en una sola sesión (`fd98a33c`, pico 144.8k tokens). |
| **Detección Dinámica de Modelo (Sin IDs Fijos)** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/dbReader.ts` y `src/healthEvaluator.ts`:<br>• Lectura de catálogo `id -> { slug, name }` desde `gen_metadata` en tiempo de ejecución.<br>• Respaldo por subcadena ("gemini", "claude").<br>• Modelos desconocidos reportan familia `'unknown'`, rotulándose como `"modelo desconocido (ID: ...)"` en UI y diagnósticos (sin clasificar en silencio como Claude). Verificado con tests sintéticos de catálogo dinámico. |
| **Perfiles de Umbrales y Semáforo/Insignia** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/healthEvaluator.ts` (`contextAuditor.thresholdProfile`: `"observed"` [por defecto, Propuesta B] vs `"provisional"`).<br>• Rotulado explícito de bases en UI: semáforo = carga relativa al historial; insignia = ocupación de ventana.<br>• Verificado con barrido continuo de 0 a 250k tokens sin huecos y con monotonicidad estricta. |
| **Opción de Conversación Activa Elegida** | `[VERIFICADO CON DATOS REALES]` | Enfoque híbrido validado en el spike:<br>• Monitoreo de `.db-wal` con `fs.watch` (debounce 500ms) + sondeo periódico de respaldo (cada 3.5s si `vscode.window.state.focused`).<br>• Detección de contención si >1 base recibe escrituras en ventana de 2s.<br>• Prevalencia de sesión fijada manualmente (`isPinned`) guardada en `workspaceState`. |
| **Schema Guard** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/dbReader.ts` (`validateSchema` con `PRAGMA table_info(steps)` y columnas `idx`, `step_type`, `metadata`). Verificado con 2 tests sintéticos en memoria. |
| **Lector SQLite y Decodificador Tokens** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/dbReader.ts` y `src/vendor/protoWire.ts`. Verificado con 4 tests sintéticos con buffers controlados y archivos temporales. |
| **Snapshot Determinista** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/snapshotGenerator.ts` (topes duros, fallback `[No disponible]`, resumen git acotado y comandos con exit code). Verificado con 5 tests unitarios. |
| **Lógica del Vigilante de Sesión** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/sessionWatcher.ts` (ordenamiento por mtime/WAL, detección de contención en 2s y persistencia en workspaceState). Verificado con 3 tests unitarios. |
| **Formateador de Diagnóstico** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/diagnosticsFormatter.ts` (salida sanitizada sin prompts, sesión truncada a 6 chars, reporte de entorno, Schema Guard, tokens y configuración provisional). Verificado con 2 tests unitarios. |
| **Status Bar en IDE Real** | `[NO PROBADO EN EL IDE REAL]` | Controlador implementado en `src/statusBarController.ts` con tooltips Markdown y comandos, pero no ejecutado ni renderizado visualmente dentro de una instancia activa de Antigravity IDE. |
| **Webview Panel en IDE Real** | `[NO PROBADO EN EL IDE REAL]` | Plantilla HTML y estilos implementados en `src/panelHtml.ts` con postMessage, pero no interactuado visualmente dentro del IDE real. |
| **Comandos Interactivos en IDE Real** | `[NO PROBADO EN EL IDE REAL]` | `contextAuditor.copySnapshot`, `contextAuditor.selectSession`, `contextAuditor.openPanel`, `contextAuditor.diagnostics` registrados en extensión, pero no activados interactivamente por un usuario desde la Command Palette real. |
| **Vigilante en Concurrencia Real del IDE** | `[NO PROBADO EN EL IDE REAL]` | Los eventos de foco (`vscode.window.state.focused`) y el ciclo de vida del proceso de extensiones no han sido probados con múltiples ventanas reales de Antigravity en ejecución. |

---

## Decisiones Vigentes
1. **Escenario A**: Alcance completo (recent files y composición estimada habilitados).
2. **Empaquetado Estricto**: `.vscodeignore` asegura que el `.vsix` solo incluya `dist/extension.js`, `package.json`, `README.md` y `LICENSE`.
3. **Seguridad S1/S2**: `DatabaseSync` estrictamente solo lectura (`readOnly: true`, `PRAGMA busy_timeout = 3000`, `PRAGMA query_only = ON`). Cero escrituras en `~/.gemini`.
4. **Privacidad S3**: Sanitización de rutas con `~` y truncado de IDs de sesión. Prohibición total de registrar prompts o contenidos de usuario.
5. **Resistencia S4**: Límite de últimos N pasos (por defecto 200). Errores degradan a estado inactivo sin lanzar excepciones no controladas.
6. **Umbrales y Latencia**: Perfil por defecto `observed` (Propuesta B); criterio de latencia estrictamente desactivado tras la verificación del Hito 9b.
7. **Detección Dinámica**: Eliminación de IDs fijos (1318/1026); resolución dinámica contra `gen_metadata` y reporte honesto de modelos desconocidos.

---

## Cómo Compilar, Probar e Instalar

### Compilar y Probar
- Compilar: `npm run compile` o `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npm run typecheck` o `npx tsc --noEmit`
- Tests: `npm test` o `node --import tsx --test test/**/*.test.ts` (27 tests unitarios pasando, 0 fallos)
- Calibrar: `node --import tsx scripts/calibrate.mjs` (análisis pasivo multi-modelo)
- Empaquetar: `npm run package` (genera `context-auditor-0.1.2.vsix`)

### Instalación en Antigravity IDE
> **ADVERTENCIA**: No utilice `code --install-extension` en la terminal, ya que el comando `code` generalmente apunta a VS Code estándar y no a Antigravity IDE.
1. Abra **Antigravity IDE**.
2. Abra el panel de Extensiones (`Ctrl+Shift+X`).
3. Haga clic en el menú contextual de tres puntos (`...`) en la esquina superior derecha del panel de Extensiones.
4. Seleccione **"Install from VSIX…"** (*Instalar desde VSIX...*).
5. Seleccione el archivo `context-auditor/context-auditor-0.1.2.vsix`.

---

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana).
- [x] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y comandos).
- [x] Hito 4: Conversación activa (vigilante de WAL con fs.watch + sondeo de respaldo, debounce, quickPick).
- [x] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX inicial.
- [x] Hito 6: Calibración offline inicial (scripts/calibrate.mjs).
- [x] Hito 7: Conciliación de calibración y reporte empírico multi-modelo (`docs/CALIBRATION_REPORT.md`).
- [x] Hito 8: Diagnóstico visible (`contextAuditor.diagnostics`), estado honesto (`STATE.md`) y auditoría S1/S3.
