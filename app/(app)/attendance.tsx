import React from "react";
import { View, Text, StyleSheet } from "react-native";
import GlobalBottomNav from "../../components/navigation/GlobalBottomNav";

export default function AttendanceScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Attendance</Text>
      <Text style={styles.message}>Your attendance summary will appear here.</Text>
      <GlobalBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingBottom: 118,
    backgroundColor: "#F5F7FA",
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    color: "#1A1A1A",
  },
  message: {
    fontSize: 16,
    color: "#6C6C70",
    textAlign: "center",
  },
});
