import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Gavel, Timer } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { Bid, Listing, formatMoney } from "@/lib/types";

export default function BidsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [amountInput, setAmountInput] = useState("");

  const { data: listing } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.get<Listing>(`/api/listings/${id}`),
  });

  const { data: bids = [], isLoading } = useQuery({
    queryKey: ["bids", id],
    queryFn: () => api.get<Bid[]>(`/api/bids/listing/${id}`),
    refetchInterval: 10_000,
  });

  const place = useMutation({
    mutationFn: () =>
      api.post(`/api/bids/listing/${id}`, {
        amount: Math.round(parseFloat(amountInput) * 100),
      }),
    onSuccess: () => {
      setAmountInput("");
      queryClient.invalidateQueries({ queryKey: ["bids", id] });
    },
    onError: (e: unknown) => Alert.alert("Bid failed", e instanceof Error ? e.message : "Try again"),
  });

  const top = bids[0];
  const endsAt = listing?.auctionEndsAt ? new Date(listing.auctionEndsAt) : null;
  const remaining = endsAt ? endsAt.getTime() - Date.now() : 0;
  const closed = !endsAt || remaining <= 0 || listing?.auctionClosed;
  const owner = listing?.user?.id === session?.user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="bids-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="bids-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Bids</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
        <View style={{ backgroundColor: "#1E1E0A", borderRadius: 16, borderWidth: 1, borderColor: "#D4A84366", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Gavel size={18} color="#D4A843" />
            <Text style={{ color: "#D4A843", fontWeight: "900", letterSpacing: 1 }}>AUCTION</Text>
          </View>
          {listing ? (
            <>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>{listing.title}</Text>
              <Text style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                Top bid: {top ? formatMoney(top.amount, top.currency) : `Min ${listing.minBid ? formatMoney(listing.minBid, listing.currency) : "—"}`}
              </Text>
              {endsAt ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Timer size={12} color="#D4A843" />
                  <Text style={{ color: "#D4A843", fontSize: 12, fontWeight: "700" }}>
                    {closed ? "Closed" : `${Math.round(remaining / 1000 / 60)} min remaining`}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <ActivityIndicator color="#D4A843" />
          )}
        </View>

        {!closed && !owner ? (
          <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
            <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>YOUR BID ({listing?.currency})</Text>
            <TextInput
              testID="bid-amount"
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor="#3A3A4A"
              style={{ backgroundColor: "#0A0A0F", borderRadius: 12, padding: 14, color: "#FFFFFF", fontSize: 18, borderWidth: 1, borderColor: "#2A2A3A" }}
            />
            <Pressable
              testID="place-bid"
              onPress={() => place.mutate()}
              disabled={place.isPending || !amountInput}
              style={{ marginTop: 10, backgroundColor: "#D4A843", borderRadius: 12, padding: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>
                {place.isPending ? "Placing…" : "Place bid"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800", marginBottom: 10 }}>Bid history</Text>
          {isLoading ? (
            <ActivityIndicator color="#D4A843" />
          ) : bids.length === 0 ? (
            <Text style={{ color: "#666680", fontSize: 13 }}>No bids yet — be the first.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {bids.map((b, i) => (
                <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: i === 0 ? "#D4A843" : "#1E1E2A", alignItems: "center", justifyContent: "center" }}>
                    {b.bidder?.image ? (
                      <Image source={{ uri: b.bidder.image }} style={{ width: "100%", height: "100%", borderRadius: 16 }} />
                    ) : (
                      <Text style={{ color: i === 0 ? "#0A0A0F" : "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
                        {(b.bidder?.name || "?").charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{b.bidder?.name || "—"}</Text>
                    <Text style={{ color: "#666680", fontSize: 11 }}>{new Date(b.createdAt).toLocaleString()}</Text>
                  </View>
                  <Text style={{ color: i === 0 ? "#D4A843" : "#FFFFFF", fontWeight: "900" }}>
                    {formatMoney(b.amount, b.currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
