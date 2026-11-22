import { useEffect, useState, useMemo } from 'react';
import { 
  TrendingUp, Search, Calendar, Download, RefreshCw, 
  Package, ShoppingBag, DollarSign, Award, AlertCircle, 
  ArrowUpDown, Filter, Eye, ChevronRight, CheckCircle2,
  TrendingDown, Layers, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { getDescriptionMultiplier } from '@/contexts/CartContext';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_description?: string | null;
  price: number;
  quantity: number;
  created_at: string;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  phone: string;
  status: string;
  created_at: string;
  order_items?: OrderItem[];
}

interface SaleDetail {
  orderNumber: number;
  customerName: string;
  phone: string;
  date: string;
  series: number;
  pieces: number;
  revenue: number;
}

interface ProductStat {
  product: Product;
  category: string;
  multiplier: number;
  seriesSold: number;
  piecesSold: number;
  revenue: number;
  revenueShare: number; // percentage
  salesList: SaleDetail[];
  status: 'top' | 'medium' | 'low' | 'zero';
}

const DEFAULT_CATEGORIES = ['وسط', 'بيبى', 'محير', 'كبير'];

const getCategoryForProduct = (p: Product, map: Record<string, string>): string => {
  if (p.category && p.category.trim()) return p.category.trim();
  const c = String(p.code || '').trim();
  if (c && map[c]) return map[c];
  if (p.id && map[p.id]) return map[p.id];
  
  const name = String(p.name || '').trim();
  if (name.includes('كبير')) return 'كبير';
  if (name.includes('بيبى') || name.includes('بيبي')) return 'بيبى';
  if (name.includes('محير')) return 'محير';
  if (name.includes('وسط')) return 'وسط';
  
  return 'وسط';
};

