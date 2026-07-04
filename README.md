# 🧭 AI Usage Advisor — asesor de modelo para Claude Code

> **¿Estás usando Opus para preguntar qué es un closure? ¿O Haiku para rediseñar tu arquitectura?**
> Esta app te lo dice **antes** de que gastes el turno.

**AI Usage Advisor** es una aplicación **100 % local para Windows** que observa en tiempo real tus sesiones de [Claude Code](https://claude.com/claude-code) y te recomienda, prompt a prompt, **qué modelo de Claude usar** (Haiku 4.5 · Sonnet 5 · Opus 4.8 · Fable 5) y **con qué nivel de esfuerzo** (low / medium / high / xhigh), buscando el mejor equilibrio entre **calidad, coste y velocidad**.

## ¿Por qué existe?

Las suscripciones de Claude tienen cuotas (5 horas y semanal), y cada modelo tiene un coste muy distinto. Usar siempre el modelo grande agota la cuota; usar siempre el pequeño da peores resultados en tareas difíciles. Elegir bien a mano exige experiencia y atención constante.

Este asesor automatiza esa decisión:

- 📉 **Ahorra cuota**: detecta tareas triviales y te sugiere bajar a Haiku o Sonnet.
- 📈 **Evita frustración**: detecta tareas frontera (arquitectura, refactors masivos, debugging duro) y te sugiere subir a Opus o Fable **antes** de que el modelo pequeño falle.
- ⚠️ **Reacciona al contexto**: si llevas 3 fallos de herramienta seguidos sube capacidad; si tu cuota está al 95 % baja dos niveles; si el contexto pasa del 75 % te sugiere `/compact`.

## Cómo funciona (en 30 segundos)

```
Claude Code escribe transcripts (.jsonl)          [solo lectura, nunca se tocan]
        │
        ▼
1. Watcher    → detecta sesiones vivas y lee cada prompt nuevo en tiempo real
2. Señales    → extrae tipo de tarea, complejidad, nº de ficheros, densidad de
                código, errores recientes, % de contexto y cuotas
3. Capa 1     → rúbrica instantánea (léxico ES/EN + matriz tarea×complejidad)
                → modelo + esfuerzo + confianza + razones en español
4. Capa 2     → si la confianza es baja, consulta a Haiku vía `claude -p`
   (opcional)   (usa tu suscripción, SIN API key; con caché, límite de
                llamadas/min y circuit breaker: si falla, la capa 1 sigue sola)
5. Salidas    → dashboard web · widget flotante · toasts de Windows ·
                sufijo 💡 en el statusline · consejo en la conversación (hook)
```

Ejemplo real de lo que ves al enviar un prompt:

> 💡 **Sonnet 5 / medium** (confianza 75 %) — tarea detectada: Codificación cotidiana · 3 ficheros implicados

## Instalación

Requisitos: **Windows 10/11**, **Node.js 20+** y **Claude Code** instalado.

```powershell
git clone https://github.com/Parrilla38/ai-usage-advisor.git
cd ai-usage-advisor
npm install
npm start          # daemon + dashboard en http://localhost:4977
npm run widget     # widget flotante siempre visible (también desde el dashboard)
```

Nada más. Abre una sesión de Claude Code y el dashboard empezará a mostrar recomendaciones en vivo.

## Las cuatro formas de recibir el consejo

| Salida | Qué hace | Instalación |
|---|---|---|
| **Dashboard** | Feed en vivo de cada prompt con recomendación, razones, confianza y feedback 👍/👎 | Ninguna (`npm start`) |
| **Widget flotante** | Badge siempre visible con modelo + esfuerzo; se pone rojo si el modelo en uso difiere. Incluye caja **"Probar"** para analizar un prompt ANTES de enviarlo (cambias con `/model` sin gastar el turno) | `npm run widget` |
| **Statusline** | Añade el sufijo 💡 a tu statusline actual de Claude Code (el tuyo se conserva y se sigue mostrando) | Un clic en dashboard → Integraciones |
| **Toast de Windows** | Notificación solo cuando el modelo que usas difiere del recomendado (con cooldown para no molestar) | Activado por defecto |
| **Hook en conversación** *(opt-in)* | Claude recibe el consejo como contexto al enviar tu prompt y te lo menciona. Presupuesto de 250 ms; si el daemon está apagado no interfiere en nada | Un clic en dashboard → Integraciones |

Cada integración hace **copia de seguridad automática** de tu `settings.json` en `%LOCALAPPDATA%\ai-usage-advisor\backups\` y se desinstala con un clic.

CLI equivalente: `node src/integrations/installer.js <statusline|hook|autostart> <instalar|desinstalar|estado>`

## ¿En qué se basa la recomendación?

### Capa 1 — Léxico puntuado + rúbrica (instantánea, siempre activa)

Cada prompt se puntúa contra ~35 reglas léxicas ES/EN con **pesos por especificidad** (3 = inequívoco como «race condition», 0.5 = verbo vago como «mejora»). Cada tipo de tarea acumula los puntos de todas sus reglas que casen; **gana el que más suma** y los empates se resuelven a favor del grupo más capaz (quedarse corto cuesta más que pasarse). Son 17 tipos agrupados así:

| Grupo | Tareas típicas | Modelo | Esfuerzo |
|---|---|---|---|
| **Trivial** | Preguntas rápidas, formateo, comandos, docs cortas | Haiku 4.5 | — |
| **Estándar** | Edición puntual, codificación cotidiana, bugs, rendimiento, análisis de datos | Sonnet 5 | low–high |
| **Complejo** | Debugging duro, seguridad/vulnerabilidades, refactor multi-fichero, revisiones grandes | Opus 4.8 | xhigh |
| **Frontera** | Arquitectura, planificación, refactor masivo, specs ambiguas | Fable 5 | xhigh |

La puntuación también calibra la **confianza**: varias señales independientes que coinciden la suben; señales mixtas que apuntan a modelos distintos («explica el error»: ¿pregunta o bug?) la bajan y se declara en las razones.

Además hay **memoria de sesión** con contexto conversacional: si Claude propone algo («¿quieres que haga una auditoría de seguridad?») y respondes «implementa» o «sí, hazlo», el asesor puntúa la **última respuesta del asistente** para saber QUÉ vas a implementar y recomienda modelo para esa tarea (auditoría → Opus/xhigh), no para las dos palabras del prompt. Una continuación («continúa») hereda el tipo de tarea del turno anterior en vez de caer en "pregunta rápida", y dos peticiones de arreglo seguidas escalan la capacidad (si el primer intento no bastó, el problema es más duro de lo que parece).

Después aplica **modificadores** en orden: racha de fallos de herramientas ⇒ sube capacidad · cuota alta ⇒ baja a modelo más económico (salvo tareas frontera) · cuota crítica ⇒ baja dos niveles · preferencia "rápido" ⇒ tope en Sonnet · subagentes activos ⇒ nunca bajar de modelo a mitad de orquestación · modelos fuera de tu plan ⇒ nunca se recomiendan (config `modelosNoDisponibles`, admite fecha: «Fable deja de estar incluido el 7 de julio» se declara una vez y el asesor lo respeta solo). La brevedad del prompt solo abarata tareas estándar: «hay un deadlock» son tres palabras y sigue siendo trabajo para Opus.

Cada recomendación lleva su **nivel de confianza** (0.3–1.0) y la **lista de razones** que la justifican, para que decidas tú.

### Capa 2 — Clasificador IA (opcional)

Cuando la confianza de la capa 1 baja del umbral (0.75 por defecto), se consulta a **Haiku** en modo headless (`claude -p`). Reglas de fusión:

- Confianza IA ≥ 0.7 → prevalece la IA.
- 0.5–0.7 → se mantiene la capa 1 y las confianzas se promedian (con bonus si coinciden).
- < 0.5 → se descarta la IA.

Protecciones: caché de 60 min, máximo 4 llamadas/min, timeout de 20 s, se autodesactiva si tu cuota 5h supera el 70 %, y *circuit breaker* si el CLI falla. **La app funciona perfectamente sin esta capa.**

### ¿Es fiable?

Honestamente: es una **rúbrica razonada, no un oráculo**. Funciona muy bien en los extremos (una pregunta trivial o un rediseño de arquitectura se detectan con confianza ≥ 0.8) y peor en prompts ambiguos tipo «haz que funcione» (confianza ~0.5, que es justo cuando entra la capa 2). Por eso:

- La confianza se muestra **siempre**: un consejo al 50 % es una sugerencia, no una orden.
- Las razones se listan en texto plano: puedes auditar cada decisión.
- El feedback 👍/👎 del dashboard alimenta una métrica de acierto local para que evalúes si te sirve.
- Las heurísticas se validan contra **84 prompts etiquetados** (ES + EN); el test exige ≥ 90 % de acierto de modelo y la versión actual da 100 % (`npm test`, 39 tests).

### Etiquetado implícito: el asesor se examina con tu uso real

El 100 % sobre fixtures es el examen que nosotros mismos escribimos. La medida honesta sale de tu uso diario, y se captura sola:

- Si te recomienda Sonnet y cambias a Opus con `/model`, eso queda registrado como discrepancia etiquetada **por ti**, sin que hagas nada.
- Si sigues el consejo y el turno va limpio → acierto. Si sigues el consejo y el turno fracasa (3+ errores de herramienta o reenvías el mismo prompt) → posible recomendación corta.
- Caso clave: si usas un modelo **menor** que el recomendado y el turno fracasa, eso **confirma** la recomendación (`bajo_y_fallo`). No todo desacuerdo es error del asesor.

Cada turno cerrado genera una etiqueta JSONL local (`%LOCALAPPDATA%\ai-usage-advisor\history\etiquetas-*.jsonl`) con veredicto: `acierto` · `corto` · `usuario_subio` · `usuario_bajo` · `bajo_y_fallo` · `indeterminado`. El dashboard muestra la **tasa de acierto real implícita** y el desglose de veredictos en Métricas. Con unas semanas de uso, ese fichero se convierte en un dataset etiquetado con el que ajustar los pesos del léxico (o entrenar un clasificador estadístico local) contra tu forma real de trabajar, no contra nuestros ejemplos.

## Pruebas

```powershell
npm test
```

Checklist E2E manual:

1. Escribe «¿qué es un closure?» en Claude Code → el dashboard debe recomendar **Haiku**.
2. Escribe «diseña la arquitectura de X» → **Fable/xhigh** (+ toast si usas otro modelo).
3. Para el daemon (`Ctrl+C`) → tu statusline sigue funcionando como siempre (sin sufijo).
4. Con capa 2 activada y un prompt ambiguo («haz que funcione») → en el feed aparece la revisión de la IA (fuente `ia`).
5. Las llamadas del clasificador **no** aparecen como sesiones observadas.

## Privacidad y seguridad

- **Todo es local.** Nada sale de tu máquina, salvo las llamadas `claude -p` de la capa 2 opcional (que van por tu cuenta de Claude, igual que cualquier uso del CLI).
- Sobre los ficheros de Claude Code **solo se lee**. Las únicas escrituras externas son `settings.json` (vía instalador, siempre con backup) y los datos propios en `%LOCALAPPDATA%\ai-usage-advisor\`.
- El servidor web escucha solo en `localhost:4977`.
- Sin API keys, sin telemetría, sin cuentas.

## Configuración

Copia `config.default.json` a `%LOCALAPPDATA%\ai-usage-advisor\config.json` y ajusta: puerto, umbrales de cuota/contexto, cooldown de toasts, preferencia de latencia (`equilibrado`/`rapido`), y todos los parámetros de la capa 2.

`modelosNoDisponibles` declara modelos que tu plan no incluye y que el asesor jamás debe recomendar (la recomendación baja al siguiente nivel disponible). Cada entrada acepta `true` (nunca disponible) o una fecha `"YYYY-MM-DD"` (no disponible desde ese día):

```json
"modelosNoDisponibles": { "fable": "2026-07-07" }
```

## Estructura del código

```
src/
  watcher/       sesiones vivas, localización y tail de transcripts, ingesta del statusline
  signals/       parser de turnos, estado por sesión, extracción de señales
  engine/        léxico ES/EN, heurísticas (capa 1), clasificador claude -p (capa 2), fusión, consejos
  output/        current.json (contrato statusline), toasts, histórico JSONL
  server/        Express + WebSocket (dashboard y API)
  integrations/  wrapper statusline, hook UserPromptSubmit, instalador, autoarranque
public/          dashboard (vanilla JS, sin build)
test/            heurísticas (fixtures etiquetados), tailer, fusión
```

## Licencia

[MIT](LICENSE)
