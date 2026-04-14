import { useState, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const API = "http://localhost:8000";

// ── tiny spinner ──────────────────────────────────────────────────────────────
const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white inline-block" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
  </svg>
);

export default function App() {
  const [file, setFile]               = useState(null);
  const [fileName, setFileName]       = useState("");
  const [uploaded, setUploaded]       = useState(false);
  const [uploadMsg, setUploadMsg]     = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);

  const [query, setQuery]             = useState("");
  const [answer, setAnswer]           = useState("");
  const [sources, setSources]         = useState([]);
  const [stats, setStats]             = useState(null);
  const [graphData, setGraphData]     = useState([]);
  const [askLoading, setAskLoading]   = useState(false);

  const [error, setError]             = useState("");
  const fileInputRef                  = useRef();

  // ── handlers ─────────────────────────────────────────────────────────────────

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); setFileName(f.name); setError(""); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") {
      setFile(f); setFileName(f.name); setError("");
    } else {
      setError("Only PDF files are accepted.");
    }
  };

  const uploadFile = async () => {
    if (!file) return setError("Select a PDF first.");
    setError(""); setUploadMsg(""); setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/upload/`, fd);
      setUploadMsg(`✅ ${res.data.message} (${res.data.chunks} chunks indexed)`);
      setUploaded(true);
      setAnswer(""); setSources([]); setStats(null); setGraphData([]);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setError(`Upload failed: ${msg}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!uploaded) return setError("Upload a PDF first.");
    if (!query.trim()) return setError("Enter a question.");
    setError(""); setAskLoading(true);
    try {
      const res = await axios.get(`${API}/ask/`, { params: { query } });
      setAnswer(res.data.answer);
      setSources(res.data.sources || []);
      setStats(res.data.stats);
      setGraphData(res.data.graph.distances);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setError(`Error: ${msg}`);
    } finally {
      setAskLoading(false);
    }
  };

  // ── parse bullet answer into lines ───────────────────────────────────────────
  const answerLines = answer
    ? answer.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  // ── chart config ─────────────────────────────────────────────────────────────
  const chartData = {
    labels: graphData.map((_, i) => `Chunk ${i + 1}`),
    datasets: [{
      label: "Distance (lower = more relevant)",
      data: graphData,
      backgroundColor: ["#6366f1", "#8b5cf6", "#a78bfa"],
      borderRadius: 8,
      borderSkipped: false,
    }],
  };
  const chartOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: "#6b7280", font: { family: "Sora" } } } },
    scales: {
      x: { ticks: { color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
      y: { ticks: { color: "#9ca3af" }, grid: { color: "#f3f4f6" } },
    },
  };

  return (
    <>
      {/* Google font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      * { font-family: 'Sora', sans-serif; box-sizing: border-box; }
      code, .mono { font-family: 'JetBrains Mono', monospace; }`}</style>

      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        padding: "2rem 1rem",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "2.5rem" }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📄</div>
          <h1 style={{
            fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 700,
            background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            marginBottom: "0.5rem",
          }}>
            PDF Intelligence
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1rem" }}>
            Upload any PDF — get structured, bullet-point answers instantly.
          </p>
        </motion.div>

        {/* ── UPLOAD CARD ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={card}
        >
          <h2 style={sectionTitle}>1. Upload your PDF</h2>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current.click()}
            style={{
              border: "2px dashed #4f46e5",
              borderRadius: "12px",
              padding: "1.5rem",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: "1rem",
              background: fileName ? "#1e1b4b22" : "transparent",
              transition: "background 0.2s",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {fileName
              ? <p style={{ color: "#a78bfa", fontWeight: 600 }}>📎 {fileName}</p>
              : <p style={{ color: "#64748b" }}>Drop PDF here or <span style={{ color: "#818cf8" }}>browse</span></p>
            }
          </div>

          <button
            onClick={uploadFile}
            disabled={!file || uploadLoading}
            style={btn(!file || uploadLoading)}
          >
            {uploadLoading ? <Spinner /> : "Upload & Index PDF"}
          </button>

          <AnimatePresence>
            {uploadMsg && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ marginTop: "0.75rem", color: "#34d399", fontSize: "0.9rem" }}>
                {uploadMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── ASK CARD ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ ...card, marginTop: "1.25rem" }}
        >
          <h2 style={sectionTitle}>2. Ask a question</h2>

          <input
            type="text"
            placeholder="e.g. What are the main findings?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            disabled={!uploaded}
            style={inputStyle(!uploaded)}
          />

          <button
            onClick={askQuestion}
            disabled={!uploaded || askLoading}
            style={{ ...btn(!uploaded || askLoading), marginTop: "0.75rem" }}
          >
            {askLoading ? <><Spinner /> &nbsp;Thinking…</> : "Get Answer"}
          </button>

          {!uploaded && (
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "0.5rem" }}>
              Upload a PDF above to unlock this field.
            </p>
          )}
        </motion.div>

        {/* ── ERROR ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{
                marginTop: "1rem", background: "#450a0a", border: "1px solid #f87171",
                borderRadius: "12px", padding: "1rem 1.25rem", color: "#fca5a5",
                width: "100%", maxWidth: "640px", fontSize: "0.9rem",
              }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ANSWER ── */}
        <AnimatePresence>
          {answer && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ ...card, marginTop: "1.25rem" }}
            >
              <h2 style={sectionTitle}>💡 Answer</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {answerLines.map((line, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    style={{
                      display: "flex", gap: "0.6rem", alignItems: "flex-start",
                      marginBottom: "0.6rem", color: "#e2e8f0", lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: "#818cf8", flexShrink: 0, marginTop: "2px" }}>
                      {line.startsWith("•") ? "•" : "▸"}
                    </span>
                    <span>{line.replace(/^[•▸]\s*/, "")}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── STATS ── */}
        <AnimatePresence>
          {stats && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                ...card, marginTop: "1rem",
                display: "flex", gap: "2rem", flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>RESPONSE TIME</p>
                <p style={{ color: "#a78bfa", fontSize: "1.4rem", fontWeight: 700 }}>{stats.response_time_ms} ms</p>
              </div>
              <div>
                <p style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>CHUNKS USED</p>
                <p style={{ color: "#60a5fa", fontSize: "1.4rem", fontWeight: 700 }}>{stats.chunks_used}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── GRAPH ── */}
        <AnimatePresence>
          {graphData.length > 0 && (
            <motion.div
              key="graph"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ ...card, marginTop: "1rem" }}
            >
              <h2 style={sectionTitle}>📊 Similarity Distances</h2>
              <p style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: "1rem" }}>
                Lower distance = higher relevance to your question.
              </p>
              <Bar data={chartData} options={chartOptions} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SOURCES ── */}
        <AnimatePresence>
          {sources.length > 0 && (
            <motion.div
              key="sources"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ ...card, marginTop: "1rem" }}
            >
              <h2 style={sectionTitle}>📚 Source Chunks</h2>
              {sources.map((s, i) => (
                <div key={i} style={{
                  background: "#0f172a", borderRadius: "8px", padding: "0.75rem",
                  marginBottom: "0.75rem", color: "#94a3b8", fontSize: "0.82rem",
                  lineHeight: 1.6, fontFamily: "JetBrains Mono, monospace",
                }}>
                  <span style={{ color: "#4f46e5", fontWeight: 600 }}>Chunk {i + 1}: </span>
                  {s}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const card = {
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "1.5rem",
  width: "100%",
  maxWidth: "640px",
};

const sectionTitle = {
  color: "#e2e8f0", fontWeight: 700, fontSize: "1.05rem",
  marginBottom: "1rem", marginTop: 0,
};

const btn = (disabled) => ({
  width: "100%",
  padding: "0.75rem",
  borderRadius: "10px",
  border: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 600,
  fontSize: "0.95rem",
  background: disabled
    ? "rgba(100,100,120,0.3)"
    : "linear-gradient(135deg, #6366f1, #8b5cf6)",
  color: disabled ? "#6b7280" : "#fff",
  transition: "opacity 0.2s",
  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
});

const inputStyle = (disabled) => ({
  width: "100%",
  padding: "0.75rem 1rem",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#e2e8f0",
  fontSize: "0.95rem",
  outline: "none",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "text",
});
