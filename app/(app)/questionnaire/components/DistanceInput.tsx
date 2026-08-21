import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';
import { validateDistance } from '../../../../utils/validators';

interface DistanceInputProps {
  label: string;
  value?: string;
  unitLabel?: string;
  hint?: string;
  error?: string;
  maxValue?: number;
  onChange: (value: string) => void;
}

export const DistanceInput: React.FC<DistanceInputProps> = ({ label, value, unitLabel, hint, error, maxValue, onChange }) => {
  const [localValue, setLocalValue] = useState(value || '');

  React.useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const validation = useMemo(() => validateDistance(localValue || ''), [localValue]);
  const exceedsMaximum = Number.isFinite(maxValue) && Number(localValue) > Number(maxValue);
  const resolvedError = error || (exceedsMaximum ? `Maximum allowed distance is ${maxValue} ${unitLabel || ""}.` : !validation.valid && localValue ? validation.error : undefined);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, resolvedError ? styles.inputError : null]}
          value={localValue}
          onChangeText={(text) => {
            const nextValue = text.replace(/[^0-9.]/g, '');
            const decimalCount = (nextValue.match(/\./g) || []).length;
            const sanitizedValue = decimalCount > 1 ? nextValue.replace(/\.(?=.*\.)/g, '') : nextValue;
            setLocalValue(sanitizedValue);
            if (!(Number.isFinite(maxValue) && Number(sanitizedValue) > Number(maxValue))) {
              onChange(sanitizedValue);
            }
          }}
          placeholder=""
          placeholderTextColor="#8E8E93"
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {unitLabel ? <View style={styles.unitPill}><Text style={styles.unitText}>{unitLabel}</Text></View> : null}
      </View>
      {resolvedError ? <Text style={styles.errorText}>{resolvedError}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 8, marginBottom: 8 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: '#8E8E93', fontSize: 12, marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: '#303236', borderRadius: 14, borderWidth: 1, borderColor: '#45474B' },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 0,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputError: { borderColor: '#FF5A5F' },
  unitPill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  unitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#FF5A5F', fontSize: 12, marginTop: 8 },
});
