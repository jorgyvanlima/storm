import network
import time
import random
from machine import Pin, I2C
import dht
from umqtt.simple import MQTTClient
from esp32_i2c_lcd import I2cLcd

# --- CONFIGURAÇÕES DE REDE E MQTT ---
# ATENÇÃO: Mantenha sempre "Wokwi-GUEST" no simulador Wokwi
WIFI_SSID = "Wokwi-GUEST"
WIFI_PASSWORD = ""

# Configurações do seu servidor na nuvem
MQTT_BROKER    = "18.225.212.92"  # gamed.systes.net
MQTT_PORT      = 1883
MQTT_CLIENT_ID = "esp32-storm-sensor"
MQTT_USERNAME  = ""  # O Mosquitto está configurado em modo anônimo no docker-compose
MQTT_PASSWORD  = ""
MQTT_TOPIC     = "storm/telemetry"

# --- CONFIGURAÇÕES I2C PARA O LCD ---
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
lcd = I2cLcd(i2c, 0x27, 2, 16) 

# --- INICIALIZAÇÃO DE HARDWARE ---
sensor_dht = dht.DHT22(Pin(15))

lcd.putstr("Iniciando IoT...")
time.sleep(2)
lcd.clear()

# --- FUNÇÃO CONECTAR WI-FI ---
def conecta_wifi():
    print("Conectando ao Wi-Fi...", end="")
    sta_if = network.WLAN(network.STA_IF)
    sta_if.active(True)
    sta_if.connect(WIFI_SSID, WIFI_PASSWORD)
    while not sta_if.isconnected():
        print(".", end="")
        time.sleep(0.5)
    print(" Conectado! IP:", sta_if.ifconfig()[0])

# --- FUNÇÃO CONECTAR MQTT ---
def conecta_mqtt():
    print("Conectando ao Broker MQTT STORM...")
    client = MQTTClient(
        client_id=MQTT_CLIENT_ID, 
        server=MQTT_BROKER, 
        port=MQTT_PORT,
        user=MQTT_USERNAME, 
        password=MQTT_PASSWORD,
        keepalive=60
    )
    client.connect()
    print("Conectado ao Broker MQTT STORM com sucesso!")
    return client

# Inicialização das conexões
conecta_wifi()
try:
    cliente_mqtt = conecta_mqtt()
except Exception as e:
    print("Falha na conexão MQTT. Modo offline ativo.", e)
    cliente_mqtt = None

while True:
    try:
        # 1. Leitura direta dos sensores/sliders do Wokwi
        sensor_dht.measure()
        temp = sensor_dht.temperature()
        umidade = sensor_dht.humidity()
        
        # 2. Climatologia Dinâmica (Causa e Efeito)
        # Se a umidade for alta (> 85%) e temperatura mais baixa, simula chuva forte
        if umidade >= 85.0 and temp <= 28.0:
            precipitacao = round(random.uniform(25.0, 50.0) * (umidade / 100.0), 1)
            pressao = round(random.uniform(994.0, 999.0), 1)
        # Umidade moderada (entre 65% e 85%)
        elif 65.0 <= umidade < 85.0:
            precipitacao = round(random.uniform(1.0, 12.0), 1)
            pressao = round(random.uniform(1000.0, 1006.0), 1)
        # Tempo seco e quente
        else:
            precipitacao = 0.0
            pressao = round(random.uniform(1008.0, 1014.0), 1)

        umidade = round(umidade, 1)

        # --- ATUALIZAÇÃO DO LCD ---
        lcd.clear() 
        lcd.move_to(0, 0) 
        lcd.putstr("T:{:.1f}C U:{:.0f}%".format(temp, umidade))
        lcd.move_to(0, 1) 
        lcd.putstr("Chuva: {:.1f}mm".format(precipitacao))
        
        # --- ENVIO PARA A NUVEM VIA MQTT ---
        # Formato de query string correspondente ao esperado pelo backend
        payload_string = "field1={:.1f}&field2={:.1f}&field3={:.1f}&field4={:.1f}".format(
            temp, umidade, precipitacao, pressure
        )
        print("\nDados prontos para envio (MQTT):", payload_string)

        if cliente_mqtt is None:
            try:
                cliente_mqtt = conecta_mqtt()
            except:
                print("Broker STORM indisponível.")
        
        if cliente_mqtt:
            dados_bytes = bytes(payload_string, 'utf-8')
            cliente_mqtt.publish(MQTT_TOPIC, dados_bytes)
            print("Dados transmitidos com sucesso via MQTT para o servidor STORM!")
            
    except OSError as e:
        print("Erro de rede, tentando reconectar...", e)
        cliente_mqtt = None 
        
    # Intervalo de leitura de 8 segundos (compatível com o dashboard)
    time.sleep(8)
