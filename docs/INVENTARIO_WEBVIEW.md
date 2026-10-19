# Inventario de Webviews — agpro-quota v1.3.0

> **Fecha de auditoría**: 19 de octubre de 2026  
> **Alcance**: Todo el código fuente en `src/` (excluyendo carpetas externas fuera del proyecto como `context-auditor/` de la raíz).  
> **Objetivo**: Mapeo exhaustivo y quirúrgico de Webviews para preparación de migración a CSP estricta (Content Security Policy) sin `'unsafe-inline'`.

---

## 1. Mapeo General de Webviews en `src/`

La extensión cuenta con dos puntos de presentación webview y tres funciones generadoras de HTML:

| Webview / Componente | Tipo VS Code | Ubicación Creación / Registro | Asignación a `webview.html` | Función Generadora HTML |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard (Pestaña completa)** | `vscode.WebviewPanel` | [`src/dashboard/dashboardProvider.ts:162`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/dashboard/dashboardProvider.ts#L162) (`createWebviewPanel`) | Líneas 172, 243 | `buildHtml()` ([`dashboardProvider.ts:304`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/dashboard/dashboardProvider.ts#L304)) |
| **Dashboard (Barra lateral / Sidebar)** | `vscode.WebviewViewProvider` (`agpro.dashboardView`) | [`src/extension.ts:376`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/extension.ts#L376) (`registerWebviewViewProvider`) | Líneas 96, 107 | `buildHtml()` y `buildLoadingHtml()` ([`dashboardProvider.ts:259`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/dashboard/dashboardProvider.ts#L259)) |
| **Panel Context Auditor (Integrado)** | Incrustado en Pestaña 'context' del Dashboard | [`src/extension.ts:256`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/extension.ts#L256) (`contextAuditor.openPanel` delega en `showDashboard`) | Pestaña contextual dentro de `dashboardProvider.ts` (Línea 1162) | `getContextTabContentHtml()` ([`src/context/panelHtml.ts:21`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/context/panelHtml.ts#L21)) |
| **Panel Context Auditor (Plantilla Standalone)** | Plantilla completa `<!DOCTYPE html>` | `src/context/panelHtml.ts` (función exportada para uso como panel autónomo) | Disponible vía `getWebviewContent()` | `getWebviewContent()` ([`src/context/panelHtml.ts:175`](file:///C:/Users/Jeisson/Documents/AGENCIA/vs_cuota/src/context/panelHtml.ts#L175)) |

---

## 2. Detalle por Webview

### Webview A: Dashboard Principal (`src/dashboard/dashboardProvider.ts`)

Contiene el panel completo en pestaña, la vista de barra lateral (Activity Bar) y el estado de carga (`buildLoadingHtml`).

#### 1. Handlers Inline (`onclick=`, `onchange=`, etc.) — Total: 9
Todos los manejadores inline usan cadenas ejecutadas en el contexto global del Webview:
- **Línea 1111**: `onclick="sendMsg('openFullDashboard')"` — Botón para abrir el dashboard en una pestaña completa desde la barra lateral.
- **Línea 1116**: `onclick="toggleFormat()"` — Botón para alternar el formato numérico de tokens (compacto vs exacto).
- **Línea 1119**: `onclick="sendMsg('refresh')"` — Botón primario para forzar sincronización de cuota.
- **Línea 1122**: `onclick="sendMsg('openSettings')"` — Botón para abrir las preferencias de la extensión.
- **Línea 1129**: `onclick="switchMainTab('quota')"` — Pestaña de navegación '📊 Cuota'.
- **Línea 1132**: `onclick="switchMainTab('context')"` — Pestaña de navegación '🩺 Salud de sesión y snapshot'.
- **Línea 1140**: `onclick="setPoolFilter('all')"` — Filtro de modelos 'Todos'.
- **Línea 1143**: `onclick="setPoolFilter('gemini')"` — Filtro de modelos 'Gemini'.
- **Línea 1146**: `onclick="setPoolFilter('claude')"` — Filtro de modelos 'Claude / GPT'.

#### 2. Atributos `style="..."` y Manipulaciones de Estilo — Total: 13 atributos template + 2 en script
- **Estilos dinámicos calculados (barras, gauges, colores)**:
  - **Línea 399**: `style="color: ${barColor}"` — Color de porcentaje del bucket según umbral (verde, amarillo, rojo).
  - **Línea 404**: `style="width: ${barWidth}%; background: ${barColor};"` — Ancho proporcional y color de fondo de la barra de consumo de cuota.
  - **Línea 531**: `style="width: ${barPct}%;"` — Ancho proporcional de barra para la tabla de consumo de tokens por petición.
- **Estilos estáticos inline**:
  - **Línea 280**: `style="font-size: 0.9em; color: var(--vscode-descriptionForeground);"` — Texto de estado en `buildLoadingHtml()`.
  - **Línea 301**: `style="display:none;"` — Ocultamiento por defecto del valor exacto en `dualNum()`.
  - **Línea 582**: `style="font-size: 0.9em;"` — Advertencia de caché no disponible.
  - **Línea 590**: `style="margin: 18px 0 10px 0; font-size: 1.05em;"` — Cabecera de peticiones.
  - **Línea 603**: `style="min-width: 90px;"` — Ancho de columna de barra en tabla.
  - **Línea 607**: `style="text-align: center; color: var(--muted);"` — Mensaje de tabla vacía.
  - **Línea 640**: `style="margin-bottom: 12px;"` — Margen de título de resumen global.
  - **Línea 641**: `style="margin-bottom: 16px;"` — Margen inferior de grid de métricas globales.
  - **Línea 664**: `style="margin: 16px 0 8px 0; font-size: 1.0em;"` — Título de listado de sesiones.
  - **Línea 1162**: `style="padding: 24px; text-align: center; color: var(--muted);"` — Mensaje fallback si el auditor de contexto no tiene datos.
- **Manipulación dinámica de estilo en `<script>`**:
  - **Línea 1245**: `compacts.forEach(el => el.style.display = isExact ? 'none' : 'inline')`
  - **Línea 1246**: `exacts.forEach(el => el.style.display = isExact ? 'inline' : 'none')`
  - *(Nota: No se utiliza `innerHTML` en el script)*.

#### 3. Bloques `<script>`, `<style>` y Recursos Locales
- **Bloques `<style>`**:
  - `buildLoadingHtml()`: Líneas **267–277** (estilos para el spinner de carga).
  - `buildHtml()`: Líneas **695–1101** (bloque principal de 407 líneas que define variables CSS de tema VS Code, layout responsivo, animaciones `@keyframes fadeInUp`, pestañas, filtros, badges y tarjetas).
- **Bloques `<script>`**:
  - `buildHtml()`: Líneas **1165–1252** (script de 88 líneas con adquisición de API VS Code, persistencia en `sessionStorage`/`localStorage`, alternancia de pestañas y filtros).
- **Recursos locales (`<link>`, `<img>`)**:
  - `<link>`: **0** (ninguno; no carga hojas de estilo externas ni locales).
  - `<img>`: **0** (ninguno; los gráficos sparklines se inyectan como cadenas `<svg>` puras inline generadas por `historyManager.generateSparklineSvg()`).
  - `localResourceRoots`: Configurado en Línea **62** (`localResourceRoots: [this.context.extensionUri]`) para `DashboardViewProvider`. No especificado en `showDashboard` (`createWebviewPanel`).

#### 4. Interpolaciones `${...}` de Datos Dinámicos y Estado de Escape
- **Función de escape presente**: **NINGUNA**. Todos los datos dinámicos se interpolan directamente como cadenas HTML sin sanitización ni escape de entidades (`&`, `<`, `>`, `"`, `'`).
- **Valores dinámicos vulnerables o interpolados**:
  - **Etiquetas y nombres de modelo**:
    - Línea 336: `${m.label}` en `<span class="model-pill">${m.label}</span>` (proveniente de la API gRPC/endpoint de cuota).
    - Línea 522: `${r.modelName}` (nombre del modelo extraído de SQLite / metadata del paso).
  - **Nombres de grupos / pools**:
    - Línea 426: `${group.displayName}` (nombre de pool reportado por la API de cuota).
  - **Metadatos e IDs de sesión SQLite**:
    - Línea 543: `${sess.sessionId}` (ID de sesión en cabecera).
    - Línea 631: `${s.sessionId.substring(0, 14)}...` (ID en tabla global).
  - **Mensajes de error y avisos de indisponibilidad**:
    - Línea 502: `${reason}` en `ℹ️ ${t('tokens.notAvailable')}: ${reason}` (`reason` puede contener excepciones directas de la conexión a la base SQLite).
    - Línea 557: `${sess.expensiveReason}` (cadena generada por el analizador de sesiones costosas).
  - **Datos de calibración y proyecciones**:
    - Línea 386–387: `${proj.badgeText}` y `${proj.statusText}`.
    - Línea 472: `${status.progressText}`.

#### 5. `JSON.stringify` y Datos Serializados dentro de `<script>`
- **`JSON.stringify`**: **0** (no se utiliza en el script del dashboard).
- **Inyecciones directas dentro de código JavaScript**:
  - **Línea 1193**: `const initial = '${initialTab || ''}';` — Interpolación de valor de parámetro directamente dentro de comillas simples de JavaScript. Si el parámetro contuviera caracteres de control o comillas simples, generaría un error de sintaxis o inyección.
  - **Línea 1249**: `btn.textContent = isExact ? '${t('tokens.formatCompact')}' : '${t('tokens.formatExact')}';` — Interpolación de traducciones dentro de literales de cadena JS.

#### 6. Invocación desde Tests con Mock de VS Code
1. **Vía `DashboardViewProvider` (Recomendada con mock existente)**:
   - `DashboardViewProvider` está exportada en `src/dashboard/dashboardProvider.ts:36`.
   - Se puede instanciar pasando un `mockContext` y llamar a `resolveWebviewView(mockWebviewView)` donde `mockWebviewView` expone `webview: { html: '' }`.
   - Para evaluar `buildLoadingHtml()`: se ejecuta `provider.render()`.
   - Para evaluar `buildHtml()`: se ejecuta `provider.update(snapshot, tokenSnapshot, config, historyManager, calibrationManager, contextData)`.
   - La salida generada se verifica directamente en `mockWebviewView.webview.html`.
2. **Vía función suelta**:
   - Actualmente `buildHtml()` (Línea 304) y `buildLoadingHtml()` (Línea 259) son funciones privadas a nivel de módulo.
   - Exportarlas (`export function buildHtml(...)`) permitiría testear unitariamente la generación de HTML como función pura sin necesidad de instanciar providers ni simular eventos de VS Code.

---

### Webview B: Context Auditor (`src/context/panelHtml.ts`)

Proporciona tanto el fragmento HTML incrustado en el Dashboard (`getContextTabContentHtml`) como el documento HTML independiente (`getWebviewContent`).

#### 1. Handlers Inline (`onclick=`, `onchange=`, etc.) — Total: 2
- **Línea 80**: `onclick="sendMsg('selectSession')"` — Botón '🔄 Cambiar Sesión'.
- **Línea 167**: `onclick="sendMsg('copySnapshot')"` — Botón '📋 Copiar Snapshot de Migración'.

#### 2. Atributos `style="..."` y Manipulaciones de Estilo — Total: 41
- **Estilos dinámicos calculados (semáforo, insignias, barras de contexto y composición)**:
  - **Línea 93**: `style="width: 26px; height: 26px; border-radius: 50%; background: ${lightColor}; box-shadow: 0 0 12px ${lightColor}88; flex-shrink: 0;"` — Color y resplandor del círculo del semáforo.
  - **Línea 95**: `style="font-size: 1.1em; font-weight: 700; color: ${lightColor};"` — Color del texto del semáforo.
  - **Línea 104**: `style="font-weight: 600; font-size: 0.82em; padding: 3px 10px; border-radius: 12px; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}66;"` — Colores de fondo, texto y borde de la insignia de ocupación de contexto.
  - **Línea 116**: `style="color: ${lightColor};"` — Color de los tokens frescos en la tarjeta de métricas.
  - **Línea 139**: `style="background: #58a6ff; width: ${cachePct}%;"` — Barra de porcentaje de lectura de caché.
  - **Línea 140**: `style="background: #d29922; width: ${freshPct}%;"` — Barra de porcentaje de tokens frescos.
  - **Línea 141**: `style="background: #bc8cff; width: ${thoughtsPct}%;"` — Barra de porcentaje de pensamiento/razonamiento.
  - **Línea 142**: `style="background: #3fb950; width: ${outputPct}%;"` — Barra de porcentaje de salida de texto.
  - **Línea 159**: `style="background: #238636; width: ${estUser}%;"` — Barra de composición estimada de prompt: usuario.
  - **Línea 160**: `style="background: #8957e5; width: ${estTools}%;"` — Barra de composición estimada de prompt: sistema / herramientas.
- **Estilos estáticos inline**:
  - Líneas 74, 76, 77, 78, 80, 86, 91, 92, 94, 96, 97, 102, 103, 111, 112, 113, 133, 134, 138, 144, 145 (x2), 146 (x2), 147 (x2), 148 (x2), 153, 154, 158, 166, 167 (un total de 31 atributos `style="..."` estáticos adicionales para espaciados, bordes y flexbox).
- *(Nota: No se inyectan estilos con `innerHTML` ni manipulaciones DOM en script)*.

#### 3. Bloques `<script>`, `<style>` y Recursos Locales
- **Bloques `<style>`**:
  - `getWebviewContent()`: Líneas **183–219** (37 líneas de CSS para panel autónomo: variables de color VS Code, botones, grid de métricas, tarjetas).
- **Bloques `<script>`**:
  - `getWebviewContent()`: Líneas **223–226** (4 líneas que instancian `acquireVsCodeApi()` y definen `sendMsg(command)`).
- **Recursos locales (`<link>`, `<img>`)**:
  - `<link>`: **0** (ninguno).
  - `<img>`: **0** (ninguno).

#### 4. Interpolaciones `${...}` de Datos Dinámicos y Estado de Escape
- **Función de escape presente**: **NINGUNA**.
- **Valores dinámicos interpolados**:
  - **Identificador de sesión**:
    - Línea 22, 77: `${sessionId}` y en atributo `title="${fullSessionId}"` (proveniente directamente del nombre de archivo/directorio de la base de datos de Antigravity).
  - **Nombre del modelo**:
    - Línea 33–34, 103: `${modelName}` (puede provenir de `modelDisplayName`, `data.inference?.modelId` o `modelSlug`).
  - **Bases y criterios heurísticos**:
    - Línea 98: `${data.health?.trafficLightBasis ?? 'carga relativa a tu historial'}`.
    - Línea 103: `${data.health?.badgeBasis ?? 'ocupación de la ventana del modelo'}`.

#### 5. `JSON.stringify` y Datos Serializados dentro de `<script>`
- **`JSON.stringify`**: **0** (no se utiliza).
- El bloque `<script>` es 100% estático (no interpola variables).

#### 6. Invocación desde Tests con Mock de VS Code
- Tanto `getContextTabContentHtml(data: PanelRenderData): string` (Línea 21) como `getWebviewContent(data: PanelRenderData): string` (Línea 175) son **funciones sueltas exportadas y puras**.
- No dependen del objeto `vscode` ni requieren mocks de VS Code para ser evaluadas en tests.
- Se pueden invocar directamente en cualquier suite de prueba pasando un fixture de `PanelRenderData`:
  ```typescript
  import { getContextTabContentHtml, getWebviewContent } from '../src/context/panelHtml';

  const html = getWebviewContent({
    session: { id: 'test-session-1234', path: '/test/path', mtime: 123456 },
    inference: null,
    health: null,
  });
  ```

---

## 3. Resumen Consolidado de Totales

| Categoría | Dashboard (`dashboardProvider.ts`) | Context Auditor (`panelHtml.ts`) | Total Global |
| :--- | :---: | :---: | :---: |
| **1. Handlers inline** (`onclick=`, etc.) | 9 | 2 | **11** |
| **2. Atributos `style="..."`** | 13 (3 dinámicos + 10 estáticos) | 41 (10 dinámicos + 31 estáticos) | **54** |
| **2b. Mutaciones de estilo en script** | 2 (`.style.display`) | 0 | **2** |
| **3. Bloques `<style>`** | 2 (loading + principal) | 1 (standalone) | **3** |
| **3b. Bloques `<script>`** | 1 (88 líneas) | 1 (4 líneas) | **2** |
| **3c. Recursos locales** (`<link>`, `<img>`) | 0 (SVGs son inline) | 0 | **0** |
| **4. Puntos de interpolación dinámica** | ~35 (modelos, sesiones, errores, cuotas) | ~20 (sesión, modelo, semáforo, tokens) | **~55** |
| **4b. Funciones de escape HTML activas** | 0 (¡Ninguna!) | 0 (¡Ninguna!) | **0** |
| **5. `JSON.stringify` dentro de `<script>`** | 0 | 0 | **0** |
| **5b. Inyecciones literales en `<script>`** | 3 (`initialTab`, 2x traducción) | 0 | **3** |
| **6. Funciones generadoras exportadas** | 0 (funciones privadas en provider) | 2 (`getContextTabContentHtml`, `getWebviewContent`) | **2** |

---

## 4. Conclusiones y Recomendaciones para Fase de Migración (CSP Estricta)

1. **Eliminación de Handlers Inline (`onclick`)**:
   - Sustituir los 11 `onclick` por listeners vinculados mediante `addEventListener` basados en `data-action` o `id` en el script del cliente.
2. **CSP Nonce y Bloques `<script>` / `<style>`**:
   - Generar un nonce criptográfico por renderizado (`crypto.randomBytes(16).toString('base64')`).
   - Inyectar `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">`.
   - Añadir el atributo `nonce="${nonce}"` a todos los `<style>` y `<script>`.
3. **Manejo de Estilos Dinámicos (Atributos `style="..."`)**:
   - Para barras con porcentaje dinámico (`width: X%`) y colores de semáforo (`background: Y`), definir variables CSS inline en el elemento contenedor (ej. `style="--bar-width: ${barWidth}%; --bar-color: ${barColor};"`) o transferir los anchos a CSS variables/clases semánticas para cumplir con CSP sin requerir `'unsafe-inline'`.
4. **Sanitización Obligatoria (Anti-XSS)**:
   - Crear una utilidad estricta `escapeHtml(str: string): string` para escapar caracteres peligrosos (`&`, `<`, `>`, `"`, `'`) en todos los campos interpolados provenientes de la base de datos SQLite y de la API externa (especialmente `sessionId`, `modelName`, `reason`, `label`).
5. **Invocación desde Tests**:
   - Exportar `buildHtml` y `buildLoadingHtml` (o extraer a un módulo dedicado `dashboardHtml.ts`) para permitir pruebas unitarias exhaustivas del marcado y de las políticas de seguridad sin depender de la inicialización completa de VS Code.
