# STORM: Sistema Inteligente de Telemetria Climática e Alerta de Alagamento para Belém-PA

Este projeto foi desenvolvido como trabalho prático da disciplina da **Pós-Graduação em Cibersegurança da UFPA (Universidade Federal do Pará)** pela **Equipe de Desenvolvimento (Grupo D)**.

O sistema **STORM** é uma solução 100% conteinerizada (Docker) voltada para a coleta de dados climáticos em tempo real (telemetria de temperatura, umidade, precipitação e pressão atmosférica), predição de risco de enchentes por Inteligência Artificial (modelo de agrupamento *K-Means* da biblioteca *scikit-learn*) e visualização em tempo real das áreas críticas de alagamento do município de Belém. O painel visual possui uma interface inspirada na personagem Tempestade (*Storm* - X-Men).

---

## 👥 Equipe de Desenvolvimento (Grupo D)

Trabalho desenvolvido pelos discentes da Pós-Graduação em Cibersegurança da UFPA:

*   **Arienilce Sacramento Gonçalves**
*   **Clisciano Nascimento Souza**
*   **Flávio Alexandre Souza Nunes**
*   **Jorgyvan Braga Lima**
*   **Józimo Azevedo Botelho**
*   **Osvaldo José Rodrigues Neves**
*   **Thiago Bitar Cruz**
*   **Wallace Pablo Rocha da Cruz**
*   **Vinícius Antônio de Paula Valente**
*   **Josiane Moraes**

---

## 🏛️ Arquitetura do Sistema

O sistema é dividido em **6 contêineres Docker independentes** que se comunicam através de redes isoladas e volumes compartilhados, além de uma camada de proxy reverso no sistema hospedeiro (Nginx).

```mermaid
graph TD
    subgraph Host [Servidor Cloud (18.225.212.92)]
        NginxHost[Nginx Host Proxy - Portas 80/443] -->|Proxy storm.sytes.net| Frontend[storm_frontend - Porta 8080]
        NginxHost -->|Proxy /ws e /api| Backend[storm_backend - Porta 8000]
        
        subgraph DockerNetwork [Rede Docker Interna]
            Frontend -->|Requisições Internas| Backend
            Backend -->|Conexão DB| DB[(storm_db - PostgreSQL 15)]
            Backend -->|Inscrição/Escrita MQTT| Broker[storm_broker - Mosquitto]
            Simulator[storm_iot_simulator - Python] -->|Publica Telemetria| Broker
            Broker -->|Injeta Telemetria| Backend
            
            Trainer[storm_ai_trainer - sklearn] -->|Gera Dataset & Treina Modelo| Volume[(Volume Compartilhado: shared_model)]
            Volume -.->|Lê Modelos (.pkl)| Backend
        end
    end
    
    Wokwi[ESP32 Simulator - Wokwi/Físico] -->|MQTT Port 1883| Broker
```

### 1. Banco de Dados (`db/`)
*   **Tecnologia:** PostgreSQL 15 (Alpine).
*   **Função:** Armazena o histórico de telemetria coletado dos sensores e as classificações de risco geradas pelo modelo de Inteligência Artificial.

### 2. Broker MQTT (`broker/`)
*   **Tecnologia:** Eclipse Mosquitto v2.
*   **Função:** Canal centralizado de telemetria IoT. Recebe dados no tópico `storm/telemetry` e escuta por comandos de simulação no tópico `storm/simulator/config`.

### 3. Serviço de Inteligência Artificial (`ai-service/`)
*   **Tecnologia:** Python 3.11-slim, Pandas, NumPy, Scikit-Learn.
*   **Função:** No *startup* do ecossistema, gera um dataset sintético contendo 1000 registros históricos calibrados para o clima equatorial úmido de Belém (dias ensolarados, chuvas de fim de tarde e tempestades tropicais severas). Treina um modelo de agrupamento *K-Means* com normalização (*StandardScaler*), classifica e mapeia as classes em riscos (Baixo, Moderado, Alto) e exporta os arquivos `.pkl` para o volume compartilhado `/shared`. Após o treinamento bem-sucedido, o contêiner encerra a execução liberando memória.

