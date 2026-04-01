import { useState } from 'react';

const PATIENT_TYPES = [
  { value: 'child', label: 'Trẻ em', detail: '~30 kg / 8 tuổi', weight: 30 },
  { value: 'adult', label: 'Người lớn', detail: '~70 kg / 35 tuổi', weight: 70 },
  { value: 'elderly', label: 'Người già', detail: '~65 kg / 70 tuổi', weight: 65 },
];

const SCENARIOS = [
  {
    value: 'robustness',
    label: 'KB1 - Độ bền',
    badge: 'KB1',
    color: '#38bdf8',
    desc: 'Hội tụ về BIS=50 với các cơ địa khác nhau. Không đổi bộ điều khiển.',
    danger: false,
  },
  {
    value: 'disturbance',
    label: 'KB2 - Nhiễu',
    badge: 'KB2',
    color: '#f59e0b',
    desc: 'Bơm nhiễu phẫu thuật tại thời điểm cài đặt. Bộ điều khiển phục hồi BIS.',
    danger: false,
  },
  {
    value: 'overdose',
    label: 'KB3 - Quá liều',
    badge: 'KB3',
    color: '#ef4444',
    desc: 'Bệnh nhân đã nạp sẵn thuốc cao (BIS < 20). Bộ điều khiển dừng bơm để cứu.',
    danger: true,
  },
  {
    value: 'resistance',
    label: 'KB4 - Kháng thuốc',
    badge: 'KB4',
    color: '#a855f7',
    desc: 'EC50 tăng 1.8x. Bộ điều khiển phải tăng liều để đạt mục tiêu.',
    danger: true,
  },
  {
    value: 'induction',
    label: 'KB5 - Khởi mê',
    badge: 'KB5',
    color: '#22c55e',
    desc: 'Liều bolus khởi mê rồi chuyển sang duy trì tự động.',
    danger: false,
  },
];

