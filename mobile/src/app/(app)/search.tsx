import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { Search, X, BellPlus } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, AFRICAN_COUNTRIES, Category, CATEGORY_LABELS } from "@/lib/types";
import ListingCard from "@/components/ListingCard";
import { ListingSkeletonList } from "@/components/ListingSkeleton";
import VoiceSearchButton from "@/components/VoiceSearchButton";
import { SafeAreaView } from "react-native-safe-area-context";

interface PageResult {
  items: Listing[];
  nextCursor: string | null;
}

const CATEGORIES: { key: Category; icon: string }[] = [
  { key: "all", icon: "🌍" },
  { key: "property", icon: "🏠" },
  { key: "land", icon: "🗺️" },
  { key: "car", icon: "🚗" },
  { key: "mining", icon: "⛏️" },
  { key: "machinery", icon: "🚜" },
];

export default function SearchScreen() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ category?: string; country?: string; search?: string }>();
  const [search, setSearch] = useState(params.search ?? "");
  const [category, setCategory] = useState<Category>((params.category as Category) ?? "all");
  const [country, setCountry] = useState(params.country ?? "");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");

  // Re-apply when the user navigates here with new params.
  useEffect(() => {
    if (params.search !== undefined) setSearch(params.search);
    if (params.category !== undefined) setCategory(params.category as Category);
    if (params.country !== undefined) setCountry(params.country);
  }, [params.search, params.category, params.country]);

  const handleToggleFavorite = async (id: string) => {
    await api.post(`/api/favorites/${id}`, {});
    queryClient.invalidateQueries({ queryKey: ["search"] });
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
    queryClient.invalidateQueries({ queryKey: ["listing", id] });
  };

  const hasFilter = !!(category !== "all" || country || search.trim());

  const handleSaveSearch = async () => {
    if (!hasFilter) {
      Alert.alert("Set some filters first", "Pick a category, country, or keyword before saving.");
      return;
    }
    const autoName =
      (search.trim() || (category !== "all" ? category[0].toUpperCase() + category.slice(1) : "All")) +
      (country ? ` in ${country}` : "");
    try {
      await api.post("/api/saved-searches", {
        name: autoName,
        category: category !== "all" ? category : undefined,
        country: country || undefined,
        search: search.trim() || undefined,
      });
      Alert.alert("Saved!", "We'll send you a push when matching listings appear.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save";
      Alert.alert("Error", msg);
    }
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery<PageResult>({
    queryKey: ["search", search, category, country],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (country) params.set("country", country);
      if (search.trim()) params.set("search", search.trim());
      if (pageParam) params.set("cursor", String(pageParam));
      params.set("limit", "20");
      return api.get<PageResult>(`/api/listings?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const listings = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="search-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900" }}>
              Search
            </Text>
            {hasFilter ? (
              <Pressable
                testID="save-search-button"
                onPress={handleSaveSearch}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E1E0A", borderWidth: 1, borderColor: "#D4A84366", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <BellPlus size={14} color="#D4A843" strokeWidth={2.5} />
                <Text style={{ color: "#D4A843", fontSize: 12, fontWeight: "800" }}>Save search</Text>
              </Pressable>
            ) : null}
          </View>
          {/* Search input */}
          <View style={{
            flexDirection: "row", alignItems: "center",
            backgroundColor: "#16161E", borderRadius: 16,
            borderWidth: 1, borderColor: "#2A2A3A",
            paddingHorizontal: 16, marginBottom: 16,
          }}>
            <Search size={18} color="#666680" strokeWidth={2} />
            <TextInput
              testID="search-input"
              value={search}
              onChangeText={setSearch}
              placeholder="Search listings..."
              placeholderTextColor="#3A3A4A"
              style={{ flex: 1, color: "#FFFFFF", fontSize: 15, paddingVertical: 14, marginLeft: 10 }}
              returnKeyType="search"
              onSubmitEditing={() => refetch()}
            />
            {search ? (
              <Pressable testID="clear-search" onPress={() => setSearch("")} style={{ marginRight: 4 }}>
                <X size={16} color="#666680" strokeWidth={2} />
              </Pressable>
            ) : null}
            <VoiceSearchButton onTranscribed={(text) => setSearch(text)} />
          </View>

          {/* Category pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: 8 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  testID={`search-category-${cat.key}`}
                  onPress={() => setCategory(cat.key)}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 20, gap: 6,
                    backgroundColor: active ? "#D4A843" : "#16161E",
                    borderWidth: 1, borderColor: active ? "#D4A843" : "#2A2A3A",
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{cat.icon}</Text>
                  <Text style={{ color: active ? "#0A0A0F" : "#888", fontSize: 13, fontWeight: active ? "800" : "600" }}>
                    {CATEGORY_LABELS[cat.key]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Country filter */}
          <Pressable
            testID="country-filter"
            onPress={() => setShowCountryPicker(!showCountryPicker)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#16161E", borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: country ? "#D4A843" : "#2A2A3A",
            }}
          >
            <Text style={{ color: country ? "#D4A843" : "#3A3A4A", fontSize: 14, fontWeight: country ? "700" : "400" }}>
              {country || "Filter by country..."}
            </Text>
            <Text style={{ color: "#666680", fontSize: 12 }}>{showCountryPicker ? "▲" : "▼"}</Text>
          </Pressable>

          {showCountryPicker ? (
            <View style={{
              backgroundColor: "#16161E", borderRadius: 12, marginTop: 8,
              borderWidth: 1, borderColor: "#2A2A3A", overflow: "hidden",
            }}>
              <TextInput
                value={countryQuery}
                onChangeText={setCountryQuery}
                placeholder="Search countries..."
                placeholderTextColor="#3A3A4A"
                style={{ color: "#FFFFFF", fontSize: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: "#2A2A3A" }}
                autoCapitalize="none"
              />
              <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                {country ? (
                  <Pressable
                    onPress={() => { setCountry(""); setShowCountryPicker(false); setCountryQuery(""); }}
                    style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#2A2A3A" }}
                  >
                    <Text style={{ color: "#FF6B6B", fontSize: 14, fontWeight: "600" }}>Clear filter ✕</Text>
                  </Pressable>
                ) : null}
                {AFRICAN_COUNTRIES.filter((c) => !countryQuery || c.toLowerCase().includes(countryQuery.toLowerCase())).map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { setCountry(c); setShowCountryPicker(false); setCountryQuery(""); }}
                    style={{
                      padding: 14, borderBottomWidth: 1, borderBottomColor: "#1A1A2A",
                      backgroundColor: country === c ? "#1E1E2A" : "transparent",
                    }}
                  >
                    <Text style={{ color: country === c ? "#D4A843" : "#888", fontSize: 14, fontWeight: country === c ? "700" : "400" }}>
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <FlashList
        testID="search-results"
        data={listings}
        keyExtractor={(item) => item.id}
        estimatedItemSize={320}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 16 }}>
            <ListingCard listing={item} favorited={!!item.isFavorited} onToggleFavorite={handleToggleFavorite} />
          </View>
        )}
        ListHeaderComponent={
          listings.length > 0 ? (
            <Text style={{ color: "#666680", fontSize: 13, marginBottom: 12, paddingTop: 4 }}>
              {listings.length} result{listings.length === 1 ? "" : "s"}
              {hasNextPage ? "+" : ""}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingTop: 16 }}>
              <ListingSkeletonList count={3} />
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>No results found</Text>
              <Text style={{ color: "#666680", fontSize: 14, marginTop: 8, textAlign: "center" }}>
                Try adjusting your search or filters
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator testID="search-loading-more" color="#D4A843" style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </View>
  );
}
