# AG Pro Quota — Estado Actual de Integración (v1.3.0)

## Resumen Ejecutivo
- **Fase actual**: FASE DE VERIFICACIÓN Y CORRECCIÓN COMPLETADA.
- **Rama git**: `integracion-v1.3.0` (creada desde `context-auditor`, `master` intacta en `35d0cd5`).
- **Carpeta respaldo**: `context-auditor/` (intacta, 27 tests pasando, no modificada ni eliminada).
- **Entregable**: `agpro-quota-1.3.0.vsix` (10 archivos empaquetados, 47.56 KB, sanitizado, sin `.map`, sin `docs/`, sin `scripts/`, sin `test/`, sin datos personales).
- **Cobertura de Tests**: 62/62 tests pasando en la raíz (31 de cuota + 27 del auditor + 4 de activación) + 27/27 en carpeta de respaldo.

---

## Tabla de Certeza Técnica (Tres Niveles)

| Componente | Nivel de Certeza | Evidencia y Detalle |
|---|---|---|
| **Seguridad S1/S2/S4** | `[VERIFICADO CON DATOS REALES]` | 100% de accesos SQLite en ambos módulos operan con `DatabaseSync` en modo `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;`, `PRAGMA query_only = ON;`. Cero escrituras en `~/.gemini`. Cero llamadas a Internet. Subprocesos protegidos con `execFile`, timeout rígido y sanitización de rutas (`~`). |
| **Origen del Campo metadata.9.6** | `[VERIFICADO CON DATOS REALES]` | Comprobado con 1.990 inferencias en 13 bases SQLite: es un enum de control casi constante (24 en Gemini, 26 en Claude), no tokens leídos de caché. Afecta al modelo NNLS actuando como pseudo-intercepto espurio. |
| **Rotulado Honesto de Caché** | `[VERIFICADO CON DATOS REALES]` | Métrica de caché rotulada explícitamente en el Dashboard como "no disponible localmente". Calibración NNLS rotulada como experimental sin modificar modelos matemáticos ni umbrales de cuota. |
| **Comandos, Vistas y Configuración** | `[VERIFICADO CON DATOS REALES]` | Verificación exhaustiva contra `master` (`docs/REGRESSION_CHECK.md`): 0 IDs perdidos, 0 IDs renombrados, 0 IDs duplicados. 7 comandos y 10 configs de cuota idénticos a master. 4 comandos y 11 configs de auditor segregados. |
| **Prueba de Activación y Desactivación** | `[VERIFICADO CON DATOS REALES]` | 4 tests automatizados con mock integral de VS Code (`test/activation.test.ts`): verifica registro de 11 comandos y vistas, aislamiento con `contextAuditor.enabled=false`, tolerancia a excepciones del lector, y liberación limpia e idempotente en `deactivate()`. |
| **Suite Completa de Tests** | `[VERIFICADO CON DATOS REALES]` | 62/62 tests pasando en verde en raíz (parser de muestras reales de API, sparklines, umbrales, calibración NNLS, context auditor y activación). |
| **Scripts de Investigación Sanitizados** | `[VERIFICADO CON DATOS REALES]` | 4 scripts restituidos y ejecutados con éxito en `scripts/research/` (`research_9a_cache_audit.mjs`, `research_9b_latency_ttft.mjs`, `research_9c_session_sensitivity.mjs`, `research_9d_threshold_profiles.mjs`). |
| **Unificación de Watchers y Hot-Reload** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Un solo vigilante de archivos (`SessionWatcher`) y un solo temporizador periódico. Función `syncAuditorLifecycle(context)` conmuta en caliente entre vigilante unificado y vigilante fallback de cuota al cambiar `contextAuditor.enabled`. |
| **Empaquetado VSIX Sanitizado** | `[IMPLEMENTADO + TEST SINTÉTICO]` | Archivo `agpro-quota-1.3.0.vsix` generado sin `context-auditor/`, sin `docs/`, sin `scripts/`, sin `test/`, sin `spike_result.json`, sin mapas `.map` ni rutas personales. |
| **Interacción Real en el IDE** | `[NO PROBADO EN EL IDE REAL]` | Comportamiento conjunto en el entorno interactivo real de Antigravity IDE (apariencia contigua de los 2 status bar items, comportamiento de pestañas Webview, concurrencia en vivo). Pendiente de confirmación del usuario según protocolo `docs/PRUEBA_MANUAL.md`. |

---

## Decisiones y Correcciones Registradas en Verificación
1. **Regresiones verificadas**: Se confirmó en `docs/REGRESSION_CHECK.md` que la extensión fusionada conserva el 100% de la superficie pública de `master`.
2. **Ciclo de vida dinámico**: Se corrigió el manejo de `contextAuditor.enabled` para que conmutar a `false` desmonte el `sessionWatcher` y la barra de estado del auditor, montando el `quotaWatcher` original de master, y viceversa al conmutar a `true`.
3. **Auditoría NNLS y cacheRead**: Se documentó formalmente en `docs/AUDIT.md` la propuesta de excluir `cacheRead` de `FEATURES` para estabilizar el modelo Lawson-Hanson, sin aplicar cambios matemáticos en esta versión.
4. **.vscodeignore en master**: Se formuló la propuesta para master de ignorar `docs/` y `**/*.map` para evitar empaquetar artefactos innecesarios.

---

## Cómo Probar
1. Ejecutar tests automatizados: `npm test` (62 tests pasando).
2. Ejecutar análisis estático: `npm run lint` y `npx tsc --noEmit`.
3. Empaquetar VSIX: `npm run package`.
4. Seguir el protocolo de pruebas manuales en el IDE real detallado en [docs/PRUEBA_MANUAL.md](file:///c:/Users/Jeisson/Documents/AGENCIA/vs_cuota/docs/PRUEBA_MANUAL.md).
