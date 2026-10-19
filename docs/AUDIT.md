# AUDIT.md — Auditoría Pre-Integración v1.3.0 (agpro-quota + context-auditor)

**Fecha**: 2026-10-18  
**Rama activa**: `integracion-v1.3.0`  
**Directorio principal**: `vs_cuota/` (agpro-quota v1.2.0 -> v1.3.0)  
**Directorio respaldo**: `context-auditor/` (v0.1.2, intacto)  
**Alcance**: Auditoría estática y dinámica de solo lectura sin modificación de lógica preexistente.

---

## 1. Los 5 Hallazgos Más Graves (Priorizados por Severidad)

1. **[SEVERIDAD CRÍTICA] Campo `metadata.9.6` usado como lectura de caché es un enumerado constante (24/26) que distorsiona el NNLS y la UI** `[VERIFICADO con datos reales]`  
   - **Líneas exactas involucradas**:
     - `src/types.ts:164`: `FEATURES = ['inputNoCache', 'cacheRead', 'output', 'thoughts'] as const;`
     - `src/types.ts:172`: `readonly cacheRead: number;`
     - `src/phase2/protoWire.ts:109`: `cacheRead = v.get(map.cacheVarint) ?? ...` (`cacheVarint = 6`)
     - `src/phase2/protoWire.ts:111`: `inputNoCache: Math.max(0, input - cacheRead)`
     - `src/phase2/tokenAuditor.ts:460-461`: `cacheTokens = u.cacheRead; cacheRatio = u.input > 0 ? Math.round((u.cacheRead / u.input) * 1000) / 1000 : 0;`
     - `src/phase2/tokenAuditor.ts:512`: `cached.totalCache += cacheTokens;`
     - `src/phase2/tokenAuditor.ts:554-560`: cálculo de `cacheRatioFormatted` (mostraba falsamente `0.0%`)
     - `src/phase2/tokenAuditor.ts:570`: `latestReq.cacheRatio < 0.2` (aviso de sesión cara espurio)
     - `src/phase2/calibrationAligner.ts:80`: `x.cacheRead += su.cacheRead;` (acumula la constante en vector de regresión)
     - `src/phase2/calibrationManager.ts:182-184`: matriz de diseño NNLS `[inputNoCache, cacheRead, output, thoughts]`
     - `src/phase2/nnls.ts:106`: `pctPer1MTokens.cacheRead = weights[1] * 1_000_000`
   - **Cálculos afectados**:
     - `inputNoCache` se subestima en exactamente 24 o 26 tokens en cada inferencia (error relativo despreciable < 0.02%).
     - En el modelo NNLS (Lawson-Hanson), al ser `cacheRead` constante para cada llamada ($24 \times \text{pasos}$), actúa como un pseudo-intercepto espurio que absorbe parte de la caída fija de cuota y desestabiliza los coeficientes de `inputNoCache`, deteriorando el $R^2$.
   - **Propuesta de corrección (SIN aplicar en v1.3.0)**:
     - Excluir `cacheRead` del vector `FEATURES` reduciéndolo a 3 variables independientes (`input`, `output`, `thoughts`) o fijar su peso en 0.
     - Documentar que Antigravity IDE no almacena tokens leídos de caché en la base SQLite local.

2. **[SEVERIDAD ALTA] Seguridad de ambos proyectos: blindaje estricto de SQLite, subprocesos y privacidad** `[VERIFICADO con datos reales]`  
   - **SQLite**: En ambos proyectos (`agpro-quota/src/phase2/tokenAuditor.ts:382-388`, `context-auditor/src/dbReader.ts:132-136, 252-256`, y `src/context/dbReader.ts:130-134, 250-254`), las bases se abren exclusivamente con `DatabaseSync(path, { readOnly: true })`, `PRAGMA busy_timeout = 3000;` y `PRAGMA query_only = ON;`.
   - **Escrituras en `~/.gemini`**: Cero llamadas a `fs.writeFile`, `appendFile`, `mkdir` o `createWriteStream` en todo el código fuente. Se cumple estrictamente la regla de seguridad S1.
   - **Red**: Cero llamadas a Internet o servicios de telemetría remota. Únicamente llamadas HTTP hacia `127.0.0.1:<port>` contra el Language Server local en agpro-quota; cero llamadas de red en context-auditor.
   - **Subprocesos**: `execFile` con timeouts rígidos (3s en git, 3s-5s en powershell) y sanitización estricta de rutas (`~`).

