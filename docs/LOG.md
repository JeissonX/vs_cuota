# AG Pro Quota — Log de Integración v1.3.0

Este archivo registra de forma acumulativa (solo adición) los eventos, decisiones, estado de tests y avance por cada hito de la fusión de Context Auditor dentro de AG Pro Quota (v1.3.0).

---

## [2026-10-18 22:25] HITO 1 — Auditoría de solo lectura (sin cambiar código)
- **Qué se hizo**:
  1. Se verificó el estado del repositorio: rama activa `integracion-v1.3.0`, respaldo `context-auditor/` intacto, y ejecución en verde de los 31 tests de agpro-quota y los 27 tests del auditor.
  2. Se redactó `docs/AUDIT.md` cubriendo exhaustivamente los puntos a)-i) con hallazgos separados en [VERIFICADO con datos o tests] e [HIPÓTESIS], priorizados por severidad.
  3. Se confirmaron los 5 hallazgos más graves: (1) metadata.9.6 constante 24/26 usado como caché; (2) doble watcher y sondeo SQLite duplicado; (3) disonancia crítica invertida en Claude; (4) scripts de investigación borrados; (5) falta de validación en IDE interactivo real.
- **Decisiones y su motivo**:
  - Respetar de forma estricta la regla de no modificar lógica de cuota ni cálculos preexistentes en esta fase.
  - Diseñar la integración unificada (Hito 2) bajo un único vigilante de conversaciones para evitar contención de I/O en SQLite.
- **Archivos creados/modificados**:
  - `docs/AUDIT.md` (creado)
  - `docs/LOG.md` (creado)
  - `docs/STATE.md` (creado)
- **Compilación y tests**:
  - `agpro-quota`: `npm test` -> 31/31 tests pasaron (código 0).
  - `context-auditor`: `npm test` -> 27/27 tests pasaron (código 0).
- **Hechos nuevos [VERIFICADO]**:
  - Cero escrituras en `~/.gemini` en ambos proyectos.
  - Cero llamadas a Internet en ambos proyectos.
  - Acceso a SQLite 100% blindado con `readOnly: true`, `busy_timeout = 3000` y `query_only = ON`.
  - Scripts `research_*.mjs` no existen actualmente en el árbol de trabajo.
- **Hipótesis pendientes [HIPÓTESIS]**:
  - Rendimiento visual de la barra de estado con dos elementos en Antigravity IDE real.
- **Bloqueos**: Ninguno.
- **Siguiente hito**: Hito 2 — Integración de código del auditor en `src/context/`, unificación de vigilante y sondeo, contribución consolidada en `package.json`, dashboard con pestañas y verificación de tests.

---

## [2026-10-18 22:42] HITO 2 — Integración de Context Auditor en agpro-quota
- **Qué se hizo**:
  1. Se trasladó el código del auditor a `src/context/` y sus tests a `test/context/`. Se eliminaron las dependencias duplicadas de `vendor/` sustituyéndolas por importaciones directas de los módulos originales (`../phase2/protoWire`, `../phase2/nnls`, `../types`).
  2. Se conciliaron divergencias en `src/phase2/protoWire.ts` (exportación de `readVarint`, adición de `modelCode` a `TOKEN_FIELD_MAP` de forma retrocompatible) y en `src/phase2/nnls.ts` (guarda para matrices vacías).
  3. Se unificó la vigilancia de archivos y el sondeo periódico: `SessionWatcher` se configuró con `enableInternalPolling: false` y funge como el único `fs.watch` sobre `~/.gemini/antigravity-ide/conversations`. El bucle en `startRefreshLoop()` de `src/extension.ts` realiza el único sondeo periódico, alimentando tanto cuota como auditor de contexto sin I/O duplicado.
  4. Se integró `package.json` (v1.3.0) con configuración agrupada en dos esquemas (`AG Pro Quota` y `Context Auditor`), opción `contextAuditor.enabled` (por defecto `true`), y 4 comandos con prefijo propio `contextAuditor.*`.
  5. Se implementó aislamiento total con `try/catch` en todas las operaciones del auditor, registrando fallos en el OutputChannel sin interrumpir la cuota. Si `contextAuditor.enabled = false`, la barra de estado del auditor se oculta y no se ejecutan lecturas de contexto.
  6. Se consolidó el Webview Dashboard en `src/dashboard/dashboardProvider.ts` con dos pestañas: `[Cuota]` y `[Salud de sesión y snapshot]`, con persistencia de pestaña activa y sin modificar la lógica ni estilos de cuota.
  7. Decisión de interfaz: Dos elementos adyacentes en la barra de estado (`StatusBarAlignment.Right, 100` para Cuota y `StatusBarAlignment.Right, 95` para Context Auditor). La cuota mide disponibilidad de recursos cloud; el auditor mide saturación local del prompt de sesión. Clics independientes y ocultamiento condicional limpio.
