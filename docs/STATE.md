# AG Pro Quota — Estado Actual de Integración (v1.3.0)

## Resumen Ejecutivo
- **Hito actual**: Hito 3 completado (Correcciones de honestidad y rotulado). Siguiente: Hito 4 (Empaquetado y verificación).
- **Rama git**: `integracion-v1.3.0` (creada desde `context-auditor`, `master` intacta).
- **Carpeta respaldo**: `context-auditor/` (intacta, respaldo inalterado, no mover ni borrar).
- **Versión objetivo**: `agpro-quota@1.3.0`.

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Seguridad S1/S2** | `[VERIFICADO CON DATOS REALES]` | 100% accesos a SQLite con `readOnly: true`, `busy_timeout = 3000`, `query_only = ON`. Cero escrituras en `~/.gemini`. Cero llamadas de red externas. Subprocesos con `execFile` y timeout. |
| **Rotulado Honesto de Caché** | `[VERIFICADO CON DATOS REALES]` | Porcentaje de caché en dashboard rotulado honestamente como "no disponible localmente". Cero cálculos de cuota o NNLS alterados. |
| **Comandos y Configuración** | `[VERIFICADO CON DATOS REALES]` | Prefijos segregados (`agPro.*` vs `contextAuditor.*`). Agrupación clara en package.json. Opción `contextAuditor.enabled` funcional. |
| **Suite de Tests de Cuota** | `[VERIFICADO CON DATOS REALES]` | 31/31 tests pasando en verde en `agpro-quota`. |
| **Suite de Tests de Auditor** | `[VERIFICADO CON DATOS REALES]` | 27/27 tests pasando en verde integrados en `test/context/`. Total: 58/58 tests en verde. |
| **Integración de Código y Unificación** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Auditor trasladado a `src/context/`, vendor eliminado, un solo vigilante de archivos (`SessionWatcher`), un solo sondeo periódico, aislamiento try/catch completo, dashboard con pestañas. |
| **Reproducibilidad Research** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Por reponer en `scripts/research/` durante Hito 4. |
| **Extensión Fusionada Completa** | `[NO PROBADO EN EL IDE REAL]` | Comportamiento conjunto en runtime VS Code/Antigravity IDE real. |

---

## Decisiones Vigentes
1. **Rama de trabajo**: `integracion-v1.3.0`. Prohibido tocar master, push, rebase o reset --hard.
2. **Respaldo intacto**: `context-auditor/` no se modifica ni se borra.
3. **Unificación de Watcher y Polling**: Un solo vigilante de archivos (`SessionWatcher.start()`) y un solo temporizador de sondeo periódico (`startRefreshLoop()`) alimentan tanto cuota como auditor de contexto.
4. **Honestidad de Interfaz**: Se transparentó la ausencia de tokens reales de caché en SQLite sin alterar los algoritmos de la cuota.
5. **Segregación y Aislamiento**: Si `contextAuditor.enabled = false` o si el auditor falla, la barra de estado del auditor se oculta, los errores se capturan con `try/catch` y se registran en el OutputChannel, manteniendo la cuota 100% operativa.
6. **Interfaz de Barra de Estado**: Dos elementos adyacentes (`Right, 100` para Cuota y `Right, 95` para Context Auditor).
7. **Dashboard Integrado**: Pestañas `[Cuota]` y `[Salud de sesión y snapshot]` con preservación de pestaña activa en `sessionStorage`.

---

## Cómo Compilar y Probar
- Tests integrados: `npm test` (58 tests)
- Linter: `npm run lint`
- Compilación: `npm run compile`
