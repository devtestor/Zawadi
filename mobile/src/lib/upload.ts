import * as ImagePicker from "expo-image-picker";

export type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
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

export async function uploadFile(file: PickedImage): Promise<UploadResult> {
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    type: file.mimeType,
    name: file.filename,
  } as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Upload failed");
  }
  return data.data as UploadResult;
}
