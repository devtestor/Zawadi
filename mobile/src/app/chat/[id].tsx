import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Send, DollarSign, Video } from "lucide-react-native";
import { Alert } from "react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { formatPrice } from "@/lib/types";

interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  kind?: "text" | "offer" | "video-room";
  offerAmount?: number | null;
  offerCurrency?: string | null;
  offerStatus?: "pending" | "accepted" | "declined" | "countered" | null;
  videoRoom?: string | null;
}

interface ChatPayload {
  id: string;
  listing: { id: string; title: string; price: number; currency: string; images: { url: string }[] } | null;
  participants: { id: string; name: string; image?: string | null }[];
  messages: ChatMessage[];
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => api.get<ChatPayload>(`/api/messages/${id}`),
    refetchInterval: 5000,
  });

  const sendMessage = useMutation({
    mutationFn: (body: string) => api.post<ChatMessage>(`/api/messages/${id}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const sendOffer = useMutation({
    mutationFn: (vars: { amount: number; currency: string }) =>
      api.post(`/api/messages/${id}/offer`, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", id] }),
  });

  const resolveOffer = useMutation({
    mutationFn: (vars: { messageId: string; action: "accept" | "decline" | "counter"; amount?: number }) =>
      api.post(`/api/messages/offer/${vars.messageId}/resolve`, { action: vars.action, amount: vars.amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", id] }),
  });

  const startVideoRoom = useMutation({
    mutationFn: async () => {
      const { joinUrl, room } = await api.post<{ joinUrl: string; room: string }>(`/api/video/start`, {
        conversationId: id,
      });
      return { joinUrl, room };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", id] }),
    onError: (e: unknown) => Alert.alert("Video room", e instanceof Error ? e.message : "Could not start"),
  });

  useEffect(() => {
    if (!id || !session?.user) return;
    api.post(`/api/messages/${id}/read`, {}).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [id, session?.user, queryClient]);

  useEffect(() => {
    if (data?.messages?.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [data?.messages?.length]);

  const other = data?.participants.find((p) => p.id !== session?.user?.id);

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    sendMessage.mutate(body);
  };

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#D4A843" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="chat-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E1E2A" }}>
          <Pressable
            testID="chat-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          {other?.image ? (
            <Image source={{ uri: other.image }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#D4A843", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>{(other?.name || "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }} numberOfLines={1}>{other?.name || "Conversation"}</Text>
            {data.listing ? (
              <Text style={{ color: "#666680", fontSize: 12 }} numberOfLines={1}>
                Re: {data.listing.title}
              </Text>
            ) : null}
          </View>
        </View>

        {data.listing ? (
          <Pressable
            onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: data.listing!.id } })}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#12121A", padding: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: "#1E1E2A" }}
          >
            {data.listing.images[0] ? (
              <Image source={{ uri: data.listing.images[0].url }} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10 }} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{data.listing.title}</Text>
              <Text style={{ color: "#D4A843", fontSize: 13, fontWeight: "800", marginTop: 2 }}>
                {formatPrice(data.listing.price, data.listing.currency)}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          testID="chat-messages"
          data={data.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === session?.user?.id;
            if (item.kind === "offer") {
              return (
                <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                  <View
                    style={{
                      maxWidth: "86%",
                      backgroundColor: "#1E1E0A",
                      borderWidth: 1,
                      borderColor: "#D4A84366",
                      padding: 12,
                      borderRadius: 16,
                    }}
                  >
                    <Text style={{ color: "#D4A843", fontWeight: "900", fontSize: 12, marginBottom: 4 }}>OFFER</Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>
                      {item.offerCurrency} {item.offerAmount?.toLocaleString()}
                    </Text>
                    <Text style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                      Status: {item.offerStatus}
                    </Text>
                    {!mine && item.offerStatus === "pending" ? (
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <Pressable
                          testID={`offer-accept-${item.id}`}
                          onPress={() => resolveOffer.mutate({ messageId: item.id, action: "accept" })}
                          style={{ flex: 1, backgroundColor: "#1A6B4A", padding: 10, borderRadius: 10, alignItems: "center" }}
                        >
                          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>Accept</Text>
                        </Pressable>
                        <Pressable
                          testID={`offer-decline-${item.id}`}
                          onPress={() => resolveOffer.mutate({ messageId: item.id, action: "decline" })}
                          style={{ flex: 1, backgroundColor: "#2D1515", padding: 10, borderRadius: 10, alignItems: "center" }}
                        >
                          <Text style={{ color: "#FF6B6B", fontWeight: "800", fontSize: 12 }}>Decline</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            }
            if (item.kind === "video-room" && item.videoRoom) {
              return (
                <Pressable
                  testID={`open-video-${item.id}`}
                  onPress={() => {
                    if (data?.listing?.id) {
                      // Best effort: deep-link to the LiveKit join URL if it was included in the body.
                      const url = item.body;
                      if (url?.startsWith("http")) require("react-native").Linking.openURL(url);
                    }
                  }}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    backgroundColor: "#0A1F14", borderWidth: 1, borderColor: "#1A6B4A66",
                    padding: 12, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center",
                  }}
                >
                  <Video size={16} color="#1A6B4A" />
                  <View>
                    <Text style={{ color: "#1A6B4A", fontWeight: "900", fontSize: 12 }}>VIDEO ROOM</Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 13 }}>Tap to join</Text>
                  </View>
                </Pressable>
              );
            }
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                <View
                  style={{
                    maxWidth: "82%",
                    backgroundColor: mine ? "#D4A843" : "#16161E",
                    borderWidth: mine ? 0 : 1,
                    borderColor: "#2A2A3A",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 18,
                    borderBottomRightRadius: mine ? 4 : 18,
                    borderBottomLeftRadius: mine ? 18 : 4,
                  }}
                >
                  <Text style={{ color: mine ? "#0A0A0F" : "#FFFFFF", fontSize: 15, lineHeight: 20 }}>{item.body}</Text>
                </View>
                <Text style={{ color: "#3A3A4A", fontSize: 10, marginTop: 2, marginHorizontal: 4 }}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            );
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 6, borderTopWidth: 1, borderTopColor: "#1E1E2A", backgroundColor: "#0A0A0F" }}>
          <Pressable
            testID="chat-offer-button"
            onPress={() => {
              if (!data?.listing) {
                Alert.alert("Add a listing first", "Offers only work in listing-linked conversations.");
                return;
              }
              Alert.prompt?.(
                "Make an offer",
                `Enter amount in ${data.listing.currency}`,
                (val: string) => {
                  const num = parseFloat(val);
                  if (Number.isFinite(num) && num > 0) {
                    sendOffer.mutate({ amount: num, currency: data.listing!.currency });
                  }
                },
                "plain-text",
                "",
                "numeric",
              );
            }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#1E1E0A", borderWidth: 1, borderColor: "#D4A84366", alignItems: "center", justifyContent: "center" }}
          >
            <DollarSign size={16} color="#D4A843" strokeWidth={2.5} />
          </Pressable>
          <Pressable
            testID="chat-video-button"
            onPress={() => startVideoRoom.mutate()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#0A1F14", borderWidth: 1, borderColor: "#1A6B4A66", alignItems: "center", justifyContent: "center" }}
          >
            <Video size={16} color="#1A6B4A" strokeWidth={2.5} />
          </Pressable>
          <TextInput
            testID="chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message..."
            placeholderTextColor="#3A3A4A"
            multiline
            style={{
              flex: 1,
              backgroundColor: "#16161E",
              borderWidth: 1,
              borderColor: "#2A2A3A",
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              color: "#FFFFFF",
              fontSize: 15,
              maxHeight: 120,
            }}
          />
          <Pressable
            testID="chat-send"
            onPress={handleSend}
            disabled={!draft.trim() || sendMessage.isPending}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: draft.trim() ? "#D4A843" : "#1E1E2A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={18} color={draft.trim() ? "#0A0A0F" : "#666680"} strokeWidth={2.5} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