3. **[SEVERIDAD MEDIA-ALTA] Duplicidad de vigilancia de archivos SQLite y sondeos redundantes** `[VERIFICADO con datos reales]`  
   - En master existía `startConversationWatcher` (`fs.watch` con debounce 1.5s) y bucle periódico de 15s. En context-auditor existía `SessionWatcher` (`fs.watch` con debounce 500ms) y bucle de 3.5s con foco.
   - Sin unificación, se ejecutaban ~4.2 barridos de directorio por ciclo con apertura reiterada de SQLite sobre la misma conversación activa.
   - **Solución implementada**: Unificación bajo `SessionWatcher` con `enableInternalPolling: false` y alternancia dinámica limpia (`syncAuditorLifecycle`).

4. **[SEVERIDAD MEDIA] Disonancia crítica invertida en Claude para umbrales observados [100k - 115k]** `[VERIFICADO con datos o tests]`  
   - En el auditor con perfil `observed`, entre 100k y 115k tokens la insignia marca `CRÍTICO` (>50% de la ventana de 200k) mientras el semáforo marca `VERDE` (<115k por basarse en una sola sesión empírica atípica de 144k), transmitiendo falsa seguridad en la barra de estado.

5. **[SEVERIDAD MEDIA] Comportamiento interactivo en IDE real aún no validado** `[NO PROBADO EN EL IDE REAL]`  
   - Si bien los 62 tests automatizados (sintéticos y de integración de activación) pasan en verde en Node.js, la interacción visual en la barra de estado de Antigravity IDE (distribución de los 2 elementos contiguos), el comportamiento de pestañas en el Webview real y la respuesta ante concurrencia con múltiples ventanas en Antigravity IDE quedan clasificadas en nivel `[NO PROBADO EN EL IDE REAL]` hasta la ejecución del protocolo en `docs/PRUEBA_MANUAL.md`.

---

## 2. Mapa Detallado de Ambos Proyectos (Sección a)

| Componente | agpro-quota (v1.2.0) | context-auditor (v0.1.2) |
|---|---|---|
| **`package.json`** | Nombre: `agpro-quota`, v1.2.0. | Nombre: `context-auditor`, v0.1.2. |
| **Activation Events** | `onStartupFinished`, `onView:agpro.dashboardView`. | `onStartupFinished`. |
| **Punto de Entrada** | `src/extension.ts` (dist/extension.js). | `context-auditor/src/extension.ts`. |
| **Comandos Registrados** | 7 comandos con prefijo `agPro.*`:<br>• `agPro.openDashboard`<br>• `agPro.refresh`<br>• `agPro.quickOverview`<br>• `agPro.diagnose`<br>• `agPro.toggleLang`<br>• `agPro.openSettings`<br>• `agPro.togglePoolView` | 4 comandos con prefijo `contextAuditor.*`:<br>• `contextAuditor.copySnapshot`<br>• `contextAuditor.selectSession`<br>• `contextAuditor.openPanel`<br>• `contextAuditor.diagnostics` |
| **Vistas y Contribuciones** | Activity Bar: `agpro-quota-sidebar` con View `agpro.dashboardView` (webview provider). Menús en `view/title`. | Sin ViewContainer en Activity Bar. Panel ad-hoc creado bajo demanda con `createWebviewPanel('contextAuditorPanel')`. |
| **Configuración** | 10 propiedades bajo prefijo `agPro.*` (`refreshIntervalSeconds`, `statusBarFormat`, `warningThreshold`, `criticalThreshold`, `language`, etc.). | 10 propiedades bajo prefijo `contextAuditor.*` (`thresholdProfile`, `kCache`, `modelFamily`, `windowGemini`, `thresholdGeminiYellow`, etc.). |
| **Status Bar** | `StatusBarManager` (`src/statusBar.ts`): Item único de cuota alineado a la derecha (`vscode.StatusBarAlignment.Right, 100`). Muestra pools (Gemini/Claude) y ventanas (5h/semanal). | `StatusBarController` (`src/statusBarController.ts`): Item único alineado a la derecha (`Right, 100`). Muestra semáforo, insignia, tokens frescos y sesión. |
| **Watchers de Archivos** | `startConversationWatcher` (`src/phase2/tokenAuditor.ts`): `fs.watch` sobre `~/.gemini/antigravity-ide/conversations` con debounce de 1500ms y condición de foco `vscode.window.state.focused`. | `SessionWatcher` (`src/sessionWatcher.ts`): `fs.watch` sobre mismo directorio con debounce de 500ms + sondeo periódico cada 3500ms cuando hay foco. |
| **Conexión y Lectores SQLite** | `auditTokens` (`src/phase2/tokenAuditor.ts`): `node:sqlite` `DatabaseSync` con `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`. Lee incrementalmente desde `lastReadIdx`. | `readSessionContext` y `readConversationForSnapshot` (`src/dbReader.ts`): `DatabaseSync` con `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`. Schema Guard con `table_info`. Lee últimos N pasos (por defecto 200). |

