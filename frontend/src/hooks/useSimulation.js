import { useState, useRef, useCallback, useEffect } from 'react';

const WS_URL = 'ws://localhost:8000/ws/simulate';
const BATCH_INTERVAL_MS = 200;
const FIRST_MESSAGE_TIMEOUT_MS = 1500;
const LOCAL_TICK_MS = 250;
const SETPOINT = 50;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeClose(ws) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
}

function deriveVitals(bis, ce, rate, patientType, disturbance = 0) {
  const baselines = {
    child: { hr: 96, rr: 22, spo2: 99, sys: 104, dia: 62 },
    adult: { hr: 78, rr: 16, spo2: 99, sys: 118, dia: 76 },
    elderly: { hr: 72, rr: 15, spo2: 98, sys: 132, dia: 78 },
  };
  const base = baselines[patientType] ?? baselines.adult;
  const sedation = clamp((100 - bis) / 100, 0, 1);
  const ceLoad = clamp(ce / 6, 0, 1.3);
  const rateLoad = clamp(rate / 50, 0, 1.2);
  const disturbanceLoad = clamp(Math.abs(disturbance) / 20, 0, 1);

  const heartRate = clamp(base.hr - 26 * sedation - 10 * ceLoad - 5 * rateLoad + 16 * disturbanceLoad, 35, 140);
  const respiratoryRate = clamp(base.rr - 8.5 * sedation - 4.5 * ceLoad - 2 * rateLoad + 3 * disturbanceLoad, 4, 28);
  const spo2 = clamp(base.spo2 - 1.2 * sedation - 2 * ceLoad - 0.8 * rateLoad, 88, 100);
  const sysBp = clamp(base.sys - 18 * sedation - 13 * ceLoad - 8 * rateLoad + 12 * disturbanceLoad, 70, 180);
  const diaBp = clamp(base.dia - 11 * sedation - 8 * ceLoad - 5 * rateLoad + 7 * disturbanceLoad, 35, 110);

  let state = 'awake';
  if (bis < 20) state = 'critical';
  else if (bis < 40) state = 'deep';
  else if (bis < 60) state = 'ideal';
  else if (bis < 80) state = 'light';

  return {
    heart_rate: +heartRate.toFixed(2),
    respiratory_rate: +respiratoryRate.toFixed(2),
    spo2: +spo2.toFixed(2),
    sys_bp: +sysBp.toFixed(2),
    dia_bp: +diaBp.toFixed(2),
    state,
  };
}

function scenarioEventFor(scenario, step, disturbanceStep) {
  if (scenario === 'disturbance') {
    if (step === disturbanceStep) return 'disturbance_start';
    if (step === disturbanceStep + 36) return 'disturbance_decay';
  }
  if (scenario === 'induction') {
    if (step === 0) return 'induction_start';
    if (step === 12) return 'maintenance_start';
  }
  if (scenario === 'overdose' && step === 0) return 'overdose_rescue';
  if (scenario === 'resistance' && step === 0) return 'resistance_detected';
  return null;
}

function createLocalSimulation(params, onPoint, onDone) {
  const patientType = params?.patient_type ?? 'adult';
  const scenario = params?.scenario ?? 'robustness';
  const durationMin = Number(params?.duration) || 5;
  const totalPoints = Math.max(1, Math.ceil((durationMin * 60) / 5));
  const disturbanceStep = Math.max(0, Math.floor(((Number(params?.disturbance_time) || 10) * 60) / 5));
  const disturbanceAmp = Number(params?.disturbance_amplitude) || 15;

  let pointIndex = 0;
  let ce = scenario === 'overdose' ? 5.2 : 0;
  let rate = scenario === 'overdose' ? 45 : scenario === 'induction' ? 40 : 0;
  let bis = scenario === 'overdose' ? 14 : 97;
  let prevError = SETPOINT - bis;
  if (scenario === 'resistance') ce = 0.3;

  const intervalId = setInterval(() => {
    if (pointIndex >= totalPoints) {
      clearInterval(intervalId);
      onDone();
      return;
    }

    const t = pointIndex * (5 / 60);
    let disturbance = 0;
    if (scenario === 'disturbance' && pointIndex >= disturbanceStep) {
      const burst = pointIndex < disturbanceStep + 36 ? 1.8 : 0.7;
      disturbance = (Math.random() - 0.5) * disturbanceAmp * burst;
    }

    const ec50 = scenario === 'resistance' ? 6.1 : 3.4;
    const gamma = patientType === 'child' ? 2.0 : 2.6;
    const effect = ce <= 0 ? 0 : (ce ** gamma) / ((ce ** gamma) + (ec50 ** gamma));
    bis = clamp(97 - 97 * effect + disturbance, 0, 100);

    const error = SETPOINT - bis;
    const deltaError = error - prevError;

    if (scenario === 'induction' && pointIndex < 12) {
      rate = pointIndex < 4 ? 40 : clamp(rate - 4, 18, 40);
    } else {
      rate = clamp(rate + (-error * 0.55) + (-deltaError * 0.9), 0, 50);
    }
    if (scenario === 'overdose') rate = clamp(rate + (-error * 0.35) - 6, 0, 45);

    ce = clamp(ce + (rate / 18 - ce) * 0.16, 0, 8);
    prevError = error;

    const vitals = deriveVitals(bis, ce, rate, patientType, disturbance);
    const progress = ((pointIndex + 1) / totalPoints) * 100;

    onPoint({
      t: +t.toFixed(3),
      bis: +bis.toFixed(2),
      rate: +rate.toFixed(3),
      error: +error.toFixed(2),
      delta_error: +deltaError.toFixed(3),
      ce: +ce.toFixed(4),
      c1: +(ce * 1.4).toFixed(4),
      ...vitals,
      scenario,
      patient_type: patientType,
      disturbance: +disturbance.toFixed(3),
      scenario_event: scenarioEventFor(scenario, pointIndex, disturbanceStep),
      step: pointIndex + 1,
      total_steps: totalPoints,
      progress: +progress.toFixed(2),
      done: false,
      source: 'frontend-fallback',
    });

    pointIndex += 1;
  }, LOCAL_TICK_MS);

  return () => clearInterval(intervalId);
}

