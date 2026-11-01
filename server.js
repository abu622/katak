// Katak daftar: kichik server. Sahifani beradi va AI so'rovlarini Claude API'ga uzatadi.
// API kalit faqat shu serverda turadi, brauzerga hech qachon yuborilmaydi.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// .env faylini o'qish (bo'lsa). Hosting'da kalit muhit o'zgaruvchisi sifatida beriladi.
try {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* .env yo'q, muammo emas */ }

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 700;
const USER_DAILY_LIMIT = Number(process.env.USER_DAILY_LIMIT) || 30;     // bitta foydalanuvchiga kuniga
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT) || 600; // hamma uchun kuniga
const MOCK = process.env.MOCK_AI === "1";

const client = !MOCK && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
if (!MOCK && !client) {
  console.warn("Diqqat: ANTHROPIC_API_KEY topilmadi. AI ishlamaydi, daftar esa ishlaydi.");
}

/* ---------- kunlik limit (xotirada; server qayta ishga tushsa nolga tushadi) ---------- */
let usageDay = "";
let usage = new Map();
let globalCount = 0;
const tashkentDay = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
function rollDay() {
  const d = tashkentDay();
  if (d !== usageDay) { usageDay = d; usage = new Map(); globalCount = 0; }
}
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

/* ---------- AI so'rovi ---------- */
const SYSTEM = [
  "Sen universitet birinchi kurs talabasiga yordam beradigan sabrli o'qituvchisan.",
  "Faqat o'qish, fanlar va konspekt bilan bog'liq savollarga javob ber. Boshqa mavzularda muloyimlik bilan rad et va talabani mavzuga qaytar.",
  "Qoidalar:",
  "- Talabaning yozuvi rus tilida bo'lsa, ruscha javob ber. Aks holda oddiy o'zbek tilida (lotin yozuvida) javob ber.",
  "- Markdown ishlatma: #, *, ` belgilarisiz, oddiy matn yoz.",
  "- Formulani LaTeX bilan emas, oddiy matn va Unicode belgilari bilan yoz (A⁻¹, Aᵀ, ×, ∑, √, ≠). Matritsani bir qatorda yoz: [1 2; 3 4].",
  "- Qisqa va aniq bo'l, 180 so'zdan oshirma. Ro'yxat kerak bo'lsa, har bir bandni yangi qatordan '• ' bilan boshla."
].join("\n");

const TASKS = {
  explain: (hasText) => hasText
    ? "Quyidagi yozuvni yangi boshlovchiga tushuntir: avval 2-3 gapda mohiyati, keyin bitta oddiy misol. Tushunarsiz joylarini sodda so'z bilan och."
    : "Mavzuni noldan tushuntir: avval 2-3 gapda mohiyati, keyin bitta oddiy misol.",
  example: () => "Shu mavzu bo'yicha bitta yechilgan misol ber. Tuzilishi: Shart, Yechim (qadamma-qadam), Javob.",
  summary: (hasText) => hasText
    ? "Quyidagi yozuvdan qisqa konspekt tuz: 4-6 ta band, oxirida eng muhim formula yoki qoida. Yozuvda yo'q narsani qo'shma."
    : "Mavzu bo'yicha qisqa konspekt tuz: 4-6 ta band, oxirida eng muhim formula yoki qoida.",
  ask: (_h, q) => "Talabaning savoliga javob ber: " + q + "\nKerak bo'lsa, quyidagi yozuvga tayan."
};

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

function buildUserMessage(b) {
  const action = TASKS[b.action] ? b.action : null;
  if (!action) return null;
  const subject = clip(b.subject, 40) || "Matematika";
  const title = clip(b.title, 120).trim();
  const text = clip(b.text, 6000);
  const question = clip(b.question, 500).trim();
  if (action === "ask" && !question) return null;
  if (!text.trim() && !title) return null;
  const task = TASKS[action](!!text.trim(), question);
  const where = b.kind === "sel" ? "tanlangan qism" : "butun mavzu";
  return "Fan: " + subject + "." + (title ? " Mavzu: " + title + "." : "") + "\n\nVAZIFA: " + task + "\n\n" +
    (text.trim()
      ? "TALABA YOZUVI (" + where + "):\n\"\"\"\n" + text + "\n\"\"\""
      : "Talaba hali hech narsa yozmagan, faqat mavzu nomi bor.");
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 24 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleAi(req, res) {
  rollDay();
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return sendJson(res, 400, { error: "bad_request" }); }

  const userMessage = buildUserMessage(body || {});
  if (!userMessage) return sendJson(res, 400, { error: "bad_request" });
  if (!MOCK && !client) return sendJson(res, 503, { error: "ai_off" });

  const ip = clientIp(req);
  const used = usage.get(ip) || 0;
  if (globalCount >= GLOBAL_DAILY_LIMIT) return sendJson(res, 429, { error: "limit_global" });
  if (used >= USER_DAILY_LIMIT) return sendJson(res, 429, { error: "limit_user" });
  usage.set(ip, used + 1);
  globalCount += 1;
  const remaining = USER_DAILY_LIMIT - (used + 1);

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Remaining": String(remaining)
    });
  };

  if (MOCK) {
    start();
    const words = ("Bu sinov javobi. Matritsa — sonlardan tuzilgan jadval. AB ≠ BA bo'lishi mumkin, chunki ko'paytirishda qator va ustunlar tartibi muhim. " + userMessage.slice(0, 60)).split(" ");
    for (const w of words) { res.write(w + " "); await new Promise((r) => setTimeout(r, 25)); }
    return res.end();
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: userMessage }]
  });
  res.on("close", () => { if (!res.writableEnded) stream.abort(); });
  stream.on("text", (t) => { start(); res.write(t); });

  try {
    const final = await stream.finalMessage();
    start();
    if (final.stop_reason === "max_tokens") res.write("\u0001"); // javob qisqartirildi
    res.end();
  } catch (err) {
    if (res.writableEnded || res.destroyed) return;
    console.error("AI xatosi:", err && err.status ? err.status : "", err && err.message ? err.message : err);
    if (!started) {
      const code = err && err.status === 429 ? "upstream_busy" : "upstream_error";
      sendJson(res, 502, { error: code });
    } else {
      res.write("\u0000"); // oqim o'rtasida uzildi
      res.end();
    }
  }
}

/* ---------- statik fayllar ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"
};
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end("Taqiqlangan"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Topilmadi"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://x");
    if (pathname === "/api/ai") {
      if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); return res.end(); }
      return await handleAi(req, res);
    }
    if (pathname === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    return serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: "server" }); else res.end();
  }
});

server.listen(PORT, () => {
  console.log("Katak daftar: http://localhost:" + PORT + (MOCK ? "  (sinov rejimi, haqiqiy AI yo'q)" : "  (model: " + MODEL + ")"));
});
