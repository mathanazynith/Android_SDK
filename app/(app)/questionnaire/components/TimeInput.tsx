import React, { useMemo, useRef, useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

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
  // Internal (raw, unpadded) component state to avoid collisions with parent formatting
  const [hours, setHours] = useState<string>(() => (value ? String(value).split(':')[0] || '' : ''));
  const [minutes, setMinutes] = useState<string>(() => (value ? String(value).split(':')[1] || '' : ''));
  const [seconds, setSeconds] = useState<string>(() => (value ? String(value).split(':')[2] || '' : ''));
  const hoursRef = useRef<TextInputRef>(null);
  const minutesRef = useRef<TextInputRef>(null);
  const secondsRef = useRef<TextInputRef>(null);

  // Refs to avoid feedback loop when parent echoes back the formatted value
  const lastEmittedValue = useRef<string | null>(null);
  const lastPropValue = useRef<string | null>(null);

  // Sync from parent only when parent value is different from last emitted
  useEffect(() => {
    const incoming = value || '';
    if (!incoming) {
      if (hours || minutes || seconds) {
        setHours('');
        setMinutes('');
        setSeconds('');
      }
      lastPropValue.current = incoming;
      return;
    }

    // If parent is echoing a value we just emitted, ignore to avoid cursor jumps
    if (lastEmittedValue.current && lastEmittedValue.current === incoming) {
      lastPropValue.current = incoming;
      return;
    }

    // If incoming differs from current formatted value, parse and update
    const [nextHours = '', nextMinutes = '', nextSeconds = ''] = String(incoming).split(':');
    // only update if different to avoid re-renders
    if (nextHours !== hours) setHours(nextHours.replace(/^0(?=\d)/, (m) => m));
    if (nextMinutes !== minutes) setMinutes(nextMinutes.replace(/^0(?=\d)/, (m) => m));
    if (nextSeconds !== seconds) setSeconds(nextSeconds.replace(/^0(?=\d)/, (m) => m));

    lastPropValue.current = incoming;
  }, [value]);

  const currentValue = useMemo(() => formatTimeFromComponents(hours, minutes, seconds), [hours, minutes, seconds]);
  const validation = useMemo(() => validateTimeFormat(currentValue), [currentValue]);
  const resolvedError = error || (!validation.valid && currentValue && currentValue !== '00:00:00' ? validation.error : undefined);

  const updateTime = (nextHours: string, nextMinutes: string, nextSeconds: string, emit = true) => {
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    const formatted = formatTimeFromComponents(nextHours, nextMinutes, nextSeconds);
    if (emit) {
      lastEmittedValue.current = formatted;
      onChange(formatted);
    }
    return formatted;
  };

  const clampComponent = (val: string, type: 'hours' | 'minutes' | 'seconds') => {
    const num = parseInt(val || '0', 10);
    if (isNaN(num)) return '';
    if (type === 'hours') {
      return String(Math.min(Math.max(num, 0), 99)).padStart(2, '0');
    }
    return String(Math.min(Math.max(num, 0), 59)).padStart(2, '0');
  };

  const handlePartChange = (part: 'hours' | 'minutes' | 'seconds', raw: string, nextRef?: React.RefObject<TextInputRef | null>) => {
    const sanitized = raw.replace(/\D/g, '').slice(0, 2);

    if (part === 'hours') {
      const nextH = sanitized;
      setHours(nextH);
      // auto advance
      if (nextH.length === 2 && nextRef?.current) {
        nextRef.current.focus();
        // ensure cursor at end
        try { nextRef.current.setNativeProps?.({ selection: { start: nextRef.current.props?.value?.length ?? 0, end: nextRef.current.props?.value?.length ?? 0 } }); } catch {}
      }
      updateTime(nextH, minutes, seconds);
      return;
    }

    if (part === 'minutes') {
      const nextM = sanitized;
      setMinutes(nextM);
      if (nextM.length === 2 && nextRef?.current) {
        nextRef.current.focus();
        try { nextRef.current.setNativeProps?.({ selection: { start: nextRef.current.props?.value?.length ?? 0, end: nextRef.current.props?.value?.length ?? 0 } }); } catch {}
      }
      updateTime(hours, nextM, seconds);
      return;
    }

    const nextS = sanitized;
    setSeconds(nextS);
    updateTime(hours, minutes, nextS);
  };

  // Handle backspace navigation
  const handleKeyPress = (part: 'hours' | 'minutes' | 'seconds') => (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
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
    } catch (err) {
      // ignore
    }
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
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        <View style={styles.fieldWrap}>
          <TextInput
            ref={hoursRef}
            style={[styles.input, resolvedError ? styles.inputError : null]}
            value={hours}
            onChangeText={(text) => handlePartChange('hours', text, minutesRef)}
            onKeyPress={handleKeyPress('hours')}
            onBlur={handleBlur('hours')}
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
            style={[styles.input, resolvedError ? styles.inputError : null]}
            value={minutes}
            onChangeText={(text) => handlePartChange('minutes', text, secondsRef)}
            onKeyPress={handleKeyPress('minutes')}
            onBlur={handleBlur('minutes')}
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
            style={[styles.input, resolvedError ? styles.inputError : null]}
            value={seconds}
            onChangeText={(text) => handlePartChange('seconds', text)}
            onKeyPress={handleKeyPress('seconds')}
            onBlur={handleBlur('seconds')}
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
