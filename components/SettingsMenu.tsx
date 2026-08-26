// components/SettingsMenu.tsx
import { Feather } from '@expo/vector-icons';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const { height } = Dimensions.get('window');

interface SettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: string) => void;
}

const options = [
  { label: 'Edit Profile', icon: 'user' },
  { label: 'Change Password', icon: 'lock' },
  { label: 'Notifications', icon: 'bell' },
  { label: 'Plan', icon: 'clipboard' },
  { label: 'Use Mock Calendar', icon: 'shuffle' },
  { label: 'Logout', icon: 'log-out' },
];

export default function SettingsMenu({ visible, onClose, onSelect }: SettingsMenuProps) {
  const { colors } = useTheme();
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
            <View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
              <View style={styles.handle} />
              {options.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.option,
                    index === options.length - 1 && styles.lastOption,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => onSelect(item.label)}
                >
                  <Feather
                    name={item.icon as any}
                    size={24}
                    color={colors.textSecondary}
                    style={styles.optionIcon}
                  />
                  <Text style={[styles.optionLabel, { color: colors.text }]}>{item.label}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: height * 0.65,
  },
  handle: {
    width: 48,
    height: 5,
    backgroundColor: '#404040',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 28,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  lastOption: { 
    borderBottomWidth: 0,
  },
  optionIcon: {
    marginRight: 20,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FF3B30',
    letterSpacing: -0.3,
  },
});