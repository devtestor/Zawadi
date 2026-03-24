import React from "react";
import { View, Text, ActivityIndicator, StatusBar, FlatList } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { Listing } from "@/lib/types";
import ListingCard from "@/components/ListingCard";
import { SafeAreaView } from "react-native-safe-area-context";

interface Favorite {
  id: string;
  listing: Listing;
}

export default function SavedScreen() {
  const queryClient = useQueryClient();
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.get<Favorite[]>("/api/favorites"),
  });

  const handleToggleFavorite = async (id: string) => {
    await api.post(`/api/favorites/${id}`, {});
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="saved-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900" }}>Saved</Text>
          <View style={{ width: 40, height: 3, backgroundColor: "#D4A843", borderRadius: 2, marginTop: 6 }} />
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ActivityIndicator testID="saved-loading" color="#D4A843" size="large" style={{ marginTop: 60 }} />
      ) : favorites.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 64, marginBottom: 24 }}>❤️</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 12 }}>
            No saved listings
          </Text>
          <Text style={{ color: "#666680", fontSize: 15, textAlign: "center", lineHeight: 24 }}>
            Tap the heart icon on any listing to save it for later
          </Text>
        </View>
      ) : (
        <FlatList
          testID="favorites-list"
          data={favorites}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListingCard
              listing={item.listing}
              favorited
              onToggleFavorite={handleToggleFavorite}
            />
          )}
        />
      )}
    </View>
  );
}
