import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { AFRICAN_COUNTRIES } from "@/lib/types";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

type PostCategory = "property" | "land" | "car" | "mining";

const CATEGORIES: { key: PostCategory; icon: string; label: string; desc: string }[] = [
  { key: "property", icon: "🏠", label: "Property", desc: "Houses, apartments, villas" },
  { key: "land", icon: "🗺️", label: "Land", desc: "Plots, farms, estates" },
  { key: "car", icon: "🚗", label: "Vehicle", desc: "Cars, trucks, motorcycles" },
  { key: "mining", icon: "⛏️", label: "Mining Site", desc: "Gold, diamonds, minerals" },
];

function InputField({ label, value, onChange, placeholder, keyboardType = "default", multiline = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#3A3A4A"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        style={{
          backgroundColor: "#16161E", borderRadius: 12,
          borderWidth: 1, borderColor: "#2A2A3A",
          color: "#FFFFFF", fontSize: 15, paddingHorizontal: 16,
          paddingVertical: 14, textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 100 : undefined,
        }}
      />
    </View>
  );
}

export default function PostScreen() {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<PostCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [area, setArea] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [carMileage, setCarMileage] = useState("");
  const [carCondition] = useState("used");
  const [carFuel] = useState("petrol");
  const [mineralType, setMineralType] = useState("");
  const [miningArea, setMiningArea] = useState("");
  const [miningLicense, setMiningLicense] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const handleSubmit = async () => {
    if (!title || !price || !country || !category) {
      Alert.alert("Missing fields", "Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title, description, price: parseFloat(price), currency, category,
        country, city, address,
      };
      if (category === "property" || category === "land") {
        if (area) body.area = parseFloat(area);
        if (bedrooms) body.bedrooms = parseInt(bedrooms);
        if (bathrooms) body.bathrooms = parseInt(bathrooms);
        if (propertyType) body.propertyType = propertyType;
      }
      if (category === "car") {
        body.carMake = carMake; body.carModel = carModel;
        if (carYear) body.carYear = parseInt(carYear);
        if (carMileage) body.carMileage = parseInt(carMileage);
        body.carCondition = carCondition; body.carFuel = carFuel;
      }
      if (category === "mining") {
        body.mineralType = mineralType;
        if (miningArea) body.miningArea = parseFloat(miningArea);
        body.miningLicense = miningLicense;
      }
      await api.post("/api/listings", body);
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      Alert.alert("Posted!", "Your listing is now live on ZAWADI", [
        { text: "View Home", onPress: () => router.push("/(app)") },
      ]);
      setStep(1); setCategory(null); setTitle(""); setDescription(""); setPrice(""); setCountry(""); setCity("");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to post listing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="post-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900", marginBottom: 4 }}>
            Post a Listing
          </Text>
          <Text style={{ color: "#666680", fontSize: 14 }}>
            Step {step} of 2
          </Text>
          <View style={{ height: 3, backgroundColor: "#1E1E2A", borderRadius: 2, marginTop: 12 }}>
            <View style={{ height: 3, backgroundColor: "#D4A843", borderRadius: 2, width: step === 1 ? "50%" : "100%" }} />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 120 }}>
          {step === 1 ? (
            <>
              <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 4 }}>
                What are you selling?
              </Text>
              <Text style={{ color: "#666680", fontSize: 14, marginBottom: 24 }}>
                Choose a category for your listing
              </Text>
              <View style={{ gap: 12 }}>
                {CATEGORIES.map((cat) => {
                  const selected = category === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      testID={`category-option-${cat.key}`}
                      onPress={() => setCategory(cat.key)}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        backgroundColor: selected ? "#1E1E0A" : "#12121A",
                        borderRadius: 16, padding: 20,
                        borderWidth: 2, borderColor: selected ? "#D4A843" : "#1E1E2A",
                      }}
                    >
                      <View style={{
                        width: 52, height: 52, borderRadius: 16,
                        backgroundColor: selected ? "#2A2A0A" : "#1E1E2A",
                        alignItems: "center", justifyContent: "center", marginRight: 16,
                      }}>
                        <Text style={{ fontSize: 26 }}>{cat.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: selected ? "#D4A843" : "#FFFFFF", fontSize: 17, fontWeight: "800" }}>
                          {cat.label}
                        </Text>
                        <Text style={{ color: "#666680", fontSize: 13, marginTop: 2 }}>{cat.desc}</Text>
                      </View>
                      {selected ? <Text style={{ color: "#D4A843", fontSize: 20 }}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                testID="continue-to-step2"
                onPress={() => { if (category) setStep(2); else Alert.alert("Select a category first"); }}
                style={{ marginTop: 32, borderRadius: 16, overflow: "hidden" }}
              >
                <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 18, alignItems: "center" }}>
                  <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800" }}>Continue →</Text>
                </LinearGradient>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable testID="back-to-step1" onPress={() => setStep(1)} style={{ marginBottom: 24 }}>
                <Text style={{ color: "#D4A843", fontSize: 15, fontWeight: "700" }}>← Change category</Text>
              </Pressable>

              <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 4 }}>
                Listing details
              </Text>
              <Text style={{ color: "#666680", fontSize: 14, marginBottom: 24 }}>
                Fill in the details to attract buyers
              </Text>

              <InputField label="Title *" value={title} onChange={setTitle} placeholder="e.g. 3 Bedroom House in Nairobi" />
              <InputField label="Description *" value={description} onChange={setDescription} placeholder="Describe your listing in detail..." multiline />

              {/* Price & Currency */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Price & Currency *
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TextInput
                    testID="price-input"
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0.00"
                    placeholderTextColor="#3A3A4A"
                    keyboardType="numeric"
                    style={{
                      flex: 1, backgroundColor: "#16161E", borderRadius: 12,
                      borderWidth: 1, borderColor: "#2A2A3A",
                      color: "#FFFFFF", fontSize: 15, paddingHorizontal: 16, paddingVertical: 14,
                    }}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ maxWidth: 200, flexGrow: 0 }}
                    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  >
                    {["USD", "ZAR", "NGN", "KES", "GHS", "EGP"].map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setCurrency(c)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
                          backgroundColor: currency === c ? "#D4A843" : "#16161E",
                          borderWidth: 1, borderColor: currency === c ? "#D4A843" : "#2A2A3A",
                        }}
                      >
                        <Text style={{ color: currency === c ? "#0A0A0F" : "#888", fontSize: 14, fontWeight: "700" }}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Country picker */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Country *
                </Text>
                <Pressable
                  testID="country-picker"
                  onPress={() => setShowCountryPicker(!showCountryPicker)}
                  style={{
                    backgroundColor: "#16161E", borderRadius: 12,
                    borderWidth: 1, borderColor: country ? "#D4A843" : "#2A2A3A",
                    paddingHorizontal: 16, paddingVertical: 14,
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <Text style={{ color: country ? "#D4A843" : "#3A3A4A", fontSize: 15, fontWeight: country ? "700" : "400" }}>
                    {country || "Select country..."}
                  </Text>
                  <Text style={{ color: "#666680" }}>{showCountryPicker ? "▲" : "▼"}</Text>
                </Pressable>
                {showCountryPicker ? (
                  <View style={{
                    backgroundColor: "#16161E", borderRadius: 12, marginTop: 4,
                    borderWidth: 1, borderColor: "#2A2A3A", maxHeight: 200, overflow: "hidden",
                  }}>
                    <ScrollView nestedScrollEnabled>
                      {AFRICAN_COUNTRIES.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => { setCountry(c); setShowCountryPicker(false); }}
                          style={{
                            padding: 14, borderBottomWidth: 1, borderBottomColor: "#1A1A2A",
                            backgroundColor: country === c ? "#1E1E2A" : "transparent",
                          }}
                        >
                          <Text style={{ color: country === c ? "#D4A843" : "#888", fontSize: 14, fontWeight: country === c ? "700" : "400" }}>
                            {c}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              <InputField label="City" value={city} onChange={setCity} placeholder="e.g. Lagos" />
              <InputField label="Address" value={address} onChange={setAddress} placeholder="Full address or area" />

              {(category === "property" || category === "land") ? (
                <>
                  <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
                  <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "700", marginBottom: 16 }}>
                    {category === "property" ? "🏠 Property Details" : "🗺️ Land Details"}
                  </Text>
                  <InputField label="Area (m²)" value={area} onChange={setArea} placeholder="e.g. 150" keyboardType="numeric" />
                  {category === "property" ? (
                    <>
                      <InputField label="Bedrooms" value={bedrooms} onChange={setBedrooms} placeholder="e.g. 3" keyboardType="numeric" />
                      <InputField label="Bathrooms" value={bathrooms} onChange={setBathrooms} placeholder="e.g. 2" keyboardType="numeric" />
                    </>
                  ) : null}
                </>
              ) : null}

              {category === "car" ? (
                <>
                  <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
                  <Text style={{ color: "#E8890C", fontSize: 14, fontWeight: "700", marginBottom: 16 }}>🚗 Vehicle Details</Text>
                  <InputField label="Make" value={carMake} onChange={setCarMake} placeholder="e.g. Toyota" />
                  <InputField label="Model" value={carModel} onChange={setCarModel} placeholder="e.g. Land Cruiser" />
                  <InputField label="Year" value={carYear} onChange={setCarYear} placeholder="e.g. 2022" keyboardType="numeric" />
                  <InputField label="Mileage (km)" value={carMileage} onChange={setCarMileage} placeholder="e.g. 45000" keyboardType="numeric" />
                </>
              ) : null}

              {category === "mining" ? (
                <>
                  <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
                  <Text style={{ color: "#C17B50", fontSize: 14, fontWeight: "700", marginBottom: 16 }}>⛏️ Mining Site Details</Text>
                  <InputField label="Mineral Type" value={mineralType} onChange={setMineralType} placeholder="e.g. Gold, Diamond, Copper" />
                  <InputField label="Area (hectares)" value={miningArea} onChange={setMiningArea} placeholder="e.g. 50" keyboardType="numeric" />
                  <InputField label="License Number" value={miningLicense} onChange={setMiningLicense} placeholder="License / permit number" />
                </>
              ) : null}

              <Pressable
                testID="publish-button"
                onPress={handleSubmit}
                disabled={loading}
                style={{ marginTop: 32, borderRadius: 16, overflow: "hidden" }}
              >
                <LinearGradient colors={["#D4A843", "#E8890C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 18, alignItems: "center" }}>
                  {loading ? (
                    <ActivityIndicator color="#0A0A0F" />
                  ) : (
                    <Text style={{ color: "#0A0A0F", fontSize: 17, fontWeight: "800" }}>Publish Listing</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
