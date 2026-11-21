import { useEffect, useState, useRef } from 'react';
import { 
  Plus, Edit2, Trash2, QrCode, Search, Package, Printer, 
  CheckSquare, Square, FileSpreadsheet, AlertTriangle, 
  CheckCircle, XCircle, Sliders, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { useVersion } from '@/contexts/VersionContext';
import ProductImage from '@/components/ProductImage';
import { sendStockAlertTelegram } from '@/lib/telegramAlerts';

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  category?: string | null;
}

interface ImportFailure {
  row: number;
  code?: string;
  name?: string;
  reason: string;
}

interface ImportReport {
  total: number;
  success: number;
  failed: number;
  failures: ImportFailure[];
}

// Thermal label printer presets commonly used in Egypt
export interface LabelPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  desc: string;
}

export const LABEL_PRESETS: LabelPreset[] = [
  { id: '50x30', name: '50 × 30 مم', width: 50, height: 30, desc: 'المقاس القياسي الأكثر انتشاراً في مصر للملابس والباركود' },
  { id: '40x25', name: '40 × 25 مم', width: 40, height: 25, desc: 'مقاس قياسي مدمج لطابعات الباركود' },
  { id: '38x25', name: '38 × 25 مم', width: 38, height: 25, desc: 'طابعات Xprinter XP-365B / XP-370B الشائعة' },
  { id: '50x25', name: '50 × 25 مم', width: 50, height: 25, desc: 'عريض ومنخفض الارتفاع' },
  { id: '60x40', name: '60 × 40 مم', width: 60, height: 40, desc: 'مقاس كبير للكراتين والبيانات الموسعة' },
  { id: 'custom', name: 'مقاس مخصص (يدوي)', width: 50, height: 30, desc: 'تحديد الأبعاد بالملليمتر يدوياً' },
];

export const DEFAULT_CATEGORIES = [
  'جاكيت',
  'سويت شيرت',
  'طقم',
  'بلوفر',
  'جيب',
  'بنطلون',
  'بلوزة',
  'قميص',
];

const sortProductsAscending = (list: Product[]): Product[] => {
  return [...list].sort((a, b) => {
    const codeA = a.code ? String(a.code).trim() : '';
    const codeB = b.code ? String(b.code).trim() : '';
    const numA = parseInt(codeA.replace(/\D/g, ''));
    const numB = parseInt(codeB.replace(/\D/g, ''));
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return codeA.localeCompare(codeB, undefined, { numeric: true });
  });
};

export const getCategoryForProduct = (p: Product, map: Record<string, string>): string => {
  if (p.category && p.category.trim()) return p.category.trim();
  if (p.code && map[p.code]) return map[p.code];
  if (p.id && map[p.id]) return map[p.id];
  
  const code = String(p.code || '').trim();
  const name = String(p.name || '').trim();
  
  if (code.startsWith('771') || name.startsWith('جاكيت')) return 'جاكيت';
  if (code.startsWith('772') || name.startsWith('سويت شيرت')) return 'سويت شيرت';
  if (code.startsWith('774') || name.startsWith('قميص')) return 'قميص';
  if (code.startsWith('775') || name.startsWith('بنطلون')) return 'بنطلون';
  if (code.startsWith('776') || name.startsWith('بلوزة')) return 'بلوزة';
  if (code.startsWith('777') || name.startsWith('طقم')) return 'طقم';
  if (code.startsWith('778') || name.startsWith('بلوفر')) return 'بلوفر';
  if (code.startsWith('779') || name.startsWith('جيب')) return 'جيب';
  
  return 'عام';
};

