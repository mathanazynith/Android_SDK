// FrontEnd/components/Avatar.tsx
import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { Colors } from '../constants/theme';

interface AvatarProps {
  name?: string;
  imageUrl?: string;
  size?: number;
  style?: ViewStyle | ImageStyle;
}

export const Avatar: React.FC<AvatarProps> = ({ name = '', imageUrl, size = 40, style }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const backgroundColor = Colors.primary + '30';

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        // cast style to ImageStyle to satisfy Image prop typing
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }, style as ImageStyle]}
      />
    );
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor }, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials || '?'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: Colors.primary, fontWeight: '600' },
});