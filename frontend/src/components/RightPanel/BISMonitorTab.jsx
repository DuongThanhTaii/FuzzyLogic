import { useEffect, useRef } from 'react';

const SETPOINT = 50;

function downloadCSV(dataPoints) {
  const header = 'ThoiGian(phut),BIS,TocDoTruyen(ml/hr),SaiSo\n';
  const rows = dataPoints.map((d) => `${d.t},${d.bis},${d.rate},${d.error}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'simulation_data.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function drawChart({
  canvas,
  xValues,
  yValues,
  yMin,
  yMax,
  lineColor,
  fillColor,
  showSetpoint = false,
  setpoint = SETPOINT,
  safeBand = null,
  title = '',
}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b1326';
  ctx.fillRect(0, 0, width, height);

  const padL = 46;
  const padR = 14;
  const padT = 24;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xMin = xValues.length ? xValues[0] : 0;
  const xMax = xValues.length ? xValues[xValues.length - 1] : 1;
  const xRange = Math.max(0.001, xMax - xMin);
  const yRange = Math.max(0.001, yMax - yMin);

  const toX = (x) => padL + ((x - xMin) / xRange) * plotW;
  const toY = (y) => padT + (1 - (y - yMin) / yRange) * plotH;

  if (safeBand) {
    const y0 = toY(safeBand.max);
    const y1 = toY(safeBand.min);
    ctx.fillStyle = 'rgba(34,197,94,0.14)';
    ctx.fillRect(padL, y0, plotW, y1 - y0);
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  for (let i = 0; i <= 5; i += 1) {
    const gy = padT + (i / 5) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padL + plotW, gy);
    ctx.stroke();
  }

  if (showSetpoint) {
    ctx.strokeStyle = '#fbbf24';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.7;
    const sy = toY(setpoint);
    ctx.beginPath();
    ctx.moveTo(padL, sy);
    ctx.lineTo(padL + plotW, sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (xValues.length > 1) {
    ctx.beginPath();
    xValues.forEach((x, idx) => {
      const px = toX(x);
      const py = toY(yValues[idx]);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (fillColor) {
      ctx.lineTo(toX(xValues[xValues.length - 1]), padT + plotH);
      ctx.lineTo(toX(xValues[0]), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.beginPath();
    xValues.forEach((x, idx) => {
      const px = toX(x);
      const py = toY(yValues[idx]);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    const lx = toX(xValues[xValues.length - 1]);
    const ly = toY(yValues[yValues.length - 1]);
    ctx.beginPath();
    ctx.fillStyle = lineColor;
    ctx.arc(lx, ly, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText(title, padL, 16);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText(yMax.toString(), 10, padT + 4);
  ctx.fillText(yMin.toString(), 10, padT + plotH);
  ctx.fillText('Thời gian (phút)', width - 120, height - 8);
  ctx.fillText(`${xMax.toFixed(1)}`, width - 34, height - 8);
}

export default function BISMonitorTab({ dataPoints, isRunning }) {
  const bisRef = useRef(null);
  const rateRef = useRef(null);

  const times = dataPoints.map((d) => d.t);
  const bisArr = dataPoints.map((d) => d.bis);
  const rateArr = dataPoints.map((d) => d.rate);
  const isEmpty = dataPoints.length === 0;

  useEffect(() => {
    drawChart({
      canvas: bisRef.current,
      xValues: times,
      yValues: bisArr,
      yMin: 0,
      yMax: 100,
      lineColor: '#38bdf8',
      fillColor: null,
      showSetpoint: true,
      setpoint: SETPOINT,
      safeBand: { min: 40, max: 60 },
      title: 'Biểu đồ BIS',
    });
  }, [times, bisArr]);

  useEffect(() => {
    drawChart({
      canvas: rateRef.current,
      xValues: times,
      yValues: rateArr,
      yMin: 0,
      yMax: 55,
      lineColor: '#818cf8',
      fillColor: 'rgba(99,102,241,0.18)',
      title: 'Tốc độ truyền (ml/hr)',
    });
  }, [times, rateArr]);

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>Xu hướng BIS</div>
        <button
          onClick={() => downloadCSV(dataPoints)}
          disabled={isEmpty}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #475569',
            background: isEmpty ? 'rgba(51,65,85,0.35)' : 'rgba(30,41,59,0.95)',
            color: isEmpty ? '#64748b' : '#cbd5e1',
            fontSize: 12,
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
        >
          Tải CSV
        </button>
      </div>

      {isEmpty ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 320,
            color: '#64748b',
            fontSize: 14,
            gap: 10,
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700 }}>Chưa có dữ liệu mô phỏng</span>
          {isRunning && <span style={{ color: '#67e8f9', fontSize: 13 }}>Đang nhận dữ liệu...</span>}
        </div>
      ) : (
        <>
          <canvas ref={bisRef} width={620} height={250} style={{ width: '100%', height: 250, borderRadius: 10, border: '1px solid #334155' }} />
          <canvas ref={rateRef} width={620} height={210} style={{ width: '100%', height: 210, borderRadius: 10, border: '1px solid #334155' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'BIS hiện tại', value: bisArr.at(-1)?.toFixed(1) ?? '--', color: '#38bdf8' },
              { label: 'Tốc độ truyền', value: rateArr.at(-1) != null ? `${rateArr.at(-1).toFixed(1)} ml/hr` : '--', color: '#818cf8' },
              { label: 'BIS thấp nhất', value: bisArr.length ? Math.min(...bisArr).toFixed(1) : '--', color: '#f87171' },
              { label: 'BIS cao nhất', value: bisArr.length ? Math.max(...bisArr).toFixed(1) : '--', color: '#fde68a' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid #334155',
                  borderRadius: 10,
                  padding: '9px 12px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
