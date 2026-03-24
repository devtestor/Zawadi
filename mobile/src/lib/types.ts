export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  phone?: string;
  createdAt: string;
  _count?: { listings: number; favorites: number };
}

export interface ListingImage {
  id: string;
  url: string;
  order: number;
  listingId: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: "property" | "land" | "car" | "mining";
  status: "active" | "sold" | "pending";
  country: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  images: ListingImage[];
  user: { id: string; name: string; image?: string; phone?: string; email?: string };
  _count?: { favorites: number };
  createdAt: string;
  updatedAt: string;
  // Property/Land
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  // Car
  carMake?: string;
  carModel?: string;
  carYear?: number;
  carMileage?: number;
  carCondition?: string;
  carColor?: string;
  carFuel?: string;
  // Mining
  mineralType?: string;
  miningArea?: number;
  miningLicense?: string;
  miningStatus?: string;
  // Features
  features?: string;
}

export type Category = "all" | "property" | "land" | "car" | "mining";

export const AFRICAN_COUNTRIES = [
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cameroon", "Cape Verde", "Central African Republic", "Chad", "Comoros",
  "Congo", "DR Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea",
  "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
  "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar",
  "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique",
  "Namibia", "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe",
  "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa",
  "South Sudan", "Sudan", "Swaziland", "Tanzania", "Togo", "Tunisia",
  "Uganda", "Zambia", "Zimbabwe",
];

export const CURRENCIES: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", ZAR: "R", NGN: "₦",
  KES: "KSh", GHS: "GH₵", EGP: "£E", MAD: "MAD", TZS: "TSh",
};

export function formatPrice(price: number, currency: string = "USD"): string {
  const symbol = CURRENCIES[currency] || currency + " ";
  if (price >= 1_000_000) return `${symbol}${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `${symbol}${(price / 1_000).toFixed(0)}K`;
  return `${symbol}${price.toLocaleString()}`;
}

export const CATEGORY_ICONS: Record<string, string> = {
  property: "🏠", land: "🌍", car: "🚗", mining: "⛏️",
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: "All", property: "Property", land: "Land", car: "Cars", mining: "Mining",
};
