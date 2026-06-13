import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Bill from '../models/Bill.js';
import Customer from '../models/Customer.js';
import Cheque from '../models/Cheque.js';
import BankAccount from '../models/BankAccount.js';
import { updateCustomerBalance } from './invoiceController.js';

/**
 * POST /api/payments
 * Record a payment (received from customer or paid to supplier)
 */
export const createPayment = asyncHandler(async (req, res) => {
    const { direction, customerId, supplierId, allocations = [], ...rest } = req.body;

    if (direction === 'received' && !customerId) {
        res.status(400); throw new Error('customerId required for received payments');
    }
    if (direction === 'paid' && !supplierId) {
        res.status(400); throw new Error('supplierId required for paid payments');
    }

    const session = await mongoose.startSession();
    let payment;

    try {
        await session.withTransaction(async () => {
            // Validate & adjust allocations
            for (const alloc of allocations) {
                if (alloc.documentType === 'invoice') {
                    const inv = await Invoice.findById(alloc.documentId).session(session);
                    if (!inv) throw new Error(`Invoice ${alloc.documentId} not found`);
                    if (alloc.amount > inv.balanceDue) {
                        throw new Error(`Cannot allocate ${alloc.amount} to invoice ${inv.invoiceNumber}, balance is ${inv.balanceDue}`);
                    }
                    alloc.documentNumber = inv.invoiceNumber;
                } else if (alloc.documentType === 'bill') {
                    const bill = await Bill.findById(alloc.documentId).session(session);
                    if (!bill) throw new Error(`Bill ${alloc.documentId} not found`);
                    if (alloc.amount > bill.balanceDue) {
                        throw new Error(`Cannot allocate ${alloc.amount} to bill ${bill.billNumber}, balance is ${bill.balanceDue}`);
                    }
                    alloc.documentNumber = bill.billNumber;
                }
            }

            // Get party name
            let partyName = '';
            if (direction === 'received') {
                const c = await Customer.findById(customerId).session(session);
                partyName = c?.displayName;
            } else {
                const Supplier = (await import('../models/Supplier.js')).default;
                const s = await Supplier.findById(supplierId).session(session);
                partyName = s?.displayName;
            }

            payment = new Payment({
                direction,
                customerId: direction === 'received' ? customerId : undefined,
                supplierId: direction === 'paid' ? supplierId : undefined,
                partyName,
                allocations,
                receivedBy: req.user._id,
                createdBy: req.user._id,
                ...rest,
            });

            await payment.save({ session });

            // Apply allocations to invoices/bills
            for (const alloc of allocations) {
                if (alloc.documentType === 'invoice') {
                    const inv = await Invoice.findById(alloc.documentId).session(session);
                    inv.amountPaid = +(inv.amountPaid + alloc.amount).toFixed(2);
                    inv.lastPaymentDate = payment.paymentDate;
                    await inv.save({ session });
                } else if (alloc.documentType === 'bill') {
                    const bill = await Bill.findById(alloc.documentId).session(session);
                    bill.amountPaid = +(bill.amountPaid + alloc.amount).toFixed(2);
                    bill.lastPaymentDate = payment.paymentDate;
                    await bill.save({ session });
                }
            }

            // Update customer balance if received
            if (direction === 'received') {
                await updateCustomerBalance(customerId, session);
            }

            // --- LINKING LOGIC ---

            // 1. If Cheque, create Cheque record
            if (rest.method === 'cheque') {
                const cheque = new Cheque({
                    chequeNumber: rest.chequeNumber,
                    chequeDate: rest.chequeDate,
                    amount: rest.amount,
                    bankName: rest.bankName,
                    direction: direction === 'received' ? 'incoming' : 'outgoing',
                    payeeName: partyName,
                    paymentId: payment._id,
                    customerId: direction === 'received' ? customerId : undefined,
                    supplierId: direction === 'paid' ? supplierId : undefined,
                    createdBy: req.user._id,
                    status: 'pending',
                    notes: `Created from payment ${payment.paymentNumber}`
                });
                await cheque.save({ session });
            }

            // 2. If Bank Transfer / Direct Payment via Bank, update balance
            if (rest.bankAccountId && (rest.method === 'bank_transfer' || rest.method === 'card' || rest.method === 'mobile_wallet')) {
                const bankAcc = await BankAccount.findById(rest.bankAccountId).session(session);
                if (bankAcc) {
                    const amountChange = direction === 'received' ? rest.amount : -rest.amount;
                    bankAcc.currentBalance = +(bankAcc.currentBalance + amountChange).toFixed(2);
                    await bankAcc.save({ session });
                }
            }
        });

        const populated = await Payment.findById(payment._id)
            .populate('customerId', 'displayName customerCode')
            .populate('supplierId', 'displayName supplierCode')
            .populate('bankAccountId', 'accountName bankName');

        res.status(201).json({ success: true, data: populated });
    } catch (err) {
        res.status(400);
        throw new Error(err.message || 'Failed to create payment');
    } finally {
        session.endSession();
    }
});

