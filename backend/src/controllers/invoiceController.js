import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import SalesOrder from '../models/SalesOrder.js';
import CompanySettings from '../models/CompanySettings.js';

/**
 * Helper: recalculate customer credit balance
 */
const updateCustomerBalance = async (customerId, session) => {
    const result = await Invoice.aggregate([
        {
            $match: {
                customerId: new mongoose.Types.ObjectId(customerId),
                paymentStatus: { $in: ['unpaid', 'partially_paid', 'overdue'] },
                deletedAt: null,
            },
        },
        {
            $group: {
                _id: null,
                totalBalance: { $sum: '$balanceDue' },
                overdueAmount: {
                    $sum: {
                        $cond: [{ $in: ['$paymentStatus', ['overdue']] }, '$balanceDue', 0],
                    },
                },
            },
        },
    ]).session(session || null);

    const summary = result[0] || { totalBalance: 0, overdueAmount: 0 };

    const customer = await Customer.findById(customerId).session(session || null);
    if (customer) {
        customer.creditStatus.currentBalance = +summary.totalBalance.toFixed(2);
        customer.creditStatus.overdueAmount = +summary.overdueAmount.toFixed(2);
        customer.creditStatus.isOverdue = summary.overdueAmount > 0;
        customer.creditStatus.availableCredit = Math.max(
            0,
            (customer.paymentTerms?.creditLimit || 0) - customer.creditStatus.currentBalance
        );
        await customer.save({ session: session || undefined });
    }
};

/**
 * POST /api/invoices
 * Create manual invoice
 */
export const createInvoice = asyncHandler(async (req, res) => {
    const { customerId, items, dueDate, ...rest } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) { res.status(404); throw new Error('Customer not found'); }

    // Auto-calc due date if not provided
    let finalDueDate = dueDate;
    if (!finalDueDate && customer.paymentTerms?.type === 'credit') {
        const d = new Date(rest.invoiceDate || Date.now());
        d.setDate(d.getDate() + (customer.paymentTerms.creditDays || 0));
        finalDueDate = d;
    }

    const invoice = new Invoice({
        customerId: customer._id,
        customerSnapshot: {
            name: customer.displayName,
            code: customer.customerCode,
            taxRegistrationNumber: customer.taxRegistrationNumber,
            contactName: customer.primaryContact?.name,
        },
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddresses?.find((a) => a.isDefault) || customer.billingAddress,
        salesRepId: customer.assignedSalesRep,
        paymentTerms: {
            type: customer.paymentTerms?.type || 'cod',
            creditDays: customer.paymentTerms?.creditDays || 0,
        },
        dueDate: finalDueDate,
        items,
        ...rest,
        createdBy: req.user._id,
    });

    await invoice.save();
    await updateCustomerBalance(customer._id);

    const populated = await Invoice.findById(invoice._id)
        .populate('customerId', 'displayName customerCode')
        .populate('salesOrderIds', 'orderNumber');

    res.status(201).json({ success: true, data: populated });
});

/**
 * Core Logic: Generate an invoice from one or more delivered/approved sales orders
 */
export const generateInvoiceFromOrders = async ({
    salesOrderIds,
    invoiceDate,
    invoiceType = 'standard',
    notes,
    createdBy,
    status = 'approved',
    session,
}) => {
    const orders = await SalesOrder.find({
        _id: { $in: salesOrderIds },
        // POS orders might be 'approved' but not yet 'delivered' in the system sense, 
        // but for POS they are effectively delivered.
        status: { $in: ['approved', 'dispatched', 'delivered', 'completed'] },
    }).populate('customerId').session(session || null);

    if (orders.length === 0) {
        throw new Error('No valid orders found for invoicing');
    }

    const customer = orders[0].customerId;

    // Merge line items
    const invoiceItems = [];
    orders.forEach((order) => {
        order.items.forEach((orderItem) => {
            const qty = orderItem.deliveredQuantity || orderItem.orderedQuantity;
            if (qty <= 0) return;
            invoiceItems.push({
                productId: orderItem.productId,
                productCode: orderItem.productCode,
                productName: orderItem.productName,
                description: orderItem.description,
                quantity: qty,
                unitOfMeasure: orderItem.unitOfMeasure,
                unitPrice: orderItem.unitPrice,
                discountPercent: orderItem.discountPercent,
                taxRate: orderItem.taxRate,
                taxable: orderItem.taxable,
                salesOrderLineId: orderItem._id,
            });
        });
    });

    const d = new Date(invoiceDate || Date.now());
    if (customer.paymentTerms?.type === 'credit') {
        d.setDate(d.getDate() + (customer.paymentTerms.creditDays || 0));
    }

    const invoice = new Invoice({
        customerId: customer._id,
        customerSnapshot: {
            name: customer.displayName,
            code: customer.customerCode,
            taxRegistrationNumber: customer.taxRegistrationNumber,
            contactName: customer.primaryContact?.name,
            phone: customer.primaryContact?.phone,
        },
        billingAddress: customer.billingAddress,
        shippingAddress: orders[0].shippingAddress || customer.billingAddress,
        salesOrderIds: orders.map((o) => o._id),
        salesOrderNumbers: orders.map((o) => o.orderNumber),
        invoiceType,
        invoiceDate: invoiceDate || new Date(),
        dueDate: customer.paymentTerms?.type === 'credit' ? d : undefined,
        salesRepId: orders[0].salesRepId,
        paymentTerms: {
            type: customer.paymentTerms?.type || 'cod',
            creditDays: customer.paymentTerms?.creditDays || 0,
        },
        items: invoiceItems,
        orderDiscount: orders[0].orderDiscount,
        notes,
        status,
        createdBy,
    });

    await invoice.save({ session: session || undefined });

    // Update sales orders to "invoiced"
    for (const order of orders) {
        order.status = 'invoiced';
        await order.save({ session: session || undefined });
    }

    await updateCustomerBalance(customer._id, session);
    return invoice;
};

