import { useState, useEffect } from 'react';

function computePKPD(weight, age, gender) {
  const height = gender === 'male' ? 1.7 : 1.62;
  const lbm = gender === 'male'
    ? 1.1 * weight - 128 * (weight / (100 * height)) ** 2
    : 1.07 * weight - 148 * (weight / (100 * height)) ** 2;

  const V1 = 0.228 * weight;
  const V2 = 0.463 * weight;
  const V3 = 2.893 * weight;
  const Cl1 = +(0.119 * weight ** 0.75 * (age / 35) ** (-0.26)).toFixed(3);
  const Cl2 = +(0.112 * weight ** 0.75).toFixed(3);
  const Cl3 = +(0.042 * weight ** 0.75).toFixed(3);
  const ke0 = +(0.456 * (weight / 70) ** (-0.15)).toFixed(4);
  const EC50 = +(3.4 * (1 + (age - 35) * 0.02)).toFixed(2);

  return {
    'Khối nạc ước tính (LBM)': +lbm.toFixed(2),
    'V1 (L)': +V1.toFixed(1),
    'V2 (L)': +V2.toFixed(1),
    'V3 (L)': +V3.toFixed(1),
    'Cl1 (L/phút)': Cl1,
    'Cl2 (L/phút)': Cl2,
    'Cl3 (L/phút)': Cl3,
    'ke0 (phút^-1)': ke0,
    'EC50 (mg/L)': EC50,
    'γ (Hill)': 2.6,
  };
}

const SLIDER_STYLE = {
  width: '100%',
  accentColor: '#38bdf8',
  WebkitAppearance: 'none',
  appearance: 'none',
  background: 'transparent',
  marginTop: 4,
};

export default function PatientParamsTab() {
  const [weight, setWeight] = useState(70);
  const [age, setAge] = useState(35);
  const [gender, setGender] = useState('male');
  const [params, setParams] = useState({});

  useEffect(() => {
    setParams(computePKPD(weight, age, gender));
  }, [weight, age, gender]);

  return (
    <div style={{ padding: '14px 16px', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Giới tính</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['male', 'female'].map((g) => (
            <button key={g} onClick={() => setGender(g)} style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: '1.5px solid',
              borderColor: gender === g ? '#38bdf8' : '#334155',
              background: gender === g ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: gender === g ? '#e0f2fe' : '#64748b',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {g === 'male' ? 'Nam' : 'Nữ'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Cân nặng</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Khối lượng</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{weight} kg</span>
        </div>
        <input type="range" min={20} max={120} value={weight} onChange={(e) => setWeight(+e.target.value)} style={SLIDER_STYLE} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
          <span>20 kg</span><span>120 kg</span>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tuổi</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Tuổi bệnh nhân</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{age} tuổi</span>
        </div>
        <input type="range" min={5} max={90} value={age} onChange={(e) => setAge(+e.target.value)} style={SLIDER_STYLE} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
          <span>5</span><span>90</span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Tham số PK/PD (Marsh)
        </span>
        <div style={{
          marginTop: 10, background: 'rgba(15,23,42,0.8)', borderRadius: 8, padding: '10px 12px',
          border: '1px solid #1e293b', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px',
        }}>
          {Object.entries(params).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 9, color: '#64748b' }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7dd3fc', fontFamily: 'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#475569', lineHeight: 1.6 }}>
          Công thức Marsh được hiệu chỉnh theo cân nặng và tuổi. Kéo thanh trượt để xem ảnh hưởng lên tham số PK/PD.
        </div>
      </div>
    </div>
  );
}
