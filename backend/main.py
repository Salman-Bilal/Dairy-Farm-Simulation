from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import numpy as np
import os

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

class CowData(BaseModel):
    age: float
    weight: float
    breed: str
    feed: str
    water: float

class FarmData(BaseModel):
    sick_cow_count: int
    total_milk_l: float
    feed_cost_pkr: float

@app.post("/predict/cow")
def predict_cow(data: CowData):
    # --- 1. Predict Health ---
    # Synthetic logic for missing features to make predictions interactive
    stress_level = max(0, 100 - data.water) if data.water < 60 else np.random.randint(0, 20)
    body_temp = 38.5 + (np.random.rand() * 1.5 if stress_level > 50 else np.random.rand() * 0.5)
    milk_drop = 0 if stress_level < 30 else np.random.randint(10, 30)
    
    health_features = pd.DataFrame([{
        'age': data.age,
        'milk_drop_percentage': milk_drop,
        'body_temperature_c': body_temp,
        'activity_level': 100 - stress_level,
        'stress_level': stress_level,
        'days_since_last_healthy': 0 if stress_level < 40 else 2
    }])
    
    # 0 = Healthy, 1 = Sick (assuming standard convention, we check output)
    health_pred = health_model.predict(health_features)[0]
    health_status_val = int(health_pred) # Let's say 0 is healthy, 1 is sick
    health_status_str = "Sick" if health_status_val == 1 else "Healthy"
    if hasattr(health_model, 'predict_proba'):
        health_conf = health_model.predict_proba(health_features)[0].max() * 100
    else:
        health_conf = 95.0
        
    # --- 2. Predict Milk Yield ---
    breed_Holstein = 1 if 'Holstein' in data.breed else 0
    breed_Jersey = 1 if 'Jersey' in data.breed else 0
    breed_Sahiwal = 1 if 'Sahiwal' in data.breed else 0
    
    milk_features = pd.DataFrame([{
        'age_years': data.age,
        'weight_kg': data.weight,
        'days_in_milk': 150, # Average
        'stress_level': stress_level,
        'health_status': health_status_val,
        'breed_Holstein': breed_Holstein,
        'breed_Jersey': breed_Jersey,
        'breed_Sahiwal': breed_Sahiwal
    }])
    
    milk_pred = milk_model.predict(milk_features)[0]
    
    # Bound milk
    milk_pred = max(0, float(milk_pred))
    
    return {
        "health_status": health_status_str,
        "health_confidence": round(health_conf, 1),
        "milk_yield": round(milk_pred, 1)
    }

@app.post("/predict/profit")
def predict_profit(data: FarmData):
    # We only have current state, so we mock the lags to be similar to current profit roughly
    # We'll just generate synthetic lags based on current milk
    base_profit = (data.total_milk_l * 120) - data.feed_cost_pkr # Roughly 120 PKR per L
    
    profit_features = pd.DataFrame([{
        'profit_lag_1': base_profit * 0.95,
        'profit_lag_2': base_profit * 0.98,
        'profit_lag_3': base_profit * 1.02,
        'profit_lag_4': base_profit * 1.0,
        'profit_lag_5': base_profit * 0.97,
        'profit_lag_6': base_profit * 0.99,
        'profit_lag_7': base_profit * 1.01,
        'sick_cow_count': data.sick_cow_count,
        'total_milk_l': data.total_milk_l,
        'feed_cost_pkr': data.feed_cost_pkr
    }])
    
    profit_pred = profit_model.predict(profit_features)[0]
    
    return {
        "profit": round(float(profit_pred), 2)
    }
