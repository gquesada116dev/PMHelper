import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
import ReactMarkdown from "react-markdown";
import {
  LayoutDashboard, Users, User, Layers, BookOpen, Bug, Palette,
  UserCheck, Calendar, Bot, Plus, ChevronDown, X, Sparkles, Send,
  Check, Edit2, Trash2, Zap, ChevronRight, AlertCircle, TrendingUp,
  Activity, Flag, Globe, Shield, Clock, Hash, Target, Loader,
  MoreVertical, ArrowRight, CheckCircle2, Circle, Link, Link2, ExternalLink,
  Settings, Unlink, Search, Map, Cpu, FileText, DollarSign, Presentation,
  ChevronUp, Copy, GripVertical, BarChart2, GitBranch, Package, Rocket,
  ClipboardList, Lightbulb, Compass, ArrowUpRight, Upload
} from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);

async function askClaude(messages, system = "", maxTokens = 1000) {
  try {
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, maxTokens }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return d.text;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// ─── Jira API ────────────────────────────────────────────────────────────────
function jiraAuth(j) { return "Basic " + btoa(j.email + ":" + j.apiToken); }

async function jiraRequest(jira, path, method = "GET", body = null) {
  const base = jira.baseUrl.replace(/\/$/, "");
  const opts = {
    method,
    headers: { "Authorization": jiraAuth(jira), "Content-Type": "application/json", "Accept": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(base + "/rest/api/3" + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.errorMessages?.[0] || data.message || "HTTP " + r.status);
  return data;
}

function toADF(text) {
  if (!text) return { version: 1, type: "doc", content: [] };
  return { version: 1, type: "doc", content: text.split("\n").map(line => ({ type: "paragraph", content: line.trim() ? [{ type: "text", text: line }] : [] })) };
}

async function pushStoryToJira(jira, story, epicTitle) {
  const desc = [story.description, story.ac && "\nAC:\n" + story.ac, story.oos && "\nOut of scope: " + story.oos].filter(Boolean).join("");
  const fields = { project: { key: jira.projectKey }, summary: story.title, description: toADF(desc), issuetype: { name: "Story" } };
  if ((story.teamPts ?? story.aiPts) && jira.spField) fields[jira.spField] = story.teamPts ?? story.aiPts;
  return jiraRequest(jira, "/issue", "POST", { fields });
}

async function pushBugToJira(jira, bug) {
  const desc = ["Steps:\n" + (bug.steps || ""), "Expected: " + (bug.expected || ""), "Current: " + (bug.current || ""), bug.suggestions && "Dev notes: " + bug.suggestions].filter(Boolean).join("\n\n");
  return jiraRequest(jira, "/issue", "POST", { fields: { project: { key: jira.projectKey }, summary: bug.title, description: toADF(desc), issuetype: { name: "Bug" } } });
}

async function testJiraConn(jira) { return jiraRequest(jira, "/project/" + jira.projectKey); }

// ─── CSV Sync (Export → any tool / Import ← any tool) ───────────────────────

const SUPPORTED_TOOLS = [
  { id: "jira",    label: "Jira",         domain: "atlassian.net",   color: "#0052cc" },
  { id: "linear",  label: "Linear",       domain: "linear.app",      color: "#5e6ad2" },
  { id: "github",  label: "GitHub Issues",domain: "github.com",      color: "#172b4d" },
  { id: "shortcut",label: "Shortcut",     domain: "app.shortcut.com",color: "#a855f7" },
  { id: "azure",   label: "Azure DevOps", domain: "dev.azure.com",   color: "#0078d4" },
  { id: "notion",  label: "Notion",       domain: "notion.so",       color: "#172b4d" },
];

function detectTool(url) {
  if (!url) return null;
  return SUPPORTED_TOOLS.find(t => url.includes(t.domain)) || null;
}

function parseProjectUrl(url) {
  if (!url) return {};
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    const domain = u.hostname;
    // Jira: extract project key from path like /browse/CAB or /jira/software/projects/CAB
    const jiraKey = url.match(/\/(?:browse|projects)\/([A-Z][A-Z0-9]+)/)?.[1];
    return { domain: u.origin, projectKey: jiraKey || "" };
  } catch { return {}; }
}

function toCSV(rows) {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? "").replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    }).join(",")
  ).join("\n");
}

function exportStoriesToCSV(stories, epics, tool) {
  const epicOf = id => epics.find(e => e.id === id)?.title || "";
  const headers = tool?.id === "jira"
    ? ["Summary","Issue Type","Description","Acceptance Criteria","Story Points","Epic Link","Labels","Out of Scope","Dependencies"]
    : ["Title","Type","Description","Acceptance Criteria","Story Points","Epic","Labels","Out of Scope","Dependencies"];
  const rows = stories.map(s => [
    s.title,
    "Story",
    s.description || "",
    s.ac || "",
    s.teamPts ?? s.aiPts ?? "",
    epicOf(s.epicId),
    (s.title.match(/\[(FE|BE|FS|Mobile|Designer)\]/)?.[1] || ""),
    s.oos || "",
    s.deps || "",
  ]);
  return toCSV([headers, ...rows]);
}

function exportBugsToCSV(bugs, tool) {
  const headers = tool?.id === "jira"
    ? ["Summary","Issue Type","Description","Steps to Reproduce","Expected Behavior","Current Behavior","Labels"]
    : ["Title","Type","Description","Steps","Expected","Current","Labels"];
  const rows = bugs.map(b => [
    b.title,
    "Bug",
    [b.steps && "Steps:\n" + b.steps, b.expected && "Expected: " + b.expected, b.current && "Current: " + b.current, b.suggestions && "Dev notes: " + b.suggestions].filter(Boolean).join("\n\n"),
    b.steps || "",
    b.expected || "",
    b.current || "",
    (b.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1] || ""),
  ]);
  return toCSV([headers, ...rows]);
}

function copyStoryForTool(s, epic, tool) {
  const toolId = tool?.id || "generic";
  if (toolId === "jira") {
    return `*${s.title}*\n\n*Description:*\n${s.description || ""}\n\n*Acceptance Criteria:*\n${s.ac || ""}\n\n*Epic:* ${epic || ""}\n*Story Points:* ${s.teamPts ?? s.aiPts ?? "—"}\n${s.oos ? "*Out of Scope:* " + s.oos : ""}`.trim();
  }
  if (toolId === "linear") {
    return `**${s.title}**\n\n${s.description || ""}\n\n## Acceptance Criteria\n${s.ac || ""}\n\nEpic: ${epic || ""} | Points: ${s.teamPts ?? s.aiPts ?? "—"}`.trim();
  }
  if (toolId === "github") {
    return `## ${s.title}\n\n${s.description || ""}\n\n### Acceptance Criteria\n\`\`\`\n${s.ac || ""}\n\`\`\`\n\n**Epic:** ${epic || ""}  **Points:** ${s.teamPts ?? s.aiPts ?? "—"}`.trim();
  }
  // generic markdown
  return `## ${s.title}\n\n${s.description || ""}\n\n### Acceptance Criteria\n${s.ac || ""}\n\nEpic: ${epic || ""} | Points: ${s.teamPts ?? s.aiPts ?? "—"}`.trim();
}

function copyBugForTool(b, tool) {
  const toolId = tool?.id || "generic";
  if (toolId === "jira") {
    return `*${b.title}*\n\n*Steps to Reproduce:*\n${b.steps || ""}\n\n*Expected:* ${b.expected || ""}\n*Current:* ${b.current || ""}\n${b.suggestions ? "*Dev Notes:* " + b.suggestions : ""}`.trim();
  }
  return `## ${b.title}\n\n**Steps:**\n${b.steps || ""}\n\n**Expected:** ${b.expected || ""}\n**Current:** ${b.current || ""}\n${b.suggestions ? "**Dev Notes:** " + b.suggestions : ""}`.trim();
}

