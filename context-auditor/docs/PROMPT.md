ROL Y MODO DE TRABAJO
Eres el ingeniero responsable de construir, de forma autónoma y por hitos, una extensión de VS Code/Antigravity llamada "Context Auditor". No me pidas confirmación entre hitos: solo te detienes en las CONDICIONES DE PARADA. Prefiere decisiones reversibles y regístralas.
Primer acto: guarda este mensaje íntegro en context-auditor/docs/PROMPT.md.

CONTEXTO
- Repo: agpro-quota. Rama de trabajo: context-auditor (créala desde la actual si no existe).
- Todo va en una carpeta NUEVA en la raíz: context-auditor/ (extensión independiente, con su propio package.json y tsconfig). No modifiques ni borres nada fuera de ella.
- Reutiliza código existente COPIÁNDOLO a context-auditor/src/vendor/ con un comentario de origen (ruta + commit). Los originales no se tocan. Lee solo lo necesario (protoWire.ts, la inicialización SQLite de tokenAuditor.ts, nnls.ts) y verifica qué exportan; no asumas nombres.
- Sigue las convenciones del repo (TypeScript, test runner, linter, bundler) descubriéndolas en sus archivos de configuración. No leas todo el repo; lee lo mínimo por hito y mantén tu propio contexto liviano.

