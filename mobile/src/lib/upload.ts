import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";

export type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  pHash?: string | null;
  moderation?: { safe: boolean; reasons: string[] };
};

export type PickedImage = { uri: string; filename: string; mimeType: string };

export async function pickImage(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    filename: a.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: a.mimeType ?? "image/jpeg",
  };
}

export async function pickImages(max: number): Promise<PickedImage[]> {
  if (max <= 0) return [];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: max,
  });
  if (result.canceled) return [];
  return result.assets.map((a, i) => ({
    uri: a.uri,
    filename: a.fileName ?? `image-${Date.now()}-${i}.jpg`,
    mimeType: a.mimeType ?? "image/jpeg",
  }));
}

const COOKIE_KEY = "zawadi_auth_cookie";

export async function uploadFile(file: PickedImage): Promise<UploadResult> {
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
  const cookie = (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    type: file.mimeType,
    name: file.filename,
  } as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
    headers: cookie ? { Cookie: cookie } : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Upload failed");
  }
  return data.data as UploadResult;
}

// Upload many in parallel, with a concurrency cap.
export async function uploadMany(files: PickedImage[], concurrency = 3): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (i < files.length) {
      const idx = i++;
      results[idx] = await uploadFile(files[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
