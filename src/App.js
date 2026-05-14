import React, { useState, useRef, useEffect } from "react";

// Meshy API key is securely stored on the backend server
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY || "";

const CAD_SOFTWARES = [
  "AutoCAD", "SolidWorks", "Fusion 360", "CATIA",
  "Revit", "Rhino 3D", "SketchUp", "FreeCAD", "Inventor", "Blender (CAD)", "Shapr3D",
];

const SKILL_LEVELS = [
  { id: "beginner", label: "Beginner", description: "New to CAD", icon: "○" },
  { id: "medium",   label: "Medium",   description: "Some experience", icon: "◑" },
  { id: "pro",      label: "Pro",      description: "Confident user", icon: "●" },
  { id: "engineer", label: "Engineer", description: "Professional / technical", icon: "◈" },
];

const EXAMPLE_PROMPTS = [
  "How do I extrude a 2D sketch into a 3D solid?",
  "How do I create a parametric bolt with threads?",
  "How do I apply a fillet to selected edges?",
  "How do I create an assembly and mate two parts?",
  "How do I generate engineering drawings from a 3D model?",
];

const buildSystemPrompt = (skillLevel) => {
  const toneMap = {
    beginner: `The user is a BEGINNER. Use very simple plain English, avoid jargon, explain every step in detail, be encouraging and friendly.`,
    medium: `The user has MEDIUM experience. Use standard CAD terminology, skip very basic steps, provide efficient steps with helpful context, mention common mistakes.`,
    pro: `The user is a PRO. Use full technical terminology, be concise, skip obvious steps, include keyboard shortcuts and power-user tips.`,
    engineer: `The user is an ENGINEER. Use precise engineering/CAD terminology, include tolerances, standards (ISO, ANSI), design intent. Assume software mastery.`,
  };
  return `You are an expert CAD instructor. ${toneMap[skillLevel]}
Respond with a JSON object:
{
  "steps": [{"number":1,"instruction":"...using **bold** for UI elements","diagram":"one sentence blueprint diagram description"}],
  "proTip": "tip or null"
}
Rules: 4-8 steps, **bold** UI elements. Return ONLY valid JSON. No markdown code fences, no explanation, no text before or after the JSON object.`;
};

const IMAGE_ANALYSIS_SYSTEM = `You are an expert CAD engineer and reverse engineering specialist. Analyse the uploaded image thoroughly and return a complete engineering package as JSON:
{
  "objectName": "what the object is",
  "summary": "2-3 sentence geometry description",
  "estimatedDimensions": [{"feature":"Overall length","estimate":"~200mm"}],
  "geometryBreakdown": ["key geometric features visible"],
  "material": "most likely material",
  "steps": [{"number":1,"instruction":"using **bold** for UI elements","diagram":"blueprint diagram description"}],
  "partslist": [{"partNumber":"P001","name":"part name","description":"what it is","quantity":1,"material":"material","estimatedCost":"£0.50–£2.00","notes":"any notes"}],
  "manufacturingNotes": {
    "recommendedProcess": "e.g. FDM 3D Printing / CNC Machining / Injection Moulding",
    "alternativeProcesses": ["alternative 1","alternative 2"],
    "wallThickness": "recommended min wall thickness",
    "tolerances": "recommended tolerances",
    "surfaceFinish": "recommended surface finish",
    "warnings": ["any design for manufacturing warnings"],
    "estimatedMachineTime": "rough estimate",
    "difficulty": "Easy / Medium / Hard / Expert"
  },
  "openscad": "complete working OpenSCAD script with comments",
  "proTip": "useful modelling tip or null"
}
Rules: 5-8 steps, specific geometry, complete OpenSCAD, realistic cost estimates in GBP. Return ONLY valid JSON. No markdown code fences, no explanation, no text before or after the JSON object.`;

const BLUEPRINT_SYSTEM = `You are a professional engineering draughtsman. Create a detailed technical engineering drawing as SVG.
Include: title block (part name, date, scale, drawn by "CAD Copilot AI", material), orthographic views (front, side, top), dimension lines with arrows, centre lines (dashed), border frame, grid reference letters.
Style: white background, #111111 lines (2px outlines, 1px details), #333333 dimension lines with arrows, #666666 dashed centre lines, clean sans-serif text.
viewBox="0 0 800 600". Make it look like a real ISO engineering drawing.
Return ONLY raw SVG starting with <svg. No explanation, no markdown.`;

const DIAGRAM_SYSTEM = `Create blueprint-style SVG diagrams for CAD steps.
Style: background #0a1628, lines #4a9eff, text #a8d4ff, white accents, grid rgba(74,158,255,0.15).
Include dimension arrows, axis indicators, construction lines, measurement labels.
viewBox="0 0 500 300". Return ONLY raw SVG starting with <svg.`;

const STORAGE_KEY = "cadcopilot-history-v2";

