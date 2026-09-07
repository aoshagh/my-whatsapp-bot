const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let sock;
let currentQR = '';
let isConnected = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = await QRCode.toDataURL(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            isConnected = false;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentQR = '';
            console.log('WhatsApp Connected Successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// صفحه اسکن QR کد
app.get('/', (req, res) => {
    if (isConnected) {
        return res.send('<h2 style="font-family:sans-serif;color:green;text-align:center;margin-top:50px;">✅ واتساپ شما با موفقیت متصل است!</h2>');
    }
    if (currentQR) {
        return res.send(`
            <div style="font-family:sans-serif;text-align:center;margin-top:50px;">
                <h2>لطفاً با واتساپ گوشی این کد را اسکن کنید:</h2>
                <img src="${currentQR}" />
                <p>صفحه را رفرش کنید تا وضعیت به‌روز شود.</p>
            </div>
        `);
    }
    res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;">در حال ساخت کد QR... چند لحظه دیگر صفحه را رفرش کنید.</h2>');
});

// اندپوینت دریافت پیام از Make و ارسال به گروه
app.post('/send-message', async (req, res) => {
    const { groupId, message } = req.body;

    if (!isConnected) {
        return res.status(500).json({ status: 'error', message: 'WhatsApp is not connected yet.' });
    }

    if (!groupId || !message) {
        return res.status(400).json({ status: 'error', message: 'groupId and message are required.' });
    }

    try {
        const formattedGroupId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        await sock.sendMessage(formattedGroupId, { text: message });
        res.json({ status: 'success', message: 'Message sent successfully!' });
    } catch (error) {
        res.status(500).json({ status: 'error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

