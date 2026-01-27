const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

let sock;
let initialized = false;

async function initWA() {
  if (initialized) return;

  const { state, saveCreds } = await useMultiFileAuthState("auth");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true // اول ځل QR
  });

  sock.ev.on("creds.update", saveCreds);
  initialized = true;
}

module.exports = async (req, res) => {
  await initWA();

  const number = req.query.number;

  if (!number) {
    return res.json({ success: false, error: "Number required" });
  }

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ success: true, code });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};
