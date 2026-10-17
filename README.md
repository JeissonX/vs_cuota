# AG Pro Quota — Monitor de Cuota y Auditor de Tokens para Antigravity IDE

Extensión de alto rendimiento para **Antigravity IDE** (fork de VS Code) en Windows 11 que supervisa y presenta en tiempo real la cuota de uso de modelos de inteligencia artificial (Gemini, Claude, GPT), ventanas de tiempo (sprints de 5 horas y cuota semanal de 7 días), estados de salud de pools compartidos y **auditoría completa de consumo de tokens por petición y sesión**.

---

## 🚀 Novedades de la Versión 1.1.0

- **Barra de Estado Multi-Pool y Multi-Ventana**:
  - Muestra todos los pools simultáneamente con sus dos ventanas (ejemplo: `Gemini 93%/94% · Claude 0%/49%`).
  - Configurable con `agPro.statusBar.showWindows` (`"both"` para ambas ventanas o `"binding"` para mostrar únicamente la ventana limitante).
  - Filtrado selectivo de pools visibles mediante `agPro.statusBar.pools`.
  - Color y estado semafórico determinados por la ventana más restrictiva de cada pool.
  - Tooltip enriquecido que detalla ambas ventanas, hora exacta de reinicio, countdown, modelos asociados y aviso especial cuando el sprint de 5h se encuentra agotado (0%).

- **Auditoría de Tokens por Petición y Sesión Activa**:
  - Detección automática de la sesión activa en disco (`~/.gemini/antigravity-ide/conversations/*.db`).
  - Desglose por petición: índice del paso, modelo utilizado, tokens de salida (output), razonamiento (thought), entrada/contexto (prompt) y total de tokens.
  - **Velocidad real de generación (tokens/segundo)** calculada exclusivamente a partir de los timestamps reales de inicio y finalización del modelo.
  - Métrica de turnos (mensajes de usuario vs pasos del modelo) y promedio de tokens por petición.
  - Resumen global acumulado de toda la máquina y listado de sesiones recientes.
  - Alternancia instantánea entre formato compacto (`742.7K`) y exacto (`742,700`).

- **Historial de Cuota y Tendencias Visuales (Sparklines SVG)**:
  - Muestreo periódico de porcentajes de cuota cada ~5 minutos en `globalState` (retención máxima de 7 días).
  - Gráficas sparkline SVG nativas generadas en tiempo real sin librerías externas ni consumo excesivo de memoria.

---

## 🔒 Privacidad y Seguridad Estricta (Garantía Absoluta)

- **Modo Estrictamente Solo Lectura**: Las bases de datos SQLite locales de conversaciones se abren siempre con `{ readOnly: true }` y sin bloqueo de archivos (compatible con WAL mode).
- **Cero Lectura de Conversaciones**: La extensión **NUNCA** lee, procesa, muestra, registra en logs ni almacena mensajes, texto, prompts ni contenidos de las conversaciones del usuario. Únicamente consulta columnas numéricas y metadatos de telemetría (`idx`, `step_type`, `metadata`).
- **El token CSRF vive exclusivamente en memoria volátil**. Nunca se escribe en disco, archivos de configuración, logs ni commits de Git.
- **Sin conexiones a redes externas**: Todas las conexiones del cliente se restringen a la interfaz loopback local (`127.0.0.1`).
- **Degradación elegante**: Si `node:sqlite` no estuviese disponible o el formato de conversaciones cambiase, la auditoría muestra un aviso claro sin interrumpir la barra de estado ni el monitoreo de cuota.

---

## 📦 Instalación y Actualización en Windows 11

### Desinstalación previa de la versión 1.0.0 (Recomendado al actualizar)
Si tenías instalada la versión 1.0.0:
```powershell
# En PowerShell:
code --uninstall-extension agpro.agpro-quota
# o si usas el comando antigravity:
antigravity --uninstall-extension agpro.agpro-quota
```

### Instalación de la versión 1.1.0

#### Opción A: Desde PowerShell / Terminal de Windows
```powershell
code --install-extension agpro-quota-1.1.0.vsix --force
```
*(Si usas el ejecutable específico de Antigravity IDE:)*
```powershell
antigravity --install-extension agpro-quota-1.1.0.vsix --force
```

#### Opción B: Desde la interfaz de Antigravity IDE
1. Abre el panel de Extensiones (`Ctrl + Shift + X`).
2. Haz clic en el menú superior derecho (`...`).
3. Selecciona **"Install from VSIX..."** (Instalar desde VSIX...).
4. Selecciona el archivo `agpro-quota-1.1.0.vsix`.
5. Ejecuta `Ctrl + Shift + P` > **"Developer: Reload Window"** (Recargar ventana) para aplicar todos los cambios.

---

## ⚙️ Opciones de Configuración (`agPro.*`)

Configura estas opciones desde `Ctrl + ,` (buscando `agPro`) o en tu archivo `settings.json`:

| Parámetro | Tipo | Por Defecto | Descripción |
| :--- | :---: | :---: | :--- |
| `agPro.refreshIntervalSeconds` | `number` | `15` | Intervalo de refresco periódico en segundos (mínimo 5 s). |
| `agPro.statusBarFormat` | `string` | `"standard"` | Formato: `standard`, `namePercent`, `compact`, `percent`, `dot`, `icon`. |
| `agPro.statusBar.showWindows` | `string` | `"both"` | `"both"` (muestra 5h y semanal, ej: 93%/94%) o `"binding"` (solo la menor). |
| `agPro.statusBar.pools` | `array` | `[]` | Lista de pools a mostrar (vacío = muestra todos los pools disponibles). |
| `agPro.warningThreshold` | `number` | `30` | Umbral para advertencia amarilla (porcentaje). |
| `agPro.criticalThreshold` | `number` | `10` | Umbral para alerta crítica roja (porcentaje). |
| `agPro.language` | `string` | `"auto"` | Idioma de la interfaz (`auto`, `es`, `en`). |
| `agPro.pinnedModels` | `array` | `[]` | Modelos específicos para priorizar. |
| `agPro.notificationsEnabled` | `boolean` | `true` | Avisos emergentes al cruzar umbrales. |
| `agPro.logLevel` | `string` | `"info"` | Nivel de logging (`debug`, `info`, `warn`, `error`). |

---

## 🛠️ Comandos Disponibles (`Ctrl + Shift + P`)

- **`AG Pro: Abrir Dashboard de Cuota`**: Panel webview completo con tarjetas, sparklines, auditoría de tokens por petición y sesiones.
- **`AG Pro: Refrescar Cuota`**: Sincronización inmediata con el servidor y auditoría de tokens incremental.
- **`AG Pro: Vista Rápida de Cuota`**: Menú nativo QuickPick con estado de pools, métricas de tokens y modelos.
- **`AG Pro: Diagnóstico de Conexión`**: Reporte técnico sanitizado en OutputChannel.
- **`AG Pro: Cambiar Idioma (ES/EN)`**: Alterna entre español e inglés al instante.
- **`AG Pro: Abrir Configuración`**: Acceso directo a las opciones de `agPro.*`.

---

## 📄 Licencia y Atribución

Distribuido bajo la **Licencia MIT**. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para más detalles.
