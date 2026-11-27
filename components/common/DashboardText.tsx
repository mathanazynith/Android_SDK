import { Text, type TextProps } from 'react-native';

const MAX_DASHBOARD_FONT_SCALE = 1.5;

export default function DashboardText({
  maxFontSizeMultiplier,
  ...props
}: TextProps) {
  return (
    <Text
      {...props}
      maxFontSizeMultiplier={Math.min(
        maxFontSizeMultiplier ?? MAX_DASHBOARD_FONT_SCALE,
        MAX_DASHBOARD_FONT_SCALE,
      )}
    />
  );
}
