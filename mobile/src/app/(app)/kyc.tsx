import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ShieldCheck, Camera } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { pickImage, uploadFile } from "@/lib/upload";
import { KycRecord } from "@/lib/types";

const ID_TYPES = [
  { key: "national_id", label: "National ID" },
  { key: "passport", label: "Passport" },
  { key: "driving_license", label: "Driving license" },
] as const;

export default function KycScreen() {
  const queryClient = useQueryClient();
  const { data: existing, isLoading } = useQuery({
    queryKey: ["kyc"],
    queryFn: () => api.get<KycRecord | null>("/api/kyc"),
  });

  const [legalName, setLegalName] = useState("");
  const [dob, setDob] = useState("");
  const [country, setCountry] = useState("");
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]["key"]>("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [uploading, setUploading] = useState<null | "front" | "selfie">(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post("/api/kyc", {
        legalName: legalName.trim(),
        dob,
        country: country.trim(),
        idType,
        idNumber: idNumber.trim(),
        idFrontUrl,
        selfieUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kyc"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Submitted!", "We'll review your documents within 1-2 business days.");
    },
    onError: (e: unknown) => Alert.alert("Submit failed", e instanceof Error ? e.message : "Try again"),
  });

  const uploadShot = async (target: "front" | "selfie") => {
    try {
      const picked = await pickImage();
      if (!picked) return;
      setUploading(target);
      const res = await uploadFile(picked);
      if (target === "front") setIdFrontUrl(res.url);
      else setSelfieUrl(res.url);
    } catch (e: unknown) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setUploading(null);
    }
  };

  const canSubmit =
    legalName.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && country.trim() && idNumber.trim() && idFrontUrl && selfieUrl;

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} testID="kyc-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0A0A0F" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
          <Pressable
            testID="kyc-back"
            onPress={() => router.back()}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#16161E", borderWidth: 1, borderColor: "#2A2A3A", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>Identity verification</Text>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ActivityIndicator color="#D4A843" style={{ marginTop: 40 }} />
      ) : existing && (existing.status === "pending" || existing.status === "approved" || existing.status === "rejected") ? (
        <View style={{ padding: 20 }}>
          <View style={{ alignItems: "center", marginVertical: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#1E1E0A", borderWidth: 1, borderColor: "#D4A84366", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={36} color="#D4A843" />
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 16, textTransform: "capitalize" }}>
              {existing.status === "approved" ? "Verified" : existing.status === "pending" ? "Under review" : "Needs revision"}
            </Text>
            {existing.status === "rejected" && existing.rejectionReason ? (
              <Text style={{ color: "#FF6B6B", fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 8 }}>
                {existing.rejectionReason}
              </Text>
            ) : (
              <Text style={{ color: "#888", fontSize: 13, textAlign: "center", marginTop: 8 }}>
                {existing.status === "approved"
                  ? "You can now buy and sell up to any limit."
                  : "We usually review within 1-2 business days."}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80, gap: 16 }}>
          <Text style={{ color: "#888", fontSize: 13, lineHeight: 18 }}>
            Required for trades above the platform threshold (and to apply for the business tier). All documents are
            encrypted in transit.
          </Text>

          <Field label="Legal name" value={legalName} onChange={setLegalName} placeholder="As shown on ID" />
          <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChange={setDob} placeholder="1995-04-12" />
          <Field label="Country of issue" value={country} onChange={setCountry} placeholder="Kenya" />

          <View>
            <Label text="Document type" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {ID_TYPES.map((t) => {
                const active = idType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    testID={`kyc-id-${t.key}`}
                    onPress={() => setIdType(t.key)}
                    style={{
                      flex: 1, paddingVertical: 12, paddingHorizontal: 6,
                      borderRadius: 12, borderWidth: 1,
                      backgroundColor: active ? "#1E1E0A" : "#16161E",
                      borderColor: active ? "#D4A843" : "#2A2A3A",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: active ? "#D4A843" : "#FFFFFF", fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field label="Document number" value={idNumber} onChange={setIdNumber} placeholder="••••" />

          <UploadSlot label="Photo of document" url={idFrontUrl} busy={uploading === "front"} onPress={() => uploadShot("front")} />
          <UploadSlot label="Selfie with document" url={selfieUrl} busy={uploading === "selfie"} onPress={() => uploadShot("selfie")} />

          <Pressable
            testID="kyc-submit"
            onPress={() => submit.mutate()}
            disabled={!canSubmit || submit.isPending}
            style={{ marginTop: 12, backgroundColor: canSubmit ? "#D4A843" : "#3A3A4A", borderRadius: 14, padding: 16, alignItems: "center" }}
          >
            {submit.isPending ? <ActivityIndicator color="#0A0A0F" /> : (
              <Text style={{ color: "#0A0A0F", fontWeight: "900" }}>Submit for review</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Text style={{ color: "#888", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{text}</Text>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View>
      <Label text={label} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#3A3A4A"
        style={{ backgroundColor: "#16161E", borderRadius: 12, padding: 14, color: "#FFFFFF", fontSize: 15, borderWidth: 1, borderColor: "#2A2A3A" }}
      />
    </View>
  );
}

function UploadSlot({ label, url, busy, onPress }: { label: string; url: string; busy: boolean; onPress: () => void }) {
  return (
    <View>
      <Label text={label} />
      <Pressable
        testID={`kyc-upload-${label}`}
        onPress={onPress}
        disabled={busy}
        style={{
          height: 140, borderRadius: 12, overflow: "hidden",
          backgroundColor: "#16161E", borderWidth: 2, borderColor: url ? "#D4A843" : "#2A2A3A", borderStyle: url ? "solid" : "dashed",
          alignItems: "center", justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator color="#D4A843" />
        ) : url ? (
          <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <View style={{ alignItems: "center", gap: 6 }}>
            <Camera size={22} color="#666680" />
            <Text style={{ color: "#666680", fontSize: 12, fontWeight: "700" }}>Tap to upload</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
