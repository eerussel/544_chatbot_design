// ========= DOM refs =========
const el = {
  year: document.getElementById("year"),
  msgs: document.getElementById("messages"),
  form: document.getElementById("composer"),
  input: document.getElementById("input"),
  chips: document.getElementById("chips"),
  filterCampus: document.getElementById("filterCampus"),
  filterDegree: document.getElementById("filterDegree"),
};

el.year.textContent = new Date().getFullYear();

// ========= State =========
let MAJORS = [];
let lastContext = [];

// ========= Backend configuration =========
// Try the API first; if it fails, we fall back to local recommendations.
const USE_BACKEND = true; 
const BACKEND_URL = "https://asu-mistral-relay.erine-rmann.workers.dev"; // <-- replace with your Worker URL

// ========= Load majors.json =========
(async () => {
  try {
    MAJORS = await fetch("./majors.json").then(r => r.json());
    console.log(`✅ Loaded ${MAJORS.length} majors`);
    greet();
  } catch (e) {
    console.error("❌ Error loading majors.json:", e);
    bot(`I couldn’t load the majors data. Make sure <code>majors.json</code> is next to <code>index.html</code>.`);
  }
})();

// ========= Greeting =========
function greet(){
  bot(
    `Hi! I’m your ASU Major Finder. Tell me what you enjoy, your strengths, or goals (e.g., “I like psychology and design, not much math”). You can also tap a quick chip.`
  );
}

// ========= UI helpers =========
function scrollToEnd(){ el.msgs.scrollTop = el.msgs.scrollHeight; }
function user(text){
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  el.msgs.appendChild(div);
  scrollToEnd();
}
function bot(html){
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = `<div class="bubble">${html}</div>`;
  el.msgs.appendChild(div);
  scrollToEnd();
}
function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// ========= Chips =========
el.chips.addEventListener("click", e => {
  if(e.target.classList.contains("chip")){
    el.input.value = e.target.textContent;
    el.form.requestSubmit();
  }
});

// ========= Local scoring & recommend =========
function findRelevantMajors(query, { campus="", degree="" } = {}){
  const q = query.toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);

  const scored = MAJORS
    .filter(m => {
      const degreeOk = !degree || (m.degree || "").toLowerCase() === degree.toLowerCase();
      const campusOk = !campus || (m.tags || []).some(t => t.toLowerCase() === campus.toLowerCase());
      return degreeOk && campusOk;
    })
    .map(m => {
      const hay = `${m.name || ""} ${(m.college || "")} ${(m.tags||[]).join(" ")}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 5;
      score += tokens.reduce((acc,t) => acc + (hay.includes(t) ? 1 : 0), 0);
      if (m.degree && q.includes(m.degree.toLowerCase())) score += 2;
      return { m, score };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 6)
    .map(x => x.m);

  if (scored.length === 0) {
    return MAJORS
      .filter(m => (degree ? (m.degree||"").toLowerCase() === degree.toLowerCase() : true))
      .slice(0,6);
  }
  return scored;
}

function localRecommend(userQ, ctx){
  if (!ctx.length) {
    return `I didn’t find a clear match. Try a bit more detail (e.g., “I like biology and helping people, not much coding”) or adjust filters.`;
  }
  const items = ctx.map(r => {
    const tags = (r.tags || []).slice(0,4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const degree = r.degree ? ` • ${r.degree}` : "";
    const college = r.college ? `<div class="meta">${escapeHtml(r.college)}</div>` : "";
    const url = r.url ? `<a href="${r.url}" target="_blank" rel="noopener">Program page</a>` : "";
    return `
      <div class="rec">
        <div class="name">${escapeHtml(r.name)}${degree}</div>
        ${college}
        <div class="meta">${url}</div>
        <div>${tags}</div>
      </div>`;
  }).join("");

  return `
    <div class="title">Here are a few ASU majors that may fit:</div>
    <div class="rec-list">${items}</div>
    <div class="meta" style="margin-top:8px">Tip: add interests (“lab research”, “UX”, “sports business”), a dislike (“not a lot of math”), or a goal (“medical school”).</div>
  `;
}

// ========= Backend call (with timeout) =========
async function callBackend(userQ, ctxMajors, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(BACKEND_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        messages: [{ role:"user", content: userQ }],
        contextMajors: ctxMajors
      }),
      signal: ctrl.signal
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(t);
  }
}

// ========= API-first, fallback-second =========
async function getReply(userText, ctx) {
  if (!USE_BACKEND) return localRecommend(userText, ctx);
  try {
    const apiText = await callBackend(userText, ctx);
    if (apiText && apiText.trim()) return replyToHtml(apiText, ctx);
    // Empty/odd response -> fallback
    bot(`<div class="meta">⚠️ The Mistral API returned no content. Showing local recommendations.</div>`);
    return localRecommend(userText, ctx);
  } catch (e) {
    console.warn("API failed, falling back:", e);
    bot(`<div class="meta">⚠️ The Mistral API is unavailable. Showing local recommendations.</div>`);
    return localRecommend(userText, ctx);
  }
}

// ========= Simple renderer for model text =========
function replyToHtml(text /*, ctx */) {
  return String(text)
    .replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>"); // Add this line to convert single newlines to <br>
}

// ========= Thinking indicator =========
function showThinking() {
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = `<div class="bubble thinking">
    <span>🤔</span> Thinking<span class="dots">...</span>
  </div>`;
  el.msgs.appendChild(div);
  scrollToEnd();
  
  // Animate dots
  let dots = 0;
  const interval = setInterval(() => {
    dots = (dots + 1) % 4;
    const dotsSpan = div.querySelector('.dots');
    if (dotsSpan) dotsSpan.textContent = '.'.repeat(dots);
  }, 500);
  
  return { el: div, stop: () => clearInterval(interval) };
}

// ========= Submit handler (uses getReply) =========
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text) return;

  user(text);
  el.input.value = "";

  const campus = el.filterCampus.value;
  const degree = el.filterDegree.value;
  const ctx = findRelevantMajors(text, { campus, degree });
  lastContext = ctx;

  const thinking = showThinking();
  const replyHtml = await getReply(text, ctx);
  thinking.stop();
  thinking.el.remove();
  bot(replyHtml);
});

