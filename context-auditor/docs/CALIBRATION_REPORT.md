# Informe de Calibración y Conciliación Empírica (Hito 7)

**Fecha**: 2026-10-18  
**Ámbito**: `~/.gemini/antigravity-ide/conversations/*.db` (6 bases SQLite locales)  
**Muestras totales analizadas**: 1.174 pasos de inferencia (`step_type = 15`)  
**Privacidad (S3)**: Solo métricas agregadas; sin prompts, tokens de usuario ni rutas personales.  
**Seguridad (S1)**: Inspección 100% pasiva (`DatabaseSync` con `readOnly: true`, `busy_timeout = 3000`, `query_only = ON`).

---

## 1. Origen de los Percentiles Previos e Input Bruto vs T_frescos

### 1.1 ¿De qué variable eran los percentiles previos?
Los percentiles previos reportados en el Hito 6 ($p_{75} = 164.260$, $p_{90} = 211.770$) correspondían formalmente a la variable calculada **$T_{\text{frescos}}$** con $k_{\text{cache}} = 0.10$. Sin embargo, en las bases SQLite de Antigravity inspeccionadas, el campo `metadata.9.6` (asignado como lectura de caché) contiene un valor numérico cuasi-constante (24 para Gemini, 26 para Claude). Como resultado:
$$T_{\text{frescos}} = (Input - 24) + 0.10 \times 24 = Input - 21.6$$
Por tanto, la diferencia entre $T_{\text{frescos}}$ y el $Input$ bruto es de apenas ~22 tokens sobre magnitudes de más de 100.000 tokens (diferencia de 0.01%), siendo numéricamente casi indistinguibles.

### 1.2 Comparativa de Distribución Empírica por Familia

| Familia de Modelo | Muestras ($n$) | Variable | $p_{50}$ (Mediana) | $p_{75}$ | $p_{90}$ | $p_{95}$ | Máximo |
|---|---|---|---|---|---|---|---|
| **Gemini** (Flash) | 1.156 | **Input Bruto** | 101.537 | 164.969 | 210.967 | 233.135 | 254.936 |
| | | **$T_{\text{frescos}}$** | 101.515 | 164.947 | 210.945 | 233.113 | 254.914 |
| **Claude** (Opus) | 18 | **Input Bruto** | 117.077 | 127.390 | 137.230 | 139.625 | 144.852 |
| | | **$T_{\text{frescos}}$** | 117.054 | 127.367 | 137.207 | 139.602 | 144.829 |
| **Global (Todos)** | 1.174 | **Input Bruto** | 101.754 | 163.370 | 210.737 | 232.642 | 254.936 |
| | | **$T_{\text{frescos}}$** | 101.732 | 163.348 | 210.715 | 232.620 | 254.914 |

---

## 2. Determinación de Familia de Modelo y Pasos > 200.000

### 2.1 Campo y Método de Detección
1. **Identificador Primario por Paso**: En la tabla `steps`, columna `metadata` (BLOB Protobuf), el submensaje de tokens (campo 9) expone en su campo wire-0 `9.1` el identificador numérico de modelo:
   - `1318` $\rightarrow$ Gemini Flash (`gemini-3.8-flash-n`)
   - `1026` $\rightarrow$ Claude Opus (`claude-opus-4-6-thinking`)
2. **Catálogo de Referencia en Base de Datos**: En la tabla `gen_metadata`, el campo `data` contiene submensajes estructurados donde:
   - `data.1.3` almacena el ID numérico (`1318`, `1026`).
   - `data.1.19` almacena el slug canónico (`gemini-3.8-flash-n`, `claude-opus-4-6-thinking`).
   - `data.1.20` almacena banderas como `used_claude` (`true`/`false`).
   - `data.1.21` almacena el nombre legible (`Gemini 3.8 Flash (High)`, `Claude Opus 4.6 (Thinking)`).
3. **Firma de Request**: En `steps.metadata.9.11`, los identificadores de petición de Claude inician consistentemente con el prefijo `req_vrtx_` (Claude en Google Cloud Vertex AI), mientras que Gemini utiliza cadenas base64.
4. **Pasos Desconocidos**: Con este método, **0 pasos (0.0%)** quedan como "desconocidos" en los 1.174 pasos analizados.

