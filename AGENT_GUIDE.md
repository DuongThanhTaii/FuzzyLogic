# HƯỚNG DẪN TRIỂN KHAI – Mô phỏng Điều khiển Gây mê Vòng kín bằng Logic Mờ

> **Mục đích file này**: Hướng dẫn chi tiết để BẤT KỲ AI agent nào cũng có thể đọc và triển khai đúng toàn bộ project mà không cần thêm context.

---

## 📂 CẤU TRÚC THƯ MỤC DỰ ÁN

```
e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\
├── backend/
│   ├── requirements.txt          # Python dependencies
│   └── main.py                   # FastAPI server (VIẾT LẠI HOÀN TOÀN)
│
├── project1/                     # Vite + React frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   ├── benh_nhan.glb         # Model bệnh nhân (59MB, có animation thở)
│   │   ├── giuong_v2.glb         # Model giường bệnh
│   │   ├── may_monitor.glb       # Model máy monitor
│   │   ├── phong_mo_v2.glb       # Model phòng mổ (13MB)
│   │   ├── heart.glb             # [CẦN TẢI] Tim 3D animated
│   │   ├── lung.glb              # [CẦN TẢI] Phổi 3D animated
│   │   └── ...
│   └── src/
│       ├── main.jsx              # Entry point (giữ nguyên)
│       ├── App.jsx               # Layout chính (VIẾT LẠI)
│       ├── App.css               # Theme & styles (VIẾT LẠI)
│       ├── index.css             # CSS reset + tokens (VIẾT LẠI)
│       └── components/
│           ├── Scene3D.jsx       # [MỚI] Canvas 3D phòng mổ
│           ├── HeartModel.jsx    # [MỚI] Tim 3D animated
│           ├── LungModel.jsx    # [MỚI] Phổi 3D animated
│           ├── OrganPanel.jsx    # [MỚI] Panel tim+phổi (fixed bottom-left)
│           ├── MonitorScreen.jsx # [MỚI] Màn hình monitor BIS
│           └── Sidebar.jsx       # [MỚI] Sidebar bật/tắt (MATLAB-like)
│
└── AGENT_GUIDE.md                # File này
```

---

## 🔬 BỐI CẢNH KHOA HỌC (BẮT BUỘC ĐỌC)

### Bài báo gốc
- **Nguồn**: "Fuzzy Logic Control Application In Anesthesia" – trang 200, sách *Introduction to Fuzzy Logic Using MATLAB* (Springer)
- **Mô hình**: Điều khiển vòng kín (closed-loop) sử dụng **Fuzzy Logic** để tự động bơm thuốc mê **Propofol** dựa trên chỉ số **BIS** (Bispectral Index).

### Sơ đồ hệ thống

```
                         ┌──────────────────────────────────────────────────┐
                         │                                                  │
  BIS_setpoint(50) ──→ [+] ──→ e(t) ──→ ┌──────────────┐    u(t)    ┌─────────────┐
                        [-]               │    FUZZY      │ ────────→ │   PK/PD     │ ──→ BIS(t)
                         ↑      Δe(t) ──→ │  CONTROLLER   │           │  PATIENT    │      │
                         │                │  (Mamdani)    │           │   MODEL     │      │
                         │                └──────────────┘           └─────────────┘      │
                         │                                                                  │
                         └──────────────────── FEEDBACK ──────────────────────────────────────┘
```

Trong đó:
- `e(t) = BIS_setpoint - BIS_measured` → sai số BIS (error)
- `Δe(t) = e(t) - e(t-1)` → tốc độ thay đổi sai số (derivative)
- `u(t)` → tốc độ bơm Propofol (ml/h)
- BIS: 0-100 (100 = tỉnh hoàn toàn, 50 = mê lý tưởng, <40 = quá sâu nguy hiểm)

---

## ⚙️ TASK 1: BACKEND (Python FastAPI)

### File: `e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\backend\main.py`

> ⚠️ **VIẾT LẠI HOÀN TOÀN** file hiện tại. Code cũ sai mô hình (dùng BPM+Weight thay vì BIS Error).

### 1.1. Dependencies

```
pip install fastapi uvicorn numpy scikit-fuzzy pydantic scipy
```

### 1.2. Fuzzy Controller – Chi tiết kỹ thuật

**Kiểu suy diễn**: Mamdani  
**Giải mờ**: Centroid  
**Hàm liên thuộc**: Gaussian (KHÔNG dùng triangular)

#### Input 1: `e` (BIS Error)
```python
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

e = ctrl.Antecedent(np.arange(-50, 51, 1), 'error')

# Gaussian MF: fuzz.gaussmf(x, mean, sigma)
e['NB'] = fuzz.gaussmf(e.universe, -50, 12)   # Ngủ quá sâu (Negative Big)
e['NS'] = fuzz.gaussmf(e.universe, -25, 10)   # Hơi sâu (Negative Small)
e['Z']  = fuzz.gaussmf(e.universe,   0,  8)   # Đạt chuẩn (Zero)
e['PS'] = fuzz.gaussmf(e.universe,  25, 10)   # Hơi tỉnh (Positive Small)
e['PB'] = fuzz.gaussmf(e.universe,  50, 12)   # Rất tỉnh (Positive Big)
```

> **Giải thích dấu**: `e = setpoint - BIS`. Nếu `BIS=30` (ngủ quá sâu) → `e = 50-30 = +20` → DƯƠNG → "hơi tỉnh" (cần bơm thêm)...  
> **NHẦM!** Phải hiểu ngược: `e > 0` nghĩa là BIS thấp hơn setpoint → bệnh nhân ngủ sâu hơn mong muốn → GIẢM thuốc.  
> Thực ra convention trong bài báo: `e = BIS_setpoint - BIS_measured`:
> - `e > 0`: BIS < setpoint → ngủ QUÁ SÂU → giảm/ngừng thuốc
> - `e < 0`: BIS > setpoint → QUÁ TỈNH → tăng thuốc
> - `e ≈ 0`: BIS ≈ setpoint → ĐỦ MÊ → duy trì

