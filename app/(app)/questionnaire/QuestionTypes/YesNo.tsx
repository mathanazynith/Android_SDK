import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { BRAND_GREEN, useTheme } from "../../../../contexts/ThemeContext";

interface YesNoProps {
  value?: boolean;
  onChange: (value: boolean) => void;
}

type YesNoOption = {
  id?: string | number;
  label?: string;
  text?: string;
  value?: string | number;
};

export type YesNoOptionValues = {
  yes: YesNoOption;
  no: YesNoOption;
};

const optionLabel = (option: YesNoOption): string =>
  String(option.label ?? option.text ?? option.value ?? "").trim().toLowerCase();

/**
 * Backend questions may be explicitly typed as `yesno` or supplied as a
 * `single` question with exactly Yes and No options. Both shapes use this
 * shared visual control.
 */
export const getYesNoOptionValues = (
  options?: YesNoOption[]
): YesNoOptionValues | null => {
  if (!options || options.length !== 2) return null;

  const yes = options.find((option) => optionLabel(option) === "yes");
  const no = options.find((option) => optionLabel(option) === "no");

  return yes && no ? { yes, no } : null;
};

export const getYesNoValue = (
  value: unknown,
  optionValues?: YesNoOptionValues | null
): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (!optionValues) return undefined;

  const valueAsString = String(value ?? "");
  const matchesOption = (option: YesNoOption) =>
    [option.id, option.value, option.label, option.text]
      .filter((candidate) => candidate !== undefined && candidate !== null)
      .some((candidate) => String(candidate) === valueAsString);

  if (matchesOption(optionValues.yes)) return true;
  if (matchesOption(optionValues.no)) return false;
  return undefined;
};

const YesNo: React.FC<YesNoProps> = ({ value, onChange }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, value === true && { backgroundColor: colors.surface, borderColor: BRAND_GREEN }]}
        onPress={() => onChange(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: colors.text }, value === true && { color: BRAND_GREEN }] }>
          Yes
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, value === false && { backgroundColor: colors.surface, borderColor: BRAND_GREEN }]}
        onPress={() => onChange(false)}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: colors.text }, value === false && { color: BRAND_GREEN }] }>
          No
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    width: "100%",
    gap: 18,
  },
  button: {
    flex: 1,
    flexBasis: 0,
    height: 68,
    backgroundColor: "#050505",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedYes: {
    backgroundColor: "#132e13",
    borderColor: "#34C759",
  },
  selectedNo: {
    backgroundColor: "#132e13",
    borderColor: "#34C759",
  },
  buttonText: {
    fontSize: 25,
    fontWeight: "600",
    color: "#F4F4F5",
    textAlign: "center",
  },
  selectedText: {
    color: "#34C759",
  },
});

export default YesNo;
