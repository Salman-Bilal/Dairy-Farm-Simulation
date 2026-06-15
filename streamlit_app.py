"""
AstroFarm Analytics Dashboard
Standalone Streamlit app for model metrics, live predictions, and EDA.
Run: streamlit run streamlit_app.py
"""

import os
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import streamlit as st

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
NOTEBOOKS_DIR = ROOT / "notebooks"

st.set_page_config(
    page_title="AstroFarm Analytics",
    page_icon="🐄",
    layout="wide",
    initial_sidebar_state="expanded",
)

HEALTH_LABELS = {0: "Healthy", 1: "At Risk", 2: "Sick"}
HEALTH_MAP = {"Healthy": 0, "At Risk": 1, "Sick": 2}


@st.cache_resource
def load_models():
    paths = {
        "health": MODELS_DIR / "cow_health_model.pkl",
        "milk": MODELS_DIR / "milk_yield_model.pkl",
        "profit": MODELS_DIR / "farm_financial_model.pkl",
    }
    models = {}
    for key, path in paths.items():
        if path.exists():
            models[key] = joblib.load(path)
        else:
            models[key] = None
    return models


@st.cache_data
def load_datasets():
    data = {}
    files = {
        "health": NOTEBOOKS_DIR / "cow_health_records.csv",
        "milk": NOTEBOOKS_DIR / "milk_production_data.csv",
        "financial": NOTEBOOKS_DIR / "farm_financial_logs.csv",
    }
    for key, path in files.items():
        if path.exists():
            data[key] = pd.read_csv(path)
    return data


def health_features(df):
    return df[[
        "age", "milk_drop_percentage", "body_temperature_c",
        "activity_level", "stress_level", "days_since_last_healthy",
    ]]


def milk_features(df):
    out = df.copy()
    out["breed_Holstein"] = (out["breed"] == "Holstein").astype(int)
    out["breed_Jersey"] = (out["breed"] == "Jersey").astype(int)
    out["breed_Sahiwal"] = (out["breed"] == "Sahiwal").astype(int)
    return out[[
        "age_years", "weight_kg", "days_in_milk", "stress_level", "health_status",
        "breed_Holstein", "breed_Jersey", "breed_Sahiwal",
    ]]


def profit_features(df):
    cols = [f"profit_lag_{i}" for i in range(1, 8)]
    if not all(c in df.columns for c in cols):
        profits = df["daily_profit_pkr"].values
        lags = []
        for i in range(len(profits)):
            row = []
            for j in range(1, 8):
                idx = i - j
                row.append(profits[idx] if idx >= 0 else profits[0])
            lags.append(row)
        lag_df = pd.DataFrame(lags, columns=cols)
        merged = pd.concat([lag_df, df[["sick_cow_count", "total_milk_l", "feed_cost_pkr"]].reset_index(drop=True)], axis=1)
        return merged
    return df[cols + ["sick_cow_count", "total_milk_l", "feed_cost_pkr"]]


def evaluate_models(models, data):
    from sklearn.metrics import accuracy_score, confusion_matrix, mean_absolute_error, r2_score

    metrics = {}

    if models.get("health") and "health" in data:
        df = data["health"]
        X = health_features(df)
        y_true = df["health_condition"]
        y_pred = models["health"].predict(X)
        metrics["health"] = {
            "accuracy": accuracy_score(y_true, y_pred),
            "confusion": confusion_matrix(y_true, y_pred, labels=sorted(y_true.unique())),
            "labels": sorted(y_true.unique()),
        }

    if models.get("milk") and "milk" in data:
        df = data["milk"]
        X = milk_features(df)
        y_true = df["daily_yield_liters"]
        y_pred = models["milk"].predict(X)
        metrics["milk"] = {
            "r2": r2_score(y_true, y_pred),
            "mae": mean_absolute_error(y_true, y_pred),
        }

    if models.get("profit") and "financial" in data:
        df = data["financial"]
        X = profit_features(df)
        y_true = df["daily_profit_pkr"]
        y_pred = models["profit"].predict(X)
        metrics["profit"] = {
            "r2": r2_score(y_true, y_pred),
            "mae": mean_absolute_error(y_true, y_pred),
        }

    return metrics


