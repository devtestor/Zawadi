// Detect locale via the JS Intl API to avoid pulling expo-localization.

type Lang = "en" | "sw" | "fr" | "ar";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    "home.greeting.morning": "Good morning",
    "home.greeting.afternoon": "Good afternoon",
    "home.greeting.evening": "Good evening",
    "home.search.placeholder": "Search properties, cars, land...",
    "listing.message_seller": "Message Seller",
    "listing.contact_seller": "Contact Seller",
    "listing.boost.cta": "Boost this listing",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.share": "Share",
    "common.report": "Report",
  },
  sw: {
    "home.greeting.morning": "Habari za asubuhi",
    "home.greeting.afternoon": "Habari za mchana",
    "home.greeting.evening": "Habari za jioni",
    "home.search.placeholder": "Tafuta nyumba, magari, ardhi...",
    "listing.message_seller": "Tuma ujumbe kwa muuzaji",
    "listing.contact_seller": "Wasiliana na muuzaji",
    "listing.boost.cta": "Kuza tangazo hili",
    "common.cancel": "Ghairi",
    "common.save": "Hifadhi",
    "common.delete": "Futa",
    "common.share": "Shiriki",
    "common.report": "Ripoti",
  },
  fr: {
    "home.greeting.morning": "Bonjour",
    "home.greeting.afternoon": "Bon après-midi",
    "home.greeting.evening": "Bonsoir",
    "home.search.placeholder": "Rechercher propriétés, voitures, terrains...",
    "listing.message_seller": "Contacter le vendeur",
    "listing.contact_seller": "Contacter le vendeur",
    "listing.boost.cta": "Mettre en avant",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.delete": "Supprimer",
    "common.share": "Partager",
    "common.report": "Signaler",
  },
  ar: {
    "home.greeting.morning": "صباح الخير",
    "home.greeting.afternoon": "مساء الخير",
    "home.greeting.evening": "مساء الخير",
    "home.search.placeholder": "ابحث عن عقارات، سيارات، أراضٍ...",
    "listing.message_seller": "مراسلة البائع",
    "listing.contact_seller": "تواصل مع البائع",
    "listing.boost.cta": "تعزيز هذا الإعلان",
    "common.cancel": "إلغاء",
    "common.save": "حفظ",
    "common.delete": "حذف",
    "common.share": "مشاركة",
    "common.report": "إبلاغ",
  },
};

function detect(): Lang {
  try {
    const code = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase();
    if (code.startsWith("sw")) return "sw";
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("ar")) return "ar";
  } catch {
    // Intl unavailable — fall through to English.
  }
  return "en";
}

let active: Lang = detect();

export function setLang(lang: Lang): void {
  active = lang;
}

export function getLang(): Lang {
  return active;
}

export function t(key: string): string {
  return STRINGS[active][key] || STRINGS.en[key] || key;
}
