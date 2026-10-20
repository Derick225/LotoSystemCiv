
import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { authService } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { checkSubscriptionStatus, subscribeToSubscriptionUpdates } from '../services/subscriptionService';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import {  hydrateUserData } from '../services/userPreferencesService';
import type { SubscriptionState } from '../types';

export const useAuth = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        let isMounted = true;
        let unsubscribeSub: (() => void) | null = null;

        const checkAuth = async () => {
            setLoading(true);
            try {
                const currentSession = await authService.getSession();
                if (!isMounted) return;
                setSession(currentSession);

                if (currentSession?.user) {
                    const userId = currentSession.user.id;
                    hydrateUserData(userId).catch(err => {
                        console.warn("[AlmostInstantSync] Non-blocking hydration issue:", err);
                    });
                    const adminStatus = authService.isAdminUser(currentSession?.user);
                    setIsAdmin(adminStatus);

                    if (adminStatus) {
                        setSubscription({ status: 'active', daysLeft: 999, expiresAt: '', plan: 'premium' });
                    } else {
                        const subState = await checkSubscriptionStatus(userId);
                        setSubscription(subState);

                        unsubscribeSub = subscribeToSubscriptionUpdates(userId, (newSub) => {
                            setSubscription(newSub);
                            if (newSub.status === 'active') {
                                showToast("Accès débloqué en temps réel !", "success");
                                audioEngine.play('success');
                            }
                        });
                    }
                }
            } catch (e) {
                console.error("Auth Hook Error", e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        checkAuth();

        const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            if (!isMounted) return;
            setSession(newSession);
            if (newSession?.user) {
                hydrateUserData(newSession.user.id).catch(err => {
                    console.warn("[AlmostInstantSync] Non-blocking hydration issue:", err);
                });
                const adminStatus = authService.isAdminUser(newSession.user);
                setIsAdmin(adminStatus);

                if (adminStatus) {
                    setSubscription({ status: 'active', daysLeft: 999, expiresAt: '', plan: 'premium' });
                } else {
                    const subState = await checkSubscriptionStatus(newSession.user.id);
                    setSubscription(subState);
                }
            } else {
                setSubscription(null);
                setIsAdmin(false);
            }
        });

        return () => {
            isMounted = false;
            authListener.unsubscribe();
            if (unsubscribeSub) unsubscribeSub();
        };
    }, [hydrateUserData, showToast]);

    const refreshSubscription = async () => {
        if (session?.user) {
            const subState = await checkSubscriptionStatus(session.user.id);
            setSubscription(subState);
        }
    };

    return { session, isAdmin, loading, subscription, refreshSubscription };
};

/**
 * Hook allégé : ne suit QUE la session Supabase (getSession + onAuthStateChange), sans
 * checkSubscriptionStatus, hydrateUserData ni toast. À utiliser par les consommateurs qui n'ont
 * besoin que de `session` (ex. useRealtimeSync) afin d'éviter de dupliquer tout le travail
 * d'authentification lourd déjà effectué par le `useAuth` complet monté dans App.
 */
export const useSession = (): { session: Session | null } => {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        let isMounted = true;
        supabase.auth.getSession()
            .then(({ data }) => { if (isMounted) setSession(data.session); })
            .catch((e) => console.warn("[useSession] getSession error:", e));

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            if (isMounted) setSession(newSession);
        });

        return () => { isMounted = false; subscription.unsubscribe(); };
    }, []);

    return { session };
};
