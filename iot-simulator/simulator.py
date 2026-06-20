import time
import random
import os
import paho.mqtt.client as mqtt

# MQTT Settings
MQTT_BROKER = os.environ.get("MQTT_BROKER", "broker")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC_TELEMETRY = "storm/telemetry"
MQTT_TOPIC_CONFIG = "storm/simulator/config"

# Current simulation preset: "dry", "moderate", "storm"
current_preset = "dry"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Simulator connected to MQTT Broker successfully.")
        client.subscribe(MQTT_TOPIC_CONFIG)
        print(f"Simulator subscribed to topic: {MQTT_TOPIC_CONFIG}")
    else:
        print(f"Simulator MQTT connection failed with code {rc}")

def on_message(client, userdata, msg):
    global current_preset
    try:
        payload = msg.payload.decode('utf-8')
        print(f"Simulator received config change: {payload}")
        if payload in ["dry", "moderate", "storm"]:
            current_preset = payload
            print(f"Simulator preset changed to: {current_preset.upper()}")
    except Exception as e:
        print(f"Error handling config message: {e}")

def main():
    print("Starting STORM IoT Simulator...")
    
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    
    # Retry connection in a loop to wait for broker to boot
    connected = False
    retries = 10
    while not connected and retries > 0:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            connected = True
        except Exception as e:
            print(f"Broker not ready yet. Retrying in 2 seconds... ({retries} left)")
            retries -= 1
            time.sleep(2)
            
    if not connected:
        print("Failed to connect to broker. Exiting.")
        return
        
    client.loop_start()
    
    while True:
        # Generate weather data based on current preset
        if current_preset == "dry":
            temp = random.uniform(29.0, 33.5)
            humidity = random.uniform(55.0, 68.0)
            precipitation = 0.0
            pressure = random.uniform(1010.0, 1013.5)
        elif current_preset == "moderate":
            temp = random.uniform(25.5, 28.0)
            humidity = random.uniform(73.0, 83.0)
            precipitation = random.uniform(1.5, 8.5)
            pressure = random.uniform(1004.0, 1008.5)
        else: # storm
            temp = random.uniform(21.5, 24.5)
            humidity = random.uniform(88.0, 97.0)
            precipitation = random.uniform(24.0, 48.0)
            pressure = random.uniform(994.0, 999.5)
            
        temp = round(temp, 1)
        humidity = round(humidity, 1)
        precipitation = round(precipitation, 1)
        pressure = round(pressure, 1)
        
        # Format exact ThingSpeak-like query string:
        # field1=temp, field2=humidity, field3=precip, field4=pressure
        # Format exact ThingSpeak-like query string com identificador de origem:
        payload_string = f"field1={temp}&field2={humidity}&field3={precipitation}&field4={pressure}&source=simulador"        

        try:
            client.publish(MQTT_TOPIC_TELEMETRY, payload_string)
            print(f"Simulator Published: {payload_string} (Preset: {current_preset.upper()})")
        except Exception as e:
            print(f"Error publishing telemetry: {e}")
            
        # Wait 8 seconds before next reading (fast enough for real-time visualization, 
        # slow enough to not overload the DB)
        time.sleep(8)

if __name__ == "__main__":
    main()