const Products = () => {
  const { activeVersion } = useVersion();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Category states
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Print Dialog states
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [printSearchCode, setPrintSearchCode] = useState('');
  const [printCategory, setPrintCategory] = useState<string>('ALL');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Label printer presets & size calibration
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    return localStorage.getItem('bambino_label_preset') || '50x30';
  });
  const [customWidth, setCustomWidth] = useState<string>(() => {
    return localStorage.getItem('bambino_label_custom_w') || '50';
  });
  const [customHeight, setCustomHeight] = useState<string>(() => {
    return localStorage.getItem('bambino_label_custom_h') || '30';
  });
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    price: 0,
    stock_quantity: 0,
    low_stock_threshold: 10,
    category: '',
  });

  useEffect(() => {
    if (activeVersion) {
      loadCategoriesAndMap();
      loadProducts();
    }
  }, [activeVersion]);

  // Load category dictionary from app_settings
  const loadCategoriesAndMap = async () => {
    if (!activeVersion) return;
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('version_id', activeVersion.id)
        .eq('key', `categories_map_${activeVersion.id}`)
        .maybeSingle();

      if (data?.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          const mergedCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...parsed.categories]));
          setCategories(mergedCategories);
        }
        if (parsed.map && typeof parsed.map === 'object') {
          setCategoryMap(parsed.map);
        }
      }
    } catch (e) {
      console.error('Failed to load categories map', e);
    }
  };

  const loadProducts = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('version_id', activeVersion.id);

    if (error) {
      toast.error('فشل في تحميل المنتجات');
    } else {
      setProducts(sortProductsAscending(data || []));
    }
    setLoading(false);
  };

  // Helper to persist categories
  const saveCategoryUpdate = async (newCats: string[], newMap: Record<string, string>) => {
    setCategories(newCats);
    setCategoryMap(newMap);
    if (!activeVersion) return;
    try {
      await supabase.from('app_settings').upsert({
        version_id: activeVersion.id,
        key: `categories_map_${activeVersion.id}`,
        value: JSON.stringify({ categories: newCats, map: newMap }),
      }, { onConflict: 'key,version_id' });
    } catch (e) {
      console.error('Failed to save category map', e);
    }
  };

  // Handle printer preset change
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    localStorage.setItem('bambino_label_preset', presetId);
  };

  const handleCustomWidthChange = (val: string) => {
    setCustomWidth(val);
    localStorage.setItem('bambino_label_custom_w', val);
  };

  const handleCustomHeightChange = (val: string) => {
    setCustomHeight(val);
    localStorage.setItem('bambino_label_custom_h', val);
  };

  const getActiveLabelDims = () => {
    if (selectedPreset === 'custom') {
      const w = parseFloat(customWidth) || 50;
      const h = parseFloat(customHeight) || 30;
      return { width: w, height: h };
    }
    const found = LABEL_PRESETS.find(p => p.id === selectedPreset);
    return { width: found ? found.width : 50, height: found ? found.height : 30 };
  };

  // Main list filtering
  const filteredProducts = products.filter((p) => {
    const matchesSearch = searchCode
      ? p.code.toLowerCase().includes(searchCode.toLowerCase()) ||
        p.name.toLowerCase().includes(searchCode.toLowerCase())
      : true;
    const cat = getCategoryForProduct(p, categoryMap);
    const matchesCategory = selectedCategory === 'ALL' || cat === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Print list filtering
  const printFilteredProducts = sortProductsAscending(
    products.filter((p) => {
      const matchesSearch = printSearchCode
        ? p.code.toLowerCase().includes(printSearchCode.toLowerCase()) ||
          p.name.toLowerCase().includes(printSearchCode.toLowerCase())
        : true;
      const cat = getCategoryForProduct(p, categoryMap);
      const matchesCategory = printCategory === 'ALL' || cat === printCategory;
      return matchesSearch && matchesCategory;
    })
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVersion) return;

    if (!formData.code || !formData.name) {
      toast.error('الكود والاسم مطلوبان');
      return;
    }

    try {
      const payload: any = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: formData.price,
        stock_quantity: formData.stock_quantity,
        low_stock_threshold: formData.low_stock_threshold,
      };

      if (formData.category) {
        payload.category = formData.category.trim();
      }

      let targetId = editingProduct?.id;

      if (editingProduct) {
        let { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id);

        if (error && error.message?.includes('category')) {
          delete payload.category;
          const retry = await supabase.from('products').update(payload).eq('id', editingProduct.id);
          error = retry.error;
        }

        if (error) throw error;
        toast.success('تم تحديث المنتج');
      } else {
        let { data: inserted, error } = await supabase.from('products').insert({
          ...payload,
          version_id: activeVersion.id,
        }).select('id').maybeSingle();

        if (error && error.message?.includes('category')) {
          delete payload.category;
          const retry = await supabase.from('products').insert({
            ...payload,
            version_id: activeVersion.id,
          }).select('id').maybeSingle();
          error = retry.error;
          inserted = retry.data;
        }

        if (error) throw error;
        if (inserted?.id) targetId = inserted.id;
        toast.success('تم إضافة المنتج');
      }

      // Persist category in settings map
      if (formData.category) {
        const cat = formData.category.trim();
        const updatedCats = categories.includes(cat) ? categories : [...categories, cat];
        const updatedMap = { ...categoryMap, [formData.code]: cat, ...(targetId ? { [targetId]: cat } : {}) };
        await saveCategoryUpdate(updatedCats, updatedMap);
      }

      // Check stock alert
      if (formData.stock_quantity <= 10) {
        sendStockAlertTelegram({
          code: formData.code,
          name: formData.name,
          stock_quantity: formData.stock_quantity,
        });
      }

      setDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const cat = getCategoryForProduct(product, categoryMap);
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description || '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
      category: cat === 'عام' ? '' : cat,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast.error('فشل في حذف المنتج');
    } else {
      toast.success('تم حذف المنتج');
      loadProducts();
    }
  };

  // Excel Sheet Import logic
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeVersion) return;

    setIsImporting(true);
    toast.info('جاري قراءة واستيراد ملف الإكسيل...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        toast.error('ملف الإكسيل فارغ');
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const findValue = (row: Record<string, any>, keywords: string[]) => {
        const key = Object.keys(row).find(k =>
          keywords.some(kw => k.trim().toLowerCase() === kw.toLowerCase() || k.trim().toLowerCase().includes(kw.toLowerCase()))
        );
        return key !== undefined ? row[key] : undefined;
      };

      let successCount = 0;
      let failCount = 0;
      const failures: ImportFailure[] = [];
      const newMap = { ...categoryMap };
      const newCats = [...categories];

      // Process rows
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2;

        const codeVal = findValue(row, ['الكود', 'كود', 'code', 'Code']);
        const nameVal = findValue(row, ['الاسم', 'اسم', 'name', 'Name']);
        const priceVal = findValue(row, ['السعر', 'سعر', 'price', 'Price']);
        const descVal = findValue(row, ['السعر/عدد الثري', 'عدد الثري', 'الثري', 'description', 'الوصف', 'وصف']);
        const stockVal = findValue(row, ['الكمية (قطع ليس ثريهات)', 'قطع ليس ثريهات', 'الكمية', 'كمية', 'stock', 'quantity']);
        const thresholdVal = findValue(row, ['حد التنبيه', 'التنبيه', 'تنبيه', 'threshold']);
        const catVal = findValue(row, ['التصنيف', 'فئة', 'الفئة', 'القسم', 'قسم', 'category', 'Category']);

        const code = codeVal !== undefined && codeVal !== null ? String(codeVal).trim() : '';
        const name = nameVal !== undefined && nameVal !== null ? String(nameVal).trim() : '';

        if (!code) {
          failCount++;
          failures.push({ row: rowNum, name, reason: 'كود المنتج مفقود' });
          continue;
        }

        if (!name) {
          failCount++;
          failures.push({ row: rowNum, code, reason: 'اسم المنتج مفقود' });
          continue;
        }

        const price = parseFloat(String(priceVal)) || 0;
        const descRaw = descVal !== undefined && descVal !== null ? String(descVal).trim() : '';
        let description = descRaw;
        if (descRaw) {
          if (descRaw.includes('/')) {
            description = descRaw;
          } else {
            description = `${price}/${descRaw}`;
          }
        }
        const stock_quantity = parseInt(String(stockVal)) || 0;
        const low_stock_threshold = thresholdVal !== undefined && thresholdVal !== null && String(thresholdVal).trim() !== ''
          ? parseInt(String(thresholdVal)) || 10
          : 10;

        let detectedCat = catVal ? String(catVal).trim() : '';
        if (!detectedCat) {
          detectedCat = getCategoryForProduct({ id: '', code, name, description, price, stock_quantity, low_stock_threshold, image_url: null }, categoryMap);
        }
        if (detectedCat && detectedCat !== 'عام') {
          newMap[code] = detectedCat;
          if (!newCats.includes(detectedCat)) {
            newCats.push(detectedCat);
          }
        }

        try {
          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('version_id', activeVersion.id)
            .eq('code', code)
            .maybeSingle();

          if (existing) {
            const { error: updateError } = await supabase
              .from('products')
              .update({
                name,
                description,
                price,
                stock_quantity,
                low_stock_threshold,
                category: detectedCat || null,
              })
              .eq('id', existing.id);

            if (updateError) {
              await supabase
                .from('products')
                .update({ name, description, price, stock_quantity, low_stock_threshold })
                .eq('id', existing.id);
            }
          } else {
            const { error: insertError } = await supabase
              .from('products')
              .insert({
                code,
                name,
                description,
                price,
                stock_quantity,
                low_stock_threshold,
                category: detectedCat || null,
                version_id: activeVersion.id,
              });

            if (insertError) {
              await supabase
                .from('products')
                .insert({
                  code,
                  name,
                  description,
                  price,
                  stock_quantity,
                  low_stock_threshold,
                  version_id: activeVersion.id,
                });
            }
          }

          successCount++;
        } catch (err: any) {
          failCount++;
          failures.push({
            row: rowNum,
            code,
            name,
            reason: err.message || 'حدث خطأ أثناء الحفظ في قاعدة البيانات',
          });
        }
      }

      await saveCategoryUpdate(newCats, newMap);

      setImportReport({
        total: rawRows.length,
        success: successCount,
        failed: failCount,
        failures,
      });

      setReportDialogOpen(true);
      await loadProducts();

      if (failCount === 0) {
        toast.success(`تم استيراد جميع المنتجات بنجاح (${successCount} منتج)`);
      } else {
        toast.warning(`تم استيراد ${successCount} منتج وتخطي ${failCount} منتج`);
      }
    } catch (err: any) {
      toast.error(`فشل في قراءة ملف الإكسيل: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateQRDataUrl = async (code: string): Promise<string> => {
    return await QRCode.toDataURL(code, {
      width: 140,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  };

  const generateQR = async (product: Product) => {
    try {
      const url = await generateQRDataUrl(product.code);
      setQrImageUrl(url);
      setSelectedProduct(product);
      setQrDialogOpen(true);
    } catch (err) {
      toast.error('فشل في إنشاء QR');
    }
  };

  const printSingleLabel = async (product: Product) => {
    try {
      const qrDataUrl = await generateQRDataUrl(product.code);
      printLabels([{ product, qrDataUrl }]);
    } catch (err) {
      toast.error('فشل في طباعة الباركود');
    }
  };

  const printSelectedLabels = async () => {
    if (selectedForPrint.size === 0) {
      toast.error('يرجى اختيار منتج واحد على الأقل');
      return;
    }

    try {
      const selectedList = products.filter(p => selectedForPrint.has(p.id));
      const sortedSelected = sortProductsAscending(selectedList);

      const labelData = await Promise.all(
        sortedSelected.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );

      printLabels(labelData);
      setPrintDialogOpen(false);
      setSelectedForPrint(new Set());
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  const printAllCurrentFiltered = async () => {
    try {
      const targetList = sortProductsAscending(printFilteredProducts);
      if (targetList.length === 0) {
        toast.error('لا توجد منتجات مطابقة للطباعة');
        return;
      }
      const labelData = await Promise.all(
        targetList.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );
      printLabels(labelData);
      setPrintDialogOpen(false);
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  // Print all QR codes for a selected category
  const printCategoryAllLabels = async (cat: string) => {
    try {
      const targetList = sortProductsAscending(
        cat === 'ALL'
          ? products
          : products.filter(p => getCategoryForProduct(p, categoryMap) === cat)
      );

      if (targetList.length === 0) {
        toast.error(`لا توجد منتجات في فئة "${cat}"`);
        return;
      }

      toast.info(`جاري تجهيز ${targetList.length} باركود لفئة "${cat === 'ALL' ? 'كل المنتجات' : cat}"...`);

      const labelData = await Promise.all(
        targetList.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );

      printLabels(labelData);
      toast.success(`تم فتح شاشة الطباعة لـ ${targetList.length} ملصق`);
    } catch (err) {
      toast.error('فشل في تجهيز الباركودات للطباعة');
    }
  };

  const printRangeLabels = async () => {
    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    if (isNaN(start) || isNaN(end) || start > end) {
      toast.error('أدخل نطاق صحيح');
      return;
    }
    try {
      const rangeProducts = sortProductsAscending(
        products.filter(p => {
          const num = parseInt(p.code.replace(/\D/g, ''));
          const matchesCategory = printCategory === 'ALL' || getCategoryForProduct(p, categoryMap) === printCategory;
          return !isNaN(num) && num >= start && num <= end && matchesCategory;
        })
      );

      if (rangeProducts.length === 0) {
        toast.error('لا توجد منتجات في هذا النطاق');
        return;
      }

      const labelData = await Promise.all(
        rangeProducts.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );
      printLabels(labelData);
      toast.success(`تم طباعة ${rangeProducts.length} باركود`);
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  // Print 1 calibration test label to test dimensions and alignment
  const printTestCalibrationLabel = async () => {
    const { width: w, height: h } = getActiveLabelDims();
    const testProduct: Product = {
      id: 'test-calibration',
      code: '77101001',
      name: `بامبينو - تجربة مقاس ${w}×${h} مم`,
      description: 'معايرة الطابعة 100%',
      price: 780,
      stock_quantity: 1,
      low_stock_threshold: 1,
      image_url: null,
      category: 'معايرة',
    };
    try {
      const qrDataUrl = await generateQRDataUrl(testProduct.code);
      printLabels([{ product: testProduct, qrDataUrl }], true);
      toast.success(`جاري طباعة ملصق معايرة تجريبي (${w} × ${h} مم)`);
    } catch (e) {
      toast.error('فشل في طباعة ملصق المعايرة');
    }
  };

  // Main printing engine with dynamic mm calculations
  const printLabels = (labels: { product: Product; qrDataUrl: string }[], isTest = false) => {
    const { width: w, height: h } = getActiveLabelDims();

    // Proportional sizing based on label dimensions
    const qrSizeMm = Math.max(12, Math.min(w * 0.35, h * 0.72));
    const qrColWidthMm = qrSizeMm + 3.5;
    const paddingVerticalMm = Math.max(0.8, h * 0.04);
    const paddingHorizontalMm = Math.max(1.0, w * 0.03);
    
    // Proportional fonts
    const codeFontSizePt = h >= 35 ? 11 : h >= 28 ? 9.5 : 8;
    const priceFontSizePt = h >= 35 ? 11 : h >= 28 ? 9.5 : 8;
    const nameFontSizePt = h >= 35 ? 8 : h >= 28 ? 7.2 : 6.2;
    const nameMaxHeightMm = Math.max(4.2, h * 0.28);

    const labelsHtml = labels.map(({ product, qrDataUrl }) => `
      <div class="label ${isTest ? 'test-label' : ''}">
        <div class="info">
          <div class="code">${product.code}</div>
          <div class="price">${product.price} ج.م</div>
          ${product.description ? `<div class="desc">${product.description}</div>` : ''}
        </div>
        <div class="qr-section">
          <img src="${qrDataUrl}" alt="QR" class="qr-code" />
          <div class="name">${product.name}</div>
        </div>
      </div>
    `).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html dir="ltr" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>طباعة الباركود (${w}x${h} مم)</title>
        <style>
          @page {
            size: ${w}mm ${h}mm;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: ${w}mm;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          body {
            font-family: Arial, Tahoma, sans-serif;
          }
          .label {
            width: ${w}mm;
            height: ${h}mm;
            padding: ${paddingVerticalMm}mm ${paddingHorizontalMm}mm;
            display: grid;
            grid-template-columns: 1fr ${qrColWidthMm}mm;
            align-items: center;
            column-gap: 0.8mm;
            page-break-after: always;
            overflow: hidden;
            background: #fff;
            position: relative;
          }
          .label:last-child {
            page-break-after: auto;
          }
          .test-label {
            outline: 1px dashed #000;
            outline-offset: -1px;
          }
          .info {
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-end;
            gap: 0.8mm;
            text-align: right;
          }
          .code {
            font-size: ${codeFontSizePt}pt;
            font-weight: 900;
            color: #000;
            white-space: nowrap;
            letter-spacing: 0.5px;
          }
          .price {
            font-size: ${priceFontSizePt}pt;
            font-weight: bold;
            color: #000;
            white-space: nowrap;
          }
          .desc {
            font-size: ${Math.max(5.5, codeFontSizePt - 2.5)}pt;
            color: #333;
            direction: rtl;
            white-space: nowrap;
          }
          .qr-section {
            width: ${qrColWidthMm}mm;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.4mm;
          }
          .qr-code {
            width: ${qrSizeMm}mm;
            height: ${qrSizeMm}mm;
            object-fit: contain;
            image-rendering: pixelated;
          }
          .name {
            font-size: ${nameFontSizePt}pt;
            color: #000;
            text-align: center;
            direction: rtl;
            font-weight: bold;
            line-height: 1.1;
            width: ${qrColWidthMm}mm;
            max-height: ${nameMaxHeightMm}mm;
            overflow: hidden;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  const toggleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedForPrint);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedForPrint(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedForPrint.size === printFilteredProducts.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(printFilteredProducts.map(p => p.id)));
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      price: 0,
      stock_quantity: 0,
      low_stock_threshold: 10,
      category: '',
    });
    setIsCreatingCategory(false);
    setNewCategoryInput('');
  };

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  const activePresetInfo = LABEL_PRESETS.find(p => p.id === selectedPreset);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <div className="flex gap-2 flex-wrap">
          {/* Excel Import Hidden Input & Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <Button
            variant="outline"
            className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isImporting ? 'جاري الاستيراد...' : 'استيراد من إكسيل'}
          </Button>

          <Button variant="outline" className="gap-2" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="h-4 w-4" />
            طباعة الباركود
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>الكود *</Label>
                    <Input
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label>السعر *</Label>
                    <Input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label>الاسم *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* Category Selection with On-the-Fly Creation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>التصنيف (الفئة)</Label>
                    {!isCreatingCategory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-primary px-1.5 hover:bg-primary/10"
                        onClick={() => setIsCreatingCategory(true)}
                      >
                        <Plus className="h-3 w-3 ml-1" /> إضافة تصنيف جديد
                      </Button>
                    )}
                  </div>

                  {isCreatingCategory ? (
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="اسم التصنيف الجديد (مثلاً: بيجامات)"
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value)}
                        className="h-9 text-sm"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3 shrink-0"
                        onClick={async () => {
                          const trimmed = newCategoryInput.trim();
                          if (!trimmed) return;
                          if (!categories.includes(trimmed)) {
                            const updated = [...categories, trimmed];
                            await saveCategoryUpdate(updated, categoryMap);
                          }
                          setFormData({ ...formData, category: trimmed });
                          setNewCategoryInput('');
                          setIsCreatingCategory(false);
                          toast.success(`تمت إضافة وتحديد تصنيف "${trimmed}"`);
                        }}
                      >
                        <Check className="h-4 w-4 ml-1" />
                        حفظ
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-2.5 shrink-0"
                        onClick={() => {
                          setIsCreatingCategory(false);
                          setNewCategoryInput('');
                        }}
                      >
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingCategory(true);
                        } else {
                          setFormData({ ...formData, category: e.target.value });
                        }
                      }}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">-- اختر التصنيف --</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__NEW__">+ إضافة تصنيف جديد...</option>
                    </select>
                  )}
                </div>

                <div>
                  <Label>السعر/عدد الثري</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="مثلاً: 780/5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>الكمية (قطع ليس ثريهات)</Label>
                    <Input
                      type="number"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label>حد التنبيه</Label>
                    <Input
                      type="number"
                      value={formData.low_stock_threshold}
                      onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 10 })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {editingProduct ? 'تحديث' : 'إضافة'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Category Filter Pills Bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <Button
            variant={selectedCategory === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('ALL')}
            className="rounded-full shrink-0 text-xs gap-1.5 h-8 font-medium"
          >
            <span>الكل</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedCategory === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
              {products.length}
            </span>
          </Button>

          {categories.map((cat) => {
            const count = products.filter(p => getCategoryForProduct(p, categoryMap) === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <Button
                key={cat}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                className="rounded-full shrink-0 text-xs gap-1.5 h-8 font-medium"
              >
                <span>{cat}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث بالكود أو الاسم..."
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          className="pr-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filteredProducts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد منتجات مطابقة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => {
            const productCat = getCategoryForProduct(product, categoryMap);
            return (
              <Card key={product.id} className="overflow-hidden hover:shadow-baby transition-shadow">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <ProductImage imageUrl={product.image_url} alt={product.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs text-muted-foreground font-mono">#{product.code}</span>
                        {productCat && productCat !== 'عام' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                            {productCat}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-bold truncate text-sm">{product.name}</h3>
                      {product.description && (
                        <p className="text-xs text-muted-foreground truncate">{product.description}</p>
                      )}
                      <p className="text-sm text-primary font-bold mt-0.5">{product.price} ج.م</p>
                      <p className={`text-xs ${product.stock_quantity <= product.low_stock_threshold ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                        المخزون: {product.stock_quantity}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => generateQR(product)} title="عرض QR">
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printSingleLabel(product)} title="طباعة باركود">
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(product)} title="تعديل">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(product.id)} title="حذف">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            <div className="border-2 border-border rounded-lg p-4 bg-white">
              <img src={qrImageUrl} alt="QR Code" className="w-32 h-32 mx-auto" />
              <div className="mt-2 text-center">
                <p className="text-lg font-bold text-black font-mono">#{selectedProduct?.code}</p>
                <p className="text-sm text-gray-700 truncate max-w-[180px]">{selectedProduct?.name}</p>
                <p className="text-md font-bold text-black">{selectedProduct?.price} ج.م</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = qrImageUrl;
                  link.download = `qr-${selectedProduct?.code}.png`;
                  link.click();
                }}
              >
                تحميل
              </Button>
              {selectedProduct && (
                <Button onClick={() => printSingleLabel(selectedProduct)}>
                  <Printer className="h-4 w-4 ml-2" />
                  طباعة
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Selection Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={(open) => { setPrintDialogOpen(open); if (!open) setPrintSearchCode(''); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                طباعة الباركود والملصقات الحرارية
              </DialogTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowPrinterSettings(!showPrinterSettings)}
              >
                <Sliders className="h-3.5 w-3.5" />
                {showPrinterSettings ? 'إخفاء إعدادات الطابعة' : 'إعدادات مقاس الطابعة'}
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Thermal Printer Auto-Fitting & Preset Settings */}
            <div className={`p-3 border rounded-lg bg-muted/40 transition-all ${showPrinterSettings ? 'block' : 'hidden'}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  📐 مقاس ملصق الطابعة الحرارية (تثبيت الحجم تلقائياً):
                </h4>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs border-primary/40 text-primary gap-1"
                  onClick={printTestCalibrationLabel}
                  title="طباعة ملصق تجريبي واحد للتأكد من المقاس قبل الطباعة الجماعية"
                >
                  🎯 طباعة ملصق تجريبي للمعايرة
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LABEL_PRESETS.map((p) => {
                  const isCur = selectedPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePresetChange(p.id)}
                      className={`text-right p-2 rounded-md border text-xs transition-all ${
                        isCur 
                          ? 'border-primary bg-primary/10 font-bold text-primary ring-1 ring-primary' 
                          : 'border-border bg-background hover:bg-muted/70 text-muted-foreground'
                      }`}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[10px] opacity-75 line-clamp-1">{p.desc}</div>
                    </button>
                  );
                })}
              </div>

              {selectedPreset === 'custom' && (
                <div className="flex items-center gap-3 mt-2.5 pt-2 border-t text-xs">
                  <span className="font-medium">الأبعاد المخصصة:</span>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">العرض (مم):</Label>
                    <Input
                      type="number"
                      value={customWidth}
                      onChange={(e) => handleCustomWidthChange(e.target.value)}
                      className="w-16 h-7 text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">الارتفاع (مم):</Label>
                    <Input
                      type="number"
                      value={customHeight}
                      onChange={(e) => handleCustomHeightChange(e.target.value)}
                      className="w-16 h-7 text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground mt-2">
                💡 يتم حفظ هذا المقاس تلقائياً في المتصفح. يقوم النظام بضبط حجم الـ QR والنصوص بدقة متناهية ليناسب المقاس المختار دون خروج أي عنصر خارج الملصق.
              </p>
            </div>

            {/* Quick Status Bar for Printer Preset */}
            {!showPrinterSettings && (
              <div className="flex items-center justify-between text-xs bg-muted/30 px-3 py-1.5 rounded-md border text-muted-foreground">
                <span>المقاس المعتمد للطباعة: <strong>{activePresetInfo?.name || '50 × 30 مم'}</strong></span>
                <button 
                  type="button" 
                  onClick={printTestCalibrationLabel}
                  className="text-primary hover:underline font-medium"
                >
                  🎯 تجربة ملصق معايرة
                </button>
              </div>
            )}

            {/* Category Filter for Printing */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">تصفية حسب التصنيف للطباعة الجماعية:</Label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <Button
                  variant={printCategory === 'ALL' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPrintCategory('ALL')}
                  className="rounded-full shrink-0 text-xs gap-1 h-7"
                >
                  <span>الكل</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${printCategory === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
                    {products.length}
                  </span>
                </Button>

                {categories.map((cat) => {
                  const count = products.filter(p => getCategoryForProduct(p, categoryMap) === cat).length;
                  const isSelected = printCategory === cat;
                  return (
                    <Button
                      key={cat}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPrintCategory(cat)}
                      className="rounded-full shrink-0 text-xs gap-1 h-7"
                    >
                      <span>{cat}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
                        {count}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Primary Action Button: Print all barcodes of the active category with 1 click! */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {printCategory === 'ALL'
                    ? `طباعة باركودات جميع المنتجات (${products.length} منتج)`
                    : `طباعة جميع باركودات فئة "${printCategory}" (${products.filter(p => getCategoryForProduct(p, categoryMap) === printCategory).length} منتج)`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  طباعة دفعة واحدة فورية لجميع الباركودات في هذا التصنيف
                </p>
              </div>
              <Button 
                onClick={() => printCategoryAllLabels(printCategory)}
                className="gap-1.5 font-bold shadow-sm"
              >
                <Printer className="h-4 w-4" />
                {printCategory === 'ALL' 
                  ? `طباعة الكل (${products.length})` 
                  : `طباعة فئة ${printCategory} (${products.filter(p => getCategoryForProduct(p, categoryMap) === printCategory).length})`}
              </Button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالكود أو الاسم داخل الفئة..."
                value={printSearchCode}
                onChange={(e) => setPrintSearchCode(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Range & Selection Controls */}
            <div className="flex items-center gap-2 p-2.5 border rounded-lg bg-muted/50 flex-wrap text-xs">
              <span className="font-semibold shrink-0">طباعة بنطاق أكواد:</span>
              <Label className="shrink-0">من</Label>
              <Input
                type="number"
                placeholder="77101001"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-24 h-8 text-xs font-mono"
                dir="ltr"
              />
              <Label className="shrink-0">إلى</Label>
              <Input
                type="number"
                placeholder="77101020"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-24 h-8 text-xs font-mono"
                dir="ltr"
              />
              <Button onClick={printRangeLabels} size="sm" className="h-8 shrink-0">
                <Printer className="h-3.5 w-3.5 ml-1" />
                طباعة النطاق
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={toggleSelectAll} className="h-8 gap-1">
                {selectedForPrint.size === printFilteredProducts.length && printFilteredProducts.length > 0 ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                تحديد الكل
              </Button>
              <Button 
                size="sm" 
                onClick={printSelectedLabels} 
                disabled={selectedForPrint.size === 0}
                className="h-8"
              >
                طباعة المحدد ({selectedForPrint.size})
              </Button>
            </div>

            {/* Products Selection List */}
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
              {printFilteredProducts.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs">
                  لا توجد منتجات مطابقة لهذا البحث أو التصنيف
                </div>
              ) : (
                printFilteredProducts.map((product) => {
                  const isSel = selectedForPrint.has(product.id);
                  const pCat = getCategoryForProduct(product, categoryMap);
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center gap-3 p-2.5 hover:bg-muted/70 cursor-pointer transition-colors ${
                        isSel ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => toggleSelectProduct(product.id)}
                    >
                      {isSel ? (
                        <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs truncate">{product.name}</p>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                            {pCat}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">#{product.code}</p>
                      </div>
                      <p className="font-bold text-xs text-primary">{product.price} ج.م</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              تقرير استيراد المنتجات من إكسيل
            </DialogTitle>
          </DialogHeader>

          {importReport && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3 bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground">إجمالي الصفوف</p>
                  <p className="text-xl font-bold">{importReport.total}</p>
                </div>
                <div className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> الناجح
                  </p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{importReport.success}</p>
                </div>
                <div className="border border-rose-200 bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> الفاشل
                  </p>
                  <p className="text-xl font-bold text-rose-700 dark:text-rose-400">{importReport.failed}</p>
                </div>
              </div>

              {importReport.failures.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                    تفاصيل الصفوف التي تعذر استيرادها ({importReport.failures.length})
                  </h4>
                  <div className="border rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="p-2 border-b">رقم الصف</th>
                          <th className="p-2 border-b">الكود</th>
                          <th className="p-2 border-b">الاسم</th>
                          <th className="p-2 border-b">سبب الفشل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importReport.failures.map((f, idx) => (
                          <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="p-2 font-mono">{f.row}</td>
                            <td className="p-2 font-mono">{f.code || '-'}</td>
                            <td className="p-2">{f.name || '-'}</td>
                            <td className="p-2 text-rose-600 font-medium">{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg text-center text-emerald-800 dark:text-emerald-300 text-sm font-medium">
                  🎉 تم استيراد جميع المنتجات في الملف بنجاح دون أي أخطاء!
                </div>
              )}

              <Button className="w-full mt-2" onClick={() => setReportDialogOpen(false)}>
                إغلاق التقرير
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