⚠️ **QUAN TRỌNG – Quy ước dấu đúng theo bài báo**:
```
e = BIS_setpoint(50) - BIS_measured

BIS = 30 (quá sâu)  → e = 50 - 30 = +20  → e dương → NB/NS  → giảm/ngừng thuốc
BIS = 50 (đạt chuẩn) → e = 50 - 50 =   0  → e zero  → Z      → duy trì
BIS = 80 (quá tỉnh)  → e = 50 - 80 = -30  → e âm    → PS/PB  → tăng thuốc
```

**CHÚ Ý**: Naming convention trong bảng luật ngược trực giác:
- **NB** (Negative Big) = e rất ÂM = BIS rất CAO = bệnh nhân rất TỈNH → bơm NHIỀU
- **PB** (Positive Big) = e rất DƯƠNG = BIS rất THẤP = bệnh nhân quá SÂU → NGỪNG bơm

#### Input 2: `de` (Derivative of Error)
```python
de = ctrl.Antecedent(np.arange(-10, 11, 1), 'delta_error')

de['N'] = fuzz.gaussmf(de.universe, -10, 4)   # Error đang giảm (BIS tăng = tỉnh dần)
de['Z'] = fuzz.gaussmf(de.universe,   0, 3)   # Ổn định
de['P'] = fuzz.gaussmf(de.universe,  10, 4)   # Error đang tăng (BIS giảm = sâu thêm)
```

#### Output: `infusion_rate` (Tốc độ bơm Propofol)
```python
infusion = ctrl.Consequent(np.arange(0, 201, 1), 'infusion_rate')

infusion['Z'] = fuzz.gaussmf(infusion.universe,   0, 20)   # Ngừng bơm
infusion['S'] = fuzz.gaussmf(infusion.universe,  60, 20)   # Bơm chậm 
infusion['M'] = fuzz.gaussmf(infusion.universe, 120, 25)   # Bơm vừa
infusion['L'] = fuzz.gaussmf(infusion.universe, 200, 25)   # Bơm nhanh
```

#### Bảng 15 Luật Mờ (COPY CHÍNH XÁC)

```python
# BẢNG LUẬT:
#         de=N(giảm)   de=Z(ổn định)   de=P(tăng)
# e=NB     L              L              M          ← BIS rất cao (rất tỉnh) → bơm nhiều  
# e=NS     L              M              S          ← BIS hơi cao → bơm vừa
# e=Z      M              S              Z          ← BIS đạt chuẩn → duy trì/giảm
# e=PS     S              Z              Z          ← BIS hơi thấp → giảm/ngừng
# e=PB     Z              Z              Z          ← BIS rất thấp (quá sâu) → ngừng

rules = [
    ctrl.Rule(e['NB'] & de['N'], infusion['L']),
    ctrl.Rule(e['NB'] & de['Z'], infusion['L']),
    ctrl.Rule(e['NB'] & de['P'], infusion['M']),
    ctrl.Rule(e['NS'] & de['N'], infusion['L']),
    ctrl.Rule(e['NS'] & de['Z'], infusion['M']),
    ctrl.Rule(e['NS'] & de['P'], infusion['S']),
    ctrl.Rule(e['Z']  & de['N'], infusion['M']),
    ctrl.Rule(e['Z']  & de['Z'], infusion['S']),
    ctrl.Rule(e['Z']  & de['P'], infusion['Z']),
    ctrl.Rule(e['PS'] & de['N'], infusion['S']),
    ctrl.Rule(e['PS'] & de['Z'], infusion['Z']),
    ctrl.Rule(e['PS'] & de['P'], infusion['Z']),
    ctrl.Rule(e['PB'] & de['N'], infusion['Z']),
    ctrl.Rule(e['PB'] & de['Z'], infusion['Z']),
    ctrl.Rule(e['PB'] & de['P'], infusion['Z']),
]

fuzzy_ctrl = ctrl.ControlSystem(rules)
fuzzy_sim = ctrl.ControlSystemSimulation(fuzzy_ctrl)
```

### 1.3. PK/PD Patient Model – Chi tiết toán học

#### 1.3.1. Pharmacokinetic (PK) – Mô hình 3 ngăn Mammillary

Mô hình mô tả thuốc Propofol phân bố trong cơ thể qua 3 ngăn:
- **Ngăn 1** (V1): Máu/Huyết tương – nơi thuốc được tiêm trực tiếp
- **Ngăn 2** (V2): Cơ bắp – thuốc khuếch tán chậm
- **Ngăn 3** (V3): Mỡ – thuốc lưu trữ lâu dài

```python
def pk_model(t, y, params, u):
    """
    Hệ ODE 4 phương trình cho PK/PD model.
    
    Args:
        t: thời gian (phút)
        y: [C1, C2, C3, Ce] - nồng độ tại 4 vị trí (μg/ml)
        params: dict chứa k10, k12, k13, k21, k31, ke0, V1
        u: tốc độ bơm thuốc hiện tại (mg/min) = infusion_rate / 60
    
    Returns:
        [dC1/dt, dC2/dt, dC3/dt, dCe/dt]
    """
    C1, C2, C3, Ce = y
    k10 = params['k10']
    k12 = params['k12']
    k13 = params['k13']
    k21 = params['k21']
    k31 = params['k31']
    ke0 = params['ke0']
    V1  = params['V1']
    
    # Nồng độ thuốc tại mỗi ngăn
    dC1 = -(k10 + k12 + k13) * C1 + k21 * C2 + k31 * C3 + u / V1
    dC2 = k12 * C1 - k21 * C2
    dC3 = k13 * C1 - k31 * C3
    
    # Effect-site compartment (ngăn tác dụng - não bộ)
    dCe = ke0 * (C1 - Ce)
    
    return [dC1, dC2, dC3, dCe]
```

