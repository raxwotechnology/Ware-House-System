import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { PackageCheck } from 'lucide-react';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { useCreateGrn } from './usePurchaseOrders';

export default function GrnModal({ isOpen, onClose, purchaseOrder }) {
    const createMutation = useCreateGrn();

    const [supplierDN, setSupplierDN] = useState('');
    const [supplierInvoice, setSupplierInvoice] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState([]);

    const [billDiscountPercent, setBillDiscountPercent] = useState('');
    const [billDiscountAmount, setBillDiscountAmount] = useState('');

    useEffect(() => {
        if (isOpen && purchaseOrder) {
            // Initialize items with pending quantities
            const pendingItems = purchaseOrder.items
                .filter((i) => (i.orderedQuantity - (i.receivedQuantity || 0)) > 0)
                .map((i) => ({
                    poLineItemId: i._id,
                    productId: i.productId._id || i.productId,
                    productName: i.productName,
                    productCode: i.productCode,
                    orderedQuantity: i.orderedQuantity,
                    alreadyReceived: i.receivedQuantity || 0,
                    pending: i.orderedQuantity - (i.receivedQuantity || 0),
                    receivedQuantity: i.orderedQuantity - (i.receivedQuantity || 0),
                    acceptedQuantity: i.orderedQuantity - (i.receivedQuantity || 0),
                    rejectedQuantity: 0,
                    rejectionReason: '',
                    discountPercent: 0,
                    discountAmount: 0,
                    freeQuantity: 0,
                    unitPrice: i.unitPrice,
                    batchNumber: '',
                    expiryDate: '',
                    unitOfMeasure: i.unitOfMeasure,
                }));
            setItems(pendingItems);
            setSupplierDN('');
            setSupplierInvoice('');
            setVehicleNumber('');
            setDriverName('');
            setNotes('');
            setBillDiscountPercent('');
            setBillDiscountAmount('');
        }
    }, [isOpen, purchaseOrder]);

    const updateItem = (idx, field, value) => {
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], [field]: value };

        const received = +newItems[idx].receivedQuantity || 0;
        const rejected = +newItems[idx].rejectedQuantity || 0;
        const accepted = Math.max(0, received - rejected);
        
        if (field === 'receivedQuantity' || field === 'rejectedQuantity') {
            newItems[idx].acceptedQuantity = accepted;
            const lineTotal = accepted * (+newItems[idx].unitPrice || 0);
            if (+newItems[idx].discountPercent > 0) {
                newItems[idx].discountAmount = ((lineTotal * (+newItems[idx].discountPercent)) / 100).toFixed(2);
            }
        } else if (field === 'discountPercent') {
            const lineTotal = accepted * (+newItems[idx].unitPrice || 0);
            newItems[idx].discountAmount = value ? ((lineTotal * (+value)) / 100).toFixed(2) : '';
        } else if (field === 'discountAmount') {
            const lineTotal = accepted * (+newItems[idx].unitPrice || 0);
            newItems[idx].discountPercent = value && lineTotal > 0 ? (((+value) / lineTotal) * 100).toFixed(2) : '';
        }

        setItems(newItems);
    };

    const handleSubmit = async () => {
        const toReceive = items.filter((i) => +i.receivedQuantity > 0);
        if (toReceive.length === 0) { toast.error('At least one item must be received'); return; }

        try {
            await createMutation.mutateAsync({
                purchaseOrderId: purchaseOrder._id,
                warehouseId: purchaseOrder.deliverTo?.warehouseId?._id || purchaseOrder.deliverTo?.warehouseId,
                supplierDeliveryNoteNumber: supplierDN || undefined,
                supplierInvoiceNumber: supplierInvoice || undefined,
                vehicleNumber: vehicleNumber || undefined,
                driverName: driverName || undefined,
                notes: notes || undefined,
                billDiscountPercent: +billDiscountPercent || 0,
                billDiscountAmount: +billDiscountAmount || 0,
                items: toReceive.map((i) => ({
                    poLineItemId: i.poLineItemId,
                    productId: i.productId,
                    receivedQuantity: +i.receivedQuantity,
                    acceptedQuantity: +i.acceptedQuantity,
                    rejectedQuantity: +i.rejectedQuantity || 0,
                    rejectionReason: i.rejectionReason || undefined,
                    discountPercent: +i.discountPercent || 0,
                    discountAmount: +i.discountAmount || 0,
                    freeQuantity: +i.freeQuantity || 0,
                    unitPrice: +i.unitPrice,
                    batchNumber: i.batchNumber || undefined,
                    expiryDate: i.expiryDate || undefined,
                })),
            });
            onClose();
        } catch { }
    };

    const fmt = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(n || 0);

    const calculateTotals = () => {
        const subtotal = items.reduce((s, i) => {
            const qty = +i.receivedQuantity || 0;
            const price = +i.unitPrice || 0;
            return s + (qty * price);
        }, 0);

        const lineDiscounts = items.reduce((s, i) => {
            const qty = +i.receivedQuantity || 0;
            const price = +i.unitPrice || 0;
            const lineTotal = qty * price;
            const discount = +i.discountAmount || (lineTotal * (+i.discountPercent || 0) / 100);
            return s + discount;
        }, 0);

        const valueBeforeBillDiscount = Math.max(0, subtotal - lineDiscounts);

        const billDiscPercentVal = +billDiscountPercent || 0;
        const billDiscPercentAmt = (valueBeforeBillDiscount * billDiscPercentVal) / 100;
        const billDiscFixedAmt = +billDiscountAmount || 0;
        const totalBillDiscount = billDiscPercentAmt + billDiscFixedAmt;

        const grandTotal = Math.max(0, valueBeforeBillDiscount - totalBillDiscount);

        return {
            subtotal,
            lineDiscounts,
            valueBeforeBillDiscount,
            totalBillDiscount,
            grandTotal
        };
    };

    const totals = calculateTotals();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Receive Goods — PO ${purchaseOrder?.poNumber}`} size="xl">
            <div className="p-6 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
                    <PackageCheck size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                        Receiving goods will automatically increase stock at the delivery warehouse. Each line creates a stock movement record.
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Supplier Delivery Note #" value={supplierDN} onChange={(e) => setSupplierDN(e.target.value)} />
                    <Input label="Supplier Invoice #" value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} />
                    <Input label="Vehicle Number" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                    <Input label="Driver Name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                </div>

                {items.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">All items fully received on this PO.</p>
                ) : (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Items</h4>
                        <div className="space-y-3">
                            {items.map((item, idx) => (
                                <div key={idx} className="border rounded-lg p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-medium text-sm">{item.productName}</p>
                                            <p className="text-xs text-gray-500 font-mono">{item.productCode}</p>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Ordered: {item.orderedQuantity} · Already received: {item.alreadyReceived} · Pending: <span className="font-medium">{item.pending}</span>
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                        <Input label="Received Qty" type="number" step="0.01" min="0" max={item.pending}
                                            value={item.receivedQuantity} onChange={(e) => updateItem(idx, 'receivedQuantity', e.target.value)} />
                                        <Input label="Rejected Qty" type="number" step="0.01" min="0"
                                            value={item.rejectedQuantity} onChange={(e) => updateItem(idx, 'rejectedQuantity', e.target.value)} />
                                        <Input label="Accepted" type="number" value={item.acceptedQuantity} disabled className="bg-gray-50" />
                                        <Input label="Batch #" value={item.batchNumber} onChange={(e) => updateItem(idx, 'batchNumber', e.target.value)} />
                                        <Input label="Expiry" type="date" value={item.expiryDate} onChange={(e) => updateItem(idx, 'expiryDate', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-5 gap-2 mt-2 pt-2 border-t border-gray-100">
                                        <Input label="Free Qty" type="number" step="0.01" min="0"
                                            value={item.freeQuantity} onChange={(e) => updateItem(idx, 'freeQuantity', e.target.value)} />
                                        <Input label="Discount (%)" type="number" step="0.01" min="0" max="100"
                                            value={item.discountPercent} onChange={(e) => updateItem(idx, 'discountPercent', e.target.value)} />
                                        <Input label="Discount (Rs)" type="number" step="0.01" min="0"
                                            value={item.discountAmount} onChange={(e) => updateItem(idx, 'discountAmount', e.target.value)} />
                                    </div>
                                    {+item.rejectedQuantity > 0 && (
                                        <div className="mt-2">
                                            <Input label="Rejection Reason" placeholder="Why were these rejected?"
                                                value={item.rejectionReason} onChange={(e) => updateItem(idx, 'rejectionReason', e.target.value)} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {items.length > 0 && (
                    <div className="border-t pt-4 flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4">
                        <div className="grid grid-cols-2 gap-4 w-full md:max-w-md">
                            <Input 
                                label="Bill Discount (%)" 
                                type="number" 
                                step="0.01" 
                                min="0" 
                                max="100" 
                                value={billDiscountPercent} 
                                onChange={(e) => {
                                    setBillDiscountPercent(e.target.value);
                                    if (e.target.value) setBillDiscountAmount('');
                                }} 
                            />
                            <Input 
                                label="Bill Discount (Rs)" 
                                type="number" 
                                step="0.01" 
                                min="0" 
                                value={billDiscountAmount} 
                                onChange={(e) => {
                                    setBillDiscountAmount(e.target.value);
                                    if (e.target.value) setBillDiscountPercent('');
                                }} 
                            />
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-4 w-full md:max-w-xs space-y-1.5 text-sm self-stretch flex flex-col justify-center">
                            <div className="flex justify-between text-gray-600">
                                <span>Subtotal:</span>
                                <span className="font-semibold">{fmt(totals.subtotal)}</span>
                            </div>
                            {totals.lineDiscounts > 0 && (
                                <div className="flex justify-between text-red-600">
                                    <span>Line Discounts:</span>
                                    <span>-{fmt(totals.lineDiscounts)}</span>
                                </div>
                            )}
                            {totals.totalBillDiscount > 0 && (
                                <div className="flex justify-between text-red-600 font-medium">
                                    <span>Bill Discount:</span>
                                    <span>-{fmt(totals.totalBillDiscount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-base border-t pt-1.5 text-gray-950">
                                <span>Grand Total:</span>
                                <span>{fmt(totals.grandTotal)}</span>
                            </div>
                        </div>
                    </div>
                )}

                <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleSubmit} loading={createMutation.isPending}
                    disabled={items.length === 0 || !items.some((i) => +i.receivedQuantity > 0)}>
                    <PackageCheck size={16} className="mr-1.5" /> Confirm Receipt
                </Button>
            </div>
        </Modal>
    );
}