def tab_model_performance(models, data, metrics):
    st.header("Model Performance")
    cols = st.columns(3)

    with cols[0]:
        st.subheader("Health Classifier")
        if models.get("health"):
            st.success("Model loaded")
            if "health" in metrics:
                st.metric("Accuracy", f"{metrics['health']['accuracy'] * 100:.1f}%")
                cm = metrics["health"]["confusion"]
                labels = metrics["health"]["labels"]
                st.caption("Confusion Matrix")
                st.dataframe(
                    pd.DataFrame(cm, index=labels, columns=labels),
                    use_container_width=True,
                )
            if hasattr(models["health"], "coef_"):
                st.caption("Linear model coefficients available")
            elif hasattr(models["health"], "feature_importances_"):
                imp = pd.Series(
                    models["health"].feature_importances_,
                    index=health_features(data["health"]).columns,
                ).sort_values(ascending=True)
                st.bar_chart(imp)
        else:
            st.error("cow_health_model.pkl not found in models/")

    with cols[1]:
        st.subheader("Milk Yield Regressor")
        if models.get("milk"):
            st.success("Model loaded")
            if "milk" in metrics:
                st.metric("R² Score", f"{metrics['milk']['r2']:.3f}")
                st.metric("MAE", f"{metrics['milk']['mae']:.2f} L")
            if hasattr(models["milk"], "feature_importances_"):
                imp = pd.Series(
                    models["milk"].feature_importances_,
                    index=milk_features(data["milk"]).columns,
                ).sort_values(ascending=True)
                st.bar_chart(imp)
        else:
            st.error("milk_yield_model.pkl not found in models/")

    with cols[2]:
        st.subheader("Farm Profit Forecaster")
        if models.get("profit"):
            st.success("Model loaded")
            if "profit" in metrics:
                st.metric("R² Score", f"{metrics['profit']['r2']:.3f}")
                st.metric("MAE", f"PKR {metrics['profit']['mae']:,.0f}")
        else:
            st.error("farm_financial_model.pkl not found in models/")


def tab_live_predictor(models):
    st.header("Live Cow Predictor")
    st.caption("Adjust parameters and see real-time ML predictions (same inputs as the 3D simulation).")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Biometrics")
        age = st.slider("Age (years)", 1.0, 12.0, 4.0, 0.1)
        milk_drop = st.slider("Milk Drop (%)", 0.0, 40.0, 5.0, 0.5)
        body_temp = st.slider("Body Temp (°C)", 38.0, 41.5, 38.6, 0.1)
        activity = st.slider("Activity Level", 1000, 8000, 4500, 100)
        stress = st.slider("Stress Level", 0.0, 10.0, 3.0, 0.1)
        days_healthy = st.slider("Days Since Last Healthy", 0, 30, 0)

    with col2:
        st.subheader("Production Profile")
        breed = st.selectbox("Breed", ["Holstein", "Jersey", "Sahiwal", "Cholistani"])
        weight = st.slider("Weight (kg)", 400, 850, 600, 5)
        days_in_milk = st.slider("Days in Milk", 0, 300, 120)

    if not models.get("health") or not models.get("milk"):
        st.warning("Place trained .pkl files in the models/ folder to enable predictions.")
        return

    h_feat = pd.DataFrame([{
        "age": age,
        "milk_drop_percentage": milk_drop,
        "body_temperature_c": body_temp,
        "activity_level": activity,
        "stress_level": stress,
        "days_since_last_healthy": days_healthy,
    }])

    health_pred = models["health"].predict(h_feat)[0]
    health_num = HEALTH_MAP.get(health_pred, 0)

    if hasattr(models["health"], "decision_function"):
        decisions = models["health"].decision_function(h_feat)[0]
        probs = np.exp(decisions) / np.sum(np.exp(decisions))
        confidence = float(np.max(probs) * 100)
    else:
        confidence = 95.0

    m_feat = pd.DataFrame([{
        "age_years": age,
        "weight_kg": weight,
        "days_in_milk": days_in_milk,
        "stress_level": stress,
        "health_status": health_num,
        "breed_Holstein": 1 if breed == "Holstein" else 0,
        "breed_Jersey": 1 if breed == "Jersey" else 0,
        "breed_Sahiwal": 1 if breed == "Sahiwal" else 0,
    }])

    milk_pred = max(0.0, float(models["milk"].predict(m_feat)[0]))

    r1, r2, r3 = st.columns(3)
    r1.metric("Health Status", health_pred, f"{confidence:.1f}% confidence")
    r2.metric("Predicted Milk", f"{milk_pred:.1f} L")
    revenue = milk_pred * 154.0
    r3.metric("Est. Revenue", f"PKR {revenue:,.0f}/day")


