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
import { Mail, ArrowRight } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { height } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

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

      {/* Background decorative circles — mobile only; on wide web viewports they read as rendering bugs */}
      {Platform.OS !== "web" && (
        <>
          <View style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: "#D4A843", opacity: 0.05 }} />
          <View style={{ position: "absolute", bottom: 100, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: "#1A6B4A", opacity: 0.08 }} />
          <View style={{ position: "absolute", top: height * 0.3, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: "#D4A843", opacity: 0.04 }} />
        </>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" }}>
         <View style={{
           width: "100%",
           maxWidth: 440,
           ...(Platform.OS === "web" ? {
             backgroundColor: "rgba(22,22,30,0.55)",
             borderRadius: 24,
             borderWidth: 1,
             borderColor: "#1F1F2A",
             padding: 36,
           } : {}),
         }}>
          {/* Logo section */}
          <View style={{ alignItems: "center", marginBottom: isWeb ? 36 : 48 }}>
            <LinearGradient
              colors={["#E8C04E", "#D4A843", "#B8881C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: isWeb ? 64 : 80,
                height: isWeb ? 64 : 80,
                borderRadius: isWeb ? 20 : 24,
                alignItems: "center", justifyContent: "center",
                marginBottom: 16,
                shadowColor: "#D4A843", shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45, shadowRadius: 24,
              }}
            >
              {/* Alcurry mark: rooftop / mountain / "A" */}
              <Svg width={isWeb ? 34 : 42} height={isWeb ? 34 : 42} viewBox="0 0 64 64">
                <Path d="M14 49 L32 16 L50 49" fill="none" stroke="#0A0A0F" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M21 40 L43 40" stroke="#0A0A0F" strokeWidth={7} strokeLinecap="round" />
              </Svg>
            </LinearGradient>
            <Text style={{
              fontSize: isWeb ? 32 : 42, fontWeight: "900",
              color: "#FFFFFF", letterSpacing: -1,
            }}>
              Alcurry
            </Text>
            <Text style={{
              fontSize: isWeb ? 11 : 14, color: "#D4A843",
              letterSpacing: isWeb ? 3 : 4, marginTop: 4, fontWeight: "600",
            }}>
              AFRICA'S MARKETPLACE
            </Text>
            <View style={{ width: 48, height: 2, backgroundColor: "#D4A843", marginTop: 14, borderRadius: 1 }} />
          </View>

          {/* Form */}
          <View>
            <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "800", marginBottom: 8, textAlign: "center" }}>
              Welcome back
            </Text>
            <Text style={{ color: "#7A7A95", fontSize: 15, marginBottom: 28, lineHeight: 22, textAlign: "center" }}>
              Enter your email to sign in or create your account
            </Text>

            <Animated.View style={inputAnimStyle}>
              <View style={{
                flexDirection: "row", alignItems: "center",
                backgroundColor: "#16161E", borderRadius: 14,
                borderWidth: 1, borderColor: "#252535",
                paddingHorizontal: 16, marginBottom: 16,
              }}>
                <Mail size={18} color="#666680" strokeWidth={2} style={{ marginRight: 12 }} />
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: "#0A0A0F", fontSize: 16, fontWeight: "800", letterSpacing: 0.4 }}>
                      Continue
                    </Text>
                    <ArrowRight size={18} color="#0A0A0F" strokeWidth={2.5} />
                  </View>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {/* Footer */}
          <Text style={{ color: "#3A3A4A", textAlign: "center", marginTop: 36, fontSize: 13, lineHeight: 20 }}>
            By continuing, you agree to our Terms of Service{"\n"}and Privacy Policy
          </Text>
         </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
