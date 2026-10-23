import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { ProductVariant, Supplier } from '../types';
import { formatPKR, pkrToPaisa, formatDateTime } from '../utils/formatters';
import { PrintModal } from '../components/PrintModal';
import {
  Boxes,
  PlusCircle,
  AlertTriangle,
  ClipboardList,
  Printer,
  History,
  Archive,
  ArrowDownCircle,
  CheckCircle2,
  X
} from 'lucide-react';

export const StockPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [activeTab, setActiveTab] = useState<'LOW_STOCK' | 'DEAD_STOCK' | 'RECEIVE_PO' | 'STOCKTAKE' | 'ADJUST'>('LOW_STOCK');

  // Low stock & dead stock lists
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [deadStockItems, setDeadStockItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Suppliers & Products for PO / Adjustments
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<ProductVariant[]>([]);

  // Receive PO Form
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paidAmountPKR, setPaidAmountPKR] = useState('');
  const [poPaymentMethod, setPoPaymentMethod] = useState('CASH');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<
    Array<{
      variant_id: number;
      name: string;
      quantity: number;
      unit_cost_pkr: string;
      serials: string;
    }>
  >([]);

  // Manual Adjustment Form
  const [adjVariantId, setAdjVariantId] = useState<number | ''>('');
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState<'DAMAGE' | 'THEFT' | 'COUNT_ADJUSTMENT'>('DAMAGE');
  const [adjNote, setAdjNote] = useState('');

  // Stocktake
  const [stocktakeCounts, setStocktakeCounts] = useState<Record<number, number>>({});
  const [stocktakeActiveId, setStocktakeActiveId] = useState<number | null>(null);

  // History Modal
  const [historyVariant, setHistoryVariant] = useState<ProductVariant | null>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Print Reorder List Modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const loadStockData = async () => {
    setLoading(true);
    try {
      const [lowRes, deadRes, suppRes, catRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/stock/low-stock'),
        apiRequest<{ items: any[] }>('/stock/dead-stock', { params: { days: 60 } }),
        apiRequest<{ suppliers: Supplier[] }>('/suppliers'),
        apiRequest<{ items: ProductVariant[] }>('/catalog/search', { params: { limit: 150 } }),
      ]);
      setLowStockItems(lowRes.items);
      setDeadStockItems(deadRes.items);
      setSuppliers(suppRes.suppliers);
      setCatalogItems(catRes.items.filter((i) => !i.is_service));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStockData();
  }, []);

  // Submit Receive Goods PO
  const handleReceivePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setMessage({ type: 'error', text: 'Supplier is required.' });
      return;
    }
    if (!invoiceNumber.trim()) {
      setMessage({ type: 'error', text: 'Supplier invoice number is required.' });
      return;
    }
    if (poItems.length === 0) {
      setMessage({ type: 'error', text: 'At least one item must be added to purchase order.' });
      return;
    }

    try {
      await apiRequest('/purchases', {
        method: 'POST',
        body: {
          supplier_id: Number(selectedSupplierId),
          invoice_number: invoiceNumber.trim(),
          paid_amount_paisa: pkrToPaisa(paidAmountPKR),
          payment_method: poPaymentMethod,
          notes: poNotes.trim(),
          items: poItems.map((p) => ({
            variant_id: p.variant_id,
            quantity: p.quantity,
            unit_cost_paisa: pkrToPaisa(p.unit_cost_pkr),
            serials: p.serials ? p.serials.split(',').map((s) => s.trim()).filter(Boolean) : [],
          })),
        },
      });

      setMessage({ type: 'success', text: 'Goods received and stock ledger updated successfully!' });
      setInvoiceNumber('');
      setPaidAmountPKR('');
      setPoNotes('');
      setPoItems([]);
      loadStockData();
      setActiveTab('LOW_STOCK');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to receive goods.' });
    }
  };

  // Submit Manual Adjustment
  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjVariantId) {
      setMessage({ type: 'error', text: 'Please select an item.' });
      return;
    }
    if (!adjNote.trim() || adjNote.trim().length < 3) {
      setMessage({ type: 'error', text: 'A mandatory explanation note (at least 3 characters) is required.' });
      return;
    }

    try {
      const res = await apiRequest('/stock/adjust', {
        method: 'POST',
        body: {
          variant_id: Number(adjVariantId),
          quantity: adjQty,
          reason: adjReason,
          note: adjNote.trim(),
        },
      });
      setMessage({
        type: 'success',
        text: `Stock adjusted by ${adjQty > 0 ? '+' : ''}${adjQty}. New stock on hand: ${res.new_stock}`,
      });
      setAdjNote('');
      loadStockData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Adjustment failed.' });
    }
  };

  // Stocktake functions
  const handleStartStocktake = async () => {
    try {
      const res = await apiRequest<{ stocktake_id: number }>('/stocktake/start', {
        method: 'POST',
        body: { notes: 'Physical store count' },
      });
      setStocktakeActiveId(res.stocktake_id);
      // Initialize counts with system stock
      const initial: Record<number, number> = {};
      catalogItems.forEach((c) => {
        initial[c.variant_id || c.id!] = c.stock_on_hand;
      });
      setStocktakeCounts(initial);
      setMessage({ type: 'success', text: `Started new physical stocktake #${res.stocktake_id}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to start stocktake.' });
    }
  };

  const handleCommitStocktake = async () => {
    if (!stocktakeActiveId) return;
    try {
      const countsPayload = Object.entries(stocktakeCounts).map(([varId, counted]) => ({
        variant_id: Number(varId),
        counted_quantity: Number(counted),
      }));

      const res = await apiRequest<{ adjustments_count: number }>('/stocktake/commit', {
        method: 'POST',
        body: {
          stocktake_id: stocktakeActiveId,
          counts: countsPayload,
        },
      });

      setMessage({
        type: 'success',
        text: `Stocktake committed successfully with ${res.adjustments_count} audit adjustments posted!`,
      });
      setStocktakeActiveId(null);
      loadStockData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to commit stocktake.' });
    }
  };

  // View Item Movement History
  const handleViewHistory = async (item: ProductVariant) => {
    setHistoryVariant(item);
    setShowHistoryModal(true);
    try {
      const res = await apiRequest<{ history: any[] }>(`/stock/history/${item.variant_id || item.id}`);
      setHistoryList(res.history);
    } catch {
      setHistoryList([]);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-600" />
            Inventory & Stock Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Rule #2: Stock on hand is strictly computed from stock movements ledger.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg p-1 text-xs">
          <button
            onClick={() => setActiveTab('LOW_STOCK')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'LOW_STOCK' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Low Stock ({lowStockItems.length})
          </button>
          <button
            onClick={() => setActiveTab('DEAD_STOCK')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'DEAD_STOCK' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dead Stock ({deadStockItems.length})
          </button>
          <button
            onClick={() => setActiveTab('RECEIVE_PO')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'RECEIVE_PO' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Receive Goods
          </button>
          {isOwner && (
            <>
              <button
                onClick={() => setActiveTab('ADJUST')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  activeTab === 'ADJUST' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Adjust Stock
              </button>
              <button
                onClick={() => setActiveTab('STOCKTAKE')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  activeTab === 'STOCKTAKE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Physical Stocktake
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between border ${
            message.type === 'error' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. LOW STOCK TAB */}
      {activeTab === 'LOW_STOCK' && (
        <div className="flex-1 flex flex-col mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-3.5 bg-slate-50 border-b flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">
              Items Reached or Below Reorder Level ({lowStockItems.length})
            </span>
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Reorder List (A4)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Item & Variant</th>
                  <th className="py-2.5 px-4">SKU / Barcode</th>
                  <th className="py-2.5 px-4 text-center">Stock on Hand</th>
                  <th className="py-2.5 px-4 text-center">Reorder Level</th>
                  <th className="py-2.5 px-4">Last Supplier</th>
                  <th className="py-2.5 px-4 text-center">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStockItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{item.product_name}</p>
                      <p className="text-slate-500 text-[11px]">{item.variant_name} • {item.brand_name || ''}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {item.sku}
                      <span className="block text-slate-400 text-[10px]">{item.barcode}</span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-red-600 font-mono text-sm">
                      {item.stock_on_hand}
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-slate-600">{item.reorder_level}</td>
                    <td className="py-3 px-4 text-slate-700">{item.last_supplier_name || 'Al-Madina Sound Imports'}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleViewHistory(item)}
                        className="p-1.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                        title="View Stock Ledger History"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. DEAD STOCK TAB */}
      {activeTab === 'DEAD_STOCK' && (
        <div className="flex-1 flex flex-col mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-3.5 bg-slate-50 border-b flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">
              Dead Stock Report (No Sales Recorded in Last 60 Days)
            </span>
            <span className="text-slate-500 text-[11px]">Tie-up inventory analysis</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Item & Variant</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4 text-center">Unsold Units</th>
                  {isOwner && <th className="py-2.5 px-4 text-right">Cost Value Tied Up</th>}
                  <th className="py-2.5 px-4 text-right">Retail Value</th>
                  <th className="py-2.5 px-4">Last Sold Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deadStockItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {item.product_name}
                      <span className="block font-normal text-slate-500 text-[11px]">{item.variant_name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{item.sku}</td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800">{item.stock_on_hand}</td>
                    {isOwner && (
                      <td className="py-3 px-4 text-right font-mono font-semibold text-amber-700">
                        {formatPKR(item.stock_on_hand * (item.cost_paisa || 0))}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatPKR(item.stock_on_hand * item.retail_price_paisa)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{item.last_sold_at ? formatDateTime(item.last_sold_at) : 'Never Sold'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. RECEIVE GOODS PO TAB */}
      {activeTab === 'RECEIVE_PO' && (
        <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl p-6 shadow-xs max-w-4xl">
          <h3 className="font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            Receive Stock from Supplier (Goods Received Note / PO)
          </h3>

          <form onSubmit={handleReceivePO} className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-semibold block mb-1">Select Supplier *</label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Payable: {formatPKR(s.balance_paisa)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Supplier Invoice # *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. INV-SONY-990"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Amount Paid Upfront (PKR)</label>
                <input
                  type="text"
                  placeholder="0 (leave blank if full credit)"
                  value={paidAmountPKR}
                  onChange={(e) => setPaidAmountPKR(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Items to receive builder */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-slate-800">Items Received:</span>
                <button
                  type="button"
                  onClick={() => {
                    if (catalogItems.length > 0) {
                      const first = catalogItems[0];
                      setPoItems([
                        ...poItems,
                        {
                          variant_id: first.variant_id || first.id!,
                          name: `${first.product_name} (${first.variant_name})`,
                          quantity: 1,
                          unit_cost_pkr: formatPKR(first.cost_paisa || 0, false),
                          serials: '',
                        },
                      ]);
                    }
                  }}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  + Add Line Item
                </button>
              </div>

              <div className="space-y-3">
                {poItems.map((pi, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border rounded-xl grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        value={pi.variant_id}
                        onChange={(e) => {
                          const vId = Number(e.target.value);
                          const found = catalogItems.find((c) => (c.variant_id || c.id) === vId);
                          const updated = [...poItems];
                          updated[idx].variant_id = vId;
                          if (found) {
                            updated[idx].name = `${found.product_name} (${found.variant_name})`;
                            updated[idx].unit_cost_pkr = formatPKR(found.cost_paisa || 0, false);
                          }
                          setPoItems(updated);
                        }}
                        className="w-full border rounded p-1.5 bg-white text-xs"
                      >
                        {catalogItems.map((c) => (
                          <option key={c.variant_id || c.id} value={c.variant_id || c.id}>
                            {c.product_name} ({c.variant_name})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={pi.quantity}
                        onChange={(e) => {
                          const updated = [...poItems];
                          updated[idx].quantity = Number(e.target.value);
                          setPoItems(updated);
                        }}
                        className="w-full border rounded p-1.5 bg-white text-xs font-mono font-bold"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Cost (PKR)"
                        value={pi.unit_cost_pkr}
                        onChange={(e) => {
                          const updated = [...poItems];
                          updated[idx].unit_cost_pkr = e.target.value;
                          setPoItems(updated);
                        }}
                        className="w-full border rounded p-1.5 bg-white text-xs font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Serials (comma separated)"
                        value={pi.serials}
                        onChange={(e) => {
                          const updated = [...poItems];
                          updated[idx].serials = e.target.value;
                          setPoItems(updated);
                        }}
                        className="w-full border rounded p-1.5 bg-white text-xs font-mono text-[10px]"
                      />
                    </div>

                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => setPoItems(poItems.filter((_, i) => i !== idx))}
                        className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Notes / Remarks</label>
              <input
                type="text"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="e.g. Delivered by Bilawal Cargo Lahore, Bilty #8821"
                className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none text-xs"
              />
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="submit"
                disabled={poItems.length === 0}
                className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer transition disabled:opacity-40"
              >
                Post Purchase to Ledger & Inventory
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. MANUAL ADJUSTMENTS (OWNER ONLY) */}
      {activeTab === 'ADJUST' && isOwner && (
        <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl p-6 shadow-xs max-w-xl">
          <h3 className="font-bold text-base text-slate-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Manual Stock Adjustment (Damage / Theft / Count Correction)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            A clear explanation note is strictly required by the store audit system.
          </p>

          <form onSubmit={handleManualAdjustment} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Select Product Variant *</label>
              <select
                required
                value={adjVariantId}
                onChange={(e) => setAdjVariantId(Number(e.target.value))}
                className="w-full border rounded-lg p-2 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Choose item --</option>
                {catalogItems.map((c) => (
                  <option key={c.variant_id || c.id} value={c.variant_id || c.id}>
                    {c.product_name} ({c.variant_name}) • Current Stock: {c.stock_on_hand}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-1">Quantity Adjustment (+ or -) *</label>
                <input
                  type="number"
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(Number(e.target.value))}
                  placeholder="e.g. -1 for damaged, +2 for found"
                  className="w-full border rounded-lg p-2 font-mono font-bold focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Reason *</label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value as any)}
                  className="w-full border rounded-lg p-2 focus:border-amber-500 focus:outline-none font-bold text-slate-800"
                >
                  <option value="DAMAGE">DAMAGE (Broken / Defective in shop)</option>
                  <option value="THEFT">THEFT (Missing / Stolen)</option>
                  <option value="COUNT_ADJUSTMENT">COUNT_ADJUSTMENT (Count correction)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Mandatory Note (Who, Why, Details) *</label>
              <input
                type="text"
                required
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="e.g. Glass cracked during shelf restocking on aisle 2"
                className="w-full border rounded-lg p-2 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer transition shadow-xs"
            >
              Post Adjustment to Stock Ledger
            </button>
          </form>
        </div>
      )}

      {/* 5. PHYSICAL STOCKTAKE (OWNER ONLY) */}
      {activeTab === 'STOCKTAKE' && isOwner && (
        <div className="flex-1 flex flex-col mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-3.5 bg-slate-50 border-b flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-slate-900 block">Physical Stocktake Count Screen</span>
              <span className="text-slate-500 text-[11px]">
                Scan or count each item. Discrepancies are automatically posted to the stock ledger.
              </span>
            </div>

            {!stocktakeActiveId ? (
              <button
                onClick={handleStartStocktake}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
              >
                Start New Stocktake
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCommitStocktake}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Commit Physical Counts & Post Adjustments
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {stocktakeActiveId ? (
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Item & Variant</th>
                    <th className="py-2.5 px-4">SKU / Barcode</th>
                    <th className="py-2.5 px-4 text-center">System Stock</th>
                    <th className="py-2.5 px-4 text-center">Physical Count</th>
                    <th className="py-2.5 px-4 text-center">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalogItems.map((item) => {
                    const varId = item.variant_id || item.id!;
                    const systemQty = item.stock_on_hand;
                    const physicalQty = stocktakeCounts[varId] !== undefined ? stocktakeCounts[varId] : systemQty;
                    const diff = physicalQty - systemQty;

                    return (
                      <tr key={varId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          {item.product_name}
                          <span className="block font-normal text-slate-500 text-[11px]">{item.variant_name}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">{item.sku}</td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-700">{systemQty}</td>
                        <td className="py-2.5 px-4 text-center">
                          <input
                            type="number"
                            value={physicalQty}
                            onChange={(e) => {
                              setStocktakeCounts({
                                ...stocktakeCounts,
                                [varId]: Number(e.target.value),
                              });
                            }}
                            className="w-16 border rounded p-1 text-center font-mono font-bold text-xs"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-xs">
                          {diff === 0 ? (
                            <span className="text-slate-400">0</span>
                          ) : diff > 0 ? (
                            <span className="text-emerald-600">+{diff}</span>
                          ) : (
                            <span className="text-red-600">{diff}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs">
                No active stocktake session. Click "Start New Stocktake" above to begin physical verification.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- LEDGER HISTORY MODAL ---------------- */}
      {showHistoryModal && historyVariant && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  Stock Movement Audit Ledger
                </h3>
                <p className="text-xs text-slate-500">{historyVariant.product_name} ({historyVariant.variant_name})</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b font-bold text-[10px] uppercase text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-center">Change</th>
                    <th className="py-2 px-3">User</th>
                    <th className="py-2 px-3">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyList.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 px-3 text-slate-500">{formatDateTime(h.created_at)}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{h.movement_type}</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">
                        {h.quantity > 0 ? (
                          <span className="text-emerald-600">+{h.quantity}</span>
                        ) : (
                          <span className="text-red-600">{h.quantity}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{h.user_name}</td>
                      <td className="py-2 px-3 text-slate-600 max-w-xs truncate">{h.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Print Reorder List Modal */}
      <PrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        docType="REORDER_LIST"
        data={{ items: lowStockItems }}
      />
    </div>
  );
};