def get_merged_herd(data):
    if "health" in data and "milk" in data:
        h_df = data["health"]
        m_df = data["milk"]
        # Merge on cow_id. Note that stress_level is in both datasets.
        merged = pd.merge(h_df, m_df, on="cow_id", suffixes=("_health", "_milk"))
        return merged
    return None


def prepare_sandbox_health_features(df):
    out = df.copy()
    if "stress_level_health" in out.columns:
        out["stress_level"] = out["stress_level_health"]
    return out[[
        "age", "milk_drop_percentage", "body_temperature_c",
        "activity_level", "stress_level", "days_since_last_healthy",
    ]]


def prepare_sandbox_milk_features(df):
    out = df.copy()
    out["breed_Holstein"] = (out["breed"] == "Holstein").astype(int)
    out["breed_Jersey"] = (out["breed"] == "Jersey").astype(int)
    out["breed_Sahiwal"] = (out["breed"] == "Sahiwal").astype(int)
    if "stress_level_milk" in out.columns:
        out["stress_level"] = out["stress_level_milk"]
    return out[[
        "age_years", "weight_kg", "days_in_milk", "stress_level", "health_status",
        "breed_Holstein", "breed_Jersey", "breed_Sahiwal",
    ]]


def tab_health_watchlist(models, data):
    st.header("📋 Herd Health Watchlist & Diagnostics")
    st.markdown(
        "Automated health surveillance scanning all current herd biometrics using the **Health Classifier** model. "
        "Flags cows needing veterinary care and suggests remedies."
    )

    if not models.get("health"):
        st.error("Health classifier model not loaded.")
        return
    if "health" not in data:
        st.error("Health dataset (cow_health_records.csv) not found.")
        return

    df = data["health"].copy()
    
    # Run predictions on the whole health dataset
    X = health_features(df)
    df["predicted_condition"] = models["health"].predict(X)
    
    # Calculate confidence probabilities
    if hasattr(models["health"], "predict_proba"):
        probs = models["health"].predict_proba(X)
        df["confidence"] = np.max(probs, axis=1) * 100
    elif hasattr(models["health"], "decision_function"):
        decisions = models["health"].decision_function(X)
        if len(decisions.shape) > 1:
            exp_dec = np.exp(decisions)
            probs = exp_dec / np.sum(exp_dec, axis=1, keepdims=True)
            df["confidence"] = np.max(probs, axis=1) * 100
        else:
            df["confidence"] = 95.0
    else:
        df["confidence"] = 95.0

    # Filter selector
    filter_status = st.radio(
        "Filter Herd By Predicted Status:",
        ["All Flags (Sick + At Risk)", "Sick Only", "At Risk Only", "Healthy List (No Flags)"],
        horizontal=True
    )

    if filter_status == "All Flags (Sick + At Risk)":
        filtered_df = df[df["predicted_condition"].isin(["Sick", "At Risk"])]
    elif filter_status == "Sick Only":
        filtered_df = df[df["predicted_condition"] == "Sick"]
    elif filter_status == "At Risk Only":
        filtered_df = df[df["predicted_condition"] == "At Risk"]
    else:
        filtered_df = df[df["predicted_condition"] == "Healthy"]

    total_cows = len(df)
    sick_count = sum(df["predicted_condition"] == "Sick")
    risk_count = sum(df["predicted_condition"] == "At Risk")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Inspected", f"{total_cows} cows")
    c2.metric("Predicted Sick", f"{sick_count} cows", delta=f"{sick_count/total_cows*100:.1f}% of herd", delta_color="inverse")
    c3.metric("Predicted At Risk", f"{risk_count} cows", delta=f"{risk_count/total_cows*100:.1f}% of herd", delta_color="off")
    c4.metric("Healthy Status", f"{total_cows - sick_count - risk_count} cows", delta=f"{(total_cows-sick_count-risk_count)/total_cows*100:.1f}% clean")

    if filtered_df.empty:
        st.info("No cows match the selected filter.")
        return

    # Diagnostic anomalies flagging
    def flag_anomalies(row):
        flags = []
        if row["body_temperature_c"] > 39.5:
            flags.append("🤒 Fever")
        if row["milk_drop_percentage"] > 15:
            flags.append("📉 Milk Drop")
        if row["activity_level"] < 3000:
            flags.append("💤 Lethargic")
        if row["stress_level"] > 5.0:
            flags.append("⚡ High Stress")
        return ", ".join(flags) if flags else "Normal Biometrics"

    display_df = filtered_df.copy()
    display_df["Anomalies"] = display_df.apply(flag_anomalies, axis=1)
    
    # Sort by severity (Sick, then At Risk) and then milk drop percentage
    display_df["status_severity"] = display_df["predicted_condition"].map({"Sick": 0, "At Risk": 1, "Healthy": 2})
    display_df = display_df.sort_values(by=["status_severity", "milk_drop_percentage"], ascending=[True, False])

    # Reorder/select columns for output
    cols_to_show = ["cow_id", "predicted_condition", "confidence", "age", "body_temperature_c", "milk_drop_percentage", "activity_level", "stress_level", "Anomalies"]
    
    st.subheader(f"Flagged Cow Listing ({len(display_df)} records)")
    st.dataframe(
        display_df[cols_to_show].rename(columns={
            "cow_id": "Cow ID",
            "predicted_condition": "ML Diagnosis",
            "confidence": "Conf %",
            "age": "Age (Yr)",
            "body_temperature_c": "Temp (°C)",
            "milk_drop_percentage": "Milk Drop %",
            "activity_level": "Activity",
            "stress_level": "Stress",
        }).style.format({"Conf %": "{:.1f}%", "Age (Yr)": "{:.1f}", "Temp (°C)": "{:.1f}°C", "Milk Drop %": "{:.1f}%"}),
        use_container_width=True,
    )

    # Vet Advice box
    st.markdown("### 🩺 Actionable Veterinary Recommendations")
    col_adv1, col_adv2 = st.columns(2)
    with col_adv1:
        st.markdown(
            "**For Cows Flagged as 'Sick':**\n"
            "- **Isolate immediately** to prevent potential contagions in the main pasture.\n"
            "- Schedule **veterinary temperature analysis** and blood sample screening.\n"
            "- Introduce shade, hydration checks, and reduce feed ratios to easily digestible roughage."
        )
    with col_adv2:
        st.markdown(
            "**For Cows Flagged as 'At Risk':**\n"
            "- Monitor **milk drop trends**; if drop persists past 48 hours, move to active diagnostics.\n"
            "- Implement **stress mitigation factors** (such as turning on misting fans or checking feed bin levels).\n"
            "- Check pedometer/activity tracking collars to rule out physical injury (e.g. lameness)."
        )


