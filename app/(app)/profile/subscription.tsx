import { Alert } from '@/components/ThemedAlert';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage } from '../../../service/api';
import { useAuth } from '../../../service/auth';
import { subscriptionAPI, type SubscriptionPlan, type SubscriptionPricing, type UserSubscription } from '../../../src/services/subscriptionApi';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const intervalLabel = (count: number, unit: string) => `/${count > 1 ? `${count} ` : ''}${unit}${count > 1 ? 's' : ''}`;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const formatPrice = (price: Pick<SubscriptionPricing, 'amount' | 'currency'>) => {
  const amount = Number(price.amount);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(amount); }
  catch { return `${price.currency} ${amount.toFixed(2)}`; }
};

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [current, setCurrent] = useState<UserSubscription | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<Record<number, number>>({});
  const [autopay] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [plansResponse, currentResponse] = await Promise.all([
        subscriptionAPI.getPlans(),
        subscriptionAPI.getCurrent(),
      ]);
      const data = plansResponse.data as SubscriptionPlan[] | { results?: SubscriptionPlan[] };
      const activePlans = (Array.isArray(data) ? data : data?.results ?? [])
        .filter(plan => plan.status === 'active')
        .map(plan => ({ ...plan, pricing: (plan.pricing || []).filter(price => price.is_active), features: (plan.features || []).filter(feature => feature.is_active) }));
      setPlans(activePlans);
      setSelectedPricing(previous => {
        const next = { ...previous };
        for (const plan of activePlans) {
          if (!plan.pricing.some(price => price.id === next[plan.id])) next[plan.id] = plan.pricing[0]?.id ?? 0;
        }
        return next;
      });
      setCurrent(currentResponse.data.subscription);
    } catch (loadError) {
      setError(getBackendErrorMessage(loadError, 'Unable to load subscription details.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const currentIsActive = Boolean(current && ACTIVE_STATUSES.has(current.status));

  const purchase = async (plan: SubscriptionPlan) => {
    const pricingId = selectedPricing[plan.id];
    if (!pricingId) {
      Alert.alert('Unavailable', 'This plan has no active price at the moment.');
      return;
    }
    if (currentIsActive) {
      Alert.alert('Current plan', 'Cancel your current subscription before selecting another plan.');
      return;
    }
    setBusy(true);
    try {
      const created = (await subscriptionAPI.create(plan.id, pricingId, Boolean(autopay[plan.id]))).data;
      const price = plan.pricing.find(item => item.id === pricingId);
      const prefill = {
        name: user?.username || '',
        email: user?.email || '',
        contact: user?.phone_number || '',
      };
      const common = {
        key: created.razorpay_key_id,
        name: 'ZYRun',
        description: `${plan.name} subscription`,
        prefill,
        theme: { color: '#22C55E' },
      };
      const checkoutResult = created.checkout.mode === 'payment'
        ? await RazorpayCheckout.open({
            ...common,
            currency: created.checkout.order.currency || price?.currency,
            amount: String(created.checkout.order.amount),
            order_id: created.checkout.order.id,
          })
        : await RazorpayCheckout.open({
            ...common,
            subscription_id: created.checkout.subscription.id,
          });

      const signature = checkoutResult.razorpay_signature;
      const paymentId = checkoutResult.razorpay_payment_id;
      if (!signature || !paymentId) throw new Error('Checkout did not return the payment verification details.');
      if (created.checkout.mode === 'payment') {
        await subscriptionAPI.verify({
          razorpay_order_id: created.checkout.order.id,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        });
      } else {
        await subscriptionAPI.verify({
          razorpay_subscription_id: created.checkout.subscription.id,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        });
      }
      await loadData(false);
      Alert.alert('Payment verified', 'Your subscription status has been updated.');
    } catch {
      await loadData(false);
      Alert.alert('Process Failed', 'Payment Method Failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelSubscription = () => {
    if (!current) return;
    Alert.alert('Cancel subscription?', 'Your access and renewal will be updated by the subscription service.', [
      { text: 'Keep plan', style: 'cancel' },
      {
        text: 'Cancel plan',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await subscriptionAPI.cancel(current.id);
            await loadData(false);
            Alert.alert('Subscription cancelled', 'The backend has updated your subscription.');
          } catch (cancelError) {
            Alert.alert('Could not cancel', getBackendErrorMessage(cancelError, 'Please try again.'));
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const downloadInvoice = async () => {
    setBusy(true);
    try { await subscriptionAPI.downloadInvoice(); }
    catch (invoiceError) { Alert.alert('Invoice unavailable', getBackendErrorMessage(invoiceError, 'Unable to download the invoice.')); }
    finally { setBusy(false); }
  };

  const surface = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surfaceRaised }]} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Subscription</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Plans and billing for your account</Text>
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.muted, { color: colors.textSecondary }]}>Loading plans…</Text></View> : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadData()} tintColor={colors.primary} />}>
          {error ? (
            <View style={[styles.notice, surface]}>
              <Feather name="alert-circle" size={20} color="#F59E0B" />
              <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
              <TouchableOpacity onPress={() => void loadData()}><Text style={[styles.retry, { color: colors.primary }]}>Retry</Text></TouchableOpacity>
            </View>
          ) : null}

          {current ? (
            <View style={[styles.currentCard, surface]}>
              <View style={styles.currentHeading}>
                <View style={[styles.currentIcon, { backgroundColor: colors.selected }]}><Feather name="award" size={20} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>YOUR SUBSCRIPTION</Text>
              <Text style={[styles.planTitle, { color: colors.text }]}>{current.plan_name_snapshot || plans.find(plan => plan.id === current.plan)?.name || 'Previous plan'}</Text>
                </View>
                <Text style={[styles.status, { color: currentIsActive ? colors.primary : colors.textSecondary }]}>{current.status.replaceAll('_', ' ')}</Text>
              </View>
              <Text style={[styles.currentPrice, { color: colors.text }]}>{formatPrice({ amount: current.amount, currency: current.currency })}<Text style={[styles.period, { color: colors.textSecondary }]}>{intervalLabel(current.billing_interval || 1, current.billing_interval_unit || 'month')}</Text></Text>
              {current.trial_ends_at ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Trial ends {formatDate(current.trial_ends_at)}</Text> : null}
              {current.next_billing_at ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Next billing {formatDate(current.next_billing_at)}</Text> : null}
              {current.current_period_end ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Access through {formatDate(current.current_period_end)}</Text> : null}
              <View style={styles.actionRow}>
                {currentIsActive && current.status !== 'paused' ? <TouchableOpacity disabled={busy} style={[styles.secondaryButton, styles.equalAction, { borderColor: '#EF4444' }]} onPress={cancelSubscription}><Text style={[styles.secondaryText, { color: '#DC2626' }]}>Cancel Plan</Text></TouchableOpacity> : null}
                {current.payment_status === 'paid' || currentIsActive ? <TouchableOpacity disabled={busy} style={[styles.secondaryButton, styles.equalAction, { borderColor: colors.primary }]} onPress={() => void downloadInvoice()}><Feather name="download" size={15} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.text }]}>Invoice PDF</Text></TouchableOpacity> : null}
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{currentIsActive ? 'Available plans' : 'Choose your plan'}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Plans and prices are loaded from ZYRun.</Text>
          </View>
          {plans.length === 0 && !error ? <View style={[styles.emptyCard, surface]}><Feather name="package" size={26} color={colors.textTertiary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No plans available</Text><Text style={[styles.muted, { color: colors.textSecondary }]}>Please check back later.</Text></View> : null}
          {plans.map(plan => {
            const pricing = plan.pricing;
            const selected = pricing.find(item => item.id === selectedPricing[plan.id]);
            const hasMultiplePrices = pricing.length > 1;
            const selectedAutopay = Boolean(autopay[plan.id]);
            return (
              <View key={plan.id} style={[styles.planCard, surface]}>
                <View style={styles.planTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planTitle, { color: colors.text }]}>{plan.name}</Text>
                    {!!plan.description && <Text style={[styles.description, { color: colors.textSecondary }]}>{plan.description}</Text>}
                  </View>
                  {plan.trial_days > 0 ? <Text style={[styles.trialPill, { color: colors.primary, backgroundColor: colors.selected }]}>{plan.trial_days} day trial</Text> : null}
                </View>
                {selected ? <Text style={[styles.price, { color: colors.text }]}>{formatPrice(selected)}<Text style={[styles.period, { color: colors.textSecondary }]}>{intervalLabel(selected.billing_interval, selected.billing_interval_unit)}</Text></Text> : <Text style={[styles.meta, { color: colors.textSecondary }]}>Pricing unavailable</Text>}

                {hasMultiplePrices ? <View style={styles.priceOptions}>{pricing.map(item => {
                  const active = selectedPricing[plan.id] === item.id;
                  return <TouchableOpacity key={item.id} onPress={() => setSelectedPricing(old => ({ ...old, [plan.id]: item.id }))} style={[styles.priceOption, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.selected : colors.surfaceRaised }]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
                    <Text style={[styles.priceOptionText, { color: colors.text }]}>{formatPrice(item)}</Text>
                    <Text style={[styles.priceOptionSub, { color: colors.textSecondary }]}>{intervalLabel(item.billing_interval, item.billing_interval_unit)}</Text>
                  </TouchableOpacity>;
                })}</View> : null}

                {plan.features.length ? <View style={styles.features}>{plan.features.map(feature => <View key={feature.id} style={styles.featureRow}><Feather name="check-circle" size={15} color={colors.primary} /><Text style={[styles.featureText, { color: colors.textSecondary }]}>{feature.text}</Text></View>)}</View> : null}
                {plan.trial_days > 0 ? <Text style={[styles.terms, { color: colors.textTertiary }]}>{selectedAutopay ? `Your ${plan.trial_days}-day trial delays the first recurring debit; checkout may ask you to authorize recurring payments.` : `The one-time option charges the selected price at checkout. Trial days affect the subscription status but do not defer that payment.`}</Text> : null}
                <TouchableOpacity disabled={!selected || busy || currentIsActive} onPress={() => void purchase(plan)} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !selected || busy || currentIsActive ? 0.55 : 1 }]}>
                  {busy ? <ActivityIndicator size="small" color={colors.primaryText} /> : <><Text style={[styles.primaryText, { color: colors.primaryText }]}>{currentIsActive ? 'Cancel current plan to switch' : 'Start Free Trial'}</Text><Feather name="arrow-up-right" size={18} color={colors.primaryText} /></>}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
      {busy ? <View pointerEvents="none" style={styles.busyOverlay}><ActivityIndicator size="large" color={colors.primary} /></View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  content: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { fontSize: 13, lineHeight: 19 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  retry: { fontSize: 14, fontWeight: '700' },
  currentCard: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 8 },
  currentHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  currentIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  status: { textTransform: 'capitalize', fontSize: 12, fontWeight: '700' },
  currentPrice: { fontSize: 24, fontWeight: '800', marginTop: 5 },
  period: { fontSize: 14, fontWeight: '500' },
  meta: { fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  equalAction: { flex: 1 },
  secondaryButton: { minHeight: 39, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryText: { fontSize: 12, fontWeight: '700' },
  sectionHeading: { gap: 3, marginTop: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { fontSize: 12 },
  emptyCard: { minHeight: 150, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  planCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  planTitle: { fontSize: 18, fontWeight: '800' },
  description: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  trialPill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, fontSize: 10, overflow: 'hidden', fontWeight: '800' },
  price: { fontSize: 28, fontWeight: '800' },
  priceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priceOption: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  priceOptionText: { fontSize: 14, fontWeight: '700' },
  priceOptionSub: { fontSize: 11, marginTop: 2 },
  features: { gap: 7 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureText: { flex: 1, fontSize: 12, lineHeight: 17 },
  terms: { fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryText: { fontSize: 13, fontWeight: '800' },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' },
});
