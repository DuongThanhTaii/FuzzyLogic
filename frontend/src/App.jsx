import { useMemo, useEffect, useState } from "react";
import Heart3D from "./components/Heart3D/Heart3D";
import Scene3D from "./components/Scene3D/Scene3D";
import RightPanel from "./components/RightPanel/RightPanel";
import { useSimulation } from "./hooks/useSimulation";
import { useBackendHealth } from "./hooks/useBackendHealth";
import "./App.css";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const STATUS_CFG = {
  awake: { text: "TỈNH", color: "#fbbf24", glow: "#fbbf2444" },
  light: { text: "MÊ NHẸ", color: "#fb923c", glow: "#fb923c44" },
  ideal: { text: "MỤC TIÊU", color: "#4ade80", glow: "#4ade8044" },
  deep: { text: "MÊ SÂU", color: "#60a5fa", glow: "#60a5fa44" },
  critical: { text: "NGUY KỊCH", color: "#ef4444", glow: "#ef444488" },
};

const BIS_SETPOINT = 50;

const DEFAULT_FRAME = {
  bis: null,
  rate: null,
  t: null,
  heart_rate: 78,
  respiratory_rate: 16,
  spo2: 99,
  sys_bp: 118,
  dia_bp: 76,
  state: "awake",
  ce: 0,
  scenario_event: null,
};

