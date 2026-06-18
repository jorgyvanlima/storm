import os
import json
import time
import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import paho.mqtt.client as mqtt
import joblib
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("STORM-BACKEND")

app = FastAPI(title="STORM Backend API", version="1.0.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared Volume Paths
MODEL_DIR = os.environ.get("MODEL_DIR", "/shared")
KMEANS_PATH = os.path.join(MODEL_DIR, "modelo_clima_kmeans.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler_clima.pkl")
RISK_MAP_PATH = os.path.join(MODEL_DIR, "mapa_risco.pkl")

# Global variables for AI assets
kmeans = None
scaler = None
mapa_risco = None

# DB Settings
DB_HOST = os.environ.get("DB_HOST", "db")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ.get("DB_NAME", "storm_db")
DB_USER = os.environ.get("DB_USER", "storm_user")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "storm_password")

# MQTT Settings
MQTT_BROKER = os.environ.get("MQTT_BROKER", "broker")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC_TELEMETRY = "storm/telemetry"
MQTT_TOPIC_CONFIG = "storm/simulator/config"

# WebSocket clients list
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to WebSocket client: {e}")

manager = ConnectionManager()
system_logs: List[str] = []

def add_log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    logger.info(msg)
    system_logs.append(formatted)
    if len(system_logs) > 100:
        system_logs.pop(0)

# Helper function to connect to PostgreSQL with retries
def get_db_connection():
    retries = 10
    conn = None
    while retries > 0:
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            return conn
        except Exception as e:
            logger.warning(f"Database not ready. Retrying in 2 seconds... ({retries} retries left)")
            retries -= 1
            time.sleep(2)
    raise Exception("Could not connect to PostgreSQL database.")

# Predict flood status of Belém neighborhoods based on precipitation
def calculate_neighborhood_floods(precipitation: float) -> Dict[str, Dict[str, Any]]:
    # Configuration for Belem's neighborhoods
    # threshold: amount of rain (mm) that starts flooding
    # base_elev: height above sea level (meters)
    # drainage: drainage efficiency (0 to 1, higher is better)
    neighborhoods = {
        "Doca de Souza Franco": {"threshold": 12.0, "base_elev": 1.2, "drainage": 0.1},
        "Jurunas": {"threshold": 18.0, "base_elev": 1.8, "drainage": 0.3},
        "Batista Campos": {"threshold": 32.0, "base_elev": 3.5, "drainage": 0.6},
        "Umarizal": {"threshold": 22.0, "base_elev": 2.2, "drainage": 0.4},
        "Cidade Velha": {"threshold": 20.0, "base_elev": 1.5, "drainage": 0.3},
        "Marco": {"threshold": 36.0, "base_elev": 4.2, "drainage": 0.7}
    }
    
    result = {}
    for name, config in neighborhoods.items():
        thresh = config["threshold"]
        elev = config["base_elev"]
        drain = config["drainage"]
        
        if precipitation <= 0.05:
            prob = 0.0
            water_level = 0.0
            status = "Sem Risco"
        else:
            # Probability rises quickly after threshold
            prob = min(100.0, (precipitation / thresh) * 100.0)
            
            # Water level simulation
            # Formula: (precipitation - threshold * 0.4) * (1 - drainage) * conversion factor
            water_level = max(0.0, (precipitation - thresh * 0.4) * (1.0 - drain) * 0.02)
            water_level = round(water_level, 2)
            
            if prob < 40.0:
                status = "Sem Risco"
            elif prob < 75.0:
                status = "Atenção"
            else:
                status = "Alagamento Iminente"
                
        result[name] = {
            "status": status,
            "probability": round(prob, 1),
            "water_level": water_level,
            "elevation": elev
        }
    return result

