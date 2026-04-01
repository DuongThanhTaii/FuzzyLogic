import React, { Suspense, useRef, useEffect, memo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useGLTF, useAnimations } from '@react-three/drei';

// ─── Patient model (breathing animation) ────────────────────────────────────
const BenhNhanModel = memo(function BenhNhanModel({ animSpeed }) {
  const group = useRef();
  const targetSpeed = useRef(animSpeed);
  const { scene, animations } = useGLTF('/benh_nhan.glb');
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    targetSpeed.current = animSpeed;
  }, [animSpeed]);

  useFrame(() => {
    if (names.length > 0) {
      const action = actions[names[0]];
      if (!action.isRunning()) action.play();
      action.timeScale += (targetSpeed.current - action.timeScale) * 0.12;
    }
  });

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.roughness = 0.9;
        child.material.metalness = 0.0;
      }
    });
  }, [scene]);

  return (
    <group ref={group} position={[-10, 0.5, 0]} rotation={[0, Math.PI / 2, 0]} scale={1}>
      <primitive object={scene} />
    </group>
  );
});

// ─── Hospital bed ────────────────────────────────────────────────────────────
const GiuongModel = memo(function GiuongModel() {
  const { scene } = useGLTF('/giuong_v2.glb');
  return <primitive object={scene} position={[0, 0, 0]} scale={3} />;
});

// ─── ECG canvas drawing helper ───────────────────────────────────────────────
function drawECGFrame(ctx, state, bpm, bis, infusionRate) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Fading trail
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, W, H);

  // Erase cursor column
  ctx.fillStyle = '#000';
  ctx.fillRect(state.x, 0, 4, H);

  // Grid
  ctx.strokeStyle = '#001800';
  ctx.lineWidth = 0.4;
  for (let gx = 0; gx < W; gx += 30) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += 20) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  // ECG wave — morphology: P wave → QRS complex → T wave
  const heartRateInterval = 60000 / Math.max(bpm, 20);
  const cycle = (Date.now() % heartRateInterval) / heartRateInterval; // 0..1
  const baseline = H / 2;
  let targetY = baseline;

  // P wave (0–15%)
  if (cycle < 0.15) {
    targetY = baseline - Math.sin((cycle / 0.15) * Math.PI) * 6;
  }
  // PR segment (15–22%)
  else if (cycle < 0.22) {
    targetY = baseline;
  }
  // Q dip (22–26%)
  else if (cycle < 0.26) {
    targetY = baseline + 8;
  }
  // R spike (26–30%) — sharp QRS peak
  else if (cycle < 0.30) {
    const t = (cycle - 0.26) / 0.04;
    targetY = baseline - Math.sin(t * Math.PI) * 38;
  }
  // S wave (30–36%)
  else if (cycle < 0.36) {
    const t = (cycle - 0.30) / 0.06;
    targetY = baseline + Math.sin(t * Math.PI) * 10;
  }
  // ST segment (36–55%)
  else if (cycle < 0.55) {
    targetY = baseline - 2;
  }
  // T wave (55–80%)
  else if (cycle < 0.80) {
    const t = (cycle - 0.55) / 0.25;
    targetY = baseline - Math.sin(t * Math.PI) * 14;
  }
  // TP (diastole)
  else {
    targetY = baseline;
  }

  // Noise proportional to BIS (more awake = more motion artifact)
  const noiseAmp = bis > 70 ? 2.5 : bis > 50 ? 1.0 : 0.4;
  const noise = (Math.random() - 0.5) * noiseAmp;
  state.y += (targetY - state.y) * 0.55;

  // Draw ECG line
  ctx.strokeStyle = '#00ff44';
  ctx.lineWidth = 1.8;
  ctx.shadowColor = '#00ff44';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(state.x - 1, state.prevY);
  ctx.lineTo(state.x, state.y + noise);
  ctx.stroke();
  ctx.shadowBlur = 0;

  state.prevY = state.y + noise;
  state.x = (state.x + 2) % W;
}

