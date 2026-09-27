"""
convert_model.py
----------------
Converts credit_risk_model.pkl to XGBoost's native .json format so the
version-mismatch warning disappears on every server startup.

Run once:
    python convert_model.py
"""

import joblib
import xgboost as xgb

MODEL_PKL = "credit_risk_model.pkl"
MODEL_OUT  = "credit_risk_model.json"

print(f"Loading {MODEL_PKL} ...")
obj = joblib.load(MODEL_PKL)

# The pkl might be:
#   (a) a raw XGBClassifier / XGBModel
#   (b) a sklearn Pipeline whose last step is an XGBClassifier
booster = None

if isinstance(obj, xgb.XGBModel):               # (a) raw estimator
    booster = obj.get_booster()
    print("Detected: raw XGBClassifier/XGBModel")
else:
    try:                                          # (b) Pipeline
        from sklearn.pipeline import Pipeline
        if isinstance(obj, Pipeline):
            last_step = obj.steps[-1][1]
            if isinstance(last_step, xgb.XGBModel):
                booster = last_step.get_booster()
                print(f"Detected: sklearn Pipeline, last step = {type(last_step).__name__}")
    except ImportError:
        pass

if booster is None:
    raise TypeError(
        f"Unexpected model type: {type(obj)}. "
        "Edit this script to handle your specific wrapper."
    )

booster.save_model(MODEL_OUT)
print(f"Saved native XGBoost model -> {MODEL_OUT}")

if hasattr(obj, "steps") and len(obj.steps) > 1:
    import pickle
    pre_path = "credit_risk_preprocessor.pkl"
    preprocessor = type(obj)(obj.steps[:-1])
    with open(pre_path, "wb") as f:
        pickle.dump(preprocessor, f)
    print(f"Saved preprocessor pipeline -> {pre_path}")
    print("NOTE: main.py will need to apply the preprocessor before predict_proba.")
else:
    print("No preprocessor steps found -- model is standalone, no extra file needed.")

print("\nDone!")
