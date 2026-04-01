# Deploy FuzzyLogic on Render

## 1) Deploy backend (FastAPI)

1. Render dashboard -> `New` -> `Web Service`
2. Connect repo: `DuongThanhTaii/FuzzyLogic`
3. Settings:
   - `Root Directory`: `backend`
   - `Environment`: `Python`
   - `Build Command`: `pip install -r requirements.txt`
   - `Start Command`: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy.
5. Test health:
   - `https://<your-backend-name>.onrender.com/health`

## 2) Deploy frontend (Static Site)

1. Render dashboard -> `New` -> `Static Site`
2. Connect same repo.
3. Settings:
   - `Root Directory`: `frontend`
   - `Build Command`: `npm install && npm run build`
   - `Publish Directory`: `dist`
4. Add environment variables:
   - `VITE_API_BASE_URL=https://<your-backend-name>.onrender.com/api`
   - `VITE_WS_URL=wss://<your-backend-name>.onrender.com/ws/simulate`
5. Deploy static site.

## 3) Important notes

- If backend sleeps on free plan, first run can be slow.
- Frontend will fail if `VITE_API_BASE_URL` / `VITE_WS_URL` points to wrong backend URL.
- After changing environment variables, trigger redeploy frontend.
