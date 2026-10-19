# Protocolo de Prueba Manual — AG Pro Quota v1.3.0 (Integrada con Context Auditor)

Este documento detalla la guía paso a paso para la verificación humana e interactiva de la extensión consolidada **AG Pro Quota v1.3.0** en VS Code / Antigravity IDE.

---

## 1. Preparación del Entorno

### 1.1 Desinstalación de Versiones Previas
1. Abre VS Code / Antigravity IDE.
2. Abre la vista de Extensiones (`Ctrl + Shift + X`).
3. Busca `Context Auditor`. Si está instalada la versión previa `0.1.2`, haz clic en la rueda de configuración ⚙️ y selecciona **Uninstall** (Desinstalar).
4. Si tienes instalada una versión previa de `AG Pro Quota` (v1.2.0 o anterior), puedes sobreescribirla o desinstalarla.
5. Recarga la ventana de VS Code (`F1` -> `Developer: Reload Window`).

### 1.2 Instalación del Paquete Fusionado v1.3.0
1. Localiza el archivo empaquetado en tu espacio de trabajo:
   `c:\Users\Jeisson\Documents\AGENCIA\vs_cuota\agpro-quota-1.3.0.vsix`
2. En la vista de Extensiones (`Ctrl + Shift + X`), haz clic en el menú de tres puntos (`...`) en la esquina superior derecha del panel.
3. Selecciona **Install from VSIX...** (Instalar desde VSIX...).
4. Navega y selecciona `agpro-quota-1.3.0.vsix`.
5. Espera la notificación de éxito: *"Completed installing agpro-quota extension from VSIX"*.

---

## 2. Batería de Comprobaciones Manuales (10 Puntos)

### Comprobación 1: Barra de Estado — Preservación de Cuota
- **Qué observar**: En la esquina inferior derecha de la barra de estado de VS Code, observa el indicador de cuota de `AG Pro Quota` (prioridad 100).
- **Criterio de éxito**: Muestra el pool y porcentajes idénticos a como funcionaba en la v1.2.0 (ej. `🟢 Gemini: 93%/94% · Claude: 0%/45%`). La lógica de cuota no ha variado.

### Comprobación 2: Barra de Estado — Elemento Adyacente de Context Auditor
- **Qué observar**: Justo al lado del indicador de cuota, observa el segundo elemento de estado (prioridad 95).
- **Criterio de éxito**: Muestra el semáforo y ocupación de la sesión activa local (ej. `🟢 [NORMAL] 12.4k`). Al pasar el cursor, el tooltip despliega la tabla Markdown completa con modelo, tokens frescos, desglose de inferencia y bases de evaluación.

### Comprobación 3: Apertura de Dashboard — Pestaña [Cuota]
- **Acción**: Haz clic sobre el elemento de cuota en la barra de estado (o ejecuta `Ctrl + Shift + P` -> `AG Pro: Abrir Dashboard de Cuota`).
- **Criterio de éxito**: Se abre el Dashboard Webview y la pestaña activa por defecto es **[Cuota]**, desplegando las tarjetas de pools (Gemini y Claude), proyección de agotamiento, estimación NNLS y lista de turnos.

### Comprobación 4: Apertura de Dashboard — Pestaña [Salud de sesión y snapshot]
- **Acción**: Haz clic sobre el elemento de Context Auditor en la barra de estado (o ejecuta `Ctrl + Shift + P` -> `Context Auditor: Abrir Panel de Contexto`).
- **Criterio de éxito**: Se enfoca el Dashboard y automáticamente se activa la pestaña **[Salud de sesión y snapshot]**, mostrando el semáforo, barra de ocupación y botón de copiar snapshot.

### Comprobación 5: Alternancia Instantánea entre Pestañas y Persistencia
- **Acción**: En el Dashboard Webview, haz clic en `📊 Cuota` y luego en `🩺 Salud de sesión y snapshot`. Cierra el panel y vuelve a abrirlo con `agPro.openDashboard`.
- **Criterio de éxito**: La alternancia es fluida y sin recargas de página. Al reabrir, se preserva en `sessionStorage` la pestaña seleccionada previamente.

### Comprobación 6: Generación y Copiado de Snapshot de Migración
- **Acción**: Ejecuta `Ctrl + Shift + P` -> `Context Auditor: Copiar Snapshot de Migración` (o haz clic en el botón *"Copiar Snapshot"* dentro de la pestaña de salud).
- **Criterio de éxito**: Aparece la notificación informativa *"Context Auditor: Snapshot de migración copiado al portapapeles"*. Pega en un editor vacío (`Ctrl + V`) y verifica que contiene: metadatos de sesión, estado git (rama, commit, status), último turno y lista de archivos modificados, con rutas personales sustituidas por `~`.

### Comprobación 7: Conmutador de Aislamiento (`contextAuditor.enabled = false`)
- **Acción**: Abre Configuración (`Ctrl + ,`), busca `contextAuditor.enabled` y desmárcalo.
- **Criterio de éxito**:
  - El elemento del auditor en la barra de estado desaparece de inmediato.
  - El elemento de cuota permanece visible y actualizándose sin ninguna interrupción.
  - La extensión no arroja errores en la consola de desarrollador ni en el Output channel.

### Comprobación 8: Reactivación sin Reinicio (`contextAuditor.enabled = true`)
- **Acción**: Vuelve a marcar `contextAuditor.enabled` en Configuración.
- **Criterio de éxito**: El elemento del auditor reaparece en la barra de estado y se actualiza de inmediato con los datos de la sesión activa, sin requerir recargar la ventana.

### Comprobación 9: Prueba Multisesión y Detección de Foco
- **Acción**: Abre dos conversaciones distintas en Antigravity IDE y escribe un mensaje en la segunda. Luego, ejecuta `Context Auditor: Seleccionar Sesión Activa`.
- **Criterio de éxito**: El vigilante unificado detecta automáticamente el cambio de conversación activa por mtime/WAL. El QuickPick permite además fijar (`Pin`) una sesión concreta, mostrando la etiqueta `[Fijada]` en el panel.

### Comprobación 10: Honestidad de Rotulado de Caché
- **Acción**: En el Dashboard, pestaña **[Cuota]**, inspecciona la tarjeta de tokens de la sesión activa y la sección de Calibración NNLS.
- **Criterio de éxito**:
  - La tarjeta de métrica de caché ya no dice engañosamente `0.0%`; se rotula claramente como **`no disponible localmente`** con tooltip explicativo.
  - El título de NNLS indica **`Estimación de Pesos de Cuota (NNLS - Experimental)`**, transparentando que los pesos están sujetos a investigación empírica.
