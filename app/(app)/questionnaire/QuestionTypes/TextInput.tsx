import React from "react";
import { TextInput as RNTextInput, StyleSheet } from "react-native";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  return (
    <RNTextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder || "Enter your answer..."}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
    />
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: "#f8f8f8",
  },
});

export default TextInput;