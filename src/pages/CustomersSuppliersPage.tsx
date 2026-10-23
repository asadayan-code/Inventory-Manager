import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { Customer, Supplier } from '../types';
import { formatPKR, pkrToPaisa, formatDateTime } from '../utils/formatters';
import {
  Users,
  Building2,
  Search,
  PlusCircle,
  DollarSign,
  Phone,
  Car,
  FileText,
  CreditCard,
  CheckCircle2,
  X
} from 'lucide-react';

export const CustomersSuppliersPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Customer Udhaar Payment Modal
  const [payUdhaarCustomer, setPayUdhaarCustomer] = useState<Customer | null>(null);
  const [udhaarAmountPKR, setUdhaarAmountPKR] = useState('');
  const [udhaarMethod, setUdhaarMethod] = useState('CASH');
  const [udhaarNotes, setUdhaarNotes] = useState('');

  // Supplier Pay Modal (Owner Only)
  const [paySupplierTarget, setPaySupplierTarget] = useState<Supplier | null>(null);
  const [supplierAmountPKR, setSupplierAmountPKR] = useState('');
  const [supplierMethod, setSupplierMethod] = useState('CASH');
  const [supplierNotes, setSupplierNotes] = useState('');

  // Add Customer / Add Supplier Modal
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustReg, setNewCustReg] = useState('');
  const [newCustType, setNewCustType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppContact, setNewSuppContact] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('');
  const [newSuppAddr, setNewSuppAddr] = useState('');

  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        apiRequest<{ customers: Customer[] }>('/customers'),
        apiRequest<{ suppliers: Supplier[] }>('/suppliers'),
      ]);
      setCustomers(cRes.customers);
      setSuppliers(sRes.suppliers);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePayUdhaar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payUdhaarCustomer) return;
    const amountPaisa = pkrToPaisa(udhaarAmountPKR);
    if (amountPaisa <= 0) return;

    try {
      await apiRequest('/customers/pay-udhaar', {
        method: 'POST',
        body: {
          customer_id: payUdhaarCustomer.id,
          amount_paisa: amountPaisa,
          payment_method: udhaarMethod,
          notes: udhaarNotes.trim(),
        },
      });

      setMessage(`Received ${formatPKR(amountPaisa)} from ${payUdhaarCustomer.name}. Udhaar updated.`);
      setPayUdhaarCustomer(null);
      setUdhaarAmountPKR('');
      setUdhaarNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Payment failed.');
    }
  };

  const handlePaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplierTarget) return;
    const amountPaisa = pkrToPaisa(supplierAmountPKR);
    if (amountPaisa <= 0) return;

    try {
      await apiRequest('/suppliers/pay', {
        method: 'POST',
        body: {
          supplier_id: paySupplierTarget.id,
          amount_paisa: amountPaisa,
          payment_method: supplierMethod,
          notes: supplierNotes.trim(),
        },
      });

      setMessage(`Paid ${formatPKR(amountPaisa)} to supplier ${paySupplierTarget.name}.`);
      setPaySupplierTarget(null);
      setSupplierAmountPKR('');
      setSupplierNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Payment failed.');
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/customers', {
        method: 'POST',
        body: {
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          car_registration: newCustReg.trim().toUpperCase(),
          customer_type: newCustType,
        },
      });
      setShowAddCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustReg('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add customer.');
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/suppliers', {
        method: 'POST',
        body: {
          name: newSuppName.trim(),
          contact_person: newSuppContact.trim(),
          phone: newSuppPhone.trim(),
          address: newSuppAddr.trim(),
        },
      });
      setShowAddSupplier(false);
      setNewSuppName('');
      setNewSuppContact('');
      setNewSuppPhone('');
      setNewSuppAddr('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add supplier.');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Customers & Suppliers Management
          </h2>
          <p className="text-xs text-slate-500">
            Customer Udhaar debt balances, wholesale pricing tags, and supplier payables
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 text-xs">
            <button
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'CUSTOMERS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customers ({customers.length})
            </button>
            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                activeTab === 'SUPPLIERS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Suppliers ({suppliers.length})
            </button>
          </div>

          {activeTab === 'CUSTOMERS' ? (
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Customer</span>
            </button>
          ) : isOwner ? (
            <button
              onClick={() => setShowAddSupplier(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Supplier</span>
            </button>
          ) : null}
        </div>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 text-xs flex justify-between items-center">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. CUSTOMERS VIEW */}
      {activeTab === 'CUSTOMERS' && (
        <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Customer Name</th>
                <th className="py-2.5 px-4">Phone Number</th>
                <th className="py-2.5 px-4">Vehicle Reg / Model</th>
                <th className="py-2.5 px-4">Account Type</th>
                <th className="py-2.5 px-4 text-right">Outstanding Udhaar</th>
                <th className="py-2.5 px-4 text-center">Receive Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{c.phone}</td>
                  <td className="py-3 px-4 text-slate-700">
                    {c.car_registration ? (
                      <span className="font-mono font-bold text-indigo-900">{c.car_registration}</span>
                    ) : (
                      '-'
                    )}
                    {c.car_model && <span className="block text-[11px] text-slate-500">{c.car_model}</span>}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                        c.customer_type === 'WHOLESALE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.customer_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    {c.balance_paisa > 0 ? (
                      <span className="text-red-600 text-sm">{formatPKR(c.balance_paisa)}</span>
                    ) : (
                      <span className="text-emerald-700">Clear (0)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.balance_paisa > 0 ? (
                      <button
                        onClick={() => {
                          setPayUdhaarCustomer(c);
                          setUdhaarAmountPKR(formatPKR(c.balance_paisa, false));
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs"
                      >
                        Collect Udhaar
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setPayUdhaarCustomer(c);
                          setUdhaarAmountPKR('');
                        }}
                        className="px-2.5 py-1 text-slate-500 hover:text-slate-900 text-[11px] font-semibold cursor-pointer"
                      >
                        Add Advance
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. SUPPLIERS VIEW */}
      {activeTab === 'SUPPLIERS' && (
        <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Supplier Business Name</th>
                <th className="py-2.5 px-4">Contact Person</th>
                <th className="py-2.5 px-4">Phone Number</th>
                <th className="py-2.5 px-4">Market Address</th>
                <th className="py-2.5 px-4 text-right">What I Owe (Payable)</th>
                {isOwner && <th className="py-2.5 px-4 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900 text-sm">{s.name}</td>
                  <td className="py-3 px-4 text-slate-700">{s.contact_person || '-'}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{s.phone || '-'}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{s.address || '-'}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    {s.balance_paisa > 0 ? (
                      <span className="text-red-700 text-sm">{formatPKR(s.balance_paisa)}</span>
                    ) : (
                      <span className="text-slate-400">Rs 0</span>
                    )}
                  </td>
                  {isOwner && (
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setPaySupplierTarget(s);
                          setSupplierAmountPKR(formatPKR(s.balance_paisa, false));
                        }}
                        className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs"
                      >
                        Pay Supplier
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- PAY UDHAAR MODAL ---------------- */}
      {payUdhaarCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Receive Customer Udhaar Payment
              </h3>
              <button onClick={() => setPayUdhaarCustomer(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border mb-4 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer Profile</span>
              <p className="font-bold text-slate-900 text-sm">{payUdhaarCustomer.name}</p>
              <p className="text-slate-600 font-mono">{payUdhaarCustomer.phone}</p>
              <p className="text-red-600 font-bold font-mono mt-1">
                Outstanding Balance: {formatPKR(payUdhaarCustomer.balance_paisa)}
              </p>
            </div>

            <form onSubmit={handlePayUdhaar} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Payment Amount (PKR) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5000"
                  value={udhaarAmountPKR}
                  onChange={(e) => setUdhaarAmountPKR(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Payment Method</label>
                <select
                  value={udhaarMethod}
                  onChange={(e) => setUdhaarMethod(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none font-bold"
                >
                  <option value="CASH">Cash in Drawer</option>
                  <option value="BANK_TRANSFER">Bank Online Transfer</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">Easypaisa</option>
                  <option value="CARD">Debit / Credit Card</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Receipt Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Paid in cash by brother"
                  value={udhaarNotes}
                  onChange={(e) => setUdhaarNotes(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setPayUdhaarCustomer(null)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Confirm & Deduct Debt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- PAY SUPPLIER MODAL (OWNER ONLY) ---------------- */}
      {paySupplierTarget && isOwner && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                Pay Supplier Debt
              </h3>
              <button onClick={() => setPaySupplierTarget(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border mb-4 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Supplier</span>
              <p className="font-bold text-slate-900 text-sm">{paySupplierTarget.name}</p>
              <p className="text-red-700 font-bold font-mono mt-1">
                Amount Owed to Supplier: {formatPKR(paySupplierTarget.balance_paisa)}
              </p>
            </div>

            <form onSubmit={handlePaySupplier} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Amount Paid (PKR) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 15000"
                  value={supplierAmountPKR}
                  onChange={(e) => setSupplierAmountPKR(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono font-bold text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Paid Via</label>
                <select
                  value={supplierMethod}
                  onChange={(e) => setSupplierMethod(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-indigo-500 focus:outline-none font-bold"
                >
                  <option value="CASH">Cash out of Register</option>
                  <option value="BANK_TRANSFER">Bank Transfer (Meezan/HBL)</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">Easypaisa</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setPaySupplierTarget(null)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Confirm Supplier Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <h3 className="font-bold text-base mb-3">Add Customer Profile</h3>
            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <input
                type="text"
                required
                placeholder="Full Name *"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <input
                type="text"
                required
                placeholder="Phone Number (e.g. 0300-1234567) *"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <input
                type="text"
                placeholder="Car Registration (e.g. LEA-18-4921)"
                value={newCustReg}
                onChange={(e) => setNewCustReg(e.target.value)}
                className="w-full border rounded-lg p-2 uppercase font-mono"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCustomer(false)} className="px-3 py-1.5 border rounded">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded font-bold">
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && isOwner && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <h3 className="font-bold text-base mb-3">Add Supplier Profile</h3>
            <form onSubmit={handleAddSupplier} className="space-y-3 text-xs">
              <input
                type="text"
                required
                placeholder="Company / Supplier Name *"
                value={newSuppName}
                onChange={(e) => setNewSuppName(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <input
                type="text"
                placeholder="Contact Person (e.g. Haji Aslam)"
                value={newSuppContact}
                onChange={(e) => setNewSuppContact(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={newSuppPhone}
                onChange={(e) => setNewSuppPhone(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <input
                type="text"
                placeholder="Market Address (e.g. Hall Road / Montgomery Road)"
                value={newSuppAddr}
                onChange={(e) => setNewSuppAddr(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddSupplier(false)} className="px-3 py-1.5 border rounded">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-slate-900 text-white rounded font-bold">
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