#### 1.3.2. Pharmacodynamic (PD) – Hill Sigmoid (Emax model)

Chuyển nồng độ thuốc tại vị trí tác dụng (Ce) thành chỉ số BIS:

```python
def calculate_bis(Ce, EC50=3.4, gamma=3.0, BIS_max=100.0):
    """
    Hill Sigmoid: BIS = BIS_max * (1 - Ce^γ / (Ce^γ + EC50^γ))
    
    Args:
        Ce: nồng độ tại effect-site (μg/ml)
        EC50: nồng độ cho 50% hiệu quả tối đa (3.4 μg/ml cho Propofol)
        gamma: hệ số độ dốc Hill (γ=3 cho Propofol)
        BIS_max: BIS tối đa khi không có thuốc (100)
    
    Returns:
        BIS value (0-100)
    """
    if Ce <= 0:
        return BIS_max
    
    bis = BIS_max * (1 - (Ce ** gamma) / (Ce ** gamma + EC50 ** gamma))
    return max(0, min(100, bis))  # Clamp 0-100
```

#### 1.3.3. Tính toán PK Parameters từ Clinical Input (Marsh Model)

```python
def calculate_pk_params(age: int, weight_kg: float, height_cm: float, gender: str):
    """
    Tính thông số PK/PD từ dữ liệu lâm sàng bệnh nhân.
    Sử dụng Marsh Model cho Propofol.
    
    Args:
        age: tuổi bệnh nhân (năm)
        weight_kg: cân nặng (kg)
        height_cm: chiều cao (cm)
        gender: 'male' hoặc 'female'
    
    Returns:
        dict chứa tất cả PK parameters
    """
    # --- Marsh Model: V1 phụ thuộc cân nặng ---
    V1 = 0.228 * weight_kg   # Lít
    V2 = 0.463 * weight_kg   # Lít  
    V3 = 2.893 * weight_kg   # Lít
    
    # --- Phân loại theo tuổi → điều chỉnh rate constants ---
    if age <= 15:
        # Trẻ em: clearance cao hơn, chuyển hóa nhanh
        k10 = 0.119   # Elimination rate (/min)
        k12 = 0.112   # Plasma → Muscle (/min)
        k13 = 0.042   # Plasma → Fat (/min)
        k21 = 0.055   # Muscle → Plasma (/min)
        k31 = 0.0033  # Fat → Plasma (/min)
        ke0 = 0.26    # Plasma → Effect-site (/min)
        EC50 = 3.0    # Trẻ em nhạy cảm hơn
        patient_type = "child"
    elif age >= 65:
        # Người già: clearance giảm, nhạy cảm với thuốc
        k10 = 0.085
        k12 = 0.080
        k13 = 0.030
        k21 = 0.040
        k31 = 0.0020
        ke0 = 0.20    # Onset chậm hơn
        EC50 = 2.8    # Nhạy cảm hơn
        patient_type = "elderly"
    else:
        # Người lớn: thông số chuẩn
        k10 = 0.119
        k12 = 0.112
        k13 = 0.042
        k21 = 0.055
        k31 = 0.0033
        ke0 = 0.26
        EC50 = 3.4
        patient_type = "adult"
    
    # --- LBM (James formula) ---
    height_m = height_cm / 100
    if gender == 'male':
        LBM = 1.1 * weight_kg - 128 * (weight_kg / height_cm) ** 2
    else:
        LBM = 1.07 * weight_kg - 148 * (weight_kg / height_cm) ** 2
    
    # --- BMI ---
    BMI = weight_kg / (height_m ** 2)
    
    # --- Liều khởi mê ước tính (Induction dose) ---
    # Propofol: 1.5-2.5 mg/kg cho người lớn
    if age <= 15:
        induction_dose = 2.5 * weight_kg
    elif age >= 65:
        induction_dose = 1.0 * weight_kg
    else:
        induction_dose = 2.0 * weight_kg
    
    return {
        "patient_type": patient_type,
        "age": age,
        "weight_kg": weight_kg,
        "height_cm": height_cm,
        "gender": gender,
        "V1": round(V1, 2),
        "V2": round(V2, 2),
        "V3": round(V3, 2),
        "k10": k10, "k12": k12, "k13": k13,
        "k21": k21, "k31": k31, "ke0": ke0,
        "EC50": EC50,
        "gamma": 3.0,
        "BMI": round(BMI, 1),
        "LBM": round(LBM, 1),
        "estimated_induction_dose_mg": round(induction_dose, 0),
    }
```

### 1.4. Closed-Loop Simulation Engine

