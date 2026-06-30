import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { authClient } from "@/lib/auth/auth-client";
import { useSession, useInvalidateSession } from "@/lib/auth/use-session";
import { User, Listing, formatPrice } from "@/lib/types";
import { LogOut, ChevronRight, MapPin, Bell, ShieldCheck, Briefcase, Gift, Wallet as WalletIcon, ScrollText, Star } from "lucide-react-native";
import { Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<User>("/api/me"),
    enabled: !!session?.user,
  });

  const toggleNotif = async (
    key: "notifyChat" | "notifyMarketing" | "notifySavedSearches",
    value: boolean,
  ) => {
    queryClient.setQueryData<User | undefined>(["profile"], (old) =>
      old ? { ...old, [key]: value } : old,
    );
    try {
      await api.put("/api/me/notifications", { [key]: value });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const { data: myListings = [], isLoading } = useQuery({
    queryKey: ["my-listings"],
    queryFn: () => api.get<Listing[]>("/api/me/my/listings"),
    enabled: !!session?.user,
  });

  const handleSignOut = async () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await authClient.signOut();
          await invalidateSession();
        },
      },
    ]);
  };

  const user = session?.user;
  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="profile-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900" }}>Profile</Text>
            <Pressable
              testID="sign-out-button"
              onPress={handleSignOut}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: "#16161E", borderRadius: 12, padding: 10,
                borderWidth: 1, borderColor: "#2A2A3A",
              }}
            >
              <LogOut size={16} color="#FF6B6B" strokeWidth={2.5} />
              <Text style={{ color: "#FF6B6B", fontSize: 13, fontWeight: "700" }}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
          <View style={{
            backgroundColor: "#12121A", borderRadius: 20, padding: 24,
            borderWidth: 1, borderColor: "#1E1E2A", alignItems: "center",
          }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: "#D4A843", alignItems: "center", justifyContent: "center",
              marginBottom: 16,
              shadowColor: "#D4A843", shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3, shadowRadius: 12,
            }}>
              <Text style={{ color: "#0A0A0F", fontSize: 32, fontWeight: "900" }}>{initials}</Text>
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
              {user?.name || "Your Name"}
            </Text>
            <Text style={{ color: "#666680", fontSize: 14, marginBottom: 20 }}>{user?.email}</Text>

            {/* Stats */}
            <View style={{ flexDirection: "row", width: "100%", justifyContent: "space-around" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#D4A843", fontSize: 24, fontWeight: "900" }}>
                  {profile?._count?.listings ?? myListings.length}
                </Text>
                <Text style={{ color: "#666680", fontSize: 12, fontWeight: "600" }}>Listings</Text>
              </View>
              <View style={{ width: 1, backgroundColor: "#2A2A3A" }} />
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#D4A843", fontSize: 24, fontWeight: "900" }}>
                  {profile?._count?.favorites ?? 0}
                </Text>
                <Text style={{ color: "#666680", fontSize: 12, fontWeight: "600" }}>Saved</Text>
              </View>
              <View style={{ width: 1, backgroundColor: "#2A2A3A" }} />
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#D4A843", fontSize: 24, fontWeight: "900" }}>
                  {myListings.filter((l) => l.status === "sold").length}
                </Text>
                <Text style={{ color: "#666680", fontSize: 12, fontWeight: "600" }}>Sold</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Settings */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>Notifications</Text>
          <View style={{ backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A" }}>
            <SettingRow
              icon={<Bell size={16} color="#D4A843" />}
              label="Chat messages"
              value={profile?.notifyChat ?? true}
              onChange={(v) => toggleNotif("notifyChat", v)}
            />
            <Divider />
            <SettingRow
              icon={<Bell size={16} color="#D4A843" />}
              label="Saved-search alerts"
              value={profile?.notifySavedSearches ?? true}
              onChange={(v) => toggleNotif("notifySavedSearches", v)}
            />
            <Divider />
            <SettingRow
              icon={<Bell size={16} color="#D4A843" />}
              label="Marketing & tips"
              value={profile?.notifyMarketing ?? false}
              onChange={(v) => toggleNotif("notifyMarketing", v)}
            />
          </View>

          <Pressable
            testID="wallet-link"
            onPress={() => router.push("/(app)/wallet" as any)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
              padding: 16, marginTop: 16, gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <WalletIcon size={18} color="#D4A843" />
              <View>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Wallet</Text>
                <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Balance, escrow & transactions</Text>
              </View>
            </View>
            <ChevronRight size={16} color="#666680" />
          </Pressable>

          <Pressable
            testID="trades-link"
            onPress={() => router.push("/(app)/trades" as any)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
              padding: 16, marginTop: 12, gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ScrollText size={18} color="#D4A843" />
              <View>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Trades</Text>
                <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                  {profile?.tradeCount ?? 0} completed
                  {profile && profile.ratingCount ? ` · ★ ${((profile.ratingSum ?? 0) / Math.max(1, profile.ratingCount)).toFixed(1)} (${profile.ratingCount})` : ""}
                </Text>
              </View>
            </View>
            <ChevronRight size={16} color="#666680" />
          </Pressable>

          <Pressable
            testID="kyc-link"
            onPress={() => router.push("/(app)/kyc" as any)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
              padding: 16, marginTop: 12, gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ShieldCheck size={18} color="#D4A843" />
              <View>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Identity verification</Text>
                <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                  {profile?.verifiedAt ? "Verified" : "Required for high-value trades"}
                </Text>
              </View>
            </View>
            <ChevronRight size={16} color="#666680" />
          </Pressable>

          <Pressable
            testID="saved-searches-link"
            onPress={() => router.push("/(app)/saved-searches" as any)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
              padding: 16, marginTop: 16, gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Bell size={18} color="#D4A843" />
              <View>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Saved searches</Text>
                <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Manage your alert filters</Text>
              </View>
            </View>
            <ChevronRight size={16} color="#666680" />
          </Pressable>

          {profile?.referralCode ? (
            <Pressable
              testID="referral-share"
              onPress={() =>
                Share.share({
                  message: `Use my Alcurry code ${profile.referralCode} when you sign up — we both unlock a free boost.`,
                })
              }
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
                padding: 16, marginTop: 16, gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Gift size={18} color="#D4A843" />
                <View>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Your invite code</Text>
                  <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "900", marginTop: 2, letterSpacing: 2 }}>
                    {profile.referralCode}
                  </Text>
                </View>
              </View>
              <Text style={{ color: "#D4A843", fontWeight: "800" }}>Share</Text>
            </Pressable>
          ) : null}

          {profile && profile.role !== "business" && profile.role !== "admin" ? (
            <Pressable
              testID="business-apply-link"
              onPress={() => router.push("/(app)/business-apply" as any)}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
                padding: 16, marginTop: 16, gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Briefcase size={18} color="#D4A843" />
                <View>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Become a business seller</Text>
                  <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Higher listing limits + verified badge</Text>
                </View>
              </View>
              <ChevronRight size={16} color="#666680" />
            </Pressable>
          ) : null}

          {profile && !profile.phoneVerified ? (
            <Pressable
              testID="verify-phone-link"
              onPress={() => router.push("/(app)/verify-phone" as any)}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2A",
                padding: 16, marginTop: 16, gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ShieldCheck size={18} color="#D4A843" />
                <View>
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Verify your phone</Text>
                  <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Builds trust with buyers</Text>
                </View>
              </View>
              <ChevronRight size={16} color="#666680" />
            </Pressable>
          ) : null}
        </View>

        {/* My Listings */}
        <View style={{ paddingHorizontal: 20, marginBottom: 120 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>My Listings</Text>
            <Pressable testID="add-listing-button" onPress={() => router.push("/(app)/post")}>
              <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "700" }}>+ Add new</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator testID="my-listings-loading" color="#D4A843" style={{ marginTop: 20 }} />
          ) : myListings.length === 0 ? (
            <View style={{
              backgroundColor: "#12121A", borderRadius: 20, padding: 32,
              alignItems: "center", borderWidth: 1, borderColor: "#1E1E2A",
            }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>No listings yet</Text>
              <Text style={{ color: "#666680", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                Start selling by posting your first listing
              </Text>
              <Pressable
                testID="post-now-button"
                onPress={() => router.push("/(app)/post")}
                style={{
                  marginTop: 20, backgroundColor: "#D4A843",
                  paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
                }}
              >
                <Text style={{ color: "#0A0A0F", fontWeight: "800", fontSize: 14 }}>Post Now</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {myListings.map((listing) => (
                <Pressable
                  key={listing.id}
                  testID={`my-listing-${listing.id}`}
                  onPress={() => router.push({ pathname: "/listing/[id]" as any, params: { id: listing.id } })}
                  style={{
                    flexDirection: "row", backgroundColor: "#12121A",
                    borderRadius: 16, padding: 16, alignItems: "center",
                    borderWidth: 1, borderColor: "#1E1E2A",
                  }}
                >
                  <View style={{
                    width: 48, height: 48, borderRadius: 12,
                    backgroundColor: "#1E1E2A", alignItems: "center", justifyContent: "center",
                    marginRight: 14,
                  }}>
                    <Text style={{ fontSize: 24 }}>
                      {listing.category === "property" ? "🏠" : listing.category === "land" ? "🗺️" : listing.category === "car" ? "🚗" : "⛏️"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }} numberOfLines={1}>{listing.title}</Text>
                    <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "800", marginTop: 2 }}>
                      {formatPrice(listing.price, listing.currency)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                      <MapPin size={10} color="#666680" />
                      <Text style={{ color: "#666680", fontSize: 11 }}>{listing.country}</Text>
                      <View style={{
                        backgroundColor: listing.status === "active" ? "#0A1F14" : listing.status === "sold" ? "#2D1515" : "#1A1A2A",
                        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8,
                      }}>
                        <Text style={{
                          color: listing.status === "active" ? "#1A6B4A" : listing.status === "sold" ? "#FF6B6B" : "#888",
                          fontSize: 10, fontWeight: "700", textTransform: "uppercase",
                        }}>
                          {listing.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={16} color="#3A3A4A" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
      {icon}
      <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600", flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#2A2A3A", true: "#D4A843" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: "#1E1E2A", marginLeft: 16 }} />;
}
