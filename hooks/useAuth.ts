
import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { checkSubscriptionStatus, subscribeToSubscriptionUpdates } from '../services/subscriptionService';
import { useNexusStore } from '../store/useNexusStore';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import { getSettings, hydrateUserData } from '../services/userPreferencesService';
import type { SubscriptionState } from '../types';

export const useAuth = () => {
    const [session, setSession] = useState<any>(null);
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
                    await hydrateUserData(currentSession.user.id);
                    const adminStatus = authService.isAdminUser(currentSession.user);
                    setIsAdmin(adminStatus);

                    if (adminStatus) {
                        setSubscription({ status: 'active', daysLeft: 999, expiresAt: '', plan: 'premium' });
                    } else {
                        const subState = await checkSubscriptionStatus(currentSession.user.id);
                        setSubscription(subState);

                        unsubscribeSub = subscribeToSubscriptionUpdates(currentSession.user.id, (newSub) => {
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
                await hydrateUserData(newSession.user.id);
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
