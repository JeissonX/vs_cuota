# Context Auditor — Estado Actual del Proyecto (Hito 8)

## Resumen Ejecutivo
- **Hito actual**: Hito 8 completado (Diagnóstico visible y estado honesto).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: composición estimada del prompt y lista de archivos activas).
- **Rama git**: `context-auditor`
- **Artefacto empaquetado**: `context-auditor/context-auditor-0.1.1.vsix`

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Mapeo de step_type** | `[VERIFICADO CON DATOS REALES]` | Comprobado en 6 bases SQLite reales con 1.174 pasos:<br>• `step_type = 14`: Prompts del usuario (texto en `step_payload.19.2`).<br>• `step_type = 15`: Inferencia del modelo (tokens en `metadata.9`: 9.5 input, 9.6 cache/enum, 9.2 thoughts, 9.3 output; texto en `step_payload.20.1`, thoughts en `20.3`).<br>• `step_type = 21`: `run_command` (args JSON en `5.4.3`, exit code en `28.6`, stdout en `28.21.1`).<br>• `step_type = 5`: `write_to_file` (args JSON en `5.4.3`, URI en `10.1.2.2.5`).<br>• `step_type = 8`: `view_file` (args JSON en `5.4.3`, URI en `14.1`). |
| **Ubicación y Mapeo del Modelo** | `[VERIFICADO CON DATOS REALES]` | Comprobado en todas las bases:<br>• ID numérico en `steps.metadata.9.1` (`1318` para Gemini, `1026` para Claude).<br>• Tabla `gen_metadata.data.1`: subcampo 3 (ID numérico), 19 (slug: `gemini-3.8-flash-n`, `claude-opus-4-6-thinking`), 20 (`used_claude`), 21 (display name: `Gemini 3.8 Flash (High)`, `Claude Opus 4.6 (Thinking)`).<br>• Peticiones Claude en `metadata.9.11` inician con `req_vrtx_` (Vertex AI).<br>• 0 pasos desconocidos en 1.174 analizados. |
| **Estructura de Timestamps y Latencia** | `[VERIFICADO CON DATOS REALES]` | Comprobado en 1.174 pasos:<br>• Submensajes con campos 1 (segundos unix) y 2 (nanosegundos).<br>• Campo 1 = inicio de inferencia / request dispatch.<br>• Campo 6 = TTFT (Time To First Token).<br>• Campos 7 u 8 = fin de generación.<br>• Mediana TTFT en Gemini: 4.65s; generación posterior: 0.06s. Latencia dominada por red y TTFT. Coeficientes $\alpha$ y $\beta$ no son utilizables para predecir tokens ($R^2 = 0.53$). Criterio de latencia desactivado. |
| **Distribución de Tokens e Inputs > 200k** | `[VERIFICADO CON DATOS REALES]` | Comprobado empíricamente en `scripts/calibrate.mjs`:<br>• Gemini ($n=1.156$): $p_{50}=101.537$, $p_{75}=164.969$, $p_{90}=210.967$, $p_{95}=233.135$, máx=254.936.<br>• Claude ($n=18$): $p_{50}=117.077$, $p_{75}=127.390$, $p_{90}=137.230$, máx=144.852.<br>• 142 pasos (12.1%) superan 200.000 tokens: el 100% pertenece a Gemini Flash (ventana 1M, ocupación <25.5%). Ningún paso de Claude supera su ventana de 200k.<br>• $T_{\text{frescos}}$ es casi idéntico al Input bruto (-21.6 tokens) por campo 9.6 cuasi-constante (24/26). |
| **Opción de Conversación Activa Elegida** | `[VERIFICADO CON DATOS REALES]` | Enfoque híbrido validado en el spike:<br>• Monitoreo de `.db-wal` con `fs.watch` (debounce 500ms) + sondeo periódico de respaldo (cada 3.5s si `vscode.window.state.focused`).<br>• Detección de contención si >1 base recibe escrituras en ventana de 2s.<br>• Prevalencia de sesión fijada manualmente (`isPinned`) guardada en `workspaceState`. |
| **Schema Guard** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/dbReader.ts` (`validateSchema` con `PRAGMA table_info(steps)` y columnas `idx`, `step_type`, `metadata`). Verificado con 2 tests sintéticos en memoria. |
| **Lector SQLite y Decodificador Tokens** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/dbReader.ts` y `src/vendor/protoWire.ts`. Verificado con 4 tests sintéticos con buffers controlados y archivos temporales. |
| **Semáforo e Insignia** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Implementado en `src/healthEvaluator.ts` ($T_{\text{frescos}}$, semáforo sin huecos ROJO/AMARILLO/VERDE, insignia por ocupación >25% y >50%, guardas de calibración). Verificado con 7 tests unitarios exhaustivos. |
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
6. **Umbrales y Latencia**: Umbrales vigentes provisionales conservados intactos; criterio de latencia estrictamente desactivado tras el análisis empírico del Hito 7.

---

## Cómo Compilar, Probar e Instalar

### Compilar y Probar
- Compilar: `npm run compile` o `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npm run typecheck` o `npx tsc --noEmit`
- Tests: `npm test` o `node --import tsx --test test/**/*.test.ts` (23 tests unitarios pasando, 0 fallos)
- Calibrar: `node --import tsx scripts/calibrate.mjs` (análisis pasivo multi-modelo)
- Empaquetar: `npm run package` (genera `context-auditor-0.1.1.vsix`)

### Instalación en Antigravity IDE
> **ADVERTENCIA**: No utilice `code --install-extension` en la terminal, ya que el comando `code` generalmente apunta a VS Code estándar y no a Antigravity IDE.
1. Abra **Antigravity IDE**.
2. Abra el panel de Extensiones (`Ctrl+Shift+X`).
3. Haga clic en el menú contextual de tres puntos (`...`) en la esquina superior derecha del panel de Extensiones.
4. Seleccione **"Install from VSIX…"** (*Instalar desde VSIX...*).
5. Seleccione el archivo `context-auditor/context-auditor-0.1.1.vsix`.

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