### 4. API Backend (`backend/`)
*   **Tecnologia:** Python 3.11-slim, FastAPI, Uvicorn, Psycopg2, Paho-MQTT, Joblib.
*   **Função:** Aguarda a inicialização e sucesso do treinamento do modelo de IA (via compose depend). Carrega dinamicamente os modelos `.pkl` treinados e se conecta ao PostgreSQL e ao Broker MQTT. A cada telemetria recebida:
    1. Executa inferência em tempo real com o modelo K-Means para estimar o nível de risco.
    2. Calcula os acúmulos e probabilidade de alagamento específicos para 6 bairros de Belém com base na precipitação atual e relevo do bairro.
    3. Persiste o registro completo no banco de dados.
    4. Transmite instantaneamente os dados via WebSocket para todos os navegadores abertos.

### 5. Simulador IoT (`iot-simulator/`)
*   **Tecnologia:** Python 3.11-slim, Paho-MQTT.
*   **Função:** Simula o comportamento físico de um termômetro conectado e motor de chuva inteligente. Permite alternar presets de teste ("Dia Seco", "Chuva Moderada", "Tempestade Extrema") de forma dinâmica pelo dashboard, publicando telemetrias compatíveis de 8 em 8 segundos.

### 6. Painel Frontend (`frontend/`)
*   **Tecnologia:** React, Vite, Nginx (Stage-build), Lucide Icons.
*   **Função:** Interface 100% web, interativa e de alta fidelidade visual. Traz um tema escuro e elementos neon roxos/cianos inspirados no tema "Tempestade". Exibe os 4 indicadores de clima (Termômetro, Umidade, Chuva e Pressão), console terminal em tempo real exibindo logs de processamento e cards animados dos bairros de Belém com animações líquidas (ondas de água subindo de acordo com o nível da inundação). Quando o risco global é classificado como "Alto", ativa relâmpagos visuais intermitentes no fundo da interface.

---

## 🔒 Boas Práticas de Cibersegurança Implementadas

Por se tratar de um projeto de pós-graduação em **Cibersegurança**, foram implementadas as seguintes diretrizes de segurança de infraestrutura e aplicação:

1.  **Isolamento e Redução de Superfície de Ataque:** O banco de dados PostgreSQL (`storm_db`) **não expõe nenhuma porta para o host ou internet**. A comunicação ocorre estritamente dentro da rede interna criada pelo Docker Compose (`storm_network`), impossibilitando tentativas de força bruta ou varredura de portas externas.
2.  **Proxy Reverso Host Seguro:** A porta padrão exposta da aplicação (`8080`) é controlada localmente pelo Nginx no sistema operacional do servidor. Toda a navegação web externa é encapsulada sob SSL/TLS utilizando cifras criptográficas fortes (`ssl_ciphers` recomendadas pela Mozilla/OWASP) e protocolos modernos (TLS 1.2/1.3).
3.  **Cabeçalhos de Segurança (Security Headers):** A configuração do proxy reverso injeta cabeçalhos HTTP essenciais contra ataques comuns:
    *   `X-Frame-Options "DENY"` (Previne ataques de Clickjacking).
    *   `X-Content-Type-Options "nosniff"` (Previne MIME sniffing).
    *   `X-XSS-Protection "1; mode=block"` (Mitiga Cross-Site Scripting).
    *   `Referrer-Policy "no-referrer-when-downgrade"` (Protege cabeçalhos de referência).
4.  **Sanitização e Parametrização SQL:** As queries executadas pelo Backend utilizam adaptadores parametrizados (`psycopg2` placeholder `%s`), garantindo imunidade completa contra vulnerabilidades de *SQL Injection*.
5.  **Princípio do Menor Privilégio no Docker:** Os contêineres de aplicação utilizam imagens *slim* ou *alpine*, minimizando bibliotecas vulneráveis instaladas no sistema de arquivos do contêiner.

---

## 📂 Estrutura do Repositório

```text
├── ai-service/             # Scripts de geração de dados e treino do modelo
│   ├── Dockerfile
│   ├── generate_data.py
│   ├── requirements.txt
│   └── train.py
├── backend/                # API FastAPI, WebSockets e cliente MQTT
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── broker/                 # Arquivo de configuração Mosquitto MQTT
│   └── mosquitto.conf
├── db/                     # Script de inicialização SQL
│   └── init.sql
├── frontend/               # Código fonte da interface React e Nginx Proxy
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── iot-simulator/          # Simulador de termômetro e gerador de presets
│   ├── Dockerfile
│   ├── requirements.txt
│   └── simulator.py
├── docker-compose.yml      # Arquivo de orquestração do ecossistema
├── esp32-wokwi-code.py     # Código de firmware MicroPython para simulação Wokwi
├── sites-available-storm.conf # Configuração do Nginx do Host
└── README.md               # Documentação Oficial (este arquivo)
```

