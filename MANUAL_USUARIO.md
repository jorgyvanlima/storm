# Project Storm - Manual do Usuário e Especificações de Cálculo

O **Project Storm** é um sistema inteligente de monitoramento, telemetria climática e previsão de alagamentos em tempo real, focado na malha urbana de Belém-PA. O sistema mapeia dados ambientais e traduz variáveis complexas em indicadores visuais reativos para tomada de decisão preventiva.

---

## 1. Modos de Operação do Painel

O sistema possui dois modos principais de funcionamento, alternáveis diretamente na barra lateral de controle:

### 🤖 Modo Simulador
Permite simular cenários climáticos controlados para testar o comportamento de escoamento e a resiliência da infraestrutura urbana sem depender de eventos meteorológicos reais.
* **☀️ Dia Limpo / Seco:** Cenário padrão com precipitação zerada, umidade baixa e status de segurança em toda a malha.
* **🌧️ Chuva Moderada:** Introduz um volume de chuva controlado para verificar o início de acúmulo de água nas zonas de menor altitude.
* **⚡ Tempestade Extrema:** Simula um evento crítico de precipitação volumosa para avaliar quais bairros atingem o nível de alagamento iminente.

### 📡 Modo Sensor Real
Conecta o sistema diretamente à rede de sensores físicos (Módulos IoT com sensores DHT22, Barômetros e Pluviômetros simulados via Wokwi/MQTT). 
* Neste modo, **a classificação de risco é descentralizada e isolada por bairro**.
* Cada card de bairro processa e exibe exclusivamente a telemetria enviada pelo seu respectivo nó físico sensor, permitindo acompanhar frentes de chuva isoladas na cidade.

---

## 2. Parâmetros de Perfil dos Bairros

O motor de cálculo utiliza uma matriz de características geográficas e de infraestrutura pré-cadastradas para ponderar o impacto da chuva em cada localidade:

| Bairro | Altitude (`elevation`) | Limite de Saturação (`threshold`) | Índice de Drenagem (`drainage`) |
| :--- | :---: | :---: | :---: |
| **Doca de Souza Franco** | 1.2 m | 12.0 mm | 0.1 (Baixo) |
| **Cidade Velha** | 1.5 m | 20.0 mm | 0.3 (Médio-Baixo) |
| **Jurunas** | 1.8 m | 18.0 mm | 0.3 (Médio-Baixo) |
| **Umarizal** | 2.2 m | 22.0 mm | 0.4 (Médio) |
| **Batista Campos** | 3.5 m | 32.0 mm | 0.6 (Bom) |
| **Marco** | 4.2 m | 36.0 mm | 0.7 (Excelente) |

---

## 3. Especificações e Fórmulas Matemáticas

O cálculo do status de risco de cada bairro é dinâmico e processado a cada nova leitura de telemetria baseando-se nas equações descritas abaixo:

### A. Gatilho de Início de Acúmulo (`trigger`)
A água da chuva não acumula imediatamente; o solo e as galerias suportam um volume inicial antes de saturar. Esse limite inicial equivale a **40% do limite total de saturação** do bairro:

$$\text{Gatilho (mm)} = \text{threshold} \times 0.4$$

### B. Nível de Água Acumulada na Superfície (`water_level`)
Se a precipitação atual do sensor ($P$) for maior que o Gatilho, o volume excedente é multiplicado pela taxa de retenção do solo ($1.0 - \text{drainage}$) e ajustado por um fator de escala hidráulica ($0.02$):

$$\text{Se } P > \text{Gatilho} \implies \text{Nível da Água (m)} = (P - \text{Gatilho}) \times (1.0 - \text{drainage}) \times 0.02$$
$$\text{Se } P \le \text{Gatilho} \implies \text{Nível da Água (m)} = 0.00\text{ m}$$

### C. Probabilidade de Alagamento (`probability`)
Expressa a relação percentual direta entre a chuva atual medida e o limite máximo suportado pelo bairro, limitada ao teto de 100%:

$$\text{Probabilidade (\%)} = \min\left(100.0, \left(\frac{P}{\text{threshold}}\right) \times 100.0\right)$$

---

## 4. Matriz de Classificação e Alertas

A engine de backend analisa o `water_level` calculado e o volume de chuva para classificar o risco individual em três níveis visuais na interface:

1. **🔴 Alagamento Iminente (Risco ALTO)**
   * **Critério:** Nível da água acumulada superior a `0.15 m` **OU** volume de chuva superior a `20.0 mm` em bairros de baixa altitude.
   * **Efeito no Painel:** Borda do card vermelha e ondas de inundação intensas.
2. **🟠 Atenção (Risco MODERADO)**
   * **Critério:** Nível da água acumulada maior que `0.00 m` **OU** volume de chuva superior a `5.0 mm`.
   * **Efeito no Painel:** Borda do card laranja e nível de onda médio.
3. **🟢 Sem Risco (Risco BAIXO)**
   * **Critério:** Chuva abaixo do gatilho e nível de água zerado.
   * **Efeito no Painel:** Borda padrão do sistema e indicador estável.