### 2.2 Verificación de Pasos con Input > 200.000
- **Total de pasos con Input > 200.000**: **142 pasos** (12.10% del total global).
- **Familia a la que pertenecen**: El **100% (142 de 142)** pertenece a la familia **GEMINI** (`gemini-3.8-flash-n`).
- **Análisis de Capacidad**: Gemini 3.8 Flash posee una ventana de contexto de 1.000.000 de tokens. Un Input de 211.000 tokens representa solo el **21.1%** de su ventana (estado NORMAL, sin insignia).
- En contraste, la familia **Claude** (ventana de 200.000 tokens) tiene un máximo observado de **144.852 tokens**, sin registrar ningún paso que supere su límite de 200.000 tokens.

---

## 3. Clasificación Bajo Umbrales Provisionales Vigentes

Evaluación con $k_{\text{cache}} = 0.10$:
- **Gemini**: $\Theta_{\text{amarillo}} = 50.000$, $\Theta_{\text{rojo}} = 120.000$, Ventana $= 1.000.000$.
- **Claude**: $\Theta_{\text{amarillo}} = 20.000$, $\Theta_{\text{rojo}} = 45.000$, Ventana $= 200.000$.
- **Fallback Desconocido**: Se asigna a **Claude** ($\Theta_{\text{amarillo}} = 20.000$, $\Theta_{\text{rojo}} = 45.000$, Ventana $= 200.000$) por especificación conservadora.

| Familia de Modelo | Muestras ($n$) | Semáforo: VERDE | Semáforo: AMARILLO | Semáforo: ROJO | Insignia: Sin insignia | Insignia: Denso (>25%) | Insignia: Crítico (>50%) |
|---|---|---|---|---|---|---|---|
| **Gemini** | 1.156 | 237 (20.5%) | 428 (37.0%) | 491 (42.5%) | 1.147 (99.2%) | 9 (0.8%) | 0 (0.0%) |
| **Claude** | 18 | 1 (5.6%) | 4 (22.2%) | 13 (72.2%) | 5 (27.8%) | 2 (11.1%) | 11 (61.1%) |
| **Desconocido (fallback)** | 0 | — | — | — | — | — | — |
| **Total Global** | 1.174 | 238 (20.3%) | 432 (36.8%) | 504 (42.9%) | 1.152 (98.1%) | 11 (0.9%) | 11 (0.9%) |

---

## 4. Diagnóstico del Ajuste NNLS de $k_{\text{cache}}$

### 4.1 Evaluación Matemática
Para calibrar $k_{\text{cache}} = b / a$ mediante mínimos cuadrados no negativos (NNLS), se requiere estimar el peso del input fresco ($a$) y el peso del caché ($b$) frente a un objetivo de consumo ($\Delta \%$ de cuota o latencia).
- **Datos de Cuota**: Las bases locales SQLite `~/.gemini/antigravity-ide/conversations/*.db` **no contienen** la serie temporal de caídas de cuota ($\Delta \%$ de cuota), dato gestionado externamente por el backend de cuotas de Antigravity.
- **Varianza de Caché**: El campo interpretado como `cacheRead` (`metadata.9.6`) es un valor fijo de 24 (Gemini) o 26 (Claude) tokens, careciendo de la variabilidad estocástica requerida para resolver un sistema lineal.
- **Ajuste NNLS con Latencia**:
  - Gemini ($n=1.156$): $a = 0.0151$, $b = 92.427$, $k = 6.124$ (degenerado por falta de varianza en $b$), $R^2 = 0.530 < 0.60$.
  - Claude ($n=18$): $n < 30$, insuficiente para inferencia estadística.
- **Resultado de `isTrustworthy`**: **FALLA**.
  - Condición $n \ge 30$: Pasó para Gemini, falló para Claude ($n=18$).
  - Condición $R^2 \ge 0.60$: Falló para Gemini ($R^2 = 0.530$).
  - Condición $a > 0$: Pasó.
- **Conclusión**: **No hay datos empíricos suficientes ni válidos** en SQLite para reemplazar $k_{\text{cache}}$. Debe conservarse el valor de referencia $k_{\text{cache}} = 0.10$.

---

