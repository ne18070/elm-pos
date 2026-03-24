import { create } from 'zustand';
import type { Subscription, Plan, PaymentSettings, EffectiveStatus } from '@services/supabase/subscriptions';
import { getEffectiveStatus, getTrialDaysRemaining } from '@services/supabase/subscriptions';

interface SubscriptionState {
  subscription:    Subscription | null;
  plans:           Plan[];
  paymentSettings: PaymentSettings | null;
  loaded:          boolean; // true une fois la tentative de chargement terminée

  setSubscription:    (sub: Subscription | null) => void;
  setPlans:           (plans: Plan[]) => void;
  setPaymentSettings: (s: PaymentSettings | null) => void;
  setLoaded:          (v: boolean) => void;

  effectiveStatus:    () => EffectiveStatus;
  trialDaysRemaining: () => number;
}

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  subscription:    null,
  plans:           [],
  paymentSettings: null,
  loaded:          false,

  setSubscription:    (subscription)    => set({ subscription }),
  setPlans:           (plans)           => set({ plans }),
  setPaymentSettings: (paymentSettings) => set({ paymentSettings }),
  setLoaded:          (loaded)          => set({ loaded }),

  effectiveStatus:    () => getEffectiveStatus(get().subscription),
  trialDaysRemaining: () => getTrialDaysRemaining(get().subscription),
}));
