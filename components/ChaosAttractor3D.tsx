
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { DrawResult, SpectralMetric } from '../types';

interface ChaosAttractorProps {
    history: DrawResult[];
    spectralData: SpectralMetric[];
}

const NumberPoint = ({ position, color, number, size }: { position: [number, number, number], color: string, number: number, size: number }) => {
    const mesh = useRef<THREE.Mesh>(null);
    
    useFrame((state) => {
        if (mesh.current) {
            mesh.current.rotation.x = state.clock.getElapsedTime() * 0.5;
            mesh.current.rotation.y = state.clock.getElapsedTime() * 0.5;
        }
    });

    return (
        <group position={position}>
            <mesh ref={mesh}>
                <sphereGeometry args={[size, 16, 16]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
            <Text
                position={[0, size + 0.5, 0]}
                fontSize={0.5}
                color="white"
                anchorX="center"
                anchorY="middle"
            >
                {number}
            </Text>
        </group>
    );
};

const Scene = ({ history, spectralData }: ChaosAttractorProps) => {
    const points = useMemo(() => {
        const data: { position: [number, number, number], color: string, number: number, size: number }[] = [];
        
        // Calculate metrics for 3D mapping
        // X: Frequency (Normalized 0-100) -> Mapped to -20 to 20
        // Y: Gap (Normalized 0-100) -> Mapped to -20 to 20
        // Z: Spectral Energy (Normalized 0-100) -> Mapped to -20 to 20

        const freqs = new Map<number, number>();
        const gaps = new Map<number, number>();
        
        history.slice(0, 100).forEach((d, i) => {
            d.gagnants.forEach(n => {
                freqs.set(n, (freqs.get(n) || 0) + 1);
                if (!gaps.has(n)) gaps.set(n, i);
            });
        });

        const maxFreq = Math.max(...freqs.values()) || 1;
        const maxGap = Math.max(...gaps.values()) || 1;

        for (let n = 1; n <= 90; n++) {
            const f = (freqs.get(n) || 0) / maxFreq;
            const g = (gaps.get(n) || 0) / maxGap;
            const s = (spectralData.find(sd => sd.number === n)?.energy || 0) / 100;

            // Map to 3D Space (-20 to 20)
            const x = (f - 0.5) * 40;
            const y = (g - 0.5) * 40;
            const z = (s - 0.5) * 40;

            // Color based on "Heat" (Combination of metrics)
            const heat = (f + s) / 2;
            const color = new THREE.Color().setHSL(0.6 - (heat * 0.6), 1, 0.5).getStyle(); // Blue (cold) to Red (hot)
            
            // Size based on importance
            const size = 0.2 + (heat * 0.8);

            data.push({ position: [x, y, z], color, number: n, size });
        }
        return data;
    }, [history, spectralData]);

    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            
            {points.map((p) => (
                <NumberPoint key={p.number} {...p} />
            ))}

            {/* Axes Helpers */}
            <line>
                <bufferGeometry attach="geometry" onUpdate={geo => geo.setFromPoints([new THREE.Vector3(-20, 0, 0), new THREE.Vector3(20, 0, 0)])} />
                <lineBasicMaterial attach="material" color="red" opacity={0.5} transparent />
            </line>
            <line>
                <bufferGeometry attach="geometry" onUpdate={geo => geo.setFromPoints([new THREE.Vector3(0, -20, 0), new THREE.Vector3(0, 20, 0)])} />
                <lineBasicMaterial attach="material" color="green" opacity={0.5} transparent />
            </line>
            <line>
                <bufferGeometry attach="geometry" onUpdate={geo => geo.setFromPoints([new THREE.Vector3(0, 0, -20), new THREE.Vector3(0, 0, 20)])} />
                <lineBasicMaterial attach="material" color="blue" opacity={0.5} transparent />
            </line>

            <OrbitControls autoRotate autoRotateSpeed={0.5} />
        </>
    );
};

export const ChaosAttractor3D: React.FC<ChaosAttractorProps> = (props) => {
    return (
        <div className="w-full h-[400px] rounded-2xl overflow-hidden border border-white/10 bg-black/80 relative">
            <div className="absolute top-4 left-4 z-10 text-xs font-mono text-white/50 pointer-events-none">
                <div>X: Fréquence</div>
                <div>Y: Écart (Gap)</div>
                <div>Z: Énergie Spectrale</div>
            </div>
            <Canvas camera={{ position: [30, 30, 30], fov: 45 }}>
                <Scene {...props} />
            </Canvas>
        </div>
    );
};
