import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { Bill } from '../types';
import { formatPKR } from '../utils/formatters';
import { RotateCcw, Search, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export const ReturnsPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [billNumberInput, setBillNumberInput] = useState('');
  const [loadedBill, setLoadedBill] = useState<Bill | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnItemsState, setReturnItemsState] = useState<
    Array<{
      bill_item_id: number;
      product_name: string;
      unit_price_paisa: number;
      maxQty: number;
      returnQty: number;
      restock_action: 'RESTOCK' | 'SCRAP';
      serial_number: string;
      note: string;
    }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOwner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Owner Access Required</h2>
        <p className="text-xs text-slate-600 max-w-md mt-2">
          Returns and refund processing is restricted to the shop owner only. Cashiers cannot issue refunds.
          Please ask the shop owner to log in.
        </p>
      </div>
    );
  }

  const handleLookupBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = billNumberInput.trim();
    if (!q) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Find bill by bill number
      const billsRes = await apiRequest<{ bills: Bill[] }>('/bills');
      const match = billsRes.bills.find(
        (b) => b.bill_number.toLowerCase() === q.toLowerCase() || String(b.id) === q
      );

      if (!match) {
        throw new Error(`Bill #${q} not found. Please verify the invoice number on the receipt.`);
      }

      const full = await apiRequest<{ bill: Bill }>(`/bills/${match.id}`);
      setLoadedBill(full.bill);

      // Initialize return state
      setReturnItemsState(
        (full.bill.items || []).map((itm) => ({
          bill_item_id: itm.id,
          product_name: `${itm.name} (${itm.variant_name})`,
          unit_price_paisa: itm.unit_price_paisa,
          maxQty: itm.quantity,
          returnQty: 0,
          restock_action: 'RESTOCK',
          serial_number: itm.serial_numbers?.[0] || '',
          note: '',
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Error finding bill.');
      setLoadedBill(null);
    } finally {
      setLoading(false);
    }
  };

  // Calculate return refund preview
  const totalRefundValue = returnItemsState.reduce(
    (sum, itm) => sum + itm.unit_price_paisa * itm.returnQty,
    0
  );
  const currentBillBalance = loadedBill?.balance_paisa || 0;
  const balanceToCancel = Math.min(currentBillBalance, totalRefundValue);
  const cashToRefund = totalRefundValue - balanceToCancel;

  const handleSubmitReturn = async () => {
    if (!loadedBill) return;
    if (!returnReason.trim()) {
      setError('A reason for the return is mandatory.');
      return;
    }

    const itemsToReturn = returnItemsState.filter((i) => i.returnQty > 0);
    if (itemsToReturn.length === 0) {
      setError('Please select at least one item and quantity to return.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest<{ return_number: string; total_refund_paisa: number }>(
        '/returns',
        {
          method: 'POST',
          body: {
            original_bill_id: loadedBill.id,
            reason: returnReason.trim(),
            refund_method: 'CASH',
            items: itemsToReturn.map((itm) => ({
              bill_item_id: itm.bill_item_id,
              quantity: itm.returnQty,
              restock_action: itm.restock_action,
              serial_number: itm.serial_number,
              note: itm.note,
            })),
          },
        }
      );

      setSuccess(
        `Return #${res.return_number} processed successfully! Total refund: ${formatPKR(
          res.total_refund_paisa
        )} (Cancelled debt: ${formatPKR(balanceToCancel)}, Cash refund: ${formatPKR(cashToRefund)}).`
      );
      setLoadedBill(null);
      setBillNumberInput('');
      setReturnReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to process return.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-100">
      <div className="pb-4 border-b border-slate-300">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <RotateCcw className="w-6 h-6 text-amber-600" />
          Returns & Customer Refunds (Owner Only)
        </h2>
        <p className="text-xs text-slate-500">
          Rule: Returns first cancel any unpaid balance on the bill, then refund the rest.
        </p>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-xl text-red-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Bill Search Form */}
      <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-xs max-w-xl">
        <form onSubmit={handleLookupBill} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={billNumberInput}
              onChange={(e) => setBillNumberInput(e.target.value)}
              placeholder="Scan or enter Bill # (e.g. INV-20261022-0001)..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition"
          >
            {loading ? 'Finding...' : 'Find Bill'}
          </button>
        </form>
      </div>

      {/* Loaded Bill Detail and Return Form */}
      {loadedBill && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs max-w-3xl space-y-6">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">Selected Bill:</span>
              <h3 className="text-lg font-black font-mono text-slate-900">#{loadedBill.bill_number}</h3>
              <p className="text-xs text-slate-600">Customer: {loadedBill.customer_name} ({loadedBill.customer_phone || 'No phone'})</p>
            </div>
            <div className="text-right text-xs">
              <span className="text-slate-500">Bill Total: {formatPKR(loadedBill.total_paisa)}</span>
              <p className="font-bold text-red-600 font-mono mt-0.5">
                Current Unpaid Balance (Udhaar): {formatPKR(loadedBill.balance_paisa)}
              </p>
            </div>
          </div>

          {/* Items selection */}
          <div>
            <h4 className="font-bold text-xs text-slate-800 mb-2">Select Items to Return:</h4>
            <div className="space-y-3">
              {returnItemsState.map((itm, idx) => (
                <div key={itm.bill_item_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{itm.product_name}</p>
                    <p className="text-slate-500 text-[11px] font-mono">
                      Sold at: {formatPKR(itm.unit_price_paisa)} • Max return: {itm.maxQty} units
                    </p>
                  </div>

                  {/* Quantity to return */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-600 font-semibold">Qty:</label>
                    <select
                      value={itm.returnQty}
                      onChange={(e) => {
                        const updated = [...returnItemsState];
                        updated[idx].returnQty = Number(e.target.value);
                        setReturnItemsState(updated);
                      }}
                      className="border rounded p-1 font-mono font-bold"
                    >
                      {Array.from({ length: itm.maxQty + 1 }).map((_, n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Restock vs Scrap Action */}
                  {itm.returnQty > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-600 font-semibold">Action:</label>
                      <select
                        value={itm.restock_action}
                        onChange={(e) => {
                          const updated = [...returnItemsState];
                          updated[idx].restock_action = e.target.value as any;
                          setReturnItemsState(updated);
                        }}
                        className={`border rounded p-1 font-bold text-[11px] ${
                          itm.restock_action === 'RESTOCK' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                        }`}
                      >
                        <option value="RESTOCK">Restock into Inventory</option>
                        <option value="SCRAP">Scrap / Defective (Do not restock)</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Refund Breakdown Card */}
          {totalRefundValue > 0 && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2">
              <span className="font-bold text-amber-900 uppercase text-[11px] block">
                Refund & Udhaar Cancellation Breakdown:
              </span>
              <div className="flex justify-between font-semibold">
                <span>Total Items Refund Value:</span>
                <span className="font-mono text-slate-900">{formatPKR(totalRefundValue)}</span>
              </div>
              <div className="flex justify-between text-indigo-700 font-semibold border-t border-amber-200 pt-1">
                <span>1. Deducted from Customer's Unpaid Udhaar Debt:</span>
                <span className="font-mono">-{formatPKR(balanceToCancel)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-bold border-t border-amber-200 pt-1 text-sm">
                <span>2. Remaining Cash to Refund Customer:</span>
                <span className="font-mono">{formatPKR(cashToRefund)}</span>
              </div>
            </div>
          )}

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Return Reason (for store audit log) *:
            </label>
            <input
              type="text"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Customer returned unused item within 3 days / Defective amplifier channel"
              className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit Return */}
          <div className="flex justify-end gap-3 pt-3 border-t">
            <button
              onClick={() => setLoadedBill(null)}
              className="px-4 py-2 border rounded-lg text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReturn}
              disabled={loading || totalRefundValue === 0}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 shadow-xs"
            >
              Confirm Return & Process Refund
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
