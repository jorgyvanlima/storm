import csv
import random
import os

def generate_synthetic_data(file_path):
    print("Generating synthetic weather data for training...")
    
    # 8 rows of dummy header to match skiprows=8
    headers = [
        "INMET - Instituto Nacional de Meteorologia",
        "Estacao: BELEM (A201)",
        "Latitude: -1.411222, Longitude: -48.437222",
        "Periodo: 2026-01-01 a 2026-06-17",
        "Dados Climaticos para Treinamento de IA",
        "Gerado Automaticamente - Projeto STORM",
        "------------------------------------",
        "Data;Hora;Precipitacao;Pressao;TempBulboSeco;TempBulboUmido;TempMaxima;TempMinima;UmidadeRelativa;UmidadeMinima;VentoDirecao;VentoRajada;VentoVelocidade;Radiacao;PressaoMax;PressaoMin"
    ]
    
    # Standard columns needed by training script:
    # df.iloc[:, 7] -> 8th col (index 7): TempMinima / Temperatura
    # df.iloc[:, 15] -> 16th col (index 15): PressaoMin / Umidade
    # df.iloc[:, 2] -> 3rd col (index 2): Precipitacao
    # df.iloc[:, 3] -> 4th col (index 3): Pressao
    
    rows = []
    
    # We want to generate 1000 rows covering 3 distinct clusters:
    # Cluster 0: Dry/Hot Day (Baixo Risco)
    # Cluster 1: Rain/Humid (Moderado Risco)
    # Cluster 2: Heavy Storm (Alto Risco)
    
    # Let's generate 400 dry rows, 300 moderate rows, 300 storm rows
    # Formatting values with commas for decimals as expected by the script
    def to_val(v):
        return str(round(v, 1)).replace('.', ',')
        
    for _ in range(400):
        # Dry
        temp = random.uniform(28.0, 34.0)
        humid = random.uniform(60.0, 75.0)
        precip = 0.0
        press = random.uniform(1010.0, 1014.0)
        rows.append((temp, humid, precip, press))
        
    for _ in range(300):
        # Moderate Rain
        temp = random.uniform(25.0, 28.0)
        humid = random.uniform(75.0, 85.0)
        precip = random.uniform(1.0, 15.0)
        press = random.uniform(1004.0, 1009.0)
        rows.append((temp, humid, precip, press))
        
    for _ in range(300):
        # Heavy Storm
        temp = random.uniform(21.0, 25.0)
        humid = random.uniform(85.0, 100.0)
        precip = random.uniform(16.0, 60.0)
        press = random.uniform(992.0, 1003.0)
        rows.append((temp, humid, precip, press))
        
    # Shuffle rows to avoid clustered order
    random.shuffle(rows)
    
    dir_name = os.path.dirname(file_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(file_path, "w", encoding="latin-1") as f:
        # Write 7 lines of metadata
        for i in range(7):
            f.write(f"Metadata line {i+1} info;\n")
        # Write column headers line (8th line)
        f.write("Data;Hora;Precipitacao;Pressao;C4;C5;C6;Temperatura;C8;C9;C10;C11;C12;C13;C14;Umidade\n")
        
        # Write data rows
        for temp, humid, precip, press in rows:
            # Construct a row with 16 elements
            # Index 2: precip
            # Index 3: press
            # Index 7: temp
            # Index 15: humid
            row = [
                "2026-06-18", # Date (0)
                "12:00",      # Time (1)
                to_val(precip), # Precip (2)
                to_val(press),  # Press (3)
                "dummy", "dummy", "dummy", # (4, 5, 6)
                to_val(temp),   # Temp (7)
                "dummy", "dummy", "dummy", "dummy", "dummy", "dummy", "dummy", # (8 to 14)
                to_val(humid)   # Humid (15)
            ]
            f.write(";".join(row) + "\n")
            
    print(f"Generated {len(rows)} rows at {file_path}")

if __name__ == "__main__":
    generate_synthetic_data("dados_climaticos.csv")