PRODUCTO (MVP)
Status bar + panel que mide la salud del contexto de la conversación activa leyendo las bases SQLite locales (~/.gemini/antigravity-ide/conversations/*.db):
1. Radiografía: tokens de entrada, caché, pensamiento y salida del último paso de inferencia (datos exactos).
2. Semáforo + insignia de contexto.
3. Snapshot de migración copiable al portapapeles, sin llamar a ningún modelo.
Fuera del MVP: limpiador de sesiones, proyección de cuota, borrar o mover cualquier archivo.

REGLAS DE SEGURIDAD (inviolables)
S1. Las bases de Antigravity son SOLO LECTURA: DatabaseSync con { readOnly: true }, PRAGMA busy_timeout = 3000, PRAGMA query_only = ON. Prohibido escribir, mover, borrar o copiar los .db/-wal/-shm, y crear archivos dentro de ~/.gemini.
S2. Prohibido: git push, reset --hard, clean, force, rebase, borrar ramas, instalar paquetes globales, pedir o guardar credenciales. Se permite npm install LOCAL en context-auditor/ solo de dependencias de desarrollo que agpro-quota ya usa (mismas versiones); ninguna otra red. Los comandos de shell van con execFile (sin shell), con timeout y cwd conocido.
S3. Privacidad: ni los logs ni los reportes contienen prompts completos, tokens, claves ni rutas personales. Trunca a 80 caracteres y sustituye la carpeta de usuario por ~. spike_result.json va en .gitignore.
S4. Todo fallo de lectura o parsing degrada a "--" o "no disponible"; nunca lanza una excepción que tumbe la extensión ni bloquea el event loop (consulta solo los últimos N pasos; N configurable, por defecto 200).

SISTEMA DE LOGS (obligatorio: es tu memoria entre hitos)
Crea context-auditor/docs/LOG.md (solo se AÑADE) y context-auditor/docs/STATE.md (se SOBRESCRIBE al cerrar cada hito).
Al cerrar cada hito, antes del commit, añade a LOG.md una entrada con: fecha/hora y número de hito; qué hiciste (2-5 líneas); decisiones y su motivo; archivos creados/modificados; compilación y tests (comando y pasó/falló); hechos nuevos [VERIFICADO] e hipótesis pendientes [HIPÓTESIS]; bloqueos y qué intentaste; siguiente hito.
STATE.md debe permitir que un chat NUEVO retome el trabajo solo leyéndolo: hito actual, escenario decidido (A/B/C), tabla Hecho/Hipótesis del esquema, decisiones vigentes, cómo compilar y probar, pendientes. Si esta conversación se vuelve larga o lenta, cierra el hito en curso, actualiza STATE.md y avísame para seguir en un chat limpio.
Un commit por hito en la rama context-auditor, con mensaje "ctx-auditor: hito N - <resumen>", solo si compila y los tests pasan. Haz git add solo dentro de context-auditor/.

HITOS

HITO 0 - Andamiaje y spike de investigación (solo lectura)
a) Verifica node --version (se necesita 22.13+ para node:sqlite; si es menor, aplica P2). Crea la estructura de context-auditor/ (package.json con activationEvents mínimos, tsconfig, src/, test/, docs/, scripts/).
b) Escribe scripts/spike.mjs (sin dependencias) que inspeccione el .db más reciente y TAMBIÉN cuente step_type en cada .db (solo conteos). Reporta en spike_result.json:
   - esquema de todas las tablas (PRAGMA table_info), conteo de filas y valores distintos de step_format
   - distribución de step_type y 2 filas de ejemplo por tipo
   - NUNCA reduzcas un BLOB a "N bytes": por cada BLOB muestra los primeros 48 bytes en hex, el texto si es UTF-8 legible, si es JSON válido y, si es protobuf, decodifícalo recursivamente (submensajes, strings y varints; tope de 40 campos y profundidad 4; si el parseo falla devuelve null sin romper)
   - en tablas distintas de steps, trunca los strings a 300 caracteres
c) Ejecútalo y responde, marcando cada punto [VERIFICADO con datos] o [HIPÓTESIS]:
   1. qué step_type son prompts del usuario, respuestas del modelo y llamadas a herramientas, y en qué columna/campo está el texto exacto
   2. cómo se serializan las llamadas a herramientas (lectura/edición de archivos, comandos) y si hay código de salida
   3. dónde se guarda el modelo activo de cada paso
   4. estructura de los timestamps (metadata, campos 1 y 6/7/8) y si permiten calcular latencia por paso
   5. cómo identificar la conversación activa: observa mtimes de .db y -wal en varias lecturas espaciadas y propón 2 opciones con sus fallos; lo que no puedas probar sin mi interacción queda como [HIPÓTESIS]
d) Decide el ESCENARIO y regístralo en STATE.md:
   A = payload de herramientas legible (JSON/texto) -> alcance completo.
   B = protobuf estructurado descifrable -> alcance completo, con máximo 2 intentos de ingeniería inversa por campo; si no se resuelve, pasa a C.
   C = opaco o ausente -> recorte: recent_files_list sale solo de git status y se omite la barra de "composición estimada".
   Continúa al hito 1 aplicando el escenario. NO esperes mi aprobación salvo que se cumpla una condición de parada.

HITO 1 - Núcleo de lectura
- Schema Guard: PRAGMA table_info(steps); si faltan columnas críticas (idx, step_type, metadata) el estado es "Auditor inactivo: versión de base de datos no compatible".
- Lector de los últimos N pasos de la conversación elegida y extractor del último paso de inferencia: input (9.5), cache_read (9.6), thoughts (9.2), output (9.3) con el decodificador copiado. Confirma los nombres reales con los datos del spike.
- Tests con fixtures SINTÉTICAS creadas en el propio test (sin datos personales ni .db reales).

HITO 2 - Semáforo e insignia (funciones puras + configuración)
- T_frescos = Input - CacheRead + (k_cache x CacheRead). k_cache por defecto 0.10, configurable (contextAuditor.kCache). Si se calibra: k = b/a (b = peso del caché, a = peso del input fresco), con guardas: si a <= 1e-9 usa 0.10; recorta a [0,1]; solo se sustituye si el ajuste es confiable (n>=30, R2>=0.6, a>0).
- Estados evaluados en este orden, sin huecos: ROJO si T_frescos >= Θrojo; AMARILLO si >= Θamarillo; VERDE en otro caso. Valores provisionales, marcados "a calibrar" en UI y README: Gemini Θamarillo 50.000 / Θrojo 120.000; Claude Θamarillo 20.000 / Θrojo 45.000; modelo desconocido usa los de Claude.
- Criterio por latencia (Δt_input = latencia total - (α x output + β x thoughts)): impleméntalo pero DESACTIVADO por defecto. α y β no están medidos; no uses valores inventados. Se estiman en el hito 6.
- Insignia independiente del caché, por ocupación de ventana (Input / ventana del modelo). Provisional: Denso > 25%, Crítico > 50%. Ventanas por defecto: Gemini Flash 1.000.000, Claude 200.000, desconocido 200.000; configurables, con contextAuditor.modelFamily = auto | gemini | claude. Texto de UI neutral, sin referencias a archivos concretos del usuario.
- Tests: un barrido que demuestre que para cualquier T_frescos existe exactamente un estado, y pruebas de borde en cada umbral.

HITO 3 - Snapshot determinista
- Secciones: Entorno (workspace, rama git, resumen git), Última interacción (extracto final de la última respuesta del asistente y última instrucción del usuario), Historial acotado (prompt inicial y hasta 2 intermedios), Archivos modificados, Directiva de reanudación.
- Topes duros: resumen git 20 líneas / 1.000 chars; last_assistant 400 chars (los finales); last_user 300; first_user 300 (los primeros); intermedios 2 x 150; archivos máx. 8. Cada campo con fallback explícito ("[No disponible]", "[Consultar git status]").
- Git con execFile y timeout: git rev-parse --abbrev-ref HEAD, git status -s, git diff --stat.
- Si el spike encontró el registro de comandos con código de salida, añade "Últimos comandos"; si no, omítelo y regístralo en STATE.md.
- Tests unitarios del formateador y de los topes.

HITO 4 - Conversación activa
- Implementa la opción elegida en el hito 0: vscode.window.state.focused + fs.watch sobre los .db-wal con debounce. Si más de un .db recibe escrituras en una ventana de 2 s, muestra en la status bar "Sesión: [id truncado]" y un QuickPick para fijar manualmente, guardado en context.workspaceState por workspace.
- No asumas que fs.watch es fiable en Windows: añade un sondeo de respaldo cada pocos segundos mientras la ventana tenga foco.

HITO 5 - Interfaz y empaquetado
- Status bar (semáforo + insignia + tokens frescos) y webview compacto: barra exacta Input / Cache / Thoughts / Output, semáforo, insignia, selector de sesión y botón "Copiar snapshot". Solo en escenario A o B y si el spike lo permitió: barra de "Composición estimada", rotulada como estimación (chars/4 normalizado contra el input real).
- Comandos: contextAuditor.copySnapshot, contextAuditor.selectSession, contextAuditor.openPanel.
- README corto (qué lee, que es solo lectura, cómo cambiar umbrales, que los umbrales son provisionales) y empaquetado VSIX; si falta la herramienta y no puedes instalarla (S2), deja el comando documentado y registra el bloqueo.

HITO 6 (opcional, solo si 0-5 están completos y en verde) - Calibración offline
- scripts/calibrate.mjs, solo lectura, sobre todos los .db: distribución de T_frescos, latencia por paso si hay timestamps, estimación de α y β por regresión controlando por tokens de salida y pensamiento, y k_cache = b/a con nnls.ts copiado. Solo IMPRIME propuestas; no modifica la configuración.

CONDICIONES DE PARADA (solo estas)
P1. Una tarea exigiría escribir en las bases de Antigravity o en ~/.gemini.
P2. Algo requiere red, credenciales o herramientas globales fuera de lo que S2 permite.
P3. El mismo error persiste tras 3 enfoques distintos: regístralo en LOG.md; si el hito siguiente es independiente, continúa con él; si depende, detente.
P4. El spike demuestra que el supuesto base es falso (p. ej. no hay campos de tokens legibles): detente y repórtalo con evidencia.
En cualquier otro caso, decide con estas reglas, registra y continúa.

ENTREGA FINAL
Al terminar (o al detenerte), añade un resumen final a LOG.md y respóndeme en máximo 15 líneas: hitos completados, escenario decidido, qué quedó como [HIPÓTESIS], bloqueos, cómo correr los tests, cómo instalar el VSIX y los 3 riesgos principales.
Empieza ahora por el HITO 0.
NOTAS DE ENTORNO LOCAL (EXCEPCIÓN A P2):
- En la raíz (../node_modules) ya están instalados TypeScript, esbuild, eslint y @types/vscode de agpro-quota. Puedes reutilizar ../node_modules (vía resolución de carpetas de Node o npm install --prefer-offline) sin detenerte por P2.
- El archivo .gitignore para excluir spike_result.json, node_modules/, dist/ y *.vsix debe crearse DENTRO de context-auditor/.gitignore (no modifiques el .gitignore de la raíz).
- Ejecuta todos los hitos seguidos (0 al 6) sin pausar.
