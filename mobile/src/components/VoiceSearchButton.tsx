import React, { useRef, useState } from "react";
import { Pressable, ActivityIndicator, Alert } from "react-native";
import { Mic, MicOff } from "lucide-react-native";
import { Audio } from "expo-av";
import * as SecureStore from "expo-secure-store";

const COOKIE_KEY = "zawadi_auth_cookie";

interface Props {
  onTranscribed: (text: string) => void;
}

export default function VoiceSearchButton({ onTranscribed }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<Audio.Recording | null>(null);

  const start = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Mic access denied");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      ref.current = rec;
      setRecording(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Mic failed";
      Alert.alert("Voice search", msg);
    }
  };

  const stop = async () => {
    setRecording(false);
    const rec = ref.current;
    if (!rec) return;
    ref.current = null;
    try {
      setBusy(true);
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) return;
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
      const cookie = (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
      const form = new FormData();
      form.append("file", { uri, type: "audio/m4a", name: "voice.m4a" } as unknown as Blob);
      const res = await fetch(`${baseUrl}/api/ai/transcribe`, {
        method: "POST",
        body: form,
        headers: cookie ? { Cookie: cookie } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Transcription failed");
      const text = (data?.data?.text as string | undefined) ?? "";
      if (text) onTranscribed(text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transcription failed";
      Alert.alert("Voice search", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID="voice-search-button"
      onPress={recording ? stop : start}
      disabled={busy}
      style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: recording ? "#D4A843" : "transparent",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {busy ? <ActivityIndicator color="#D4A843" /> :
        recording ? <MicOff size={18} color="#0A0A0F" strokeWidth={2.5} /> :
        <Mic size={18} color="#666680" strokeWidth={2.5} />}
    </Pressable>
  );
}
