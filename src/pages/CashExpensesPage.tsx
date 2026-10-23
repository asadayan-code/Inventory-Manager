import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { CashRegister, Expense } from '../types';
import { formatPKR, pkrToPaisa, formatDateTime } from '../utils/formatters';
import {
  DollarSign,
  PlusCircle,
  Lock,
  Unlock,
  AlertTriangle,
  Receipt,
  Coffee,
  Zap,
  Truck,
  Wrench,
  CheckCircle2,
  X
} from 'lucide-react';

export const CashExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [expectedCalc, setExpectedCalc] = useState<any | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  // Open Register Form
  const [openFloatPKR, setOpenFloatPKR] = useState('15000');
  const [openNotes, setOpenNotes] = useState('Morning drawer float');

  // Close Register Form
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedCashPKR, setCountedCashPKR] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  // Add Expense Voucher Form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<any>('TEA_SNACKS');
  const [expAmountPKR, setExpAmountPKR] = useState('350');
  const [expRecipient, setExpRecipient] = useState('Shop Boy Tea Stall');
  const [expMethod, setExpMethod] = useState('CASH');
  const [expNotes, setExpNotes] = useState('');

  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [regRes, expRes] = await Promise.all([
        apiRequest<{ register: CashRegister | null }>('/cash-register/current'),
        apiRequest<{ expenses: Expense[] }>('/expenses'),
      ]);
      setCurrentRegister(regRes.register);
      setExpenses(expRes.expenses);

      if (regRes.register) {
        try {
          const calcRes = await apiRequest<{ calculation: any }>('/cash-register/expected');
          setExpectedCalc(calcRes.calculation);
        } catch {
          // ignore
        }
      } else {
        setExpectedCalc(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/cash-register/open', {
        method: 'POST',
        body: {
          opening_cash_paisa: pkrToPaisa(openFloatPKR),
          notes: openNotes.trim(),
        },
      });
      setMessage('Cash register drawer OPENED for today.');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to open register.');
    }
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRegister) return;
    try {
      const res = await apiRequest('/cash-register/close', {
        method: 'POST',
        body: {
          register_id: currentRegister.id,
          counted_cash_paisa: pkrToPaisa(countedCashPKR),
          notes: closeNotes.trim(),
        },
      });
      setMessage(
        `Register CLOSED. Counted: ${formatPKR(res.counted_cash_paisa)}, Difference: ${formatPKR(
          res.difference_paisa
        )}`
      );
      setShowCloseModal(false);
      setCountedCashPKR('');
      setCloseNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to close register.');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/expenses', {
        method: 'POST',
        body: {
          category: expCategory,
          amount_paisa: pkrToPaisa(expAmountPKR),
          recipient: expRecipient.trim(),
          payment_method: expMethod,
          notes: expNotes.trim(),
        },
      });
      setMessage(`Recorded expense of ${formatPKR(pkrToPaisa(expAmountPKR))} for ${expCategory}.`);
      setShowExpenseModal(false);
      setExpAmountPKR('');
      setExpRecipient('');
      setExpNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record expense.');
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'TEA_SNACKS':
        return <Coffee className="w-4 h-4 text-amber-600" />;
      case 'ELECTRICITY':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'TRANSPORT':
        return <Truck className="w-4 h-4 text-blue-600" />;
      case 'MAINTENANCE':
        return <Wrench className="w-4 h-4 text-slate-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-emerald-600" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            Cash Register Reconciliation & Shop Expenses
          </h2>
          <p className="text-xs text-slate-500">
            Daily register opening/closing, expected cash balancing, and operational expense vouchers
          </p>
        </div>

        <button
          onClick={() => setShowExpenseModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Record Expense Voucher</span>
        </button>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 text-xs flex justify-between items-center">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Register Status Banner Card */}
      <div className="mt-4 p-6 bg-white rounded-xl border border-slate-200 shadow-xs">
        {currentRegister ? (
          <div>
            <div className="flex justify-between items-start pb-4 border-b">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-1">
                  <Unlock className="w-3.5 h-3.5" />
                  Cash Register # {currentRegister.id} OPEN
                </span>
                <p className="text-xs text-slate-500 mt-1">
                  Opened at: {formatDateTime(currentRegister.opening_time)} by {currentRegister.opened_by_name}
                </p>
              </div>

              <button
                onClick={() => {
                  if (expectedCalc) {
                    setCountedCashPKR(formatPKR(expectedCalc.expected_cash_paisa, false));
                  }
                  setShowCloseModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <Lock className="w-4 h-4" />
                <span>Reconcile & Close Register</span>
              </button>
            </div>

            {/* Expected Cash Formula breakdown */}
            {expectedCalc && (
              <div className="grid grid-cols-5 gap-3 mt-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">1. Opening Float</span>
                  <span className="text-base font-extrabold text-slate-900 font-mono">
                    {formatPKR(expectedCalc.opening_cash_paisa)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block uppercase font-bold">+ Cash Sales / Udhaar</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    +{formatPKR(expectedCalc.cash_in_sales_paisa)}
                  </span>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <span className="text-[10px] text-red-700 block uppercase font-bold">- Cash Returns</span>
                  <span className="text-base font-extrabold text-red-700 font-mono">
                    -{formatPKR(expectedCalc.cash_out_refunds_paisa)}
                  </span>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <span className="text-[10px] text-red-700 block uppercase font-bold">- Cash Expenses</span>
                  <span className="text-base font-extrabold text-red-700 font-mono">
                    -{formatPKR(expectedCalc.cash_out_expenses_paisa)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-lg border border-slate-800">
                  <span className="text-[10px] text-emerald-400 block uppercase font-bold">= Expected in Drawer</span>
                  <span className="text-base font-black text-white font-mono">
                    {formatPKR(expectedCalc.expected_cash_paisa)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-1">
                <Lock className="w-3.5 h-3.5" />
                Register is Currently CLOSED
              </span>
              <p className="text-xs text-slate-500 mt-1">Open register with morning opening float cash to begin sales.</p>
            </div>

            <form onSubmit={handleOpenRegister} className="flex items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="Opening Float (PKR)"
                value={openFloatPKR}
                onChange={(e) => setOpenFloatPKR(e.target.value)}
                className="border rounded-lg px-3 py-2 font-mono font-bold w-40 text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
              >
                Open Register
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Expenses History List */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
          <span className="font-bold text-slate-800">Operational Expense Vouchers ({expenses.length})</span>
          <span className="text-slate-500 text-[11px]">Rent, tea, electricity, wages, transport</span>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
            <tr>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Category</th>
              <th className="py-2.5 px-4">Recipient / Payee</th>
              <th className="py-2.5 px-4">Method</th>
              <th className="py-2.5 px-4">Recorded By</th>
              <th className="py-2.5 px-4">Remarks</th>
              <th className="py-2.5 px-4 text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 text-slate-500 font-mono">{e.expense_date}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                    {getCategoryIcon(e.category)}
                    {e.category}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">{e.recipient}</td>
                <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{e.payment_method}</td>
                <td className="py-3 px-4 text-slate-600">{e.recorded_by}</td>
                <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{e.notes || '-'}</td>
                <td className="py-3 px-4 text-right font-mono font-bold text-red-600">
                  {formatPKR(e.amount_paisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Close Register Reconciliation Modal */}
      {showCloseModal && expectedCalc && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <h3 className="font-bold text-base mb-2">Close Cash Register Session</h3>
            <p className="text-xs text-slate-500 mb-4">Count physical cash in drawer and record reconciliation variance.</p>

            <form onSubmit={handleCloseRegister} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">System Expected Cash:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatPKR(expectedCalc.expected_cash_paisa)}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Physical Counted Cash (PKR) *</label>
                <input
                  type="text"
                  required
                  value={countedCashPKR}
                  onChange={(e) => setCountedCashPKR(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono font-bold text-sm focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Reconciliation Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Rs 50 loose coins difference"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Confirm & Lock Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <h3 className="font-bold text-base mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              New Expense Voucher
            </h3>

            <form onSubmit={handleRecordExpense} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Category *</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full border rounded-lg p-2 font-bold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="TEA_SNACKS">TEA & SNACKS (Daily staff refreshments)</option>
                  <option value="ELECTRICITY">ELECTRICITY BILL (WAPDA / LESCO)</option>
                  <option value="RENT">SHOP RENT</option>
                  <option value="SALARY">STAFF SALARY / WAGES</option>
                  <option value="TRANSPORT">TRANSPORT / CARGO / RICKSHAW</option>
                  <option value="MAINTENANCE">REPAIR & MAINTENANCE</option>
                  <option value="OTHER">OTHER OPERATIONAL EXPENSE</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Amount (PKR) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500"
                  value={expAmountPKR}
                  onChange={(e) => setExpAmountPKR(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Payee / Recipient *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lahore Electric Supply / Rickshaw Driver"
                  value={expRecipient}
                  onChange={(e) => setExpRecipient(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Paid Out Of</label>
                <select
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value)}
                  className="w-full border rounded-lg p-2 font-bold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="CASH">Cash Drawer</option>
                  <option value="BANK_TRANSFER">Bank Account</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">Easypaisa</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Details..."
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 text-white font-bold rounded-lg cursor-pointer"
                >
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
