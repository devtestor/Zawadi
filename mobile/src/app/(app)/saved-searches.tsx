import React from "react";
import { View, Text, Pressable, ActivityIndicator, StatusBar, FlatList, Alert } from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Trash2, BellPlus, Search } from "lucide-react-native";
import { api } from "@/lib/api/api";

interface SavedSearch {
  id: string;
  name: string;
  category: string | null;
  country: string | null;
  search: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  listingType: string | null;
  lastNotifiedAt: string | null;
  createdAt: string;
}

export default function SavedSearchesScreen() {
  const queryClient = useQueryClient();
  const { data: searches = [], isLoading } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => api.get<SavedSearch[]>("/api/saved-searches"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-searches/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
  });

  const handleRun = (s: SavedSearch) => {
    router.push({
      pathname: "/(app)/search" as any,
      params: {
        category: s.category ?? undefined,
        country: s.country ?? undefined,
        search: s.search ?? undefined,
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="saved-searches-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="saved-searches-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Saved searches</Text>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : searches.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#1E1E0A", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: "#D4A84366" }}>
            <BellPlus size={32} color="#D4A843" />
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>No saved searches yet</Text>
          <Text style={{ color: "#888", fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            From the Search tab, set filters and tap "Save search" to get notified about new matches.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="saved-searches-list"
          data={searches}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`saved-search-${item.id}`}
              onPress={() => handleRun(item)}
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#12121A", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#1E1E2A" }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#1E1E0A", borderWidth: 1, borderColor: "#D4A84366", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Search size={18} color="#D4A843" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>{item.name}</Text>
                <Text style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                  {[
                    item.category,
                    item.country,
                    item.search ? `"${item.search}"` : null,
                    item.minPrice ? `>${item.minPrice}` : null,
                    item.maxPrice ? `<${item.maxPrice}` : null,
                  ]
                    .filter(Boolean)
                    .join(" • ") || "Any listing"}
                </Text>
                {item.lastNotifiedAt ? (
                  <Text style={{ color: "#666680", fontSize: 11, marginTop: 4 }}>
                    Last alert {new Date(item.lastNotifiedAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
              <Pressable
                testID={`delete-saved-search-${item.id}`}
                onPress={() => {
                  Alert.alert("Delete saved search?", "We'll stop sending you alerts for this filter.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => del.mutate(item.id) },
                  ]);
                }}
                style={{ padding: 8 }}
              >
                <Trash2 size={16} color="#FF6B6B" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
