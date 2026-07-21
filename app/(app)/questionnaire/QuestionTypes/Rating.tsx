import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface RatingProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

const Rating: React.FC<RatingProps> = ({
  value,
  onChange,
  min = 1,
  max = 10,
}) => {
  const stars = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  return (
    <View style={styles.container}>
      <View style={styles.starsContainer}>
        {stars.map((star) => (
          <TouchableOpacity
            key={star}
            style={[styles.star, value >= star && styles.selectedStar]}
            onPress={() => onChange(star)}
          >
            <Text style={[styles.starText, value >= star && styles.selectedStarText]}>
              ★
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {value > 0 && (
        <Text style={styles.ratingText}>
          {value} of {max}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  star: {
    padding: 8,
  },
  selectedStar: {
    transform: [{ scale: 1.1 }],
  },
  starText: {
    fontSize: 36,
    color: "#ddd",
  },
  selectedStarText: {
    color: "#FFD700",
  },
  ratingText: {
    marginTop: 8,
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
});

export default Rating;