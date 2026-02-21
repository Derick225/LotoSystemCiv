
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { DrawResult } from '../types';

interface ChaosAttractorProps {
    history: DrawResult[];
}

const AttractorPoints: React.FC<{ history: DrawResult[] }> = ({ history }) => {
    const pointsRef = useRef<THREE.Points>(null);

    const { positions, colors } = useMemo(() => {
        const pos: number[] = [];
        const cols: number[] = [];
        const color = new THREE.Color();

        // Chaos Embedding: (x=n, y=n+1, z=n+2)
        // On prend les 3 premiers numéros de chaque tirage comme coordonnées 3D
        history.slice(0, 200).forEach((draw, i) => {
            const nums = draw.gagnants.slice(0, 3);
            if (nums.length === 3) {
                // Normalisation 1-90 -> -10 à +10
                const x = (nums[0] / 90) * 20 - 10;
                const y = (nums[1] / 90) * 20 - 10;
                const z = (nums[2] / 90) * 20 - 10;
                pos.push(x, y, z);

                // Couleur basée sur la récence (plus récent = plus chaud/brillant)
                const heat = 1 - (i / 200);
                color.setHSL(0.6 + (heat * 0.4), 1.0, 0.5); // Bleu -> Rouge
                cols.push(color.r, color.g, color.b);
            }
        });

        return {
            positions: new Float32Array(pos),
            colors: new Float32Array(cols)
        };
    }, [history]);

    useFrame((state) => {
        if (pointsRef.current) {
            pointsRef.current.rotation.y += 0.002; // Rotation lente
            pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
        }
    });

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
    }, [positions, colors]);

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial
                size={0.4}
                vertexColors
                transparent
                opacity={0.8}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};

const ConnectingLines: React.FC<{ history: DrawResult[] }> = ({ history }) => {
    const lineRef = useRef<THREE.Line>(null);

    const points = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        history.slice(0, 50).forEach((draw) => { // Seulement les 50 derniers pour la lisibilité
            const nums = draw.gagnants.slice(0, 3);
            if (nums.length === 3) {
                const x = (nums[0] / 90) * 20 - 10;
                const y = (nums[1] / 90) * 20 - 10;
                const z = (nums[2] / 90) * 20 - 10;
                pts.push(new THREE.Vector3(x, y, z));
            }
        });
        return pts;
    }, [history]);

    useFrame(() => {
        if (lineRef.current) {
            lineRef.current.rotation.y += 0.002;
        }
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    return (
        <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#6366f1", opacity: 0.3, transparent: true, linewidth: 1 }))} ref={lineRef} />
    );
};

export const ChaosAttractor3D: React.FC<ChaosAttractorProps> = ({ history }) => {
    return (
        <div className="w-full h-[400px] md:h-[500px] rounded-[2rem] overflow-hidden bg-slate-950 border border-white/10 shadow-2xl relative">
            <div className="absolute top-4 left-6 z-10 pointer-events-none">
                <h3 className="text-white font-black text-xl uppercase tracking-tighter">Attracteur de Lorenz</h3>
                <p className="text-indigo-400 text-xs font-mono">Projection Phase-Space (n, n+1, n+2)</p>
            </div>
            
            <Canvas camera={{ position: [0, 0, 25], fov: 45 }}>
                <color attach="background" args={['#020617']} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#fbbf24" />
                
                <AttractorPoints history={history} />
                <ConnectingLines history={history} />
                
                <OrbitControls autoRotate autoRotateSpeed={0.5} enableZoom={false} />
                
                {/* Axes Helper customisé */}
                <group position={[-12, -12, -12]}>
                    <Text position={[1, 0, 0]} fontSize={0.5} color="red">X</Text>
                    <Text position={[0, 1, 0]} fontSize={0.5} color="green">Y</Text>
                    <Text position={[0, 0, 1]} fontSize={0.5} color="blue">Z</Text>
                </group>
            </Canvas>
            
            <div className="absolute bottom-4 right-6 z-10 pointer-events-none text-right">
                <div className="flex items-center gap-2 justify-end text-white/50 text-[10px] uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> Récent
                    <span className="w-2 h-2 rounded-full bg-blue-500 ml-2"></span> Ancien
                </div>
            </div>
        </div>
    );
};
