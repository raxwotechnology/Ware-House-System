import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import { invoicesApi } from '../features/invoices/invoicesApi';
import { useCompanySettings } from '../features/settings/useSettings';
import { getBluetoothPrintUrl } from '../utils/printHelpers';

const fmt = (n) => new Intl.NumberFormat('en-LK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(n || 0);

const fmtDate = (d) => d ? new Date(d).toLocaleString('en-LK', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '—';

export default function ReceiptPrintPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: invoiceRes, isLoading } = useQuery({
        queryKey: ['invoice', id],
        queryFn: () => invoicesApi.getById(id),
        enabled: !!id,
    });
    const { data: settingsRes } = useCompanySettings();

    const invoice = invoiceRes?.data;
    const s = settingsRes?.data || {};
    const company = {
        name: s.companyName || 'YOUR COMPANY NAME',
        address: s.address || '',
        phone: s.phone || '',
        email: s.email || '',
        taxNumber: s.taxRegistrationNumber || '',
        footer: s.receiptFooterMessage || 'THANK YOU FOR YOUR BUSINESS!\nPLEASE VISIT AGAIN.',
    };

    // Auto-print when invoice data is ready
    useEffect(() => {
        if (!invoice) return;
        const timer = setTimeout(() => {
            window.print();
        }, 600);
        return () => clearTimeout(timer);
    }, [invoice]);

    if (isLoading || !invoice) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Loading receipt...</p>
                </div>
            </div>
        );
    }

    const customer = invoice.customerSnapshot || {};
    const discount = (invoice.totalDiscount || 0) + (invoice.orderDiscount?.amount || 0);

    return (
        <>
            {/* Print CSS - hides everything except receipt */}
            <style>{`
                @media print {
                    @page { size: 80mm auto; margin: 4mm; }
                    body { margin: 0; padding: 0; background: white; }
                    .no-print { display: none !important; }
                    .receipt-wrapper { width: 80mm; margin: 0; padding: 0; visibility: visible !important; }
                    .receipt-wrapper * { visibility: visible !important; }
                }
                @media screen {
                    body { background: #f3f4f6; }
                }
            `}</style>

            {/* Screen-only action bar */}
            <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/pos')}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                    >
                        <ArrowLeft size={16} /> Back to POS
                    </button>
                    <button
                        onClick={() => navigate(`/invoices/${invoice._id}`)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                    >
                        <FileText size={16} /> View Invoice
                    </button>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const url = getBluetoothPrintUrl(invoice._id);
                            window.location.href = url;
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 active:scale-95 transition shadow"
                    >
                        <Printer size={16} /> Bluetooth Print
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition shadow"
                    >
                        <Printer size={16} /> Print Receipt
                    </button>
                </div>
            </div>

            {/* Receipt content - centered on screen, full-width when printing */}
            <div className="no-print pt-16 pb-8 flex justify-center">
                {/* Screen preview wrapper */}
            </div>

            <div className="receipt-wrapper print-thermal-container" style={{ width: '80mm', margin: '0 auto', fontFamily: "'Courier New', monospace", fontSize: '13px', color: '#000', background: '#fff', padding: '12px' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '17px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>{company.name}</div>
                    {company.address && <div style={{ fontSize: '11px', marginTop: '2px' }}>{company.address}</div>}
                    {company.phone && <div style={{ fontSize: '11px' }}>TEL: {company.phone}</div>}
                    {company.email && <div style={{ fontSize: '11px' }}>{company.email}</div>}
                    {company.taxNumber && <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '3px' }}>VAT NO: {company.taxNumber}</div>}
                </div>

                <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '6px 0' }} />

                {/* Invoice Details */}
                <div style={{ fontSize: '12px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: '#555', textTransform: 'uppercase', fontSize: '10px' }}>Receipt No</span>
                        <span style={{ fontWeight: '700' }}>{invoice.invoiceNumber}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: '#555', textTransform: 'uppercase', fontSize: '10px' }}>Date</span>
                        <span>{fmtDate(invoice.invoiceDate)}</span>
                    </div>
                    {customer.name && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: '#555', textTransform: 'uppercase', fontSize: '10px' }}>Customer</span>
                            <span style={{ fontWeight: '700' }}>{customer.name}</span>
                        </div>
                    )}
                    {customer.phone && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: '#555', textTransform: 'uppercase', fontSize: '10px' }}>Contact</span>
                            <span>{customer.phone}</span>
                        </div>
                    )}
                </div>

                <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '6px 0' }} />

                {/* Items Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>
                    <span style={{ flex: 1 }}>Description</span>
                    <span style={{ textAlign: 'right', width: '60px' }}>Amount</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px dashed #999', margin: '3px 0 6px' }} />

                {/* Items */}
                {(invoice.items || []).map((item, idx) => {
                    const lineSub = (item.quantity || 0) * (item.unitPrice || 0);
                    const lineDisc = lineSub * ((item.discountPercent || 0) / 100);
                    const lineTotal = lineSub - lineDisc;
                    return (
                        <div key={idx} style={{ marginBottom: '8px', lineHeight: '1.35' }}>
                            <div style={{ fontWeight: '700' }}>{item.productName}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#444', fontSize: '12px' }}>
                                <span>{item.quantity} × {fmt(item.unitPrice)}</span>
                                <span style={{ fontWeight: '700', color: '#000' }}>{fmt(lineTotal)}</span>
                            </div>
                            {item.discountPercent > 0 && (
                                <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
                                    Discount: {item.discountPercent}%
                                </div>
                            )}
                        </div>
                    );
                })}

                <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '6px 0' }} />

                {/* Totals */}
                <div style={{ fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
                        <span>Subtotal</span>
                        <span>{fmt(invoice.subtotal)}</span>
                    </div>
                    {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
                            <span>Discount</span>
                            <span>-{fmt(discount)}</span>
                        </div>
                    )}
                    {invoice.totalTax > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
                            <span>Tax</span>
                            <span>{fmt(invoice.totalTax)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', borderTop: '2px solid #000', paddingTop: '5px', marginTop: '5px' }}>
                        <span>Total</span>
                        <span>{fmt(invoice.grandTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px' }}>
                        <span style={{ textTransform: 'uppercase', color: '#555', fontSize: '10px' }}>Paid Amount</span>
                        <span style={{ fontWeight: '700' }}>{fmt(invoice.grandTotal)}</span>
                    </div>
                    {invoice.cashReceived !== undefined && invoice.cashReceived > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ textTransform: 'uppercase', color: '#555', fontSize: '10px' }}>Cash Received</span>
                            <span style={{ fontWeight: '700' }}>{fmt(invoice.cashReceived)}</span>
                        </div>
                    )}
                    {invoice.changeReturned !== undefined && invoice.changeReturned > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ textTransform: 'uppercase', color: '#555', fontSize: '10px' }}>Change Returned</span>
                            <span style={{ fontWeight: '700' }}>{fmt(invoice.changeReturned)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ textTransform: 'uppercase', color: '#555', fontSize: '10px' }}>Amount Due</span>
                        <span style={{ fontWeight: '700' }}>{fmt(invoice.balanceDue || 0)}</span>
                    </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px dashed #999', margin: '8px 0' }} />

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                    {company.footer.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize: i === 0 ? '12px' : '10px', fontWeight: '700', textTransform: 'uppercase', color: i === 0 ? '#000' : '#666', marginBottom: '2px' }}>
                            {line}
                        </div>
                    ))}
                </div>

                {/* Simulated barcode */}
                <div style={{ marginTop: '12px', textAlign: 'center', opacity: 0.5 }}>
                    <svg width="150" height="35" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 0v35M15 0v35M22 0v35M28 0v35M32 0v35M40 0v35M45 0v35M55 0v35M60 0v35M62 0v35M70 0v35M75 0v35M82 0v35M88 0v35M92 0v35M100 0v35M105 0v35M115 0v35M120 0v35M122 0v35M130 0v35M135 0v35M142 0v35" stroke="black" strokeWidth="2" />
                        <path d="M18 0v35M35 0v35M48 0v35M65 0v35M78 0v35M95 0v35M108 0v35M125 0v35" stroke="black" strokeWidth="4" />
                    </svg>
                    <div style={{ fontSize: '9px', fontFamily: 'monospace', letterSpacing: '2px', color: '#666', marginTop: '2px' }}>{invoice.invoiceNumber}</div>
                </div>

                <div style={{ height: '12px' }} />
            </div>
        </>
    );
}