export default function App() {
  const backendOnline = useBackendHealth();
  const {
    isRunning,
    isDone,
    dataPoints,
    error,
    progress,
    durationMin,
    start,
    stop,
    reset,
  } = useSimulation();

  const latestFrame = useMemo(
    () => dataPoints[dataPoints.length - 1] ?? null,
    [dataPoints],
  );
  const bis = useMemo(() => {
    const v = latestFrame?.bis;
    return v != null && v >= 0 && v <= 100 ? v : null;
  }, [latestFrame]);
  const infusionRate = latestFrame?.rate ?? null;
  const tMin = latestFrame?.t ?? null;

  const targetFrame = useMemo(
    () => ({
      ...DEFAULT_FRAME,
      ...(latestFrame ?? {}),
      bis,
      rate: infusionRate,
      t: tMin,
    }),
    [latestFrame, bis, infusionRate, tMin],
  );

  const [vitals, setVitals] = useState(targetFrame);

  useEffect(() => {
    setVitals((prev) => ({
      ...prev,
      state: targetFrame.state,
      scenario_event: targetFrame.scenario_event,
    }));
    const id = setInterval(() => {
      setVitals((prev) => ({
        ...prev,
        bis: targetFrame.bis,
        rate: targetFrame.rate,
        t: targetFrame.t,
        ce: prev.ce + (targetFrame.ce - prev.ce) * 0.18,
        heart_rate:
          prev.heart_rate + (targetFrame.heart_rate - prev.heart_rate) * 0.22,
        respiratory_rate:
          prev.respiratory_rate +
          (targetFrame.respiratory_rate - prev.respiratory_rate) * 0.22,
        spo2: prev.spo2 + (targetFrame.spo2 - prev.spo2) * 0.16,
        sys_bp: prev.sys_bp + (targetFrame.sys_bp - prev.sys_bp) * 0.16,
        dia_bp: prev.dia_bp + (targetFrame.dia_bp - prev.dia_bp) * 0.16,
      }));
    }, 120);
    return () => clearInterval(id);
  }, [targetFrame]);

  const status = vitals.state ?? "awake";
  const bpm = Math.round(vitals.heart_rate);
  const rr = Math.round(vitals.respiratory_rate);
  const spo2 = Math.round(vitals.spo2);
  const sysBP = Math.round(vitals.sys_bp);
  const diaBP = Math.round(vitals.dia_bp);
  const breathSpeed = clamp(rr / 12, 0.18, 1.45);
  const st = STATUS_CFG[status] ?? STATUS_CFG.awake;
  const isCritical = status === "critical" && isRunning;
  const errorValue =
    bis != null ? Number((BIS_SETPOINT - bis).toFixed(3)) : null;
  const deltaErrorValue =
    typeof latestFrame?.delta_error === "number"
      ? Number(latestFrame.delta_error.toFixed(3))
      : null;
  const [isFormulaVisible, setIsFormulaVisible] = useState(true);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        background: "#060d1a",
      }}
    >
      <Heart3D bpm={bpm} />

      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <Scene3D
          bpm={bpm}
          breathSpeed={breathSpeed}
          bis={bis}
          infusionRate={infusionRate}
          patientStatus={status}
          rr={rr}
          spo2={spo2}
          sysBP={sysBP}
          diaBP={diaBP}
          ce={vitals.ce}
          scenarioEvent={vitals.scenario_event}
        />

        {isCritical && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              pointerEvents: "none",
              border: "3px solid #ef4444",
              animation: "criticalBlink 0.8s ease-in-out infinite",
              borderRadius: 0,
            }}
          />
        )}

        {bis !== null && (
          <div className="absolute bottom-5 left-5 z-10 flex items-stretch gap-2">
            <div
              className="h-24 min-w-[88px] rounded-[10px] px-3 py-2 text-center flex flex-col justify-between"
              style={{
                background: "rgba(6,13,26,0.92)",
                border: `1.5px solid ${st.glow}`,
                backdropFilter: "blur(8px)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                boxShadow: isCritical ? `0 0 20px ${st.glow}` : "none",
                animation: isCritical
                  ? "criticalBlink 0.8s ease-in-out infinite"
                  : "none",
              }}
            >
              <div className="text-[9px] text-slate-500">BIS Index</div>
              <div className="text-[36px] leading-none font-black" style={{ color: st.color }}>{Math.round(bis)}</div>
              <div className="text-[10px] font-bold" style={{ color: st.color }}>{st.text}</div>
            </div>

            <div
              className="h-24 min-w-[88px] rounded-[10px] px-3 py-2 text-center flex flex-col justify-between"
              style={{
                background: "rgba(6,13,26,0.92)",
                border: "1.5px solid #7c3aed44",
                backdropFilter: "blur(8px)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              <div className="text-[9px] text-slate-500">PROPOFOL</div>
              <div className="text-[36px] leading-none font-black text-violet-300">{infusionRate?.toFixed(1) ?? "--"}</div>
              <div className="text-[10px] text-violet-500">ml / hr</div>
            </div>

            <div
              className="h-24 min-w-[88px] rounded-[10px] px-3 py-2 text-center flex flex-col justify-between"
              style={{
                background: "rgba(6,13,26,0.92)",
                border: "1.5px solid #16a34a44",
                backdropFilter: "blur(8px)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              <div className="text-[9px] text-slate-500">HR</div>
              <div className="text-[36px] leading-none font-black text-emerald-400">{bpm}</div>
              <div className="text-[10px] text-emerald-700">bpm</div>
            </div>

            <div
              className="h-24 min-w-[88px] rounded-[10px] px-3 py-2 text-center flex flex-col justify-between"
              style={{
                background: "rgba(6,13,26,0.92)",
                border: "1.5px solid #f59e0b44",
                backdropFilter: "blur(8px)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              <div className="text-[9px] text-slate-500">RR</div>
              <div className="text-[36px] leading-none font-black text-amber-300">{rr}</div>
              <div className="text-[10px] text-amber-700">/min</div>
            </div>
          </div>
        )}

        {isRunning && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(6,13,26,0.92)",
              border: "1px solid #22c55e33",
              borderRadius: 16,
              padding: "8px 14px",
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 280,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22c55e",
                animation: "simPulse 1s infinite",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#86efac",
                  fontSize: 11,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontWeight: 700,
                }}
              >
                <span>t = {tMin?.toFixed(1) ?? "0.0"} phút</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid #14532d",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #16a34a, #22c55e)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
              {durationMin > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: "#4ade80aa",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  }}
                >
                  Thời lượng cài đặt: {durationMin} phút
                </div>
              )}
              {vitals.scenario_event && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: "#93c5fd",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  }}
                >
                  Sự kiện: {vitals.scenario_event}
                </div>
              )}
            </div>
          </div>
        )}

        {isFormulaVisible ? (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 14,
              width: "min(46vw, 500px)",
              background: "rgba(6,13,26,0.92)",
              border: "1px solid #2563eb55",
              borderRadius: 14,
              padding: "12px 14px",
              zIndex: 18,
              backdropFilter: "blur(8px)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              boxShadow: "0 12px 26px rgba(2, 6, 23, 0.45)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div
                style={{
                  color: "#93c5fd",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                }}
              >
                GIẢI THÍCH ĐIỀU KHIỂN FUZZY (ĐỒNG BỘ MONITOR)
              </div>
              <button
                type="button"
                title="Ẩn bảng công thức"
                onClick={() => setIsFormulaVisible(false)}
                style={{
                  border: "1px solid #1d4ed866",
                  borderRadius: 6,
                  background: "rgba(15,23,42,0.95)",
                  color: "#bfdbfe",
                  fontSize: 12,
                  fontWeight: 800,
                  width: 30,
                  height: 22,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                −
              </button>
            </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {[
              {
                label: "BIS",
                value: bis != null ? bis.toFixed(2) : "--",
                color: "#67e8f9",
              },
              {
                label: "e",
                value: errorValue != null ? errorValue.toFixed(3) : "--",
                color: "#fcd34d",
              },
              {
                label: "Δe",
                value:
                  deltaErrorValue != null ? deltaErrorValue.toFixed(3) : "--",
                color: "#f9a8d4",
              },
              {
                label: "u (ml/hr)",
                value:
                  infusionRate != null ? infusionRate.toFixed(3) : "--",
                color: "#86efac",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1px solid #1e3a8a55",
                  borderRadius: 9,
                  padding: "7px 8px",
                  background: "rgba(15,23,42,0.6)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

            <div
              style={{
                border: "1px solid #1d4ed844",
                borderRadius: 10,
                padding: "10px",
                background: "linear-gradient(180deg, rgba(3,7,18,0.5), rgba(2,6,23,0.8))",
                color: "#cbd5e1",
                fontSize: 11,
                lineHeight: 1.65,
              }}
            >
            <div style={{ color: "#bfdbfe", fontWeight: 700, marginBottom: 5 }}>
              Công thức giải mờ (centroid):
            </div>
            <div
              style={{
                color: "#dbeafe",
                marginBottom: 8,
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>u*</span>
                <span>=</span>
                <span
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    minWidth: 168,
                    textAlign: "center",
                  }}
                >
                  <span style={{ borderBottom: "1px solid #93c5fd99", paddingBottom: 2 }}>
                    ∫ μ(u) · u du
                  </span>
                  <span style={{ paddingTop: 2 }}>∫ μ(u) du</span>
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#93c5fd" }}>
                <span>=</span>
                <span
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    minWidth: 214,
                    textAlign: "center",
                  }}
                >
                  <span style={{ borderBottom: "1px solid #93c5fd99", paddingBottom: 2 }}>
                    ∫ μ(u|e={errorValue != null ? errorValue.toFixed(3) : "--"}, Δe={deltaErrorValue != null ? deltaErrorValue.toFixed(3) : "--"}) · u du
                  </span>
                  <span style={{ paddingTop: 2 }}>
                    ∫ μ(u|e={errorValue != null ? errorValue.toFixed(3) : "--"}, Δe={deltaErrorValue != null ? deltaErrorValue.toFixed(3) : "--"}) du
                  </span>
                </span>
                <span style={{ color: "#86efac", fontWeight: 800, whiteSpace: "nowrap" }}>
                  = {infusionRate != null ? infusionRate.toFixed(3) : "--"} ml/hr
                </span>
              </div>
            </div>
            <div>
              BIS = {bis != null ? bis.toFixed(2) : "--"}
            </div>
            <div>
              e = {BIS_SETPOINT} - {bis != null ? bis.toFixed(2) : "BIS"} = {errorValue != null ? errorValue.toFixed(3) : "--"}
            </div>
            <div>
              Δe = e(k) - e(k-1) = {deltaErrorValue != null ? deltaErrorValue.toFixed(3) : "--"}
            </div>
            <div style={{ marginTop: 4, color: "#dbeafe" }}>
              u* = F(e, Δe)
              {" = "}
              F({errorValue != null ? errorValue.toFixed(3) : "--"}, {deltaErrorValue != null ? deltaErrorValue.toFixed(3) : "--"})
              {" = "}
              {infusionRate != null ? infusionRate.toFixed(3) : "--"} ml/hr
            </div>
            <div style={{ color: "#86efac", fontWeight: 800, marginTop: 6 }}>
              Kết quả sau giải mờ: u = {infusionRate != null ? infusionRate.toFixed(3) : "--"} ml/hr
            </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 14,
              zIndex: 18,
              display: "flex",
              gap: 6,
            }}
          >
            <button
              type="button"
              title="Hiện bảng công thức"
              onClick={() => setIsFormulaVisible(true)}
              style={{
                border: "1px solid #1d4ed866",
                borderRadius: 6,
                background: "rgba(6,13,26,0.92)",
                color: "#bfdbfe",
                fontSize: 12,
                fontWeight: 800,
                width: 30,
                height: 22,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              □
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              bottom: 100,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid #ef4444",
              borderRadius: 8,
              padding: "10px 20px",
              zIndex: 30,
              color: "#fca5a5",
              fontSize: 11,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              maxWidth: 420,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}

        {backendOnline === false && !isRunning && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid #ef444444",
              borderRadius: 20,
              padding: "4px 16px",
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#ef4444",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "#fca5a5",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              Máy chủ offline. Hãy chạy start.bat
            </span>
          </div>
        )}
      </div>

      <RightPanel
        isRunning={isRunning}
        isDone={isDone}
        dataPoints={dataPoints}
        progress={progress}
        backendOnline={backendOnline}
        onStart={start}
        onStop={stop}
        onReset={reset}
      />

      <style>{`
        @keyframes simPulse     { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes criticalBlink{ 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar       { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: rgba(6,13,26,0.4); }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>
    </div>
  );
}
