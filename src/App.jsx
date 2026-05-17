import { useState, useEffect, useRef, useCallback } from "react";

// ─── localStorage helpers (replaces window.storage) ──────────────────────────
const store = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
  del: (key) => { try { localStorage.removeItem(key); return true; } catch { return false; } },
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:"#0B4F6C", secondary:"#01BAEF", mint:"#20BF55",
  amber:"#F7B731", danger:"#E63946", bg:"#EEF4F8",
  dark:"#12263A", muted:"#7B8FA1", border:"#D6E4EE",
};

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO = {
  records:[
    {id:1,date:"2026-04-18",hospital:"台大醫院",dept:"內科",doctor:"陳俊宏 主治醫師",diagnosis:"急性支氣管炎",prescription:["阿奇黴素錠 250mg","必達舒膠囊 30mg","克咳糖漿"],note:"建議多休息，5天後複診",tag:"門診"},
    {id:2,date:"2026-03-05",hospital:"台北榮總",dept:"心臟內科",doctor:"林美珠 主任醫師",diagnosis:"高血壓定期追蹤",prescription:["脈優錠 5mg","耐絞寧 10mg"],note:"血壓控制尚可，低鹽飲食",tag:"複診"},
    {id:3,date:"2026-01-22",hospital:"馬偕醫院",dept:"腸胃肝膽科",doctor:"張志明 醫師",diagnosis:"慢性胃炎合併逆流性食道炎",prescription:["泰克胃清腸溶錠 20mg","健胃仙顆粒"],note:"飯前30分鐘服藥",tag:"門診"},
    {id:4,date:"2025-11-03",hospital:"台大醫院",dept:"健康管理中心",doctor:"黃雅婷 醫師",diagnosis:"年度健康檢查－輕度脂肪肝",prescription:["立普妥錠 10mg"],note:"減少高脂食物，增加有氧運動",tag:"健檢"},
  ],
  medications:[
    {id:1,name:"脈優錠（Norvasc）",dose:"5mg",freq:"每日一次，早餐後",days:12,hospital:"台北榮總"},
    {id:2,name:"立普妥錠（Lipitor）",dose:"10mg",freq:"每日一次，睡前",days:28,hospital:"台大醫院"},
    {id:3,name:"泰克胃清（Takepron）",dose:"20mg",freq:"每日一次，飯前30分鐘",days:5,hospital:"馬偕醫院"},
  ],
  labResults:[
    {date:"2025-11-03",item:"空腹血糖",value:"118",unit:"mg/dL",ref:"70-100",status:"異常"},
    {date:"2025-11-03",item:"總膽固醇",value:"228",unit:"mg/dL",ref:"<200",status:"異常"},
    {date:"2025-11-03",item:"高密度脂蛋白",value:"48",unit:"mg/dL",ref:">40",status:"正常"},
    {date:"2025-11-03",item:"肌酸酐",value:"0.9",unit:"mg/dL",ref:"0.6-1.2",status:"正常"},
  ],
  vaccines:[
    {date:"2025-10-05",name:"流感疫苗（四價）",hospital:"台大醫院"},
    {date:"2024-09-20",name:"COVID-19 疫苗（XBB更新株）",hospital:"馬偕醫院"},
  ]
};

// ─── Claude PDF Parser ────────────────────────────────────────────────────────
async function parseNHIPdf(base64, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 4000,
      system: `你是台灣全民健保存摺PDF解析專家。請從PDF中提取所有資料，以純JSON格式回傳，不加任何說明或markdown。格式：{"person":{"name":"","nhiId":"","dob":"","blood":"","gender":""},"records":[{"id":1,"date":"YYYY-MM-DD","hospital":"","dept":"","doctor":"","diagnosis":"","prescription":[],"note":"","tag":"門診"}],"medications":[{"id":1,"name":"","dose":"","freq":"","days":30,"hospital":""}],"labResults":[{"date":"","item":"","value":"","unit":"","ref":"","status":"正常"}],"vaccines":[{"date":"","name":"","hospital":""}]}`,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "請解析此健保存摺PDF並以JSON格式回傳所有資料。" }
      ]}]
    })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || "API 錯誤");
  const raw = d.content?.map(c => c.text || "").join("") || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function chatWithAI(messages, systemPrompt, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: systemPrompt, messages })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.map(c => c.text || "").join("") || "抱歉，請稍後再試。";
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, color = C.primary, disabled = false, outline = false, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "13px", borderRadius: 14, border: outline ? `1.5px solid ${color}` : "none", background: disabled ? C.muted : outline ? "transparent" : `linear-gradient(135deg,${color},${color}cc)`, color: outline ? color : "#fff", fontWeight: 700, fontSize: 14, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.2s", ...style }}>{children}</button>
);

const Card = ({ children, onClick, style = {} }) => (
  <div onClick={onClick} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
);

const InfoBox = ({ children, type = "info" }) => {
  const s = { info: { bg: "#E8F4FA", border: C.secondary, ic: "📌" }, tip: { bg: "#FFF9E6", border: C.amber, ic: "💡" }, warn: { bg: "#FEF0EF", border: C.danger, ic: "⚠️" } }[type];
  return <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "11px 14px", margin: "8px 0", display: "flex", gap: 9, fontSize: 13, color: C.dark, lineHeight: 1.65 }}><span style={{ flexShrink: 0 }}>{s.ic}</span><div>{children}</div></div>;
};

