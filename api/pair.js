import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';
import pino from 'pino';
import fs from 'fs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let { number } = req.query;
  if (!number) return res.status(400).json({ error: 'number required' });

  // پاکسازی نمبر
  number = number.replace(/[^0-9]/g, '');
  const phone = pn('+' + number);
  if (!phone.isValid()) return res.status(400).json({ error: 'invalid phone number' });
  number = phone.getNumber('e164').replace('+', '');

  // session dir
  const sessionDir = `/tmp/session-${number}`;
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

  async function removeFile(dir) {
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } 
    catch (e) { console.error('Error removing session:', e); }
  }

  async function initiateSession() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const KnightBot = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
      },
      printQRInTerminal: false,
      logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
      browser: Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      maxRetries: 5
    });

    KnightBot.ev.on('creds.update', saveCreds);

    KnightBot.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, isNewLogin, isOnline } = update;

      if (connection === 'open') {
        console.log("✅ Connected successfully!");
        try {
          const sessionData = fs.readFileSync(sessionDir + '/creds.json');
          const userJid = jidNormalizedUser(number + '@s.whatsapp.net');

          // Send session file
          await KnightBot.sendMessage(userJid, { document: sessionData, mimetype: 'application/json', fileName: 'creds.json' });
          // Send video guide
          await KnightBot.sendMessage(userJid, {
            image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
            caption: `🎬 *KnightBot MD V2.0 Full Setup Guide!*\n🚀 Bug Fixes + New Commands + Fast AI Chat\n📺 https://youtu.be/NjOipI2AoMk`
          });
          // Send warning
          await KnightBot.sendMessage(userJid, {
            text: `⚠️Do not share this file with anybody⚠️\n©2025 Mr Unique Hacker`
          });

          // Cleanup
          await delay(1000);
          await removeFile(sessionDir);
          console.log("✅ Session cleaned up successfully");
        } catch (error) {
          console.error("❌ Error sending messages:", error);
          await removeFile(sessionDir);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === 401) console.log("❌ Logged out. Generate new pair code.");
        else initiateSession();
      }

      if (isNewLogin) console.log("🔐 New login via pair code");
      if (isOnline) console.log("📶 Client is online");
    });

    if (!KnightBot.authState.creds.registered) {
      await delay(3000);
      try {
        let code = await KnightBot.requestPairingCode(number);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.status(200).json({ pairingCode: code });
      } catch (err) {
        console.error('Error requesting pairing code:', err);
        return res.status(503).json({ code: 'Failed to get pairing code. Please check your number.' });
      }
    }

    return res.status(400).json({ error: 'already registered' });
  }

  await initiateSession();
}
