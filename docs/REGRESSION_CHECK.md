# Informe de Verificación de Regresiones — agpro-quota v1.3.0 vs master

**Fecha**: 2026-10-18  
**Ramas comparadas**: `master` (commit `35d0cd5`) vs `integracion-v1.3.0`  
**Objetivo**: Validar exhaustivamente la ausencia de regresiones, pérdidas de IDs, rupturas de CSP o colisiones tras la fusión del Context Auditor.

---

## 1. Comparación de `package.json` (Sección a)

| Elemento | En `master` (v1.2.0) | En `integracion-v1.3.0` (v1.3.0) | Estado / Líneas |
|---|---|---|---|
| **Identificador y Nombre** | `name: "agpro-quota"` | `name: "agpro-quota"` | Idéntico (`package.json:2`) |
| **Versión** | `1.2.0` | `1.3.0` | Incremento intencional (`package.json:5`) |
| **Activation Events** | • `onStartupFinished`<br>• `onView:agpro.dashboardView` | • `onStartupFinished`<br>• `onView:agpro.dashboardView` | Idéntico (`package.json:11-14`) |
| **View Containers** | `activitybar` con id `agpro-quota-sidebar` | `activitybar` con id `agpro-quota-sidebar` | Idéntico (`package.json:17-25`) |
| **Views** | `agpro-quota-sidebar` -> view `agpro.dashboardView` | `agpro-quota-sidebar` -> view `agpro.dashboardView` | Idéntico (`package.json:28-34`) |
| **Menus (`view/title`)** | • `agPro.openDashboard` (navigation@1)<br>• `agPro.refresh` (navigation@2) | • `agPro.openDashboard` (navigation@1)<br>• `agPro.refresh` (navigation@2) | Idéntico (`package.json:37-48`) |
| **Comandos de Cuota** | 7 comandos con prefijo `agPro.*`:<br>1. `agPro.openDashboard`<br>2. `agPro.refresh`<br>3. `agPro.quickOverview`<br>4. `agPro.diagnose`<br>5. `agPro.toggleLang`<br>6. `agPro.openSettings`<br>7. `agPro.togglePoolView` | Los 7 comandos exactos de master siguen existiendo con idéntico id, título e icono.<br>Adicionalmente se agregan 4 comandos segregados con prefijo `contextAuditor.*`:<br>8. `contextAuditor.copySnapshot`<br>9. `contextAuditor.selectSession`<br>10. `contextAuditor.openPanel`<br>11. `contextAuditor.diagnostics` | Cero comandos perdidos.<br>Cero comandos renombrados.<br>Cero colisiones (`package.json:50-106`) |
| **Claves de Configuración** | 10 propiedades bajo `title: "AG Pro Quota"`:<br>• `agPro.refreshIntervalSeconds`<br>• `agPro.statusBarFormat`<br>• `agPro.statusBar.showWindows`<br>• `agPro.statusBar.pools`<br>• `agPro.statusBar.poolView`<br>• `agPro.warningThreshold`<br>• `agPro.criticalThreshold`<br>• `agPro.language`<br>• `agPro.pinnedModels`<br>• `agPro.notificationsEnabled`<br>• `agPro.logLevel` | Se conservan las 10 propiedades con idéntico esquema y defaults bajo el esquema `"AG Pro Quota"`.<br>Se agrega un segundo esquema de configuración `"Context Auditor"` con 11 propiedades encabezadas por `contextAuditor.enabled` (default: `true`). | Cero configuraciones perdidas.<br>Cero cambios en defaults (`package.json:107-260`) |

---

## 2. Comparación de `src/extension.ts` (Sección b)

### 2.1 Registro en `activate()`
- **Comandos de Cuota**: Los 7 comandos de `master` se registran en el mismo orden mediante `vscode.commands.registerCommand(...)` (`src/extension.ts:103-241`).
- **Proveedor de Vista**: `vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewType, ...)` se registra exactamente como en master (`src/extension.ts:384-391`).
- **Status Bar de Cuota**: Se instancia `StatusBarManager` con prioridad 100 (`src/extension.ts:79`).
- **Historial y Calibración**: Se instancian en el mismo orden exacto (`src/extension.ts:80-81`).
- **Aislamiento del Auditor**:
  - `syncAuditorLifecycle(context)` inicializa condicionalmente el Context Auditor (`src/extension.ts:84`).
  - Todas las rutinas del auditor están aisladas con bloques `try/catch`. Cualquier fallo en el auditor registra advertencia/error en el OutputChannel sin interrumpir ni lanzar excepciones en el registro de cuota.
