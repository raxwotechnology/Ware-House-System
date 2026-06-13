import mongoose from 'mongoose';
import { getNextSequence } from './Counter.js';

const grnLineItemSchema = new mongoose.Schema({
    poLineItemId: mongoose.Schema.Types.ObjectId,
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: String,
    productName: String,

    orderedQuantity: Number,       // from PO
    receivedQuantity: { type: Number, required: true, min: 0 },
    acceptedQuantity: { type: Number, default: 0 },
    rejectedQuantity: { type: Number, default: 0 },
    damagedQuantity: { type: Number, default: 0 },

    unitOfMeasure: String,
    unitPrice: { type: Number, required: true },

    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    freeQuantity: { type: Number, default: 0 },

    batchNumber: String,
    manufactureDate: Date,
    expiryDate: Date,

    qcStatus: {
        type: String,
        enum: ['not_required', 'pending', 'passed', 'failed', 'partially_passed'],
        default: 'not_required',
    },
    rejectionReason: String,
    notes: String,

    stockMovementId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement' },
}, { _id: true });

const grnSchema = new mongoose.Schema({
    grnNumber: { type: String, unique: true, trim: true, uppercase: true },

    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: false },
    poNumber: { type: String, required: false }, // denormalized
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: String,

    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },

    receiptDate: { type: Date, default: Date.now },
    supplierDeliveryNoteNumber: String,
    supplierInvoiceNumber: String,

    // Transport
    vehicleNumber: String,
    driverName: String,
    transportCompany: String,

    items: [grnLineItemSchema],

    billDiscountPercent: { type: Number, default: 0 },
    billDiscountAmount: { type: Number, default: 0 },

    totalReceivedValue: { type: Number, default: 0 },
    totalAcceptedValue: { type: Number, default: 0 },

    status: {
        type: String,
        enum: ['draft', 'received', 'qc_pending', 'completed', 'rejected'],
        default: 'draft',
    },

    hasDiscrepancy: { type: Boolean, default: false },
    discrepancyNotes: String,

    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    notes: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

// Removed duplicate grnNumber index
grnSchema.index({ purchaseOrderId: 1 });
grnSchema.index({ supplierId: 1, receiptDate: -1 });
grnSchema.index({ status: 1 });

grnSchema.pre('save', async function () {
    if (this.isNew && !this.grnNumber) {
        const seq = await getNextSequence('grn');
        this.grnNumber = `GRN-${seq}`;
    }

    const rawReceivedValue = this.items.reduce((s, i) => {
        const qty = i.receivedQuantity || 0;
        const lineTotal = qty * i.unitPrice;
        const discount = i.discountAmount || (lineTotal * (i.discountPercent || 0) / 100);
        return s + Math.max(0, lineTotal - discount);
    }, 0);
    
    const rawAcceptedValue = this.items.reduce((s, i) => {
        const qty = i.acceptedQuantity || i.receivedQuantity || 0;
        const lineTotal = qty * i.unitPrice;
        const discount = i.discountAmount || (lineTotal * (i.discountPercent || 0) / 100);
        return s + Math.max(0, lineTotal - discount);
    }, 0);

    const percentReceivedDiscount = rawReceivedValue * (this.billDiscountPercent || 0) / 100;
    const fixedReceivedDiscount = this.billDiscountAmount || 0;
    this.totalReceivedValue = +Math.max(0, rawReceivedValue - percentReceivedDiscount - fixedReceivedDiscount).toFixed(2);

    const percentAcceptedDiscount = rawAcceptedValue * (this.billDiscountPercent || 0) / 100;
    const fixedAcceptedDiscount = this.billDiscountAmount || 0;
    this.totalAcceptedValue = +Math.max(0, rawAcceptedValue - percentAcceptedDiscount - fixedAcceptedDiscount).toFixed(2);
});

grnSchema.pre(/^find/, function (next) {
    if (!this.getOptions || !this.getOptions().includeDeleted) {
        this.where({ deletedAt: null });
    }
    if (typeof next === 'function') next();
});

const GoodsReceiptNote = mongoose.model('GoodsReceiptNote', grnSchema);
export default GoodsReceiptNote;