/**
 * POST /api/invoices/from-sales-order
 * Generate an invoice from one or more delivered sales orders
 */
export const createFromSalesOrder = asyncHandler(async (req, res) => {
    const { salesOrderIds, invoiceDate, invoiceType = 'standard', notes } = req.body;

    try {
        const invoice = await generateInvoiceFromOrders({
            salesOrderIds,
            invoiceDate,
            invoiceType,
            notes,
            createdBy: req.user._id,
        });

        const populated = await Invoice.findById(invoice._id)
            .populate('customerId', 'displayName customerCode')
            .populate('salesOrderIds', 'orderNumber');

        res.status(201).json({ success: true, data: populated });
    } catch (err) {
        res.status(400);
        throw new Error(err.message);
    }
});

/**
 * Helper to dynamically calculate and update aging details for unpaid invoices
 */
export const updateInvoiceAging = async () => {
    const unpaidInvoices = await Invoice.find({
        paymentStatus: { $in: ['unpaid', 'partially_paid', 'overdue'] },
        deletedAt: null
    });
    
    const now = new Date();
    const bulkOps = [];
    const customerIdsToUpdate = new Set();
    
    for (const inv of unpaidInvoices) {
        if (!inv.dueDate) continue;
        
        const daysPast = Math.floor((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
        const currentDaysPastDue = Math.max(0, daysPast);
        
        let currentPaymentStatus = inv.paymentStatus;
        if (currentDaysPastDue > 0 && inv.paymentStatus === 'unpaid') {
            currentPaymentStatus = 'overdue';
        }
        
        let currentAgingBucket = 'current';
        if (currentDaysPastDue === 0) currentAgingBucket = 'current';
        else if (currentDaysPastDue <= 30) currentAgingBucket = '1_30';
        else if (currentDaysPastDue <= 60) currentAgingBucket = '31_60';
        else if (currentDaysPastDue <= 90) currentAgingBucket = '61_90';
        else currentAgingBucket = '91_plus';
        
        if (inv.daysPastDue !== currentDaysPastDue || 
            inv.paymentStatus !== currentPaymentStatus || 
            inv.agingBucket !== currentAgingBucket) {
            
            bulkOps.push({
                updateOne: {
                    filter: { _id: inv._id },
                    update: {
                        $set: {
                            daysPastDue: currentDaysPastDue,
                            paymentStatus: currentPaymentStatus,
                            agingBucket: currentAgingBucket
                        }
                    }
                }
            });
            customerIdsToUpdate.add(inv.customerId.toString());
        }
    }
    
    if (bulkOps.length > 0) {
        await Invoice.bulkWrite(bulkOps);
        for (const cid of customerIdsToUpdate) {
            await updateCustomerBalance(cid);
        }
    }
};

/**
 * GET /api/invoices
 */
export const getInvoices = asyncHandler(async (req, res) => {
    await updateInvoiceAging();
    const {
        search, customerId, paymentStatus, status, agingBucket,
        startDate, endDate,
        page = 1, limit = 20,
        sortBy = 'invoiceDate', sortOrder = 'desc',
        salesOrderId
    } = req.query;

    const filter = {};
    if (search) {
        filter.$or = [
            { invoiceNumber: { $regex: search, $options: 'i' } },
            { 'customerSnapshot.name': { $regex: search, $options: 'i' } },
            { 'customerSnapshot.code': { $regex: search, $options: 'i' } },
        ];
    }
    if (customerId) filter.customerId = customerId;
    if (salesOrderId) filter.salesOrderIds = salesOrderId;
    if (paymentStatus) {
        // Support comma-separated values: "unpaid,partially_paid,overdue"
        const statuses = paymentStatus.split(',').map((s) => s.trim()).filter(Boolean);
        filter.paymentStatus = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (status) filter.status = status;
    if (agingBucket) filter.agingBucket = agingBucket;
    if (startDate || endDate) {
        filter.invoiceDate = {};
        if (startDate) filter.invoiceDate.$gte = new Date(startDate);
        if (endDate) filter.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [invoices, total] = await Promise.all([
        Invoice.find(filter)
            .populate('customerId', 'displayName customerCode')
            .populate('salesOrderIds', 'orderNumber')
            .sort(sortObj).skip(skip).limit(Number(limit)),
        Invoice.countDocuments(filter),
    ]);

    res.json({
        success: true,
        count: invoices.length, total,
        page: Number(page), totalPages: Math.ceil(total / Number(limit)),
        data: invoices,
    });
});

/**
 * GET /api/invoices/:id
 */
export const getInvoiceById = asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id)
        .populate('customerId', 'displayName customerCode taxRegistrationNumber primaryContact paymentTerms creditStatus')
        .populate('salesOrderIds', 'orderNumber orderDate')
        .populate('salesRepId', 'firstName lastName')
        .populate('createdBy', 'firstName lastName')
        .populate('cancelledBy', 'firstName lastName');
    if (!invoice) { res.status(404); throw new Error('Invoice not found'); }
    res.json({ success: true, data: invoice });
});

/**
 * GET /api/invoices/aging/summary
 * Accounts receivable aging summary
 */
export const getAgingSummary = asyncHandler(async (req, res) => {
    await updateInvoiceAging();
    const { customerId } = req.query;
    const match = {
        paymentStatus: { $in: ['unpaid', 'partially_paid', 'overdue'] },
        deletedAt: null,
    };
    if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);

    const aggregation = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$agingBucket',
                count: { $sum: 1 },
                total: { $sum: '$balanceDue' },
            },
        },
    ]);

    const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '91_plus': 0 };
    const counts = { ...buckets };
    aggregation.forEach((row) => {
        if (row._id in buckets) {
            buckets[row._id] = row.total;
            counts[row._id] = row.count;
        }
    });

    const totalOutstanding = Object.values(buckets).reduce((s, v) => s + v, 0);

    res.json({
        success: true,
        data: { buckets, counts, totalOutstanding },
    });
});