const ProductsAnalysis = () => {
  const { activeVersion } = useVersion();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [salesFilter, setSalesFilter] = useState<'ALL' | 'TOP' | 'LOW' | 'ZERO' | 'LOW_STOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'piecesDesc' | 'piecesAsc' | 'revenueDesc' | 'stockAsc' | 'stockDesc' | 'codeAsc'>('piecesDesc');

  // Detail Modal State
  const [selectedProductStat, setSelectedProductStat] = useState<ProductStat | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    if (activeVersion) {
      loadData();
    }
  }, [activeVersion]);

  const loadData = async () => {
    if (!activeVersion) return;
    setLoading(true);
    try {
      const [prodsRes, settingsRes, ordersRes] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('version_id', activeVersion.id),
        supabase
          .from('app_settings')
          .select('value')
          .eq('version_id', activeVersion.id)
          .eq('key', `categories_map_${activeVersion.id}`)
          .maybeSingle(),
        supabase
          .from('orders')
          .select('id, order_number, customer_name, phone, status, created_at, order_items(*)')
          .eq('version_id', activeVersion.id)
          .neq('status', 'cancelled')
      ]);

      let loadedMap: Record<string, string> = {};
      if (settingsRes.data?.value) {
        try {
          const parsed = JSON.parse(settingsRes.data.value);
          if (parsed.map) {
            loadedMap = parsed.map;
            setCategoryMap(loadedMap);
          }
          if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
            const valid = parsed.categories.filter((c: string) => !['جاكيت', 'سويت شيرت', 'طقم', 'بلوفر', 'جيب', 'بنطلون', 'بلوزة', 'قميص'].includes(c));
            setCategories(Array.from(new Set([...DEFAULT_CATEGORIES, ...(valid.length > 0 ? valid : DEFAULT_CATEGORIES)])));
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (prodsRes.error) {
        toast.error('فشل في تحميل المنتجات');
      } else {
        const enriched = (prodsRes.data || []).map((p: Product) => ({
          ...p,
          category: p.category || loadedMap[p.code] || getCategoryForProduct(p, loadedMap),
        }));
        setProducts(enriched);
      }

      if (ordersRes.error) {
        toast.error('فشل في تحميل الطلبات');
      } else {
        setOrders(ordersRes.data || []);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    const now = new Date();

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);

      if (datePreset === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return orderDate >= start && orderDate <= end;
      }

      if (datePreset === 'yesterday') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        return orderDate >= start && orderDate <= end;
      }

      if (datePreset === 'last7') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return orderDate >= start && orderDate <= now;
      }

      if (datePreset === 'last30') {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return orderDate >= start && orderDate <= now;
      }

      if (datePreset === 'thisMonth') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        return orderDate >= start && orderDate <= now;
      }

      if (datePreset === 'custom') {
        if (!customStartDate && !customEndDate) return true;
        const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : new Date(0);
        const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : new Date(8640000000000000);
        return orderDate >= start && orderDate <= end;
      }

      return true; // all
    });
  }, [orders, datePreset, customStartDate, customEndDate]);

  // Aggregate product metrics
  const productStats = useMemo(() => {
    // Map product sales
    const salesMap: Record<string, { series: number; pieces: number; revenue: number; list: SaleDetail[] }> = {};

    filteredOrders.forEach(order => {
      const items = order.order_items || [];
      items.forEach(item => {
        const pCode = String(item.product_code || '').trim();
        const pId = item.product_id;
        const key = pCode || pId;

        const mult = getDescriptionMultiplier(item.product_description);
        const series = item.quantity || 0;
        const pieces = series * mult;
        const rev = (item.price || 0) * series;

        if (!salesMap[key]) {
          salesMap[key] = { series: 0, pieces: 0, revenue: 0, list: [] };
        }
        salesMap[key].series += series;
        salesMap[key].pieces += pieces;
        salesMap[key].revenue += rev;
        salesMap[key].list.push({
          orderNumber: order.order_number,
          customerName: order.customer_name,
          phone: order.phone,
          date: order.created_at,
          series,
          pieces,
          revenue: rev,
        });
      });
    });

    // Calculate total period revenue
    let totalPeriodRevenue = 0;
    Object.values(salesMap).forEach(s => {
      totalPeriodRevenue += s.revenue;
    });

    // Build stats array for all products
    const list: ProductStat[] = products.map(product => {
      const code = String(product.code || '').trim();
      const mult = getDescriptionMultiplier(product.description);
      const cat = getCategoryForProduct(product, categoryMap);

      const sales = salesMap[code] || salesMap[product.id] || { series: 0, pieces: 0, revenue: 0, list: [] };
      const revenueShare = totalPeriodRevenue > 0 ? (sales.revenue / totalPeriodRevenue) * 100 : 0;

      let status: 'top' | 'medium' | 'low' | 'zero' = 'zero';
      if (sales.pieces > 0) {
        if (sales.pieces >= 15) {
          status = 'top';
        } else if (sales.pieces >= 5) {
          status = 'medium';
        } else {
          status = 'low';
        }
      }

      return {
        product,
        category: cat,
        multiplier: mult,
        seriesSold: sales.series,
        piecesSold: sales.pieces,
        revenue: sales.revenue,
        revenueShare,
        salesList: sales.list,
        status,
      };
    });

    return list;
  }, [products, filteredOrders, categoryMap]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalPieces = 0;
    let totalSeries = 0;
    let totalRevenue = 0;
    let productsWithSales = 0;
    let productsZeroSales = 0;

    let topProduct: ProductStat | null = null;

    productStats.forEach(stat => {
      totalPieces += stat.piecesSold;
      totalSeries += stat.seriesSold;
      totalRevenue += stat.revenue;

      if (stat.piecesSold > 0) {
        productsWithSales++;
        if (!topProduct || stat.piecesSold > topProduct.piecesSold) {
          topProduct = stat;
        }
      } else {
        productsZeroSales++;
      }
    });

    return {
      totalPieces,
      totalSeries,
      totalRevenue,
      productsWithSales,
      productsZeroSales,
      totalProducts: products.length,
      topProduct,
    };
  }, [productStats, products.length]);

  // Top 5 & Low 5 Products for Quick Insights
  const top5Products = useMemo(() => {
    return [...productStats]
      .filter(p => p.piecesSold > 0)
      .sort((a, b) => b.piecesSold - a.piecesSold)
      .slice(0, 5);
  }, [productStats]);

  const zeroOrLowSalesProducts = useMemo(() => {
    return [...productStats]
      .filter(p => p.piecesSold === 0)
      .slice(0, 5);
  }, [productStats]);

  // Filtered & Sorted Product List for Display
  const displayedStats = useMemo(() => {
    let result = productStats.filter(stat => {
      // Category Filter
      if (selectedCategory !== 'ALL' && stat.category !== selectedCategory) {
        return false;
      }

      // Sales Filter
      if (salesFilter === 'TOP' && stat.piecesSold <= 0) return false;
      if (salesFilter === 'LOW' && (stat.piecesSold === 0 || stat.piecesSold > 10)) return false;
      if (salesFilter === 'ZERO' && stat.piecesSold > 0) return false;
      if (salesFilter === 'LOW_STOCK' && stat.product.stock_quantity > stat.product.low_stock_threshold) return false;

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = stat.product.code.toLowerCase().includes(q);
        const matchesName = stat.product.name.toLowerCase().includes(q);
        if (!matchesCode && !matchesName) return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'piecesDesc') return b.piecesSold - a.piecesSold || b.revenue - a.revenue;
      if (sortBy === 'piecesAsc') return a.piecesSold - b.piecesSold || a.revenue - b.revenue;
      if (sortBy === 'revenueDesc') return b.revenue - a.revenue || b.piecesSold - a.piecesSold;
      if (sortBy === 'stockAsc') return a.product.stock_quantity - b.product.stock_quantity;
      if (sortBy === 'stockDesc') return b.product.stock_quantity - a.product.stock_quantity;
      if (sortBy === 'codeAsc') {
        const numA = parseInt(a.product.code.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.product.code.replace(/\D/g, '')) || 0;
        return numA - numB;
      }
      return 0;
    });

    return result;
  }, [productStats, selectedCategory, salesFilter, searchQuery, sortBy]);

  // Export analysis report to Excel
  const exportToExcel = () => {
    if (displayedStats.length === 0) {
      toast.error('لا توجد بيانات لتصديرها');
      return;
    }

    const rows = displayedStats.map((stat, idx) => ({
      'م': idx + 1,
      'الكود': stat.product.code,
      'اسم المنتج': stat.product.name,
      'المقاس/التصنيف': stat.category,
      'السعر الفردي (ج.م)': stat.product.price,
      'عدد الثري': stat.multiplier,
      'الثريهات المباعة': stat.seriesSold,
      'إجمالي القطع المباعة': stat.piecesSold,
      'إجمالي الإيرادات (ج.م)': stat.revenue,
      'نسبة المساهمة (%)': `${stat.revenueShare.toFixed(1)}%`,
      'المخزون الحالي (قطع)': stat.product.stock_quantity,
      'حد التنبيه': stat.product.low_stock_threshold,
      'الحالة': stat.piecesSold > 0 
        ? (stat.piecesSold >= 15 ? 'الأكثر مبيعاً 🔥' : 'مبيعات متوسطة ⚡') 
        : 'راكد / بدون مبيعات 🛑',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'تحليل_المنتجات');

    const dateTag = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `تقرير_تحليل_منتجات_بامبينو_${dateTag}.xlsx`);
    toast.success('تم تصدير ملف الإكسيل بنجاح');
  };

  const getPresetLabel = () => {
    switch (datePreset) {
      case 'today': return 'اليوم';
      case 'yesterday': return 'أمس';
      case 'last7': return 'آخر 7 أيام';
      case 'last30': return 'آخر 30 يوم';
      case 'thisMonth': return 'هذا الشهر';
      case 'custom': return 'فترة مخصصة';
      default: return 'كل الأوقات';
    }
  };

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            تحليل المنتجات والمبيعات
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            متابعة دقيقة للأكثر مبيعاً، الأقل حركة، الإيرادات، والمخزون في أي يوم أو فترة زمنية
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1.5 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
            <Download className="h-3.5 w-3.5" />
            تصدير إكسيل
          </Button>
        </div>
      </div>

      {/* Date & Period Selection Card */}
      <Card className="shadow-sm border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              تحديد الفترة الزمنية للتحليل:
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-primary/10 text-primary rounded-full">
              الفترة الحالية: {getPresetLabel()}
            </span>
          </div>

          {/* Quick Presets Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Button
              size="sm"
              variant={datePreset === 'all' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('all')}
            >
              كل الأوقات
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'today' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('today')}
            >
              اليوم
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'yesterday' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('yesterday')}
            >
              أمس
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'last7' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('last7')}
            >
              آخر 7 أيام
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'last30' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('last30')}
            >
              آخر 30 يوم
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'thisMonth' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('thisMonth')}
            >
              هذا الشهر
            </Button>
            <Button
              size="sm"
              variant={datePreset === 'custom' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 shrink-0"
              onClick={() => setDatePreset('custom')}
            >
              فترة مخصصة...
            </Button>
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-3 pt-2 border-t text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">من تاريخ:</Label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-36 h-8 text-xs font-mono"
                  dir="ltr"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">إلى تاريخ:</Label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-36 h-8 text-xs font-mono"
                  dir="ltr"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                >
                  مسح التاريخ
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Revenue */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">إجمالي الإيرادات</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-foreground">
              {summary.totalRevenue.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">ج.م</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              مبيعات {filteredOrders.length} طلب في الفترة
            </p>
          </CardContent>
        </Card>

        {/* Pieces Sold */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">إجمالي القطع المباعة</span>
              <ShoppingBag className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-black text-primary">
              {summary.totalPieces.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">قطعة</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              ({summary.totalSeries} ثري مبيعات)
            </p>
          </CardContent>
        </Card>

        {/* Top Product */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">المنتج الأكثر مبيعاً 🔥</span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            {summary.topProduct ? (
              <>
                <p className="text-sm font-bold text-foreground truncate" title={summary.topProduct.product.name}>
                  {summary.topProduct.product.name}
                </p>
                <p className="text-xs font-bold text-amber-600 mt-0.5">
                  #{summary.topProduct.product.code} - {summary.topProduct.piecesSold} قطعة
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">لا توجد مبيعات في الفترة</p>
            )}
          </CardContent>
        </Card>

        {/* Active vs Zero Sales */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">حركة المنتجات</span>
              <Package className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-emerald-600">{summary.productsWithSales} نشط</span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-sm font-semibold text-rose-500">{summary.productsZeroSales} راكد</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              من إجمالي {summary.totalProducts} منتج بالمخزن
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 & Bottom 5 Highlights */}
      {summary.productsWithSales > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top 5 Best Sellers */}
          <Card className="border-amber-200 bg-amber-50/20 dark:bg-amber-950/10">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <Award className="h-4 w-4 text-amber-600" />
                أعلى 5 منتجات مبيعاً في هذه الفترة
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {top5Products.map((stat, i) => (
                <div key={stat.product.id} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-background/80 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{stat.product.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">#{stat.product.code} - {stat.category}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="font-bold text-primary">{stat.piecesSold} قطعة</span>
                    <p className="text-[10px] text-muted-foreground">{stat.revenue.toLocaleString()} ج.م</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Zero Sales Alert */}
          <Card className="border-rose-200 bg-rose-50/20 dark:bg-rose-950/10">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                عينة من المنتجات الراكدة (0 مبيعات في الفترة)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {zeroOrLowSalesProducts.map((stat) => (
                <div key={stat.product.id} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-background/80 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{stat.product.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">#{stat.product.code} - {stat.category}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-600 bg-rose-50">
                      المخزون: {stat.product.stock_quantity}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters Bar: Category & Sales Status */}
      <div className="space-y-3">
        {/* Category Filter Pills */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">التصفية حسب المقاس/التصنيف:</Label>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Button
              size="sm"
              variant={selectedCategory === 'ALL' ? 'default' : 'outline'}
              className="rounded-full text-xs h-7 font-medium gap-1 shrink-0"
              onClick={() => setSelectedCategory('ALL')}
            >
              <span>الكل</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedCategory === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
                {products.length}
              </span>
            </Button>
            {categories.map((cat) => {
              const count = products.filter(p => getCategoryForProduct(p, categoryMap) === cat).length;
              const isSel = selectedCategory === cat;
              return (
                <Button
                  key={cat}
                  size="sm"
                  variant={isSel ? 'default' : 'outline'}
                  className="rounded-full text-xs h-7 font-medium gap-1 shrink-0"
                  onClick={() => setSelectedCategory(cat)}
                >
                  <span>{cat}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSel ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'}`}>
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Sales Performance Status Pills */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">حالة المبيعات في هذه الفترة:</Label>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Button
              size="sm"
              variant={salesFilter === 'ALL' ? 'secondary' : 'ghost'}
              className={`rounded-full text-xs h-7 shrink-0 ${salesFilter === 'ALL' ? 'font-bold bg-muted' : ''}`}
              onClick={() => setSalesFilter('ALL')}
            >
              جميع المنتجات ({productStats.length})
            </Button>
            <Button
              size="sm"
              variant={salesFilter === 'TOP' ? 'secondary' : 'ghost'}
              className={`rounded-full text-xs h-7 shrink-0 text-amber-700 ${salesFilter === 'TOP' ? 'font-bold bg-amber-100 dark:bg-amber-950/40' : ''}`}
              onClick={() => setSalesFilter('TOP')}
            >
              🔥 الأكثر مبيعاً ({productStats.filter(p => p.piecesSold > 0).length})
            </Button>
            <Button
              size="sm"
              variant={salesFilter === 'LOW' ? 'secondary' : 'ghost'}
              className={`rounded-full text-xs h-7 shrink-0 text-blue-700 ${salesFilter === 'LOW' ? 'font-bold bg-blue-100 dark:bg-blue-950/40' : ''}`}
              onClick={() => setSalesFilter('LOW')}
            >
              ❄️ الأقل مبيعاً ({productStats.filter(p => p.piecesSold > 0 && p.piecesSold <= 10).length})
            </Button>
            <Button
              size="sm"
              variant={salesFilter === 'ZERO' ? 'secondary' : 'ghost'}
              className={`rounded-full text-xs h-7 shrink-0 text-rose-700 ${salesFilter === 'ZERO' ? 'font-bold bg-rose-100 dark:bg-rose-950/40' : ''}`}
              onClick={() => setSalesFilter('ZERO')}
            >
              🛑 راكدة / بدون مبيعات ({productStats.filter(p => p.piecesSold === 0).length})
            </Button>
            <Button
              size="sm"
              variant={salesFilter === 'LOW_STOCK' ? 'secondary' : 'ghost'}
              className={`rounded-full text-xs h-7 shrink-0 text-purple-700 ${salesFilter === 'LOW_STOCK' ? 'font-bold bg-purple-100 dark:bg-purple-950/40' : ''}`}
              onClick={() => setSalesFilter('LOW_STOCK')}
            >
              ⚠️ مخزون منخفض ({productStats.filter(p => p.product.stock_quantity <= p.product.low_stock_threshold).length})
            </Button>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث بالكود أو الاسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0 flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5" />
              ترتيب حسب:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 px-2 text-xs rounded-md border border-input bg-background font-medium"
            >
              <option value="piecesDesc">الأكثر مبيعاً (بالقطع)</option>
              <option value="revenueDesc">الأعلى إيراداً (ج.م)</option>
              <option value="piecesAsc">الأقل مبيعاً</option>
              <option value="stockAsc">الأقل مخزوناً</option>
              <option value="stockDesc">الأعلى مخزوناً</option>
              <option value="codeAsc">ترتيب الأكواد تصاعدياً</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Analysis Data Table */}
      <Card>
        <div className="p-3 border-b flex items-center justify-between text-xs text-muted-foreground">
          <span>عرض <strong>{displayedStats.length}</strong> منتج مطابق</span>
          <span>إجمالي القطع المباعة في النتائج: <strong>{displayedStats.reduce((sum, s) => sum + s.piecesSold, 0)}</strong> قطعة</span>
        </div>

        {displayedStats.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            لا توجد منتجات مطابقة لهذا البحث أو التصفية
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-muted/50 border-b text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-center font-bold">#</th>
                  <th className="p-2.5 font-bold">الكود</th>
                  <th className="p-2.5 font-bold">اسم المنتج</th>
                  <th className="p-2.5 text-center font-bold">المقاس</th>
                  <th className="p-2.5 text-center font-bold">السعر</th>
                  <th className="p-2.5 text-center font-bold">عدد الثري</th>
                  <th className="p-2.5 text-center font-bold">الثريهات</th>
                  <th className="p-2.5 text-center font-bold text-foreground">القطع المباعة</th>
                  <th className="p-2.5 text-center font-bold">الإيراد</th>
                  <th className="p-2.5 text-center font-bold">المساهمة</th>
                  <th className="p-2.5 text-center font-bold">المخزون الحالي</th>
                  <th className="p-2.5 text-center font-bold">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedStats.map((stat, idx) => {
                  const hasSales = stat.piecesSold > 0;
                  return (
                    <tr 
                      key={stat.product.id} 
                      className={`hover:bg-muted/40 transition-colors ${
                        stat.piecesSold >= 15 ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="p-2.5 text-center text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold text-foreground">
                        #{stat.product.code}
                      </td>
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground max-w-[220px] truncate" title={stat.product.name}>
                          {stat.product.name}
                        </div>
                        {stat.product.description && (
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {stat.product.description}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {stat.category}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center font-mono font-medium">
                        {stat.product.price} ج.م
                      </td>
                      <td className="p-2.5 text-center font-mono text-muted-foreground">
                        {stat.multiplier}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        {stat.seriesSold > 0 ? (
                          <span className="font-bold text-foreground">{stat.seriesSold}</span>
                        ) : (
                          <span className="text-muted-foreground/50">0</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {hasSales ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-black text-xs bg-primary/10 text-primary">
                            {stat.piecesSold}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 font-mono">0</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono font-semibold">
                        {stat.revenue > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {stat.revenue.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {stat.revenueShare > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {stat.revenueShare.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          stat.product.stock_quantity <= 0 
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40' 
                            : stat.product.stock_quantity <= stat.product.low_stock_threshold
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40'
                            : 'text-foreground'
                        }`}>
                          {stat.product.stock_quantity}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          disabled={!hasSales}
                          onClick={() => {
                            setSelectedProductStat(stat);
                            setDetailModalOpen(true);
                          }}
                          title="عرض سجل طلبات هذا المنتج"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Product Sales Detail Dialog */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-primary" />
              سجل مبيعات المنتج #{selectedProductStat?.product.code}
            </DialogTitle>
          </DialogHeader>

          {selectedProductStat && (
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Product Info Banner */}
              <div className="p-3 border rounded-lg bg-muted/40 space-y-1">
                <p className="font-bold text-sm">{selectedProductStat.product.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>المقاس: <strong>{selectedProductStat.category}</strong></span>
                  <span>السعر: <strong>{selectedProductStat.product.price} ج.م</strong></span>
                  <span>القطع المباعة: <strong className="text-primary">{selectedProductStat.piecesSold} قطعة</strong></span>
                  <span>إجمالي الإيراد: <strong className="text-emerald-600">{selectedProductStat.revenue.toLocaleString()} ج.م</strong></span>
                </div>
              </div>

              {/* Orders List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground">الطلبات التي تضمنت هذا المنتج في الفترة:</h4>
                <div className="border rounded-lg overflow-hidden divide-y max-h-60 overflow-y-auto">
                  {selectedProductStat.salesList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">لا توجد تفاصيل مبيعات</div>
                  ) : (
                    selectedProductStat.salesList.map((sale, i) => (
                      <div key={i} className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/30">
                        <div>
                          <div className="font-semibold text-foreground">
                            طلب #{sale.orderNumber} - {sale.customerName}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {new Date(sale.date).toLocaleDateString('ar-EG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <div className="text-left font-mono">
                          <span className="font-bold text-primary">{sale.pieces} قطعة ({sale.series} ثري)</span>
                          <p className="text-[10px] text-emerald-600">{sale.revenue.toLocaleString()} ج.م</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Button className="w-full" onClick={() => setDetailModalOpen(false)}>
                إغلاق
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductsAnalysis;
