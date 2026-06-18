import os
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import joblib

# Import generator
from generate_data import generate_synthetic_data

def train_model():
    csv_file = "dados_climaticos.csv"
    if not os.path.exists(csv_file):
        generate_synthetic_data(csv_file)
        
    print("Loading data...")
    df = pd.read_csv(csv_file, sep=';', decimal=',', encoding='latin-1', skiprows=8)
    
    # Select features
    df_ia = pd.DataFrame({
        'temperatura': df.iloc[:, 7],   # Coluna H
        'umidade':     df.iloc[:, 15],  # Coluna P
        'precipitacao': df.iloc[:, 2],   # Coluna C
        'pressao':     df.iloc[:, 3]    # Coluna D
    })
    
    df_ia = df_ia.dropna()
    print(f"Loaded {len(df_ia)} records for training.")
    
    # Train scaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(df_ia)
    
    # Train KMeans
    modelo_kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
    df_ia['cluster'] = modelo_kmeans.fit_predict(X_scaled)
    
    # Map clusters to risk levels based on precipitation mean
    resumo_clusters = df_ia.groupby('cluster')['precipitacao'].mean().sort_values()
    mapa_risco = {
        resumo_clusters.index[0]: "Baixo",
        resumo_clusters.index[1]: "Moderado",
        resumo_clusters.index[2]: "Alto"
    }
    
    print("\nKMeans clusters risk mapping:")
    for cluster_id, nivel in mapa_risco.items():
        print(f" -> Cluster {cluster_id}: Risco {nivel} (Precipitation mean: {resumo_clusters.loc[cluster_id]:.2f}mm)")
        
    # Output path (can be overridden to save in a shared docker volume)
    output_dir = os.environ.get("MODEL_OUTPUT_DIR", ".")
    os.makedirs(output_dir, exist_ok=True)
    
    joblib.dump(modelo_kmeans, os.path.join(output_dir, 'modelo_clima_kmeans.pkl'))
    joblib.dump(scaler, os.path.join(output_dir, 'scaler_clima.pkl'))
    joblib.dump(mapa_risco, os.path.join(output_dir, 'mapa_risco.pkl'))
    
    print(f"\nAI model assets successfully saved to '{output_dir}'.")

if __name__ == "__main__":
    train_model()