- **Compilación y tests**:
  - `npm run compile`: Build completo sin errores (esbuild).
  - `npm run lint`: 0 errores, 0 advertencias.
  - `npm test`: 58/58 tests pasando en verde (31 de cuota + 27 de context auditor).
- **Decisiones registradas**:
  - El vigilante de archivos de `tokenAuditor` fue reemplazado por el vigilante unificado `SessionWatcher` en `src/extension.ts`.
  - Reconciliación de divergencias en `protoWire` retrocompatible.
- **Siguiente hito**: Hito 3 — Correcciones de honestidad y rotulado (etiquetar porcentaje de caché del dashboard de cuota como "no disponible localmente", sin alterar cálculos ni calibración NNLS).

---

## [2026-10-18 22:45] HITO 3 — Correcciones de Honestidad (Solo Rotulado)
- **Qué se hizo**:
  1. Se actualizó la tarjeta de métrica de caché de la sesión activa en el Dashboard (`src/dashboard/dashboardProvider.ts`): en lugar de mostrar un engañoso `0%` derivado del campo casi constante `metadata.9.6`, ahora se rotula de forma honesta y explícita como `"no disponible localmente"` con tooltip explicativo (`"No disponible localmente: el campo 9.6 es una constante de control y no expone tokens reales de caché"`).
  2. En la sección de calibración NNLS del Dashboard, se ajustó el título a `"Estimación de Pesos de Cuota (NNLS - Experimental)"` y el subtítulo a `"(sujeto a calibración empírica)"`, rotulando el componente de caché en tarjetas calibradas como `"Lectura caché (no disp. local)"`.
  3. En `src/phase2/tokenAuditor.ts`, se ajustó el texto del banner de sesión cara (`expensiveReason`) para eliminar la mención espuria de `"ratio de caché < 20%"`, indicando con veracidad `"Contexto alto (N tokens de entrada acumulados)"`.
  4. NO se modificó ningún cálculo numérico de cuota, calibraciones NNLS ni umbrales de advertencia/crítico. Las propuestas matemáticas permanecen registradas en `docs/AUDIT.md`.
- **Compilación y tests**:
  - `npm run compile`: Build completo sin errores.
  - `npm run lint`: 0 errores, 0 advertencias.
  - `npm test`: 58/58 tests pasando en verde.
- **Decisiones registradas**:
  - Rotulación transparente sin alterar los modelos matemáticos subyacentes.
- **Siguiente hito**: Hito 4 — Empaquetado y verificación final (.vsix 1.3.0, reposición de scripts de investigación en `scripts/research/`, `docs/PRUEBA_MANUAL.md`, niveles de certeza en `STATE.md`).

---

## [2026-10-18 22:48] HITO 4 — Empaquetado y Verificación Final
- **Qué se hizo**:
  1. Se restituyeron los 4 scripts de investigación de solo lectura y salida sanitizada en `scripts/research/` (`research_9a_cache_audit.mjs`, `research_9b_latency_ttft.mjs`, `research_9c_session_sensitivity.mjs`, `research_9d_threshold_profiles.mjs`). Se ejecutaron con Node 22 comprobando la reproducción de las cifras empíricas de `CALIBRATION_REPORT.md` (1.990 pasos analizados en 13 bases locales, sin excepciones).
  2. Se configuró `.vscodeignore` para excluir de forma rigurosa `context-auditor/`, `scripts/`, `docs/`, `spike_result.json`, `test/` y archivos `.vsix`.
  3. Se ejecutó `npm run compile` y se empaquetó con éxito el archivo único `agpro-quota-1.3.0.vsix` (11 archivos, 139.85 KB). Se listó y comprobó que no contiene datos personales, spikes ni scripts de investigación.
  4. Se redactó `docs/PRUEBA_MANUAL.md` con los pasos de instalación desde VSIX, desinstalación previa de la 0.1.2 y 10 comprobaciones funcionales e interactivas.
  5. Se documentaron en `docs/STATE.md` los tres niveles de certeza técnica: [VERIFICADO CON DATOS REALES], [IMPLEMENTADO + TEST SINTÉTICO] y [NO PROBADO EN EL IDE REAL] (asignado a la extensión fusionada completa hasta la prueba manual).
  6. Se comprobó mediante `git` que ningún commit toca la rama `master` (intacta en `35d0cd5`) y que la carpeta `context-auditor/` permanece 100% limpia e inalterada con sus 27 tests pasando.
