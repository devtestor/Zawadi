import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, AFRICAN_COUNTRIES, Category, CATEGORY_LABELS } from "@/lib/types";
import ListingCard from "@/components/ListingCard";
import { SafeAreaView } from "react-native-safe-area-context";

const CATEGORIES: { key: Category; icon: string }[] = [
  { key: "all", icon: "🌍" },
  { key: "property", icon: "🏠" },
  { key: "land", icon: "🗺️" },
  { key: "car", icon: "🚗" },
  { key: "mining", icon: "⛏️" },
  { key: "machinery", icon: "🚜" },
];

export default function SearchScreen() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [country, setCountry] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const buildQuery = () => {
    const params: string[] = [];
    if (category !== "all") params.push(`category=${category}`);
    if (country) params.push(`country=${encodeURIComponent(country)}`);
    if (search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
    return params.length ? `?${params.join("&")}` : "";
  };

  const { data: listings = [], isLoading, refetch } = useQuery({
    queryKey: ["search", search, category, country],
    queryFn: () => api.get<Listing[]>(`/api/listings${buildQuery()}`),
    enabled: true,
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="search-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900", marginBottom: 16 }}>
            Search
          </Text>
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
              <Pressable testID="clear-search" onPress={() => setSearch("")}>
                <X size={16} color="#666680" strokeWidth={2} />
              </Pressable>
            ) : null}
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
              borderWidth: 1, borderColor: "#2A2A3A", maxHeight: 200,
              overflow: "hidden",
            }}>
              <ScrollView nestedScrollEnabled>
                {country ? (
                  <Pressable
                    onPress={() => { setCountry(""); setShowCountryPicker(false); }}
                    style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#2A2A3A" }}
                  >
                    <Text style={{ color: "#FF6B6B", fontSize: 14, fontWeight: "600" }}>Clear filter ✕</Text>
                  </Pressable>
                ) : null}
                {AFRICAN_COUNTRIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { setCountry(c); setShowCountryPicker(false); }}
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

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 120 }}>
          {isLoading ? (
            <ActivityIndicator testID="search-loading" color="#D4A843" size="large" style={{ marginTop: 40 }} />
          ) : listings.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>No results found</Text>
              <Text style={{ color: "#666680", fontSize: 14, marginTop: 8, textAlign: "center" }}>
                Try adjusting your search or filters
              </Text>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              <Text style={{ color: "#666680", fontSize: 13, marginBottom: 4 }}>
                {listings.length} results
              </Text>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
