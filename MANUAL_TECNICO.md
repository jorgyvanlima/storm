# Project Storm - Manual Técnico de Arquitetura e Engenharia de Dados

Este documento fornece as especificações de engenharia, arquitetura de software, infraestrutura de rede assíncrona e modelagem matemática do **Project Storm**, uma plataforma distribuída de telemetria climática de alta performance para a região metropolitana de Belém-PA.

---

## 1. Visão Geral da Arquitetura do Sistema

O Project Storm baseia-se em uma arquitetura orientada a eventos (EDA - *Event-Driven Architecture*), dividida em quatro camadas desacopladas que operam em regime de tempo real e baixa latência.

┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Malha IoT      │ ────> │  Ingestão MQTT   │ ────> │  Backend Engine │
│  (Física/Wokwi) │       │  (Mosquitto Broker)      │  (FastAPI Async)│
└─────────────────┘       └──────────────────┘       └────────┬────────┘
│
┌──────────────────────────────────────────────────────┴────────┐
▼                                                              ▼
┌─────────────────┐                                            ┌─────────────────┐
│ Transmissão WS  │ ─────────────────────────────────────────> │ Frontend SPA    │
│ (WebSockets)    │                                            │ (React + Vite)  │
└─────────────────┘                                            └─────────────────┘


### Componentes Tecnológicos:
* **Camada de Ingestão Periférica (Edge/IoT):** Microcontroladores ESP32 coletando dados de sensores DHT22 (temperatura/umidade), barômetros BMP280 (pressão) e sensores de chuva tipping-bucket. A comunicação externa utiliza o protocolo industrial **MQTT** sobre TLS.
* **Mensageria e Corretor de Eventos:** Broker **Eclipse Mosquitto** atuando como concentrador e distribuidor dos tópicos de telemetria.
* **Núcleo de Processamento (Backend):** Aplicação assíncrona desenvolvida em **Python 3.11+ / FastAPI**. O processamento paralelo é garantido via loop de eventos nativo (`asyncio`).
* **Camada de Apresentação (Frontend):** Aplicação Single Page (SPA) reativa construída com **React 18** e **Vite**, utilizando componentes agnósticos estilizados via CSS utilitário para renderização em tempo real e gráficos baseados em WebSocket.

---

## 2. Pipeline de Dados e Fluxo de Mensagens Assíncronas

O processamento de dados opera sob o princípio de processamento reativo de fluxos de dados (*Stream Processing*):

[Módulo Sensor] ─(MQTT Publish)─> [Mosquitto Broker] ─(Async Sub)─> [FastAPI Core]
│
┌───────────────── Persistent Storage (PostgreSQL) <───────────────────┤
│
└─> [Engine de Predição / Regras Hidráulicas] ─(WS Broadcast)─> [React SPA]


1. **Ingestão:** Os sensores transmitem pacotes estruturados em JSON para o broker com frequência ajustada (tipicamente 1.5s).
2. **Subscrição Assíncrona:** O backend FastAPI mantém um Worker assíncrono em segundo plano (`background_tasks` acoplado ao ciclo de vida da aplicação) utilizando a biblioteca `gmqtt`. Este worker consome do broker sem bloquear as requisições HTTP ou conexões ativas de WebSockets.
3. **Normalização e Enriquecimento:** O JSON bruto é validado sintaticamente e mapeado contra a matriz estática de perfis topográficos (`NEIGHBORHOOD_PROFILES`).
4. **Persistência Assíncrona:** Os dados normalizados são enfileirados e inseridos concorrencialmente no banco de dados relacional **PostgreSQL**, utilizando um pool de conexões assíncronas (`asyncpg`).
5. **Cálculo da Matriz de Risco:** A engine hidráulica calcula o impacto setorial.
6. **Broadcast de Baixa Latência:** O estado consolidado da malha é serializado e despachado via canal **WebSocket** (`/ws`) duplex para todas as instâncias de clientes conectadas na interface web.

---

## 3. Engenharia de Parâmetros e Motor Hidráulico

O grande diferencial técnico do sistema reside no tratamento individualizado da hidrodinâmica urbana, modelada programaticamente no backend.

