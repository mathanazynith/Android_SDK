import { Feather } from '@expo/vector-icons';
import { useSyncExternalStore } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
  type AlertStatic,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

type AlertRequest = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

const listeners = new Set<() => void>();
const emptyAlerts: AlertRequest[] = [];
let currentAlerts: AlertRequest[] = [];

const enqueueAlert = (request: AlertRequest) => {
  currentAlerts = [...currentAlerts, request];
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => currentAlerts;
const getServerSnapshot = () => emptyAlerts;

const removeAlert = (request: AlertRequest) => {
  currentAlerts = currentAlerts.filter((alert) => alert !== request);
  listeners.forEach((listener) => listener());
};

export const Alert: Pick<AlertStatic, 'alert'> = {
  alert(title, message, buttons, options) {
    enqueueAlert({ title, message, buttons, options });
  },
};

export function ThemedAlertHost() {
  const { colors } = useTheme();
  const alerts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const currentAlert = alerts[0] ?? null;

  const dismiss = (request: AlertRequest, button?: AlertButton) => {
    try {
      button?.onPress?.();
    } finally {
      try {
        request.options?.onDismiss?.();
      } finally {
        removeAlert(request);
      }
    }
  };

  return (
    <Modal
      transparent
      visible={currentAlert !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!currentAlert) return;
        if (!currentAlert.options?.cancelable) return;
        const cancelButton = currentAlert.buttons?.find((button) => button.style === 'cancel');
        dismiss(currentAlert, cancelButton);
      }}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.dialog, { backgroundColor: colors.modalBackground, borderColor: colors.border }]}
        >
          {currentAlert && (
            <>
              <View style={styles.heading}>
                <View style={[styles.iconBadge, { backgroundColor: colors.selected }]}>
                  <Feather name="info" size={17} color={colors.primary} />
                </View>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
                  {currentAlert.title}
                </Text>
              </View>
              {!!currentAlert.message && (
                <Text style={[styles.message, { color: colors.textSecondary }]}>
                  {currentAlert.message}
                </Text>
              )}
              <View style={styles.actions}>
                {(currentAlert.buttons?.length ? currentAlert.buttons : [{ text: 'OK' }]).map((button, index) => {
                  const isDestructive = button.style === 'destructive';
                  const isCancel = button.style === 'cancel';
                  return (
                    <Pressable
                      key={`${button.text ?? 'OK'}-${index}`}
                      accessibilityRole="button"
                      onPress={() => dismiss(currentAlert, button)}
                      style={({ pressed }) => [
                        styles.action,
                        isCancel
                          ? { backgroundColor: colors.surfaceRaised, borderColor: colors.border }
                          : isDestructive
                            ? styles.destructiveAction
                            : { backgroundColor: colors.primary, borderColor: colors.primary },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[
                        styles.actionText,
                        { color: isCancel ? colors.text : isDestructive ? '#FFFFFF' : colors.primaryText },
                      ]}>
                        {button.text ?? 'OK'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  },
  action: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveAction: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
