import React, { useRef } from 'react';
import { formatPKR, formatDateTime, formatDate } from '../utils/formatters';
import { Printer, Download, X } from 'lucide-react';

export type PrintDocType =
  | 'INVOICE'
  | 'QUOTATION'
  | 'CUSTOMER_STATEMENT'
  | 'SUPPLIER_STATEMENT'
  | 'JOB_CARD'
  | 'RETURN_NOTE'
  | 'WARRANTY_SLIP'
  | 'REORDER_LIST'
  | 'DAILY_REPORT'
  | 'BARCODE_SHEET';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  docType: PrintDocType;
  data: any;
  settings?: Record<string, string>;
}

export const PrintModal: React.FC<PrintModalProps> = ({ isOpen, onClose, docType, data, settings = {} }) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !data) return null;

  const shopName = settings.shop_name || 'Sohail Autos Car & Audio Accessories';
  const shopAddress = settings.shop_address || 'Shop #14, Audio Plaza, Montgomery Road, Lahore';
  const shopPhone = settings.shop_phone || '0300-1234567 / 042-37210000';
  const invoiceFooter = settings.invoice_footer || 'Thank you for your business! Goods once sold can be returned or exchanged within 3 days with original bill.';
  const warrantyTerms = settings.warranty_terms || '1 Year Official Warranty on Head Units & Amplifiers. No warranty on blown speakers or physical damage.';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white text-slate-800 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] border border-slate-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                A4 Document Print Preview ({docType.replace('_', ' ')})
              </h3>
              <p className="text-xs text-slate-500">Standard A4 Layout • Offline Rendered</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-sm transition shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF (Ctrl+P)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area (A4 dimensions style) */}
        <div className="p-8 overflow-y-auto bg-slate-200/60 print:p-0 print:bg-white flex justify-center">
          <div
            ref={printRef}
            className="w-full max-w-[210mm] min-h-[297mm] bg-white p-10 shadow-md print:shadow-none print:w-full print:p-0 print:m-0 text-slate-900 text-xs leading-normal font-sans"
            style={{ boxSizing: 'border-box' }}
          >
            {/* 1. SALES INVOICE OR QUOTATION */}
            {(docType === 'INVOICE' || docType === 'QUOTATION') && (
              <div className="flex flex-col h-full space-y-6">
                {/* Duplicate Stamp if applicable */}
                {data.is_duplicate && (
                  <div className="border-2 border-red-600 text-red-600 font-extrabold text-sm tracking-widest px-3 py-1 rounded inline-block self-end uppercase">
                    DUPLICATE COPY
                  </div>
                )}

                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">{shopName}</h1>
                    <p className="text-slate-600 text-xs mt-1">{shopAddress}</p>
                    <p className="text-slate-600 text-xs font-semibold">Phone: {shopPhone}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider mb-2">
                      {docType === 'QUOTATION' ? 'ESTIMATE / QUOTATION' : 'SALES TAX INVOICE'}
                    </span>
                    <p className="font-bold text-sm text-slate-950">#{data.bill_number}</p>
                    <p className="text-slate-600 text-xs">Date: {formatDateTime(data.created_at)}</p>
                    <p className="text-slate-600 text-xs">Cashier: {data.cashier_name || data.cashier_username}</p>
                    {data.quote_validity_date && (
                      <p className="text-amber-700 font-semibold text-xs mt-1">
                        Valid Until: {formatDate(data.quote_validity_date)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Details */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold uppercase text-[10px] block">Customer Details:</span>
                    <p className="font-bold text-slate-900 text-sm">{data.customer_name || 'Counter Customer'}</p>
                    {data.customer_phone && <p className="text-slate-600">Phone: {data.customer_phone}</p>}
                    {data.customer_address && <p className="text-slate-600">Address: {data.customer_address}</p>}
                  </div>
                  <div className="text-right">
                    {(data.car_registration || data.car_model) && (
                      <>
                        <span className="text-slate-500 font-semibold uppercase text-[10px] block">Vehicle Info:</span>
                        <p className="font-bold text-slate-900">{data.car_registration || 'N/A'}</p>
                        <p className="text-slate-600">{data.car_model || ''}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-800 bg-slate-100 text-slate-900 uppercase font-bold text-[11px]">
                      <th className="py-2 px-2 text-left w-8">#</th>
                      <th className="py-2 px-2 text-left">Description / Serial #</th>
                      <th className="py-2 px-2 text-center w-16">Warranty</th>
                      <th className="py-2 px-2 text-center w-12">Qty</th>
                      <th className="py-2 px-2 text-right w-24">Rate (PKR)</th>
                      <th className="py-2 px-2 text-right w-20">Disc</th>
                      <th className="py-2 px-2 text-right w-24">Total (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="align-top">
                        <td className="py-2 px-2 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <p className="font-bold text-slate-900">{item.name}</p>
                          <p className="text-slate-500 text-[11px]">{item.variant_name} • SKU: {item.sku}</p>
                          {/* Serials */}
                          {item.serial_numbers && item.serial_numbers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.serial_numbers.map((sn: string, i: number) => (
                                <span key={i} className="inline-block bg-slate-100 border border-slate-300 font-mono text-[10px] px-1.5 py-0.5 rounded text-slate-800">
                                  S/N: {sn}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-medium text-slate-700">
                          {item.warranty_months > 0 ? `${item.warranty_months} Mos` : '-'}
                        </td>
                        <td className="py-2 px-2 text-center font-bold">{item.quantity}</td>
                        <td className="py-2 px-2 text-right font-mono">{formatPKR(item.unit_price_paisa, false)}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {item.discount_paisa > 0 ? formatPKR(item.discount_paisa, false) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold">{formatPKR(item.line_total_paisa, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Calculation Summary */}
                <div className="flex justify-between items-start pt-4 border-t-2 border-slate-800">
                  <div className="max-w-[55%]">
                    <p className="text-[11px] text-slate-500 uppercase font-semibold">Amount in Words:</p>
                    <p className="font-bold text-slate-900 text-xs italic">{data.total_in_words || 'Rupees Only'}</p>
                    {data.notes && (
                      <div className="mt-3 bg-amber-50 p-2 rounded border border-amber-200 text-amber-900 text-xs">
                        <span className="font-bold">Remarks:</span> {data.notes}
                      </div>
                    )}
                  </div>
                  <div className="w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200 text-slate-700">
                      <span>Subtotal:</span>
                      <span className="font-mono">{formatPKR(data.subtotal_paisa)}</span>
                    </div>
                    {data.discount_paisa > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-800 font-semibold">
                        <span>Bill Discount:</span>
                        <span className="font-mono">-{formatPKR(data.discount_paisa)}</span>
                      </div>
                    )}
                    {data.tax_paisa > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-200 text-slate-700">
                        <span>Tax ({data.tax_rate_percent}%):</span>
                        <span className="font-mono">{formatPKR(data.tax_paisa)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1.5 text-sm font-black text-slate-950 border-b-2 border-slate-900">
                      <span>Grand Total:</span>
                      <span className="font-mono">{formatPKR(data.total_paisa)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-slate-700">
                      <span>Amount Paid:</span>
                      <span className="font-mono font-bold text-emerald-700">{formatPKR(data.paid_paisa)}</span>
                    </div>
                    {data.balance_paisa > 0 ? (
                      <div className="flex justify-between py-1.5 bg-red-50 text-red-700 font-bold px-2 rounded border border-red-200">
                        <span>Balance Due (Udhaar):</span>
                        <span className="font-mono">{formatPKR(data.balance_paisa)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between py-1 bg-emerald-50 text-emerald-700 font-bold px-2 rounded border border-emerald-200 text-[11px]">
                        <span>Payment Status:</span>
                        <span>FULLY PAID</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer and Terms */}
                <div className="mt-auto pt-6 border-t border-slate-300 text-[10px] text-slate-600 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-bold text-slate-800 uppercase">Warranty & Return Terms:</p>
                      <p>{warrantyTerms}</p>
                    </div>
                    <div className="text-right flex flex-col justify-end">
                      <div className="inline-block border-t border-slate-400 pt-1 w-44 self-end text-center font-semibold text-slate-700">
                        Authorized Signature
                      </div>
                    </div>
                  </div>
                  <p className="text-center font-medium text-slate-500 pt-2">{invoiceFooter}</p>
                  <p className="text-center text-[9px] text-slate-400">Page 1 of 1 • PakAudio POS Offline Engine</p>
                </div>
              </div>
            )}

            {/* 2. JOB CARD PRINT */}
            {docType === 'JOB_CARD' && (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                  <div>
                    <h1 className="text-2xl font-black text-slate-950 uppercase">{shopName}</h1>
                    <p className="text-slate-600 text-xs">{shopAddress} • {shopPhone}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-indigo-900 text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider mb-2">
                      INSTALLATION JOB CARD
                    </span>
                    <p className="font-bold text-sm">#{data.job_number}</p>
                    <p className="text-slate-600 text-xs">Date: {formatDateTime(data.created_at)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border p-3 rounded-lg bg-slate-50 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold text-[10px] uppercase">Vehicle Details</span>
                    <p className="text-base font-black text-indigo-900">{data.car_registration}</p>
                    <p className="font-bold">{data.car_make} {data.car_model} ({data.car_year})</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold text-[10px] uppercase">Customer & Technician</span>
                    <p className="font-bold text-slate-900">{data.customer_name}</p>
                    <p className="text-slate-600">Phone: {data.customer_phone}</p>
                    <p className="text-indigo-800 font-bold mt-1">Assigned Tech: {data.technician_name}</p>
                  </div>
                </div>

                <div className="border p-3 rounded-lg text-xs space-y-2">
                  <span className="text-slate-500 font-bold text-[10px] uppercase block">Scope of Work</span>
                  <p className="font-medium text-slate-900 whitespace-pre-wrap">{data.work_description}</p>
                </div>

                <div className="space-y-2">
                  <span className="text-slate-500 font-bold text-[10px] uppercase block">Parts & Components Used</span>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                        <th className="py-1 px-2 text-left">Item Name</th>
                        <th className="py-1 px-2 text-center w-16">Qty</th>
                        <th className="py-1 px-2 text-right w-24">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.parts_used?.map((p: any, i: number) => (
                        <tr key={i}>
                          <td className="py-1.5 px-2 font-medium">{p.name}</td>
                          <td className="py-1.5 px-2 text-center">{p.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{formatPKR(p.price_paisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-4 border-t-2 border-slate-800">
                  <div className="w-64 space-y-1 text-xs">
                    <div className="flex justify-between py-1 border-b">
                      <span>Labour Charge:</span>
                      <span className="font-mono font-bold">{formatPKR(data.labour_charge_paisa)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-12 grid grid-cols-2 gap-8 text-xs text-center">
                  <div className="border-t border-slate-400 pt-1 font-semibold">Technician Signature</div>
                  <div className="border-t border-slate-400 pt-1 font-semibold">Customer Inspection & Acceptance</div>
                </div>
              </div>
            )}

            {/* 3. BARCODE STICKER SHEET */}
            {docType === 'BARCODE_SHEET' && (
              <div className="space-y-4">
                <div className="text-center pb-2 border-b">
                  <h2 className="font-bold text-sm">Barcode Sticker Sheet (Layout: {data.layout || '3x10'})</h2>
                  <p className="text-[10px] text-slate-500">Print on A4 Die-Cut Sticker Paper</p>
                </div>

                <div
                  className={`grid gap-2 ${
                    data.layout === '4x13' ? 'grid-cols-4' : 'grid-cols-3'
                  }`}
                >
                  {Array.from({ length: data.count || 24 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="border border-slate-400 p-2 rounded text-center flex flex-col justify-between items-center bg-white h-24"
                    >
                      <div className="w-full truncate text-[10px] font-bold text-slate-900">
                        {data.product_name}
                      </div>
                      <div className="text-[9px] text-slate-600 truncate w-full">
                        {data.variant_name} • {data.sku}
                      </div>
                      <div className="font-mono tracking-widest font-extrabold text-sm my-0.5">
                        ||| {data.barcode} |||
                      </div>
                      <div className="font-bold text-[11px] text-slate-950 font-mono">
                        {formatPKR(data.retail_price_paisa)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. REORDER LIST */}
            {docType === 'REORDER_LIST' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3">
                  <div>
                    <h1 className="text-xl font-black uppercase">{shopName}</h1>
                    <p className="text-xs text-slate-600">Stock Reorder & Low Inventory Report</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold">Printed: {formatDateTime(new Date().toISOString())}</p>
                    <p className="text-slate-500">Criteria: Stock on Hand &le; Reorder Level</p>
                  </div>
                </div>

                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-800 text-left font-bold">
                      <th className="py-2 px-2">Product Description</th>
                      <th className="py-2 px-2">SKU / Barcode</th>
                      <th className="py-2 px-2 text-center">On Hand</th>
                      <th className="py-2 px-2 text-center">Min Level</th>
                      <th className="py-2 px-2 text-center">Suggested Order</th>
                      <th className="py-2 px-2 text-right">Estimated Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.items?.map((item: any, i: number) => {
                      const suggested = Math.max(5, (item.reorder_level * 2) - item.stock_on_hand);
                      return (
                        <tr key={i}>
                          <td className="py-2 px-2">
                            <p className="font-bold text-slate-900">{item.product_name}</p>
                            <p className="text-slate-500 text-[11px]">{item.variant_name} • {item.brand_name}</p>
                          </td>
                          <td className="py-2 px-2 font-mono text-[11px]">
                            {item.sku}<br />
                            <span className="text-slate-500">{item.barcode}</span>
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-red-600">{item.stock_on_hand}</td>
                          <td className="py-2 px-2 text-center">{item.reorder_level}</td>
                          <td className="py-2 px-2 text-center font-bold text-emerald-700 bg-emerald-50">{suggested}</td>
                          <td className="py-2 px-2 text-right font-mono">{formatPKR(suggested * (item.cost_paisa || 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