def tab_what_if_sandbox(models, data):
    st.header("⚡ What-If Scenario Simulator & Sandbox")
    st.markdown(
        "Evaluate dynamic operational choices on the herd level. "
        "The sandbox runs batch predictions over the entire herd using both the "
        "**Health Classifier** and **Milk Regressor** models to forecast financial margins."
    )

    if not models.get("health") or not models.get("milk"):
        st.error("Both Health and Milk models must be loaded to run the sandbox.")
        return

    merged_df = get_merged_herd(data)
    if merged_df is None:
        st.error("Dataset records could not be loaded or merged.")
        return

    num_cows = len(merged_df)

    col_ctrl, col_financials = st.columns([1, 1])

    with col_ctrl:
        st.subheader("🛠️ Management Upgrades")
        misters = st.checkbox(
            "Install Cooling Misters/Fans",
            value=False,
            help="Lowers body temperature and environmental stress. Cost: 50 PKR/cow/day."
        )
        premium_feed = st.checkbox(
            "Premium Quality Feed Upgrades",
            value=False,
            help="Improves nutrition, reduces milk drop, and supports weight. Cost: 200 PKR/cow/day."
        )
        vet_package = st.checkbox(
            "Proactive Veterinary Health Plan",
            value=False,
            help="Reduces duration of illnesses, lowers stress, and improves mobility. Cost: 100 PKR/cow/day."
        )

        st.subheader("💲 Economic Inputs")
        milk_price = st.number_input(
            "Milk Market Price (PKR/Liter)",
            min_value=100.0,
            max_value=500.0,
            value=250.0,
            step=10.0
        )
        base_feed_cost = st.number_input(
            "Base Feed Cost (PKR/cow/day)",
            min_value=100.0,
            max_value=1000.0,
            value=616.0,
            step=10.0
        )

    # Calculate costs
    extra_cost_per_cow = 0.0
    if misters:
        extra_cost_per_cow += 50.0
    if premium_feed:
        extra_cost_per_cow += 200.0
    if vet_package:
        extra_cost_per_cow += 100.0

    # 1. Baseline Calculations
    # Health inputs
    X_health_base = prepare_sandbox_health_features(merged_df)
    pred_health_base = models["health"].predict(X_health_base)
    pred_health_base_num = np.array([HEALTH_MAP[label] for label in pred_health_base])

    # Milk inputs
    m_base = merged_df.copy()
    m_base["health_status"] = pred_health_base_num
    X_milk_base = prepare_sandbox_milk_features(m_base)

    pred_yield_base = models["milk"].predict(X_milk_base)
    pred_yield_base = np.maximum(0.0, pred_yield_base)

    total_yield_base = float(np.sum(pred_yield_base))
    revenue_base = total_yield_base * milk_price
    cost_base = base_feed_cost * num_cows
    profit_base = revenue_base - cost_base

    # 2. Upgraded Calculations
    m_upgraded = merged_df.copy()

    if misters:
        m_upgraded["body_temperature_c"] = np.clip(m_upgraded["body_temperature_c"] - 0.4, 38.0, 41.5)
        m_upgraded["stress_level_health"] = np.clip(m_upgraded["stress_level_health"] - 1.5, 0.0, 10.0)
        m_upgraded["stress_level_milk"] = np.clip(m_upgraded["stress_level_milk"] - 1.5, 0.0, 10.0)

    if premium_feed:
        m_upgraded["stress_level_health"] = np.clip(m_upgraded["stress_level_health"] - 1.0, 0.0, 10.0)
        m_upgraded["stress_level_milk"] = np.clip(m_upgraded["stress_level_milk"] - 1.0, 0.0, 10.0)
        m_upgraded["weight_kg"] = m_upgraded["weight_kg"] + 15
        m_upgraded["milk_drop_percentage"] = np.clip(m_upgraded["milk_drop_percentage"] - 3.0, 0.0, 40.0)

    if vet_package:
        m_upgraded["days_since_last_healthy"] = np.clip(m_upgraded["days_since_last_healthy"] * 0.5, 0, 30)
        m_upgraded["stress_level_health"] = np.clip(m_upgraded["stress_level_health"] - 0.5, 0.0, 10.0)
        m_upgraded["stress_level_milk"] = np.clip(m_upgraded["stress_level_milk"] - 0.5, 0.0, 10.0)
        m_upgraded["activity_level"] = np.clip(m_upgraded["activity_level"] + 200, 1000, 8000)

    X_health_up = prepare_sandbox_health_features(m_upgraded)
    pred_health_up = models["health"].predict(X_health_up)
    pred_health_up_num = np.array([HEALTH_MAP[label] for label in pred_health_up])

    m_up_milk = m_upgraded.copy()
    m_up_milk["health_status"] = pred_health_up_num
    X_milk_up = prepare_sandbox_milk_features(m_up_milk)

    pred_yield_up = models["milk"].predict(X_milk_up)
    pred_yield_up = np.maximum(0.0, pred_yield_up)

    total_yield_up = float(np.sum(pred_yield_up))
    revenue_up = total_yield_up * milk_price
    cost_up = (base_feed_cost + extra_cost_per_cow) * num_cows
    profit_up = revenue_up - cost_up

    # Delta stats
    yield_delta = total_yield_up - total_yield_base
    revenue_delta = revenue_up - revenue_base
    cost_delta = cost_up - cost_base
    profit_delta = profit_up - profit_base

    # 3. Financial results display
    with col_financials:
        st.subheader("📈 Projected Daily Herd Impact")
        
        st.metric(
            "Herd Milk Production",
            f"{total_yield_up:,.1f} Liters",
            delta=f"{yield_delta:+,.1f} Liters/day ({ (yield_delta/total_yield_base*100) if total_yield_base > 0 else 0:+.1f}%)"
        )
        st.metric(
            "Daily Operational Cost",
            f"PKR {cost_up:,.0f}",
            delta=f"PKR {cost_delta:+,.0f}/day",
            delta_color="inverse"
        )
        st.metric(
            "Net Farm Daily Profit",
            f"PKR {profit_up:,.0f}",
            delta=f"PKR {profit_delta:+,.0f}/day",
            delta_color="normal"
        )

    # Graphical comparison
    st.markdown("---")
    st.subheader("📊 Scenario Yield & Economic Breakdown")
    
    chart_col1, chart_col2 = st.columns(2)
    with chart_col1:
        st.caption("Daily Milk Production (Liters)")
        yield_compare = pd.DataFrame({
            "Scenario": ["Current (Baseline)", "Upgraded (Simulated)"],
            "Milk Production (L)": [total_yield_base, total_yield_up]
        })
        st.bar_chart(yield_compare.set_index("Scenario"), y="Milk Production (L)")

    with chart_col2:
        st.caption("Daily Profit Comparison (PKR)")
        profit_compare = pd.DataFrame({
            "Scenario": ["Current (Baseline)", "Upgraded (Simulated)"],
            "Net Profit (PKR)": [profit_base, profit_up]
        })
        st.bar_chart(profit_compare.set_index("Scenario"), y="Net Profit (PKR)")


