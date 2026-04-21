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
  category: "property" | "land" | "car" | "mining" | "machinery";
  listingType?: "sale" | "rent";
  rentalPeriod?: "day" | "week" | "month" | "year";
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
  // Machinery
  machineryKind?: string;
  machineryType?: string;
  machineryBrand?: string;
  machineryModel?: string;
  machineryYear?: number;
  machineryHours?: number;
  machineryCondition?: string;
  // Features
  features?: string;
  // Boost
  boosted?: boolean;
  boostedUntil?: string;
}

export type Category = "all" | "property" | "land" | "car" | "mining" | "machinery";

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
  property: "🏠", land: "🌍", car: "🚗", mining: "⛏️", machinery: "🚜",
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: "All", property: "Property", land: "Land", car: "Cars", mining: "Mining", machinery: "Machinery",
};

export const MACHINERY_TYPES: { kind: "agriculture" | "construction"; key: string; label: string }[] = [
  { kind: "agriculture", key: "tractor", label: "Tractor" },
  { kind: "agriculture", key: "combine_harvester", label: "Combine Harvester" },
  { kind: "agriculture", key: "plough", label: "Plough" },
  { kind: "agriculture", key: "seeder", label: "Seeder / Planter" },
  { kind: "agriculture", key: "sprayer", label: "Sprayer" },
  { kind: "agriculture", key: "baler", label: "Baler" },
  { kind: "agriculture", key: "irrigation", label: "Irrigation System" },
  { kind: "construction", key: "backhoe", label: "Backhoe Loader" },
  { kind: "construction", key: "wheel_loader", label: "Wheel Loader" },
  { kind: "construction", key: "excavator", label: "Excavator" },
  { kind: "construction", key: "bulldozer", label: "Bulldozer" },
  { kind: "construction", key: "grader", label: "Motor Grader" },
  { kind: "construction", key: "roller", label: "Road Roller" },
  { kind: "construction", key: "dump_truck", label: "Dump Truck" },
  { kind: "construction", key: "crane", label: "Crane" },
  { kind: "construction", key: "skid_steer", label: "Skid Steer" },
  { kind: "construction", key: "paver", label: "Asphalt Paver" },
];
