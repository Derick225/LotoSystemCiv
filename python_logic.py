import json
import pandas as pd
import numpy as np
from scipy.stats import poisson
from scipy.fft import fft, fftfreq

class LotoAnalyzer:
    """
    Moteur d'analyse stochastique pour les résultats de loterie.
    Conçu pour traiter les exports JSON de SystemLoto Pro.
    """

    def __init__(self, data_path=None, json_data=None):
        if data_path:
            with open(data_path, 'r', encoding='utf-8') as f:
                self.raw_data = json.load(f)
        else:
            self.raw_data = json_data or []
        
        self.df = self._prepare_dataframe()

    def _prepare_dataframe(self):
        """Transforme le JSON en DataFrame Pandas exploitable."""
        if not self.raw_data:
            return pd.DataFrame()
        
        df = pd.DataFrame(self.raw_data)
        # Expansion des numéros gagnants en colonnes individuelles
        winners = pd.DataFrame(df['gagnants'].tolist(), columns=['n1', 'n2', 'n3', 'n4', 'n5'])
        df = pd.concat([df, winners], axis=1)
        
        # Calcul de la somme et de la moyenne par tirage
        df['sum'] = df[['n1', 'n2', 'n3', 'n4', 'n5']].sum(axis=1)
        df['avg'] = df[['n1', 'n2', 'n3', 'n4', 'n5']].mean(axis=1)
        
        # Inversion pour avoir l'ordre chronologique (vieux -> récent)
        return df.iloc[::-1].reset_index(drop=True)

    def get_frequency_report(self, top_n=10):
        """Analyse de fréquence pure."""
        all_numbers = pd.concat([self.df['n1'], self.df['n2'], self.df['n3'], self.df['n4'], self.df['n5']])
        freq = all_numbers.value_counts().sort_values(ascending=False)
        return freq.head(top_n).to_dict()

    def calculate_poisson_probability(self, window=50):
        """
        Calcule la probabilité de sortie au prochain tirage selon la Loi de Poisson.
        λ (lambda) = moyenne de sorties observées sur la fenêtre.
        """
        subset = self.df.tail(window)
        total_draws = len(subset)
        all_nums = pd.concat([subset['n1'], subset['n2'], subset['n3'], subset['n4'], subset['n5']])
        
        probs = {}
        for num in range(1, 91):
            observed_count = (all_nums == num).sum()
            avg_rate = observed_count / total_draws
            # Probabilité que le numéro sorte exactement 1 fois au prochain tirage
            prob_k1 = poisson.pmf(1, avg_rate)
            probs[num] = round(prob_k1 * 100, 2)
            
        return dict(sorted(probs.items(), key=lambda x: x[1], reverse=True)[:15])

    def detect_cycles_fft(self, target_number):
        """
        Utilise la transformée de Fourier rapide pour détecter les cycles cachés 
        d'un numéro spécifique.
        """
        # Création du signal binaire (1 si présent, 0 sinon)
        signal = self.df.apply(lambda x: 1 if target_number in x['gagnants'] else 0, axis=1).values
        n = len(signal)
        if n < 10: return None
        
        # Retrait de la composante continue (moyenne)
        signal = signal - np.mean(signal)
        
        # Calcul FFT
        yf = fft(signal)
        xf = fftfreq(n, 1)[:n//2]
        
        # On cherche la fréquence dominante (hors 0)
        idx = np.argmax(np.abs(yf[1:n//2])) + 1
        dominant_freq = xf[idx]
        
        if dominant_freq == 0: return 0
        
        period = 1 / dominant_freq
        return round(period, 2)

    def generate_advanced_prediction(self):
        """Combine Poisson et Spectral pour une prédiction 'Elite'."""
        poisson_top = self.calculate_poisson_probability(window=100)
        
        candidates = []
        for num, prob in poisson_top.items():
            period = self.detect_cycles_fft(num)
            # Calcul du score hybride
            score = prob
            if period and 4 <= period <= 15:
                score *= 1.5 # Bonus si le cycle est stable et court
            
            candidates.append({
                "number": num,
                "score": round(score, 2),
                "poisson_prob": prob,
                "detected_period": period
            })
            
        return sorted(candidates, key=lambda x: x['score'], reverse=True)[:5]

# --- EXEMPLE D'UTILISATION ---
if __name__ == "__main__":
    # Simulation de données pour démonstration
    mock_data = [
        {"date": "01/01/2024", "gagnants": [12, 45, 67, 89, 2]},
        {"date": "04/01/2024", "gagnants": [12, 33, 44, 55, 66]},
        {"date": "08/01/2024", "gagnants": [1, 2, 3, 4, 5]},
    ]
    # En situation réelle, on charge le fichier exporté :
    # analyzer = LotoAnalyzer(data_path='dataset_national.json')
    
    analyzer = LotoAnalyzer(json_data=mock_data)
    print("--- Rapport Python Data Science ---")
    
    if not analyzer.df.empty:
        print(f"Tirages analysés : {len(analyzer.df)}")
        print(f"Top Poisson : {analyzer.calculate_poisson_probability()}")
        
        # Test spectral sur un numéro
        cycle = analyzer.detect_cycles_fft(12)
        print(f"Cycle FFT du N°12 : ~{cycle} tirages")
        
        print("\n--- PRÉDICTION ÉLITE ---")
        print(analyzer.generate_advanced_prediction())
    else:
        print("Erreur : Dataset vide.")