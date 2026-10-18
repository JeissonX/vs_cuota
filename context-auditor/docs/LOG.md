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
