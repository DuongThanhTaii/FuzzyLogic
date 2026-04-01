import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const getMembership = () => api.get('/membership');
export const updateMembership = (data) => api.put('/membership', data);
export const getRules = () => api.get('/membership/rules');
export const updateRule = (data) => api.put('/membership/rules', data);
export const runSimulationBatch = (data) => api.post('/simulate', data);

export default api;
