import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../../../contexts/ThemeContext';

interface RunTypeOption {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
}

interface RunTypeSelectorProps {
  label: string;
  options: RunTypeOption[];
  selectedValue?: string;
  error?: string;
  hint?: string;
  onSelect: (value: string) => void;
}

export const RunTypeSelector: React.FC<RunTypeSelectorProps> = ({ label, options, selectedValue, error, hint, onSelect }) => {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const selectedOption = useMemo(() => options.find((option) => option.value === selectedValue || option.id === selectedValue), [options, selectedValue]);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity style={[styles.trigger, { backgroundColor: colors.inputBackground, borderColor: colors.border }, error ? styles.triggerError : null]} onPress={() => setVisible(true)} activeOpacity={0.9}>
        <Text style={[styles.triggerText, { color: selectedOption ? colors.text : colors.placeholder }]}>{selectedOption?.label || 'Select an option'}</Text>
        <Feather name="chevron-down" size={18} color={colors.iconSecondary} />
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.modalBackground, borderColor: colors.border }]} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Feather name="x" size={20} color={colors.icon} />
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {options.map((option) => {
                const isSelected = selectedOption?.value === option.value || selectedOption?.id === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.option, { backgroundColor: colors.inputBackground, borderColor: colors.border }, isSelected ? { borderColor: colors.primary, backgroundColor: colors.selected } : null, option.disabled ? styles.optionDisabled : null]}
                    disabled={option.disabled}
                    onPress={() => {
                      onSelect(option.value);
                      setVisible(false);
                    }}
                  >
                    <Text style={[styles.optionText, { color: colors.text }, isSelected ? { color: colors.primary } : null, option.disabled ? { color: colors.textTertiary } : null]}>{option.label}</Text>
                    {isSelected ? <Feather name="check" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default RunTypeSelector;

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: '#8E8E93', fontSize: 12, marginBottom: 10 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#303236',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#45474B',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  triggerError: { borderColor: '#FF5A5F' },
  triggerText: { color: '#E8E8EA', fontSize: 18, fontWeight: '400', flex: 1 },
  errorText: { color: '#FF5A5F', fontSize: 12, marginTop: 6 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: '#202124', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingVertical: 18, paddingBottom: 28, borderWidth: 1, borderColor: '#3D4044' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  optionList: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#303236',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#3D4044',
  },
  optionSelected: { borderColor: '#34C759', backgroundColor: '#293C29' },
  optionDisabled: { opacity: 0.32 },
  optionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  optionTextDisabled: { color: '#8E8E93' },
  optionTextSelected: { color: '#34C759' },
});