const TopBar = ({ title, onBack, color = C.primary }) => (
  <div style={{ background: `linear-gradient(135deg,${color},${color}cc)`, padding: "18px 18px 32px", flexShrink: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ 返回</button>}
      <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
    </div>
  </div>
);

// ─── Splash ───────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(145deg,${C.primary} 0%,#1a6a8a 60%,#0d3d52 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans TC',sans-serif" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏥</div>
      <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: 2, margin: "0 0 6px", textAlign: "center" }}>親晚架構醫療系統</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: "0 0 40px" }}>Taiwan Smart Health Platform</p>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.6)", animation: `bop 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
      </div>
      <style>{`@keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ─── API Key Setup ────────────────────────────────────────────────────────────
function ApiKeySetup({ onDone }) {
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) { setError("格式不對，金鑰必須以 sk-ant- 開頭"); return; }
    setTesting(true); setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": trimmed, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10, messages: [{ role: "user", content: "hi" }] })
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error.message);
      store.set("nhi-apikey", trimmed);
      onDone(trimmed);
    } catch (e) {
      setError("金鑰驗證失敗：" + (e.message || "請確認金鑰是否正確"));
    }
    setTesting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(145deg,${C.primary} 0%,#1a6a8a 60%,#0d3d52 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans TC',sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🔑</div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 20, fontWeight: 800 }}>設定 AI 金鑰</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", margin: "6px 0 0", fontSize: 13 }}>首次使用需要設定，之後不用再設定</p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 20, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ background: C.bg, borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 10 }}>📋 如何取得 API 金鑰（3 步驟）</div>
            {[
              ["前往網站", "console.anthropic.com"],
              ["登入或註冊", "用電子信箱建立帳號"],
              ["建立金鑰", "API Keys → Create Key → 複製"],
            ].map(([t, d], i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.primary, color: "#fff", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{t}</div><div style={{ fontSize: 12, color: C.muted }}>{d}</div></div>
              </div>
            ))}
          </div>

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 6 }}>貼上您的 API 金鑰</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <input
              value={key}
              onChange={e => { setKey(e.target.value); setError(""); }}
              placeholder="sk-ant-api03-XXXXXXXXXX..."
              type={showKey ? "text" : "password"}
              style={{ flex: 1, padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${error ? C.danger : C.border}`, fontSize: 13, fontFamily: "monospace", outline: "none" }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{ padding: "0 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 16 }}>{showKey ? "🙈" : "👁️"}</button>
          </div>
          {error && <p style={{ color: C.danger, fontSize: 12, margin: "5px 0 8px" }}>{error}</p>}

          <InfoBox type="tip">金鑰只儲存在您的手機／電腦本地，不會上傳到任何地方。費用約每次使用 NTD $0.3，一般用量每月不超過 NTD $300。</InfoBox>

          <div style={{ marginTop: 14 }}>
            <Btn onClick={handleSave} disabled={testing || !key.trim()}>{testing ? "驗證金鑰中…" : "儲存並繼續"}</Btn>
          </div>
        </div>

        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", fontSize: 11, marginTop: 12 }}>ISO 27001 資安認證 · 符合個人資料保護法</p>
      </div>
    </div>
  );
}

// ─── Install Guide ────────────────────────────────────────────────────────────
function InstallGuide({ onDone }) {
  const [tab, setTab] = useState("ios");
  const steps = {
    ios: [
      { ic: "🌐", t: "用 Safari 開啟本系統", d: "必須用 Safari，不能用 Chrome。" },
      { ic: "📤", t: "點選底部「分享」按鈕⬆", d: "Safari 底部中間的方框加箭頭圖示。" },
      { ic: "➕", t: "選擇「加入主畫面」", d: "在分享選單中向下滑動找到此選項。" },
      { ic: "✅", t: "點選右上角「新增」", d: "App 圖示即出現在主畫面！" },
    ],
    android: [
      { ic: "🌐", t: "用 Chrome 開啟本系統", d: "Android 裝置請用 Google Chrome。" },
      { ic: "⋮", t: "點選右上角三個點", d: "開啟 Chrome 選單。" },
      { ic: "📲", t: "選擇「新增至主畫面」", d: "或「安裝應用程式」，點選確認。" },
      { ic: "✅", t: "App 圖示出現在桌面", d: "點選圖示即可開啟！" },
    ]
  };
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, padding: "30px 22px 44px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>📲</div>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 20, fontWeight: 800 }}>加入手機主畫面</h2>
        <p style={{ color: "rgba(255,255,255,0.75)", margin: "5px 0 0", fontSize: 13 }}>安裝後像 App 一樣使用</p>
      </div>
      <div style={{ padding: "0 16px 20px", marginTop: -18 }}>
        <Card>
          <div style={{ display: "flex", background: C.bg, borderRadius: 12, padding: 4, marginBottom: 14 }}>
            {[["ios", "🍎 iPhone / iPad"], ["android", "🤖 Android"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? C.primary : "transparent", color: tab === k ? "#fff" : C.muted, fontFamily: "inherit" }}>{l}</button>
            ))}
          </div>
          {steps[tab].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12, position: "relative", paddingBottom: 0 }}>
              {i < 3 && <div style={{ position: "absolute", left: 19, top: 42, bottom: -6, width: 2, background: C.border }} />}
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, color: "#fff", fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, paddingBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.dark }}>{s.t}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </Card>
        <Btn onClick={onDone} color={C.mint} style={{ marginBottom: 10 }}>✓ 我已安裝完成，進入系統</Btn>
        <Btn onClick={onDone} outline color={C.muted}>稍後再說，先進入系統</Btn>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState("nhi");
  const [nhiId, setNhiId] = useState(""); const [pw, setPw] = useState(""); const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false); const [step, setStep] = useState(1); const [err, setErr] = useState("");
  const [rn, setRn] = useState(""); const [re, setRe] = useState(""); const [rp, setRp] = useState(""); const [rnhi, setRnhi] = useState("");

  const go = (user) => { setLoading(true); setTimeout(() => { setLoading(false); onLogin(user); }, 1000); };
  const base = (o) => ({ name: "用戶", nhiId: "未連結", dob: "—", blood: "—", phone: "—", email: "—", avatar: "用", ...o });

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(145deg,${C.primary} 0%,#1a6a8a 50%,#0d3d52 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans TC',sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 10, border: "2px solid rgba(255,255,255,0.3)" }}>🏥</div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 20, fontWeight: 800 }}>親晚架構醫療系統</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontSize: 12 }}>Taiwan Smart Health Platform</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 20, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          {step === 1 ? (<>
            <div style={{ display: "flex", background: C.bg, borderRadius: 12, padding: 3, marginBottom: 18 }}>
              {[["nhi", "🪪 健保"], ["email", "📧 帳號"], ["register", "✏️ 註冊"]].map(([k, l]) => (
                <button key={k} onClick={() => { setTab(k); setErr(""); }} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === k ? 700 : 400, background: tab === k ? "#fff" : "transparent", color: tab === k ? C.primary : C.muted, fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
            {tab === "nhi" && <>
              <div style={{ background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, borderRadius: 13, padding: "12px 15px", marginBottom: 14, display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ fontSize: 32 }}>🪪</span>
                <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>全民健康保險</div><div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>National Health Insurance</div></div>
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 5 }}>健保卡號 / 身分證號</label>
              <input value={nhiId} onChange={e => setNhiId(e.target.value)} placeholder="A123456789" style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 4 }} />
              {err && <p style={{ color: C.danger, fontSize: 12, margin: "4px 0 8px" }}>{err}</p>}
              <Btn onClick={() => { if (!nhiId) { setErr("請輸入健保卡號"); return; } setErr(""); setLoading(true); setTimeout(() => { setLoading(false); setStep(2); }, 1200); }} disabled={loading} style={{ marginTop: 10 }}>{loading ? "連接中…" : "健保卡驗證登入"}</Btn>
            </>}
            {tab === "email" && <>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 5 }}>電子信箱</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" type="email" style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, outline: "none" }} />
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 5 }}>密碼</label>
              <input value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" type="password" style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
              {err && <p style={{ color: C.danger, fontSize: 12, margin: "5px 0 0" }}>{err}</p>}
              <Btn onClick={() => { if (!email || !pw) { setErr("請填寫所有欄位"); return; } go(base({ name: email.split("@")[0], email, avatar: email.charAt(0).toUpperCase() })); }} disabled={loading} style={{ marginTop: 12 }}>{loading ? "登入中…" : "登入"}</Btn>
            </>}
            {tab === "register" && <>
              {[["真實姓名 *", "陳小明", rn, setRn, "text"], ["電子信箱 *", "your@email.com", re, setRe, "email"], ["手機號碼 *", "09XX-XXX-XXX", rp, setRp, "tel"], ["健保卡號（選填）", "A123456789", rnhi, setRnhi, "text"]].map(([l, ph, v, sv, t], i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 4 }}>{l}</label>
                  <input type={t} placeholder={ph} value={v} onChange={e => sv(e.target.value)} style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                </div>
              ))}
              {err && <p style={{ color: C.danger, fontSize: 12, margin: "3px 0 6px" }}>{err}</p>}
              <Btn onClick={() => { if (!rn.trim()) { setErr("請輸入真實姓名"); return; } if (!re.includes("@")) { setErr("請輸入有效電子信箱"); return; } if (!rp.trim()) { setErr("請輸入手機號碼"); return; } go(base({ name: rn.trim(), nhiId: rnhi.trim() || "未連結", phone: rp.trim(), email: re.trim(), avatar: rn.trim().charAt(0) })); }} disabled={loading} color={C.mint} style={{ marginTop: 4 }}>{loading ? "建立帳戶中…" : "立即註冊"}</Btn>
            </>}
          </>) : (
            <div>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 44, marginBottom: 6 }}>📱</div>
                <h3 style={{ margin: 0, color: C.dark, fontWeight: 700 }}>簡訊驗證</h3>
                <p style={{ color: C.muted, fontSize: 12, margin: "5px 0 0" }}>請輸入發送至您手機的驗證碼</p>
              </div>
              <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 13 }}>
                {[...Array(6)].map((_, i) => <input key={i} maxLength={1} style={{ width: 40, height: 46, textAlign: "center", fontSize: 22, fontWeight: 700, borderRadius: 10, border: `2px solid ${C.border}`, color: C.primary, fontFamily: "inherit", outline: "none" }} onChange={e => { if (e.target.value && e.target.nextSibling) e.target.nextSibling.focus(); }} />)}
              </div>
              <Btn onClick={() => go(base({ name: nhiId, nhiId, avatar: nhiId.charAt(0).toUpperCase() }))} disabled={loading}>{loading ? "驗證中…" : "確認登入"}</Btn>
              <button onClick={() => setStep(1)} style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 12, border: "none", background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── NHI Import ───────────────────────────────────────────────────────────────
