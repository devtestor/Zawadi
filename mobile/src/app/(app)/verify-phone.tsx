import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ShieldCheck } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

export default function VerifyPhoneScreen() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/me/phone/start", { phone: phone.trim() });
      setStage("code");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send code";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/me/phone/verify", { code: code.trim() });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Verified!", "Your phone is now verified.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid code";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="verify-phone-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="verify-phone-back"
            onPress={() => router.back()}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Verify phone</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#1E1E0A", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: "#D4A84366" }}>
              <ShieldCheck size={32} color="#D4A843" />
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginBottom: 8 }}>
              {stage === "phone" ? "Verify your phone" : "Enter the code"}
            </Text>
            <Text style={{ color: "#888", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
              {stage === "phone"
                ? "Buyers trust sellers with a verified phone — and we use it for sale-ready updates."
                : "We sent a 6-digit code to your phone. It expires in 10 minutes."}
            </Text>
          </View>

          {stage === "phone" ? (
            <>
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>PHONE NUMBER (E.164)</Text>
              <TextInput
                testID="phone-input"
                value={phone}
                onChangeText={setPhone}
                placeholder="+254712345678"
                placeholderTextColor="#3A3A4A"
                keyboardType="phone-pad"
                style={{
                  backgroundColor: "#16161E", borderRadius: 12,
                  borderWidth: 1, borderColor: "#2A2A3A",
                  color: "#FFFFFF", fontSize: 17, padding: 16,
                }}
              />
              <Pressable
                testID="send-code"
                onPress={send}
                disabled={busy}
                style={{ marginTop: 16, backgroundColor: "#D4A843", borderRadius: 12, paddingVertical: 16, alignItems: "center" }}
              >
                {busy ? <ActivityIndicator color="#0A0A0F" /> : (
                  <Text style={{ color: "#0A0A0F", fontWeight: "800", fontSize: 15 }}>Send code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>6-DIGIT CODE</Text>
              <TextInput
                testID="code-input"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="#3A3A4A"
                keyboardType="number-pad"
                maxLength={6}
                style={{
                  backgroundColor: "#16161E", borderRadius: 12,
                  borderWidth: 1, borderColor: "#2A2A3A",
                  color: "#FFFFFF", fontSize: 24, padding: 16,
                  textAlign: "center", letterSpacing: 8,
                }}
              />
              <Pressable
                testID="verify-code"
                onPress={verify}
                disabled={busy}
                style={{ marginTop: 16, backgroundColor: "#D4A843", borderRadius: 12, paddingVertical: 16, alignItems: "center" }}
              >
                {busy ? <ActivityIndicator color="#0A0A0F" /> : (
                  <Text style={{ color: "#0A0A0F", fontWeight: "800", fontSize: 15 }}>Verify</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setStage("phone")} style={{ marginTop: 12, alignItems: "center" }}>
                <Text style={{ color: "#888", fontSize: 13 }}>← Change number</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
