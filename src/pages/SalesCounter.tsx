import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { ProductVariant, CartItem, Customer, Bill } from '../types';
import { formatPKR, pkrToPaisa } from '../utils/formatters';
import { soundEffects } from '../utils/scanner';
import { PrintModal } from '../components/PrintModal';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  Building,
  PauseCircle,
  PlayCircle,
  FileText,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Link2,
  X
} from 'lucide-react';

export const SalesCounter: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  // Search and Catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [searching, setSearching] = useState(false);
  const [popularItems, setPopularItems] = useState<ProductVariant[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastScannedSku, setLastScannedSku] = useState<string | null>(null);

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');

  // Whole bill discount & tax
  const [billDiscountPKR, setBillDiscountPKR] = useState('');
  const [taxPercent, setTaxPercent] = useState('0');
  const [notes, setNotes] = useState('');

  // Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [splitJazzCash, setSplitJazzCash] = useState('');
  const [splitEasyPaisa, setSplitEasyPaisa] = useState('');
  const [ownerOverride, setOwnerOverride] = useState(false);

  // Held Bills
  const [heldBills, setHeldBills] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('pakaudio_held_bills');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHeldModal, setShowHeldModal] = useState(false);

  // Serial Dialog
  const [serialPromptItem, setSerialPromptItem] = useState<{
    item: ProductVariant;
    requiredQty: number;
    collectedSerials: string[];
    currentInput: string;
  } | null>(null);

  // Barcode Not Found & Quick Attach
  const [unrecognizedBarcode, setUnrecognizedBarcode] = useState<string | null>(null);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachTargetVariantId, setAttachTargetVariantId] = useState<number | null>(null);

  // Print Modal
  const [printDoc, setPrintDoc] = useState<{ isOpen: boolean; data: any; type: 'INVOICE' | 'QUOTATION' }>({
    isOpen: false,
    data: null,
    type: 'INVOICE',
  });

  // Notifications / Feedback
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Save held bills to localStorage
  useEffect(() => {
    localStorage.setItem('pakaudio_held_bills', JSON.stringify(heldBills));
  }, [heldBills]);

  // Load customers & popular items for quick-touch catalog
  useEffect(() => {
    apiRequest<{ customers: Customer[] }>('/customers')
      .then((res) => setCustomers(res.customers))
      .catch(() => {});

    apiRequest<{ items: ProductVariant[] }>('/catalog/search', { params: { limit: 40 } })
      .then((res) => setPopularItems(res.items))
      .catch(() => {});
  }, []);

  // Live product search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      apiRequest<{ items: ProductVariant[] }>('/catalog/search', {
        params: { q: searchQuery.trim(), limit: 12 },
      })
        .then((res) => setSearchResults(res.items))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Global scanner and keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input modal
      if (showPaymentModal || showCustomerModal || serialPromptItem || showAttachModal) {
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.select();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setShowCustomerModal(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0) openPaymentModal();
      } else if (e.key === 'Escape') {
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [cart, showPaymentModal, showCustomerModal, serialPromptItem, showAttachModal]);

  // Barcode scanner auto-handling
  const handleBarcodeScanned = async (barcode: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    try {
      const res = await apiRequest<{ found: boolean; item: ProductVariant }>(`/catalog/barcode/${encodeURIComponent(barcode)}`);
      if (res.found && res.item) {
        soundEffects.playSuccessBeep();
        addItemToCart(res.item);
      }
    } catch {
      soundEffects.playErrorBeep();
      setUnrecognizedBarcode(barcode);
      setBannerError(`Barcode "${barcode}" not found in store catalog.`);
    }
  };

  // Add Item to Cart
  const addItemToCart = (variant: ProductVariant, customQty = 1) => {
    setUnrecognizedBarcode(null);
    const existingIndex = cart.findIndex((i) => i.variant_id === (variant.variant_id || variant.id));

    // If serialized product, prompt for serial number
    if (variant.is_serialized) {
      setSerialPromptItem({
        item: variant,
        requiredQty: 1,
        collectedSerials: [],
        currentInput: '',
      });
      return;
    }

    // Determine price: if wholesale customer selected, apply wholesale price
    const unitPrice =
      selectedCustomer?.customer_type === 'WHOLESALE' && variant.wholesale_price_paisa
        ? variant.wholesale_price_paisa
        : variant.retail_price_paisa;

    if (existingIndex > -1) {
      const existing = cart[existingIndex];
      const newQty = existing.quantity + customQty;

      // Check stock
      if (!variant.is_service && newQty > variant.stock_on_hand && !isOwner) {
        setBannerError(`Only ${variant.stock_on_hand} available in stock. Owner override required.`);
        return;
      }

      const updated = [...cart];
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
      };
      setCart(updated);
    } else {
      // Check stock
      if (!variant.is_service && customQty > variant.stock_on_hand && !isOwner) {
        setBannerError(`Only ${variant.stock_on_hand} available in stock. Owner override required.`);
        return;
      }

      setCart([
        ...cart,
        {
          variant_id: (variant.variant_id || variant.id)!,
          product_name: variant.product_name || 'Product',
          variant_name: variant.variant_name,
          sku: variant.sku,
          barcode: variant.barcode,
          quantity: customQty,
          unit_price_paisa: unitPrice,
          min_price_paisa: variant.min_price_paisa,
          cost_paisa: variant.cost_paisa,
          discount_paisa: 0,
          warranty_months: variant.warranty_months,
          is_service: variant.is_service,
          is_bundle: variant.is_bundle,
          is_serialized: variant.is_serialized,
          stock_on_hand: variant.stock_on_hand,
          serials: [],
        },
      ]);
    }

    setLastScannedSku(variant.sku);
    soundEffects.playSuccessBeep();
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // Add Serialized item after collecting serial
  const handleConfirmSerial = async () => {
    if (!serialPromptItem) return;
    const serial = serialPromptItem.currentInput.trim();
    if (!serial) return;

    // Verify serial is valid and in stock
    try {
      const res = await apiRequest<{ serial: any }>(`/serials/lookup/${encodeURIComponent(serial)}`);
      if (res.serial.status !== 'IN_STOCK') {
        setBannerError(`Serial "${serial}" is not available (Status: ${res.serial.status}).`);
        soundEffects.playErrorBeep();
        return;
      }
      if (res.serial.variant_id !== (serialPromptItem.item.variant_id || serialPromptItem.item.id)) {
        setBannerError(`Serial "${serial}" belongs to another product (${res.serial.product_name}).`);
        soundEffects.playErrorBeep();
        return;
      }

      // Check if already in cart
      const alreadyInCart = cart.some((c) => c.serials.includes(serial));
      if (alreadyInCart) {
        setBannerError(`Serial "${serial}" is already added in this bill.`);
        soundEffects.playErrorBeep();
        return;
      }

      const variant = serialPromptItem.item;
      const unitPrice =
        selectedCustomer?.customer_type === 'WHOLESALE' && variant.wholesale_price_paisa
          ? variant.wholesale_price_paisa
          : variant.retail_price_paisa;

      setCart([
        ...cart,
        {
          variant_id: (variant.variant_id || variant.id)!,
          product_name: variant.product_name || 'Product',
          variant_name: variant.variant_name,
          sku: variant.sku,
          barcode: variant.barcode,
          quantity: 1,
          unit_price_paisa: unitPrice,
          min_price_paisa: variant.min_price_paisa,
          cost_paisa: variant.cost_paisa,
          discount_paisa: 0,
          warranty_months: variant.warranty_months,
          is_service: false,
          is_bundle: false,
          is_serialized: true,
          stock_on_hand: variant.stock_on_hand,
          serials: [serial],
        },
      ]);

      setLastScannedSku(variant.sku);
      soundEffects.playSuccessBeep();
      setSerialPromptItem(null);
      setSearchQuery('');
      setSearchResults([]);
      searchInputRef.current?.focus();
    } catch (err: any) {
      setBannerError(err.message || `Serial "${serial}" not recognized.`);
      soundEffects.playErrorBeep();
    }
  };

  // Quantity updates
  const updateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeItem(index);
      return;
    }
    const item = cart[index];
    if (item.is_serialized) {
      setBannerError('Serialized items must be scanned 1 unit per serial number.');
      return;
    }
    if (!item.is_service && newQty > item.stock_on_hand && !isOwner) {
      setBannerError(`Cannot exceed available stock (${item.stock_on_hand}). Owner override required.`);
      return;
    }
    const updated = [...cart];
    updated[index].quantity = newQty;
    setCart(updated);
  };

  const removeItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // Financial calculations
  const itemsSubtotalPaisa = cart.reduce(
    (sum, itm) => sum + itm.unit_price_paisa * itm.quantity - itm.discount_paisa,
    0
  );
  const billDiscountPaisa = Math.max(0, pkrToPaisa(billDiscountPKR));
  const afterDiscountSubtotal = Math.max(0, itemsSubtotalPaisa - billDiscountPaisa);
  const taxRate = Math.max(0, parseInt(taxPercent, 10) || 0);
  const taxPaisa = Math.round((afterDiscountSubtotal * taxRate) / 100);
  const grandTotalPaisa = afterDiscountSubtotal + taxPaisa;

  // Hold and Resume
  const handleHoldBill = () => {
    if (cart.length === 0) return;
    const held = {
      id: Date.now(),
      cart,
      customer: selectedCustomer,
      billDiscountPKR,
      taxPercent,
      notes,
      time: new Date().toLocaleTimeString(),
      totalPaisa: grandTotalPaisa,
    };
    setHeldBills([...heldBills, held]);
    setCart([]);
    setSelectedCustomer(null);
    setBillDiscountPKR('');
    setNotes('');
    setBannerSuccess('Bill placed ON HOLD. You can resume it anytime.');
  };

  const handleResumeBill = (held: any) => {
    setCart(held.cart);
    setSelectedCustomer(held.customer);
    setBillDiscountPKR(held.billDiscountPKR);
    setTaxPercent(held.taxPercent);
    setNotes(held.notes);
    setHeldBills(heldBills.filter((h) => h.id !== held.id));
    setShowHeldModal(false);
    setBannerSuccess('Held bill resumed to counter.');
  };

  // Payment Calculation
  const openPaymentModal = () => {
    setSplitCash(formatPKR(grandTotalPaisa, false));
    setSplitCard('');
    setSplitBank('');
    setSplitJazzCash('');
    setSplitEasyPaisa('');
    setOwnerOverride(false);
    setShowPaymentModal(true);
  };

  const currentPaidPaisa =
    pkrToPaisa(splitCash) +
    pkrToPaisa(splitCard) +
    pkrToPaisa(splitBank) +
    pkrToPaisa(splitJazzCash) +
    pkrToPaisa(splitEasyPaisa);

  const balanceDuePaisa = grandTotalPaisa - currentPaidPaisa;

  // Complete Sale
  const handleCompleteSale = async (isQuote = false) => {
    setBannerError(null);
    // Credit Sale (Udhaar) validation
    if (balanceDuePaisa > 0 && !selectedCustomer && !isQuote) {
      setBannerError('Udhaar (Credit sale) requires selecting or adding a customer profile.');
      return;
    }

    const paymentsList: Array<{ method: string; amount_paisa: number }> = [];
    if (pkrToPaisa(splitCash) > 0) paymentsList.push({ method: 'CASH', amount_paisa: pkrToPaisa(splitCash) });
    if (pkrToPaisa(splitCard) > 0) paymentsList.push({ method: 'CARD', amount_paisa: pkrToPaisa(splitCard) });
    if (pkrToPaisa(splitBank) > 0) paymentsList.push({ method: 'BANK_TRANSFER', amount_paisa: pkrToPaisa(splitBank) });
    if (pkrToPaisa(splitJazzCash) > 0) paymentsList.push({ method: 'JAZZCASH', amount_paisa: pkrToPaisa(splitJazzCash) });
    if (pkrToPaisa(splitEasyPaisa) > 0) paymentsList.push({ method: 'EASYPAISA', amount_paisa: pkrToPaisa(splitEasyPaisa) });

    const payload = {
      customer_id: selectedCustomer?.id,
      customer_name: selectedCustomer ? selectedCustomer.name : 'Counter Customer',
      customer_phone: selectedCustomer?.phone || '',
      discount_paisa: billDiscountPaisa,
      tax_rate_percent: taxRate,
      payments: paymentsList,
      is_quote: isQuote,
      owner_override: ownerOverride,
      notes,
      items: cart.map((c) => ({
        variant_id: c.variant_id,
        quantity: c.quantity,
        unit_price_paisa: c.unit_price_paisa,
        discount_paisa: c.discount_paisa,
        warranty_months: c.warranty_months,
        serials: c.serials,
      })),
    };

    try {
      const res = await apiRequest<{ bill_id: number; bill_number: string }>('/bills', {
        method: 'POST',
        body: payload,
      });

      // Fetch full bill details for print preview
      const fullBill = await apiRequest<{ bill: Bill }>(`/bills/${res.bill_id}`);

      setShowPaymentModal(false);
      setCart([]);
      setSelectedCustomer(null);
      setBillDiscountPKR('');
      setNotes('');
      setBannerSuccess(`Bill #${res.bill_number} completed successfully!`);

      // Open print preview
      setPrintDoc({
        isOpen: true,
        data: fullBill.bill,
        type: isQuote ? 'QUOTATION' : 'INVOICE',
      });
    } catch (err: any) {
      setBannerError(err.message || 'Transaction failed. No changes were made.');
    }
  };

  // Quick Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;

    try {
      const created = await apiRequest<Customer>('/customers', {
        method: 'POST',
        body: {
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim(),
          customer_type: newCustomerType,
        },
      });
      setCustomers([...customers, created]);
      setSelectedCustomer(created);
      setShowCustomerModal(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setBannerSuccess(`Customer "${created.name}" registered and selected.`);
    } catch (err: any) {
      setBannerError(err.message || 'Failed to add customer.');
    }
  };

  // Quick Barcode Attachment
  const handleAttachBarcode = async () => {
    if (!unrecognizedBarcode || !attachTargetVariantId) return;
    try {
      await apiRequest('/catalog/attach-barcode', {
        method: 'POST',
        body: {
          variant_id: attachTargetVariantId,
          barcode: unrecognizedBarcode,
        },
      });
      setBannerSuccess(`Barcode ${unrecognizedBarcode} attached successfully!`);
      setShowAttachModal(false);
      // Auto add to cart
      handleBarcodeScanned(unrecognizedBarcode);
    } catch (err: any) {
      setBannerError(err.message || 'Failed to attach barcode.');
    }
  };

  const displayedCatalogItems = searchQuery.trim()
    ? searchResults
    : popularItems.filter((item) => {
        if (activeCategoryFilter === 'ALL') return true;
        const cat = (item.category_name || '').toLowerCase();
        const pName = (item.product_name || '').toLowerCase();
        if (activeCategoryFilter === 'Tabs & Audio') {
          return cat.includes('tab') || cat.includes('head') || cat.includes('amp') || cat.includes('speaker');
        }
        if (activeCategoryFilter === 'LED & Lights') {
          return cat.includes('led') || cat.includes('fog') || cat.includes('light');
        }
        if (activeCategoryFilter === 'Wiring & Kits') {
          return cat.includes('wiring') || cat.includes('harness') || pName.includes('wiring');
        }
        if (activeCategoryFilter === 'Services') {
          return item.is_service;
        }
        if (activeCategoryFilter === 'Car Care') {
          return cat.includes('care') || cat.includes('fragrance');
        }
        return true;
      });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-84px)] overflow-hidden bg-slate-100">
      {/* Alert Banners */}
      {bannerError && (
        <div className="bg-red-700 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{bannerError}</span>
          </div>
          {unrecognizedBarcode && (
            <button
              onClick={() => setShowAttachModal(true)}
              className="bg-white text-red-700 px-3 py-1 rounded text-xs font-bold hover:bg-red-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Link2 className="w-3.5 h-3.5" />
              Attach this barcode to an item
            </button>
          )}
          <button onClick={() => setBannerError(null)} className="cursor-pointer ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="bg-emerald-700 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bannerSuccess}</span>
          </div>
          <button onClick={() => setBannerSuccess(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Layout: Left 62% Cart & Actions, Right 38% Search & Fast Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: ACTIVE BILL CART */}
        <div className="w-[62%] flex flex-col border-r border-slate-300 bg-white">
          {/* Top Barcode Scan & Search Bar */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 text-white flex items-center gap-3">
            <div className="relative flex-1">
              <Barcode className="w-5 h-5 text-emerald-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    handleBarcodeScanned(searchQuery.trim());
                  }
                }}
                placeholder="Scan Barcode (USB scanner) or Search Name, Brand, SKU, Corolla 2018... [F1]"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 font-medium"
              />
            </div>

            {/* Customer Pill / Button */}
            <button
              onClick={() => setShowCustomerModal(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer border ${
                selectedCustomer
                  ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <User className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <span className="block leading-tight truncate max-w-[120px]">
                  {selectedCustomer ? selectedCustomer.name : 'Counter Customer'}
                </span>
                {selectedCustomer && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {selectedCustomer.customer_type} • Udhaar: {formatPKR(selectedCustomer.balance_paisa)}
                  </span>
                )}
              </div>
            </button>

            {/* Held Bills Toggle */}
            {heldBills.length > 0 && (
              <button
                onClick={() => setShowHeldModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition cursor-pointer"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Held ({heldBills.length})</span>
              </button>
            )}
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Barcode className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700 text-base">Sales Counter Ready</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Scan any product with the USB barcode scanner, or search product name, car compatibility ("Corolla 2018"), or category.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs">
                  <span className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-md shadow-xs">F1: Focus Scanner</span>
                  <span className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-md shadow-xs">F3: Select Customer</span>
                  <span className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-md shadow-xs">F4: Hold Bill</span>
                  <span className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-md shadow-xs">F9: Checkout</span>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] sticky top-0 border-b border-slate-300 select-none">
                  <tr>
                    <th className="py-2 px-3 text-left w-8">#</th>
                    <th className="py-2 px-3 text-left">Item Description</th>
                    <th className="py-2 px-3 text-center w-28">Quantity</th>
                    <th className="py-2 px-3 text-right w-24">Price (PKR)</th>
                    <th className="py-2 px-3 text-right w-20">Disc</th>
                    <th className="py-2 px-3 text-right w-24">Total</th>
                    <th className="py-2 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cart.map((item, index) => {
                    const isHighlighted = item.sku === lastScannedSku;
                    const lineTotal = item.unit_price_paisa * item.quantity - item.discount_paisa;

                    return (
                      <tr
                        key={index}
                        className={`transition-colors ${
                          isHighlighted ? 'bg-emerald-50/80' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-400">{index + 1}</td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900 text-xs">{item.product_name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="text-slate-700 font-medium">{item.variant_name}</span>
                            <span>•</span>
                            <span className="font-mono">{item.sku}</span>
                            {item.warranty_months > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700 font-semibold">{item.warranty_months}M Warranty</span>
                              </>
                            )}
                          </div>
                          {/* Serials Tag */}
                          {item.serials.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.serials.map((s, i) => (
                                <span key={i} className="inline-block bg-slate-200 text-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                                  S/N: {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.is_serialized ? (
                            <span className="font-bold font-mono text-xs bg-slate-100 px-2 py-1 rounded">1 unit</span>
                          ) : (
                            <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                onClick={() => updateQuantity(index, item.quantity - 1)}
                                className="p-1 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center font-bold text-xs font-mono">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(index, item.quantity + 1)}
                                className="p-1 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                          {formatPKR(item.unit_price_paisa, false)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="text"
                            value={item.discount_paisa > 0 ? formatPKR(item.discount_paisa, false) : ''}
                            onChange={(e) => {
                              const d = pkrToPaisa(e.target.value);
                              const updated = [...cart];
                              updated[index].discount_paisa = d;
                              setCart(updated);
                            }}
                            placeholder="0"
                            className="w-16 text-right border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950 text-xs">
                          {formatPKR(lineTotal, false)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                            aria-label={`Remove ${item.product_name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Totals & Action Controls */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 text-white select-none">
            <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
              {/* Items Subtotal */}
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Items Subtotal</span>
                <span className="text-base font-extrabold text-white font-mono">{formatPKR(itemsSubtotalPaisa)}</span>
              </div>

              {/* Bill Discount */}
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                  Whole Discount {!isOwner && <span className="text-amber-400 font-bold">(Max 5%)</span>}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-slate-400 text-xs font-mono font-bold">PKR</span>
                  <input
                    type="text"
                    value={billDiscountPKR}
                    onChange={(e) => setBillDiscountPKR(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Tax %</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-400 mt-0.5"
                />
              </div>

              {/* Grand Total */}
              <div className="bg-emerald-950/80 p-2.5 rounded-lg border border-emerald-600/80 text-right">
                <span className="text-[10px] text-emerald-300 font-semibold block uppercase">Grand Total (PKR)</span>
                <span className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                  {formatPKR(grandTotalPaisa)}
                </span>
              </div>
            </div>

            {/* Action Buttons Bar */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleHoldBill}
                disabled={cart.length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-40"
              >
                <PauseCircle className="w-4 h-4 text-amber-400" />
                <span>Hold [F4]</span>
              </button>

              <button
                onClick={() => handleCompleteSale(true)}
                disabled={cart.length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-40"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Quotation</span>
              </button>

              <button
                onClick={() => setCart([])}
                disabled={cart.length === 0}
                className="p-2.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition cursor-pointer disabled:opacity-40"
                title="Clear Entire Cart"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Primary Pay Checkout Button */}
              <button
                onClick={openPaymentModal}
                disabled={cart.length === 0}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm rounded-lg transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <CreditCard className="w-5 h-5" />
                <span>COLLECT PAYMENT / CHECKOUT [F9] • {formatPKR(grandTotalPaisa)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SEARCH RESULTS & FAST CATALOG GRID */}
        <div className="w-[38%] flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">
          <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-100 uppercase text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              {searchQuery ? `Search Results (${searchResults.length})` : 'Quick Touch Catalog'}
            </span>
            <span className="text-slate-400 text-[10px]">Click or scan to add</span>
          </div>

          {!searchQuery && (
            <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {['ALL', 'Tabs & Audio', 'LED & Lights', 'Wiring & Kits', 'Services', 'Car Care'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                    activeCategoryFilter === cat
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {searching ? (
              <div className="text-center py-8 text-xs text-slate-400">Searching catalog...</div>
            ) : displayedCatalogItems.length > 0 ? (
              displayedCatalogItems.map((item) => (
                <div
                  key={item.variant_id || item.id}
                  onClick={() => addItemToCart(item)}
                  className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500 hover:shadow-md rounded-xl transition cursor-pointer flex flex-col gap-1 text-xs text-slate-100"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-bold text-white leading-tight">{item.product_name}</h4>
                      <p className="text-slate-400 text-[11px]">{item.variant_name} {item.brand_name ? `• ${item.brand_name}` : ''}</p>
                    </div>
                    <span className="font-black text-emerald-400 font-mono text-sm whitespace-nowrap">
                      {formatPKR(item.retail_price_paisa)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/60">
                    <span className="font-mono text-slate-400">SKU: {item.sku}</span>
                    <span
                      className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        item.is_service
                          ? 'bg-sky-950 text-sky-400 border border-sky-800'
                          : item.stock_on_hand <= 2
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {item.is_service ? 'Labour Service' : `${item.stock_on_hand} in stock`}
                    </span>
                  </div>

                  {item.car_compatibility && (
                    <div className="text-[10px] text-indigo-300 font-medium truncate">
                      Fit: {item.car_compatibility}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                {searchQuery ? (
                  <div>
                    <p className="font-semibold text-slate-300">No products found matching "{searchQuery}"</p>
                    <p className="text-[11px] mt-1 text-slate-500">Try searching by brand, car model (e.g. Corolla), or SKU.</p>
                  </div>
                ) : (
                  <p>Type above or scan a barcode to instantly search products.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- SERIAL PROMPT MODAL ---------------- */}
      {serialPromptItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Barcode className="w-5 h-5 text-emerald-600" />
              Serialized Item: Scan Serial Number
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {serialPromptItem.item.product_name} ({serialPromptItem.item.variant_name})
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmSerial();
              }}
            >
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scan or Type Unit Serial Number:
              </label>
              <input
                type="text"
                autoFocus
                value={serialPromptItem.currentInput}
                onChange={(e) =>
                  setSerialPromptItem({ ...serialPromptItem, currentInput: e.target.value })
                }
                placeholder="e.g. SX9-232-00101"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSerialPromptItem(null)}
                  className="flex-1 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Confirm & Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- PAYMENT MODAL (SPLIT PAYMENTS & UDHAAR) ---------------- */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Collect Payment & Complete Sale
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Due Banner */}
            <div className="bg-slate-900 text-white p-4 rounded-xl mb-4 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase block">Total Payable</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{formatPKR(grandTotalPaisa)}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 font-semibold uppercase block">Customer</span>
                <span className="text-sm font-bold text-white truncate max-w-[150px] block">
                  {selectedCustomer ? selectedCustomer.name : 'Counter Customer'}
                </span>
              </div>
            </div>

            {/* Split Payment Form */}
            <div className="space-y-3 text-xs mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cash (PKR)
                  </label>
                  <input
                    type="text"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-sky-600" /> POS Card (PKR)
                  </label>
                  <input
                    type="text"
                    value={splitCard}
                    onChange={(e) => setSplitCard(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-indigo-600" /> Bank Transfer
                  </label>
                  <input
                    type="text"
                    value={splitBank}
                    onChange={(e) => setSplitBank(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Smartphone className="w-3 h-3 text-red-600" /> JazzCash
                  </label>
                  <input
                    type="text"
                    value={splitJazzCash}
                    onChange={(e) => setSplitJazzCash(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                    <Smartphone className="w-3 h-3 text-emerald-600" /> Easypaisa
                  </label>
                  <input
                    type="text"
                    value={splitEasyPaisa}
                    onChange={(e) => setSplitEasyPaisa(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Reconciliation breakdown */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 mb-4">
              <div className="flex justify-between text-slate-600">
                <span>Total Paid:</span>
                <span className="font-mono font-bold text-emerald-700">{formatPKR(currentPaidPaisa)}</span>
              </div>
              {balanceDuePaisa > 0 ? (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Balance Due (Udhaar / Credit):</span>
                  <span className="font-mono">{formatPKR(balanceDuePaisa)}</span>
                </div>
              ) : balanceDuePaisa < 0 ? (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Change to Return:</span>
                  <span className="font-mono">{formatPKR(Math.abs(balanceDuePaisa))}</span>
                </div>
              ) : (
                <div className="text-emerald-700 font-bold text-center">Fully Paid (Exact Balance)</div>
              )}
            </div>

            {/* Owner Override Toggle (Owner Only) */}
            {isOwner && (
              <div className="mb-4 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  id="override"
                  checked={ownerOverride}
                  onChange={(e) => setOwnerOverride(e.target.checked)}
                  className="rounded text-amber-600 cursor-pointer"
                />
                <label htmlFor="override" className="cursor-pointer font-semibold">
                  Enable Owner Override (bypasses stock check & min-price check if needed)
                </label>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                Back to Counter
              </button>
              <button
                type="button"
                onClick={() => handleCompleteSale(false)}
                className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-md shadow-emerald-950/20"
              >
                FINALIZE BILL & PRINT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- CUSTOMER SELECTION / REGISTRATION MODAL ---------------- */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                Select or Register Customer
              </h3>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Customers Quick List */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Registered Customers:</label>
              <div className="max-h-40 overflow-y-auto divide-y border border-slate-200 rounded-lg text-xs">
                {customers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setShowCustomerModal(false);
                      setBannerSuccess(`Selected customer: ${c.name}`);
                    }}
                    className="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{c.name}</span>
                      <span className="text-slate-500 text-[11px] ml-2 font-mono">{c.phone}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-600 block">{c.customer_type}</span>
                      {c.balance_paisa > 0 && (
                        <span className="text-red-600 font-mono text-[10px]">Udhaar: {formatPKR(c.balance_paisa)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleCreateCustomer} className="border-t pt-4 space-y-3 text-xs">
              <span className="font-bold text-slate-800 text-xs block">Or Add New Customer:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Customer Full Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Phone Number (e.g. 0300-1234567) *"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="border rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {isOwner && (
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span>Type:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="custType"
                      checked={newCustomerType === 'RETAIL'}
                      onChange={() => setNewCustomerType('RETAIL')}
                    />
                    Retail
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="custType"
                      checked={newCustomerType === 'WHOLESALE'}
                      onChange={() => setNewCustomerType('WHOLESALE')}
                    />
                    Wholesale (Workshop)
                  </label>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer transition text-xs"
              >
                Register & Select Customer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- HELD BILLS MODAL ---------------- */}
      {showHeldModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <PauseCircle className="w-5 h-5 text-amber-500" />
                Held Bills ({heldBills.length})
              </h3>
              <button onClick={() => setShowHeldModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {heldBills.map((held) => (
                <div
                  key={held.id}
                  className="p-3 border border-slate-200 rounded-xl hover:border-amber-400 flex items-center justify-between transition text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{held.customer?.name || 'Counter Customer'}</span>
                    <p className="text-slate-500 text-[11px]">
                      {held.cart.length} item(s) • Held at {held.time}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{formatPKR(held.totalPaisa)}</span>
                    <button
                      onClick={() => handleResumeBill(held)}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg cursor-pointer"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ATTACH BARCODE MODAL ---------------- */}
      {showAttachModal && unrecognizedBarcode && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <h3 className="font-bold text-base mb-1 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-emerald-600" />
              Attach Barcode to Product
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Scanned code: <span className="font-mono font-bold text-slate-800">{unrecognizedBarcode}</span>
            </p>

            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Select existing product variant to attach this barcode:
            </label>
            <select
              value={attachTargetVariantId || ''}
              onChange={(e) => setAttachTargetVariantId(Number(e.target.value))}
              className="w-full border rounded-lg p-2 text-xs mb-4 focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- Choose variant from catalog --</option>
              {searchResults.map((v) => (
                <option key={v.variant_id || v.id} value={v.variant_id || v.id}>
                  {v.product_name} ({v.variant_name}) - SKU: {v.sku}
                </option>
              ))}
            </select>

            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowAttachModal(false)}
                className="flex-1 py-2 border rounded-lg font-bold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAttachBarcode}
                disabled={!attachTargetVariantId}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer disabled:opacity-40"
              >
                Attach & Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- A4 PRINT MODAL ---------------- */}
      <PrintModal
        isOpen={printDoc.isOpen}
        onClose={() => setPrintDoc({ ...printDoc, isOpen: false })}
        docType={printDoc.type}
        data={printDoc.data}
      />
    </div>
  );
};
