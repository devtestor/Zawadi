import React, { useEffect, useRef, useState } from "react";
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
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { AFRICAN_COUNTRIES, MACHINERY_TYPES } from "@/lib/types";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { pickImages, uploadMany } from "@/lib/upload";
import { Plus, X, Sparkles } from "lucide-react-native";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";

const MIN_IMAGES = 3;
const MAX_IMAGES = 5;
type RentalPeriod = "day" | "week" | "month" | "year";

type PostCategory = "property" | "land" | "car" | "mining" | "machinery";

const CATEGORIES: { key: PostCategory; icon: string; label: string; desc: string }[] = [
  { key: "property", icon: "🏠", label: "Property", desc: "Houses, apartments, villas" },
  { key: "land", icon: "🗺️", label: "Land", desc: "Plots, farms, estates" },
  { key: "car", icon: "🚗", label: "Vehicle", desc: "Cars, trucks, motorcycles" },
  { key: "mining", icon: "⛏️", label: "Mining Site", desc: "Gold, diamonds, minerals" },
  { key: "machinery", icon: "🚜", label: "Machinery", desc: "Agriculture & construction equipment" },
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
  const [machineryKind, setMachineryKind] = useState<"agriculture" | "construction" | "">("");
  const [machineryType, setMachineryType] = useState("");
  const [machineryBrand, setMachineryBrand] = useState("");
  const [machineryModel, setMachineryModel] = useState("");
  const [machineryYear, setMachineryYear] = useState("");
  const [machineryHours, setMachineryHours] = useState("");
  const [machineryCondition, setMachineryCondition] = useState<"new" | "used">("used");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [listingType, setListingType] = useState<"sale" | "rent">("sale");
  const [rentalPeriod, setRentalPeriod] = useState<RentalPeriod>("month");
  const [images, setImages] = useState<string[]>([]);
  const [imageMeta, setImageMeta] = useState<Record<string, { pHash?: string | null }>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const draftLoaded = useRef(false);

  const canHaveRental = category === "property" || category === "land" || category === "car" || category === "machinery";

  // Restore draft on mount.
  useEffect(() => {
    (async () => {
      const d = await loadDraft();
      if (!d) {
        draftLoaded.current = true;
        return;
      }
      Alert.alert(
        "Resume your draft?",
        "We saved your unfinished listing.",
        [
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              await clearDraft();
              draftLoaded.current = true;
            },
          },
          {
            text: "Resume",
            onPress: () => {
              setStep(d.step ?? 1);
              setCategory((d.category as PostCategory | null) ?? null);
              setTitle(d.title ?? "");
              setDescription(d.description ?? "");
              setPrice(d.price ?? "");
              setCurrency(d.currency ?? "USD");
              setCountry(d.country ?? "");
              setCity(d.city ?? "");
              setAddress(d.address ?? "");
              setListingType(d.listingType ?? "sale");
              setRentalPeriod(d.rentalPeriod ?? "month");
              setImages(d.images ?? []);
              draftLoaded.current = true;
            },
          },
        ],
      );
    })();
  }, []);

  // Auto-save draft on changes.
  useEffect(() => {
    if (!draftLoaded.current) return;
    saveDraft({
      step,
      category,
      title,
      description,
      price,
      currency,
      country,
      city,
      address,
      listingType,
      rentalPeriod,
      images,
    });
  }, [step, category, title, description, price, currency, country, city, address, listingType, rentalPeriod, images]);

  const handleAiWrite = async () => {
    if (!category) {
      Alert.alert("Pick a category first");
      return;
    }
    setAiBusy(true);
    try {
      const result = await api.post<{ title?: string; description?: string }>("/api/ai/listing-writer", {
        category,
        country,
        title,
        notes: description,
      });
      if (result.title && !title) setTitle(result.title);
      if (result.description) setDescription(result.description);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI is not available right now";
      Alert.alert("AI assistant", msg);
    } finally {
      setAiBusy(false);
    }
  };

  const handleAddImage = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert("Maximum reached", `You can upload up to ${MAX_IMAGES} images`);
      return;
    }
    try {
      const picked = await pickImages(remaining);
      if (picked.length === 0) return;
      setUploadingImage(true);
      const results = await uploadMany(picked);
      const blocked = results.filter((r) => r.moderation && !r.moderation.safe);
      if (blocked.length) {
        Alert.alert(
          "Some images were rejected",
          `${blocked.length} image(s) flagged by moderation: ${blocked
            .flatMap((b) => b.moderation?.reasons ?? [])
            .join(", ")}`,
        );
      }
      const good = results.filter((r) => !r.moderation || r.moderation.safe);
      setImages((prev) => [...prev, ...good.map((r) => r.url)].slice(0, MAX_IMAGES));
      setImageMeta((prev) => {
        const next = { ...prev };
        good.forEach((r) => {
          next[r.url] = { pHash: r.pHash ?? null };
        });
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not upload images";
      Alert.alert("Upload failed", msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!title || !price || !country || !category) {
      Alert.alert("Missing fields", "Please fill in all required fields");
      return;
    }
    if (images.length < MIN_IMAGES) {
      Alert.alert("Images required", `Please upload at least ${MIN_IMAGES} images (max ${MAX_IMAGES})`);
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title, description, price: parseFloat(price), currency, category,
        country, city, address,
        images: images.map((url) =>
          imageMeta[url]?.pHash ? { url, pHash: imageMeta[url]!.pHash! } : url,
        ),
        listingType: canHaveRental ? listingType : "sale",
      };
      if (canHaveRental && listingType === "rent") {
        body.rentalPeriod = rentalPeriod;
      }
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
      if (category === "machinery") {
        if (machineryKind) body.machineryKind = machineryKind;
        if (machineryType) body.machineryType = machineryType;
        if (machineryBrand) body.machineryBrand = machineryBrand;
        if (machineryModel) body.machineryModel = machineryModel;
        if (machineryYear) body.machineryYear = parseInt(machineryYear);
        if (machineryHours) body.machineryHours = parseInt(machineryHours);
        body.machineryCondition = machineryCondition;
      }
      await api.post("/api/listings", body);
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      await clearDraft();
      Alert.alert("Posted!", "Your listing is now live on Alcurry", [
        { text: "View Home", onPress: () => router.push("/(app)") },
      ]);
      setStep(1); setCategory(null); setTitle(""); setDescription(""); setPrice(""); setCountry(""); setCity("");
      setAddress(""); setImages([]); setListingType("sale"); setRentalPeriod("month");
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

              {canHaveRental ? (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Listing Type *
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {(["sale", "rent"] as const).map((t) => {
                      const active = listingType === t;
                      return (
                        <Pressable
                          key={t}
                          testID={`listing-type-${t}`}
                          onPress={() => setListingType(t)}
                          style={{
                            flex: 1, paddingVertical: 14, borderRadius: 12,
                            backgroundColor: active ? "#D4A843" : "#16161E",
                            borderWidth: 1, borderColor: active ? "#D4A843" : "#2A2A3A",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: active ? "#0A0A0F" : "#888", fontSize: 14, fontWeight: "800" }}>
                            {t === "sale" ? "💰 For Sale" : "🔑 For Rent"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {listingType === "rent" ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ color: "#888", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Rental Period
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {(["day", "week", "month", "year"] as const).map((p) => {
                          const active = rentalPeriod === p;
                          return (
                            <Pressable
                              key={p}
                              testID={`rental-period-${p}`}
                              onPress={() => setRentalPeriod(p)}
                              style={{
                                flex: 1, paddingVertical: 10, borderRadius: 10,
                                backgroundColor: active ? "#1E1E0A" : "#16161E",
                                borderWidth: 1, borderColor: active ? "#D4A843" : "#2A2A3A",
                                alignItems: "center",
                              }}
                            >
                              <Text style={{ color: active ? "#D4A843" : "#888", fontSize: 13, fontWeight: "700", textTransform: "capitalize" }}>
                                {p}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                testID="ai-write-button"
                onPress={handleAiWrite}
                disabled={aiBusy}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  backgroundColor: "#1E1E0A", borderWidth: 1, borderColor: "#D4A84366",
                  borderRadius: 12, paddingVertical: 12, marginBottom: 16,
                }}
              >
                {aiBusy ? (
                  <ActivityIndicator color="#D4A843" size="small" />
                ) : (
                  <>
                    <Sparkles size={14} color="#D4A843" strokeWidth={2.5} />
                    <Text style={{ color: "#D4A843", fontSize: 13, fontWeight: "800" }}>
                      Write with AI {title || description ? "(polish my draft)" : ""}
                    </Text>
                  </>
                )}
              </Pressable>
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
                    {["USD", "KES", "UGX", "RWF"].map((c) => (
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
                    borderWidth: 1, borderColor: "#2A2A3A", overflow: "hidden",
                  }}>
                    <TextInput
                      value={countryQuery}
                      onChangeText={setCountryQuery}
                      placeholder="Search countries..."
                      placeholderTextColor="#3A3A4A"
                      style={{ color: "#FFFFFF", fontSize: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: "#2A2A3A" }}
                      autoCapitalize="none"
                    />
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                      {AFRICAN_COUNTRIES.filter((c) => !countryQuery || c.toLowerCase().includes(countryQuery.toLowerCase())).map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => { setCountry(c); setShowCountryPicker(false); setCountryQuery(""); }}
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

              {category === "machinery" ? (
                <>
                  <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
                  <Text style={{ color: "#1A6B4A", fontSize: 14, fontWeight: "700", marginBottom: 16 }}>🚜 Machinery Details</Text>

                  {/* Kind: agriculture / construction */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                      Machinery Kind *
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {([
                        { key: "agriculture", label: "🌾 Agriculture" },
                        { key: "construction", label: "🏗️ Construction / Roads" },
                      ] as const).map((k) => {
                        const active = machineryKind === k.key;
                        return (
                          <Pressable
                            key={k.key}
                            testID={`machinery-kind-${k.key}`}
                            onPress={() => { setMachineryKind(k.key); setMachineryType(""); }}
                            style={{
                              flex: 1, paddingVertical: 14, borderRadius: 12,
                              backgroundColor: active ? "#0F2A1E" : "#16161E",
                              borderWidth: 1, borderColor: active ? "#1A6B4A" : "#2A2A3A",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: active ? "#1A6B4A" : "#888", fontSize: 14, fontWeight: "700" }}>
                              {k.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Machine type picker — filtered by kind */}
                  {machineryKind ? (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Machine Type *
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ flexGrow: 0 }}
                        contentContainerStyle={{ gap: 8 }}
                      >
                        {MACHINERY_TYPES.filter((m) => m.kind === machineryKind).map((m) => {
                          const active = machineryType === m.key;
                          return (
                            <Pressable
                              key={m.key}
                              testID={`machinery-type-${m.key}`}
                              onPress={() => setMachineryType(m.key)}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
                                backgroundColor: active ? "#1A6B4A" : "#16161E",
                                borderWidth: 1, borderColor: active ? "#1A6B4A" : "#2A2A3A",
                              }}
                            >
                              <Text style={{ color: active ? "#FFFFFF" : "#888", fontSize: 13, fontWeight: "700" }}>
                                {m.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  <InputField label="Brand" value={machineryBrand} onChange={setMachineryBrand} placeholder="e.g. Caterpillar, John Deere, JCB" />
                  <InputField label="Model" value={machineryModel} onChange={setMachineryModel} placeholder="e.g. 3CX, 5075E" />
                  <InputField label="Year" value={machineryYear} onChange={setMachineryYear} placeholder="e.g. 2020" keyboardType="numeric" />
                  <InputField label="Operating Hours" value={machineryHours} onChange={setMachineryHours} placeholder="e.g. 2400" keyboardType="numeric" />

                  {/* Condition */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                      Condition
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {(["new", "used"] as const).map((c) => {
                        const active = machineryCondition === c;
                        return (
                          <Pressable
                            key={c}
                            testID={`machinery-condition-${c}`}
                            onPress={() => setMachineryCondition(c)}
                            style={{
                              flex: 1, paddingVertical: 12, borderRadius: 12,
                              backgroundColor: active ? "#D4A843" : "#16161E",
                              borderWidth: 1, borderColor: active ? "#D4A843" : "#2A2A3A",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: active ? "#0A0A0F" : "#888", fontSize: 14, fontWeight: "700", textTransform: "capitalize" }}>
                              {c}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : null}

              {/* Image uploader */}
              <View style={{ height: 1, backgroundColor: "#1E1E2A", marginVertical: 16 }} />
              <Text style={{ color: "#D4A843", fontSize: 14, fontWeight: "700", marginBottom: 4 }}>
                📸 Photos * ({images.length}/{MAX_IMAGES})
              </Text>
              <Text style={{ color: "#666680", fontSize: 12, marginBottom: 12 }}>
                Upload {MIN_IMAGES}-{MAX_IMAGES} images to attract buyers
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {images.map((url, idx) => (
                  <View key={url} style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                    <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    <Pressable
                      testID={`remove-image-${idx}`}
                      onPress={() => handleRemoveImage(idx)}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: "rgba(0,0,0,0.7)",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <X size={12} color="#FFFFFF" strokeWidth={3} />
                    </Pressable>
                    {idx === 0 ? (
                      <View style={{
                        position: "absolute", bottom: 4, left: 4,
                        backgroundColor: "#D4A843", borderRadius: 6,
                        paddingHorizontal: 6, paddingVertical: 2,
                      }}>
                        <Text style={{ color: "#0A0A0F", fontSize: 9, fontWeight: "900" }}>COVER</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                {images.length < MAX_IMAGES ? (
                  <Pressable
                    testID="add-image-button"
                    onPress={handleAddImage}
                    disabled={uploadingImage}
                    style={{
                      width: 96, height: 96, borderRadius: 12,
                      backgroundColor: "#16161E",
                      borderWidth: 2, borderColor: "#2A2A3A", borderStyle: "dashed",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator color="#D4A843" />
                    ) : (
                      <>
                        <Plus size={24} color="#666680" strokeWidth={2} />
                        <Text style={{ color: "#666680", fontSize: 11, fontWeight: "700", marginTop: 4 }}>Add Photo</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>

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
