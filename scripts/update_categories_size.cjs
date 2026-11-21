const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const SUPABASE_URL = 'https://kghbylwsnbteynhaglsr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnaGJ5bHdzbmJ0ZXluaGFnbHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTQyOTgsImV4cCI6MjExMDU5MDI5OH0.0Eh9Z9b9bB61gaWI214yfX7ONSe2pgZVY-ti3Vk-bZs';
const VERSION_ID = '0c3f927b-7a93-4d7b-8fd4-83e91b1ce140';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Reading Excel file...');
  const wb = xlsx.readFile('C:/Users/11/.gemini/antigravity/brain/a69e1938-3e0d-4622-bea3-7a8bcf7491b6/.user_uploaded/media_1795302923734_0a553e61.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows.`);

  const categoryMap = {};
  const categoriesSet = new Set(['وسط', 'بيبى', 'محير']);

  rows.forEach(r => {
    const code = String(r['الكود']).trim();
    const name = String(r['الاسم']).trim();
    let size = (r['المقاس'] || '').trim();
    if (!size) {
      if (name.includes('كبير')) size = 'كبير';
      else if (name.includes('بيبى') || name.includes('بيبي')) size = 'بيبى';
      else if (name.includes('محير')) size = 'محير';
      else if (name.includes('وسط')) size = 'وسط';
      else size = 'وسط';
    }
    categoryMap[code] = size;
    categoriesSet.add(size);
  });

  const categories = Array.from(categoriesSet);
  console.log('Categories:', categories);

  // 1. Update app_settings
  console.log('Updating app_settings categories_map...');
  const { error: settingsError } = await supabase.from('app_settings').upsert({
    version_id: VERSION_ID,
    key: `categories_map_${VERSION_ID}`,
    value: JSON.stringify({
      categories,
      map: categoryMap,
    }),
  }, { onConflict: 'key,version_id' });

  if (settingsError) {
    console.error('Error saving app_settings:', settingsError);
  } else {
    console.log('Successfully updated app_settings!');
  }

  // 2. Fetch existing products to update category column if exists
  const { data: dbProducts, error: prodError } = await supabase
    .from('products')
    .select('id, code')
    .eq('version_id', VERSION_ID);

  if (prodError) {
    console.error('Error fetching products:', prodError);
    return;
  }

  console.log(`Updating ${dbProducts.length} products in DB...`);
  let updatedCount = 0;
  for (const prod of dbProducts) {
    const size = categoryMap[prod.code];
    if (size) {
      // Try updating category column
      const { error: updateErr } = await supabase
        .from('products')
        .update({ category: size })
        .eq('id', prod.id);

      if (!updateErr) {
        updatedCount++;
      }
    }
  }

  console.log(`Finished! Updated ${updatedCount} products with their size categories.`);
}

main().catch(console.error);
