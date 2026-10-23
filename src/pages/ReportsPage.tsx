import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { formatPKR, formatDateTime } from '../utils/formatters';
import { PrintModal } from '../components/PrintModal';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Users,
  ShieldAlert,
  Boxes
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [activeTab, setActiveTab] = useState<'DAILY' | 'VALUATION' | 'RECEIVABLES' | 'CASHIERS'>('DAILY');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // Reports data
  const [dailyData, setDailyData] = useState<any | null>(null);
  const [valuationData, setValuationData] = useState<any | null>(null);
  const [receivablesData, setReceivablesData] = useState<any | null>(null);
  const [cashiersData, setCashiersData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  if (!isOwner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Owner Access Required</h2>
        <p className="text-xs text-slate-600 max-w-md mt-2">
          Financial summaries, profit margins, cost valuations, and cashier sales metrics are accessible to the shop owner only.
        </p>
      </div>
    );
  }

  const loadReport = async () => {
    setLoading(true);
    try {
      if (activeTab === 'DAILY') {
        const res = await apiRequest<{ daily_summary: any }>('/reports/daily', {
          params: { date: selectedDate },
        });
        setDailyData(res.daily_summary);
      } else if (activeTab === 'VALUATION') {
        const res = await apiRequest<{ valuation: any }>('/reports/valuation');
        setValuationData(res.valuation);
      } else if (activeTab === 'RECEIVABLES') {
        const res = await apiRequest<{ receivables: any }>('/reports/receivables');
        setReceivablesData(res.receivables);
      } else if (activeTab === 'CASHIERS') {
        const res = await apiRequest<{ cashiers: any[] }>('/reports/cashiers', {
          params: { start_date: selectedDate, end_date: selectedDate },
        });
        setCashiersData(res.cashiers);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeTab, selectedDate]);

  // Download CSV Export
  const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((x) => `"${x}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    if (activeTab === 'DAILY' && dailyData) {
      const headers = ['Metric', 'Amount (PKR)'];
      const rows = [
        ['Total Sales Revenue', formatPKR(dailyData.sales_stats.total_sales_paisa, false)],
        ['Total Paid Collected', formatPKR(dailyData.sales_stats.total_collected_paisa, false)],
        ['New Udhaar Debt', formatPKR(dailyData.sales_stats.total_new_udhaar_paisa, false)],
        ['Gross Margin (Sales - Cost)', formatPKR(dailyData.gross_margin_paisa, false)],
        ['Returns & Refunds', formatPKR(dailyData.returns_stats.total_refund_paisa, false)],
        ['Operational Expenses', formatPKR(dailyData.total_expenses_paisa, false)],
        ['Net Real Profit', formatPKR(dailyData.net_profit_paisa, false)],
      ];
      downloadCSV(`PakAudio_Daily_Report_${selectedDate}`, headers, rows);
    } else if (activeTab === 'VALUATION' && valuationData) {
      const headers = ['Product', 'Variant', 'SKU', 'Quantity', 'Unit Cost (PKR)', 'Unit Retail (PKR)', 'Total Cost (PKR)', 'Total Retail (PKR)'];
      const rows = valuationData.items.map((i: any) => [
        i.product_name,
        i.variant_name,
        i.sku,
        i.quantity,
        formatPKR(i.unit_cost_paisa, false),
        formatPKR(i.unit_retail_paisa, false),
        formatPKR(i.total_cost_paisa, false),
        formatPKR(i.total_retail_paisa, false),
      ]);
      downloadCSV(`PakAudio_Stock_Valuation_${new Date().toISOString().slice(0, 10)}`, headers, rows);
    } else if (activeTab === 'RECEIVABLES' && receivablesData) {
      const headers = ['Customer Name', 'Phone', 'Car Reg', 'Outstanding Debt (PKR)'];
      const rows = receivablesData.customers_owing.map((c: any) => [
        c.name,
        c.phone,
        c.car_registration || '',
        formatPKR(c.balance_paisa, false),
      ]);
      downloadCSV(`PakAudio_Udhaar_Receivables_${new Date().toISOString().slice(0, 10)}`, headers, rows);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Executive Reports & Financial Performance
          </h2>
          <p className="text-xs text-slate-500">
            Real profit = gross margin minus returns minus expenses • Exportable to CSV / Excel
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Switcher */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 text-xs">
            <button
              onClick={() => setActiveTab('DAILY')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'DAILY' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily Summary
            </button>
            <button
              onClick={() => setActiveTab('VALUATION')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'VALUATION' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Valuation
            </button>
            <button
              onClick={() => setActiveTab('RECEIVABLES')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'RECEIVABLES' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Udhaar & Payables
            </button>
            <button
              onClick={() => setActiveTab('CASHIERS')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'CASHIERS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cashier Performance
            </button>
          </div>

          {activeTab === 'DAILY' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border rounded-lg px-2.5 py-1 text-xs font-mono"
            />
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 1. DAILY SUMMARY TAB */}
      {activeTab === 'DAILY' && dailyData && (
        <div className="mt-6 space-y-6">
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Total Sales</span>
              <span className="text-2xl font-black text-slate-900 font-mono tracking-tight mt-1 block">
                {formatPKR(dailyData.sales_stats.total_sales_paisa)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">{dailyData.sales_stats.bills_count} bills issued</span>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Gross Sales Margin</span>
              <span className="text-2xl font-black text-indigo-700 font-mono tracking-tight mt-1 block">
                {formatPKR(dailyData.gross_margin_paisa)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Revenue minus Cost of Goods</span>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Expenses & Returns</span>
              <span className="text-2xl font-black text-red-600 font-mono tracking-tight mt-1 block">
                {formatPKR(dailyData.total_expenses_paisa + dailyData.returns_stats.total_refund_paisa)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Expenses: {formatPKR(dailyData.total_expenses_paisa)}
              </span>
            </div>

            <div className="p-5 bg-emerald-950 text-white rounded-2xl border border-emerald-800 shadow-md">
              <span className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider block">Net Real Profit</span>
              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight mt-1 block">
                {formatPKR(dailyData.net_profit_paisa)}
              </span>
              <span className="text-[11px] text-emerald-200/80 mt-1 block">Margin - Returns - Expenses</span>
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-2 gap-6">
            {/* Payments by Method */}
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs text-xs">
              <h4 className="font-bold text-slate-900 text-sm mb-3">Collections by Payment Method</h4>
              <div className="space-y-2">
                {Object.entries(dailyData.payments_by_method).map(([method, amt]) => (
                  <div key={method} className="flex justify-between p-2 rounded bg-slate-50">
                    <span className="font-bold text-slate-800">{method}</span>
                    <span className="font-mono font-bold text-slate-900">{formatPKR(amt as number)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses by Category */}
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs text-xs">
              <h4 className="font-bold text-slate-900 text-sm mb-3">Expenses by Category</h4>
              <div className="space-y-2">
                {Object.entries(dailyData.expenses_by_category).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between p-2 rounded bg-slate-50">
                    <span className="font-bold text-slate-800">{cat}</span>
                    <span className="font-mono font-bold text-red-600">{formatPKR(amt as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. VALUATION TAB */}
      {activeTab === 'VALUATION' && valuationData && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase block">Stock Value at Cost</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                {formatPKR(valuationData.total_cost_paisa)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">{valuationData.total_units} total physical units</span>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold uppercase block">Stock Value at Retail</span>
              <span className="text-2xl font-black text-indigo-700 font-mono mt-1 block">
                {formatPKR(valuationData.total_retail_paisa)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">At standard selling price</span>
            </div>

            <div className="p-5 bg-emerald-950 text-white rounded-xl border border-emerald-800 shadow-xs">
              <span className="text-[11px] text-emerald-300 font-bold uppercase block">Potential Unrealized Profit</span>
              <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                {formatPKR(valuationData.potential_profit_paisa)}
              </span>
              <span className="text-[11px] text-emerald-200/80 mt-1 block">If all inventory sold</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Item & Variant</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4 text-center">Qty</th>
                  <th className="py-2.5 px-4 text-right">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Unit Retail</th>
                  <th className="py-2.5 px-4 text-right">Total Cost</th>
                  <th className="py-2.5 px-4 text-right">Total Retail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {valuationData.items.map((i: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {i.product_name}
                      <span className="block font-normal text-slate-500 text-[11px]">{i.variant_name}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">{i.sku}</td>
                    <td className="py-2.5 px-4 text-center font-bold">{i.quantity}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatPKR(i.unit_cost_paisa, false)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatPKR(i.unit_retail_paisa, false)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">{formatPKR(i.total_cost_paisa, false)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">{formatPKR(i.total_retail_paisa, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. RECEIVABLES & PAYABLES TAB */}
      {activeTab === 'RECEIVABLES' && receivablesData && (
        <div className="mt-6 grid grid-cols-2 gap-6">
          {/* Customers owing udhaar */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
              <span className="font-bold text-slate-900">Customer Udhaar Debt (Receivable)</span>
              <span className="font-mono font-bold text-red-600 text-sm">
                Total: {formatPKR(receivablesData.total_udhaar_receivable_paisa)}
              </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3 text-right">Owed (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receivablesData.customers_owing.map((c: any) => (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{c.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{c.phone}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                        {formatPKR(c.balance_paisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Supplier payables */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
              <span className="font-bold text-slate-900">Supplier Debt (Payables)</span>
              <span className="font-mono font-bold text-red-700 text-sm">
                Total: {formatPKR(receivablesData.total_supplier_payable_paisa)}
              </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Supplier Name</th>
                    <th className="py-2 px-3">Contact</th>
                    <th className="py-2 px-3 text-right">What I Owe (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receivablesData.suppliers_payable.map((s: any) => (
                    <tr key={s.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{s.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{s.contact_person}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700">
                        {formatPKR(s.balance_paisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CASHIERS TAB */}
      {activeTab === 'CASHIERS' && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
            <span className="font-bold text-slate-900">Sales Volume by Cashier Staff</span>
          </div>

          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Staff Member</th>
                <th className="py-2.5 px-4">Username</th>
                <th className="py-2.5 px-4 text-center">Bills Made</th>
                <th className="py-2.5 px-4 text-right">Discounts Given</th>
                <th className="py-2.5 px-4 text-right">Cash Collected</th>
                <th className="py-2.5 px-4 text-right">Total Invoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashiersData.map((c) => (
                <tr key={c.cashier_id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{c.full_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{c.username}</td>
                  <td className="py-3 px-4 text-center font-bold">{c.bills_count}</td>
                  <td className="py-3 px-4 text-right font-mono text-amber-700">{formatPKR(c.total_discounts_paisa)}</td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">{formatPKR(c.total_collected_paisa)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-950 text-sm">
                    {formatPKR(c.total_sales_paisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