---

## 🚀 Como Executar e Deploy

### Pré-requisitos
*   Docker e Docker Compose instalados no servidor.
*   Nginx instalado no sistema hospedeiro (para o proxy reverso).

### Passo 1: Subir a infraestrutura Docker
No diretório do projeto, execute o comando para construir as imagens e iniciar os contêineres em background:
```bash
docker compose up --build -d
```
> O Docker Compose iniciará o Banco de Dados e o Broker MQTT primeiro. Em seguida, executará o `ai-service` para treinar o KMeans. Assim que o treinamento finalizar e salvar os arquivos `.pkl`, os contêineres de Backend, Simulador e Frontend serão inicializados automaticamente.

Verifique se todos os contêineres estão em execução:
```bash
docker compose ps
```

### Passo 2: Configurar o Nginx no Hospedeiro
1.  Copie o arquivo de configuração para a pasta de sites disponíveis do Nginx:
    ```bash
    sudo cp sites-available-storm.conf /etc/nginx/sites-available/storm
    ```
2.  Crie o link simbólico para habilitar o site:
    ```bash
    sudo ln -sf /etc/nginx/sites-available/storm /etc/nginx/sites-enabled/storm
    ```
3.  Valide a sintaxe do arquivo de configuração:
    ```bash
    sudo nginx -t
    ```
4.  Recarregue o Nginx para aplicar as alterações:
    ```bash
    sudo systemctl reload nginx
    ```

### Passo 3: Configurar o Simulador Wokwi (IoT ESP32)
Para testar a telemetria utilizando um microcontrolador simulado no [Wokwi](https://wokwi.com/):
1.  Abra o arquivo `esp32-wokwi-code.py` no repositório.
2.  Copie o código completo.
3.  Crie um novo projeto ESP32 no Wokwi utilizando o sensor **DHT22** e um display **LCD 1602 (I2C)**.
4.  Adicione as conexões no editor do Wokwi:
    *   DHT22 Pino SDA/Data -> ESP32 Pino 15.
    *   LCD SDA -> ESP32 Pino 21.
    *   LCD SCL -> ESP32 Pino 22.
5.  Cole o código no arquivo `main.py` do Wokwi e execute. Ele se conectará ao broker MQTT do seu servidor (`18.225.212.92`) e enviará as métricas automaticamente.

---

## 📈 Lógica de Análise Climática de Belém (Bairros)

Cada bairro possui altitudes específicas e coeficientes de escoamento e drenagem cadastrados na lógica do backend. As probabilidades e níveis de água são simulados dinamicamente com base nas seguintes taxas:

| Bairro | Altitude Base | Limiar de Alagamento (Precipitação) | Drenagem do Solo |
| :--- | :--- | :--- | :--- |
| **Doca de Souza Franco** | 1.2 m | 12.0 mm | 10% (Baixa eficiência) |
| **Cidade Velha** | 1.5 m | 20.0 mm | 30% (Moderada) |
| **Jurunas** | 1.8 m | 18.0 mm | 30% (Moderada) |
| **Umarizal** | 2.2 m | 22.0 mm | 40% (Moderada) |
| **Batista Campos** | 3.5 m | 32.0 mm | 60% (Alta) |
| **Marco** | 4.2 m | 36.0 mm | 70% (Alta) |

---

## 🛠️ Comandos de Suporte e Diagnóstico

*   **Verificar logs em tempo real do Backend:**
    ```bash
    docker logs -f storm_backend
    ```
*   **Verificar status do Banco de Dados:**
    ```bash
    docker exec -it storm_db pg_isready -U storm_user -d storm_db
    ```
*   **Acessar terminal interativo do Banco de Dados:**
    ```bash
    docker exec -it storm_db psql -U storm_user -d storm_db
    ```
*   **Reiniciar o simulador de telemetria:**
    ```bash
    docker compose restart iot-simulator
    ```
