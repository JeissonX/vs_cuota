# AG Pro Quota — Monitor de Cuota y Context Auditor para Antigravity IDE

Extensión de telemetría y auditoría para **Antigravity IDE** en Windows 11. Supervisa en tiempo real la cuota de modelos (Gemini, Claude, GPT), ventanas de sprint de 5 horas y semanales de 7 días, consumo de tokens por petición y salud de contexto de sesión mediante SQLite local en modo de solo lectura.

---

## 🚀 Novedades de la Versión 1.3.0

- **Context Auditor Integrado**:
  - Detección automática y lectura incremental de la sesión activa en disco (`~/.gemini/antigravity-ide/conversations/*.db`).
  - Semáforo y evaluación de salud de ventana según modelo activo (Gemini hasta 1.000.000 tokens, Claude hasta 200.000 tokens).
  - Ponderación de tokens en caché (`kCache = 0.10`) y perfiles de umbral `observed` (historial empírico) y `provisional`.
  - Comando para generar y copiar snapshots de migración de contexto en formato Markdown al portapapeles.

- **Hardening de Conexión y Descubrimiento**:
  - Eliminación de fallbacks a puertos ciegos; validación estricta de endpoint mediante sonda HTTPS autenticada con token CSRF en memoria.
  - Degradación controlada sin reintentos infinitos ni bloqueos ante caída o reinicio del language server.

- **Monitoreo Multi-Pool y Multi-Ventana**:
  - Visualización simultánea o por ventana limitante (5h y semanal).
  - Filtro selectivo en barra de estado (`all`, `gemini`, `claude`) y alternador interactivo.
  - Gráficas sparkline SVG nativas generadas en memoria sin dependencias externas.

---

## 🔒 Privacidad y Seguridad

- **Modo Solo Lectura**: Las bases de datos SQLite locales de conversaciones se abren con `{ readOnly: true }` y compatibilidad WAL.
- **Sin Extracción de Texto**: La extensión no almacena ni transmite prompts, código ni respuestas; únicamente lee índices numéricos y metadatos de tokens (`idx`, `step_type`, `metadata`).
- **Token CSRF Volátil**: El token de autenticación reside exclusivamente en memoria de proceso y nunca se persiste en disco ni se imprime en logs.
- **Aislamiento de Red**: Todas las peticiones HTTP se dirigen únicamente a la interfaz loopback local (`127.0.0.1`).
- **Degradación Elegante**: Si `node:sqlite` no está disponible o el esquema cambia, la auditoría muestra un estado informativo sin interrumpir la barra de estado ni el monitoreo de cuota.

---

## 📦 Instalación y Actualización en Windows 11

### Desinstalación de versiones anteriores (opcional)
```powershell
code --uninstall-extension agpro.agpro-quota
# O en Antigravity IDE:
antigravity --uninstall-extension agpro.agpro-quota
```

### Instalación de la versión 1.3.0

#### Opción A: Desde PowerShell / Terminal
```powershell
code --install-extension agpro-quota-1.3.0.vsix --force
# O en Antigravity IDE:
antigravity --install-extension agpro-quota-1.3.0.vsix --force
```

#### Opción B: Desde la interfaz de Antigravity IDE
1. Abre el panel de Extensiones (`Ctrl + Shift + X`).
2. Haz clic en el menú contextual superior (`...`).
3. Selecciona **"Install from VSIX..."** (Instalar desde VSIX...).
4. Elige el archivo `agpro-quota-1.3.0.vsix`.
5. Ejecuta `Ctrl + Shift + P` > **"Developer: Reload Window"** para recargar el entorno.

---

## ⚙️ Opciones de Configuración

Configura estos parámetros desde `Ctrl + ,` o en tu archivo `settings.json`:

### Configuración General de Cuota (`agPro.*`)

| Parámetro | Tipo | Por Defecto | Descripción |
| :--- | :---: | :---: | :--- |
| `agPro.refreshIntervalSeconds` | `number` | `15` | Intervalo de sondeo periódico en segundos (mínimo 5s, máximo 3600s). |
| `agPro.statusBarFormat` | `string` | `"standard"` | Formato visual en barra: `standard`, `namePercent`, `compact`, `percent`, `dot`, `icon`. |
| `agPro.statusBar.showWindows` | `string` | `"both"` | Ventanas mostradas: `"both"` (5h y semanal) o `"binding"` (únicamente la limitante). |
| `agPro.statusBar.pools` | `array` | `[]` | Lista de pools a mostrar en la barra (vacío muestra todos los disponibles). |
| `agPro.statusBar.poolView` | `string` | `"all"` | Filtro de pool en barra: `"all"` (ambos), `"gemini"` o `"claude"`. |
| `agPro.warningThreshold` | `number` | `30` | Porcentaje de cuota restante para advertencia en amarillo (1-99%). |
| `agPro.criticalThreshold` | `number` | `10` | Porcentaje de cuota restante para alerta crítica en rojo (1-99%). |
| `agPro.language` | `string` | `"auto"` | Idioma de la interfaz (`"auto"`, `"es"`, `"en"`). |
| `agPro.pinnedModels` | `array` | `[]` | Lista de modelos prioritarios en la barra de estado. |
| `agPro.notificationsEnabled` | `boolean` | `true` | Habilita notificaciones emergentes al cruzar los umbrales de advertencia y crítico. |
| `agPro.logLevel` | `string` | `"info"` | Nivel de registro en OutputChannel (`"debug"`, `"info"`, `"warn"`, `"error"`). |

