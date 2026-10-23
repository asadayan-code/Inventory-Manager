import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { ProductVariant, Category, Brand } from '../types';
import { formatPKR, pkrToPaisa } from '../utils/formatters';
import { PrintModal } from '../components/PrintModal';
import {
  Package,
  Search,
  Plus,
  Barcode,
  Printer,
  Edit2,
  Boxes,
  ShieldCheck,
  CheckCircle2,
  X
} from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [products, setProducts] = useState<ProductVariant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [barcodePrintItem, setBarcodePrintItem] = useState<ProductVariant | null>(null);
  const [barcodeSheetLayout, setBarcodeSheetLayout] = useState<'3x10' | '4x13'>('3x10');
  const [barcodeCount, setBarcodeCount] = useState<number>(30);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // New Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdCatId, setNewProdCatId] = useState<number | ''>('');
  const [newProdBrandId, setNewProdBrandId] = useState<number | ''>('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdIsService, setNewProdIsService] = useState(false);
  const [newProdIsSerialized, setNewProdIsSerialized] = useState(false);
  const [newProdWarranty, setNewProdWarranty] = useState(0);
  const [newProdCompat, setNewProdCompat] = useState('');

  // Variants in new product form
  const [formVariants, setFormVariants] = useState([
    {
      variant_name: 'Standard',
      sku: '',
      barcode: '',
      cost_pkr: '',
      retail_pkr: '',
      wholesale_pkr: '',
      min_pkr: '',
      reorder_level: 5,
    },
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes, bRes] = await Promise.all([
        apiRequest<{ items: ProductVariant[] }>('/catalog/search', { params: { limit: 150 } }),
        apiRequest<{ categories: Category[] }>('/categories'),
        apiRequest<{ brands: Brand[] }>('/brands'),
      ]);
      setProducts(pRes.items);
      setCategories(cRes.categories);
      setBrands(bRes.brands);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) {
      setFormError('Product name is required.');
      return;
    }

    try {
      await apiRequest('/products', {
        method: 'POST',
        body: {
          name: newProdName.trim(),
          category_id: newProdCatId || null,
          brand_id: newProdBrandId || null,
          description: newProdDesc.trim(),
          is_service: newProdIsService,
          is_serialized: newProdIsSerialized,
          warranty_months: newProdWarranty,
          car_compatibility: newProdCompat.trim(),
          variants: formVariants.map((v) => ({
            variant_name: v.variant_name.trim() || 'Standard',
            sku: v.sku.trim(),
            barcode: v.barcode.trim(),
            cost_paisa: pkrToPaisa(v.cost_pkr),
            retail_price_paisa: pkrToPaisa(v.retail_pkr),
            wholesale_price_paisa: pkrToPaisa(v.wholesale_pkr || v.retail_pkr),
            min_price_paisa: pkrToPaisa(v.min_pkr || v.cost_pkr),
            reorder_level: Number(v.reorder_level) || 5,
          })),
        },
      });

      setShowAddModal(false);
      // Reset form
      setNewProdName('');
      setNewProdDesc('');
      setNewProdCompat('');
      setFormVariants([
        {
          variant_name: 'Standard',
          sku: '',
          barcode: '',
          cost_pkr: '',
          retail_pkr: '',
          wholesale_pkr: '',
          min_pkr: '',
          reorder_level: 5,
        },
      ]);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product.');
    }
  };

  const handleOpenBarcodeSheet = (item: ProductVariant) => {
    setBarcodePrintItem(item);
    setShowPrintModal(true);
  };

  const filtered = products.filter((p) => {
    if (selectedCat && p.category_name !== selectedCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.product_name?.toLowerCase().includes(q) ||
        p.variant_name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.car_compatibility?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Products & Barcode Catalog
          </h2>
          <p className="text-xs text-slate-500">
            Variants, SKU barcodes, car fitments, and sticker sheet printing
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Category filter */}
          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, barcode..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Add Product Button (Owner Only) */}
          {isOwner && (
            <button
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Catalog Table */}
      <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl shadow-xs">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-400">Loading catalog...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">No products found.</div>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Product & Variant</th>
                <th className="py-2.5 px-4">SKU / Barcode</th>
                <th className="py-2.5 px-4">Car Fitment</th>
                {isOwner && <th className="py-2.5 px-4 text-right">Cost (PKR)</th>}
                <th className="py-2.5 px-4 text-right">Retail Price</th>
                {isOwner && <th className="py-2.5 px-4 text-right">Wholesale</th>}
                {isOwner && <th className="py-2.5 px-4 text-right">Min Price</th>}
                <th className="py-2.5 px-4 text-center">Stock</th>
                <th className="py-2.5 px-4 text-center">Sticker Sheet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.variant_id || item.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900 text-xs">{item.product_name}</p>
                    <p className="text-slate-500 text-[11px]">
                      {item.variant_name} • {item.brand_name || 'Brand'} • {item.category_name || ''}
                    </p>
                    {item.is_serialized && (
                      <span className="inline-block mt-0.5 text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded">
                        Serialized (1 per unit)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span className="text-slate-900 font-semibold">{item.sku}</span>
                    <span className="block text-slate-400 font-mono text-[10px]">{item.barcode}</span>
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-600">
                    {item.car_compatibility || '-'}
                  </td>
                  {/* CASHIER PRIVACY RULE: Cost & Wholesale hidden from cashiers */}
                  {isOwner && (
                    <td className="py-3 px-4 text-right font-mono text-slate-500">
                      {formatPKR(item.cost_paisa, false)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    {formatPKR(item.retail_price_paisa, false)}
                  </td>
                  {isOwner && (
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {formatPKR(item.wholesale_price_paisa, false)}
                    </td>
                  )}
                  {isOwner && (
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {formatPKR(item.min_price_paisa, false)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-center">
                    {item.is_service ? (
                      <span className="text-sky-700 font-semibold text-[11px]">Service</span>
                    ) : (
                      <span
                        className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          item.stock_on_hand <= (item.reorder_level || 5)
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.stock_on_hand}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleOpenBarcodeSheet(item)}
                      title="Print A4 Barcode Sticker Sheet"
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------------- ADD PRODUCT MODAL (OWNER ONLY) ---------------- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-slate-900 my-8">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                Add New Catalog Product
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-red-100 border border-red-300 rounded-lg text-red-800 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Product Title *</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="e.g. Pioneer 6x9 Oval Speakers 650W"
                    className="w-full border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <select
                    value={newProdCatId}
                    onChange={(e) => setNewProdCatId(Number(e.target.value))}
                    className="w-full border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Brand</label>
                  <select
                    value={newProdBrandId}
                    onChange={(e) => setNewProdBrandId(Number(e.target.value))}
                    className="w-full border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Warranty (Months)</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdWarranty}
                    onChange={(e) => setNewProdWarranty(Number(e.target.value))}
                    className="w-full border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Car Compatibility (e.g. Corolla 2014-2021, Civic X)</label>
                <input
                  type="text"
                  value={newProdCompat}
                  onChange={(e) => setNewProdCompat(e.target.value)}
                  placeholder="e.g. Toyota Corolla 2014-2022, Honda Civic 2016-2022"
                  className="w-full border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newProdIsSerialized}
                    onChange={(e) => setNewProdIsSerialized(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Track Individual Serial Numbers (Head Unit, Amp, Tab)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newProdIsService}
                    onChange={(e) => setNewProdIsService(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Labour / Installation Service (Non-Stock)</span>
                </label>
              </div>

              {/* Variant Details */}
              <div className="border-t pt-3">
                <span className="font-bold block mb-2 text-slate-800">Variant & Pricing (Integer Paisa / PKR):</span>
                {formVariants.map((v, i) => (
                  <div key={i} className="p-3 bg-slate-50 border rounded-xl space-y-2 mb-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Variant Name (e.g. H4 or 4GB+64GB)"
                        value={v.variant_name}
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[i].variant_name = e.target.value;
                          setFormVariants(updated);
                        }}
                        className="border rounded p-1.5 bg-white text-xs"
                      />
                      <input
                        type="text"
                        placeholder="SKU (leave blank for auto)"
                        value={v.sku}
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[i].sku = e.target.value;
                          setFormVariants(updated);
                        }}
                        className="border rounded p-1.5 bg-white text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Barcode (leave blank for auto)"
                        value={v.barcode}
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[i].barcode = e.target.value;
                          setFormVariants(updated);
                        }}
                        className="border rounded p-1.5 bg-white text-xs font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Cost (PKR)</span>
                        <input
                          type="text"
                          placeholder="e.g. 4500"
                          value={v.cost_pkr}
                          onChange={(e) => {
                            const updated = [...formVariants];
                            updated[i].cost_pkr = e.target.value;
                            setFormVariants(updated);
                          }}
                          className="w-full border rounded p-1.5 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Retail (PKR) *</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 6500"
                          value={v.retail_pkr}
                          onChange={(e) => {
                            const updated = [...formVariants];
                            updated[i].retail_pkr = e.target.value;
                            setFormVariants(updated);
                          }}
                          className="w-full border rounded p-1.5 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Wholesale (PKR)</span>
                        <input
                          type="text"
                          placeholder="e.g. 5500"
                          value={v.wholesale_pkr}
                          onChange={(e) => {
                            const updated = [...formVariants];
                            updated[i].wholesale_pkr = e.target.value;
                            setFormVariants(updated);
                          }}
                          className="w-full border rounded p-1.5 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Min Price (PKR)</span>
                        <input
                          type="text"
                          placeholder="e.g. 5000"
                          value={v.min_pkr}
                          onChange={(e) => {
                            const updated = [...formVariants];
                            updated[i].min_pkr = e.target.value;
                            setFormVariants(updated);
                          }}
                          className="w-full border rounded p-1.5 bg-white text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Save Product to Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Print Modal */}
      {showPrintModal && barcodePrintItem && (
        <PrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          docType="BARCODE_SHEET"
          data={{
            product_name: barcodePrintItem.product_name,
            variant_name: barcodePrintItem.variant_name,
            sku: barcodePrintItem.sku,
            barcode: barcodePrintItem.barcode,
            retail_price_paisa: barcodePrintItem.retail_price_paisa,
            layout: barcodeSheetLayout,
            count: barcodeSheetLayout === '4x13' ? 52 : 30,
          }}
        />
      )}
    </div>
  );
};
