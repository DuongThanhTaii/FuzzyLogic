import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { getMembership, getRules, updateMembership, updateRule } from "../../api/client";

const VARS = [
  { key: "error", label: "Sai số (e)", range: "[-50, 50]" },
  { key: "delta_error", label: "Độ biến thiên sai số (de)", range: "[-15, 15]" },
  { key: "infusion_rate", label: "Tốc độ truyền (u)", range: "[0, 50]" },
];

const TERM_COLORS = {
  NB: "#f87171",
  NS: "#fb923c",
  Z: "#4ade80",
  PS: "#60a5fa",
  PB: "#c084fc",
  N: "#f87171",
  P: "#60a5fa",
  S: "#34d399",
  M: "#fbbf24",
  L: "#f87171",
};

const OUTPUT_CYCLE = ["Z", "S", "M", "L"];
const ERROR_TERMS = ["NB", "NS", "Z", "PS", "PB"];
const DELTA_TERMS = ["N", "Z", "P"];
const SVG_W = 360;
const SVG_H = 170;
const PAD_X = 28;
const PAD_Y = 20;

const getColor = (name) => TERM_COLORS[name] ?? "#94a3b8";

function gauss(x, c, s) {
  return Math.exp(-0.5 * ((x - c) / s) ** 2);
}

