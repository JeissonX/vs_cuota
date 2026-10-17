# Registro de Cambios (CHANGELOG)

Todas las modificaciones notables del proyecto `agpro-quota` se documentan en este archivo.

## [1.1.0] - 2026-10-17

### Añadido
- **Barra de Estado Multi-Pool y Multi-Ventana**:
  - Muestra todos los pools simultáneamente con ambas ventanas (5h y semanal): formato por defecto `Gemini 93%/94% · Claude 0%/49%`.
  - Nueva opción de configuración `agPro.statusBar.showWindows`: `"both"` (ambas ventanas) o `"binding"` (únicamente la ventana limitante).
  - Nueva opción `agPro.statusBar.pools`: permite filtrar la lista de pools a mostrar en la barra.
  - Color semafórico determinado por la ventana más restrictiva de cada pool.
  - Tooltip enriquecido que detalla ambas ventanas, hora exacta de reinicio, countdown, modelos asociados y aviso especial cuando el sprint de 5h se encuentra agotado (0%).
- **Auditoría de Tokens (Hito B e Hito C)**:
  - Inspección en modo estrictamente solo lectura (`{ readOnly: true }`) de bases de datos SQLite en `~/.gemini/antigravity-ide/conversations/*.db`.
  - Extracción de métricas numéricas por paso del modelo (`step_type = 15`): tokens de salida (output), razonamiento (thought) y entrada/contexto (prompt).
  - Cálculo de velocidad real de generación (`t/s = outputTokens / durationSeconds`) mediante timestamps Unix exactos de inicio y fin.
  - Lectura incremental eficiente de pasos nuevos (`idx > lastReadIdx`) con caché en memoria por tamaño y fecha de modificación.
  - Resumen global de tokens acumulados de todas las sesiones de la máquina.
  - Degradación elegante si `node:sqlite` no está disponible o el esquema cambia.
- **Historial de Cuota y Tendencias (Hito D)**:
  - Muestreo periódico de cuotas cada ~5 minutos almacenado en `globalState` (retención de 7 días).
  - Generador nativo de gráficos de tendencia (sparklines SVG) sin librerías externas.
- **Dashboard Webview Enriquecido**:
  - Tarjetas de cuota por pool con barras dinámicas, doble ventana, sparkline de tendencia y aviso de 5h agotado.
  - Sección de tokens de la sesión activa con métricas de entrada, salida, razonamiento, caché N/A y turnos.
  - Tabla "Tokens por petición" con orden cronológico inverso, barra de consumo proporcional y promedios.
  - Sección global con sumatoria y listado de sesiones recientes.
  - Botón para alternar instantáneamente entre formato compacto (`742.7K`) y exacto (`742,700`).
  - Menú QuickPick actualizado con métricas de la sesión activa y estados de ambas ventanas.

### Seguridad y Privacidad
- Garantía absoluta de privacidad: NUNCA se lee, selecciona, loguea ni persiste texto ni mensajes de conversaciones.
- Las consultas SQLite seleccionan exclusivamente columnas numéricas y metadatos (`idx`, `step_type`, `metadata`).
- El token CSRF se mantiene estrictamente en memoria volátil.

---

## [1.0.0] - 2026-10-17

### Añadido
- Descubrimiento dinámico del servidor de Antigravity IDE (`language_server_windows_x64.exe`) mediante PowerShell CIM y NetTCPConnection con triple filtro (nombre, parent PID, token CSRF en CommandLine).
- Cliente HTTPS local seguro contra `127.0.0.1` con agente personalizado y validación de latencia.
- Consumo y parseo de endpoints `RetrieveUserQuotaSummary` y `GetUserStatus`.
- Barra de estado inicial con 6 formatos configurables y selector semafórico.
- Notificaciones configurables anti-spam por umbrales de cuota (advertencia y crítico).
- Dashboard Webview inicial con soporte de temas claro/oscuro y selector QuickPick de respaldo.
- Comando `AG Pro: Diagnóstico de Conexión` con sanitización estricta de datos personales.
- Soporte de internacionalización bilingüe (Español / Inglés).
