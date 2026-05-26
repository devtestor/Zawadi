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
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, FileSignature, Lock, Truck, ShieldCheck, AlertTriangle, ExternalLink, Anchor } from "lucide-react-native";
import { Linking } from "react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { Trade, formatMoney } from "@/lib/types";
import { useChainConfig, explorerTx } from "@/lib/chain";

export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [contractTerms, setContractTerms] = useState("");
  const [showContractEditor, setShowContractEditor] = useState(false);

  const { data: trade, isLoading } = useQuery({
    queryKey: ["trade", id],
    queryFn: () => api.get<Trade>(`/api/trades/${id}`),
  });
  const { data: chainCfg } = useChainConfig();

  const action = useMutation({
    mutationFn: (act: "fund" | "deliver" | "confirm" | "cancel" | "refund" | "dispute") =>
      api.post(`/api/trades/${id}/action`, { action: act }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trade", id] });
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: unknown) => Alert.alert("Action failed", e instanceof Error ? e.message : "Try again"),
  });

  const draftContract = useMutation({
    mutationFn: () => api.post("/api/contracts", { tradeId: id, terms: contractTerms.trim() }),
    onSuccess: () => {
      setShowContractEditor(false);
      setContractTerms("");
      queryClient.invalidateQueries({ queryKey: ["trade", id] });
    },
    onError: (e: unknown) => Alert.alert("Contract failed", e instanceof Error ? e.message : "Try again"),
  });

  const sign = useMutation({
    mutationFn: () => api.post(`/api/contracts/${trade?.contractId}/sign`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trade", id] }),
    onError: (e: unknown) => Alert.alert("Sign failed", e instanceof Error ? e.message : "Try again"),
  });

  if (isLoading || !trade) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#D4A843" />
      </View>
    );
  }

  const meBuyer = trade.buyerId === session?.user?.id;
  const counterparty = meBuyer ? trade.seller : trade.buyer;

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="trade-detail-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="trade-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Trade</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
        <Pressable
          onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: trade.listingId } })}
          style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}
        >
          <Text style={{ color: "#666680", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>LISTING</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 4 }}>{trade.listing?.title}</Text>
          <Text style={{ color: "#D4A843", fontSize: 22, fontWeight: "900", marginTop: 8 }}>
            {formatMoney(trade.amount, trade.currency)}
          </Text>
          {trade.feeAmount > 0 ? (
            <Text style={{ color: "#666680", fontSize: 11, marginTop: 4 }}>
              Platform fee {formatMoney(trade.feeAmount, trade.currency)} on completion
            </Text>
          ) : null}
        </Pressable>

        <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800", marginBottom: 8 }}>Counterparty</Text>
          <Text style={{ color: "#888", fontSize: 13 }}>
            {meBuyer ? "Seller: " : "Buyer: "}{counterparty?.name ?? "—"}
          </Text>
          <Text style={{ color: "#666680", fontSize: 12, marginTop: 4 }}>
            You are the {meBuyer ? "buyer" : "seller"} · Status: {trade.status.replace(/_/g, " ")}
          </Text>
        </View>

        {/* Contract */}
        <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <FileSignature size={16} color="#D4A843" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>Contract</Text>
          </View>
          {trade.contract ? (
            <>
              <Text style={{ color: "#888", fontSize: 13, lineHeight: 18 }}>{trade.contract.terms}</Text>
              <Text style={{ color: "#666680", fontSize: 12, marginTop: 10 }}>
                Buyer signed: {trade.contract.buyerSignedAt ? new Date(trade.contract.buyerSignedAt).toLocaleString() : "—"}
              </Text>
              <Text style={{ color: "#666680", fontSize: 12 }}>
                Seller signed: {trade.contract.sellerSignedAt ? new Date(trade.contract.sellerSignedAt).toLocaleString() : "—"}
              </Text>
              {trade.contract.chainTxHash ? (
                <Text style={{ color: "#1A6B4A", fontSize: 12, marginTop: 6 }}>
                  Anchored on {trade.contract.chain}: {trade.contract.chainTxHash.slice(0, 12)}…
                </Text>
              ) : null}
              {(meBuyer && !trade.contract.buyerSignedAt) || (!meBuyer && !trade.contract.sellerSignedAt) ? (
                <Pressable
                  testID="trade-sign-contract"
                  onPress={() => sign.mutate()}
                  disabled={sign.isPending}
                  style={{ marginTop: 12, backgroundColor: "#D4A843", borderRadius: 12, padding: 12, alignItems: "center" }}
                >
                  <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Sign contract</Text>
                </Pressable>
              ) : null}
            </>
          ) : trade.status === "initiated" && !showContractEditor ? (
            <Pressable onPress={() => setShowContractEditor(true)}>
              <Text style={{ color: "#D4A843", fontWeight: "700" }}>+ Draft a contract</Text>
            </Pressable>
          ) : null}
          {showContractEditor ? (
            <>
              <TextInput
                testID="contract-terms"
                value={contractTerms}
                onChangeText={setContractTerms}
                placeholder="Spell out the terms — what's being sold, when delivery happens, refund window, etc."
                placeholderTextColor="#3A3A4A"
                multiline
                style={{ minHeight: 120, backgroundColor: "#0A0A0F", borderRadius: 12, padding: 12, color: "#FFFFFF", borderWidth: 1, borderColor: "#2A2A3A", textAlignVertical: "top" }}
              />
              <Pressable
                testID="contract-save"
                onPress={() => draftContract.mutate()}
                disabled={contractTerms.trim().length < 20 || draftContract.isPending}
                style={{ marginTop: 10, backgroundColor: contractTerms.trim().length >= 20 ? "#D4A843" : "#3A3A4A", borderRadius: 12, padding: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Save draft</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Actions */}
        <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16, gap: 10 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>Actions</Text>
          {meBuyer && trade.status === "initiated" ? (
            <ActionButton
              testID="trade-fund"
              icon={<Lock size={16} color="#0A0A0F" />}
              label="Fund escrow"
              tone="primary"
              onPress={() => action.mutate("fund")}
              busy={action.isPending}
            />
          ) : null}
          {!meBuyer && trade.status === "in_escrow" ? (
            <ActionButton
              testID="trade-deliver"
              icon={<Truck size={16} color="#0A0A0F" />}
              label="Mark delivered"
              tone="primary"
              onPress={() => action.mutate("deliver")}
              busy={action.isPending}
            />
          ) : null}
          {meBuyer && trade.status === "delivered" ? (
            <ActionButton
              testID="trade-confirm"
              icon={<ShieldCheck size={16} color="#0A0A0F" />}
              label="Confirm receipt & release escrow"
              tone="primary"
              onPress={() => action.mutate("confirm")}
              busy={action.isPending}
            />
          ) : null}
          {(trade.status === "in_escrow" || trade.status === "delivered") ? (
            <ActionButton
              testID="trade-dispute"
              icon={<AlertTriangle size={16} color="#FF6B6B" />}
              label="Open dispute"
              tone="danger"
              onPress={() =>
                Alert.alert("Open dispute?", "An admin will review the trade. Funds remain frozen.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Open dispute", style: "destructive", onPress: () => action.mutate("dispute") },
                ])
              }
              busy={action.isPending}
            />
          ) : null}
          {trade.status === "initiated" ? (
            <ActionButton
              testID="trade-cancel"
              icon={<AlertTriangle size={16} color="#888" />}
              label="Cancel trade"
              tone="ghost"
              onPress={() => action.mutate("cancel")}
              busy={action.isPending}
            />
          ) : null}
          {!meBuyer && (trade.status === "in_escrow" || trade.status === "delivered") ? (
            <ActionButton
              testID="trade-refund"
              icon={<AlertTriangle size={16} color="#888" />}
              label="Refund buyer"
              tone="ghost"
              onPress={() => action.mutate("refund")}
              busy={action.isPending}
            />
          ) : null}
        </View>

        {/* On-chain badge */}
        {chainCfg?.enabled ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0A1F14", borderWidth: 1, borderColor: "#1A6B4A66", borderRadius: 12, padding: 12 }}>
            <Anchor size={14} color="#1A6B4A" />
            <Text style={{ color: "#1A6B4A", fontSize: 12, fontWeight: "800" }}>
              Anchored on {chainCfg.name}
            </Text>
          </View>
        ) : null}

        {/* Timeline */}
        <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A", padding: 16 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800", marginBottom: 12 }}>Timeline</Text>
          {(trade.events ?? []).map((e) => {
            const explorer = explorerTx(chainCfg?.explorer, e.chainTxHash);
            return (
              <View key={e.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.chainTxHash ? "#1A6B4A" : "#D4A843", marginTop: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", textTransform: "capitalize" }}>
                    {e.kind.replace(/_/g, " ")}
                  </Text>
                  <Text style={{ color: "#666680", fontSize: 11 }}>{new Date(e.createdAt).toLocaleString()}</Text>
                  {explorer ? (
                    <Pressable
                      testID={`event-explorer-${e.id}`}
                      onPress={() => Linking.openURL(explorer)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}
                    >
                      <ExternalLink size={11} color="#1A6B4A" />
                      <Text style={{ color: "#1A6B4A", fontSize: 11, fontWeight: "700" }}>View on chain</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  tone,
  onPress,
  busy,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  tone: "primary" | "ghost" | "danger";
  onPress: () => void;
  busy: boolean;
  testID: string;
}) {
  const bg = tone === "primary" ? "#D4A843" : tone === "danger" ? "#2D1515" : "#16161E";
  const fg = tone === "primary" ? "#0A0A0F" : tone === "danger" ? "#FF6B6B" : "#FFFFFF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={busy}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: bg, borderRadius: 12, padding: 14, borderWidth: tone === "ghost" ? 1 : 0, borderColor: "#2A2A3A" }}
    >
      {icon}
      <Text style={{ color: fg, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}
