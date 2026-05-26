import React from "react";
import { View, Text, ActivityIndicator, StatusBar, Pressable, Image, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, MessageCircle } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { formatDistanceToNow } from "date-fns";

interface ConversationSummary {
  id: string;
  listing: { id: string; title: string; images: { url: string }[] } | null;
  other: { id: string; name: string; image?: string | null } | null;
  lastMessage: { id: string; body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: boolean;
}

export default function MessagesScreen() {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<ConversationSummary[]>("/api/messages"),
    refetchInterval: 15000,
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="messages-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            testID="messages-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2A2A3A" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginLeft: 12 }}>Messages</Text>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ActivityIndicator testID="messages-loading" color="#D4A843" size="large" style={{ marginTop: 60 }} />
      ) : conversations.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#16161E", alignItems: "center", justifyContent: "center", marginBottom: 24, borderWidth: 1, borderColor: "#2A2A3A" }}>
            <MessageCircle size={36} color="#D4A843" strokeWidth={2} />
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>No messages yet</Text>
          <Text style={{ color: "#666680", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
            Tap "Message seller" on any listing to start a conversation
          </Text>
        </View>
      ) : (
        <FlatList
          testID="conversations-list"
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }) => <ConversationRow item={item} />}
        />
      )}
    </View>
  );
}

function ConversationRow({ item }: { item: ConversationSummary }) {
  const initials = (item.other?.name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const subtitle = item.lastMessage?.body ?? (item.listing ? `About: ${item.listing.title}` : "Start the conversation");
  const ts = formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: false });

  return (
    <Pressable
      testID={`conversation-${item.id}`}
      onPress={() => router.push({ pathname: "/chat/[id]" as any, params: { id: item.id } })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#12121A",
        borderRadius: 16,
        padding: 14,
        marginTop: 10,
        borderWidth: 1,
        borderColor: item.unread ? "#D4A84366" : "#1E1E2A",
      }}
    >
      {item.other?.image ? (
        <Image source={{ uri: item.other.image }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#D4A843", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Text style={{ color: "#0A0A0F", fontWeight: "900", fontSize: 16 }}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
            {item.other?.name || "Unknown"}
          </Text>
          <Text style={{ color: "#666680", fontSize: 11 }}>{ts}</Text>
        </View>
        <Text style={{ color: item.unread ? "#D4A843" : "#888", fontSize: 13, marginTop: 4 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {item.unread ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#D4A843", marginLeft: 8 }} />
      ) : null}
    </Pressable>
  );
}
