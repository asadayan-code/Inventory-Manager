import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { formatDateTime } from '../utils/formatters';
import {
  Settings,
  Users,
  Database,
  ShieldAlert,
  FileSpreadsheet,
  KeyRound,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  Unlock,
  Save,
  X
} from 'lucide-react';

export const SettingsUsersPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'USERS' | 'AUDIT' | 'BACKUP' | 'IMPORT'>('SETTINGS');

  // Settings state
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [invoiceFooter, setInvoiceFooter] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [cashierDiscountLimit, setCashierDiscountLimit] = useState('5');
  const [barcodeLayout, setBarcodeLayout] = useState('3x10');

  // Users state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'OWNER' | 'CASHIER'>('CASHIER');
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Backup state
  const [backups, setBackups] = useState<any[]>([]);
  const [restoreConfirmFile, setRestoreConfirmFile] = useState<string | null>(null);

  // CSV Import state
  const [csvContent, setCsvContent] = useState('');
  const [importPreview, setImportPreview] = useState<any | null>(null);

  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  if (!isOwner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Owner Access Required</h2>
        <p className="text-xs text-slate-600 max-w-md mt-2">
          Store settings, staff accounts, backups, and audit logs are accessible to the shop owner only.
        </p>
      </div>
    );
  }

  const loadAll = async () => {
    try {
      const [sRes, uRes, bRes, aRes] = await Promise.all([
        apiRequest<{ settings: Record<string, string> }>('/settings'),
        apiRequest<{ users: any[] }>('/users'),
        apiRequest<{ backups: any[] }>('/backups'),
        apiRequest<{ audit_log: any[] }>('/reports/audit-log'),
      ]);

      const s = sRes.settings;
      setShopName(s.shop_name || 'Sohail Autos Car & Audio Accessories');
      setShopAddress(s.shop_address || 'Shop #14, Audio Plaza, Montgomery Road, Lahore');
      setShopPhone(s.shop_phone || '0300-1234567 / 042-37210000');
      setTaxRate(s.tax_rate_percent || '0');
      setInvoiceFooter(s.invoice_footer || '');
      setWarrantyTerms(s.warranty_terms || '');
      setCashierDiscountLimit(s.cashier_discount_limit_percent || '5');
      setBarcodeLayout(s.barcode_label_layout || '3x10');

      setUsersList(uRes.users);
      setBackups(bRes.backups);
      setAuditLogs(aRes.audit_log);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/settings', {
        method: 'POST',
        body: {
          shop_name: shopName.trim(),
          shop_address: shopAddress.trim(),
          shop_phone: shopPhone.trim(),
          tax_rate_percent: taxRate,
          invoice_footer: invoiceFooter.trim(),
          warranty_terms: warrantyTerms.trim(),
          cashier_discount_limit_percent: cashierDiscountLimit,
          barcode_label_layout: barcodeLayout,
        },
      });
      setMessage({ type: 'success', text: 'Store settings saved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: {
          username: newUsername.trim(),
          password: newPassword,
          full_name: newFullName.trim(),
          role: newRole,
        },
      });
      setMessage({ type: 'success', text: `Staff account "${newUsername}" created.` });
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      loadAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create user.' });
    }
  };

  const handleToggleUser = async (userId: number, currentActive: boolean) => {
    try {
      await apiRequest('/users/toggle-status', {
        method: 'POST',
        body: {
          user_id: userId,
          is_active: !currentActive,
        },
      });
      setMessage({ type: 'success', text: 'User status updated.' });
      loadAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Action failed.' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !resetNewPassword) return;
    try {
      await apiRequest('/users/reset-password', {
        method: 'POST',
        body: {
          user_id: resetUserId,
          new_password: resetNewPassword,
        },
      });
      setMessage({ type: 'success', text: 'Password reset successfully.' });
      setResetUserId(null);
      setResetNewPassword('');
      loadAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Password reset failed.' });
    }
  };

  const handleCreateBackupNow = async () => {
    try {
      const res = await apiRequest<{ filename: string }>('/backups/create', { method: 'POST' });
      setMessage({ type: 'success', text: `Backup created: ${res.filename}` });
      loadAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Backup failed.' });
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    try {
      await apiRequest('/backups/restore', {
        method: 'POST',
        body: { filename },
      });
      setMessage({ type: 'success', text: `Database restored from ${filename}. Please log in again.` });
      setRestoreConfirmFile(null);
      loadAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Restore failed.' });
    }
  };

  // CSV Import preview & execute
  const handlePreviewCSV = async () => {
    if (!csvContent.trim()) return;
    try {
      const res = await apiRequest('/import/preview', {
        method: 'POST',
        body: { csv_content: csvContent.trim() },
      });
      setImportPreview(res);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'CSV parse failed.' });
    }
  };

  const handleExecuteImport = async () => {
    if (!csvContent.trim()) return;
    try {
      const res = await apiRequest<{ imported_count: number }>('/import/execute', {
        method: 'POST',
        body: { csv_content: csvContent.trim() },
      });
      setMessage({ type: 'success', text: `Successfully imported ${res.imported_count} products and opening stock!` });
      setCsvContent('');
      setImportPreview(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Import failed.' });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-600" />
            Store Settings, Users & Data Safety
          </h2>
          <p className="text-xs text-slate-500">
            A4 invoice templates, staff accounts & roles, daily backups, CSV catalog import, and audit log
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 text-xs">
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'SETTINGS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Store Settings
          </button>
          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'USERS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Staff & Roles
          </button>
          <button
            onClick={() => setActiveTab('BACKUP')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'BACKUP' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Backup & Restore
          </button>
          <button
            onClick={() => setActiveTab('IMPORT')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'IMPORT' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CSV Catalog Import
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
              activeTab === 'AUDIT' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit Log
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-xl text-xs flex justify-between items-center border ${
            message.type === 'error' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. STORE SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs max-w-3xl">
          <h3 className="font-bold text-base text-slate-900 mb-4">Shop Information & Invoice Formatting</h3>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-semibold block mb-1">Shop Name (Printed on A4 Invoice)</label>
                <input
                  type="text"
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full border rounded-lg p-2 font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Shop Phone Numbers</label>
                <input
                  type="text"
                  required
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Shop Address</label>
              <input
                type="text"
                required
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-semibold block mb-1">Default Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Cashier Discount Limit (%)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={cashierDiscountLimit}
                  onChange={(e) => setCashierDiscountLimit(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Barcode Sticker Sheet Layout</label>
                <select
                  value={barcodeLayout}
                  onChange={(e) => setBarcodeLayout(e.target.value)}
                  className="w-full border rounded-lg p-2 font-bold focus:border-emerald-500 focus:outline-none"
                >
                  <option value="3x10">3 x 10 (30 labels per A4 sheet)</option>
                  <option value="4x13">4 x 13 (52 labels per A4 sheet)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Invoice Footer Greeting</label>
              <input
                type="text"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Warranty & Return Terms (Printed on invoice)</label>
              <textarea
                rows={3}
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
                className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer transition shadow-xs"
            >
              Save Store Configuration
            </button>
          </form>
        </div>
      )}

      {/* 2. USERS & ROLES */}
      {activeTab === 'USERS' && (
        <div className="mt-6 space-y-6 max-w-4xl">
          {/* Create User Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-bold text-base text-slate-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Create New Staff User
            </h3>

            <form onSubmit={handleCreateUser} className="grid grid-cols-4 gap-3 text-xs">
              <input
                type="text"
                required
                placeholder="Staff Full Name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="border rounded-lg p-2"
              />
              <input
                type="text"
                required
                placeholder="Username (e.g. cashier2)"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="border rounded-lg p-2"
              />
              <input
                type="password"
                required
                placeholder="Password (min 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border rounded-lg p-2"
              />
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="border rounded-lg p-2 font-bold"
                >
                  <option value="CASHIER">CASHIER</option>
                  <option value="OWNER">OWNER</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Staff Member</th>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.full_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{u.username}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block font-extrabold text-[10px] px-2 py-0.5 rounded ${
                          u.role === 'OWNER' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded ${
                          u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setResetUserId(u.id)}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 font-semibold text-[11px] border rounded cursor-pointer"
                        >
                          Reset Pwd
                        </button>
                        <button
                          onClick={() => handleToggleUser(u.id, !!u.is_active)}
                          className={`px-2 py-1 font-semibold text-[11px] border rounded cursor-pointer ${
                            u.is_active ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. DATA BACKUP & RESTORE */}
      {activeTab === 'BACKUP' && (
        <div className="mt-6 space-y-6 max-w-4xl">
          <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-xs flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                SQLite WAL Database Backups
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Database backups are automatically made daily and on shutdown (last 30 retained).
              </p>
            </div>

            <button
              onClick={handleCreateBackupNow}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-xs flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Create Backup Now</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Backup File</th>
                  <th className="py-2.5 px-4">Created Date</th>
                  <th className="py-2.5 px-4 text-right">Size</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.filename}</td>
                    <td className="py-3 px-4 text-slate-500">{formatDateTime(b.created_at)}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {(b.size_bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setRestoreConfirmFile(b.filename)}
                        className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Restore DB
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. CSV CATALOG IMPORT */}
      {activeTab === 'IMPORT' && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs max-w-4xl space-y-4 text-xs">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              CSV Catalog & Opening Stock Import
            </h3>
            <p className="text-slate-500 mt-1">
              Required headers: <span className="font-mono font-bold">Product Name, Category, Brand, Variant Name, SKU, Barcode, Cost PKR, Retail PKR, Opening Stock</span>
            </p>
          </div>

          <textarea
            rows={8}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder={`Product Name,Category,Brand,Variant Name,SKU,Barcode,Cost PKR,Retail PKR,Opening Stock\nSony XAV-AX3200 7-inch,Android Tabs & Head Units,Sony,Standard,SNY-3200,896990001,22000,29500,4\nC6 H4 LED Headlight Bulbs,LED Lighting & Fog Lamps,Novsight,H4 Pair,LED-C6-H4,896990002,1200,1850,20`}
            className="w-full border rounded-xl p-3 font-mono text-xs focus:border-emerald-500 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              onClick={handlePreviewCSV}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
            >
              Parse & Preview CSV
            </button>
            {importPreview && importPreview.valid && (
              <button
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
              >
                Confirm Import ({importPreview.total_rows} items)
              </button>
            )}
          </div>

          {importPreview && (
            <div className="border rounded-xl p-4 bg-slate-50">
              <span className="font-bold text-slate-800 block mb-2">
                Preview ({importPreview.total_rows} items validated):
              </span>
              {importPreview.errors.length > 0 && (
                <div className="p-3 bg-red-100 text-red-800 rounded-lg mb-3">
                  {importPreview.errors.map((e: string, i: number) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-200">
                    <tr>
                      <th className="p-1">Product</th>
                      <th className="p-1">Category</th>
                      <th className="p-1">Retail</th>
                      <th className="p-1">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.preview.map((p: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="p-1 font-bold">{p.product_name}</td>
                        <td className="p-1">{p.category}</td>
                        <td className="p-1 font-mono">PKR {p.retail_price_paisa / 100}</td>
                        <td className="p-1 font-bold">{p.opening_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. AUDIT LOG */}
      {activeTab === 'AUDIT' && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs max-w-4xl">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center text-xs">
            <span className="font-bold text-slate-900">System Security Audit Trail (Rule #7)</span>
            <span className="text-slate-500 text-[11px]">Last 100 critical actions logged</span>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">Staff User</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Entity</th>
                  <th className="py-2 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{formatDateTime(log.created_at)}</td>
                    <td className="py-2 px-3 font-bold text-slate-800">{log.username}</td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">{log.action}</td>
                    <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{log.entity_type} #{log.entity_id}</td>
                    <td className="py-2 px-3 text-slate-700 max-w-sm truncate">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {restoreConfirmFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-300 text-slate-900">
            <h3 className="font-bold text-base text-red-700 flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Confirm Database Restore
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Restoring from <span className="font-mono font-bold">{restoreConfirmFile}</span> will replace the current active database. An automatic safety snapshot will be taken first.
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button onClick={() => setRestoreConfirmFile(null)} className="px-3 py-1.5 border rounded cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => handleRestoreBackup(restoreConfirmFile)}
                className="px-4 py-1.5 bg-red-600 text-white rounded font-bold cursor-pointer"
              >
                Yes, Restore Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
