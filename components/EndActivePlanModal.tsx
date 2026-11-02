import { Alert } from '@/components/ThemedAlert';
import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const END_REASONS = [
  'Goal Completed',
  'Injury',
  'Work Stress',
  'Busy Schedule',
  'Medical Reasons',
  'Personal Reasons',
  'Travel',
  'Changed Goal',
  'Lack of Motivation',
  'Other',
];

interface EndActivePlanModalProps {
  visible: boolean;
  planName: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function EndActivePlanModal({ visible, planName, onClose, onConfirm }: EndActivePlanModalProps) {
  const { colors } = useTheme();
  const [selectedReason, setSelectedReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeModal = () => {
    if (isSubmitting) return;
    setSelectedReason('');
    onClose();
  };

  const confirmEndPlan = async () => {
    if (!selectedReason) {
      Alert.alert('Reason required', 'Please select a reason for ending your plan.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedReason);
      setSelectedReason('');
      onClose();
    } catch (error) {
      Alert.alert(
        'Unable to end plan',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeModal}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>End Active Plan</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            End this plan before creating another one.
          </Text>

          <View style={[styles.planSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active Plan</Text>
            <Text style={[styles.summaryName, { color: colors.text }]}>{planName || 'Running plan'}</Text>
            <Text style={[styles.summaryStatus, { color: colors.primary }]}>Status: Active</Text>
          </View>

          <Text style={[styles.reasonHeading, { color: colors.text }]}>Reason for ending the plan *</Text>
          <View style={styles.reasonGrid}>
            {END_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonOption,
                    { borderColor: isSelected ? colors.primary : colors.border },
                    isSelected && { backgroundColor: colors.selected },
                  ]}
                  onPress={() => setSelectedReason(reason)}
                  disabled={isSubmitting}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: isSubmitting }}
                >
                  <Text numberOfLines={2} style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
                  <View style={[styles.radioOuter, { borderColor: isSelected ? colors.primary : colors.textSecondary }]}>
                    {isSelected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={closeModal}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isSubmitting && styles.disabledButton]}
              onPress={() => void confirmEndPlan()}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{isSubmitting ? 'Ending...' : 'End Active Plan'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', borderRadius: 16, borderWidth: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  planSummary: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 18 },
  summaryLabel: { fontSize: 12 },
  summaryName: { fontSize: 17, fontWeight: '600', marginTop: 4 },
  summaryStatus: { fontSize: 13, marginTop: 8 },
  reasonHeading: { fontWeight: '600', marginBottom: 8 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  reasonOption: { width: '48%', minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  reasonText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 15 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  cancelButton: { minHeight: 44, borderRadius: 8, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
  confirmButton: { minHeight: 44, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#D32F2F' },
  disabledButton: { opacity: 0.6 },
  confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});