import fs from 'fs';
import process from 'process';

const defaults = {
  VITE_SUPABASE_URL: 'https://kghbylwsnbteynhaglsr.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnaGJ5bHdzbmJ0ZXluaGFnbHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTQyOTgsImV4cCI6MjExMDU5MDI5OH0.0Eh9Z9b9bB61gaWI214yfX7ONSe2pgZVY-ti3Vk-bZs'
};

const envKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_GEMINI_API_KEY',
  'VITE_TELEGRAM_BOT_TOKEN',
  'VITE_TELEGRAM_CHAT_ID'
];

let envContent = '';
envKeys.forEach(key => {
  const val = process.env[key] || defaults[key];
  if (val) {
    envContent += `${key}="${val}"\n`;
  }
});

fs.writeFileSync('.env', envContent);
console.log('.env file generated successfully for build!');