/**
 * PATCH /api/invoices/:id/status
 */
export const changeInvoiceStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) { res.status(404); throw new Error('Invoice not found'); }

    const allowed = {
        draft: ['approved', 'cancelled'],
        approved: ['sent', 'cancelled'],
        sent: ['viewed', 'cancelled'],
        viewed: ['cancelled'],
        paid: ['void'],
    };

    if (!allowed[invoice.status]?.includes(status)) {
        res.status(400);
        throw new Error(`Cannot change status from '${invoice.status}' to '${status}'`);
    }

    invoice.status = status;
    invoice.updatedBy = req.user._id;

    if (status === 'sent') invoice.sentAt = new Date();
    if (status === 'cancelled') {
        invoice.cancelledBy = req.user._id;
        invoice.cancelledAt = new Date();
        invoice.cancellationReason = reason;
        invoice.paymentStatus = 'cancelled';
    }

    await invoice.save();
    await updateCustomerBalance(invoice.customerId);

    res.json({ success: true, data: invoice });
});

/**
 * DELETE /api/invoices/:id
 */
export const deleteInvoice = asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) { res.status(404); throw new Error('Invoice not found'); }
    if (invoice.status !== 'draft') {
        res.status(400); throw new Error('Only draft invoices can be deleted');
    }
    invoice.deletedAt = new Date();
    await invoice.save();
    res.json({ success: true, data: invoice });
});

/**
 * GET /api/invoices/:id/print-json (Public route for Bluetooth Print app)
 */
