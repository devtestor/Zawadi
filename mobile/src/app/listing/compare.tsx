import React from "react";
import { View, Text, ScrollView, Pressable, StatusBar, ActivityIndicator, Image } from "react-native";
import { router } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Trash2 } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, formatPrice } from "@/lib/types";
import { useCompareStore } from "@/lib/state/compare";

export default function CompareScreen() {
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["listing", id],
      queryFn: () => api.get<Listing>(`/api/listings/${id}`),
    })),
  });

  const items = results.map((r) => r.data).filter(Boolean) as Listing[];
  const loading = results.some((r) => r.isLoading);

  const rows: { label: string; pick: (l: Listing) => React.ReactNode }[] = [
    { label: "Price", pick: (l) => <Text style={cell}>{formatPrice(l.price, l.currency)}</Text> },
    { label: "Category", pick: (l) => <Text style={cell}>{l.category}</Text> },
    { label: "Country", pick: (l) => <Text style={cell}>{l.country}</Text> },
    { label: "City", pick: (l) => <Text style={cell}>{l.city ?? "—"}</Text> },
    { label: "Bedrooms", pick: (l) => <Text style={cell}>{l.bedrooms ?? "—"}</Text> },
    { label: "Bathrooms", pick: (l) => <Text style={cell}>{l.bathrooms ?? "—"}</Text> },
    { label: "Area", pick: (l) => <Text style={cell}>{l.area ? `${l.area} m²` : "—"}</Text> },
    { label: "Year", pick: (l) => <Text style={cell}>{l.carYear ?? l.machineryYear ?? "—"}</Text> },
    { label: "Mileage", pick: (l) => <Text style={cell}>{l.carMileage ? `${l.carMileage.toLocaleString()} km` : "—"}</Text> },
    { label: "Views", pick: (l) => <Text style={cell}>{(l.viewCount ?? 0).toLocaleString()}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="compare-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="compare-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Compare ({items.length})</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>Nothing to compare yet</Text>
          <Text style={{ color: "#888", fontSize: 13, marginTop: 6, textAlign: "center" }}>
            Add up to 3 listings from any browse screen.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* Sticky-ish label column */}
            <View style={{ width: 110 }}>
              <View style={{ height: 168 }} />
              {rows.map((r) => (
                <View key={r.label} style={{ height: 44, justifyContent: "center", paddingLeft: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>{r.label}</Text>
                </View>
              ))}
            </View>

            {items.map((l) => (
              <View
                key={l.id}
                style={{ width: 200, backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", overflow: "hidden" }}
              >
                <View style={{ height: 120, backgroundColor: "#1A1A24" }}>
                  {l.images?.[0]?.url ? (
                    <Image source={{ uri: l.images[0].url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : null}
                </View>
                <View style={{ padding: 10 }}>
                  <Pressable onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: l.id } })}>
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }} numberOfLines={2}>
                      {l.title}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`compare-remove-${l.id}`}
                    onPress={() => remove(l.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}
                  >
                    <Trash2 size={11} color="#FF6B6B" />
                    <Text style={{ color: "#FF6B6B", fontSize: 11, fontWeight: "700" }}>Remove</Text>
                  </Pressable>
                </View>
                {rows.map((r) => (
                  <View
                    key={r.label}
                    style={{ height: 44, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#1E1E2A", justifyContent: "center" }}
                  >
                    {r.pick(l)}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const cell = { color: "#FFFFFF", fontSize: 13, fontWeight: "700" as const };
