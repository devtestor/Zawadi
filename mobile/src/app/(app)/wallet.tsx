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
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Lock, RefreshCw, FileDown } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Wallet, WalletTxn, formatMoney } from "@/lib/types";

interface Payload {
  wallet: Wallet;
  transactions: WalletTxn[];
}

export default function WalletScreen() {
  const queryClient = useQueryClient();
  const [topupAmount, setTopupAmount] = useState("");
  const [showTopup, setShowTopup] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<Payload>("/api/wallet"),
  });

  const topup = useMutation({
    mutationFn: () =>
      api.post<{ txRef: string; checkoutUrl: string }>(`/api/wallet/topup`, {
        amount: Math.round(parseFloat(topupAmount) * 100),
        currency: data?.wallet.currency ?? "USD",
      }),
    onSuccess: async (res) => {
      setShowTopup(false);
      setTopupAmount("");
      await WebBrowser.openBrowserAsync(res.checkoutUrl);
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: unknown) => {
      Alert.alert("Top-up failed", e instanceof Error ? e.message : "Try again");
    },
  });

  const withdraw = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>(`/api/wallet/withdraw`, {
        amount: Math.round(parseFloat(withdrawAmount) * 100),
        method: "mobile_money",
        phone: withdrawPhone.trim(),
      }),
    onSuccess: () => {
      setShowWithdraw(false);
      setWithdrawAmount("");
      setWithdrawPhone("");
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      Alert.alert("Withdrawal requested", "We'll send the funds to your mobile money number shortly.");
    },
    onError: (e: unknown) => {
      Alert.alert("Withdrawal failed", e instanceof Error ? e.message : "Try again");
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="wallet-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8, justifyContent: "space-between" }}>
          <Pressable
            testID="wallet-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Wallet</Text>
          <Pressable onPress={() => refetch()} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={18} color="#666680" />
          </Pressable>
        </View>
      </SafeAreaView>

      {isLoading || !data ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
          {/* Balance card */}
          <View style={{ backgroundColor: "#1E1E0A", borderRadius: 20, borderWidth: 1, borderColor: "#D4A84366", padding: 24 }}>
            <Text style={{ color: "#D4A843", fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>AVAILABLE BALANCE</Text>
            <Text style={{ color: "#FFFFFF", fontSize: 38, fontWeight: "900", marginTop: 6 }}>
              {formatMoney(data.wallet.balance, data.wallet.currency)}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              {data.wallet.pendingDebit > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Lock size={12} color="#888" />
                  <Text style={{ color: "#888", fontSize: 12 }}>
                    {formatMoney(data.wallet.pendingDebit, data.wallet.currency)} in escrow
                  </Text>
                </View>
              ) : null}
              {data.wallet.pendingCredit > 0 ? (
                <Text style={{ color: "#888", fontSize: 12 }}>
                  +{formatMoney(data.wallet.pendingCredit, data.wallet.currency)} pending
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable
                testID="wallet-topup"
                onPress={() => setShowTopup(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#D4A843", borderRadius: 12, paddingVertical: 12 }}
              >
                <ArrowDownCircle size={16} color="#0A0A0F" strokeWidth={2.5} />
                <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Top up</Text>
              </Pressable>
              <Pressable
                testID="wallet-withdraw"
                onPress={() => setShowWithdraw(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", borderRadius: 12, paddingVertical: 12 }}
              >
                <ArrowUpCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Withdraw</Text>
              </Pressable>
            </View>
          </View>

          {showWithdraw ? (
            <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>AMOUNT ({data.wallet.currency})</Text>
              <TextInput
                testID="withdraw-amount"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder="100.00"
                placeholderTextColor="#3A3A4A"
                keyboardType="numeric"
                style={{ backgroundColor: "#0A0A0F", borderRadius: 12, padding: 14, color: "#FFFFFF", fontSize: 18, borderWidth: 1, borderColor: "#2A2A3A" }}
              />
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 8 }}>
                MOBILE MONEY NUMBER (E.164)
              </Text>
              <TextInput
                testID="withdraw-phone"
                value={withdrawPhone}
                onChangeText={setWithdrawPhone}
                placeholder="+254712345678"
                placeholderTextColor="#3A3A4A"
                keyboardType="phone-pad"
                style={{ backgroundColor: "#0A0A0F", borderRadius: 12, padding: 14, color: "#FFFFFF", fontSize: 16, borderWidth: 1, borderColor: "#2A2A3A" }}
              />
              <Text style={{ color: "#666680", fontSize: 11, marginTop: 8 }}>
                KYC approval is required. Funds settle within 1 business day.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => setShowWithdraw(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#16161E", alignItems: "center" }}
                >
                  <Text style={{ color: "#888", fontWeight: "700" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="withdraw-confirm"
                  onPress={() => withdraw.mutate()}
                  disabled={withdraw.isPending || !withdrawAmount || !withdrawPhone}
                  style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#D4A843", alignItems: "center" }}
                >
                  <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>
                    {withdraw.isPending ? "Working…" : "Request withdrawal"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {showTopup ? (
            <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>AMOUNT ({data.wallet.currency})</Text>
              <TextInput
                testID="topup-amount"
                value={topupAmount}
                onChangeText={setTopupAmount}
                placeholder="100.00"
                placeholderTextColor="#3A3A4A"
                keyboardType="numeric"
                style={{ backgroundColor: "#0A0A0F", borderRadius: 12, padding: 14, color: "#FFFFFF", fontSize: 18, borderWidth: 1, borderColor: "#2A2A3A" }}
              />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => setShowTopup(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#16161E", alignItems: "center" }}
                >
                  <Text style={{ color: "#888", fontWeight: "700" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="topup-confirm"
                  onPress={() => topup.mutate()}
                  disabled={topup.isPending || !topupAmount}
                  style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#D4A843", alignItems: "center" }}
                >
                  <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>
                    {topup.isPending ? "Working…" : "Continue to payment"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Recent activity */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>Recent activity</Text>
              <Pressable
                testID="wallet-statement"
                onPress={async () => {
                  const { openBrowserAsync } = await import("expo-web-browser");
                  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/wallet/statement.csv`;
                  openBrowserAsync(url);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A" }}
              >
                <FileDown size={12} color="#D4A843" strokeWidth={2.5} />
                <Text style={{ color: "#D4A843", fontSize: 11, fontWeight: "800" }}>Statement</Text>
              </Pressable>
            </View>
            {data.transactions.length === 0 ? (
              <Text style={{ color: "#666680", fontSize: 14 }}>No transactions yet.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {data.transactions.map((t) => (
                  <View
                    key={t.id}
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#12121A", borderRadius: 12, borderWidth: 1, borderColor: "#1E1E2A", padding: 12, gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", textTransform: "capitalize" }}>
                        {t.kind.replace(/_/g, " ")}
                      </Text>
                      {t.description ? (
                        <Text style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{t.description}</Text>
                      ) : null}
                      <Text style={{ color: "#3A3A4A", fontSize: 10, marginTop: 2 }}>
                        {new Date(t.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: t.amount >= 0 ? "#1A6B4A" : "#FF6B6B",
                        fontSize: 15,
                        fontWeight: "900",
                      }}
                    >
                      {t.amount >= 0 ? "+" : ""}
                      {formatMoney(Math.abs(t.amount), t.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