export const getInvoicePrintJson = asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
    }

    const settings = (await CompanySettings.findOne()) || {
        companyName: 'RC TRADERS',
        address: 'Colombo, Sri Lanka',
        phone: '+94 11 XXX XXXX',
        receiptFooterMessage: 'THANK YOU FOR YOUR BUSINESS!\nPLEASE VISIT AGAIN.'
    };

    const printSequence = [];

    // Helper: push text command
    const addText = (content, bold = 0, align = 0, format = 0) => {
        printSequence.push({
            type: 0, // text
            content: content || ' ',
            bold,
            align,
            format
        });
    };

    // Helper: format two-column text (default width 32 characters for 58mm/80mm safety)
    const formatLine = (left, right, width = 32) => {
        const spaces = width - left.length - right.length;
        if (spaces > 0) {
            return left + ' '.repeat(spaces) + right;
        }
        return left + ' ' + right;
    };

    // 1. Company Info Header
    addText(settings.companyName, 1, 1, 3); // Bold, Centered, Double Width
    if (settings.address) {
        addText(settings.address, 0, 1, 0);
    }
    if (settings.phone) {
        addText(`TEL: ${settings.phone}`, 0, 1, 0);
    }
    if (settings.email) {
        addText(settings.email, 0, 1, 0);
    }
    if (settings.taxRegistrationNumber) {
        addText(`VAT NO: ${settings.taxRegistrationNumber}`, 1, 1, 0);
    }

    addText('================================', 0, 1, 0);

    // 2. Receipt metadata
    addText(formatLine('Receipt No:', invoice.invoiceNumber || ''), 1, 0, 0);
    
    const dateStr = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleString('en-LK', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';
    addText(formatLine('Date:', dateStr), 0, 0, 0);

    const customer = invoice.customerSnapshot || {};
    if (customer.name) {
        addText(formatLine('Customer:', customer.name), 1, 0, 0);
    }
    if (customer.phone) {
        addText(formatLine('Contact:', customer.phone), 0, 0, 0);
    }

    addText('--------------------------------', 0, 1, 0);

    // 3. Item headers
    addText(formatLine('Description', 'Amount'), 1, 0, 0);
    addText('--------------------------------', 0, 1, 0);

    // 4. Line items
    const items = invoice.items || [];
    items.forEach((item) => {
        // Product Name (bold)
        addText(item.productName, 1, 0, 0);
        // Quantity x Price and lineTotal
        const qtyStr = `  ${item.quantity} x ${item.unitPrice.toFixed(2)}`;
        const totalStr = item.lineTotal.toFixed(2);
        addText(formatLine(qtyStr, totalStr), 0, 0, 0);
        
        if (item.discountPercent > 0) {
            addText(`    Disc: ${item.discountPercent}% (-${item.lineDiscount.toFixed(2)})`, 0, 0, 4); // small
        }
    });

    addText('--------------------------------', 0, 1, 0);

    // 5. Totals
    addText(formatLine('Subtotal', invoice.subtotal.toFixed(2)), 0, 0, 0);
    
    const discount = (invoice.totalDiscount || 0) + (invoice.orderDiscount?.amount || 0);
    if (discount > 0) {
        addText(formatLine('Discount', `-${discount.toFixed(2)}`), 0, 0, 0);
    }
    if (invoice.totalTax > 0) {
        addText(formatLine('Tax', invoice.totalTax.toFixed(2)), 0, 0, 0);
    }

    addText('================================', 0, 1, 0);
    addText(formatLine('TOTAL', invoice.grandTotal.toFixed(2)), 1, 0, 1); // double height
    addText(formatLine('Paid Amount', invoice.grandTotal.toFixed(2)), 1, 0, 0);

    if (invoice.cashReceived !== undefined && invoice.cashReceived > 0) {
        addText(formatLine('Cash Received', invoice.cashReceived.toFixed(2)), 0, 0, 0);
    }
    if (invoice.changeReturned !== undefined && invoice.changeReturned > 0) {
        addText(formatLine('Change Returned', invoice.changeReturned.toFixed(2)), 0, 0, 0);
    }
    
    addText(formatLine('Balance Due', (invoice.balanceDue || 0).toFixed(2)), 1, 0, 0);

    addText('================================', 0, 1, 0);

    // 6. Footer
    if (settings.receiptFooterMessage) {
        settings.receiptFooterMessage.split('\n').forEach((line) => {
            addText(line.trim(), 1, 1, 0);
        });
    }

    addText(' ', 0, 1, 0); // Spacing before barcode/QR code

    // 7. QR Code for the Invoice Number
    printSequence.push({
        type: 3, // QR Code
        value: invoice.invoiceNumber,
        size: 40,
        align: 1 // center
    });

    // Convert print sequence array to key-indexed object (matches PHP forced object)
    const forceObject = {};
    printSequence.forEach((item, index) => {
        forceObject[index.toString()] = item;
    });

    res.json(forceObject);
});

// Exported for use by payments module
export { updateCustomerBalance };