const { createClient } = require('@supabase/supabase-js');
const products = require('./parsed_products.json');

const url = 'https://kghbylwsnbteynhaglsr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnaGJ5bHdzbmJ0ZXluaGFnbHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTQyOTgsImV4cCI6MjExMDU5MDI5OH0.0Eh9Z9b9bB61gaWI214yfX7ONSe2pgZVY-ti3Vk-bZs';
const supabase = createClient(url, key);

async function run() {
  const versionId = '0c3f927b-7a93-4d7b-8fd4-83e91b1ce140';
  console.log(`Starting import of ${products.length} products to version ${versionId}...`);

  // Build category mapping and list
  const categoryMap = {};
  const categoriesSet = new Set();
  products.forEach(p => {
    categoryMap[p.code] = p.category;
    categoriesSet.add(p.category);
  });
  const categoriesList = Array.from(categoriesSet);

  console.log('Categories found:', categoriesList);

  // Check if category column exists in products table
  let hasCategoryColumn = false;
  const { error: testErr } = await supabase.from('products').select('category').limit(1);
  if (!testErr) {
    hasCategoryColumn = true;
    console.log('PostgreSQL products table HAS category column!');
  } else {
    console.log('PostgreSQL products table does NOT have category column yet. We will store in app_settings.');
  }

  // Insert products in batches
  const batchSize = 50;
  let insertedCount = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map(p => {
      const payload = {
        code: p.code,
        name: p.name,
        description: p.description,
        price: p.price,
        stock_quantity: p.stock_quantity,
        low_stock_threshold: p.low_stock_threshold,
        version_id: versionId,
      };
      if (hasCategoryColumn) {
        payload.category = p.category;
      }
      return payload;
    });

    const { data, error } = await supabase.from('products').insert(batch).select('id, code');
    if (error) {
      console.error(`Error inserting batch ${i} - ${i + batch.length}:`, error);
      // Try one-by-one upsert/insert in case of duplicate or error
      for (const item of batch) {
        const { error: singleErr } = await supabase.from('products').upsert(item, { onConflict: 'code,version_id' });
        if (singleErr) {
          console.error(`Failed single insert for ${item.code}:`, singleErr.message);
        } else {
          insertedCount++;
        }
      }
    } else {
      insertedCount += (data ? data.length : batch.length);
      console.log(`Inserted batch ${i + 1} - ${i + batch.length} (total so far: ${insertedCount})`);
    }
  }

  // Save categories map in app_settings
  const settingKey = `categories_map_${versionId}`;
  const settingValue = JSON.stringify({
    categories: categoriesList,
    map: categoryMap,
  });

  const { data: existingSetting } = await supabase.from('app_settings').select('id').eq('key', settingKey).maybeSingle();
  if (existingSetting) {
    await supabase.from('app_settings').update({ value: settingValue }).eq('id', existingSetting.id);
  } else {
    await supabase.from('app_settings').insert({
      key: settingKey,
      value: settingValue,
      version_id: versionId,
    });
  }

  console.log(`Saved categories map in app_settings (${settingKey}) with ${categoriesList.length} categories.`);
  console.log(`Import finished! Total inserted: ${insertedCount} / ${products.length}`);
}

run().catch(console.error);