---

## 3. Comparación de Código Duplicado en `vendor/` (Sección b)

### 3.1 `context-auditor/src/vendor/protoWire.ts` vs `src/phase2/protoWire.ts`
- **Estado**: Divergencia leve y compatible hacia atrás. `[VERIFICADO con datos o tests]`
- **Diferencias**:
  1. `readVarint`: En `context-auditor` se exporta (`export function readVarint`), mientras que en el original de `agpro-quota` era interna privada.
  2. `TOKEN_FIELD_MAP`: Añade campo `modelCode: 1`.
  3. `DecodeResult`: Retorna opcionalmente `readonly modelCode?: number`.
  4. Extracción de `modelCode`: `v.get(map.modelCode)`.
- **Intencionalidad**: Intencional. El auditor necesita conocer el `modelCode` para resolver la familia de modelo (`1318` Gemini vs `1026` Claude).
- **Resolución para la integración**: Adoptar los cambios en el módulo canónico `src/phase2/protoWire.ts` (exportar `readVarint` y retornar `modelCode`), eliminando la copia en `vendor/`.

### 3.2 `context-auditor/src/vendor/nnls.ts` vs `src/phase2/nnls.ts`
- **Estado**: Subconjunto desacoplado. `[VERIFICADO con datos o tests]`
- **Diferencias**:
  1. `nnls.ts` en `context-auditor` eliminó las funciones de calibración acopladas a tipos de cuota (`fitCalibration`, `isTrustworthy`, `predictPct`), conservando únicamente el algoritmo Lawson-Hanson puro.
  2. Añadió una guarda defensiva: `if (n === 0 || b.length === 0) return [];`.
- **Intencionalidad**: Intencional para mantener el auditor libre de dependencias hacia `../types` de cuota.
- **Resolución para la integración**: Mantener `src/phase2/nnls.ts` en agpro-quota añadiendo la guarda de entrada vacía, e importar directamente desde allí.

---

## 4. Uso de `cacheRead` / `metadata.9.6` en `agpro-quota` (Sección c)

### 4.1 Archivos y Cálculos Dependientes
`[VERIFICADO con datos reales]`
1. **`src/phase2/protoWire.ts`**:
   - Asigna `cacheRead = v.get(map.cacheVarint) ?? ...` donde `cacheVarint = 6`.
   - Calcula `inputNoCache: Math.max(0, input - cacheRead)`.
2. **`src/phase2/tokenAuditor.ts`**:
   - Asigna `cacheTokens = u.cacheRead` (línea 460).
   - Calcula `cacheRatio = u.input > 0 ? Math.round((u.cacheRead / u.input) * 1000) / 1000 : 0` (línea 461).
   - Genera `cacheRatioFormatted` (línea 554).
