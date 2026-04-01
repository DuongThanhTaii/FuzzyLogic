import { useState } from "react";
import ScenarioTab from "./ScenarioTab";
import BISMonitorTab from "./BISMonitorTab";
import FuzzyEditorTab from "./FuzzyEditorTab";
import PatientParamsTab from "./PatientParamsTab";

const TABS = [
  { key: "scenario", label: "Kịch bản", icon: "KB" },
  { key: "monitor", label: "Theo dõi BIS", icon: "BIS" },
  { key: "fuzzy", label: "Fuzzy Logic", icon: "Fuzzy" },
  { key: "patient", label: "Bệnh nhân", icon: "BN" },
];

export default function RightPanel({
  isRunning,
  isDone,
  dataPoints,
  progress,
  backendOnline,
  onStart,
  onStop,
  onReset,
}) {
  const [activeTab, setActiveTab] = useState("scenario");
  const [scenario, setScenario] = useState("robustness");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(360);
  const [resizing, setResizing] = useState(false);

  const disturbanceActive = scenario === "disturbance";

  const startResize = (e) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startW = width;

    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const newW = Math.max(280, Math.min(620, startW + delta));
      setWidth(newW);
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (collapsed) {
    return (
      <div className="w-9 h-full bg-slate-950/95 border-l border-slate-800 flex flex-col items-center pt-3 gap-2.5 z-20 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          title="Mở rộng"
          className="bg-sky-400/10 border border-slate-700 text-sky-400 rounded-md w-7 h-7 cursor-pointer text-sm flex items-center justify-center"
        >
          {"<"}
        </button>
        {TABS.map((t) => (
          <button
            key={t.key}
            title={t.label}
            onClick={() => {
              setActiveTab(t.key);
              setCollapsed(false);
            }}
            className={`border-none bg-transparent cursor-pointer px-1 text-[11px] font-semibold ${
              activeTab === t.key ? "text-sky-300" : "text-slate-500"
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="h-full shrink-0 flex relative"
      style={{
        width,
        minWidth: 280,
        maxWidth: 620,
        userSelect: resizing ? "none" : "auto",
      }}
    >
      <div
        onMouseDown={startResize}
        title="Đổi kích thước panel"
        className={`w-[5px] h-full shrink-0 border-l border-slate-800 cursor-ew-resize transition-colors ${
          resizing ? "bg-sky-400/40" : "bg-slate-800/80"
        }`}
      />

      <div className="flex-1 bg-slate-950/95 border-l border-slate-800 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-800 bg-slate-900/80 shrink-0 flex items-center justify-between">
          <span className="text-xs font-bold text-sky-300 tracking-[0.06em]">
            ĐIỀU KHIỂN GÂY MÊ MỜ
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="bg-slate-700/50 border border-slate-600 text-slate-300 rounded-md w-6.5 h-6.5 cursor-pointer text-[13px] flex items-center justify-center"
          >
            {">"}
          </button>
        </div>

        <div className="flex border-b border-slate-800 bg-slate-900/60 shrink-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 min-w-[84px] py-2.5 px-1 border-none border-b-2 transition-all text-[11px] font-semibold tracking-[0.02em] cursor-pointer ${
                activeTab === t.key
                  ? "border-b-sky-400 bg-sky-400/10 text-sky-100"
                  : "border-b-transparent bg-transparent text-slate-500"
              }`}
            >
              <div className="text-[11px] font-bold">{t.icon}</div>
              <div>{t.label}</div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {activeTab === "scenario" && (
            <ScenarioTab
              isRunning={isRunning}
              isDone={isDone}
              progress={progress}
              backendOnline={backendOnline}
              onStart={(params) => {
                setScenario(params.scenario);
                onStart(params);
              }}
              onStop={onStop}
              onReset={onReset}
            />
          )}
          {activeTab === "monitor" && (
            <BISMonitorTab dataPoints={dataPoints} isRunning={isRunning} />
          )}
          {activeTab === "fuzzy" && (
            <FuzzyEditorTab
              disturbanceActive={disturbanceActive}
              backendOnline={backendOnline}
            />
          )}
          {activeTab === "patient" && <PatientParamsTab />}
        </div>
      </div>
    </div>
  );
}
