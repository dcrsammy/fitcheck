// js/config.js
//
// Public, client-side config. Safe to expose (Supabase anon key + RLS
// protects data; Paystack public key is meant to be public).

window.FITCHECK_CONFIG = {
  SUPABASE_URL: "https://igmtshsovigsoswmcunn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnbXRzaHNvdmlnc29zd21jdW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTQ5NTMsImV4cCI6MjA5NzU5MDk1M30.oblkrp36dLKJskH9mkqOSscMZPmXPi_B6gp-KvuVutU",
  PAYSTACK_PUBLIC_KEY: "YOUR_PAYSTACK_PUBLIC_KEY",
  CLOUDINARY_CLOUD_NAME: "db4gremoi",
  CLOUDINARY_UPLOAD_PRESET: "fitcheck_wardrobe",

  PRICING: {
    pro: {
      monthly: 1000000,
      yearly: 9600000,
    },
    closet: {
      monthly: 5000000,
      yearly: 48000000,
    },
  },
  FREE_FIT_CHECKS_PER_MONTH: 5,
  FREE_CLOSET_ITEM_LIMIT: 10,
};