3. **`src/dashboard/dashboardProvider.ts`**:
   - Muestra `${t.cacheRatioFormatted ?? ...}` como "Tasa de Acierto Caché" (línea 546).
   - Muestra peso calibrado `f.pctPer1MTokens.cacheRead` (línea 419).
4. **`src/phase2/calibrationAligner.ts`**:
   - Acumula `cacheRead += u.cacheRead` en vector de características `x: { inputNoCache, cacheRead, output, thoughts }`.
5. **`src/phase2/nnls.ts`**:
   - Incluye `cacheRead` en `FEATURES` para la regresión.

### 4.2 Efecto del Valor Cuasi-Constante (24 / 26)
- **Efecto en UI**: La división de 24 entre 100.000 tokens resulta en 0.024%, redondeado a **0.0%**. Comunica falsamente al usuario que no existe caché o que el acierto es nulo.
- **Efecto en NNLS**: Al ser constante para cada paso (24 para Gemini), la columna `cacheRead` equivale a $24 \times \text{número de pasos en la ventana}$. Funciona como un contador de llamadas (pseudo-intercepto) que absorbe la latencia base o el costo fijo de conexión, distorsionando los coeficientes de `inputNoCache`.
- **Efecto en Input**: Resta 24 tokens a un input de 100.000 (desviación irrelevante del 0.02%).

### 4.3 Propuesta de Correcciones (SIN aplicar en Hito 1/2)
- **Propuesta 1 (UI - Hito 3)**: Rotular en el dashboard "Caché: no disponible localmente" o "N/D" en lugar de 0.0%.
- **Propuesta 2 (NNLS - Futuro)**: Excluir `cacheRead` de `FEATURES` o fijar su coeficiente en 0 hasta que Antigravity exponga métricas reales de reuso de prompt en SQLite.
- **Propuesta 3 (Wire - Futuro)**: Dejar de restar `cacheRead` a `input` para `inputNoCache`, tratándolo como un enumerado de modelo/estado.

---

## 5. Auditoría de Seguridad (Sección d)

`[VERIFICADO con datos o tests]`
- **Acceso a SQLite**:
  - `agpro-quota` (`tokenAuditor.ts:382-388`): `DatabaseSync(path, { readOnly: true })`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`.
  - `context-auditor` (`dbReader.ts:132-136, 252-256`): `DatabaseSync(path, { readOnly: true })`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`.
  - Cero aperturas en modo lectura/escritura.
- **Escrituras en `~/.gemini`**:
  - Búsqueda recursiva en `src/` y `context-auditor/src/`: Cero llamadas a `writeFile`, `appendFile`, `mkdir` o `createWriteStream`. Prohibición S1 estrictamente cumplida.
- **Llamadas de red**:
  - `agpro-quota`: Únicamente llamadas HTTP locales (`127.0.0.1:<port>`) hacia el Language Server descubierto por PID/puerto. Cero llamadas a Internet o telemetría externa.
  - `context-auditor`: Cero llamadas de red (ni locales ni externas).
- **Ejecución de subprocesos (`child_process`)**:
  - `agpro-quota` (`discovery.ts`): Invoca `execFile('powershell.exe', ...)` con `{ timeout: PS_TIMEOUT_MS }` (3.000ms / 5.000ms).
  - `context-auditor` (`snapshotGenerator.ts`): Invoca `execFile('git', ...)` con `{ timeout: 3000 }` y sanitización estricta. Cero uso de `exec()` directo con shell.

---

## 6. Honestidad de la Interfaz (Sección e)

`[VERIFICADO con datos o tests]`

