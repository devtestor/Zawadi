import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { authClient } from "@/lib/auth/auth-client";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { height } = Dimensions.get("window");

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputScale = useSharedValue(1);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await (authClient as any).emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "sign-in",
      });
      if (result.error) {
        setError(result.error.message || "Failed to send code");
      } else {
        router.push({ pathname: "/verify-otp" as any, params: { email: email.trim().toLowerCase() } });
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inputScale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <StatusBar barStyle="light-content" />

      {/* Background decorative circles */}
      <View style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: "#D4A843", opacity: 0.05 }} />
      <View style={{ position: "absolute", bottom: 100, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: "#1A6B4A", opacity: 0.08 }} />
      <View style={{ position: "absolute", top: height * 0.3, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: "#D4A843", opacity: 0.04 }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: "center" }}>
          {/* Logo section */}
          <View style={{ alignItems: "center", marginBottom: 64 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 24,
              backgroundColor: "#D4A843", alignItems: "center", justifyContent: "center",
              marginBottom: 20,
              shadowColor: "#D4A843", shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4, shadowRadius: 20,
            }}>
              <Text style={{ fontSize: 36 }}>🌍</Text>
            </View>
            <Text style={{ fontSize: 42, fontWeight: "900", color: "#FFFFFF", letterSpacing: -1 }}>
              ZAWADI
            </Text>
            <Text style={{ fontSize: 14, color: "#D4A843", letterSpacing: 4, marginTop: 4, fontWeight: "600" }}>
              AFRICA'S MARKETPLACE
            </Text>
            <View style={{ width: 60, height: 2, backgroundColor: "#D4A843", marginTop: 16, borderRadius: 1 }} />
          </View>

          {/* Form */}
          <View>
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginBottom: 8 }}>
              Welcome back
            </Text>
            <Text style={{ color: "#666680", fontSize: 16, marginBottom: 32, lineHeight: 24 }}>
              Enter your email to sign in or create your account
            </Text>

            <Animated.View style={inputAnimStyle}>
              <View style={{
                flexDirection: "row", alignItems: "center",
                backgroundColor: "#16161E", borderRadius: 16,
                borderWidth: 1.5, borderColor: "#2A2A3A",
                paddingHorizontal: 20, marginBottom: 16,
              }}>
                <Text style={{ fontSize: 18, marginRight: 12 }}>✉️</Text>
                <TextInput
                  testID="email-input"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(null); }}
                  placeholder="your@email.com"
                  placeholderTextColor="#3A3A4A"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1, color: "#FFFFFF", fontSize: 16,
                    paddingVertical: 20, fontWeight: "500",
                  }}
                  onFocus={() => { inputScale.value = withSpring(1.01); }}
                  onBlur={() => { inputScale.value = withSpring(1); }}
                />
              </View>
            </Animated.View>

            {error ? (
              <View style={{
                backgroundColor: "#2D1515", borderRadius: 12,
                padding: 14, marginBottom: 16,
                borderWidth: 1, borderColor: "#5D2020",
              }}>
                <Text style={{ color: "#FF6B6B", fontSize: 14, fontWeight: "500" }}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="continue-button"
              onPress={handleSendOTP}
              disabled={loading}
              style={{ borderRadius: 16, overflow: "hidden", marginTop: 8 }}
            >
              <LinearGradient
                colors={["#D4A843", "#E8890C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: 20, alignItems: "center",
                  shadowColor: "#D4A843", shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4, shadowRadius: 20,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" size="small" />
                ) : (
                  <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800", letterSpacing: 0.5 }}>
                    Continue →
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {/* Footer */}
          <Text style={{ color: "#2A2A3A", textAlign: "center", marginTop: 48, fontSize: 13, lineHeight: 20 }}>
            By continuing, you agree to our Terms of Service{"\n"}and Privacy Policy
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
