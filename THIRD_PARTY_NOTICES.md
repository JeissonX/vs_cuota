# Avisos de Terceros y Atribución de Licencias (THIRD_PARTY_NOTICES.md)

Este proyecto (`agpro-quota`) se inspiró y hace referencia a patrones de diseño y técnicas de integración exploradas en los siguientes proyectos de código abierto, ambos licenciados bajo la Licencia MIT.

---

## 1. antigravity-cockpit
- **Autor / Repositorio**: DF-Guan ([https://github.com/DF-Guan/antigravity-cockpit](https://github.com/DF-Guan/antigravity-cockpit))
- **Licencia**: MIT
- **Aportes y conceptos adoptados**:
  - Consulta de cuota por grupos y ventanas temporales a través del endpoint local `RetrieveUserQuotaSummary`.
  - Normalización de fracciones de cuota y tiempos de refresco (`resetTime`, `5h`, `weekly`).
  - Referencia de ruta de almacenamiento de bases de datos de conversaciones (`tokenScanner.js`: ubicación de bases SQLite en `%USERPROFILE%/.gemini/antigravity-ide/conversations/*.db` e inspección de tabla `steps`).

### Texto de la Licencia MIT (DF-Guan/antigravity-cockpit):
```
MIT License

Copyright (c) 2024 DF-Guan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. vscode-antigravity-cockpit
- **Autor / Repositorio**: jlcodes99 ([https://github.com/jlcodes99/vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit))
- **Licencia**: MIT
- **Aportes y conceptos adoptados**:
  - Técnica de descubrimiento en Windows mediante PowerShell con `Get-CimInstance Win32_Process` y `Get-NetTCPConnection` para identificación precisa de puertos de escucha sin parsear salidas de texto frágiles como `netstat`.
  - Concepto de triple filtro para aislar el proceso legítimo de Antigravity IDE (`--extension_server_port`, `--csrf_token`, `--app_data_dir antigravity`).
  - Consulta de metadatos de modelos a través de `GetUserStatus`.
  - Diseño modular de 6 formatos para la barra de estado.

### Texto de la Licencia MIT (jlcodes99/vscode-antigravity-cockpit):
```
MIT License

Copyright (c) 2024 jlcodes99

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