function fuzzyMatch(a, b) {
  const clean = s => s.toLowerCase().replace(/\[.*?\]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
  const ca = clean(a), cb = clean(b);
  if (ca === cb) return 1;
  if (ca.includes(cb) || cb.includes(ca)) return 0.8;
  const wordsA = new Set(ca.split(/\s+/));
  const wordsB = cb.split(/\s+/);
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  return overlap / Math.max(wordsA.size, wordsB.length);
}

function matchFromCSV(csvText, stories, bugs) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { matched: 0, updates: [] };
  
  const parseRow = row => {
    const cells = []; let cur = "", inQ = false;
    for (const ch of row + ",") {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    return cells;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const keyCol = headers.findIndex(h => h.includes("key") || h.includes("issueid") || h.includes("id"));
  const sumCol = headers.findIndex(h => h.includes("summary") || h.includes("title") || h.includes("name"));
  const typeCol = headers.findIndex(h => h.includes("type") || h.includes("issuetype"));

  if (keyCol === -1 || sumCol === -1) return { matched: 0, updates: [], error: "Could not find key/summary columns in CSV." };

  const updates = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    const key = cells[keyCol]?.trim();
    const summary = cells[sumCol]?.trim();
    const type = (cells[typeCol] || "").toLowerCase();
    if (!key || !summary) continue;

    const isBug = type.includes("bug");
    const pool = isBug ? bugs : stories;
    let best = null, bestScore = 0;
    for (const item of pool) {
      const score = fuzzyMatch(item.title, summary);
      if (score > bestScore && score > 0.5) { bestScore = score; best = item; }
    }
    if (best) updates.push({ id: best.id, isBug, key, url: "", score: bestScore });
  }
  return { matched: updates.length, updates };
}

// ─── Sync Modal ──────────────────────────────────────────────────────────────
function SyncModal({ project, update, onClose }) {
  const jira = project.jira || {};
  const hasJira = !!jira.connected;

  // Default to Jira tab if already connected, otherwise show all options
  const [tab, setTab] = useState(hasJira ? "jira" : "jira");
  const [toolUrl, setToolUrl] = useState(project.syncUrl || "");
  const [importCSV, setImportCSV] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [exporting, setExporting] = useState(null);
  const fileRef = useRef(null);

  // Jira form state
  const [jiraForm, setJiraForm] = useState({ baseUrl: jira.baseUrl || "", projectKey: jira.projectKey || "", email: jira.email || "", apiToken: jira.apiToken || "", spField: jira.spField || "story_points" });
  const [jiraTesting, setJiraTesting] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState(null);
  const [pushingId, setPushingId] = useState(null);

  const syncTool = detectTool(toolUrl);

  const saveUrl = () => update({ syncUrl: toolUrl });

  const testJira = async () => {
    setJiraTesting(true); setJiraTestResult(null);
    try {
      const data = await testJiraConn(jiraForm);
      setJiraTestResult({ ok: true, msg: 'Connected to "' + data.name + '" (' + data.key + ')' });
    } catch (e) { setJiraTestResult({ ok: false, msg: e.message }); }
    setJiraTesting(false);
  };

  const saveJira = () => { update({ jira: { ...jiraForm, connected: true } }); };
  const disconnectJira = () => { update({ jira: null }); };

  const pushStory = async (s) => {
    if (!hasJira) return;
    setPushingId(s.id);
    try {
      const epic = project.epics.find(e => e.id === s.epicId)?.title;
      const result = await pushStoryToJira(jira, s, epic);
      const key = result.key;
      const url = jira.baseUrl.replace(/\/$/, "") + "/browse/" + key;
      update({ stories: project.stories.map(x => x.id === s.id ? { ...x, trackerKey: key, trackerUrl: url } : x) });
    } catch (e) { alert("Jira error: " + e.message); }
    setPushingId(null);
  };

  const pushBug = async (b) => {
    if (!hasJira) return;
    setPushingId(b.id);
    try {
      const result = await pushBugToJira(jira, b);
      const key = result.key;
      const url = jira.baseUrl.replace(/\/$/, "") + "/browse/" + key;
      update({ bugs: project.bugs.map(x => x.id === b.id ? { ...x, trackerKey: key, trackerUrl: url } : x) });
    } catch (e) { alert("Jira error: " + e.message); }
    setPushingId(null);
  };

  const downloadCSV = (content, filename) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportStories = () => {
    saveUrl();
    downloadCSV(exportStoriesToCSV(project.stories, project.epics, syncTool), project.name.replace(/\s+/g, "_") + "_stories.csv");
    setExporting("stories"); setTimeout(() => setExporting(null), 2000);
  };

  const exportBugs = () => {
    saveUrl();
    downloadCSV(exportBugsToCSV(project.bugs, syncTool), project.name.replace(/\s+/g, "_") + "_bugs.csv");
    setExporting("bugs"); setTimeout(() => setExporting(null), 2000);
  };

  const handleImportFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImportCSV(ev.target.result);
    reader.readAsText(file);
  };

  const runImport = () => setImportResult(matchFromCSV(importCSV, project.stories, project.bugs));

  const applyImport = () => {
    if (!importResult) return;
    const su = importResult.updates.filter(u => !u.isBug);
    const bu = importResult.updates.filter(u => u.isBug);
    if (su.length) update({ stories: project.stories.map(s => { const m = su.find(u => u.id === s.id); return m ? { ...s, trackerKey: m.key } : s; }) });
    if (bu.length) update({ bugs: project.bugs.map(b => { const m = bu.find(u => u.id === b.id); return m ? { ...b, trackerKey: m.key } : b; }) });
    setImportResult({ ...importResult, applied: true });
  };

  const tabStyle = t => ({
    padding: "7px 14px", background: tab === t ? "#e8f0fe" : "transparent",
    border: tab === t ? "1px solid #dfe1e6" : "1px solid transparent",
    borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? "#172b4d" : "#8993a4", fontFamily: "'DM Sans',sans-serif",
  });

  return (
    <Modal wide title="Tracker Integration" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button style={tabStyle("jira")}>
          <span onClick={() => setTab("jira")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasJira ? "#36b37e" : "#8993a4" }} />
            Jira {hasJira ? "(connected)" : "API"}
          </span>
        </button>
        <button style={tabStyle("export")} onClick={() => setTab("export")}>↓ Export CSV</button>
        <button style={tabStyle("import")} onClick={() => setTab("import")}>↑ Import CSV</button>
      </div>

      {/* ── JIRA TAB ── */}
      {tab === "jira" && (
        <div>
          {hasJira ? (
            <div>
              <div style={{ padding: "12px 14px", background: "rgba(54,179,126,.07)", border: "1px solid rgba(54,179,126,.2)", borderRadius: 8, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#36b37e", fontWeight: 600 }}>Connected to Jira</div>
                  <div style={{ fontSize: 12, color: "#8993a4", marginTop: 2 }}>{jira.baseUrl} · Project: {jira.projectKey}</div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={disconnectJira}>Disconnect</button>
              </div>

              <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 16, lineHeight: 1.65 }}>Push individual items directly to Jira. Once pushed, the Jira key is saved and shown on the item.</p>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Stories</div>
                {project.stories.length === 0 ? <div style={{ fontSize: 12, color: "#b3bac5" }}>No stories yet</div> :
                  project.stories.map(s => {
                    const isPushing = pushingId === s.id;
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #ebecf0" }}>
                        <span style={{ flex: 1, fontSize: 12, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                        {s.trackerKey && <a href={s.trackerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#0052cc", fontFamily: "'DM Mono',monospace", textDecoration: "none" }}>{s.trackerKey} ↗</a>}
                        <button className="btn btn-ghost btn-xs" onClick={() => pushStory(s)} disabled={isPushing || !!s.trackerKey} style={{ flexShrink: 0, color: s.trackerKey ? "#36b37e" : "#8993a4" }}>
                          {isPushing ? "Pushing..." : s.trackerKey ? <><Check size={10} /> Pushed</> : <><Link size={10} /> Push</>}
                        </button>
                      </div>
                    );
                  })
                }
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Bugs</div>
                {project.bugs.length === 0 ? <div style={{ fontSize: 12, color: "#b3bac5" }}>No bugs yet</div> :
                  project.bugs.map(b => {
                    const isPushing = pushingId === b.id;
                    return (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #ebecf0" }}>
                        <span className="tag tag-BUG" style={{ flexShrink: 0, fontSize: 9 }}>BUG</span>
                        <span style={{ flex: 1, fontSize: 12, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                        {b.trackerKey && <a href={b.trackerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#0052cc", fontFamily: "'DM Mono',monospace", textDecoration: "none" }}>{b.trackerKey} ↗</a>}
                        <button className="btn btn-ghost btn-xs" onClick={() => pushBug(b)} disabled={isPushing || !!b.trackerKey} style={{ flexShrink: 0, color: b.trackerKey ? "#36b37e" : "#8993a4" }}>
                          {isPushing ? "Pushing..." : b.trackerKey ? <><Check size={10} /> Pushed</> : <><Link size={10} /> Push</>}
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          ) : (
            <div>
              <div style={{ background: "rgba(232,197,71,.1)", border: "1px solid rgba(232,197,71,.15)", borderRadius: 8, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: "#7a6000", lineHeight: 1.65 }}>
                API token stays in your browser only — never sent anywhere except your own Jira instance.
                Generate one at <span style={{ color: "#0052cc" }}>id.atlassian.com → Security → API tokens</span>.
              </div>
              <div className="field"><label>Jira Base URL</label><input value={jiraForm.baseUrl} onChange={e => setJiraForm(f => ({ ...f, baseUrl: e.target.value }))} placeholder="https://yourcompany.atlassian.net" /></div>
              <div className="row">
                <div className="field"><label>Project Key</label><input value={jiraForm.projectKey} onChange={e => setJiraForm(f => ({ ...f, projectKey: e.target.value.toUpperCase() }))} placeholder="CAB" /></div>
                <div className="field"><label>Story Points Field</label><input value={jiraForm.spField} onChange={e => setJiraForm(f => ({ ...f, spField: e.target.value }))} placeholder="story_points" /></div>
              </div>
              <div className="field"><label>Atlassian Email</label><input value={jiraForm.email} onChange={e => setJiraForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.com" type="email" /></div>
              <div className="field"><label>API Token</label><input value={jiraForm.apiToken} onChange={e => setJiraForm(f => ({ ...f, apiToken: e.target.value }))} type="password" placeholder="Your Atlassian API token" /></div>
              {jiraTestResult && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: jiraTestResult.ok ? "rgba(54,179,126,.08)" : "rgba(222,53,11,.06)", border: "1px solid " + (jiraTestResult.ok ? "rgba(54,179,126,.2)" : "rgba(222,53,11,.15)"), fontSize: 13, color: jiraTestResult.ok ? "#36b37e" : "#de350b", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  {jiraTestResult.ok ? <Check size={13} /> : <AlertCircle size={13} />} {jiraTestResult.msg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={testJira} disabled={jiraTesting || !jiraForm.baseUrl || !jiraForm.email || !jiraForm.apiToken}>{jiraTesting ? "Testing..." : "Test Connection"}</button>
                <button className="btn btn-primary" onClick={saveJira} disabled={!jiraForm.baseUrl || !jiraForm.projectKey || !jiraForm.email || !jiraForm.apiToken}>Save & Connect</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EXPORT TAB ── */}
      {tab === "export" && (
        <div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Tool URL <span style={{ color: "#b3bac5", fontWeight: 400, textTransform: "none" }}>(optional — auto-formats the CSV)</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={toolUrl} onChange={e => setToolUrl(e.target.value)} onBlur={saveUrl} placeholder="https://yourcompany.atlassian.net/jira/software/projects/CAB" />
              {syncTool && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 7, flexShrink: 0 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: syncTool.color }} /><span style={{ fontSize: 12, color: "#344563", whiteSpace: "nowrap" }}>{syncTool.label}</span></div>}
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 16, lineHeight: 1.65 }}>
            Download a CSV then use your tracker's native importer.
            {syncTool?.id === "jira" && <span style={{ display: "block", marginTop: 4, color: "#97a0af" }}>Jira: Project settings → Import → CSV</span>}
            {syncTool?.id === "linear" && <span style={{ display: "block", marginTop: 4, color: "#97a0af" }}>Linear: Settings → Import → CSV</span>}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#172b4d", marginBottom: 6 }}>Stories</div>
              <div style={{ fontSize: 12, color: "#8993a4", marginBottom: 14 }}>{project.stories.length} stories — description, AC, points, epic</div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={exportStories} disabled={!project.stories.length}>
                {exporting === "stories" ? <><Check size={13} /> Downloaded!</> : "↓ Export Stories CSV"}
              </button>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#172b4d", marginBottom: 6 }}>Bugs</div>
              <div style={{ fontSize: 12, color: "#8993a4", marginBottom: 14 }}>{project.bugs.length} bugs — steps, expected, current, suggestions</div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={exportBugs} disabled={!project.bugs.length}>
                {exporting === "bugs" ? <><Check size={13} /> Downloaded!</> : "↓ Export Bugs CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === "import" && (
        <div>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 16, lineHeight: 1.65 }}>
            Export a CSV from your tracker and upload it here. We match by title and save the issue keys (e.g. <span style={{ fontFamily: "'DM Mono',monospace", color: "#e8c547" }}>CAB-42</span>) — works with Jira, Linear, GitHub, Shortcut, Azure DevOps.
          </p>
          {!importCSV ? (
            <div>
              <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #c1c7d0", borderRadius: 10, padding: "36px 24px", textAlign: "center", cursor: "pointer", transition: "border-color .15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#e8c547"} onMouseLeave={e => e.currentTarget.style.borderColor = "#c1c7d0"}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
                <div style={{ fontSize: 14, color: "#344563", fontWeight: 500, marginBottom: 4 }}>Drop CSV here or click to upload</div>
                <div style={{ fontSize: 12, color: "#97a0af" }}>Needs a "key" column and a "summary" or "title" column</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImportFile} />
            </div>
          ) : !importResult ? (
            <div>
              <div style={{ padding: "10px 14px", background: "rgba(54,179,126,.07)", border: "1px solid rgba(54,179,126,.2)", borderRadius: 8, fontSize: 13, color: "#36b37e", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>✓ CSV loaded · {importCSV.trim().split("\n").length - 1} rows</span>
                <button className="btn btn-ghost btn-xs" onClick={() => setImportCSV("")}>Change</button>
              </div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={runImport}>Match issue keys →</button>
            </div>
          ) : (
            <div>
              <div style={{ padding: "14px", background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#172b4d", marginBottom: 10 }}>
                  {importResult.error ? <span style={{ color: "#de350b" }}>{importResult.error}</span> : <>{importResult.matched} matched of {importCSV.trim().split("\n").length - 1} rows</>}
                </div>
                {importResult.updates.map((u, i) => {
                  const item = [...project.stories, ...project.bugs].find(x => x.id === u.id);
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderTop: "1px solid #ebecf0" }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#e8c547", minWidth: 70 }}>{u.key}</span>
                      <span style={{ fontSize: 12, color: "#505f79", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.title || "—"}</span>
                      <span style={{ fontSize: 10, color: "#97a0af" }}>{Math.round(u.score * 100)}%</span>
                      {u.isBug && <span className="tag tag-BUG" style={{ fontSize: 9 }}>BUG</span>}
                    </div>
                  );
                })}
              </div>
              {importResult.applied
                ? <div style={{ textAlign: "center", padding: "12px", fontSize: 13, color: "#36b37e" }}><Check size={14} style={{ marginRight: 6 }} /> Keys applied</div>
                : <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setImportResult(null); setImportCSV(""); }}>Start over</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={applyImport} disabled={!importResult.matched}>Apply {importResult.matched} matches</button>
                  </div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const HOLIDAYS = {
  "Costa Rica": [
    { date: "2025-01-01", name: "Año Nuevo" }, { date: "2025-04-11", name: "Día de Juan Santamaría" },
    { date: "2025-04-17", name: "Jueves Santo" }, { date: "2025-04-18", name: "Viernes Santo" },
    { date: "2025-05-01", name: "Día del Trabajo" }, { date: "2025-07-25", name: "Anexión de Guanacaste" },
    { date: "2025-08-02", name: "Virgen de los Ángeles" }, { date: "2025-08-15", name: "Día de la Madre" },
    { date: "2025-09-15", name: "Independencia" }, { date: "2025-12-25", name: "Navidad" },
  ],
  "US": [
    { date: "2025-01-01", name: "New Year's Day" }, { date: "2025-01-20", name: "MLK Day" },
    { date: "2025-02-17", name: "Presidents' Day" }, { date: "2025-05-26", name: "Memorial Day" },
    { date: "2025-06-19", name: "Juneteenth" }, { date: "2025-07-04", name: "Independence Day" },
    { date: "2025-09-01", name: "Labor Day" }, { date: "2025-11-27", name: "Thanksgiving" },
    { date: "2025-11-28", name: "Day after Thanksgiving" }, { date: "2025-12-25", name: "Christmas Day" },
  ],
};

const DEMO = {
  id: "demo1", name: "Nexus Platform", platform: "Web", type: "Greenfield",
  industry: "FinTech", teamSize: 8, velocity: 42, designVelocity: 20,
  about: "Internal financial operations and reporting platform for mid-size enterprises.",
  assumptions: ["Users are internal finance staff", "SSO via company IdP", "Data from existing ERP"],
  risks: ["Legacy ERP dependencies", "Aggressive Q3 deadline", "High security requirements"],
  stakeholders: [
    { id: uid(), name: "Ana Rodríguez", role: "CEO", influence: "High", decision: "Gut-based", notes: "Prefers weekly summaries. Responds to business impact, not features." },
    { id: uid(), name: "Carlos Vega", role: "CTO", influence: "High", decision: "Data-based", notes: "Wants technical depth. Concerned about infra costs." },
    { id: uid(), name: "Mariana Font", role: "PM", influence: "Medium", decision: "Data-based", notes: "Day-to-day contact. Very organized." },
  ],
  personas: [
    { id: uid(), role: "Financial Analyst", description: "Mid-level analyst managing monthly reconciliations across 3 business units.", goals: "Reduce report generation time, centralize data sources", painPoints: "Manual data entry, too many disconnected tools", behaviors: "Heavy Excel user, prefers structured step-by-step workflows" },
  ],
  epics: [
    { id: "e1", title: "Authentication & Access Control", description: "SSO, login flows, roles and permission management.", stories: 4 },
    { id: "e2", title: "Financial Dashboard", description: "Real-time KPI cards and metric visualization.", stories: 6 },
    { id: "e3", title: "Report Generation", description: "Automated financial report creation and export.", stories: 3 },
  ],
  stories: [
    { id: uid(), epicId: "e1", title: "[FE] Auth | Login screen", description: 'As a "User" I want to "log in with email and password" so that I can "access my workspace securely"', ac: "GIVEN | The user is on the login page\nWHEN | They enter valid credentials and click Login\nTHEN | They are redirected to the dashboard\nAND | A success notification is displayed", aiPts: 3, teamPts: 2, design: "", oos: "Social login (phase 2)", deps: "", blockers: "" },
    { id: uid(), epicId: "e2", title: "[FE] Dashboard | KPI summary cards", description: 'As a "Financial Analyst" I want to "see KPI cards on the dashboard" so that I can "quickly assess business health"', ac: "GIVEN | The user is logged in and on the dashboard\nWHEN | The page loads\nTHEN | KPI cards are displayed with the latest data", aiPts: 5, teamPts: 5, design: "", oos: "", deps: "", blockers: "" },
    { id: uid(), epicId: "e3", title: "[BE] Reports | PDF export endpoint", description: 'As a "Finance Manager" I want to "export a report as PDF" so that I can "share it with stakeholders offline"', ac: "", aiPts: 8, teamPts: null, design: "", oos: "", deps: "", blockers: "" },
  ],
  bugs: [
    { id: uid(), title: "[BUG FE] Auth | Login CTA unresponsive on mobile Safari", steps: "1. Open on iPhone 14\n2. Enter valid credentials\n3. Tap the Login button", expected: "Redirects to dashboard", current: "Nothing happens. No error shown, no feedback.", evidence: "", suggestions: "Check touch event handlers and pointer-events CSS on the button element" },
  ],
  design: [
    { id: uid(), epicId: "e1", title: "[Design] Auth | Login screen", desc: "Design the login UI following DS tokens and brand guidelines.", objective: "Deliver fully specced, annotated Figma frames for frontend implementation.", scenarios: "Desktop (1440px), Mobile (390px), Error states, Loading state", deliverables: "Figma frames for all states, design token annotations, handoff notes", links: "" },
  ],
  team: [
    { id: uid(), name: "Diego Mora", role: "Frontend Engineer", team: "FE", country: "Costa Rica" },
    { id: uid(), name: "Sarah Kim", role: "Backend Engineer", team: "BE", country: "US" },
    { id: uid(), name: "Roberto Quesada", role: "Fullstack Engineer", team: "FS", country: "Costa Rica" },
    { id: uid(), name: "Priya Nair", role: "Mobile Engineer", team: "Mobile", country: "US" },
    { id: uid(), name: "Valeria Torres", role: "QA Engineer", team: "QA", country: "Costa Rica" },
    { id: uid(), name: "Lucas Herrera", role: "Product Designer", team: "Designer", country: "Costa Rica" },
  ],
  vacations: [],
  sprints: [],
  customHolidays: [],
  jira: null,
  aiRules: ["Use Jira-compatible story format", "Always include at least one AC per story"],
  velocityHistory: [38, 42, 40, 45, 42],
  mode: "delivery",
  jira: null, syncUrl: "", customHolidays: [],
};

const DEMO_DISCOVERY = {
  id: "demo-disc", name: "Lacoste Mobile Commerce", platform: "Mobile", type: "Discovery",
  mode: "discovery", clientType: "enterprise", industry: "Retail / Fashion",
  about: "Lacoste wants to redesign their mobile commerce experience. They have a 60% checkout drop-off rate on mobile and suspect the onboarding and product discovery flows are the root cause. This discovery will map the full mobile journey, identify friction points, and define the MVP scope for a rethink.",
  assumptions: ["Drop-off is concentrated in the checkout flow", "Users are 25-45 year old existing Lacoste customers", "iOS and Android must be in scope", "Integration with existing Salesforce Commerce Cloud is required"],
  risks: [{ text: "Legacy commerce platform limits mobile flexibility", source: "initial" }, { text: "Checkout flow tied to 3rd-party payment provider", source: "initial" }, { text: "Limited access to real user data pre-discovery", source: "initial" }],
  opportunities: [{ text: "Personalization based on purchase history", source: "initial" }, { text: "Loyalty program integration could reduce cart abandonment", source: "initial" }],
  discoveryPhase: "story-mapping",
  sessions: [
    { id: uid(), date: "2025-09-15", title: "Stakeholder Kickoff", participants: "PM, Design Lead, Lacoste CMO, Digital Director", notes: "Reviewed current analytics showing 60% mobile checkout drop-off. CMO confirmed Q1 2026 launch target. Main concern: the redesign must not break existing Salesforce integration.", outputs: { risks: ["Salesforce integration must be preserved"], opportunities: ["Loyalty program not used in mobile yet"], assumptions: ["Users are mostly repeat buyers"], keyDecisions: ["Mobile-first, then desktop"], openQuestions: ["What does the current state architecture look like?"] } },
  ],
  backbone: [
    { id: "b1", stage: "Discovery", description: "User lands on app and discovers products", epics: [{ id: "e1", title: "Onboarding", moscow: "Must", features: [{ id: "f1", title: "Guest browse", moscow: "Must", slice: "mvp" }, { id: "f2", title: "Account creation", moscow: "Must", slice: "mvp" }, { id: "f3", title: "Social login", moscow: "Should", slice: "future" }] }, { id: "e2", title: "Product Discovery", moscow: "Must", features: [{ id: "f4", title: "Search & filters", moscow: "Must", slice: "mvp" }, { id: "f5", title: "AI recommendations", moscow: "Could", slice: "future" }] }] },
    { id: "b2", stage: "Selection", description: "User browses and selects products", epics: [{ id: "e3", title: "PDP", moscow: "Must", features: [{ id: "f6", title: "Product photos & zoom", moscow: "Must", slice: "mvp" }, { id: "f7", title: "Size guide", moscow: "Must", slice: "mvp" }, { id: "f8", title: "AR try-on", moscow: "Won_t", slice: "future" }] }] },
    { id: "b3", stage: "Checkout", description: "User purchases", epics: [{ id: "e4", title: "Cart & Payment", moscow: "Must", features: [{ id: "f9", title: "One-page checkout", moscow: "Must", slice: "mvp" }, { id: "f10", title: "Apple/Google Pay", moscow: "Must", slice: "mvp" }, { id: "f11", title: "Saved addresses", moscow: "Should", slice: "mvp" }] }] },
  ],
  storyMap: [],
  flows: ["Guest browse → Product discovery → PDP → Cart → Checkout", "Account creation → Login → Wishlist → Purchase"],
  personas: [],
  architectureNotes: "Lacoste mobile app connects to Salesforce Commerce Cloud (SCC) as the commerce backbone. A new React Native app will proxy API calls through an API Gateway layer, enabling gradual migration away from SCC-specific patterns without breaking existing integrations.",
  nfrs: [{ category: "Performance", requirement: "App launch under 2s, PDP load under 1s on 4G", priority: "Must" }, { category: "Security", requirement: "PCI-DSS compliance for payment flows, OAuth 2.0 for auth", priority: "Must" }, { category: "Availability", requirement: "99.9% uptime, graceful degradation when SCC is slow", priority: "Must" }, { category: "Compliance", requirement: "GDPR compliance for EU users, cookie consent", priority: "Should" }],
  adrs: [{ title: "React Native for cross-platform mobile", context: "Need iOS and Android with a single codebase and fast iteration", decision: "Use React Native with Expo managed workflow", consequences: "Faster delivery, shared codebase. Trade-off: some native performance limitations for complex animations." }],
  integrations: [{ system: "Salesforce Commerce Cloud", direction: "in/out", auth: "OAuth 2.0 client credentials", notes: "Product catalog, cart, checkout, order management" }, { system: "Stripe", direction: "in", auth: "API key + webhook secret", notes: "Payment processing, Apple Pay, Google Pay" }],
  spikes: ["Confirm SCC API rate limits for mobile search volume", "Evaluate React Native performance with 500+ product images"],
  designResearchPlan: "Research goal: validate that the checkout drop-off is caused by UX friction, not trust or pricing issues.\n\nMethods:\n- 6 moderated usability sessions with existing Lacoste customers (mobile users)\n- Heatmap and session recording review of current app\n- 15-min survey to 200 app users on checkout abandonment reasons\n\nTimeline: Weeks 1-2 research, Week 3 synthesis, Week 4 share-out",
  designPriorities: [{ flow: "Checkout flow (3-step)", reason: "Root cause of 60% drop-off, highest business impact", week: "Week 1-2", dependencies: "Cart API contract from SCC" }, { flow: "PDP (product detail)", reason: "First point of engagement before cart", week: "Week 2-3", dependencies: "Product media CDN specs" }],
  designNextSteps: ["Conduct 6 usability sessions on prototype checkout by sprint 2", "Deliver hi-fi mocks for PDP and checkout by end of month 1", "Align with Lacoste brand team on design system tokens"],
  scenarios: {
    lean: { name: "Lean", description: "Small focused team, longer timeline. Good for cost-sensitive clients.", roles: [{ role: "Product Manager", fte: 1, monthly: 5000 }, { role: "React Native Dev", fte: 2, monthly: 4500 }, { role: "Product Designer", fte: 0.5, monthly: 4000 }, { role: "QA Engineer", fte: 0.5, monthly: 3500 }], sprintVelocity: 28, mvpSprints: 12, mvpMonths: 6, totalCost: 94500, pros: ["Lower monthly burn", "Tight, focused scope"], cons: ["Slower delivery", "Less capacity for unknowns"] },
    balanced: { name: "Balanced", description: "Medium team, realistic pace. Recommended for most enterprise projects.", roles: [{ role: "Product Manager", fte: 1, monthly: 5000 }, { role: "React Native Dev", fte: 3, monthly: 4500 }, { role: "Backend Engineer", fte: 1, monthly: 4500 }, { role: "Product Designer", fte: 1, monthly: 4000 }, { role: "QA Engineer", fte: 1, monthly: 3500 }], sprintVelocity: 42, mvpSprints: 8, mvpMonths: 4, totalCost: 132000, pros: ["Balanced speed and quality", "Can absorb scope changes"], cons: ["Higher monthly cost vs. lean"] },
    accelerated: { name: "Accelerated", description: "Full team, fast delivery. Best when time-to-market is the priority.", roles: [{ role: "Product Manager", fte: 1, monthly: 5000 }, { role: "React Native Dev", fte: 4, monthly: 4500 }, { role: "Backend Engineer", fte: 2, monthly: 4500 }, { role: "Product Designer", fte: 2, monthly: 4000 }, { role: "QA Engineer", fte: 2, monthly: 3500 }, { role: "Tech Lead", fte: 1, monthly: 6000 }], sprintVelocity: 65, mvpSprints: 6, mvpMonths: 3, totalCost: 162000, pros: ["Fastest path to MVP", "Multiple parallel workstreams"], cons: ["Highest burn rate", "Coordination overhead"] },
  },
  presentationNotes: "",
  teamSize: 0, velocity: 0, designVelocity: 0,
  stakeholders: [], epics: [], stories: [], bugs: [], design: [],
  team: [], sprints: [], vacations: [], customHolidays: [],
  jira: null, syncUrl: "", aiRules: [],
};

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c1c7d0;border-radius:2px}::-webkit-scrollbar-track{background:transparent}
body{background:#f4f5f7}
.app{display:flex;height:100vh;background:#f4f5f7;color:#172b4d;font-family:'DM Sans',sans-serif;overflow:hidden;font-size:14px}
.sbar{width:224px;min-width:224px;background:#ffffff;border-right:1px solid #dfe1e6;display:flex;flex-direction:column;height:100vh;overflow:hidden;box-shadow:1px 0 0 #dfe1e6}
.sbar-logo{padding:18px 16px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ebecf0}
.sbar-logo-mark{width:28px;height:28px;background:#e8c547;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sbar-logo h2{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:-.02em;color:#172b4d}
.sbar-logo span{color:#8993a4;font-weight:600}
.sbar-proj-area{padding:10px 10px;border-bottom:1px solid #ebecf0;position:relative}
.sbar-proj-btn{width:100%;display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #dfe1e6;border-radius:8px;padding:8px 10px;cursor:pointer;color:#172b4d;font-size:12px;font-weight:500;font-family:'DM Sans',sans-serif;transition:border-color .15s;text-align:left}
.sbar-proj-btn:hover{border-color:#b3bac5;background:#f1f2f4}
.sbar-proj-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbar-proj-tag{font-size:10px;color:#8993a4;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}
.sbar-dropdown{position:absolute;z-index:200;top:calc(100% - 2px);left:10px;right:10px;background:#ffffff;border:1px solid #dfe1e6;border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(9,30,66,.15)}
.sbar-dropdown-item{padding:9px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;transition:background .12s;color:#172b4d}
.sbar-dropdown-item:hover{background:#f4f5f7}
.sbar-dropdown-item.sel{color:#0052cc;background:#e8f0fe}
.sbar-dropdown-sep{height:1px;background:#ebecf0;margin:4px 0}
.sbar-nav{flex:1;overflow-y:auto;padding:8px 8px}
.nav-section-label{font-size:10px;color:#b3bac5;font-weight:600;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;padding:10px 10px 5px}
.nav-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;cursor:pointer;font-size:13px;color:#8993a4;font-weight:400;transition:all .12s;margin-bottom:1px;border:none;background:none;width:100%;text-align:left;font-family:'DM Sans',sans-serif;line-height:1}
.nav-item:hover{background:#f4f5f7;color:#344563}
.nav-item.active{background:#e8f0fe;color:#0052cc;font-weight:600}
.nav-item.active .nav-icon{color:#0052cc}
.nav-icon{flex-shrink:0;opacity:.8}
.sbar-footer{padding:10px 10px;border-top:1px solid #ebecf0}
.new-proj-btn{width:100%;display:flex;align-items:center;gap:7px;padding:8px 10px;background:rgba(232,197,71,.1);border:1px solid rgba(232,197,71,.4);border-radius:7px;cursor:pointer;color:#7a6000;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;transition:all .15s}
.new-proj-btn:hover{background:rgba(232,197,71,.2);border-color:rgba(232,197,71,.6)}
.main{flex:1;overflow-y:auto;padding:32px 36px 48px;background:#f4f5f7}
.sec-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;gap:16px}
.sec-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:#172b4d;letter-spacing:-.025em;line-height:1.15}
.sec-sub{font-size:12px;color:#97a0af;margin-top:4px;font-weight:400}
.sec-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:none;font-family:'DM Sans',sans-serif;padding:8px 14px;white-space:nowrap;line-height:1}
.btn-primary{background:#e8c547;color:#3d2e00}
.btn-primary:hover{background:#f5d35a;transform:translateY(-1px);box-shadow:0 2px 8px rgba(232,197,71,.4)}
.btn-ghost{background:transparent;color:#505f79;border:1px solid #dfe1e6}
.btn-ghost:hover{background:#f4f5f7;color:#172b4d;border-color:#c1c7d0}
.btn-ai{background:rgba(232,197,71,.1);color:#7a6000;border:1px solid rgba(232,197,71,.4)}
.btn-ai:hover{background:rgba(232,197,71,.2);border-color:rgba(232,197,71,.6)}
.btn-danger{background:transparent;color:#de350b;border:1px solid rgba(222,53,11,.25)}
.btn-danger:hover{background:rgba(222,53,11,.08)}
.btn-sm{padding:5px 10px;font-size:12px}
.btn-xs{padding:3px 8px;font-size:11px}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none!important}
.card{background:#ffffff;border:1px solid #dfe1e6;border-radius:10px;padding:20px;margin-bottom:12px;transition:border-color .15s;box-shadow:0 1px 2px rgba(9,30,66,.06)}
.card:hover{border-color:#b3bac5;box-shadow:0 2px 8px rgba(9,30,66,.08)}
.card-flat{background:#f8f9fa;border:1px solid #ebecf0;border-radius:8px;padding:14px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:#ffffff;border:1px solid #dfe1e6;border-radius:10px;padding:16px 18px;box-shadow:0 1px 2px rgba(9,30,66,.06)}
.stat-num{font-family:'Syne',sans-serif;font-size:32px;font-weight:700;color:#172b4d;line-height:1;letter-spacing:-.02em}
.stat-label{font-size:11px;color:#97a0af;margin-top:5px;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.stat-hint{font-size:11px;margin-top:6px;font-weight:500}
.tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;font-family:'DM Mono',monospace;letter-spacing:.04em;white-space:nowrap;line-height:1.5}
.tag-FE{background:#e3fcef;color:#00632b}
.tag-BE{background:#e6f0ff;color:#0747a6}
.tag-FS{background:#f3e6ff;color:#5b21b6}
.tag-Mobile{background:#fff8e1;color:#7a5c00}
.tag-QA{background:#e6f7ff;color:#0055b3}
.tag-Designer{background:#fff0f6;color:#991b5b}
.tag-BUG{background:#ffebe6;color:#bf2600}
.tag-Design{background:#fff0f6;color:#991b5b}
.tag-accent{background:rgba(232,197,71,.15);color:#7a6000}
.tag-muted{background:#f1f2f4;color:#6b778c}
.tag-green{background:#e3fcef;color:#00632b}
.badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:4px;font-size:10px;font-weight:600;font-family:'DM Mono',monospace;padding:0 4px;background:#f1f2f4;color:#6b778c}
.badge-accent{background:rgba(232,197,71,.15);color:#7a6000}
.divider{height:1px;background:#ebecf0;margin:16px 0}
.row{display:flex;gap:12px}
.row>.field{flex:1;min-width:0}
.field{margin-bottom:14px}
label{font-size:11px;color:#6b778c;font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
input,textarea,select{background:#ffffff;border:2px solid #dfe1e6;color:#172b4d;border-radius:7px;padding:8px 12px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;width:100%;transition:border-color .15s;line-height:1.4}
input:focus,textarea:focus,select:focus{border-color:#4c9aff;box-shadow:0 0 0 2px rgba(76,154,255,.2)}
select option{background:#ffffff;color:#172b4d}
textarea{resize:vertical;min-height:70px}
.modal-ov{position:fixed;inset:0;background:rgba(9,30,66,.55);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(2px)}
.modal{background:#ffffff;border:1px solid #dfe1e6;border-radius:14px;width:620px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(9,30,66,.2)}
.modal-wide{width:780px}
.modal-hd{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #ebecf0;position:sticky;top:0;background:#ffffff;z-index:1}
.modal-hd h3{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#172b4d;letter-spacing:-.02em}
.modal-bd{padding:20px 24px}
.modal-ft{padding:14px 24px;border-top:1px solid #ebecf0;display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:0;background:#ffffff}
.icon-btn{background:transparent;border:none;cursor:pointer;color:#97a0af;padding:5px;border-radius:5px;display:inline-flex;align-items:center;transition:color .12s}
.icon-btn:hover{color:#172b4d;background:#f1f2f4}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px 24px;text-align:center}
.empty-ico{margin-bottom:14px;opacity:.2}
.empty h3{font-size:14px;font-weight:600;color:#8993a4;margin-bottom:5px}
.empty p{font-size:12px;color:#b3bac5}
.ai-bubble{border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:13px;line-height:1.7;max-width:84%;white-space:pre-wrap;word-break:break-word}
.ai-bubble-bot{background:#f4f5f7;color:#344563;margin-right:auto;border-bottom-left-radius:3px;border:1px solid #ebecf0}
.ai-bubble-user{background:#e8c547;color:#3d2e00;margin-left:auto;border-bottom-right-radius:3px;font-weight:500}
.ai-typing{display:inline-flex;align-items:center;gap:4px;padding:8px 12px}
.ai-dot{width:5px;height:5px;border-radius:50%;background:#b3bac5;animation:bounce 1.2s infinite}
.ai-dot:nth-child(2){animation-delay:.2s}
.ai-dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:3px 10px;background:#f1f2f4;border:1px solid #dfe1e6;border-radius:20px;font-size:11px;color:#6b778c}
.progress-bar{height:3px;background:#ebecf0;border-radius:2px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;background:linear-gradient(90deg,#e8c547,#f5d35a);border-radius:2px}
.ac-block{background:#f8f9fa;border:1px solid #ebecf0;border-radius:8px;padding:12px 14px;margin-bottom:8px}
.ac-row{margin-bottom:8px}
.ac-lbl{font-size:10px;color:#97a0af;font-weight:600;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.ac-val{font-size:12px;color:#505f79;line-height:1.5}
.pts-row{display:inline-flex;gap:6px;align-items:center}
.pts-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:5px;font-size:11px;font-family:'DM Mono',monospace}
.pts-ai{background:rgba(232,197,71,.12);color:#7a6000;border:1px solid rgba(232,197,71,.3)}
.pts-team{background:#e3fcef;color:#00632b;border:1px solid #abf5d1}
.pts-empty{background:#f1f2f4;color:#8993a4;border:1px solid #dfe1e6}
.step-dots{display:flex;gap:5px;margin-bottom:20px}
.step-dot{width:6px;height:6px;border-radius:50%;background:#dfe1e6;transition:background .2s}
.step-dot.on{background:#e8c547}
.influence-H{color:#e8c547}
.influence-M{color:#0052cc}
.influence-L{color:#97a0af}
.sprint-lane{background:#f8f9fa;border:1px solid #dfe1e6;border-radius:10px;padding:16px;min-height:120px;flex:1}
.sprint-lane-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#97a0af;margin-bottom:12px;font-family:'DM Mono',monospace}
.sprint-item{background:#ffffff;border:1px solid #dfe1e6;border-radius:7px;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:all .12s;box-shadow:0 1px 2px rgba(9,30,66,.04)}
.sprint-item:hover{border-color:#b3bac5;box-shadow:0 2px 6px rgba(9,30,66,.1)}
.health-row{display:flex;align-items:center;gap:6px;font-size:12px;color:#6b778c;margin-bottom:6px}
.dot-green{width:7px;height:7px;border-radius:50%;background:#36b37e;flex-shrink:0}
.dot-yellow{width:7px;height:7px;border-radius:50%;background:#e8c547;flex-shrink:0}
.dot-red{width:7px;height:7px;border-radius:50%;background:#de350b;flex-shrink:0}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.two-col{grid-template-columns:1fr}.sbar{display:none}.stat-grid{grid-template-columns:1fr 1fr}}
.md-agenda{font-size:13px;color:#344563;line-height:1.8}
.md-agenda h1,.md-agenda h2{font-family:'Syne',sans-serif;font-weight:700;color:#172b4d;margin:18px 0 8px}
.md-agenda h1{font-size:17px}
.md-agenda h2{font-size:14px;border-bottom:1px solid #ebecf0;padding-bottom:5px}
.md-agenda h3{font-size:13px;font-weight:600;color:#0052cc;margin:14px 0 5px}
.md-agenda p{margin:0 0 8px}
.md-agenda ul,.md-agenda ol{padding-left:20px;margin:0 0 10px}
.md-agenda li{margin-bottom:4px}
.md-agenda strong{color:#172b4d;font-weight:600}
.md-agenda em{color:#5e6c84;font-style:italic}
.md-agenda hr{border:none;border-top:1px solid #ebecf0;margin:14px 0}
.md-agenda code{background:#f4f5f7;border-radius:3px;padding:1px 5px;font-family:'DM Mono',monospace;font-size:12px}
`;

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Modal({ title, wide, onClose, children, footer }) {
  return (
    <div className="modal-ov">
      <div className={`modal${wide ? " modal-wide" : ""}`}>
        <div className="modal-hd">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-bd">{children}</div>
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function Empty({ icon, title, sub, action }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <h3>{title}</h3>
      <p>{sub}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

function TeamTag({ team }) {
  return <span className={`tag tag-${team}`}>{team}</span>;
}

function AILoader() {
  return (
    <div className="ai-bubble ai-bubble-bot">
      <div className="ai-typing">
        <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState(null);
  const [section, setSection] = useState("overview");
  const [showNew, setShowNew] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showGraduation, setShowGraduation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("data")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const projs = data.map(row => row.data);
        setProjects(projs);
        setPid(projs[0].id);
        setSection(projs[0].mode === "discovery" ? "d-overview" : "overview");
      } else {
        await supabase.from("projects").insert([
          { id: DEMO.id, data: DEMO },
          { id: DEMO_DISCOVERY.id, data: DEMO_DISCOVERY },
        ]);
        setProjects([DEMO, DEMO_DISCOVERY]);
        setPid(DEMO.id);
        setSection("overview");
      }
      setLoading(false);
    })();
  }, []);

  const project = projects.find(p => p.id === pid);

  const update = useCallback(async (changes) => {
    const updated = { ...projects.find(p => p.id === pid), ...changes };
    setProjects(ps => ps.map(p => p.id === pid ? updated : p));
    const { error } = await supabase.from("projects").update({ data: updated }).eq("id", pid);
    if (error) console.error("Failed to save project to Supabase:", error);
  }, [pid, projects]);

  const handleCreate = useCallback(async (p) => {
    await supabase.from("projects").insert({ id: p.id, data: p });
    setProjects(ps => [...ps, p]);
    setPid(p.id);
    setSection(p.mode === "discovery" ? "d-overview" : "overview");
    setShowNew(false);
  }, []);

  const isDiscovery = project?.mode === "discovery";

  const deliverySections = {
    overview: <Overview project={project} setSection={setSection} onSync={() => setShowSync(true)} />,
    stakeholders: <StakeholdersSection project={project} update={update} />,
    personas: <PersonasSection project={project} update={update} />,
    epics: <EpicsSection project={project} update={update} setSection={setSection} />,
    stories: <StoriesSection project={project} update={update} />,
    bugs: <BugsSection project={project} update={update} />,
    design: <DesignSection project={project} update={update} />,
    team: <TeamSection project={project} update={update} />,
    sprint: <SprintSection project={project} update={update} />,
    ai: <AISection project={project} update={update} />,
  };

  const discoverySections = {
    "d-overview": <DiscoveryOverview project={project} update={update} setSection={setSection} />,
    "d-meetings": <DiscoveryMeetingPrep project={project} update={update} />,
    "d-sessions": <DiscoverySessions project={project} update={update} />,
    "d-insights": <DiscoveryInsights project={project} update={update} />,
    "d-docs": <DiscoveryDocuments project={project} update={update} />,
    "d-todos": <DiscoveryTodos project={project} update={update} />,
    "d-stakeholders": <DiscoveryStakeholders project={project} update={update} />,
    "d-ai": <DiscoveryAIColleague project={project} update={update} />,
    "d-storymap": <StoryMappingSection project={project} update={update} />,
    "d-planning": <DiscoveryPlanning project={project} update={update} />,
    "d-design": <DiscoveryDesign project={project} update={update} />,
    "d-team": <TeamEstimation project={project} update={update} />,
    "d-presentation": <DiscoveryPresentation project={project} update={update}
      onGraduate={() => setShowGraduation(true)} />,
  };

  const sections = isDiscovery ? discoverySections : deliverySections;

  if (loading) {
    return (
      <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
        <style>{STYLE}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "#e8c547", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader size={16} color="#0d0f14" />
          </div>
          <span style={{ color: "#5d6a85", fontSize: 13 }}>Loading your projects…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{STYLE}</style>
      <Sidebar projects={projects} pid={pid} setPid={id => { setPid(id); setSection(projects.find(p => p.id === id)?.mode === "discovery" ? "d-overview" : "overview"); }}
        section={section} setSection={setSection} onNew={() => setShowNew(true)}
        jiraConnected={!!project?.jira?.connected} syncTool={detectTool(project?.syncUrl)} onSync={() => setShowSync(true)}
        isDiscovery={isDiscovery} />
      <main className="main">{project && sections[section]}</main>
      {showNew && (
        <NewProjectModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      {showSync && project && (
        <SyncModal project={project} update={update} onClose={() => setShowSync(false)} />
      )}
      {showGraduation && project && (
        <GraduationWizard
          project={project}
          onClose={() => setShowGraduation(false)}
          onCreateDelivery={async (deliveryProject) => {
            await supabase.from("projects").insert({ id: deliveryProject.id, data: deliveryProject });
            setProjects(ps => [...ps, deliveryProject]);
            setPid(deliveryProject.id);
            setSection("overview");
            setShowGraduation(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ projects, pid, setPid, section, setSection, onNew, jiraConnected, syncTool, onSync, isDiscovery }) {
  const [open, setOpen] = useState(false);
  const proj = projects.find(p => p.id === pid);

  const deliveryNav = [
    { id: "overview", label: "Overview", Icon: LayoutDashboard },
    { id: "stakeholders", label: "Stakeholders", Icon: Users },
    { id: "personas", label: "Personas", Icon: User },
    { id: "epics", label: "Epics", Icon: Layers },
    { id: "stories", label: "Stories", Icon: BookOpen },
    { id: "bugs", label: "Bugs", Icon: Bug },
    { id: "design", label: "Design Tasks", Icon: Palette },
    { id: "team", label: "Team & Capacity", Icon: UserCheck },
    { id: "sprint", label: "Sprint Planning", Icon: Calendar },
    { id: "ai", label: "AI Colleague", Icon: Bot },
  ];

  const discoveryNav = [
    { id: "d-overview", label: "Overview", Icon: Compass, section: null },
    { id: "d-meetings", label: "Meeting Prep", Icon: ClipboardList, section: "DISCOVERY" },
    { id: "d-sessions", label: "Sessions & Outputs", Icon: FileText, section: null },
    { id: "d-insights", label: "Insights", Icon: Lightbulb, section: null },
    { id: "d-docs", label: "Research Docs", Icon: Upload, section: null },
    { id: "d-todos", label: "To Do", Icon: CheckCircle2, section: null },
    { id: "d-stakeholders", label: "Stakeholders", Icon: Users, section: null },
    { id: "d-storymap", label: "Story Mapping", Icon: Map, section: "MAPPING" },
    { id: "d-planning", label: "Tech Planning", Icon: Cpu, section: "PLANNING" },
    { id: "d-design", label: "Design Planning", Icon: Palette, section: null },
    { id: "d-team", label: "Team & Estimation", Icon: BarChart2, section: "DELIVERY" },
    { id: "d-presentation", label: "Client Presentation", Icon: Presentation, section: null },
    { id: "d-ai", label: "AI Colleague", Icon: Bot, section: null },
  ];

  const navItems = isDiscovery ? discoveryNav : deliveryNav;
  let lastSection = null;

  return (
    <div className="sbar">
      <div className="sbar-logo">
        <div className="sbar-logo-mark">
          <Zap size={14} color="#f4f5f7" strokeWidth={2.5} />
        </div>
        <h2>Product<span>OS</span></h2>
      </div>
      <div className="sbar-proj-area">
        <button className="sbar-proj-btn" onClick={() => setOpen(o => !o)}>
          <span className="sbar-proj-name">{proj?.name || "Select project"}</span>
          <span className="sbar-proj-tag">{proj?.platform}</span>
          <ChevronDown size={12} color="#8993a4" />
        </button>
        {open && (
          <div className="sbar-dropdown">
            {projects.map(p => (
              <div key={p.id} className={`sbar-dropdown-item${p.id === pid ? " sel" : ""}`}
                onClick={() => { setPid(p.id); setOpen(false); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {p.mode === "discovery" && <span style={{ fontSize: 9, fontWeight: 700, color: "#7a6000", background: "#fff8e1", padding: "1px 5px", borderRadius: 3, fontFamily: "'DM Mono',monospace" }}>DISC</span>}
                  <span>{p.name}</span>
                </div>
                {p.id === pid && <Check size={12} />}
              </div>
            ))}
            <div className="sbar-dropdown-sep" />
            <div className="sbar-dropdown-item" onClick={() => { onNew(); setOpen(false); }}>
              <span style={{ color: "#e8c547" }}>+ New project</span>
            </div>
          </div>
        )}
      </div>
      <nav className="sbar-nav">
        {isDiscovery && (
          <div style={{ padding: "6px 10px 2px", marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#e8c547", fontFamily: "'DM Mono',monospace", background: "rgba(232,197,71,.12)", padding: "2px 7px", borderRadius: 4 }}>Discovery Mode</span>
          </div>
        )}
        {navItems.map(({ id, label, Icon, section: sectionLabel }) => {
          const showLabel = sectionLabel && sectionLabel !== lastSection;
          if (showLabel) lastSection = sectionLabel;
          return (
            <div key={id}>
              {showLabel && <div className="nav-section-label">{sectionLabel}</div>}
              <button className={`nav-item${section === id ? " active" : ""}`} onClick={() => setSection(id)}>
                <span className="nav-icon"><Icon size={14} /></span>
                {label}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="sbar-footer">
        <button className="new-proj-btn" onClick={onNew}>
          <Plus size={13} /> New Project
        </button>
        {!isDiscovery && (
          <button onClick={onSync} style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: jiraConnected ? "rgba(54,179,126,.07)" : syncTool ? "rgba(0,82,204,.06)" : "transparent", border: "1px solid " + (jiraConnected ? "rgba(54,179,126,.2)" : syncTool ? "rgba(0,82,204,.12)" : "#dfe1e6"), borderRadius: 7, cursor: "pointer", color: jiraConnected ? "#36b37e" : syncTool ? "#0052cc" : "#97a0af", fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", marginTop: 6, transition: "all .15s" }}>
            <Link size={12} />
            {jiraConnected ? "Jira connected" : syncTool ? syncTool.label + " linked" : "Sync with tracker"}
            {(jiraConnected || syncTool) && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: jiraConnected ? "#36b37e" : syncTool?.color, flexShrink: 0 }} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ project, setSection, onSync }) {
  const openBugs = project.bugs.length;
  const totalStories = project.stories.length;
  const donePct = Math.round((project.stories.filter(s => s.teamPts).length / Math.max(totalStories, 1)) * 100);
  const syncTool = detectTool(project.syncUrl);

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">{project.name}</div>
          <div className="sec-sub">{project.platform} · {project.type} · {project.industry}</div>
        </div>
        <div className="sec-actions">
          <span className="tag tag-accent">{project.platform}</span>
          <span className="tag tag-muted">{project.type}</span>
          <button onClick={onSync} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: syncTool ? `1px solid ${syncTool.color}40` : "1px solid #dfe1e6", background: syncTool ? "rgba(54,179,126,.07)" : "transparent", cursor: "pointer", fontSize: 12, color: syncTool ? "#36b37e" : "#8993a4", fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>
            <Link size={12} />
            {syncTool ? syncTool.label + " linked" : "Sync with tracker"}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{project.velocity}</div>
          <div className="stat-label">Velocity</div>
          <div className="stat-hint" style={{ color: "#36b37e" }}>pts / sprint avg</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{project.epics.length}</div>
          <div className="stat-label">Epics</div>
          <div className="stat-hint" style={{ color: "#0052cc" }}>{totalStories} stories total</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{openBugs}</div>
          <div className="stat-label">Open Bugs</div>
          <div className="stat-hint" style={{ color: openBugs > 2 ? "#de350b" : "#36b37e" }}>{openBugs > 0 ? "Needs attention" : "All clear"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{project.team.length || project.teamSize}</div>
          <div className="stat-label">Team Size</div>
          <div className="stat-hint" style={{ color: "#8993a4" }}>{project.team.length ? `${project.team.length} members added` : "No members yet"}</div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 12 }}>Project Health</div>
          <div className="health-row"><div className="dot-green" /> Sprints on track</div>
          <div className="health-row"><div className={openBugs > 2 ? "dot-red" : "dot-yellow"} /> {openBugs} open bugs</div>
          <div className="health-row"><div className="dot-green" /> {project.stakeholders.length} stakeholders mapped</div>
          <div className="health-row"><div className={project.personas.length ? "dot-green" : "dot-yellow"} /> {project.personas.length} persona{project.personas.length !== 1 ? "s" : ""} defined</div>
          <div className="divider" style={{ margin: "12px 0" }} />
          <div style={{ fontSize: 11, color: "#97a0af", marginBottom: 5, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Story coverage</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${donePct}%` }} /></div>
          <div style={{ fontSize: 11, color: "#8993a4", marginTop: 5 }}>{donePct}% estimated</div>
        </div>
        <div className="card">
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 12 }}>About</div>
          <p style={{ fontSize: 13, color: "#505f79", lineHeight: 1.65, marginBottom: 12 }}>{project.about}</p>
          <div style={{ fontSize: 11, color: "#97a0af", marginBottom: 6, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Key Assumptions</div>
          <div className="chips">
            {project.assumptions.map((a, i) => <span key={i} className="chip">{a}</span>)}
          </div>
          <div style={{ fontSize: 11, color: "#97a0af", margin: "10px 0 6px", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Risks</div>
          <div className="chips">
            {project.risks.map((r, i) => <span key={i} className="chip" style={{ borderColor: "rgba(222,53,11,.15)", color: "#de350b" }}>{r}</span>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 14 }}>Epics at a glance</div>
        {project.epics.map(e => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #ebecf0" }}>
            <Layers size={13} color="#8993a4" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: "#344563" }}>{e.title}</span>
            <span className="badge badge-accent">{e.stories}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setSection("stories")}>
              Stories <ChevronRight size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stakeholders ─────────────────────────────────────────────────────────────
function StakeholdersSection({ project, update }) {
  const [modal, setModal] = useState(null);
  const blank = { name: "", role: "", influence: "Medium", decision: "Data-based", notes: "" };
  const [form, setForm] = useState(blank);

  const save = () => {
    if (!form.name.trim()) return;
    if (form.id) {
      update({ stakeholders: project.stakeholders.map(s => s.id === form.id ? form : s) });
    } else {
      update({ stakeholders: [...project.stakeholders, { ...form, id: uid() }] });
    }
    setModal(null);
  };

  const del = id => update({ stakeholders: project.stakeholders.filter(s => s.id !== id) });

  const edit = s => { setForm(s); setModal("edit"); };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Stakeholders</div>
          <div className="sec-sub">Map influence, decision style, and notes for each key stakeholder</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}>
          <Plus size={13} /> Add Stakeholder
        </button>
      </div>

      {project.stakeholders.length === 0 ? (
        <Empty icon={<Users size={36} />} title="No stakeholders yet" sub="Map who needs to be aligned" action={<button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}><Plus size={13} /> Add first stakeholder</button>} />
      ) : (
        project.stakeholders.map(s => (
          <div key={s.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ebecf0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#e8c547", flexShrink: 0 }}>
              {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "#172b4d" }}>{s.name}</span>
                <span className="tag tag-muted">{s.role}</span>
                <span className={`tag influence-${s.influence[0]}`} style={{ background: "transparent", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  ↑ {s.influence}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: s.notes ? 8 : 0 }}>
                <span className="tag tag-muted">{s.decision}</span>
              </div>
              {s.notes && <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.5 }}>{s.notes}</p>}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="icon-btn" onClick={() => edit(s)}><Edit2 size={13} /></button>
              <button className="icon-btn" onClick={() => del(s.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))
      )}

      {modal && (
        <Modal title={form.id ? "Edit Stakeholder" : "New Stakeholder"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="row">
            <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></div>
            <div className="field"><label>Role</label><input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="CEO, PM, User..." /></div>
          </div>
          <div className="row">
            <div className="field"><label>Influence</label><select value={form.influence} onChange={e => setForm(f => ({ ...f, influence: e.target.value }))}><option>High</option><option>Medium</option><option>Low</option></select></div>
            <div className="field"><label>Decision Style</label><select value={form.decision} onChange={e => setForm(f => ({ ...f, decision: e.target.value }))}><option>Data-based</option><option>Gut-based</option><option>Consensus-driven</option></select></div>
          </div>
          <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Key preferences, how to communicate, etc." /></div>
        </Modal>
      )}
    </div>
  );
}

// ─── Personas ─────────────────────────────────────────────────────────────────
function PersonasSection({ project, update }) {
  const [modal, setModal] = useState(null);
  const blank = { role: "", description: "", goals: "", painPoints: "", behaviors: "" };
  const [form, setForm] = useState(blank);

  // Conversational AI creation state
  const [convo, setConvo] = useState([]);
  const [convoInput, setConvoInput] = useState("");
  const [convoStep, setConvoStep] = useState("idle"); // idle | asking | generating | preview
  const [draft, setDraft] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const convoHistory = useRef([]);
  const chatBottom = useRef(null);

  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [convo]);

  const save = () => {
    if (!form.role.trim()) return;
    if (form.id) {
      update({ personas: project.personas.map(p => p.id === form.id ? form : p) });
    } else {
      const dup = project.personas.find(p => p.role.toLowerCase() === form.role.toLowerCase());
      if (dup && !window.confirm(`A "${form.role}" persona already exists. Add anyway?`)) return;
      update({ personas: [...project.personas, { ...form, id: uid() }] });
    }
    setModal(null);
  };

  const del = id => update({ personas: project.personas.filter(p => p.id !== id) });

  const openEdit = p => { setForm(p); setModal("form"); };

  const [suggestError, setSuggestError] = useState(null);
  const [editingSuggestion, setEditingSuggestion] = useState(null); // id being edited inline

  // ── Suggest personas from project ──
  const suggestPersonas = async () => {
    setSuggesting(true);
    setSuggestions([]);
    setSuggestError(null);
    setModal("suggest");

    const result = await askClaude(
      [{
        role: "user",
        content: `Based on this project, suggest 3-4 relevant user personas.

Project name: ${project.name}
Description: ${project.about}
Industry: ${project.industry}
Platform: ${project.platform}
Existing personas already created: ${project.personas.map(p => p.role).join(", ") || "none — suggest all"}

Return a JSON array with 3-4 objects. Each object must have exactly these keys:
- role: job title only (e.g. "Care Partner", "Agency Administrator")
- description: 2-3 sentences about who this person is and their daily context
- goals: comma-separated list of 2-3 things they want to achieve
- painPoints: comma-separated list of 2-3 frustrations or blockers
- behaviors: 1-2 sentences about how they work and what tools they use

Example format:
[
  {
    "role": "Care Partner",
    "description": "...",
    "goals": "...",
    "painPoints": "...",
    "behaviors": "..."
  }
]`
      }],
      "You are a product management expert. Always respond with a valid JSON array and nothing else. No markdown, no explanation, no code fences. Start your response with [ and end with ]."
    );

    setSuggesting(false);

    if (result.startsWith("Error:")) {
      setSuggestError(result);
      return;
    }

    // Try multiple extraction strategies
    let parsed = null;

    // Strategy 1: direct parse
    try { parsed = JSON.parse(result.trim()); } catch {}

    // Strategy 2: extract from code fences
    if (!parsed) {
      const fenced = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) try { parsed = JSON.parse(fenced[1].trim()); } catch {}
    }

    // Strategy 3: find first [ ... ] block
    if (!parsed) {
      const arrMatch = result.match(/\[[\s\S]*\]/);
      if (arrMatch) try { parsed = JSON.parse(arrMatch[0]); } catch {}
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      setSuggestions(parsed.map(p => ({ ...p, id: uid(), _accepted: false })));
    } else {
      setSuggestError("Could not parse the AI response. Try again.");
    }
  };

  const acceptSuggestion = (s) => {
    const dup = project.personas.find(p => p.role.toLowerCase() === s.role.toLowerCase());
    if (dup) { alert(`"${s.role}" already exists.`); return; }
    update({ personas: [...project.personas, { ...s, _accepted: undefined }] });
    setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, _accepted: true } : p));
  };

  // ── Conversational persona creation ──
  const openConvo = () => {
    setConvo([{ role: "ai", text: `Tell me about this persona in your own words — who are they, what do they do, what's their context? Even rough is fine, I'll ask follow-up questions to build the profile.` }]);
    convoHistory.current = [];
    setConvoInput("");
    setConvoStep("asking");
    setDraft(null);
    setModal("convo");
  };

  const sendConvoMsg = async () => {
    const text = convoInput.trim();
    if (!text || convoStep === "generating") return;
    setConvoInput("");
    const userMsg = { role: "user", text };
    setConvo(prev => [...prev, userMsg, { role: "ai", text: "..." }]);
    convoHistory.current = [...convoHistory.current, { role: "user", content: text }];
    setConvoStep("generating");

    const system = `You are a senior PM building a user persona through conversation.
Project: "${project.name}" — ${project.about}
Industry: ${project.industry}. Platform: ${project.platform}.
Existing personas: ${project.personas.map(p => p.role).join(", ") || "none"}.

Rules:
- Ask 1-2 focused clarifying questions per turn until you have enough to build a profile
- When you have enough context (usually after 1-2 exchanges), generate the persona by returning a JSON code block
- The JSON must have keys: role (job title only, no name), description, goals, painPoints, behaviors
- Keep questions short and conversational
- Do NOT add a name — roles/titles only`;

    const reply = await askClaude(convoHistory.current, system);
    convoHistory.current = [...convoHistory.current, { role: "assistant", content: reply }];

    // Check if reply contains a JSON block (persona ready)
    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setDraft(parsed);
        const cleanText = reply.replace(/```(?:json)?\s*[\s\S]*?```/g, "").trim();
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: cleanText || "Here's what I put together — review it below and adjust anything before saving." }]);
        setConvoStep("preview");
      } catch {
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
        setConvoStep("asking");
      }
    } else {
      setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
      setConvoStep("asking");
    }
  };

  const acceptDraft = () => {
    if (!draft) return;
    setForm({ ...blank, ...draft });
    setModal("form");
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Personas</div>
          <div className="sec-sub">Build with AI conversation or let it suggest roles from your project</div>
        </div>
        <div className="sec-actions">
          <button className="btn btn-ghost" onClick={suggestPersonas}><Sparkles size={13} /> Suggest from Project</button>
          <button className="btn btn-ai" onClick={openConvo}><Bot size={13} /> Create with AI</button>
          <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> Add Manually</button>
        </div>
      </div>

      {project.personas.length === 0 ? (
        <Empty icon={<User size={36} />} title="No personas defined"
          sub="Describe a user role in plain language and AI will help you build the profile"
          action={<div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={suggestPersonas}><Sparkles size={13} /> Suggest from Project</button>
            <button className="btn btn-ai" onClick={openConvo}><Bot size={13} /> Create with AI</button>
          </div>} />
      ) : (
        <div className="two-col">
          {project.personas.map(p => (
            <div key={p.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#172b4d" }}>{p.role}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => openEdit(p)}><Edit2 size={13} /></button>
                  <button className="icon-btn" onClick={() => del(p.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#505f79", lineHeight: 1.65, marginBottom: 10 }}>{p.description}</p>
              <div className="divider" style={{ margin: "8px 0" }} />
              {[["Goals", p.goals, "#36b37e"], ["Pain Points", p.painPoints, "#de350b"], ["Behaviors", p.behaviors, "#505f79"]].map(([k, v, c]) => v && (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 12, color: c, lineHeight: 1.55 }}>{v}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Suggest from Project modal ── */}
      {modal === "suggest" && (
        <Modal wide title="Suggested Personas" onClose={() => { setModal(null); setSuggestions([]); setSuggesting(false); setSuggestError(null); }}
          footer={
            !suggesting && (
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                {suggestError
                  ? <button className="btn btn-ai" onClick={suggestPersonas}><Sparkles size={13} /> Try Again</button>
                  : <span style={{ fontSize: 12, color: "#97a0af" }}>{suggestions.filter(s => s._accepted).length} of {suggestions.length} accepted</span>
                }
                <button className="btn btn-ghost" onClick={() => { setModal(null); setSuggestions([]); setSuggestError(null); }}>Done</button>
              </div>
            )
          }>

          {/* Loading */}
          {suggesting && (
            <div style={{ padding: "44px 0", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 16 }}>
                <div className="ai-dot" style={{ width: 8, height: 8 }} />
                <div className="ai-dot" style={{ width: 8, height: 8, animationDelay: ".2s" }} />
                <div className="ai-dot" style={{ width: 8, height: 8, animationDelay: ".4s" }} />
              </div>
              <div style={{ fontSize: 13, color: "#8993a4" }}>Analyzing your project and suggesting relevant personas...</div>
            </div>
          )}

          {/* Error */}
          {!suggesting && suggestError && (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <AlertCircle size={28} color="#de350b" style={{ marginBottom: 12, opacity: .6 }} />
              <div style={{ fontSize: 14, color: "#505f79", marginBottom: 6 }}>Something went wrong</div>
              <div style={{ fontSize: 12, color: "#97a0af", marginBottom: 20 }}>{suggestError}</div>
              <button className="btn btn-ai" onClick={suggestPersonas}><Sparkles size={13} /> Try Again</button>
            </div>
          )}

          {/* Results */}
          {!suggesting && !suggestError && suggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 16, lineHeight: 1.6 }}>
                Based on <strong style={{ color: "#505f79" }}>{project.name}</strong>, here are the personas that likely interact with this product. Edit, then accept.
              </p>
              {suggestions.map(s => (
                <div key={s.id} className="card" style={{ borderColor: s._accepted ? "rgba(54,179,126,.3)" : "#dfe1e6", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    {editingSuggestion === s.id
                      ? <input value={s.role} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, role: e.target.value } : p))} style={{ fontSize: 14, fontWeight: 700, flex: 1, marginRight: 8 }} />
                      : <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#172b4d" }}>{s.role}</span>}
                    {s._accepted
                      ? <span className="tag tag-green"><Check size={10} /> Added</span>
                      : <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditingSuggestion(editingSuggestion === s.id ? null : s.id)}>
                            {editingSuggestion === s.id ? "Done" : <><Edit2 size={11} /> Edit</>}
                          </button>
                          <button className="btn btn-primary btn-xs" onClick={() => acceptSuggestion(s)}>+ Accept</button>
                        </div>}
                  </div>
                  {editingSuggestion === s.id ? (
                    <div>
                      <div className="field"><label>Description</label><textarea value={s.description} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, description: e.target.value } : p))} rows={2} /></div>
                      <div className="field"><label>Goals</label><textarea value={s.goals} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, goals: e.target.value } : p))} rows={2} /></div>
                      <div className="field"><label>Pain Points</label><textarea value={s.painPoints} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, painPoints: e.target.value } : p))} rows={2} /></div>
                      <div className="field" style={{ marginBottom: 0 }}><label>Behaviors</label><textarea value={s.behaviors} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, behaviors: e.target.value } : p))} rows={2} /></div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.65, marginBottom: 10 }}>{s.description}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {[["Goals", s.goals, "#36b37e"], ["Pain Points", s.painPoints, "#de350b"]].map(([k, v, c]) => v && (
                          <div key={k}>
                            <span style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em" }}>{k}: </span>
                            <span style={{ fontSize: 12, color: c }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Conversational AI creation modal ── */}
      {modal === "convo" && (
        <Modal wide title="Create Persona with AI" onClose={() => setModal(null)}
          footer={
            convoStep === "preview" && draft
              ? <><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={acceptDraft}>Edit & Save →</button></>
              : <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          }>
          <div style={{ display: "flex", flexDirection: "column", height: 380 }}>
            {/* Chat area */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
              {convo.map((m, i) => (
                <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                  {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
                </div>
              ))}
              <div ref={chatBottom} />
            </div>

            {/* Draft preview */}
            {convoStep === "preview" && draft && (
              <div style={{ background: "#f8f9fa", border: "1px solid rgba(232,197,71,.2)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Generated Profile — click "Edit & Save" to adjust</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#172b4d", marginBottom: 6 }}>{draft.role}</div>
                <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 6 }}>{draft.description}</div>
                {[["Goals", draft.goals], ["Pain Points", draft.painPoints]].map(([k, v]) => v && (
                  <div key={k} style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{k}: </span>
                    <span style={{ fontSize: 11, color: "#8993a4" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            {convoStep !== "preview" && (
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={convoInput} onChange={e => setConvoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendConvoMsg())}
                  placeholder="Describe this persona... (Enter to send)"
                  disabled={convoStep === "generating"}
                  style={{ flex: 1, minHeight: "unset", height: 40, resize: "none", padding: "10px 12px" }} />
                <button className="btn btn-primary" onClick={sendConvoMsg} disabled={!convoInput.trim() || convoStep === "generating"} style={{ padding: "8px 14px" }}>
                  <Send size={13} />
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Edit / Manual form modal ── */}
      {modal === "form" && (
        <Modal title={form.id ? "Edit Persona" : "New Persona"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Persona</button></>}>
          <div className="field"><label>Role / Title</label><input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Care Partner, Financial Analyst, Agency Admin..." autoFocus /></div>
          <div className="field"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Who is this person? What's their day-to-day context?" /></div>
          <div className="field"><label>Goals</label><textarea value={form.goals} onChange={e => setForm(f => ({ ...f, goals: e.target.value }))} placeholder="What are they trying to achieve?" rows={2} /></div>
          <div className="field"><label>Pain Points</label><textarea value={form.painPoints} onChange={e => setForm(f => ({ ...f, painPoints: e.target.value }))} placeholder="What frustrates or blocks them?" rows={2} /></div>
          <div className="field"><label>Behaviors</label><textarea value={form.behaviors} onChange={e => setForm(f => ({ ...f, behaviors: e.target.value }))} placeholder="How do they work? What tools do they use? What habits?" rows={2} /></div>
        </Modal>
      )}
    </div>
  );
}

// ─── Epics ────────────────────────────────────────────────────────────────────
function parseJSON(raw) {
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw.trim()); } catch {}
  if (!parsed) { const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) try { parsed = JSON.parse(m[1].trim()); } catch {} }
  if (!parsed) { const m = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
  return parsed;
}

function EpicsSection({ project, update, setSection }) {
  const [modal, setModal] = useState(null);
  const blank = { title: "", description: "", stories: 0 };
  const [form, setForm] = useState(blank);

  // Suggest from project
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(null);
  const [clarifyQ, setClarifyQ] = useState(null);
  const [clarifyInput, setClarifyInput] = useState("");

  // Suggest stories per epic
  const [storySuggestEpic, setStorySuggestEpic] = useState(null);
  const [storySuggestions, setStorySuggestions] = useState([]);
  const [suggestingStories, setSuggestingStories] = useState(false);
  const [storySuggestError, setStorySuggestError] = useState(null);

  const save = () => {
    if (!form.title.trim()) return;
    if (form.id) update({ epics: project.epics.map(e => e.id === form.id ? form : e) });
    else update({ epics: [...project.epics, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ epics: project.epics.filter(e => e.id !== id) });

  // ── Suggest epics from project ──
  const suggestEpics = async (extra = "") => {
    setSuggesting(true);
    setSuggestError(null);
    setClarifyQ(null);
    if (!modal) setModal("suggest");

    const projectInfo = `Name: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nPlatform: ${project.platform}\nType: ${project.type}\nExisting epics: ${project.epics.map(e => e.title).join(", ") || "none"}`;
    const hasEnoughInfo = project.about && project.about.length > 30;

    const prompt = hasEnoughInfo
      ? projectInfo + "\n" + (extra ? "Additional context: " + extra + "\n" : "") + "Suggest 3-5 well-scoped epics. Return a JSON array, each object: { title, description }. Start your response with [."
      : projectInfo + "\nThis project description seems thin. Return JSON: { \"question\": \"one short clarifying question about what they're building\" }";

    const result = await askClaude([{ role: "user", content: prompt }],
      "You are a senior PM. Return only valid JSON starting with [ or {. No markdown, no explanation.");
    setSuggesting(false);

    const parsed = parseJSON(result);
    if (!parsed) { setSuggestError("Could not parse response. Try again."); return; }
    if (parsed.question) { setClarifyQ(parsed.question); return; }
    if (Array.isArray(parsed)) {
      setSuggestions(parsed.map(e => ({ ...e, id: uid(), _accepted: false })));
    } else { setSuggestError("Unexpected response format. Try again."); }
  };

  const acceptEpic = s => {
    update({ epics: [...project.epics, { id: uid(), title: s.title, description: s.description, stories: 0 }] });
    setSuggestions(prev => prev.map(e => e.id === s.id ? { ...e, _accepted: true } : e));
  };

  // ── Suggest stories for an epic ──
  const suggestStories = async (epic) => {
    setStorySuggestEpic(epic);
    setStorySuggestions([]);
    setStorySuggestError(null);
    setSuggestingStories(true);
    setModal("stories");

    const teamRoles = [...new Set(project.team.map(t => t.team).filter(t => t !== "QA"))].join(", ") || "FE, BE";
    const personaRoles = project.personas.map(p => p.role).join(", ") || "end user";

    const result = await askClaude([{
      role: "user", content:
        `Epic: "${epic.title}"\nDescription: ${epic.description}\nProject: ${project.name} — ${project.about}\nPlatform: ${project.platform}\nTeam: ${teamRoles}\nPersonas: ${personaRoles}\n\nGenerate 4-6 SMART user stories. Split by team (no QA — test cases are subtasks within stories). Keep AC short (1 scenario each).\nEach object: { "title": "[TEAM] EpicName | Short desc", "description": "As a \\"...\\" I want to \\"...\\" so that I can \\"...\\"", "ac": "Happy path\\nGIVEN | ...\\nWHEN | ...\\nTHEN | ...", "team": "FE|BE|FS|Mobile|Designer", "aiPts": N }\nReturn ONLY a JSON array. Start with [. End with ]. Nothing else.`
    }], "You are a PM. Return ONLY a valid JSON array. Start your response with [ and end with ]. No markdown, no explanation, no text outside the array.", 2500);

    setSuggestingStories(false);
    const parsed = parseJSON(result);
    if (Array.isArray(parsed)) {
      setStorySuggestions(parsed.map(s => ({ ...s, id: uid(), epicId: epic.id, teamPts: null, design: "", oos: "", deps: "", blockers: "", _accepted: false, _editing: false })));
    } else {
      setStorySuggestError("Could not generate stories. Try again.");
    }
  };

  const acceptStory = s => {
    update({ stories: [...project.stories, { ...s, _accepted: undefined, _editing: undefined }] });
    update({ epics: project.epics.map(e => e.id === storySuggestEpic.id ? { ...e, stories: e.stories + 1 } : e) });
    setStorySuggestions(prev => prev.map(x => x.id === s.id ? { ...x, _accepted: true } : x));
  };

  const rejectStory = id => setStorySuggestions(prev => prev.filter(s => s.id !== id));
  const toggleEdit = id => setStorySuggestions(prev => prev.map(s => s.id === id ? { ...s, _editing: !s._editing } : s));
  const editStory = (id, field, val) => setStorySuggestions(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Epics</div>
          <div className="sec-sub">High-level features broken into stories</div>
        </div>
        <div className="sec-actions">
          <button className="btn btn-ghost" onClick={() => suggestEpics()}><Sparkles size={13} /> Suggest from Project</button>
          <button className="btn btn-primary" onClick={() => setModal("chat")}><Plus size={13} /> New Epic</button>
        </div>
      </div>

      {project.epics.length === 0 ? (
        <Empty icon={<Layers size={36} />} title="No epics yet" sub="Let AI suggest epics from your project description, or add one manually."
          action={<div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => suggestEpics()}><Sparkles size={13} /> Suggest from Project</button><button className="btn btn-primary" onClick={() => setModal("chat")}><Plus size={13} /> New Epic</button></div>} />
      ) : (
        project.epics.map(e => (
          <div key={e.id} className="card">
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8c547", flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#172b4d", marginBottom: 4 }}>{e.title}</div>
                <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.55, marginBottom: 10 }}>{e.description}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge badge-accent">{e.stories} stories</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setSection("stories")}>View stories <ChevronRight size={11} /></button>
                  <button className="btn btn-ai btn-xs" onClick={() => suggestStories(e)}><Sparkles size={11} /> Suggest Stories</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button className="icon-btn" onClick={() => { setForm(e); setModal("form"); }}><Edit2 size={13} /></button>
                <button className="icon-btn" onClick={() => del(e.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* ── Suggest Epics modal ── */}
      {modal === "suggest" && (
        <Modal wide title="Suggest Epics from Project" onClose={() => { setModal(null); setSuggestions([]); setSuggestError(null); setClarifyQ(null); }}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#97a0af" }}>{suggestions.filter(s => s._accepted).length} accepted</span>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setSuggestions([]); setSuggestError(null); setClarifyQ(null); }}>Done</button>
            </div>
          }>
          {suggesting && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#8993a4" }}>Analyzing project and generating epics...</div>
            </div>
          )}
          {!suggesting && clarifyQ && (
            <div>
              <div className="ai-bubble ai-bubble-bot" style={{ maxWidth: "100%", marginBottom: 14 }}>{clarifyQ}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={clarifyInput} onChange={e => setClarifyInput(e.target.value)} onKeyDown={e => e.key === "Enter" && clarifyInput.trim() && (suggestEpics(clarifyInput), setClarifyInput(""))} placeholder="Your answer..." autoFocus style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => { suggestEpics(clarifyInput); setClarifyInput(""); }} disabled={!clarifyInput.trim()}>Continue</button>
              </div>
            </div>
          )}
          {!suggesting && suggestError && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 13, color: "#de350b", marginBottom: 12 }}>{suggestError}</div>
              <button className="btn btn-ai" onClick={() => suggestEpics()}><Sparkles size={13} /> Try Again</button>
            </div>
          )}
          {!suggesting && !clarifyQ && suggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 14, lineHeight: 1.6 }}>Accept the epics that fit your project. You can edit them after.</p>
              {suggestions.map(s => (
                <div key={s.id} className="card" style={{ borderColor: s._accepted ? "rgba(54,179,126,.3)" : "#dfe1e6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{s.title}</span>
                    {s._accepted ? <span className="tag tag-green"><Check size={10} /> Added</span> : <button className="btn btn-primary btn-xs" onClick={() => acceptEpic(s)}>+ Accept</button>}
                  </div>
                  <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.55 }}>{s.description}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Suggest Stories per Epic modal ── */}
      {modal === "stories" && storySuggestEpic && (
        <Modal wide title={`Suggest Stories — ${storySuggestEpic.title}`} onClose={() => { setModal(null); setStorySuggestions([]); setStorySuggestEpic(null); }}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#97a0af" }}>{storySuggestions.filter(s => s._accepted).length} stories accepted</span>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setStorySuggestions([]); setStorySuggestEpic(null); }}>Done</button>
            </div>
          }>
          {suggestingStories && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#8993a4" }}>Generating SMART stories split by team...</div>
            </div>
          )}
          {!suggestingStories && storySuggestError && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 13, color: "#de350b", marginBottom: 12 }}>{storySuggestError}</div>
              <button className="btn btn-ai" onClick={() => suggestStories(storySuggestEpic)}><Sparkles size={13} /> Try Again</button>
            </div>
          )}
          {!suggestingStories && storySuggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 14, lineHeight: 1.6 }}>Review and tweak each story before accepting. Rejected ones are removed.</p>
              {storySuggestions.filter(s => !s._accepted).map(s => {
                const tag = s.team || (s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1]);
                return (
                  <div key={s.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: s._editing ? 10 : 6 }}>
                      {tag && <span className={`tag tag-${tag}`} style={{ flexShrink: 0, marginTop: 2 }}>{tag}</span>}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#172b4d" }}>{s.title}</span>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => toggleEdit(s.id)}>{s._editing ? "Done" : <><Edit2 size={11} /> Tweak</>}</button>
                        <button className="btn btn-primary btn-xs" onClick={() => acceptStory(s)}>+ Accept</button>
                        <button className="icon-btn" onClick={() => rejectStory(s.id)}><X size={13} /></button>
                      </div>
                    </div>
                    {s._editing ? (
                      <div>
                        <div className="field"><label>Title</label><input value={s.title} onChange={e => editStory(s.id, "title", e.target.value)} /></div>
                        <div className="field"><label>Description</label><textarea value={s.description} onChange={e => editStory(s.id, "description", e.target.value)} rows={2} /></div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Acceptance Criteria</label><textarea value={s.ac} onChange={e => editStory(s.id, "ac", e.target.value)} rows={4} style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }} /></div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 12, color: "#6b778c", fontStyle: "italic", marginBottom: s.ac ? 8 : 0, lineHeight: 1.5 }}>{s.description}</p>
                        {s.ac && <pre style={{ fontSize: 11, color: "#8993a4", fontFamily: "'DM Mono',monospace", whiteSpace: "pre-wrap", lineHeight: 1.7, background: "#f8f9fa", padding: "8px 10px", borderRadius: 6 }}>{s.ac}</pre>}
                        <div style={{ marginTop: 6 }}><span className="pts-chip pts-ai"><Sparkles size={10} /> {s.aiPts}pts</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
              {storySuggestions.filter(s => s._accepted).length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(54,179,126,.06)", border: "1px solid rgba(54,179,126,.15)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#36b37e", marginBottom: 6, fontFamily: "'DM Mono',monospace" }}>ACCEPTED STORIES</div>
                  {storySuggestions.filter(s => s._accepted).map(s => (
                    <div key={s.id} style={{ fontSize: 12, color: "#8993a4", display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                      <Check size={11} color="#36b37e" />{s.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ── Epic chat creation (new epics only) ── */}
      {modal === "chat" && (
        <EpicChatModal
          project={project}
          onSave={(title, description) => {
            update({ epics: [...project.epics, { id: uid(), title, description, stories: 0 }] });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Edit form (existing epics) ── */}
      {modal === "form" && (
        <Modal title="Edit Epic" onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Epic</button></>}>
          <div className="field"><label>Epic Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus /></div>
          <div className="field"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} /></div>
        </Modal>
      )}
    </div>
  );
}

function EpicChatModal({ project, onSave, onClose }) {
  const [convo, setConvo] = useState([{ role: "ai", text: `What's this epic about? Describe the feature or capability — I'll generate the title and scope from that.` }]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState("asking"); // asking | generating | preview
  const [preview, setPreview] = useState(null);
  const convoHistory = useRef([]);
  const chatBottom = useRef(null);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [convo]);

  const SYSTEM = `You are a senior PM defining an epic for a product backlog.
Project: ${project.name} — ${project.about}
Industry: ${project.industry}, Platform: ${project.platform}
Existing epics: ${project.epics.map(e => e.title).join(", ") || "none"}

When you have a clear picture, return JSON in a code block:
\`\`\`json
{"title": "Epic Title (clear, noun-phrase)", "description": "2-3 sentences: what this epic covers, what problem it solves, what's in/out of scope"}
\`\`\`
Generate immediately from a solid description. Ask at most ONE clarifying question if truly unclear.`;

  const sendMsg = async () => {
    const text = input.trim();
    if (!text || step === "generating") return;
    setInput("");
    setConvo(prev => [...prev, { role: "user", text }, { role: "ai", text: "..." }]);
    convoHistory.current.push({ role: "user", content: text });
    setStep("generating");

    const reply = await askClaude(convoHistory.current, SYSTEM);
    convoHistory.current.push({ role: "assistant", content: reply });

    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setPreview(parsed);
        const clean = reply.replace(/```[\s\S]*?```/g, "").trim();
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: clean || "Here's the epic — looks good?" }]);
        setStep("preview");
      } catch {
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
        setStep("asking");
      }
    } else {
      setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
      setStep("asking");
    }
  };

  return (
    <Modal title="New Epic" onClose={onClose}
      footer={
        step === "preview" && preview
          ? <><button className="btn btn-ghost" onClick={() => setStep("asking")}>Keep chatting</button><button className="btn btn-primary" onClick={() => onSave(preview.title, preview.description)}>Save Epic</button></>
          : <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      }>
      <div style={{ background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 280 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px" }}>
          {convo.map((m, i) => (
            <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
              {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
            </div>
          ))}
          <div ref={chatBottom} />
        </div>

        {step === "preview" && preview && (
          <div style={{ borderTop: "1px solid #dfe1e6", padding: 14, background: "#f1f2f4" }}>
            <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Epic</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#172b4d", marginBottom: 6 }}>{preview.title}</div>
            <div style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.65 }}>{preview.description}</div>
          </div>
        )}

        {step !== "preview" && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #dfe1e6" }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMsg())}
              placeholder="Describe the epic... (Enter to send)" disabled={step === "generating"}
              style={{ flex: 1, minHeight: "unset", height: 38, resize: "none", padding: "9px 12px", fontSize: 13 }} />
            <button className="btn btn-primary" onClick={sendMsg}
              disabled={!input.trim() || step === "generating"} style={{ padding: "8px 14px" }}>
              <Send size={13} />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── AC Renderer ─────────────────────────────────────────────────────────────
function ACBlock({ ac }) {
  if (!ac || !ac.trim()) return null;
  const KEYWORDS = ["GIVEN", "WHEN", "THEN", "AND"];
  const kwColor = { GIVEN: "#0052cc", WHEN: "#5b21b6", THEN: "#36b37e", AND: "#6b778c" };
  const blocks = ac.split(/\n?---\n?/).map(b => b.trim()).filter(Boolean);
  return (
    <div style={{ marginBottom: 8 }}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
        const firstIsSubtitle = lines[0] && !KEYWORDS.some(k => lines[0].startsWith(k));
        const subtitle = firstIsSubtitle ? lines[0] : null;
        const acLines = firstIsSubtitle ? lines.slice(1) : lines;
        return (
          <div key={bi} style={{ marginBottom: bi < blocks.length - 1 ? 10 : 0 }}>
            {subtitle && <div style={{ fontSize: 11, fontWeight: 600, color: "#344563", fontFamily: "'DM Sans',sans-serif", marginBottom: 5, paddingBottom: 4, borderBottom: "1px solid #dfe1e6" }}>{subtitle}</div>}
            {acLines.map((line, li) => {
              const pipeIdx = line.indexOf("|");
              if (pipeIdx === -1) return <div key={li} style={{ fontSize: 11, color: "#8993a4", fontFamily: "'DM Mono',monospace", lineHeight: 1.8 }}>{line}</div>;
              const kw = line.slice(0, pipeIdx).trim();
              const val = line.slice(pipeIdx + 1).trim();
              return (
                <div key={li} style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "'DM Mono',monospace", lineHeight: 1.9 }}>
                  <span style={{ color: kwColor[kw] || "#e8c547", minWidth: 44, fontWeight: 600, flexShrink: 0 }}>{kw}</span>
                  <span style={{ color: "#505f79" }}>{val}</span>
                </div>
              );
            })}
            {bi < blocks.length - 1 && <div style={{ height: 1, background: "#dfe1e6", margin: "8px 0" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stories ──────────────────────────────────────────────────────────────────
function StoriesSection({ project, update }) {
  const [modal, setModal] = useState(null);
  const blank = { title: "", epicId: project.epics[0]?.id || "", description: "", ac: "", aiPts: null, teamPts: null, design: "", oos: "", deps: "", blockers: "" };
  const [form, setForm] = useState(blank);
  const [filterEpic, setFilterEpic] = useState("all");

  // Conversational creation (same pattern as bugs/design)
  const [convo, setConvo] = useState([]);
  const [convoInput, setConvoInput] = useState("");
  const [convoStep, setConvoStep] = useState("idle");
  const convoHistory = useRef([]);
  const chatBottom = useRef(null);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [convo]);

  const stories = project.stories.filter(s => filterEpic === "all" || s.epicId === filterEpic);

  const save = () => {
    if (!form.title.trim()) return;
    if (form.id) update({ stories: project.stories.map(s => s.id === form.id ? form : s) });
    else update({ stories: [...project.stories, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ stories: project.stories.filter(s => s.id !== id) });

  const openNew = () => { setForm(blank); setConvo([]); setConvoInput(""); setConvoStep("idle"); setModal("convo"); };
  const openEdit = s => { setForm(s); setConvo([]); setConvoStep("idle"); setModal("edit"); };

  const epicList = project.epics.map(e => `id:${e.id} → "${e.title}"`).join(", ");
  const teamTags = [...new Set(project.team.map(t => t.team))].join(", ") || "FE, BE, FS, Mobile";
  const AC_FORMAT = `Each scenario:\nSubtitle\nGIVEN | context\nWHEN | action\nTHEN | expected outcome\nAND | optional additional\n---\nNext scenario subtitle\nGIVEN | ...`;

  const STORY_SYSTEM = `You are a senior PM. When the user describes a story, generate the full structured story.
Return JSON in a code block when ready: { "title": "[TEAM] EpicName | Short desc", "epicId": "...", "description": "As a \\"...\\" I want to \\"...\\" so that I can \\"...\\"", "ac": "subtitle\\nGIVEN | ...\\nWHEN | ...\\nTHEN | ...\\nAND | ...\\n---\\nsubtitle2\\nGIVEN | ...", "aiPts": N, "oos": "", "deps": "" }
Available epics: ${epicList}
Available team tags: ${teamTags}
AC format: ${AC_FORMAT}
If unclear, ask ONE short question first. Otherwise generate directly.
${project.aiRules.length ? "Project rules: " + project.aiRules.join("; ") : ""}`;

  const startConvo = async () => {
    const text = convoInput.trim();
    if (!text) return;
    setConvoInput("");
    const userMsg = { role: "user", content: text };
    convoHistory.current = [userMsg];
    setConvo([{ role: "user", text }, { role: "ai", text: "..." }]);
    setConvoStep("generating");
    const reply = await askClaude(convoHistory.current, STORY_SYSTEM);
    convoHistory.current.push({ role: "assistant", content: reply });
    handleReply(reply, [{ role: "user", text }]);
  };

  const sendConvo = async () => {
    const text = convoInput.trim();
    if (!text || convoStep === "generating") return;
    setConvoInput("");
    setConvo(prev => [...prev, { role: "user", text }, { role: "ai", text: "..." }]);
    convoHistory.current.push({ role: "user", content: text });
    setConvoStep("generating");
    const reply = await askClaude(convoHistory.current, STORY_SYSTEM);
    convoHistory.current.push({ role: "assistant", content: reply });
    handleReply(reply, null);
  };

  const handleReply = (reply, prevConvo) => {
    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setForm(f => ({ ...f, ...parsed }));
        const cleanText = reply.replace(/```[\s\S]*?```/g, "").trim();
        const aiMsg = { role: "ai", text: cleanText || "✓ Story ready — review it below before saving." };
        setConvo(prev => [...(prevConvo || prev.slice(0, -1)), aiMsg]);
        setConvoStep("preview");
      } catch {
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
        setConvoStep("asking");
      }
    } else {
      setConvo(prev => [...(prevConvo ? [...prevConvo, { role: "ai", text: reply }] : [...prev.slice(0, -1), { role: "ai", text: reply }])]);
      setConvoStep("asking");
    }
  };

  const epicOf = id => project.epics.find(e => e.id === id)?.title || "—";

  const [improving, setImproving] = useState(null);
  const [copied, setCopied] = useState(null);
  const syncTool = detectTool(project.syncUrl);

  const improveStory = async (s) => {
    setImproving(s.id);
    const epic = project.epics.find(e => e.id === s.epicId);
    const result = await askClaude([{
      role: "user",
      content: `Improve this user story. Make the description clearer, the AC more complete with edge cases, and suggest a better title if needed.\n\nTitle: ${s.title}\nEpic: ${epic?.title || "unknown"}\nDescription: ${s.description}\nAC:\n${s.ac}\n\nReturn JSON: { "title": "...", "description": "...", "ac": "subtitle\\nGIVEN | ...\\nWHEN | ...\\nTHEN | ...\\n---\\nsubtitle2\\n..." }\nOnly return what changed — keep the title if it's good.`
    }], "You are a senior PM. Improve user stories. Return only valid JSON in a code block.", 1500);
    setImproving(null);
    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = jsonMatch ? parseJSON(jsonMatch[1]) : parseJSON(result);
    if (parsed) update({ stories: project.stories.map(x => x.id === s.id ? { ...x, ...parsed } : x) });
  };

  const copyStory = (s) => {
    const epic = project.epics.find(e => e.id === s.epicId)?.title || "";
    navigator.clipboard.writeText(copyStoryForTool(s, epic, syncTool)).then(() => {
      setCopied(s.id); setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Stories</div><div className="sec-sub">{stories.length} stories{filterEpic !== "all" ? " in this epic" : " total"}</div></div>
        <div className="sec-actions">
          <select style={{ width: 180 }} value={filterEpic} onChange={e => setFilterEpic(e.target.value)}>
            <option value="all">All Epics</option>
            {project.epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New Story</button>
        </div>
      </div>

      {stories.length === 0 ? (
        <Empty icon={<BookOpen size={36} />} title="No stories yet" sub="Describe what you need and AI will name and structure it" action={<button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New Story</button>} />
      ) : (
        stories.map(s => {
          const tag = s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1];
          const isImproving = improving === s.id;
          const isCopied = copied === s.id;
          const hasKey = s.trackerKey;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#ffffff", border: `1px solid ${hasKey ? "rgba(0,82,204,.12)" : "#dfe1e6"}`, borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = hasKey ? "rgba(0,82,204,.25)" : "#c1c7d0"} onMouseLeave={e => e.currentTarget.style.borderColor = hasKey ? "rgba(0,82,204,.12)" : "#dfe1e6"}>
              {tag && <TeamTag team={tag} />}
              <span style={{ flex: 1, fontSize: 13, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
              {hasKey && <span style={{ fontSize: 11, color: "#0052cc", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{s.trackerKey}</span>}
              <span className="tag tag-muted" style={{ fontSize: 10, flexShrink: 0 }}>{epicOf(s.epicId)}</span>
              {s.teamPts !== null
                ? <span className="pts-chip pts-team" style={{ flexShrink: 0 }}><Check size={9} /> {s.teamPts}pt</span>
                : s.aiPts !== null
                  ? <span className="pts-chip pts-ai" style={{ flexShrink: 0 }}><Sparkles size={9} /> {s.aiPts}pt</span>
                  : null}
              <button className="btn btn-ai btn-xs" onClick={() => improveStory(s)} disabled={isImproving} style={{ flexShrink: 0 }}>
                {isImproving ? <><div className="ai-dot" style={{ width: 5, height: 5 }} /><div className="ai-dot" style={{ width: 5, height: 5, animationDelay: ".2s" }} /></> : <><Sparkles size={10} /> Improve</>}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => copyStory(s)} style={{ flexShrink: 0, color: isCopied ? "#36b37e" : "#8993a4" }}>
                {isCopied ? <><Check size={10} /> Copied!</> : <><Link size={10} /> Copy</>}
              </button>
              <button className="icon-btn" onClick={() => openEdit(s)}><Edit2 size={13} /></button>
              <button className="icon-btn" onClick={() => del(s.id)}><Trash2 size={13} /></button>
            </div>
          );
        })
      )}

      {/* ── Conversational creation modal ── */}
      {modal === "convo" && (
        <Modal wide title="New Story" onClose={() => setModal(null)}
          footer={
            convoStep === "preview"
              ? <><button className="btn btn-ghost" onClick={() => setModal("edit")}>Edit Fields →</button><button className="btn btn-primary" onClick={save}>Save Story</button></>
              : <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          }>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 12, lineHeight: 1.6 }}>Describe the story in plain language. AI will name it, structure it, and generate AC.</p>

          <div style={{ background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 420 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", minHeight: 80 }}>
              {convo.length === 0 && (
                <div style={{ fontSize: 12, color: "#b3bac5", fontStyle: "italic", padding: "8px 0" }}>
                  e.g. "Login screen for the auth epic — email/password, handle wrong credentials and lockout after 5 attempts, FE work"
                </div>
              )}
              {convo.map((m, i) => (
                <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                  {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
                </div>
              ))}
              <div ref={chatBottom} />
            </div>

            {convoStep === "preview" && form.title && (
              <div style={{ borderTop: "1px solid #dfe1e6", padding: 14, background: "#f1f2f4" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Story</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 4 }}>{form.title}</div>
                {form.description && <div style={{ fontSize: 12, color: "#6b778c", fontStyle: "italic", marginBottom: 8 }}>{form.description}</div>}
                <ACBlock ac={form.ac} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {form.aiPts && <span className="pts-chip pts-ai"><Sparkles size={9} /> {form.aiPts}pt</span>}
                  {form.oos && <span className="chip">OOS: {form.oos}</span>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #dfe1e6" }}>
              <textarea value={convoInput} onChange={e => setConvoInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), convo.length === 0 ? startConvo() : sendConvo())}
                placeholder="Describe the story... (Enter to send)" disabled={convoStep === "generating"}
                style={{ flex: 1, minHeight: "unset", height: 38, resize: "none", padding: "9px 12px", fontSize: 13 }} />
              <button className="btn btn-primary" onClick={convo.length === 0 ? startConvo : sendConvo}
                disabled={!convoInput.trim() || convoStep === "generating"} style={{ padding: "8px 14px" }}>
                <Send size={13} />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit form modal ── */}
      {modal === "edit" && (
        <Modal wide title={form.id ? "Edit Story" : "Story Details"} onClose={() => setModal(null)}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              {form.id && (
                <button className="btn btn-ai btn-sm" onClick={async () => { const s = project.stories.find(x => x.id === form.id); if (!s) return; await improveStory(s); const updated = project.stories.find(x => x.id === form.id); if (updated) setForm(updated); }} disabled={improving === form.id}>
                  {improving === form.id ? "Improving..." : <><Sparkles size={12} /> Improve with AI</>}
                </button>
              )}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={save}>Save Story</button>
              </div>
            </div>
          }>
          <div className="row">
            <div className="field" style={{ flex: 2 }}><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="[FE] Auth | Login screen" /></div>
            <div className="field"><label>Epic</label>
              <select value={form.epicId} onChange={e => setForm(f => ({ ...f, epicId: e.target.value }))}>
                {project.epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                <option value="">— No epic</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Description (As a / I want / So that)</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="field">
            <label>Acceptance Criteria</label>
            <textarea value={form.ac} onChange={e => setForm(f => ({ ...f, ac: e.target.value }))}
              placeholder={"Login Successful\nGIVEN | user is on login page\nWHEN | they enter valid credentials\nTHEN | they are redirected\nAND | session is created\n---\nInvalid Password\nGIVEN | user enters wrong password\nWHEN | they submit\nTHEN | error message is shown"}
              rows={8} style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, lineHeight: 1.8 }} />
          </div>
          <div className="divider" />
          <div className="row">
            <div className="field"><label>AI Story Points</label><input type="number" value={form.aiPts || ""} onChange={e => setForm(f => ({ ...f, aiPts: e.target.value ? Number(e.target.value) : null }))} /></div>
            <div className="field"><label>Team Story Points</label><input type="number" value={form.teamPts || ""} onChange={e => setForm(f => ({ ...f, teamPts: e.target.value ? Number(e.target.value) : null }))} /></div>
          </div>
          <div className="field"><label>Design Link</label><input value={form.design} onChange={e => setForm(f => ({ ...f, design: e.target.value }))} placeholder="Figma URL..." /></div>
          <div className="field"><label>Out of Scope</label><input value={form.oos} onChange={e => setForm(f => ({ ...f, oos: e.target.value }))} /></div>
          <div className="row">
            <div className="field"><label>Dependencies</label><input value={form.deps} onChange={e => setForm(f => ({ ...f, deps: e.target.value }))} /></div>
            <div className="field"><label>Blockers</label><input value={form.blockers} onChange={e => setForm(f => ({ ...f, blockers: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
// ─── Bugs ─────────────────────────────────────────────────────────────────────
function BugsSection({ project, update }) {
  const [modal, setModal] = useState(null);
  const blank = { title: "", steps: "", expected: "", current: "", evidence: "", suggestions: "" };
  const [form, setForm] = useState(blank);
  const [convo, setConvo] = useState([]);
  const [convoInput, setConvoInput] = useState("");
  const [convoStep, setConvoStep] = useState("idle");
  const convoHistory = useRef([]);
  const chatBottom = useRef(null);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [convo]);

  const save = () => {
    if (!form.title.trim()) return;
    if (form.id) update({ bugs: project.bugs.map(b => b.id === form.id ? form : b) });
    else update({ bugs: [...project.bugs, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ bugs: project.bugs.filter(b => b.id !== id) });

  const openAI = () => { setForm(blank); setConvo([]); setConvoInput(""); setConvoStep("idle"); convoHistory.current = []; setModal("ai"); };

  const BUG_FENCE = "```";
  const BUG_SYSTEM = `You are a senior QA engineer helping write a structured bug report.
Project: ${project.name} (${project.industry}, ${project.platform}).
When you have enough info, return JSON in a code block:
${BUG_FENCE}json
{"title":"[BUG TEAM] Module | Short desc","steps":"1. ...\n2. ...","expected":"...","current":"...","evidence":"","suggestions":"..."}
${BUG_FENCE}
Generate immediately from a clear description. Only ask ONE short question if something critical is missing (like steps or environment).`;

  const sendMsg = async () => {
    const text = convoInput.trim();
    if (!text || convoStep === "generating") return;
    setConvoInput("");
    const isFirst = convo.length === 0;
    setConvo(prev => [...prev, { role: "user", text }, { role: "ai", text: "..." }]);
    convoHistory.current.push({ role: "user", content: isFirst ? `Bug report: "${text}"` : text });
    setConvoStep("generating");

    const reply = await askClaude(convoHistory.current, BUG_SYSTEM);
    convoHistory.current.push({ role: "assistant", content: reply });

    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setForm(f => ({ ...f, ...parsed }));
        const clean = reply.replace(/```[\s\S]*?```/g, "").trim();
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: clean || "Bug report ready — review and save." }]);
        setConvoStep("preview");
      } catch {
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
        setConvoStep("asking");
      }
    } else {
      setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
      setConvoStep("asking");
    }
  };

  const [copiedBug, setCopiedBug] = useState(null);
  const syncTool = detectTool(project.syncUrl);

  const copyBug = (b) => {
    navigator.clipboard.writeText(copyBugForTool(b, syncTool)).then(() => {
      setCopiedBug(b.id); setTimeout(() => setCopiedBug(null), 2000);
    });
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Bugs</div><div className="sec-sub">{project.bugs.length} open bug{project.bugs.length !== 1 ? "s" : ""}</div></div>
        <button className="btn btn-primary" onClick={openAI}><Plus size={13} /> Report Bug</button>
      </div>

      {project.bugs.length === 0 ? (
        <Empty icon={<Bug size={36} />} title="No bugs reported" sub="AI will ask follow-up questions to fill the structured report" action={<button className="btn btn-primary" onClick={openAI}><Plus size={13} /> Report Bug</button>} />
      ) : (
        project.bugs.map(b => {
          const tag = b.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1];
          const isCopied = copiedBug === b.id;
          const hasKey = b.trackerKey;
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#ffffff", border: `1px solid ${hasKey ? "rgba(0,82,204,.12)" : "#dfe1e6"}`, borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = hasKey ? "rgba(0,82,204,.25)" : "#c1c7d0"} onMouseLeave={e => e.currentTarget.style.borderColor = hasKey ? "rgba(0,82,204,.12)" : "#dfe1e6"}>
              <span className="tag tag-BUG" style={{ flexShrink: 0 }}>BUG</span>
              {tag && <TeamTag team={tag} />}
              <span style={{ flex: 1, fontSize: 13, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
              {hasKey && <span style={{ fontSize: 11, color: "#0052cc", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{b.trackerKey}</span>}
              <button className="btn btn-ghost btn-xs" onClick={() => copyBug(b)} style={{ flexShrink: 0, color: isCopied ? "#36b37e" : "#8993a4" }}>
                {isCopied ? <><Check size={10} /> Copied!</> : <><Link size={10} /> Copy</>}
              </button>
              <button className="icon-btn" onClick={() => { setForm(b); setConvo([]); setConvoStep("idle"); setModal("form"); }}><Edit2 size={13} /></button>
              <button className="icon-btn" onClick={() => del(b.id)}><Trash2 size={13} /></button>
            </div>
          );
        })
      )}

      {/* AI conversational bug creation */}
      {modal === "ai" && (
        <Modal wide title="Report Bug" onClose={() => setModal(null)}
          footer={
            convoStep === "preview"
              ? <><button className="btn btn-ghost" onClick={() => setModal("form")}>Edit Fields →</button><button className="btn btn-primary" onClick={save}>Save Bug</button></>
              : <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          }>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 12, lineHeight: 1.6 }}>Describe the bug. AI will ask follow-up questions only if needed.</p>

          <div style={{ background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 14px 8px", minHeight: 60 }}>
              {convo.length === 0 && <div style={{ fontSize: 12, color: "#b3bac5", fontStyle: "italic" }}>e.g. "Login button does nothing on mobile Safari after entering credentials"</div>}
              {convo.map((m, i) => <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
              </div>)}
              <div ref={chatBottom} />
            </div>

            {convoStep === "preview" && (
              <div style={{ borderTop: "1px solid #dfe1e6", padding: 14, background: "#f1f2f4" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Report</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 10 }}>{form.title}</div>
                {[["Steps", form.steps, "#6b778c"], ["Expected", form.expected, "#36b37e"], ["Current", form.current, "#de350b"], ["Suggestions", form.suggestions, "#7a6000"]].map(([k, v, c]) => v && (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, color: c, whiteSpace: "pre-wrap" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {convoStep !== "preview" && (
              <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: convo.length ? "1px solid #dfe1e6" : "none" }}>
                <textarea value={convoInput} onChange={e => setConvoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMsg())}
                  placeholder={convo.length === 0 ? "Describe the bug... (Enter to send)" : "Your answer... (Enter to send)"}
                  disabled={convoStep === "generating"}
                  style={{ flex: 1, minHeight: "unset", height: 38, resize: "none", padding: "9px 12px", fontSize: 13 }} />
                <button className="btn btn-primary" onClick={sendMsg}
                  disabled={!convoInput.trim() || convoStep === "generating"} style={{ padding: "8px 14px" }}><Send size={13} /></button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Manual edit form */}
      {modal === "form" && (
        <Modal wide title={form.id ? "Edit Bug" : "Bug Details"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Bug</button></>}>
          <div className="field"><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="field"><label>Steps to Reproduce</label><textarea value={form.steps} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} rows={4} /></div>
          <div className="row">
            <div className="field"><label>Expected</label><textarea value={form.expected} onChange={e => setForm(f => ({ ...f, expected: e.target.value }))} rows={2} /></div>
            <div className="field"><label>Current</label><textarea value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} rows={2} /></div>
          </div>
          <div className="field"><label>Evidence / Links</label><input value={form.evidence} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} placeholder="Screenshot URL, Loom..." /></div>
          <div className="field"><label>Suggestions for Dev</label><textarea value={form.suggestions} onChange={e => setForm(f => ({ ...f, suggestions: e.target.value }))} rows={2} /></div>
        </Modal>
      )}
    </div>
  );
}

// ─── Design Tasks ─────────────────────────────────────────────────────────────
function DesignSection({ project, update }) {
  const [modal, setModal] = useState(null);
  const [protoTask, setProtoTask] = useState(null); // design task being prototyped
  const blank = { title: "", epicId: project.epics[0]?.id || "", desc: "", objective: "", scenarios: "", deliverables: "", links: "" };
  const [form, setForm] = useState(blank);
  const [convo, setConvo] = useState([]);
  const [convoInput, setConvoInput] = useState("");
  const [convoStep, setConvoStep] = useState("idle");
  const convoHistory = useRef([]);
  const chatBottom = useRef(null);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [convo]);

  const save = () => {
    if (!form.title.trim()) return;
    if (form.id) update({ design: project.design.map(d => d.id === form.id ? form : d) });
    else update({ design: [...project.design, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ design: project.design.filter(d => d.id !== id) });
  const epicOf = id => project.epics.find(e => e.id === id)?.title || "—";

  const epicListForDesign = project.epics.map(e => "id:" + e.id + " -> \"" + e.title + "\"").join(", ");
  const DESIGN_SYSTEM = `You are a PM writing a design brief. The design team defines how to implement it — keep the brief high-level and non-prescriptive.
Project: ${project.name} (${project.industry}, ${project.platform})
Available epics: ${epicListForDesign}

When you have enough info, return JSON in a code block:
{ "title": "[Design] EpicName | Short desc", "epicId": "...", "desc": "What needs to be designed, plain language", "objective": "One sentence goal", "scenarios": "list scenarios to cover", "deliverables": "expected outputs" }

Generate immediately from a good description. Only ask ONE question if truly unclear.`;

  const startOrSend = async () => {
    const text = convoInput.trim();
    if (!text || convoStep === "generating") return;
    setConvoInput("");
    const isFirst = convo.length === 0;
    setConvo(prev => [...prev, { role: "user", text }, { role: "ai", text: "..." }]);
    convoHistory.current.push({ role: "user", content: isFirst ? `Design task: "${text}". Project: ${project.name} (${project.industry}, ${project.platform}).` : text });
    setConvoStep("generating");
    const reply = await askClaude(convoHistory.current, DESIGN_SYSTEM);
    convoHistory.current.push({ role: "assistant", content: reply });
    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setForm(f => ({ ...f, ...parsed }));
        const clean = reply.replace(/```[\s\S]*?```/g, "").trim();
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: clean || "✓ Brief ready — review below." }]);
        setConvoStep("preview");
      } catch { setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]); setConvoStep("asking"); }
    } else { setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]); setConvoStep("asking"); }
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Design Tasks</div><div className="sec-sub">{project.design.length} task{project.design.length !== 1 ? "s" : ""}</div></div>
        <button className="btn btn-primary" onClick={() => { setForm(blank); setConvo([]); setConvoInput(""); setConvoStep("idle"); setModal("ai"); }}><Plus size={13} /> New Design Task</button>
      </div>

      {project.design.length === 0 ? (
        <Empty icon={<Palette size={36} />} title="No design tasks" sub="Describe what you need — AI generates a concise brief for the design team"
          action={<button className="btn btn-primary" onClick={() => { setForm(blank); setConvo([]); setConvoInput(""); setConvoStep("idle"); setModal("ai"); }}><Plus size={13} /> New Design Task</button>} />
      ) : (
        project.design.map(d => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#c1c7d0"} onMouseLeave={e => e.currentTarget.style.borderColor = "#dfe1e6"}>
            <span className="tag tag-Design" style={{ flexShrink: 0 }}>Design</span>
            <span style={{ flex: 1, fontSize: 13, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
            <span className="tag tag-muted" style={{ fontSize: 10, flexShrink: 0 }}>{epicOf(d.epicId)}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setProtoTask(d)} title="Lo-fi prototype for this task">
              <Layers size={12} /> {d.wireframe?.html ? "Prototype" : "Prototype"}
            </button>
            <button className="icon-btn" onClick={() => { setForm(d); setConvo([]); setConvoStep("idle"); setModal("form"); }}><Edit2 size={13} /></button>
            <button className="icon-btn" onClick={() => del(d.id)}><Trash2 size={13} /></button>
          </div>
        ))
      )}

      {protoTask && (
        <Modal wide title={`Prototype — ${protoTask.title}`} onClose={() => setProtoTask(null)}>
          <WireframePrototype
            projectContext={project}
            data={protoTask.wireframe || {}}
            onSave={(d) => {
              const updated = project.design.map(t => t.id === protoTask.id ? { ...t, wireframe: d } : t);
              update({ design: updated });
              setProtoTask(pt => ({ ...pt, wireframe: d }));
            }}
            defaultScreens={[
              { id: uid(), name: protoTask.title.replace(/^\[Design\]\s*/i, ""), description: protoTask.desc || protoTask.objective || "" },
              ...(protoTask.scenarios ? [{ id: uid(), name: "Key Scenario", description: protoTask.scenarios.slice(0, 120) }] : []),
            ]}
          />
        </Modal>
      )}

      {/* AI chat creation */}
      {modal === "ai" && (
        <Modal wide title="New Design Task" onClose={() => setModal(null)}
          footer={
            convoStep === "preview"
              ? <><button className="btn btn-ghost" onClick={() => setModal("form")}>Edit Fields →</button><button className="btn btn-primary" onClick={save}>Save Task</button></>
              : <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          }>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 12, lineHeight: 1.6 }}>Describe what needs to be designed. The design team will define the how — keep it high-level.</p>

          <div style={{ background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 14px 8px", minHeight: 60 }}>
              {convo.length === 0 && <div style={{ fontSize: 12, color: "#b3bac5", fontStyle: "italic" }}>e.g. "Login screen design for the auth epic — desktop and mobile, needs to match our brand"</div>}
              {convo.map((m, i) => <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
              </div>)}
              <div ref={chatBottom} />
            </div>

            {convoStep === "preview" && (
              <div style={{ borderTop: "1px solid #dfe1e6", padding: 14, background: "#f1f2f4" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Brief</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 6 }}>{form.title}</div>
                {[["Epic", epicOf(form.epicId)], ["Description", form.desc], ["Objective", form.objective], ["Scenarios", form.scenarios], ["Deliverables", form.deliverables]].map(([k, v]) => v && (
                  <div key={k} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{k}: </span>
                    <span style={{ fontSize: 12, color: "#6b778c" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {convoStep !== "preview" && (
              <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: convo.length ? "1px solid #dfe1e6" : "none" }}>
                <textarea value={convoInput} onChange={e => setConvoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), startOrSend())}
                  placeholder={convo.length === 0 ? "Describe the design task... (Enter to send)" : "Your answer... (Enter to send)"}
                  disabled={convoStep === "generating"}
                  style={{ flex: 1, minHeight: "unset", height: 38, resize: "none", padding: "9px 12px", fontSize: 13 }} />
                <button className="btn btn-primary" onClick={startOrSend}
                  disabled={!convoInput.trim() || convoStep === "generating"} style={{ padding: "8px 14px" }}><Send size={13} /></button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal === "form" && (
        <Modal wide title={form.id ? "Edit Design Task" : "Design Task Details"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="field"><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="field"><label>Epic</label><select value={form.epicId} onChange={e => setForm(f => ({ ...f, epicId: e.target.value }))}>{project.epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}<option value="">— None</option></select></div>
          <div className="field"><label>Description</label><textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></div>
          <div className="field"><label>Objective</label><textarea value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} rows={2} /></div>
          <div className="field"><label>Scenarios to Cover</label><textarea value={form.scenarios} onChange={e => setForm(f => ({ ...f, scenarios: e.target.value }))} rows={2} /></div>
          <div className="field"><label>Expected Deliverables</label><textarea value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} rows={2} /></div>
          <div className="field"><label>Design File Link</label><input value={form.links} onChange={e => setForm(f => ({ ...f, links: e.target.value }))} placeholder="Figma URL..." /></div>
        </Modal>
      )}
    </div>
  );
}


// ─── Team ─────────────────────────────────────────────────────────────────────
function TeamSection({ project, update }) {
  const [tab, setTab] = useState("members");
  const [modal, setModal] = useState(null);
  const blank = { name: "", role: "", team: "FE", country: "Costa Rica" };
  const [form, setForm] = useState(blank);
  const [vacForm, setVacForm] = useState({ memberId: "", from: "", to: "", note: "" });
  const [showVacForm, setShowVacForm] = useState(false);
  const [holForm, setHolForm] = useState({ date: "", name: "", country: "Costa Rica", type: "observance" });
  const [showHolForm, setShowHolForm] = useState(false);

  const ALL_TEAMS = ["FE", "BE", "FS", "Mobile", "QA", "Designer"];
  const vacations = project.vacations || [];
  const customHolidays = project.customHolidays || [];

  // Merge base + custom holidays per country
  const allHolidays = (country) => {
    const base = (HOLIDAYS[country] || []).map(h => ({ ...h, custom: false }));
    const custom = customHolidays.filter(h => h.country === country).map(h => ({ ...h, custom: true }));
    return [...base, ...custom].sort((a, b) => a.date.localeCompare(b.date));
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (form.id) update({ team: project.team.map(t => t.id === form.id ? form : t) });
    else update({ team: [...project.team, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ team: project.team.filter(t => t.id !== id) });

  const saveVac = () => {
    if (!vacForm.memberId || !vacForm.from || !vacForm.to) return;
    update({ vacations: [...vacations, { ...vacForm, id: uid() }] });
    setVacForm({ memberId: "", from: "", to: "", note: "" });
    setShowVacForm(false);
  };
  const delVac = id => update({ vacations: vacations.filter(v => v.id !== id) });

  const saveHol = () => {
    if (!holForm.date || !holForm.name) return;
    if (holForm.id) {
      update({ customHolidays: customHolidays.map(h => h.id === holForm.id ? holForm : h) });
    } else {
      update({ customHolidays: [...customHolidays, { ...holForm, id: uid() }] });
    }
    setHolForm({ date: "", name: "", country: "Costa Rica", type: "observance" });
    setShowHolForm(false);
  };
  const delHol = id => update({ customHolidays: customHolidays.filter(h => h.id !== id) });

  const memberName = id => project.team.find(m => m.id === id)?.name || "—";
  const groups = ALL_TEAMS.map(t => ({ team: t, members: project.team.filter(m => m.team === t) })).filter(g => g.members.length);

  const tabStyle = (t) => ({
    padding: "7px 14px", background: tab === t ? "#e8f0fe" : "transparent",
    border: tab === t ? "1px solid #dfe1e6" : "1px solid transparent",
    borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? "#172b4d" : "#8993a4", fontFamily: "'DM Sans',sans-serif", transition: "all .12s"
  });

  const HolidayCol = ({ country, flag, accent }) => {
    const holidays = allHolidays(country);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{flag}</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#172b4d" }}>{country} 2025</span>
            <span className="badge">{holidays.length}</span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => { setHolForm({ date: "", name: "", country, type: "observance" }); setShowHolForm(true); }}>
            <Plus size={11} /> Add
          </button>
        </div>
        {holidays.map(h => (
          <div key={h.id || h.date} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: 7, marginBottom: 5 }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: accent, minWidth: 80, flexShrink: 0 }}>{h.date}</span>
            <span style={{ flex: 1, fontSize: 12, color: "#344563" }}>{h.name}</span>
            {h.type === "observance" && <span className="tag tag-muted" style={{ fontSize: 9 }}>observance</span>}
            {h.custom && (
              <>
                <button className="icon-btn" style={{ padding: 3 }} onClick={() => { setHolForm({ ...h }); setShowHolForm(true); }}><Edit2 size={11} /></button>
                <button className="icon-btn" style={{ padding: 3 }} onClick={() => delHol(h.id)}><Trash2 size={11} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Team & Capacity</div><div className="sec-sub">Members, holidays, and vacation tracking</div></div>
        {tab === "members" && <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> Add Member</button>}
        {tab === "vacations" && <button className="btn btn-primary" onClick={() => setShowVacForm(true)}><Plus size={13} /> Add Vacation</button>}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {[["members", "Members"], ["holidays", "Holidays"], ["vacations", "Vacations"]].map(([id, label]) => (
          <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── Members tab ── */}
      {tab === "members" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 10, marginBottom: 20 }}>
            {ALL_TEAMS.map(t => {
              const count = project.team.filter(m => m.team === t).length;
              return (
                <div key={t} className="stat-card" style={{ padding: "12px 14px" }}>
                  <div style={{ marginBottom: 6 }}><TeamTag team={t} /></div>
                  <div className="stat-num" style={{ fontSize: 22 }}>{count}</div>
                  <div className="stat-label">members</div>
                </div>
              );
            })}
          </div>
          {project.team.length === 0 ? (
            <Empty icon={<UserCheck size={36} />} title="No team members" sub="Add your team to enable sprint planning and capacity tracking" action={<button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> Add Member</button>} />
          ) : (
            groups.map(({ team: t, members }) => (
              <div key={t} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <TeamTag team={t} />
                  <span style={{ fontSize: 11, color: "#97a0af" }}>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                </div>
                {members.map(m => {
                  const memberVacs = vacations.filter(v => v.memberId === m.id);
                  return (
                    <div key={m.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#ebecf0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, color: "#e8c547", flexShrink: 0 }}>
                        {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#8993a4", marginTop: 2 }}>{m.role} · {m.country === "Costa Rica" ? "🇨🇷" : "🇺🇸"} {m.country}</div>
                        {memberVacs.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {memberVacs.map(v => <span key={v.id} className="chip" style={{ fontSize: 10 }}>🏖 {v.from} → {v.to}</span>)}
                          </div>
                        )}
                      </div>
                      <button className="icon-btn" onClick={() => { setForm(m); setModal("form"); }}><Edit2 size={13} /></button>
                      <button className="icon-btn" onClick={() => del(m.id)}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </>
      )}

      {/* ── Holidays tab ── */}
      {tab === "holidays" && (
        <>
          {showHolForm && (
            <div className="card" style={{ marginBottom: 16, borderColor: "rgba(232,197,71,.2)" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 14 }}>
                {holForm.id ? "Edit Holiday" : "Add Holiday / Observance"}
              </div>
              <div className="row">
                <div className="field"><label>Date</label><input type="date" value={holForm.date} onChange={e => setHolForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="field"><label>Country</label>
                  <select value={holForm.country} onChange={e => setHolForm(f => ({ ...f, country: e.target.value }))}>
                    <option>Costa Rica</option><option>US</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 2 }}><label>Name</label><input value={holForm.name} onChange={e => setHolForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Election Day Observance" /></div>
                <div className="field"><label>Type</label>
                  <select value={holForm.type} onChange={e => setHolForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="holiday">Holiday</option>
                    <option value="observance">Observance</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => { setShowHolForm(false); setHolForm({ date: "", name: "", country: "Costa Rica", type: "observance" }); }}>Cancel</button>
                <button className="btn btn-primary" onClick={saveHol} disabled={!holForm.date || !holForm.name}>Save</button>
              </div>
            </div>
          )}
          <div className="two-col">
            <HolidayCol country="Costa Rica" flag="🇨🇷" accent="#e8c547" />
            <HolidayCol country="US" flag="🇺🇸" accent="#0052cc" />
          </div>
        </>
      )}

      {/* ── Vacations tab ── */}
      {tab === "vacations" && (
        <>
          {showVacForm && (
            <div className="card" style={{ marginBottom: 16, borderColor: "rgba(232,197,71,.2)" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", marginBottom: 14 }}>New Vacation</div>
              <div className="field">
                <label>Team Member</label>
                <select value={vacForm.memberId} onChange={e => setVacForm(f => ({ ...f, memberId: e.target.value }))}>
                  <option value="">Select member...</option>
                  {project.team.map(m => <option key={m.id} value={m.id}>{m.name} ({m.team})</option>)}
                </select>
              </div>
              <div className="row">
                <div className="field"><label>From</label><input type="date" value={vacForm.from} onChange={e => setVacForm(f => ({ ...f, from: e.target.value }))} /></div>
                <div className="field"><label>To</label><input type="date" value={vacForm.to} onChange={e => setVacForm(f => ({ ...f, to: e.target.value }))} /></div>
              </div>
              <div className="field"><label>Note (optional)</label><input value={vacForm.note} onChange={e => setVacForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Approved" /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setShowVacForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveVac} disabled={!vacForm.memberId || !vacForm.from || !vacForm.to}>Save</button>
              </div>
            </div>
          )}
          {vacations.length === 0 && !showVacForm ? (
            <Empty icon={<Calendar size={36} />} title="No vacations logged" sub="Track team vacations to improve sprint planning accuracy" action={<button className="btn btn-primary" onClick={() => setShowVacForm(true)}><Plus size={13} /> Add Vacation</button>} />
          ) : (
            vacations.map(v => (
              <div key={v.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#ebecf0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: "#e8c547", flexShrink: 0 }}>
                  {memberName(v.memberId).split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{memberName(v.memberId)}</div>
                  <div style={{ fontSize: 11, color: "#8993a4", marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{v.from} → {v.to} {v.note && `· ${v.note}`}</div>
                </div>
                <button className="icon-btn" onClick={() => delVac(v.id)}><Trash2 size={13} /></button>
              </div>
            ))
          )}
        </>
      )}

      {modal === "form" && (
        <Modal title={form.id ? "Edit Member" : "Add Team Member"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="row">
            <div className="field"><label>Full Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" autoFocus /></div>
            <div className="field"><label>Role / Title</label><input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Frontend Engineer" /></div>
          </div>
          <div className="row">
            <div className="field"><label>Team</label>
              <select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}>
                {ALL_TEAMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Country</label>
              <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
                <option>Costa Rica</option><option>US</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
// ─── Sprint Planning ──────────────────────────────────────────────────────────
function SprintSection({ project, update }) {
  const nextMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : (8 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  };
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr); d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const [startDate, setStartDate] = useState(nextMonday);
  const [endDate, setEndDate] = useState(() => addDays(nextMonday(), 13));
  const [selected, setSelected] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [editVelocity, setEditVelocity] = useState(false);
  const [velForm, setVelForm] = useState({ velocity: project.velocity, designVelocity: project.designVelocity || 20 });

  const allStories = project.stories;
  const designTasks = project.design;
  const planned = allStories.filter(s => selected.includes(s.id));
  const unplanned = allStories.filter(s => !selected.includes(s.id));
  const vacations = project.vacations || [];
  const customHolidays = project.customHolidays || [];

  const allHolidayDates = new Set([
    ...(HOLIDAYS["Costa Rica"] || []).map(h => h.date),
    ...(HOLIDAYS["US"] || []).map(h => h.date),
    ...customHolidays.map(h => h.date),
  ]);

  const getWorkingDays = (start, end) => {
    const days = []; const cur = new Date(start); const last = new Date(end);
    while (cur <= last) {
      const dow = cur.getDay(); const dateStr = cur.toISOString().split("T")[0];
      if (dow !== 0 && dow !== 6 && !allHolidayDates.has(dateStr)) days.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  };

  const sprintWorkDays = startDate && endDate ? getWorkingDays(startDate, endDate) : [];
  const totalWorkDays = sprintWorkDays.length;
  const nominalDays = 10;
  const dayRatio = totalWorkDays > 0 ? totalWorkDays / nominalDays : 1;
  const adjustedDevCapacity = Math.round((project.velocity || 30) * dayRatio);
  const adjustedDesignCapacity = Math.round((project.designVelocity || 20) * dayRatio);

  const vacImpact = vacations.filter(v => {
    const vs = new Date(v.from), ve = new Date(v.to);
    const ss = new Date(startDate), se = new Date(endDate);
    return vs <= se && ve >= ss;
  }).map(v => {
    const overlap = getWorkingDays(v.from > startDate ? v.from : startDate, v.to < endDate ? v.to : endDate);
    const member = project.team.find(m => m.id === v.memberId);
    return { name: member?.name || "Unknown", days: overlap.length };
  }).filter(v => v.days > 0);

  const sprintHolidays = [...(HOLIDAYS["Costa Rica"] || []), ...(HOLIDAYS["US"] || []), ...customHolidays]
    .filter(h => h.date >= startDate && h.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const devPts = planned.reduce((a, s) => a + (s.teamPts ?? s.aiPts ?? 0), 0);
  const devPct = adjustedDevCapacity > 0 ? Math.round((devPts / adjustedDevCapacity) * 100) : 0;
  const designCount = designTasks.length;
  const designPct = Math.min(Math.round((designCount / Math.max(adjustedDesignCapacity / 5, 1)) * 100), 150);

  const commitColor = pct => pct > 100 ? "#de350b" : pct >= 80 ? "#36b37e" : "#e8c547";
  const commitLabel = pct => pct > 100 ? "Overcommitted" : pct >= 80 ? "On target" : "Underloaded";
  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const suggestSprint = async () => {
    setGenerating(true);
    const vacLine = vacImpact.length ? "Vacations: " + vacImpact.map(v => v.name + " " + v.days + "d").join(", ") + ".\n" : "";
    const storyLines = allStories.map(s => '- "' + s.title + '" (' + (s.teamPts ?? s.aiPts ?? "?") + "pts)").join("\n");
    const context = "Dev capacity: " + adjustedDevCapacity + "pts (base " + project.velocity + "pt × " + dayRatio.toFixed(2) + " — " + totalWorkDays + " working days).\n" + vacLine + "Stories:\n" + storyLines;
    const result = await askClaude([{ role: "user", content: `${context}\n\nSuggest which stories to include. Return ONLY a JSON array of story titles.` }], "Sprint planning expert. Return only valid JSON array.");
    setGenerating(false);
    const parsed = parseJSON(result);
    if (Array.isArray(parsed)) {
      const ids = allStories.filter(s => parsed.some(t => s.title.includes(t) || t.includes(s.title.replace(/\[.*?\]/g, "").trim()))).map(s => s.id);
      setSelected(ids);
      const pts = ids.reduce((a, id) => { const s = allStories.find(x => x.id === id); return a + (s?.teamPts ?? s?.aiPts ?? 0); }, 0);
      setSuggestion(`AI suggested ${ids.length} stories (${pts}pt) for ${totalWorkDays} working days — ${adjustedDevCapacity}pt adjusted capacity.`);
    } else setSuggestion("Could not parse response. Select manually.");
  };

  const [showComplete, setShowComplete] = useState(false);

  const saveVelocity = () => { update({ velocity: Number(velForm.velocity) || 30, designVelocity: Number(velForm.designVelocity) || 20 }); setEditVelocity(false); };
  const finishSprint = (completedIds) => {
    const completedStories = allStories.filter(s => completedIds.includes(s.id));
    const incompletedStories = allStories.filter(s => selected.includes(s.id) && !completedIds.includes(s.id));
    const velocity = completedStories.reduce((a, s) => a + (s.teamPts ?? s.aiPts ?? 0), 0);
    update({
      sprints: [...project.sprints, {
        id: uid(), completedStories: completedIds, incompletedStories: incompletedStories.map(s => s.id),
        pts: velocity, startDate, endDate, completedAt: new Date().toISOString().split("T")[0]
      }],
      // Move incompleted stories back to top of backlog implicitly (they stay in stories, just not in sprint)
    });
    setSelected([]);
    setSuggestion(null);
    setShowComplete(false);
  };

  const CommitBar = ({ label, pts, capacity, pct, accent }) => (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
        <span style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
        <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>{pts}/{capacity}{typeof pts === "number" ? "pt" : ""}</span>
      </div>
      <div style={{ height: 6, background: "#dfe1e6", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: accent, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>{pct}%</span>
        <span style={{ fontSize: 11, color: "#97a0af" }}>— {commitLabel(pct)}</span>
        {pct > 100 && <span style={{ fontSize: 10, color: "#de350b", background: "rgba(222,53,11,.08)", border: "1px solid rgba(222,53,11,.15)", borderRadius: 4, padding: "1px 6px", fontFamily: "'DM Mono',monospace" }}>OVERCOMMIT</span>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Sprint Planning</div>
          <div style={{ fontSize: 12, color: "#97a0af", marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
            <span>Base velocity: <span style={{ color: "#e8c547" }}>{project.velocity}pt</span></span>
            <span>Design: <span style={{ color: "#d6547e" }}>{project.designVelocity || 20}pt</span></span>
            <button className="btn btn-ghost btn-xs" onClick={() => { setVelForm({ velocity: project.velocity, designVelocity: project.designVelocity || 20 }); setEditVelocity(true); }}><Edit2 size={10} /> Edit</button>
          </div>
        </div>
        <div className="sec-actions">
          <button className="btn btn-ai" onClick={suggestSprint} disabled={generating}>{generating ? "Analyzing..." : <><Sparkles size={13} /> AI Suggest</>}</button>
          {selected.length > 0 && <button className="btn btn-primary" onClick={() => setShowComplete(true)}><Check size={13} /> Complete Sprint</button>}
        </div>
      </div>

      {/* Sprint dates */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 150 }}><label>Sprint Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 0, minWidth: 150 }}><label>Sprint End</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 20, paddingBottom: 2 }}>
            <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Working Days</div><div style={{ fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#172b4d" }}>{totalWorkDays}</div></div>
            <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Adj. Capacity</div><div style={{ fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#e8c547" }}>{adjustedDevCapacity}pt</div></div>
            {vacImpact.length > 0 && <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Vacation Days</div><div style={{ fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#de350b" }}>{vacImpact.reduce((a, v) => a + v.days, 0)}</div></div>}
          </div>
        </div>
        {(sprintHolidays.length > 0 || vacImpact.length > 0) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #dfe1e6", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {sprintHolidays.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Holidays in Sprint</div>
                {sprintHolidays.map((h, i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#6b778c", marginBottom: 3 }}><span style={{ color: "#e8c547", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{h.date}</span><span>{h.name}</span></div>)}
              </div>
            )}
            {vacImpact.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Vacations in Sprint</div>
                {vacImpact.map((v, i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#6b778c", marginBottom: 3 }}><span style={{ color: "#de350b", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{v.days}d</span><span>{v.name}</span></div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Capacity bars */}
      <div style={{ display: "flex", gap: 16, background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
        <CommitBar label="Dev Team" pts={devPts} capacity={adjustedDevCapacity} pct={devPct} accent={commitColor(devPct)} />
        <div style={{ width: 1, background: "#dfe1e6" }} />
        <CommitBar label="Design Team" pts={`${designCount} tasks`} capacity={`${adjustedDesignCapacity}pt est.`} pct={designPct} accent={commitColor(designPct)} />
      </div>

      {suggestion && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(232,197,71,.08)", border: "1px solid rgba(232,197,71,.2)", borderRadius: 8, fontSize: 13, color: "#e8c547" }}>{suggestion}</div>}

      {/* Sprint scope */}
      <div style={{ marginBottom: 14 }}>
        <div className="sprint-lane">
          <div className="sprint-lane-title" style={{ color: devPct > 100 ? "#de350b" : "#e8c547" }}>Sprint · {devPts}pt{devPct > 100 ? " ⚠ over" : ""}</div>
          {planned.length === 0 && <div style={{ fontSize: 12, color: "#b3bac5", textAlign: "center", padding: "20px 0" }}>No stories selected — click from backlog below</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {planned.map(s => { const tag = s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1]; return (
              <div key={s.id} className="sprint-item" style={{ borderColor: devPct > 100 ? "rgba(222,53,11,.2)" : "rgba(232,197,71,.2)", minWidth: 200, flex: "1 1 200px" }} onClick={() => toggle(s.id)}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>{tag && <TeamTag team={tag} />}<span style={{ fontSize: 12, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title.replace(/\[.*?\]\s*/, "")}</span></div>
                <div style={{ display: "flex", gap: 6 }}><span className="badge badge-accent">{s.teamPts ?? s.aiPts ?? "?"}pts</span><span style={{ fontSize: 10, color: "#8993a4" }}>× remove</span></div>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* Backlog */}
      <div className="sprint-lane">
        <div className="sprint-lane-title">Backlog ({unplanned.length})</div>
        {unplanned.length === 0 && <div style={{ fontSize: 12, color: "#b3bac5", textAlign: "center", padding: "20px 0" }}>All stories in sprint</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {unplanned.map(s => { const tag = s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1]; return (
            <div key={s.id} className="sprint-item" style={{ minWidth: 200, flex: "1 1 200px" }} onClick={() => toggle(s.id)}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>{tag && <TeamTag team={tag} />}<span style={{ fontSize: 12, color: "#344563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title.replace(/\[.*?\]\s*/, "")}</span></div>
              <div style={{ display: "flex", gap: 6 }}><span className="badge">{s.teamPts ?? s.aiPts ?? "?"}pts</span><span style={{ fontSize: 10, color: "#97a0af" }}>→ add</span></div>
            </div>
          ); })}
        </div>
      </div>

      {project.sprints.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#172b4d", marginBottom: 12 }}>Sprint History</div>
          {project.sprints.map((sp, i) => {
            const completed = sp.completedStories?.length ?? sp.stories?.length ?? 0;
            const incompleted = sp.incompletedStories?.length ?? 0;
            return (
              <div key={sp.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px" }}>
                <span className="tag tag-green">Sprint {i + 1}</span>
                <span style={{ fontSize: 13, color: "#505f79" }}>{completed} done · <span style={{ color: "#e8c547", fontWeight: 600 }}>{sp.pts}pt</span></span>
                {incompleted > 0 && <span style={{ fontSize: 12, color: "#e8c547" }}>{incompleted} not done</span>}
                {sp.startDate && <span style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace" }}>{sp.startDate} → {sp.endDate}</span>}
                <span style={{ flex: 1 }} />
                <CheckCircle2 size={14} color="#36b37e" />
              </div>
            );
          })}
          {project.sprints.length > 1 && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 8, display: "flex", gap: 20 }}>
              <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Avg Velocity</div><div style={{ fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#e8c547" }}>{Math.round(project.sprints.reduce((a, s) => a + s.pts, 0) / project.sprints.length)}pt</div></div>
              <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Total Sprints</div><div style={{ fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#172b4d" }}>{project.sprints.length}</div></div>
              <div><div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Total Delivered</div><div style={{ fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#36b37e" }}>{project.sprints.reduce((a, s) => a + s.pts, 0)}pt</div></div>
            </div>
          )}
        </div>
      )}

      {editVelocity && (
        <Modal title="Edit Base Velocity" onClose={() => setEditVelocity(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setEditVelocity(false)}>Cancel</button><button className="btn btn-primary" onClick={saveVelocity}>Save</button></>}>
          <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 16, lineHeight: 1.6 }}>Set your baseline per 2-week sprint. The planner adjusts automatically based on working days, holidays, and vacations.</p>
          <div className="row">
            <div className="field"><label>Dev Team (pts / 2-week sprint)</label><input type="number" value={velForm.velocity} onChange={e => setVelForm(f => ({ ...f, velocity: e.target.value }))} /></div>
            <div className="field"><label>Design Team (pts / 2-week sprint)</label><input type="number" value={velForm.designVelocity} onChange={e => setVelForm(f => ({ ...f, designVelocity: e.target.value }))} /></div>
          </div>
        </Modal>
      )}

      {showComplete && (
        <SprintCompleteModal
          planned={planned}
          startDate={startDate}
          endDate={endDate}
          onComplete={finishSprint}
          onClose={() => setShowComplete(false)}
        />
      )}
    </div>
  );
}

// ─── Sprint Complete Modal ────────────────────────────────────────────────────
function SprintCompleteModal({ planned, startDate, endDate, onComplete, onClose }) {
  const [completed, setCompleted] = useState(new Set(planned.map(s => s.id)));

  const toggle = id => setCompleted(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const completedPts = planned.filter(s => completed.has(s.id)).reduce((a, s) => a + (s.teamPts ?? s.aiPts ?? 0), 0);
  const totalPts = planned.reduce((a, s) => a + (s.teamPts ?? s.aiPts ?? 0), 0);
  const incompletedCount = planned.length - completed.size;

  return (
    <Modal wide title="Complete Sprint" onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#8993a4" }}>
            <span style={{ color: "#36b37e", fontWeight: 600 }}>{completed.size} completed</span>
            {incompletedCount > 0 && <span> · <span style={{ color: "#e8c547" }}>{incompletedCount} back to backlog</span></span>}
            <span> · <span style={{ color: "#172b4d", fontWeight: 600 }}>{completedPts}pt</span> velocity</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onComplete([...completed])}>
              <Check size={13} /> Save Sprint
            </button>
          </div>
        </div>
      }>

      <p style={{ fontSize: 13, color: "#8993a4", marginBottom: 6, lineHeight: 1.6 }}>
        All stories are marked completed by default. Uncheck any that didn't make it — they'll go back to the backlog.
      </p>
      {startDate && <div style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace", marginBottom: 16 }}>{startDate} → {endDate}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setCompleted(new Set(planned.map(s => s.id)))}>Mark all done</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setCompleted(new Set())}>Clear all</button>
      </div>

      {planned.map(s => {
        const tag = s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1];
        const done = completed.has(s.id);
        return (
          <div key={s.id} onClick={() => toggle(s.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: done ? "rgba(59,232,168,.05)" : "#f8f9fa", border: "1px solid " + (done ? "rgba(54,179,126,.2)" : "#dfe1e6"), borderRadius: 8, marginBottom: 6, cursor: "pointer", transition: "all .12s" }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid " + (done ? "#36b37e" : "#b3bac5"), background: done ? "#36b37e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .12s" }}>
              {done && <Check size={11} color="#f8f9fa" strokeWidth={3} />}
            </div>
            {tag && <TeamTag team={tag} />}
            <span style={{ flex: 1, fontSize: 13, color: done ? "#344563" : "#6b778c", textDecoration: done ? "none" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
            <span className={done ? "pts-chip pts-team" : "pts-chip pts-empty"} style={{ flexShrink: 0 }}>
              {done ? <><Check size={9} /> </> : ""}{s.teamPts ?? s.aiPts ?? "?"}pt
            </span>
          </div>
        );
      })}
    </Modal>
  );
}

// ─── AI Colleague ─────────────────────────────────────────────────────────────
function AISection({ project, update }) {
  const [msgs, setMsgs] = useState([
    { role: "ai", text: `Hi! I'm your AI colleague for **${project.name}**.\n\nI can help you analyze meeting notes, identify gaps, update project rules — and I can also **create stories, bugs, epics, and design tasks** directly from our conversation.\n\nJust tell me what you need.` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // { type, items[] } awaiting confirmation
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pending]);

  const epicList = project.epics.map(e => `id:${e.id} → "${e.title}"`).join(", ") || "none";
  const teamTags = [...new Set(project.team.map(t => t.team).filter(t => t !== "QA"))].join(", ") || "FE, BE, FS";

  const FENCE = "```";
  const SYSTEM = `You are a senior PM AI colleague embedded in a product management tool.

Project: ${project.name} (${project.platform}, ${project.type}, ${project.industry})
Team velocity: ${project.velocity}pts. Epics: ${project.epics.map(e => e.title).join(", ") || "none"}.
Stories: ${project.stories.length}. Bugs: ${project.bugs.length}. Open design tasks: ${project.design.length}.
AI Rules: ${project.aiRules.join("; ") || "none"}.
Available epics: ${epicList}
Available team tags: ${teamTags}

You can:
1. Analyze and discuss — just reply normally
2. Create artifacts — when the user wants to create something, output a special block

To CREATE artifacts, include this block in your reply (after any explanation):

ARTIFACTS:
${FENCE}json
{
  "type": "stories|bugs|epics|design",
  "items": [
    { ...fields... }
  ]
}
${FENCE}

Story fields: { title, epicId, description, ac, aiPts }
Bug fields: { title, steps, expected, current, suggestions }
Epic fields: { title, description }
Design fields: { title, epicId, desc, objective, scenarios, deliverables }

AC format for stories: "Scenario\nGIVEN | ...\nWHEN | ...\nTHEN | ...\n---\nScenario2\n..."

RULE UPDATE: prefix to track new project rules.
Be concise. Ask before creating if requirements are unclear.`;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs = [...msgs, { role: "user", text }];
    setMsgs([...newMsgs, { role: "ai", text: "..." }]);
    setLoading(true);

    const history = newMsgs.slice(-10).map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
    const reply = await askClaude(history, SYSTEM, 2000);
    setLoading(false);

    // Parse ARTIFACTS block if present
    const artifactMatch = reply.match(/ARTIFACTS:\s*```(?:json)?\s*([\s\S]*?)```/);
    if (artifactMatch) {
      try {
        const parsed = JSON.parse(artifactMatch[1].trim());
        if (parsed.type && Array.isArray(parsed.items) && parsed.items.length > 0) {
          const cleanReply = reply.replace(/ARTIFACTS:\s*```[\s\S]*?```/, "").trim();
          setMsgs(prev => [...prev.slice(0, -1), { role: "ai", text: cleanReply || `I've prepared ${parsed.items.length} ${parsed.type} for you to review:` }]);
          setPending(parsed);
          setLoading(false);
          return;
        }
      } catch {}
    }

    setMsgs(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);

    if (reply.includes("RULE UPDATE:")) {
      const m = reply.match(/RULE UPDATE:\s*(.+)/);
      if (m) update({ aiRules: [...project.aiRules, m[1].trim()] });
    }
  };

  const acceptArtifacts = () => {
    if (!pending) return;
    const { type, items } = pending;
    if (type === "stories") {
      const newStories = items.map(s => ({ ...s, id: uid(), teamPts: null, design: "", oos: s.oos || "", deps: "", blockers: "" }));
      update({ stories: [...project.stories, ...newStories] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newStories.length} stor${newStories.length > 1 ? "ies" : "y"} to your backlog.` }]);
    } else if (type === "bugs") {
      const newBugs = items.map(b => ({ ...b, id: uid(), evidence: "" }));
      update({ bugs: [...project.bugs, ...newBugs] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newBugs.length} bug${newBugs.length > 1 ? "s" : ""} to the bug tracker.` }]);
    } else if (type === "epics") {
      const newEpics = items.map(e => ({ ...e, id: uid(), stories: 0 }));
      update({ epics: [...project.epics, ...newEpics] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newEpics.length} epic${newEpics.length > 1 ? "s" : ""} to your project.` }]);
    } else if (type === "design") {
      const newTasks = items.map(d => ({ ...d, id: uid(), links: "" }));
      update({ design: [...project.design, ...newTasks] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newTasks.length} design task${newTasks.length > 1 ? "s" : ""}.` }]);
    }
    setPending(null);
  };

  const rejectArtifacts = () => {
    setMsgs(prev => [...prev, { role: "ai", text: "Got it — I've discarded those. Let me know how you'd like to adjust them." }]);
    setPending(null);
  };

  const quickPrompts = [
    "Analyze this: [paste meeting notes]",
    "What gaps do we have in our epics?",
    "Create stories for the login epic",
    "What are the biggest risks right now?",
  ];

  const ArtifactPreview = ({ pending }) => {
    const { type, items } = pending;
    const typeLabel = { stories: "Story", bugs: "Bug", epics: "Epic", design: "Design Task" }[type] || type;
    return (
      <div style={{ margin: "12px 0 8px", background: "#f8f9fa", border: "1px solid rgba(232,197,71,.25)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", background: "rgba(232,197,71,.12)", borderBottom: "1px solid rgba(232,197,71,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={13} color="#e8c547" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e8c547" }}>{items.length} {typeLabel}{items.length > 1 ? "s" : ""} ready to add</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-xs" onClick={rejectArtifacts}><X size={11} /> Discard</button>
            <button className="btn btn-primary btn-xs" onClick={acceptArtifacts}><Check size={11} /> Add to Project</button>
          </div>
        </div>
        <div style={{ padding: "10px 14px", maxHeight: 280, overflowY: "auto" }}>
          {items.map((item, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < items.length - 1 ? "1px solid #dfe1e6" : "none" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 3 }}>{item.title}</div>
              {item.description && <div style={{ fontSize: 12, color: "#6b778c", fontStyle: "italic", marginBottom: 3 }}>{item.description}</div>}
              {item.desc && <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 3 }}>{item.desc}</div>}
              {item.steps && <div style={{ fontSize: 11, color: "#8993a4", fontFamily: "'DM Mono',monospace" }}>Steps: {item.steps.slice(0, 80)}...</div>}
              {item.aiPts && <span className="pts-chip pts-ai" style={{ marginTop: 4, display: "inline-flex" }}><Sparkles size={9} /> {item.aiPts}pt</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">AI Colleague</div>
          <div className="sec-sub">Conversational PM assistant — can create stories, bugs, epics & design tasks</div>
        </div>
        {project.aiRules.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#e8c547" }}>
            <Shield size={12} /> {project.aiRules.length} rule{project.aiRules.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {project.aiRules.length > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(232,197,71,.1)", border: "1px solid rgba(232,197,71,.15)", borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Active Project Rules</div>
          {project.aiRules.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#7a6000", marginBottom: 2 }}>• {r}</div>)}
        </div>
      )}

      <div style={{ background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: 520 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
          {msgs.map((m, i) => (
            <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`} style={{ whiteSpace: m.role === "ai" ? "normal" : undefined }}>
              {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.role === "ai" ? <div className="md-agenda" style={{ fontSize: 13 }}><ReactMarkdown>{m.text}</ReactMarkdown></div> : m.text}
            </div>
          ))}
          {pending && <ArtifactPreview pending={pending} />}
          <div ref={bottomRef} />
        </div>
        {msgs.length <= 1 && !pending && (
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #dfe1e6" }}>
            {quickPrompts.map(p => (
              <button key={p} className="btn btn-ghost btn-sm" onClick={() => setInput(p)}>{p}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, padding: "12px", borderTop: "1px solid #dfe1e6" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask anything, paste meeting notes, or say 'create stories for X'... (Enter to send)"
            style={{ minHeight: "unset", height: 40, padding: "10px 12px", resize: "none", flex: 1 }} />
          <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()} style={{ padding: "8px 14px" }}><Send size={13} /></button>
        </div>
      </div>
    </div>
  );
}
// ─── Graduation Wizard ───────────────────────────────────────────────────────
function GraduationWizard({ project, onClose, onCreateDelivery }) {
  const [step, setStep] = useState(0); // 0=review, 1=generating, 2=confirm
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("epics");

  const sessionOutputs = (project.sessions || []).flatMap(s => {
    const o = s.outputs || {};
    return [
      ...(o.risks || []).map(t => ({ type: "risk", text: t, session: s.title })),
      ...(o.opportunities || []).map(t => ({ type: "opportunity", text: t, session: s.title })),
      ...(o.assumptions || []).map(t => ({ type: "assumption", text: t, session: s.title })),
      ...(o.keyDecisions || []).map(t => ({ type: "decision", text: t, session: s.title })),
    ];
  });

  const allFeatures = (project.backbone || []).flatMap(stage =>
    (stage.epics || []).flatMap(epic =>
      (epic.features || []).map(f => ({ ...f, epicTitle: epic.title, stage: stage.stage, moscow: f.moscow }))
    )
  );
  const mvpFeatures = allFeatures.filter(f => f.slice === "mvp");

  const buildContext = () => {
    const b = project.backbone || [];
    const sessions = project.sessions || [];
    return `
PROJECT: ${project.name}
Platform: ${project.platform} | Industry: ${project.industry}
Description: ${project.about}

ASSUMPTIONS: ${(project.assumptions || []).join("; ")}
RISKS: ${(project.risks || []).map(r => typeof r === "string" ? r : r.text).join("; ")}
OPPORTUNITIES: ${(project.opportunities || []).map(o => typeof o === "string" ? o : o.text).join("; ")}

STORY MAP BACKBONE (Stages → Epics → Features):
${b.map(stage => `  Stage: "${stage.stage}" — ${stage.description}
${(stage.epics || []).map(epic => `    Epic: "${epic.title}" [${epic.moscow}]
${(epic.features || []).map(f => `      - "${f.title}" [${f.moscow}] [${f.slice}]`).join("\n")}`).join("\n")}`).join("\n")}

SESSION OUTPUTS:
${sessions.map(s => `  Session: "${s.title}" (${s.date})
    Participants: ${s.participants}
    Notes: ${s.notes}
    ${s.outputs ? `Risks: ${(s.outputs.risks || []).join("; ")}
    Opportunities: ${(s.outputs.opportunities || []).join("; ")}
    Decisions: ${(s.outputs.keyDecisions || []).join("; ")}
    Assumptions: ${(s.outputs.assumptions || []).join("; ")}` : ""}`).join("\n")}

ARCHITECTURE: ${project.architectureNotes || "Not documented"}

NFRs:
${(project.nfrs || []).map(n => `  [${n.priority}] ${n.category}: ${n.requirement}`).join("\n")}

DESIGN PRIORITIES:
${(project.designPriorities || []).map(d => `  - ${d.flow}: ${d.reason}`).join("\n")}

INTEGRATIONS:
${(project.integrations || []).map(i => `  - ${i.system} (${i.direction}): ${i.notes}`).join("\n")}

ARCHITECTURE DECISIONS:
${(project.adrs || []).map(a => `  - ${a.title}: ${a.decision}`).join("\n")}

FLOWS: ${(project.flows || []).join(" | ")}
`.trim();
  };

  const generate = async () => {
    setStep(1);
    setError(null);
    const context = buildContext();
    const prompt = `You are a senior PM converting a Discovery project into a structured Delivery project.

Here is all the discovery data:
${context}

Generate a complete delivery project scaffold. Return ONLY a valid JSON object with this exact structure:
{
  "epics": [{ "id": "e1", "title": "...", "description": "...", "stories": 0 }],
  "stories": [{ "id": "s1", "epicId": "e1", "title": "[FE/BE/FS/Mobile] EpicName | Short title", "description": "As a \\"role\\" I want to \\"action\\" so that \\"outcome\\"", "ac": "GIVEN | context\\nWHEN | action\\nTHEN | expected outcome\\nAND | optional", "aiPts": 3, "teamPts": null, "design": "", "oos": "", "deps": "", "blockers": "" }],
  "personas": [{ "id": "p1", "role": "Job Title", "description": "Who they are and their context", "goals": "goal1, goal2", "painPoints": "pain1, pain2", "behaviors": "How they work" }],
  "stakeholders": [{ "id": "sh1", "name": "Name if known or role title", "role": "Title", "influence": "High|Medium|Low", "decision": "Data-based|Gut-based|Consensus-driven", "notes": "Key preferences from sessions" }],
  "designTasks": [{ "id": "d1", "epicId": "e1", "title": "[Design] EpicName | Screen/Flow", "desc": "What to design", "objective": "Goal", "scenarios": "Screen sizes and states", "deliverables": "Figma frames, annotations", "links": "" }],
  "aiRules": ["Rule derived from architecture decisions or session outputs"],
  "assumptions": ["assumption1"],
  "risks": ["risk1"]
}

Rules:
- Create epics directly from the story map backbone (one epic per backbone epic)
- Create 2-4 stories per epic, focused on MVP features (slice=mvp first, then should-haves)
- Each story title must start with [FE], [BE], [FS], or [Mobile] based on platform (${project.platform})
- Personas must reflect real users discovered in sessions
- Stakeholders must reflect participants mentioned in sessions
- Design tasks for each epic that has user-facing flows
- aiRules from architecture decisions and session outputs
- Return ONLY the JSON object, no markdown, no explanation`;

    const result = await askClaude([{ role: "user", content: prompt }],
      "You are a senior PM. Return only valid JSON. No markdown fences, no explanation.", 4000);

    let parsed = null;
    try { parsed = JSON.parse(result.trim()); } catch {}
    if (!parsed) { const m = result.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }

    if (!parsed) { setError("Claude couldn't parse the discovery data. Try again."); setStep(0); return; }

    // Assign real UIDs and update epic story counts
    const epicMap = {};
    parsed.epics = (parsed.epics || []).map(e => { const id = uid(); epicMap[e.id] = id; return { ...e, id, stories: 0 }; });
    parsed.stories = (parsed.stories || []).map(s => {
      const epicId = epicMap[s.epicId] || parsed.epics[0]?.id || "";
      return { ...s, id: uid(), epicId, teamPts: null };
    });
    parsed.epics = parsed.epics.map(e => ({ ...e, stories: parsed.stories.filter(s => s.epicId === e.id).length }));
    parsed.personas = (parsed.personas || []).map(p => ({ ...p, id: uid() }));
    parsed.stakeholders = (parsed.stakeholders || []).map(s => ({ ...s, id: uid() }));
    parsed.designTasks = (parsed.designTasks || []).map((d, i) => {
      const epicId = epicMap[d.epicId] || parsed.epics[i % parsed.epics.length]?.id || "";
      return { ...d, id: uid(), epicId };
    });

    setGenerated(parsed);
    setStep(2);
  };

  const confirm = () => {
    const risks = (project.risks || []).map(r => typeof r === "string" ? r : r.text);
    const deliveryProject = {
      id: uid(),
      name: project.name,
      platform: project.platform,
      type: "Greenfield",
      industry: project.industry,
      about: project.about,
      assumptions: generated.assumptions || project.assumptions || [],
      risks: generated.risks || risks,
      stakeholders: generated.stakeholders || [],
      personas: generated.personas || [],
      epics: generated.epics || [],
      stories: generated.stories || [],
      bugs: [],
      design: generated.designTasks || [],
      team: [],
      sprints: [],
      vacations: [],
      customHolidays: [],
      velocity: 40,
      teamSize: (generated.stakeholders || []).length,
      aiRules: generated.aiRules || [],
      velocityHistory: [],
      jira: null,
      syncUrl: "",
      discoveryId: project.id,
    };
    onCreateDelivery(deliveryProject);
  };

  const tabs = [
    { id: "epics", label: "Epics", count: generated?.epics?.length },
    { id: "stories", label: "Stories", count: generated?.stories?.length },
    { id: "personas", label: "Personas", count: generated?.personas?.length },
    { id: "stakeholders", label: "Stakeholders", count: generated?.stakeholders?.length },
    { id: "design", label: "Design Tasks", count: generated?.designTasks?.length },
    { id: "rules", label: "AI Rules", count: generated?.aiRules?.length },
  ];

  return (
    <div className="modal-ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" style={{ maxWidth: "860px", width: "94vw" }}>
        <div className="modal-hd">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Rocket size={16} color="#0052cc" />
            {step === 0 ? "Ready to graduate to Delivery?" : step === 1 ? "Generating delivery project…" : "Review & confirm"}
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-bd" style={{ padding: "24px" }}>
          {/* Step 0 — Discovery review */}
          {step === 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#6b778c", lineHeight: 1.65, marginBottom: 20 }}>
                Claude will read everything from this discovery — sessions, story map, architecture, NFRs, flows, and decisions — and generate a fully pre-filled Delivery project. The Discovery project stays untouched.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Sessions logged", value: (project.sessions || []).length, color: "#0052cc" },
                  { label: "Backbone stages", value: (project.backbone || []).length, color: "#5b21b6" },
                  { label: "MVP features", value: mvpFeatures.length, color: "#036b52" },
                  { label: "Session outputs", value: sessionOutputs.length, color: "#7a6000" },
                  { label: "NFRs documented", value: (project.nfrs || []).length, color: "#c9372c" },
                  { label: "Integrations mapped", value: (project.integrations || []).length, color: "#1868db" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "#f4f5f7", border: "1px solid #dfe1e6", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#6b778c" }}>{label}</span>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22, color }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "#fff8e1", border: "1px solid #f5c518", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7a6000", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>What Claude will generate</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["Epics from backbone", "Stories with AC", "Personas from sessions", "Stakeholders from sessions", "Design tasks per flow", "AI rules from architecture"].map(item => (
                    <span key={item} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#172b4d", background: "white", border: "1px solid #f5c518", borderRadius: 20, padding: "3px 10px" }}>
                      <CheckCircle2 size={11} color="#36b37e" /> {item}
                    </span>
                  ))}
                </div>
              </div>

              {(project.backbone || []).length === 0 && (
                <div style={{ background: "#fff3f3", border: "1px solid #ff8f73", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#ae2a19" }}>
                  <AlertCircle size={13} style={{ display: "inline", marginRight: 6 }} />
                  No story map backbone found. Claude will use sessions and project info to generate epics, but adding backbone stages first will produce much better results.
                </div>
              )}

              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#97a0af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Story map preview</div>
              <div style={{ background: "#f4f5f7", border: "1px solid #dfe1e6", borderRadius: 8, padding: 14, maxHeight: 160, overflowY: "auto" }}>
                {(project.backbone || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "#97a0af", fontStyle: "italic" }}>No backbone stages yet</div>
                ) : (project.backbone || []).map(stage => (
                  <div key={stage.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0052cc", marginBottom: 4, fontFamily: "'DM Mono',monospace" }}>{stage.stage}</div>
                    {(stage.epics || []).map(epic => (
                      <div key={epic.id} style={{ marginLeft: 12, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: "#172b4d", fontWeight: 500 }}>{epic.title}</span>
                        <span style={{ fontSize: 11, color: "#97a0af", marginLeft: 6 }}>{(epic.features || []).length} features · {(epic.features || []).filter(f => f.slice === "mvp").length} MVP</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Generating */}
          {step === 1 && (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ width: 48, height: 48, background: "#e6f0ff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Loader size={22} color="#0052cc" style={{ animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: "#172b4d", marginBottom: 8 }}>Building your Delivery project</div>
              <div style={{ fontSize: 13, color: "#6b778c", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
                Claude is reading all your discovery data and generating epics, stories, personas, stakeholders, design tasks, and AI rules. This takes about 15–30 seconds.
              </div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Step 2 — Review generated */}
          {step === 2 && generated && (
            <div>
              <div style={{ background: "#e3fcef", border: "1px solid #abe2c7", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={16} color="#006644" />
                <span style={{ fontSize: 13, color: "#006644", fontWeight: 500 }}>
                  Generated {generated.epics?.length} epics, {generated.stories?.length} stories, {generated.personas?.length} personas, {generated.stakeholders?.length} stakeholders, {generated.designTasks?.length} design tasks
                </span>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #dfe1e6", marginBottom: 16 }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "8px 14px",
                    fontSize: 12, fontWeight: activeTab === t.id ? 600 : 400,
                    color: activeTab === t.id ? "#0052cc" : "#6b778c",
                    borderBottom: activeTab === t.id ? "2px solid #0052cc" : "2px solid transparent",
                    fontFamily: "'DM Sans',sans-serif",
                  }}>
                    {t.label} <span style={{ background: "#dfe1e6", borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 4 }}>{t.count}</span>
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {activeTab === "epics" && (generated.epics || []).map(e => (
                  <div key={e.id} className="card-flat" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 4 }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: "#6b778c" }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: "#97a0af", marginTop: 4 }}>{e.stories} stories planned</div>
                  </div>
                ))}

                {activeTab === "stories" && (generated.stories || []).map(s => (
                  <div key={s.id} className="card-flat" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "#172b4d", marginBottom: 4 }}>{s.title}</div>
                    {s.description && <div style={{ fontSize: 11, color: "#6b778c", fontStyle: "italic", marginBottom: 6 }}>{s.description}</div>}
                    {s.ac && <div style={{ fontSize: 11, color: "#97a0af", fontFamily: "'DM Mono',monospace", whiteSpace: "pre-line", background: "#f4f5f7", borderRadius: 5, padding: "6px 8px" }}>{s.ac}</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {s.aiPts && <span style={{ fontSize: 10, background: "#e6f0ff", color: "#0052cc", borderRadius: 4, padding: "1px 6px", fontFamily: "'DM Mono',monospace" }}>AI: {s.aiPts}pts</span>}
                    </div>
                  </div>
                ))}

                {activeTab === "personas" && (generated.personas || []).map(p => (
                  <div key={p.id} className="card-flat" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 4 }}>{p.role}</div>
                    <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 6 }}>{p.description}</div>
                    <div style={{ fontSize: 11, color: "#5b21b6" }}>Goals: {p.goals}</div>
                    <div style={{ fontSize: 11, color: "#c9372c" }}>Pain points: {p.painPoints}</div>
                  </div>
                ))}

                {activeTab === "stakeholders" && (generated.stakeholders || []).map(s => (
                  <div key={s.id} className="card-flat" style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e6f0ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#0052cc", flexShrink: 0 }}>
                      {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{s.name} <span style={{ fontWeight: 400, fontSize: 11, color: "#97a0af" }}>· {s.role}</span></div>
                      <div style={{ fontSize: 11, color: "#6b778c", marginTop: 2 }}>Influence: {s.influence} · {s.decision}</div>
                      {s.notes && <div style={{ fontSize: 11, color: "#97a0af", marginTop: 4 }}>{s.notes}</div>}
                    </div>
                  </div>
                ))}

                {activeTab === "design" && (generated.designTasks || []).map(d => (
                  <div key={d.id} className="card-flat" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 4 }}>{d.title}</div>
                    <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 4 }}>{d.desc}</div>
                    <div style={{ fontSize: 11, color: "#97a0af" }}>Deliverables: {d.deliverables}</div>
                  </div>
                ))}

                {activeTab === "rules" && (
                  <div>
                    {(generated.aiRules || []).map((r, i) => (
                      <div key={i} className="card-flat" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Zap size={12} color="#e8c547" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12, color: "#172b4d" }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <div style={{ marginTop: 12, fontSize: 12, color: "#c9372c" }}>{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {step === 0 && <button className="btn btn-primary" onClick={generate}><Sparkles size={13} /> Generate with AI</button>}
          {step === 2 && (
            <>
              <button className="btn btn-ghost" onClick={() => { setStep(0); setGenerated(null); }}>Regenerate</button>
              <button className="btn btn-primary" onClick={confirm}><Rocket size={13} /> Create Delivery Project</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreate }) {
  const [mode, setMode] = useState(null); // null = choose, "delivery", "discovery"

  if (!mode) {
    return (
      <Modal title="New Project" onClose={onClose}>
        <p style={{ fontSize: 13, color: "#6b778c", marginBottom: 20, lineHeight: 1.65 }}>
          What kind of project is this?
        </p>
        <div style={{ display: "flex", gap: 14 }}>
          {[
            {
              id: "delivery",
              label: "Delivery Project",
              desc: "You know what you're building. Manage stories, sprints, bugs, and the team.",
              icon: <Rocket size={28} color="#0052cc" />,
              border: "#b3d4ff", bg: "#e6f0ff",
            },
            {
              id: "discovery",
              label: "Discovery Project",
              desc: "You're figuring out what to build. Run sessions, map stories, estimate, and present to the client.",
              icon: <Compass size={28} color="#7a6000" />,
              border: "#ffe999", bg: "#fff8e1",
            },
          ].map(opt => (
            <button key={opt.id} onClick={() => setMode(opt.id)} style={{
              flex: 1, textAlign: "left", padding: "20px", background: opt.bg,
              border: "2px solid " + opt.border, borderRadius: 12, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(9,30,66,.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ marginBottom: 12 }}>{opt.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: "#505f79", lineHeight: 1.55 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (mode === "delivery") return <DeliveryProjectModal onClose={onClose} onCreate={onCreate} onBack={() => setMode(null)} />;
  if (mode === "discovery") return <DiscoveryProjectModal onClose={onClose} onCreate={onCreate} onBack={() => setMode(null)} />;
}

function DeliveryProjectModal({ onClose, onCreate, onBack }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ idea: "", platform: "", type: "", industry: "", teamSize: "", constraints: "", definition: "" });
  const [projectName, setProjectName] = useState("");
  const [generating, setGenerating] = useState(false);

  const questions = [
    { label: "The Idea", key: "idea", q: "What are you building and why?", sub: "Describe the product, the problem it solves, and who it's for. The more detail, the better the AI output.", placeholder: "e.g. An internal tool for our finance team to replace manual Excel-based reporting...", multiline: true },
    { label: "Platform", key: "platform", q: "Where will it live?", sub: null, options: ["Web", "Mobile", "Both"] },
    { label: "Project Type", key: "type", q: "Starting from scratch or improving something?", sub: null, options: ["Greenfield — building from zero", "Existing — improving or extending a product"] },
    { label: "Industry", key: "industry", q: "What industry or domain?", sub: "Helps scope assumptions, compliance needs, and terminology.", placeholder: "e.g. FinTech, Healthcare, Internal Operations, E-commerce..." },
    { label: "Team", key: "teamSize", q: "Who's on the team?", sub: "Rough composition is enough — helps with capacity planning.", placeholder: "e.g. 8 people: 3 FE, 2 BE, 1 FS, 1 Mobile, 1 PM" },
    { label: "Constraints", key: "constraints", q: "Any known constraints?", sub: "Timelines, tech stack, integrations, compliance, budget, etc.", placeholder: "e.g. Must launch by Q3, must integrate with SAP, HIPAA compliance required..." },
    { label: "Definition", key: "definition", q: "How well-defined is the scope right now?", sub: null, options: ["Clear — requirements are documented", "Exploratory — still discovering", "Mixed — some clear, some open"] },
  ];

  const cur = questions[step];
  const val = answers[cur.key];
  const isLast = step === questions.length - 1;
  const next = () => { if (!val.trim()) return; if (!isLast) setStep(s => s + 1); else generate(); };
  const prev = () => step === 0 ? onBack() : setStep(s => s - 1);

  const generate = async () => {
    setGenerating(true);
    const prompt = "Create a project overview.\nIdea: " + answers.idea + "\nPlatform: " + answers.platform + "\nType: " + answers.type + "\nIndustry: " + answers.industry + "\nTeam: " + answers.teamSize + "\nConstraints: " + answers.constraints + "\nName hint: " + projectName + "\n\nReturn JSON only (no fences):\n{\"name\":\"...\",\"about\":\"2-3 sentences\",\"assumptions\":[\"...\"],\"risks\":[\"...\"],\"velocity\":30,\"suggestedEpics\":[{\"title\":\"...\",\"description\":\"...\"}]}";
    const result = await askClaude([{ role: "user", content: prompt }], "Return only valid JSON. No markdown.");
    setGenerating(false);
    try {
      const data = JSON.parse(result.replace(/```json?|```/g, "").trim());
      const epics = (data.suggestedEpics || []).map(e => ({ ...e, id: uid(), stories: 0 }));
      onCreate({ id: uid(), mode: "delivery", name: data.name || projectName || "New Project", about: data.about || answers.idea, platform: answers.platform.split(" ")[0], type: answers.type.split(" ")[0], industry: answers.industry, teamSize: parseInt(answers.teamSize) || 5, velocity: data.velocity || 30, designVelocity: 20, assumptions: data.assumptions || [], risks: data.risks || [], stakeholders: [], personas: [], epics, stories: [], bugs: [], design: [], team: [], sprints: [], vacations: [], customHolidays: [], jira: null, syncUrl: "", aiRules: [] });
    } catch {
      onCreate({ id: uid(), mode: "delivery", name: projectName || "New Project", about: answers.idea, platform: answers.platform.split(" ")[0], type: answers.type.split(" ")[0], industry: answers.industry, teamSize: 5, velocity: 30, designVelocity: 20, assumptions: [], risks: [], stakeholders: [], personas: [], epics: [], stories: [], bugs: [], design: [], team: [], sprints: [], vacations: [], customHolidays: [], jira: null, syncUrl: "", aiRules: [] });
    }
  };

  return (
    <Modal title="New Delivery Project" onClose={!generating ? onClose : undefined}
      footer={generating ? null :
        <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" onClick={prev}>{step === 0 ? "← Back" : "← Prev"}</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={next} disabled={!val.trim()}>{isLast ? "Generate Project →" : "Next →"}</button>
          </div>
        </div>}>
      {!generating ? (
        <>
          <div className="step-dots" style={{ marginBottom: 20 }}>
            {questions.map((_, i) => <div key={i} className={"step-dot" + (i <= step ? " on" : "")} />)}
          </div>
          <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{cur.label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: cur.sub ? 6 : 14 }}>{cur.q}</div>
          {cur.sub && <div style={{ fontSize: 13, color: "#6b778c", marginBottom: 14, lineHeight: 1.6 }}>{cur.sub}</div>}
          {cur.options ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cur.options.map(opt => (
                <button key={opt} onClick={() => setAnswers(a => ({ ...a, [cur.key]: opt }))}
                  style={{ textAlign: "left", padding: "10px 14px", border: "2px solid " + (val === opt ? "#0052cc" : "#dfe1e6"), borderRadius: 8, background: val === opt ? "#e8f0fe" : "#ffffff", cursor: "pointer", fontSize: 13, color: val === opt ? "#0052cc" : "#344563", fontFamily: "'DM Sans',sans-serif", fontWeight: val === opt ? 600 : 400 }}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Project Name (optional)</label>
                <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="AI will suggest one if left blank" />
              </div>
              {cur.multiline
                ? <textarea value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))} placeholder={cur.placeholder} rows={5} autoFocus />
                : <input value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))} placeholder={cur.placeholder} autoFocus onKeyDown={e => e.key === "Enter" && next()} />}
            </>
          )}
          {step > 0 && (
            <div style={{ marginTop: 20, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #ebecf0" }}>
              {questions.slice(0, step).map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: "#36b37e" }}>✓</span>
                  <span style={{ color: "#b3bac5" }}>{q.label}:</span>
                  <span style={{ color: "#6b778c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{answers[q.key]}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 16 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
          <div style={{ fontSize: 14, color: "#344563", fontWeight: 500 }}>Generating your project...</div>
          <div style={{ fontSize: 12, color: "#97a0af", marginTop: 6 }}>Creating epics, assumptions, risks, and velocity estimate</div>
        </div>
      )}
    </Modal>
  );
}

function DiscoveryProjectModal({ onClose, onCreate, onBack }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ name: "", client: "", clientType: "startup", industry: "", platform: "", about: "", users: "", constraints: "", knownRisks: "", existingResearch: "" });
  const [generating, setGenerating] = useState(false);

  const questions = [
    { key: "name", label: "Project Name", q: "What do we call this discovery?", sub: "The client or project name — doesn't need to be final.", placeholder: "e.g. Lacoste E-commerce Rethink, HealthTrack MVP Discovery..." },
    { key: "clientType", label: "Client Type", q: "What kind of client is this?", sub: "Shapes the tone of meetings, documentation, and estimation.", options: ["startup", "scaleup", "enterprise"] },
    { key: "industry", label: "Industry", q: "What industry or domain?", sub: "Helps scope assumptions, terminology, and compliance considerations.", placeholder: "e.g. Retail, FinTech, Healthcare, Logistics, EdTech..." },
    { key: "platform", label: "Platform", q: "Where will the product live?", sub: null, options: ["Web", "Mobile", "Both", "Unknown — to be discovered"] },
    { key: "about", label: "Context", q: "What do we know so far?", sub: "Describe the problem, opportunity, or business goal. Everything helps — rough is fine.", placeholder: "e.g. Lacoste wants to understand why their mobile checkout has a 60% drop-off. They suspect onboarding is the issue but don't have data to confirm...", multiline: true },
    { key: "users", label: "Users", q: "Who are the end users?", sub: "Who will use this product? What do we know about them?", placeholder: "e.g. Internal finance team (mid-level analysts), customers aged 25-45 who shop online 2-3x per month..." },
    { key: "constraints", label: "Constraints", q: "Any known constraints?", sub: "Budget, timelines, tech restrictions, compliance, existing systems...", placeholder: "e.g. Must integrate with SAP, GDPR compliance, 3-month discovery budget, team limited to 6 people..." },
    { key: "existingResearch", label: "Existing Research", q: "What already exists?", sub: "Previous research, documentation, data, or decisions already made. Paste or summarize anything useful.", placeholder: "e.g. We have a 2023 customer survey, 3 stakeholder interviews recorded, and a legacy system architecture diagram...", multiline: true },
  ];

  const cur = questions[step];
  const val = answers[cur.key];
  const isLast = step === questions.length - 1;
  const next = () => { if (!val?.trim()) return; if (!isLast) setStep(s => s + 1); else generate(); };
  const prev = () => step === 0 ? onBack() : setStep(s => s - 1);

  const generate = async () => {
    setGenerating(true);
    const prompt = "Generate a discovery project setup.\n\nProject: " + answers.name + "\nClient type: " + answers.clientType + "\nIndustry: " + answers.industry + "\nPlatform: " + answers.platform + "\nContext: " + answers.about + "\nUsers: " + answers.users + "\nConstraints: " + answers.constraints + "\nExisting research: " + answers.existingResearch + "\n\nReturn JSON only (no fences):\n{\"about\":\"3-4 sentence project summary\",\"assumptions\":[\"5-7 discovery assumptions as strings\"],\"risks\":[{\"text\":\"risk\",\"source\":\"initial\"}],\"opportunities\":[{\"text\":\"opportunity\",\"source\":\"initial\"}],\"suggestedAgenda\":\"A short kick-off meeting agenda for the first discovery session\"}";
    const result = await askClaude([{ role: "user", content: prompt }], "Senior PM facilitator. Discovery project setup. Return only valid JSON.");
    setGenerating(false);
    const parsed = parseJSON(result) || {};
    onCreate({
      id: uid(), mode: "discovery",
      name: answers.name || "Discovery Project",
      about: parsed.about || answers.about,
      clientType: answers.clientType,
      industry: answers.industry,
      platform: answers.platform.split(" ")[0],
      type: "Discovery",
      teamSize: 0, velocity: 0, designVelocity: 0,
      assumptions: parsed.assumptions || [],
      risks: parsed.risks || [],
      opportunities: parsed.opportunities || [],
      discoveryPhase: "discovery",
      sessions: [],
      savedAgenda: parsed.suggestedAgenda || "",
      backbone: [], storyMap: [],
      flows: [], personas: [],
      architectureNotes: "", nfrs: [], adrs: [], integrations: [], spikes: [],
      designResearchPlan: "", designPriorities: [], designNextSteps: [],
      scenarios: null, presentationNotes: "",
      stakeholders: [], epics: [], stories: [], bugs: [], design: [],
      team: [], sprints: [], vacations: [], customHolidays: [],
      jira: null, syncUrl: "", aiRules: [],
    });
  };

  return (
    <Modal title="New Discovery Project" onClose={!generating ? onClose : undefined}
      footer={generating ? null :
        <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" onClick={prev}>{step === 0 ? "← Back" : "← Prev"}</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={next} disabled={!val?.trim()}>{isLast ? "Start Discovery →" : "Next →"}</button>
          </div>
        </div>}>
      {!generating ? (
        <>
          <div className="step-dots" style={{ marginBottom: 20 }}>
            {questions.map((_, i) => <div key={i} className={"step-dot" + (i <= step ? " on" : "")} />)}
          </div>
          <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{cur.label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: cur.sub ? 6 : 14 }}>{cur.q}</div>
          {cur.sub && <div style={{ fontSize: 13, color: "#6b778c", marginBottom: 14, lineHeight: 1.6 }}>{cur.sub}</div>}
          {cur.options ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cur.options.map(opt => (
                <button key={opt} onClick={() => setAnswers(a => ({ ...a, [cur.key]: opt }))}
                  style={{ textAlign: "left", padding: "10px 14px", border: "2px solid " + (val === opt ? "#7a6000" : "#dfe1e6"), borderRadius: 8, background: val === opt ? "#fff8e1" : "#ffffff", cursor: "pointer", fontSize: 13, color: val === opt ? "#7a6000" : "#344563", fontFamily: "'DM Sans',sans-serif", fontWeight: val === opt ? 600 : 400 }}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            cur.multiline
              ? <textarea value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))} placeholder={cur.placeholder} rows={5} autoFocus />
              : <input value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))} placeholder={cur.placeholder} autoFocus onKeyDown={e => e.key === "Enter" && next()} />
          )}
          {step > 0 && (
            <div style={{ marginTop: 20, padding: "10px 14px", background: "#fff8e1", borderRadius: 8, border: "1px solid #ffe999" }}>
              {questions.slice(0, step).filter(q => answers[q.key]).map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: "#36b37e" }}>✓</span>
                  <span style={{ color: "#b3bac5" }}>{q.label}:</span>
                  <span style={{ color: "#6b778c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{answers[q.key]}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <Compass size={32} color="#e8c547" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: "#344563", fontWeight: 500 }}>Setting up your discovery project...</div>
          <div style={{ fontSize: 12, color: "#97a0af", marginTop: 6 }}>Preparing initial assumptions, risks, and a kickoff agenda</div>
        </div>
      )}
    </Modal>
  );
}


// ─── Discovery Data Helpers ──────────────────────────────────────────────────
const DISCOVERY_TEMPLATE = {
  mode: "discovery",
  clientType: "startup",
  sessions: [],
  backbone: [],
  storyMap: [],
  assumptions: [],
  risks: [],
  opportunities: [],
  personas: [],
  flows: [],
  architectureNotes: "",
  nfrs: [],
  adrs: [],
  integrations: [],
  designResearchPlan: "",
  designPriorities: [],
  scenarios: null,
  presentationNotes: "",
  discoveryPhase: "discovery",
};

const MOSCOW_COLORS = {
  Must: { bg: "#ffebe6", color: "#bf2600", border: "#ffd5cc" },
  Should: { bg: "#fff8e1", color: "#7a5c00", border: "#ffe999" },
  Could: { bg: "#e3fcef", color: "#00632b", border: "#abf5d1" },
  Won_t: { bg: "#f1f2f4", color: "#6b778c", border: "#dfe1e6" },
};

// ─── Shared Discovery Utilities ───────────────────────────────────────────────
function CopyBox({ label, content }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</span>
        <button className="btn btn-ghost btn-xs" onClick={copy}><Copy size={11} /> {copied ? "Copied!" : "Copy"}</button>
      </div>
      <pre style={{ background: "#f8f9fa", border: "1px solid #ebecf0", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "#344563", whiteSpace: "pre-wrap", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65 }}>{content}</pre>
    </div>
  );
}

function PhaseTag({ phase }) {
  const map = { discovery: { label: "Discovery", color: "#0052cc", bg: "#e6f0ff" }, "story-mapping": { label: "Story Mapping", color: "#5b21b6", bg: "#f3e6ff" }, planning: { label: "Planning", color: "#7a5c00", bg: "#fff8e1" }, complete: { label: "Complete", color: "#00632b", bg: "#e3fcef" } };
  const t = map[phase] || map.discovery;
  return <span style={{ fontSize: 11, fontWeight: 600, color: t.color, background: t.bg, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono',monospace" }}>{t.label}</span>;
}

// ─── Discovery Overview ───────────────────────────────────────────────────────
function DiscoveryOverview({ project, update, setSection }) {
  const phases = ["discovery", "story-mapping", "planning", "complete"];
  const phaseLabels = { discovery: "Discovery", "story-mapping": "Story Mapping", planning: "Planning", complete: "Complete" };
  const cur = phases.indexOf(project.discoveryPhase || "discovery");

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">{project.name}</div>
          <div className="sec-sub">{project.clientType === "startup" ? "Startup" : "Enterprise"} · Discovery Project · {project.industry}</div>
        </div>
        <div className="sec-actions">
          <PhaseTag phase={project.discoveryPhase || "discovery"} />
          <span className="tag tag-muted">{project.clientType}</span>
        </div>
      </div>

      {/* Phase progress */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#344563", marginBottom: 14 }}>Discovery Progress</div>
        <div style={{ display: "flex", gap: 0 }}>
          {phases.map((p, i) => (
            <div key={p} style={{ flex: 1, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div onClick={() => update({ discoveryPhase: p })} style={{ width: 28, height: 28, borderRadius: "50%", background: i <= cur ? "#e8c547" : "#ebecf0", border: i === cur ? "3px solid #c9a800" : "2px solid " + (i < cur ? "#e8c547" : "#dfe1e6"), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, zIndex: 1 }}>
                  {i < cur ? <Check size={12} color="#3d2e00" /> : <span style={{ fontSize: 11, fontWeight: 700, color: i === cur ? "#3d2e00" : "#97a0af" }}>{i + 1}</span>}
                </div>
                {i < phases.length - 1 && <div style={{ flex: 1, height: 2, background: i < cur ? "#e8c547" : "#ebecf0" }} />}
              </div>
              <div style={{ fontSize: 10, color: i <= cur ? "#344563" : "#97a0af", marginTop: 6, fontWeight: i === cur ? 600 : 400 }}>{phaseLabels[p]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>About</div>
          <p style={{ fontSize: 13, color: "#505f79", lineHeight: 1.65 }}>{project.about}</p>
          {project.assumptions?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Key Assumptions</div>
              <div className="chips">{project.assumptions.slice(0, 4).map((a, i) => <span key={i} className="chip">{a}</span>)}</div>
            </div>
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>Discovery Status</div>
          {[
            { label: "Sessions logged", value: (project.sessions || []).length, color: "#0052cc", ok: (project.sessions || []).length > 0 },
            { label: "Stakeholders mapped", value: (project.stakeholders || []).length, color: "#5b21b6", ok: (project.stakeholders || []).length > 0 },
            { label: "Risks identified", value: (project.risks || []).length, color: "#de350b", ok: (project.risks || []).length > 0 },
            { label: "Opportunities", value: (project.opportunities || []).length, color: "#00875a", ok: (project.opportunities || []).length > 0 },
          ].map(({ label, value, color, ok }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ebecf0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? color : "#ebecf0" }} />
                <span style={{ fontSize: 13, color: "#505f79" }}>{label}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: ok ? color : "#97a0af" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>Quick Navigation</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { id: "d-meetings", label: "Meeting Prep", desc: "Generate agenda & prepare questions", Icon: ClipboardList },
            { id: "d-sessions", label: "Sessions", desc: "Log notes, extract insights with AI", Icon: FileText },
            { id: "d-docs", label: "Research Docs", desc: "Upload PDFs & briefs, AI extracts insights", Icon: Upload },
            { id: "d-todos", label: "To Do", desc: "Tasks from sessions, meetings, or AI", Icon: CheckCircle2 },
            { id: "d-stakeholders", label: "Stakeholders", desc: "Map influence, auto-fill from sessions", Icon: Users },
            { id: "d-ai", label: "AI Colleague", desc: "Validate ideas, prep meetings, find gaps", Icon: Bot },
            { id: "d-storymap", label: "Story Mapping", desc: "Backbone → Epics → Features", Icon: Map },
            { id: "d-planning", label: "Tech Planning", desc: "Architecture, NFRs, ADRs", Icon: Cpu },
            { id: "d-design", label: "Design Planning", desc: "Research plan & priorities", Icon: Palette },
            { id: "d-team", label: "Team & Estimation", desc: "3 team scenarios with costs", Icon: BarChart2 },
            { id: "d-presentation", label: "Client Presentation", desc: "Export full document", Icon: Presentation },
          ].map(({ id, label, desc, Icon }) => (
            <button key={id} onClick={() => setSection(id)} style={{ textAlign: "left", padding: "12px", background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 8, cursor: "pointer", transition: "all .12s", fontFamily: "'DM Sans',sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f0f1f3"; e.currentTarget.style.borderColor = "#b3bac5"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f8f9fa"; e.currentTarget.style.borderColor = "#dfe1e6"; }}>
              <Icon size={16} color="#6b778c" style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: "#172b4d", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: "#97a0af" }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Discovery Meeting Prep ────────────────────────────────────────────────────
function DiscoveryMeetingPrep({ project, update }) {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState("pre-discovery");
  const [duration, setDuration] = useState("60");
  const [callType, setCallType] = useState("external");
  const [extra, setExtra] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [wrapUp, setWrapUp] = useState(null); // agenda being wrapped up
  const [wrapForm, setWrapForm] = useState({ participants: "", notes: "", date: new Date().toISOString().split("T")[0] });
  const [wrapStep, setWrapStep] = useState("notes"); // "notes" | "checking" | "followup" | "logging"
  const [followUpQs, setFollowUpQs] = useState([]); // [{question, answer}]
  const [wrapping, setWrapping] = useState(false);

  const agendas = project.agendas || [];

  // Migrate legacy savedAgenda string (from project creation wizard) into the agendas array
  useEffect(() => {
    if (project.savedAgenda && agendas.length === 0) {
      const migrated = {
        id: uid(),
        title: "Pre-Discovery Kickoff",
        phase: "pre-discovery",
        clientType: project.clientType || "startup",
        content: project.savedAgenda,
        createdAt: new Date().toISOString().split("T")[0],
        wrappedUp: false,
      };
      update({ agendas: [migrated], savedAgenda: "" });
      setExpanded(migrated.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const phases = [
    { id: "pre-discovery", label: "Pre-Discovery Kickoff" },
    { id: "user-research", label: "User Research Session" },
    { id: "technical", label: "Technical Discovery" },
    { id: "stakeholder", label: "Stakeholder Alignment" },
    { id: "synthesis", label: "Synthesis & Wrap-Up" },
  ];

  const generateAgenda = async () => {
    setGenerating(true);
    const clientType = project.clientType || "startup";
    const phaseLabel = phases.find(p => p.id === phase)?.label || phase;
    const reply = await askClaude([{
      role: "user", content:
        `Create a discovery meeting agenda for:\nProject: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nClient type: ${clientType}\nPhase: ${phase}\nCall type: ${callType === "internal" ? "Internal team call" : "External client call"}\nDuration: ${duration} minutes\nExtra context: ${extra || "none"}\n\nGenerate a structured agenda with:\n1. Meeting objective (1 sentence)\n2. Participants suggested (with roles)\n3. Time blocks that fit within ${duration} minutes (e.g. 0:00–0:10 Welcome...)\n4. Key topics to cover (5-8 specific to this project and phase)\n${callType === "external" ? "5. Pre-work to send to client (2-4 items)\n6. Key questions to ask (6-10 specific, not generic)\n7. Expected outputs from this session" : "5. Key discussion points (6-10 specific, not generic)\n6. Decisions to make in this session\n7. Expected outputs and next steps"}\n\nBe SPECIFIC to this project. For a ${clientType} ${callType === "internal" ? "internal" : "client"} call, the tone and depth should differ. Format it clearly with sections and time estimates. Total meeting: ${duration} minutes.`
    }],
      "You are a senior product discovery facilitator. Create practical, specific agendas — not generic templates. Reference the project context throughout.", 2000);
    const newAgenda = {
      id: uid(),
      title: phaseLabel,
      phase,
      clientType,
      callType,
      duration,
      content: reply,
      createdAt: new Date().toISOString().split("T")[0],
      wrappedUp: false,
    };
    const updated = [...agendas, newAgenda];
    update({ agendas: updated });
    setExpanded(newAgenda.id);
    setExtra("");
    setGenerating(false);
  };

  const deleteAgenda = (id) => {
    if (!window.confirm("Delete this agenda?")) return;
    update({ agendas: agendas.filter(a => a.id !== id) });
    if (expanded === id) setExpanded(null);
  };

  const saveTitle = (id) => {
    update({ agendas: agendas.map(a => a.id === id ? { ...a, title: editTitle } : a) });
    setEditingId(null);
  };

  const openWrapUp = (agenda) => {
    setWrapUp(agenda);
    setWrapForm({ participants: "", notes: "", date: new Date().toISOString().split("T")[0] });
    setWrapStep("notes");
    setFollowUpQs([]);
  };

  const doLog = async (extraNotes = "") => {
    setWrapStep("logging");
    const finalNotes = extraNotes
      ? wrapForm.notes.trim() + "\n\n" + extraNotes
      : wrapForm.notes.trim();
    const session = {
      id: uid(),
      title: wrapUp.title,
      date: wrapForm.date,
      participants: wrapForm.participants,
      notes: finalNotes,
      agendaId: wrapUp.id,
      outputs: null,
    };
    const updatedAgendas = agendas.map(a => a.id === wrapUp.id ? { ...a, wrappedUp: true, sessionId: session.id } : a);
    update({ agendas: updatedAgendas, sessions: [...(project.sessions || []), session] });
    setWrapUp(null);
    setWrapStep("notes");
  };

  const confirmWrapUp = async () => {
    const notes = wrapForm.notes.trim();
    if (!notes && !window.confirm("No notes added. Log session anyway?")) return;

    // Notes are detailed enough — skip the follow-up check
    if (notes.length > 600) { doLog(); return; }

    // Ask Claude if follow-up questions are needed
    setWrapStep("checking");
    const agendaSnippet = (wrapUp.content || "").slice(0, 800);
    const reply = await askClaude([{
      role: "user",
      content: `You are reviewing notes from a product discovery meeting.

AGENDA:
${agendaSnippet}

NOTES WRITTEN SO FAR:
${notes || "(none)"}

PARTICIPANTS: ${wrapForm.participants || "not specified"}
PROJECT: ${project.name} — ${project.about || ""}

Assess whether the notes capture enough context for this meeting type. Look for:
- What was actually decided or concluded
- Key blockers, risks, or open questions that came up
- Reactions from the client or stakeholders
- Anything unexpected that happened

If the notes are already sufficient, return: {"needsMore": false}
If important context is missing, return 1-2 SHORT, specific follow-up questions (not generic):
{"needsMore": true, "questions": ["Specific question 1?", "Specific question 2?"]}

Return ONLY valid JSON.`,
    }],
      "You are a discovery facilitator reviewing meeting notes. Return only valid JSON.", 400);

    const parsed = parseJSON(reply);
    if (!parsed || !parsed.needsMore || !parsed.questions?.length) {
      doLog(); return;
    }
    setFollowUpQs(parsed.questions.map(q => ({ question: q, answer: "" })));
    setWrapStep("followup");
  };

  const logWithAnswers = () => {
    const answered = followUpQs.filter(q => q.answer.trim());
    const extra = answered.length
      ? "Follow-up:\n" + answered.map(q => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n")
      : "";
    doLog(extra);
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Meeting Prep</div><div className="sec-sub">AI-generated agendas — wrap up a meeting to auto-log it as a discovery session</div></div>
      </div>

      {/* Generator */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 14 }}>Generate New Agenda</div>
        <div className="row">
          <div className="field">
            <label>Meeting Type</label>
            <select value={phase} onChange={e => setPhase(e.target.value)}>
              {phases.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Duration (min)</label>
            <select value={duration} onChange={e => setDuration(e.target.value)}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min</option>
            </select>
          </div>
          <div className="field">
            <label>Call Type</label>
            <select value={callType} onChange={e => setCallType(e.target.value)}>
              <option value="external">External (client)</option>
              <option value="internal">Internal (team)</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Additional Context</label>
          <textarea value={extra} onChange={e => setExtra(e.target.value)} placeholder="e.g. 3rd meeting, user journeys already mapped. Focus on technical constraints..." rows={2} />
        </div>
        <button className="btn btn-primary" onClick={generateAgenda} disabled={generating} style={{ width: "100%" }}>
          {generating ? <><div className="ai-dot" /><div className="ai-dot" style={{ animationDelay: ".2s" }} /><div className="ai-dot" style={{ animationDelay: ".4s" }} /> Generating…</> : <><Sparkles size={13} /> Generate Agenda</>}
        </button>
      </div>

      {/* Agenda list */}
      {agendas.length === 0 && (
        <div className="card" style={{ background: "#f8f9fa" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#344563", marginBottom: 10 }}>What you'll get</div>
          {["Meeting objective tailored to your project phase", "Suggested participants with roles", "Time blocks fitted to your chosen duration", "Pre-work checklist (external) or discussion points (internal)", "6–10 specific questions based on your project", "Expected outputs from the session"].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, fontSize: 13, color: "#505f79" }}>
              <span style={{ color: "#36b37e", flexShrink: 0 }}>✓</span> {item}
            </div>
          ))}
        </div>
      )}

      {agendas.map(a => (
        <div key={a.id} className="card" style={{ marginBottom: 10 }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="icon-btn" onClick={() => setExpanded(expanded === a.id ? null : a.id)} style={{ flexShrink: 0 }}>
              {expanded === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {editingId === a.id ? (
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                onBlur={() => saveTitle(a.id)} onKeyDown={e => e.key === "Enter" && saveTitle(a.id)}
                autoFocus style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "3px 8px" }} />
            ) : (
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#172b4d" }}>{a.title}</span>
                <span style={{ fontSize: 11, color: "#97a0af", marginLeft: 8 }}>{a.createdAt}</span>
                {a.duration && <span style={{ fontSize: 10, color: "#0052cc", fontWeight: 600, background: "#e6f0ff", borderRadius: 4, padding: "1px 7px", marginLeft: 6, fontFamily: "'DM Mono',monospace" }}>{a.duration}min</span>}
                {a.callType && <span style={{ fontSize: 10, color: a.callType === "internal" ? "#5b21b6" : "#7a5c00", fontWeight: 600, background: a.callType === "internal" ? "#f3e6ff" : "#fff8e1", borderRadius: 4, padding: "1px 7px", marginLeft: 4, fontFamily: "'DM Mono',monospace" }}>{a.callType === "internal" ? "INTERNAL" : "EXTERNAL"}</span>}
                {a.wrappedUp && <span style={{ fontSize: 10, color: "#36b37e", fontWeight: 700, background: "#e3fcef", borderRadius: 4, padding: "1px 7px", marginLeft: 4, fontFamily: "'DM Mono',monospace" }}>LOGGED</span>}
              </div>
            )}

            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {!a.wrappedUp && (
                <button className="btn btn-primary btn-sm" onClick={() => openWrapUp(a)} title="Wrap up — log as a session">
                  <CheckCircle2 size={12} /> Wrap Up
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(a.content); setCopied(a.id); setTimeout(() => setCopied(null), 2000); }}>
                <Copy size={12} /> {copied === a.id ? "Copied!" : "Copy"}
              </button>
              <button className="icon-btn" onClick={() => { setEditingId(a.id); setEditTitle(a.title); }} title="Edit title"><Edit2 size={13} /></button>
              <button className="icon-btn" onClick={() => deleteAgenda(a.id)} title="Delete"><Trash2 size={13} /></button>
            </div>
          </div>

          {/* Expanded content */}
          {expanded === a.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ebecf0" }}>
              <div className="md-agenda">
                <ReactMarkdown>{a.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Wrap Up modal */}
      {wrapUp && (
        <Modal title={`Wrap Up — ${wrapUp.title}`} onClose={() => { setWrapUp(null); setWrapStep("notes"); }}
          footer={
            wrapStep === "notes" ? (
              <><button className="btn btn-ghost" onClick={() => { setWrapUp(null); setWrapStep("notes"); }}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmWrapUp}>
                  <CheckCircle2 size={13} /> Log Session
                </button></>
            ) : wrapStep === "checking" ? (
              <button className="btn btn-ghost" disabled style={{ opacity: .5 }}>Reviewing notes…</button>
            ) : wrapStep === "followup" ? (
              <><button className="btn btn-ghost" onClick={() => doLog()}>Skip & Log</button>
                <button className="btn btn-primary" onClick={logWithAnswers}>
                  <CheckCircle2 size={13} /> Log Session
                </button></>
            ) : (
              <button className="btn btn-ghost" disabled style={{ opacity: .5 }}>Logging…</button>
            )
          }>

          {/* Step: notes */}
          {(wrapStep === "notes" || wrapStep === "checking") && (<>
            <p style={{ fontSize: 13, color: "#6b778c", lineHeight: 1.65, marginBottom: 16 }}>
              This will create a session log in <strong>Sessions & Outputs</strong> linked to this agenda. Add your notes from the meeting below.
            </p>
            <div className="row">
              <div className="field">
                <label>Date</label>
                <input type="date" value={wrapForm.date} onChange={e => setWrapForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Participants</label>
                <input value={wrapForm.participants} onChange={e => setWrapForm(f => ({ ...f, participants: e.target.value }))} placeholder="e.g. PM, CTO, Design Lead" />
              </div>
            </div>
            <div className="field">
              <label>Session Notes</label>
              <textarea value={wrapForm.notes} onChange={e => setWrapForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Paste or type what happened in the meeting — decisions made, things discussed, surprises. AI will extract outputs later." rows={7}
                disabled={wrapStep === "checking"} />
            </div>
            {wrapStep === "checking" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: "#6b778c", fontSize: 13 }}>
                <div className="ai-typing" style={{ display: "inline-flex" }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
                Reviewing your notes for gaps…
              </div>
            )}
          </>)}

          {/* Step: follow-up questions */}
          {wrapStep === "followup" && (<>
            <div style={{ background: "#f8f9fa", border: "1px solid #dfe1e6", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#172b4d", marginBottom: 4 }}>Your notes look a bit light</div>
              <div style={{ fontSize: 12, color: "#6b778c" }}>Answer what you can — anything helps. You can skip questions by leaving them blank.</div>
            </div>
            {followUpQs.map((q, i) => (
              <div key={i} className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#172b4d" }}>{q.question}</label>
                <textarea value={q.answer} rows={3}
                  onChange={e => setFollowUpQs(qs => qs.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))}
                  placeholder="Optional — leave blank to skip" autoFocus={i === 0} />
              </div>
            ))}
          </>)}

          {wrapStep === "logging" && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#6b778c", fontSize: 13 }}>
              <div className="ai-typing" style={{ display: "inline-flex", marginBottom: 10 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div>Logging session…</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Discovery Sessions ────────────────────────────────────────────────────────
function DiscoverySessions({ project, update }) {
  const [modal, setModal] = useState(null);
  const [sessionForm, setSessionForm] = useState({ date: new Date().toISOString().split("T")[0], title: "", participants: "", notes: "" });
  const [extracting, setExtracting] = useState(null);
  const [shareSession, setShareSession] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openList, setOpenList] = useState(null); // "risks" | "opportunities" | "assumptions" | "flows"
  const [editingItem, setEditingItem] = useState(null); // { type, id, text }
  const sessions = project.sessions || [];

  const saveSession = () => {
    if (!sessionForm.title.trim()) return;
    const session = { ...sessionForm, id: uid(), outputs: null };
    update({ sessions: [...sessions, session] });
    setModal(null);
    setSessionForm({ date: new Date().toISOString().split("T")[0], title: "", participants: "", notes: "" });
  };

  const deleteSession = (id) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    update({ sessions: sessions.filter(s => s.id !== id) });
  };

  const buildShareText = (s) => {
    const lines = [
      `# ${s.title}`,
      `**Date:** ${s.date}`,
      `**Participants:** ${s.participants}`,
      "",
      "## Notes",
      s.notes || "_No notes recorded._",
    ];
    if (s.outputs) {
      if (s.outputs.keyDecisions?.length) { lines.push("", "## Key Decisions"); s.outputs.keyDecisions.forEach(d => lines.push(`- ${d}`)); }
      if (s.outputs.risks?.length) { lines.push("", "## Risks Identified"); s.outputs.risks.forEach(r => lines.push(`- ${r}`)); }
      if (s.outputs.opportunities?.length) { lines.push("", "## Opportunities"); s.outputs.opportunities.forEach(o => lines.push(`- ${o}`)); }
      if (s.outputs.assumptions?.length) { lines.push("", "## Assumptions"); s.outputs.assumptions.forEach(a => lines.push(`- ${a}`)); }
      if (s.outputs.openQuestions?.length) { lines.push("", "## Open Questions"); s.outputs.openQuestions.forEach(q => lines.push(`- ${q}`)); }
      if (s.outputs.flows?.length) { lines.push("", "## Flows Mapped"); s.outputs.flows.forEach(f => lines.push(`- ${f}`)); }
    }
    return lines.join("\n");
  };

  const extractOutputs = async (session) => {
    setExtracting(session.id);
    const reply = await askClaude([{ role: "user", content: `Extract structured outputs from these discovery session notes.\n\nSession: ${session.title}\nProject: ${project.name} (${project.industry})\nNotes:\n${session.notes}\n\nReturn JSON:\n{"personas":[{"role":"..","description":".."}],"flows":["flow1","flow2"],"risks":["risk1"],"opportunities":["opp1"],"assumptions":["assumption1"],"keyDecisions":["decision1"],"openQuestions":["question1"]}\n\nOnly include what's actually in the notes. Return valid JSON only.` }],
      "Extract PM discovery outputs from meeting notes. Return only valid JSON.", 1500);
    const parsed = parseJSON(reply);
    if (parsed) {
      const updated = sessions.map(s => s.id === session.id ? { ...s, outputs: parsed } : s);
      update({
        sessions: updated,
        risks: [...(project.risks || []), ...(parsed.risks || []).map(r => ({ id: uid(), text: r, source: session.title }))],
        opportunities: [...(project.opportunities || []), ...(parsed.opportunities || []).map(o => ({ id: uid(), text: o, source: session.title }))],
        assumptions: [...(project.assumptions || []), ...(parsed.assumptions || [])],
        flows: [...(project.flows || []), ...(parsed.flows || [])],
      });
    }
    setExtracting(null);
  };

  const outputs = {
    risks: project.risks || [],
    opportunities: project.opportunities || [],
    assumptions: project.assumptions || [],
    flows: project.flows || [],
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Sessions & Outputs</div><div className="sec-sub">Log meeting notes — AI extracts risks, opportunities, assumptions, and flows</div></div>
        <button className="btn btn-primary" onClick={() => setModal("new")}><Plus size={13} /> Log Session</button>
      </div>

      <div className="two-col" style={{ marginBottom: 20 }}>
        {[
          { label: "Risks", key: "risks", items: outputs.risks, color: "#de350b", bg: "#ffebe6" },
          { label: "Opportunities", key: "opportunities", items: outputs.opportunities, color: "#00632b", bg: "#e3fcef" },
          { label: "Assumptions", key: "assumptions", items: outputs.assumptions, color: "#7a5c00", bg: "#fff8e1" },
          { label: "Flows Mapped", key: "flows", items: outputs.flows, color: "#0052cc", bg: "#e6f0ff" },
        ].map(({ label, key, items, color, bg }) => (
          <div key={label} className="card" style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => setOpenList(key)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, padding: "1px 8px", borderRadius: 4 }}>{items.length}</span>
            </div>
            {items.slice(0, 3).map((item, i) => (
              <div key={i} style={{ fontSize: 12, color: "#505f79", padding: "4px 0", borderBottom: "1px solid #f1f2f4", lineHeight: 1.4 }}>
                {typeof item === "string" ? item : item.text}
              </div>
            ))}
            {items.length > 3 && <div style={{ fontSize: 11, color: "#97a0af", marginTop: 4 }}>+{items.length - 3} more</div>}
            {items.length === 0 && <div style={{ fontSize: 11, color: "#97a0af" }}>None yet — click to add</div>}
          </div>
        ))}
      </div>

      {openList && (() => {
        const listMeta = {
          risks: { label: "Risks", color: "#de350b", bg: "#ffebe6" },
          opportunities: { label: "Opportunities", color: "#00632b", bg: "#e3fcef" },
          assumptions: { label: "Assumptions", color: "#7a5c00", bg: "#fff8e1" },
          flows: { label: "Flows Mapped", color: "#0052cc", bg: "#e6f0ff" },
        }[openList];
        const rawItems = project[openList] || [];
        // normalise: risks/opportunities are {id,text,source}, assumptions/flows are strings
        const isObj = openList === "risks" || openList === "opportunities";
        const items = rawItems.map(i => isObj
          ? (typeof i === "string" ? { id: uid(), text: i, source: "" } : i)
          : i
        );

        const saveItems = (updated) => update({ [openList]: updated });

        const deleteItem = (idx) => {
          if (!window.confirm("Delete this item?")) return;
          const updated = items.filter((_, i) => i !== idx);
          saveItems(updated);
        };

        const startEdit = (idx) => {
          const item = items[idx];
          setEditingItem({ idx, text: isObj ? item.text : item, source: isObj ? (item.source || "") : "" });
        };

        const saveEdit = () => {
          if (!editingItem) return;
          const updated = items.map((item, i) => {
            if (i !== editingItem.idx) return item;
            return isObj ? { ...item, text: editingItem.text, source: editingItem.source } : editingItem.text;
          });
          saveItems(updated);
          setEditingItem(null);
        };

        const addNew = () => {
          const updated = isObj
            ? [...items, { id: uid(), text: "New item", source: "" }]
            : [...items, "New item"];
          saveItems(updated);
          setEditingItem({ idx: updated.length - 1, text: "New item", source: "" });
        };

        return (
          <Modal wide title={listMeta.label} onClose={() => { setOpenList(null); setEditingItem(null); }}
            footer={
              <><button className="btn btn-ghost" onClick={addNew}><Plus size={13} /> Add</button>
                <button className="btn btn-primary" onClick={() => { setOpenList(null); setEditingItem(null); }}>Done</button></>
            }>
            {items.length === 0 && <div style={{ color: "#97a0af", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No items yet. Click Add to create one.</div>}
            {items.map((item, idx) => {
              const text = isObj ? item.text : item;
              const source = isObj ? (item.source || "") : "";
              const isEditing = editingItem?.idx === idx;
              return (
                <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f1f2f4" }}>
                  <div style={{ flex: 1 }}>
                    {isEditing ? (
                      <>
                        <textarea value={editingItem.text} onChange={e => setEditingItem(ei => ({ ...ei, text: e.target.value }))}
                          rows={2} style={{ width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #c1c7d0", borderRadius: 4, resize: "vertical" }} autoFocus />
                        {isObj && (
                          <input value={editingItem.source} onChange={e => setEditingItem(ei => ({ ...ei, source: e.target.value }))}
                            placeholder="Source (optional)" style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #c1c7d0", borderRadius: 4, marginTop: 4 }} />
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingItem(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: "#172b4d", lineHeight: 1.5 }}>{text}</div>
                        {source && <div style={{ fontSize: 11, color: "#97a0af", marginTop: 2 }}>Source: {source}</div>}
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button className="icon-btn" onClick={() => startEdit(idx)} title="Edit"><Edit2 size={13} /></button>
                      <button className="icon-btn" onClick={() => deleteItem(idx)} title="Delete"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </Modal>
        );
      })()}

      {sessions.length === 0 ? (
        <Empty icon={<FileText size={36} />} title="No sessions logged yet" sub="Log your first discovery session and let AI extract the key insights"
          action={<button className="btn btn-primary" onClick={() => setModal("new")}><Plus size={13} /> Log Session</button>} />
      ) : (
        sessions.map(s => (
          <div key={s.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#172b4d" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#97a0af", marginTop: 2 }}>{s.date} · {s.participants}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {!s.outputs && s.notes && (
                  <button className="btn btn-ai btn-sm" onClick={() => extractOutputs(s)} disabled={extracting === s.id}>
                    {extracting === s.id ? "Extracting..." : <><Sparkles size={12} /> Extract Outputs</>}
                  </button>
                )}
                {s.outputs && <span style={{ fontSize: 11, color: "#36b37e", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Outputs extracted</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => setShareSession(s)} title="Share session notes">
                  <ArrowUpRight size={12} /> Share
                </button>
                <button className="icon-btn" onClick={() => deleteSession(s.id)} title="Delete session">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            {s.notes && <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.6, marginBottom: s.outputs ? 10 : 0 }}>{s.notes.slice(0, 200)}{s.notes.length > 200 ? "..." : ""}</p>}
            {s.outputs && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["risks", "opportunities", "assumptions", "keyDecisions", "openQuestions"].map(k => s.outputs[k]?.length > 0 && (
                  <span key={k} className="chip">{s.outputs[k].length} {k}</span>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {modal === "new" && (
        <Modal wide title="Log Discovery Session" onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveSession}>Save Session</button></>}>
          <div className="row">
            <div className="field"><label>Session Title</label><input value={sessionForm.title} onChange={e => setSessionForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Stakeholder Kickoff, User Research Round 1..." autoFocus /></div>
            <div className="field"><label>Date</label><input type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} /></div>
          </div>
          <div className="field"><label>Participants</label><input value={sessionForm.participants} onChange={e => setSessionForm(f => ({ ...f, participants: e.target.value }))} placeholder="e.g. PM, Design Lead, CTO, 2 users" /></div>
          <div className="field"><label>Session Notes</label><textarea value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} placeholder="Paste your raw meeting notes here — the more detail, the better the AI extraction..." rows={8} /></div>
        </Modal>
      )}

      {shareSession && (
        <Modal wide title={`Share — ${shareSession.title}`} onClose={() => { setShareSession(null); setCopied(false); }}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span style={{ fontSize: 12, color: "#97a0af" }}>Copy and paste into Slack, Notion, email, or any tool</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => { setShareSession(null); setCopied(false); }}>Close</button>
                <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(buildShareText(shareSession)); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
                  {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Notes</>}
                </button>
              </div>
            </div>
          }>
          <div style={{ background: "#f4f5f7", border: "1px solid #dfe1e6", borderRadius: 8, padding: "16px 20px", maxHeight: "55vh", overflowY: "auto" }}>
            <div className="md-agenda">
              <ReactMarkdown>{buildShareText(shareSession)}</ReactMarkdown>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Discovery Insights ───────────────────────────────────────────────────────
function DiscoveryInsights({ project, update }) {
  const [activeTab, setActiveTab] = useState("risks");
  const [editingIdx, setEditingIdx] = useState(null);
  const [editText, setEditText] = useState("");
  const [editSource, setEditSource] = useState("");
  const [addingText, setAddingText] = useState("");
  const [addingSource, setAddingSource] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const TABS = [
    { key: "risks", label: "Risks", singular: "Risk", color: "#de350b", bg: "#ffebe6", isObj: true },
    { key: "opportunities", label: "Opportunities", singular: "Opportunity", color: "#00875a", bg: "#e3fcef", isObj: true },
    { key: "assumptions", label: "Assumptions", singular: "Assumption", color: "#7a5c00", bg: "#fff8e1", isObj: false },
    { key: "flows", label: "Flows", singular: "Flow", color: "#0052cc", bg: "#e6f0ff", isObj: false },
  ];

  const meta = TABS.find(t => t.key === activeTab);
  const rawItems = project[activeTab] || [];
  const items = rawItems.map(i =>
    meta.isObj
      ? (typeof i === "string" ? { id: uid(), text: i, source: "" } : i)
      : (typeof i === "string" ? i : i.text)
  );

  const save = (updated) => {
    update({ [activeTab]: updated });
    setEditingIdx(null);
  };

  const startEdit = (idx) => {
    const item = items[idx];
    setEditingIdx(idx);
    setEditText(meta.isObj ? item.text : item);
    setEditSource(meta.isObj ? (item.source || "") : "");
  };

  const saveEdit = () => {
    const updated = items.map((item, i) => {
      if (i !== editingIdx) return item;
      return meta.isObj ? { ...(typeof rawItems[i] === "string" ? { id: uid() } : rawItems[i]), text: editText, source: editSource } : editText;
    });
    save(updated);
  };

  const deleteItem = (idx) => {
    if (!window.confirm("Delete this item?")) return;
    save(items.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    if (!addingText.trim()) return;
    const newItem = meta.isObj ? { id: uid(), text: addingText.trim(), source: addingSource.trim() } : addingText.trim();
    save([...items, newItem]);
    setAddingText("");
    setAddingSource("");
    setShowAdd(false);
  };

  // reset add/edit when switching tabs
  const switchTab = (key) => {
    setActiveTab(key);
    setEditingIdx(null);
    setShowAdd(false);
    setAddingText("");
    setAddingSource("");
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Insights</div>
          <div className="sec-sub">Manage risks, opportunities, assumptions and flows across all sessions and documents</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            style={{
              padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: activeTab === t.key ? t.color : "#f1f2f4",
              color: activeTab === t.key ? "#fff" : "#505f79",
              transition: "all .15s",
            }}>
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700,
              background: activeTab === t.key ? "rgba(255,255,255,.25)" : t.bg,
              color: activeTab === t.key ? "#fff" : t.color,
              padding: "1px 7px", borderRadius: 10 }}>
              {(project[t.key] || []).length}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {items.length === 0 && !showAdd && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#97a0af", fontSize: 13 }}>
            No {meta.label.toLowerCase()} yet. Click <strong>Add {meta.singular}</strong> below or extract from sessions.
          </div>
        )}

        {items.map((item, idx) => {
          const text = meta.isObj ? item.text : item;
          const source = meta.isObj ? (item.source || "") : "";
          const isEditing = editingIdx === idx;

          return (
            <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", borderBottom: "1px solid #f1f2f4" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, marginTop: 7, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                {isEditing ? (
                  <>
                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} autoFocus
                      style={{ width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #c1c7d0", borderRadius: 4, resize: "vertical", boxSizing: "border-box" }} />
                    {meta.isObj && (
                      <input value={editSource} onChange={e => setEditSource(e.target.value)}
                        placeholder="Source (optional)" style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: "1px solid #c1c7d0", borderRadius: 4, marginTop: 4, boxSizing: "border-box" }} />
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingIdx(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "#172b4d", lineHeight: 1.55 }}>{text}</div>
                    {source && <div style={{ fontSize: 11, color: "#97a0af", marginTop: 3 }}>Source: {source}</div>}
                  </>
                )}
              </div>
              {!isEditing && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button className="icon-btn" onClick={() => startEdit(idx)} title="Edit"><Edit2 size={13} /></button>
                  <button className="icon-btn" onClick={() => deleteItem(idx)} title="Delete"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          );
        })}

        {/* Inline add form */}
        {showAdd && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f2f4", background: "#fafbfc" }}>
            <textarea value={addingText} onChange={e => setAddingText(e.target.value)} rows={2} autoFocus
              placeholder={`New ${meta.singular.toLowerCase()}…`}
              style={{ width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #c1c7d0", borderRadius: 4, resize: "vertical", boxSizing: "border-box" }} />
            {meta.isObj && (
              <input value={addingSource} onChange={e => setAddingSource(e.target.value)}
                placeholder="Source (optional)" style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: "1px solid #c1c7d0", borderRadius: 4, marginTop: 4, boxSizing: "border-box" }} />
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={addItem}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setAddingText(""); setAddingSource(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {!showAdd && (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
          <Plus size={13} /> Add {meta.singular}
        </button>
      )}
    </div>
  );
}

// ─── Discovery Documents ──────────────────────────────────────────────────────
function DiscoveryDocuments({ project, update }) {
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const fileInputRef = useRef(null);

  const docs = project.documents || [];

  const ACCEPTED = [".pdf", ".txt", ".md", ".csv"];

  const readAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const readAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const handleFile = async (file) => {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      alert("Unsupported file type. Please upload a PDF, TXT, MD, or CSV file.");
      return;
    }
    if (docs.some(d => d.filename === file.name)) {
      if (!window.confirm(`A document named "${file.name}" already exists. Upload anyway?`)) return;
    }
    setProcessing(true);
    try {
      const isPDF = ext === ".pdf";
      const prompt = `You are analyzing a document for a product discovery project.\n\nProject: ${project.name}\nIndustry: ${project.industry}\nClient type: ${project.clientType || "startup"}\nFile: ${file.name}\n\nExtract discovery insights. Return ONLY valid JSON:\n{\n  "title": "document title (infer from content)",\n  "summary": "2-3 sentence description of what this document is",\n  "context": "Key background info, decisions, or requirements relevant to this project (100-200 words)",\n  "risks": [{"text": "specific risk", "source": "${file.name}"}],\n  "opportunities": [{"text": "specific opportunity", "source": "${file.name}"}],\n  "assumptions": ["assumption string"]\n}`;

      let msgContent;
      if (isPDF) {
        const base64 = await readAsBase64(file);
        msgContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: prompt },
        ];
      } else {
        const text = await readAsText(file);
        msgContent = prompt + "\n\nDocument content:\n" + text.slice(0, 12000);
      }

      const r = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: msgContent }],
          system: "Discovery analyst. Extract structured insights from documents. Return only valid JSON.",
          maxTokens: 1800,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);

      const parsed = parseJSON(d.text);
      if (!parsed) throw new Error("Could not parse AI response — try again.");

      const newDoc = {
        id: uid(),
        filename: file.name,
        title: parsed.title || file.name,
        summary: parsed.summary || "",
        context: parsed.context || "",
        uploadedAt: new Date().toISOString().split("T")[0],
        risksAdded: (parsed.risks || []).length,
        oppsAdded: (parsed.opportunities || []).length,
        assumptionsAdded: (parsed.assumptions || []).length,
      };

      update({
        documents: [...docs, newDoc],
        risks: [...(project.risks || []), ...(parsed.risks || []).map(r => ({ ...r, id: uid() }))],
        opportunities: [...(project.opportunities || []), ...(parsed.opportunities || []).map(o => ({ ...o, id: uid() }))],
        assumptions: [...(project.assumptions || []), ...(parsed.assumptions || [])],
      });
      setExpanded(newDoc.id);
    } catch (e) {
      alert("Failed to process file: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const deleteDoc = (id) => {
    if (!window.confirm("Remove this document? Risks and opportunities already extracted will stay.")) return;
    update({ documents: docs.filter(d => d.id !== id) });
    if (expanded === id) setExpanded(null);
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Research Docs</div>
          <div className="sec-sub">Upload PDFs, briefs, or notes — AI extracts risks, opportunities, and context automatically</div>
        </div>
        {docs.length > 0 && (
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={processing}>
            <Upload size={13} /> Upload
          </button>
        )}
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !processing && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#e8c547" : "#dfe1e6"}`,
          borderRadius: 10, padding: processing ? "28px 24px" : "32px 24px",
          textAlign: "center", cursor: processing ? "default" : "pointer",
          background: dragOver ? "rgba(232,197,71,.06)" : "#fafbfc",
          transition: "all .15s", marginBottom: 20,
        }}>
        {processing ? (
          <div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
              <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
            </div>
            <div style={{ fontSize: 13, color: "#505f79", fontWeight: 500 }}>Analysing document…</div>
            <div style={{ fontSize: 12, color: "#97a0af", marginTop: 4 }}>Extracting risks, opportunities, and context</div>
          </div>
        ) : (
          <div>
            <Upload size={24} color={dragOver ? "#e8c547" : "#b3bac5"} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#344563", marginBottom: 4 }}>
              {dragOver ? "Drop it here" : "Drop a file or click to upload"}
            </div>
            <div style={{ fontSize: 12, color: "#97a0af" }}>PDF, TXT, MD, CSV — up to ~50 pages</div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.csv" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>

      {/* Document list */}
      {docs.length === 0 && !processing && (
        <div className="card" style={{ background: "#f8f9fa" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#344563", marginBottom: 10 }}>What gets extracted</div>
          {[
            "Risks and blockers mentioned in the document",
            "Opportunities or untapped areas identified",
            "Assumptions embedded in requirements or briefs",
            "Key context added to the AI Colleague's knowledge",
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, fontSize: 13, color: "#505f79" }}>
              <span style={{ color: "#36b37e", flexShrink: 0 }}>✓</span> {item}
            </div>
          ))}
        </div>
      )}

      {docs.map(doc => (
        <div key={doc.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f0f1f3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={16} color="#6b778c" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 2 }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: "#97a0af", marginBottom: 6 }}>{doc.filename} · {doc.uploadedAt}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {doc.risksAdded > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: "#ffebe6", color: "#de350b" }}>{doc.risksAdded} risk{doc.risksAdded > 1 ? "s" : ""}</span>}
                {doc.oppsAdded > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: "#e3fcef", color: "#00632b" }}>{doc.oppsAdded} opp{doc.oppsAdded > 1 ? "s" : ""}</span>}
                {doc.assumptionsAdded > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: "#fff8e1", color: "#7a5c00" }}>{doc.assumptionsAdded} assumption{doc.assumptionsAdded > 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button className="icon-btn" onClick={() => setExpanded(expanded === doc.id ? null : doc.id)} title="View context">
                {expanded === doc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button className="icon-btn" onClick={() => deleteDoc(doc.id)} title="Remove"><Trash2 size={13} /></button>
            </div>
          </div>

          {expanded === doc.id && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #ebecf0" }}>
              {doc.summary && (
                <div style={{ fontSize: 12, color: "#505f79", lineHeight: 1.65, marginBottom: doc.context ? 10 : 0, fontStyle: "italic" }}>{doc.summary}</div>
              )}
              {doc.context && (
                <div style={{ fontSize: 12, color: "#344563", lineHeight: 1.7, background: "#f8f9fa", borderRadius: 8, padding: "10px 14px" }}>{doc.context}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Discovery To Do ──────────────────────────────────────────────────────────
function DiscoveryTodos({ project, update }) {
  const blank = { task: "", owner: "" };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [extracting, setExtracting] = useState(false);
  const [filter, setFilter] = useState("open"); // open | done | all

  const todos = project.todos || [];
  const sessions = project.sessions || [];

  const save = () => {
    if (!form.task.trim()) return;
    if (form.id) {
      update({ todos: todos.map(t => t.id === form.id ? { ...form } : t) });
    } else {
      update({ todos: [...todos, { ...form, id: uid(), done: false, source: "manual", createdAt: new Date().toISOString().split("T")[0] }] });
    }
    setModal(null);
    setForm(blank);
  };

  const toggle = (id) => update({ todos: todos.map(t => t.id === id ? { ...t, done: !t.done } : t) });
  const del = (id) => update({ todos: todos.filter(t => t.id !== id) });
  const edit = (t) => { setForm(t); setModal("edit"); };

  const extractFromSessions = async () => {
    if (!sessions.length) return;
    setExtracting(true);
    setModal("suggest");
    const sessionData = sessions.map(s =>
      `Session: "${s.title}" (${s.date})\nParticipants: ${s.participants}\nNotes: ${s.notes || "none"}\nOpen questions: ${s.outputs?.openQuestions?.join(", ") || "none"}\nKey decisions: ${s.outputs?.keyDecisions?.join(", ") || "none"}`
    ).join("\n\n");

    const reply = await askClaude([{ role: "user", content:
      `Extract action items and to-dos from these discovery session records.\n\nProject: ${project.name}\n\n${sessionData}\n\nReturn a JSON array of action items:\n[{ "task": "specific action to take", "owner": "role responsible (e.g. PM, Design Lead, CTO)", "source": "session title" }]\n\nOnly include concrete, actionable items — not vague observations. Return only valid JSON array.`
    }], "Extract action items from meeting notes. Return only valid JSON array.", 1000);

    setExtracting(false);
    const parsed = parseJSON(reply);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const suggestions = parsed.map(t => ({ ...t, id: uid(), _selected: true }));
      update({ _todoSuggestions: suggestions });
    } else {
      update({ _todoSuggestions: [] });
    }
  };

  const suggestions = project._todoSuggestions || [];

  const acceptSuggestions = () => {
    const toAdd = suggestions.filter(s => s._selected).map(({ _selected, ...s }) => ({
      ...s, done: false, createdAt: new Date().toISOString().split("T")[0]
    }));
    update({ todos: [...todos, ...toAdd], _todoSuggestions: undefined });
    setModal(null);
  };

  const visible = todos.filter(t => filter === "all" ? true : filter === "done" ? t.done : !t.done);
  const openCount = todos.filter(t => !t.done).length;
  const doneCount = todos.filter(t => t.done).length;

  const sourceColor = (src) => {
    if (!src || src === "manual") return { bg: "#f1f2f4", color: "#6b778c" };
    if (src === "AI colleague") return { bg: "rgba(232,197,71,.15)", color: "#7a6000" };
    return { bg: "#e6f0ff", color: "#0052cc" };
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">To Do</div>
          <div className="sec-sub">Action items from sessions, meetings, and AI — tracked in one place</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {sessions.length > 0 && (
            <button className="btn btn-ai" onClick={extractFromSessions} disabled={extracting}>
              <Sparkles size={13} /> Extract from sessions
            </button>
          )}
          <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}>
            <Plus size={13} /> Add task
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      {todos.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {[
            { id: "open", label: `Open (${openCount})` },
            { id: "done", label: `Done (${doneCount})` },
            { id: "all", label: `All (${todos.length})` },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all .12s",
                background: filter === f.id ? "#172b4d" : "transparent",
                borderColor: filter === f.id ? "#172b4d" : "#dfe1e6",
                color: filter === f.id ? "#ffffff" : "#6b778c" }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {todos.length === 0 ? (
        <Empty icon={<CheckCircle2 size={36} />} title="No tasks yet"
          sub="Add action items manually, extract from sessions, or ask the AI Colleague"
          action={
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {sessions.length > 0 && <button className="btn btn-ai" onClick={extractFromSessions}><Sparkles size={13} /> Extract from sessions</button>}
              <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}><Plus size={13} /> Add task</button>
            </div>
          } />
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", fontSize: 13, color: "#97a0af" }}>
          No {filter} tasks.
        </div>
      ) : (
        visible.map(t => (
          <div key={t.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8, opacity: t.done ? 0.6 : 1 }}>
            <button onClick={() => toggle(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0", flexShrink: 0, marginTop: 1 }}>
              {t.done
                ? <CheckCircle2 size={18} color="#36b37e" />
                : <Circle size={18} color="#dfe1e6" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: t.done ? "#97a0af" : "#172b4d", fontWeight: 500, textDecoration: t.done ? "line-through" : "none", lineHeight: 1.5, marginBottom: 4 }}>{t.task}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {t.owner && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#344563", background: "#f1f2f4", padding: "1px 7px", borderRadius: 4, fontFamily: "'DM Mono',monospace" }}>
                    {t.owner}
                  </span>
                )}
                {t.source && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, fontFamily: "'DM Mono',monospace", ...sourceColor(t.source) }}>
                    {t.source}
                  </span>
                )}
                {t.createdAt && <span style={{ fontSize: 11, color: "#b3bac5" }}>{t.createdAt}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button className="icon-btn" onClick={() => edit(t)}><Edit2 size={13} /></button>
              <button className="icon-btn" onClick={() => del(t.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))
      )}

      {/* Add / Edit modal */}
      {modal === "edit" && (
        <Modal title={form.id ? "Edit Task" : "New Task"} onClose={() => { setModal(null); setForm(blank); }}
          footer={<><button className="btn btn-ghost" onClick={() => { setModal(null); setForm(blank); }}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="field">
            <label>Task</label>
            <textarea value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
              placeholder="e.g. Follow up with CTO on API constraints" rows={2} autoFocus />
          </div>
          <div className="field">
            <label>Owner</label>
            <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              placeholder="e.g. PM, Design Lead, Client" />
          </div>
        </Modal>
      )}

      {/* Session extraction modal */}
      {modal === "suggest" && (
        <Modal title="Extract tasks from sessions" onClose={() => { setModal(null); update({ _todoSuggestions: undefined }); }}
          footer={
            !extracting && suggestions.length > 0
              ? <><button className="btn btn-ghost" onClick={() => { setModal(null); update({ _todoSuggestions: undefined }); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={acceptSuggestions}>
                    <Check size={13} /> Add selected ({suggestions.filter(s => s._selected).length})
                  </button></>
              : <button className="btn btn-ghost" onClick={() => { setModal(null); update({ _todoSuggestions: undefined }); }}>Close</button>
          }>
          {extracting ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#505f79" }}>Reading {sessions.length} session{sessions.length > 1 ? "s" : ""}…</div>
            </div>
          ) : suggestions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#6b778c" }}>No action items found in session notes.</div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#6b778c", marginBottom: 16, lineHeight: 1.6 }}>
                Found {suggestions.length} action item{suggestions.length > 1 ? "s" : ""}. Select the ones to add.
              </p>
              {suggestions.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: i < suggestions.length - 1 ? "1px solid #ebecf0" : "none" }}>
                  <input type="checkbox" checked={s._selected} onChange={e => update({ _todoSuggestions: suggestions.map((p, j) => j === i ? { ...p, _selected: e.target.checked } : p) })}
                    style={{ marginTop: 3, accentColor: "#e8c547", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#172b4d", fontWeight: 500, marginBottom: 3 }}>{s.task}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {s.owner && <span style={{ fontSize: 11, fontWeight: 600, color: "#344563", background: "#f1f2f4", padding: "1px 7px", borderRadius: 4, fontFamily: "'DM Mono',monospace" }}>{s.owner}</span>}
                      {s.source && <span style={{ fontSize: 10, color: "#0052cc", background: "#e6f0ff", padding: "1px 7px", borderRadius: 4, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{s.source}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Discovery Stakeholders ───────────────────────────────────────────────────
function DiscoveryStakeholders({ project, update }) {
  const blank = { name: "", role: "", influence: "Medium", availability: "Available", notes: "" };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const stakeholders = project.stakeholders || [];
  const sessions = project.sessions || [];

  const save = () => {
    if (!form.name.trim()) return;
    if (form.id) {
      update({ stakeholders: stakeholders.map(s => s.id === form.id ? form : s) });
    } else {
      update({ stakeholders: [...stakeholders, { ...form, id: uid() }] });
    }
    setModal(null);
  };

  const del = id => {
    if (!window.confirm("Remove this stakeholder?")) return;
    update({ stakeholders: stakeholders.filter(s => s.id !== id) });
  };

  const edit = s => { setForm(s); setModal("edit"); };

  const extractFromSessions = async () => {
    if (sessions.length === 0) return;
    setExtracting(true);
    setSuggestions([]);
    setModal("suggest");

    const sessionData = sessions.map(s =>
      `Session: "${s.title}" (${s.date})\nParticipants: ${s.participants}\nNotes: ${s.notes || "none"}\nKey decisions: ${s.outputs?.keyDecisions?.join(", ") || "none"}`
    ).join("\n\n");

    const existingNames = stakeholders.map(s => s.name.toLowerCase());

    const reply = await askClaude([{ role: "user", content:
      `Extract stakeholders from these discovery session records.\n\nProject: ${project.name} (${project.industry})\n\n${sessionData}\n\nReturn a JSON array of stakeholders found. For each person extract:\n- name: their name or best guess from role (e.g. "Lacoste CMO" if no name given)\n- role: their job title or function\n- influence: "High", "Medium", or "Low" (infer from their role and participation)\n- availability: "Available", "Hard to reach", or "Key gatekeeper"\n- notes: any specific concern, position, or agenda mentioned in the notes\n\nOnly include real people mentioned. Skip generic roles like "PM", "Design Lead" unless more context is given. Return only valid JSON array.`
    }], "Extract people from meeting notes. Return only valid JSON array.", 1200);

    setExtracting(false);
    const parsed = parseJSON(reply);
    if (Array.isArray(parsed)) {
      const newOnes = parsed.filter(p => p.name && !existingNames.includes(p.name.toLowerCase()));
      setSuggestions(newOnes.map(p => ({ ...p, _selected: true, id: uid() })));
    }
  };

  const acceptSuggestions = () => {
    const toAdd = suggestions.filter(s => s._selected).map(({ _selected, ...s }) => s);
    if (toAdd.length > 0) update({ stakeholders: [...stakeholders, ...toAdd] });
    setModal(null);
    setSuggestions([]);
  };

  const influenceColor = { High: "#de350b", Medium: "#7a5c00", Low: "#42526e" };
  const influenceBg = { High: "#ffebe6", Medium: "#fff8e1", Low: "#f1f2f4" };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Stakeholders</div>
          <div className="sec-sub">Map who matters in this discovery — influence, availability, and agenda</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {sessions.length > 0 && (
            <button className="btn btn-ai" onClick={extractFromSessions} disabled={extracting}>
              <Sparkles size={13} /> Extract from sessions
            </button>
          )}
          <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}>
            <Plus size={13} /> Add Stakeholder
          </button>
        </div>
      </div>

      {stakeholders.length === 0 ? (
        <Empty icon={<Users size={36} />} title="No stakeholders mapped yet"
          sub="Add manually or extract automatically from your session participants"
          action={
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {sessions.length > 0 && <button className="btn btn-ai" onClick={extractFromSessions}><Sparkles size={13} /> Extract from sessions</button>}
              <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("edit"); }}><Plus size={13} /> Add first stakeholder</button>
            </div>
          } />
      ) : (
        <div>
          {stakeholders.map(s => (
            <div key={s.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ebecf0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#172b4d", flexShrink: 0 }}>
                {s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#172b4d" }}>{s.name}</span>
                  <span className="tag tag-muted">{s.role}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: influenceBg[s.influence] || "#f1f2f4", color: influenceColor[s.influence] || "#42526e" }}>
                    {s.influence} influence
                  </span>
                  {s.availability && s.availability !== "Available" && (
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: "#f3e6ff", color: "#5b21b6" }}>
                      {s.availability}
                    </span>
                  )}
                </div>
                {s.notes && <p style={{ fontSize: 12, color: "#6b778c", lineHeight: 1.55, margin: 0 }}>{s.notes}</p>}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button className="icon-btn" onClick={() => edit(s)}><Edit2 size={13} /></button>
                <button className="icon-btn" onClick={() => del(s.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {modal === "edit" && (
        <Modal title={form.id ? "Edit Stakeholder" : "New Stakeholder"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="row">
            <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name or title (e.g. Lacoste CMO)" autoFocus /></div>
            <div className="field"><label>Role / Title</label><input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Chief Marketing Officer" /></div>
          </div>
          <div className="row">
            <div className="field">
              <label>Influence</label>
              <select value={form.influence} onChange={e => setForm(f => ({ ...f, influence: e.target.value }))}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
            <div className="field">
              <label>Availability</label>
              <select value={form.availability} onChange={e => setForm(f => ({ ...f, availability: e.target.value }))}>
                <option>Available</option><option>Hard to reach</option><option>Key gatekeeper</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Their agenda, concerns, communication preferences, decisions they've made..." rows={3} /></div>
        </Modal>
      )}

      {/* Extraction suggestions modal */}
      {modal === "suggest" && (
        <Modal title="Extract Stakeholders from Sessions" onClose={() => { setModal(null); setSuggestions([]); }}
          footer={
            !extracting && suggestions.length > 0
              ? <><button className="btn btn-ghost" onClick={() => { setModal(null); setSuggestions([]); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={acceptSuggestions}>
                    <Check size={13} /> Add selected ({suggestions.filter(s => s._selected).length})
                  </button></>
              : <button className="btn btn-ghost" onClick={() => { setModal(null); setSuggestions([]); }}>Close</button>
          }>
          {extracting ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#505f79" }}>Reading {sessions.length} session{sessions.length > 1 ? "s" : ""}…</div>
            </div>
          ) : suggestions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#6b778c" }}>
              No new stakeholders found in the session notes.
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#6b778c", marginBottom: 16, lineHeight: 1.6 }}>
                Found {suggestions.length} stakeholder{suggestions.length > 1 ? "s" : ""} from your session records. Select the ones to add.
              </p>
              {suggestions.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: i < suggestions.length - 1 ? "1px solid #ebecf0" : "none" }}>
                  <input type="checkbox" checked={s._selected} onChange={e => setSuggestions(prev => prev.map((p, j) => j === i ? { ...p, _selected: e.target.checked } : p))}
                    style={{ marginTop: 3, accentColor: "#e8c547", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{s.name}</span>
                      <span className="tag tag-muted">{s.role}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 7px", borderRadius: 4, background: influenceBg[s.influence] || "#f1f2f4", color: influenceColor[s.influence] || "#42526e" }}>
                        {s.influence}
                      </span>
                    </div>
                    {s.notes && <p style={{ fontSize: 12, color: "#6b778c", margin: 0, lineHeight: 1.5 }}>{s.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Discovery AI Colleague ───────────────────────────────────────────────────
function DiscoveryAIColleague({ project, update }) {
  const [msgs, setMsgs] = useState([
    { role: "ai", text: `Hi! I'm your discovery colleague for **${project.name}**.\n\nI have full context of everything you've gathered — sessions, risks, opportunities, assumptions, story map, architecture, and more.\n\nUse me to **validate ideas**, **prep for meetings**, **identify gaps**, or just think out loud. I can also add risks, opportunities, assumptions, and flows directly to your project.\n\nWhat's on your mind?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pending]);

  const sessions = project.sessions || [];
  const risks = project.risks || [];
  const opportunities = project.opportunities || [];
  const assumptions = project.assumptions || [];
  const flows = project.flows || [];
  const backbone = project.backbone || [];
  const agendas = project.agendas || [];
  const personas = project.personas || [];
  const docs = project.documents || [];

  const FENCE = "```";
  const sessionSummary = sessions.map(s =>
    `  - "${s.title}" (${s.date}, ${s.participants})${s.outputs ? `: risks=${s.outputs.risks?.length || 0}, opps=${s.outputs.opportunities?.length || 0}, decisions=${s.outputs.keyDecisions?.length || 0}` : ": no outputs extracted yet"}`
  ).join("\n") || "  none yet";

  const docSummary = docs.map(d =>
    `  - "${d.title}" (${d.filename}): ${d.summary}${d.context ? `\n    Context: ${d.context.slice(0, 200)}` : ""}`
  ).join("\n") || "  none uploaded yet";

  const SYSTEM = `You are a senior product discovery facilitator and AI colleague embedded in a discovery project tool.

PROJECT: ${project.name}
Client type: ${project.clientType || "startup"} | Industry: ${project.industry} | Platform: ${project.platform}
Discovery phase: ${project.discoveryPhase || "discovery"}
About: ${project.about}

WHAT WE KNOW:
Assumptions (${assumptions.length}): ${assumptions.slice(0, 6).join("; ") || "none yet"}
Risks (${risks.length}): ${risks.slice(0, 5).map(r => typeof r === "string" ? r : r.text).join("; ") || "none yet"}
Opportunities (${opportunities.length}): ${opportunities.slice(0, 5).map(o => typeof o === "string" ? o : o.text).join("; ") || "none yet"}
User flows mapped: ${flows.slice(0, 4).join(" | ") || "none yet"}
Personas: ${personas.map(p => p.role).join(", ") || "none yet"}

SESSIONS CONDUCTED (${sessions.length}):
${sessionSummary}

RESEARCH DOCUMENTS (${docs.length}):
${docSummary}

STORY MAP BACKBONE (${backbone.length} stages):
${backbone.map(s => `  ${s.stage}: ${(s.epics || []).map(e => e.title).join(", ")}`).join("\n") || "  not yet built"}

AGENDAS PREPARED (${agendas.length}): ${agendas.map(a => a.title).join(", ") || "none yet"}

ARCHITECTURE: ${project.architectureNotes ? project.architectureNotes.slice(0, 200) + "..." : "not documented"}
NFRs: ${(project.nfrs || []).map(n => `[${n.priority}] ${n.category}`).join(", ") || "none yet"}

You can:
1. Discuss, validate, brainstorm, challenge assumptions — reply conversationally
2. Help prepare for meetings — reference the agendas and sessions context
3. Identify gaps, inconsistencies, or missing research areas
4. Create discovery artifacts when asked

To CREATE artifacts, include this block in your reply:

ARTIFACTS:
${FENCE}json
{
  "type": "risks|opportunities|assumptions|flows|todos",
  "items": [...]
}
${FENCE}

risks items: [{ "text": "risk description", "source": "reasoning" }]
opportunities items: [{ "text": "opportunity description", "source": "reasoning" }]
assumptions items: ["assumption string", ...]
flows items: ["User flow description", ...]
todos items: [{ "task": "specific action", "owner": "role (e.g. PM, Design Lead)" }]

Be specific to this project. Reference what's already known. Challenge vague statements. Ask good questions.`;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs = [...msgs, { role: "user", text }];
    setMsgs([...newMsgs, { role: "ai", text: "..." }]);
    setLoading(true);

    const history = newMsgs.slice(-12).map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
    const reply = await askClaude(history, SYSTEM, 2000);
    setLoading(false);

    const artifactMatch = reply.match(/ARTIFACTS:\s*```(?:json)?\s*([\s\S]*?)```/);
    if (artifactMatch) {
      try {
        const parsed = JSON.parse(artifactMatch[1].trim());
        if (parsed.type && Array.isArray(parsed.items) && parsed.items.length > 0) {
          const cleanReply = reply.replace(/ARTIFACTS:\s*```[\s\S]*?```/, "").trim();
          setMsgs(prev => [...prev.slice(0, -1), { role: "ai", text: cleanReply || `I've prepared ${parsed.items.length} ${parsed.type} to add:` }]);
          setPending(parsed);
          return;
        }
      } catch {}
    }
    setMsgs(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);
  };

  const acceptArtifacts = () => {
    if (!pending) return;
    const { type, items } = pending;
    if (type === "risks") {
      const newRisks = items.map(r => ({ id: uid(), text: r.text, source: r.source || "AI colleague" }));
      update({ risks: [...risks, ...newRisks] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newRisks.length} risk${newRisks.length > 1 ? "s" : ""} to the project.` }]);
    } else if (type === "opportunities") {
      const newOpps = items.map(o => ({ id: uid(), text: o.text, source: o.source || "AI colleague" }));
      update({ opportunities: [...opportunities, ...newOpps] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newOpps.length} opportunit${newOpps.length > 1 ? "ies" : "y"} to the project.` }]);
    } else if (type === "assumptions") {
      update({ assumptions: [...assumptions, ...items] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${items.length} assumption${items.length > 1 ? "s" : ""} to the project.` }]);
    } else if (type === "flows") {
      update({ flows: [...flows, ...items] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${items.length} user flow${items.length > 1 ? "s" : ""} to the project.` }]);
    } else if (type === "todos") {
      const newTodos = items.map(t => ({ ...t, id: uid(), done: false, source: "AI colleague", createdAt: new Date().toISOString().split("T")[0] }));
      update({ todos: [...(project.todos || []), ...newTodos] });
      setMsgs(prev => [...prev, { role: "ai", text: `✓ Added ${newTodos.length} task${newTodos.length > 1 ? "s" : ""} to To Do.` }]);
    }
    setPending(null);
  };

  const rejectArtifacts = () => {
    setMsgs(prev => [...prev, { role: "ai", text: "Got it — discarded. Tell me how you'd like to adjust them." }]);
    setPending(null);
  };

  const ArtifactPreview = ({ pending }) => {
    const { type, items } = pending;
    const typeLabel = { risks: "Risk", opportunities: "Opportunity", assumptions: "Assumption", flows: "User Flow", todos: "Task" }[type] || type;
    return (
      <div style={{ margin: "12px 0 8px", background: "#f8f9fa", border: "1px solid rgba(232,197,71,.25)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", background: "rgba(232,197,71,.12)", borderBottom: "1px solid rgba(232,197,71,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={13} color="#e8c547" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e8c547" }}>{items.length} {typeLabel}{items.length > 1 ? "s" : ""} ready to add</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-xs" onClick={rejectArtifacts}><X size={11} /> Discard</button>
            <button className="btn btn-primary btn-xs" onClick={acceptArtifacts}><Check size={11} /> Add to Project</button>
          </div>
        </div>
        <div style={{ padding: "10px 14px", maxHeight: 220, overflowY: "auto" }}>
          {items.map((item, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: i < items.length - 1 ? "1px solid #dfe1e6" : "none", fontSize: 13, color: "#344563" }}>
              {typeof item === "string" ? item : (item.task || item.text)}
              {item.owner && <span style={{ fontSize: 11, fontWeight: 600, color: "#344563", background: "#f1f2f4", padding: "1px 6px", borderRadius: 4, marginLeft: 8, fontFamily: "'DM Mono',monospace" }}>{item.owner}</span>}
              {item.source && !item.owner && <span style={{ fontSize: 11, color: "#97a0af", marginLeft: 8 }}>— {item.source}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const quickPrompts = [
    "What gaps do we still have in our research?",
    "Challenge our top assumptions",
    "What risks are we probably missing?",
    "Help me prep for the next client session",
    "Summarize where we are in discovery",
    "What questions should we be asking?",
  ];

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">AI Colleague</div>
          <div className="sec-sub">Full discovery context — validate ideas, prep meetings, identify gaps, add findings</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "#97a0af" }}>
          <span>{sessions.length} sessions</span>
          <span>·</span>
          <span>{risks.length} risks</span>
          <span>·</span>
          <span>{opportunities.length} opps</span>
        </div>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #dfe1e6", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: 560 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
          {msgs.map((m, i) => (
            <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`} style={{ whiteSpace: m.role === "ai" ? "normal" : undefined }}>
              {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.role === "ai" ? <div className="md-agenda" style={{ fontSize: 13 }}><ReactMarkdown>{m.text}</ReactMarkdown></div> : m.text}
            </div>
          ))}
          {pending && <ArtifactPreview pending={pending} />}
          <div ref={bottomRef} />
        </div>
        {msgs.length <= 1 && !pending && (
          <div style={{ padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid #dfe1e6" }}>
            {quickPrompts.map(p => (
              <button key={p} className="btn btn-ghost btn-sm" onClick={() => setInput(p)} style={{ fontSize: 11 }}>{p}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, padding: "12px", borderTop: "1px solid #dfe1e6" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask anything — validate assumptions, prep a meeting, paste notes to discuss… (Enter to send)"
            style={{ minHeight: "unset", height: 40, padding: "10px 12px", resize: "none", flex: 1 }} />
          <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()} style={{ padding: "8px 14px" }}><Send size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Story Mapping ─────────────────────────────────────────────────────────────
function StoryMappingSection({ project, update }) {
  const [generating, setGenerating] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const backbone = project.backbone || [];
  const storyMap = project.storyMap || [];

  const generateBackbone = async () => {
    setGenerating(true);
    const reply = await askClaude([{ role: "user", content: `Create a user story map backbone for:\nProject: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nPersonas: ${(project.personas || []).map(p => p.role).join(", ") || "not defined yet"}\nFlows: ${(project.flows || []).join(", ") || "not defined yet"}\n\nReturn JSON:\n{"backbone":[{"id":"b1","stage":"Stage Name","description":"What the user is doing at this stage","epics":[{"id":"e1","title":"Epic title","moscow":"Must","features":[{"id":"f1","title":"Feature","moscow":"Must","slice":"mvp"}]}]}]}\n\nCreate 4-7 backbone stages covering the full user journey. Under each, 2-4 epics. Under each epic, 2-4 features. Assign MoSCoW (Must/Should/Could/Won_t). Mark slice as 'mvp' or 'future'. Return only valid JSON starting with {.` }],
      "You are a senior PM expert in story mapping. Return only valid JSON.", 2500);
    setGenerating(false);
    const parsed = parseJSON(reply);
    if (parsed?.backbone) {
      update({ backbone: parsed.backbone, storyMap: parsed.backbone });
    }
  };

  const addStage = () => {
    const newStage = { id: uid(), stage: "New Stage", description: "", epics: [] };
    update({ backbone: [...backbone, newStage], storyMap: [...backbone, newStage] });
  };

  const addEpic = (stageId) => {
    const updated = backbone.map(s => s.id === stageId ? { ...s, epics: [...(s.epics || []), { id: uid(), title: "New Epic", moscow: "Should", features: [] }] } : s);
    update({ backbone: updated, storyMap: updated });
  };

  const addFeature = (stageId, epicId) => {
    const updated = backbone.map(s => s.id === stageId ? { ...s, epics: (s.epics || []).map(e => e.id === epicId ? { ...e, features: [...(e.features || []), { id: uid(), title: "New Feature", moscow: "Should", slice: "future" }] } : e) } : s);
    update({ backbone: updated, storyMap: updated });
  };

  const updateFeature = (stageId, epicId, featId, changes) => {
    const updated = backbone.map(s => s.id === stageId ? { ...s, epics: (s.epics || []).map(e => e.id === epicId ? { ...e, features: (e.features || []).map(f => f.id === featId ? { ...f, ...changes } : f) } : e) } : s);
    update({ backbone: updated, storyMap: updated });
  };

  const MoscowBadge = ({ value, onChange }) => {
    const opts = ["Must", "Should", "Could", "Won_t"];
    const cur = MOSCOW_COLORS[value] || MOSCOW_COLORS.Should;
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, border: "1px solid " + cur.border, background: cur.bg, color: cur.color, fontFamily: "'DM Mono',monospace", fontWeight: 700, cursor: "pointer", outline: "none" }}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    );
  };

  const confluenceText = backbone.map(s =>
    `h2. ${s.stage}\n${s.description}\n\n` +
    (s.epics || []).map(e =>
      `h3. ${e.title} [${e.moscow}]\n` +
      (e.features || []).map(f => `* ${f.title} [${f.moscow}] — ${f.slice === "mvp" ? "✅ MVP" : "⏳ Future"}`).join("\n")
    ).join("\n\n")
  ).join("\n\n---\n\n");

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Story Mapping</div><div className="sec-sub">Backbone → Epics → Features · MoSCoW prioritization · MVP slicing</div></div>
        <div className="sec-actions">
          {backbone.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(confluenceText); }}>
              <Copy size={12} /> Copy to Confluence
            </button>
          )}
          <button className="btn btn-ghost" onClick={addStage}><Plus size={13} /> Stage</button>
          <button className="btn btn-ai" onClick={generateBackbone} disabled={generating}>
            {generating ? "Generating..." : <><Sparkles size={13} /> AI Generate Map</>}
          </button>
        </div>
      </div>

      {generating && (
        <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
          <div style={{ fontSize: 13, color: "#6b778c" }}>Generating story map from your discovery insights...</div>
        </div>
      )}

      {!generating && backbone.length === 0 && (
        <Empty icon={<Map size={36} />} title="No story map yet"
          sub="Let AI generate a backbone from your discovery sessions, or add stages manually"
          action={<div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={addStage}><Plus size={13} /> Add Stage</button><button className="btn btn-ai" onClick={generateBackbone}><Sparkles size={13} /> AI Generate</button></div>} />
      )}

      {backbone.length > 0 && (
        <>
          {/* MoSCoW legend + MVP line explanation */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            {Object.entries(MOSCOW_COLORS).map(([k, v]) => <span key={k} style={{ fontSize: 11, fontWeight: 600, color: v.color, background: v.bg, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono',monospace" }}>{k}</span>)}
            <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b778c" }}>✅ MVP &nbsp; ⏳ Future</div>
          </div>

          {/* Horizontal scroll story map */}
          <div style={{ overflowX: "auto", paddingBottom: 12 }}>
            <div style={{ display: "flex", gap: 14, minWidth: "max-content" }}>
              {backbone.map(stage => (
                <div key={stage.id} style={{ width: 240, flexShrink: 0 }}>
                  {/* Backbone stage header */}
                  <div style={{ background: "#172b4d", color: "#ffffff", borderRadius: "8px 8px 0 0", padding: "10px 12px", marginBottom: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{stage.stage}</div>
                    <div style={{ fontSize: 10, color: "#b3bac5", marginTop: 2 }}>{stage.description}</div>
                  </div>

                  {/* Epics */}
                  {(stage.epics || []).map(epic => (
                    <div key={epic.id} style={{ marginBottom: 6 }}>
                      <div style={{ background: "#f1f2f4", border: "1px solid #dfe1e6", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#344563" }}>{epic.title}</span>
                        <MoscowBadge value={epic.moscow} onChange={m => {
                          const up = backbone.map(s => s.id === stage.id ? { ...s, epics: s.epics.map(e => e.id === epic.id ? { ...e, moscow: m } : e) } : s);
                          update({ backbone: up, storyMap: up });
                        }} />
                      </div>
                      {/* Features */}
                      {(epic.features || []).map(feat => {
                        const isMvp = feat.slice === "mvp";
                        return (
                          <div key={feat.id} style={{ background: isMvp ? "#ffffff" : "#f8f9fa", border: "1px solid " + (isMvp ? MOSCOW_COLORS[feat.moscow]?.border || "#dfe1e6" : "#ebecf0"), borderTop: "none", padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "#505f79", flex: 1, lineHeight: 1.3 }}>{feat.title}</span>
                            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                              <button onClick={() => updateFeature(stage.id, epic.id, feat.id, { slice: isMvp ? "future" : "mvp" })}
                                style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid " + (isMvp ? "#36b37e" : "#dfe1e6"), background: isMvp ? "#e3fcef" : "#f1f2f4", color: isMvp ? "#00632b" : "#97a0af", cursor: "pointer", fontFamily: "'DM Mono',monospace" }}>
                                {isMvp ? "MVP" : "FUT"}
                              </button>
                              <MoscowBadge value={feat.moscow} onChange={m => updateFeature(stage.id, epic.id, feat.id, { moscow: m })} />
                            </div>
                          </div>
                        );
                      })}
                      <button onClick={() => addFeature(stage.id, epic.id)}
                        style={{ width: "100%", fontSize: 10, padding: "4px", background: "transparent", border: "1px dashed #dfe1e6", borderTop: "none", cursor: "pointer", color: "#97a0af", fontFamily: "'DM Sans',sans-serif" }}>
                        + feature
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addEpic(stage.id)}
                    style={{ width: "100%", fontSize: 11, padding: "6px", background: "transparent", border: "1px dashed #dfe1e6", cursor: "pointer", color: "#97a0af", fontFamily: "'DM Sans',sans-serif", borderRadius: "0 0 6px 6px" }}>
                    + epic
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* MVP summary */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 10 }}>MVP Summary</div>
            <div className="two-col" style={{ gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>In MVP</div>
                {backbone.flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp").map(f => ({ stage: s.stage, epic: e.title, feat: f })))).slice(0, 6).map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#344563", padding: "3px 0", display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: MOSCOW_COLORS[item.feat.moscow]?.color, background: MOSCOW_COLORS[item.feat.moscow]?.bg, padding: "1px 5px", borderRadius: 3 }}>{item.feat.moscow}</span>
                    <span style={{ color: "#6b778c" }}>{item.stage} ·</span> {item.feat.title}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Future Releases</div>
                {backbone.flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "future").map(f => ({ stage: s.stage, feat: f })))).slice(0, 6).map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#97a0af", padding: "3px 0" }}>⏳ {item.feat.title}</div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Discovery Planning (Tech) ─────────────────────────────────────────────────
function DiscoveryPlanning({ project, update }) {
  const [generating, setGenerating] = useState(false);
  const [section, setSection] = useState("architecture");

  const generatePlanning = async () => {
    setGenerating(true);
    const mvpFeatures = (project.backbone || []).flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp").map(f => f.title)));
    const reply = await askClaude([{ role: "user", content: `Generate technical planning for:\nProject: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nPlatform: ${project.platform}\nMVP features: ${mvpFeatures.slice(0, 10).join(", ") || "not defined"}\n\nReturn JSON:\n{"architectureNotes":"C4 L1 description of the system context and components","nfrs":[{"category":"Performance","requirement":"...","priority":"Must"},{"category":"Security","requirement":"...","priority":"Must"},{"category":"Availability","requirement":"...","priority":"Should"},{"category":"Compliance","requirement":"...","priority":"Could"}],"adrs":[{"title":"...","context":"...","decision":"...","consequences":"..."}],"integrations":[{"system":"...","direction":"in/out","auth":"...","notes":"..."}],"spikes":["question to investigate 1","question 2"]}\n\nReturn only valid JSON.` }],
      "You are a technical architect. Generate practical technical planning. Return only valid JSON.", 2000);
    setGenerating(false);
    const parsed = parseJSON(reply);
    if (parsed) {
      update({
        architectureNotes: parsed.architectureNotes || "",
        nfrs: parsed.nfrs || [],
        adrs: parsed.adrs || [],
        integrations: parsed.integrations || [],
        spikes: parsed.spikes || [],
      });
    }
  };

  const tabs = [
    { id: "architecture", label: "Architecture" },
    { id: "nfrs", label: "NFRs" },
    { id: "adrs", label: "ADRs" },
    { id: "integrations", label: "Integrations" },
    { id: "spikes", label: "Spikes" },
  ];

  const tabStyle = t => ({
    padding: "5px 12px", background: section === t ? "#e8f0fe" : "transparent",
    border: section === t ? "1px solid #b3d4ff" : "1px solid transparent",
    borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: section === t ? 600 : 400,
    color: section === t ? "#0052cc" : "#6b778c", fontFamily: "'DM Sans',sans-serif",
  });

  const nfrs = project.nfrs || [];
  const adrs = project.adrs || [];
  const integrations = project.integrations || [];
  const spikes = project.spikes || [];

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Tech Planning</div><div className="sec-sub">Architecture context, NFRs, ADRs, integrations, and open questions</div></div>
        <button className="btn btn-ai" onClick={generatePlanning} disabled={generating}>
          {generating ? "Generating..." : <><Sparkles size={13} /> AI Generate</>}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(t => <button key={t.id} style={tabStyle(t.id)} onClick={() => setSection(t.id)}>{t.label}</button>)}
      </div>

      {section === "architecture" && (
        <div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif" }}>System Context (C4 L1)</div>
              {project.architectureNotes && <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(project.architectureNotes)}><Copy size={11} /> Copy</button>}
            </div>
            <textarea value={project.architectureNotes || ""} onChange={e => update({ architectureNotes: e.target.value })}
              placeholder="Describe the system boundaries: what external systems interact, what users are involved, what are the main components. This becomes your C4 Level 1 diagram narrative..."
              rows={8} />
          </div>
        </div>
      )}

      {section === "nfrs" && (
        <div>
          {nfrs.length === 0 ? (
            <Empty icon={<Shield size={36} />} title="No NFRs defined" sub="Click 'AI Generate' to get started with relevant non-functional requirements" />
          ) : nfrs.map((nfr, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: MOSCOW_COLORS[nfr.priority]?.color || "#6b778c", background: MOSCOW_COLORS[nfr.priority]?.bg || "#f1f2f4", padding: "2px 7px", borderRadius: 4, fontFamily: "'DM Mono',monospace", flexShrink: 0, marginTop: 2 }}>{nfr.priority}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d", marginBottom: 2 }}>{nfr.category}</div>
                <div style={{ fontSize: 12, color: "#505f79" }}>{nfr.requirement}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "adrs" && (
        <div>
          {adrs.length === 0 ? (
            <Empty icon={<GitBranch size={36} />} title="No ADRs yet" sub="Architecture Decision Records capture key technical choices and their rationale" />
          ) : adrs.map((adr, i) => (
            <div key={i} className="card">
              <div style={{ fontWeight: 700, fontSize: 14, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 10 }}>{adr.title}</div>
              {[["Context", adr.context], ["Decision", adr.decision], ["Consequences", adr.consequences]].map(([k, v]) => v && (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 13, color: "#505f79", lineHeight: 1.55 }}>{v}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {section === "integrations" && (
        <div>
          {integrations.length === 0 ? (
            <Empty icon={<Package size={36} />} title="No integrations mapped" sub="Document all external systems, APIs, and data sources the product will connect to" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    {["System", "Direction", "Auth", "Notes"].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#6b778c", fontFamily: "'DM Mono',monospace", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #dfe1e6" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {integrations.map((int, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #ebecf0" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#172b4d" }}>{int.system}</td>
                      <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: int.direction === "in" ? "#e6f0ff" : "#e3fcef", color: int.direction === "in" ? "#0052cc" : "#00632b", fontFamily: "'DM Mono',monospace" }}>{int.direction}</span></td>
                      <td style={{ padding: "8px 12px", color: "#505f79" }}>{int.auth}</td>
                      <td style={{ padding: "8px 12px", color: "#6b778c" }}>{int.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "spikes" && (
        <div>
          {spikes.length === 0 ? (
            <Empty icon={<Lightbulb size={36} />} title="No spikes identified" sub="Spikes are open technical questions that need investigation before estimating" />
          ) : spikes.map((spike, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff8e1", border: "1px solid #ffe999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#7a5c00", flexShrink: 0 }}>{i + 1}</div>
              <span style={{ fontSize: 13, color: "#344563", flex: 1 }}>{spike}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wireframe Prototype ──────────────────────────────────────────────────────
// data = { screens, html, lastGenerated }  |  onSave(data)  |  projectContext = full project for backbone/platform/etc.
function WireframePrototype({ projectContext, data = {}, onSave, defaultScreens = [] }) {
  const [screens, setScreens] = useState(() => data.screens?.length ? data.screens : defaultScreens);
  const [html, setHtml] = useState(data.html || "");
  const [generating, setGenerating] = useState(false);
  const [iterPrompt, setIterPrompt] = useState("");
  const [iterating, setIterating] = useState(false);
  const [view, setView] = useState(data.html ? "preview" : "define");
  const [editingScreen, setEditingScreen] = useState(null);

  const isMobile = /(mobile|app|ios|android)/i.test(projectContext.platform || "");

  // Blob URL gives the iframe a real addressable URL so hash links (#screen-foo)
  // navigate within the iframe instead of falling through to the parent window.
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!html) { setBlobUrl(null); return; }
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  const buildPrompt = (extra = "") => {
    const list = screens.map((s, i) => `  ${i + 1}. "${s.name}"${s.description ? ` — ${s.description}` : ""}`).join("\n");
    const firstSlug = screens[0] ? screens[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "home";
    return `Generate a complete, self-contained HTML lo-fi wireframe prototype. CRITICAL: use ONLY CSS for navigation — absolutely NO JavaScript of any kind.

PROJECT: ${projectContext.name}
About: ${projectContext.about || ""}
Platform: ${projectContext.platform || "web"} ${isMobile ? "(mobile — max-width 390px, centered)" : "(desktop — full width)"}
Industry: ${projectContext.industry || ""}
${extra ? `\nCHANGE REQUEST: ${extra}\n` : ""}
SCREENS:
${list}

NAVIGATION SYSTEM (CSS :target — no JS):
- Each screen: <div class="screen" id="screen-SLUG">
- All screens hidden by default: .screen { display: none }
- First screen visible: #screen-${firstSlug} { display: block }
- Targeted screen visible: .screen:target { display: block }
- Hide first when another is targeted: :has(.screen:target:not(#screen-${firstSlug})) #screen-${firstSlug} { display: none }
- All navigation links: <a href="#screen-SLUG"> — never use onclick or JS

DESIGN REQUIREMENTS:
- Single .html file — inline CSS only, zero JavaScript, zero external dependencies
- Lo-fi wireframe aesthetic: white bg, #e0e0e0 placeholder boxes, #333 text, simple borders
- ${isMobile ? "Center content at max-width:390px with a light border to simulate a phone" : "Full-width desktop layout with appropriate nav/sidebar"}
- Sticky top bar on every screen: project name left, current screen name center (use CSS to show/hide per screen), back link right
- Placeholder images: <div style="background:#e0e0e0;border-radius:6px;width:100%;height:160px;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px">Image</div>
- Realistic placeholder text (not Lorem Ipsum) — match the product context
- Fixed screen-switcher bar at the very bottom with an <a href="#screen-SLUG"> link for every screen
- Make every button and link navigate somewhere meaningful using href="#screen-SLUG"

Return ONLY the complete HTML document. No markdown fences. No explanation. Begin with <!DOCTYPE html>.`;
  };

  const persist = (newHtml, newScreens) => {
    onSave({ screens: newScreens || screens, html: newHtml, lastGenerated: new Date().toISOString().split("T")[0] });
  };

  const generate = async () => {
    if (!screens.length) return;
    setGenerating(true);
    const reply = await askClaude([{ role: "user", content: buildPrompt() }],
      "You are a UX wireframe generator. Output ONLY a complete self-contained HTML document. No markdown. No explanation. Start with <!DOCTYPE html>.", 6000);
    setGenerating(false);
    const clean = reply.replace(/^```html?\s*/i, "").replace(/\n?```\s*$/, "").trim();
    setHtml(clean);
    persist(clean);
    setView("preview");
  };

  const iterate = async () => {
    if (!iterPrompt.trim() || !html) return;
    setIterating(true);
    const reply = await askClaude(
      [{ role: "user", content: `Current HTML wireframe:\n\n${html}\n\n---\nCHANGE REQUEST: ${iterPrompt}\n\nApply the changes and return the COMPLETE updated HTML. Keep the CSS :target navigation system — no JavaScript. No markdown. No explanation.` }],
      "You are a UX wireframe generator. Use only CSS :target for navigation — no JavaScript. Return the complete updated HTML document. No markdown fences. No explanation.", 6000);
    setIterating(false);
    const clean = reply.replace(/^```html?\s*/i, "").replace(/\n?```\s*$/, "").trim();
    setHtml(clean);
    persist(clean);
    setIterPrompt("");
  };

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${(projectContext.name || "wireframe").replace(/\s+/g, "-").toLowerCase()}-prototype.html` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openExternal = () => {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const importFromBackbone = () => {
    const auto = (projectContext.backbone || []).flatMap(stage =>
      (stage.epics || []).map(epic => ({
        id: uid(), name: epic.title,
        description: `${stage.stage} — ${(epic.features || []).slice(0, 3).map(f => f.title || f).join(", ")}`,
      }))
    ).slice(0, 12);
    if (auto.length) setScreens(auto);
  };

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["define", "Screens"], ["preview", "Preview"]].map(([v, lbl]) => (
          <button key={v} onClick={() => setView(v)} disabled={v === "preview" && !html}
            style={{ padding: "6px 18px", borderRadius: 20, border: "none", cursor: v === "preview" && !html ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s",
              background: view === v ? "#172b4d" : "#f1f2f4", color: view === v ? "#fff" : "#505f79", opacity: v === "preview" && !html ? .4 : 1 }}>
            {lbl}
          </button>
        ))}
        {data.lastGenerated && <span style={{ marginLeft: "auto", fontSize: 11, color: "#97a0af", alignSelf: "center" }}>Last generated: {data.lastGenerated}</span>}
      </div>

      {/* ── DEFINE SCREENS ── */}
      {view === "define" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#6b778c" }}>Define screens to include. Screen 1 is the entry point.</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(projectContext.backbone || []).length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={importFromBackbone}><Sparkles size={12} /> Import from Story Map</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setScreens(s => [...s, { id: uid(), name: "New Screen", description: "" }])}>
                <Plus size={12} /> Add Screen
              </button>
            </div>
          </div>

          {screens.length === 0 && <Empty icon={<Layers size={36} />} title="No screens defined" sub="Add screens manually or import from your story map backbone" />}

          {screens.map((s, idx) => (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "#fff", border: "1px solid #dfe1e6", borderRadius: 8, marginBottom: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#172b4d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{idx + 1}</div>
              {editingScreen?.id === s.id ? (
                <div style={{ flex: 1 }}>
                  <input value={editingScreen.name} onChange={e => setEditingScreen(es => ({ ...es, name: e.target.value }))} autoFocus
                    style={{ width: "100%", fontSize: 13, fontWeight: 600, padding: "4px 8px", border: "1px solid #c1c7d0", borderRadius: 4, marginBottom: 4, boxSizing: "border-box" }} />
                  <input value={editingScreen.description} onChange={e => setEditingScreen(es => ({ ...es, description: e.target.value }))}
                    placeholder="What does this screen do?" style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #c1c7d0", borderRadius: 4, boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setScreens(ss => ss.map(x => x.id === editingScreen.id ? editingScreen : x)); setEditingScreen(null); }}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingScreen(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#172b4d" }}>{s.name}</div>
                  {s.description && <div style={{ fontSize: 12, color: "#6b778c", marginTop: 2 }}>{s.description}</div>}
                </div>
              )}
              {editingScreen?.id !== s.id && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button className="icon-btn" onClick={() => setEditingScreen({ ...s })}><Edit2 size={12} /></button>
                  <button className="icon-btn" onClick={() => setScreens(ss => ss.filter(x => x.id !== s.id))}><Trash2 size={12} /></button>
                </div>
              )}
            </div>
          ))}

          {screens.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-ai" onClick={generate} disabled={generating}
                style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 14 }}>
                {generating ? "Building prototype…" : <><Sparkles size={15} /> Generate Interactive Prototype</>}
              </button>
              {generating && <div style={{ fontSize: 12, color: "#97a0af", textAlign: "center", marginTop: 8 }}>Claude is building all {screens.length} screens — this takes 20–40 seconds…</div>}
            </div>
          )}
        </div>
      )}

      {/* ── PREVIEW ── */}
      {view === "preview" && html && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#6b778c" }}>Click through the prototype — all navigation is live.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={openExternal}><ArrowUpRight size={12} /> Open in Tab</button>
              <button className="btn btn-ghost btn-sm" onClick={download}><ArrowUpRight size={12} /> Download HTML</button>
              <button className="btn btn-ai btn-sm" onClick={generate} disabled={generating}>
                <Sparkles size={12} /> {generating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid #dfe1e6", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "8px 12px", background: "#f8f9fa", borderBottom: "1px solid #dfe1e6", display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
              <div style={{ flex: 1, background: "#e8eaed", borderRadius: 4, padding: "2px 12px", fontSize: 11, color: "#5f6368", marginLeft: 8, fontFamily: "monospace" }}>
                {projectContext.name} — Lo-fi Prototype
              </div>
            </div>
            <iframe src={blobUrl} style={{ width: "100%", height: isMobile ? 780 : 640, border: "none", display: "block" }} title="Wireframe prototype" />
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#172b4d", marginBottom: 4 }}>Iterate</div>
            <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 10 }}>Describe a change and Claude will update the prototype in place.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={iterPrompt} onChange={e => setIterPrompt(e.target.value)}
                onKeyDown={e => e.key === "Enter" && iterate()}
                placeholder='e.g. "Add a sidebar to dashboard", "Show empty state on the list", "Add a settings screen"'
                style={{ flex: 1, fontSize: 13 }} disabled={iterating} />
              <button className="btn btn-ai" onClick={iterate} disabled={iterating || !iterPrompt.trim()} style={{ flexShrink: 0 }}>
                {iterating ? "Updating…" : <><Sparkles size={13} /> Apply</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Discovery Design Planning ─────────────────────────────────────────────────
function DiscoveryDesign({ project, update }) {
  const [generating, setGenerating] = useState(false);
  const [showProto, setShowProto] = useState(false);

  const generate = async () => {
    setGenerating(true);
    const mvpFlows = (project.backbone || []).flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp").map(f => `${s.stage} → ${f.title}`))).slice(0, 8);
    const reply = await askClaude([{ role: "user", content: `Create a design planning document for:\nProject: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nPlatform: ${project.platform}\nMVP flows: ${mvpFlows.join(", ") || "TBD"}\n\nReturn JSON:\n{"researchPlan":"Markdown text with research goals, methods, and timeline","designPriorities":[{"flow":"...","reason":"...","week":"Week 1-2","dependencies":"..."}],"nextSteps":["Step 1","Step 2"],"assumptions":["Assumption 1"]}\n\nReturn only valid JSON.` }],
      "Senior Design Lead. Practical, actionable design planning. Return only valid JSON.", 1500);
    setGenerating(false);
    const parsed = parseJSON(reply);
    if (parsed) {
      update({ designResearchPlan: parsed.researchPlan || "", designPriorities: parsed.designPriorities || [], designNextSteps: parsed.nextSteps || [], designAssumptions: parsed.assumptions || [] });
    }
  };

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Design Planning</div><div className="sec-sub">Research plan, design priorities, and next steps for the design team</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowProto(true)}><Layers size={13} /> Prototype</button>
          <button className="btn btn-ai" onClick={generate} disabled={generating}>{generating ? "Generating..." : <><Sparkles size={13} /> AI Generate</>}</button>
        </div>
      </div>

      {showProto && (
        <Modal wide title="Lo-fi Prototype" onClose={() => setShowProto(false)}>
          <WireframePrototype
            projectContext={project}
            data={project.wireframe || {}}
            onSave={(d) => update({ wireframe: d })}
            defaultScreens={(project.backbone || []).flatMap(stage =>
              (stage.epics || []).map(epic => ({
                id: uid(), name: epic.title,
                description: `${stage.stage} — ${(epic.features || []).slice(0, 3).map(f => f.title || f).join(", ")}`,
              }))
            ).slice(0, 12)}
          />
        </Modal>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif" }}>Research Plan</div>
          {project.designResearchPlan && <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(project.designResearchPlan)}><Copy size={11} /> Copy</button>}
        </div>
        <textarea value={project.designResearchPlan || ""} onChange={e => update({ designResearchPlan: e.target.value })}
          placeholder="Document research goals, methods (interviews, usability testing, surveys), participant plan, and timeline..." rows={6} />
      </div>

      {(project.designPriorities || []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>Design Priorities for MVP</div>
          {(project.designPriorities || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #ebecf0", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#0052cc", background: "#e6f0ff", padding: "2px 8px", borderRadius: 4, flexShrink: 0, marginTop: 1 }}>{p.week}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#172b4d" }}>{p.flow}</div>
                <div style={{ fontSize: 12, color: "#6b778c", marginTop: 2 }}>{p.reason}</div>
                {p.dependencies && <div style={{ fontSize: 11, color: "#97a0af", marginTop: 3 }}>Depends on: {p.dependencies}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(project.designNextSteps || []).length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif", marginBottom: 10 }}>Next Steps</div>
          {(project.designNextSteps || []).map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: "#344563" }}>
              <span style={{ color: "#36b37e", flexShrink: 0, marginTop: 1 }}>→</span> {step}
            </div>
          ))}
        </div>
      )}

      {!project.designResearchPlan && !generating && (
        <Empty icon={<Palette size={36} />} title="No design plan yet"
          sub="Generate a research plan and design priorities based on your story map"
          action={<button className="btn btn-ai" onClick={generate}><Sparkles size={13} /> Generate Design Plan</button>} />
      )}
    </div>
  );
}

// ─── Team Estimation ───────────────────────────────────────────────────────────
function TeamEstimation({ project, update }) {
  const [generating, setGenerating] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const scenarios = project.scenarios || null;

  const generateScenarios = async () => {
    setGenerating(true);
    const mvpPts = (project.backbone || []).flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp"))).length * 5;
    const reply = await askClaude([{ role: "user", content: `Create 3 team scenarios for:\nProject: ${project.name}\nAbout: ${project.about}\nIndustry: ${project.industry}\nPlatform: ${project.platform}\nEst. MVP story points: ~${mvpPts || 150}\nClient type: ${project.clientType}\n\nReturn JSON:\n{"lean":{"name":"Lean","description":"...","roles":[{"role":"...","fte":1.0,"monthly":X}],"sprintVelocity":N,"mvpSprints":N,"mvpMonths":N,"totalCost":N,"pros":["..."],"cons":["..."]},"balanced":{same},"accelerated":{same}}\n\nUse realistic salary rates (CR-based team) in USD. Lean: 2-3 people. Balanced: 4-6. Accelerated: 7+. Return only valid JSON.` }],
      "Senior delivery manager. Realistic team sizing and cost estimation for a Costa Rica-based team. Return only valid JSON.", 2500);
    setGenerating(false);
    const parsed = parseJSON(reply);
    if (parsed) update({ scenarios: parsed });
  };

  const formatCost = n => n ? "$" + Number(n).toLocaleString() : "—";

  const ScenarioCard = ({ key: k, data, color, label }) => {
    if (!data) return null;
    const total = (data.roles || []).reduce((a, r) => a + (r.monthly * r.fte), 0);
    return (
      <div className="card" style={{ borderTop: "3px solid " + color }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#172b4d", marginBottom: 4 }}>{data.name || label}</div>
        <div style={{ fontSize: 12, color: "#6b778c", marginBottom: 14, lineHeight: 1.5 }}>{data.description}</div>

        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          {[["Timeline", data.mvpMonths + " mo"], ["Sprints", data.mvpSprints], ["Velocity", data.sprintVelocity + "pt/sprint"]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: "#97a0af", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'Syne',sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#6b778c", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Team</div>
          {(data.roles || []).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#344563", padding: "3px 0", borderBottom: "1px solid #f1f2f4" }}>
              <span>{r.fte !== 1 ? r.fte + "x " : ""}{r.role}</span>
              <span style={{ color: "#6b778c" }}>{formatCost(r.monthly)}/mo</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#172b4d", padding: "6px 0", borderTop: "2px solid #dfe1e6", marginTop: 4 }}>
            <span>Monthly Total</span>
            <span style={{ color }}>{formatCost(total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b778c", padding: "2px 0" }}>
            <span>MVP Total Investment</span>
            <span style={{ fontWeight: 600, color: "#172b4d" }}>{formatCost(total * (data.mvpMonths || 1))}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            {(data.pros || []).map((p, i) => <div key={i} style={{ fontSize: 11, color: "#00632b", display: "flex", gap: 4 }}>✓ {p}</div>)}
          </div>
          <div style={{ flex: 1 }}>
            {(data.cons || []).map((c, i) => <div key={i} style={{ fontSize: 11, color: "#de350b", display: "flex", gap: 4 }}>✕ {c}</div>)}
          </div>
        </div>
      </div>
    );
  };

  const recommendedText = scenarios ? `Based on the project scope and discovery outputs, here are 3 delivery scenarios:\n\n` +
    ["lean", "balanced", "accelerated"].map(k => {
      const d = scenarios[k];
      if (!d) return "";
      const roles = (d.roles || []).map(r => r.role).join(", ");
      const total = (d.roles || []).reduce((a, r) => a + r.monthly * r.fte, 0);
      return `**${d.name}**\nTeam: ${roles}\nTimeline: ${d.mvpMonths} months to MVP\nVelocity: ${d.sprintVelocity}pt/sprint\nMonthly cost: $${total.toLocaleString()}\nTotal investment: $${(total * d.mvpMonths).toLocaleString()}\n`;
    }).join("\n") : "";

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Team & Estimation</div><div className="sec-sub">Three team scenarios with timeline and cost comparison</div></div>
        <div className="sec-actions">
          {scenarios && <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(recommendedText)}><Copy size={12} /> Copy Comparison</button>}
          <button className="btn btn-ai" onClick={generateScenarios} disabled={generating}>{generating ? "Generating..." : <><Sparkles size={13} /> Generate Scenarios</>}</button>
        </div>
      </div>

      {generating && (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
          <div style={{ fontSize: 13, color: "#6b778c" }}>Calculating team scenarios, timelines and costs...</div>
        </div>
      )}

      {!scenarios && !generating && (
        <Empty icon={<BarChart2 size={36} />} title="No scenarios generated yet"
          sub="AI will create 3 team options — Lean, Balanced, and Accelerated — with costs and timelines"
          action={<button className="btn btn-ai" onClick={generateScenarios}><Sparkles size={13} /> Generate Scenarios</button>} />
      )}

      {scenarios && !generating && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <ScenarioCard k="lean" data={scenarios.lean} color="#36b37e" label="Lean" />
          <ScenarioCard k="balanced" data={scenarios.balanced} color="#0052cc" label="Balanced" />
          <ScenarioCard k="accelerated" data={scenarios.accelerated} color="#e8c547" label="Accelerated" />
        </div>
      )}
    </div>
  );
}

// ─── Discovery Presentation ────────────────────────────────────────────────────
function DiscoveryPresentation({ project, update, onGraduate }) {
  const [generating, setGenerating] = useState(false);
  const [narrative, setNarrative] = useState(project.presentationNotes || "");

  const generateNarrative = async () => {
    setGenerating(true);
    const mvpFeatures = (project.backbone || []).flatMap(s => (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp").map(f => f.title))).slice(0, 10);
    const risks = (project.risks || []).slice(0, 4).map(r => typeof r === "string" ? r : r.text);
    const reply = await askClaude([{ role: "user", content: `Write an executive-level client presentation narrative for a discovery handoff.\n\nProject: ${project.name}\nClient: ${project.clientType}\nAbout: ${project.about}\nIndustry: ${project.industry}\nMVP features: ${mvpFeatures.join(", ")}\nRisks: ${risks.join(", ")}\nSessions conducted: ${(project.sessions || []).length}\n\nWrite a clear, confident narrative covering:\n1. What we discovered (vision, users, key insights)\n2. What we're proposing to build (MVP scope)\n3. Why this approach (rationale)\n4. Key risks and mitigations\n5. Recommended next steps\n\nTone: confident, clear, executive-level. No bullet point soup. Paragraphs with clear headers. 400-500 words.` }],
      "Senior delivery consultant. Write crisp, confident executive narratives. No fluff.", 1200);
    setNarrative(reply);
    update({ presentationNotes: reply });
    setGenerating(false);
  };

  const sections = [
    {
      label: "1. Vision & Goals",
      content: project.about + (project.assumptions?.length ? "\n\nKey assumptions:\n" + (project.assumptions || []).slice(0, 4).join("\n") : "")
    },
    {
      label: "2. Discovery Outputs",
      content: [
        `Sessions conducted: ${(project.sessions || []).length}`,
        `Risks identified: ${(project.risks || []).length}`,
        `Opportunities: ${(project.opportunities || []).length}`,
        "",
        ...(project.risks || []).slice(0, 4).map(r => "⚠ " + (typeof r === "string" ? r : r.text)),
        "",
        ...(project.opportunities || []).slice(0, 4).map(o => "✓ " + (typeof o === "string" ? o : o.text)),
      ].join("\n")
    },
    {
      label: "3. MVP Scope (Story Map)",
      content: (project.backbone || []).map(s =>
        `${s.stage}:\n` + (s.epics || []).flatMap(e => (e.features || []).filter(f => f.slice === "mvp").map(f => `  • [${f.moscow}] ${f.title}`)).join("\n")
      ).join("\n\n") || "Story map not yet defined"
    },
    {
      label: "4. Team & Investment",
      content: project.scenarios ? ["lean", "balanced", "accelerated"].map(k => {
        const d = project.scenarios[k];
        if (!d) return "";
        const total = (d.roles || []).reduce((a, r) => a + r.monthly * r.fte, 0);
        return `${d.name}: ${d.mvpMonths} months · $${total.toLocaleString()}/mo · $${(total * d.mvpMonths).toLocaleString()} total`;
      }).join("\n") : "Scenarios not yet generated"
    },
    {
      label: "5. Architecture & Tech",
      content: project.architectureNotes || "Architecture notes not yet defined"
    },
    {
      label: "6. Design Plan",
      content: project.designResearchPlan || "Design plan not yet defined"
    },
  ];

  const allContent = sections.map(s => `${s.label}\n${"─".repeat(40)}\n${s.content}`).join("\n\n\n");
  const narrativeAndSections = (narrative ? narrative + "\n\n" : "") + allContent;

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Client Presentation</div><div className="sec-sub">Consolidated discovery output — copy to Confluence or export</div></div>
        <div className="sec-actions">
          <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(narrativeAndSections)}><Copy size={13} /> Copy All</button>
          <button className="btn btn-ai" onClick={generateNarrative} disabled={generating}><Sparkles size={13} /> {generating ? "Writing..." : "Generate Narrative"}</button>
          <button className="btn btn-primary" onClick={onGraduate}><Rocket size={13} /> Move to Delivery</button>
        </div>
      </div>

      {/* Executive narrative */}
      {(narrative || generating) && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid #e8c547" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#172b4d", fontFamily: "'Syne',sans-serif" }}>Executive Summary</div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(narrative)}><Copy size={11} /> Copy</button>
          </div>
          {generating
            ? <div style={{ display: "flex", gap: 6, padding: "8px 0" }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
            : <textarea value={narrative} onChange={e => { setNarrative(e.target.value); update({ presentationNotes: e.target.value }); }} rows={10} style={{ lineHeight: 1.75 }} />}
        </div>
      )}

      {/* All sections as copyable blocks */}
      {sections.map(s => (
        <CopyBox key={s.label} label={s.label} content={s.content} />
      ))}

      {/* Graduate to delivery CTA */}
      <div className="card" style={{ background: "rgba(232,197,71,.06)", border: "1px solid rgba(232,197,71,.3)", textAlign: "center", padding: "24px" }}>
        <Rocket size={24} color="#7a6000" style={{ marginBottom: 10 }} />
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: "#172b4d", marginBottom: 6 }}>Discovery Complete?</div>
        <div style={{ fontSize: 13, color: "#6b778c", marginBottom: 16 }}>Move this project to Delivery mode to start creating stories, sprints, and tracking bugs.</div>
        <button className="btn btn-primary" onClick={onGraduate}><Rocket size={13} /> Move to Delivery</button>
      </div>
    </div>
  );
}
