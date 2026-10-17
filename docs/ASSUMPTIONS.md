# Suposiciones y Decisiones Conservadoras (docs/ASSUMPTIONS.md)

Este documento registra todas las suposiciones técnicas adoptadas durante la implementación de `agpro-quota` (Fase 1), priorizando siempre la estabilidad y la privacidad.

## Suposiciones Iniciales
1. **Entorno del Language Server**:
   - En Windows, el proceso del servidor local de Antigravity IDE corresponde a `language_server_windows_x64.exe` y contiene en su línea de comandos `--csrf_token` y `--app_data_dir antigravity`.
   - Si no se encuentra con el nombre exacto de ejecutable, se busca cualquier proceso con `--csrf_token` y `--app_data_dir antigravity` como fallback seguro.

2. **Seguridad y Token CSRF**:
   - El token CSRF se mantiene **estrictamente en memoria volátil**.
   - No se escribe en `globalState`, `workspaceState`, archivos temporales, logs ni mensajes de error.
   - Las conexiones HTTP locales van exclusivamente a `https://127.0.0.1:<PORT>`.
   - Se usa `rejectUnauthorized: false` únicamente para la conexión loopback contra el certificado TLS autofirmado del servidor de Antigravity.

3. **Endpoints y Muestras**:
   - `RetrieveUserQuotaSummary` con `{ forceRefresh: true }` es la fuente principal para cuotas por buckets/pools.
   - `GetUserStatus` con `{}` es la fuente secundaria para enriquecimiento de nombres y estados de modelos.
   - En el Hito 3 se obtendrán las muestras reales ejecutando la consulta en vivo en la máquina para verificar y adaptar los campos definitivos.
