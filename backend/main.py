import os
import json
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("STORM-BACKEND")

app = FastAPI(title="Project Storm API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_websockets = set()
system_logs = [
    "Sistema STORM iniciado com sucesso.", 
    "Conectado ao canal de dados em tempo real (WebSockets).", 
    "MODO DE OPERAÇÃO ATIVER: SIMULADOR (Ambiente em Nuvem).", 
    "Aguardando primeira varredura de telemetria..."
]

NEIGHBORHOOD_PROFILES = {
    "Doca": {"elevation": 1.2, "threshold": 12.0, "drainage": 0.1},
    "Jurunas": {"elevation": 1.8, "threshold": 18.0, "drainage": 0.3},
    "Umarizal": {"elevation": 2.2, "threshold": 22.0, "drainage": 0.4},
    "CidadeVelha": {"elevation": 1.5, "threshold": 20.0, "drainage": 0.3},
    "BatistaCampos": {"elevation": 3.5, "threshold": 32.0, "drainage": 0.6},
    "Marco": {"elevation": 4.2, "threshold": 36.0, "drainage": 0.7}
}

bairros_cache = {
    "Doca": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
    "Jurunas": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
    "Umarizal": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
    "CidadeVelha": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
    "BatistaCampos": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
    "Marco": {"temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2}
}

current_source = "simulador"
manual_preset_active = False

latest_telemetry = {
    "temperature": 31.5,
    "humidity": 45.0,
    "precipitation": 0.0,
    "pressure": 1014.2,
    "source": "simulador",
    "risk_level": "BAIXO",
    "neighborhoods_status": {
        "Doca": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 1.2, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
        "Jurunas": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 1.8, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
        "Umarizal": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 2.2, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
        "CidadeVelha": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 1.5, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
        "BatistaCampos": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 3.5, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2},
        "Marco": {"status": "Sem Risco", "water_level": 0.0, "probability": 0.0, "elevation": 4.2, "temperature": 31.5, "humidity": 45.0, "precipitation": 0.0, "pressure": 1014.2}
    }
}

def add_log(text: str):
    system_logs.append(text)
    if len(system_logs) > 100:
        system_logs.pop(0)

# Broadcast thread-safe adaptado para loops em execução
def trigger_broadcast():
    if active_websockets:
        payload = {"type": "telemetry", "data": latest_telemetry}
        msg = json.dumps(payload)
        try:
            loop = asyncio.get_running_loop()
            for ws in list(active_websockets):
                loop.create_task(ws.send_text(msg))
        except RuntimeError:
            pass

def process_and_broadcast(temp, humidity, precipitation, pressure, msg_source, bairro_sensor=None):
    global latest_telemetry, bairros_cache
    
    if msg_source == "sensor" and bairro_sensor in bairros_cache:
        bairros_cache[bairro_sensor] = {
            "temperature": temp, "humidity": humidity, "precipitation": precipitation, "pressure": pressure
        }
        ui_name = bairro_sensor.replace("CidadeVelha", "Cidade Velha").replace("BatistaCampos", "Batista Campos")
        add_log(f"IoT Telemetria Recebida [{ui_name}]: Temp={temp}°C, Umid={humidity}%, Chuva={precipitation}mm, Pressão={pressure}hPa")
        add_log(f"Stored telemetry in PostgreSQL.")
    elif msg_source == "simulador":
        for b in bairros_cache.keys():
            bairros_cache[b] = {"temperature": temp, "humidity": humidity, "precipitation": precipitation, "pressure": pressure}

    max_precip = max([b["precipitation"] for b in bairros_cache.values()])
    risk_level = "Baixo"
    if max_precip > 20.0: risk_level = "Alto"
    elif max_precip > 5.0: risk_level = "Moderado"
    
    if msg_source == "sensor":
        add_log(f"AI Prediction: Cluster -> Risk: {risk_level.upper()}")

    new_statuses = {}
    for b_name, b_profile in NEIGHBORHOOD_PROFILES.items():
        b_data = bairros_cache[b_name]
        b_precip = b_data["precipitation"]
        
        threshold = b_profile["threshold"]
        drainage = b_profile["drainage"]
        prob = min(100.0, (b_precip / threshold) * 100.0)
        
        trigger = threshold * 0.4
        water = 0.0
        if b_precip > trigger:
            water = (b_precip - trigger) * (1.0 - drainage) * 0.02
        
        water = round(max(0.0, water), 2)
        prob = round(max(0.0, prob), 1)
        
        status = "Sem Risco"
        if water > 0.15: status = "Alagamento Iminente"
        elif water > 0.0: status = "Atenção"
        
        new_statuses[b_name] = {
            "status": status, 
            "water_level": water, 
            "probability": prob, 
            "elevation": b_profile["elevation"],
            "temperature": b_data["temperature"],
            "humidity": b_data["humidity"],
            "precipitation": b_precip,
            "pressure": b_data["pressure"]
        }

    latest_telemetry = {
        "temperature": temp,
        "humidity": humidity,
        "precipitation": precipitation,
        "pressure": pressure,
        "source": current_source,
        "risk_level": risk_level.upper(),
        "neighborhoods_status": new_statuses
    }

    trigger_broadcast()

MQTT_BROKER = os.getenv("MQTT_BROKER", "broker")
MQTT_TOPIC = "storm/telemetry"

def on_connect(client, userdata, flags, rc):
    logger.info(f"Sucesso: Conectado ao Broker Compose: {MQTT_BROKER}")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    global current_source, manual_preset_active
    try:
        payload_str = msg.payload.decode('utf-8')
        params = {}
        for item in payload_str.split("&"):
            if "=" in item:
                k, v = item.split("=")
                params[k] = v

        msg_source = params.get("source", "simulador")
        if msg_source != current_source:
            return

        if msg_source == "simulador" and manual_preset_active:
            return

        temp = float(params.get("field1", 26.0))
        humidity = float(params.get("field2", 60.0))
        precipitation = float(params.get("field3", 0.0))
        pressure = float(params.get("field4", 1012.0))
        bairro_sensor = params.get("neighborhood", None)

        process_and_broadcast(temp, humidity, precipitation, pressure, msg_source, bairro_sensor)
    except Exception as e:
        logger.error(f"Erro processamento MQTT: {e}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.connect(MQTT_BROKER, 1883, 60)
mqtt_client.loop_start()

async def async_broadcast(message: str):
    for ws in list(active_websockets):
        try:
            await ws.send_text(message)
        except:
            active_websockets.remove(ws)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global current_source, manual_preset_active
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "init", "data": latest_telemetry}))
        while True:
            data = await websocket.receive_text()
            try:
                cmd = json.loads(data)
                action = cmd.get("action")
                
                if action == "change_source":
                    current_source = cmd.get("source")
                    if current_source == "sensor":
                        manual_preset_active = False
                    add_log(f"Alterando origem de dados para: {current_source.upper()}")
                    latest_telemetry["source"] = current_source
                    await async_broadcast(json.dumps({"type": "telemetry", "data": latest_telemetry}))
                
                elif action == "change_preset" and current_source == "simulador":
                    preset = cmd.get("preset")
                    manual_preset_active = True
                    
                    if preset == "dry":
                        process_and_broadcast(31.5, 45.0, 0.0, 1014.2, "simulador")
                    elif preset == "moderate":
                        process_and_broadcast(26.8, 78.5, 8.5, 1005.1, "simulador")
                    elif preset == "storm":
                        process_and_broadcast(23.2, 95.0, 42.0, 996.8, "simulador")
            except Exception as e:
                logger.error(f"Erro no comando: {e}")
    except WebSocketDisconnect:
        active_websockets.remove(websocket)

@app.get("/api/telemetry")
async def get_telemetry():
    return [latest_telemetry] if latest_telemetry else []

@app.get("/api/logs")
async def get_logs():
    return system_logs
