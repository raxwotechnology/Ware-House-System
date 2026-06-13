import asyncHandler from 'express-async-handler';
import Expense from '../models/Expense.js';
import PosSession from '../models/PosSession.js';
import BankAccount from '../models/BankAccount.js';

export const createExpense = asyncHandler(async (req, res) => {
    const expense = new Expense({
        ...req.body,
        createdBy: req.user._id,
    });

    const paymentAccount = await BankAccount.findOne({ category: 'payment', isActive: true });
    if (paymentAccount) {
        expense.bankAccountId = paymentAccount._id;
        paymentAccount.currentBalance = +(paymentAccount.currentBalance - expense.amount).toFixed(2);
        await paymentAccount.save();
    }

    if (expense.paymentMethod === 'cash') {
        // Find active POS session for this user to deduct cash
        const activeSession = await PosSession.findOne({ userId: req.user._id, status: 'open' });
        if (activeSession) {
            expense.posSessionId = activeSession._id;
            activeSession.cashExpenses += expense.amount;
            await activeSession.save();
        }
    }

    await expense.save();
    res.status(201).json({ success: true, data: expense });
});

export const getExpenses = asyncHandler(async (req, res) => {
    const { category, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total] = await Promise.all([
        Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(Number(limit)).populate('createdBy', 'firstName lastName'),
        Expense.countDocuments(filter)
    ]);

    res.json({
        success: true,
        count: expenses.length,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        data: expenses
    });
});

export const deleteExpense = asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) { res.status(404); throw new Error('Expense not found'); }

    if (expense.bankAccountId) {
        const bankAcc = await BankAccount.findById(expense.bankAccountId);
        if (bankAcc) {
            bankAcc.currentBalance = +(bankAcc.currentBalance + expense.amount).toFixed(2);
            await bankAcc.save();
        }
    }

    if (expense.paymentMethod === 'cash' && expense.posSessionId) {
        const session = await PosSession.findById(expense.posSessionId);
        if (session && session.status === 'open') {
            session.cashExpenses -= expense.amount;
            await session.save();
        }
    }

    expense.deletedAt = new Date();
    await expense.save();

    res.json({ success: true, message: 'Expense deleted' });
});

export const getExpenseCategories = asyncHandler(async (req, res) => {
    const categories = await Expense.distinct('category', { deletedAt: null });
    res.json({ success: true, data: categories.filter(Boolean).sort() });
});
