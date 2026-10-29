import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { formatTimeFromComponents, normalizeTimePartValue, validateTimeFormat } from '../../../../utils/validators';

type TextInputRef = React.ComponentRef<typeof TextInput>;

interface TimeInputProps {
  label?: string;
  value?: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}

export const TimeInput: React.FC<TimeInputProps> = ({ label, value, hint, error, onChange }) => {
  // Internal (raw, unpadded) component state to avoid collisions with parent formatting
  const [hours, setHours] = useState<string>(() => (value ? String(value).split(':')[0] || '' : ''));
  const [minutes, setMinutes] = useState<string>(() => (value ? String(value).split(':')[1] || '' : ''));
  const [seconds, setSeconds] = useState<string>(() => (value ? String(value).split(':')[2] || '' : ''));
  const [focusedField, setFocusedField] = useState<'hours' | 'minutes' | 'seconds' | null>(null);
  const hoursRef = useRef<TextInputRef>(null);
  const minutesRef = useRef<TextInputRef>(null);
  const secondsRef = useRef<TextInputRef>(null);

  const [lastEmittedValue, setLastEmittedValue] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(value);

  // Sync from parent when parent value changes without triggering cascading effects
  if (prevValue !== value) {
    setPrevValue(value);
    const incoming = value || '';
    if (!incoming) {
      setHours('');
      setMinutes('');
      setSeconds('');
    } else if (lastEmittedValue !== incoming) {
      const [nextHours = '', nextMinutes = '', nextSeconds = ''] = String(incoming).split(':');
      if (nextHours !== hours) setHours(nextHours.replace(/^0(?=\d)/, (m) => m));
      if (nextMinutes !== minutes) setMinutes(nextMinutes.replace(/^0(?=\d)/, (m) => m));
      if (nextSeconds !== seconds) setSeconds(nextSeconds.replace(/^0(?=\d)/, (m) => m));
    }
  }

  const currentValue = useMemo(() => formatTimeFromComponents(hours, minutes, seconds), [hours, minutes, seconds]);
  const validation = useMemo(() => validateTimeFormat(currentValue), [currentValue]);
  const resolvedError = error || (!validation.valid && currentValue && currentValue !== '00:00:00' ? validation.error : undefined);

  const updateTime = (nextHours: string, nextMinutes: string, nextSeconds: string, emit = true) => {
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    const formatted = formatTimeFromComponents(nextHours, nextMinutes, nextSeconds);
    if (emit) {
      setLastEmittedValue(formatted);
      onChange(formatted);
    }
    return formatted;
  };

  const clampComponent = (val: string, type: 'hours' | 'minutes' | 'seconds') => {
    const trimmed = String(val ?? '').trim();
    if (!trimmed) return '';
    const num = parseInt(trimmed, 10);
    if (isNaN(num)) return '';
    if (type === 'hours') {
      return String(Math.min(Math.max(num, 0), 99)).padStart(2, '0');
    }
    return String(Math.min(Math.max(num, 0), 59)).padStart(2, '0');
  };

  const handlePartChange = (part: 'hours' | 'minutes' | 'seconds', raw: string, nextRef?: React.RefObject<TextInputRef | null>) => {
    const sanitized = normalizeTimePartValue(raw, 2);

    if (part === 'hours') {
      const nextH = sanitized;
      setHours(nextH);
      if (nextH.length === 2 && nextRef?.current) {
        nextRef.current.focus();
      }
      updateTime(nextH, minutes, seconds);
      return;
    }

    if (part === 'minutes') {
      const nextM = sanitized;
      setMinutes(nextM);
      if (nextM.length === 2 && nextRef?.current) {
        nextRef.current.focus();
      }
      updateTime(hours, nextM, seconds);
      return;
    }

    const nextS = sanitized;
    setSeconds(nextS);
    updateTime(hours, minutes, nextS);
  };

  // Handle backspace navigation
  const handleKeyPress = (part: 'hours' | 'minutes' | 'seconds', e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    try {
      if (e.nativeEvent.key === 'Backspace') {
        if (part === 'seconds') {
          if (!seconds || seconds.length === 0) {
            minutesRef.current?.focus();
          }
        } else if (part === 'minutes') {
          if (!minutes || minutes.length === 0) {
            hoursRef.current?.focus();
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handleFocus = (part: 'hours' | 'minutes' | 'seconds') => {
    setFocusedField(part);
  };

  // On blur, ensure components are within valid ranges and padded
  const handleBlur = (part: 'hours' | 'minutes' | 'seconds') => () => {
    if (part === 'hours') {
      const clamped = clampComponent(hours, 'hours');
      setHours(clamped);
      updateTime(clamped, minutes, seconds);
      return;
    }
    if (part === 'minutes') {
      const clamped = clampComponent(minutes, 'minutes');
      setMinutes(clamped);
      updateTime(hours, clamped, seconds);
      return;
    }
    const clamped = clampComponent(seconds, 'seconds');
    setSeconds(clamped);
    updateTime(hours, minutes, clamped);
  };

  return (
    <View style={styles.card}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <View style={styles.fieldWrap}>
          <TextInput
            ref={hoursRef}
            style={[
              styles.input,
              focusedField === 'hours' ? styles.inputFocused : null,
              resolvedError ? styles.inputError : null,
            ]}
            value={hours}
            onChangeText={(text) => handlePartChange('hours', text, minutesRef)}
            onKeyPress={(e) => handleKeyPress('hours', e)}
            onFocus={() => handleFocus('hours')}
            onBlur={() => {
              handleBlur('hours')();
              setFocusedField(null);
            }}
            placeholder="HH"
            placeholderTextColor="#8E8E93"
            keyboardType="numeric"
            maxLength={2}
            returnKeyType="next"
          />
          <Text style={styles.fieldLabel}>HH</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.fieldWrap}>
          <TextInput
            ref={minutesRef}
            style={[
              styles.input,
              focusedField === 'minutes' ? styles.inputFocused : null,
              resolvedError ? styles.inputError : null,
            ]}
            value={minutes}
            onChangeText={(text) => handlePartChange('minutes', text, secondsRef)}
            onKeyPress={(e) => handleKeyPress('minutes', e)}
            onFocus={() => handleFocus('minutes')}
            onBlur={() => {
              handleBlur('minutes')();
              setFocusedField(null);
            }}
            placeholder="MM"
            placeholderTextColor="#8E8E93"
            keyboardType="numeric"
            maxLength={2}
            returnKeyType="next"
          />
          <Text style={styles.fieldLabel}>MM</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.fieldWrap}>
          <TextInput
            ref={secondsRef}
            style={[
              styles.input,
              focusedField === 'seconds' ? styles.inputFocused : null,
              resolvedError ? styles.inputError : null,
            ]}
            value={seconds}
            onChangeText={(text) => handlePartChange('seconds', text)}
            onKeyPress={(e) => handleKeyPress('seconds', e)}
            onFocus={() => handleFocus('seconds')}
            onBlur={() => {
              handleBlur('seconds')();
              setFocusedField(null);
            }}
            placeholder="SS"
            placeholderTextColor="#8E8E93"
            keyboardType="numeric"
            maxLength={2}
            returnKeyType="done"
          />
          <Text style={styles.fieldLabel}>SS</Text>
        </View>
      </View>
      {resolvedError ? <Text style={styles.errorText}>{resolvedError}</Text> : null}
    </View>
  );
};

export default TimeInput;

const styles = StyleSheet.create({
  card: { marginTop: 8, marginBottom: 8 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: '#8E8E93', fontSize: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 24 },
  fieldWrap: { flex: 1, alignItems: 'center' },
  input: {
    backgroundColor: '#303236',
    borderRadius: 24,
    borderWidth: 0,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '500',
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: 'center',
    minWidth: 92,
  },
  inputFocused: {
    borderColor: '#34C759',
    shadowColor: '#34C759',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  inputError: { borderColor: '#FF5A5F' },
  fieldLabel: { marginTop: 8, color: '#6D7074', fontSize: 17, fontWeight: '500' },
  separator: { display: 'none' },
  errorText: { color: '#FF5A5F', fontSize: 12, marginTop: 8 },
});
