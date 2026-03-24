import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Search, Bell, ChevronRight } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, Category, CATEGORY_LABELS } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import ListingCard from "@/components/ListingCard";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const CATEGORIES: { key: Category; icon: string; label: string }[] = [
  { key: "all", icon: "🌍", label: "All" },
  { key: "property", icon: "🏠", label: "Property" },
  { key: "land", icon: "🗺️", label: "Land" },
  { key: "car", icon: "🚗", label: "Cars" },
  { key: "mining", icon: "⛏️", label: "Mining" },
];

const STAT_CARDS = [
  { label: "Countries", value: "54", icon: "🌍", color: "#D4A843" },
  { label: "Properties", value: "1.2K+", icon: "🏠", color: "#1A6B4A" },
  { label: "Mining Sites", value: "340+", icon: "⛏️", color: "#C17B50" },
];

export default function HomeScreen() {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: listings = [], isLoading, refetch } = useQuery({
    queryKey: ["listings", activeCategory],
    queryFn: () => {
      const params = activeCategory !== "all" ? `?category=${activeCategory}` : "";
      return api.get<Listing[]>(`/api/listings${params}`);
    },
  });

  const { data: featured = [] } = useQuery({
    queryKey: ["listings", "featured"],
    queryFn: () => api.get<Listing[]>("/api/listings/featured"),
  });

  const handleToggleFavorite = async (id: string) => {
    await api.post(`/api/favorites/${id}`, {});
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="home-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <View>
              <Text style={{ color: "#666680", fontSize: 13, fontWeight: "600" }}>
                Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"} 👋
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 2 }}>
                {session?.user?.name?.split(" ")[0] || "Explorer"}
              </Text>
            </View>
            <Pressable testID="notifications-button" style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A",
              alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={20} color="#D4A843" strokeWidth={2} />
            </Pressable>
          </View>

          {/* Search bar tap target */}
          <Pressable
            testID="search-bar"
            onPress={() => router.push("/(app)/search" as any)}
            style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: "#16161E", borderRadius: 16,
              borderWidth: 1, borderColor: "#2A2A3A",
              paddingHorizontal: 16, paddingVertical: 14,
            }}
          >
            <Search size={18} color="#666680" strokeWidth={2} />
            <Text style={{ color: "#3A3A4A", fontSize: 15, marginLeft: 10, fontWeight: "500" }}>
              Search properties, cars, land...
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#D4A843" />}
      >
        {/* Stats banner */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, marginBottom: 24 }}
        >
          {STAT_CARDS.map((stat) => (
            <View key={stat.label} style={{
              backgroundColor: "#12121A", borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: "#1E1E2A", minWidth: 110,
              alignItems: "center",
            }}>
              <Text style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</Text>
              <Text style={{ color: stat.color, fontSize: 20, fontWeight: "900" }}>{stat.value}</Text>
              <Text style={{ color: "#666680", fontSize: 12, fontWeight: "600", marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10, marginBottom: 24 }}
        >
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                testID={`category-${cat.key}`}
                onPress={() => setActiveCategory(cat.key)}
                style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderRadius: 24,
                  backgroundColor: active ? "#D4A843" : "#16161E",
                  borderWidth: 1,
                  borderColor: active ? "#D4A843" : "#2A2A3A",
                }}
              >
                <Text style={{ fontSize: 14, marginRight: 6 }}>{cat.icon}</Text>
                <Text style={{
                  color: active ? "#0A0A0F" : "#888",
                  fontSize: 14, fontWeight: active ? "800" : "600",
                }}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Featured section */}
        {featured.length > 0 && activeCategory === "all" && (
          <View style={{ marginBottom: 32 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 }}>
              <View>
                <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>Featured</Text>
                <View style={{ width: 40, height: 3, backgroundColor: "#D4A843", borderRadius: 2, marginTop: 4 }} />
              </View>
              <Pressable onPress={() => router.push("/(app)/search")} style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "600" }}>See all</Text>
                <ChevronRight size={16} color="#D4A843" strokeWidth={2.5} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
            >
              {featured.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onToggleFavorite={handleToggleFavorite} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* All Listings */}
        <View style={{ paddingHorizontal: 20, marginBottom: 120 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>
                {activeCategory === "all" ? "Latest Listings" : CATEGORY_LABELS[activeCategory]}
              </Text>
              <View style={{ width: 40, height: 3, backgroundColor: "#D4A843", borderRadius: 2, marginTop: 4 }} />
            </View>
            {listings.length > 0 && (
              <Text style={{ color: "#666680", fontSize: 13 }}>{listings.length} listings</Text>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator testID="loading-indicator" color="#D4A843" size="large" style={{ marginTop: 40 }} />
          ) : listings.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60, paddingBottom: 40 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🌍</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>No listings yet</Text>
              <Text style={{ color: "#666680", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                Be the first to post a{"\n"}listing in this category
              </Text>
              <Pressable
                testID="post-listing-button"
                onPress={() => router.push("/(app)/post")}
                style={{
                  marginTop: 24, backgroundColor: "#D4A843",
                  paddingHorizontal: 24, paddingVertical: 14,
                  borderRadius: 14,
                }}
              >
                <Text style={{ color: "#0A0A0F", fontWeight: "800", fontSize: 15 }}>Post a Listing</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onToggleFavorite={handleToggleFavorite} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
