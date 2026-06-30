import React, { useEffect, useState } from "react";
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
  Share,
  Platform,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "@/lib/maps";
import { Galeria } from "@nandorojo/galeria";
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
  Zap,
  Pencil,
  Trash2,
  CheckCheck,
  RotateCcw,
  Share2,
  Flag,
  MessageSquare,
  BarChart3,
  Gavel,
  ShoppingBag,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const CATEGORY_COLORS: Record<string, string> = {
  property: "#D4A843", land: "#1A6B4A", car: "#E8890C", mining: "#C17B50", machinery: "#4A90A4",
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.get<Listing>(`/api/listings/${id}`),
  });

  const favorited = !!listing?.isFavorited;

  useEffect(() => {
    if (!id) return;
    // Best-effort view counter bump.
    api.post(`/api/listings/${id}/view`, {}).catch(() => {});
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!session?.user) {
      Alert.alert("Sign in required", "Please sign in to save listings");
      return;
    }
    queryClient.setQueryData<Listing | undefined>(["listing", id], (old) =>
      old ? { ...old, isFavorited: !old.isFavorited } : old,
    );
    try {
      await api.post(`/api/favorites/${id}`, {});
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
    }
  };

  const handleContact = (type: "phone" | "email" | "whatsapp") => {
    if (type === "phone" && listing?.user?.phone) {
      Linking.openURL(`tel:${listing.user.phone}`);
    } else if (type === "email" && listing?.user?.email) {
      Linking.openURL(`mailto:${listing.user.email}?subject=Inquiry about ${listing?.title}`);
    } else if (type === "whatsapp" && listing?.user?.phone) {
      // Strip non-digits for the wa.me link.
      const phone = listing.user.phone.replace(/[^0-9]/g, "");
      const text = encodeURIComponent(`Hi, I'm interested in your Alcurry listing: ${listing.title}`);
      Linking.openURL(`https://wa.me/${phone}?text=${text}`);
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
            <Galeria urls={listing.images.map((i) => i.url)}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  setCurrentImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
                }}
              >
                {listing.images.map((img, idx) => (
                  <Galeria.Image key={img.id} index={idx}>
                    <Image
                      source={{ uri: img.url }}
                      style={{ width, height: 320 }}
                      resizeMode="cover"
                    />
                  </Galeria.Image>
                ))}
              </ScrollView>
            </Galeria>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 80 }}>
                {listing.category === "property" ? "🏠" : listing.category === "land" ? "🗺️" : listing.category === "car" ? "🚗" : listing.category === "machinery" ? "🚜" : "⛏️"}
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  testID="share-button"
                  onPress={async () => {
                    const url = `zawadi://listing/${listing.id}`;
                    const message = `${listing.title} — ${listing.country}${listing.city ? `, ${listing.city}` : ""}\n\nView on Alcurry: ${url}`;
                    try {
                      await Share.share(Platform.OS === "ios" ? { message, url } : { message });
                    } catch {
                      // user cancelled — ignore
                    }
                  }}
                  style={{
                    width: 42, height: 42, borderRadius: 21,
                    backgroundColor: "rgba(10,10,15,0.8)",
                    alignItems: "center", justifyContent: "center",
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  <Share2 size={18} color="#FFFFFF" strokeWidth={2.5} />
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
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {listing.boosted ? (
              <View style={{ backgroundColor: "#D4A84322", borderWidth: 1, borderColor: "#D4A84366", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Zap size={11} color="#D4A843" fill="#D4A843" strokeWidth={2} />
                <Text style={{ color: "#D4A843", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>FEATURED</Text>
              </View>
            ) : null}
            {listing.listingType === "rent" ? (
              <View style={{ backgroundColor: "#1A6B4A22", borderWidth: 1, borderColor: "#1A6B4A66", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#1A6B4A", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>🔑 FOR RENT</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 8 }}>
            <Text style={{ color: categoryColor, fontSize: 32, fontWeight: "900" }}>
              {formatPrice(listing.price, listing.currency)}
            </Text>
            {listing.listingType === "rent" && listing.rentalPeriod ? (
              <Text style={{ color: "#666680", fontSize: 16, fontWeight: "700", marginLeft: 4, marginBottom: 4 }}>
                /{listing.rentalPeriod}
              </Text>
            ) : null}
          </View>
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
            {listing.machineryType ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Type</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800", textTransform: "capitalize" }}>{listing.machineryType.replace(/_/g, " ")}</Text>
              </View>
            ) : null}
            {listing.machineryBrand ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Brand</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.machineryBrand}</Text>
              </View>
            ) : null}
            {listing.machineryModel ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Model</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.machineryModel}</Text>
              </View>
            ) : null}
            {listing.machineryYear ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Year</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.machineryYear}</Text>
              </View>
            ) : null}
            {listing.machineryHours ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Hours</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.machineryHours.toLocaleString()}</Text>
              </View>
            ) : null}
            <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
              <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Listed</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{createdDate}</Text>
            </View>
            {typeof listing.viewCount === "number" ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#2A2A3A" }}>
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 2 }}>Views</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{listing.viewCount.toLocaleString()}</Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>Description</Text>
            <Text style={{ color: "#888", fontSize: 15, lineHeight: 26 }}>{listing.description}</Text>
          </View>

          {/* Map */}
          {typeof listing.latitude === "number" && typeof listing.longitude === "number" ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>Location</Text>
              <View style={{ height: 200, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1E1E2A" }}>
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  pointerEvents="none"
                >
                  <Marker
                    coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
                    pinColor={categoryColor}
                  />
                </MapView>
              </View>
              <Pressable
                testID="open-in-maps"
                onPress={() => {
                  const lat = listing.latitude;
                  const lng = listing.longitude;
                  const url = Platform.select({
                    ios: `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(listing.title)}`,
                    android: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(listing.title)})`,
                  });
                  if (url) Linking.openURL(url);
                }}
                style={{ marginTop: 10, alignSelf: "flex-start" }}
              >
                <Text style={{ color: "#D4A843", fontSize: 13, fontWeight: "700" }}>Open in Maps →</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: "#1E1E2A", marginBottom: 24 }} />

          {/* Owner actions */}
          {session?.user?.id === listing.user?.id ? (
            <>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <Pressable
                  testID="edit-listing-button"
                  onPress={() => router.push({ pathname: "/listing/edit/[id]" as any, params: { id: listing.id } })}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", borderRadius: 12, paddingVertical: 12 }}
                >
                  <Pencil size={14} color="#D4A843" strokeWidth={2.5} />
                  <Text style={{ color: "#D4A843", fontSize: 13, fontWeight: "800" }}>Edit</Text>
                </Pressable>
                <Pressable
                  testID="toggle-sold-button"
                  onPress={async () => {
                    const nextStatus = listing.status === "sold" ? "active" : "sold";
                    try {
                      await api.put(`/api/listings/${listing.id}`, { status: nextStatus });
                      queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
                      queryClient.invalidateQueries({ queryKey: ["listings"] });
                      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : "Could not update status";
                      Alert.alert("Error", msg);
                    }
                  }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: listing.status === "sold" ? "#0A1F14" : "#16161E", borderWidth: 1, borderColor: listing.status === "sold" ? "#1A6B4A" : "#2A2A3A", borderRadius: 12, paddingVertical: 12 }}
                >
                  {listing.status === "sold" ? (
                    <>
                      <RotateCcw size={14} color="#1A6B4A" strokeWidth={2.5} />
                      <Text style={{ color: "#1A6B4A", fontSize: 13, fontWeight: "800" }}>Reactivate</Text>
                    </>
                  ) : (
                    <>
                      <CheckCheck size={14} color="#888" strokeWidth={2.5} />
                      <Text style={{ color: "#888", fontSize: 13, fontWeight: "800" }}>Mark sold</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  testID="delete-listing-button"
                  onPress={() => {
                    Alert.alert(
                      "Delete listing?",
                      "This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await api.delete(`/api/listings/${listing.id}`);
                              queryClient.invalidateQueries({ queryKey: ["listings"] });
                              queryClient.invalidateQueries({ queryKey: ["my-listings"] });
                              router.back();
                            } catch (e: unknown) {
                              const msg = e instanceof Error ? e.message : "Could not delete";
                              Alert.alert("Error", msg);
                            }
                          },
                        },
                      ],
                    );
                  }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#2D1515", borderWidth: 1, borderColor: "#5D2020", borderRadius: 12, paddingVertical: 12 }}
                >
                  <Trash2 size={14} color="#FF6B6B" strokeWidth={2.5} />
                  <Text style={{ color: "#FF6B6B", fontSize: 13, fontWeight: "800" }}>Delete</Text>
                </Pressable>
              </View>
              <Pressable
                testID="analytics-link"
                onPress={() => router.push({ pathname: "/listing/analytics/[id]" as any, params: { id: listing.id } })}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#12121A", borderWidth: 1, borderColor: "#1E1E2A", borderRadius: 16, padding: 16, marginBottom: 12 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#1E1E0A", alignItems: "center", justifyContent: "center" }}>
                  <BarChart3 size={18} color="#D4A843" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>View analytics</Text>
                  <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Views, saves & messages — last 30 days</Text>
                </View>
                <Text style={{ color: "#D4A843", fontSize: 18 }}>→</Text>
              </Pressable>
              <Pressable
                testID="boost-listing-button"
                onPress={() => router.push({ pathname: "/boost/[id]" as any, params: { id: listing.id } })}
                style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: listing.boosted ? "#12121A" : "#1E1E0A",
                  borderRadius: 16, padding: 18, marginBottom: 24,
                  borderWidth: 1, borderColor: listing.boosted ? "#2A2A3A" : "#D4A84366",
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#D4A84322", alignItems: "center", justifyContent: "center", marginRight: 14 }}>
                  <Zap size={20} color="#D4A843" fill="#D4A843" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
                    {listing.boosted ? "Extend boost" : "Boost this listing"}
                  </Text>
                  <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                    {listing.boosted && listing.boostedUntil
                      ? `Featured until ${new Date(listing.boostedUntil).toLocaleDateString()}`
                      : "Get 10× more views from $5"}
                  </Text>
                </View>
                <Text style={{ color: "#D4A843", fontSize: 20 }}>→</Text>
              </Pressable>
            </>
          ) : null}

          {/* Report (non-owner only) */}
          {session?.user && session.user.id !== listing.user?.id ? (
            <Pressable
              testID="report-listing-button"
              onPress={() => {
                Alert.alert(
                  "Report this listing",
                  "Why are you reporting it?",
                  [
                    { text: "Cancel", style: "cancel" },
                    ...([
                      ["spam", "Spam"],
                      ["scam", "Scam / fraud"],
                      ["offensive", "Offensive content"],
                      ["wrong_category", "Wrong category"],
                      ["other", "Other"],
                    ] as const).map(([reason, label]) => ({
                      text: label,
                      onPress: async () => {
                        try {
                          await api.post("/api/reports", { listingId: listing.id, reason });
                          Alert.alert("Thanks", "Our team will review this listing.");
                        } catch (e: unknown) {
                          const msg = e instanceof Error ? e.message : "Could not submit report";
                          Alert.alert("Error", msg);
                        }
                      },
                    })),
                  ],
                );
              }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 24 }}
            >
              <Flag size={13} color="#666680" strokeWidth={2.5} />
              <Text style={{ color: "#666680", fontSize: 12, fontWeight: "600" }}>Report this listing</Text>
            </Pressable>
          ) : null}

          {/* Seller info */}
          <View style={{ marginBottom: 100 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 16 }}>Listed by</Text>
            <Pressable
              testID="seller-card"
              onPress={() => listing.user?.id && router.push({ pathname: "/seller/[id]" as any, params: { id: listing.user.id } })}
              style={{
                backgroundColor: "#12121A", borderRadius: 16, padding: 20,
                borderWidth: 1, borderColor: "#1E1E2A",
              }}
            >
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
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                    {listing.user?.businessName || listing.user?.name}
                  </Text>
                  {listing.user?.role === "business" ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                      <CheckCircle size={12} color="#D4A843" fill="#D4A843" />
                      <Text style={{ color: "#D4A843", fontSize: 12, fontWeight: "700" }}>Verified business</Text>
                    </View>
                  ) : listing.user?.verifiedAt ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                      <CheckCircle size={12} color="#1A6B4A" fill="#1A6B4A" />
                      <Text style={{ color: "#1A6B4A", fontSize: 12, fontWeight: "600" }}>Verified seller</Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#666680", fontSize: 12, marginTop: 4 }}>New seller</Text>
                  )}
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {listing.user?.phone ? (
                  <Pressable
                    testID="call-button"
                    onPress={() => handleContact("phone")}
                    style={{
                      flex: 1, minWidth: 90, backgroundColor: "#1A6B4A",
                      borderRadius: 12, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <Phone size={14} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>Call</Text>
                  </Pressable>
                ) : null}
                {listing.user?.phone ? (
                  <Pressable
                    testID="whatsapp-button"
                    onPress={() => handleContact("whatsapp")}
                    style={{
                      flex: 1, minWidth: 90, backgroundColor: "#25D366",
                      borderRadius: 12, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <MessageSquare size={14} color="#0A0A0F" strokeWidth={2.5} />
                    <Text style={{ color: "#0A0A0F", fontSize: 13, fontWeight: "800" }}>WhatsApp</Text>
                  </Pressable>
                ) : null}
                {listing.user?.email ? (
                  <Pressable
                    testID="email-button"
                    onPress={() => handleContact("email")}
                    style={{
                      flex: 1, minWidth: 90, backgroundColor: "#16161E",
                      borderRadius: 12, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                      borderWidth: 1, borderColor: "#2A2A3A",
                    }}
                  >
                    <Mail size={14} color="#D4A843" strokeWidth={2.5} />
                    <Text style={{ color: "#D4A843", fontSize: 13, fontWeight: "800" }}>Email</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      {session?.user?.id !== listing.user?.id ? (
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: "#0A0A0F", borderTopWidth: 1, borderTopColor: "#1E1E2A",
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40,
          flexDirection: "row", gap: 10,
        }}>
          {listing.auctionEndsAt && !listing.auctionClosed ? (
            <Pressable
              testID="place-bid-cta"
              onPress={() => router.push({ pathname: "/listing/bids/[id]" as any, params: { id: listing.id } })}
              style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}
            >
              <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Gavel size={16} color="#0A0A0F" strokeWidth={2.5} />
                <Text style={{ color: "#0A0A0F", fontSize: 15, fontWeight: "900" }}>Place bid</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              testID="buy-now-cta"
              onPress={async () => {
                if (!session?.user) {
                  Alert.alert("Sign in required", "Please sign in to buy");
                  return;
                }
                try {
                  const result = await api.post<{ id: string }>("/api/trades", { listingId: listing.id });
                  router.push({ pathname: "/trade/[id]" as any, params: { id: result.id } });
                } catch (e: unknown) {
                  Alert.alert("Couldn't start trade", e instanceof Error ? e.message : "Try again");
                }
              }}
              style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}
            >
              <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <ShoppingBag size={16} color="#0A0A0F" strokeWidth={2.5} />
                <Text style={{ color: "#0A0A0F", fontSize: 15, fontWeight: "900" }}>Buy via escrow</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable
            testID="message-seller-button"
            onPress={async () => {
              if (!session?.user) {
                Alert.alert("Sign in required", "Please sign in to message sellers");
                return;
              }
              try {
                const result = await api.post<{ id: string }>("/api/messages/start", {
                  recipientId: listing.user.id,
                  listingId: listing.id,
                });
                router.push({ pathname: "/chat/[id]" as any, params: { id: result.id } });
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not start conversation");
              }
            }}
            style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <MessageSquare size={20} color="#D4A843" strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
