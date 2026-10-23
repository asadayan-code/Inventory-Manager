import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { formatDateTime, formatDate } from '../utils/formatters';
import {
  ShieldCheck,
  Search,
  PlusCircle,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck
} from 'lucide-react';

export const SerialsWarrantyPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  // Serial Lookup
  const [lookupSerial, setLookupSerial] = useState('');
  const [serialResult, setSerialResult] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Warranty Claims
  const [claims, setClaims] = useState<any[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // New Claim Modal
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSerial, setClaimSerial] = useState('');
  const [claimIssue, setClaimIssue] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);

  const loadClaims = async () => {
    setClaimsLoading(true);
    try {
      const res = await apiRequest<{ claims: any[] }>('/warranty-claims', {
        params: { status: statusFilter || undefined },
      });
      setClaims(res.claims);
    } catch {
      // ignore
    } finally {
      setClaimsLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, [statusFilter]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupSerial.trim()) return;

    setLookupLoading(true);
    setLookupError(null);
    setSerialResult(null);

    try {
      const res = await apiRequest<{ serial: any }>(`/serials/lookup/${encodeURIComponent(lookupSerial.trim())}`);
      setSerialResult(res.serial);
    } catch (err: any) {
      setLookupError(err.message || 'Serial number not recognized.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimSerial.trim() || !claimIssue.trim()) {
      setClaimError('Serial number and issue description are required.');
      return;
    }

    try {
      await apiRequest('/warranty-claims', {
        method: 'POST',
        body: {
          serial_number: claimSerial.trim(),
          issue_description: claimIssue.trim(),
          notes: claimNotes.trim(),
        },
      });
      setShowClaimModal(false);
      setClaimSerial('');
      setClaimIssue('');
      setClaimNotes('');
      loadClaims();
    } catch (err: any) {
      setClaimError(err.message || 'Failed to file warranty claim.');
    }
  };

  const handleUpdateStatus = async (claimId: number, newStatus: string) => {
    try {
      await apiRequest('/warranty-claims/status', {
        method: 'POST',
        body: {
          claim_id: claimId,
          status: newStatus,
          notes: `Status changed to ${newStatus}`,
        },
      });
      loadClaims();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Serial Tracking & Warranty Claims
          </h2>
          <p className="text-xs text-slate-500">
            Head units, Android tabs, amplifiers 1-serial-per-unit history and claims workflow
          </p>
        </div>

        <button
          onClick={() => {
            setClaimError(null);
            setShowClaimModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Warranty Claim Ticket</span>
        </button>
      </div>

      {/* Top Section: Quick Serial Lookup Card */}
      <div className="mt-4 p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
          <Search className="w-4 h-4 text-emerald-600" />
          Instant Serial Number Lookup (Scanner Friendly)
        </h3>

        <form onSubmit={handleLookup} className="flex gap-2 max-w-lg mb-3">
          <input
            type="text"
            value={lookupSerial}
            onChange={(e) => setLookupSerial(e.target.value)}
            placeholder="Scan or type unit serial # (e.g. SX9-232-00101)..."
            className="flex-1 border rounded-lg px-3 py-2 text-xs font-mono focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={lookupLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer transition"
          >
            {lookupLoading ? 'Checking...' : 'Lookup Serial'}
          </button>
        </form>

        {lookupError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{lookupError}</span>
          </div>
        )}

        {serialResult && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs grid grid-cols-4 gap-4 animate-fadeIn">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Product / Variant</span>
              <p className="font-bold text-slate-900">{serialResult.product_name}</p>
              <p className="text-slate-500 text-[11px]">{serialResult.variant_name} • SKU: {serialResult.sku}</p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Status</span>
              <span
                className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded mt-0.5 ${
                  serialResult.status === 'SOLD'
                    ? 'bg-blue-100 text-blue-800'
                    : serialResult.status === 'IN_STOCK'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {serialResult.status}
              </span>
              <p className="text-slate-500 text-[11px] mt-1">Supplier: {serialResult.supplier_name}</p>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer & Bill</span>
              {serialResult.bill_number ? (
                <>
                  <p className="font-bold text-slate-900">{serialResult.customer_name || 'Counter Customer'}</p>
                  <p className="text-slate-500 text-[11px] font-mono">Bill #{serialResult.bill_number}</p>
                  <p className="text-slate-400 text-[10px]">Sold: {formatDate(serialResult.sale_date)}</p>
                </>
              ) : (
                <p className="text-slate-400 italic">Unit has not been sold yet</p>
              )}
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Warranty Status</span>
              {serialResult.is_under_warranty ? (
                <div className="text-emerald-700 font-bold mt-0.5">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    UNDER WARRANTY
                  </span>
                  <p className="text-[11px] text-slate-600 font-normal mt-0.5">
                    Expires on: {serialResult.warranty_expiry} ({serialResult.warranty_months} Months)
                  </p>
                </div>
              ) : serialResult.warranty_expiry ? (
                <div className="text-red-600 font-bold mt-0.5">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    WARRANTY EXPIRED
                  </span>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                    Expired on: {serialResult.warranty_expiry}
                  </p>
                </div>
              ) : (
                <span className="text-slate-400 text-xs">No active warranty</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Claims List Section */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex-1 flex flex-col">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
          <span className="font-bold text-slate-800 text-xs">Active Warranty Claims ({claims.length})</span>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-2.5 py-1 text-xs bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="RECEIVED">RECEIVED (In Shop)</option>
            <option value="SENT_TO_SUPPLIER">SENT_TO_SUPPLIER (At Service Center)</option>
            <option value="REPAIRED">REPAIRED (Ready for Customer)</option>
            <option value="REPLACED">REPLACED (New Unit Issued)</option>
            <option value="RETURNED_TO_CUSTOMER">RETURNED_TO_CUSTOMER (Completed)</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {claimsLoading ? (
            <div className="text-center py-12 text-xs text-slate-400">Loading claims...</div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">No warranty claims found.</div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Claim #</th>
                  <th className="py-2.5 px-4">Serial #</th>
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Fault Description</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  {isOwner && <th className="py-2.5 px-4 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.claim_number}</td>
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">{c.serial_number}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{c.product_name}</p>
                      <p className="text-slate-500 text-[11px]">{c.variant_name}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{c.customer_name || 'N/A'}</p>
                      <p className="text-slate-500 text-[11px]">{c.customer_phone}</p>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-700">{c.issue_description}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          c.status === 'RECEIVED'
                            ? 'bg-amber-100 text-amber-800'
                            : c.status === 'SENT_TO_SUPPLIER'
                            ? 'bg-blue-100 text-blue-800'
                            : c.status === 'REPAIRED' || c.status === 'REPLACED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    {isOwner && (
                      <td className="py-3 px-4 text-center">
                        <select
                          value={c.status}
                          onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                          className="border rounded p-1 text-[11px] font-semibold"
                        >
                          <option value="RECEIVED">RECEIVED</option>
                          <option value="SENT_TO_SUPPLIER">SENT_TO_SUPPLIER</option>
                          <option value="REPAIRED">REPAIRED</option>
                          <option value="REPLACED">REPLACED</option>
                          <option value="RETURNED_TO_CUSTOMER">RETURNED_TO_CUSTOMER</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---------------- NEW CLAIM MODAL ---------------- */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                New Warranty Claim Ticket
              </h3>
              <button onClick={() => setShowClaimModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {claimError && (
              <div className="mb-4 p-2.5 bg-red-100 border border-red-300 rounded-lg text-red-800 text-xs">
                {claimError}
              </div>
            )}

            <form onSubmit={handleCreateClaim} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Serial Number (Scan or Type) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SX9-232-00101"
                  value={claimSerial}
                  onChange={(e) => setClaimSerial(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Fault / Issue Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe failure: e.g. Touchscreen unresponsive after 20 mins of driving, amplifier channel 3 cutting out"
                  value={claimIssue}
                  onChange={(e) => setClaimIssue(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Customer / Technician Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Customer brought original invoice copy"
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Create Warranty Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
