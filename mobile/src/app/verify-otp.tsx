import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, ArrowLeft } from "lucide-react-native";

const isWeb = Platform.OS === "web";

export default function VerifyOTP() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const invalidateSession = useInvalidateSession();

  const handleVerifyOTP = async (otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await (authClient as any).signIn.emailOtp({
        email: email.trim(),
        otp,
      });
      if (result.error) {
        setError(result.error.message || "Invalid code. Please try again.");
      } else {
        await invalidateSession();
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    await (authClient as any).emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
    setResending(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <StatusBar barStyle="light-content" />

      {/* Back button */}
      <Pressable
        testID="back-button"
        onPress={() => router.back()}
        style={{ position: "absolute", top: isWeb ? 24 : 60, left: 24, zIndex: 10, padding: 8, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <ArrowLeft size={16} color="#D4A843" strokeWidth={2.5} />
        <Text style={{ color: "#D4A843", fontSize: 15, fontWeight: "700" }}>Back</Text>
      </Pressable>

      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" }}>
       <View style={{
         width: "100%",
         maxWidth: 440,
         ...(isWeb ? {
           backgroundColor: "rgba(22,22,30,0.55)",
           borderRadius: 24,
           borderWidth: 1,
           borderColor: "#1F1F2A",
           padding: 36,
         } : {}),
       }}>
        <View style={{ alignItems: "center", marginBottom: 28 }}>
          <LinearGradient
            colors={["#1F1F2A", "#16161E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: isWeb ? 60 : 72,
              height: isWeb ? 60 : 72,
              borderRadius: isWeb ? 18 : 20,
              borderWidth: 1.5, borderColor: "#D4A843",
              alignItems: "center", justifyContent: "center",
              shadowColor: "#D4A843", shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3, shadowRadius: 16,
            }}
          >
            <ShieldCheck size={isWeb ? 30 : 36} color="#D4A843" strokeWidth={2} />
          </LinearGradient>
        </View>

        <Text style={{ color: "#FFFFFF", fontSize: isWeb ? 26 : 30, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>
          Verify your email
        </Text>
        <Text style={{ color: "#7A7A95", fontSize: 15, marginBottom: 4, lineHeight: 22, textAlign: "center" }}>
          We sent a 6-digit code to
        </Text>
        <Text style={{ color: "#D4A843", fontSize: 15, fontWeight: "700", marginBottom: 36, textAlign: "center" }}>
          {email}
        </Text>

        {loading ? (
          <ActivityIndicator color="#D4A843" size="large" style={{ marginBottom: 32 }} />
        ) : (
          <OtpInput
            numberOfDigits={6}
            onFilled={handleVerifyOTP}
            type="numeric"
            focusColor="#D4A843"
            theme={{
              containerStyle: { marginBottom: 32, justifyContent: "center", gap: 6 },
              pinCodeContainerStyle: {
                backgroundColor: "#16161E",
                borderColor: "#252535",
                borderRadius: 12,
                borderWidth: 1.5,
                width: 46,
                height: 56,
              },
              pinCodeTextStyle: {
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: "800",
              },
              focusStickStyle: { backgroundColor: "#D4A843" },
            }}
          />
        )}

        {error ? (
          <View style={{
            backgroundColor: "#2D1515", borderRadius: 12,
            padding: 14, marginBottom: 24,
            borderWidth: 1, borderColor: "#5D2020",
          }}>
            <Text style={{ color: "#FF6B6B", fontSize: 14, fontWeight: "500" }}>{error}</Text>
          </View>
        ) : null}

        <Pressable testID="resend-button" onPress={handleResend} disabled={resending}>
          <Text style={{ color: "#7A7A95", textAlign: "center", fontSize: 14 }}>
            Didn't receive it?{" "}
            <Text style={{ color: "#D4A843", fontWeight: "700" }}>
              {resending ? "Sending..." : "Resend code"}
            </Text>
          </Text>
        </Pressable>
       </View>
      </View>
    </View>
  );
}
