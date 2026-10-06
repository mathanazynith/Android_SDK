import api, { API_BASE_URL } from '../../service/api';
import { storage } from '../../service/storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type SubscriptionPricing = {
  id: number;
  plan: number;
  amount: string | number;
  currency: string;
  billing_interval: number;
  billing_interval_unit: 'month' | 'year' | string;
  is_active: boolean;
  razorpay_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionFeature = {
  id: number;
  plan: number;
  text: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SubscriptionPlan = {
  id: number;
  name: string;
  slug: string;
  description: string;
  trial_days: number;
  billing_interval: number;
  billing_interval_unit: string;
  duration_months: number;
  cancellation_allowed: boolean;
  is_recurring: boolean;
  status: string;
  pricing: SubscriptionPricing[];
  features: SubscriptionFeature[];
  created_at: string;
  updated_at: string;
};

export type UserSubscription = {
  id: number;
  plan: number;
  pricing: number | null;
  status: string;
  payment_status: string;
  amount: string | number;
  currency: string;
  billing_interval: number;
  billing_interval_unit: string;
  trial_days: number;
  is_recurring: boolean;
  auto_renew: boolean;
  plan_name_snapshot: string;
  plan_slug_snapshot: string;
  started_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  cancelled_at: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  razorpay_signature: string | null;
  payment_method: string | null;
  paid_at: string | null;
  trial_reminder_sent_at: string | null;
  billing_reminder_sent_at: string | null;
  payment_failed_at: string | null;
  invoice_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionCheckout =
  | { mode: 'payment'; order: { id: string; amount: number; currency: string } }
  | { mode: 'subscription'; subscription: { id: string } };

export type CreateSubscriptionResponse = {
  subscription: UserSubscription;
  checkout: SubscriptionCheckout;
  razorpay_key_id: string;
};

export const subscriptionAPI = {
  getPlans: () => api.get<SubscriptionPlan[]>('/subscriptions/plans/'),
  getCurrent: () => api.get<{ subscription: UserSubscription | null }>('/subscriptions/current/'),
  create: (planId: number, pricingId: number, autopay: boolean) =>
    api.post<CreateSubscriptionResponse>('/subscriptions/create/', {
      plan_id: planId,
      pricing_id: pricingId,
      autopay,
    }),
  verify: (payload:
    | { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
    | { razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post<{ subscription: UserSubscription }>('/subscriptions/verify/', payload),
  cancel: (id: number) => api.post<{ subscription: UserSubscription }>(`/subscriptions/${id}/cancel/`),
  downloadInvoice: async () => {
    const token = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
    const directory = FileSystem.cacheDirectory;
    if (!directory) throw new Error('File storage is unavailable on this device.');
    const result = await FileSystem.downloadAsync(
      `${API_BASE_URL}/subscriptions/invoice-demo/`,
      `${directory}zyrun-invoice-${Date.now()}.pdf`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      throw new Error('Could not download the invoice.');
    }
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Subscription invoice' });
  },
};
