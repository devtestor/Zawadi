import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StatusBar, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Briefcase } from "lucide-react-native";
import { api } from "@/lib/api/api";

const TYPES = [
  { key: "agency", label: "Real-estate agency" },
  { key: "dealer", label: "Car / equipment dealer" },
  { key: "developer", label: "Property developer" },
  { key: "other", label: "Other" },
] as const;

export default function BusinessApplyScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("agency");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/me/business/apply", { businessName: name.trim(), businessType: type });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Welcome aboard!", "You're now a business seller.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not upgrade";
      Alert.alert("Couldn't upgrade", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="business-apply-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="business-apply-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Business seller</Text>
        </View>
      </SafeAreaView>

      <View style={{ padding: 20, gap: 16 }}>
        <View style={{ alignItems: "center", marginVertical: 16 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#1E1E0A", alignItems: "center", justifyContent: "center", marginBottom: 12, borderWidth: 1, borderColor: "#D4A84366" }}>
            <Briefcase size={32} color="#D4A843" />
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>Become a business seller</Text>
          <Text style={{ color: "#888", fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
            Get a verified badge, higher listing limits (50/hr), and priority support.
          </Text>
        </View>

        <View>
          <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>BUSINESS NAME</Text>
          <TextInput
            testID="business-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Sunrise Realty Ltd"
            placeholderTextColor="#3A3A4A"
            style={{ backgroundColor: "#16161E", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A3A", color: "#FFFFFF", fontSize: 15, padding: 16 }}
          />
        </View>

        <View>
          <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>BUSINESS TYPE</Text>
          <View style={{ gap: 8 }}>
            {TYPES.map((t) => {
              const active = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  testID={`business-type-${t.key}`}
                  onPress={() => setType(t.key)}
                  style={{
                    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
                    backgroundColor: active ? "#1E1E0A" : "#16161E",
                    borderWidth: 1, borderColor: active ? "#D4A843" : "#2A2A3A",
                    flexDirection: "row", alignItems: "center",
                  }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? "#D4A843" : "#3A3A4A", backgroundColor: active ? "#D4A843" : "transparent", marginRight: 12 }} />
                  <Text style={{ color: active ? "#D4A843" : "#FFFFFF", fontSize: 14, fontWeight: "700" }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={{ color: "#666680", fontSize: 12, lineHeight: 18, marginTop: 12 }}>
          You need a verified phone first. Listings stay subject to our community rules.
        </Text>

        <Pressable
          testID="business-apply-submit"
          onPress={submit}
          disabled={busy || !name.trim()}
          style={{ backgroundColor: name.trim() ? "#D4A843" : "#3A3A4A", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 }}
        >
          {busy ? <ActivityIndicator color="#0A0A0F" /> : (
            <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Activate business tier</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
