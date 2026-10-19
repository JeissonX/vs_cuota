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