## 5. Análisis de Coeficientes de Latencia $\alpha$ y $\beta$

### 5.1 Estimación por Familia
Ajuste multivariante $\text{Latencia} \approx \alpha \cdot \text{Output} + \beta \cdot \text{Thoughts}$:

| Familia | Muestras ($n$) | $\alpha$ (ms/token salida) | $\beta$ (ms/token pensamiento) | Ratio $\alpha / \beta$ | $R^2$ | RMSE |
|---|---|---|---|---|---|---|
| **Gemini** | 1.156 | 6.546 ms/token | 0.087 ms/token | **75.6x** | 0.530 | 4.62 s |
| **Claude** | 18 | 13.869 ms/token | 0.164 ms/token | **84.6x** | 0.894 | 7.47 s |
| **Global** | 1.174 | 6.967 ms/token | 0.087 ms/token | **79.9x** | 0.545 | 5.14 s |

### 5.2 ¿Por qué $\beta$ es ~80 veces menor que $\alpha$?
1. **Colinealidad**: La correlación de Pearson entre tokens de salida y tokens de pensamiento es de $-0.0051$ (Gemini) y $-0.3462$ (Claude). No existe multicolinealidad patológica que explique la distorsión.
2. **Estructura Temporal de Inferencia**:
   - `start` (campo 1) marca el envío de la petición.
   - `TTFT` (campo 6) marca la recepción del primer token.
   - `end` (campos 7/8) marca el cierre de la respuesta.
   - En Gemini Flash, la mediana de TTFT es de **4.65 s**, mientras que la generación posterior (primer token a fin) tiene una mediana de solo **0.06 s**. Los tokens de pensamiento se procesan y completan masivamente en el servidor *antes* de que concluya el TTFT o se transmiten en un bloque preliminar, mientras que el output textual se emite a un ritmo constante de streaming.
3. **Ruido Externo no Modelado**: La latencia extremo a extremo incluye encolamiento de red, congestión del servidor remoto y pausas de herramientas/subagentes, generando colas pesadas de hasta 96 segundos no atribuibles a tokens.
4. **Conclusión**: $\alpha$ y $\beta$ **NO son utilizables** para deducir el tamaño de input ni inferir cuota por latencia. El error residual (RMSE ~4.6 s) es del mismo orden de magnitud que la mediana de latencia completa (4.8 s). El criterio de latencia **debe permanecer formalmente DESACTIVADO**.

---

## 6. Propuesta de Dos Juegos de Umbrales Alternativos

### Propuesta A: Anclada a Latencia
- **Condición**: El punto 5 concluyó de forma categórica que la regresión de latencia **NO es confiable** ($R^2 < 0.60$, RMSE elevado, latencia dominada por TTFT y variabilidad de red).
- **Postura Técnica**: Por regla del requerimiento (*"solo si el punto 5 resulta confiable"*), **no es técnicamente honesto aplicar un umbral anclado a latencia**. Forzarlo provocaría falsos positivos (semáforo ROJO debido a demoras de red o esperas de servidor en pasos con inputs mínimos).

### Propuesta B: Anclada a la Distribución Empírica Observada
Diseñada a partir de los percentiles empíricos observados por familia:
- **Gemini**: $\Theta_{\text{amarillo}} = 100.000$ ($p_{50}$), $\Theta_{\text{rojo}} = 180.000$ ($p_{80}$). Ventana: $1.000.000$.
- **Claude**: $\Theta_{\text{amarillo}} = 115.000$ ($p_{50}$), $\Theta_{\text{rojo}} = 130.000$ ($p_{80}$). Ventana: $200.000$.

#### Distribución resultante con Propuesta B:
- **Gemini** ($n=1.156$):
  - **VERDE**: 49.2% (569 pasos)
  - **AMARILLO**: 32.5% (376 pasos)
  - **ROJO**: 18.3% (211 pasos)
- **Claude** ($n=18$):
  - **VERDE**: 44.4% (8 pasos)
  - **AMARILLO**: 27.8% (5 pasos)
  - **ROJO**: 27.8% (5 pasos)
- **Total Global**:
  - **VERDE**: 49.1% | **AMARILLO**: 32.5% | **ROJO**: 18.4%