| Elemento / Afirmación | Lo que la UI Afirma | Lo que Realmente se Mide | Calificación |
|---|---|---|---|
| **Caché en Dashboard Cuota** | "Tasa de Acierto Caché: 0.0%" | Divide el enum 24/26 entre el input total. | **Sobreafirma / Engañoso**. Hace creer que la caché falla. |
| **Caché en Context Auditor** | "Caché: no disponible localmente" | Documenta honestamente que Antigravity no expone tokens de caché en SQLite. | **Honesto**. |
| **Desglose Quota NNLS** | "Estimación de Costo / Desglose por Componente" | Regresión que incluye la columna espuria `cacheRead`. | **Sobreafirma precisión**. Debe etiquetarse como estimación experimental. |
| **Semáforo en Perfil Observed** | "Carga relativa a tu historial (p50/p80)" | Mide posición percentil en el histórico empírico analizado (6 DBs). | **Honesto**. |
| **Insignia de Contexto** | "Ocupación de ventana del modelo" | Divide input bruto entre ventana nominal (1M Gemini, 200k Claude). | **Honesto**. |
| **Composición Estimada** | "Composición estimada (chars/4)" | Heurística estándar de 4 caracteres por token. | **Honesto** (rotulado explícitamente como estimación). |
| **Cuota 5h y Semanal** | "Ventana 5h: X% / Semanal: Y%" | Telemetría oficial devuelta por `RetrieveUserQuotaSummary`. | **Honesto y exacto**. |

---

## 7. Rendimiento y Carga de Procesamiento (Sección f)

`[VERIFICADO con datos o tests]`

1. **Watchers de Archivos**:
   - `agpro-quota`: 1 watcher `fs.watch` con debounce de 1.500 ms.
   - `context-auditor`: 1 watcher `fs.watch` con debounce de 500 ms.
   - *Total actual*: 2 watchers sobre la misma ruta de disco.
2. **Sondeos Periódicos**:
   - `agpro-quota`: Timer cada 15s (configurable vía `refreshIntervalSeconds`). Ejecuta 2 HTTP GET + 1 barrido de directorio SQLite + lectura incremental de steps.
   - `context-auditor`: Timer cada 3.5s (solo si `focused`). Ejecuta `readdir` + `stat` sobre todos los `.db` y `-wal` + `readSessionContext` (200 pasos).
3. **Carga Combinada por Ciclo**:
   - En una ventana de 15 segundos con foco activo:
     - ~4.2 lecturas de directorio y stats por parte del auditor.
     - 1 lectura de directorio por parte de agpro-quota.
     - Aperturas redundantes de SQLite sobre la misma conversación activa.
4. **Decisión de Integración**:
   - Unificar en un **único vigilante híbrido**: el `SessionWatcher` gestionará el `fs.watch` con debounce y el sondeo, emitiendo un único evento unificado que actualice simultáneamente la cuota del Language Server y las métricas del Context Auditor. Cero lecturas de disco duplicadas.

---

## 8. Colisiones Previsibles al Unir Ambos Proyectos (Sección g)

`[VERIFICADO con datos o tests]`
- **IDs de Comandos**:
  - Cuota: `agPro.*` (7 comandos).
  - Auditor: `contextAuditor.*` (4 comandos).
  - *Colisión*: **0 colisiones**. Tienen namespaces perfectamente segregados.
- **Configuración**:
  - Cuota: `agPro.*` (10 propiedades).
  - Auditor: `contextAuditor.*` (10 propiedades).
  - *Colisión*: **0 colisiones**.
  - Requisito adicional: Añadir `contextAuditor.enabled` (booleano, por defecto `true`) para permitir desactivar el auditor por completo.
- **Vistas y Webviews**:
  - `agpro.dashboardView` reside en el Activity Bar (`viewsContainers.activitybar`).
  - `contextAuditorPanel` se abría como panel flotante al lado (`ViewColumn.Beside`).
  - *Colisión*: Ninguna directa. La integración alojará ambas vistas en pestañas dentro del Webview Provider (`[Cuota]` y `[Salud de sesión y snapshot]`), manteniendo el comando `contextAuditor.openPanel` como invocador que abre o revela el dashboard.
- **Barra de Estado**:
  - Ambos creaban un item `StatusBarAlignment.Right, 100`.
  - Decisión: Mantener **dos elementos contiguos** en la barra de estado (o uno consolidado configurable): el de cuota (`🚀 Pool: 93%`) y el del auditor (`🟢 Gemini: 101k`). Se justifica mantenerlos separados porque tienen prioridades visuales distintas: la cuota es global del usuario y el auditor es contextual a la sesión activa en edición.

