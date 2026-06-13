import mongoose from 'mongoose';
import { getNextSequence } from './Counter.js';

const expenseSchema = new mongoose.Schema({
    expenseNumber: { type: String, unique: true, trim: true, uppercase: true },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'cheque', 'card', 'other'], default: 'cash' },
    reference: { type: String, trim: true },
    description: { type: String, trim: true },
    
    // If paid via POS cash drawer
    posSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PosSession' },

    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },

    status: { type: String, enum: ['paid', 'pending', 'cancelled'], default: 'paid' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ status: 1 });

expenseSchema.pre('save', async function () {
    if (this.isNew && !this.expenseNumber) {
        const seq = await getNextSequence('expense');
        this.expenseNumber = `EXP-${seq}`;
    }
});

expenseSchema.pre(/^find/, function (next) {
    if (!this.getOptions || !this.getOptions().includeDeleted) {
        this.where({ deletedAt: null });
    }
    if (typeof next === 'function') next();
});

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
