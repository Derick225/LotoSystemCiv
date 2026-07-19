import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// analyze-draw: Function to offload heavy analytical operations (spectral, fractal, topological tension)
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { history, drawName } = await req.json();

    if (!history || !Array.isArray(history) || history.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid required payload: history" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Hurst Exponent Calculation (R/S analysis on occurrences over history)
    const computeHurstForNumber = (num: number, hist: any[]): number => {
      const N = Math.min(60, hist.length);
      if (N < 10) return 0.5;

      // Presence binary series [0 or 1]
      const series: number[] = hist.slice(0, N).map(d => {
        const drawWinners = d.gagnants || d.winners || [];
        return drawWinners.includes(num) ? 1 : 0;
      }).reverse();
      
      const mean = series.reduce((a, b) => a + b, 0) / N;
      
      let cumSum = 0;
      let maxPlus = 0;
      let minMinus = 0;
      let sumSquaredDiff = 0;

      for (let i = 0; i < N; i++) {
        const diff = series[i] - mean;
        cumSum += diff;
        if (cumSum > maxPlus) maxPlus = cumSum;
        if (cumSum < minMinus) minMinus = cumSum;
        sumSquaredDiff += diff * diff;
      }

      const R = maxPlus - minMinus;
      const S = Math.sqrt(sumSquaredDiff / N) || 1.0;
      
      const rsRatio = Math.max(1.0, S > 0 ? R / S : 1.0);
      const H = Math.log(rsRatio) / Math.log(N);
      
      return isNaN(H) || !isFinite(H) ? 0.50 : Math.max(0.15, Math.min(0.85, H));
    };

    // Calculate average Hurst across all numbers
    let totalH = 0;
    for (let i = 1; i <= 90; i++) {
      totalH += computeHurstForNumber(i, history);
    }
    const hurstExponent = totalH / 90;

    // 2. Fractal Dimension derived continuously: D = 2.0 - H
    const fractalDimension = 2.0 - hurstExponent;

    // 3. Spectral Signature: Discrete Fourier Transform (DFT) on consecutive draw overlapping winners
    const overlaps: number[] = [];
    for (let t = 0; t < history.length - 1; t++) {
      const cur = history[t].gagnants || history[t].winners || [];
      const next = history[t + 1].gagnants || history[t + 1].winners || [];
      const common = cur.filter((x: number) => next.includes(x)).length;
      overlaps.push(common);
    }
    if (overlaps.length < 5) {
      overlaps.push(1, 2, 0, 1, 1);
    }

    const nOverlap = overlaps.length;
    let peakFrequency = 0.1;
    let maxPower = 0.0;
    let totalPower = 0.0;

    for (let f = 0.01; f <= 0.5; f += 0.01) {
      let real = 0;
      let imag = 0;
      for (let t = 0; t < nOverlap; t++) {
        const angle = 2 * Math.PI * f * t;
        real += overlaps[t] * Math.cos(angle);
        imag -= overlaps[t] * Math.sin(angle);
      }
      const power = (real * real + imag * imag) / nOverlap;
      totalPower += power;
      if (power > maxPower) {
        maxPower = power;
        peakFrequency = f;
      }
    }
    const spectralEnergy = totalPower > 0 ? maxPower / totalPower : 0.5;
    const spectralSignature = { peakFrequency, energy: spectralEnergy };

    // 4. Topological Tension of grid based on latest draw winners (René Thom Cusp Catastrophe geometry)
    const latestDraw = history[0]?.gagnants || history[0]?.winners || [];
    let topologicalTension = 0.42;

    if (latestDraw.length === 5) {
      const xCoords = latestDraw.map((n: number) => (n - 1) % 9);
      const yCoords = latestDraw.map((n: number) => Math.floor((n - 1) / 9));

      const meanX = xCoords.reduce((sum: number, val: number) => sum + val, 0) / 5;
      const meanY = yCoords.reduce((sum: number, val: number) => sum + val, 0) / 5;

      const pairsDist: number[] = [];
      for (let i = 0; i < latestDraw.length; i++) {
        for (let j = i + 1; j < latestDraw.length; j++) {
          const dx = xCoords[i] - xCoords[j];
          const dy = yCoords[i] - yCoords[j];
          pairsDist.push(Math.sqrt(dx * dx + dy * dy));
        }
      }

      const avgDist = pairsDist.reduce((sum: number, val: number) => sum + val, 0) / pairsDist.length;
      const compressionFactor = Math.abs(avgDist - 4.2) / 2.0;
      const centerDrift = Math.sqrt(Math.pow(meanX - 4, 2) + Math.pow(meanY - 4.5, 2)) / 3.8;
      const rawTension = (compressionFactor * 0.65 + centerDrift * 0.35);
      topologicalTension = Math.min(1.0, Math.max(0.08, rawTension));
    }

    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          spectralSignature,
          fractalDimension,
          hurstExponent,
          topologicalTension
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
