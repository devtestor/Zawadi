import React, { useState } from "react";
import { View, Text, Pressable, StatusBar, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, Zap, Check } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useQueryClient } from "@tanstack/react-query";

type Tier = "basic" | "standard" | "premium";

const TIERS: { key: Tier; days: number; amount: number; label: string; desc: string; highlight?: boolean }[] = [
  { key: "basic", days: 3, amount: 5, label: "Basic", desc: "3 days featured" },
  { key: "standard", days: 7, amount: 10, label: "Standard", desc: "7 days featured", highlight: true },
  { key: "premium", days: 30, amount: 30, label: "Premium", desc: "30 days featured" },
];

export default function BoostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selected, setSelected] = useState<Tier>("standard");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleBoost = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { checkoutUrl } = await api.post<{
        checkoutUrl: string;
        txRef: string;
        tier: { chargedAmount: number; chargedCurrency: string };
      }>(`/api/boost/${id}`, { tier: selected });
      const result = await WebBrowser.openBrowserAsync(checkoutUrl);
      if (result.type === "cancel" || result.type === "dismiss") {
        queryClient.invalidateQueries({ queryKey: ["listing", id] });
        queryClient.invalidateQueries({ queryKey: ["listings"] });
      }
    } catch (e: any) {
      Alert.alert("Boost failed", e.message || "Could not start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="boost-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable testID="boost-back" onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2A2A3A" }}>
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginLeft: 12 }}>Boost Listing</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <View style={{ backgroundColor: "#1E1E0A", borderRadius: 20, padding: 24, borderWidth: 1, borderColor: "#D4A84340", marginBottom: 24, alignItems: "center" }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#D4A84322", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Zap size={28} color="#D4A843" strokeWidth={2.5} fill="#D4A843" />
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginBottom: 4 }}>Get 10x more views</Text>
          <Text style={{ color: "#888", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
            Featured listings appear at the top and in the Featured row across ZAWADI.
          </Text>
        </View>

        <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Choose a plan
        </Text>

        <View style={{ gap: 12 }}>
          {TIERS.map((t) => {
            const active = selected === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`boost-tier-${t.key}`}
                onPress={() => setSelected(t.key)}
                style={{
                  backgroundColor: active ? "#1E1E0A" : "#12121A",
                  borderRadius: 16, padding: 18,
                  borderWidth: 2, borderColor: active ? "#D4A843" : "#1E1E2A",
                  flexDirection: "row", alignItems: "center",
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: active ? "#D4A843" : "#2A2A3A", backgroundColor: active ? "#D4A843" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 14 }}>
                  {active ? <Check size={14} color="#0A0A0F" strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: active ? "#D4A843" : "#FFFFFF", fontSize: 17, fontWeight: "800" }}>{t.label}</Text>
                    {t.highlight ? (
                      <View style={{ backgroundColor: "#D4A843", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: "#0A0A0F", fontSize: 9, fontWeight: "900" }}>POPULAR</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: "#666680", fontSize: 13, marginTop: 2 }}>{t.desc}</Text>
                </View>
                <Text style={{ color: active ? "#D4A843" : "#FFFFFF", fontSize: 20, fontWeight: "900" }}>${t.amount}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 24, padding: 16, backgroundColor: "#12121A", borderRadius: 14, borderWidth: 1, borderColor: "#1E1E2A" }}>
          <Text style={{ color: "#888", fontSize: 12, lineHeight: 20 }}>
            Payment via Pesapal — pay with MTN Mobile Money, Airtel Money, or bank card. Works in Rwanda, Kenya, Uganda, and Tanzania.
          </Text>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#0A0A0F", borderTopWidth: 1, borderTopColor: "#1E1E2A", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
        <Pressable testID="boost-pay-button" onPress={handleBoost} disabled={loading} style={{ borderRadius: 16, overflow: "hidden" }}>
          <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 18, alignItems: "center" }}>
            {loading ? (
              <ActivityIndicator color="#0A0A0F" />
            ) : (
              <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800" }}>
                Pay ${TIERS.find((t) => t.key === selected)?.amount} with Mobile Money
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
