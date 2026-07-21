// components/SettingsMenu.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

const { height } = Dimensions.get('window');

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
}

const options = [
  { label: 'Edit Profile', icon: '👤' },
  { label: 'Change Password', icon: '🔒' },
  { label: 'Notifications', icon: '🔔' },
  { label: 'Logout', icon: '🚪' },
];

export default function SettingsMenu({ visible, onClose, onSelect }: SettingsMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              {options.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.option,
                    index === options.length - 1 && styles.lastOption,
                  ]}
                  onPress={() => onSelect(item.label)}
                >
                  <Text style={styles.optionIcon}>{item.icon}</Text>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: height * 0.6,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lastOption: { borderBottomWidth: 0 },
  optionIcon: { fontSize: 22, marginRight: Spacing.md },
  optionLabel: { ...Typography.body, color: Colors.text },
  cancelButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelText: { ...Typography.body, color: Colors.error, fontWeight: '600' },
});