### Estrutura de Dados dos Perfis Urbano-Topográficos (`dict`)
```python
NEIGHBORHOOD_PROFILES = {
    "Doca de Souza Franco": {"elevation": 1.2, "threshold": 12.0, "drainage": 0.1},
    "Cidade Velha":          {"elevation": 1.5, "threshold": 20.0, "drainage": 0.3},
    "Jurunas":               {"elevation": 1.8, "threshold": 18.0, "drainage": 0.3},
    "Umarizal":              {"elevation": 2.2, "threshold": 22.0, "drainage": 0.4},
    "Batista Campos":        {"elevation": 3.5, "threshold": 32.0, "drainage": 0.6},
    "Marco":                 {"elevation": 4.2, "threshold": 36.0, "drainage": 0.7}
}
Algoritmo Base de Classificação Dinâmica (Python Pseudo-Code)
Python
def process_and_broadcast(neighborhood: str, raw_precipitation: float):
    profile = NEIGHBORHOOD_PROFILES[neighborhood]
    
    # 1. Determinação do Gatilho de Saturação (Ponto Inicial de Acúmulo Pluvial)
    accumulation_trigger = profile["threshold"] * 0.4
    
    # 2. Integração do Nível Hidrostático de Superfície (m)
    if raw_precipitation > accumulation_trigger:
        excess_rain = raw_precipitation - accumulation_trigger
        retention_coefficient = 1.0 - profile["drainage"]
        # Fator de escala empírico (0.02) correlaciona mm/h em metros acumulados
        water_level = excess_rain * retention_coefficient * 0.02
    else:
        water_level = 0.0
        
    # 3. Probabilidade Estatística de Transbordo de Calha
    probability = min(100.0, (raw_precipitation / profile["threshold"]) * 100.0)
    
    # 4. Avaliação Heurística de Risco por Faixa Crítica
    if water_level > 0.15 or (raw_precipitation > 20.0 and profile["elevation"] <= 1.5):
        risk_level = "ALTO"
        status = "Alagamento Iminente"
    elif water_level > 0.0 or raw_precipitation > 5.0:
        risk_level = "MODERADO"
        status = "Atenção"
    else:
        risk_level = "BAIXO"
        status = "Sem Risco"
        
    return {
        "status": status,
        "risk_level": risk_level,
        "water_level": round(water_level, 2),
        "probability": round(probability, 1),
        "elevation": profile["elevation"]
    }
4. Estrutura do Pacote de Telemetria (JSON Schema)
A mensagem serializada trafegada via WebSocket implementa o seguinte formato estrito, garantindo reatividade total no frontend:

JSON
{
  "type": "telemetry",
  "data": {
    "temperature": 29.8,
    "humidity": 82.5,
    "precipitation": 36.8,
    "pressure": 1009.4,
    "source": "sensor",
    "risk_level": "MODERADO",
    "neighborhoods_status": {
      "Cidade Velha": {
        "status": "Alagamento Iminente",
        "risk_level": "ALTO",
        "water_level": 0.40,
        "probability": 100.0,
        "elevation": 1.5,
        "temperature": 29.8,
        "humidity": 82.5,
        "precipitation": 36.8,
        "pressure": 1009.4
      },
      "Marco": {
        "status": "Atenção",
        "risk_level": "MODERADO",
        "water_level": 0.10,
        "probability": 89.4,
        "elevation": 4.2,
        "temperature": 28.1,
        "humidity": 85.0,
        "precipitation": 32.2,
        "pressure": 1010.1
      }
    }
  }
}
5. Orquestração de Infraestrutura e Containers (DevOps)
Toda a stack é isolada e provisionada via Docker e Docker Compose, abstraindo configurações locais e garantindo portabilidade para qualquer VPS.

YAML
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: storm-database
    environment:
      POSTGRES_DB: project_storm
      POSTGRES_USER: storm_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  mosquitto:
    image: eclipse-mosquitto:2
    container_name: storm-mqtt-broker
    volumes:
      - ./mosquitto/config:/mosquitto/config
    ports:
      - "1883:1883"

  backend:
    build: ./backend
    container_name: storm-backend
    depends_on:
      - postgres
      - mosquitto
    environment:
      - DATABASE_URL=postgresql+asyncpg://storm_admin:${DB_PASSWORD}@postgres/project_storm
      - MQTT_HOST=mosquitto
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    container_name: storm-frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
Comandos Críticos de Administração de Infraestrutura:
Compilação Limpa da Stack Inteira:

Bash
sudo docker compose up --build -d
Hot-Reload do Módulo de Frontend após Ajuste Visual:

Bash
sudo docker compose up --build -d frontend
Monitoramento de Logs do Motor de Predição Pluvial em Tempo Real:

Bash
sudo docker compose logs -f backend
