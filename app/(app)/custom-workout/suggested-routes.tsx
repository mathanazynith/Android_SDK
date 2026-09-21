import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ActivityRouteMap from "../../../components/ActivityRouteMap";
import { getBackendErrorMessage } from "../../../service/api";
import { customWorkoutAPI, type SuggestedRoute } from "../../../service/customWorkout";

const getRoutes = (
  value: SuggestedRoute[] | {
    results?: SuggestedRoute[];
    data?: SuggestedRoute[];
    routes?: SuggestedRoute[];
    suggested_routes?: SuggestedRoute[];
    suggestions?: SuggestedRoute[];
  },
) =>
  Array.isArray(value)
    ? value
    : value.suggestions || value.routes || value.suggested_routes || value.results || value.data || [];

const formatDistance = (meters: number) => `${(Number(meters || 0) / 1000).toFixed(2)} km`;

export default function SuggestedRoutesScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const [routes, setRoutes] = useState<SuggestedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const loadRoutes = useCallback(async () => {
    if (!workoutId) return;
    setLoading(true);
    try {
      const response = await customWorkoutAPI.suggestedRoutes(Number(workoutId));
      setRoutes(getRoutes(response.data));
    } catch (error) {
      Alert.alert("Could not load routes", getBackendErrorMessage(error, "Please try again."));
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useEffect(() => {
    // Loading is intentionally triggered when this route screen gains focus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRoutes();
  }, [loadRoutes]);

  const assignRoute = async (route: SuggestedRoute) => {
    if (!workoutId) return;
    setAssigningId(route.id);
    try {
      await customWorkoutAPI.assignRoute(Number(workoutId), route.id);
      Alert.alert("Route applied", "This route is now assigned to your workout.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("Could not apply route", getBackendErrorMessage(error, "Please try again."));
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Close suggested routes">
          <Feather name="x" size={32} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suggested Routes</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Saved routes closest to this workout distance.</Text>
        {loading ? (
          <View style={styles.centerState}><ActivityIndicator size="large" color="#39B800" /></View>
        ) : routes.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="map" size={34} color="#686868" />
            <Text style={styles.emptyTitle}>No suggested routes</Text>
            <Text style={styles.emptyText}>There are no saved routes close to this workout distance.</Text>
          </View>
        ) : routes.map((route, index) => (
          <RouteCard
            key={route.id}
            route={route}
            isBestMatch={index === 0}
            assigning={assigningId === route.id}
            disabled={assigningId !== null}
            onView={() => router.push({ pathname: "/custom-workout/route-detail", params: { route: JSON.stringify(route) } })}
            onUse={() => void assignRoute(route)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function RouteCard({ route, isBestMatch, assigning, disabled, onView, onUse }: { route: SuggestedRoute; isBestMatch: boolean; assigning: boolean; disabled: boolean; onView: () => void; onUse: () => void }) {
  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeading}>
        <Text style={styles.routeDistance}>{formatDistance(route.distance).toUpperCase()}</Text>
        {isBestMatch ? <View style={styles.matchBadge}><Text style={styles.matchBadgeText}>Best Match</Text></View> : null}
      </View>
      <ActivityRouteMap encodedPolyline={route.encoded_polyline} variant="preview" />
      <View style={styles.metricsGrid}>
        <Metric label="Distance" value={formatDistance(route.distance)} />
        <Metric label="Elevation Gain" value ={`+${Number(route.elevation_gain || 0).toFixed(2)} m`} />
        <Metric label="Elevation Loss" value ={`${Number(route.elevation_loss || 0).toFixed(2)} m`} />
        <Metric label="Max Elevation" value ={`${Number(route.max_elevation || 0).toFixed(2)} m`} />
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.viewButton} onPress={onView} disabled={disabled} activeOpacity={0.85}>
          <Feather name="map" size={19} color="#39B800" />
          <Text style={styles.viewButtonText}>View Route</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.useButton} onPress={onUse} disabled={disabled} activeOpacity={0.85}>
          {assigning ? <ActivityIndicator size="small" color="#000000" /> : <Feather name="check-circle" size={19} color="#000000" />}
          <Text style={styles.useButtonText}>Use This Route</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0C0D" },
  header: { minHeight: 100, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 32 },
  closeButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: "#27292B", backgroundColor: "#101112", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  headerSpacer: { width: 56 },
  content: { paddingHorizontal: 32, paddingBottom: 34 },
  subtitle: { color: "#B9BABC", fontSize: 18, marginBottom: 32 },
  centerState: { paddingTop: 80, alignItems: "center" },
  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 16 },
  emptyText: { color: "#A7A8AA", fontSize: 15, textAlign: "center", marginTop: 8 },
  routeCard: { backgroundColor: "#202326", borderRadius: 24, padding: 20, marginBottom: 18 },
  routeHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  routeDistance: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  matchBadge: { borderWidth: 2, borderColor: "#39B800", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 },
  matchBadgeText: { color: "#39B800", fontSize: 15, fontWeight: "700" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 22, marginTop: 20 },
  metric: { width: "50%" },
  metricLabel: { color: "#B9BABC", fontSize: 15, fontWeight: "700", marginBottom: 7 },
  metricValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 18, marginTop: 24 },
  viewButton: { flex: 1, minHeight: 58, borderWidth: 2, borderColor: "#39B800", borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  viewButtonText: { color: "#39B800", fontSize: 17, fontWeight: "800" },
  useButton: { flex: 1, minHeight: 58, borderRadius: 16, backgroundColor: "#39B800", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  useButtonText: { color: "#000000", fontSize: 17, fontWeight: "900" },
});