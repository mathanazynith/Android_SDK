import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';
import { validateDistance } from '../../../../utils/validators';

interface DistanceInputProps {
  label: string;
  value?: string;
  unitLabel?: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}

export const DistanceInput: React.FC<DistanceInputProps> = ({ label, value, unitLabel, hint, error, onChange }) => {
  const [localValue, setLocalValue] = useState(value || '');

  React.useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const validation = useMemo(() => validateDistance(localValue || ''), [localValue]);
  const resolvedError = error || (!validation.valid && localValue ? validation.error : undefined);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, resolvedError ? styles.inputError : null]}
          value={localValue}
          onChangeText={(text) => {
            const nextValue = text.replace(/[^0-9.]/g, '');
            const decimalCount = (nextValue.match(/\./g) || []).length;
            const sanitizedValue = decimalCount > 1 ? nextValue.replace(/\.(?=.*\.)/g, '') : nextValue;
            setLocalValue(sanitizedValue);
            onChange(sanitizedValue);
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputError: { borderColor: '#FF5A5F' },
  unitPill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  unitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#FF5A5F', fontSize: 12, marginTop: 8 },
});
