const { goals } = require('mineflayer-pathfinder')
const { giveItem, craftWoodSet } = require('./actions')
const { runAgent } = require('./agent')

// Estado compartido del bot (modo manual/automatico). Vive aquí para que
// tanto el chat como la voz lean/escriban el mismo modo.
const estado = { modo: 'manual' }

// Comandos fijos. Cada acción canónica tiene varias formas naturales de decirla;
// el fuzzy-match compara la transcripción contra TODAS las variantes, así
// "ven acá", "ben aquí" o "acércate" activan igual la acción "ven aqui".
// (Evitamos alias de una sola palabra ambigua como "ven"/"para" para no
// disparar por error con habla normal.)
const COMANDOS = {
  'ven aqui': ['ven aqui', 'ven aca', 'ven para aca', 'ven para aqui', 'acercate'],
  'sigueme': ['sigueme', 'ven conmigo', 'acompaname'],
  'detente': ['detente', 'detente ya', 'parate', 'quieto', 'alto ahi'],
  'salta': ['salta', 'brinca'],
  'toma el control': ['toma el control', 'modo automatico', 'controla tu'],
  'ya lo tengo yo': ['ya lo tengo yo', 'modo manual', 'yo controlo'],
  'craftea set de madera': ['craftea set de madera', 'crea set de madera', 'haz herramientas de madera']
}

// Variantes aceptadas de la palabra clave que activa el modo LLM (frase libre).
const WAKE_WORDS = ['oye bot', 'oye, bot', 'hey bot', 'oye robot']

// minúsculas, sin tildes, sin signos, espacios colapsados.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^\w\s]/g, ' ')        // quita signos
    .replace(/\s+/g, ' ')
    .trim()
}

// distancia de Levenshtein clásica
function distancia(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo)
    }
  }
  return dp[m][n]
}

// Devuelve el comando fijo más parecido, o null si nada se acerca lo suficiente.
// La tolerancia es proporcional a la longitud del comando: una frase libre y
// larga queda lejos de todo → null → la maneja el LLM.
function matchComando(texto) {
  const t = normalizar(texto)
  if (!t) return null

  let mejorCanonico = null
  let mejorVariante = null
  let mejorD = Infinity
  for (const [canonico, variantes] of Object.entries(COMANDOS)) {
    for (const v of variantes) {
      const d = distancia(normalizar(v), t)
      if (d < mejorD) { mejorD = d; mejorCanonico = canonico; mejorVariante = v }
    }
  }

  // Tolerancia proporcional a la longitud de la VARIANTE que más se acercó.
  const tolerancia = Math.max(2, Math.floor(normalizar(mejorVariante).length * 0.25))
  return mejorD <= tolerancia ? mejorCanonico : null
}

// Si el texto empieza con la palabra clave, devuelve el RESTO (la instrucción
// para el LLM). Si no hay wake word, devuelve null. Tolera pequeños errores de
// transcripción en las primeras dos palabras.
function extraerWakeWord(texto) {
  const lower = texto.trim().toLowerCase()
  for (const w of WAKE_WORDS) {
    if (lower.startsWith(w)) {
      return texto.trim().slice(w.length).replace(/^[\s,]+/, '').trim()
    }
  }
  // Tolerancia difusa: ¿las primeras dos palabras suenan a "oye bot"?
  const palabras = texto.trim().split(/\s+/)
  const primeras = normalizar(palabras.slice(0, 2).join(' '))
  if (primeras && distancia(primeras, 'oye bot') <= 2) {
    return palabras.slice(2).join(' ').replace(/^[\s,]+/, '').trim()
  }
  return null
}

// Punto de entrada único: el chat de Minecraft Y la voz llaman aquí.
function handleCommand(bot, rawText, username) {
  let texto = (rawText || '').trim()
  if (!texto) return

  // 1) ¿Trae palabra clave? Entonces el resto va al LLM aunque estemos en manual.
  let forzarLLM = false
  const sinWake = extraerWakeWord(texto)
  if (sinWake !== null) {
    if (!sinWake) { bot.chat('¿Sí? Dime qué necesitas.'); return }
    texto = sinWake
    forzarLLM = true
  }

  const player = bot.players[username]
  const target = player?.entity

  // 2) Comandos fijos (siempre disponibles, con o sin wake word).
  const comando = matchComando(texto)
  switch (comando) {
    case 'ven aqui': {
      if (!target) { console.log(`⚠️ No veo a ${username}`); bot.chat('No te veo, ¿dónde estás?'); return }
      const { x, y, z } = target.position
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1))
      console.log(`🚶 Moviéndome hacia ${username}`)
      return
    }
    case 'sigueme': {
      if (!target) { console.log(`⚠️ No veo a ${username}`); bot.chat('No te veo, ¿dónde estás?'); return }
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true)
      console.log(`🚶 Siguiendo a ${username}`)
      return
    }
    case 'detente': {
      bot.pathfinder.setGoal(null)
      console.log('🛑 Detenido')
      return
    }
    case 'salta': {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 250)
      console.log('⬆️ Saltando')
      return
    }
    case 'toma el control': {
      estado.modo = 'automatico'
      bot.chat('Modo automático activado.')
      console.log('🤖 Cambié a modo automático')
      return
    }
    case 'ya lo tengo yo': {
      estado.modo = 'manual'
      bot.pathfinder.setGoal(null)
      bot.chat('Modo manual. Tú tienes el control.')
      console.log('🎮 Cambié a modo manual')
      return
    }
    case 'craftea set de madera': {
      craftWoodSet(bot)
      return
    }
  }

  // 3) "dame X item" — cantidad e ítem variables. Se evalúa sobre el texto en
  // minúsculas (sin normalizar) para preservar nombres tipo oak_log.
  const giveMatch = texto.toLowerCase().match(/dame (\d+) (\S+)/)
  if (giveMatch) {
    giveItem(bot, giveMatch[2], parseInt(giveMatch[1], 10), username)
    return
  }

  // 4) Frase libre → LLM, si hubo wake word o estamos en modo automático.
  if (forzarLLM || estado.modo === 'automatico') {
    bot.chat(`Pensando en: "${texto}"...`)
    runAgent(bot, texto, username)
  } else {
    console.log(`💤 Ignorado (modo manual, sin "oye bot"): "${texto}"`)
  }
}

module.exports = { handleCommand, estado }