function MFChart({ variable, terms, universe, onUpdate }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const minX = universe[0];
  const maxX = universe[universe.length - 1];
  const toSvgX = (x) => PAD_X + ((x - minX) / (maxX - minX)) * (SVG_W - 2 * PAD_X);
  const toSvgY = (v) => PAD_Y + (1 - v) * (SVG_H - 2 * PAD_Y);

  const clientToWorld = useCallback(
    (clientX) => {
      if (!svgRef.current) return minX;
      const rect = svgRef.current.getBoundingClientRect();
      const scale = SVG_W / rect.width;
      const svgX = (clientX - rect.left) * scale;
      return minX + ((svgX - PAD_X) / (SVG_W - 2 * PAD_X)) * (maxX - minX);
    },
    [minX, maxX],
  );

  const onDown = useCallback((e, term, type) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { term, type };
  }, []);

  const onMove = useCallback(
    (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const t = terms[drag.term];
      if (!t) return;
      const wx = clientToWorld(e.clientX);
      if (drag.type === "center") {
        onUpdate(variable, drag.term, Math.max(minX, Math.min(maxX, wx)), t.sigma);
      } else {
        onUpdate(variable, drag.term, t.center, Math.max(0.5, Math.abs(wx - t.center)));
      }
    },
    [clientToWorld, maxX, minX, onUpdate, terms, variable],
  );

  const onUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const steps = 260;
  const dx = (maxX - minX) / steps;

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{
        background: "#0b1326",
        borderRadius: 10,
        border: "1px solid #334155",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
        display: "block",
      }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <line
          key={v}
          x1={PAD_X}
          x2={SVG_W - PAD_X}
          y1={toSvgY(v)}
          y2={toSvgY(v)}
          stroke="#334155"
          strokeWidth={v === 0 ? 1.4 : 0.9}
        />
      ))}

      {[0.2, 0.4, 0.6, 0.8].map((p) => {
        const x = minX + p * (maxX - minX);
        return (
          <text
            key={p}
            x={toSvgX(x)}
            y={SVG_H - 4}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          >
            {Math.round(x)}
          </text>
        );
      })}

      {Object.entries(terms).map(([name, { center, sigma }]) => {
        const color = getColor(name);
        const pts = [];
        for (let i = 0; i <= steps; i += 1) {
          const x = minX + i * dx;
          pts.push(`${toSvgX(x)},${toSvgY(gauss(x, center, sigma))}`);
        }
        const cx = toSvgX(center);
        const sx = toSvgX(center + sigma);
        const sy = toSvgY(Math.exp(-0.5));

        return (
          <g key={name}>
            <polyline
              points={`${toSvgX(minX)},${toSvgY(0)} ${pts.join(" ")} ${toSvgX(maxX)},${toSvgY(0)}`}
              fill={`${color}20`}
              stroke="none"
            />
            <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2.4} />

            <circle
              cx={cx}
              cy={toSvgY(1)}
              r={7}
              fill={color}
              stroke="#020617"
              strokeWidth={2}
              style={{ cursor: "ew-resize" }}
              onPointerDown={(e) => onDown(e, name, "center")}
            />
            <circle
              cx={sx}
              cy={sy}
              r={5}
              fill="#020617"
              stroke={color}
              strokeWidth={2}
              style={{ cursor: "ew-resize" }}
              onPointerDown={(e) => onDown(e, name, "sigma")}
            />
            <text
              x={cx}
              y={toSvgY(1) - 10}
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={700}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RuleTable({ rules, onRuleChange }) {
  const map = useMemo(() => {
    const out = {};
    rules.forEach((r) => {
      out[`${r.error}_${r.delta_error}`] = r.output;
    });
    return out;
  }, [rules]);

  return (
    <div>
      <div className="text-[12px] text-slate-400 mb-2 leading-6">
        Bấm vào ô để đổi đầu ra tuần tự: <span className="font-bold text-slate-200">Z, S, M, L</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[4px]">
          <thead>
            <tr>
              <th className="text-left text-[12px] text-slate-400 p-1">e \ de</th>
              {DELTA_TERMS.map((d) => (
                <th key={d} className="text-center text-[12px] p-1" style={{ color: getColor(d) }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ERROR_TERMS.map((e) => (
              <tr key={e}>
                <td className="text-[12px] p-1 font-bold" style={{ color: getColor(e) }}>
                  {e}
                </td>
                {DELTA_TERMS.map((d) => {
                  const out = map[`${e}_${d}`] ?? "Z";
                  const color = getColor(out);
                  return (
                    <td key={d} className="text-center">
                      <button
                        onClick={() => {
                          const idx = OUTPUT_CYCLE.indexOf(out);
                          const next = OUTPUT_CYCLE[(idx + 1) % OUTPUT_CYCLE.length];
                          onRuleChange(e, d, next);
                        }}
                        className="w-full rounded-md py-2 border text-[12px] font-black tracking-wide"
                        style={{ color, borderColor: `${color}77`, background: `${color}22` }}
                      >
                        {out}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlockNode({ data }) {
  return (
    <div
      style={{
        background: data.color,
        border: `2px solid ${data.color}cc`,
        color: "#fff",
        borderRadius: 8,
        padding: "7px 12px",
        fontSize: 10,
        fontWeight: 700,
        textAlign: "center",
        minWidth: 86,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        whiteSpace: "pre-line",
        boxShadow: `0 0 12px ${data.color}44`,
      }}
    >
      {data.label}
      <Handle type="target" position={Position.Left} style={{ background: "#7dd3fc", width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: "#4ade80", width: 8, height: 8 }} />
    </div>
  );
}

function SumNode() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e293b",
        border: "2px solid #64748b",
        color: "#cbd5e1",
        fontSize: 18,
      }}
    >
      Σ
      <Handle type="target" position={Position.Left} id="a" style={{ background: "#7dd3fc" }} />
      <Handle type="target" position={Position.Bottom} id="b" style={{ background: "#f87171", bottom: -4 }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#4ade80" }} />
    </div>
  );
}

function DistNode({ data }) {
  return (
    <div
      style={{
        background: data.active ? "#92400e" : "#1e293b",
        border: `2px solid ${data.active ? "#f59e0b" : "#334155"}`,
        color: data.active ? "#fde68a" : "#64748b",
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 10,
        fontWeight: 700,
        textAlign: "center",
        opacity: data.active ? 1 : 0.45,
      }}
    >
      Disturbance
      <Handle type="source" position={Position.Top} style={{ background: "#f59e0b" }} />
    </div>
  );
}

const nodeTypes = { block: BlockNode, sum: SumNode, dist: DistNode };

function SimulinkView({ disturbanceActive }) {
  const initialNodes = [
    { id: "sp", type: "block", position: { x: 0, y: 55 }, data: { label: "Setpoint\nBIS=50", color: "#0c4a6e" } },
    { id: "sum", type: "sum", position: { x: 120, y: 55 }, data: {} },
    { id: "flc", type: "block", position: { x: 190, y: 55 }, data: { label: "Fuzzy\nController", color: "#4c1d95" } },
    { id: "plant", type: "block", position: { x: 320, y: 55 }, data: { label: "PK/PD\nModel", color: "#064e3b" } },
    { id: "out", type: "block", position: { x: 450, y: 55 }, data: { label: "BIS\nOutput", color: "#1e3a5f" } },
    { id: "dist", type: "dist", position: { x: 320, y: 155 }, data: { active: disturbanceActive } },
  ];
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const edges = [
    { id: "e1", source: "sp", target: "sum", targetHandle: "a", style: { stroke: "#38bdf8" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#38bdf8" } },
    { id: "e2", source: "sum", target: "flc", sourceHandle: "out", style: { stroke: "#a78bfa" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#a78bfa" } },
    { id: "e3", source: "flc", target: "plant", style: { stroke: "#34d399" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#34d399" } },
    { id: "e4", source: "plant", target: "out", style: { stroke: "#7dd3fc" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7dd3fc" } },
    { id: "e5", source: "out", target: "sum", targetHandle: "b", type: "smoothstep", style: { stroke: "#f87171", strokeDasharray: "5 3" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#f87171" } },
    { id: "e6", source: "dist", target: "plant", style: { stroke: disturbanceActive ? "#f59e0b" : "#334155", strokeDasharray: "4 3" }, markerEnd: { type: MarkerType.ArrowClosed, color: disturbanceActive ? "#f59e0b" : "#334155" } },
  ];

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === "dist"
          ? { ...n, data: { ...n.data, active: disturbanceActive } }
          : n,
      ),
    );
  }, [disturbanceActive, setNodes]);

  return (
    <div className="w-full h-[255px] rounded-[10px] overflow-hidden border border-slate-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnDrag
        zoomOnPinch
        zoomOnDoubleClick={false}
        style={{ background: "#0b1326" }}
      >
        <Background color="#1e293b" gap={22} />
        <Controls showInteractive style={{ background: "#0f172a", border: "1px solid #334155" }} />
      </ReactFlow>
    </div>
  );
}

export default function FuzzyEditorTab({ disturbanceActive, backendOnline }) {
  const [subTab, setSubTab] = useState("mf");
  const [activeVar, setActiveVar] = useState("error");
  const [mfData, setMfData] = useState(null);
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    getMembership().then((r) => setMfData(r.data)).catch(() => {});
    getRules().then((r) => setRules(r.data.rules)).catch(() => {});
  }, []);

  const onMFUpdate = useCallback((variable, term, center, sigma) => {
    setMfData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [variable]: {
          ...prev[variable],
          terms: {
            ...prev[variable].terms,
            [term]: { ...prev[variable].terms[term], center, sigma },
          },
        },
      };
    });

    setSaving(true);
    updateMembership({ variable, term, center, sigma })
      .then(() => {
        setSaveStatus("ok");
        setTimeout(() => setSaveStatus(""), 1200);
      })
      .catch(() => {
        setSaveStatus("err");
        setTimeout(() => setSaveStatus(""), 1600);
      })
      .finally(() => setSaving(false));
  }, []);

  const onRuleChange = useCallback((errorTerm, deltaTerm, outputTerm) => {
    setRules((prev) =>
      prev.map((r) =>
        r.error === errorTerm && r.delta_error === deltaTerm ? { ...r, output: outputTerm } : r,
      ),
    );
    updateRule({ error_term: errorTerm, delta_term: deltaTerm, output_term: outputTerm }).catch(() => {});
  }, []);

  const terms = mfData?.[activeVar]?.terms ?? {};
  const universe = mfData?.[activeVar]?.universe ?? [];

  return (
    <div className="p-3 text-slate-200">
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 mb-3">
        <div className="text-[12px] font-semibold text-slate-300">Trạng thái áp dụng</div>
        <div className="text-[12px] mt-1 leading-5 text-slate-400">
          {backendOnline
            ? "Thay đổi sẽ ghi trực tiếp vào bộ điều khiển mờ backend. Lần chạy mới sẽ dùng MF/rule đã cập nhật."
            : "Backend đang offline. Bạn có thể thấy UI đổi, nhưng bộ điều khiển backend không được cập nhật."}
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 rounded-lg p-1 mb-3">
        {[
          { key: "mf", label: "Chỉnh MF" },
          { key: "rules", label: "Bảng luật" },
          { key: "diagram", label: "Control Diagram" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex-1 rounded-md py-2 text-[12px] font-semibold ${
              subTab === t.key ? "bg-indigo-500/30 text-indigo-100" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "mf" && (
        <div>
          <div className="flex gap-2 mb-2">
            {VARS.map((v) => (
              <button
                key={v.key}
                onClick={() => setActiveVar(v.key)}
                className={`flex-1 rounded-md py-2 text-[12px] font-bold border ${
                  activeVar === v.key
                    ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700 bg-slate-900 text-slate-400"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="text-[12px] text-slate-400 mb-2">
            Miền giá trị: <span className="text-slate-200 font-semibold">{VARS.find((v) => v.key === activeVar)?.range}</span>
          </div>

          <div className="text-[12px] min-h-[18px] mb-2">
            {saving && <span className="text-amber-300">Đang lưu...</span>}
            {saveStatus === "ok" && <span className="text-emerald-300">Đã lưu vào backend FLC.</span>}
            {saveStatus === "err" && <span className="text-red-300">Lưu thất bại. Kiểm tra kết nối backend.</span>}
          </div>

          {universe.length > 0 ? (
            <>
              <MFChart variable={activeVar} terms={terms} universe={universe} onUpdate={onMFUpdate} />
              <div className="text-[11px] text-slate-500 mt-2 mb-3">
                Kéo chấm đặc để đổi tâm μ. Kéo chấm rỗng để đổi độ rộng σ.
              </div>

              <div className="grid grid-cols-1 gap-2">
                {Object.entries(terms).map(([term, { center, sigma }]) => (
                  <div key={term} className="rounded-lg border p-2" style={{ borderColor: `${getColor(term)}55`, background: "#0b1326" }}>
                    <div className="text-[11px] font-bold mb-1" style={{ color: getColor(term) }}>
                      {term}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-slate-400">
                        Tâm μ
                        <input
                          type="number"
                          step={0.5}
                          value={center.toFixed(1)}
                          onChange={(e) => onMFUpdate(activeVar, term, +e.target.value, sigma)}
                          className="w-full mt-1 rounded bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1 text-[11px]"
                        />
                      </label>
                      <label className="text-[11px] text-slate-400">
                        Độ rộng σ
                        <input
                          type="number"
                          step={0.5}
                          min={0.5}
                          value={sigma.toFixed(1)}
                          onChange={(e) => onMFUpdate(activeVar, term, center, Math.max(0.5, +e.target.value))}
                          className="w-full mt-1 rounded bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1 text-[11px]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-slate-500 text-[12px]">Không tải được dữ liệu MF (backend không khả dụng).</div>
          )}
        </div>
      )}

      {subTab === "rules" && (
        <>
          {rules.length > 0 ? (
            <RuleTable rules={rules} onRuleChange={onRuleChange} />
          ) : (
            <div className="text-center py-10 text-slate-500 text-[12px]">Không tải được bảng luật (backend không khả dụng).</div>
          )}
        </>
      )}

      {subTab === "diagram" && (
        <>
          <div className="text-[12px] text-slate-400 mb-2 leading-5">
            Closed-loop block diagram. Disturbance block lights up when disturbance scenario is selected.
          </div>
          <SimulinkView disturbanceActive={disturbanceActive} />
        </>
      )}
    </div>
  );
}