# Core telemetry processing function
async def process_telemetry(temp: float, humidity: float, precipitation: float, pressure: float):
    global kmeans, scaler, mapa_risco
    
    # 1. Infer risk using AI Model
    risk_level = "Indefinido"
    if kmeans and scaler and mapa_risco:
        try:
            input_data = np.array([[temp, humidity, precipitation, pressure]])
            scaled = scaler.transform(input_data)
            cluster = kmeans.predict(scaled)[0]
            # Convert keys to strings/ints to avoid lookup issues
            risk_level = mapa_risco.get(cluster, mapa_risco.get(str(cluster), "Indefinido"))
            add_log(f"AI Prediction: Cluster {cluster} -> Risk: {risk_level}")
        except Exception as e:
            add_log(f"AI Inference error: {e}")
            risk_level = "Erro IA"
    else:
        add_log("AI models not loaded yet. Risk classification skipped.")
        
    # 2. Calculate Belem Neighborhoods floods
    neighborhoods_status = calculate_neighborhood_floods(precipitation)
    
    # 3. Save to PostgreSQL
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            INSERT INTO telemetry (temperature, humidity, precipitation, pressure, risk_level, neighborhoods_status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, timestamp;
        """
        cursor.execute(query, (temp, humidity, precipitation, pressure, risk_level, json.dumps(neighborhoods_status)))
        row = cursor.fetchone()
        conn.commit()
        db_id = row[0]
        timestamp = row[1].isoformat()
        cursor.close()
        conn.close()
        add_log(f"Stored telemetry ID {db_id} in PostgreSQL.")
    except Exception as e:
        add_log(f"Database storage error: {e}")
        db_id = -1
        timestamp = datetime.now().isoformat()
        
    # 4. Broadcast via WebSockets
    payload = {
        "id": db_id,
        "timestamp": timestamp,
        "temperature": temp,
        "humidity": humidity,
        "precipitation": precipitation,
        "pressure": pressure,
        "risk_level": risk_level,
        "neighborhoods_status": neighborhoods_status
    }
    await manager.broadcast({
        "type": "telemetry",
        "data": payload
    })

# MQTT callbacks
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("Connected to MQTT Broker.")
        client.subscribe(MQTT_TOPIC_TELEMETRY)
        logger.info(f"Subscribed to topic: {MQTT_TOPIC_TELEMETRY}")
    else:
        logger.error(f"MQTT connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        payload_str = msg.payload.decode('utf-8')
        logger.info(f"MQTT Message received on topic {msg.topic}: {payload_str}")
        
        # Check if it's JSON
        if payload_str.startswith("{"):
            data = json.loads(payload_str)
            temp = float(data.get("temp", data.get("temperature", 0.0)))
            humidity = float(data.get("humidity", data.get("umidade", 0.0)))
            precipitation = float(data.get("precipitation", data.get("precipitacao", data.get("chuva", 0.0))))
            pressure = float(data.get("pressure", data.get("pressao", 0.0)))
        else:
            # Check if it's URL-encoded format (like ESP32 code: field1=val&field2=val...)
            # field1=temp, field2=humidity, field3=precip, field4=pressure
            params = {}
            for item in payload_str.split("&"):
                if "=" in item:
                    k, v = item.split("=")
                    params[k] = float(v)
            temp = params.get("field1", 0.0)
            humidity = params.get("field2", 0.0)
            precipitation = params.get("field3", 0.0)
            pressure = params.get("field4", 0.0)
            
        loop = app.state.loop
        asyncio.run_coroutine_threadsafe(
            process_telemetry(temp, humidity, precipitation, pressure), 
            loop
        )
    except Exception as e:
        logger.error(f"Error processing MQTT message: {e}")

# Startup handler
@app.on_event("startup")
async def startup_event():
    global kmeans, scaler, mapa_risco
    
    app.state.loop = asyncio.get_running_loop()
    add_log("Starting STORM backend service...")
    
    # Load AI models in a retry loop (since they are trained by the ai-service container)
    retries = 30
    models_loaded = False
    while retries > 0 and not models_loaded:
        if os.path.exists(KMEANS_PATH) and os.path.exists(SCALER_PATH) and os.path.exists(RISK_MAP_PATH):
            try:
                kmeans = joblib.load(KMEANS_PATH)
                scaler = joblib.load(SCALER_PATH)
                mapa_risco = joblib.load(RISK_MAP_PATH)
                models_loaded = True
                add_log("AI models loaded successfully.")
            except Exception as e:
                logger.error(f"Error loading models: {e}")
                time.sleep(2)
        else:
            logger.info("AI models not found in shared volume. Waiting for training service...")
            retries -= 1
            time.sleep(2)
            
    if not models_loaded:
        add_log("Warning: AI models could not be loaded on startup. Running in offline/rules-only mode.")
        
    # Start MQTT Client
    try:
        mqtt_client = mqtt.Client()
        mqtt_client.on_connect = on_connect
        mqtt_client.on_message = on_message
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        app.state.mqtt = mqtt_client
        add_log("MQTT service started.")
    except Exception as e:
        add_log(f"Warning: Could not connect to MQTT Broker: {e}")

# Shutdown handler
@app.on_event("shutdown")
def shutdown_event():
    if hasattr(app.state, "mqtt"):
        app.state.mqtt.loop_stop()
        logger.info("MQTT service stopped.")

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current status on connect
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT temperature, humidity, precipitation, pressure, risk_level, neighborhoods_status, timestamp FROM telemetry ORDER BY timestamp DESC LIMIT 1;")
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            await websocket.send_json({
                "type": "init",
                "data": {
                    "temperature": float(row[0]),
                    "humidity": float(row[1]),
                    "precipitation": float(row[2]),
                    "pressure": float(row[3]),
                    "risk_level": row[4],
                    "neighborhoods_status": row[5],
                    "timestamp": row[6].isoformat()
                }
            })
            
        while True:
            # Keep alive and receive messages
            data = await websocket.receive_text()
            # If client sends simulator instruction, handle it
            try:
                cmd = json.loads(data)
                if cmd.get("action") == "change_preset":
                    preset = cmd.get("preset")
                    logger.info(f"Received preset change command via WebSocket: {preset}")
                    if hasattr(app.state, "mqtt"):
                        app.state.mqtt.publish(MQTT_TOPIC_CONFIG, preset)
                        add_log(f"Published simulator config preset: {preset}")
            except Exception as e:
                logger.error(f"WebSocket client msg error: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        manager.disconnect(websocket)

# REST endpoints
@app.get("/api/telemetry")
async def get_telemetry():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, timestamp, temperature, humidity, precipitation, pressure, risk_level, neighborhoods_status FROM telemetry ORDER BY timestamp DESC LIMIT 50;")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        history = []
        for r in rows:
            history.append({
                "id": r[0],
                "timestamp": r[1].isoformat(),
                "temperature": float(r[2]),
                "humidity": float(r[3]),
                "precipitation": float(r[4]),
                "pressure": float(r[5]),
                "risk_level": r[6],
                "neighborhoods_status": r[7]
            })
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/telemetry")
async def post_telemetry(payload: Dict[str, Any]):
    temp = float(payload.get("temperature", payload.get("temp", 0.0)))
    humidity = float(payload.get("humidity", payload.get("umidade", 0.0)))
    precipitation = float(payload.get("precipitation", payload.get("precipitacao", payload.get("chuva", 0.0))))
    pressure = float(payload.get("pressure", payload.get("pressao", 0.0)))
    
    await process_telemetry(temp, humidity, precipitation, pressure)
    return {"status": "success"}

@app.post("/api/simulator/config")
async def set_simulator_preset(payload: Dict[str, str]):
    preset = payload.get("preset")
    if preset not in ["dry", "moderate", "storm"]:
        raise HTTPException(status_code=400, detail="Invalid preset. Must be 'dry', 'moderate', or 'storm'.")
        
    if hasattr(app.state, "mqtt"):
        app.state.mqtt.publish(MQTT_TOPIC_CONFIG, preset)
        add_log(f"Published simulator config preset: {preset}")
        return {"status": "success", "preset": preset}
    else:
        raise HTTPException(status_code=503, detail="MQTT Broker not available")

@app.get("/api/logs")
async def get_logs():
    return system_logs
