import React from "react";
import { View, Text, Pressable, Image, Dimensions } from "react-native";
import { router } from "expo-router";
import { Heart, MapPin } from "lucide-react-native";
import { Listing, formatPrice } from "@/lib/types";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

const { width } = Dimensions.get("window");

interface Props {
  listing: Listing;
  favorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  compact?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  property: "#D4A843",
  land: "#1A6B4A",
  car: "#E8890C",
  mining: "#C17B50",
  machinery: "#4A90A4",
};

const CATEGORY_BG: Record<string, string> = {
  property: "#2A1F0A",
  land: "#0A1F14",
  car: "#2A1A0A",
  mining: "#1F140A",
  machinery: "#0A1A22",
};

export default function ListingCard({ listing, favorited, onToggleFavorite, compact }: Props) {
  const scale = useSharedValue(1);
  const heartScale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const cardWidth = compact ? (width - 48) / 2 : width - 32;
  const imageHeight = compact ? 120 : 200;

  const firstImage = listing.images?.[0]?.url;
  const categoryColor = CATEGORY_COLORS[listing.category] || "#D4A843";
  const categoryBg = CATEGORY_BG[listing.category] || "#2A1F0A";

  return (
    <Animated.View style={[animStyle, { width: cardWidth }]}>
      <Pressable
        testID={`listing-card-${listing.id}`}
        onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: listing.id } })}
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={{
          backgroundColor: "#12121A",
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#1E1E2A",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        }}
      >
        {/* Image */}
        <View style={{ width: "100%", height: imageHeight, backgroundColor: "#1A1A24" }}>
          {firstImage ? (
            <Image source={{ uri: firstImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 48 }}>
                {listing.category === "property" ? "🏠" : listing.category === "land" ? "🌍" : listing.category === "car" ? "🚗" : listing.category === "machinery" ? "🚜" : "⛏️"}
              </Text>
            </View>
          )}

          {/* Category badge */}
          <View style={{
            position: "absolute", top: 12, left: 12,
            backgroundColor: categoryBg, paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 20, borderWidth: 1, borderColor: categoryColor + "40",
          }}>
            <Text style={{ color: categoryColor, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {listing.category}
            </Text>
          </View>

          {/* Rent badge */}
          {listing.listingType === "rent" ? (
            <View style={{
              position: "absolute", top: 12, left: listing.category.length * 7 + 44,
              backgroundColor: "#1A6B4A", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
            }}>
              <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>🔑 RENT</Text>
            </View>
          ) : null}

          {/* Status badge */}
          {listing.status !== "active" ? (
            <View style={{
              position: "absolute", top: 12, right: 44,
              backgroundColor: listing.status === "sold" ? "#2D1515" : "#1A1A2A",
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
            }}>
              <Text style={{ color: listing.status === "sold" ? "#FF6B6B" : "#888", fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                {listing.status}
              </Text>
            </View>
          ) : null}

          {/* Favorite button */}
          <Pressable
            testID={`favorite-button-${listing.id}`}
            onPress={() => {
              heartScale.value = withSpring(1.3, {}, () => { heartScale.value = withSpring(1); });
              onToggleFavorite?.(listing.id);
            }}
            style={{
              position: "absolute", top: 10, right: 10,
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.6)",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Heart
              size={16}
              color={favorited ? "#FF6B6B" : "#FFFFFF"}
              fill={favorited ? "#FF6B6B" : "transparent"}
              strokeWidth={2}
            />
          </Pressable>
        </View>

        {/* Info */}
        <View style={{ padding: compact ? 12 : 16 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 4 }}>
            <Text style={{
              color: categoryColor, fontSize: compact ? 20 : 24,
              fontWeight: "800",
            }}>
              {formatPrice(listing.price, listing.currency)}
            </Text>
            {listing.listingType === "rent" && listing.rentalPeriod ? (
              <Text style={{ color: "#666680", fontSize: compact ? 12 : 14, fontWeight: "700", marginLeft: 3 }}>
                /{listing.rentalPeriod}
              </Text>
            ) : null}
          </View>
          <Text
            style={{ color: "#FFFFFF", fontSize: compact ? 13 : 15, fontWeight: "600", marginBottom: 6 }}
            numberOfLines={1}
          >
            {listing.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MapPin size={11} color="#666680" strokeWidth={2} />
            <Text style={{ color: "#666680", fontSize: 12, marginLeft: 4 }} numberOfLines={1}>
              {[listing.city, listing.country].filter(Boolean).join(", ")}
            </Text>
          </View>
          {!compact && (listing.bedrooms || listing.carMake || listing.mineralType) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 6 }}>
              {listing.bedrooms ? (
                <View style={{ backgroundColor: "#1E1E2A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>🛏 {listing.bedrooms} bed</Text>
                </View>
              ) : null}
              {listing.bathrooms ? (
                <View style={{ backgroundColor: "#1E1E2A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>🚿 {listing.bathrooms} bath</Text>
                </View>
              ) : null}
              {listing.area ? (
                <View style={{ backgroundColor: "#1E1E2A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>📐 {listing.area}m²</Text>
                </View>
              ) : null}
              {listing.carMake ? (
                <View style={{ backgroundColor: "#1E1E2A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>{listing.carMake} {listing.carYear}</Text>
                </View>
              ) : null}
              {listing.mineralType ? (
                <View style={{ backgroundColor: "#1E1E2A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>⛏ {listing.mineralType}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
