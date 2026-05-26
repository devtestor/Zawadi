import React from "react";
import { View, Text, Pressable, ActivityIndicator, StatusBar, FlatList, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Briefcase } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Trade, formatMoney } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";

const STATUS_COLORS: Record<string, string> = {
  initiated: "#888",
  in_escrow: "#D4A843",
  delivered: "#4A90A4",
  completed: "#1A6B4A",
  disputed: "#FF6B6B",
  refunded: "#888",
  cancelled: "#3A3A4A",
};

export default function TradesScreen() {
  const { data: session } = useSession();
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api.get<Trade[]>("/api/trades"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="trades-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="trades-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Trades</Text>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : trades.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Briefcase size={36} color="#D4A843" />
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 12 }}>No trades yet</Text>
          <Text style={{ color: "#888", fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
            Once you start a trade on a listing — or someone bids on yours — it'll show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="trades-list"
          data={trades}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            const role = item.buyerId === session?.user?.id ? "Buyer" : "Seller";
            const other = role === "Buyer" ? item.seller : item.buyer;
            const color = STATUS_COLORS[item.status] || "#888";
            return (
              <Pressable
                testID={`trade-${item.id}`}
                onPress={() => router.push({ pathname: "/trade/[id]" as any, params: { id: item.id } })}
                style={{ flexDirection: "row", gap: 12, backgroundColor: "#12121A", borderRadius: 14, borderWidth: 1, borderColor: "#1E1E2A", padding: 12, alignItems: "center" }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#1A1A24", overflow: "hidden" }}>
                  {item.listing?.images?.[0]?.url ? (
                    <Image source={{ uri: item.listing.images[0].url }} style={{ width: "100%", height: "100%" }} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>
                    {item.listing?.title || "Trade"}
                  </Text>
                  <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                    {role} · with {other?.name ?? "—"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{formatMoney(item.amount, item.currency)}</Text>
                  <View style={{ marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: color + "22", borderWidth: 1, borderColor: color + "66" }}>
                    <Text style={{ color, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {item.status.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
