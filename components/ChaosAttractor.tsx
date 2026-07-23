import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DrawResult } from '../types';
import { Wind, AlertTriangle, ShieldCheck, Gauge, Compass, Activity, Box, Eye, RefreshCw, Sparkles } from 'lucide-react';
import { useNexusStore } from '../store/useNexusStore';

interface ChaosAttractorProps {
  history: DrawResult[];
}

/**
 * Deterministic Pseudo-Random Generator (LCG) to adhere strictly to AGENTS.md
 */
function createDeterministicLCG(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export const ChaosAttractor: React.FC<ChaosAttractorProps> = ({ history }) => {
  const regime = useNexusStore((state) => state.regime);
  const volatility = useNexusStore((state) => state.volatility);
  const currentDrawName = useNexusStore((state) => state.currentDrawName) || "Loto 5/90";

  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [fps, setFps] = useState<number>(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const turbulence = volatility?.score || 50;
  const weylDiscrepancy = regime?.weylDiscrepancy ?? 0.18;
  const chaosDimension = regime?.chaosDimension ?? 1.84;


  const status = useMemo(() => {
    if (turbulence > 75)
      return {
        label: 'TEMPÊTE (Hasard pur)',
        color: 'text-rose-500',
        border: 'border-rose-500/25',
        bg: 'bg-rose-500/10',
        desc: 'Le régime est fortement instable. Prédictions sous haute variance.',
        icon: <AlertTriangle className="text-rose-500" size={20} />,
      };
    if (turbulence > 40)
      return {
        label: 'BRÈCHE (Phase variable)',
        color: 'text-indigo-400',
        border: 'border-indigo-500/25',
        bg: 'bg-indigo-500/10',
        desc: 'Le système alterne entre régularité markovienne et résurgence chaotique.',
        icon: <Wind className="text-indigo-400" size={20} />,
      };
    return {
      label: 'CALME (Attracteur stable)',
      color: 'text-emerald-500',
      border: 'border-emerald-500/25',
      bg: 'bg-emerald-500/10',
      desc: 'Les orbites de phase sont bien définies. Alignement optimal pour l\'IA.',
      icon: <ShieldCheck className="text-emerald-500" size={20} />,
    };
  }, [turbulence]);

  // 1. Calculate 3D Phase Space Coordinates: X = Sum(t-2), Y = Sum(t-1), Z = Sum(t)
  const trajectory3DPoints = useMemo(() => {
    if (!history || history.length < 5) return [];

    const lastDraws = history.slice(0, 30).reverse();
    const sums = lastDraws.map((d) => d.gagnants.reduce((a, b) => a + b, 0));

    let minSum = Infinity;
    let maxSum = -Infinity;
    for (const s of sums) {
      if (s < minSum) minSum = s;
      if (s > maxSum) maxSum = s;
    }
    if (maxSum === minSum) {
      minSum = 15;
      maxSum = 440;
    }

    const points: { x: number; y: number; z: number; val: number; index: number }[] = [];
    for (let i = 2; i < sums.length; i++) {
      const valX = sums[i - 2];
      const valY = sums[i - 1];
      const valZ = sums[i];

      // Map to normalized [-3.5, 3.5] space
      const normX = ((valX - minSum) / (maxSum - minSum || 1)) * 7 - 3.5;
      const normY = ((valY - minSum) / (maxSum - minSum || 1)) * 7 - 3.5;
      const normZ = ((valZ - minSum) / (maxSum - minSum || 1)) * 7 - 3.5;

      points.push({
        x: normX,
        y: normY,
        z: normZ,
        val: valZ,
        index: i - 2,
      });
    }
    return points;
  }, [history]);

  // 2. Generate Strange Attractor Orbits (Lorenz/Clifford manifold initialized deterministically)
  const strangeAttractorData = useMemo(() => {
    const seed = (currentDrawName.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) * 1000) + trajectory3DPoints.length;
    const lcg = createDeterministicLCG(seed);

    const totalParticles = 400; // 400 instanced spheres in 1 single draw call
    const particlePositions: { x: number; y: number; z: number; scale: number; hue: number }[] = [];

    // Base parameters derived from actual chaos dimension & turbulence
    const sigma = 10.0 + (turbulence / 100) * 4.0;
    const rho = 28.0;
    const beta = 8 / 3;

    let dt = 0.008;
    let currX = 0.1 + lcg() * 0.2;
    let currY = 0.0 + lcg() * 0.2;
    let currZ = 0.0 + lcg() * 0.2;

    for (let i = 0; i < totalParticles; i++) {
      // Lorenz differential step
      const dx = sigma * (currY - currX) * dt;
      const dy = (currX * (rho - currZ) - currY) * dt;
      const dz = (currX * currY - beta * currZ) * dt;

      currX += dx;
      currY += dy;
      currZ += dz;

      // Map Lorenz coordinates to scale
      const scaledX = (currX / 20) * 3.5;
      const scaledY = (currY / 20) * 3.5;
      const scaledZ = ((currZ - 25) / 20) * 3.5;

      // Mix with actual historical points if available
      const histMatch = trajectory3DPoints[i % Math.max(1, trajectory3DPoints.length)];
      const mixWeight = 0.35;
      const finalX = histMatch ? scaledX * (1 - mixWeight) + histMatch.x * mixWeight : scaledX;
      const finalY = histMatch ? scaledY * (1 - mixWeight) + histMatch.y * mixWeight : scaledY;
      const finalZ = histMatch ? scaledZ * (1 - mixWeight) + histMatch.z * mixWeight : scaledZ;

      const hue = 0.55 + (i / totalParticles) * 0.35; // Indigo to Emerald
      const scale = 0.08 + Math.sin(i * 0.1) * 0.03;

      particlePositions.push({ x: finalX, y: finalY, z: finalZ, scale, hue });
    }

    return particlePositions;
  }, [trajectory3DPoints, turbulence, currentDrawName]);

  // 3. Three.js Instanced Mesh WebGL Engine setup
  useEffect(() => {
    if (viewMode !== '3d' || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const width = container.clientWidth || 300;
    const height = 240;

    // Renderer setup (Optimized for Mobile 60 FPS)
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap DPR for high mobile FPS
      renderer.setSize(width, height);
    } catch (e) {
      console.warn("WebGL initialization error in ChaosAttractor:", e);
      return;
    }

    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2, 11);
    camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x818cf8, 1.5);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x34d399, 1.2);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Instanced Mesh Creation (SINGLE DRAW CALL)
    const particleCount = strangeAttractorData.length;
    const sphereGeometry = new THREE.SphereGeometry(1, 10, 10); // Low polygon density for performance
    const sphereMaterial = new THREE.MeshPhongMaterial({
      shininess: 60,
      specular: 0x818cf8,
      transparent: true,
      opacity: 0.85,
    });

    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, particleCount);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    strangeAttractorData.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(idx, dummy.matrix);

      color.setHSL(p.hue, 0.85, 0.55);
      instancedMesh.setColorAt(idx, color);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    scene.add(instancedMesh);

    // Draw Trajectory Line between historical 3D points
    if (trajectory3DPoints.length >= 2) {
      const linePositions: number[] = [];
      trajectory3DPoints.forEach((pt) => {
        linePositions.push(pt.x, pt.y, pt.z);
      });

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x818cf8,
        transparent: true,
        opacity: 0.45,
        linewidth: 1,
      });

      const trajectoryLine = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(trajectoryLine);
    }

    // Interactive Touch / Mouse Orbit Controls
    let isDragging = false;
    let previousTouchX = 0;
    let previousTouchY = 0;
    let rotationX = 0.2;
    let rotationY = 0.0;

    const handleStart = (clientX: number, clientY: number) => {
      isDragging = true;
      previousTouchX = clientX;
      previousTouchY = clientY;
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const deltaX = clientX - previousTouchX;
      const deltaY = clientY - previousTouchY;

      rotationY += deltaX * 0.008;
      rotationX += deltaY * 0.008;

      previousTouchX = clientX;
      previousTouchY = clientY;
    };

    const handleEnd = () => {
      isDragging = false;
    };

    const onMouseDown = (e: MouseEvent) => handleStart(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleEnd();

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handleEnd();

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    // Animation Loop with FPS Monitoring
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Auto rotation when not dragging
      if (!isDragging) {
        rotationY += 0.005;
      }

      scene.rotation.x = rotationX;
      scene.rotation.y = rotationY;

      if (renderer) {
        renderer.render(scene, camera);
      }

      // Calculate FPS over 30 frames
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
    };

    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth || 300;
      camera.aspect = newWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);

      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);

      sphereGeometry.dispose();
      sphereMaterial.dispose();
      if (renderer) {
        renderer.dispose();
      }
    };
  }, [viewMode, strangeAttractorData, trajectory3DPoints]);

  // 2D SVG Trajectory Math
  const trajectory2DPoints = useMemo(() => {
    if (!history || history.length < 6) return [];
    const lastDraws = history.slice(0, 20).reverse();
    const sums = lastDraws.map((d) => d.gagnants.reduce((a, b) => a + b, 0));

    let minSum = Infinity;
    let maxSum = -Infinity;
    for (const s of sums) {
      if (s < minSum) minSum = s;
      if (s > maxSum) maxSum = s;
    }
    if (maxSum === minSum) {
      minSum = 15;
      maxSum = 440;
    }

    const pts: { x: number; y: number; valX: number; valY: number }[] = [];
    for (let i = 1; i < sums.length; i++) {
      const valX = sums[i - 1];
      const valY = sums[i];
      const x = 25 + ((valX - minSum) / (maxSum - minSum || 1)) * 150;
      const y = 175 - ((valY - minSum) / (maxSum - minSum || 1)) * 150;
      pts.push({ x, y, valX, valY });
    }
    return pts;
  }, [history]);

  const pathD = useMemo(() => {
    if (trajectory2DPoints.length < 2) return '';
    return trajectory2DPoints.reduce((acc, p, i) => {
      return acc + `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');
  }, [trajectory2DPoints]);

  return (
    <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Gauge size={18} className="text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white uppercase tracking-widest">
                Attracteur de Phase Chaotique
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                InstancedMesh 3D
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Rendu stochastique à 1 seul draw call (60 FPS Mobile)
            </p>
          </div>
        </div>

        {/* View Mode Switcher & Status Badge */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                viewMode === '3d'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box size={12} />
              <span>3D Orbit</span>
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                viewMode === '2d'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={12} />
              <span>2D Projection</span>
            </button>
          </div>

          <div
            className={`px-2.5 py-1 rounded-xl text-[9px] font-bold ${status.bg} ${status.color} border ${status.border} flex items-center gap-1.5`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
            </span>
            {status.label}
          </div>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div
        ref={containerRef}
        className="relative flex justify-center items-center bg-slate-950 rounded-2xl border border-slate-900/80 p-2 shadow-inner overflow-hidden min-h-[250px]"
      >
        {viewMode === '3d' ? (
          <>
            <canvas ref={canvasRef} className="cursor-grab active:cursor-grabbing rounded-xl touch-none" />

            {/* Performance Overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[9px] font-mono font-bold text-slate-300 shadow-sm">
              <Activity size={12} className={fps >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
              <span>
                {fps} FPS <span className="text-slate-500">| 400 particules</span>
              </span>
            </div>

            {/* Interactive hint */}
            <div className="absolute bottom-3 right-3 text-[9px] font-bold text-slate-500 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/60 pointer-events-none">
              Glissez pour tourner l'attracteur
            </div>
          </>
        ) : (
          <div className="relative flex justify-center w-full py-2">
            <div className="absolute top-2 left-2 text-[8px] font-bold text-slate-500 font-mono">
              Y : Somme(t)
            </div>
            <div className="absolute bottom-2 right-2 text-[8px] font-bold text-slate-500 font-mono">
              X : Somme(t-1)
            </div>

            {trajectory2DPoints.length >= 2 ? (
              <svg width="200" height="200" className="opacity-90">
                {/* Phase Space Grid lines */}
                <line
                  x1="25"
                  y1="25"
                  x2="25"
                  y2="175"
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <line
                  x1="25"
                  y1="175"
                  x2="175"
                  y2="175"
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />

                {/* Trajectory Path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#attractor-gradient)"
                  strokeWidth="1.5"
                  className="stroke-pulse"
                />

                <defs>
                  <linearGradient id="attractor-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {/* Trajectory nodes */}
                {trajectory2DPoints.map((p, idx) => {
                  const isLast = idx === trajectory2DPoints.length - 1;
                  return (
                    <g key={idx}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLast ? 4 : 2}
                        fill={isLast ? '#22c55e' : '#4f46e5'}
                        opacity={isLast ? 1 : 0.4 + (idx / trajectory2DPoints.length) * 0.4}
                      />
                      {isLast && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="8"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="1"
                          className="animate-ping"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            ) : (
              <div className="h-48 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Données insuffisantes...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced Chaos Invariant Indicators */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="bg-slate-900/50 border border-slate-900 p-3 rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Compass size={16} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Discrépance Weyl (W)
            </div>
            <div className="text-xs font-black font-mono text-slate-200 mt-1">
              {weylDiscrepancy.toFixed(4)}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-900 p-3 rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-xl text-violet-400">
            <Activity size={16} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Dimension GP (ν)
            </div>
            <div className="text-xs font-black font-mono text-slate-200 mt-1">
              {chaosDimension.toFixed(3)}
            </div>
          </div>
        </div>
      </div>

      {/* Turbulence Meter Slider */}
      <div className="space-y-2 pt-2 border-t border-slate-900">
        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
          <span>Stabilité du Flux Chaotique</span>
          <span className="font-mono text-slate-200">{turbulence.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-1000"
            style={{
              width: `${Math.min(100, Math.max(0, turbulence))}%`,
              backgroundColor: `hsl(${120 - Math.min(100, turbulence) * 1.2}, 80%, 50%)`,
            }}
          ></div>
        </div>
        <p className="text-[10px] text-slate-500 font-medium">{status.desc}</p>
      </div>
    </div>
  );
};