export default function ScenarioTab({
  isRunning,
  isDone,
  progress = 0,
  onStart,
  onStop,
  onReset,
  backendOnline,
}) {
  const [patientType, setPatientType] = useState('adult');
  const [scenario, setScenario] = useState('robustness');
  const [duration, setDuration] = useState(30);
  const [disturbTime, setDisturbTime] = useState(10);
  const [disturbAmp, setDisturbAmp] = useState(15);

  const sc = SCENARIOS.find((s) => s.value === scenario);
  const pt = PATIENT_TYPES.find((p) => p.value === patientType);
  const canRun = backendOnline && !isRunning;

  const handleRun = () => {
    if (!canRun) return;
    onStart({
      patient_type: patientType,
      weight: pt.weight,
      scenario,
      duration,
      disturbance_time: disturbTime,
      disturbance_amplitude: disturbAmp,
    });
  };

  return (
    <div className="p-3 text-slate-200 text-xs">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-3 border ${
          backendOnline === null
            ? 'bg-slate-500/15 border-slate-700'
            : backendOnline
              ? 'bg-emerald-500/10 border-emerald-600/30'
              : 'bg-red-500/10 border-red-600/30'
        }`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            backendOnline === null
              ? 'bg-slate-500'
              : backendOnline
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-red-500'
          }`}
        />
        <span
          className={`text-[10px] font-semibold ${
            backendOnline === null
              ? 'text-slate-500'
              : backendOnline
                ? 'text-emerald-300'
                : 'text-red-300'
          }`}
        >
          {backendOnline === null
            ? 'Đang kiểm tra backend...'
            : backendOnline
              ? 'Máy chủ online - sẵn sàng mô phỏng'
              : 'Máy chủ offline - chạy start.bat'}
        </span>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.07em] mb-1.5">Cơ địa bệnh nhân</div>
        <div className="flex gap-1.5">
          {PATIENT_TYPES.map((p) => (
            <button
              key={p.value}
              onClick={() => !isRunning && setPatientType(p.value)}
              className={`flex-1 py-2 px-1 rounded-md border text-center transition-all ${
                patientType === p.value
                  ? 'border-sky-400 bg-sky-400/10 text-sky-100'
                  : 'border-slate-700 bg-white/[0.02] text-slate-400'
              } ${isRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="text-[11px] font-bold">{p.label}</div>
              <div className="text-[9px] text-slate-500">{p.detail}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.07em] mb-1.5">Kịch bản mô phỏng</div>
        <div className="flex flex-col gap-1">
          {SCENARIOS.map((item) => (
            <div
              key={item.value}
              onClick={() => !isRunning && setScenario(item.value)}
              className={`px-2.5 py-2 rounded-md border transition-all ${
                scenario === item.value
                  ? ''
                  : item.danger
                    ? 'bg-red-500/[0.03] border-[#2d1b1b]'
                    : 'bg-white/[0.02] border-slate-700'
              } ${isRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                borderColor:
                  scenario === item.value
                    ? item.color
                    : item.danger
                      ? '#2d1b1b'
                      : '#2d3748',
                background:
                  scenario === item.value
                    ? `${item.color}10`
                    : item.danger
                      ? 'rgba(239,68,68,0.03)'
                      : 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500">{item.badge}</span>
                <span className="text-[11px] font-bold" style={{ color: scenario === item.value ? item.color : '#94a3b8' }}>
                  {item.label}
                </span>
                {item.danger && <span className="ml-auto text-[9px] px-1.5 py-[1px] rounded bg-red-500/20 text-red-400 font-bold">NGUY CẤP</span>}
              </div>
              {scenario === item.value && <div className="text-[10px] text-slate-500 mt-1 leading-[1.5]">{item.desc}</div>}
            </div>
          ))}
        </div>

        {scenario === 'disturbance' && (
          <div className="mt-2 p-2.5 bg-amber-500/[0.06] rounded-md border border-amber-500/20">
            {[
              { label: 'Thời điểm nhiễu', value: disturbTime, unit: 'phút', min: 2, max: 25, set: setDisturbTime },
              { label: 'Biên độ nhiễu', value: disturbAmp, unit: 'BIS', min: 5, max: 35, set: setDisturbAmp },
            ].map((s) => (
              <div key={s.label} className="mb-1.5">
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>{s.label}</span>
                  <span className="text-amber-200 font-bold">
                    {s.value} {s.unit}
                  </span>
                </div>
                <input type="range" min={s.min} max={s.max} value={s.value} onChange={(e) => s.set(+e.target.value)} className="w-full accent-amber-500" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3.5">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span className="uppercase font-bold tracking-[0.07em]">Thời gian</span>
            <span className="text-sky-300 font-bold">
            {duration} phút (~{Math.round(duration * 3)}s demo)
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={duration}
          disabled={isRunning}
          onChange={(e) => setDuration(+e.target.value)}
          className="w-full accent-sky-400"
        />
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={handleRun}
          disabled={!canRun}
          className={`flex-[2] py-2.5 rounded-lg border-none text-white text-xs font-bold transition-all ${
            !canRun
              ? 'bg-slate-700/50 text-slate-600 cursor-not-allowed'
              : isRunning
                ? 'bg-emerald-700 cursor-pointer'
                : sc?.danger
                  ? 'bg-red-600 cursor-pointer'
                  : 'bg-emerald-600 cursor-pointer'
          }`}
        >
          {isRunning ? 'Đang mô phỏng...' : !backendOnline ? 'Máy chủ offline' : `Chạy ${sc?.badge ?? 'KB'}`}
        </button>

        <button onClick={onStop} disabled={!isRunning} className={`flex-1 py-2.5 rounded-lg border-none text-sm font-bold ${!isRunning ? 'bg-slate-700/40 text-slate-600 cursor-not-allowed' : 'bg-red-600 text-white cursor-pointer'}`}>
          Dừng
        </button>
        <button onClick={onReset} disabled={isRunning} className={`flex-1 py-2.5 rounded-lg border-none text-sm font-bold ${isRunning ? 'bg-slate-700/40 text-slate-600 cursor-not-allowed' : 'bg-indigo-600 text-white cursor-pointer'}`}>
          Đặt lại
        </button>
      </div>

      {isRunning && (
        <div className="mt-2.5">
          <div className="flex justify-between items-center text-[10px] mb-1">
            <span className="text-emerald-300 font-bold">Tiến trình</span>
            <span className="text-emerald-500 font-bold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-900/90 border border-emerald-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.35)] transition-[width] duration-200"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      )}

      {isRunning && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md text-[10px] leading-[1.5]" style={{ background: `${sc?.color ?? '#38bdf8'}11`, border: `1px solid ${sc?.color ?? '#38bdf8'}33`, color: sc?.color ?? '#38bdf8' }}>
          {sc?.label} - {pt?.label} đang chạy...
          {sc?.danger && ' Theo dõi kỹ BIS và HR.'}
        </div>
      )}

      {isDone && !isRunning && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md text-[10px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
          Mô phỏng đã hoàn tất. Mở tab Theo dõi BIS.
        </div>
      )}
    </div>
  );
}
