import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Search, MessageCircle, ChevronRight, Map as MapIcon, GitCompare } from "lucide-react-native";
import { useCompareStore } from "@/lib/state/compare";
import { api } from "@/lib/api/api";
import { Listing, Category, CATEGORY_LABELS } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import ListingCard from "@/components/ListingCard";
import { ListingSkeletonList } from "@/components/ListingSkeleton";
import { SafeAreaView } from "react-native-safe-area-context";

const CATEGORIES: { key: Category; icon: string; label: string }[] = [
  { key: "all", icon: "🌍", label: "All" },
  { key: "property", icon: "🏠", label: "Property" },
  { key: "land", icon: "🗺️", label: "Land" },
  { key: "car", icon: "🚗", label: "Cars" },
  { key: "mining", icon: "⛏️", label: "Mining" },
  { key: "machinery", icon: "🚜", label: "Machinery" },
];

interface PageResult {
  items: Listing[];
  nextCursor: string | null;
}

export default function HomeScreen() {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const compareCount = useCompareStore((s) => s.ids.length);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useInfiniteQuery<PageResult>({
    queryKey: ["listings", activeCategory],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (pageParam) params.set("cursor", String(pageParam));
      params.set("limit", "20");
      return api.get<PageResult>(`/api/listings?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const { data: featured = [] } = useQuery({
    queryKey: ["listings", "featured"],
    queryFn: () => api.get<Listing[]>("/api/listings/featured"),
  });

  const listings = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const handleToggleFavorite = async (id: string) => {
    await api.post(`/api/favorites/${id}`, {});
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["listing", id] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="home-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
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
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                testID="map-button"
                onPress={() => router.push("/(app)/map" as any)}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <MapIcon size={20} color="#D4A843" strokeWidth={2} />
              </Pressable>
              <Pressable
                testID="messages-button"
                onPress={() => router.push("/(app)/messages" as any)}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <MessageCircle size={20} color="#D4A843" strokeWidth={2} />
              </Pressable>
            </View>
          </View>

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

      {compareCount > 0 ? (
        <Pressable
          testID="compare-fab"
          onPress={() => router.push("/listing/compare" as any)}
          style={{
            position: "absolute", bottom: 100, alignSelf: "center", zIndex: 10,
            flexDirection: "row", alignItems: "center", gap: 8,
            backgroundColor: "#D4A843", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
            shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
          }}
        >
          <GitCompare size={16} color="#0A0A0F" strokeWidth={2.5} />
          <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Compare ({compareCount})</Text>
        </Pressable>
      ) : null}

      <FlashList
        testID="home-listings"
        data={listings}
        keyExtractor={(item) => item.id}
        estimatedItemSize={320}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#D4A843" />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        ListHeaderComponent={
          <View>
            {/* Category filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginBottom: 24 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
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

            {featured.length > 0 && activeCategory === "all" ? (
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
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      favorited={!!listing.isFavorited}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 }}>
              <View>
                <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>
                  {activeCategory === "all" ? "Latest Listings" : CATEGORY_LABELS[activeCategory]}
                </Text>
                <View style={{ width: 40, height: 3, backgroundColor: "#D4A843", borderRadius: 2, marginTop: 4 }} />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <ListingCard listing={item} favorited={!!item.isFavorited} onToggleFavorite={handleToggleFavorite} />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingHorizontal: 16 }}>
              <ListingSkeletonList count={3} />
            </View>
          ) : (
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
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator testID="loading-more" color="#D4A843" style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </View>
  );
}