function NHIImportScreen({ user, apiKey, onImported, onSkip }) {
  const [phase, setPhase] = useState("guide");
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") { setErr("請上傳 PDF 格式的健保存摺"); return; }
    setPhase("parsing"); setProgress(10);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = () => rej(); r.readAsDataURL(file); });
      setProgress(30);
      const timer = setInterval(() => setProgress(p => p < 85 ? p + 4 : p), 500);
      const result = await parseNHIPdf(base64, apiKey);
      clearInterval(timer); setProgress(100);
      setParsed(result); setPhase("done");
    } catch (e) { setPhase("error"); setErr(e.message || "解析失敗"); }
  };

  const handleDemo = async () => {
    setPhase("parsing"); setProgress(10);
    for (const p of [25, 42, 58, 72, 86, 100]) { await new Promise(r => setTimeout(r, 550)); setProgress(p); }
    await new Promise(r => setTimeout(r, 300));
    setParsed({ person: { name: user.name !== "用戶" ? user.name : "王大明", nhiId: user.nhiId !== "未連結" ? user.nhiId : "F223456789", dob: "1985-09-12", blood: "O+", gender: "男" }, ...DEMO });
    setPhase("done");
  };

  if (phase === "guide") return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, padding: "26px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h2 style={{ color: "#fff", margin: 0, fontSize: 20, fontWeight: 800 }}>🪪 匯入健保存摺</h2><p style={{ color: "rgba(255,255,255,0.7)", margin: "5px 0 0", fontSize: 12 }}>讀取您的真實健保就診資料</p></div>
          <button onClick={onSkip} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 13px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>略過</button>
        </div>
      </div>
      <div style={{ padding: "0 14px 20px", marginTop: -16 }}>
        <Card>
          <InfoBox type="tip">先從<strong>「全民健保行動快易通」App</strong> 匯出健保存摺 PDF，再上傳此處，系統自動讀取您的就診紀錄。</InfoBox>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, margin: "12px 0 4px" }}>📱 匯出步驟</div>
          {[["下載官方 App", "App Store / Google Play 搜尋「全民健保行動快易通」"], ["登入健保帳號", "選「健保存摺」→ 登入（自然人憑證或 FIDO）"], ["進入健保存摺", "點選底部「健保存摺」圖示"], ["匯出 PDF", "右上角「⋯」→「下載 PDF」→ 儲存至手機"]].map(([t, d], i) => (
            <div key={i} style={{ display: "flex", gap: 11, padding: "10px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.primary, color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div><div style={{ fontWeight: 700, fontSize: 13, color: C.dark }}>{t}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{d}</div></div>
            </div>
          ))}
        </Card>
        <Btn onClick={() => setPhase("upload")} style={{ marginBottom: 10 }}>📤 我已匯出，立即上傳 PDF</Btn>
        <Btn onClick={handleDemo} color="#8E44AD" style={{ marginBottom: 10 }}>🎬 體驗示範流程（示範資料）</Btn>
        <Btn onClick={onSkip} outline color={C.muted}>暫時略過</Btn>
      </div>
    </div>
  );

  if (phase === "upload") return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <TopBar title="📤 上傳健保存摺" onBack={() => setPhase("guide")} />
      <div style={{ padding: "0 14px", marginTop: -14 }}>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        <div onClick={() => fileRef.current.click()} style={{ background: "#fff", border: `2.5px dashed ${C.border}`, borderRadius: 18, padding: "44px 20px", textAlign: "center", cursor: "pointer", marginBottom: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 4 }}>點選或拖曳上傳 PDF</div>
          <div style={{ fontSize: 12, color: C.muted }}>支援健保存摺官方 PDF</div>
        </div>
        {err && <InfoBox type="warn">{err}</InfoBox>}
        <Btn onClick={handleDemo} color="#8E44AD" style={{ marginBottom: 10 }}>🎬 沒有 PDF？點此體驗示範流程</Btn>
      </div>
    </div>
  );

  if (phase === "parsing") return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.primary, margin: "0 0 8px" }}>AI 解析中…</h2>
      <p style={{ color: C.muted, textAlign: "center", fontSize: 13, marginBottom: 24 }}>正在讀取就診記錄、用藥資料及檢驗報告</p>
      <div style={{ width: "100%", maxWidth: 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 4 }}><span>解析進度</span><span>{progress}%</span></div>
        <div style={{ background: C.border, borderRadius: 20, height: 8, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg,${C.secondary},${C.mint})`, borderRadius: 20, transition: "width 0.5s ease" }} />
        </div>
        {[["🗓️", "讀取就診記錄", 20], ["💊", "分析用藥明細", 42], ["🧪", "整理檢驗報告", 64], ["💉", "核對疫苗記錄", 82]].map(([ic, label, th]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, opacity: progress >= th ? 1 : 0.3, transition: "opacity 0.5s" }}>
            <span style={{ fontSize: 15 }}>{ic}</span>
            <span style={{ fontSize: 13, color: progress >= th ? C.dark : C.muted, fontWeight: progress >= th ? 600 : 400 }}>{label}</span>
            {progress > th + 10 && <span style={{ marginLeft: "auto", color: C.mint, fontWeight: 700 }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
  );

  if (phase === "error") return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.danger, margin: "0 0 8px" }}>解析失敗</h2>
      <p style={{ color: C.muted, textAlign: "center", fontSize: 13, maxWidth: 280, marginBottom: 22 }}>{err}</p>
      <Btn onClick={() => { setPhase("upload"); setErr(""); }} style={{ maxWidth: 260, marginBottom: 10 }}>重新上傳</Btn>
      <button onClick={onSkip} style={{ padding: "10px 24px", borderRadius: 13, border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>使用示範資料</button>
    </div>
  );

  if (phase === "done" && parsed) {
    const pr = parsed.person || {};
    const rc = parsed.records?.length || 0, mc = parsed.medications?.length || 0, lc = parsed.labResults?.length || 0;
    return (
      <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
        <div style={{ background: `linear-gradient(135deg,${C.mint},#18a046)`, padding: "36px 20px 48px", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>✅</div>
          <h2 style={{ color: "#fff", margin: 0, fontSize: 21, fontWeight: 800 }}>解析成功！</h2>
        </div>
        <div style={{ padding: "0 14px", marginTop: -20 }}>
          <Card>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 9 }}>📋 識別資料</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["姓名", pr.name], ["健保卡號", pr.nhiId], ["生日", pr.dob], ["血型", pr.blood]].map(([k, v]) => v && v !== "—" ? (
                <div key={k} style={{ background: C.bg, borderRadius: 9, padding: "8px 11px" }}>
                  <div style={{ fontSize: 10, color: C.muted }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginTop: 1 }}>{v}</div>
                </div>
              ) : null)}
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 12 }}>
            {[[rc, "就診", "📋", "#0B4F6C"], [mc, "用藥", "💊", "#C0392B"], [lc, "檢驗", "🧪", "#8E44AD"]].map(([v, l, ic, col]) => (
              <div key={l} style={{ background: "#fff", borderRadius: 13, padding: "13px 6px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 20 }}>{ic}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: col, marginTop: 2 }}>{v}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{l}</div>
              </div>
            ))}
          </div>
          <Btn onClick={() => onImported(parsed)}>進入我的健康系統 →</Btn>
          <div style={{ height: 20 }} />
        </div>
      </div>
    );
  }
  return null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ setScreen, user, healthData }) {
  const records = healthData?.records || [], meds = healthData?.medications || [], labs = healthData?.labResults || [];
  const isReal = !!healthData;
  const alerts = meds.filter(m => (m.days || 30) <= 7);
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, padding: "26px 20px 52px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.65)", margin: 0, fontSize: 12 }}>歡迎回來！</p>
            <h2 style={{ color: "#fff", margin: "2px 0 0", fontSize: 21, fontWeight: 800 }}>{user.name}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "3px 9px", color: "rgba(255,255,255,0.9)", fontSize: 11 }}>🪪 {user.nhiId}</span>
              <span style={{ background: isReal ? "rgba(32,191,85,0.3)" : "rgba(247,183,49,0.3)", borderRadius: 20, padding: "3px 9px", color: isReal ? "#7fffb0" : "#ffe08a", fontSize: 11 }}>{isReal ? "● 健保資料已載入" : "○ 使用示範資料"}</span>
            </div>
          </div>
          <div onClick={() => setScreen("settings")} style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", border: "2px solid rgba(255,255,255,0.4)", cursor: "pointer" }}>{user.avatar || user.name.charAt(0)}</div>
        </div>
      </div>
      <div style={{ margin: "-28px 13px 0", position: "relative", zIndex: 2 }}>
        <div style={{ background: "#fff", borderRadius: 18, padding: "12px 4px", boxShadow: "0 8px 26px rgba(11,79,108,0.12)", display: "flex", marginBottom: 14 }}>
          {[[records.length || "—", "次", "就診"], [meds.length || "—", "種", "用藥"], [labs.length || "—", "項", "檢驗"]].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.primary }}>{s[0]}</div>
              <div style={{ fontSize: 9, color: C.muted }}>{s[1]}</div>
              <div style={{ fontSize: 10, color: C.dark, marginTop: 1 }}>{s[2]}</div>
            </div>
          ))}
        </div>
        {alerts.length > 0 && <div onClick={() => setScreen("meds")} style={{ background: `${C.danger}12`, border: `1.5px solid ${C.danger}40`, borderRadius: 13, padding: "11px 13px", marginBottom: 12, display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>{alerts.length} 種藥物庫存不足</div><div style={{ fontSize: 11, color: C.muted }}>點此查看，請儘快補充</div></div>
          <span style={{ color: C.danger, fontSize: 17 }}>›</span>
        </div>}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.dark, margin: "0 0 9px 2px" }}>功能選單</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
          {[{ icon: "📋", label: "看診記錄", sub: records.length > 0 ? `${records.length} 筆紀錄` : "尚無記錄", screen: "records", color: "#0B4F6C", bg: "#E8F4FA" }, { icon: "💊", label: "用藥管理", sub: meds.length > 0 ? `${meds.length} 種用藥` : "尚無資料", screen: "meds", color: "#C0392B", bg: "#FEF0EF", badge: alerts.length }, { icon: "📅", label: "預約功能", sub: "掛號・複診安排", screen: "appts", color: "#27AE60", bg: "#EAFAF1" }, { icon: "🤖", label: "AI 健康分析", sub: "智能診斷建議", screen: "ai", color: "#8E44AD", bg: "#F5EEF8" }].map(card => (
            <button key={card.screen} onClick={() => setScreen(card.screen)} style={{ background: card.bg, borderRadius: 15, padding: "16px 13px", border: `1.5px solid ${card.color}22`, cursor: "pointer", textAlign: "left", fontFamily: "inherit", position: "relative" }}>
              {card.badge > 0 && <div style={{ position: "absolute", top: 10, right: 10, background: C.danger, color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{card.badge}</div>}
              <div style={{ fontSize: 28, marginBottom: 5 }}>{card.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: card.color, marginBottom: 2 }}>{card.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{card.sub}</div>
            </button>
          ))}
        </div>
        {records.length > 0 && <Card onClick={() => setScreen("records")}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 6 }}>最近就診</div>
          <div style={{ fontSize: 11, color: C.muted }}>{records[0].date} · {records[0].hospital}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginTop: 2 }}>{records[0].diagnosis}</div>
        </Card>}
      </div>
    </div>
  );
}