export function useSimulation() {
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [dataPoints, setDataPoints] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [durationMin, setDurationMin] = useState(0);

  const wsRef = useRef(null);
  const bufferRef = useRef([]);
  const timerRef = useRef(null);
  const localStopRef = useRef(null);
  const firstMessageTimerRef = useRef(null);
  const didReceiveFirstMessageRef = useRef(false);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;
    const batch = bufferRef.current.splice(0);
    setDataPoints(prev => [...prev, ...batch]);
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFirstMessageTimer = useCallback(() => {
    if (firstMessageTimerRef.current) {
      clearTimeout(firstMessageTimerRef.current);
      firstMessageTimerRef.current = null;
    }
  }, []);

  const stopLocalSimulation = useCallback(() => {
    if (localStopRef.current) {
      localStopRef.current();
      localStopRef.current = null;
    }
  }, []);

  const startLocalFallback = useCallback((params, reason) => {
    safeClose(wsRef.current);
    wsRef.current = null;
    clearFirstMessageTimer();
    stopLocalSimulation();
    setError(reason ? `${reason}\nUsing local simulation in frontend.` : 'Using local simulation in frontend.');
    localStopRef.current = createLocalSimulation(
      params,
      (point) => {
        bufferRef.current.push(point);
        setProgress(Math.max(0, Math.min(100, point.progress ?? 0)));
      },
      () => {
        flush();
        setIsDone(true);
        setIsRunning(false);
        setProgress(100);
        clearFlushTimer();
      },
    );
  }, [clearFirstMessageTimer, clearFlushTimer, flush, stopLocalSimulation]);

  const start = useCallback((params) => {
    safeClose(wsRef.current);
    wsRef.current = null;
    stopLocalSimulation();
    clearFirstMessageTimer();

    bufferRef.current = [];
    clearFlushTimer();

    didReceiveFirstMessageRef.current = false;
    setDataPoints([]);
    setError(null);
    setIsDone(false);
    setIsRunning(true);
    setProgress(0);
    setDurationMin(Number(params?.duration) || 0);

    timerRef.current = setInterval(flush, BATCH_INTERVAL_MS);

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      firstMessageTimerRef.current = setTimeout(() => {
        if (!didReceiveFirstMessageRef.current) {
          startLocalFallback(params, 'Backend seems online but no initial stream frame arrived.');
        }
      }, FIRST_MESSAGE_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(JSON.stringify(params));
      };

      ws.onmessage = (evt) => {
        clearFirstMessageTimer();
        didReceiveFirstMessageRef.current = true;

        const msg = JSON.parse(evt.data);

        // Important: stream data uses numeric "error" as BIS control error.
        // Treat only string error as transport/runtime failure.
        if (typeof msg.error === 'string' && msg.error.trim() !== '') {
          startLocalFallback(params, `Backend stream error: ${msg.error}`);
          return;
        }
        if (msg.done) {
          flush();
          setIsDone(true);
          setIsRunning(false);
          setProgress(100);
          clearFlushTimer();
          return;
        }
        if (typeof msg.progress === 'number') {
          setProgress(Math.max(0, Math.min(100, msg.progress)));
        }
        bufferRef.current.push(msg);
      };

      ws.onerror = () => {
        startLocalFallback(params, 'Cannot connect to backend websocket.');
      };

      ws.onclose = (evt) => {
        if (!evt.wasClean && !didReceiveFirstMessageRef.current) {
          startLocalFallback(params, 'Backend closed websocket before sending data.');
        } else if (!evt.wasClean) {
          setIsRunning(false);
        }
      };
    } catch {
      startLocalFallback(params, 'Browser cannot initialize websocket.');
    }
  }, [clearFirstMessageTimer, clearFlushTimer, flush, startLocalFallback, stopLocalSimulation]);

  const stop = useCallback(() => {
    safeClose(wsRef.current);
    wsRef.current = null;
    stopLocalSimulation();
    clearFirstMessageTimer();
    flush();
    clearFlushTimer();
    setIsRunning(false);
    setProgress(0);
  }, [clearFirstMessageTimer, clearFlushTimer, flush, stopLocalSimulation]);

  const reset = useCallback(() => {
    safeClose(wsRef.current);
    wsRef.current = null;
    stopLocalSimulation();
    clearFirstMessageTimer();
    clearFlushTimer();
    bufferRef.current = [];
    setDataPoints([]);
    setIsDone(false);
    setError(null);
    setIsRunning(false);
    setProgress(0);
    setDurationMin(0);
  }, [clearFirstMessageTimer, clearFlushTimer, stopLocalSimulation]);

  useEffect(() => () => {
    safeClose(wsRef.current);
    stopLocalSimulation();
    clearFirstMessageTimer();
    clearFlushTimer();
  }, [clearFirstMessageTimer, clearFlushTimer, stopLocalSimulation]);

  return {
    isRunning,
    isDone,
    dataPoints,
    error,
    progress,
    durationMin,
    start,
    stop,
    reset,
  };
}
