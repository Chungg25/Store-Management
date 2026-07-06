@echo off
echo ========================================================
echo DR. SMILE STORE MANAGEMENT - KHOI DONG HE THONG LOCAL
echo ========================================================

echo 1. Cai dat cac thu vien Python (Neu chua cai)...
pip install -r api\requirements.txt

echo.
echo 2. Khoi dong Backend (Python FastAPI) o cong 8000...
start cmd /k "uvicorn api.index:app --reload --port 8000"

echo.
echo 3. Khoi dong Frontend (React Vite)...
start cmd /k "npm run dev"

echo.
echo ========================================================
echo He thong dang chay!
echo - Trang web se tu dong mo tai: http://localhost:5173
echo - Backend API chay tai: http://localhost:8000
echo ========================================================
pause
