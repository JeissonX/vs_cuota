# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 1 completado. Iniciando Hito 2 (Semáforo e insignia).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Verifica `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. Si falta alguno, emite `Auditor inactivo: versión de base de datos no compatible`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). Valida enteros seguros y calcula input fresco `inputNoCache = input - cacheRead`. |
| Extractor de Inferencia | [VERIFICADO] | `readSessionContext` abre la base en solo lectura (`readOnly: true`, `PRAGMA busy_timeout = 3000`, `PRAGMA query_only = ON`), consulta últimos N pasos (`step_type = 15`), y extrae tokens, modelo y latencia exacta. |
| Fixtures Sintéticas | [VERIFICADO] | Pruebas unitarias ejecutadas contra bases y protobufs creados en memoria/temp en el propio test (sin datos personales ni archivos reales). |
| Privacidad y Degradación | [VERIFICADO] | Errores de lectura o DBs inexistentes devuelven estado seguro sin excepciones no controladas (Regla S4). |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Seguridad S1/S2**: `DatabaseSync` con `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`.
3. **Privacidad S3**: Sin textos privados en logs ni reportes.
4. **Resistencia S4**: Límite de últimos N pasos (por defecto 200). Fallos degradan a estado inactivo.

## Cómo Compilar y Probar
- Compilar: `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npx tsc --noEmit`
- Tests: `node --import tsx --test test/**/*.test.ts`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [ ] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [ ] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y comandos recientes).
- [ ] Hito 4: Conversación activa (vigilante de WAL, debounce, fallback de sondeo y quickPick de selección).
- [ ] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