// ─── Full hospital monitor display ──────────────────────────────────────────
function ChuanHospitalMonitor({ bpm, rr, spo2, sysBP, diaBP, bis, infusionRate, patientStatus, ce, scenarioEvent }) {
  const ecgRef = useRef(null);
  const ecgState = useRef({ x: 0, y: 60, prevY: 60 });

  useEffect(() => {
    const canvas = ecgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 270;
    canvas.height = 80;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let animId;
    const loop = () => {
      drawECGFrame(ctx, ecgState.current, bpm, bis, infusionRate);
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [bpm, bis, infusionRate]);

  const hrColor  = bpm < 50 ? '#ff4444' : bpm > 100 ? '#ffaa00' : '#00ff44';
  const bisColor = bis < 40 ? '#ff4444' : bis < 60  ? '#00ff44' : '#ffcc00';

  const statusMap = {
    awake: { text: 'TỈNH TÁO', color: '#ffcc00' },
    light: { text: 'MÊ NHẸ', color: '#ffa500' },
    ideal: { text: 'MÊ LÝ TƯỞNG', color: '#00ff44' },
    deep: { text: 'MÊ SÂU', color: '#ff8800' },
    critical: { text: '⚠ NGUY KỊCH', color: '#ff2222' },
  };
  const st = statusMap[patientStatus] || statusMap.ideal;

  return (
    <div style={{
      width: '300px',
      background: '#020808',
      border: '3px solid #1a2a1a',
      borderRadius: '6px',
      padding: '8px 10px',
      fontFamily: '"Courier New", monospace',
      boxSizing: 'border-box',
      boxShadow: '0 0 20px rgba(0,255,68,0.08)',
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#006600', fontSize: 9 }}>PHILIPS INTELLIVUE</span>
        <span style={{ color: st.color, fontSize: 9, fontWeight: 'bold' }}>{st.text}</span>
        <span style={{ color: '#006600', fontSize: 9 }}>
          {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* ECG row */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: '#00cc44', fontSize: 9 }}>ECG II — {bpm} bpm</span>
        <canvas
          ref={ecgRef}
          style={{ display: 'block', width: '100%', height: '80px', background: '#020a02', borderRadius: 3 }}
        />
      </div>

      {/* SpO2 flat line */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ color: '#00ccff', fontSize: 9 }}>SpO₂ PLETH</span>
        <div style={{ width: '100%', height: 18, background: '#020a0a', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, #00ccff 0%, #00ccff 60%, transparent 60%)`,
            opacity: 0.7,
          }} />
        </div>
      </div>

      {/* Vitals grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 8px' }}>

        {/* HR */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#00cc44' }}>HR bpm</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: hrColor, lineHeight: 1 }}>{bpm}</div>
        </div>

        {/* BIS */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: bisColor }}>BIS</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: bisColor, lineHeight: 1 }}>
            {bis != null ? Math.round(bis) : '--'}
          </div>
        </div>

        {/* SpO2 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#00ccff' }}>SpO₂ %</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#00ccff', lineHeight: 1 }}>{spo2}</div>
        </div>

        {/* NIBP */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#ff4466' }}>NIBP</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ff4466', lineHeight: 1.2 }}>
            {sysBP}<span style={{ fontSize: 12 }}>/{diaBP}</span>
          </div>
        </div>

        {/* Propofol rate */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#cc88ff' }}>PROP</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#cc88ff', lineHeight: 1.2 }}>
            {infusionRate != null ? infusionRate.toFixed(1) : '--'}
            <span style={{ fontSize: 9 }}> ml/h</span>
          </div>
        </div>

        {/* RR (respiratory rate from breathSpeed) */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#ffcc00' }}>RR /min</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ffcc00', lineHeight: 1.2 }}>
            {rr ?? 16}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#7dd3fc' }}>Ce</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#7dd3fc', lineHeight: 1.2 }}>
            {ce != null ? ce.toFixed(2) : '--'}
          </div>
        </div>
      </div>

      {/* BIS bar */}
      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#446644', marginBottom: 2 }}>
          <span>0 — Đẳng điện</span><span>50 — Phẫu thuật</span><span>100 — Tỉnh</span>
        </div>
        <div style={{ height: 6, background: '#0a1a0a', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${bis != null ? bis : 50}%`,
            background: bis < 40
              ? 'linear-gradient(90deg, #ff2222, #ff6600)'
              : bis < 60
              ? 'linear-gradient(90deg, #00cc44, #44ff88)'
              : 'linear-gradient(90deg, #ffcc00, #ff8800)',
            transition: 'width 0.5s ease, background 0.5s ease',
          }} />
          {/* Setpoint marker at 50 */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: '50%',
            width: 1.5, background: '#ffffff44',
          }} />
        </div>
      </div>

      <div style={{
        marginTop: 6,
        minHeight: 14,
        color: scenarioEvent ? '#93c5fd' : '#335577',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.03em',
      }}>
        {scenarioEvent ? `SỰ KIỆN: ${scenarioEvent}` : 'SỰ KIỆN: ổn định'}
      </div>
    </div>
  );
}

// ─── Monitor 3D model wrapper ────────────────────────────────────────────────
function MayMonitorModel({ bpm, rr, spo2, sysBP, diaBP, bis, infusionRate, patientStatus, ce, scenarioEvent }) {
  const { scene } = useGLTF('/may_monitor.glb');
  return (
    <group position={[-100, 0, -150]} rotation={[0, Math.PI / 4, 0]}>
      <primitive object={scene} scale={150} />
      <Html transform position={[0, 187, 38]} scale={8.5}>
        <ChuanHospitalMonitor
          bpm={bpm}
          rr={rr}
          spo2={spo2}
          sysBP={sysBP}
          diaBP={diaBP}
          bis={bis}
          infusionRate={infusionRate}
          patientStatus={patientStatus}
          ce={ce}
          scenarioEvent={scenarioEvent}
        />
      </Html>
    </group>
  );
}

function Loader() {
  return (
    <Html center>
      <div style={{ color: '#00ff44', fontFamily: 'monospace', fontSize: '16px', background: 'rgba(0,0,0,0.85)', padding: '10px 20px', borderRadius: '8px' }}>
        Đang đưa bệnh nhân vào phòng...
      </div>
    </Html>
  );
}

// ─── Main Scene ──────────────────────────────────────────────────────────────
export default function Scene3D({ bpm, breathSpeed, rr, spo2, sysBP, diaBP, bis, infusionRate, patientStatus, ce, scenarioEvent }) {
  return (
    <Canvas camera={{ position: [9, 80, 300], fov: 55 }} dpr={[1, 1.5]} style={{ background: '#111' }}>
      <ambientLight intensity={0.1} />
      <spotLight position={[0, 1, 0]} angle={0.6} penumbra={1} intensity={0.8} />
      <OrbitControls makeDefault />
      <Suspense fallback={<Loader />}>
        <GiuongModel />
        <BenhNhanModel animSpeed={breathSpeed} />
        <MayMonitorModel
          bpm={bpm}
          rr={rr}
          spo2={spo2}
          sysBP={sysBP}
          diaBP={diaBP}
          bis={bis}
          infusionRate={infusionRate}
          patientStatus={patientStatus}
          ce={ce}
          scenarioEvent={scenarioEvent}
        />
      </Suspense>
      <Environment preset="forest" />
    </Canvas>
  );
}
