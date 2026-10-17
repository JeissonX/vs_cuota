# Plan de Arquitectura Aprobado — AG Pro Quota (`agpro-quota`)

## 1. Decisiones Generales
- **Nombre de la extensión (ID)**: `agpro-quota`
- **Nombre para mostrar**: AG Pro Quota — Antigravity Model Quota Monitor
- **Prefijo de configuración**: `agPro.*`
- **Alcance**: **Solo Fase 1**. (Fases 2 y 3 no se implementan).
- **Entorno de ejecución**: Windows 11 (Antigravity IDE - fork de VS Code).

---

## 2. Análisis de Repositorios de Referencia

### Repo 1: DF-Guan (`antigravity-cockpit`)
- **Detección de Proceso**: Búsqueda por `CommandLine` que contenga `csrf_token` vía `Get-CimInstance Win32_Process`.
- **Detección de Puerto**: `netstat -ano` filtrando por `LISTENING` y PID.
- **Endpoints**:
  - POST `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` con `{ forceRefresh: true }` (obtiene pools y buckets weekly/5h).
  - POST `/exa.language_server_pb.LanguageServerService/GetUserStatus` con `{}` (modelos disponibles).
- **Autenticación**: Headers `x-codeium-csrf-token` y `X-CSRF-Token`.

### Repo 2: jlcodes99 (`vscode-antigravity-cockpit`)
- **Detección de Proceso**: Nombre `language_server_windows_x64.exe` con triple filtro (`--extension_server_port`, `--csrf_token`, `--app_data_dir antigravity`).
- **Detección de Puerto**: `Get-NetTCPConnection -State Listen -OwningProcess <PID>`.
- **Validación de Conexión**: Ping al endpoint local.
- **Barra de Estado**: Un único elemento configurable con 6 formatos (`icon`, `dot`, `percent`, `compact`, `namePercent`, `standard`).

### Decisiones de Diseño Adoptadas
1. **Lenguaje y Tipado**: TypeScript en modo estricto (`strict: true`).
2. **Descubrimiento en Windows**: `Get-CimInstance` con triple filtro + `Get-NetTCPConnection` para máxima precisión y velocidad.
3. **Endpoints**:
   - `RetrieveUserQuotaSummary` como primario (devuelve buckets de cuota).
   - `GetUserStatus` como enriquecimiento (labels y metadatos de modelos).
4. **Seguridad del Token**: Token CSRF estrictamente en memoria; nunca se escribe en disco, estado persistente ni logs.
5. **Barra de Estado**: 1 elemento en la barra de estado con 6 modos seleccionables y colores por umbral.
6. **Dashboard**: Webview con diseño adaptado a las variables CSS de tema de VS Code, con fallback a QuickPick.
7. **Ciclo de Refresco**: Un único timer centralizado (`setInterval`) con intervalo mínimo de 5 segundos.

---

## 3. Estructura del Proyecto (Fase 1)

```
vs_cuota/
├── src/
│   ├── extension.ts              # Punto de entrada, ciclo de vida
│   ├── discovery.ts              # Descubrimiento de proceso, puerto y token
│   ├── quotaClient.ts            # Cliente HTTP, timeout, reintentos y backoff
│   ├── quotaParser.ts            # Parser de respuestas reales (docs/samples/)
│   ├── statusBar.ts              # Barra de estado con 6 formatos y colores
│   ├── notifications.ts          # Sistema de alertas por umbrales sin repetición
│   ├── dashboard/
│   │   └── dashboardProvider.ts  # Webview con tarjetas por pool y soporte de temas
│   ├── quickPick.ts              # Respaldo interactivo vía QuickPick
│   ├── config.ts                 # Lectura y validación de agPro.*
│   ├── i18n/
│   │   ├── index.ts              # Motor de traducción
│   │   ├── es.ts                 # Textos en español
│   │   └── en.ts                 # Textos en inglés
│   ├── logger.ts                 # OutputChannel con soporte de nivel debug
│   └── types.ts                  # Interfaces y tipos TypeScript
├── test/
│   ├── quotaParser.test.ts       # Pruebas con muestras reales
│   └── thresholds.test.ts        # Pruebas de cálculo de umbrales
├── docs/
│   ├── PLAN.md                   # Plan aprobado (este archivo)
│   └── samples/                  # Muestras crudas de respuestas (REDACTED)
├── PROGRESS.md                   # Seguimiento de hitos
├── package.json                  # Manifiesto y scripts
├── tsconfig.json                 # Configuración de TypeScript estricto
├── esbuild.config.mjs            # Bundler de alto rendimiento
├── .eslintrc.json                # Reglas de linter
├── .prettierrc                   # Reglas de formato
└── README.md                     # Documentación en español
```

---

## 4. Endpoints y Autenticación

### Protocolo Local
- **URL Base**: `https://127.0.0.1:<PORT>`
- **Headers Obligatorios**:
  - `Content-Type: application/json`
  - `X-Codeium-Csrf-Token: <TOKEN>`
  - `Connect-Protocol-Version: 1`
- **Certificado SSL**: Conexión local auto-firmada (`rejectUnauthorized: false`).

---

## 5. Suposiciones Declaradas
1. **Suposición 1**: La estructura de `RetrieveUserQuotaSummary` contiene `.response.groups` con `buckets`. Se confirmará formalmente en el Hito 2 guardando la respuesta cruda en `docs/samples/`.
2. **Suposición 2**: El nombre del ejecutable en Windows 11 es `language_server_windows_x64.exe` o contiene la bandera `--app_data_dir antigravity`. Si se renombra, la heurística busca `--csrf_token` como fallback.