// ─── Records ──────────────────────────────────────────────────────────────────
function RecordsScreen({ setScreen, records }) {
  const [sel, setSel] = useState(null);
  const tagColor = { "門診": "#0B4F6C", "複診": "#27AE60", "健檢": "#F39C12", "急診": "#E63946", "住院": "#8E44AD" };
  if (sel) return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <TopBar title={sel.diagnosis} onBack={() => setSel(null)} />
      <div style={{ padding: "0 13px", marginTop: -14 }}>
        <div style={{ fontSize: 11, color: C.muted, padding: "8px 0 10px" }}>{sel.date} · {sel.hospital} · {sel.dept}</div>
        {[["👨‍⚕️", "主治醫師", sel.doctor], ["📋", "診斷", sel.diagnosis], ["📝", "醫囑", sel.note]].filter(([, , v]) => v && v !== "—").map(([ic, l, v]) => <Card key={l} style={{ display: "flex", gap: 10 }}><span style={{ fontSize: 18 }}>{ic}</span><div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 13, color: C.dark, marginTop: 2 }}>{v}</div></div></Card>)}
        {sel.prescription?.length > 0 && <Card><div style={{ display: "flex", gap: 9, marginBottom: 7 }}><span style={{ fontSize: 18 }}>💊</span><div style={{ fontSize: 11, color: C.muted, fontWeight: 600, paddingTop: 3 }}>開立藥品</div></div>{sel.prescription.map((p, i) => <div key={i} style={{ background: C.bg, borderRadius: 9, padding: "8px 12px", marginBottom: 6, fontSize: 13, color: C.dark }}><span style={{ color: C.secondary, fontWeight: 700, marginRight: 5 }}>▸</span>{p}</div>)}</Card>}
      </div>
    </div>
  );
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <TopBar title="📋 看診記錄" onBack={() => setScreen("home")} />
      <div style={{ padding: "0 13px", marginTop: -14 }}>
        <div style={{ fontSize: 11, color: C.muted, padding: "7px 0 9px" }}>共 {records.length} 筆就醫紀錄</div>
        {records.length === 0 ? <div style={{ textAlign: "center", padding: "52px 20px" }}><div style={{ fontSize: 48, marginBottom: 9 }}>📋</div><div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>尚無就診記錄</div><div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>上傳健保存摺 PDF 後即可顯示</div></div>
          : records.map(r => <div key={r.id || r.date} onClick={() => setSel(r)} style={{ background: "#fff", borderRadius: 13, padding: "13px 14px", marginBottom: 9, cursor: "pointer", borderLeft: `4px solid ${tagColor[r.tag] || C.primary}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div><div style={{ display: "flex", gap: 6, marginBottom: 3 }}><span style={{ background: `${tagColor[r.tag] || C.primary}18`, color: tagColor[r.tag] || C.primary, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>{r.tag || "門診"}</span><span style={{ fontSize: 11, color: C.muted }}>{r.date}</span></div><div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{r.diagnosis}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{r.hospital} · {r.dept}</div></div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </div>
          </div>)}
      </div>
    </div>
  );
}

// ─── Meds ─────────────────────────────────────────────────────────────────────
function MedsScreen({ setScreen, medications, takenMap, onToggle }) {
  const colors = ["#E63946", "#20BF55", "#01BAEF", "#F7B731", "#8E44AD", "#0B4F6C"];
  const meds = medications.map((m, i) => ({ ...m, id: m.id || i + 1, stock: m.days || 30, total: m.days || 30, color: colors[i % colors.length], alert: (m.days || 30) <= 7 }));
  const alerts = meds.filter(m => m.alert);
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,#C0392B,#e74c3c)`, padding: "18px 18px 32px" }}>
        <button onClick={() => setScreen("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>‹ 返回首頁</button>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>💊 用藥管理</h2>
        <p style={{ color: "rgba(255,255,255,0.75)", margin: "4px 0 0", fontSize: 12 }}>{meds.length} 種藥物 · {alerts.length} 項警示</p>
      </div>
      <div style={{ padding: "0 13px", marginTop: -14 }}>
        {meds.length === 0 ? <div style={{ textAlign: "center", padding: "52px 20px" }}><div style={{ fontSize: 48, marginBottom: 9 }}>💊</div><div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>尚無用藥資料</div></div>
          : <>{alerts.length > 0 && <div style={{ background: C.danger, borderRadius: 12, padding: "11px 14px", marginBottom: 11, display: "flex", gap: 9, alignItems: "center" }}><span style={{ fontSize: 18 }}>🚨</span><div style={{ color: "#fff" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{alerts.length} 項藥量警示</div><div style={{ fontSize: 11, opacity: 0.85 }}>請儘快前往藥局補充</div></div></div>}
            {meds.map(med => <div key={med.id} style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", marginBottom: 9, borderLeft: `4px solid ${med.color}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{med.name}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{med.dose} · {med.freq}</div></div>
                <button onClick={() => onToggle(med.id)} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${takenMap[med.id] ? C.mint : C.border}`, background: takenMap[med.id] ? C.mint : "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>{takenMap[med.id] ? "✓" : ""}</button>
              </div>
              <div style={{ marginTop: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 3 }}><span>剩餘天份</span><span style={{ color: med.alert ? C.danger : C.mint, fontWeight: 700 }}>{med.stock} 天</span></div>
                <div style={{ background: C.bg, borderRadius: 10, height: 6, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, (med.stock / med.total) * 100)}%`, background: med.alert ? `linear-gradient(90deg,${C.danger},#ff6b6b)` : `linear-gradient(90deg,${C.mint},#5ff08a)`, borderRadius: 10 }} /></div>
              </div>
              {med.alert && <div style={{ marginTop: 7, background: `${C.danger}12`, borderRadius: 7, padding: "6px 9px", fontSize: 11, color: C.danger, fontWeight: 600 }}>⚠️ 庫存不足，請儘快前往藥局補充</div>}
            </div>)}</>}
      </div>
    </div>
  );
}

// ─── Appointments ─────────────────────────────────────────────────────────────
function ApptsScreen({ setScreen, appts, onAdd }) {
  const [showBook, setShowBook] = useState(false);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState({ hosp: "", dept: "", date: "", time: "" });
  const [booked, setBooked] = useState(false);
  const hosps = ["台大醫院", "台北榮總", "馬偕醫院", "三總醫院", "萬芳醫院"];
  const depts = ["內科", "心臟科", "腸胃科", "皮膚科", "骨科", "眼科"];
  const times = ["08:30", "09:00", "09:30", "10:00", "14:00", "14:30", "15:00"];

  if (showBook && booked) return <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}><div style={{ fontSize: 62, marginBottom: 12 }}>✅</div><h2 style={{ fontSize: 20, fontWeight: 800, color: C.primary, margin: 0 }}>預約成功！</h2><p style={{ color: C.muted, textAlign: "center", marginTop: 7 }}>{sel.hosp} · {sel.dept}<br />{sel.date} {sel.time}</p><Btn onClick={() => { setShowBook(false); setBooked(false); setStep(0); }} style={{ maxWidth: 240, marginTop: 20 }}>返回列表</Btn></div>;

  if (showBook) return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,#27AE60,#2ecc71)`, padding: "18px 18px 32px" }}>
        <button onClick={() => setShowBook(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>‹ 返回</button>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>📅 線上預約掛號</h2>
        <div style={{ display: "flex", gap: 4, marginTop: 9 }}>
          {["選醫院", "選科別", "選時間", "確認"].map((s, i) => <div key={i} style={{ flex: 1, textAlign: "center" }}><div style={{ width: 20, height: 20, borderRadius: "50%", background: i <= step ? "#fff" : "rgba(255,255,255,0.3)", color: i <= step ? "#27AE60" : "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 3px" }}>{i + 1}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)" }}>{s}</div></div>)}
        </div>
      </div>
      <div style={{ padding: "0 13px", marginTop: -14 }}>
        {step === 0 && hosps.map(h => <Card key={h} onClick={() => { setSel(p => ({ ...p, hosp: h })); setStep(1); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", gap: 9, alignItems: "center" }}><span style={{ fontSize: 18 }}>🏥</span><div><div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{h}</div><div style={{ fontSize: 11, color: C.muted }}>健保特約醫院</div></div></div><span style={{ color: C.muted }}>›</span></Card>)}
        {step === 1 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>{depts.map(d => <Card key={d} onClick={() => { setSel(p => ({ ...p, dept: d })); setStep(2); }} style={{ textAlign: "center" }}><div style={{ fontSize: 22, marginBottom: 4 }}>🩺</div><div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{d}</div></Card>)}</div>}
        {step === 2 && <><h3 style={{ fontSize: 13, fontWeight: 700, color: C.dark, margin: "8px 0" }}>選擇日期</h3><input type="date" value={sel.date} onChange={e => setSel(p => ({ ...p, date: e.target.value }))} style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 13 }} /><h3 style={{ fontSize: 13, fontWeight: 700, color: C.dark, margin: "0 0 9px" }}>選擇時段</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7 }}>{times.map(t => <div key={t} onClick={() => { setSel(p => ({ ...p, time: t })); setStep(3); }} style={{ background: sel.time === t ? C.primary : "#fff", borderRadius: 9, padding: "8px 4px", textAlign: "center", cursor: "pointer", border: `1.5px solid ${sel.time === t ? C.primary : C.border}`, fontSize: 12, fontWeight: 600, color: sel.time === t ? "#fff" : C.primary }}>{t}</div>)}</div></>}
        {step === 3 && <><h3 style={{ fontSize: 13, fontWeight: 700, color: C.dark, margin: "8px 0 12px" }}>確認預約資訊</h3>{[["🏥", "醫院", sel.hosp], ["🩺", "科別", sel.dept], ["📅", "日期", sel.date || "未選擇"], ["⏰", "時間", sel.time]].map(([ic, k, v]) => <Card key={k} style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 8 }}><span style={{ fontSize: 17 }}>{ic}</span><div><div style={{ fontSize: 11, color: C.muted }}>{k}</div><div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginTop: 1 }}>{v}</div></div></Card>)}<Btn onClick={() => { onAdd({ id: Date.now(), date: sel.date, time: sel.time, hospital: sel.hosp, dept: sel.dept, doctor: "待分配", status: "待確認", type: "初診" }); setBooked(true); }} color="#27AE60" style={{ marginTop: 6 }}>確認預約</Btn></>}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,#27AE60,#2ecc71)`, padding: "18px 18px 32px" }}>
        <button onClick={() => setScreen("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>‹ 返回首頁</button>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>📅 預約管理</h2>
      </div>
      <div style={{ padding: "0 13px", marginTop: -14 }}>
        <Btn onClick={() => setShowBook(true)} color="#27AE60" style={{ marginBottom: 14 }}>＋ 新增預約掛號</Btn>
        {appts.map(a => <Card key={a.id} style={{ borderLeft: `4px solid ${a.status === "已確認" ? C.mint : C.amber}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ background: a.status === "已確認" ? `${C.mint}20` : `${C.amber}20`, color: a.status === "已確認" ? C.mint : C.amber, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>{a.status}</span><span style={{ fontSize: 11, color: C.muted }}>{a.type}</span></div><div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{a.hospital}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{a.dept} · {a.doctor}</div><div style={{ display: "flex", gap: 12, marginTop: 8, background: C.bg, borderRadius: 9, padding: "8px 11px" }}><div><div style={{ fontSize: 10, color: C.muted }}>日期</div><div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{a.date}</div></div><div><div style={{ fontSize: 10, color: C.muted }}>時間</div><div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{a.time}</div></div></div></Card>)}
      </div>
    </div>
  );
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
function AIScreen({ setScreen, user, healthData, apiKey }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: healthData ? `您好！我是您的 AI 健康助理 🤖\n\n我已載入您的健保資料，共 ${healthData.records?.length || 0} 筆就診紀錄、${healthData.medications?.length || 0} 種用藥。請問有什麼健康問題？` : "您好！我是您的 AI 健康助理 🤖\n\n尚未載入健保資料，您可以直接描述症狀提問。" }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false);
  const bottomRef = useRef();
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const ctx = healthData ? `用戶：${user.name}，健保卡號：${user.nhiId}\n就診：${healthData.records?.map(r => `${r.date} ${r.hospital} ${r.diagnosis}`).join("；") || "無"}\n用藥：${healthData.medications?.map(m => `${m.name} ${m.dose}`).join("；") || "無"}\n檢驗：${healthData.labResults?.map(l => `${l.item} ${l.value}${l.unit}(${l.status})`).join("；") || "無"}` : `用戶：${user.name}，尚未上傳健保資料`;

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput("");
    setMsgs(p => [...p, { role: "user", content: msg }]); setLoading(true);
    try {
      const reply = await chatWithAI([...msgs.map(m => ({ role: m.role, content: m.content })), { role: "user", content: msg }], `你是台灣醫療 AI 健康助理，請用繁體中文回答，語氣親切專業。\n${ctx}\n注意：建議僅供參考，不能取代醫師診斷。`, apiKey);
      setMsgs(p => [...p, { role: "assistant", content: reply }]);
    } catch (e) { setMsgs(p => [...p, { role: "assistant", content: `⚠️ ${e.message || "連線問題，請稍後重試。"}` }]); }
    setLoading(false);
  };

  const quick = ["分析我的用藥有無交互作用？", "根據我的病歷有什麼建議？", "我的檢驗報告有無異常？"];
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: `linear-gradient(135deg,#8E44AD,#9b59b6)`, padding: "18px 18px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button onClick={() => setScreen("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ 返回</button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🤖</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>AI 健康診斷分析</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 13px 0" }}>
        {msgs.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 9 }}>
          {m.role === "assistant" && <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#8E44AD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, marginRight: 6, flexShrink: 0, marginTop: 3 }}>🤖</div>}
          <div style={{ maxWidth: "78%", background: m.role === "user" ? `linear-gradient(135deg,#8E44AD,#9b59b6)` : "#fff", color: m.role === "user" ? "#fff" : C.dark, borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "10px 13px", fontSize: 13, lineHeight: 1.65, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", whiteSpace: "pre-wrap" }}>{m.content}</div>
        </div>)}
        {loading && <div style={{ display: "flex", gap: 7, marginBottom: 9 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: "#8E44AD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div><div style={{ background: "#fff", borderRadius: "18px 18px 18px 4px", padding: "10px 13px" }}><div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#8E44AD", animation: `bop 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}</div></div></div>}
        <div ref={bottomRef} />
      </div>
      {msgs.length <= 1 && <div style={{ padding: "6px 13px", display: "flex", gap: 6, overflowX: "auto" }}>{quick.map((q, i) => <button key={i} onClick={() => setInput(q)} style={{ flexShrink: 0, background: "#fff", border: `1.5px solid #8E44AD33`, borderRadius: 20, padding: "5px 11px", fontSize: 11, color: "#8E44AD", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{q}</button>)}</div>}
      <div style={{ padding: "9px 13px 16px", background: "#fff", borderTop: `1px solid ${C.border}`, display: "flex", gap: 7, alignItems: "flex-end" }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="詢問您的健康問題…" rows={1} style={{ flex: 1, padding: "8px 12px", borderRadius: 13, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5 }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ width: 38, height: 38, borderRadius: "50%", background: input.trim() && !loading ? `linear-gradient(135deg,#8E44AD,#9b59b6)` : C.bg, border: "none", cursor: input.trim() && !loading ? "pointer" : "default", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
      </div>
      <style>{`@keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsScreen({ setScreen, user, healthData, apiKey, onClearData, onChangeApiKey }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ fontFamily: "'Noto Sans TC',sans-serif", background: C.bg, minHeight: "100vh" }}>
      <TopBar title="⚙️ 設定" onBack={() => setScreen("home")} />
      <div style={{ padding: "0 14px", marginTop: -14 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, padding: "12px 2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>帳號資料</div>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},#1a7a9a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff" }}>{user.avatar || user.name.charAt(0)}</div>
            <div><div style={{ fontSize: 15, fontWeight: 800, color: C.dark }}>{user.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{user.email !== "—" ? user.email : user.phone !== "—" ? user.phone : "—"}</div></div>
          </div>
          <div style={{ marginTop: 10, background: C.bg, borderRadius: 10, padding: "9px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["健保卡號", user.nhiId], ["手機", user.phone !== "—" ? user.phone : "—"], ["血型", user.blood !== "—" ? user.blood : "—"], ["生日", user.dob !== "—" ? user.dob : "—"]].map(([k, v]) => <div key={k}><div style={{ fontSize: 10, color: C.muted }}>{k}</div><div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginTop: 1 }}>{v}</div></div>)}
          </div>
        </Card>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, padding: "10px 2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>健保資料</div>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>目前狀態</div>
            <div style={{ background: healthData ? `${C.mint}20` : `${C.amber}20`, color: healthData ? C.mint : C.amber, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{healthData ? "已載入" : "示範資料"}</div>
          </div>
          <button onClick={() => setScreen("import")} style={{ width: "100%", padding: "10px", borderRadius: 11, border: `1.5px solid ${C.primary}`, background: "transparent", color: C.primary, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>重新匯入健保存摺 PDF 🔄</button>
        </Card>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, padding: "10px 2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>AI 金鑰</div>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>Anthropic API 金鑰</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>sk-ant-...{apiKey ? apiKey.slice(-8) : "未設定"}</div></div>
            <button onClick={onChangeApiKey} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.primary}`, background: "transparent", color: C.primary, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>更換</button>
          </div>
        </Card>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, padding: "10px 2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>危險操作</div>
        {!confirm
          ? <button onClick={() => setConfirm(true)} style={{ width: "100%", padding: "12px", borderRadius: 13, border: `1.5px solid ${C.danger}`, background: "transparent", color: C.danger, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}>清除所有資料並重新開始</button>
          : <Card style={{ borderLeft: `4px solid ${C.danger}`, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.danger, marginBottom: 5 }}>確認清除所有資料？</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>此操作無法復原。</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 11, border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={onClearData} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "none", background: C.danger, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>確認清除</button>
            </div>
          </Card>}

        <div style={{ textAlign: "center", padding: "8px 0 28px", fontSize: 11, color: C.muted }}>
          <div>親晚架構智慧醫療管理系統　v2.0</div>
          <div style={{ marginTop: 2 }}>Taiwan Smart Health Platform</div>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({ screen, setScreen }) {
  return (
    <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: `1px solid ${C.border}`, display: "flex", padding: "7px 0 10px", zIndex: 10, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}>
      {[["🏠", "首頁", "home"], ["📋", "病歷", "records"], ["💊", "用藥", "meds"], ["📅", "預約", "appts"], ["⚙️", "設定", "settings"]].map(([icon, label, key]) => (
        <button key={key} onClick={() => setScreen(key)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "3px 0", fontFamily: "inherit" }}>
          <div style={{ fontSize: 18 }}>{icon}</div>
          <div style={{ fontSize: 9, color: screen === key ? C.primary : C.muted, fontWeight: screen === key ? 700 : 400, marginTop: 1 }}>{label}</div>
          {screen === key && <div style={{ width: 16, height: 3, borderRadius: 2, background: C.primary, margin: "2px auto 0" }} />}
        </button>
      ))}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("splash");
  const [screen, setScreen] = useState("home");
  const [apiKey, setApiKey] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [appts, setAppts] = useState([]);
  const [takenMap, setTakenMap] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    (async () => {
      await new Promise(r => setTimeout(r, 1500));
      const savedKey = store.get("nhi-apikey");
      const savedUser = store.get("nhi-user");
      const savedHealth = store.get("nhi-healthdata");
      const savedAppts = store.get("nhi-appointments");
      const savedTaken = store.get("nhi-taken");
      const installShown = store.get("nhi-install-shown");

      if (savedAppts) setAppts(savedAppts);
      if (savedTaken) setTakenMap(savedTaken);
      if (!savedKey) { setAppState("apikey"); return; }
      setApiKey(savedKey);
      if (savedUser) { setCurrentUser(savedUser); if (savedHealth) setHealthData(savedHealth); setAppState("main"); return; }
      setAppState(installShown ? "login" : "install");
    })();
  }, []);

  const handleApiKey = (key) => { setApiKey(key); setAppState("install"); };
  const handleLogin = useCallback((user) => { setCurrentUser(user); store.set("nhi-user", user); setAppState("import"); }, []);
  const handleImported = useCallback((data) => {
    if (data.person) {
      setCurrentUser(u => {
        const up = { ...u, name: data.person.name && data.person.name !== "—" ? data.person.name : u.name, nhiId: data.person.nhiId && data.person.nhiId !== "—" ? data.person.nhiId : u.nhiId, dob: data.person.dob && data.person.dob !== "—" ? data.person.dob : u.dob, blood: data.person.blood && data.person.blood !== "—" ? data.person.blood : u.blood };
        store.set("nhi-user", up); return up;
      });
    }
    setHealthData(data); store.set("nhi-healthdata", data); setAppState("main"); setScreen("home");
  }, []);
  const handleSkip = useCallback(() => { setHealthData(null); setAppState("main"); setScreen("home"); }, []);
  const handleToggleMed = useCallback((id) => { setTakenMap(p => { const n = { ...p, [id]: !p[id] }; store.set("nhi-taken", n); return n; }); }, []);
  const handleAddAppt = useCallback((appt) => { setAppts(p => { const n = [...p, appt]; store.set("nhi-appointments", n); return n; }); }, []);
  const handleClear = useCallback(() => { ["nhi-apikey", "nhi-user", "nhi-healthdata", "nhi-appointments", "nhi-taken", "nhi-install-shown"].forEach(k => store.del(k)); setApiKey(null); setCurrentUser(null); setHealthData(null); setAppts([]); setTakenMap({}); setAppState("apikey"); }, []);
  const handleChangeApiKey = useCallback(() => { store.del("nhi-apikey"); setApiKey(null); setAppState("apikey"); }, []);

  const meds = healthData?.medications || [];

  if (appState === "splash") return <Splash />;
  if (appState === "apikey") return <ApiKeySetup onDone={handleApiKey} />;
  if (appState === "install") return <InstallGuide onDone={() => { store.set("nhi-install-shown", true); setAppState("login"); }} />;
  if (appState === "login") return <LoginScreen onLogin={handleLogin} />;
  if (appState === "import") return <NHIImportScreen user={currentUser} apiKey={apiKey} onImported={handleImported} onSkip={handleSkip} />;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", fontFamily: "'Noto Sans TC',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600;700;800&display=swap" rel="stylesheet" />
      {!isOnline && <div style={{ background: C.amber, color: "#fff", textAlign: "center", padding: "7px", fontSize: 12, fontWeight: 700, position: "sticky", top: 0, zIndex: 100 }}>📴 目前離線，已儲存資料仍可查看</div>}
      {screen === "home" && <Dashboard setScreen={setScreen} user={currentUser} healthData={healthData} />}
      {screen === "records" && <RecordsScreen setScreen={setScreen} records={healthData?.records || []} />}
      {screen === "meds" && <MedsScreen setScreen={setScreen} medications={meds} takenMap={takenMap} onToggle={handleToggleMed} />}
      {screen === "appts" && <ApptsScreen setScreen={setScreen} appts={appts} onAdd={handleAddAppt} />}
      {screen === "ai" && <AIScreen setScreen={setScreen} user={currentUser} healthData={healthData} apiKey={apiKey} />}
      {screen === "import" && <NHIImportScreen user={currentUser} apiKey={apiKey} onImported={handleImported} onSkip={handleSkip} />}
      {screen === "settings" && <SettingsScreen setScreen={setScreen} user={currentUser} healthData={healthData} apiKey={apiKey} onClearData={handleClear} onChangeApiKey={handleChangeApiKey} />}
      {screen !== "ai" && <BottomNav screen={screen} setScreen={setScreen} />}
    </div>
  );
}