```python
from scipy.integrate import solve_ivp

def run_simulation(patient_params, bis_setpoint=50, duration_min=30, 
                   dt=0.1, disturbance_time=None, disturbance_amplitude=10):
    """
    Chạy vòng lặp kín: Fuzzy Controller ↔ PK/PD Patient.
    
    Args:
        patient_params: dict từ calculate_pk_params()
        bis_setpoint: mục tiêu BIS (default 50)
        duration_min: thời gian mô phỏng (phút)
        dt: bước thời gian (phút), 0.1 = 6 giây
        disturbance_time: phút gây nhiễu (None = không nhiễu)
        disturbance_amplitude: cường độ nhiễu BIS
    
    Returns:
        dict chứa time series: time[], bis[], infusion_rate[], error[], 
                               delta_error[], heart_rate[], respiratory_rate[],
                               Ce[], C1[]
    """
    steps = int(duration_min / dt)
    
    # Khởi tạo mảng kết quả
    time_arr = []
    bis_arr = []
    infusion_arr = []
    error_arr = []
    de_arr = []
    hr_arr = []
    rr_arr = []
    Ce_arr = []
    
    # Trạng thái ban đầu: [C1, C2, C3, Ce] = [0, 0, 0, 0]
    state = [0.0, 0.0, 0.0, 0.0]
    prev_error = 0.0
    current_infusion = 0.0  # mg/min (sẽ convert từ ml/h)
    
    for step in range(steps):
        t = step * dt
        
        # 1. Đo BIS hiện tại
        Ce = state[3]
        bis = calculate_bis(Ce, EC50=patient_params['EC50'], gamma=patient_params['gamma'])
        
        # 2. Thêm nhiễu phẫu thuật nếu có
        if disturbance_time and t >= disturbance_time:
            noise = np.random.normal(0, disturbance_amplitude * 0.3)
            bis = np.clip(bis + noise, 0, 100)
        
        # 3. Tính error và delta_error
        error = bis_setpoint - bis
        delta_error = (error - prev_error) / dt if step > 0 else 0
        delta_error = np.clip(delta_error, -10, 10)
        prev_error = error
        
        # 4. Fuzzy Controller tính infusion rate
        try:
            fuzzy_sim.input['error'] = np.clip(error, -50, 50)
            fuzzy_sim.input['delta_error'] = np.clip(delta_error, -10, 10)
            fuzzy_sim.compute()
            infusion_rate_mlh = fuzzy_sim.output['infusion_rate']
        except:
            infusion_rate_mlh = 0
        
        # 5. Convert ml/h → mg/min (Propofol 10mg/ml)
        infusion_mg_per_min = infusion_rate_mlh * 10 / 60
        
        # 6. Giải ODE PK/PD cho bước tiếp theo
        sol = solve_ivp(
            pk_model,
            [0, dt],
            state,
            args=(patient_params, infusion_mg_per_min),
            method='RK45',
            max_step=dt/2
        )
        state = sol.y[:, -1].tolist()
        
        # 7. Tính Heart Rate và Respiratory Rate từ BIS
        # HR: tỉnh(BIS=100)→80bpm, mê(BIS=50)→60bpm, sâu(BIS=20)→45bpm
        heart_rate = max(40, min(100, 40 + bis * 0.6))
        # RR: tỉnh→16/min, mê→10/min, sâu→5/min
        respiratory_rate = max(4, min(18, 4 + bis * 0.14))
        
        # 8. Lưu kết quả
        time_arr.append(round(t, 2))
        bis_arr.append(round(bis, 2))
        infusion_arr.append(round(infusion_rate_mlh, 2))
        error_arr.append(round(error, 2))
        de_arr.append(round(delta_error, 2))
        hr_arr.append(round(heart_rate, 1))
        rr_arr.append(round(respiratory_rate, 1))
        Ce_arr.append(round(Ce, 4))
    
    return {
        "time": time_arr,
        "bis": bis_arr,
        "infusion_rate": infusion_arr,
        "error": error_arr,
        "delta_error": de_arr,
        "heart_rate": hr_arr,
        "respiratory_rate": rr_arr,
        "Ce": Ce_arr,
        "patient_info": patient_params,
        "bis_setpoint": bis_setpoint,
        "disturbance_time": disturbance_time,
    }
```

### 1.5. API Endpoints (FastAPI)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Fuzzy Anesthesia Controller API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Request/Response Models ---
class PatientInput(BaseModel):
    age: int                        # 1-100
    weight_kg: float                # 10-200
    height_cm: float                # 50-220
    gender: str                     # "male" | "female"
    asa_class: int = 2              # 1-4

class SimulationRequest(BaseModel):
    patient: PatientInput
    bis_setpoint: float = 50        # 40-60
    duration_min: float = 30        # 5-120
    disturbance_time: Optional[float] = None   # phút (None = ko nhiễu)
    disturbance_amplitude: float = 10

# --- Endpoints ---

@app.post("/api/patient/calculate")
async def calculate_patient(data: PatientInput):
    """Tính PK/PD params + phân loại bệnh nhân. Gọi khi user nhập xong form."""
    params = calculate_pk_params(data.age, data.weight_kg, data.height_cm, data.gender)
    return params

@app.post("/api/simulate")
async def simulate(data: SimulationRequest):
    """Chạy TOÀN BỘ simulation, trả về time series đầy đủ."""
    params = calculate_pk_params(
        data.patient.age, data.patient.weight_kg, 
        data.patient.height_cm, data.patient.gender
    )
    result = run_simulation(
        params, data.bis_setpoint, data.duration_min,
        disturbance_time=data.disturbance_time,
        disturbance_amplitude=data.disturbance_amplitude
    )
    return result

@app.get("/api/fuzzy/membership")
async def get_fuzzy_membership():
    """Trả về dữ liệu membership functions để vẽ chart trên frontend."""
    return {
        "error": {
            "universe": list(range(-50, 51)),
            "NB": fuzz.gaussmf(np.arange(-50, 51, 1), -50, 12).tolist(),
            "NS": fuzz.gaussmf(np.arange(-50, 51, 1), -25, 10).tolist(),
            "Z":  fuzz.gaussmf(np.arange(-50, 51, 1),   0,  8).tolist(),
            "PS": fuzz.gaussmf(np.arange(-50, 51, 1),  25, 10).tolist(),
            "PB": fuzz.gaussmf(np.arange(-50, 51, 1),  50, 12).tolist(),
        },
        "delta_error": {
            "universe": list(range(-10, 11)),
            "N": fuzz.gaussmf(np.arange(-10, 11, 1), -10, 4).tolist(),
            "Z": fuzz.gaussmf(np.arange(-10, 11, 1),   0, 3).tolist(),
            "P": fuzz.gaussmf(np.arange(-10, 11, 1),  10, 4).tolist(),
        },
        "infusion_rate": {
            "universe": list(range(0, 201)),
            "Z": fuzz.gaussmf(np.arange(0, 201, 1),   0, 20).tolist(),
            "S": fuzz.gaussmf(np.arange(0, 201, 1),  60, 20).tolist(),
            "M": fuzz.gaussmf(np.arange(0, 201, 1), 120, 25).tolist(),
            "L": fuzz.gaussmf(np.arange(0, 201, 1), 200, 25).tolist(),
        }
    }

