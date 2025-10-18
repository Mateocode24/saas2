// server.js — version complète (Tracking + Email Verification)
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm i node-fetch@2
const dns = require("dns");
const nodemailer = require("nodemailer");

const app = express();

// ------------------- CONFIG -------------------
app.use(cors({ origin: true }));
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ------------------- TON WEBHOOK MAKE -------------------
const MAKE_WEBHOOK = "https://hook.eu2.make.com/81dm95qt94xxuqail07pir4iiofrmi3b"; // ton lien Make relié à Google Sheets

// ------------------- 1️⃣ TRACKING -------------------
app.post("/track", async (req, res) => {
  try {
    const payload = req.body || {};
    await fetch(MAKE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("→ Données envoyées à Make:", payload);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur track:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ------------------- 2️⃣ EMAIL VERIFICATION & GRADING -------------------
async function checkMX(domain) {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) resolve(false);
      else resolve(true);
    });
  });
}

async function checkSMTP(email) {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

function getGrade(title, isValid) {
  const t = title?.toLowerCase() || "";
  let score = 0;
  if (t.includes("ceo") || t.includes("founder")) score = 100;
  else if (t.includes("head") || t.includes("director")) score = 80;
  else if (t.includes("manager")) score = 60;
  else score = 40;
  if (isValid) score += 10;
  return Math.min(score, 100);
}

app.post("/verify", async (req, res) => {
  try {
    const { people = [], org } = req.body;
    if (!people.length) return res.status(400).json({ error: "No people provided" });

    const graded = [];
    for (const person of people) {
      const email = person.email;
      if (!email) continue;
      const domain = email.split("@")[1];
      const mxValid = await checkMX(domain);
      const smtpValid = await checkSMTP(email);
      const isValid = mxValid && smtpValid;
      const grade = getGrade(person.title || "", isValid);
      graded.push({ ...person, grade, valid: isValid });
    }

    graded.sort((a, b) => b.grade - a.grade);
    const best = graded[0];

    res.json({
      best_email: best?.email || null,
      role: best?.title || null,
      grade: best?.grade || 0,
      org: org || null
    });
  } catch (err) {
    console.error("Erreur verify:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- 3️⃣ SNIPPET CLIENT -------------------
app.get("/script.js", (req, res) => {
  const siteId = req.query.site || "default-site";
  res.type("application/javascript").send(`
  (function () {
    var ORIGIN = new URL(document.currentScript.src).origin;
    var ENDPOINT = ORIGIN + "/track";
    var SITE_ID = (new URL(document.currentScript.src)).searchParams.get("site") || "${siteId}";
    function uid(){return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
    function sendPageview(){
      try{
        fetch("https://api.ipify.org?format=json").then(r=>r.json()).then(data=>{
          fetch(ENDPOINT, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              site_id: SITE_ID,
              visitor_ip: data.ip,
              events: [{
                id: uid(),
                t: Date.now(),
                type: "pageview",
                ctx: {url: location.href, path: location.pathname, ua: navigator.userAgent}
              }]
            })
          }).catch(()=>{});
          console.log("Pageview envoyée à /track avec IP:", data.ip);
        });
      }catch(e){}
    }
    if (document.readyState === "complete") sendPageview();
    else addEventListener("load", sendPageview);
  })();
  `);
});

// ------------------- 4️⃣ TEST -------------------
app.get("/", (req, res) => res.send("✅ Tracker + Vérification Email prêt sur Railway"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));