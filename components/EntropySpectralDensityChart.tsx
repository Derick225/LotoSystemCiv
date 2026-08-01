import React, { useRef, useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { DrawResult } from "../types";
import { useNexusStore } from "../store/useNexusStore";
import { Activity, Percent } from "lucide-react";

interface EntropySpectralDensityChartProps {
  history: DrawResult[];
  drawName: string;
}

export const EntropySpectralDensityChart: React.FC<EntropySpectralDensityChartProps> = ({
  history,
  drawName,
}) => {
  const storeDrawName = useNexusStore((state) => state.drawName);
  const [hoveredData, setHoveredData] = useState<{
    date: string;
    entropy: number;
    hurst: number;
  } | null>(null);

  const [hoveredKde, setHoveredKde] = useState<{
    number: number;
    realDensity: number;
    theoreticalDensity: number;
  } | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const densityContainerRef = useRef<HTMLDivElement>(null);

  // Filter history to make sure it belongs exclusively to the active draw name
  const isolatedHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const active = (drawName || storeDrawName || "").trim().toLowerCase();
    return history.filter((d) => {
      const dName = (d.drawName || d.draw_name || "").trim().toLowerCase();
      return dName === active;
    });
  }, [history, drawName, storeDrawName]);

  // Max number determination based on the draw name
  const maxNumber = useMemo(() => {
    const name = (drawName || storeDrawName || "").toLowerCase();
    if (name.includes("90")) return 90;
    if (name.includes("50")) return 50;
    if (name.includes("49")) return 49;
    return 90; // Default fallback
  }, [drawName, storeDrawName]);

  // Compute sliding window Shannon Entropy & Hurst Exponent
  const slidingMetrics = useMemo(() => {
    const results: { drawId: string; date: string; entropy: number; hurst: number }[] = [];
    if (isolatedHistory.length < 15) return [];

    const windowSize = 10;
    const historyReversed = [...isolatedHistory].reverse();

    for (let i = windowSize; i < historyReversed.length; i++) {
      const windowData = historyReversed.slice(i - windowSize, i);
      
      // 1. Sliding Shannon Entropy
      const freq = new Float32Array(maxNumber + 1);
      let totalNumbers = 0;
      for (const d of windowData) {
        for (const val of d.gagnants) {
          if (val >= 1 && val <= maxNumber) {
            freq[val]++;
            totalNumbers++;
          }
        }
      }

      let entropy = 0;
      if (totalNumbers > 0) {
        for (let num = 1; num <= maxNumber; num++) {
          if (freq[num] > 0) {
            const p = freq[num] / totalNumbers;
            entropy -= p * Math.log2(p);
          }
        }
      }
      const maxPossibleEntropy = Math.log2(maxNumber);
      const normalizedEntropy = maxPossibleEntropy > 0 ? entropy / maxPossibleEntropy : 0;

      // 2. Sliding Hurst Exponent (R/S Method)
      // Represent each draw by the average value of its winning numbers
      const series = windowData.map((d) => {
        const sum = d.gagnants.reduce((a, b) => a + b, 0);
        return d.gagnants.length > 0 ? sum / d.gagnants.length : maxNumber / 2;
      });

      // Calculate Hurst Exponent using Rescaled Range (R/S) approximation for sliding window size
      const mean = series.reduce((a, b) => a + b, 0) / series.length;
      const meanAdjusted = series.map((val) => val - mean);
      const cumulativeDeviates: number[] = [];
      let tempSum = 0;
      for (const val of meanAdjusted) {
        tempSum += val;
        cumulativeDeviates.push(tempSum);
      }
      const maxDeviate = Math.max(...cumulativeDeviates, 0);
      const minDeviate = Math.min(...cumulativeDeviates, 0);
      const range = maxDeviate - minDeviate;
      const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / series.length;
      const stdDev = Math.sqrt(variance);

      // Map R/S continuously to [0, 1] Hurst score range
      const rs = stdDev > 0.001 ? range / stdDev : 0.5;
      const estimatedHurst = Math.min(0.99, Math.max(0.01, 0.5 + (Math.log(rs || 1) - 1.2) * 0.25));

      results.push({
        drawId: historyReversed[i].id || `draw_${i}`,
        date: historyReversed[i].date || `S-${i}`,
        entropy: normalizedEntropy,
        hurst: estimatedHurst,
      });
    }

    return results;
  }, [isolatedHistory, maxNumber]);

  // Compute Kernel Density Estimation (KDE) for Frequency Distribution vs Theoretical Normal
  const densityData = useMemo(() => {
    if (isolatedHistory.length === 0) return [];

    // Frequency counts
    const frequencyCounts = new Float32Array(maxNumber + 1);
    let totalDrawn = 0;
    for (const d of isolatedHistory) {
      for (const val of d.gagnants) {
        if (val >= 1 && val <= maxNumber) {
          frequencyCounts[val]++;
          totalDrawn++;
        }
      }
    }

    // Theoretical Uniform expected frequency
    const expectedUniformFrequency = totalDrawn / maxNumber;

    // Normal theoretical distribution matching uniform bounds
    // Mean of uniform distribution (1 to maxNumber) is (maxNumber + 1) / 2
    const theoreticalMean = (maxNumber + 1) / 2;
    // Standard deviation of uniform distribution
    const theoreticalStdDev = Math.sqrt((maxNumber * maxNumber - 1) / 12);

    // Compute continuous Gaussian KDE
    // Silverman's Rule of Thumb for optimal bandwidth selection
    const valuesList: number[] = [];
    for (let i = 1; i <= maxNumber; i++) {
      for (let j = 0; j < frequencyCounts[i]; j++) {
        valuesList.push(i);
      }
    }

    const n = valuesList.length;
    let bandwidth = 3.0; // Fallback
    if (n > 1) {
      const sampleMean = valuesList.reduce((a, b) => a + b, 0) / n;
      const sampleVar = valuesList.reduce((acc, v) => acc + Math.pow(v - sampleMean, 2), 0) / (n - 1);
      const sampleStdDev = Math.sqrt(sampleVar);
      
      // Compute Interquartile Range (IQR)
      const sortedValues = [...valuesList].sort((a, b) => a - b);
      const q1 = sortedValues[Math.floor(n * 0.25)];
      const q3 = sortedValues[Math.floor(n * 0.75)];
      const iqr = q3 - q1;

      const spread = Math.min(sampleStdDev, iqr / 1.34) || sampleStdDev || 15;
      bandwidth = 0.9 * spread * Math.pow(n, -0.2); // Silverman's Rule
      bandwidth = Math.max(1.5, Math.min(6.0, bandwidth)); // Clamped continuously
    }

    // Define continuous points (1 to maxNumber)
    const points: { number: number; realDensity: number; theoreticalDensity: number }[] = [];
    
    // Normal distribution function
    const normalPdf = (x: number, mean: number, std: number) => {
      const exponent = -Math.pow(x - mean, 2) / (2 * std * std);
      return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    };

    // Integrate Gaussian kernels for each number
    for (let x = 1; x <= maxNumber; x++) {
      let kernelSum = 0;
      for (let i = 1; i <= maxNumber; i++) {
        const diff = (x - i) / bandwidth;
        // Standard normal kernel K(u)
        const k = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * diff * diff);
        // Multiply by the actual count of draws for number i
        kernelSum += (frequencyCounts[i] / totalDrawn) * (k / bandwidth);
      }

      // Compute normal theoretical density
      const tDensity = normalPdf(x, theoreticalMean, theoreticalStdDev);

      points.push({
        number: x,
        realDensity: kernelSum,
        theoreticalDensity: tDensity,
      });
    }

    return points;
  }, [isolatedHistory, maxNumber]);

  // Render Sliding Timeline Chart
  useEffect(() => {
    if (!timelineContainerRef.current || slidingMetrics.length === 0) return;

    // Clean container first
    d3.select(timelineContainerRef.current).selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = timelineContainerRef.current.clientWidth - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = d3
      .select(timelineContainerRef.current)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X scale
    const xScale = d3
      .scaleLinear()
      .domain([0, slidingMetrics.length - 1])
      .range([0, width]);

    // Y scale
    const yScale = d3.scaleLinear().domain([0, 1.0]).range([height, 0]);

    // X Axis
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(Math.min(10, slidingMetrics.length))
          .tickFormat((d) => {
            const item = slidingMetrics[Number(d)];
            return item ? item.date.replace("2026-", "") : "";
          })
      )
      .call((g) => g.select(".domain").attr("stroke", "#cbd5e1"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#64748b").attr("font-size", "10px").attr("font-weight", "600"));

    // Y Axis
    svg
      .append("g")
      .call(d3.axisLeft(yScale).ticks(5))
      .call((g) => g.select(".domain").attr("stroke", "#cbd5e1"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#64748b").attr("font-size", "10px").attr("font-weight", "600"));

    // Dynamic clean grid lines
    svg
      .append("g")
      .attr("class", "grid")
      .attr("stroke", "#f1f5f9")
      .attr("stroke-opacity", 0.8)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(() => ""));

    // Generator for Shannon Entropy
    const lineEntropy = d3
      .line<{ entropy: number }>()
      .curve(d3.curveMonotoneX)
      .x((_, idx) => xScale(idx))
      .y((d) => yScale(d.entropy));

    // Generator for Hurst Exponent
    const lineHurst = d3
      .line<{ hurst: number }>()
      .curve(d3.curveMonotoneX)
      .x((_, idx) => xScale(idx))
      .y((d) => yScale(d.hurst));

    // Path for Shannon Entropy
    svg
      .append("path")
      .datum(slidingMetrics)
      .attr("fill", "none")
      .attr("stroke", "#6366f1")
      .attr("stroke-width", 2.5)
      .attr("d", lineEntropy);

    // Path for Hurst Exponent
    svg
      .append("path")
      .datum(slidingMetrics)
      .attr("fill", "none")
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 2.5)
      .attr("d", lineHurst);

    // Dynamic hover overlay interaction vertical line
    const hoverLine = svg
      .append("line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3")
      .style("opacity", 0);

    // Hidden rect for capture of mouse events
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const idx = Math.round(xScale.invert(mouseX));
        const item = slidingMetrics[idx];
        if (item) {
          hoverLine.attr("x1", xScale(idx)).attr("x2", xScale(idx)).style("opacity", 1);
          setHoveredData(item);
        }
      })
      .on("mouseleave", () => {
        hoverLine.style("opacity", 0);
        setHoveredData(null);
      });
  }, [slidingMetrics]);

  // Render Continuous Density (KDE) vs Theoretical Gaussian
  useEffect(() => {
    if (!densityContainerRef.current || densityData.length === 0) return;

    // Clean container first
    d3.select(densityContainerRef.current).selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = densityContainerRef.current.clientWidth - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = d3
      .select(densityContainerRef.current)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale (Numbers range from 1 to maxNumber)
    const xScale = d3.scaleLinear().domain([1, maxNumber]).range([0, width]);

    // Y Scale
    const maxReal = d3.max(densityData, (d) => d.realDensity) || 0.05;
    const maxTheo = d3.max(densityData, (d) => d.theoreticalDensity) || 0.05;
    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(maxReal, maxTheo) * 1.1])
      .range([height, 0]);

    // X Axis
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g) => g.select(".domain").attr("stroke", "#cbd5e1"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#64748b").attr("font-size", "10px").attr("font-weight", "600"));

    // Y Axis
    svg
      .append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".3f")))
      .call((g) => g.select(".domain").attr("stroke", "#cbd5e1"))
      .call((g) => g.selectAll(".tick text").attr("fill", "#64748b").attr("font-size", "10px").attr("font-weight", "600"));

    // Dynamic grid lines
    svg
      .append("g")
      .attr("class", "grid")
      .attr("stroke", "#f1f5f9")
      .attr("stroke-opacity", 0.8)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(() => ""));

    // Path generator for continuous Real Density KDE
    const lineReal = d3
      .line<{ number: number; realDensity: number }>()
      .curve(d3.curveBasis) // Continuous smooth wave
      .x((d) => xScale(d.number))
      .y((d) => yScale(d.realDensity));

    // Path generator for continuous Theoretical Gaussian
    const lineTheo = d3
      .line<{ number: number; theoreticalDensity: number }>()
      .curve(d3.curveBasis) // Continuous smooth wave
      .x((d) => xScale(d.number))
      .y((d) => yScale(d.theoreticalDensity));

    // Plot Theoretical Curve
    svg
      .append("path")
      .datum(densityData)
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("d", lineTheo);

    // Plot Real Curve
    svg
      .append("path")
      .datum(densityData)
      .attr("fill", "none")
      .attr("stroke", "#06b6d4")
      .attr("stroke-width", 2.5)
      .attr("d", lineReal);

    // Interactive Hover Line
    const hoverLine = svg
      .append("line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#64748b")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2")
      .style("opacity", 0);

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const numValue = Math.round(xScale.invert(mouseX));
        const item = densityData.find((d) => d.number === numValue);
        if (item) {
          hoverLine.attr("x1", xScale(numValue)).attr("x2", xScale(numValue)).style("opacity", 1);
          setHoveredKde(item);
        }
      })
      .on("mouseleave", () => {
        hoverLine.style("opacity", 0);
        setHoveredKde(null);
      });
  }, [densityData, maxNumber]);

  if (isolatedHistory.length < 15) {
    return (
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[250px]">
        <Activity className="text-slate-300 animate-pulse mb-3" size={32} />
        <span className="text-xs font-black uppercase text-slate-400 tracking-widest text-center">
          Historique insuffisant pour l'analyse spectrale d3
        </span>
        <span className="text-[10px] uppercase font-bold text-slate-300 mt-1">
          (Requis: au moins 15 tirages réels isolés)
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Shannon Entropy & Hurst Exponent Panel */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="text-indigo-600 shrink-0" size={16} />
              <h4 className="text-slate-800 font-black text-xs uppercase tracking-widest">
                Trajectoire Entropique & Hurst (Sliding Window)
              </h4>
            </div>
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
              Visualisation continue déterministe de la persistance spectrale (moteur d3)
            </p>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></span>
              <span className="text-slate-600">Entropie Shannon</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
              <span className="text-slate-600">Exposant Hurst</span>
            </div>
          </div>
        </div>

        {/* Timeline Visualization Container */}
        <div ref={timelineContainerRef} className="w-full relative min-h-[240px]"></div>

        {/* Continuous Dynamic Tooltip Info */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center min-h-[36px]">
          {hoveredData ? (
            <div className="flex gap-6 w-full justify-between items-center text-xs">
              <span className="font-bold text-slate-500 uppercase">
                Tirage: <span className="font-black text-slate-800">{hoveredData.date.replace("2026-", "")}</span>
              </span>
              <div className="flex gap-4">
                <span className="font-bold text-slate-500 uppercase">
                  Entropie: <span className="font-black text-indigo-600">{(hoveredData.entropy * 100).toFixed(2)}%</span>
                </span>
                <span className="font-bold text-slate-500 uppercase">
                  Hurst: <span className="font-black text-amber-600">{hoveredData.hurst.toFixed(4)}</span>
                </span>
              </div>
            </div>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-full">
              Survolez le graphique pour explorer les déviations temporelles
            </span>
          )}
        </div>
      </div>

      {/* KDE Frequency Density vs Theoretical Gaussian Panel */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Percent className="text-cyan-600 shrink-0" size={16} />
              <h4 className="text-slate-800 font-black text-xs uppercase tracking-widest">
                Densité Spectrale vs Loi Normale Théorique
              </h4>
            </div>
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
              Superposition continue (KDE) des fréquences réelles face à une gaussienne
            </p>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-cyan-500 rounded-full"></span>
              <span className="text-slate-600">KDE Réel</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-400 rounded-full"></span>
              <span className="text-slate-600">Théorique Normale</span>
            </div>
          </div>
        </div>

        {/* Density Visualization Container */}
        <div ref={densityContainerRef} className="w-full relative min-h-[240px]"></div>

        {/* Continuous Dynamic Tooltip Info for KDE */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center min-h-[36px]">
          {hoveredKde ? (
            <div className="flex gap-6 w-full justify-between items-center text-xs">
              <span className="font-bold text-slate-500 uppercase">
                Numéro: <span className="font-black text-slate-800">{hoveredKde.number}</span>
              </span>
              <div className="flex gap-4">
                <span className="font-bold text-slate-500 uppercase">
                  Densité Réelle: <span className="font-black text-cyan-600">{hoveredKde.realDensity.toFixed(5)}</span>
                </span>
                <span className="font-bold text-slate-500 uppercase">
                  Densité Théorique: <span className="font-black text-slate-500">{hoveredKde.theoreticalDensity.toFixed(5)}</span>
                </span>
              </div>
            </div>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-full">
              Survolez les fréquences pour analyser la dispersion gaussienne
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
