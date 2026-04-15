import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  LayoutDashboard, Users, User, Layers, BookOpen, Bug, Palette,
  UserCheck, Calendar, Bot, Plus, ChevronDown, X, Sparkles, Send,
  Check, Edit2, Trash2, Zap, ChevronRight, AlertCircle, TrendingUp,
  Activity, Flag, Globe, Shield, Clock, Hash, Target, Loader,
  MoreVertical, ArrowRight, CheckCircle2, Circle
} from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);

async function askClaude(messages, system = "") {
  try {
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return d.text;
  } catch (e) {
    return `Error: ${e.message}`;
  }
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
  industry: "FinTech", teamSize: 8, velocity: 42,
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
  aiRules: ["Use Jira-compatible story format", "Always include at least one AC per story"],
  velocityHistory: [38, 42, 40, 45, 42],
};

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e2533;border-radius:2px}::-webkit-scrollbar-track{background:transparent}
body{background:#0d0f14}
.app{display:flex;height:100vh;background:#0d0f14;color:#eef0f7;font-family:'DM Sans',sans-serif;overflow:hidden;font-size:14px}
.sbar{width:224px;min-width:224px;background:#080a0d;border-right:1px solid #181f2d;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.sbar-logo{padding:18px 16px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #181f2d}
.sbar-logo-mark{width:28px;height:28px;background:#e8c547;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sbar-logo h2{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;letter-spacing:-.02em;color:#eef0f7}
.sbar-logo span{color:#5d6a85;font-weight:600}
.sbar-proj-area{padding:10px 10px;border-bottom:1px solid #181f2d;position:relative}
.sbar-proj-btn{width:100%;display:flex;align-items:center;gap:8px;background:#111318;border:1px solid #1e2533;border-radius:8px;padding:8px 10px;cursor:pointer;color:#eef0f7;font-size:12px;font-weight:500;font-family:'DM Sans',sans-serif;transition:border-color .15s;text-align:left}
.sbar-proj-btn:hover{border-color:#2d3a50}
.sbar-proj-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbar-proj-tag{font-size:10px;color:#5d6a85;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}
.sbar-dropdown{position:absolute;z-index:200;top:calc(100% - 2px);left:10px;right:10px;background:#111318;border:1px solid #1e2533;border-radius:8px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.sbar-dropdown-item{padding:9px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;transition:background .12s}
.sbar-dropdown-item:hover{background:#1a1f2e}
.sbar-dropdown-item.sel{color:#e8c547}
.sbar-dropdown-sep{height:1px;background:#181f2d;margin:4px 0}
.sbar-nav{flex:1;overflow-y:auto;padding:8px 8px}
.nav-section-label{font-size:10px;color:#3a4255;font-weight:600;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;padding:10px 10px 5px}
.nav-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;cursor:pointer;font-size:13px;color:#5d6a85;font-weight:400;transition:all .12s;margin-bottom:1px;border:none;background:none;width:100%;text-align:left;font-family:'DM Sans',sans-serif;line-height:1}
.nav-item:hover{background:#111620;color:#9aaabb}
.nav-item.active{background:#15192a;color:#eef0f7;font-weight:500}
.nav-item.active .nav-icon{color:#e8c547}
.nav-icon{flex-shrink:0;opacity:.8}
.sbar-footer{padding:10px 10px;border-top:1px solid #181f2d}
.new-proj-btn{width:100%;display:flex;align-items:center;gap:7px;padding:8px 10px;background:rgba(232,197,71,.07);border:1px solid rgba(232,197,71,.18);border-radius:7px;cursor:pointer;color:#e8c547;font-size:12px;font-weight:500;font-family:'DM Sans',sans-serif;transition:all .15s}
.new-proj-btn:hover{background:rgba(232,197,71,.13);border-color:rgba(232,197,71,.32)}
.main{flex:1;overflow-y:auto;padding:32px 36px 48px}
.sec-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;gap:16px}
.sec-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:#eef0f7;letter-spacing:-.025em;line-height:1.15}
.sec-sub{font-size:12px;color:#4a5568;margin-top:4px;font-weight:400}
.sec-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:none;font-family:'DM Sans',sans-serif;padding:8px 14px;white-space:nowrap;line-height:1}
.btn-primary{background:#e8c547;color:#0d0f14}
.btn-primary:hover{background:#f5d35a;transform:translateY(-1px)}
.btn-ghost{background:transparent;color:#5d6a85;border:1px solid #1e2533}
.btn-ghost:hover{background:#111318;color:#eef0f7;border-color:#2d3a50}
.btn-ai{background:rgba(232,197,71,.08);color:#e8c547;border:1px solid rgba(232,197,71,.2)}
.btn-ai:hover{background:rgba(232,197,71,.15);border-color:rgba(232,197,71,.38)}
.btn-danger{background:transparent;color:#ff5757;border:1px solid rgba(255,87,87,.25)}
.btn-danger:hover{background:rgba(255,87,87,.1)}
.btn-sm{padding:5px 10px;font-size:12px}
.btn-xs{padding:3px 8px;font-size:11px}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none!important}
.card{background:#111318;border:1px solid #1e2533;border-radius:10px;padding:20px;margin-bottom:12px;transition:border-color .15s}
.card:hover{border-color:#252d40}
.card-flat{background:#0d1018;border:1px solid #181f2d;border-radius:8px;padding:14px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:#111318;border:1px solid #1e2533;border-radius:10px;padding:16px 18px}
.stat-num{font-family:'Syne',sans-serif;font-size:32px;font-weight:700;color:#eef0f7;line-height:1;letter-spacing:-.02em}
.stat-label{font-size:11px;color:#4a5568;margin-top:5px;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.stat-hint{font-size:11px;margin-top:6px;font-weight:500}
.tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;font-family:'DM Mono',monospace;letter-spacing:.04em;white-space:nowrap;line-height:1.5}
.tag-FE{background:#0c2218;color:#3be8a8}
.tag-BE{background:#0c1828;color:#5ba4f5}
.tag-FS{background:#180c28;color:#c57bff}
.tag-Mobile{background:#221808;color:#e8c547}
.tag-QA{background:#0e1e28;color:#38bdf8}
.tag-Designer{background:#1a0c1a;color:#ff8ec7}
.tag-BUG{background:#220c0c;color:#ff5757}
.tag-Design{background:#1a0c1a;color:#ff8ec7}
.tag-accent{background:rgba(232,197,71,.1);color:#e8c547}
.tag-muted{background:#181f2d;color:#5d6a85}
.tag-green{background:rgba(59,232,168,.1);color:#3be8a8}
.badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:4px;font-size:10px;font-weight:600;font-family:'DM Mono',monospace;padding:0 4px;background:#181f2d;color:#5d6a85}
.badge-accent{background:rgba(232,197,71,.12);color:#e8c547}
.divider{height:1px;background:#1e2533;margin:16px 0}
.row{display:flex;gap:12px}
.row>.field{flex:1;min-width:0}
.field{margin-bottom:14px}
label{font-size:11px;color:#4a5568;font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
input,textarea,select{background:#0d1018;border:1px solid #1e2533;color:#eef0f7;border-radius:7px;padding:8px 12px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;width:100%;transition:border-color .15s;line-height:1.4}
input:focus,textarea:focus,select:focus{border-color:#e8c547;box-shadow:0 0 0 3px rgba(232,197,71,.08)}
select option{background:#111318}
textarea{resize:vertical;min-height:70px}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(3px)}
.modal{background:#111318;border:1px solid #252d40;border-radius:14px;width:620px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.65)}
.modal-wide{width:780px}
.modal-hd{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #1e2533;position:sticky;top:0;background:#111318;z-index:1}
.modal-hd h3{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#eef0f7;letter-spacing:-.02em}
.modal-bd{padding:20px 24px}
.modal-ft{padding:14px 24px;border-top:1px solid #1e2533;display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:0;background:#111318}
.icon-btn{background:transparent;border:none;cursor:pointer;color:#4a5568;padding:5px;border-radius:5px;display:inline-flex;align-items:center;transition:color .12s}
.icon-btn:hover{color:#eef0f7}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px 24px;text-align:center}
.empty-ico{margin-bottom:14px;opacity:.25}
.empty h3{font-size:14px;font-weight:600;color:#5d6a85;margin-bottom:5px}
.empty p{font-size:12px;color:#3a4255}
.ai-bubble{border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:13px;line-height:1.7;max-width:84%;white-space:pre-wrap;word-break:break-word}
.ai-bubble-bot{background:#181f2d;color:#c8d4e8;margin-right:auto;border-bottom-left-radius:3px;border:1px solid #1e2533}
.ai-bubble-user{background:#e8c547;color:#0d0f14;margin-left:auto;border-bottom-right-radius:3px;font-weight:500}
.ai-typing{display:inline-flex;align-items:center;gap:4px;padding:8px 12px}
.ai-dot{width:5px;height:5px;border-radius:50%;background:#5d6a85;animation:bounce 1.2s infinite}
.ai-dot:nth-child(2){animation-delay:.2s}
.ai-dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:3px 10px;background:#181f2d;border:1px solid #252d40;border-radius:20px;font-size:11px;color:#7080a0}
.progress-bar{height:3px;background:#1e2533;border-radius:2px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;background:linear-gradient(90deg,#e8c547,#f5d35a);border-radius:2px}
.ac-block{background:#0d1018;border:1px solid #181f2d;border-radius:8px;padding:12px 14px;margin-bottom:8px}
.ac-row{margin-bottom:8px}
.ac-lbl{font-size:10px;color:#4a5568;font-weight:600;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.ac-val{font-size:12px;color:#9aaabb;line-height:1.5}
.pts-row{display:inline-flex;gap:6px;align-items:center}
.pts-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:5px;font-size:11px;font-family:'DM Mono',monospace}
.pts-ai{background:rgba(232,197,71,.08);color:#e8c547;border:1px solid rgba(232,197,71,.18)}
.pts-team{background:rgba(59,232,168,.08);color:#3be8a8;border:1px solid rgba(59,232,168,.18)}
.pts-empty{background:#181f2d;color:#5d6a85;border:1px solid #1e2533}
.step-dots{display:flex;gap:5px;margin-bottom:20px}
.step-dot{width:6px;height:6px;border-radius:50%;background:#1e2533;transition:background .2s}
.step-dot.on{background:#e8c547}
.influence-H{color:#e8c547}
.influence-M{color:#5ba4f5}
.influence-L{color:#4a5568}
.sprint-lane{background:#0d1018;border:1px solid #181f2d;border-radius:10px;padding:16px;min-height:120px;flex:1}
.sprint-lane-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#4a5568;margin-bottom:12px;font-family:'DM Mono',monospace}
.sprint-item{background:#111318;border:1px solid #1e2533;border-radius:7px;padding:10px 12px;margin-bottom:7px;cursor:grab;transition:border-color .12s}
.sprint-item:hover{border-color:#2d3a50}
.health-row{display:flex;align-items:center;gap:6px;font-size:12px;color:#7080a0;margin-bottom:6px}
.dot-green{width:7px;height:7px;border-radius:50%;background:#3be8a8;flex-shrink:0}
.dot-yellow{width:7px;height:7px;border-radius:50%;background:#e8c547;flex-shrink:0}
.dot-red{width:7px;height:7px;border-radius:50%;background:#ff5757;flex-shrink:0}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.two-col{grid-template-columns:1fr}.sbar{display:none}.stat-grid{grid-template-columns:1fr 1fr}}
`;

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Modal({ title, wide, onClose, children, footer }) {
  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="modal-ov" onClick={e => e.target === e.currentTarget && onClose()}>
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
  const [loading, setLoading] = useState(true);

  // Load projects from Supabase on mount
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
      } else {
        // First run — seed demo project
        await supabase.from("projects").insert({ id: DEMO.id, data: DEMO });
        setProjects([DEMO]);
        setPid(DEMO.id);
      }
      setLoading(false);
    })();
  }, []);

  const project = projects.find(p => p.id === pid);

  const update = useCallback(async (changes) => {
    const updated = { ...projects.find(p => p.id === pid), ...changes };
    setProjects(ps => ps.map(p => p.id === pid ? updated : p));
    await supabase.from("projects").update({ data: updated }).eq("id", pid);
  }, [pid, projects]);

  const handleCreate = useCallback(async (p) => {
    await supabase.from("projects").insert({ id: p.id, data: p });
    setProjects(ps => [...ps, p]);
    setPid(p.id);
    setSection("overview");
    setShowNew(false);
  }, []);

  const sections = {
    overview: <Overview project={project} setSection={setSection} />,
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
      <Sidebar projects={projects} pid={pid} setPid={id => { setPid(id); setSection("overview"); }}
        section={section} setSection={setSection} onNew={() => setShowNew(true)} />
      <main className="main">{project && sections[section]}</main>
      {showNew && (
        <NewProjectModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ projects, pid, setPid, section, setSection, onNew }) {
  const [open, setOpen] = useState(false);
  const proj = projects.find(p => p.id === pid);

  const navItems = [
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

  return (
    <div className="sbar">
      <div className="sbar-logo">
        <div className="sbar-logo-mark">
          <Zap size={14} color="#0d0f14" strokeWidth={2.5} />
        </div>
        <h2>Product<span>OS</span></h2>
      </div>
      <div className="sbar-proj-area">
        <button className="sbar-proj-btn" onClick={() => setOpen(o => !o)}>
          <span className="sbar-proj-name">{proj?.name || "Select project"}</span>
          <span className="sbar-proj-tag">{proj?.platform}</span>
          <ChevronDown size={12} color="#5d6a85" />
        </button>
        {open && (
          <div className="sbar-dropdown">
            {projects.map(p => (
              <div key={p.id} className={`sbar-dropdown-item${p.id === pid ? " sel" : ""}`}
                onClick={() => { setPid(p.id); setOpen(false); }}>
                <span>{p.name}</span>
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
        {navItems.map(({ id, label, Icon }) => (
          <button key={id} className={`nav-item${section === id ? " active" : ""}`}
            onClick={() => setSection(id)}>
            <span className="nav-icon"><Icon size={14} /></span>
            {label}
          </button>
        ))}
      </nav>
      <div className="sbar-footer">
        <button className="new-proj-btn" onClick={onNew}>
          <Plus size={13} /> New Project
        </button>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ project, setSection }) {
  const openBugs = project.bugs.length;
  const totalStories = project.stories.length;
  const donePct = Math.round((project.stories.filter(s => s.teamPts).length / Math.max(totalStories, 1)) * 100);
  const totalEpicPts = project.epics.reduce((a, e) => a + e.stories * 5, 0);

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
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{project.velocity}</div>
          <div className="stat-label">Velocity</div>
          <div className="stat-hint" style={{ color: "#3be8a8" }}>pts / sprint avg</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{project.epics.length}</div>
          <div className="stat-label">Epics</div>
          <div className="stat-hint" style={{ color: "#5ba4f5" }}>{totalStories} stories total</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{openBugs}</div>
          <div className="stat-label">Open Bugs</div>
          <div className="stat-hint" style={{ color: openBugs > 2 ? "#ff5757" : "#3be8a8" }}>{openBugs > 0 ? "Needs attention" : "All clear"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{project.team.length || project.teamSize}</div>
          <div className="stat-label">Team Size</div>
          <div className="stat-hint" style={{ color: "#5d6a85" }}>{project.team.length ? `${project.team.length} members added` : "No members yet"}</div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 12 }}>Project Health</div>
          <div className="health-row"><div className="dot-green" /> Sprints on track</div>
          <div className="health-row"><div className={openBugs > 2 ? "dot-red" : "dot-yellow"} /> {openBugs} open bugs</div>
          <div className="health-row"><div className="dot-green" /> {project.stakeholders.length} stakeholders mapped</div>
          <div className="health-row"><div className={project.personas.length ? "dot-green" : "dot-yellow"} /> {project.personas.length} persona{project.personas.length !== 1 ? "s" : ""} defined</div>
          <div className="divider" style={{ margin: "12px 0" }} />
          <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 5, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Story coverage</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${donePct}%` }} /></div>
          <div style={{ fontSize: 11, color: "#5d6a85", marginTop: 5 }}>{donePct}% estimated</div>
        </div>
        <div className="card">
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 12 }}>About</div>
          <p style={{ fontSize: 13, color: "#8090a8", lineHeight: 1.65, marginBottom: 12 }}>{project.about}</p>
          <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 6, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Key Assumptions</div>
          <div className="chips">
            {project.assumptions.map((a, i) => <span key={i} className="chip">{a}</span>)}
          </div>
          <div style={{ fontSize: 11, color: "#4a5568", margin: "10px 0 6px", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>Risks</div>
          <div className="chips">
            {project.risks.map((r, i) => <span key={i} className="chip" style={{ borderColor: "rgba(255,87,87,.2)", color: "#ff8080" }}>{r}</span>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 14 }}>Epics at a glance</div>
        {project.epics.map(e => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #181f2d" }}>
            <Layers size={13} color="#5d6a85" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: "#c8d4e8" }}>{e.title}</span>
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
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#181f2d", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#e8c547", flexShrink: 0 }}>
              {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "#eef0f7" }}>{s.name}</span>
                <span className="tag tag-muted">{s.role}</span>
                <span className={`tag influence-${s.influence[0]}`} style={{ background: "transparent", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  ↑ {s.influence}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: s.notes ? 8 : 0 }}>
                <span className="tag tag-muted">{s.decision}</span>
              </div>
              {s.notes && <p style={{ fontSize: 12, color: "#7080a0", lineHeight: 1.5 }}>{s.notes}</p>}
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
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#eef0f7" }}>{p.role}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => openEdit(p)}><Edit2 size={13} /></button>
                  <button className="icon-btn" onClick={() => del(p.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#8090a8", lineHeight: 1.65, marginBottom: 10 }}>{p.description}</p>
              <div className="divider" style={{ margin: "8px 0" }} />
              {[["Goals", p.goals, "#3be8a8"], ["Pain Points", p.painPoints, "#ff8080"], ["Behaviors", p.behaviors, "#8090a8"]].map(([k, v, c]) => v && (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{k}</div>
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
                  : <span style={{ fontSize: 12, color: "#4a5568" }}>{suggestions.filter(s => s._accepted).length} of {suggestions.length} accepted</span>
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
              <div style={{ fontSize: 13, color: "#5d6a85" }}>Analyzing your project and suggesting relevant personas...</div>
            </div>
          )}

          {/* Error */}
          {!suggesting && suggestError && (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <AlertCircle size={28} color="#ff5757" style={{ marginBottom: 12, opacity: .6 }} />
              <div style={{ fontSize: 14, color: "#8090a8", marginBottom: 6 }}>Something went wrong</div>
              <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 20 }}>{suggestError}</div>
              <button className="btn btn-ai" onClick={suggestPersonas}><Sparkles size={13} /> Try Again</button>
            </div>
          )}

          {/* Results */}
          {!suggesting && !suggestError && suggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 16, lineHeight: 1.6 }}>
                Based on <strong style={{ color: "#8090a8" }}>{project.name}</strong>, here are the personas that likely interact with this product. Edit, then accept.
              </p>
              {suggestions.map(s => (
                <div key={s.id} className="card" style={{ borderColor: s._accepted ? "rgba(59,232,168,.3)" : "#1e2533", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    {editingSuggestion === s.id
                      ? <input value={s.role} onChange={e => setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, role: e.target.value } : p))} style={{ fontSize: 14, fontWeight: 700, flex: 1, marginRight: 8 }} />
                      : <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#eef0f7" }}>{s.role}</span>}
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
                      <p style={{ fontSize: 12, color: "#7080a0", lineHeight: 1.65, marginBottom: 10 }}>{s.description}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {[["Goals", s.goals, "#3be8a8"], ["Pain Points", s.painPoints, "#ff8080"]].map(([k, v, c]) => v && (
                          <div key={k}>
                            <span style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em" }}>{k}: </span>
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
              <div style={{ background: "#0d1018", border: "1px solid rgba(232,197,71,.2)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Generated Profile — click "Edit & Save" to adjust</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#eef0f7", marginBottom: 6 }}>{draft.role}</div>
                <div style={{ fontSize: 12, color: "#7080a0", marginBottom: 6 }}>{draft.description}</div>
                {[["Goals", draft.goals], ["Pain Points", draft.painPoints]].map(([k, v]) => v && (
                  <div key={k} style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{k}: </span>
                    <span style={{ fontSize: 11, color: "#5d6a85" }}>{v}</span>
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
      ? `${projectInfo}\n${extra ? `Additional context: ${extra}\n` : ""}Suggest 3-5 well-scoped epics. Return a JSON array, each object: { title, description }. Start your response with [.`
      : `${projectInfo}\nThis project description seems thin. Return JSON: { "question": "one short clarifying question about what they're building" }`;

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

    const teamRoles = [...new Set(project.team.map(t => t.team))].join(", ") || "FE, BE";
    const personaRoles = project.personas.map(p => p.role).join(", ") || "end user";

    const result = await askClaude([{
      role: "user", content:
        `Epic: "${epic.title}"\nDescription: ${epic.description}\nProject: ${project.name} — ${project.about}\nPlatform: ${project.platform}\nTeam available: ${teamRoles}\nPersonas: ${personaRoles}\n\nGenerate 4-7 SMART user stories for this epic. Split by team. Each story:\n{ "title": "[TEAM] EpicName | Short desc", "description": "As a \\"...\\" I want to \\"...\\" so that I can \\"...\\"", "ac": "Scenario title\\nGIVEN | ...\\nWHEN | ...\\nTHEN | ...\\nAND | ...\\n---\\nAnother scenario\\nGIVEN | ...", "team": "FE|BE|FS|Mobile|QA|Designer", "aiPts": N }\nReturn a JSON array starting with [. No markdown, no explanation outside the array.`
    }], "Return only a valid JSON array starting with [. No markdown. No text before or after the array.");

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
          <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> New Epic</button>
        </div>
      </div>

      {project.epics.length === 0 ? (
        <Empty icon={<Layers size={36} />} title="No epics yet" sub="Let AI suggest epics from your project description, or add one manually."
          action={<div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => suggestEpics()}><Sparkles size={13} /> Suggest from Project</button><button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> New Epic</button></div>} />
      ) : (
        project.epics.map(e => (
          <div key={e.id} className="card">
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8c547", flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#eef0f7", marginBottom: 4 }}>{e.title}</div>
                <p style={{ fontSize: 12, color: "#7080a0", lineHeight: 1.55, marginBottom: 10 }}>{e.description}</p>
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
              <span style={{ fontSize: 12, color: "#4a5568" }}>{suggestions.filter(s => s._accepted).length} accepted</span>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setSuggestions([]); setSuggestError(null); setClarifyQ(null); }}>Done</button>
            </div>
          }>
          {suggesting && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#5d6a85" }}>Analyzing project and generating epics...</div>
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
              <div style={{ fontSize: 13, color: "#ff8080", marginBottom: 12 }}>{suggestError}</div>
              <button className="btn btn-ai" onClick={() => suggestEpics()}><Sparkles size={13} /> Try Again</button>
            </div>
          )}
          {!suggesting && !clarifyQ && suggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 14, lineHeight: 1.6 }}>Accept the epics that fit your project. You can edit them after.</p>
              {suggestions.map(s => (
                <div key={s.id} className="card" style={{ borderColor: s._accepted ? "rgba(59,232,168,.3)" : "#1e2533" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#eef0f7" }}>{s.title}</span>
                    {s._accepted ? <span className="tag tag-green"><Check size={10} /> Added</span> : <button className="btn btn-primary btn-xs" onClick={() => acceptEpic(s)}>+ Accept</button>}
                  </div>
                  <p style={{ fontSize: 12, color: "#7080a0", lineHeight: 1.55 }}>{s.description}</p>
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
              <span style={{ fontSize: 12, color: "#4a5568" }}>{storySuggestions.filter(s => s._accepted).length} stories accepted</span>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setStorySuggestions([]); setStorySuggestEpic(null); }}>Done</button>
            </div>
          }>
          {suggestingStories && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div>
              <div style={{ fontSize: 13, color: "#5d6a85" }}>Generating SMART stories split by team...</div>
            </div>
          )}
          {!suggestingStories && storySuggestError && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 13, color: "#ff8080", marginBottom: 12 }}>{storySuggestError}</div>
              <button className="btn btn-ai" onClick={() => suggestStories(storySuggestEpic)}><Sparkles size={13} /> Try Again</button>
            </div>
          )}
          {!suggestingStories && storySuggestions.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 14, lineHeight: 1.6 }}>Review and tweak each story before accepting. Rejected ones are removed.</p>
              {storySuggestions.filter(s => !s._accepted).map(s => {
                const tag = s.team || (s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1]);
                return (
                  <div key={s.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: s._editing ? 10 : 6 }}>
                      {tag && <span className={`tag tag-${tag}`} style={{ flexShrink: 0, marginTop: 2 }}>{tag}</span>}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#eef0f7" }}>{s.title}</span>
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
                        <p style={{ fontSize: 12, color: "#7080a0", fontStyle: "italic", marginBottom: s.ac ? 8 : 0, lineHeight: 1.5 }}>{s.description}</p>
                        {s.ac && <pre style={{ fontSize: 11, color: "#5d6a85", fontFamily: "'DM Mono',monospace", whiteSpace: "pre-wrap", lineHeight: 1.7, background: "#0d1018", padding: "8px 10px", borderRadius: 6 }}>{s.ac}</pre>}
                        <div style={{ marginTop: 6 }}><span className="pts-chip pts-ai"><Sparkles size={10} /> {s.aiPts}pts</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
              {storySuggestions.filter(s => s._accepted).length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(59,232,168,.06)", border: "1px solid rgba(59,232,168,.15)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#3be8a8", marginBottom: 6, fontFamily: "'DM Mono',monospace" }}>ACCEPTED STORIES</div>
                  {storySuggestions.filter(s => s._accepted).map(s => (
                    <div key={s.id} style={{ fontSize: 12, color: "#5d6a85", display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                      <Check size={11} color="#3be8a8" />{s.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit / New form ── */}
      {modal === "form" && (
        <Modal title={form.id ? "Edit Epic" : "New Epic"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Epic</button></>}>
          <div className="field"><label>Epic Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Authentication & Access Control" autoFocus /></div>
          <div className="field"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of what this epic covers..." /></div>
        </Modal>
      )}
    </div>
  );
}

// ─── AC Renderer ─────────────────────────────────────────────────────────────
function ACBlock({ ac }) {
  if (!ac || !ac.trim()) return null;
  const KEYWORDS = ["GIVEN", "WHEN", "THEN", "AND"];
  const kwColor = { GIVEN: "#5ba4f5", WHEN: "#c57bff", THEN: "#3be8a8", AND: "#7080a0" };
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
            {subtitle && <div style={{ fontSize: 11, fontWeight: 600, color: "#c8d4e8", fontFamily: "'DM Sans',sans-serif", marginBottom: 5, paddingBottom: 4, borderBottom: "1px solid #1e2533" }}>{subtitle}</div>}
            {acLines.map((line, li) => {
              const pipeIdx = line.indexOf("|");
              if (pipeIdx === -1) return <div key={li} style={{ fontSize: 11, color: "#5d6a85", fontFamily: "'DM Mono',monospace", lineHeight: 1.8 }}>{line}</div>;
              const kw = line.slice(0, pipeIdx).trim();
              const val = line.slice(pipeIdx + 1).trim();
              return (
                <div key={li} style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "'DM Mono',monospace", lineHeight: 1.9 }}>
                  <span style={{ color: kwColor[kw] || "#e8c547", minWidth: 44, fontWeight: 600, flexShrink: 0 }}>{kw}</span>
                  <span style={{ color: "#8090a8" }}>{val}</span>
                </div>
              );
            })}
            {bi < blocks.length - 1 && <div style={{ height: 1, background: "#1e2533", margin: "8px 0" }} />}
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
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#111318", border: "1px solid #1e2533", borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#252d40"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2533"}>
              {tag && <TeamTag team={tag} />}
              <span style={{ flex: 1, fontSize: 13, color: "#c8d4e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
              <span className="tag tag-muted" style={{ fontSize: 10, flexShrink: 0 }}>{epicOf(s.epicId)}</span>
              {s.teamPts !== null
                ? <span className="pts-chip pts-team" style={{ flexShrink: 0 }}><Check size={9} /> {s.teamPts}pt</span>
                : s.aiPts !== null
                  ? <span className="pts-chip pts-ai" style={{ flexShrink: 0 }}><Sparkles size={9} /> {s.aiPts}pt</span>
                  : null}
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
          <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 12, lineHeight: 1.6 }}>Describe the story in plain language. AI will name it, structure it, and generate AC.</p>

          <div style={{ background: "#0d1018", border: "1px solid #1e2533", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 420 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", minHeight: 80 }}>
              {convo.length === 0 && (
                <div style={{ fontSize: 12, color: "#3a4255", fontStyle: "italic", padding: "8px 0" }}>
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
              <div style={{ borderTop: "1px solid #1e2533", padding: 14, background: "#0a0c10" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Story</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 4 }}>{form.title}</div>
                {form.description && <div style={{ fontSize: 12, color: "#7080a0", fontStyle: "italic", marginBottom: 8 }}>{form.description}</div>}
                <ACBlock ac={form.ac} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {form.aiPts && <span className="pts-chip pts-ai"><Sparkles size={9} /> {form.aiPts}pt</span>}
                  {form.oos && <span className="chip">OOS: {form.oos}</span>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #1e2533" }}>
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
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Story</button></>}>
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

  const stories = project.stories.filter(s => filterEpic === "all" || s.epicId === filterEpic);

  const save = () => {
    if (!form.title.trim()) return;
    if (form.id) update({ stories: project.stories.map(s => s.id === form.id ? form : s) });
    else update({ stories: [...project.stories, { ...form, id: uid() }] });
    setModal(null);
  };
  const del = id => update({ stories: project.stories.filter(s => s.id !== id) });
  const openNew = () => { setForm(blank); setAiConvo([]); setAiStep("idle"); setModal("story"); };
  const openEdit = s => { setForm(s); setAiConvo([]); setAiStep("idle"); setModal("story"); };

  const fillWithAI = async () => {
    if (!form.title.trim()) return;
    setFilling(true);
    const epic = project.epics.find(e => e.id === form.epicId);
    const result = await askClaude(
      [{ role: "user", content: `Project: ${project.name} (${project.industry}, ${project.platform}). Epic: "${epic?.title || "Unknown"}". Story title: "${form.title}".\n\nIf title is clear, return JSON: { "description": "As a ...", "ac": "GIVEN | ...\\nWHEN | ...\\nTHEN | ...\\nAND | ...", "aiPts": N, "oos": "...", "deps": "..." }. If ambiguous, return JSON: { "question": "..." }. Return only valid JSON.` }],
      `You are a senior PM. Return only valid JSON. AC must use the GIVEN|WHEN|THEN|AND format as a single string.${project.aiRules.length ? "\nRules: " + project.aiRules.join("; ") : ""}`
    );
    setFilling(false);
    const parsed = parseJSON(result);
    if (!parsed) { setAiConvo([{ role: "ai", text: "Could not parse. Fill manually or try again." }]); setAiStep("idle"); return; }
    if (parsed.question) { setAiConvo([{ role: "ai", text: parsed.question }]); setAiStep("clarifying"); }
    else { setForm(f => ({ ...f, ...parsed })); setAiStep("generated"); setAiConvo([{ role: "ai", text: "✓ Story generated — review below before saving." }]); }
  };

  const epicOf = id => project.epics.find(e => e.id === id)?.title || "—";
  const acLines = ac => (ac || "").split("\n").filter(l => l.trim());

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Stories</div><div className="sec-sub">User stories with AI-assisted generation</div></div>
        <div className="sec-actions">
          <select style={{ width: 180 }} value={filterEpic} onChange={e => setFilterEpic(e.target.value)}>
            <option value="all">All Epics</option>
            {project.epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New Story</button>
        </div>
      </div>

      {stories.length === 0 ? (
        <Empty icon={<BookOpen size={36} />} title="No stories yet" sub="Add a title and let AI fill the rest" action={<button className="btn btn-primary" onClick={openNew}><Plus size={13} /> Add Story</button>} />
      ) : (
        stories.map(s => {
          const tag = s.title.match(/\[(FE|BE|FS|Mobile|QA|Designer)\]/)?.[1];
          const lines = acLines(s.ac);
          return (
            <div key={s.id} className="card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                {tag && <TeamTag team={tag} />}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#eef0f7" }}>{s.title}</span>
                <button className="icon-btn" onClick={() => openEdit(s)}><Edit2 size={13} /></button>
                <button className="icon-btn" onClick={() => del(s.id)}><Trash2 size={13} /></button>
              </div>
              {s.description && <p style={{ fontSize: 12, color: "#7080a0", marginBottom: 8, lineHeight: 1.55, fontStyle: "italic" }}>{s.description}</p>}
              {lines.length > 0 && (
                <div style={{ background: "#0d1018", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
                  {lines.map((l, i) => {
                    const [kw, ...rest] = l.split("|");
                    return <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "'DM Mono',monospace", lineHeight: 1.8 }}>
                      <span style={{ color: "#e8c547", minWidth: 44, fontWeight: 600 }}>{kw.trim()}</span>
                      <span style={{ color: "#7080a0" }}>{rest.join("|").trim()}</span>
                    </div>;
                  })}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tag tag-muted" style={{ fontSize: 10 }}>{epicOf(s.epicId)}</span>
                {s.aiPts !== null && <span className="pts-chip pts-ai"><Sparkles size={10} /> AI: {s.aiPts}pts</span>}
                {s.teamPts !== null && <span className="pts-chip pts-team"><Check size={10} /> Team: {s.teamPts}pts</span>}
                {s.teamPts === null && <span className="pts-chip pts-empty">— Team pts</span>}
              </div>
            </div>
          );
        })
      )}

      {modal === "story" && (
        <Modal wide title={form.id ? "Edit Story" : "New Story"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Story</button></>}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="[FE] Epic | Short description" /></div>
            <div className="field"><label>Epic</label>
              <select value={form.epicId} onChange={e => setForm(f => ({ ...f, epicId: e.target.value }))}>
                {project.epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                <option value="">— No epic</option>
              </select>
            </div>
          </div>
          {aiConvo.length > 0 && <div style={{ marginBottom: 12 }}>{aiConvo.map((m, i) => <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>{m.text}</div>)}</div>}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
            <button className="btn btn-ai" onClick={fillWithAI} disabled={filling || !form.title.trim()}>{filling ? "Generating..." : <><Sparkles size={13} /> Fill with AI</>}</button>
            {aiStep === "generated" && <span style={{ fontSize: 12, color: "#3be8a8", display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Applied — review below</span>}
          </div>
          <div className="field"><label>Description (As a / I want / So that)</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder='As a "User" I want to "action" so that I can "outcome"' /></div>
          <div className="field">
            <label>Acceptance Criteria</label>
            <textarea value={form.ac} onChange={e => setForm(f => ({ ...f, ac: e.target.value }))}
              placeholder={"GIVEN | context\nWHEN | action\nTHEN | expected outcome\nAND | additional condition (optional)"}
              rows={5} style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, lineHeight: 1.8 }} />
          </div>
          <div className="divider" />
          <div className="row">
            <div className="field"><label>AI Story Points</label><input type="number" value={form.aiPts || ""} onChange={e => setForm(f => ({ ...f, aiPts: e.target.value ? Number(e.target.value) : null }))} placeholder="AI estimate" /></div>
            <div className="field"><label>Team Story Points</label><input type="number" value={form.teamPts || ""} onChange={e => setForm(f => ({ ...f, teamPts: e.target.value ? Number(e.target.value) : null }))} placeholder="Team override" /></div>
          </div>
          <div className="field"><label>Design Link</label><input value={form.design} onChange={e => setForm(f => ({ ...f, design: e.target.value }))} placeholder="Figma URL..." /></div>
          <div className="field"><label>Out of Scope</label><input value={form.oos} onChange={e => setForm(f => ({ ...f, oos: e.target.value }))} placeholder="What's explicitly excluded" /></div>
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
  const [convoStep, setConvoStep] = useState("idle"); // idle | asking | generating | preview
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

  const openAI = () => {
    setForm(blank); setConvo([]); setConvoInput(""); setConvoStep("idle"); setModal("ai");
  };

  const startConvo = async () => {
    if (!form.title.trim()) return;
    setConvoStep("asking");
    convoHistory.current = [];
    const firstMsg = { role: "user", content: `Bug title: "${form.title}". Project: ${project.name} (${project.industry}, ${project.platform}).` };
    convoHistory.current = [firstMsg];
    setConvo([{ role: "ai", text: "..." }]);
    const reply = await askClaude(convoHistory.current,
      `You are a senior QA engineer helping structure a bug report. Ask 1-2 clarifying questions if needed (steps to reproduce, environment, expected vs actual). When you have enough, generate a JSON bug report: { steps, expected, current, evidence, suggestions }. Return JSON in a code block when ready.`);
    convoHistory.current.push({ role: "assistant", content: reply });
    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setForm(f => ({ ...f, ...parsed }));
        setConvo([{ role: "ai", text: reply.replace(/```[\s\S]*?```/g, "").trim() || "Bug report generated — review below." }]);
        setConvoStep("preview");
      } catch { setConvo([{ role: "ai", text: reply }]); setConvoStep("asking"); }
    } else { setConvo([{ role: "ai", text: reply }]); setConvoStep("asking"); }
  };

  const sendConvo = async () => {
    const text = convoInput.trim();
    if (!text || convoStep === "generating") return;
    setConvoInput("");
    setConvo(prev => [...prev, { role: "user", text }, { role: "ai", text: "..." }]);
    convoHistory.current.push({ role: "user", content: text });
    setConvoStep("generating");
    const reply = await askClaude(convoHistory.current,
      `You are a QA engineer. Ask short clarifying questions or generate the bug JSON in a code block when ready. JSON keys: steps, expected, current, evidence (leave empty if unknown), suggestions.`);
    convoHistory.current.push({ role: "assistant", content: reply });
    const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setForm(f => ({ ...f, ...parsed }));
        const cleanText = reply.replace(/```[\s\S]*?```/g, "").trim();
        setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: cleanText || "Bug report ready — review below." }]);
        setConvoStep("preview");
      } catch { setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]); setConvoStep("asking"); }
    } else { setConvo(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]); setConvoStep("asking"); }
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
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#111318", border: "1px solid #1e2533", borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#252d40"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2533"}>
              <span className="tag tag-BUG" style={{ flexShrink: 0 }}>BUG</span>
              {tag && <TeamTag team={tag} />}
              <span style={{ flex: 1, fontSize: 13, color: "#c8d4e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
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
          <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 12, lineHeight: 1.6 }}>Describe the bug. AI will ask follow-up questions only if needed.</p>

          <div style={{ background: "#0d1018", border: "1px solid #1e2533", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 14px 8px", minHeight: 60 }}>
              {convo.length === 0 && <div style={{ fontSize: 12, color: "#3a4255", fontStyle: "italic" }}>e.g. "Login button does nothing on mobile Safari after entering credentials"</div>}
              {convo.map((m, i) => <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
              </div>)}
              <div ref={chatBottom} />
            </div>

            {convoStep === "preview" && (
              <div style={{ borderTop: "1px solid #1e2533", padding: 14, background: "#0a0c10" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Report</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 10 }}>{form.title}</div>
                {[["Steps", form.steps, "#7080a0"], ["Expected", form.expected, "#3be8a8"], ["Current", form.current, "#ff8080"], ["Suggestions", form.suggestions, "#c8b870"]].map(([k, v, c]) => v && (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, color: c, whiteSpace: "pre-wrap" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {convoStep !== "preview" && (
              <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: convo.length ? "1px solid #1e2533" : "none" }}>
                <textarea value={convoInput} onChange={e => setConvoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), convo.length === 0 ? startConvo() : sendConvo())}
                  placeholder={convo.length === 0 ? "Describe the bug... (Enter to send)" : "Your answer... (Enter to send)"}
                  disabled={convoStep === "generating"}
                  style={{ flex: 1, minHeight: "unset", height: 38, resize: "none", padding: "9px 12px", fontSize: 13 }} />
                <button className="btn btn-primary" onClick={convo.length === 0 ? startConvo : sendConvo}
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

  const DESIGN_SYSTEM = `You are a PM writing a design brief. The design team defines how to implement it — keep the brief high-level and non-prescriptive.
Project: ${project.name} (${project.industry}, ${project.platform})
Available epics: ${project.epics.map(e => `id:${e.id} → "${e.title}"`).join(", ")}

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
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#111318", border: "1px solid #1e2533", borderRadius: 8, marginBottom: 6, transition: "border-color .12s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#252d40"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2533"}>
            <span className="tag tag-Design" style={{ flexShrink: 0 }}>Design</span>
            <span style={{ flex: 1, fontSize: 13, color: "#c8d4e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
            <span className="tag tag-muted" style={{ fontSize: 10, flexShrink: 0 }}>{epicOf(d.epicId)}</span>
            <button className="icon-btn" onClick={() => { setForm(d); setConvo([]); setConvoStep("idle"); setModal("form"); }}><Edit2 size={13} /></button>
            <button className="icon-btn" onClick={() => del(d.id)}><Trash2 size={13} /></button>
          </div>
        ))
      )}

      {/* AI chat creation */}
      {modal === "ai" && (
        <Modal wide title="New Design Task" onClose={() => setModal(null)}
          footer={
            convoStep === "preview"
              ? <><button className="btn btn-ghost" onClick={() => setModal("form")}>Edit Fields →</button><button className="btn btn-primary" onClick={save}>Save Task</button></>
              : <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          }>
          <p style={{ fontSize: 13, color: "#5d6a85", marginBottom: 12, lineHeight: 1.6 }}>Describe what needs to be designed. The design team will define the how — keep it high-level.</p>

          <div style={{ background: "#0d1018", border: "1px solid #1e2533", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 14px 8px", minHeight: 60 }}>
              {convo.length === 0 && <div style={{ fontSize: 12, color: "#3a4255", fontStyle: "italic" }}>e.g. "Login screen design for the auth epic — desktop and mobile, needs to match our brand"</div>}
              {convo.map((m, i) => <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
                {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
              </div>)}
              <div ref={chatBottom} />
            </div>

            {convoStep === "preview" && (
              <div style={{ borderTop: "1px solid #1e2533", padding: 14, background: "#0a0c10" }}>
                <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Generated Brief</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 6 }}>{form.title}</div>
                {[["Epic", epicOf(form.epicId)], ["Description", form.desc], ["Objective", form.objective], ["Scenarios", form.scenarios], ["Deliverables", form.deliverables]].map(([k, v]) => v && (
                  <div key={k} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em" }}>{k}: </span>
                    <span style={{ fontSize: 12, color: "#7080a0" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {convoStep !== "preview" && (
              <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: convo.length ? "1px solid #1e2533" : "none" }}>
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
  const [tab, setTab] = useState("members"); // members | holidays | vacations
  const [modal, setModal] = useState(null);
  const blank = { name: "", role: "", team: "FE", country: "Costa Rica" };
  const [form, setForm] = useState(blank);
  const [vacForm, setVacForm] = useState({ memberId: "", from: "", to: "", note: "" });
  const [showVacForm, setShowVacForm] = useState(false);

  const ALL_TEAMS = ["FE", "BE", "FS", "Mobile", "QA", "Designer"];
  const vacations = project.vacations || [];

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

  const memberName = id => project.team.find(m => m.id === id)?.name || "—";
  const groups = ALL_TEAMS.map(t => ({ team: t, members: project.team.filter(m => m.team === t) })).filter(g => g.members.length);

  const crHolidays = HOLIDAYS["Costa Rica"];
  const usHolidays = HOLIDAYS["US"];

  const tabStyle = (t) => ({
    padding: "7px 14px", background: tab === t ? "#15192a" : "transparent",
    border: tab === t ? "1px solid #1e2533" : "1px solid transparent",
    borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? "#eef0f7" : "#5d6a85", fontFamily: "'DM Sans',sans-serif", transition: "all .12s"
  });

  return (
    <div>
      <div className="sec-head">
        <div><div className="sec-title">Team & Capacity</div><div className="sec-sub">Members, holidays, and vacation tracking</div></div>
        {tab === "members" && <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("form"); }}><Plus size={13} /> Add Member</button>}
        {tab === "vacations" && <button className="btn btn-primary" onClick={() => setShowVacForm(true)}><Plus size={13} /> Add Vacation</button>}
      </div>

      {/* Tabs */}
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
                  <span style={{ fontSize: 11, color: "#4a5568" }}>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                </div>
                {members.map(m => {
                  const memberVacs = vacations.filter(v => v.memberId === m.id);
                  return (
                    <div key={m.id} className="card" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#181f2d", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, color: "#e8c547", flexShrink: 0 }}>
                        {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#eef0f7" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#5d6a85", marginTop: 2 }}>{m.role} · {m.country === "Costa Rica" ? "🇨🇷" : "🇺🇸"} {m.country}</div>
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
        <div className="two-col">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🇨🇷</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#eef0f7" }}>Costa Rica 2025</span>
            </div>
            {crHolidays.map(h => (
              <div key={h.date} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", marginBottom: 6 }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#e8c547", minWidth: 80 }}>{h.date}</span>
                <span style={{ fontSize: 13, color: "#c8d4e8" }}>{h.name}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🇺🇸</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#eef0f7" }}>United States 2025</span>
            </div>
            {usHolidays.map(h => (
              <div key={h.date} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", marginBottom: 6 }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#5ba4f5", minWidth: 80 }}>{h.date}</span>
                <span style={{ fontSize: 13, color: "#c8d4e8" }}>{h.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vacations tab ── */}
      {tab === "vacations" && (
        <>
          {showVacForm && (
            <div className="card" style={{ marginBottom: 16, borderColor: "rgba(232,197,71,.2)" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#eef0f7", marginBottom: 14 }}>New Vacation</div>
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
              <div className="field"><label>Note (optional)</label><input value={vacForm.note} onChange={e => setVacForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Approved, pending confirmation..." /></div>
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
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#181f2d", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: "#e8c547", flexShrink: 0 }}>
                  {memberName(v.memberId).split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#eef0f7" }}>{memberName(v.memberId)}</div>
                  <div style={{ fontSize: 11, color: "#5d6a85", marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{v.from} → {v.to} {v.note && `· ${v.note}`}</div>
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
  const [selected, setSelected] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const unplanned = project.stories.filter(s => !selected.includes(s.id));
  const planned = project.stories.filter(s => selected.includes(s.id));
  const totalPts = planned.reduce((a, s) => a + (s.teamPts ?? s.aiPts ?? 0), 0);
  const capacity = project.velocity;
  const pct = Math.min(Math.round((totalPts / capacity) * 100), 100);

  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const suggestSprint = async () => {
    setGenerating(true);
    const storyList = project.stories.map(s => `- "${s.title}" (${s.teamPts ?? s.aiPts ?? "?"}pts)`).join("\n");
    const result = await askClaude(
      [{ role: "user", content: `Team velocity: ${project.velocity}pts/sprint. Stories:\n${storyList}\n\nSuggest which stories to include in the next sprint. Return a JSON array of story titles. Prioritize by business value and avoid overfilling. Return ONLY the JSON array.` }],
      "You are a sprint planning expert. Return only valid JSON arrays of story title strings."
    );
    setGenerating(false);
    try {
      const clean = result.replace(/```json?/g, "").replace(/```/g, "").trim();
      const titles = JSON.parse(clean);
      const ids = project.stories.filter(s => titles.some(t => s.title.includes(t) || t.includes(s.title.replace(/\[.*?\]/g, "").trim()))).map(s => s.id);
      setSelected(ids);
      setSuggestion(`AI suggested ${ids.length} stories fitting within ${project.velocity}pt velocity.`);
    } catch {
      setSuggestion("Could not parse AI response. Please select stories manually.");
    }
  };

  const finishSprint = () => {
    const sprint = { id: uid(), stories: planned.map(s => s.id), pts: totalPts, completedAt: new Date().toISOString().split("T")[0] };
    update({ sprints: [...project.sprints, sprint] });
    setSelected([]);
    setSuggestion(null);
  };

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">Sprint Planning</div>
          <div className="sec-sub">Velocity: {project.velocity}pts/sprint · {project.team.length} team members</div>
        </div>
        <div className="sec-actions">
          <button className="btn btn-ai" onClick={suggestSprint} disabled={generating}>{generating ? "Analyzing..." : <><Sparkles size={13} /> AI Suggest Sprint</>}</button>
          {selected.length > 0 && <button className="btn btn-primary" onClick={finishSprint}><Check size={13} /> Finish Sprint</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, background: "#111318", border: "1px solid #1e2533", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 }}>Sprint Load · {totalPts}/{capacity}pts</div>
          <div className="progress-bar" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct > 90 ? "#ff5757" : pct > 75 ? "#e8c547" : "#3be8a8" }} />
          </div>
        </div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color: pct > 90 ? "#ff5757" : "#eef0f7" }}>{pct}%</div>
      </div>

      {suggestion && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(232,197,71,.08)", border: "1px solid rgba(232,197,71,.2)", borderRadius: 8, fontSize: 13, color: "#e8c547" }}>{suggestion}</div>}

      <div style={{ display: "flex", gap: 14 }}>
        <div className="sprint-lane" style={{ flex: 1 }}>
          <div className="sprint-lane-title">Backlog ({unplanned.length})</div>
          {unplanned.length === 0 && <div style={{ fontSize: 12, color: "#3a4255", textAlign: "center", padding: "20px 0" }}>All stories in sprint</div>}
          {unplanned.map(s => (
            <div key={s.id} className="sprint-item" onClick={() => toggle(s.id)}>
              <div style={{ fontSize: 12, color: "#c8d4e8", marginBottom: 4 }}>{s.title}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="badge">{s.teamPts ?? s.aiPts ?? "?"}pts</span>
                <span style={{ fontSize: 10, color: "#4a5568" }}>→ click to add</span>
              </div>
            </div>
          ))}
        </div>
        <div className="sprint-lane" style={{ flex: 1 }}>
          <div className="sprint-lane-title" style={{ color: "#e8c547" }}>Sprint ({planned.length} stories)</div>
          {planned.length === 0 && <div style={{ fontSize: 12, color: "#3a4255", textAlign: "center", padding: "20px 0" }}>No stories selected</div>}
          {planned.map(s => (
            <div key={s.id} className="sprint-item" style={{ borderColor: "rgba(232,197,71,.2)" }} onClick={() => toggle(s.id)}>
              <div style={{ fontSize: 12, color: "#c8d4e8", marginBottom: 4 }}>{s.title}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="badge badge-accent">{s.teamPts ?? s.aiPts ?? "?"}pts</span>
                <span style={{ fontSize: 10, color: "#5d6a85" }}>× click to remove</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {project.sprints.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#eef0f7", marginBottom: 12 }}>Sprint History</div>
          {project.sprints.map((sp, i) => (
            <div key={sp.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px" }}>
              <span className="tag tag-green">Sprint {i + 1}</span>
              <span style={{ fontSize: 13, color: "#8090a8" }}>{sp.stories.length} stories · {sp.pts}pts</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "#4a5568", fontFamily: "'DM Mono',monospace" }}>{sp.completedAt}</span>
              <CheckCircle2 size={14} color="#3be8a8" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Colleague ─────────────────────────────────────────────────────────────
function AISection({ project, update }) {
  const [msgs, setMsgs] = useState([
    { role: "ai", text: `Hi! I'm your AI colleague for **${project.name}**. I can help you analyze meeting notes, suggest stories, identify gaps, or update project rules. What would you like to work on?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs = [...msgs, { role: "user", text }];
    setMsgs([...newMsgs, { role: "ai", text: "..." }]);
    setLoading(true);

    const projectContext = `Project: ${project.name} (${project.platform}, ${project.type}, ${project.industry}). Team: ${project.teamSize}. Velocity: ${project.velocity}pts. Epics: ${project.epics.map(e => e.title).join(", ")}. Stories: ${project.stories.length}. Bugs: ${project.bugs.length}. Current rules: ${project.aiRules.join("; ") || "none"}.`;
    const history = newMsgs.slice(-8).map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));

    const reply = await askClaude(history,
      `You are an AI PM colleague embedded in a product management tool. ${projectContext}\n\nYou help by: analyzing meeting notes, suggesting stories, identifying gaps, and adapting project rules. Be concise and structured. If the user wants to update a rule (e.g. "our stories should now include X"), acknowledge it clearly with "RULE UPDATE: ..." so it can be tracked.`
    );
    setLoading(false);
    setMsgs(prev => [...prev.slice(0, -1), { role: "ai", text: reply }]);

    if (reply.includes("RULE UPDATE:")) {
      const ruleMatch = reply.match(/RULE UPDATE:\s*(.+)/);
      if (ruleMatch) update({ aiRules: [...project.aiRules, ruleMatch[1].trim()] });
    }
  };

  const quickPrompts = [
    "What are the biggest risks in this project?",
    "Identify gaps in our epic coverage",
    "Suggest 3 stories for the next sprint",
    "How healthy is our current backlog?",
  ];

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-title">AI Colleague</div>
          <div className="sec-sub">Conversational PM assistant · adapts to your project rules</div>
        </div>
        {project.aiRules.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#e8c547" }}>
            <Shield size={12} /> {project.aiRules.length} active rule{project.aiRules.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {project.aiRules.length > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(232,197,71,.06)", border: "1px solid rgba(232,197,71,.15)", borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: "#e8c547", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Active Project Rules</div>
          {project.aiRules.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#c8b870", marginBottom: 2 }}>• {r}</div>)}
        </div>
      )}

      <div style={{ background: "#111318", border: "1px solid #1e2533", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: 480 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
          {msgs.map((m, i) => (
            <div key={i} className={`ai-bubble ai-bubble-${m.role === "ai" ? "bot" : "user"}`}>
              {m.text === "..." ? <div className="ai-typing"><div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" /></div> : m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {msgs.length <= 2 && (
          <div style={{ padding: "8px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quickPrompts.map(p => (
              <button key={p} className="btn btn-ghost btn-sm" onClick={() => { setInput(p); }}>{p}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, padding: "12px", borderTop: "1px solid #1e2533" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask anything about your project... (Enter to send)" style={{ minHeight: "unset", height: 40, padding: "10px 12px", resize: "none", flex: 1 }} />
          <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()} style={{ padding: "8px 14px" }}><Send size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreate }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    idea: "", platform: "", type: "", industry: "",
    teamSize: "", constraints: "", definition: "",
  });
  const [projectName, setProjectName] = useState("");
  const [generating, setGenerating] = useState(false);

  const questions = [
    {
      label: "The Idea",
      key: "idea",
      q: "What are you building and why?",
      sub: "Describe the product, the problem it solves, and who it's for. Be as detailed or as rough as you want — this is the foundation of everything.",
      placeholder: "e.g. An internal tool for our finance team to replace manual Excel-based reporting. Right now they spend 3 days per month consolidating data from 4 systems. We want to centralize that into a single dashboard with automated report generation and approval workflows...",
      multiline: true,
    },
    {
      label: "Platform",
      key: "platform",
      q: "Where will it live?",
      sub: "Choose the primary platform for this product.",
      options: ["Web", "Mobile", "Both"],
    },
    {
      label: "Project Type",
      key: "type",
      q: "Are you starting from scratch or improving something existing?",
      sub: null,
      options: ["Greenfield — building from zero", "Existing — improving or extending a product"],
    },
    {
      label: "Industry & Domain",
      key: "industry",
      q: "What industry or domain?",
      sub: "Helps scope assumptions, compliance needs, and terminology.",
      placeholder: "e.g. FinTech, Healthcare, Internal Operations, E-commerce, EdTech...",
    },
    {
      label: "Team",
      key: "teamSize",
      q: "Who's on the team?",
      sub: "Rough composition is enough — helps with capacity planning.",
      placeholder: "e.g. 8 people: 3 FE, 2 BE, 1 FS, 1 Mobile, 1 PM",
    },
    {
      label: "Constraints",
      key: "constraints",
      q: "Any known constraints or hard requirements?",
      sub: "Timelines, tech stack limits, integrations, compliance, budget, etc.",
      placeholder: "e.g. Must launch by Q3, must integrate with SAP, HIPAA compliance required, no new cloud providers...",
    },
    {
      label: "Definition Level",
      key: "definition",
      q: "How well-defined is the scope right now?",
      sub: "This determines how much structure the AI will help you fill in.",
      options: [
        "Clear — requirements are documented and aligned",
        "Exploratory — still discovering what to build",
        "Mixed — some areas clear, others open",
      ],
    },
  ];

  const cur = questions[step];
  const val = answers[cur.key];
  const isLast = step === questions.length - 1;

  const next = () => {
    if (!val.trim()) return;
    if (!isLast) setStep(s => s + 1);
    else generate();
  };
  const prev = () => setStep(s => s - 1);

  const generate = async () => {
    setGenerating(true);
    const prompt = `You are a senior PM creating a structured project overview.

Product idea: "${answers.idea}"
Platform: ${answers.platform}
Type: ${answers.type}
Industry: ${answers.industry}
Team: ${answers.teamSize}
Constraints: ${answers.constraints}
Definition level: ${answers.definition}
Project name provided: "${projectName}"

Return ONLY a valid JSON object (no markdown, no fences) with these keys:
{
  "name": "short project name (use provided name if given, otherwise derive from idea)",
  "about": "2-3 sentence summary of what this is and why it matters",
  "assumptions": ["3-5 key assumptions as short strings"],
  "risks": ["3-5 key risks as short strings"],
  "velocity": <estimated sprint velocity as integer based on team size>,
  "suggestedEpics": [{"title": "...", "description": "..."}]
}`;

    const result = await askClaude([{ role: "user", content: prompt }],
      "Return only valid JSON. No markdown fences. No explanation.");
    setGenerating(false);
    try {
      const clean = result.replace(/```json?/g, "").replace(/```/g, "").trim();
      const data = JSON.parse(clean);
      const epics = (data.suggestedEpics || []).map(e => ({ ...e, id: uid(), stories: 0 }));
      onCreate({
        id: uid(),
        name: data.name || projectName || "New Project",
        about: data.about || answers.idea,
        platform: answers.platform.split(" ")[0],
        type: answers.type.split(" ")[0],
        industry: answers.industry,
        teamSize: parseInt(answers.teamSize) || 5,
        velocity: data.velocity || 30,
        assumptions: data.assumptions || [],
        risks: data.risks || [],
        stakeholders: [], personas: [],
        epics, stories: [], bugs: [], design: [], team: [], sprints: [], vacations: [], aiRules: [],
      });
    } catch {
      onCreate({
        id: uid(), name: projectName || "New Project",
        about: answers.idea,
        platform: answers.platform.split(" ")[0], type: answers.type.split(" ")[0],
        industry: answers.industry, teamSize: parseInt(answers.teamSize) || 5, velocity: 30,
        assumptions: [], risks: [],
        stakeholders: [], personas: [], epics: [], stories: [], bugs: [], design: [], team: [], sprints: [], vacations: [], aiRules: [],
      });
    }
  };

  return (
    <Modal title="New Project" onClose={!generating ? onClose : undefined}
      footer={
        generating ? null :
        <>
          <button className="btn btn-ghost" onClick={step === 0 ? onClose : prev}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <button className="btn btn-primary" onClick={next} disabled={!val.trim() || generating}>
            {isLast
              ? <><Sparkles size={13} /> Create Project</>
              : "Next →"}
          </button>
        </>
      }>

      {/* ── Loading overlay ── */}
      {generating && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: "rgba(232,197,71,.1)", border: "1px solid rgba(232,197,71,.25)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Sparkles size={22} color="#e8c547" />
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: "#eef0f7", marginBottom: 8 }}>Building your project...</div>
            <div style={{ fontSize: 13, color: "#5d6a85", lineHeight: 1.65, maxWidth: 340, margin: "0 auto" }}>
              Generating overview, assumptions, risks, and initial epics based on what you described.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 28 }}>
            <div className="ai-dot" style={{ width: 8, height: 8 }} />
            <div className="ai-dot" style={{ width: 8, height: 8, animationDelay: ".2s" }} />
            <div className="ai-dot" style={{ width: 8, height: 8, animationDelay: ".4s" }} />
          </div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 6, maxWidth: 300, margin: "28px auto 0" }}>
            {[
              ["✓", "Idea captured"],
              ["✓", `Platform: ${answers.platform}`],
              ["✓", `Industry: ${answers.industry}`],
              ["~", "Generating structure..."],
            ].map(([icon, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: icon === "~" ? "#e8c547" : "#3be8a8" }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{icon}</span>
                <span style={{ color: icon === "~" ? "#e8c547" : "#4a5568" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step content ── */}
      {!generating && (<>
      {/* Progress dots */}
      <div className="step-dots">
        {questions.map((_, i) => <div key={i} className={`step-dot${i <= step ? " on" : ""}`} />)}
      </div>

      {/* Step label */}
      <div style={{ fontSize: 10, color: "#4a5568", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
        Step {step + 1} of {questions.length} · {cur.label}
      </div>

      {/* Question */}
      <p style={{ fontSize: 15, color: "#eef0f7", fontWeight: 600, marginBottom: cur.sub ? 6 : 14, fontFamily: "'Syne',sans-serif", letterSpacing: "-.01em" }}>
        {cur.q}
      </p>
      {cur.sub && (
        <p style={{ fontSize: 12, color: "#5d6a85", marginBottom: 16, lineHeight: 1.6 }}>{cur.sub}</p>
      )}

      {/* Input */}
      {cur.options ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cur.options.map(o => {
            const sel = val === o;
            return (
              <button key={o} onClick={() => setAnswers(a => ({ ...a, [cur.key]: o }))}
                style={{ textAlign: "left", padding: "12px 14px", background: sel ? "rgba(232,197,71,.08)" : "#0d1018", border: `1px solid ${sel ? "rgba(232,197,71,.4)" : "#1e2533"}`, borderRadius: 8, cursor: "pointer", fontSize: 13, color: sel ? "#e8c547" : "#8090a8", fontFamily: "'DM Sans',sans-serif", transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {o} {sel && <Check size={13} />}
              </button>
            );
          })}
        </div>
      ) : cur.multiline ? (
        <textarea value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))}
          placeholder={cur.placeholder} rows={6} autoFocus
          style={{ fontSize: 13, lineHeight: 1.65 }} />
      ) : (
        <input value={val} onChange={e => setAnswers(a => ({ ...a, [cur.key]: e.target.value }))}
          placeholder={cur.placeholder} onKeyDown={e => e.key === "Enter" && next()} autoFocus />
      )}

      {/* Project name on last step */}
      {isLast && (
        <div className="field" style={{ marginTop: 16 }}>
          <label>Project Name <span style={{ color: "#3a4255", fontWeight: 400 }}>(optional — AI will suggest one)</span></label>
          <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Nexus Platform, Atlas..." />
        </div>
      )}

      {/* Summary of previous answers */}
      {step > 0 && (
        <div style={{ marginTop: 20, padding: "10px 14px", background: "#0d1018", borderRadius: 8, border: "1px solid #181f2d" }}>
          {questions.slice(0, step).map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 3, alignItems: "flex-start" }}>
              <span style={{ color: "#3be8a8", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>✓</span>
              <span style={{ color: "#3a4255", flexShrink: 0 }}>{q.label}:</span>
              <span style={{ color: "#5d6a85", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: i === 0 ? "normal" : "nowrap", lineHeight: 1.4, maxHeight: i === 0 ? 36 : "none", WebkitLineClamp: i === 0 ? 2 : 1, display: i === 0 ? "-webkit-box" : "block", WebkitBoxOrient: "vertical" }}>
                {answers[q.key]}
              </span>
            </div>
          ))}
        </div>
      )}
      </>)}
    </Modal>
  );
}