@app.get("/api/fuzzy/surface")
async def get_fuzzy_surface():
    """Trả về control surface 3D data: e × Δe → infusion_rate."""
    e_range = np.linspace(-50, 50, 50)
    de_range = np.linspace(-10, 10, 20)
    surface = []
    
    for e_val in e_range:
        row = []
        for de_val in de_range:
            try:
                fuzzy_sim.input['error'] = e_val
                fuzzy_sim.input['delta_error'] = de_val
                fuzzy_sim.compute()
                row.append(round(fuzzy_sim.output['infusion_rate'], 2))
            except:
                row.append(0)
        surface.append(row)
    
    return {
        "e_range": e_range.tolist(),
        "de_range": de_range.tolist(),
        "surface": surface
    }
```

### 1.6. Chạy Backend

```bash
cd e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\backend
# Tạo virtual environment (nếu chưa có)
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Chạy server
uvicorn main:app --reload --port 8000
```

**Test nhanh**: `http://localhost:8000/docs` → Swagger UI

---

## 🖥️ TASK 2: FRONTEND (React + Three.js)

### Tech Stack (GIỮ NGUYÊN)
- `react` 19.x + `react-dom`
- `three` 0.183.x + `@react-three/fiber` 9.x + `@react-three/drei` 10.x
- `vite` 8.x
- **KHÔNG thêm thư viện chart** – vẽ bằng Canvas API

### 2.1. Layout – KHÔNG có Header/Footer

```
┌─────────────────────────────────────────┬── ☰ ──┐
│                                         │       │
│          3D Scene (FULL SCREEN)          │ Side  │
│    (Phòng mổ + Giường + Bệnh nhân +    │ bar   │
│     Monitor + Syringe Pump)             │       │
│                                         │ S1    │
│  ┌──────────┐                           │ S2    │
│  │ ❤️ Tim   │                           │ S3    │
│  │ 🫁 Phổi  │  ← fixed bottom-left     │ S4    │
│  │ HR: 70   │                           │ S5    │
│  │ RR: 10   │                           │       │
│  └──────────┘                           │       │
└─────────────────────────────────────────┴───────┘
```

- **3D Scene**: 100vw × 100vh, Canvas phòng mổ chiếm toàn bộ
- **OrganPanel**: `position: fixed; bottom: 20px; left: 20px` – Canvas 3D riêng ~300×250px
- **Sidebar**: `position: fixed; right: 0; width: 420px` – slide in/out bằng nút ☰
- Khi sidebar đóng: 3D scene full width. Khi mở: 3D scene vẫn full nhưng sidebar overlay

### 2.2. Sidebar – 6 Sections Accordion

Mỗi section có header click để collapse/expand. Chỉ 1 section mở 1 lúc (hoặc nhiều tùy chọn).

#### Section 1: 🏥 Pre-Anesthesia Assessment (Form nhập liệu)

```jsx
// Form fields:
<input type="number" placeholder="Tuổi" min={1} max={100} />
<input type="number" placeholder="Cân nặng (kg)" min={10} max={200} />
<input type="number" placeholder="Chiều cao (cm)" min={50} max={220} />
<select> <option>Nam</option> <option>Nữ</option> </select>
<select> <option>ASA I</option> ... <option>ASA IV</option> </select>

// Khi user thay đổi bất kỳ field → gọi POST /api/patient/calculate
// Hiển thị kết quả:
// - Badge phân loại: 👶 Trẻ em (xanh) | 🧑 Người lớn (xanh lá) | 👴 Người già (cam)
// - BMI: 24.2 | LBM: 52.3 kg | V1: 15.96 L
// - Liều khởi mê ước tính: 140 mg
```

#### Section 2: ▶️ Simulation Control

```jsx
// Nút: [▶ Start] [⏸ Pause] [🔄 Reset]
// Slider BIS Setpoint: 40 ←──●──→ 60 (default 50)
// Slider Duration: 5 ←──●──→ 120 phút (default 30)
// Nút: [⚡ Gây nhiễu phẫu thuật]  
// Slider cường độ nhiễu: 5 ←──●──→ 30

// Live Stats (cập nhật real-time):
// BIS: 52.3  |  Infusion: 45.2 ml/h  |  Error: -2.3
```

#### Section 3: 📊 Scope (Charts – Canvas API)

Vẽ 2 chart bằng HTML Canvas 2D Context:

**Chart 1: BIS Response**
```javascript
// canvas 400×150px
// Trục X: time (phút), Trục Y: BIS (0-100)
// Vẽ:
// - Vùng tô mờ xanh: BIS 40-60 (safe zone)
// - Đường nét đứt trắng: BIS setpoint = 50
// - Đường xanh lá bold: BIS(t) actual
// - Marker ⚡ tại disturbance_time
// - Grid lines mờ
```

**Chart 2: Infusion Rate**
```javascript
// canvas 400×100px
// Trục X: time (phút), Trục Y: ml/h (0-200)  
// Vẽ:
// - Đường xanh dương bold: infusion_rate(t)
// - Fill gradient phía dưới
```

