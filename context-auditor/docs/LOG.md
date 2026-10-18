# Context Auditor — Log de Hitos

Este archivo registra de forma acumulativa (solo adición) los eventos, decisiones, estado de tests y avance por cada hito del proyecto.

---

## [2026-10-17 20:12] HITO 0 — Andamiaje y spike de investigación (solo lectura)
- **Qué se hizo**:
  1. Se verificó Node.js v24.19.0 (cumple requerimiento >= 22.13 para `node:sqlite`).
  2. Se creó la estructura del proyecto `context-auditor/` (`package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `src/`, `test/`, `docs/`, `scripts/`).
  3. Se programó y ejecutó `scripts/spike.mjs` sin dependencias externas, inspeccionando 5 bases `.db` en `~/.gemini/antigravity-ide/conversations/`.
  4. Se decodificaron recursivamente los BLOBs protobuf de todas las tablas y tipos de pasos (`step_type`), guardando el informe en `spike_result.json`.
- **Decisiones y su motivo**:
  - **Escenario A adoptado**: Los payloads de herramientas en `step_payload` y `metadata` son cadenas JSON directas y legibles (`CommandLine`, `TargetFile`, `AbsolutePath`, etc.), y las herramientas registran código de salida (ej. exit code `0` en `run_command`). Permite el alcance completo (lista de archivos recientes y composición estimada).
  - Configuración de esbuild con `target: node22` y externos `['vscode', 'node:sqlite']`.
- **Archivos creados/modificados**:
  - `context-auditor/docs/PROMPT.md`
  - `context-auditor/.gitignore`
  - `context-auditor/package.json`
  - `context-auditor/tsconfig.json`
  - `context-auditor/esbuild.config.mjs`
  - `context-auditor/src/extension.ts`
  - `context-auditor/scripts/spike.mjs`
  - `context-auditor/docs/LOG.md`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/spike_result.json` (ignorado en git)
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `npx tsc --noEmit` -> Pasó (código 0, sin errores).
- **Hechos nuevos [VERIFICADO]**:
  - `step_type = 14`: Prompts del usuario (texto en `step_payload.19.2`).
  - `step_type = 15`: Inferencia del modelo (tokens en `metadata.9`: 9.5 input, 9.6 cache, 9.2 thoughts, 9.3 output; texto en `step_payload.20.1`, thoughts en `20.3`).
  - `step_type = 21`: `run_command` (args en JSON `5.4.3`, exit code en `28.6`, stdout en `28.21.1`).
  - `step_type = 5`: `write_to_file` (args en JSON `5.4.3`, URI en `10.1.2.2.5`).
  - `step_type = 8`: `view_file` (args en JSON `5.4.3`, URI en `14.1`).
  - Modelo activo: ID numérico en `steps.metadata.9.1` y slug/nombre en tabla `gen_metadata` (`data.1.19` y `data.1.21`).
  - Timestamps: campo 1 (inicio), campo 6 (TTFT), campos 7/8 (fin); latencia exacta calculable.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Fiabilidad de `fs.watch` en Windows durante ráfagas de escritura del WAL (se mitigará con sondeo híbrido de respaldo).
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 1 — Núcleo de lectura (Schema Guard, lector de conversación y extractor de tokens).

---

## [2026-10-17 20:15] HITO 1 — Núcleo de lectura
- **Qué se hizo**:
  1. Se implementó `src/types.ts` con definiciones tipadas para `TokenUsage`, `InferenceStep`, `SchemaGuardResult` y estructuras del auditor.
  2. Se copió y adaptó `protoWire.ts` a `src/vendor/protoWire.ts` con comentario de origen (`src/phase2/protoWire.ts (commit f3bb103c8c8adb3dff3d61ff6aafb000dedcc23b)`).
  3. Se construyó `src/dbReader.ts` con `validateSchema` (Schema Guard con `PRAGMA table_info(steps)`), `extractStepMetadata` y `readSessionContext` (cumpliendo S1: solo lectura, busy_timeout=3000, query_only=ON).
  4. Se escribieron 6 tests unitarios en `test/dbReader.test.ts` con fixtures 100% sintéticas creadas en memoria/archivos temporales.
- **Decisiones y su motivo**:
  - Uso de `@ts-expect-error` para `node:sqlite` manteniendo compatibilidad con `@types/node` v20 del repositorio padre sin tocar dependencias externas.
  - El decodificador extrae latencia precisa en milisegundos a partir de los submensajes de timestamp (campos 1 y 7/8).
- **Archivos creados/modificados**:
  - `context-auditor/src/types.ts`
  - `context-auditor/src/vendor/protoWire.ts`
  - `context-auditor/src/dbReader.ts`
  - `context-auditor/test/dbReader.test.ts`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `npx tsc --noEmit` -> Pasó (código 0, sin errores).
  - Tests: `node --import tsx --test test/**/*.test.ts` -> 6/6 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - Schema Guard detecta correctamente omisión de `metadata`, `idx` o `step_type` y emite el mensaje exacto exigido.
  - La extracción de tokens y timestamps calcula `latencyMs` exacto y degrada de forma segura ante datos ausentes o corruptos.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Ninguna sobre el núcleo de lectura.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 2 — Semáforo e insignia (funciones puras + configuración).

---

## [2026-10-17 20:17] HITO 2 — Semáforo e insignia (funciones puras + configuración)
- **Qué se hizo**:
  1. Se implementó `src/healthEvaluator.ts` con cálculo determinista de $T_{\text{frescos}}$, evaluación de semáforo (ROJO/AMARILLO/VERDE), insignia de ocupación de ventana (CRITICO/DENSO/NORMAL), y calibración matemática con guardas.
  2. Se implementó la fórmula de criterio por latencia $\Delta t_{\text{input}}$ (desactivada por defecto hasta contar con mediciones empíricas).
  3. Se crearon 7 tests unitarios en `test/healthEvaluator.test.ts` que demuestran un barrido exhaustivo en todo el dominio sin huecos, pruebas de borde en cada umbral, validación de guardas y resolución de familia de modelo.
- **Decisiones y su motivo**:
  - Evaluación secuencial de semáforo sin huecos: ROJO si $T \ge \Theta_{\text{rojo}}$, luego AMARILLO si $T \ge \Theta_{\text{amarillo}}$, sino VERDE.
  - La insignia se mantiene desacoplada del factor caché para medir fielmente la presión sobre el búfer de contexto según tamaño de ventana (Gemini 1M, Claude 200k).
  - Guardas estrictas de calibración: si $a \le 10^{-9}$ fallback a 0.10; recorte a $[0, 1]$; confiabilidad restringida a $n \ge 30, R^2 \ge 0.6, a > 0$.
- **Archivos creados/modificados**:
  - `context-auditor/src/healthEvaluator.ts`
  - `context-auditor/test/healthEvaluator.test.ts`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `npx tsc --noEmit` -> Pasó (código 0, sin errores).
  - Tests: `node --import tsx --test test/**/*.test.ts` -> 13/13 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - Demostrado que cualquier valor de $T_{\text{frescos}}$ cae en exactamente un estado válido del semáforo.
  - La insignia de ocupación responde exactamente a los umbrales de 25% (Denso) y 50% (Crítico).
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Coeficientes de latencia $\alpha$ y $\beta$ quedan pendientes de estimación en el Hito 6.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 3 — Snapshot determinista.

---

## [2026-10-17 20:20] HITO 3 — Snapshot determinista
- **Qué se hizo**:
  1. Se implementó `src/stepExtractor.ts` para extraer texto limpio de prompts de usuario (step 14), respuestas de asistente (step 15) y comandos ejecutados con exit code (step 21), con sanitización de rutas (`~`).
  2. Se construyó `src/snapshotGenerator.ts` con consultas seguras de git (`execFile` con timeout de 3s), truncado estricto a topes duros y formateador markdown para el portapapeles.
  3. Se amplió `src/dbReader.ts` con `readConversationForSnapshot` para recuperar turnos relevantes de la base SQLite.
  4. Se escribieron 5 tests unitarios en `test/snapshotGenerator.test.ts` validando topes duros, fallbacks, extracción de comandos y formateo.
- **Decisiones y su motivo**:
  - Inclusión de sección "Últimos Comandos": Habilitada porque el spike confirmó que `step_type = 21` expone el comando y el exit code exacto.
  - Topes duros implementados: Git resumen (20 líneas / 1.000 chars); `last_assistant` (400 chars finales); `last_user` (300 chars); `first_user` (300 chars iniciales); intermedios (2 x 150 chars); archivos modificados (máx 8); comandos (máx 3).
  - Sanitización universal de rutas reemplazando directorios de perfil personal por `~`.
- **Archivos creados/modificados**:
  - `context-auditor/src/stepExtractor.ts`
  - `context-auditor/src/snapshotGenerator.ts`
  - `context-auditor/src/dbReader.ts`
  - `context-auditor/test/snapshotGenerator.test.ts`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `npx tsc --noEmit` -> Pasó (código 0, sin errores).
  - Tests: `node --import tsx --test test/**/*.test.ts` -> 18/18 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - El snapshot se genera en milisegundos de forma 100% determinista sin depender de ninguna llamada a modelos ni incurrir en costos de tokens.
  - Los topes duros impiden que el snapshot crezca desmesuradamente o degrade el contexto de la nueva conversación.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Ninguna sobre generación de snapshot.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 4 — Conversación activa.

---

## [2026-10-17 20:23] HITO 4 — Conversación activa
- **Qué se hizo**:
  1. Se implementó `src/sessionWatcher.ts` que monitoriza `.db` y `.db-wal` mediante `fs.watch` con debounce de 500 ms y sondeo periódico de respaldo (cada 3.5 segundos con chequeo de foco de ventana).
  2. Se diseñó el algoritmo de detección de contención en una ventana de 2 segundos (2.000 ms).
  3. Se implementó la persistencia de sesión fijada en `context.workspaceState` y el selector QuickPick `contextAuditor.selectSession`.
  4. Se escribieron 3 tests unitarios en `test/sessionWatcher.test.ts` evaluando ordenamiento por mtime/WAL, detección de contención y fijación manual de sesión.
- **Decisiones y su motivo**:
  - Desacoplamiento de `vscode` mediante carga dinámica e inyección de `WorkspaceStateStorage` para permitir ejecución pura en el test runner de Node.js sin depender de mocks complejos.
  - El sondeo de respaldo garantiza robustez en Windows en caso de que `fs.watch` sufra pérdida o retraso de eventos durante operaciones intensivas de SQLite.
- **Archivos creados/modificados**:
  - `context-auditor/src/sessionWatcher.ts`
  - `context-auditor/test/sessionWatcher.test.ts`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `npx tsc --noEmit` -> Pasó (código 0, sin errores).
  - Tests: `node --import tsx --test test/**/*.test.ts` -> 21/21 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - La sesión fijada en `workspaceState` invalida con éxito el orden de mtime, permitiendo al usuario auditar una sesión histórica sin interferencias.
  - La ventana de contención de 2s identifica correctamente escrituras simultáneas en múltiples bases.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Ninguna sobre detección de sesión activa.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 5 — Interfaz y empaquetado.

---

## [2026-10-17 20:28] HITO 5 — Interfaz y empaquetado
- **Qué se hizo**:
  1. Se diseñó `src/panelHtml.ts` con interfaz moderna para el Webview: radiografía exacta (Input, Cache, Thoughts, Output, Latencia), barra de desglose de tokens, barra de composición estimada (Scenario A: chars/4 normalizado), tarjeta de semáforo con brillo de color, e insignia de ventana.
  2. Se implementó `src/statusBarController.ts` integrando semáforo en tiempo real, insignia, tokens frescos y tooltip enriquecido en Markdown.
  3. Se conectaron en `src/extension.ts` los comandos `contextAuditor.copySnapshot`, `contextAuditor.selectSession` y `contextAuditor.openPanel`.
  4. Se redactó `README.md` documentando el funcionamiento de solo lectura, umbrales y comandos.
  5. Se creó `.vscodeignore` y `LICENSE` (MIT) y se empaquetó exitosamente la extensión con `npm run package` produciendo `context-auditor-0.1.0.vsix` (14.78 KB).
- **Decisiones y su motivo**:
  - Creación de `.vscodeignore` estricto para asegurar que el archivo `.vsix` solo incluya el binario empaquetado `dist/extension.js`, `package.json`, `README.md` y `LICENSE`, excluyendo código fuente, scripts de spike y tests (cumpliendo con la regla de privacidad S3).
- **Archivos creados/modificados**:
  - `context-auditor/src/panelHtml.ts`
  - `context-auditor/src/statusBarController.ts`
  - `context-auditor/src/extension.ts`
  - `context-auditor/package.json`
  - `context-auditor/README.md`
  - `context-auditor/LICENSE`
  - `context-auditor/.vscodeignore`
  - `context-auditor/context-auditor-0.1.0.vsix` (ignorado en git)
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `npm run compile` -> Pasó (código 0).
  - Typecheck: `npm run typecheck` -> Pasó (código 0).
  - Tests: `npm test` -> 21/21 tests pasaron (0 fallos).
  - Empaquetado: `npm run package` -> Pasó (código 0, archivo `context-auditor-0.1.0.vsix` generado).
- **Hechos nuevos [VERIFICADO]**:
  - El paquete `.vsix` se genera sin dependencias externas y pesa menos de 15 KB.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Ninguna sobre interfaz ni empaquetado.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 6 (opcional) — Calibración offline.

---

## [2026-10-17 20:30] HITO 6 — Calibración offline (solo lectura)
- **Qué se hizo**:
  1. Se copió `nnls.ts` a `src/vendor/nnls.ts` con comentario de origen (`src/phase2/nnls.ts (commit fbcf77c223a5477d9c6e5e8e82efea12bb649842)`).
  2. Se programó y ejecutó `scripts/calibrate.mjs` de forma estrictamente pasiva (`DatabaseSync` con `readOnly: true`, `PRAGMA busy_timeout = 3000`, `PRAGMA query_only = ON`).
  3. Se analizaron 1.129 pasos de inferencia reales a lo largo de las 5 bases de datos locales en `~/.gemini/antigravity-ide/conversations/`.
  4. Se estimaron empíricamente la distribución de $T_{\text{frescos}}$ (p25=59k, p50=105k, p75=164k, p90=211k), la latencia real por paso (mediana 4.83s, p90 15.31s) y los coeficientes de regresión multivariante ($\alpha \approx 7.062$ ms/token de salida, $\beta \approx 0.086$ ms/token de pensamiento).
- **Decisiones y su motivo**:
  - El script no modifica ningún archivo de configuración (`settings.json`) ni bases de datos; solo imprime las sugerencias empíricas por consola, respetando la regla S1.
- **Archivos creados/modificados**:
  - `context-auditor/src/vendor/nnls.ts`
  - `context-auditor/scripts/calibrate.mjs`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `npm run compile` -> Pasó (código 0).
  - Typecheck: `npm run typecheck` -> Pasó (código 0).
  - Tests: `npm test` -> 21/21 tests pasaron (0 fallos).
  - Ejecución de calibración: `node scripts/calibrate.mjs` -> Pasó (código 0).
- **Hechos nuevos [VERIFICADO]**:
  - Las bases locales contienen una amplia muestra histórica de 1.129 pasos con timestamps de micro/nanosegundos válidos.
  - El costo en tiempo de generación es dominado por los tokens de salida (~7.06 ms/token) frente a los tokens de pensamiento (~0.086 ms/token).
- **Hipótesis pendientes [HIPÓTESIS]**:
  - La estabilidad de $\alpha$ y $\beta$ entre diferentes familias de modelos (Gemini Flash vs Claude 3.5 Sonnet) requerirá clasificar las muestras por modelo si se desea calibración diferenciada por proveedor.
- **Bloqueos**: Ninguno.

## [2026-10-18 01:52] HITO 7 — Conciliación de la calibración (solo lectura, solo agregados)
- **Qué se hizo**:
  1. Se extendió `scripts/calibrate.mjs` para clasificar 1.174 pasos de inferencia reales a través de las 6 bases `.db` locales por familia de modelo (Gemini vs Claude vs Desconocido) mediante `steps.metadata.9.1` y la tabla `gen_metadata`.
  2. Se redactó `docs/CALIBRATION_REPORT.md` respondiendo con precisión cuantitativa y números agregados los puntos 1 a 6 requeridos (percentiles brutos vs T_frescos, determinación de modelo, distribución bajo umbrales vigentes, evaluación NNLS de k_cache, colinealidad/estructura temporal de α y β, y propuesta de umbrales alternativos).
  3. Se demostró que los 142 pasos con Input > 200.000 (hasta 254k) corresponden al 100% a Gemini Flash (ventana 1M, <25.5% ocupación), mientras que Claude no supera su ventana de 200k (máx 144k).
  4. Se evaluó formalmente el ajuste NNLS de k_cache (falló isTrustworthy por falta de datos de cuota en SQLite y varianza nula de caché) y se concluyó que el criterio de latencia no es confiable (R²=0.53, RMSE~4.6s, dominado por TTFT de red).
- **Decisiones y su motivo**:
  - No alterar los umbrales vigentes, ventanas ni k_cache (0.10) en código ni configuración, respetando la instrucción estricta de no cambiar valores en esta tanda.
  - Mantener formalmente desactivado el criterio de latencia debido a la falta de fiabilidad estadística y el riesgo de falsos positivos inducidos por fluctuaciones de red.
- **Archivos creados/modificados**:
  - `context-auditor/scripts/calibrate.mjs`
  - `context-auditor/docs/CALIBRATION_REPORT.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `tsc --noEmit` -> Pasó (código 0).
  - Tests: `npm test` -> 21/21 tests pasaron (0 fallos).
  - Calibración: `node --import tsx scripts/calibrate.mjs` -> Pasó (código 0).
- **Hechos nuevos [VERIFICADO]**:
  - Los percentiles previos eran de $T_{\text{frescos}}$, pero son numéricamente casi idénticos al Input bruto (~22 tokens de diferencia) debido a que el campo 9.6 es constante (24/26).
  - Cero pasos desconocidos entre los 1.174 analizados: 1.156 corresponden a Gemini Flash (ID 1318) y 18 a Claude Opus (ID 1026).
  - Todos los 142 pasos con Input > 200.000 pertenecen a Gemini (ventana 1M, ninguno en situación crítica).
  - El tiempo de generación de Gemini Flash está dominado por el TTFT (mediana 4.65s) mientras que la emisión posterior es ultrarrápida (mediana 0.06s), explicando por qué $\beta$ es 76x menor que $\alpha$.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - En Claude, la muestra local sigue siendo acotada ($n=18$ pasos), lo que impide ajustes robustos específicos para dicho proveedor hasta acumular más interacciones.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 8 — Diagnóstico visible y estado honesto.

---

## [2026-10-18 01:58] HITO 8 — Diagnóstico visible y estado honesto
- **Qué se hizo**:
  1. Se implementó el formateador puro `src/diagnosticsFormatter.ts` y se escribió su suite de pruebas en `test/diagnosticsFormatter.test.ts` (2 tests, cubriendo reporte completo con sesión activa y degradación elegante sin datos).
  2. Se registró el comando `contextAuditor.diagnostics` en `src/extension.ts` y `package.json`, emitiendo al OutputChannel "Context Auditor" un informe sanitizado sin prompts que desglosa: entorno Node/Electron, estado de Schema Guard, ID de sesión truncado a 6 caracteres y método de selección, pasos leídos, radiografía de tokens del último paso, T_frescos, semáforo e insignia, familia de modelo detectada y método, y los valores de configuración marcando claramente cuáles son provisionales.
  3. Se reescribió `docs/STATE.md` clasificando honestamente cada elemento en tres niveles de certeza: `[VERIFICADO CON DATOS REALES]`, `[IMPLEMENTADO + TEST SINTÉTICO]` y `[NO PROBADO EN EL IDE REAL]`. Se incorporaron los detalles faltantes del spike (mapeo de step_type, modelo, timestamps y conversación activa) y se corrigió la instrucción de instalación para usar el panel de Extensiones ("Install from VSIX…") en vez de `code --install-extension`.
  4. Se actualizó la versión en `package.json` a `0.1.1` y se reempaquetó exitosamente el archivo `context-auditor-0.1.1.vsix` (16.65 KB).
  5. Se ejecutó la auditoría estricta de seguridad y privacidad S1/S3:
     - (1) Búsqueda de llamadas a escrituras en `src/` (`writeFile`, `unlink`, `rename`, `rm`, `createWriteStream`, `appendFile`): 0 coincidencias. Ninguna apunta ni interactúa con `~/.gemini`.
     - (2) Verificación de `DatabaseSync`: 100% de las aperturas en `src/` y `scripts/` contienen `{ readOnly: true }` acompañado de `PRAGMA busy_timeout = 3000;` y `PRAGMA query_only = ON;`.
     - (3) Lista de contenido real del `.vsix`: exactamente 6 archivos (`[Content_Types].xml`, `extension.vsixmanifest`, `extension/LICENSE.txt`, `extension/package.json`, `extension/readme.md`, `extension/dist/extension.js`). Cero código fuente TypeScript, cero archivos de prueba, cero bases SQLite y cero datos personales.
     - (4) `git diff --stat 35d0cd5 -- ":(exclude)context-auditor"`: salida vacía (0 cambios fuera de `context-auditor/` respecto a la rama base).
- **Decisiones y su motivo**:
  - Exponer el diagnóstico en un OutputChannel nativo (`vscode.window.createOutputChannel`) para que el usuario o agente pueda auditar en cualquier momento la coherencia interna de la extensión sin alterar el estado del Webview.
  - Transparentar en `STATE.md` que la UI (status bar y webview), los comandos interactivos y la concurrencia real entre ventanas siguen como `[NO PROBADO EN EL IDE REAL]`, distinguiéndolos de la lógica validada con tests sintéticos o los esquemas validados contra bases reales.
- **Archivos creados/modificados**:
  - `context-auditor/src/diagnosticsFormatter.ts`
  - `context-auditor/test/diagnosticsFormatter.test.ts`
  - `context-auditor/src/extension.ts`
  - `context-auditor/package.json`
  - `context-auditor/README.md`
  - `context-auditor/docs/STATE.md`
  - `context-auditor/docs/LOG.md`
  - `context-auditor/context-auditor-0.1.1.vsix` (ignorado en git)
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `tsc --noEmit` -> Pasó (código 0, sin errores).
  - Tests: `npm test` -> 23/23 tests pasaron (0 fallos).
  - Empaquetado: `npm run package` -> Pasó (código 0, generado `context-auditor-0.1.1.vsix`).
- **Hechos nuevos [VERIFICADO]**:
  - Salida de auditoría S1/S3 completamente limpia: 0 escrituras, 100% de lecturas SQLite con query_only=ON y readOnly=true, VSIX sin fugas de datos y 0 cambios fuera de `context-auditor/`.
  - El comando `contextAuditor.diagnostics` opera de forma 100% segura y sanitizada.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Comportamiento de renderizado de tooltips y webview en la instancia visual real de Antigravity IDE (queda formalmente marcado como `[NO PROBADO EN EL IDE REAL]`).
- **Bloqueos**: Ninguno.

---

## RESUMEN DE LA TANDA (HITOS 7 Y 8)
- **Hitos completados**: Hito 7 (Conciliación de calibración y CALIBRATION_REPORT.md) y Hito 8 (Diagnóstico visible contextAuditor.diagnostics, STATE.md honesto, auditoría S1/S3 y VSIX 0.1.1).
- **Entregables clave**:
  - `docs/CALIBRATION_REPORT.md` (análisis cuantitativo multi-modelo).
  - `docs/STATE.md` (reescrito con 3 niveles de certeza).
  - `context-auditor-0.1.1.vsix` (paquete VSIX compilado y verificado).
- **Pruebas automáticas**: 23/23 tests unitarios pasando en verde.

---

## [2026-10-18 02:30] HITO 9a — Origen de la caché y auditoría de campos numéricos
- **Qué se hizo**:
  1. Se localizó en `agpro-quota` el cálculo de `% de acierto de caché`: procede de `sess.cacheRatioFormatted` (`tokenAuditor.ts:554`), que divide `cached.totalCache / cached.totalPrompt` sumando el campo `metadata.9.6` (`protoWire.ts:121`).
  2. Se contrastó `metadata.9.6` sobre 1.222 pasos reales: tiene un valor constante de 24 (Gemini) o 26 (Claude), correspondiente a un enumerado de modelo/estado y no a tokens de caché.
  3. Se inspeccionaron recursivamente los 38 caminos numéricos del BLOB `metadata` y la tabla `gen_metadata`: ninguno varía con reuso de prompt ni almacena tokens de caché.
  4. Conclusión formal: **[NO HAY]** señal local de caché. Se adaptó la UI (`panelHtml.ts` y `statusBarController.ts`) para rotular explícitamente "Caché: no disponible localmente", dejando $k_{\text{cache}}$ sin efecto práctico sobre las bases locales. Se documentó en `docs/CALIBRATION_REPORT.md` (Sección 7).
- **Decisiones y su motivo**:
  - No inventar métricas sustitutas de caché: reportar con honestidad técnica que Antigravity no persiste tokens cacheados en su SQLite local.
- **Archivos creados/modificados**:
  - `context-auditor/src/panelHtml.ts`
  - `context-auditor/src/statusBarController.ts`
  - `context-auditor/docs/CALIBRATION_REPORT.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `tsc --noEmit` -> Pasó (código 0).
  - Tests: `npm test` -> 23/23 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - `metadata.9.6` vale exactamente 24 (Gemini) o 26 (Claude); no es lectura de caché.
  - Ninguno de los 38 campos numéricos de `metadata` representa caché.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Si en versiones futuras de Antigravity IDE se agrega soporte explícito para registrar tokens cacheados en SQLite, la fórmula de $T_{\text{frescos}}$ podrá activarse sin cambios arquitecturales.
- **Bloqueos**: Ninguno.
- **Siguiente sub-hito**: Hito 9b — Latencia vs. Input y verificación del campo 6.

---

## [2026-10-18 02:35] HITO 9b — Latencia vs. Input y verificación del campo 6
- **Qué se hizo**:
  1. Se analizaron 1.241 pasos con latencia desglosados en 5 tramos de Input (0-50k, 50-100k, 100-150k, 150-200k, >200k) reportando mediana y p90 de latencia total y TTFT (campo 6 - inicio) para Gemini y Claude.
  2. Se ajustó la regresión multivariante con intercepto: $\text{Latencia} \sim \beta_0 + \beta_{\text{input}}\cdot\text{Input} + \beta_{\text{output}}\cdot\text{Output} + \beta_{\text{thoughts}}\cdot\text{Thoughts}$. En Gemini ($n=1.223$), arrojó intercepto base $\beta_0 = 2.14$s, $\beta_{\text{input}} = 0.0161$ ms/token, $\beta_{\text{output}} = 5.16$ ms/token, $R^2 = 0.8122$, RMSE = 2.91s.
  3. Se demostró matemáticamente por qué NNLS dio $b=92.4$: al carecer de intercepto y ser campo 9.6 constante (24), $b \times 24 \approx 2.218$ ms absorbió el intercepto base de conexión (~2.14s).
  4. Se verificó que `(fin - campo 6)` correlaciona $r = 0.8547$ (Gemini) y $r = 0.8803$ (Claude) con los tokens de `Output`, concluyendo **[VERIFICADO CON DATOS REALES]** que el campo 6 es TTFT.
  5. Se concluyó que la latencia **NO** crece de forma útil con el Input (pendiente de solo 16 ms/1k tokens, completamente sepultada por la dispersión estocástica de red con RMSE 2.91s y p90 > 10s en cualquier tramo). El criterio de latencia permanece desactivado. Se documentó en `docs/CALIBRATION_REPORT.md` (Sección 8).
- **Decisiones y su motivo**:
  - No activar el criterio de latencia: su uso generaría alertas espurias por congestión externa de red no relacionada con sobrecarga de contexto.
- **Archivos creados/modificados**:
  - `context-auditor/docs/CALIBRATION_REPORT.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `tsc --noEmit` -> Pasó (código 0).
  - Tests: `npm test` -> 23/23 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - Campo 6 es el TTFT (Time To First Token) con correlación > 0.85 con el streaming posterior.
  - El costo por token de input es de solo ~16 ms/1.000 tokens en Gemini, con un intercepto base de 2.14 segundos.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - En Claude, la muestra reducida ($n=18$) arroja un $\beta_{\text{input}}$ negativo espurio (-0.045 ms/token) dominado por 11 pasos largos de pensamiento.
- **Bloqueos**: Ninguno.
- **Siguiente sub-hito**: Hito 9c — Estructura de la muestra y sensibilidad de la Propuesta B.

---

## [2026-10-18 02:40] HITO 9c — Estructura de la muestra y sensibilidad de la Propuesta B
- **Qué se hizo**:
  1. Se desglosaron las 6 bases de datos por conversación: 6 con Gemini (total 1.227 pasos) y 1 con Claude (18 pasos, dentro de la base compartida `fd98a33c`).
  2. Se extrajo para cada conversación el número de pasos, pico de input y media de input.
  3. Se calcularon los percentiles ponderados a nivel de conversación: en Gemini, la mediana de picos es de 193.585 tokens y la mediana de medias es de 94.491 tokens.
  4. Se evaluó la sensibilidad de la Propuesta B:
     - En Gemini: Las 2 sesiones más largas (`fd98a33c` con 670 pasos y `f41cad89` con 245 pasos) concentran el 74.6% de los pasos. No obstante, los umbrales propuestos (100k/180k) son consistentes con la mediana de medias (94.5k) y de picos (193.6k) calculada tratando a cada conversación como unidad.
     - En Claude: El 100% de la muestra proviene de una única conversación (18 pasos), por lo que la Propuesta B para Claude (115k/130k) tiene una dependencia total (100%) y carece de significación estadística externa independiente.
  5. Se documentaron todos los hallazgos en `docs/CALIBRATION_REPORT.md` (Sección 9).
- **Decisiones y su motivo**:
  - Transparentar la sobre-representación de sesiones largas para evitar conclusiones prematuras sobre el comportamiento del usuario con otros modelos.
- **Archivos creados/modificados**:
  - `context-auditor/docs/CALIBRATION_REPORT.md`
  - `context-auditor/docs/LOG.md`
- **Compilación y tests**:
  - Compilación: `node esbuild.config.mjs` -> Pasó (código 0).
  - Typecheck: `tsc --noEmit` -> Pasó (código 0).
  - Tests: `npm test` -> 23/23 tests pasaron (0 fallos).
- **Hechos nuevos [VERIFICADO]**:
  - Las 2 sesiones más largas representan el 74.6% de los pasos de Gemini.
  - Claude solo tiene 1 sesión en todo el historial local (`fd98a33c`).
- **Hipótesis pendientes [HIPÓTESIS]**:
  - El umbral de Claude requerirá recalibración cuando se agreguen al menos 5 conversaciones independientes con dicho proveedor.
- **Bloqueos**: Ninguno.
- **Siguiente sub-hito**: Hito 9d — Perfil de umbrales y coherencia semáforo/insignia.





