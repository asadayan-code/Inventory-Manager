import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { Bill } from '../types';
import { formatPKR, formatDateTime } from '../utils/formatters';
import { PrintModal } from '../components/PrintModal';
import { Receipt, Search, Printer, FileText, ArrowRight } from 'lucide-react';

export const BillsList: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'BILLS' | 'QUOTES'>('ALL');
  const [search, setSearch] = useState('');

  const [printDoc, setPrintDoc] = useState<{ isOpen: boolean; data: any; type: 'INVOICE' | 'QUOTATION' }>({
    isOpen: false,
    data: null,
    type: 'INVOICE',
  });

  const loadBills = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ bills: Bill[] }>('/bills');
      setBills(res.bills);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, []);

  const handleReprint = async (billId: number, isQuote: boolean) => {
    try {
      // mark reprint copies duplicate copy & logs audit
      const full = await apiRequest<{ bill: Bill }>(`/bills/${billId}`, {
        params: { reprint: '1' },
      });
      setPrintDoc({
        isOpen: true,
        data: full.bill,
        type: isQuote ? 'QUOTATION' : 'INVOICE',
      });
      loadBills();
    } catch {
      // ignore
    }
  };

  const filteredBills = bills.filter((b) => {
    if (filterType === 'BILLS' && b.is_quote) return false;
    if (filterType === 'QUOTES' && !b.is_quote) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        b.bill_number.toLowerCase().includes(s) ||
        b.customer_name.toLowerCase().includes(s) ||
        (b.customer_phone && b.customer_phone.includes(s))
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Invoices & Quotations History
          </h2>
          <p className="text-xs text-slate-500">Historical immutable billing records and quotes</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Pills */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                filterType === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('BILLS')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                filterType === 'BILLS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completed Bills
            </button>
            <button
              onClick={() => setFilterType('QUOTES')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                filterType === 'QUOTES' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Estimates / Quotes
            </button>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or phone..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl shadow-xs">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-400">Loading invoices...</div>
        ) : filteredBills.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">No invoices or quotations found.</div>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Invoice / Quote #</th>
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Cashier</th>
                <th className="py-2.5 px-4 text-right">Total (PKR)</th>
                <th className="py-2.5 px-4 text-right">Paid (PKR)</th>
                <th className="py-2.5 px-4 text-right">Balance Due</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {b.bill_number}
                    {b.is_quote ? (
                      <span className="ml-2 inline-block bg-sky-100 text-sky-800 text-[9px] px-1.5 py-0.5 rounded font-sans font-bold">
                        QUOTE
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{formatDateTime(b.created_at)}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {b.customer_name}
                    {b.customer_phone && <span className="block text-[10px] text-slate-400 font-normal">{b.customer_phone}</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{b.cashier_username}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatPKR(b.total_paisa, false)}</td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">{formatPKR(b.paid_paisa, false)}</td>
                  <td className="py-3 px-4 text-right font-mono">
                    {b.balance_paisa > 0 ? (
                      <span className="text-red-600 font-bold">{formatPKR(b.balance_paisa, false)}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        b.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'HOLD'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleReprint(b.id, b.is_quote)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Reprint</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PrintModal
        isOpen={printDoc.isOpen}
        onClose={() => setPrintDoc({ ...printDoc, isOpen: false })}
        docType={printDoc.type}
        data={printDoc.data}
      />
    </div>
  );
};
