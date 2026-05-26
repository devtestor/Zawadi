import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "zawadi:listing-draft:v1";

export interface ListingDraft {
  step: number;
  category: string | null;
  title: string;
  description: string;
  price: string;
  currency: string;
  country: string;
  city: string;
  address: string;
  listingType: "sale" | "rent";
  rentalPeriod: "day" | "week" | "month" | "year";
  images: string[];
  // Plus arbitrary per-category fields:
  extra?: Record<string, string>;
  savedAt: number;
}

export async function saveDraft(draft: Omit<ListingDraft, "savedAt">): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // best-effort
  }
}

export async function loadDraft(): Promise<ListingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ListingDraft;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
