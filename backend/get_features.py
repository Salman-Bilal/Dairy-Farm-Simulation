import joblib
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

try:
    models = ['cow_health_model.pkl', 'farm_financial_model.pkl', 'milk_yield_model.pkl']
    for m in models:
        model = joblib.load(f'../models/{m}')
        print(f"--- {m} ---")
        if hasattr(model, 'feature_names_in_'):
            print("Features:", list(model.feature_names_in_))
        else:
            print("No feature_names_in_ attribute.")
except Exception as e:
    print("Error:", e)
