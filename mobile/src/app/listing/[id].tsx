import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Image,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { Listing, formatPrice } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import {
  ArrowLeft,
  Heart,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const CATEGORY_COLORS: Record<string, string> = {
  property: "#D4A843", land: "#1A6B4A", car: "#E8890C", mining: "#C17B50",
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [favorited, setFavorited] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.get<Listing>(`/api/listings/${id}`),
  });

  const handleToggleFavorite = async () => {
    if (!session?.user) {
      Alert.alert("Sign in required", "Please sign in to save listings");
      return;
    }
    setFavorited(!favorited);
    await api.post(`/api/favorites/${id}`, {});
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  const handleContact = (type: "phone" | "email") => {
    if (type === "phone" && listing?.user?.phone) {
      Linking.openURL(`tel:${listing.user.phone}`);
    } else if (type === "email" && listing?.user?.email) {
      Linking.openURL(`mailto:${listing.user.email}?subject=Inquiry about ${listing?.title}`);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator testID="listing-loading" color="#D4A843" size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 18 }}>Listing not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#D4A843" }}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const categoryColor = CATEGORY_COLORS[listing.category] || "#D4A843";
  const createdDate = new Date(listing.createdAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="listing-detail-screen">
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Images */}
        <View style={{ width, height: 320, backgroundColor: "#12121A" }}>
          {listing.images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                setCurrentImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
              }}
            >
              {listing.images.map((img) => (
                <Image
                  key={img.id}
                  source={{ uri: img.url }}
                  style={{ width, height: 320 }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 80 }}>
                {listing.category === "property" ? "🏠" : listing.category === "land" ? "🗺️" : listing.category === "car" ? "🚗" : "⛏️"}
              </Text>
            </View>
          )}

          {/* Image dots */}
          {listing.images.length > 1 ? (
            <View style={{ position: "absolute", bottom: 16, alignSelf: "center", flexDirection: "row", gap: 6 }}>
              {listing.images.map((_, i) => (
                <View key={i} style={{
                  width: i === currentImageIndex ? 20 : 6,
                  height: 6, borderRadius: 3,
                  backgroundColor: i === currentImageIndex ? "#D4A843" : "rgba(255,255,255,0.4)",
                }} />
              ))}
            </View>
          ) : null}

          {/* Gradient overlay */}
          <LinearGradient
            colors={["rgba(10,10,15,0.8)", "transparent", "transparent", "rgba(10,10,15,0.9)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Top buttons */}
          <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16 }}>
              <Pressable
                testID="back-button"
                onPress={() => router.back()}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: "rgba(10,10,15,0.8)",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
              <Pressable
                testID="favorite-button"
                onPress={handleToggleFavorite}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: "rgba(10,10,15,0.8)",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                <Heart size={20} color={favorited ? "#FF6B6B" : "#FFFFFF"} fill={favorited ? "#FF6B6B" : "transparent"} strokeWidth={2} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Category badge on image */}
          <View style={{
            position: "absolute", bottom: 20, left: 20,
            backgroundColor: categoryColor + "22", borderWidth: 1, borderColor: categoryColor + "66",
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
          }}>
            <Text style={{ color: categoryColor, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
              {listing.category}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Text style={{ color: categoryColor, fontSize: 32, fontWeight: "900", marginBottom: 8 }}>
            {formatPrice(listing.price, listing.currency)}
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginBottom: 12, lineHeight: 30 }}>
            {listing.title}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 6 }}>
            <MapPin size={16} color="#666680" strokeWidth={2} />
            <Text style={{ color: "#888", fontSize: 15 }}>
              {[listing.address, listing.city, listing.country].filter(Boolean).join(", ")}
            </Text>
          </View>

          {/* Key stats */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
            {listing.bedrooms ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Bedrooms</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.bedrooms}</Text>
              </View>
            ) : null}
            {listing.bathrooms ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Bathrooms</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.bathrooms}</Text>
              </View>
            ) : null}
            {listing.area ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Area</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.area}m²</Text>
              </View>
            ) : null}
            {listing.carMake ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Make</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.carMake}</Text>
              </View>
            ) : null}
            {listing.carYear ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Year</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.carYear}</Text>
              </View>
            ) : null}
            {listing.carMileage ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Mileage</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.carMileage.toLocaleString()}km</Text>
              </View>
            ) : null}
            {listing.mineralType ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Mineral</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.mineralType}</Text>
              </View>
            ) : null}
            {listing.miningArea ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Area</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.miningArea}ha</Text>
              </View>
            ) : null}
            <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
              <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Listed</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{createdDate}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>Description</Text>
            <Text style={{ color: "#888", fontSize: 15, lineHeight: 26 }}>{listing.description}</Text>
          </View>

          <View style={{ height: 1, backgroundColor: "#1E1E2A", marginBottom: 24 }} />

          {/* Seller info */}
          <View style={{ marginBottom: 100 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 16 }}>Listed by</Text>
            <View style={{
              backgroundColor: "#12121A", borderRadius: 16, padding: 20,
              borderWidth: 1, borderColor: "#1E1E2A",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: "#D4A843", alignItems: "center", justifyContent: "center",
                  marginRight: 14,
                }}>
                  <Text style={{ color: "#0A0A0F", fontSize: 20, fontWeight: "900" }}>
                    {listing.user?.name?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.user?.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                    <CheckCircle size={12} color="#1A6B4A" fill="#1A6B4A" />
                    <Text style={{ color: "#1A6B4A", fontSize: 12, fontWeight: "600" }}>Verified seller</Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                {listing.user?.phone ? (
                  <Pressable
                    testID="call-button"
                    onPress={() => handleContact("phone")}
                    style={{
                      flex: 1, backgroundColor: "#1A6B4A",
                      borderRadius: 12, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    <Phone size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>Call</Text>
                  </Pressable>
                ) : null}
                {listing.user?.email ? (
                  <Pressable
                    testID="email-button"
                    onPress={() => handleContact("email")}
                    style={{
                      flex: 1, backgroundColor: "#16161E",
                      borderRadius: 12, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      borderWidth: 1, borderColor: "#2A2A3A",
                    }}
                  >
                    <Mail size={16} color="#D4A843" strokeWidth={2.5} />
                    <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "800" }}>Email</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: "#0A0A0F", borderTopWidth: 1, borderTopColor: "#1E1E2A",
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40,
      }}>
        <Pressable
          testID="contact-seller-button"
          onPress={() => listing.user?.phone ? handleContact("phone") : handleContact("email")}
          style={{ borderRadius: 16, overflow: "hidden" }}
        >
          <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 18, alignItems: "center" }}>
            <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800" }}>
              Contact Seller
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