#### Section 4: 📋 FIS Rule Viewer

```jsx
// Bảng 5 hàng × 3 cột
// Header: de\e | N | Z | P
// Mỗi ô chứa: tên output (Z/S/M/L) + thanh bar firing strength
// Ô active: background sáng lên + border glow
// Dùng dữ liệu error và delta_error hiện tại để highlight

// Ví dụ: nếu e=Z, de=Z → ô [Z][Z] = S sáng lên
```

#### Section 5: 📈 Membership Functions (3 chart nhỏ)

```javascript
// 3 canvas nhỏ xếp dọc, mỗi cái 400×80px
// Mỗi canvas vẽ các đường Gaussian MF
// Đường đậm dọc: giá trị hiện tại của biến
// Vùng tô: membership degree tại giá trị hiện tại

// Chart 1: Error MFs (NB, NS, Z, PS, PB)
// Chart 2: Delta Error MFs (N, Z, P)  
// Chart 3: Infusion Rate MFs (Z, S, M, L)
// Dữ liệu lấy từ GET /api/fuzzy/membership (gọi 1 lần khi load)
```

#### Section 6: 🏔️ Control Surface (3D)

```jsx
// Canvas Three.js riêng 400×250px
// Render surface mesh: e (trục X) × de (trục Y) → infusion (trục Z)
// Dữ liệu từ GET /api/fuzzy/surface → tạo PlaneGeometry + set vertices
// Điểm đỏ (Sphere) di chuyển trên surface = (error, delta_error, infusion) hiện tại
// OrbitControls cho phép user xoay
// Color gradient: Z(xanh dương) → S(xanh lá) → M(vàng) → L(đỏ)
```

### 2.3. Component Scene3D.jsx – 3D Phòng mổ

```jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Suspense, useGLTF, Html, useAnimations } from '@react-three/drei';

// Danh sách models cần load:
// 1. /phong_mo_v2.glb  → phòng mổ (scale ~1, position [0,0,0])
// 2. /giuong_v2.glb    → giường bệnh (scale ~3, position [0,0,0])
// 3. /benh_nhan.glb    → bệnh nhân có animation (scale ~1, position [-10, 0.5, 0])
// 4. /may_monitor.glb  → máy monitor (scale ~150, position [-100, 0, -150])
// 5. Syringe Pump      → tạo bằng Three.js primitives nếu không có GLB

function BenhNhanModel({ bis }) {
    const group = useRef();
    const { scene, animations } = useGLTF('/benh_nhan.glb');
    const { actions, names } = useAnimations(animations, group);
    
    useEffect(() => {
        if (names.length > 0) {
            const action = actions[names[0]];
            action.play();
            // Tốc độ thở đồng bộ BIS:
            // BIS=100 → speed=1 (bình thường)
            // BIS=50  → speed=0.5 (chậm)
            // BIS=20  → speed=0.2 (rất chậm)
            action.timeScale = Math.max(0.1, bis / 100);
        }
    }, [bis, actions, names]);
    
    // Giảm bóng: roughness=0.9, metalness=0
    useEffect(() => {
        scene.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.roughness = 0.9;
                child.material.metalness = 0.0;
            }
        });
    }, [scene]);
    
    return (
        <group ref={group} position={[-10, 0.5, 0]} rotation={[0, Math.PI/2, 0]}>
            <primitive object={scene} />
        </group>
    );
}

// Camera mặc định: position={[9, 80, 300]} fov={55}
// Ánh sáng: ambientLight intensity=0.1, spotLight position=[0,1,0] intensity=0.8
// Environment preset="forest"
```

### 2.4. Component HeartModel.jsx – Tim 3D

```jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

function HeartModel({ bis = 50 }) {
    const meshRef = useRef();
    const { scene } = useGLTF('/heart.glb');
    
    // Nhịp tim từ BIS: 40 + BIS * 0.6
    const heartRate = Math.max(40, Math.min(100, 40 + bis * 0.6));
    
    useFrame(({ clock }) => {
        if (meshRef.current) {
            const t = clock.getElapsedTime();
            // Pulse: scale dao động theo heartRate (beat/minute)
            const beatFreq = heartRate / 60; // beat/second
            const pulse = 1 + 0.08 * Math.sin(t * beatFreq * 2 * Math.PI);
            meshRef.current.scale.set(pulse, pulse, pulse);
            
            // Emissive glow: sáng lên tại đỉnh co bóp
            meshRef.current.traverse((child) => {
                if (child.isMesh && child.material) {
                    const glow = Math.max(0, Math.sin(t * beatFreq * 2 * Math.PI));
                    child.material.emissive?.setRGB(glow * 0.3, 0, 0);
                }
            });
        }
    });
    
    return (
        <group ref={meshRef}>
            <primitive object={scene} scale={1} />
        </group>
    );
}
// Nếu KHÔNG CÓ heart.glb, tạo fallback:
function HeartFallback({ bis }) {
    const ref = useRef();
    const heartRate = Math.max(40, Math.min(100, 40 + bis * 0.6));
    
    useFrame(({ clock }) => {
        const pulse = 1 + 0.1 * Math.sin(clock.getElapsedTime() * heartRate/60 * Math.PI * 2);
        ref.current.scale.set(pulse, pulse, pulse);
    });
    
    return (
        <mesh ref={ref}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color="#cc0000" emissive="#330000" />
        </mesh>
    );
}
```

### 2.5. Component LungModel.jsx – Phổi 3D