- **Compilación y tests**:
  - `npm run compile`: Build completo sin errores.
  - `npm run lint`: 0 errores, 0 advertencias.
  - `npm test`: 58/58 tests pasando en verde (31 cuota + 27 context auditor).
  - `npm test --prefix context-auditor`: 27/27 tests pasando en verde.
- **Estado final**: Proyecto consolidado y listo para entrega.

---

## [2026-10-18 23:15] FASE DE VERIFICACIÓN Y CORRECCIÓN (v1.3.0)
- **Qué se hizo**:
  1. **Paso 1 (Regresiones frente a master)**: Comparación exhaustiva de `package.json`, `src/extension.ts`, `src/dashboard/dashboardProvider.ts` y estado compartido. Resultado documentado en `docs/REGRESSION_CHECK.md`. Cero IDs perdidos, cero IDs duplicados o colisionados, 7 comandos de cuota y 10 configuraciones de master 100% idénticos.
  2. **Paso 2 (Prueba de activación sin IDE)**: Creación de mock integral de VS Code en `test/mocks/vscode.ts` y suite en `test/activation.test.ts`. 4/4 casos probados y pasando: (1) registro de 11 comandos y vistas; (2) `contextAuditor.enabled=false` evita creación de watcher e item del auditor; (3) aislamiento ante excepciones del auditor sin afectar cuota; (4) `deactivate()` libera recursos ordenadamente de forma idempotente.
  3. **Paso 3 (Corrección de ciclo de vida y hot-reload)**: Se corrigió la desconexión del vigilante y la barra de estado en caliente en `src/extension.ts` mediante `syncAuditorLifecycle(context)`: al alternar `contextAuditor.enabled`, el vigilante y status bar del auditor se crean o destruyen dinámicamente y se conmuta con el vigilante standalone de cuota sin necesidad de recargar la ventana.
  4. **Paso 4 (Empaquetado y contenido VSIX)**: Actualización de `.vscodeignore` para excluir de forma garantizada `*.map`, `**/*.map`, `docs/`, `scripts/`, `test/`, `spike_result.json`, `context-auditor/`. Empaquetado `agpro-quota-1.3.0.vsix` (10 archivos, 47.56 KB) limpio, sin rutas personales ni código de prueba. Se documentó propuesta de mejora para el `.vscodeignore` de master.
  5. **Paso 5 (Reescritura de 5 hallazgos en AUDIT.md)**: Reescritura completa de la sección 1 de `docs/AUDIT.md` con hallazgos reales: (1) Uso de `metadata.9.6` (constante 24/26) en NNLS con líneas exactas (`src/types.ts:164,172`, `src/phase2/protoWire.ts:109,111`, `src/phase2/tokenAuditor.ts:460,512,554,570`, `src/phase2/calibrationAligner.ts:80`, `src/phase2/calibrationManager.ts:182-184`, `src/phase2/nnls.ts:106`), su impacto algebraico y propuesta de exclusión de `cacheRead` en `FEATURES` sin aplicar; (2) Seguridad S1/S2/S4 verificada; (3) Rendimiento de watchers y unificación; (4) Disonancia crítica de Claude en [100k-115k]; (5) Interacción interactiva real pendiente de validación humana.
- **Compilación y tests**:
  - `npm run compile`: Build completo sin errores.
  - `npm run lint`: 0 errores, 0 advertencias.
  - `npx tsc --noEmit`: 0 errores.
  - `npm test`: 62/62 tests pasando en verde (31 cuota + 27 auditor + 4 activación).
  - `npm test --prefix context-auditor`: 27/27 tests pasando en verde.
- **Decisiones registradas**:
  - Se respetaron las reglas S1-S4 y la prohibición estricta de tocar master, borrar `context-auditor/` o alterar cálculos de cuota y calibración NNLS.