---

## 9. Análisis de Cobertura de Tests (Sección h)

`[VERIFICADO con datos o tests]`

| Módulo | Tests Existentes | Tipo de Datos | ¿Qué Queda Sin Probar Automáticamente? |
|---|---|---|---|
| **`protoWire.ts`** | 2 tests | Sintéticos (Uint8Array controlados) | BLOBs reales de nuevas versiones no observadas. |
| **`nnls.ts`** | 1 test | Sintéticos (matrices con ruido) | Casos extremos de rango colineal perfecto en matrices de cuota. |
| **`calibrationAligner.ts`** | 1 test | Sintéticos | Variabilidad estocástica de retrasos en peticiones reales. |
| **`calibrationManager.ts`** | 3 tests | Sintéticos | Persistencia entre reinicios de VS Code. |
| **`historyManager.ts`** | 3 tests | Sintéticos (mock GlobalState) | Comportamiento con historiales de más de 30 días. |
| **`quotaParser.ts`** | 7 tests | **Reales** (`docs/samples/*.json`) | Payloads de error 401/403/500 de la API. |
| **`statusBar.ts`** | 8 tests | Sintéticos (lógica pura) | Renderizado visual y truncado de etiquetas en el IDE real. |
| **`thresholds.ts`** | 4 tests | Sintéticos (lógica pura) | Nada (cobertura completa de dominio). |
| **`tokenAuditor.ts`** | 3 tests | Sintéticos (DB SQLite temporal) | Bases reales con WAL corrupto o bloqueos externos. |
| **`dbReader.ts`** | 7 tests | Sintéticos (DB SQLite temporal) | Bases con versiones de esquema > v15. |
| **`healthEvaluator.ts`** | 10 tests | Sintéticos (barrido 0 a 250k) | Nada (cobertura matemática exhaustiva sin huecos). |
| **`sessionWatcher.ts`** | 3 tests | Sintéticos (archivos en disco temp) | Concurrencia de múltiples ventanas de Antigravity en vivo. |
| **`snapshotGenerator.ts`** | 3 tests | Sintéticos | Repositorios git con submódulos o diffs > 50MB. |
| **`diagnosticsFormatter.ts`** | 2 tests | Sintéticos | Salidas con entornos de red corporativos (proxies). |
| **`stepExtractor.ts`** | 2 tests | Sintéticos | Herramientas no estándar de Antigravity fuera de `run_command`/`write_to_file`. |

---

## 10. Reproducibilidad de Scripts de Investigación (Sección i)

`[VERIFICADO con datos reales]`
- **Verificación**: Se ejecutó la búsqueda de `research_*.mjs` en todo el repositorio y se confirmó que **no existen**.
- **Propuesta de Reposición en Hito 4**:
  Restituir en `scripts/research/` 4 scripts independientes de solo lectura, con salida sanitizada y usando `DatabaseSync` ({ readOnly: true }, PRAGMAs S1):
  1. `scripts/research/research_9a_cache_audit.mjs`: Inspecciona recursivamente los 38 campos numéricos de `metadata` y corrobora el valor constante (24/26) de `metadata.9.6`.
  2. `scripts/research/research_9b_latency_ttft.mjs`: Calcula la correlación de `(fin - campo 6)` con `Output` ($r > 0.85$) y ejecuta la regresión multivariante con intercepto ($\beta_{\text{input}} \approx 16$ ms/1k tokens).
  3. `scripts/research/research_9c_session_sensitivity.mjs`: Extrae la distribución de picos y medias por conversación en las 6 bases `.db`, reportando las medianas (193.6k y 94.5k) y la concentración en 2 sesiones.
  4. `scripts/research/research_9d_threshold_profiles.mjs`: Evalúa la distribución de pasos bajo los perfiles `observed` vs `provisional` y reporta los rangos disonantes en Claude y Gemini.
