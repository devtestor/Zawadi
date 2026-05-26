import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, Star } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";

interface Review {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  author: { id: string; name: string; image?: string | null };
}

interface SellerPayload {
  user: {
    id: string;
    name: string;
    image?: string | null;
    verifiedAt: string | null;
    role?: "user" | "business" | "admin";
    businessName?: string | null;
    tradeCount?: number;
    ratingSum?: number;
    ratingCount?: number;
    createdAt: string;
  };
  summary: { average: number | null; count: number };
  reviews: Review[];
}

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["seller", id],
    queryFn: () => api.get<SellerPayload>(`/api/reviews/user/${id}`),
  });

  const submitReview = useMutation({
    mutationFn: () => api.post(`/api/reviews/user/${id}`, { rating, body: body.trim() || undefined }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["seller", id] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not submit review";
      Alert.alert("Error", msg);
    },
  });

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#D4A843" size="large" />
      </View>
    );
  }

  const initials = (data.user.name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const isSelf = session?.user?.id === data.user.id;
  const existingReview = data.reviews.find((r) => r.author.id === session?.user?.id);

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="seller-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 }}>
          <Pressable
            testID="seller-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2A2A3A" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginLeft: 12 }}>Seller</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
          <View
            style={{
              width: 84, height: 84, borderRadius: 42,
              backgroundColor: "#D4A843",
              alignItems: "center", justifyContent: "center",
              shadowColor: "#D4A843", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
            }}
          >
            <Text style={{ color: "#0A0A0F", fontWeight: "900", fontSize: 30 }}>{initials}</Text>
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 12 }}>{data.user.name}</Text>
          {data.user.verifiedAt ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
              <CheckCircle size={14} color="#1A6B4A" fill="#1A6B4A" />
              <Text style={{ color: "#1A6B4A", fontSize: 13, fontWeight: "700" }}>Verified seller</Text>
            </View>
          ) : (
            <Text style={{ color: "#666680", fontSize: 13, marginTop: 6 }}>
              Member since {new Date(data.user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </Text>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
            <Stars value={Math.round(data.summary.average ?? 0)} size={18} />
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
              {data.summary.average ? data.summary.average.toFixed(1) : "—"}
            </Text>
            <Text style={{ color: "#666680", fontSize: 13 }}>({data.summary.count})</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 20, marginTop: 16 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#D4A843", fontSize: 22, fontWeight: "900" }}>{data.user.tradeCount ?? 0}</Text>
              <Text style={{ color: "#666680", fontSize: 11, fontWeight: "700" }}>TRADES</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#D4A843", fontSize: 22, fontWeight: "900" }}>{data.summary.count}</Text>
              <Text style={{ color: "#666680", fontSize: 11, fontWeight: "700" }}>REVIEWS</Text>
            </View>
          </View>
        </View>

        {/* Leave a review */}
        {!isSelf && session?.user ? (
          <View style={{ marginHorizontal: 20, padding: 16, backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", marginBottom: 24 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800", marginBottom: 12 }}>
              {existingReview ? "Update your review" : "Leave a review"}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} testID={`rate-${n}`} onPress={() => setRating(n)}>
                  <Star
                    size={28}
                    color={n <= rating ? "#D4A843" : "#3A3A4A"}
                    fill={n <= rating ? "#D4A843" : "transparent"}
                    strokeWidth={2}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="review-body"
              value={body}
              onChangeText={setBody}
              placeholder="Share your experience (optional)"
              placeholderTextColor="#3A3A4A"
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: "#16161E",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#2A2A3A",
                color: "#FFFFFF",
                padding: 14,
                fontSize: 14,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
            <Pressable
              testID="submit-review"
              onPress={() => submitReview.mutate()}
              disabled={submitReview.isPending}
              style={{ marginTop: 12, backgroundColor: "#D4A843", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              {submitReview.isPending ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <Text style={{ color: "#0A0A0F", fontWeight: "800", fontSize: 15 }}>
                  {existingReview ? "Update review" : "Submit review"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* Reviews list */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginBottom: 12 }}>
            Reviews ({data.summary.count})
          </Text>
          {data.reviews.length === 0 ? (
            <Text style={{ color: "#666680", fontSize: 14 }}>No reviews yet.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {data.reviews.map((r) => (
                <View key={r.id} style={{ backgroundColor: "#12121A", borderRadius: 14, borderWidth: 1, borderColor: "#1E1E2A", padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 }}>
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }}>{r.author.name}</Text>
                    <Stars value={r.rating} size={12} />
                    <Text style={{ color: "#666680", fontSize: 11, marginLeft: "auto" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {r.body ? <Text style={{ color: "#888", fontSize: 14, lineHeight: 20 }}>{r.body}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stars({ value, size }: { value: number; size: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={n <= value ? "#D4A843" : "#3A3A4A"} fill={n <= value ? "#D4A843" : "transparent"} strokeWidth={2} />
      ))}
    </View>
  );
}