### Configuración de Context Auditor (`contextAuditor.*`)

| Parámetro | Tipo | Por Defecto | Descripción |
| :--- | :---: | :---: | :--- |
| `contextAuditor.enabled` | `boolean` | `true` | Activa o desactiva la supervisión de salud de sesión y métricas de contexto. |
| `contextAuditor.thresholdProfile` | `string` | `"observed"` | Perfil de umbrales del semáforo: `"observed"` (historial empírico) o `"provisional"` (teórico). |
| `contextAuditor.kCache` | `number` | `0.10` | Factor de ponderación matemática para tokens leídos de caché ($k_{cache}$). |
| `contextAuditor.modelFamily` | `string` | `"auto"` | Familia de modelo para tamaño de ventana (`"auto"`, `"gemini"`, `"claude"`). |
| `contextAuditor.windowGemini` | `number` | `1000000` | Tamaño de ventana de contexto en tokens para modelos Gemini (1M). |
| `contextAuditor.windowClaude` | `number` | `200000` | Tamaño de ventana de contexto en tokens para Claude o modelos no clasificados (200k). |
| `contextAuditor.thresholdGeminiYellow` | `number` | `50000` | Umbral de advertencia (amarillo) de tokens frescos para Gemini. |
| `contextAuditor.thresholdGeminiRed` | `number` | `120000` | Umbral crítico (rojo) de tokens frescos para Gemini. |
| `contextAuditor.thresholdClaudeYellow` | `number` | `20000` | Umbral de advertencia (amarillo) de tokens frescos para Claude. |
| `contextAuditor.thresholdClaudeRed` | `number` | `45000` | Umbral crítico (rojo) de tokens frescos para Claude. |
| `contextAuditor.stepsLimit` | `number` | `200` | Límite máximo de pasos de inferencia consultados en SQLite por ciclo. |

---

## 🛠️ Comandos Disponibles (`Ctrl + Shift + P`)

| Comando | Identificador | Descripción |
| :--- | :--- | :--- |
| `AG Pro: Abrir Dashboard de Cuota` | `agPro.openDashboard` | Abre el panel webview con métricas de cuota, sparklines, auditoría de tokens y contexto. |
| `AG Pro: Refrescar Cuota` | `agPro.refresh` | Fuerza actualización inmediata de cuota y recálculo de auditoría. |
| `AG Pro: Vista Rápida de Cuota` | `agPro.quickOverview` | Muestra QuickPick con estado de cuota, pools y modelos. |
| `AG Pro: Diagnóstico de Conexión` | `agPro.diagnose` | Ejecuta diagnóstico de conexión y vuelca reporte técnico en el OutputChannel. |
| `AG Pro: Cambiar Idioma (ES/EN)` | `agPro.toggleLang` | Alterna el idioma de la extensión entre español e inglés. |
| `AG Pro: Abrir Configuración` | `agPro.openSettings` | Abre los ajustes de configuración de la extensión. |
| `AG Pro: Cambiar Vista de Pools (Ambos / Gemini / Claude)` | `agPro.togglePoolView` | Selector interactivo para filtrar qué pools se muestran en la barra de estado. |
| `Context Auditor: Copiar Snapshot de Migración` | `contextAuditor.copySnapshot` | Genera y copia al portapapeles el resumen de contexto de la sesión activa en Markdown. |
| `Context Auditor: Seleccionar Sesión Activa` | `contextAuditor.selectSession` | Permite seleccionar manualmente la base de datos de sesión a auditar. |
| `Context Auditor: Abrir Panel de Contexto` | `contextAuditor.openPanel` | Abre el panel visual con el estado de salud y detalles de la sesión activa. |
| `Context Auditor: Mostrar Diagnóstico` | `contextAuditor.diagnostics` | Imprime el diagnóstico detallado de contexto e inferencias en el OutputChannel. |

---

## 📄 Licencia y Atribución

Distribuido bajo la **Licencia MIT**. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para más detalles.

