import mongoose from 'mongoose';
import { getNextSequence } from './Counter.js';

const addressSnapshotSchema = new mongoose.Schema({
    line1: String, line2: String, city: String, state: String,
    country: String, postalCode: String, phone: String,
}, { _id: false });

const invoiceLineItemSchema = new mongoose.Schema({
    lineNumber: Number,
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productCode: String,
    productName: String,
    description: String,

    quantity: { type: Number, required: true, min: 0.01 },
    unitOfMeasure: String,
    unitPrice: { type: Number, required: true, min: 0 },

    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0 },

    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxable: { type: Boolean, default: true },

    lineSubtotal: { type: Number, default: 0 },
    lineDiscount: { type: Number, default: 0 },
    lineTax: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },

    // Traceability
    salesOrderLineId: mongoose.Schema.Types.ObjectId,

    notes: String,
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, unique: true, trim: true, uppercase: true },

    invoiceType: {
        type: String,
        enum: ['standard', 'proforma', 'service'],
        default: 'standard',
    },

    // Parties
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerSnapshot: {
        name: String,
        code: String,
        taxRegistrationNumber: String,
        contactName: String,
        phone: String,
    },

    // Addresses (snapshot)
    billingAddress: addressSnapshotSchema,
    shippingAddress: addressSnapshotSchema,

    // Source
    salesOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' }],
    salesOrderNumbers: [String], // denormalized for display

    // Dates
    invoiceDate: { type: Date, default: Date.now },
    dueDate: Date,

    // Currency
    currency: { type: String, default: 'LKR' },

    // Assignment
    salesRepId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Line items
    items: [invoiceLineItemSchema],

    // Totals
    subtotal: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    orderDiscount: {
        type: { type: String, enum: ['percentage', 'fixed'] },
        value: Number,
        amount: Number,
    },
    totalTax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    // Tax breakdown
    taxBreakdown: [{
        taxName: String,
        taxRate: Number,
        taxableAmount: Number,
        taxAmount: Number,
    }],

    paymentTerms: {
        type: { type: String, enum: ['advance', 'cod', 'credit'] },
        creditDays: Number,
    },

    // Payment tracking (updated by payment module)
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled', 'written_off'],
        default: 'unpaid',
    },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    lastPaymentDate: Date,
    fullyPaidAt: Date,

    // Aging (auto-calculated)
    daysOutstanding: { type: Number, default: 0 },
    daysPastDue: { type: Number, default: 0 },
    agingBucket: {
        type: String,
        enum: ['current', '1_30', '31_60', '61_90', '91_plus'],
        default: 'current',
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'approved', 'sent', 'viewed', 'paid', 'cancelled', 'void'],
        default: 'approved',
    },

    sentAt: Date,
    sentVia: String,
    viewedAt: Date,

    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,

    cashReceived: { type: Number },
    changeReturned: { type: Number },

    notes: String,
    internalNotes: String,
    paymentInstructions: String,
    termsAndConditions: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

// Removed duplicate invoiceNumber index
invoiceSchema.index({ customerId: 1, invoiceDate: -1 });
invoiceSchema.index({ paymentStatus: 1, dueDate: 1 });
invoiceSchema.index({ status: 1, invoiceDate: -1 });
invoiceSchema.index({ agingBucket: 1 });
invoiceSchema.index({ deletedAt: 1, invoiceDate: 1 });

invoiceSchema.pre('save', async function () {
    if (this.isNew && !this.invoiceNumber) {
        const seq = await getNextSequence('invoice');
        this.invoiceNumber = `INV-${seq}`;
    }

    // Line totals
    this.items.forEach((item, idx) => {
        item.lineNumber = idx + 1;
        item.lineSubtotal = +(item.quantity * item.unitPrice).toFixed(2);
        const discFromPct = item.lineSubtotal * (item.discountPercent || 0) / 100;
        item.lineDiscount = +(discFromPct + (item.discountAmount || 0)).toFixed(2);
        const taxable = item.lineSubtotal - item.lineDiscount;
        item.lineTax = item.taxable ? +(taxable * (item.taxRate || 0) / 100).toFixed(2) : 0;
        item.taxAmount = item.lineTax;
        item.lineTotal = +(taxable + item.lineTax).toFixed(2);
    });

    this.subtotal = +this.items.reduce((s, i) => s + i.lineSubtotal, 0).toFixed(2);
    this.totalDiscount = +this.items.reduce((s, i) => s + i.lineDiscount, 0).toFixed(2);
    this.totalTax = +this.items.reduce((s, i) => s + i.lineTax, 0).toFixed(2);

    let orderLevelDiscount = 0;
    if (this.orderDiscount?.type === 'percentage') {
        orderLevelDiscount = +((this.subtotal - this.totalDiscount) * (this.orderDiscount.value || 0) / 100).toFixed(2);
    } else if (this.orderDiscount?.type === 'fixed') {
        orderLevelDiscount = this.orderDiscount.value || 0;
    }
    if (this.orderDiscount) this.orderDiscount.amount = orderLevelDiscount;

    this.grandTotal = +(
        this.subtotal - this.totalDiscount - orderLevelDiscount + this.totalTax
        + (this.shippingCost || 0) + (this.otherCharges || 0)
    ).toFixed(2);

    this.balanceDue = +(this.grandTotal - (this.amountPaid || 0)).toFixed(2);

    // Auto payment status
    if (this.amountPaid >= this.grandTotal && this.grandTotal > 0) {
        this.paymentStatus = 'paid';
        if (!this.fullyPaidAt) this.fullyPaidAt = new Date();
    } else if (this.amountPaid > 0) {
        this.paymentStatus = 'partially_paid';
    } else if (this.paymentStatus !== 'cancelled' && this.paymentStatus !== 'written_off') {
        this.paymentStatus = 'unpaid';
    }

    // Aging
    if (this.dueDate && this.paymentStatus !== 'paid' && this.paymentStatus !== 'cancelled') {
        const now = new Date();
        const daysPast = Math.floor((now - new Date(this.dueDate)) / (1000 * 60 * 60 * 24));
        this.daysPastDue = Math.max(0, daysPast);

        if (this.daysPastDue > 0 && this.paymentStatus === 'unpaid') {
            this.paymentStatus = 'overdue';
        }

        if (this.daysPastDue === 0) this.agingBucket = 'current';
        else if (this.daysPastDue <= 30) this.agingBucket = '1_30';
        else if (this.daysPastDue <= 60) this.agingBucket = '31_60';
        else if (this.daysPastDue <= 90) this.agingBucket = '61_90';
        else this.agingBucket = '91_plus';
    }

    if (this.invoiceDate) {
        this.daysOutstanding = Math.floor((Date.now() - new Date(this.invoiceDate)) / (1000 * 60 * 60 * 24));
    }
});

invoiceSchema.pre(/^find/, function (next) {
    if (!this.getOptions || !this.getOptions().includeDeleted) {
        this.where({ deletedAt: null });
    }
    if (typeof next === 'function') next();
});

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;