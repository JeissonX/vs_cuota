# Estado de Avance del Proyecto (PROGRESS.md)

Este documento registra el progreso secuencial de cada hito de desarrollo para la extensión `agpro-quota` (Fase 1).

| Hito | Descripción | Estado | Notas |
| :--- | :--- | :---: | :--- |
| **HITO 0** | Base (git init, package.json, tsconfig strict, esbuild, ESLint, Prettier, compilación limpia) | ✅ | Commit `f2ec598`. |
| **HITO 1** | Cimientos (`types.ts`, `logger.ts` con OutputChannel y debug, `config.ts` agPro.*, `i18n es/en`) | ✅ | Cimientos completos, validados y compilando. |
| **HITO 2** | Descubrimiento (`discovery.ts`: Get-CimInstance + Get-NetTCPConnection, triple filtro, caché, token en memoria) | ⬜ | Siguiente hito. |
| **HITO 3** | Muestras reales (ejecutar script contra Antigravity IDE, guardar en `docs/samples/` con REDACTED) | ⬜ | Pendiente. |
| **HITO 4** | Cliente y parser (`quotaClient.ts`, `quotaParser.ts` contra muestras reales, tests unitarios de parser y umbrales) | ⬜ | Pendiente. |
| **HITO 5** | Barra de estado (6 formatos, colores, tooltip, fijados, auto) y notificaciones anti-repetición | ⬜ | Pendiente. |
| **HITO 6** | Dashboard webview (tarjetas por pool, QuickPick fallback, temas claro/oscuro, comando diagnóstico) | ⬜ | Pendiente. |
| **HITO 7** | Cierre (`README.md` en español, `THIRD_PARTY_NOTICES.md`, empaquetado `.vsix` con vsce e instrucciones) | ⬜ | Pendiente. |

---
*Convención de estados: ⬜ pendiente, ✅ hecho, ⚠️ con problemas.*