```jsx
function LungModel({ bis = 50 }) {
    const meshRef = useRef();
    const { scene } = useGLTF('/lung.glb');
    
    // Nhịp thở từ BIS: 4 + BIS * 0.14
    const respRate = Math.max(4, Math.min(18, 4 + bis * 0.14));
    
    useFrame(({ clock }) => {
        if (meshRef.current) {
            const t = clock.getElapsedTime();
            const breathFreq = respRate / 60;
            // Phổi phồng theo trục Y
            const breathY = 1 + 0.15 * Math.sin(t * breathFreq * 2 * Math.PI);
            const breathXZ = 1 + 0.05 * Math.sin(t * breathFreq * 2 * Math.PI);
            meshRef.current.scale.set(breathXZ, breathY, breathXZ);
        }
    });
    
    // Material: transparent nhẹ
    useEffect(() => {
        scene.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = 0.85;
            }
        });
    }, [scene]);
    
    return (
        <group ref={meshRef}>
            <primitive object={scene} scale={1} />
        </group>
    );
}
// Fallback nếu không có lung.glb:
// Dùng 2 ellipsoid (SphereGeometry scale [0.4, 0.6, 0.35]) đặt cạnh nhau
```

### 2.6. Component OrganPanel.jsx – Panel cố định bottom-left

```jsx
function OrganPanel({ bis, heartRate, respiratoryRate }) {
    const [minimized, setMinimized] = useState(false);
    
    // Viền phát sáng theo BIS
    const borderColor = bis >= 40 && bis <= 60 ? '#00ff00'  // Xanh: an toàn
                      : bis > 70              ? '#ff0000'  // Đỏ: quá tỉnh
                      :                          '#ffaa00'; // Vàng: quá sâu
    
    return (
        <div style={{
            position: 'fixed', bottom: 20, left: 20, zIndex: 100,
            width: minimized ? 60 : 300,
            height: minimized ? 60 : 250,
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${borderColor}`,
            borderRadius: 12,
            boxShadow: `0 0 20px ${borderColor}40`,
            transition: 'all 0.3s ease',
            overflow: 'hidden',
        }}>
            {/* Nút minimize */}
            <button onClick={() => setMinimized(!minimized)} style={/* ... */}>
                {minimized ? '❤️' : '−'}
            </button>
            
            {!minimized && (
                <>
                    {/* Mini 3D Canvas cho tim + phổi */}
                    <Canvas camera={{ position: [0, 0, 3], fov: 45 }} style={{ height: 180 }}>
                        <ambientLight intensity={0.5} />
                        <pointLight position={[2, 2, 2]} />
                        <HeartModel bis={bis} />
                        <LungModel bis={bis} />
                        {/* Tự xoay nhẹ */}
                        <OrbitControls autoRotate autoRotateSpeed={1} enableZoom={false} />
                    </Canvas>
                    
                    {/* Overlay stats */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', padding: '5px' }}>
                        <span style={{ color: '#ff4444' }}>❤️ {heartRate} bpm</span>
                        <span style={{ color: '#44aaff' }}>🫁 {respiratoryRate} /min</span>
                    </div>
                </>
            )}
        </div>
    );
}
```

### 2.7. Component MonitorScreen.jsx

Giữ nguyên logic ECG hiện tại từ `App.jsx` (`ChuanHospitalMonitor`), nhưng **THÊM**:
- Hiển thị **BIS** lớn (font 48px) kèm màu:
  - BIS > 70: đỏ `#ff3333`
  - 40 ≤ BIS ≤ 60: xanh lá `#00ff00`
  - BIS < 40: vàng `#ffaa00`
- Hiển thị **Infusion Rate** (ml/h)
- Sóng ECG tốc độ đồng bộ với heart_rate hiện tại

### 2.8. App.jsx – Main Layout

```jsx
function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [simData, setSimData] = useState(null);       // Full simulation result
    const [currentStep, setCurrentStep] = useState(0);  // Animation step
    const [isRunning, setIsRunning] = useState(false);
    
    // Patient form state
    const [patient, setPatient] = useState({
        age: 35, weight_kg: 70, height_cm: 170, gender: 'male', asa_class: 2
    });
    const [patientInfo, setPatientInfo] = useState(null); // Calculated PK params
    
    // Simulation params
    const [bisSetpoint, setBisSetpoint] = useState(50);
    const [duration, setDuration] = useState(30);
    
    // Khi patient thay đổi → gọi API calculate
    useEffect(() => {
        fetch('http://localhost:8000/api/patient/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patient)
        })
        .then(r => r.json())
        .then(setPatientInfo);
    }, [patient]);
    
    // Start simulation → gọi API simulate → nhận toàn bộ time series
    const startSimulation = async () => {
        const res = await fetch('http://localhost:8000/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient,
                bis_setpoint: bisSetpoint,
                duration_min: duration,
            })
        });
        const data = await res.json();
        setSimData(data);
        setCurrentStep(0);
        setIsRunning(true);
    };
    
    // Animation loop: step through sim data
    useEffect(() => {
        if (!isRunning || !simData) return;
        const interval = setInterval(() => {
            setCurrentStep(prev => {
                if (prev >= simData.time.length - 1) {
                    setIsRunning(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 100); // 100ms per step = 10 steps/sec
        return () => clearInterval(interval);
    }, [isRunning, simData]);
    
    // Current values
    const currentBIS = simData?.bis[currentStep] ?? 100;
    const currentHR  = simData?.heart_rate[currentStep] ?? 80;
    const currentRR  = simData?.respiratory_rate[currentStep] ?? 16;
    const currentInfusion = simData?.infusion_rate[currentStep] ?? 0;
    
    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a0e17' }}>
            
            {/* 3D Scene - FULL SCREEN */}
            <Canvas camera={{ position: [9, 80, 300], fov: 55 }} style={{ width: '100%', height: '100%' }}>
                <Suspense fallback={<Loader />}>
                    <Scene3D bis={currentBIS} infusionRate={currentInfusion} heartRate={currentHR} />
                </Suspense>
                <OrbitControls />
                <Environment preset="forest" />
            </Canvas>
            
            {/* Organ Panel - Fixed bottom-left */}
            <OrganPanel bis={currentBIS} heartRate={currentHR} respiratoryRate={currentRR} />
            
            {/* Sidebar Toggle Button */}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
                position: 'fixed', top: 20, right: 20, zIndex: 200,
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(17, 24, 39, 0.9)', border: '1px solid #1e293b',
                color: 'white', fontSize: 20, cursor: 'pointer',
            }}>
                ☰
            </button>
            
            {/* Sidebar */}
            <Sidebar 
                isOpen={sidebarOpen}
                patient={patient} setPatient={setPatient}
                patientInfo={patientInfo}
                simData={simData} currentStep={currentStep}
                bisSetpoint={bisSetpoint} setBisSetpoint={setBisSetpoint}
                duration={duration} setDuration={setDuration}
                isRunning={isRunning}
                onStart={startSimulation}
                onPause={() => setIsRunning(false)}
                onReset={() => { setSimData(null); setCurrentStep(0); setIsRunning(false); }}
            />
        </div>
    );
}
```

