from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
from io import BytesIO
import os

app = Flask(__name__)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory state
STATE = {
    "df": None  # pandas DataFrame
}

# ---------- Helpers ----------
def df_stats(df: pd.DataFrame):
    return {
        "rows": int(len(df)),
        "cols": int(len(df.columns)),
        "missing_values": int(df.isna().sum().sum()),
        "duplicates": int(df.duplicated().sum())
    }

def df_columns_data(df: pd.DataFrame):
    """Return columns list and data as list of dicts (stringified for safety)."""
    cols = list(map(str, df.columns))
    # Convert to python native types (strings) to avoid JSON problems with numpy types
    data = df.fillna("").astype(str).to_dict(orient="records")
    return cols, data

# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = file.filename.lower()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(file)
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(file)
        else:
            return jsonify({"error": "Unsupported file type. Use CSV or XLSX."}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to read file: {e}"}), 400

    STATE["df"] = df.reset_index(drop=True)
    cols, data = df_columns_data(STATE["df"])
    stats = df_stats(STATE["df"])
    return jsonify({"columns": cols, "data": data, "stats": stats})

@app.route("/get-data", methods=["GET"])
def get_data():
    df = STATE["df"]
    if df is None:
        return jsonify({"error": "No data loaded"}), 400
    cols, data = df_columns_data(df)
    stats = df_stats(df)
    return jsonify({"columns": cols, "data": data, "stats": stats})

@app.route("/get-stats", methods=["GET"])
def get_stats():
    df = STATE["df"]
    if df is None:
        return jsonify({"error": "No data loaded"}), 400
    return jsonify(df_stats(df))

@app.route("/update-data", methods=["POST"])
def update_data():
    payload = request.get_json(silent=True) or {}
    new_data = payload.get("data")
    if new_data is None:
        return jsonify({"error": "No data provided"}), 400
    # Expect list of dicts mapping column->value
    df = pd.DataFrame(new_data)
    # If columns differ, try to align to existing columns if present
    if STATE["df"] is not None:
        # Keep original column order when possible
        orig_cols = list(map(str, STATE["df"].columns))
        # Add missing columns from new data
        for c in orig_cols:
            if c not in df.columns:
                df[c] = ""
        df = df[orig_cols]
    STATE["df"] = df.reset_index(drop=True)
    cols, data = df_columns_data(STATE["df"])
    return jsonify({"message": "Data saved", "columns": cols, "data": data, "stats": df_stats(STATE["df"])})

@app.route("/remove-duplicates", methods=["POST"])
def remove_duplicates():
    if STATE["df"] is None:
        return jsonify({"error": "No data loaded"}), 400
    payload = request.get_json(silent=True) or {}
    subset = payload.get("subset")  # None or list
    simulate = payload.get("simulate", False)

    df = STATE["df"]
    if simulate:
        dupes = int(df.duplicated(subset=subset).sum()) if subset else int(df.duplicated().sum())
        return jsonify({"duplicates_found": dupes})

    # apply
    STATE["df"] = df.drop_duplicates(subset=subset, keep="first").reset_index(drop=True)
    cols, data = df_columns_data(STATE["df"])
    return jsonify({"columns": cols, "data": data, "stats": df_stats(STATE["df"])})

@app.route("/fill-missing", methods=["POST"])
def fill_missing():
    if STATE["df"] is None:
        return jsonify({"error": "No data loaded"}), 400
    payload = request.get_json(silent=True) or {}
    val = payload.get("value", "")
    column = payload.get("column")  # None or column name

    try:
        if column and column in STATE["df"].columns:
            STATE["df"][column] = STATE["df"][column].fillna(val)
        else:
            STATE["df"] = STATE["df"].fillna(val)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    cols, data = df_columns_data(STATE["df"])
    return jsonify({"columns": cols, "data": data, "stats": df_stats(STATE["df"])})

@app.route("/download", methods=["GET"])
def download():
    if STATE["df"] is None:
        return jsonify({"error": "No data loaded"}), 400
    fmt = (request.args.get("format") or "csv").lower()
    buf = BytesIO()
    if fmt == "xlsx":
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            STATE["df"].to_excel(writer, index=False, sheet_name="cleaned")
        buf.seek(0)
        return send_file(buf, as_attachment=True, download_name="cleaned_data.xlsx",
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    else:
        STATE["df"].to_csv(buf, index=False)
        buf.seek(0)
        return send_file(buf, as_attachment=True, download_name="cleaned_data.csv", mimetype="text/csv")

if __name__ == "__main__":
    app.run(debug=True)
