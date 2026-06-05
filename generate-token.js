const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

// ─── Configuration ───────────────────────────────────────────────
const CREDENTIALS_PATH = path.resolve(__dirname, 'config', 'credentials.json');
const TOKEN_PATH = path.resolve(__dirname, 'config', 'token.json');
const REDIRECT_PORT = 3001;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// ─── Read credentials.json ──────────────────────────────────────
let credentials;
try {
  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  credentials = JSON.parse(raw);
} catch (err) {
  console.error('❌ ไม่สามารถอ่านไฟล์ config/credentials.json ได้');
  console.error('   กรุณาวางไฟล์ credentials.json จาก Google Cloud Console ไว้ที่ config/credentials.json');
  console.error('   Error:', err.message);
  process.exit(1);
}

// ─── Resolve client credentials (support both "installed" and "web" key) ──
const creds = credentials.installed || credentials.web;
if (!creds) {
  console.error('❌ credentials.json ไม่มี key "installed" หรือ "web"');
  console.error('กรุณาสร้าง OAuth Client ID ประเภท "Desktop App" ใน Google Cloud Console');
  process.exit(1);
}

const { client_id, client_secret } = creds;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

// ─── Generate Auth URL ──────────────────────────────────────────
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║        Google Drive Authentication — Janto Backup           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('  กรุณาเปิดลิงก์ด้านล่างในเบราว์เซอร์ แล้วอนุญาตสิทธิ์:');
console.log('');
console.log(`  👉  ${authUrl}`);
console.log('');
console.log('  รอรับ callback อยู่ที่ http://localhost:' + REDIRECT_PORT + ' ...');
console.log('');

// ─── Temporary HTTP Server to Receive OAuth Callback ────────────
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);

    // Only handle the callback path
    if (!parsedUrl.query.code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ ไม่พบ authorization code</h1><p>กรุณาลองใหม่อีกครั้ง</p>');
      return;
    }

    const code = parsedUrl.query.code;
    console.log('  ✅ ได้รับ authorization code แล้ว กำลังแลก token...');

    // Exchange code for tokens
    const { tokens } = await oAuth2Client.getToken(code);

    // Save token.json
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
    console.log('  ✅ บันทึก token สำเร็จที่:', TOKEN_PATH);

    // Respond to browser
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
      <head><meta charset="utf-8"><title>Authentication Successful</title></head>
      <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#f0fdf4;">
        <div style="text-align:center;">
          <h1 style="color:#16a34a;">✅ Authentication Successful!</h1>
          <p style="color:#4b5563;">Token ถูกบันทึกเรียบร้อยแล้ว คุณสามารถปิดแท็บนี้ได้</p>
        </div>
      </body>
      </html>
    `);

    // Shut down gracefully
    console.log('');
    console.log('  🎉 เสร็จสิ้น! ระบบ backup พร้อมใช้งานแล้ว');
    console.log('');
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('  ❌ เกิดข้อผิดพลาดขณะแลก token:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Error</h1><p>${err.message}</p>`);
    server.close(() => process.exit(1));
  }
});

server.listen(REDIRECT_PORT, () => {
  // Server is ready — the auth URL has already been printed above
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  ❌ Port ${REDIRECT_PORT} ถูกใช้งานอยู่แล้ว กรุณาปิดโปรแกรมที่ใช้ port นี้แล้วลองใหม่`);
  } else {
    console.error('  ❌ Server error:', err.message);
  }
  process.exit(1);
});
