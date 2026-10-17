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
| **HITO E** | Cierre v1.1.0 (actualizar versión, README, CHANGELOG, THIRD_PARTY_NOTICES, generar `.vsix` v1.1.0 e instrucciones) | ⬜ | Siguiente y último hito. |

---
*Convención de estados: ⬜ pendiente, ✅ hecho, ⚠️ con problemas.*
