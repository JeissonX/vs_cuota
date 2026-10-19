# Estado de Avance del Proyecto (PROGRESS.md)

Este documento registra el progreso secuencial de cada hito de desarrollo para la extensión `agpro-quota`.

## Versión 1.0.0 (Fase 1 — Base y Cuota)
| Hito | Descripción | Estado | Notas |
| :--- | :--- | :---: | :--- |
| **HITO 0** | Base (git init, package.json, tsconfig strict, esbuild, ESLint, Prettier, compilación limpia) | ✅ | Commit `f2ec598`. |
| **HITO 1** | Cimientos (`types.ts`, `logger.ts` con OutputChannel y debug, `config.ts` agPro.*, `i18n es/en`) | ✅ | Commit `a967b76`. |
| **HITO 2** | Descubrimiento (`discovery.ts`: Get-CimInstance + Get-NetTCPConnection, triple filtro, caché, token en memoria) | ✅ | Commit `6cf8033`. |
| **HITO 3** | Muestras reales (ejecutar script contra Antigravity IDE, guardar en `docs/samples/` con REDACTED) | ✅ | Commit `3c34cf9`. |
| **HITO 4** | Cliente y parser (`quotaClient.ts`, `quotaParser.ts` contra muestras reales, tests unitarios de parser y umbrales) | ✅ | Commit `05c1cb7`. |
| **HITO 5** | Barra de estado (6 formatos, colores, tooltip, fijados, auto) y notificaciones anti-repetición | ✅ | Commit `0839429`. |
| **HITO 6** | Dashboard webview (tarjetas por pool, QuickPick fallback, temas claro/oscuro, comando diagnóstico) | ✅ | Commit `3fe8cb1`. |
| **HITO 7** | Cierre (`README.md` en español, `THIRD_PARTY_NOTICES.md`, empaquetado `.vsix` con vsce e instrucciones) | ✅ | Commit `1bce017`. Paquete v1.0.0 generado. |

## Versión 1.1.0 (Auditoría de Tokens y Mejoras Visuales)
| Hito | Descripción | Estado | Notas |
| :--- | :--- | :---: | :--- |
| **HITO A** | Barra de estado completa (todos los pools, ambas ventanas 5h/semanal, binding vs both, tooltip enriquecido, tests) | ✅ | Commit `c8ece89`. |
| **HITO B** | Inspección real de datos de tokens (inspección de SQLite en `~/.gemini`, esquema y metadata a `docs/samples/` con REDACTED, sin texto) | ✅ | Commit `2b48b79`. |
| **HITO C** | Auditor de tokens (`tokenAuditor.ts`: sesión activa incremental, globales, degradación sin node:sqlite, tests unitarios sintéticos) | ✅ | Commit `4e3f500`. Pruebas con DB sintética y velocidad real verificada. |
| **HITO D** | Dashboard rico (tarjetas ambas ventanas, tokens activos e históricos por petición, lista de sesiones, historial cuota sparkline, QuickPick) | ✅ | Implementado: Webview con doble ventana, sparklines SVG nativas, tabla de consumo por petición, alternador compacto/exacto, 23 tests en verde. |
| **HITO E** | Cierre v1.1.0 (actualizar versión, README, CHANGELOG, THIRD_PARTY_NOTICES, generar `.vsix` v1.1.0 e instrucciones) | ✅ | Commit y paquete `agpro-quota-1.1.0.vsix` generado correctamente. |

## Versión 1.3.0 (Fase 1 — Hardening & Consolidación)
| Hito | Descripción | Estado | Notas |
| :--- | :--- | :---: | :--- |
| **HITO 1** | src/discovery.ts: eliminación de fallback de puerto sin validar y tests de validación de sonda | [x] Completado | Eliminado fallback ciego a ports[0]. Solo se aceptan puertos validados por sonda HTTPS. 5 tests nuevos (67/67 pass). |
| **HITO 2** | Sincronización README.md con package.json v1.3.0 y anti-slop | [x] Completado | README actualizado a v1.3.0 (`agpro-quota-1.3.0.vsix`), tablas de 11 comandos y 22 configuraciones completas, sin referencias obsoletas a 1.1.0 y verificado con anti-slop. |
| **HITO 2B** | Escapado centralizado webviews (anti-XSS en dashboard y panel de contexto) | [x] Completado | Módulo `src/dashboard/htmlEscape.ts` con `escapeHtml` y `serializeForScript`. Sanitización de valores hoja y literales de script en `dashboardProvider.ts` y `panelHtml.ts`. 7 tests nuevos (74/74 pass). |
| **HITO 2C** | Fragmento compartido de contexto sin handlers inline ni style="" (CSP) | [x] Completado | Eliminados todos los `onclick=` y `style=""` de `getContextTabContentHtml`. Introducido `clampPercent`, selectores `ctx-*`, script compartido con listener delegado y `applyDynamicStyles` vía CSSOM. 6 tests nuevos (80/80 pass). |
| **HITO 2D** | Dashboard principal sin inline handlers/estilos + CSP estricta con nonce | [x] Completado | Eliminados 9 onclicks y 13 atributos style en `dashboardProvider.ts` y `historyManager.ts`. Inyectada meta CSP estricta con nonce aleatorio por render, `generateNonce()`, `buildCspMeta()`, exportadas funciones generadoras y creado `.vscode/launch.json`. 4 tests nuevos (84/84 pass). |
| **HITO 2E** | Panel standalone de contexto sin unsafe-inline + CSP estricta con nonce | [x] Completado | CSP estricta con nonce dinámico por render en `getWebviewContent`, reutilización de `generateNonce`/`buildCspMeta`, eliminación de inline handlers/estilos y suite `test/contextPanelCsp.test.ts` (Fase 1 completada al 100%, 89/89 pass). |

---
*Convención de estados: [ ] Pendiente, [~] En curso, [x] Completado.*