- **Suscripciones**: Todos los disposables (comandos, webview provider, observer de configuración, status bar) se añaden a `context.subscriptions`.

### 2.2 Limpieza en `deactivate()`
- Se cancela y anula `refreshTimer` (`src/extension.ts:720-723`).
- Se destruye `statusBar` (`src/extension.ts:724-725`).
- Se destruye `contextStatusBar` (`src/extension.ts:726-729`).
- Se detiene `sessionWatcher` (`src/extension.ts:730-733`).
- Se destruye `quotaWatcher` (`src/extension.ts:734-737`).
- Se resetean notificaciones y se cierra `logger` (`src/extension.ts:738-740`).

---

## 3. Comparación de `src/dashboard/dashboardProvider.ts` (Sección c)

- **Contenedor de Cuota**: El HTML completo generado para la cuota (tarjetas por pool, modelos, barras de progreso, alertas de agotamiento, sparklines SVG, sección de calibración NNLS, métricas de sesión y listado global) se mantiene idéntico a master, alojado íntegramente dentro de `<div id="tabContentQuota" class="main-tab-content">` (`src/dashboard/dashboardProvider.ts:1123-1158`).
- **Manejo de Mensajes**:
  - Se mantienen todos los mensajes de master: `refresh`, `openSettings`, `openDashboard`, `openFullDashboard` (`src/dashboard/dashboardProvider.ts:70-78, 185-195`).
  - Se añadieron los mensajes propios del auditor: `copySnapshot` y `selectSession`.
- **Scripts Inline y CSP**:
  - Los scripts de filtrado de pool (`setPoolFilter`, `initFilter`) y alternancia de formato (`toggleFormat`) son idénticos a master.
  - La función `switchMainTab(tab)` gestiona la visibilidad entre pestañas puramente mediante clases CSS (`is-hidden`) y persistencia en `sessionStorage` con captura de excepciones.
  - No se añadieron orígenes externos ni políticas CSP conflictivas. No hay scripts remotos ni estilos externos; 100% nativo VS Code.
- **Escapado de Textos**: Todos los textos dinámicos (`sessionId`, etiquetas, etc.) se mantienen sanitizados y escapados.

---

## 4. Estado Compartido y Conmutación en Caliente (Sección d)

- **Estado Compartido**:
  - `lastSnapshot` (cuota) y `lastTokenSnapshot` (auditoría de tokens de cuota) son de solo escritura para el bucle de cuota (`triggerRefresh`). El Context Auditor no los sobrescribe.
  - `latestContextData` almacena la evaluación del auditor y es consumido de forma opcional por el Dashboard; si es `null`, la pestaña de cuota no se afecta y la pestaña del auditor muestra un mensaje de espera.
- **Desactivación en Caliente (`contextAuditor.enabled = false`)**:
  - `syncAuditorLifecycle(context)` detecta el cambio de configuración en `onDidChangeConfiguration` (`src/extension.ts:421-424, 439-506`).
  - Si pasa a `false`:
    1. Se detiene y anula `sessionWatcher` liberando el `fs.watch` del auditor.
    2. Se destruye y anula `contextStatusBar`.
    3. Se activa `quotaWatcher` (`startConversationWatcher`) para mantener la actualización automática de cuota tal como operaba en master.
    4. Se limpian los datos de contexto en el Dashboard.
  - Si pasa a `true`:
    1. Se libera `quotaWatcher`.
    2. Se inicializa y arranca `sessionWatcher` (vigilante unificado).
    3. Se crea y actualiza `contextStatusBar`.
    4. Se refresca el auditor de inmediato.

---

## 5. Conclusión de Regresiones
- **IDs perdidos**: 0
- **IDs duplicados o colisionados**: 0
- **Funcionalidades de cuota afectadas**: 0
- **Resultado de activación**: Validado mediante `test/activation.test.ts` con 4 suites exhaustivas cubriendo registro, conmutador en falso, tolerancia a fallos y liberación de recursos.
