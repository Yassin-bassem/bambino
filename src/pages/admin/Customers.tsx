import { useEffect, useState, useRef } from 'react';
import { Users, Download, UserPlus, Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVersion } from '@/contexts/VersionContext';
import * as XLSX from 'xlsx';

interface Customer {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string;
  address: string | null;
  is_new: boolean;
  created_at: string;
}

const Customers = () => {
  const { activeVersion } = useVersion();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeVersion) {
      loadCustomers();
    }
  }, [activeVersion]);

  const loadCustomers = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('version_id', activeVersion.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('فشل في تحميل العملاء');
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };

  const newCustomers = customers.filter((c) => c.is_new);
  const oldCustomers = customers.filter((c) => !c.is_new);

  const exportToExcel = (data: Customer[], filename: string) => {
    const wsData = [
      ['الاسم', 'اسم المحل', 'الهاتف', 'العنوان', 'تاريخ التسجيل'],
      ...data.map((c) => [
        c.name,
        c.shop_name || '',
        c.phone,
        c.address || '',
        new Date(c.created_at).toLocaleDateString('ar-EG'),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['الاسم', 'اسم المحل', 'الهاتف', 'العنوان'],
      ['محمد أحمد', 'محل الأطفال', '01012345678', 'القاهرة - مدينة نصر'],
      ['سارة محمود', 'بيبي فاشون', '01198765432', 'الإسماعيلية'],
      ['أحمد علي', 'بامبينو ستور', '01200766332', 'العبور'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نموذج العملاء');
    XLSX.writeFile(wb, 'نموذج_استيراد_العملاء_القدامى.xlsx');
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeVersion) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows || rows.length === 0) {
        toast.error('الملف فارغ أو لا يحتوي على صفوف بيانات');
        setImporting(false);
        return;
      }

      const parsedCustomers: Array<{
        name: string;
        shop_name: string | null;
        phone: string;
        address: string | null;
        is_new: boolean;
        version_id: string;
      }> = [];

      for (const row of rows) {
        // Flexible column mapping
        const name = (
          row['الاسم'] || row['اسم العميل'] || row['العميل'] ||
          row['Name'] || row['name'] || row['Customer'] || row['customer'] || ''
        ).toString().trim();

        const shop = (
          row['اسم المحل'] || row['المحل'] || row['اسم المتجر'] ||
          row['Shop'] || row['shop'] || row['Store'] || row['store'] || ''
        ).toString().trim();

        const phone = (
          row['الهاتف'] || row['الموبايل'] || row['التليفون'] || row['رقم الهاتف'] || row['رقم الموبايل'] ||
          row['Phone'] || row['phone'] || row['Mobile'] || row['mobile'] || row['Tel'] || ''
        ).toString().trim();

        const address = (
          row['العنوان'] || row['المحافظة'] || row['المدينة'] ||
          row['Address'] || row['address'] || row['City'] || ''
        ).toString().trim();

        if (name || phone) {
          parsedCustomers.push({
            name: name || 'عميل',
            shop_name: shop || null,
            phone: phone || '',
            address: address || null,
            is_new: false, // Old customer
            version_id: activeVersion.id,
          });
        }
      }

      if (parsedCustomers.length === 0) {
        toast.error('لم يتم العثور على بيانات صالحة (تأكد من وجود عمود الاسم أو الهاتف)');
        setImporting(false);
        return;
      }

      // Batch insert in chunks of 100
      const chunkSize = 100;
      let insertedCount = 0;
      for (let i = 0; i < parsedCustomers.length; i += chunkSize) {
        const chunk = parsedCustomers.slice(i, i + chunkSize);
        const { error } = await supabase.from('customers').insert(chunk);
        if (error) throw error;
        insertedCount += chunk.length;
      }

      toast.success(`تم استيراد ${insertedCount} عميل قديم بنجاح!`);
      await loadCustomers();
    } catch (err: any) {
      console.error('Customer Excel import error:', err);
      toast.error('حدث خطأ أثناء استيراد ملف Excel: ' + (err.message || ''));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const CustomerTable = ({
    data,
    showExport,
    showImport,
    exportFilename,
  }: {
    data: Customer[];
    showExport?: boolean;
    showImport?: boolean;
    exportFilename?: string;
  }) => (
    <>
      <div className="mb-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          {showExport && data.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToExcel(data, exportFilename || 'customers')}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              تصدير Excel
            </Button>
          )}
        </div>

        {showImport && (
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelImport}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="gap-2"
              title="تحميل ملف Excel نموذجي للتعرف على تنسيق الأعمدة"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              تحميل نموذج Excel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-sm"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الاستيراد...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  استيراد عملاء قدامى من شيت Excel
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>لا يوجد عملاء</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">المحل</th>
                <th className="p-3 text-right">الهاتف</th>
                <th className="p-3 text-right">العنوان</th>
                <th className="p-3 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {data.map((customer) => (
                <tr key={customer.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-medium">{customer.name}</td>
                  <td className="p-3">{customer.shop_name || '-'}</td>
                  <td className="p-3" dir="ltr">{customer.phone}</td>
                  <td className="p-3">{customer.address || '-'}</td>
                  <td className="p-3">{new Date(customer.created_at).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">العملاء</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة العملاء والبيانات القديمة والجديدة</p>
        </div>
        <div className="text-sm font-semibold bg-muted px-3 py-1.5 rounded-lg border">
          إجمالي: {customers.length} عميل
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : (
        <Tabs defaultValue="old" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="old" className="gap-2">
              <Users className="h-4 w-4" />
              عملاء قدامى ({oldCustomers.length})
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <UserPlus className="h-4 w-4" />
              عملاء جدد ({newCustomers.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="old" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">العملاء القدامى</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomerTable
                  data={oldCustomers}
                  showExport
                  showImport
                  exportFilename="bambino-old-customers"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new" className="mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">العملاء الجدد</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomerTable
                  data={newCustomers}
                  showExport
                  showImport={false}
                  exportFilename="bambino-new-customers"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Customers;
