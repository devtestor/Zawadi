import React, { useMemo, useState } from "react";
import { View, Text, StatusBar, Pressable, ActivityIndicator } from "react-native";
import MapView, { Marker, Region } from "@/lib/maps";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, formatPrice } from "@/lib/types";

interface Page {
  items: Listing[];
  nextCursor: string | null;
}

const INITIAL: Region = {
  latitude: -1.286,
  longitude: 36.817, // Nairobi as a sensible default
  latitudeDelta: 25,
  longitudeDelta: 25,
};

export default function MapScreen() {
  const [selected, setSelected] = useState<Listing | null>(null);

  // Pull a generous page; this is for browsing not pagination on the map.
  const { data, isLoading } = useQuery({
    queryKey: ["listings-map"],
    queryFn: () => api.get<Page>("/api/listings?limit=50"),
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((l) => typeof l.latitude === "number" && typeof l.longitude === "number"),
    [data],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="map-screen">
      <StatusBar barStyle="light-content" />
      <MapView style={{ flex: 1 }} initialRegion={INITIAL}>
        {items.map((l) => (
          <Marker
            key={l.id}
            coordinate={{ latitude: l.latitude!, longitude: l.longitude! }}
            pinColor={
              l.category === "land" ? "#1A6B4A" :
              l.category === "car" ? "#E8890C" :
              l.category === "mining" ? "#C17B50" :
              l.category === "machinery" ? "#4A90A4" : "#D4A843"
            }
            onPress={() => setSelected(l)}
          />
        ))}
      </MapView>

      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="map-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(10,10,15,0.85)", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <View style={{ backgroundColor: "rgba(10,10,15,0.85)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: "#2A2A3A" }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{items.length} on map</Text>
          </View>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={{ position: "absolute", top: 100, alignSelf: "center" }}>
          <ActivityIndicator color="#D4A843" />
        </View>
      ) : null}

      {selected ? (
        <Pressable
          testID="map-pin-card"
          onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: selected.id } })}
          style={{
            position: "absolute", bottom: 32, left: 16, right: 16,
            backgroundColor: "#12121A", borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: "#1E1E2A", flexDirection: "row", alignItems: "center", gap: 12,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "#1E1E2A", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 22 }}>
              {selected.category === "property" ? "🏠" : selected.category === "land" ? "🗺️" : selected.category === "car" ? "🚗" : selected.category === "machinery" ? "🚜" : "⛏️"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{selected.title}</Text>
            <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "800", marginTop: 2 }}>
              {formatPrice(selected.price, selected.currency)}
            </Text>
            <Text style={{ color: "#666680", fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {[selected.city, selected.country].filter(Boolean).join(", ")}
            </Text>
          </View>
          <Pressable onPress={() => setSelected(null)} style={{ padding: 6 }}>
            <Text style={{ color: "#666680" }}>✕</Text>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}
