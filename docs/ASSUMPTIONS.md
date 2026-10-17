# Suposiciones y Decisiones Técnicas Confirmadas (docs/ASSUMPTIONS.md)

Este documento registra las decisiones técnicas, validaciones de campo y delimitación de campos comprobados sobre Antigravity IDE (v1.0.0 y v1.1.0).

---

## 1. Validación de Muestras Reales de Red Local (Hito 3 - v1.0.0)
A través de `scripts/capture_samples.ts` se consultó directamente el servidor local activo en Windows 11 (PID 22020, puerto validado 60563). Las respuestas crudas y sanitizadas se preservan en `docs/samples/`.

### Estructura Confirmada de `RetrieveUserQuotaSummary`
- `response.groups`:
  - `displayName`: `"Gemini Models"` y `"Claude and GPT models"`.
  - `description`: Especifica los modelos pertenecientes al grupo (`Gemini Flash, Gemini Pro`, etc.).
  - `buckets`:
    - `bucketId`: `"gemini-weekly"`, `"gemini-5h"`, `"3p-weekly"`, `"3p-5h"`.
    - `window`: `"weekly"` y `"5h"`.
    - `remainingFraction`: Número flotante `0.0 - 1.0` (o `0` cuando la cuota está agotada).
    - `resetTime`: Marca de tiempo ISO 8601 (`"2026-10-17T08:35:01Z"`).

### Estructura Confirmada de `GetUserStatus`
- `userStatus.cascadeModelConfigData.clientModelConfigs`:
  - `label`: Nombre legible del modelo (p. ej. `"Gemini 3.8 Flash (High)"`, `"Claude Sonnet 4.6 (Thinking)"`).
  - `modelId`: Identificador técnico (p. ej. `"gemini-3.8-flash-high"`, `"claude-sonnet-4-6"`).
  - `quotaInfo`:
    - `remainingFraction`: Puede venir presente o **ausente/undefined** si el pool está agotado o no tiene cuota directa individual.
    - `resetTime`: Marca de tiempo ISO del reseteo.
- `userStatus.planStatus`: Créditos disponibles (`availablePromptCredits`, `availableFlowCredits`).

---

## 2. Inspección Real de Bases de Conversación SQLite (Hito B - v1.1.0)
Ruta inspeccionada en vivo: `%USERPROFILE%\.gemini\antigravity-ide\conversations\*.db`
Esquema completo guardado en: `docs/samples/sqlite_schema.json`
Estructura protobuf guardada en: `docs/samples/metadata_structure.json`

### Política de Privacidad de Acceso a Datos
- Conexión a SQLite: Exclusivamente con `{ readOnly: true }` y transacciones sin bloqueo.
- **NUNCA se consulta, lee ni almacena texto de mensajes o conversaciones**.
- Solo se seleccionan campos numéricos e identificadores de pasos: `idx`, `step_type`, `metadata`.

### Tablas y Tipos de Pasos Comprobados
- Tabla `steps`:
  - `idx`: Índice secuencial del paso en la sesión.
  - `step_type = 14`: Turno de usuario.
  - `step_type = 15`: Paso de ejecución del modelo (donde residen los metadatos de tokens y tiempos).

### Campos Protobuf en `steps.metadata` (step_type = 15)

| Campo | Subcampo | Significado | Estado de Verificación |
| :--- | :---: | :--- | :---: |
| **Field 1** | 1 (seg), 2 (ns) | Timestamp de inicio del paso | ✅ **SEGURO / VERIFICADO** |
| **Field 7** | 1 (seg), 2 (ns) | Timestamp de finalización del paso | ✅ **SEGURO / VERIFICADO** |
| **Field 9** | 5 | Tokens de entrada (`promptTokens`) | ✅ **SEGURO / VERIFICADO** |
| **Field 9** | 3 | Tokens de salida (`outputTokens`) | ✅ **SEGURO / VERIFICADO** |
| **Field 9** | 2 | Tokens de razonamiento (`thoughtTokens`) | ✅ **SEGURO / VERIFICADO** |
| **Field 9** | 1 | Código identificador del modelo (`1026` = Claude Opus, `1318` = Gemini Flash) | 🟡 **HEURÍSTICA / MAPEO** |
| **N/A** | - | **Tokens leídos de caché (`cacheReadTokens`)** | ❌ **NO DISPONIBLE en Protobuf local** |
| **N/A** | - | **Nombre textual del modelo por paso** | ❌ **NO ALMACENADO en SQLite** |

### Decisiones Derivadas
1. **Duración y Velocidad Real**:
   - Al haberse verificado timestamps de inicio (`Field 1`) y fin (`Field 7`), la duración de cada paso se calcula exactamente como:  
     $$\Delta t = (t_{\text{end, s}} + t_{\text{end, ns}} \times 10^{-9}) - (t_{\text{start, s}} + t_{\text{start, ns}} \times 10^{-9})$$
   - Si $\Delta t > 0$, la velocidad real de generación de salida es:  
     $$\text{Velocidad (t/s)} = \frac{\text{outputTokens}}{\Delta t}$$
   - **Queda estrictamente prohibida la simulación de velocidad con funciones seno/coseno.**

2. **Caché de Tokens**:
   - El protobuf de `metadata` no expone ningún campo para tokens de caché ni ratio de caché.
   - En lugar de inventar estimaciones de bytes arbitrarias, se muestra formalmente `"N/A"` o `"-"` en la interfaz.

3. **Nombre del Modelo**:
   - Se mapea el código numérico de `Field 9, subcampo 1`:
     - `1318`: Gemini Flash
     - `1026`: Claude Opus / Thinking
     - Otros valores: se reporta como `"Modelo (" + code + ")"` o el nombre del modelo activo en la sesión.
