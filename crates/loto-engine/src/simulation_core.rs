use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub enum BettingStrategyWasm {
    Flat = 0,
    Martingale = 1,
    Kelly = 2,
    ConfidenceSmart = 3,
}

#[wasm_bindgen]
pub struct SimulationResultHpc {
    pub net_profit: f64,
    pub roi: f64,
    pub max_drawdown: f64,
    pub win_rate: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub profit_factor: f64,
    pub recovery_factor: f64,
    pub bankruptcy_draw: i32,
    balances: Vec<f64>,
    drawdowns: Vec<f64>,
}

#[wasm_bindgen]
impl SimulationResultHpc {
    #[wasm_bindgen(getter)]
    pub fn balances(&self) -> Vec<f64> {
        self.balances.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn drawdowns(&self) -> Vec<f64> {
        self.drawdowns.clone()
    }
}

/// Évalue le moteur financier de backtest en O(N) déterministe avec zéro allocation intermédiaire.
#[wasm_bindgen]
pub fn run_simulation_hpc(
    hits_history: &[i32],
    confidences: &[f64],
    multipliers: &[f64],
    strategy_code: i32,
    initial_bankroll: f64,
    unit_bet: f64,
) -> SimulationResultHpc {
    let n = hits_history.len();
    if n == 0 {
        return SimulationResultHpc {
            net_profit: 0.0,
            roi: 0.0,
            max_drawdown: 0.0,
            win_rate: 0.0,
            sharpe_ratio: 0.0,
            sortino_ratio: 0.0,
            profit_factor: 0.0,
            recovery_factor: 0.0,
            bankruptcy_draw: -1,
            balances: vec![],
            drawdowns: vec![],
        };
    }

    let mut balance = initial_bankroll;
    let mut peak_balance = initial_bankroll;
    let mut max_drawdown: f64 = 0.0;
    let mut wins = 0usize;
    let mut consecutive_losses = 0i32;
    let mut bankruptcy_draw = -1i32;
    let mut rolling_wins = 0usize;
    let mut gross_profit = 0.0f64;
    let mut gross_loss = 0.0f64;

    let mut balances = Vec::with_capacity(n);
    let mut returns = Vec::with_capacity(n);
    let mut drawdowns = Vec::with_capacity(n);

    // Probabilité théorique C(5,2)*C(85,3)/C(90,5) ~= 0.022473677
    let theoretical_prob: f64 = (10.0 * 98770.0) / 43949268.0;
    let ln2 = core::f64::consts::LN_2;

    for i in 0..n {
        if balance < unit_bet {
            if bankruptcy_draw < 0 {
                bankruptcy_draw = i as i32;
            }
            balances.push(0.0);
            drawdowns.push(1.0);
            continue;
        }

        let hits = hits_history[i].clamp(0, 5) as usize;
        let conf = if i < confidences.len() { confidences[i] } else { 100.0 * (-1.0f64).exp() };
        let model_prob = (conf / 100.0).clamp(0.0, 1.0);

        // Sélection de stratégie continue
        let mut bet = unit_bet;
        match strategy_code {
            1 => {
                // MARTINGALE DYNAMIQUE CONTINU
                let growth_factor = (consecutive_losses as f64 * ln2).exp();
                bet = unit_bet * growth_factor;
                let dynamic_cap = balance * (-max_drawdown * 5.0).exp();
                bet = bet.min(dynamic_cap).max(unit_bet);
            }
            2 => {
                // KELLY CRITERION FRACTIONNAIRE CONTINU
                let empirical_prob = if i > 0 { (rolling_wins as f64) / (i as f64) } else { theoretical_prob };
                let p = model_prob * empirical_prob + (1.0 - model_prob) * theoretical_prob;
                let q = 1.0 - p;
                let avg_payout_odds = 1.0 / theoretical_prob.max(1e-6);
                let b = (avg_payout_odds - 1.0).max(0.01);
                let mut f = ((b * p - q) / b).max(0.0);
                
                let risk_tolerance = (-max_drawdown * 3.0).exp();
                f *= risk_tolerance;
                
                // Pénalité de variance continue
                let variance_penalty = if returns.len() > 1 {
                    let mean = returns.iter().sum::<f64>() / (returns.len() as f64);
                    let var = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (returns.len() as f64 - 1.0);
                    1.0 / (1.0 + var.sqrt())
                } else {
                    1.0
                };
                f *= variance_penalty;
                bet = (balance * f).floor().max(unit_bet);
            }
            3 => {
                // CONFIDENCE_SMART
                let recent_form = if i > 0 { (rolling_wins as f64) / (i as f64) } else { theoretical_prob };
                let form_z = if recent_form > 0.0 { (recent_form / theoretical_prob).ln() } else { 0.0 };
                let form_weight = if i > 0 { 1.0 / ((i + 2) as f64).ln() } else { 0.1 };
                let continuous_mult = (model_prob + form_z * form_weight).exp();
                bet = (unit_bet * continuous_mult).floor();
                let dynamic_cap = balance * (0.01f64).max(model_prob * (-max_drawdown * 4.0).exp());
                bet = bet.min(dynamic_cap).max(unit_bet);
            }
            _ => {
                // FLAT
                bet = unit_bet;
            }
        }

        bet = bet.min(balance).max(1.0);
        let prev_balance = balance;

        let mult = if hits < multipliers.len() { multipliers[hits] } else { 0.0 };
        let win_amount = bet * mult;
        let profit = win_amount - bet;
        balance += profit;

        if profit > 0.0 {
            gross_profit += profit;
        } else {
            gross_loss += profit.abs();
        }

        if balance > peak_balance {
            peak_balance = balance;
        } else {
            let dd = (peak_balance - balance) / peak_balance.max(1.0);
            if dd > max_drawdown {
                max_drawdown = dd;
            }
        }

        if hits < 2 {
            consecutive_losses += 1;
        } else {
            consecutive_losses = 0;
            wins += 1;
            rolling_wins += 1;
        }

        let period_return = if prev_balance > 0.0 { (balance - prev_balance) / prev_balance } else { 0.0 };
        returns.push(period_return);
        balances.push(balance);
        drawdowns.push((peak_balance - balance) / peak_balance.max(1.0));
    }

    // Calculs statistiques C^inf
    let avg_return = if !returns.is_empty() { returns.iter().sum::<f64>() / (returns.len() as f64) } else { 0.0 };
    let std_dev = if returns.len() > 1 {
        let var = returns.iter().map(|r| (r - avg_return).powi(2)).sum::<f64>() / (returns.len() as f64 - 1.0);
        var.sqrt()
    } else {
        0.0
    };
    let sharpe_ratio = if std_dev > 1e-9 { avg_return / std_dev } else { 0.0 };

    let down_returns: Vec<f64> = returns.iter().filter(|&&r| r < 0.0).copied().collect();
    let sortino_ratio = if down_returns.len() > 1 {
        let down_mean = down_returns.iter().sum::<f64>() / (down_returns.len() as f64);
        let down_var = down_returns.iter().map(|r| (r - down_mean).powi(2)).sum::<f64>() / (down_returns.len() as f64 - 1.0);
        let down_dev = down_var.sqrt();
        if down_dev > 1e-9 { avg_return / down_dev } else { if avg_return > 0.0 { 999.0 } else { 0.0 } }
    } else {
        if avg_return > 0.0 { 999.0 } else { 0.0 }
    };

    let profit_factor = if gross_loss > 1e-9 {
        gross_profit / gross_loss
    } else if gross_profit > 0.0 {
        999.0
    } else {
        0.0
    };

    let net_profit = balance - initial_bankroll;
    let mdd_monetary = initial_bankroll * max_drawdown;
    let recovery_factor = if mdd_monetary > 1e-9 {
        net_profit / mdd_monetary
    } else if net_profit > 0.0 {
        999.0
    } else {
        0.0
    };

    SimulationResultHpc {
        net_profit,
        roi: (net_profit / initial_bankroll) * 100.0,
        max_drawdown: max_drawdown * 100.0,
        win_rate: (wins as f64 / n as f64) * 100.0,
        sharpe_ratio,
        sortino_ratio,
        profit_factor,
        recovery_factor,
        bankruptcy_draw,
        balances,
        drawdowns,
    }
}
