import { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';
import fs from 'fs';
import pino from 'pino';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let { number } = req.query;
  if (!number) return res.status(400).json({ error: 'number required' });

  // پاکسازی نمبر او validate
  number = number.replace(/[^0-9]/g, '');
  const phone = pn('+' + number);
  if (!phone.isValid()) return res.status(400).json({ error: 'invalid phone number' });
  number = phone.getNumber('e164').replace('+', '');

  // ephemeral session folder په Vercel کې
  const sessionDir = `/tmp/session-${number}`;
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    // Create a temporary socket for pairing
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    // که نوی login وي
    if (!sock.authState.creds.registered) {
      // short delay
      await new Promise(r => setTimeout(r, 2000));

      // generate pairing code
      let code = await sock.requestPairingCode(number);
      code = code?.match(/.{1,4}/g)?.join('-') || code;

      // فوراً pairing code return کړئ
      return res.status(200).json({ pairingCode: code });
    }

    return res.status(400).json({ error: 'already registered' });
  } catch (err) {
    console.error('Error generating pairing code:', err);
    return res.status(503).json({ error: 'Failed to generate pairing code' });
  } finally {
    // ephemeral cleanup
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
  }
}
