# Control por voz 🎙️

Le hablas al bot mientras juegas; el bot ejecuta el comando. Funciona **sin GPU**
y **sin internet** (la transcripción es local con Whisper).

## Cómo funciona

```
[hablas al micro]
   → cliente Python: detecta voz (VAD) + transcribe (Whisper local)
   → manda SOLO el texto por WebSocket
   → bot (command-router.js): decide qué hacer
        • comando fijo ("ven aqui", "salta"...) → lo ejecuta directo
        • "oye bot, <frase libre>"             → se lo pasa al LLM (Claude)
```

- **Escucha continua**: no aprietas ninguna tecla. El VAD solo transcribe cuando
  detecta que hablas.
- **Comandos fijos**: se reconocen siempre, con tolerancia a errores de
  transcripción (fuzzy-match). Una conversación de fondo no los dispara porque
  no se parece a ningún comando.
- **Modo LLM**: para frases libres dices la palabra clave **"oye bot ..."**.
  Así una charla casual no se va a Claude por error.

## Comandos

| Dices | El bot |
|---|---|
| `ven aqui` | camina hacia ti |
| `sigueme` | te sigue |
| `detente` | se detiene |
| `salta` | salta |
| `craftea set de madera` | craftea herramientas de madera |
| `dame 5 oak_log` | te entrega ítems de su inventario |
| `toma el control` / `ya lo tengo yo` | activa/desactiva el modo automático |
| `oye bot, consígueme 10 piedras y aplana aquí` | el LLM interpreta y actúa |

## Instalación (una sola vez)

### 1. El bot (Node) — ya tiene todo
```bash
cd bot
npm install
```
Edita `bot/.env` y pon tu usuario de Minecraft:
```
OWNER_USERNAME=TuNombreEnMinecraft
```
> Importante para que `ven aqui` y `dame ...` sepan a quién buscar/entregar.

### 2. El cliente de voz (Python)
Python **no viene instalado** en Windows por defecto. Instálalo desde
<https://www.python.org/downloads/> (marca **"Add python.exe to PATH"** en el
instalador). Luego:

```bash
cd voice
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Uso

Arranca las tres piezas en este orden:

1. **El servidor de Minecraft** (en `mc-server/`).
2. **El bot**:
   ```bash
   cd bot
   node index.js
   ```
   Debe decir: `🎧 Servidor de voz escuchando en ws://localhost:8080`
3. **El cliente de voz**:
   ```bash
   cd voice
   .venv\Scripts\activate
   python voice_client.py
   ```
   La primera vez descarga el modelo de Whisper (unos cientos de MB). Cuando veas
   `🎤 Escuchando.` ya puedes hablar.

## Ajustes (variables de entorno del cliente)

| Variable | Default | Para qué |
|---|---|---|
| `WHISPER_MODEL` | `small` | Si va lento en tu CPU, prueba `base` (más rápido, algo menos preciso). |
| `BOT_WS_URL` | `ws://localhost:8080` | Si el bot corre en otra máquina/puerto. |
| `MIC_DEVICE` | (auto) | Índice del micro si tienes varios. Lista: `python voice_client.py --list` |

Ejemplo (PowerShell):
```powershell
$env:WHISPER_MODEL="base"; python voice_client.py
```

## Notas de rendimiento (sin GPU)

- En CPU, una frase corta tarda ~1-2 s en transcribirse con el modelo `small`.
  Como usas la palabra clave para el LLM, esa pequeña espera no estorba.
- Si quieres latencia mínima más adelante, el cliente es lo único que cambiarías
  (p. ej. a Deepgram o Whisper API). El bot no se toca: sigue recibiendo texto
  por el mismo WebSocket.
```
