from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import numpy as np
import os
import warnings
from typing import List

# Suppress sklearn version warnings
warnings.filterwarnings('ignore', category=UserWarning)

app = FastAPI(title="AstroFarm Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "..", "models")

health_model = joblib.load(os.path.join(MODELS_DIR, "cow_health_model.pkl"))
milk_model = joblib.load(os.path.join(MODELS_DIR, "milk_yield_model.pkl"))
profit_model = joblib.load(os.path.join(MODELS_DIR, "farm_financial_model.pkl"))

# Request schemas
class HealthRequest(BaseModel):
    age: float
    milk_drop_percentage: float
    body_temperature_c: float
    activity_level: float
    stress_level: float
    days_since_last_healthy: float

class MilkRequest(BaseModel):
    breed: str
    age_years: float
    weight_kg: float
    days_in_milk: float
    stress_level: float
    health_status: int  # 0: Healthy, 1: At Risk, 2: Sick

class ProfitRequest(BaseModel):
    profit_lags: List[float]  # 7 lags in USD
    sick_cow_count: int
    total_milk_l: float
    feed_cost_pkr: float  # Feed cost in USD

# Legacy schemas (backward compatibility)
class CowData(BaseModel):
    age: float
    weight: float
    breed: str
    feed: str
    water: float

# Endpoints
@app.post("/predict/health")
def predict_health(data: HealthRequest):
    features = pd.DataFrame([{
        'age': data.age,
        'milk_drop_percentage': data.milk_drop_percentage,
        'body_temperature_c': data.body_temperature_c,
        'activity_level': data.activity_level,
        'stress_level': data.stress_level,
        'days_since_last_healthy': data.days_since_last_healthy
    }])
    
    pred_label = health_model.predict(features)[0]  # E.g., 'Healthy', 'At Risk', 'Sick'
    
    # Calculate confidence using decision function softmax
    if hasattr(health_model, "decision_function"):
        decisions = health_model.decision_function(features)[0]
        exp_dec = np.exp(decisions)
        probs = exp_dec / np.sum(exp_dec)
        confidence = float(np.max(probs) * 100)
    else:
        confidence = 95.0
        
    return {
        "health_status": pred_label,
        "confidence": round(confidence, 1)
    }

@app.post("/predict/milk")
def predict_milk(data: MilkRequest):
    # One-hot encoding mapping for breed
    breed_Holstein = 1 if 'Holstein' in data.breed else 0
    breed_Jersey = 1 if 'Jersey' in data.breed else 0
    breed_Sahiwal = 1 if 'Sahiwal' in data.breed else 0
    # breed_Cholistani is reference category (all dummy columns set to 0)
    
    features = pd.DataFrame([{
        'age_years': data.age_years,
        'weight_kg': data.weight_kg,
        'days_in_milk': data.days_in_milk,
        'stress_level': data.stress_level,
        'health_status': data.health_status,
        'breed_Holstein': breed_Holstein,
        'breed_Jersey': breed_Jersey,
        'breed_Sahiwal': breed_Sahiwal
    }])
    
    pred_yield = milk_model.predict(features)[0]
    return {
        "milk_yield": round(max(0.0, float(pred_yield)), 2)
    }

@app.post("/predict/profit")
def predict_profit(data: ProfitRequest):
    # Scale simulation parameters up to PKR dataset levels:
    # Scale factors: profit/feed: USD * 7500.0, milk: L * 25.0, sick cows: count * 5.0
    profit_lags_scaled = [p * 7500.0 for p in data.profit_lags]
    sick_cow_count_scaled = data.sick_cow_count * 5.0
    total_milk_l_scaled = data.total_milk_l * 25.0
    feed_cost_pkr_scaled = data.feed_cost_pkr * 7500.0
    
    # Clip values to training dataset limits to prevent wild random extrapolation
    sick_cow_count_scaled = np.clip(sick_cow_count_scaled, 5.0, 34.0)
    total_milk_l_scaled = np.clip(total_milk_l_scaled, 5239.0, 5913.0)
    feed_cost_pkr_scaled = np.clip(feed_cost_pkr_scaled, 225750.0, 230100.0)
    
    features = pd.DataFrame([{
        'profit_lag_1': profit_lags_scaled[0],
        'profit_lag_2': profit_lags_scaled[1],
        'profit_lag_3': profit_lags_scaled[2],
        'profit_lag_4': profit_lags_scaled[3],
        'profit_lag_5': profit_lags_scaled[4],
        'profit_lag_6': profit_lags_scaled[5],
        'profit_lag_7': profit_lags_scaled[6],
        'sick_cow_count': sick_cow_count_scaled,
        'total_milk_l': total_milk_l_scaled,
        'feed_cost_pkr': feed_cost_pkr_scaled
    }])
    
    pred_profit_pkr = profit_model.predict(features)[0]
    
    # Scale back down to USD
    pred_profit_usd = pred_profit_pkr / 7500.0
    
    return {
        "predicted_profit": round(float(pred_profit_usd), 2)
    }

# Legacy endpoint for backward-compatibility with old frontend code
@app.post("/predict/cow")
def predict_cow(data: CowData):
    # Translate feed quality and water into approximate biometric factors
    stress_level = max(0, 100 - data.water) if data.water < 60 else np.random.randint(0, 20)
    body_temp = 38.5 + (np.random.rand() * 1.5 if stress_level > 50 else np.random.rand() * 0.5)
    milk_drop = 0 if stress_level < 30 else np.random.randint(10, 30)
    activity = 4500 - (stress_level * 150)
    
    h_req = HealthRequest(
        age=data.age,
        milk_drop_percentage=milk_drop,
        body_temperature_c=body_temp,
        activity_level=activity,
        stress_level=stress_level,
        days_since_last_healthy=0 if stress_level < 40 else 2
    )
    h_res = predict_health(h_req)
    
    health_status_str = h_res["health_status"]
    health_conf = h_res["confidence"]
    
    health_status_num = 0
    if health_status_str == "At Risk":
        health_status_num = 1
    elif health_status_str == "Sick":
        health_status_num = 2
        
    m_req = MilkRequest(
        breed=data.breed,
        age_years=data.age,
        weight_kg=data.weight,
        days_in_milk=150,
        stress_level=stress_level,
        health_status=health_status_num
    )
    m_res = predict_milk(m_req)
    
    return {
        "health_status": health_status_str,
        "health_confidence": health_conf,
        "milk_yield": m_res["milk_yield"]
    }
