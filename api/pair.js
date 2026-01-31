mport { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers } from '@whiskeysockets/baileys';
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

  // session directory
  const sessionDir = `/tmp/session-${number}`;
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

  function removeFile(dir) {
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
      defaultQueryTimeoutMs: 60000
    });

    KnightBot.ev.on('creds.update', saveCreds);

    // ✅ Wait until socket is open before requesting pairing code
    const waitForOpen = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 15000);

      KnightBot.ev.on('connection.update', update => {
        if (update.connection === 'open') {
          clearTimeout(timeout);
          resolve(true);
        }
        if (update.connection === 'close' && update.lastDisconnect?.error?.output?.statusCode === 401) {
          clearTimeout(timeout);
          reject(new Error('Logged out, need new pair code'));
        }
      });
    });

    try {
      // Wait for socket to be fully connected
      await waitForOpen;

      // Generate pairing code if not registered
      if (!KnightBot.authState.creds.registered) {
        await delay(1000); // small delay to ensure stable connection
        let code = await KnightBot.requestPairingCode(number);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        // send pairing code to client
        if (!res.headersSent) return res.status(200).json({ pairingCode: code });
      }

      if (!res.headersSent) return res.status(400).json({ error: 'already registered' });

    } catch (err) {
      console.error('Error generating pairing code:', err);
      if (!res.headersSent) return res.status(503).json({ error: 'Failed to get pairing code. Please try again.' });
    } finally {
      // Cleanup session after request completes
      await delay(1000);
      removeFile(sessionDir);
    }
  }

  await initiateSession();
} 
