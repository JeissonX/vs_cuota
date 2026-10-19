# AG Pro Quota — Estado Actual de Integración (v1.3.0)

## Resumen Ejecutivo
- **Hito actual**: Hito 4 completado (Empaquetado y verificación final). Todos los hitos 1 al 4 han sido completados y probados.
- **Rama git**: `integracion-v1.3.0` (creada desde `context-auditor`, `master` intacta).
- **Carpeta respaldo**: `context-auditor/` (intacta, 27 tests pasando, no modificada ni eliminada).
- **Entregable**: `agpro-quota-1.3.0.vsix` (11 archivos empaquetados, 139.85 KB, sanitizado).

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Seguridad S1/S2/S4** | `[VERIFICADO CON DATOS REALES]` | 100% de accesos SQLite en ambos módulos operan con `DatabaseSync` en modo `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`. Cero escrituras en `~/.gemini`. Cero llamadas a Internet. Subprocesos protegidos con `execFile` y timeout. |
| **Origen del Campo metadata.9.6** | `[VERIFICADO CON DATOS REALES]` | Comprobado con 1.990 inferencias en 13 bases SQLite: es un enum de control casi constante (24 en Gemini, 26 en Claude), no tokens leídos de caché. |
| **Rotulado Honesto de Caché** | `[VERIFICADO CON DATOS REALES]` | Métrica de caché rotulada explícitamente en el Dashboard como "no disponible localmente". Calibración NNLS rotulada como experimental sin modificar modelos matemáticos. |
| **Comandos y Configuración** | `[VERIFICADO CON DATOS REALES]` | Comandos segregados (`agPro.*` y `contextAuditor.*`). Agrupación en dos esquemas en `package.json`. Conmutador `contextAuditor.enabled` probado funcionalmente. |
| **Suite de Tests de Cuota** | `[VERIFICADO CON DATOS REALES]` | 31/31 tests pasando en verde en `agpro-quota` (parser de muestras reales de API, sparklines, umbrales y calibración). |
| **Suite de Tests de Context Auditor** | `[VERIFICADO CON DATOS REALES]` | 27/27 tests pasando en verde en `test/context/` y en respaldo `context-auditor/`. Total: 58/58 tests en verde. |
| **Scripts de Investigación** | `[VERIFICADO CON DATOS REALES]` | 4 scripts restituidos y ejecutados con éxito en `scripts/research/` (`research_9a_cache_audit.mjs`, `research_9b_latency_ttft.mjs`, `research_9c_session_sensitivity.mjs`, `research_9d_threshold_profiles.mjs`). |
| **Integración de Código y Unificación** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Un solo vigilante de archivos (`SessionWatcher.start()`), un solo temporizador de sondeo periódico (`startRefreshLoop()`), aislamiento try/catch completo, dashboard webview consolidado con pestañas `[Cuota]` y `[Salud de sesión y snapshot]`. |
| **Empaquetado VSIX** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Archivo `agpro-quota-1.3.0.vsix` generado sin scripts, sin pruebas, sin spike_result.json y sin datos personales. |
| **Extensión Fusionada Completa** | `[NO PROBADO EN EL IDE REAL]` | Comportamiento conjunto en el entorno interactivo real de Antigravity IDE (sujeto a la prueba manual del usuario según `docs/PRUEBA_MANUAL.md`). |

---

## Decisiones de Integración Registradas
1. **Rama y Respaldo**: Todo el trabajo se realizó en la rama `integracion-v1.3.0`. La rama `master` y la carpeta `context-auditor/` quedaron completamente intactas.
2. **Unificación de Watcher y Polling**: Se eliminó la duplicidad de `fs.watch` y temporizadores de sondeo. `SessionWatcher` actúa como el único vigilante de eventos de disco con debounce de 1.5s; el bucle periódico de `startRefreshLoop()` realiza el único sondeo coordinado para ambas métricas.
3. **Aislamiento Total**: Todas las rutinas de Context Auditor están blindadas con `try/catch`. Si el auditor falla o si el usuario configura `contextAuditor.enabled = false`, la barra de estado del auditor se oculta y la cuota continúa funcionando de forma 100% independiente.
4. **Elementos de Barra de Estado**: Se implementaron dos elementos contiguos (`Right, 100` para Cuota y `Right, 95` para Context Auditor) debido a que representan conceptos ortogonales (cuota cloud global vs salud y prompt de sesión local) y poseen acciones de clic independientes.
5. **Dashboard Consolidado**: Webview único con barra de navegación superior entre `[Cuota]` y `[Salud de sesión y snapshot]`, con persistencia en `sessionStorage`.
6. **Honestidad en Interfaz**: Se reemplazó el cálculo espurio de `0.0%` de caché por el rótulo `no disponible localmente`, manteniendo intactos los algoritmos numéricos de cuota.

---

## Cómo Probar
1. Ejecutar tests automatizados: `npm test` (58 tests pasando).
2. Ejecutar análisis estático: `npm run lint`.
3. Ejecutar scripts de investigación: `node scripts/research/research_9a_cache_audit.mjs`.
4. Seguir el protocolo de pruebas manuales en el IDE real detallado en [docs/PRUEBA_MANUAL.md](file:///c:/Users/Jeisson/Documents/AGENCIA/vs_cuota/docs/PRUEBA_MANUAL.md).
