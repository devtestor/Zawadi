import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { Listing, AFRICAN_COUNTRIES } from "@/lib/types";
import { pickImages, uploadMany } from "@/lib/upload";

const MAX_IMAGES = 5;

const STATUSES: { key: "active" | "pending" | "sold"; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#1A6B4A" },
  { key: "pending", label: "Pending", color: "#888888" },
  { key: "sold", label: "Sold", color: "#FF6B6B" },
];

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.get<Listing>(`/api/listings/${id}`),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"active" | "pending" | "sold">("active");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");

  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title);
    setDescription(listing.description);
    setPrice(String(listing.price));
    setCurrency(listing.currency);
    setCountry(listing.country);
    setCity(listing.city ?? "");
    setAddress(listing.address ?? "");
    setStatus(listing.status);
    setImages(listing.images?.map((i) => i.url) ?? []);
  }, [listing]);

  const handleAddImage = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;
    try {
      const picked = await pickImages(remaining);
      if (picked.length === 0) return;
      setUploading(true);
      const results = await uploadMany(picked);
      setImages((prev) => [...prev, ...results.map((r) => r.url)].slice(0, MAX_IMAGES));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      Alert.alert("Upload failed", msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !price || !country) {
      Alert.alert("Missing fields", "Title, price, and country are required");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/listings/${id}`, {
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        currency,
        country,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        status,
        images,
      });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save changes";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredCountries = countryQuery
    ? AFRICAN_COUNTRIES.filter((c) => c.toLowerCase().includes(countryQuery.toLowerCase()))
    : AFRICAN_COUNTRIES;

  if (isLoading || !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#D4A843" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="edit-listing-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, justifyContent: "space-between" }}>
          <Pressable
            testID="edit-close"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2A2A3A" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>Edit Listing</Text>
          <View style={{ width: 42 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 140 }}>
          <Field label="Title *" value={title} onChange={setTitle} />
          <Field label="Description *" value={description} onChange={setDescription} multiline />

          <View style={{ marginBottom: 16 }}>
            <FieldLabel text="Price & Currency *" />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TextInput
                testID="edit-price"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholderTextColor="#3A3A4A"
                style={inputStyle}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ maxWidth: 200, flexGrow: 0 }}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {["USD", "ZAR", "NGN", "KES", "GHS", "EGP", "RWF"].map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCurrency(c)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: currency === c ? "#D4A843" : "#16161E",
                      borderWidth: 1,
                      borderColor: currency === c ? "#D4A843" : "#2A2A3A",
                    }}
                  >
                    <Text style={{ color: currency === c ? "#0A0A0F" : "#888", fontSize: 14, fontWeight: "700" }}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Status */}
          <View style={{ marginBottom: 16 }}>
            <FieldLabel text="Status" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {STATUSES.map((s) => {
                const active = status === s.key;
                return (
                  <Pressable
                    key={s.key}
                    testID={`edit-status-${s.key}`}
                    onPress={() => setStatus(s.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: active ? s.color : "#16161E",
                      borderWidth: 1,
                      borderColor: active ? s.color : "#2A2A3A",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: active ? "#FFFFFF" : "#888", fontWeight: "800", fontSize: 14 }}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Country */}
          <View style={{ marginBottom: 16 }}>
            <FieldLabel text="Country *" />
            <Pressable
              onPress={() => setShowCountryPicker(!showCountryPicker)}
              style={{
                backgroundColor: "#16161E",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: country ? "#D4A843" : "#2A2A3A",
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: country ? "#D4A843" : "#3A3A4A", fontSize: 15, fontWeight: country ? "700" : "400" }}>
                {country || "Select country..."}
              </Text>
              <Text style={{ color: "#666680" }}>{showCountryPicker ? "▲" : "▼"}</Text>
            </Pressable>
            {showCountryPicker ? (
              <View style={{ backgroundColor: "#16161E", borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: "#2A2A3A", overflow: "hidden" }}>
                <TextInput
                  value={countryQuery}
                  onChangeText={setCountryQuery}
                  placeholder="Search countries..."
                  placeholderTextColor="#3A3A4A"
                  style={{ color: "#FFFFFF", fontSize: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: "#2A2A3A" }}
                  autoCapitalize="none"
                />
                <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                  {filteredCountries.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => {
                        setCountry(c);
                        setShowCountryPicker(false);
                        setCountryQuery("");
                      }}
                      style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#1A1A2A", backgroundColor: country === c ? "#1E1E2A" : "transparent" }}
                    >
                      <Text style={{ color: country === c ? "#D4A843" : "#888", fontSize: 14, fontWeight: country === c ? "700" : "400" }}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <Field label="City" value={city} onChange={setCity} />
          <Field label="Address" value={address} onChange={setAddress} />

          {/* Images */}
          <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
          <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "700", marginBottom: 12 }}>
            📸 Photos ({images.length}/{MAX_IMAGES})
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {images.map((url, idx) => (
              <View key={url} style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                <Pressable
                  testID={`edit-remove-image-${idx}`}
                  onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={12} color="#FFFFFF" strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <Pressable
                testID="edit-add-image"
                onPress={handleAddImage}
                disabled={uploading}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  backgroundColor: "#16161E",
                  borderWidth: 2,
                  borderColor: "#2A2A3A",
                  borderStyle: "dashed",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {uploading ? <ActivityIndicator color="#D4A843" /> : <Plus size={24} color="#666680" />}
              </Pressable>
            ) : null}
          </View>

          <Pressable testID="edit-save-button" onPress={handleSave} disabled={saving} style={{ marginTop: 32, borderRadius: 16, overflow: "hidden" }}>
            <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 18, alignItems: "center" }}>
              {saving ? <ActivityIndicator color="#0A0A0F" /> : <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800" }}>Save changes</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const inputStyle = {
  flex: 1,
  backgroundColor: "#16161E",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#2A2A3A",
  color: "#FFFFFF",
  fontSize: 15,
  paddingHorizontal: 16,
  paddingVertical: 14,
} as const;

function FieldLabel({ text }: { text: string }) {
  return (
    <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
      {text}
    </Text>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel text={label} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor="#3A3A4A"
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        style={{
          ...inputStyle,
          textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 100 : undefined,
        }}
      />
    </View>
  );
}
