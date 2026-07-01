import mongoose from 'mongoose';
import { getNextSequence } from './Counter.js';

const paymentAllocationSchema = new mongoose.Schema({
    documentType: {
        type: String,
        enum: ['invoice', 'bill'],
        required: true,
    },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    documentNumber: String,
    amount: { type: Number, required: true, min: 0 },
}, { _id: true });

const paymentSchema = new mongoose.Schema({
    paymentNumber: { type: String, unique: true, trim: true, uppercase: true },

    direction: {
        type: String,
        enum: ['received', 'paid'], // received from customer | paid to supplier
        required: true,
    },

    // Customer (if received) OR supplier (if paid)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    partyName: String,

    paymentDate: { type: Date, default: Date.now },

    currency: { type: String, default: 'LKR' },
    amount: { type: Number, required: true, min: 0.01 },

    method: {
        type: String,
        enum: ['cash', 'cheque', 'bank_transfer', 'card', 'mobile_wallet', 'other'],
        required: true,
    },

    // Method-specific
    chequeNumber: String,
    chequeDate: Date,
    chequeStatus: { type: String, enum: ['pending', 'cleared', 'bounced'] },

    bankName: String,
    transactionReference: String,

    // What the payment is applied to
    allocations: [paymentAllocationSchema],
    unallocatedAmount: { type: Number, default: 0 }, // advance payment

    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cleared', 'bounced', 'cancelled', 'refunded'],
        default: 'confirmed',
    },

    notes: String,
    receiptImageUrl: String,

    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

paymentSchema.index({ customerId: 1, paymentDate: -1 });
paymentSchema.index({ supplierId: 1, paymentDate: -1 });
paymentSchema.index({ direction: 1, status: 1 });
paymentSchema.index({ deletedAt: 1, direction: 1, paymentDate: 1 });

paymentSchema.pre('save', async function () {
    if (this.isNew && !this.paymentNumber) {
        const seq = await getNextSequence(this.direction === 'received' ? 'payment_receipt' : 'payment_made');
        const prefix = this.direction === 'received' ? 'REC' : 'PAY';
        this.paymentNumber = `${prefix}-${seq}`;
    }

    const totalAllocated = (this.allocations || []).reduce((s, a) => s + a.amount, 0);
    this.unallocatedAmount = +(this.amount - totalAllocated).toFixed(2);
});

paymentSchema.pre(/^find/, function (next) {
    if (!this.getOptions || !this.getOptions().includeDeleted) {
        this.where({ deletedAt: null });
    }
    if (typeof next === 'function') next();
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;