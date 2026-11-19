import { useEffect, useState, useMemo } from 'react';
import { 
  CalendarDays, Download, Search, Users, Phone, MapPin, Store, 
  ShoppingBag, ChevronDown, ChevronUp, Filter, CheckSquare, 
  Square, Calendar, RefreshCw, ArrowRight, DollarSign, Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { getDescriptionMultiplier } from '@/contexts/CartContext';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface OrderItem {
  id: string;
  product_code: string;
  product_name: string;
  product_description?: string | null;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: number;
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  shop_name?: string | null;
  address?: string | null;
  created_at: string;
  subtotal: number;
  total: number;
  deposit_amount?: number | null;
  deposit_method?: string | null;
  delivery_date?: string | null;
  shipping_company?: string | null;
  staff_member_name?: string | null;
  order_status?: string | null;
  extra_info?: string | null;
  order_items?: OrderItem[];
}

interface DayGroup {
  dateKey: string; // YYYY-MM-DD
  displayDate: string; // Arabic formatted date
  orders: Order[];
  uniqueCustomersCount: number;
  totalSales: number;
  totalDeposits: number;
}

const DailyCustomers = () => {
  const { activeVersion } = useVersion();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  
  // Date filter state
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (activeVersion) {
      loadOrders();
    }
  }, [activeVersion]);

  const loadOrders = async () => {
    if (!activeVersion) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('version_id', activeVersion.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
      
      // Auto-expand the most recent day by default
      if (data && data.length > 0) {
        const latestDate = data[0].created_at.split('T')[0];
        setExpandedDays(new Set([latestDate]));
      }
    } catch (err: any) {
      console.error('Error loading daily customers:', err);
      toast.error('فشل في تحميل بيانات عملاء اليوم');
    } finally {
      setLoading(false);
    }
  };

  // Group and filter orders by day
  const dayGroups = useMemo(() => {
    const map = new Map<string, Order[]>();

    orders.forEach(order => {
      const dateKey = order.created_at ? order.created_at.split('T')[0] : 'unknown';

      // Apply date range filter
      if (filterStartDate) {
        const startDateStr = format(filterStartDate, 'yyyy-MM-dd');
        if (dateKey < startDateStr) return;
      }
      if (filterEndDate) {
        const endDateStr = format(filterEndDate, 'yyyy-MM-dd');
        if (dateKey > endDateStr) return;
      }

      // Apply search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = order.customer_name?.toLowerCase().includes(q);
        const matchesPhone = order.phone?.includes(q);
        const matchesShop = order.shop_name?.toLowerCase().includes(q);
        const matchesAddress = order.address?.toLowerCase().includes(q);
        const matchesOrderNum = String(order.order_number).includes(q);
        const matchesItem = order.order_items?.some(i => 
          i.product_code?.toLowerCase().includes(q) || 
          i.product_name?.toLowerCase().includes(q)
        );

        if (!matchesName && !matchesPhone && !matchesShop && !matchesAddress && !matchesOrderNum && !matchesItem) {
          return;
        }
      }

      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(order);
    });

    const groups: DayGroup[] = [];
    map.forEach((dayOrders, dateKey) => {
      let displayDate = dateKey;
      try {
        const d = new Date(dateKey + 'T00:00:00');
        displayDate = format(d, 'EEEE، d MMMM yyyy', { locale: ar });
      } catch (e) {
        displayDate = dateKey;
      }

      const uniqueCustomers = new Set(dayOrders.map(o => (o.phone || o.customer_name).trim())).size;
      const totalSales = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalDeposits = dayOrders.reduce((sum, o) => sum + (o.deposit_amount || 0), 0);

      groups.push({
        dateKey,
        displayDate,
        orders: dayOrders,
        uniqueCustomersCount: uniqueCustomers,
        totalSales,
        totalDeposits,
      });
    });

    // Sort descending by date
    groups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return groups;
  }, [orders, searchQuery, filterStartDate, filterEndDate]);

  // Toggle day expansion
  const toggleDayExpanded = (dateKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  // Toggle date selection for export
  const toggleDateSelection = (dateKey: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  // Select all visible dates
  const handleSelectAllDates = () => {
    if (selectedDates.size === dayGroups.length) {
      setSelectedDates(new Set());
    } else {
      setSelectedDates(new Set(dayGroups.map(g => g.dateKey)));
    }
  };

  // Export orders to Excel
  const exportOrdersToExcel = (ordersToExport: Order[], fileName: string) => {
    if (ordersToExport.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }

    const dataRows = ordersToExport.map(o => {
      // Build summary of items
      const itemsSummary = (o.order_items || []).map(i => {
        const mult = getDescriptionMultiplier(i.product_description);
        const pieces = i.quantity * mult;
        return `${i.product_code} (${i.quantity} دستة/كرتونة = ${pieces} قطعة)`;
      }).join(' | ');

      const totalPieces = (o.order_items || []).reduce((sum, i) => {
        const mult = getDescriptionMultiplier(i.product_description);
        return sum + (i.quantity * mult);
      }, 0);

      let orderTime = '';
      let orderDate = '';
      try {
        const dt = new Date(o.created_at);
        orderDate = format(dt, 'yyyy-MM-dd');
        orderTime = format(dt, 'hh:mm a', { locale: ar });
      } catch (e) {
        orderDate = o.created_at;
      }

      return {
        'تاريخ الطلب': orderDate,
        'وقت الطلب': orderTime,
        'رقم الطلب': o.order_number,
        'اسم العميل': o.customer_name || '-',
        'رقم الهاتف': o.phone || '-',
        'اسم المحل': o.shop_name || '-',
        'العنوان': o.address || '-',
        'إجمالي الفاتورة (ج.م)': o.total || 0,
        'قيمة العربون (ج.م)': o.deposit_amount || 0,
        'طريقة دفع العربون': o.deposit_method === 'instapay' ? 'InstaPay' : o.deposit_method === 'vodafone_cash' ? 'فودافون كاش' : o.deposit_method === 'cash' ? 'كاش' : o.deposit_method || '-',
        'إجمالي عدد القطع': totalPieces,
        'تفاصيل المنتجات': itemsSummary,
        'شركة الشحن': o.shipping_company || '-',
        'تاريخ التسليم': o.delivery_date || '-',
        'موظف المبيعات': o.staff_member_name || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'عملاء اليوم');

    // Auto-fit column widths
    const maxProps: Record<string, number> = {};
    dataRows.forEach(row => {
      Object.entries(row).forEach(([key, val]) => {
        const len = String(val || '').length;
        maxProps[key] = Math.max(maxProps[key] || key.length, len);
      });
    });
    worksheet['!cols'] = Object.keys(maxProps).map(key => ({ wch: Math.min(Math.max(maxProps[key] + 3, 12), 40) }));

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
    toast.success(`تم تصدير ${ordersToExport.length} طلب بنجاح`);
  };

  // Export single day
  const handleExportSingleDay = (group: DayGroup) => {
    exportOrdersToExcel(group.orders, `عملاء_${group.dateKey}`);
  };

  // Export selected days
  const handleExportSelectedDays = () => {
    if (selectedDates.size === 0) {
      toast.error('يرجى تحديد يوم واحد على الأقل للتصدير');
      return;
    }

    const filtered = orders.filter(o => {
      const dateKey = o.created_at ? o.created_at.split('T')[0] : '';
      return selectedDates.has(dateKey);
    });

    const datesArray = Array.from(selectedDates).sort();
    const dateRangeStr = datesArray.length === 1 ? datesArray[0] : `${datesArray[0]}_إلى_${datesArray[datesArray.length - 1]}`;
    exportOrdersToExcel(filtered, `عملاء_${dateRangeStr}`);
  };

  // Quick preset filters
  const applyPreset = (preset: 'today' | 'yesterday' | 'last7' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      setFilterStartDate(yesterday);
      setFilterEndDate(yesterday);
    } else if (preset === 'last7') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setFilterStartDate(past);
      setFilterEndDate(today);
    } else {
      setFilterStartDate(undefined);
      setFilterEndDate(undefined);
    }
  };

  if (!activeVersion) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        يرجى اختيار أو تفعيل نسخة أولاً لعرض عملاء اليوم.
      </div>
    );
  }

  const totalOrdersCount = dayGroups.reduce((sum, g) => sum + g.orders.length, 0);
  const totalUniqueCustomersCount = new Set(
    dayGroups.flatMap(g => g.orders.map(o => (o.phone || o.customer_name).trim()))
  ).size;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Title & Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-2xl border shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black">عملاء اليوم (Customers of the Day)</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                سجل يوم بيوم لجميع العملاء الذين قاموا بالطلب، مع إمكانية التصدير لملف Excel ليوم محدد أو عدة أيام معاً
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedDates.size > 0 && (
            <Button 
              onClick={handleExportSelectedDays} 
              className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Download className="h-4 w-4" />
              تصدير الأيام المحددة ({selectedDates.size} يوم)
            </Button>
          )}

          <Button 
            variant="outline" 
            onClick={() => exportOrdersToExcel(dayGroups.flatMap(g => g.orders), `جميع_عملاء_الطلبات`)}
            className="gap-2"
            disabled={dayGroups.length === 0}
          >
            <Download className="h-4 w-4" />
            تصدير الكل ({totalOrdersCount} طلب)
          </Button>

          <Button variant="ghost" size="icon" onClick={loadOrders} title="تحديث البيانات">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm bg-gradient-to-br from-primary/5 via-card to-background">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">إجمالي الأيام المعروضة</p>
              <p className="text-2xl font-black mt-1 text-primary">{dayGroups.length} يوم</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              <Calendar className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">إجمالي الطلبات</p>
              <p className="text-2xl font-black mt-1">{totalOrdersCount}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-600">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">إجمالي العملاء المميزين</p>
              <p className="text-2xl font-black mt-1">{totalUniqueCustomersCount}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">إجمالي المبيعات</p>
              <p className="text-2xl font-black mt-1 text-emerald-600">
                {dayGroups.reduce((sum, g) => sum + g.totalSales, 0).toLocaleString()} ج.م
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600">
              <DollarSign className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم العميل، رقم الهاتف، المحل، العنوان، رقم الطلب أو كود المنتج..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <Button size="sm" variant="outline" onClick={() => applyPreset('today')} className="text-xs">
                اليوم
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset('yesterday')} className="text-xs">
                أمس
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset('last7')} className="text-xs">
                آخر 7 أيام
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyPreset('all')} className="text-xs">
                كل الأيام
              </Button>
            </div>
          </div>

          {/* Date Range Selection & Batch Select */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> تصفية بالفترة:
              </span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-xs">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    من: {filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : 'البداية'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={filterStartDate}
                    onSelect={setFilterStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-xs">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    إلى: {filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : 'النهاية'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={filterEndDate}
                    onSelect={setFilterEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {(filterStartDate || filterEndDate || searchQuery) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setFilterStartDate(undefined); setFilterEndDate(undefined); setSearchQuery(''); }}
                  className="text-xs text-destructive hover:bg-destructive/10"
                >
                  إعادة ضبط الفلاتر
                </Button>
              )}
            </div>

            {/* Select All Checkbox */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSelectAllDates}
                className="gap-2 text-xs"
              >
                {selectedDates.size === dayGroups.length && dayGroups.length > 0 ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
                {selectedDates.size === dayGroups.length && dayGroups.length > 0 ? 'إلغاء تحديد كل الأيام' : 'تحديد كل الأيام للتصدير'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Days List */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-primary opacity-60" />
          جاري تحميل بيانات عملاء الأيام...
        </div>
      ) : dayGroups.length === 0 ? (
        <Card className="border p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground opacity-40 mx-auto mb-3" />
          <h3 className="text-lg font-bold">لا توجد طلبات أو عملاء في هذه الفترة</h3>
          <p className="text-sm text-muted-foreground mt-1">جرب تغيير الفترة الزمنية أو كلمة البحث</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {dayGroups.map(group => {
            const isExpanded = expandedDays.has(group.dateKey);
            const isSelected = selectedDates.has(group.dateKey);

            return (
              <Card 
                key={group.dateKey} 
                className={`border-2 transition-all ${
                  isSelected ? 'border-primary/50 shadow-md bg-primary/[0.01]' : 'border-border/80 hover:border-primary/30'
                }`}
              >
                {/* Day Header Accordion Trigger */}
                <div 
                  className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none border-b bg-muted/20"
                  onClick={() => toggleDayExpanded(group.dateKey)}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={(e) => { e.stopPropagation(); toggleDateSelection(group.dateKey); }}
                      className="p-1 cursor-pointer hover:scale-110 transition-transform"
                      title="تحديد للتصدير"
                    >
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleDateSelection(group.dateKey)}
                        className="h-5 w-5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-foreground">{group.displayDate}</h2>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {group.dateKey}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.orders.length} طلب • {group.uniqueCustomersCount} عميل مختلف
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-4 text-xs font-semibold">
                      <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        المبيعات: {group.totalSales.toLocaleString()} ج.م
                      </span>
                      {group.totalDeposits > 0 && (
                        <span className="text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                          العربون: {group.totalDeposits.toLocaleString()} ج.م
                        </span>
                      )}
                    </div>

                    <Button 
                      size="sm" 
                      variant="outline"
                      className="gap-1.5 text-xs font-bold bg-white dark:bg-card hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportSingleDay(group);
                      }}
                      title="تصدير هذا اليوم فقط في ملف Excel"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-600" />
                      تصدير هذا اليوم (Excel)
                    </Button>

                    <button 
                      type="button" 
                      className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Day Details (Customers Table) */}
                {isExpanded && (
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-muted/60 text-xs font-bold text-muted-foreground border-b">
                          <tr>
                            <th className="p-3 w-16 text-center">#</th>
                            <th className="p-3">العميل والمحل</th>
                            <th className="p-3">رقم الهاتف</th>
                            <th className="p-3">العنوان</th>
                            <th className="p-3">المنتجات والقطع</th>
                            <th className="p-3">إجمالي الطلب</th>
                            <th className="p-3">العربون</th>
                            <th className="p-3">وقت الطلب</th>
                            <th className="p-3">المسؤول والشحن</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {group.orders.map(order => {
                            const totalPieces = (order.order_items || []).reduce((sum, item) => {
                              const mult = getDescriptionMultiplier(item.product_description);
                              return sum + (item.quantity * mult);
                            }, 0);

                            let orderTime = '';
                            try {
                              orderTime = format(new Date(order.created_at), 'hh:mm a', { locale: ar });
                            } catch (e) {
                              orderTime = order.created_at;
                            }

                            return (
                              <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                                {/* Order Number */}
                                <td className="p-3 text-center font-bold text-primary">
                                  #{order.order_number}
                                </td>

                                {/* Customer Name & Shop */}
                                <td className="p-3">
                                  <p className="font-bold text-foreground flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    {order.customer_name || 'بدون اسم'}
                                  </p>
                                  {order.shop_name && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Store className="h-3 w-3" />
                                      {order.shop_name}
                                    </p>
                                  )}
                                </td>

                                {/* Phone */}
                                <td className="p-3 font-mono text-xs">
                                  <a 
                                    href={`tel:${order.phone}`} 
                                    className="hover:underline flex items-center gap-1 text-primary font-semibold"
                                  >
                                    <Phone className="h-3 w-3" />
                                    {order.phone}
                                  </a>
                                </td>

                                {/* Address */}
                                <td className="p-3 max-w-[200px] truncate text-xs text-muted-foreground" title={order.address || ''}>
                                  {order.address ? (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      {order.address}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>

                                {/* Items Breakdown */}
                                <td className="p-3 max-w-[240px]">
                                  <div className="space-y-1">
                                    <Badge variant="outline" className="text-xs font-semibold bg-primary/5 text-primary">
                                      {totalPieces} قطعة ({order.order_items?.length || 0} صنف)
                                    </Badge>
                                    <p className="text-[11px] text-muted-foreground truncate" title={(order.order_items || []).map(i => `${i.product_code} (${i.quantity})`).join(', ')}>
                                      {(order.order_items || []).map(i => `${i.product_code} × ${i.quantity}`).join('، ')}
                                    </p>
                                  </div>
                                </td>

                                {/* Total */}
                                <td className="p-3 font-bold text-foreground">
                                  {(order.total || 0).toLocaleString()} ج.م
                                </td>

                                {/* Deposit */}
                                <td className="p-3 text-xs">
                                  {order.deposit_amount && order.deposit_amount > 0 ? (
                                    <div>
                                      <span className="font-bold text-blue-600 block">
                                        {order.deposit_amount.toLocaleString()} ج.م
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {order.deposit_method === 'instapay' ? 'InstaPay' : order.deposit_method === 'vodafone_cash' ? 'فودافون كاش' : 'كاش'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>

                                {/* Time */}
                                <td className="p-3 text-xs text-muted-foreground font-mono">
                                  {orderTime}
                                </td>

                                {/* Shipping / Staff */}
                                <td className="p-3 text-xs text-muted-foreground">
                                  {order.shipping_company && (
                                    <p className="font-medium text-foreground">{order.shipping_company}</p>
                                  )}
                                  {order.staff_member_name && (
                                    <p className="text-[11px] text-muted-foreground">بواسطة: {order.staff_member_name}</p>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DailyCustomers;
