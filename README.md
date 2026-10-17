# AG Pro Quota — Monitor de Cuota para Antigravity IDE

Extensión de alto rendimiento para **Antigravity IDE** en Windows 11 que supervisa y presenta en tiempo real la cuota de uso de modelos de inteligencia artificial (Gemini, Claude, GPT), ventanas de tiempo (sprints de 5 horas y cuota semanal de 7 días) y estados de salud de pools compartidos.

---

## 🚀 Características Principales

- **Barra de Estado Unificada y Altamente Configurable**:
  - 6 modos de visualización: `standard`, `compact`, `percent`, `dot`, `namePercent` e `icon`.
  - Indicadores semafóricos visuales según umbrales de salud (🟢 normal, 🟡 advertencia, 🔴 crítico/agotado).
  - Modo automático que enfoca el modelo más restringido, o soporte para fijar modelos específicos (`pinnedModels`).
  - Tooltip enriquecido en Markdown con tablas de cuota, barras ASCII y accesos directos.

- **Dashboard Visual por Tarjetas**:
  - Panel Webview moderno adaptado dinámicamente al tema activo del IDE (claro u oscuro) mediante variables CSS nativas.
  - Tarjetas agrupadas por pools de cuota compartida (`Gemini Models`, `Claude and GPT models`).
  - Barras de progreso fluidas y cuentas regresivas precisas para el próximo reseteo.

- **Vista Rápida (QuickPick Fallback)**:
  - Selector interactivo nativo de VS Code accesible mediante comando o clic, sin necesidad de cargar un Webview pesado.

- **Sistema de Notificaciones Inteligente**:
  - Alertas automáticas al descender de umbrales críticos o cuando la cuota se agota.
  - Mecanismo anti-spam que nunca repite avisos para el mismo modelo y nivel hasta que la cuota cambie.

- **Herramienta de Diagnóstico Integrada**:
  - Comando interactivo `AG Pro: Diagnóstico de Conexión` que examina el proceso, puertos y endpoints locales volcando el reporte al canal de salida.

- **Privacidad y Seguridad Estricta**:
  - **El token CSRF se mantiene exclusivamente en memoria volátil**. Nunca se escribe en disco, logs ni almacenamiento persistente.
  - Conexiones restringidas de forma estricta a la interfaz loopback local (`127.0.0.1`). Ninguna información sale a redes externas.

---

## 📦 Instalación en Windows 11

### Opción A: Desde la Interfaz Gráfica de Antigravity IDE
1. Descarga o localiza el archivo empaquetado `agpro-quota-1.0.0.vsix`.
2. En Antigravity IDE, abre el panel de Extensiones (`Ctrl + Shift + X`).
3. Haz clic en el menú de los tres puntos (`...`) en la esquina superior del panel de extensiones.
4. Selecciona **"Install from VSIX..."** (Instalar desde VSIX...).
5. Selecciona el archivo `agpro-quota-1.0.0.vsix` y confirma.
6. La extensión se activará inmediatamente mostrando el icono en la barra de estado inferior derecha.

### Opción B: Desde PowerShell / Terminal de Windows
Si tienes el ejecutable de Antigravity o VS Code en el PATH:
```powershell
# Instalación directa del archivo .vsix generado
code --install-extension agpro-quota-1.0.0.vsix
```
*Si tu instalación utiliza el comando `antigravity`:*
```powershell
antigravity --install-extension agpro-quota-1.0.0.vsix
```

---

## ⚙️ Opciones de Configuración (`agPro.*`)

Puedes ajustar el comportamiento desde la interfaz de Configuración (`Ctrl + ,` buscando `agPro`) o directamente en tu archivo `settings.json`:

| Parámetro | Tipo | Por Defecto | Descripción |
| :--- | :---: | :---: | :--- |
| `agPro.refreshIntervalSeconds` | `number` | `15` | Intervalo de sondeo en segundos (mínimo garantizado: 5 s). |
| `agPro.statusBarFormat` | `string` | `"standard"` | Formato visual (`standard`, `compact`, `percent`, `dot`, `namePercent`, `icon`). |
| `agPro.warningThreshold` | `number` | `30` | Porcentaje de cuota bajo el cual se activa el estado de advertencia (amarillo). |
| `agPro.criticalThreshold` | `number` | `10` | Porcentaje de cuota bajo el cual se activa el estado crítico (rojo). |
| `agPro.language` | `string` | `"auto"` | Idioma de los textos (`auto`, `es`, `en`). |
| `agPro.pinnedModels` | `array` | `[]` | Nombres o identificadores de modelos para fijar en la barra de estado. |
| `agPro.notificationsEnabled` | `boolean` | `true` | Habilita o deshabilita los avisos emergentes al cruzar umbrales. |
| `agPro.logLevel` | `string` | `"info"` | Nivel de detalle en el canal de salida (`debug`, `info`, `warn`, `error`). |

---

## 🛠️ Comandos Disponibles (`Ctrl + Shift + P`)

- **`AG Pro: Abrir Dashboard de Cuota`**: Despliega el panel visual con tarjetas y tablas.
- **`AG Pro: Refrescar Cuota`**: Fuerza una sincronización inmediata con el servidor local.
- **`AG Pro: Vista Rápida de Cuota`**: Abre el menú interactivo QuickPick.
- **`AG Pro: Diagnóstico de Conexión`**: Vuelca al OutputChannel el estado de conexión, PID y puerto.
- **`AG Pro: Cambiar Idioma (ES/EN)`**: Alterna rápidamente entre español e inglés.
- **`AG Pro: Abrir Configuración`**: Abre los ajustes de la extensión en el editor.

---

## 🔍 Solución de Problemas (Troubleshooting)

### 1. La barra muestra "Sin conexión" o "Buscando servidor..."
- **Causa**: El proceso de soporte `language_server_windows_x64.exe` aún no ha iniciado o está en fase de arranque.
- **Solución**: Abre cualquier archivo o inicia una interacción en el chat para despertar el language server. Luego ejecuta `AG Pro: Refrescar Cuota`.

### 2. Ejecutar el Diagnóstico
Si experimentas anomalías en los valores:
1. Abre la paleta de comandos (`Ctrl + Shift + P`).
2. Escribe y ejecuta `AG Pro: Diagnóstico de Conexión`.
3. Se abrirá automáticamente el canal de salida **"AG Pro Quota"** mostrando el PID localizado, puerto de escucha y la estructura devuelta por los endpoints locales.

---

## 📄 Licencia y Atribución

Este software se distribuye bajo la **Licencia MIT**. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para detalles sobre la atribución y los proyectos de referencia que inspiraron este trabajo.
