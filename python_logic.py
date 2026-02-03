import pandas as pd
import numpy as np
from scipy.stats import poisson
from collections import defaultdict

class NexusPredictor:
    """
    Moteur de Prédiction Stochastique LotoPro Nexus.
    Utilise une approche d'ensemble combinant probabilités fréquentistes et séquentielles.
    """

    def __init__(self, history_data):
        # history_data: list of dicts { 'gagnants': [1,2,3,4,5], 'date': 'YYYY-MM-DD' }
        self.df = pd.DataFrame(history_data)
        self.N = 90  # Boules totales
        self.K = 5   # Boules tirées
        
    def poisson_analysis(self, window=50):
        """
        Calcule la probabilité de sortie basée sur la distribution de Poisson.
        Compare la fréquence observée (lambda) à la fréquence théorique.
        """
        subset = self.df.head(window)
        draws_count = len(subset)
        
        flat_numbers = [n for sublist in subset['gagnants'] for n in sublist]
        freq_map = pd.Series(flat_numbers).value_counts().to_dict()
        
        scores = {}
        theoretical_prob = self.K / self.N
        
        for num in range(1, self.N + 1):
            observed_freq = freq_map.get(num, 0)
            lambda_val = observed_freq / draws_count if draws_count > 0 else 0
            
            # Probabilité d'avoir au moins 1 sortie au prochain tirage
            # P(X >= 1) = 1 - P(X = 0) = 1 - e^(-lambda)
            prob_next = 1 - np.exp(-lambda_val)
            
            # Score normalisé : on favorise les numéros proches de leur retour à la moyenne
            # ou ceux qui sur-performent (hot hands) selon le régime
            scores[num] = prob_next * 100
            
        return scores

    def markov_chain_model(self, depth=100):
        """
        Construit une matrice de transition de premier ordre.
        P(Xt | Xt-1)
        """
        transitions = defaultdict(lambda: defaultdict(int))
        subset = self.df.head(depth)
        draws = subset['gagnants'].tolist()
        
        # On regarde la transition d'un tirage (t+1) vers le tirage (t)
        # Note: self.df est trié du plus récent au plus ancien, donc draws[i] est T, draws[i+1] est T-1
        for i in range(len(draws) - 1):
            current_draw = draws[i]      # T
            previous_draw = draws[i+1]   # T-1
            
            for prev_num in previous_draw:
                for curr_num in current_draw:
                    transitions[prev_num][curr_num] += 1
                    
        # Prédiction basée sur le tout dernier tirage connu
        last_draw = draws[0]
        scores = defaultdict(float)
        
        for trigger in last_draw:
            followers = transitions[trigger]
            total_occurrences = sum(followers.values())
            if total_occurrences == 0: continue
            
            for num, count in followers.items():
                prob = count / total_occurrences
                scores[num] += prob
                
        # Normalisation 0-100
        if not scores: return {}
        max_s = max(scores.values())
        return {k: (v / max_s) * 100 for k, v in scores.items()}

    def gap_velocity(self):
        """
        Analyse l'accélération des écarts.
        """
        gaps = {}
        for num in range(1, self.N + 1):
            # Trouver l'index de la dernière occurrence
            idx = -1
            for i, row in self.df.iterrows():
                if num in row['gagnants']:
                    idx = i
                    break
            
            current_gap = idx if idx != -1 else len(self.df)
            
            # Score de vélocité: plus l'écart est grand, plus la "tension" monte
            # Sigmoid function centered at gap 18 (avg)
            gaps[num] = 100 / (1 + np.exp(-(current_gap - 18) / 5))
            
        return gaps

    def hybrid_predict(self):
        """
        Fusionne les modèles pour une prédiction robuste.
        """
        s_poisson = self.poisson_analysis()
        s_markov = self.markov_chain_model()
        s_velocity = self.gap_velocity()
        
        final_scores = []
        
        for num in range(1, self.N + 1):
            p = s_poisson.get(num, 0)
            m = s_markov.get(num, 0)
            v = s_velocity.get(num, 0)
            
            # Pondération Expert
            # Markov (Structure) > Poisson (Fréquence) > Vélocité (Gap)
            weighted_score = (p * 0.3) + (m * 0.5) + (v * 0.2)
            
            final_scores.append({
                'vector': num,
                'score': round(weighted_score, 2),
                'details': {
                    'Poisson': round(p, 1),
                    'Markov': round(m, 1),
                    'Velocity': round(v, 1)
                }
            })
            
        return sorted(final_scores, key=lambda x: x['score'], reverse=True)

# Exemple d'exécution
# data = [{'gagnants': [1,2,3,4,5], 'date': '2024-01-01'}, ...]
# predictor = NexusPredictor(data)
# result = predictor.hybrid_predict()
# print(result[:5])
