import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } from '@whiskeysockets/baileys'
import pn from 'awesome-phonenumber'
import pino from 'pino'
import fs from 'fs'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let { number } = req.query
  if (!number) return res.status(400).json({ error: 'number required' })

  number = number.replace(/[^0-9]/g, '')
  const phone = pn('+' + number)
  if (!phone.isValid()) {
    return res.status(400).json({ error: 'invalid phone number' })
  }

  number = phone.getNumber('e164').replace('+', '')

  const sessionDir = `/tmp/session-${number}`
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir)

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  if (!sock.authState.creds.registered) {
    await delay(2000)
    const code = await sock.requestPairingCode(number)
    return res.status(200).json({
      pairingCode: code.match(/.{1,4}/g).join('-')
    })
  }

  res.status(400).json({ error: 'already registered' })
}
