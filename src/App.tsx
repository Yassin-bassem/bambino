import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { VersionProvider } from "@/contexts/VersionContext";
import Index from "./pages/Index";
import Checkout from "./pages/Checkout";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Stats from "./pages/admin/Stats";
import Products from "./pages/admin/Products";
import Orders from "./pages/admin/Orders";
import Customers from "./pages/admin/Customers";
import Deposits from "./pages/admin/Deposits";
import SearchByCode from "./pages/admin/SearchByCode";
import CustomerExtraInfo from "./pages/admin/CustomerExtraInfo";
import StockAlerts from "./pages/admin/StockAlerts";
import StaffManagement from "./pages/admin/StaffManagement";
import Backup from "./pages/admin/Backup";
import SalesControl from "./pages/admin/SalesControl";
import DailyCustomers from "./pages/admin/DailyCustomers";
import QuickOrderEdit from "./pages/QuickOrderEdit";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CartProvider>
      <VersionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/edit-order" element={<QuickOrderEdit />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />}>
                <Route index element={<Stats />} />
                <Route path="products" element={<Products />} />
                <Route path="orders" element={<Orders />} />
                <Route path="customers" element={<Customers />} />
                <Route path="daily-customers" element={<DailyCustomers />} />
                <Route path="deposits" element={<Deposits />} />
                <Route path="search-by-code" element={<SearchByCode />} />
                <Route path="customer-extra-info" element={<CustomerExtraInfo />} />
                <Route path="stock-alerts" element={<StockAlerts />} />
                <Route path="staff" element={<StaffManagement />} />
                <Route path="backup" element={<Backup />} />
                <Route path="sales-control" element={<SalesControl />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </VersionProvider>
    </CartProvider>
  </QueryClientProvider>
);

export default App;
