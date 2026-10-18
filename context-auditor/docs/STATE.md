# Context Auditor — Estado Actual del Proyecto

## Resumen Ejecutivo
- **Hito actual**: Hito 2 completado. Iniciando Hito 3 (Snapshot determinista).
- **Escenario decidido**: **ESCENARIO A** (Payload de herramientas legible en JSON/texto -> Alcance completo).
- **Rama git**: `context-auditor`

## Tabla Hecho / Hipótesis del Esquema y Comportamiento
| Elemento | Estado | Detalle |
|---|---|---|
| Schema Guard | [VERIFICADO] | Verifica `idx`, `step_type`, `metadata` mediante `PRAGMA table_info(steps)`. |
| Decodificador de Tokens | [VERIFICADO] | Decodifica campo 9 del protobuf: 9.5 (input), 9.6 (cacheRead), 9.2 (thoughts), 9.3 (output). |
| Cálculo de $T_{\text{frescos}}$ | [VERIFICADO] | Fórmula pura: $\text{Input} - \text{CacheRead} + (k_{\text{cache}} \times \text{CacheRead})$ con $k_{\text{cache}} = 0.10$ por defecto y recortado a $[0, 1]$. |
| Guardas de calibración $k$ | [VERIFICADO] | $k = b/a$; si $a \le 10^{-9}$ fallback $0.10$; recorte a $[0, 1]$; solo confiable si $n \ge 30, R^2 \ge 0.6, a > 0$. |
| Semáforo sin huecos | [VERIFICADO] | ROJO ($\ge \Theta_{\text{rojo}}$), AMARILLO ($\ge \Theta_{\text{amarillo}}$), VERDE (otro caso). Barrido exhaustivo y bordes validados en tests. |
| Insignia de Contexto | [VERIFICADO] | Ocupación de ventana: CRITICO (> 50%), DENSO (> 25%), NORMAL ($\le 25\%$). Ventanas: Gemini 1.000.000, Claude/Desconocido 200.000. |
| Criterio por Latencia | [VERIFICADO] | $\Delta t_{\text{input}} = \text{totalLatencyMs} - (\alpha \times \text{output} + \beta \times \text{thoughts})$, implementado y desactivado por defecto sin inventar coeficientes. |

## Decisiones Vigentes
1. **Escenario A**: Alcance completo.
2. **Semáforo e Insignia**: Desacoplados. El semáforo mide el costo marginal fresco ($T_{\text{frescos}}$); la insignia mide la ocupación del búfer de atención (Input / ventana).
3. **Valores provisionales**: Umbrales marcados "a calibrar" en UI y README (Gemini 50k/120k; Claude 20k/45k).
4. **Seguridad y Privacidad**: S1, S2, S3, S4 activas en todos los módulos.

## Cómo Compilar y Probar
- Compilar: `node esbuild.config.mjs` (desde `context-auditor/`)
- Typecheck: `npx tsc --noEmit`
- Tests: `node --import tsx --test test/**/*.test.ts`

## Tareas Pendientes
- [x] Hito 0: Andamiaje y spike de investigación.
- [x] Hito 1: Núcleo de lectura (Schema Guard, lector SQLite, decodificador de tokens).
- [x] Hito 2: Semáforo e insignia (funciones puras: $T_{\text{frescos}}$, umbrales Gemini/Claude, ocupación de ventana y tests exhaustivos de borde).
- [ ] Hito 3: Snapshot determinista (secciones de entorno, última interacción, resumen git acotado y comandos recientes).
- [ ] Hito 4: Conversación activa (vigilante de WAL, debounce, fallback de sondeo y quickPick de selección).
- [ ] Hito 5: Interfaz (status bar + webview) y empaquetado VSIX.
- [ ] Hito 6: Calibración offline (scripts/calibrate.mjs).
