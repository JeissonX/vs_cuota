# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 0 completado. Iniciando Hito 1 (Núcleo de lectura).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo: lista de archivos recientes y barra de composición estimada habilitadas).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Node.js version | [VERIFICADO] | Node v24.19.0 (soporta `node:sqlite` nativo con `DatabaseSync`). |
| Esquema de tablas SQLite | [VERIFICADO] | Tablas encontradas: `steps`, `trajectory_meta`, `gen_metadata`, `executor_metadata`, `parent_references`, `trajectory_metadata_blob`, `battle_mode_infos`. `step_format` es 0. |
| Distribución de step_type | [VERIFICADO] | Tipos clave: 14 (User prompt), 15 (Model inference / tokens), 5 (`write_to_file`), 8 (`view_file`), 21 (`run_command`), 7/8 (errores/permisos), 98/99/101/132. |
| Texto de prompts y respuestas | [VERIFICADO] | En `steps.step_payload`: campo 19 (19.2/19.3.1) contiene el prompt del usuario en step 14; campo 20 (20.1) contiene el texto del asistente y (20.3) sus pensamientos en step 15. |
| Llamadas a herramientas y salida | [VERIFICADO] | Argumentos serializados como JSON legible en `step_payload.5.4.3` (y `metadata.4.3`). En `run_command` (step 21), campo 28 contiene exit code numérico (`28.6`), stdout/stderr (`28.21.1`) y comando (`28.23`). En `write_to_file` (step 5), campo `10.1.2.2.5` contiene URI. En `view_file` (step 8), campo `14.1` contiene URI. |
| Modelo activo por paso | [VERIFICADO] | En `steps.metadata`: campo `9.1` y campo `11` contienen el ID numérico del modelo (ej. 1318). En tabla `gen_metadata`: campo `data.1.19` contiene el slug (ej. `gemini-3.8-flash-n`) y `data.1.21` contiene el nombre legible (ej. `Gemini 3.8 Flash (High)`). |
| Estructura de timestamps y latencia | [VERIFICADO] | `steps.metadata`: campo 1 es $\{1:\text{sec}, 2:\text{nanos}\}$ (inicio), campo 6 es TTFT, campo 7 y 8 es finalización. Permiten calcular latencia exacta $(t_{\text{end}} - t_0)$ en milisegundos. |
| Identificación de conversación activa | [VERIFICADO / HIPÓTESIS] | [VERIFICADO] El archivo `.db-wal` de la conversación activa mantiene escrituras recientes continuas y `size > 0`. [HIPÓTESIS] La combinación de `vscode.window.state.focused` + `fs.watch` con debounce de 1.5s y sondeo de respaldo es suficiente para evitar colisiones en Windows. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo seleccionado porque los payloads de herramientas son JSON nativo descifrable sin conjeturas opacas.
2. **Seguridad S1/S2**: `DatabaseSync` estrictamente solo lectura (`readOnly: true`, `PRAGMA busy_timeout = 3000`, `PRAGMA query_only = ON`). Sin dependencias de red externas.
3. **Privacidad S3**: `spike_result.json` en `.gitignore`. Sanitización de rutas (`~`) y truncado a 80 chars en logs y reportes.

## Cómo Compilar y Probar
- Compilar extensión: `npm run compile` o `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npm run typecheck` o `npx tsc --noEmit`
- Tests unitarios: `npm run test`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [ ] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite de últimos N pasos, decodificador de tokens en 9.5, 9.6, 9.2, 9.3 y tests sintéticos).
- [ ] Hito 2: Semáforo e insignia (cálculo de $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests de dominio/bordes).
- [ ] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y comandos recientes).
- [ ] Hito 4: Conversación activa (vigilante de WAL, debounce, fallback de sondeo y quickPick de selección).
- [ ] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
