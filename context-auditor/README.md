# Context Auditor

Extensión de diagnóstico y salud del contexto para **Antigravity IDE** (VS Code).

Mide en tiempo real la salud del contexto de la conversación activa leyendo de forma local y estrictamente pasiva las bases de datos SQLite de Antigravity (`~/.gemini/antigravity-ide/conversations/*.db`).

---

## Características Principales

1. **Radiografía Exacta de Tokens**:
   - Muestra de forma precisa los tokens de entrada total, caché, pensamiento y salida del último paso de inferencia.
   - Cálculo determinista de tokens frescos:
     $$T_{\text{frescos}} = \text{Input} - \text{CacheRead} + (k_{\text{cache}} \times \text{CacheRead})$$
     con $k_{\text{cache}} = 0.10$ por defecto.

2. **Semáforo e Insignia**:
   - **Semáforo de tres estados**:
     - 🟢 **VERDE**: Sesión saludable y costo marginal bajo.
     - 🟡 **AMARILLO**: Advertencia de contexto creciente (*a calibrar*).
     - 🔴 **ROJO**: Saturación de contexto (*a calibrar*). Se recomienda migración.
   - **Insignia de ocupación de ventana**:
     - `NORMAL`: $\le 25\%$ de la ventana del modelo.
     - `DENSO`: $> 25\%$ de la ventana.
     - `CRÍTICO`: $> 50\%$ de la ventana.

3. **Snapshot de Migración Copiable**:
   - Genera un resumen compacto en Markdown directamente al portapapeles con un solo clic.
   - No invoca ningún modelo de lenguaje (cero costo de tokens y latencia inferior a 50ms).
   - Incluye entorno Git, última interacción acotada, historial comprimido, archivos modificados y directiva de reanudación con topes duros estrictos.

---

## Seguridad y Privacidad Inviolables

- **Modo Estrictamente Solo Lectura**: Abre las bases mediante `DatabaseSync` con `{ readOnly: true }`, `PRAGMA busy_timeout = 3000;` y `PRAGMA query_only = ON;`. Nunca escribe, borra, copia ni mueve ningún archivo en `~/.gemini`.
- **Privacidad Local (Regla S3)**: Todas las rutas de usuario se anonimizan (`~`). No se transmiten datos a ningún servidor externo.
- **Degradación Elegante (Regla S4)**: Límite configurable de últimos pasos inspeccionados (por defecto 200). Errores de lectura o versiones incompatibles degradan a estado inactivo sin interrumpir el editor.

---

## Configuración y Umbrales

Todos los parámetros son configurables desde los ajustes de VS Code (`contextAuditor.*`):

| Parámetro | Valor por Defecto | Descripción |
|---|---|---|
| `contextAuditor.kCache` | `0.10` | Factor de ponderación del caché ($k$). |
| `contextAuditor.modelFamily` | `auto` | Familia de modelo (`auto`, `gemini`, `claude`). |
| `contextAuditor.thresholdGeminiYellow` | `50000` | Umbral amarillo para Gemini (*provisional, a calibrar*). |
| `contextAuditor.thresholdGeminiRed` | `120000` | Umbral rojo para Gemini (*provisional, a calibrar*). |
| `contextAuditor.thresholdClaudeYellow` | `20000` | Umbral amarillo para Claude (*provisional, a calibrar*). |
| `contextAuditor.thresholdClaudeRed` | `45000` | Umbral rojo para Claude (*provisional, a calibrar*). |
| `contextAuditor.windowGemini` | `1000000` | Tamaño de ventana de contexto para Gemini. |
| `contextAuditor.windowClaude` | `200000` | Tamaño de ventana de contexto para Claude / Desconocido. |
| `contextAuditor.stepsLimit` | `200` | Máximo de pasos a consultar en SQLite. |

> **Nota sobre los umbrales**: Los valores iniciales son provisionales y están diseñados para calibrarse con el historial real de la máquina mediante `scripts/calibrate.mjs`.

---

## Comandos Disponibles

- `Context Auditor: Copiar Snapshot de Migración` (`contextAuditor.copySnapshot`)
- `Context Auditor: Seleccionar Sesión Activa` (`contextAuditor.selectSession`)
- `Context Auditor: Abrir Panel de Contexto` (`contextAuditor.openPanel`)
- `Context Auditor: Mostrar Diagnóstico` (`contextAuditor.diagnostics`)

---

## Instalación en Antigravity IDE

Debido a que el comando CLI `code` puede apuntar a una instalación externa de VS Code y no a Antigravity:
1. Abra **Antigravity IDE**.
2. Abra la vista de Extensiones (`Ctrl+Shift+X` o desde la barra lateral izquierda).
3. Haga clic en el menú de tres puntos (`...`) en la esquina superior derecha del panel de Extensiones.
4. Seleccione **"Install from VSIX…"** (*Instalar desde VSIX...*).
5. Seleccione el archivo `context-auditor-0.1.1.vsix` generado.