export const getPayments = asyncHandler(async (req, res) => {
    const {
        direction, customerId, supplierId, method, status,
        startDate, endDate,
        page = 1, limit = 20,
    } = req.query;

    const { documentId } = req.query;

    const filter = {};
    if (direction) filter.direction = direction;
    if (customerId) filter.customerId = customerId;
    if (documentId) {
        filter['allocations.documentId'] = documentId;
    }
    if (supplierId) filter.supplierId = supplierId;
    if (method) filter.method = method;
    if (status) filter.status = status;
    if (startDate || endDate) {
        filter.paymentDate = {};
        if (startDate) filter.paymentDate.$gte = new Date(startDate);
        if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [payments, total] = await Promise.all([
        Payment.find(filter)
            .populate('customerId', 'displayName customerCode')
            .populate('supplierId', 'displayName supplierCode')
            .populate('receivedBy', 'firstName lastName')
            .sort({ paymentDate: -1 }).skip(skip).limit(Number(limit)),
        Payment.countDocuments(filter),
    ]);

    res.json({
        success: true,
        count: payments.length, total,
        page: Number(page), totalPages: Math.ceil(total / Number(limit)),
        data: payments,
    });
});

export const getPaymentById = asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.id)
        .populate('customerId', 'displayName customerCode')
        .populate('supplierId', 'displayName supplierCode')
        .populate('receivedBy', 'firstName lastName')
        .populate('bankAccountId', 'accountName bankName')
        .populate('createdBy', 'firstName lastName');
    if (!payment) { res.status(404); throw new Error('Payment not found'); }
    res.json({ success: true, data: payment });
});

/**
 * DELETE /api/payments/:id
 * Delete (soft delete) a payment and reverse all its effects
 */
export const deletePayment = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const payment = await Payment.findById(req.params.id).session(session);
            if (!payment) throw new Error('Payment not found');
            if (payment.deletedAt) throw new Error('Payment already deleted');

            // 1. Reverse Allocations
            for (const alloc of payment.allocations) {
                if (alloc.documentType === 'invoice') {
                    const inv = await Invoice.findById(alloc.documentId).session(session);
                    if (inv) {
                        inv.amountPaid = +(inv.amountPaid - alloc.amount).toFixed(2);
                        await inv.save({ session });
                    }
                } else if (alloc.documentType === 'bill') {
                    const bill = await Bill.findById(alloc.documentId).session(session);
                    if (bill) {
                        bill.amountPaid = +(bill.amountPaid - alloc.amount).toFixed(2);
                        await bill.save({ session });
                    }
                }
            }

            // 2. Reverse Bank Balance (if bankAccountId is present)
            if (payment.bankAccountId) {
                const bankAcc = await BankAccount.findById(payment.bankAccountId).session(session);
                if (bankAcc) {
                    const amountChange = payment.direction === 'received' ? -payment.amount : payment.amount;
                    bankAcc.currentBalance = +(bankAcc.currentBalance + amountChange).toFixed(2);
                    await bankAcc.save({ session });
                }
            }

            // 3. Delete/Cancel Linked Cheque
            if (payment.method === 'cheque') {
                const Cheque = (await import('../models/Cheque.js')).default;
                const cheque = await Cheque.findOne({ paymentId: payment._id }).session(session);
                if (cheque) {
                    // If cheque was already cleared, reverse that too!
                    if (cheque.status === 'cleared' && cheque.depositedBankAccountId) {
                        const bankAcc = await BankAccount.findById(cheque.depositedBankAccountId).session(session);
                        if (bankAcc) {
                            const amountChange = cheque.direction === 'incoming' ? -cheque.amount : cheque.amount;
                            bankAcc.currentBalance = +(bankAcc.currentBalance + amountChange).toFixed(2);
                            await bankAcc.save({ session });
                        }
                    }
                    cheque.status = 'cancelled';
                    cheque.deletedAt = new Date();
                    await cheque.save({ session });
                }
            }

            // 4. Update Customer Balance
            if (payment.direction === 'received' && payment.customerId) {
                await updateCustomerBalance(payment.customerId, session);
            }

            // 5. Soft Delete Payment
            payment.deletedAt = new Date();
            payment.status = 'cancelled';
            await payment.save({ session });
        });

        res.json({ success: true, message: 'Payment deleted and effects reversed' });
    } catch (err) {
        res.status(400);
        throw new Error(err.message || 'Failed to delete payment');
    } finally {
        session.endSession();
    }
});