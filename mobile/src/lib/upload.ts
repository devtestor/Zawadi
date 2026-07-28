import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "@/lib/secure-store";
import { Platform } from "react-native";

export type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  pHash?: string | null;
  moderation?: { safe: boolean; reasons: string[] };
};

export type PickedImage = {
  uri: string;
  filename: string;
  mimeType: string;
  /**
   * Expo ImagePicker returns the browser File object on web. Keeping it lets
   * FormData send the actual file bytes instead of a React Native `{ uri }`
   * file descriptor, which browsers do not understand.
   */
  file?: Blob;
};

type ImagePickerAssetWithFile = ImagePicker.ImagePickerAsset & { file?: Blob };

function toPickedImage(asset: ImagePicker.ImagePickerAsset, index = 0): PickedImage {
  const a = asset as ImagePickerAssetWithFile;
  return {
    uri: a.uri,
    filename: a.fileName ?? `image-${Date.now()}-${index}.jpg`,
    mimeType: a.mimeType ?? "image/jpeg",
    file: a.file,
  };
}

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
  return toPickedImage(a);
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
  return result.assets.map(toPickedImage);
}

const COOKIE_KEY = "zawadi_auth_cookie";

async function appendPickedImage(formData: FormData, file: PickedImage) {
  if (Platform.OS === "web") {
    const blob =
      file.file ??
      (await fetch(file.uri).then((response) => {
        if (!response.ok) throw new Error("Could not read selected image");
        return response.blob();
      }));
    const uploadBlob =
      blob.type || typeof File === "undefined"
        ? blob
        : new File([blob], file.filename, { type: file.mimeType });
    formData.append("file", uploadBlob, file.filename);
    return;
  }

  formData.append("file", {
    uri: file.uri,
    type: file.mimeType,
    name: file.filename,
  } as unknown as Blob);
}

export async function uploadFile(file: PickedImage): Promise<UploadResult> {
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
  const cookie = (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
  const formData = new FormData();
  await appendPickedImage(formData, file);

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: cookie && Platform.OS !== "web" ? { Cookie: cookie } : undefined,
  });

  const text = await response.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      })()
    : undefined;
  if (!response.ok) {
    throw new Error(data?.error?.message || text || "Upload failed");
  }
  if (!data?.data) {
    throw new Error("Upload failed: invalid server response");
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