def tab_herd_breed_analytics(data):
    st.header("🐄 Herd & Breed Analytics (EDA)")
    st.markdown("Detailed biological and environmental benchmarking comparing breed yield, stress resilience, and correlation statistics.")

    if "health" not in data and "milk" not in data:
        st.warning("Training CSVs not found in notebooks/.")
        return

    sub_t1, sub_t2, sub_t3 = st.tabs(["Breed ROI & Efficiency", "Stress Resiliency Curves", "Herd Health & Finance"])

    with sub_t1:
        if "milk" in data:
            df = data["milk"]
            st.subheader("Breed Performance Summary Table")
            
            # Calculate metrics
            grouped = df.groupby("breed").agg(
                average_yield=("daily_yield_liters", "mean"),
                average_weight_kg=("weight_kg", "mean"),
                average_days_in_milk=("days_in_milk", "mean"),
                average_stress=("stress_level", "mean"),
                cow_count=("cow_id", "count")
            )
            
            # Feed Efficiency: yield / weight * 100
            grouped["feed_efficiency_index"] = (grouped["average_yield"] / grouped["average_weight_kg"]) * 100
            
            st.dataframe(
                grouped.rename(columns={
                    "average_yield": "Avg Daily Yield (L)",
                    "average_weight_kg": "Avg Weight (kg)",
                    "average_days_in_milk": "Avg Days In Milk",
                    "average_stress": "Avg Stress Level",
                    "cow_count": "Herd Count",
                    "feed_efficiency_index": "Feed Efficiency Index"
                }).style.format({
                    "Avg Daily Yield (L)": "{:.2f} L",
                    "Avg Weight (kg)": "{:.1f} kg",
                    "Avg Days In Milk": "{:.1f}",
                    "Avg Stress Level": "{:.2f}",
                    "Feed Efficiency Index": "{:.3f}%"
                }),
                use_container_width=True
            )

            col1, col2 = st.columns(2)
            with col1:
                st.caption("Average Daily Yield by Breed (Liters)")
                st.bar_chart(grouped["average_yield"])
            with col2:
                st.caption("Breed Feed Efficiency Index (Yield / Weight %)")
                st.bar_chart(grouped["feed_efficiency_index"])

            st.markdown(
                "**Analysis:**\n"
                "- **Holstein** exhibits the highest yield, but has the largest body mass, requiring significant maintenance feeds.\n"
                "- **Jersey** achieves high feed efficiency due to moderate weight and steady milk output.\n"
                "- **Sahiwal & Cholistani** are highly resilient, localized breeds with smaller yields but extreme survivability under tropical conditions."
            )

    with sub_t2:
        if "milk" in data:
            df = data["milk"]
            st.subheader("Stress Resiliency Scatter Chart")
            st.markdown(
                "This visualization shows how stress levels affect daily yield across different breeds. "
                "Notice the steep downward slope of Western breeds (Holstein) vs. the flat, stable response of Indigenous breeds (Sahiwal)."
            )
            st.scatter_chart(
                df,
                x="stress_level",
                y="daily_yield_liters",
                color="breed"
            )

    with sub_t3:
        col_eda1, col_eda2 = st.columns(2)
        with col_eda1:
            if "health" in data:
                df_h = data["health"]
                st.subheader("Health Condition Counts")
                st.bar_chart(df_h["health_condition"].value_counts())
        with col_eda2:
            if "financial" in data:
                df_f = data["financial"].copy()
                st.subheader("Daily Profit Progression (PKR)")
                chart_df = df_f.set_index("day_of_simulation")[["daily_profit_pkr"]].rename(
                    columns={"daily_profit_pkr": "Daily Profit (PKR)"}
                )
                st.line_chart(chart_df)


