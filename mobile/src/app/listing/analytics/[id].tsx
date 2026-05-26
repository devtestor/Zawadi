import React from "react";
import { View, Text, ScrollView, Pressable, StatusBar, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Eye, Heart, MessageCircle } from "lucide-react-native";
import { CartesianChart, Bar } from "victory-native";
import { api } from "@/lib/api/api";

interface Analytics {
  totals: { views: number; favorites: number; messages: number };
  daily: {
    views: { date: string; count: number }[];
    favorites: { date: string; count: number }[];
    messages: { date: string; count: number }[];
  };
}

const { width } = Dimensions.get("window");

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", id],
    queryFn: () => api.get<Analytics>(`/api/listings/${id}/analytics`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="analytics-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="analytics-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Analytics</Text>
        </View>
      </SafeAreaView>

      {isLoading || !data ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Views" value={data.totals.views} icon={<Eye size={16} color="#D4A843" />} />
            <Stat label="Saves" value={data.totals.favorites} icon={<Heart size={16} color="#FF6B6B" />} />
            <Stat label="Messages" value={data.totals.messages} icon={<MessageCircle size={16} color="#1A6B4A" />} />
          </View>

          <Chart title="Views (last 30 days)" series={data.daily.views} color="#D4A843" />
          <Chart title="Saves (last 30 days)" series={data.daily.favorites} color="#FF6B6B" />
          <Chart title="Messages (last 30 days)" series={data.daily.messages} color="#1A6B4A" />
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#12121A", borderRadius: 14, borderWidth: 1, borderColor: "#1E1E2A", padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon}
        <Text style={{ color: "#888", fontSize: 12, fontWeight: "700" }}>{label}</Text>
      </View>
      <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900" }}>{value.toLocaleString()}</Text>
    </View>
  );
}

function Chart({ title, series, color }: { title: string; series: { date: string; count: number }[]; color: string }) {
  const data = series.map((p) => ({ x: p.date.slice(5), y: p.count }));
  const total = series.reduce((a, b) => a + b.count, 0);
  return (
    <View style={{ backgroundColor: "#12121A", borderRadius: 14, borderWidth: 1, borderColor: "#1E1E2A", padding: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color, fontWeight: "800" }}>{total}</Text>
      </View>
      <View style={{ height: 160, width: width - 64 }}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={["y"]}
          domainPadding={{ left: 6, right: 6 }}
          axisOptions={{
            tickCount: { x: 5, y: 4 },
            labelColor: "#666680",
          }}
        >
          {({ points, chartBounds }) => (
            <Bar
              chartBounds={chartBounds}
              points={points.y}
              color={color}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
            />
          )}
        </CartesianChart>
      </View>
    </View>
  );
}
