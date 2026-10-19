# AG Pro Quota — Estado Actual de Integración (v1.3.0)

## Resumen Ejecutivo
- **Hito actual**: Hito 1 completado (Auditoría de solo lectura). Siguiente: Hito 2 (Integración).
- **Rama git**: `integracion-v1.3.0` (creada desde `context-auditor`, `master` intacta).
- **Carpeta respaldo**: `context-auditor/` (intacta, 27 tests pasando, no mover ni borrar).
- **Versión objetivo**: `agpro-quota@1.3.0`.

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Seguridad S1/S2** | `[VERIFICADO CON DATOS REALES]` | 100% accesos a SQLite con `readOnly: true`, `busy_timeout = 3000`, `query_only = ON`. Cero escrituras en `~/.gemini`. Cero llamadas de red externas. Subprocesos con `execFile` y timeout. |
| **Origen de metadata.9.6** | `[VERIFICADO CON DATOS REALES]` | Constante 24 (Gemini) y 26 (Claude). No es lectura de caché. Genera 0.0% espurio en dashboard y distorsiona NNLS. |
| **Comandos y Configuración** | `[VERIFICADO CON DATOS REALES]` | Prefijos segregados (`agPro.*` vs `contextAuditor.*`). Cero colisiones de ID o settings. |
| **Suite de Tests de Cuota** | `[VERIFICADO CON DATOS REALES]` | 31/31 tests pasando en verde en `agpro-quota`. |
| **Suite de Tests de Auditor** | `[VERIFICADO CON DATOS REALES]` | 27/27 tests pasando en verde en `context-auditor`. |
| **Reproducibilidad Research** | `[VERIFICADO CON DATOS REALES]` | Scripts `research_*.mjs` confirmados como ausentes. Se repondrán en `scripts/research/`. |
| **Integración de Código** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Pendiente en Hito 2: Mover a `src/context/`, eliminar `vendor/`, unificar watcher, pestañas en dashboard. |
| **Extensión Fusionada Completa** | `[NO PROBADO EN EL IDE REAL]` | Comportamiento conjunto en runtime VS Code/Antigravity IDE real. |

---

## Decisiones Vigentes
1. **Rama de trabajo**: `integracion-v1.3.0`. Prohibido tocar master, push, rebase o reset --hard.
2. **Respaldo intacto**: `context-auditor/` no se modifica ni se borra.
3. **Unificación de Watcher**: Un solo vigilante de archivos y un solo sondeo alimentarán ambas métricas (cuota y salud de contexto).
4. **Segregación y Conmutador**: `contextAuditor.enabled` (default `true`). Si falla o se desactiva, la cuota continúa funcionando de forma aislada e inalterada.
5. **Dashboard Integrado**: Pestañas `[Cuota]` y `[Salud de sesión y snapshot]`.

---

## Cómo Compilar y Probar
- Tests de cuota: `npm test` (desde la raíz `vs_cuota/`)
- Tests de auditor: `npm test --prefix context-auditor` (desde la raíz o dentro de `context-auditor/`)
- Compilar cuota: `npm run compile`
- Compilar auditor: `npm run compile --prefix context-auditor`