def main():
    st.title("🐄 AstroFarm Analytics Dashboard")
    st.markdown(
        "Academic reporting interface for the AstroFarm dairy digital twin. "
        "View model performance, run live predictions, and explore training data — "
        "no 3D simulation required."
    )

    models = load_models()
    data = load_datasets()

    loaded = sum(1 for m in models.values() if m is not None)
    st.sidebar.markdown(f"**Models loaded:** {loaded}/3")
    st.sidebar.markdown("---")

    metrics = {}
    if loaded > 0 and data:
        try:
            metrics = evaluate_models(models, data)
        except Exception as exc:
            st.sidebar.warning(f"Metric evaluation skipped: {exc}")

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "Model Performance", 
        "Live Predictor", 
        "Herd Health Watchlist",
        "What-If Sandbox",
        "Herd & Breed Analytics"
    ])

    with tab1:
        tab_model_performance(models, data, metrics)
    with tab2:
        tab_live_predictor(models)
    with tab3:
        tab_health_watchlist(models, data)
    with tab4:
        tab_what_if_sandbox(models, data)
    with tab5:
        tab_herd_breed_analytics(data)

    st.sidebar.markdown("---")
    st.sidebar.markdown("**Deploy:** `streamlit run streamlit_app.py`")
    st.sidebar.markdown("**API:** FastAPI backend on port 8000")


if __name__ == "__main__":
    main()

