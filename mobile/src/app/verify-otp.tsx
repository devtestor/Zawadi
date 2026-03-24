import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { LinearGradient } from "expo-linear-gradient";

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
        style={{ position: "absolute", top: 60, left: 24, zIndex: 10, padding: 8 }}
      >
        <Text style={{ color: "#D4A843", fontSize: 16, fontWeight: "700" }}>← Back</Text>
      </Pressable>

      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: "center" }}>
        <View style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: "#16161E", borderWidth: 2, borderColor: "#D4A843",
          alignItems: "center", justifyContent: "center", marginBottom: 32,
        }}>
          <Text style={{ fontSize: 32 }}>🔐</Text>
        </View>

        <Text style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "900", marginBottom: 12 }}>
          Verify your email
        </Text>
        <Text style={{ color: "#666680", fontSize: 16, marginBottom: 8, lineHeight: 24 }}>
          We sent a 6-digit code to
        </Text>
        <Text style={{ color: "#D4A843", fontSize: 16, fontWeight: "700", marginBottom: 48 }}>
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
              containerStyle: { marginBottom: 32 },
              pinCodeContainerStyle: {
                backgroundColor: "#16161E",
                borderColor: "#2A2A3A",
                borderRadius: 14,
                borderWidth: 1.5,
                width: 48,
                height: 58,
              },
              pinCodeTextStyle: {
                color: "#FFFFFF",
                fontSize: 24,
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
          <Text style={{ color: "#666680", textAlign: "center", fontSize: 15 }}>
            Didn't receive it?{" "}
            <Text style={{ color: "#D4A843", fontWeight: "700" }}>
              {resending ? "Sending..." : "Resend code"}
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
