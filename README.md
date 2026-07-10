# 🐄 AstroFarm — Dairy Farm Intelligence & Simulation System

> A real-time 3D dairy farm simulation powered by machine learning. Predict cow health, milk yield, and farm profitability — all visualized in an interactive digital twin running in your browser.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Python](https://img.shields.io/badge/python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)
![Three.js](https://img.shields.io/badge/3D-Three.js-black)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

## 📖 Table of Contents

- [What Is This Project?](#-what-is-this-project)
- [Key Features](#-key-features)
- [Project Architecture](#-project-architecture)
- [Tech Stack & Why Each Was Chosen](#-tech-stack--why-each-was-chosen)
- [Project Structure](#-project-structure)
- [How to Run the Project](#-how-to-run-the-project)
- [API Endpoints](#-api-endpoints)
- [Machine Learning Models](#-machine-learning-models)
- [Troubleshooting](#-troubleshooting)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🌾 What Is This Project?

Imagine you own a dairy farm with dozens of cows. Every day you need to answer critical questions:

- **"Is this cow getting sick?"** — Early detection saves expensive vet bills.
- **"How much milk will each cow produce today?"** — Plan your logistics and sales.
- **"Will the farm be profitable this week?"** — Make smarter financial decisions.

**AstroFarm** answers all three of these questions using **machine learning models** trained on real dairy farm data. But instead of showing you boring spreadsheets, it brings everything to life in a **3D simulation** — you can see your virtual cows walking around a pasture, click on any cow to inspect its health, adjust its parameters, and watch predictions update in real time.

### In Simple Terms

1. **Three AI brains** analyze each cow's data (age, breed, temperature, stress, etc.)
2. **A backend server** runs these AI brains and serves predictions instantly
3. **A 3D visual dashboard** in your browser shows the farm, the cows, and live charts
4. **Everything is connected** — change a slider, and the AI recalculates on the fly

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🏥 **Health Prediction** | Classifies cows as Healthy, At Risk, or Sick using body temperature, stress, activity level, and milk drop patterns |
| 🥛 **Milk Yield Forecasting** | Predicts daily milk production (liters) based on breed, weight, days in milk, and health status |
| 💰 **Profit Forecasting** | Uses a 7-day rolling lag window to forecast next-day farm profit with time-series analysis |
| 🌍 **3D Simulation** | Interactive Three.js scene with animated cows, a barn, pasture, day/night cycle, and orbital camera |
| 📊 **Live Dashboard** | Real-time Chart.js graphs showing milk trends, profit history, and herd health distribution |
| 🐄 **Click-to-Inspect** | Click any cow in the 3D scene to open its detailed sidebar with biometrics and predictions |
| ⏱️ **Milking Phase** | Automated daily milking event at 6:00 PM in-simulation, with progress overlay and collection stats |
| 🌅 **Day/Night Cycle** | Dynamic sky colors, sun/moon movement, and ambient lighting transitions |
| 🎮 **Interactive Controls** | Adjust simulation speed, toggle pause, add/remove cows, trigger vaccinations |

---

## 🏗️ Project Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  Three.js 3D │  │  Chart.js    │  │  HTML/CSS UI  │   │
│  │  Simulation  │  │  Dashboard   │  │  Controls     │   │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘   │
│         │                 │                  │           │
│         └────────────┬────┴──────────────────┘           │
│                      │                                   │
│              ┌───────▼────────┐                          │
│              │    app.js      │                          │
│              │  (Orchestrator)│                          │
│              └───────┬────────┘                          │
│                      │  HTTP POST (JSON)                 │
└──────────────────────┼───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                  FASTAPI BACKEND (:8000)                 │
│                                                          │
│  ┌─────────────────┐ ┌───────────────┐ ┌─────────────┐   │
│  │ /predict/health │ │ /predict/milk │ │/predict/profit│ │
│  │ (Random Forest) │ │  (XGBoost)    │ │(Grad Boost) │   │
│  └────────┬────────┘ └──────┬────────┘ └──────┬──────┘   │
│           │                 │                  │         │
│           ▼                 ▼                  ▼         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              .pkl Model Files (joblib)              │ │
│  │  cow_health_model  │  milk_yield_model  │  financial│ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack & Why Each Was Chosen

### Frontend

| Technology | Version | Purpose | Why This Choice |
|---|---|---|---|
| **HTML5 + Vanilla JS** | — | Core application | No build step required. Keeps deployment simple — just serve static files. No React/Vue overhead for a single-page simulation. |
| **Three.js** | r152 (CDN) | 3D rendering engine | The industry-standard WebGL library. Renders the farm pasture, animated cows, barn, sun/moon, and camera controls with minimal boilerplate. |
| **Chart.js** | 4.x (CDN) | Dashboard graphs | Lightweight, canvas-based charting. Perfect for real-time updating line/bar/doughnut charts without heavy dependencies like D3. |
| **CSS3 (Custom)** | — | Glassmorphism UI | Hand-crafted design system with CSS variables, `backdrop-filter` blur effects, smooth transitions, and responsive layout. No Tailwind dependency. |
| **Google Fonts** | — | Typography | `Outfit` for headings, `Inter` for body text — modern, clean, and highly legible at small sizes. |

### Backend

| Technology | Version | Purpose | Why This Choice |
|---|---|---|---|
| **FastAPI** | 0.100+ | REST API server | Faster than Flask. Auto-generates interactive API docs at `/docs`. Native async support. Built-in Pydantic validation means the frontend gets clear error messages for malformed requests. |
| **Uvicorn** | — | ASGI server | The recommended production server for FastAPI. Handles concurrent requests efficiently. |
| **Pydantic** | v2 | Request validation | Defines strict schemas (`HealthRequest`, `MilkRequest`, `ProfitRequest`) so invalid data is caught before reaching models. |
| **CORS Middleware** | — | Cross-origin access | Frontend runs on `:3000`, backend on `:8000`. CORS headers allow browser to make cross-origin API calls. |

### Machine Learning / Data Science

| Technology | Purpose | Why This Choice |
|---|---|---|
| **scikit-learn** | Health classification (Random Forest), Profit forecasting (Gradient Boosting) | Mature, well-documented, works out-of-the-box for tabular classification and regression. |
| **XGBoost** | Milk yield prediction | Best-in-class gradient boosting for structured data. Handles feature interactions and non-linear patterns better than vanilla sklearn regressors. |
| **pandas + numpy** | Data preprocessing | The standard Python data manipulation stack. Used for feature engineering, scaling, and encoding in both notebook training and backend inference. |
| **joblib** | Model serialization | Saves/loads trained models as `.pkl` files. More efficient than `pickle` for numpy-heavy objects. |
| **matplotlib + seaborn + plotly** | EDA notebook | Used during exploratory data analysis for visualizations, correlation heatmaps, and distribution plots. |

### Why NOT React / Next.js / Vite?

This project intentionally uses **plain HTML + JS** because:
1. **Zero build step** — no `npm run build`, no webpack, no bundler configuration
2. **Instant deployment** — the `frontend/` folder can be served by any static file server (Vercel, Netlify, GitHub Pages, or even `python -m http.server`)
3. **CDN-loaded libraries** — Three.js and Chart.js are loaded from `unpkg.com`, so `node_modules` aren't needed
4. **Simplicity** — for a single-page simulation, a framework adds complexity without meaningful benefit

---

## 📁 Project Structure

```
Dairy-Farm-Simulation/
│
├── 📄 README.md                    ← You are here
├── 📄 .gitignore                   ← Git ignore rules
├── 📄 streamlit_app.py             ← (Optional) Streamlit analytics dashboard
│
├── 📂 frontend/                    ← Browser-based 3D simulation
│   ├── index.html                  ← Main HTML with UI layout
│   ├── app.js                      ← All simulation logic (~1600 lines)
│   ├── style.css                   ← Complete design system (~1200 lines)
│   └── package.json                ← npm scripts (dev server shortcut)
│
├── 📂 backend/                     ← FastAPI prediction server
│   ├── main.py                     ← API routes + model loading
│   ├── get_features.py             ← Feature extraction utilities
│   └── requirements.txt            ← Python dependencies
│
├── 📂 models/                      ← Pre-trained ML models (joblib .pkl)
│   ├── cow_health_model.pkl        ← Random Forest classifier (~14 KB)
│   ├── milk_yield_model.pkl        ← XGBoost regressor (~3 MB)
│   └── farm_financial_model.pkl    ← Gradient Boosting regressor (~937 KB)
│
└── 📂 notebooks/                   ← Training & EDA
    ├── Untitled6.ipynb             ← Jupyter notebook with full EDA + model training
    ├── cow_health_records.csv      ← Health dataset (500 records)
    ├── milk_production_data.csv    ← Milk yield dataset (500 records)
    └── farm_financial_logs.csv     ← Financial time-series dataset (100 records)
```

---

## 🚀 How to Run the Project

### Prerequisites

| Requirement | Minimum Version |
|---|---|
| **Python** | 3.9+ (3.11 recommended) |
| **Node.js** | 16+ (only for `npx http-server`) |
| **pip** | Latest |
| **Web Browser** | Chrome, Firefox, or Edge (WebGL support required) |

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Salman-Bilal/Dairy-Farm-Simulation.git
cd Dairy-Farm-Simulation
```

### Step 2 — Start the Backend (FastAPI)

```bash
# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start the API server
uvicorn main:app --port 8000 --reload
```

The backend will be live at **http://localhost:8000**. You can view auto-generated API docs at **http://localhost:8000/docs**.

### Step 3 — Start the Frontend (3D Simulation)

Open a **new terminal** (keep the backend running):

```bash
cd frontend
npx -y http-server -p 3000 -o
```

This opens the simulation in your browser at **http://localhost:3000**.

### Step 4 — Interact!

1. Click **"Enter Simulation"** on the intro screen
2. Click any cow to open its detail sidebar
3. Adjust sliders (age, stress, temperature, etc.) — predictions update live
4. Watch the day/night cycle and milking events unfold
5. Expand the bottom dashboard drawer for charts

### Quick Start (Both Servers, Single Command)

On **Windows PowerShell**, you can run both simultaneously:

```powershell
# From the project root directory
Start-Process powershell -ArgumentList "-Command", "cd backend; uvicorn main:app --port 8000"
Start-Process powershell -ArgumentList "-Command", "cd frontend; npx -y http-server -p 3000 -o"
```

On **macOS / Linux** with bash:

```bash
# From the project root directory
cd backend && uvicorn main:app --port 8000 &
cd ../frontend && npx -y http-server -p 3000 -o &
```

---

## 📡 API Endpoints

All endpoints accept `POST` requests with JSON bodies. Interactive Swagger docs are available at `http://localhost:8000/docs`.

### `POST /predict/health`

Classifies a cow's health status.

**Request:**
```json
{
  "age": 5.0,
  "milk_drop_percentage": 12.0,
  "body_temperature_c": 39.2,
  "activity_level": 6.0,
  "stress_level": 4.0,
  "days_since_last_healthy": 3.0
}
```

**Response:**
```json
{
  "health_status": "Healthy",
  "confidence": 0.87
}
```

---

### `POST /predict/milk`

Predicts daily milk yield in liters.

**Request:**
```json
{
  "breed": "Holstein",
  "age_years": 4.5,
  "weight_kg": 620,
  "days_in_milk": 120,
  "stress_level": 3.0,
  "health_status": 0
}
```

**Response:**
```json
{
  "predicted_milk_liters": 22.4,
  "confidence": 0.91
}
```

**Supported Breeds:** `Holstein`, `Jersey`, `Guernsey`, `Ayrshire`, `Brown Swiss`

---

### `POST /predict/profit`

Forecasts next-day profit using a 7-day lag window.

**Request:**
```json
{
  "profit_lags": [150.0, 162.5, 148.0, 155.0, 170.2, 165.0, 158.8]
}
```

**Response:**
```json
{
  "predicted_profit_usd": 163.45,
  "predicted_profit_pkr": 45766.0,
  "confidence": 0.85
}
```

> **Note:** The `profit_lags` array must contain exactly 7 values representing the last 7 days of profit in USD. The response includes an auto-converted PKR value at 1 USD = 280 PKR.

---

## 🤖 Machine Learning Models

### 1. Cow Health Classifier

| Property | Detail |
|---|---|
| **Algorithm** | Random Forest Classifier |
| **Library** | scikit-learn |
| **Input Features** | Age, Milk Drop %, Body Temperature, Activity Level, Stress Level, Days Since Last Healthy |
| **Output** | Classification → `Healthy`, `At Risk`, or `Sick` |
| **Training Data** | `cow_health_records.csv` — 500 records with 6 features |
| **File** | `models/cow_health_model.pkl` (14 KB) |

### 2. Milk Yield Predictor

| Property | Detail |
|---|---|
| **Algorithm** | XGBoost Regressor |
| **Library** | xgboost |
| **Input Features** | Breed (one-hot encoded), Age, Weight, Days in Milk, Stress Level, Health Status |
| **Output** | Predicted milk yield in liters/day |
| **Training Data** | `milk_production_data.csv` — 500 records |
| **File** | `models/milk_yield_model.pkl` (3 MB) |

### 3. Farm Financial Forecaster

| Property | Detail |
|---|---|
| **Algorithm** | Gradient Boosting Regressor |
| **Library** | scikit-learn |
| **Input Features** | 7-day profit lag window (lag_1 through lag_7) |
| **Output** | Next-day predicted profit in USD (auto-converted to PKR at 1 USD = 280 PKR) |
| **Training Data** | `farm_financial_logs.csv` — 100 daily records with time-series lag features |
| **File** | `models/farm_financial_model.pkl` (937 KB) |

### Model Training Pipeline

All three models were trained in [`notebooks/Untitled6.ipynb`](notebooks/Untitled6.ipynb). The notebook includes:

- **Exploratory Data Analysis (EDA)** — Distribution plots, correlation heatmaps, breed comparisons
- **Feature Engineering** — One-hot encoding for categorical variables, lag feature generation for time-series
- **Train/Test Split** — 80/20 stratified split for classification, sequential split for time-series
- **Model Selection** — Comparison of multiple algorithms; best performers serialized with `joblib`
- **Evaluation Metrics** — Accuracy, R² score, MAE, and confusion matrices

---

## 🔧 Troubleshooting

| Problem | Solution |
|---|---|
| **`ModuleNotFoundError: No module named 'xgboost'`** | Run `pip install -r backend/requirements.txt` to install all dependencies |
| **sklearn `InconsistentVersionWarning`** | This is harmless. The models were trained with sklearn 1.6.x but load fine on newer versions. Warnings are suppressed in `main.py`. |
| **Port 8000 already in use** | Kill the existing process: `netstat -ano \| findstr :8000` then `taskkill /PID <pid> /F` (Windows), or use `--port 8001` |
| **Port 3000 already in use** | Change the frontend port: `npx -y http-server -p 3001 -o` |
| **CORS errors in browser console** | Make sure the backend is running on port 8000. The frontend expects `http://localhost:8000`. |
| **3D scene is black / not rendering** | Ensure your browser supports WebGL. Check at [get.webgl.org](https://get.webgl.org/). Disable hardware acceleration blockers. |
| **Predictions show "N/A"** | The backend server is not running or not reachable. Check the terminal for errors. |
| **`422 Unprocessable Entity` on /predict/profit** | The `profit_lags` array must contain exactly 7 float values. Ensure the frontend is sending the correct payload. |

---

## 🌐 Deployment

### Frontend (Static Files)

The `frontend/` folder can be deployed to any static hosting provider:

| Provider | How |
|---|---|
| **Vercel** | `vercel deploy frontend/` or connect GitHub repo |
| **Netlify** | Drag-and-drop `frontend/` folder, or connect repo with publish directory set to `frontend` |
| **GitHub Pages** | Push to `gh-pages` branch with `frontend/` as root |

### Backend (Python API)

| Provider | How |
|---|---|
| **Render** | Free tier. Create a Web Service, set build command to `pip install -r backend/requirements.txt`, start command to `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| **Railway** | Connect repo. Auto-detects Python. Set start command in `Procfile` |
| **Vercel (Serverless)** | Requires refactoring endpoints into serverless functions |

> **⚠️ Important:** When deploying, update the `API_BASE` URL in `app.js` from `http://localhost:8000` to your deployed backend URL.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the ISC License.

---