### Ventajas y Riesgos de Cada Enfoque

| Enfoque | Ventajas | Riesgos |
|---|---|---|
| **Vigente (Provisional)**<br>*(Gemini: 50k/120k; Claude: 20k/45k)* | • Muy conservador.<br>• Alerta tempranamente sobre crecimiento de contexto.<br>• Mantiene uniformidad con las especificaciones iniciales. | • Genera fatiga de alertas: 42.5% de pasos de Gemini caen en ROJO pese a que 120k tokens es solo el 12% de su ventana de 1M.<br>• 72.2% de pasos de Claude caen en ROJO. |
| **Propuesta A (Latencia)** | • Intenta medir la degradación perceptual del usuario en tiempo real. | • **Inviable con datos actuales**: $R^2 < 0.60$, confundiría congestión de red con sobrecarga de contexto. |
| **Propuesta B (Distribución Empírica)**<br>*(Gemini: 100k/180k; Claude: 115k/130k)* | • Refleja el flujo de trabajo real de un asistente de programación.<br>• Distribución equilibrada (~50% verde, ~32% amarillo, ~18% rojo).<br>• Reserva el estado ROJO para el 20% más pesado de las interacciones. | • Requiere recalibración si el usuario cambia drásticamente su tipo de tareas o tamaño medio de proyectos.<br>• Muestra de Claude aún reducida ($n=18$). |

---

## 7. Hito 9a — Origen de la Caché y Auditoría de Campos Numéricos

### 7.1 Localización en `agpro-quota`
En `agpro-quota`, el indicador `cacheRatioFormatted` desplegado en el panel (`src/dashboard/dashboardProvider.ts:546`) se calculaba en `src/phase2/tokenAuditor.ts:554`:
$$\text{cacheRatio} = \frac{\text{totalCache}}{\text{totalPrompt}}$$
Donde `totalCache` acumulaba el valor de `u.cacheRead` extraído por `decodeTokenUsage` (`src/phase2/protoWire.ts:121`) leyendo el campo `metadata.9.6`.

### 7.2 Comparación Empírica con `metadata.9.6`
En las 6 bases SQLite de Antigravity inspeccionadas, `metadata.9.6` vale invariablemente:
- **`24`** para Gemini Flash (ID 1318).
- **`26`** para Claude Opus (ID 1026).
Este campo no varía en función del reuso de contexto. Corresponde a un enumerado interno de modelo/estado (e.g. `MODEL_PLACEHOLDER_M24`/`M26`), no a tokens cacheados. Al dividir 24 entre prompts de 100k-250k tokens, `agpro-quota` arrojaba ratios espurios de ~0.01% - 0.02% (o 0% tras redondeo).

### 7.3 Rastreo Exhaustivo de Campos Numéricos en `metadata` y `gen_metadata`
Se escanearon recursivamente los 38 caminos numéricos existentes en los BLOBs de `metadata` a lo largo de 1.222 pasos de inferencia:
- `9.5`: Input total bruto (10.902 a 254.936 tokens; correlación 1.000).
- `9.2`: Pensamiento / Thoughts (702 a 166.321 tokens; correlación -0.050).
- `9.3`: Output total (11 a 13.139 tokens), coincidente de forma exacta con la suma de `9.9` + `9.10`.
- `1.1, 6.1, 7.1, 8.1, 26.1.2.1, 32.1`: Timestamps en segundos Unix.
- `gen_metadata`: Contiene exclusivamente banderas booleanas (`used_claude`, `enable-markdown-agents`) y configuraciones de sesión; cero métricas de tokens.
Ningún campo numérico almacena tokens leídos de caché ni correlaciona con reuso de prompt.

### 7.4 Conclusión y Propuesta para la UI
- **Conclusión**: **[NO HAY]** señal local de caché en las bases SQLite locales de Antigravity.
- **Tratamiento en la UI**: Se rotula explícitamente en el panel y en la status bar como **`Caché: no disponible localmente`**.
- **Impacto en $k_{\text{cache}}$**: Al no existir señal de caché local (0 tokens detectables), $T_{\text{frescos}} = Input$ y el parámetro $k_{\text{cache}}$ queda temporalmente sin efecto práctico sobre los datos SQLite locales.

