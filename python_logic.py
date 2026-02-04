import numpy as np
from scipy.stats import poisson
from collections import defaultdict

class NexusStochasticEngine:
    """
    Noyau de calcul canonique pour LotoPro Platinum.
    Cette classe définit la rigueur mathématique appliquée par le système.
    """
    def __init__(self, history, n_total=90, k_drawn=5):
        self.history = history # List of winning combinations
        self.N = n_total
        self.K = k_drawn
        
    def get_poisson_score(self, num, window=50):
        """
        Calcule la 'Tension de Poisson'.
        P(X >= 1) = 1 - e^(-lambda)
        """
        recent_draws = self.history[:window]
        occurrences = sum(1 for d in recent_draws if num in d)
        
        # Lambda local (taux d'arrivée moyen)
        lam = (occurrences / len(recent_draws)) * (self.N / self.K)
        
        # Probabilité qu'il sorte au moins une fois au prochain tirage
        prob = 1 - np.exp(-lam)
        return prob * 100

    def get_markov_transition(self, last_draw):
        """
        Calcule la probabilité de transition basée sur le dernier tirage connu.
        """
        transitions = defaultdict(lambda: defaultdict(int))
        for i in range(len(self.history) - 1):
            curr, prev = self.history[i], self.history[i+1]
            for p_num in prev:
                for c_num in curr:
                    transitions[p_num][c_num] += 1
        
        scores = defaultdict(float)
        for trigger in last_draw:
            for target, count in transitions[trigger].items():
                scores[target] += (count / len(self.history))
        
        return scores

    def analyze(self):
        """
        Exécute l'analyse hybride complète.
        """
        last_draw = self.history[0]
        p_scores = {i: self.get_poisson_score(i) for i in range(1, self.N + 1)}
        m_scores = self.get_markov_transition(last_draw)
        
        final_vectors = []
        for i in range(1, self.N + 1):
            # Fusion Bayésienne simplifiée
            score = (p_scores[i] * 0.4) + (m_scores.get(i, 0) * 0.6 * 100)
            final_vectors.append((i, round(score, 2)))
            
        return sorted(final_vectors, key=lambda x: x[1], reverse=True)
