import { forwardRef } from 'react';
import { useCompanySettings } from '../../features/settings/useSettings';

const fmt = (n) => new Intl.NumberFormat('en-LK', {
    style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(n || 0);

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-LK', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '—';

/**
 * Thermal Receipt Printable Component
 * Designed for 80mm / 58mm thermal printers.
 */
const ThermalReceipt = forwardRef(({ invoice, payments = [], companyInfo: propCompanyInfo }, ref) => {
    const { data: settingsRes } = useCompanySettings();
    
    if (!invoice) return null;

    // Use settings from DB, or fallback to props, or fallback to defaults
    const s = settingsRes?.data || {};
    const companyInfo = propCompanyInfo?.name ? propCompanyInfo : {
        name: s.companyName || 'YOUR COMPANY NAME',
        address: s.address || 'YOUR STREET, CITY',
        phone: s.phone || '+94 11 XXX XXXX',
        taxNumber: s.taxRegistrationNumber,
        email: s.email,
        website: s.website,
        footerMessage: s.receiptFooterMessage || 'THANK YOU FOR YOUR BUSINESS!\nPLEASE VISIT AGAIN.'
    };

    const customer = invoice.customerSnapshot || {};
    
    const totalPaid = payments.reduce((sum, p) => {
        const alloc = p.allocations?.find((a) =>
            (a.documentId?._id?.toString() || a.documentId?.toString()) === invoice._id.toString()
        );
        return sum + (alloc?.amount || 0);
    }, 0);

    const balanceDue = invoice.grandTotal - totalPaid;
    const actualTotalDiscount = (invoice.totalDiscount || 0) + (invoice.orderDiscount?.amount || 0);

    return (
        <div ref={ref} className="print-thermal-container bg-white text-black p-4 mx-auto" style={{ width: '80mm', maxWidth: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <style type="text/css" media="print">
                {`
                    @page { size: 80mm auto; margin: 0; }
                    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; color-adjust: exact; width: 80mm; height: auto; }
                    .print-thermal-container { page-break-after: avoid; display: inline-block; width: 80mm; }
                `}
            </style>
            
            {/* Header section with professional styling */}
            <div className="text-center mb-4">
                {companyInfo.logo && (
                    <img src={companyInfo.logo} alt="Logo" className="max-w-[120px] mx-auto mb-3 grayscale" />
                )}
                <h1 className="text-xl font-black mb-1 uppercase tracking-wider">{companyInfo.name}</h1>
                <div className="text-xs text-gray-800 leading-snug font-medium">
                    {companyInfo.address && <div>{companyInfo.address}</div>}
                    {companyInfo.phone && <div>TEL: {companyInfo.phone}</div>}
                    {companyInfo.email && <div>{companyInfo.email}</div>}
                    {companyInfo.website && <div>{companyInfo.website}</div>}
                    {companyInfo.taxNumber && <div className="mt-1 font-bold">VAT NO: {companyInfo.taxNumber}</div>}
                </div>
            </div>

            <div className="border-b-[2px] border-black my-3"></div>

            {/* Receipt details */}
            <div className="text-xs mb-3 space-y-1 font-medium">
                <div className="flex justify-between">
                    <span className="text-gray-600 uppercase">Receipt No</span> 
                    <span className="font-bold text-sm">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600 uppercase">Date</span> 
                    <span>{formatDate(invoice.invoiceDate)}</span>
                </div>
                {customer.name && (
                    <div className="flex justify-between mt-1">
                        <span className="text-gray-600 uppercase">Customer</span> 
                        <span className="truncate max-w-[120px] text-right font-semibold">{customer.name}</span>
                    </div>
                )}
                {customer.phone && (
                    <div className="flex justify-between">
                        <span className="text-gray-600 uppercase">Contact</span> 
                        <span className="text-right">{customer.phone}</span>
                    </div>
                )}
            </div>

            <div className="border-b-[2px] border-black my-3"></div>

            {/* Items Header */}
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider mb-2 text-gray-500">
                <span className="w-1/2">Description</span>
                <span className="w-1/4 text-right">Qty</span>
                <span className="w-1/4 text-right">Amount</span>
            </div>
            
            {/* Items List */}
            <div className="text-[12px] mb-4 space-y-3 font-medium">
                {(invoice.items || []).map((item, idx) => {
                    const lineSub = (item.quantity || 0) * (item.unitPrice || 0);
                    const lineDisc = lineSub * ((item.discountPercent || 0) / 100);
                    const lineTotal = lineSub - lineDisc;

                    return (
                        <div key={idx} className="leading-tight">
                            <div className="font-bold text-gray-900 pr-2">{item.productName}</div>
                            <div className="flex justify-between mt-1 text-gray-600">
                                <span>{item.quantity} x {fmt(item.unitPrice)}</span>
                                <span className="font-bold text-black text-[13px]">{fmt(lineTotal)}</span>
                            </div>
                            {item.discountPercent > 0 && (
                                <div className="text-[10px] text-gray-500 italic">
                                    Discount: {item.discountPercent}%
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="border-b border-black my-3"></div>

            {/* Totals Section */}
            <div className="text-[13px] space-y-1 font-medium">
                <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{fmt(invoice.subtotal)}</span>
                </div>
                {actualTotalDiscount > 0 && (
                    <div className="flex justify-between text-gray-600">
                        <span>Discount</span>
                        <span>-{fmt(actualTotalDiscount)}</span>
                    </div>
                )}
                <div className="flex justify-between font-black text-lg mt-2 pt-2 border-t-[2px] border-black uppercase">
                    <span>Total</span>
                    <span>{fmt(invoice.grandTotal)}</span>
                </div>
                {totalPaid > 0 && (
                    <>
                        <div className="flex justify-between mt-3 text-sm">
                            <span className="uppercase text-gray-600">Paid Amount</span>
                            <span className="font-bold">{fmt(totalPaid)}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1 pb-1 border-b border-dashed border-gray-400">
                            <span className="uppercase text-gray-600">Amount Due</span>
                            <span className="font-bold">{fmt(balanceDue)}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="text-center mt-8">
                {companyInfo.footerMessage?.split('\n').map((line, i) => (
                    <div key={i} className={`text-xs uppercase font-bold text-gray-600 ${i === 0 ? 'mb-1 text-sm text-gray-900' : ''}`}>
                        {line}
                    </div>
                ))}
            </div>
            
            {/* Barcode/QR Placeholder (Makes it look very professional) */}
            <div className="mt-4 flex justify-center opacity-50">
                <svg width="150" height="40" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100%" height="100%" fill="none"/>
                    {/* Simulated barcode lines */}
                    <path d="M10 0v40M15 0v40M22 0v40M28 0v40M32 0v40M40 0v40M45 0v40M55 0v40M60 0v40M62 0v40M70 0v40M75 0v40M82 0v40M88 0v40M92 0v40M100 0v40M105 0v40M115 0v40M120 0v40M122 0v40M130 0v40M135 0v40M142 0v40" stroke="black" strokeWidth="2" />
                    <path d="M18 0v40M35 0v40M48 0v40M65 0v40M78 0v40M95 0v40M108 0v40M125 0v40" stroke="black" strokeWidth="4" />
                </svg>
            </div>
            <div className="text-[9px] text-center mt-1 font-mono tracking-widest text-gray-500">
                {invoice.invoiceNumber}
            </div>

            <div className="h-4"></div>
        </div>
    );
});

ThermalReceipt.displayName = 'ThermalReceipt';
export default ThermalReceipt;
