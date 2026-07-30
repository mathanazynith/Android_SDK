import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type TextInputRef = React.ComponentRef<typeof TextInput>;
import { formatTimeFromComponents, validateTimeFormat } from '../../../../utils/validators';

interface TimeInputProps {
  label: string;
  value?: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}

export const TimeInput: React.FC<TimeInputProps> = ({ label, value, hint, error, onChange }) => {
  const [hours, setHours] = useState(value ? String(value).split(':')[0] || '' : '');
  const [minutes, setMinutes] = useState(value ? String(value).split(':')[1] || '' : '');
  const [seconds, setSeconds] = useState(value ? String(value).split(':')[2] || '' : '');
  const hoursRef = useRef<TextInputRef>(null);
  const minutesRef = useRef<TextInputRef>(null);
  const secondsRef = useRef<TextInputRef>(null);

  React.useEffect(() => {
    if (!value) {
      setHours('');
      setMinutes('');
      setSeconds('');
      return;
    }
    const [nextHours = '', nextMinutes = '', nextSeconds = ''] = String(value).split(':');
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
  }, [value]);

  const currentValue = useMemo(() => formatTimeFromComponents(hours, minutes, seconds), [hours, minutes, seconds]);
  const validation = useMemo(() => validateTimeFormat(currentValue), [currentValue]);
  const resolvedError = error || (!validation.valid && currentValue && currentValue !== '00:00:00' ? validation.error : undefined);

  const updateTime = (nextHours: string, nextMinutes: string, nextSeconds: string) => {
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    onChange(formatTimeFromComponents(nextHours, nextMinutes, nextSeconds));
  };

  const handlePartChange = (part: 'hours' | 'minutes' | 'seconds', raw: string, nextRef?: React.RefObject<TextInputRef | null>) => {
    const sanitized = raw.replace(/\D/g, '').slice(0, 2);
    if (part === 'hours') {
      setHours(sanitized);
      if (sanitized.length === 2 && nextRef?.current) {
        nextRef.current.focus();
      }
      updateTime(sanitized, minutes, seconds);
      return;
    }
    if (part === 'minutes') {
      setMinutes(sanitized);
      if (sanitized.length === 2 && nextRef?.current) {
        nextRef.current.focus();
      }
      updateTime(hours, sanitized, seconds);
      return;
    }
    setSeconds(sanitized);
    updateTime(hours, minutes, sanitized);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        <View style={styles.fieldWrap}>
          <TextInput ref={hoursRef} style={[styles.input, resolvedError ? styles.inputError : null]} value={hours} onChangeText={(text) => handlePartChange('hours', text, minutesRef)} placeholder="HH" placeholderTextColor="#8E8E93" keyboardType="numeric" maxLength={2} returnKeyType="next" />
          <Text style={styles.fieldLabel}>HH</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.fieldWrap}>
          <TextInput ref={minutesRef} style={[styles.input, resolvedError ? styles.inputError : null]} value={minutes} onChangeText={(text) => handlePartChange('minutes', text, secondsRef)} placeholder="MM" placeholderTextColor="#8E8E93" keyboardType="numeric" maxLength={2} returnKeyType="next" />
          <Text style={styles.fieldLabel}>MM</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.fieldWrap}>
          <TextInput ref={secondsRef} style={[styles.input, resolvedError ? styles.inputError : null]} value={seconds} onChangeText={(text) => handlePartChange('seconds', text)} placeholder="SS" placeholderTextColor="#8E8E93" keyboardType="numeric" maxLength={2} returnKeyType="done" />
          <Text style={styles.fieldLabel}>SS</Text>
        </View>
      </View>
      {resolvedError ? <Text style={styles.errorText}>{resolvedError}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 8, marginBottom: 8 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: '#8E8E93', fontSize: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldWrap: { flex: 1, alignItems: 'center' },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 12,
    textAlign: 'center',
    minWidth: 58,
  },
  inputError: { borderColor: '#FF5A5F' },
  fieldLabel: { marginTop: 6, color: '#8E8E93', fontSize: 11, fontWeight: '600' },
  separator: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginHorizontal: 2 },
  errorText: { color: '#FF5A5F', fontSize: 12, marginTop: 8 },
});
