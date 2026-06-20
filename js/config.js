// js/config.js
//
// Public, client-side config. Safe to expose (Supabase anon key + RLS
// protects data; Paystack public key is meant to be public).
// Fill these in with your real project values.

window.FITCHECK_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL", // e.g. https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  PAYSTACK_PUBLIC_KEY: "YOUR_PAYSTACK_PUBLIC_KEY", // pk_live_... or pk_test_...
  CLOUDINARY_CLOUD_NAME: "YOUR_CLOUDINARY_CLOUD_NAME",
  CLOUDINARY_UPLOAD_PRESET: "YOUR_UNSIGNED_UPLOAD_PRESET", // create an unsigned preset in Cloudinary settings

  // Pricing — amounts in kobo (₦1 = 100 kobo)
  PRICING: {
    pro: {
      monthly: 1000000,   // ₦10,000
      yearly: 9600000,    // ₦96,000 (2 months free)
    },
    closet: {
      monthly: 5000000,   // ₦50,000
      yearly: 48000000,   // ₦480,000 (2 months free)
    },
  },
  FREE_FIT_CHECKS_PER_MONTH: 5,
  FREE_CLOSET_ITEM_LIMIT: 10,
};