export default function CADAssistant() {
  const [activeTab, setActiveTab] = useState("ask");
  const [selectedSoftware, setSelectedSoftware] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState([]);
  const [proTip, setProTip] = useState(null);
  const [diagrams, setDiagrams] = useState({});
  const [loading, setLoading] = useState(false);
  const [diagramsLoading, setDiagramsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasResult, setHasResult] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [showDiagrams, setShowDiagrams] = useState(true);

  // Image tab
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageSoftware, setImageSoftware] = useState("");
  const [imageSkill, setImageSkill] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageResult, setImageResult] = useState(null);
  const [imageError, setImageError] = useState("");
  const [imageDiagrams, setImageDiagrams] = useState({});
  const [imageDiagramsLoading, setImageDiagramsLoading] = useState(false);
  const [showImageDiagrams, setShowImageDiagrams] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState("guide");
  const [engineeringBlueprint, setEngineeringBlueprint] = useState(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);

  // Meshy STL generation
  const [meshyLoading, setMeshyLoading] = useState(false);
  const [meshyProgress, setMeshyProgress] = useState(0);
  const [meshyStatus, setMeshyStatus] = useState("");
  const [meshyUrls, setMeshyUrls] = useState(null);
  const [meshyError, setMeshyError] = useState("");
  // meshyTaskId removed - not needed in UI

  const responseRef = useRef(null);
  const imageResultRef = useRef(null);
  const fileInputRef = useRef(null);
  const meshyPollRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try { const r = await window.storage.get(STORAGE_KEY); if (r?.value) setHistory(JSON.parse(r.value)); } catch (_) {}
      setStorageReady(true);
    };
    load();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const save = async () => { try { await window.storage.set(STORAGE_KEY, JSON.stringify(history)); } catch (_) {} };
    save();
  }, [history, storageReady]);

  useEffect(() => { if (hasResult && responseRef.current) responseRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [hasResult]);
  useEffect(() => { if (imageResult && imageResultRef.current) imageResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [imageResult]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (meshyPollRef.current) clearInterval(meshyPollRef.current); }, []);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// toDataURI removed - using toBase64 instead

  const callClaude = async (system, messages, maxTokens = 1500) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "x-api-key": ANTHROPIC_KEY,
        },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Claude error: ${res.status}`);
    return (data.content || []).map(b => b.text || "").join("").trim();
  };

  const generateDiagram = async (description) => {
    try {
      const svg = await callClaude(DIAGRAM_SYSTEM, [{ role: "user", content: `Blueprint SVG for: "${description}"` }], 2048);
      return svg.startsWith("<svg") ? svg : null;
    } catch (_) { return null; }
  };

  const generateEngineeringBlueprint = async (result) => {
    try {
      const svg = await callClaude(BLUEPRINT_SYSTEM, [{ role: "user", content: `Engineering drawing for: "${result.objectName}". ${result.summary}. Dimensions: ${result.estimatedDimensions?.map(d => `${d.feature}: ${d.estimate}`).join(", ")}. Material: ${result.material}.` }], 4000);
      return svg.startsWith("<svg") ? svg : null;
    } catch (_) { return null; }
  };

  // ── Meshy Image to 3D ──
  const BACKEND_URL = "https://cad-copilot-backend-production.up.railway.app";

  const generateMeshy3D = async () => {
    if (!imageFile) return;
    setMeshyLoading(true);
    setMeshyProgress(0);
    setMeshyStatus("Uploading image to Meshy...");
    setMeshyUrls(null);
    setMeshyError("");
    

    try {
      // Convert image to base64
      const base64 = await toBase64(imageFile);

      // Step 1: Create task via our backend (avoids CORS)
      const createRes = await fetch(`${BACKEND_URL}/generate-3d`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: imageFile.type,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData?.error || `Backend error: ${createRes.status}`);

      const taskId = createData.taskId;
      // taskId stored in closure
      setMeshyStatus("Processing... this takes 1–3 minutes");
      setMeshyProgress(5);

      // Step 2: Poll via our backend
      await new Promise((resolve, reject) => {
        meshyPollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${BACKEND_URL}/task-status/${taskId}`);
            const pollData = await pollRes.json();

            if (pollData.status === "SUCCEEDED") {
              clearInterval(meshyPollRef.current);
              setMeshyProgress(100);
              setMeshyStatus("Complete!");
              setMeshyUrls(pollData.modelUrls);
              resolve();
            } else if (pollData.status === "FAILED" || pollData.status === "EXPIRED") {
              clearInterval(meshyPollRef.current);
              reject(new Error(pollData.error || "Meshy task failed."));
            } else {
              const progress = pollData.progress || 0;
              setMeshyProgress(Math.max(5, progress));
              setMeshyStatus(`Generating 3D model... ${progress}%`);
            }
          } catch (err) {
            clearInterval(meshyPollRef.current);
            reject(err);
          }
        }, 3000);
      });

    } catch (err) {
      setMeshyError("Error: " + err.message);
    } finally {
      setMeshyLoading(false);
    }
  };

  const downloadFromUrl = async (url, filename) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    } catch (_) {
      window.open(url, "_blank");
    }
  };

  const handleSubmit = async () => {
    if (!selectedSoftware) { setError("Please select a CAD software."); return; }
    if (!selectedSkill) { setError("Please select your skill level."); return; }
    if (!question.trim()) { setError("Please enter your question."); return; }
    setError(""); setLoading(true); setSteps([]); setProTip(null); setDiagrams({}); setHasResult(false);
    try {
      const raw = await callClaude(buildSystemPrompt(selectedSkill), [{ role: "user", content: `CAD Software: ${selectedSoftware}\nSkill Level: ${selectedSkill}\n\nQuestion: ${question}` }]);
      let parsed;
      try {
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch (e) {
        console.error("Ask parse error:", raw);
        throw new Error("Could not parse response. Please try again.");
      }
      const parsedSteps = parsed.steps || [];
      setSteps(parsedSteps); setProTip(parsed.proTip || null); setHasResult(true); setLoading(false);
      const entry = { id: Date.now(), software: selectedSoftware, skill: selectedSkill, question: question.trim(), steps: parsedSteps, proTip: parsed.proTip || null, date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) };
      setHistory(prev => [entry, ...prev].slice(0, 50));
      if (showDiagrams) {
        setDiagramsLoading(true);
        const results = await Promise.all(parsedSteps.map(s => generateDiagram(s.diagram)));
        const map = {}; results.forEach((svg, i) => { if (svg) map[parsedSteps[i].number] = svg; });
        setDiagrams(map); setDiagramsLoading(false);
      }
    } catch (err) { setError("Error: " + err.message); setLoading(false); }
  };

  const handleImageUpload = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
    setImageResult(null); setImageDiagrams({}); setImageError(""); setEngineeringBlueprint(null);
    setMeshyUrls(null); setMeshyError(""); setMeshyProgress(0); setMeshyStatus(""); setMeshyLoading(false);
  };

  const handleImageAnalyse = async () => {
    if (!imageFile) { setImageError("Please upload an image first."); return; }
    if (!imageSoftware) { setImageError("Please select a CAD software."); return; }
    if (!imageSkill) { setImageError("Please select your skill level."); return; }
    setImageError(""); setImageLoading(true); setImageResult(null); setImageDiagrams({}); setEngineeringBlueprint(null); setActiveResultTab("guide");
    try {
      const base64 = await toBase64(imageFile);
      const raw = await callClaude(IMAGE_ANALYSIS_SYSTEM, [{
        role: "user", content: [
          { type: "image", source: { type: "base64", media_type: imageFile.type, data: base64 } },
          { type: "text", text: `Analyse this image and return ONLY a JSON object. Target CAD software: ${imageSoftware}. User skill level: ${imageSkill}.` },
        ],
      }], 6000);
      let parsed;
      try {
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Image parse error. Raw:", raw.substring(0, 500));
        setImageError("Parse error — raw response: " + raw.substring(0, 300));
        setImageLoading(false);
        return;
      }
      setImageResult(parsed); setImageLoading(false);
      await Promise.all([
        (async () => { setBlueprintLoading(true); const svg = await generateEngineeringBlueprint(parsed); setEngineeringBlueprint(svg); setBlueprintLoading(false); })(),
        (async () => {
          if (showImageDiagrams && parsed.steps) {
            setImageDiagramsLoading(true);
            const results = await Promise.all(parsed.steps.map(s => generateDiagram(s.diagram)));
            const map = {}; results.forEach((svg, i) => { if (svg) map[parsed.steps[i].number] = svg; });
            setImageDiagrams(map); setImageDiagramsLoading(false);
          }
        })(),
      ]);
    } catch (err) { setImageError("Error: " + err.message); setImageLoading(false); }
  };

  const downloadOpenSCAD = (code, name) => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${(name || "model").replace(/\s+/g, "_").toLowerCase()}.scad`; a.click(); URL.revokeObjectURL(url);
  };

  const downloadSVG = (svg, name) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${(name || "blueprint").replace(/\s+/g, "_").toLowerCase()}_blueprint.svg`; a.click(); URL.revokeObjectURL(url);
  };

  const boldify = (str) => (str || "").split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={j} style={{ color: "#111", fontWeight: 700 }}>{p.slice(2, -2)}</strong> : p
  );

  const BlueprintDiagram = ({ svg }) => (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1e3a5f", marginBottom: "0.5rem" }}>
      <div style={{ background: "#0a1628", padding: "0.4rem 0.75rem", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.3rem" }}>{["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />)}</div>
        <span style={{ fontSize: "0.6rem", color: "#4a7aa8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>Blueprint Reference</span>
      </div>
      <div style={{ background: "#0a1628", padding: "0.75rem" }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );

  const DiagramPlaceholder = () => (
    <div style={{ background: "#f8f8f8", border: "1px dashed #ddd", borderRadius: 10, padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
      <span style={{ width: 10, height: 10, border: "2px solid #e0e0e0", borderTopColor: "#999", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
      <span style={{ fontSize: "0.72rem", color: "#bbb", fontStyle: "italic" }}>Generating blueprint diagram...</span>
    </div>
  );

  const StepsView = ({ stepsData, diagramsData, diagramsLoadingState, showDiagramsFlag }) => (
    <div>
      {stepsData.map((step) => (
        <div key={step.number}>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "flex-start" }}>
            <span style={{ minWidth: "1.6rem", height: "1.6rem", border: "1.5px solid #222", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#111", flexShrink: 0, marginTop: "0.1rem" }}>{step.number}</span>
            <span style={{ color: "#333", lineHeight: 1.75, fontSize: "0.9rem" }}>{boldify(step.instruction)}</span>
          </div>
          {showDiagramsFlag && (
            <div style={{ marginLeft: "2.6rem", marginBottom: "1.5rem" }}>
              {diagramsData[step.number] ? <BlueprintDiagram svg={diagramsData[step.number]} /> : diagramsLoadingState ? <DiagramPlaceholder /> : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const deleteEntry = (id, e) => { e.stopPropagation(); setHistory(prev => prev.filter(h => h.id !== id)); if (expandedId === id) setExpandedId(null); };
  const skillMap = Object.fromEntries(SKILL_LEVELS.map(s => [s.id, s]));
  const skillLevel = SKILL_LEVELS.find(s => s.id === selectedSkill);

  const SoftwarePills = ({ value, onChange }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {CAD_SOFTWARES.map(sw => (
        <button key={sw} onClick={() => onChange(sw)} style={{ padding: "0.45rem 1rem", borderRadius: 100, cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem", transition: "all 0.15s", border: value === sw ? "1.5px solid #111" : "1.5px solid #ddd", background: value === sw ? "#111" : "#fff", color: value === sw ? "#fff" : "#555", fontWeight: value === sw ? 600 : 400 }}>{sw}</button>
      ))}
    </div>
  );

  const SkillCards = ({ value, onChange }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
      {SKILL_LEVELS.map(skill => (
        <button key={skill.id} onClick={() => onChange(skill.id)} style={{ padding: "1rem 0.75rem", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all 0.18s", border: value === skill.id ? "1.5px solid #111" : "1.5px solid #e0e0e0", background: value === skill.id ? "#111" : "#fff", color: value === skill.id ? "#fff" : "#555" }}>
          <div style={{ fontSize: "1.2rem", marginBottom: "0.4rem", opacity: value === skill.id ? 1 : 0.5 }}>{skill.icon}</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.2rem" }}>{skill.label}</div>
          <div style={{ fontSize: "0.65rem", opacity: 0.6 }}>{skill.description}</div>
        </button>
      ))}
    </div>
  );

  const TABS = [{ id: "ask", label: "Ask" }, { id: "image", label: "Image → CAD" }, { id: "history", label: `History${history.length > 0 ? ` (${history.length})` : ""}` }];
  const RESULT_TABS = [{ id: "guide", label: "📋 CAD Guide" }, { id: "stl", label: "🧊 3D Model / STL" }, { id: "blueprint", label: "📐 Engineering Drawing" }, { id: "bom", label: "🔩 Parts List" }, { id: "manufacturing", label: "🏭 Manufacturing" }, { id: "openscad", label: "💾 OpenSCAD" }];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f3", fontFamily: "'DM Sans', sans-serif", color: "#111" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        * { box-sizing:border-box; margin:0; padding:0; }
        textarea::placeholder { color:#aaa; } textarea:focus { outline:none; } button:focus { outline:none; }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:#f5f5f3; } ::-webkit-scrollbar-thumb { background:#ccc; border-radius:2px; }
      `}</style>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: 28, height: 28, background: "#111", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" stroke="white" strokeWidth="1.5"/><rect x="8" y="1" width="5" height="5" stroke="white" strokeWidth="1.5"/><rect x="1" y="8" width="5" height="5" stroke="white" strokeWidth="1.5"/><rect x="8" y="8" width="5" height="5" fill="white"/></svg>
          </div>
          <span style={{ fontSize: "0.95rem", fontWeight: 700, letterSpacing: "-0.01em" }}>CAD Copilot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "#f5f5f3", borderRadius: 10, padding: "0.25rem" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "0.4rem 1rem", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: activeTab === tab.id ? 600 : 400, background: activeTab === tab.id ? "#fff" : "transparent", color: activeTab === tab.id ? "#111" : "#888", boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>{tab.label}</button>
          ))}
        </div>
        <span style={{ fontSize: "0.62rem", color: "#999", letterSpacing: "0.1em", textTransform: "uppercase", border: "1px solid #e0e0e0", padding: "0.22rem 0.6rem", borderRadius: 20 }}>Beta</span>
      </header>

      {/* ── ASK TAB ── */}
      {activeTab === "ask" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem 6rem", animation: "fadeIn 0.3s ease both" }}>
          <div style={{ marginBottom: "3.5rem" }}>
            <p style={{ fontSize: "0.68rem", letterSpacing: "0.18em", color: "#999", textTransform: "uppercase", marginBottom: "1rem" }}>AI-Powered Design Guidance</p>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.25rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#111", marginBottom: "1rem" }}>Your CAD<br />question, answered.</h1>
            <p style={{ fontSize: "1rem", color: "#777", lineHeight: 1.6, maxWidth: 460 }}>Select your software and skill level, then ask anything — get step-by-step instructions with blueprint diagrams.</p>
          </div>
          <div style={{ marginBottom: "2.25rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Software</label>
            <SoftwarePills value={selectedSoftware} onChange={setSelectedSoftware} />
          </div>
          <div style={{ marginBottom: "2.25rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Skill Level</label>
            <SkillCards value={selectedSkill} onChange={setSelectedSkill} />
            {selectedSkill && (
              <div style={{ marginTop: "0.75rem", padding: "0.65rem 1rem", background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, fontSize: "0.78rem", color: "#555", lineHeight: 1.5 }}>
                {selectedSkill === "beginner" && "✦ Plain English, every step explained, no jargon — perfect for day one."}
                {selectedSkill === "medium" && "✦ Assumes basic familiarity, skips obvious steps, flags common pitfalls."}
                {selectedSkill === "pro" && "✦ Concise, full CAD terminology, shortcuts — no hand-holding."}
                {selectedSkill === "engineer" && "✦ Technically dense, references standards and design intent, assumes mastery."}
              </div>
            )}
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Question</label>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. How do I create a threaded bolt and nut assembly?" rows={4}
              style={{ width: "100%", background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.1rem", color: "#111", fontFamily: "inherit", fontSize: "0.9rem", lineHeight: 1.65, resize: "vertical", transition: "border-color 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#111"} onBlur={e => e.target.style.borderColor = "#e0e0e0"} />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ fontSize: "0.65rem", color: "#bbb", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Try an example</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {EXAMPLE_PROMPTS.map(ex => (
                <button key={ex} onClick={() => setQuestion(ex)} style={{ padding: "0.3rem 0.75rem", border: "1px solid #e8e8e8", borderRadius: 6, background: "transparent", color: "#888", fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.target.style.borderColor = "#bbb"; e.target.style.color = "#333"; }} onMouseLeave={e => { e.target.style.borderColor = "#e8e8e8"; e.target.style.color = "#888"; }}>{ex}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: "2rem" }}>
            <button onClick={() => setShowDiagrams(!showDiagrams)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 1rem", border: "1.5px solid #e0e0e0", borderRadius: 8, background: showDiagrams ? "#111" : "#fff", color: showDiagrams ? "#fff" : "#555", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s" }}>
              <span>📐</span>{showDiagrams ? "Blueprint diagrams ON" : "Blueprint diagrams OFF"}
            </button>
          </div>
          {error && <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#c00", fontSize: "0.82rem" }}>{error}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "1rem", borderRadius: 12, border: "none", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", background: loading ? "#e8e8e8" : "#111", color: loading ? "#999" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", transition: "background 0.2s" }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#333"; }} onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#111"; }}>
            {loading ? <><span style={{ width: 14, height: 14, border: "2px solid #ccc", borderTopColor: "#666", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Generating guide...</> : "Generate step-by-step guide →"}
          </button>
          {(loading || hasResult) && (
            <div ref={responseRef} style={{ marginTop: "2.5rem", background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.4s ease both" }}>
              <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: loading ? "#ccc" : "#111" }} />
                  <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>{selectedSoftware} — {skillLevel?.label} Guide</span>
                </div>
                {diagramsLoading && <span style={{ fontSize: "0.65rem", color: "#aaa", display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ width: 9, height: 9, border: "1.5px solid #ddd", borderTopColor: "#999", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Generating diagrams...</span>}
              </div>
              <div style={{ padding: "1.75rem 1.5rem" }}>
                {loading && steps.length === 0 && <div style={{ color: "#bbb", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.6rem" }}><span style={{ width: 12, height: 12, border: "2px solid #e0e0e0", borderTopColor: "#999", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Generating your guide...</div>}
                {steps.length > 0 && <><StepsView stepsData={steps} diagramsData={diagrams} diagramsLoadingState={diagramsLoading} showDiagramsFlag={showDiagrams} />{proTip && <div style={{ borderLeft: "3px solid #222", paddingLeft: "1rem", marginTop: "1.5rem" }}><span style={{ color: "#444", fontSize: "0.85rem", lineHeight: 1.7 }}>💡 {proTip}</span></div>}</>}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ── IMAGE TO CAD TAB ── */}
      {activeTab === "image" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem 6rem", animation: "fadeIn 0.3s ease both" }}>
          <div style={{ marginBottom: "3rem" }}>
            <p style={{ fontSize: "0.68rem", letterSpacing: "0.18em", color: "#999", textTransform: "uppercase", marginBottom: "1rem" }}>Full Engineering Pipeline</p>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.25rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#111", marginBottom: "1rem" }}>Image<br />→ CAD Package</h1>
            <p style={{ fontSize: "1rem", color: "#777", lineHeight: 1.6, maxWidth: 520 }}>Upload a photo or hand sketch. Get a complete engineering package including a real downloadable STL file powered by Meshy AI.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.25rem" }}>
              {["🧊 STL Download", "📋 CAD Guide", "📐 Engineering Drawing", "🔩 Parts List", "🏭 Manufacturing Notes", "💾 OpenSCAD"].map(f => (
                <span key={f} style={{ fontSize: "0.72rem", color: "#555", background: "#fff", border: "1px solid #e0e0e0", padding: "0.3rem 0.7rem", borderRadius: 20 }}>{f}</span>
              ))}
            </div>
          </div>

          {/* Upload */}
          <div style={{ marginBottom: "2rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Upload Image or Sketch</label>
            <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: dragging ? "2px solid #111" : imagePreview ? "2px solid #111" : "2px dashed #ddd", borderRadius: 14, padding: imagePreview ? "0" : "3rem 2rem", textAlign: "center", cursor: "pointer", transition: "all 0.2s", background: dragging ? "#f0f0ee" : "#fff", overflow: "hidden" }}>
              {imagePreview ? (
                <div style={{ position: "relative" }}>
                  <img src={imagePreview} alt="Upload preview" style={{ width: "100%", maxHeight: 300, objectFit: "contain", display: "block", background: "#f8f8f8" }} />
                  <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}>
                    <button onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setImageResult(null); setEngineeringBlueprint(null); setMeshyUrls(null); }} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #ddd", background: "#fff", color: "#999", fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                  <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "#555" }}>📎 {imageFile?.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "#bbb", marginLeft: "auto" }}>Click to change</span>
                  </div>
                </div>
              ) : (
                <><div style={{ fontSize: "2rem", marginBottom: "0.75rem", opacity: 0.3 }}>⬆</div><p style={{ fontSize: "0.88rem", color: "#888", marginBottom: "0.4rem" }}>Drag and drop an image or sketch here</p><p style={{ fontSize: "0.75rem", color: "#bbb" }}>JPG, PNG, WEBP — photos or hand drawings both work</p></>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleImageUpload(e.target.files[0]); }} />
          </div>

          <div style={{ marginBottom: "2rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Target Software</label>
            <SoftwarePills value={imageSoftware} onChange={setImageSoftware} />
          </div>
          <div style={{ marginBottom: "2rem" }}>
            <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.14em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Skill Level</label>
            <SkillCards value={imageSkill} onChange={setImageSkill} />
          </div>
          <div style={{ marginBottom: "2rem" }}>
            <button onClick={() => setShowImageDiagrams(!showImageDiagrams)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 1rem", border: "1.5px solid #e0e0e0", borderRadius: 8, background: showImageDiagrams ? "#111" : "#fff", color: showImageDiagrams ? "#fff" : "#555", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s" }}>
              <span>📐</span>{showImageDiagrams ? "Step diagrams ON" : "Step diagrams OFF"}
            </button>
          </div>

          {imageError && <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#c00", fontSize: "0.82rem" }}>{imageError}</div>}

          <button onClick={handleImageAnalyse} disabled={imageLoading} style={{ width: "100%", padding: "1rem", borderRadius: 12, border: "none", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 600, cursor: imageLoading ? "not-allowed" : "pointer", background: imageLoading ? "#e8e8e8" : "#111", color: imageLoading ? "#999" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", transition: "background 0.2s" }}
            onMouseEnter={e => { if (!imageLoading) e.currentTarget.style.background = "#333"; }} onMouseLeave={e => { if (!imageLoading) e.currentTarget.style.background = "#111"; }}>
            {imageLoading ? <><span style={{ width: 14, height: 14, border: "2px solid #ccc", borderTopColor: "#666", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Analysing image...</> : "Analyse image & generate engineering package →"}
          </button>

          {/* Results */}
          {imageResult && (
            <div ref={imageResultRef} style={{ marginTop: "2.5rem", animation: "fadeUp 0.4s ease both" }}>

              {/* Object header */}
              <div style={{ background: "#111", borderRadius: 16, padding: "1.5rem", marginBottom: "1.25rem", color: "#fff" }}>
                <p style={{ fontSize: "0.62rem", letterSpacing: "0.14em", color: "#888", textTransform: "uppercase", marginBottom: "0.4rem" }}>Detected Object</p>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.75rem" }}>{imageResult.objectName}</h2>
                <p style={{ fontSize: "0.88rem", color: "#aaa", lineHeight: 1.7, marginBottom: "1rem" }}>{imageResult.summary}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {imageResult.estimatedDimensions?.map((d, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}>
                      <span style={{ color: "#888" }}>{d.feature}: </span><span style={{ color: "#fff", fontWeight: 600 }}>{d.estimate}</span>
                    </div>
                  ))}
                  {imageResult.material && <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}><span style={{ color: "#888" }}>Material: </span><span style={{ color: "#fff", fontWeight: 600 }}>{imageResult.material}</span></div>}
                </div>
              </div>

              {/* Result tabs */}
              <div style={{ display: "flex", gap: "0.25rem", background: "#f0f0ee", borderRadius: 12, padding: "0.3rem", marginBottom: "1.25rem", overflowX: "auto" }}>
                {RESULT_TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveResultTab(tab.id)} style={{ padding: "0.5rem 0.9rem", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: activeResultTab === tab.id ? 600 : 400, background: activeResultTab === tab.id ? "#fff" : "transparent", color: activeResultTab === tab.id ? "#111" : "#888", boxShadow: activeResultTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", whiteSpace: "nowrap" }}>{tab.label}</button>
                ))}
              </div>

              {/* STL / 3D Model tab */}
              {activeResultTab === "stl" && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#111" }} />
                    <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>3D Model — Powered by Meshy AI</span>
                  </div>
                  <div style={{ padding: "1.5rem" }}>
                    {/* Not yet generated */}
                    {!meshyLoading && !meshyUrls && !meshyError && (
                      <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🧊</div>
                        <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "0.5rem", fontWeight: 600 }}>Generate a real 3D model from your image</p>
                        <p style={{ fontSize: "0.8rem", color: "#999", marginBottom: "1.5rem", lineHeight: 1.6 }}>Powered by Meshy AI — generates a textured GLB, OBJ and STL file from your uploaded image. Takes 1–3 minutes.</p>
                        <button onClick={generateMeshy3D} style={{ padding: "0.85rem 2rem", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "0.6rem" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#333"} onMouseLeave={e => e.currentTarget.style.background = "#111"}>
                          🧊 Generate 3D Model (STL / GLB / OBJ)
                        </button>
                      </div>
                    )}

                    {/* Loading / progress */}
                    {meshyLoading && (
                      <div style={{ padding: "1rem 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                          <span style={{ fontSize: "0.85rem", color: "#555", fontWeight: 500 }}>{meshyStatus}</span>
                          <span style={{ fontSize: "0.85rem", color: "#111", fontWeight: 700 }}>{meshyProgress}%</span>
                        </div>
                        <div style={{ height: 8, background: "#f0f0ee", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "#111", borderRadius: 8, width: `${meshyProgress}%`, transition: "width 0.5s ease" }} />
                        </div>
                        <p style={{ fontSize: "0.72rem", color: "#bbb", marginTop: "0.75rem", textAlign: "center" }}>Meshy AI is generating your 3D model — this takes 1–3 minutes. Please wait...</p>
                      </div>
                    )}

                    {/* Error */}
                    {meshyError && !meshyLoading && (
                      <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
                        <p style={{ color: "#c00", fontSize: "0.82rem", marginBottom: "0.75rem" }}>⚠ {meshyError}</p>
                        <button onClick={generateMeshy3D} style={{ padding: "0.5rem 1rem", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "#fff", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
                      </div>
                    )}

                    {/* Success — download buttons */}
                    {meshyUrls && !meshyLoading && (
                      <div style={{ animation: "fadeUp 0.4s ease both" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem", padding: "0.75rem 1rem", background: "#f0fff4", border: "1px solid #c0e8d0", borderRadius: 10 }}>
                          <span style={{ fontSize: "1.2rem" }}>✅</span>
                          <div>
                            <p style={{ fontSize: "0.85rem", color: "#1a7a40", fontWeight: 600 }}>3D model generated successfully!</p>
                            <p style={{ fontSize: "0.72rem", color: "#4a9a60" }}>Download in your preferred format below</p>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                          {meshyUrls.stl && (
                            <button onClick={() => downloadFromUrl(meshyUrls.stl, `${imageResult.objectName?.replace(/\s+/g,"_") || "model"}.stl`)} style={{ padding: "1rem", borderRadius: 12, border: "1.5px solid #111", background: "#111", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#333"} onMouseLeave={e => e.currentTarget.style.background = "#111"}>
                              <span style={{ fontSize: "1.5rem" }}>⬇</span>STL
                              <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>For 3D printing</span>
                            </button>
                          )}
                          {meshyUrls.glb && (
                            <button onClick={() => downloadFromUrl(meshyUrls.glb, `${imageResult.objectName?.replace(/\s+/g,"_") || "model"}.glb`)} style={{ padding: "1rem", borderRadius: 12, border: "1.5px solid #e0e0e0", background: "#fff", color: "#111", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f3"; }} onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
                              <span style={{ fontSize: "1.5rem" }}>⬇</span>GLB
                              <span style={{ fontSize: "0.65rem", color: "#999" }}>With textures</span>
                            </button>
                          )}
                          {meshyUrls.obj && (
                            <button onClick={() => downloadFromUrl(meshyUrls.obj, `${imageResult.objectName?.replace(/\s+/g,"_") || "model"}.obj`)} style={{ padding: "1rem", borderRadius: 12, border: "1.5px solid #e0e0e0", background: "#fff", color: "#111", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f3"; }} onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
                              <span style={{ fontSize: "1.5rem" }}>⬇</span>OBJ
                              <span style={{ fontSize: "0.65rem", color: "#999" }}>Universal format</span>
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: "0.72rem", color: "#bbb", marginTop: "1rem", lineHeight: 1.5, textAlign: "center" }}>
                          💡 Import the STL into your CAD software to refine using the guide in the CAD Guide tab.
                        </p>
                        <div style={{ marginTop: "1rem", textAlign: "center" }}>
                          <button onClick={generateMeshy3D} style={{ padding: "0.5rem 1rem", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#888", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }}>
                            🔄 Regenerate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CAD Guide tab */}
              {activeResultTab === "guide" && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#111" }} />
                      <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>Modelling Guide — {imageSoftware}</span>
                    </div>
                    {imageDiagramsLoading && <span style={{ fontSize: "0.65rem", color: "#aaa", display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ width: 9, height: 9, border: "1.5px solid #ddd", borderTopColor: "#999", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Generating diagrams...</span>}
                  </div>
                  <div style={{ padding: "1.75rem 1.5rem" }}>
                    {imageResult.geometryBreakdown?.length > 0 && (
                      <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#f8f8f8", borderRadius: 10 }}>
                        <p style={{ fontSize: "0.62rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", marginBottom: "0.6rem" }}>Geometry Breakdown</p>
                        {imageResult.geometryBreakdown.map((g, i) => <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.3rem" }}><span style={{ color: "#ccc", flexShrink: 0 }}>—</span><span style={{ fontSize: "0.82rem", color: "#555", lineHeight: 1.6 }}>{g}</span></div>)}
                      </div>
                    )}
                    <StepsView stepsData={imageResult.steps || []} diagramsData={imageDiagrams} diagramsLoadingState={imageDiagramsLoading} showDiagramsFlag={showImageDiagrams} />
                    {imageResult.proTip && <div style={{ borderLeft: "3px solid #222", paddingLeft: "1rem", marginTop: "1.5rem" }}><span style={{ color: "#444", fontSize: "0.85rem", lineHeight: 1.7 }}>💡 {imageResult.proTip}</span></div>}
                  </div>
                </div>
              )}

              {/* Engineering Drawing tab */}
              {activeResultTab === "blueprint" && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: blueprintLoading ? "#ccc" : "#111" }} />
                      <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>Technical Engineering Drawing</span>
                    </div>
                    {engineeringBlueprint && !blueprintLoading && (
                      <button onClick={() => downloadSVG(engineeringBlueprint, imageResult.objectName)} style={{ padding: "0.4rem 0.9rem", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "#fff", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        onMouseEnter={e => e.target.style.background = "#333"} onMouseLeave={e => e.target.style.background = "#111"}>⬇ Download SVG</button>
                    )}
                  </div>
                  <div style={{ padding: "1.5rem" }}>
                    {blueprintLoading && <div style={{ textAlign: "center", padding: "3rem" }}><span style={{ width: 20, height: 20, border: "2px solid #e0e0e0", borderTopColor: "#999", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /><p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#bbb" }}>Generating engineering drawing...</p></div>}
                    {engineeringBlueprint && !blueprintLoading && <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: engineeringBlueprint }} />}
                    {!engineeringBlueprint && !blueprintLoading && <p style={{ color: "#bbb", fontSize: "0.85rem", textAlign: "center", padding: "2rem" }}>Engineering drawing could not be generated.</p>}
                  </div>
                </div>
              )}

              {/* Parts List tab */}
              {activeResultTab === "bom" && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#111" }} />
                      <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>Bill of Materials</span>
                    </div>
                    <span style={{ fontSize: "0.65rem", color: "#bbb" }}>{imageResult.partslist?.length || 0} parts</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead><tr style={{ background: "#f8f8f8" }}>
                        {["Part No.", "Name", "Description", "Qty", "Material", "Est. Cost", "Notes"].map(h => (
                          <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.62rem", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", fontWeight: 600, borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(imageResult.partslist || []).map((part, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }} onMouseEnter={e => e.currentTarget.style.background = "#fafafa"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <td style={{ padding: "0.85rem 1rem", color: "#999", fontFamily: "monospace", fontSize: "0.75rem" }}>{part.partNumber}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#111", fontWeight: 600 }}>{part.name}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#555", maxWidth: 180 }}>{part.description}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#111", fontWeight: 700, textAlign: "center" }}>{part.quantity}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#555" }}>{part.material}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#111", fontWeight: 600, whiteSpace: "nowrap" }}>{part.estimatedCost}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "#888", fontSize: "0.75rem" }}>{part.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!imageResult.partslist || imageResult.partslist.length === 0) && <p style={{ padding: "2rem", color: "#bbb", textAlign: "center" }}>No parts list generated.</p>}
                  </div>
                </div>
              )}

              {/* Manufacturing tab */}
              {activeResultTab === "manufacturing" && imageResult.manufacturingNotes && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#111" }} />
                      <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>Manufacturing Advisor</span>
                    </div>
                  </div>
                  <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div style={{ background: "#111", borderRadius: 12, padding: "1.25rem", color: "#fff" }}>
                      <p style={{ fontSize: "0.62rem", letterSpacing: "0.12em", color: "#888", textTransform: "uppercase", marginBottom: "0.5rem" }}>Recommended Process</p>
                      <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>{imageResult.manufacturingNotes.recommendedProcess}</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
                      {[{ label: "Wall Thickness", value: imageResult.manufacturingNotes.wallThickness }, { label: "Tolerances", value: imageResult.manufacturingNotes.tolerances }, { label: "Surface Finish", value: imageResult.manufacturingNotes.surfaceFinish }, { label: "Difficulty", value: imageResult.manufacturingNotes.difficulty }, { label: "Est. Machine Time", value: imageResult.manufacturingNotes.estimatedMachineTime }].filter(s => s.value).map((stat, i) => (
                        <div key={i} style={{ background: "#f8f8f8", borderRadius: 10, padding: "1rem" }}>
                          <p style={{ fontSize: "0.62rem", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", marginBottom: "0.35rem" }}>{stat.label}</p>
                          <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111" }}>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                    {imageResult.manufacturingNotes.alternativeProcesses?.length > 0 && (
                      <div>
                        <p style={{ fontSize: "0.62rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", marginBottom: "0.6rem" }}>Alternative Processes</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {imageResult.manufacturingNotes.alternativeProcesses.map((p, i) => <span key={i} style={{ background: "#f0f0ee", borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: "0.8rem", color: "#555" }}>{p}</span>)}
                        </div>
                      </div>
                    )}
                    {imageResult.manufacturingNotes.warnings?.length > 0 && (
                      <div style={{ background: "#fffbf0", border: "1px solid #f0d070", borderRadius: 10, padding: "1rem" }}>
                        <p style={{ fontSize: "0.62rem", letterSpacing: "0.12em", color: "#a07000", textTransform: "uppercase", marginBottom: "0.6rem", fontWeight: 600 }}>⚠ DFM Warnings</p>
                        {imageResult.manufacturingNotes.warnings.map((w, i) => <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}><span style={{ color: "#c09000", flexShrink: 0 }}>—</span><span style={{ fontSize: "0.82rem", color: "#705000", lineHeight: 1.6 }}>{w}</span></div>)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OpenSCAD tab */}
              {activeResultTab === "openscad" && imageResult.openscad && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#111" }} />
                      <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>OpenSCAD Script</span>
                    </div>
                    <button onClick={() => downloadOpenSCAD(imageResult.openscad, imageResult.objectName)} style={{ padding: "0.4rem 0.9rem", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "#fff", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#333"} onMouseLeave={e => e.currentTarget.style.background = "#111"}>⬇ Download .scad</button>
                  </div>
                  <div style={{ padding: "1.25rem 1.5rem" }}>
                    <pre style={{ fontSize: "0.75rem", color: "#555", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre-wrap", fontFamily: "'Courier New', monospace", background: "#f8f8f8", padding: "1rem", borderRadius: 8 }}>{imageResult.openscad}</pre>
                    <p style={{ fontSize: "0.72rem", color: "#aaa", marginTop: "0.75rem", lineHeight: 1.5 }}>💡 Open in <strong style={{ color: "#777" }}>OpenSCAD</strong> (free at openscad.org) to render and export as STL.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem 6rem", animation: "fadeIn 0.3s ease both" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2.5rem" }}>
            <div>
              <p style={{ fontSize: "0.68rem", letterSpacing: "0.18em", color: "#999", textTransform: "uppercase", marginBottom: "0.75rem" }}>Your searches</p>
              <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.75rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em" }}>History</h1>
            </div>
            {history.length > 0 && <button onClick={() => { setHistory([]); setExpandedId(null); }} style={{ padding: "0.45rem 1rem", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#999", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={e => { e.target.style.color = "#c00"; e.target.style.borderColor = "#fcc"; }} onMouseLeave={e => { e.target.style.color = "#999"; e.target.style.borderColor = "#e0e0e0"; }}>Clear all</button>}
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "5rem 2rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem", opacity: 0.3 }}>◷</div>
              <p style={{ fontSize: "0.9rem", color: "#aaa", marginBottom: "0.5rem" }}>No history yet</p>
              <p style={{ fontSize: "0.78rem", color: "#ccc", marginBottom: "1.5rem" }}>Your guides will appear here after you generate them.</p>
              <button onClick={() => setActiveTab("ask")} style={{ padding: "0.6rem 1.25rem", borderRadius: 8, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>Ask your first question →</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {history.map((entry) => (
                <div key={entry.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 14, overflow: "hidden", transition: "box-shadow 0.2s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} style={{ padding: "1rem 1.25rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.2rem 0.55rem", borderRadius: 20, background: "#111", color: "#fff" }}>{entry.software}</span>
                      <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.2rem 0.55rem", borderRadius: 20, background: "#f0f0ee", color: "#555" }}>{skillMap[entry.skill]?.icon} {skillMap[entry.skill]?.label}</span>
                    </div>
                    <p style={{ flex: 1, fontSize: "0.85rem", color: "#333", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expandedId === entry.id ? "normal" : "nowrap" }}>{entry.question}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.65rem", color: "#bbb" }}>{entry.date}</span>
                      <button onClick={(e) => deleteEntry(entry.id, e)} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #eee", background: "#fff", color: "#ccc", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.target.style.color = "#c00"; e.target.style.borderColor = "#fcc"; e.target.style.background = "#fff5f5"; }} onMouseLeave={e => { e.target.style.color = "#ccc"; e.target.style.borderColor = "#eee"; e.target.style.background = "#fff"; }}>×</button>
                      <span style={{ fontSize: "0.7rem", color: "#ccc", display: "inline-block", transform: expandedId === entry.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
                    </div>
                  </div>
                  {expandedId === entry.id && (
                    <div style={{ borderTop: "1px solid #f0f0f0", padding: "1rem 1.25rem 1.5rem", animation: "fadeUp 0.25s ease both" }}>
                      {(entry.steps || []).map((step) => (
                        <div key={step.number} style={{ display: "flex", gap: "1rem", marginBottom: "0.85rem", alignItems: "flex-start" }}>
                          <span style={{ minWidth: "1.6rem", height: "1.6rem", border: "1.5px solid #222", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#111", flexShrink: 0, marginTop: "0.1rem" }}>{step.number}</span>
                          <span style={{ color: "#333", lineHeight: 1.75, fontSize: "0.9rem" }}>{boldify(step.instruction)}</span>
                        </div>
                      ))}
                      {entry.proTip && <div style={{ borderLeft: "3px solid #222", paddingLeft: "1rem", marginTop: "1rem" }}><span style={{ color: "#444", fontSize: "0.85rem", lineHeight: 1.7 }}>💡 {entry.proTip}</span></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      <footer style={{ textAlign: "center", padding: "2rem", borderTop: "1px solid #e8e8e8", color: "#ccc", fontSize: "0.68rem", letterSpacing: "0.08em", background: "#fff" }}>
        CAD Copilot · Powered by Claude & Meshy AI · For educational and professional use
      </footer>
    </div>
  );
}
