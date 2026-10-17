# Suposiciones y Decisiones Técnicas Confirmadas (docs/ASSUMPTIONS.md)

Este documento registra las decisiones técnicas y validaciones de campo realizadas sobre Antigravity IDE (Fase 1).

## 1. Validación de Muestras Reales (Hito 3)
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

## 2. Decisión de Asociación Modelo-Pool en el Parser
- Si un modelo en `GetUserStatus` no tiene `quotaInfo.remainingFraction`, el parser lo asocia a su pool correspondiente de `RetrieveUserQuotaSummary`:
  - Modelos cuyo label contiene `"gemini"` -> `"Gemini Models"`.
  - Modelos cuyo label contiene `"claude"`, `"gpt"`, `"sonnet"`, `"opus"` -> `"Claude and GPT models"`.
- La cuota efectiva del modelo adopta la fracción más restrictiva (el mínimo entre el bucket de 5h y el semanal) del pool correspondiente.

## 3. Seguridad
- Los archivos en `docs/samples/` tienen todos los correos, nombres de usuario e identificadores privados redactados como `"REDACTED"`.
- El token CSRF nunca se guarda en archivos ni se imprime en logs.