### 2.9. CSS Design Tokens (index.css)

```css
:root {
    --bg-primary: #0a0e17;
    --bg-panel: #111827;
    --bg-card: #1a2332;
    --border: #1e293b;
    --border-active: #3b82f6;
    
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    
    --color-bis-safe: #00ff00;
    --color-bis-danger-high: #ff3333;
    --color-bis-danger-low: #ffaa00;
    --color-infusion: #3b82f6;
    --color-ecg: #00ff00;
    --color-heart: #ef4444;
    --color-lung: #06b6d4;
    
    --font-body: 'Inter', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', 'Courier New', monospace;
    
    --sidebar-width: 420px;
    --organ-panel-width: 300px;
    --organ-panel-height: 250px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body); background: var(--bg-primary); color: var(--text-primary); overflow: hidden; }
```

---

## ✅ TASK 3: VERIFICATION

### 3.1. Chạy Backend
```bash
cd e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3.2. Chạy Frontend
```bash
cd e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\project1
npm install
npm run dev
```

### 3.3. Kịch bản kiểm thử

| # | Kịch bản | Thao tác | Kết quả mong đợi |
|---|----------|----------|-------------------|
| 1 | **Người lớn** | Nhập: 35t, 70kg, 170cm, Nam → Start | BIS giảm từ 100 về ~50 trong 5-8 phút, hội tụ ổn định |
| 2 | **Trẻ em** | Nhập: 8t, 25kg, 120cm → Start | BIS về 50 nhanh hơn (V1 nhỏ), infusion rate thấp hơn |
| 3 | **Người già** | Nhập: 75t, 60kg, 165cm → Start | BIS về 50 chậm hơn (ke0 nhỏ), cần infusion rate thấp hơn |
| 4 | **Nhiễu phẫu thuật** | Người lớn, đợi BIS ổn định ~50 → nhấn ⚡ | BIS dao động nhẹ rồi fuzzy controller kéo về 50 |
| 5 | **Tim & Phổi** | Quan sát OrganPanel khi BIS giảm | Tim đập chậm dần, phổi thở chậm dần, viền panel xanh khi BIS 40-60 |
| 6 | **Sidebar toggle** | Nhấn ☰ để đóng/mở | Sidebar slide in/out mượt, 3D scene vẫn hoạt động |

---

## 🎯 CHECKLIST QUAN TRỌNG

- [ ] Backend: Fuzzy dùng **Gaussian MF** (KHÔNG phải triangular)
- [ ] Backend: PK model có **4 ODE** (C1, C2, C3, Ce) – không bỏ sót Ce
- [ ] Backend: Hill sigmoid đúng công thức `BIS = 100 * (1 - Ce^γ / (Ce^γ + EC50^γ))`
- [ ] Backend: `e = setpoint - BIS` (convention đúng theo bài báo)
- [ ] Backend: Infusion rate clamp ≥ 0 (không bơm âm)
- [ ] Frontend: Layout full-screen, KHÔNG header/footer
- [ ] Frontend: OrganPanel fixed bottom-left
- [ ] Frontend: Sidebar toggle bật/tắt
- [ ] Frontend: Charts vẽ bằng Canvas API (KHÔNG thêm thư viện)
- [ ] Frontend: Nhập tuổi/cân nặng/chiều cao/giới tính (KHÔNG chọn profile)
- [ ] 3D: Tốc độ thở bệnh nhân đồng bộ BIS
- [ ] 3D: Tim đập đồng bộ heart_rate
- [ ] 3D: Phổi phồng xẹp đồng bộ respiratory_rate
- [ ] 3D: Monitor hiển thị BIS + ECG

---

## 📝 GHI CHÚ CHO AGENT

1. **ĐỌC KỸ QUY ƯỚC DẤU**: `e = setpoint - BIS`. Đây là phần dễ nhầm nhất. NB = BIS rất cao (tỉnh) = cần bơm nhiều.
2. **THỨ TỰ THỰC HIỆN**: Backend trước → test API bằng Swagger → Frontend sau.
3. **3D MODELS**: Nếu `heart.glb` và `lung.glb` chưa có trong `public/`, tạo fallback bằng Three.js primitives (sphere/ellipsoid + animation).
4. **CORS**: Backend cho phép `*` origins. Frontend gọi `http://localhost:8000`.
5. **FILE main.py**: Đặt tại `e:\ThanhTai\DHSP_HK2_25_26\FuzzyLogic\backend\main.py` (KHÔNG phải trong `.venv/`).
6. **KHÔNG THÊM thư viện chart** vào frontend (recharts, chart.js, etc.) – dùng Canvas API.
