import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import GoodsReceiptNote from '../models/GoodsReceiptNote.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import { increaseStock, decreaseStock } from '../services/stockService.js';

/**
 * Create a GRN — receives goods and increases stock atomically.
 */
export const createGrn = asyncHandler(async (req, res) => {
    const { purchaseOrderId, supplierId, warehouseId, items, ...rest } = req.body;

    let po = null;
    if (purchaseOrderId) {
        po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) { res.status(404); throw new Error('Purchase order not found'); }
        if (!['approved', 'sent', 'partially_received'].includes(po.status)) {
            res.status(400);
            throw new Error(`Cannot receive against PO with status '${po.status}'`);
        }
    }

    if (!po && !supplierId) {
        res.status(400);
        throw new Error('Supplier ID is required for GRN without Purchase Order');
    }

    // Validate items against PO if available
    const poItemsMap = po ? new Map(po.items.map((i) => [i._id.toString(), i])) : null;

    const session = await mongoose.startSession();
    let grn;

    try {
        await session.withTransaction(async () => {
            // Build GRN line items
            const grnItems = items.map((item) => {
                const poLine = (po && item.poLineItemId) ? poItemsMap.get(item.poLineItemId) : null;
                const accepted = item.acceptedQuantity ?? item.receivedQuantity;

                return {
                    poLineItemId: item.poLineItemId,
                    productId: item.productId,
                    productCode: item.productCode || poLine?.productCode || '',
                    productName: item.productName || poLine?.productName || '',
                    orderedQuantity: poLine?.orderedQuantity || 0,
                    receivedQuantity: item.receivedQuantity,
                    acceptedQuantity: accepted,
                    rejectedQuantity: item.rejectedQuantity || 0,
                    damagedQuantity: item.damagedQuantity || 0,
                    discountPercent: item.discountPercent || 0,
                    discountAmount: item.discountAmount || 0,
                    freeQuantity: item.freeQuantity || 0,
                    unitOfMeasure: item.unitOfMeasure || poLine?.unitOfMeasure || '',
                    unitPrice: item.unitPrice || poLine?.unitPrice || 0,
                    batchNumber: item.batchNumber || null,
                    manufactureDate: item.manufactureDate || null,
                    expiryDate: item.expiryDate || null,
                    rejectionReason: item.rejectionReason,
                    notes: item.notes,
                    qcStatus: item.rejectionReason || item.rejectedQuantity > 0 ? 'failed' : 'not_required',
                };
            });

            grn = new GoodsReceiptNote({
                purchaseOrderId: po?._id,
                poNumber: po?.poNumber,
                supplierId: po?.supplierId || supplierId,
                supplierName: po?.supplierSnapshot?.name || rest.supplierName,
                warehouseId,
                items: grnItems,
                status: 'received',
                receivedBy: req.user._id,
                createdBy: req.user._id,
                ...rest,
            });

            await grn.save({ session });

            // Calculate total raw accepted value first (to distribute fixed discount)
            const rawAcceptedValue = grn.items.reduce((s, i) => {
                const qty = i.acceptedQuantity || i.receivedQuantity || 0;
                const lineTotal = qty * i.unitPrice;
                const lineDisc = i.discountAmount || (lineTotal * (i.discountPercent || 0) / 100);
                return s + Math.max(0, lineTotal - lineDisc);
            }, 0);

            // Increase stock for each accepted item
            for (const grnItem of grn.items) {
                const qtyToStock = grnItem.acceptedQuantity + (grnItem.freeQuantity || 0);
                if (qtyToStock <= 0) continue;

                const lineTotal = grnItem.acceptedQuantity * grnItem.unitPrice;
                const lineDiscount = grnItem.discountAmount || (lineTotal * (grnItem.discountPercent || 0) / 100);
                const rawLineCost = Math.max(0, lineTotal - lineDiscount);

                let finalLineCost = rawLineCost;
                if (grn.billDiscountPercent > 0) {
                    finalLineCost = rawLineCost - (rawLineCost * grn.billDiscountPercent / 100);
                }
                if (grn.billDiscountAmount > 0 && rawAcceptedValue > 0) {
                    const proportionalDiscount = grn.billDiscountAmount * (rawLineCost / rawAcceptedValue);
                    finalLineCost = rawLineCost - proportionalDiscount;
                }
                finalLineCost = Math.max(0, finalLineCost);

                const effectiveCostPerUnit = finalLineCost / qtyToStock;

                const result = await increaseStock({
                    productId: grnItem.productId,
                    warehouseId,
                    quantity: qtyToStock,
                    costPerUnit: effectiveCostPerUnit,
                    movementType: 'purchase_receipt',
                    batchNumber: grnItem.batchNumber || null,
                    sourceDocument: {
                        type: 'purchase_receipt',
                        id: grn._id,
                        number: grn.grnNumber,
                    },
                    reason: po ? `GRN against PO ${po.poNumber}` : 'GRN (direct)',
                    userId: req.user._id,
                    session,
                });

                // Link the movement
                grnItem.stockMovementId = result.movement._id;
            }

            await grn.save({ session });

            // Update PO: increment received quantities on lines
            if (po) {
                for (const grnItem of grn.items) {
                    if (!grnItem.poLineItemId) continue;
                    const poLine = po.items.id(grnItem.poLineItemId);
                    if (poLine) {
                        poLine.receivedQuantity = (poLine.receivedQuantity || 0) + grnItem.acceptedQuantity;
                    }
                }
                po.grns = [...(po.grns || []), grn._id];
                await po.save({ session });
            }
        });

        const populated = await GoodsReceiptNote.findById(grn._id)
            .populate('purchaseOrderId', 'poNumber')
            .populate('supplierId', 'displayName supplierCode')
            .populate('warehouseId', 'name warehouseCode')
            .populate('items.productId', 'name productCode');

        res.status(201).json({ success: true, message: 'Goods received and stock updated', data: populated });
    } catch (err) {
        res.status(400);
        throw new Error(err.message || 'Failed to create GRN');
    } finally {
        session.endSession();
    }
});

export const getGrns = asyncHandler(async (req, res) => {
    const {
        search, purchaseOrderId, supplierId, warehouseId, status,
        page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (search) filter.grnNumber = { $regex: search, $options: 'i' };
    if (purchaseOrderId) filter.purchaseOrderId = purchaseOrderId;
    if (supplierId) filter.supplierId = supplierId;
    if (warehouseId) filter.warehouseId = warehouseId;
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [grns, total] = await Promise.all([
        GoodsReceiptNote.find(filter)
            .populate('purchaseOrderId', 'poNumber')
            .populate('supplierId', 'displayName supplierCode')
            .populate('warehouseId', 'name warehouseCode')
            .sort({ receiptDate: -1 })
            .skip(skip).limit(Number(limit)),
        GoodsReceiptNote.countDocuments(filter),
    ]);

    res.json({
        success: true,
        count: grns.length, total,
        page: Number(page), totalPages: Math.ceil(total / Number(limit)),
        data: grns,
    });
});

export const getGrnById = asyncHandler(async (req, res) => {
    const grn = await GoodsReceiptNote.findById(req.params.id)
        .populate('purchaseOrderId', 'poNumber poDate')
        .populate('supplierId', 'displayName supplierCode')
        .populate('warehouseId', 'name warehouseCode')
        .populate('items.productId', 'name productCode')
        .populate('items.stockMovementId', 'movementNumber')
        .populate('receivedBy', 'firstName lastName')
        .populate('createdBy', 'firstName lastName');
    if (!grn) { res.status(404); throw new Error('GRN not found'); }
    res.json({ success: true, data: grn });
});

/**
 * Cancel a GRN — reverses stock increase and updates linked PO.
 */
export const cancelGrn = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const grn = await GoodsReceiptNote.findById(req.params.id).session(session);
            if (!grn) throw new Error('GRN not found');
            if (grn.status === 'cancelled') throw new Error('GRN already cancelled');

            // 1. Decrease stock for each accepted item in the GRN
            for (const grnItem of grn.items) {
                const qtyToStock = grnItem.acceptedQuantity + (grnItem.freeQuantity || 0);
                if (qtyToStock <= 0) continue;

                await decreaseStock({
                    productId: grnItem.productId,
                    warehouseId: grn.warehouseId,
                    quantity: qtyToStock,
                    movementType: 'adjustment_out', // Or 'grn_cancellation'
                    batchNumber: grnItem.batchNumber || null,
                    sourceDocument: {
                        type: 'grn_cancellation',
                        id: grn._id,
                        number: grn.grnNumber,
                    },
                    reason: `Cancellation of GRN ${grn.grnNumber}`,
                    userId: req.user._id,
                    session,
                });
            }

            // 2. Revert PO received quantities if linked
            if (grn.purchaseOrderId) {
                const po = await PurchaseOrder.findById(grn.purchaseOrderId).session(session);
                if (po) {
                    for (const grnItem of grn.items) {
                        if (!grnItem.poLineItemId) continue;
                        const poLine = po.items.id(grnItem.poLineItemId);
                        if (poLine) {
                            poLine.receivedQuantity = Math.max(0, (poLine.receivedQuantity || 0) - grnItem.acceptedQuantity);
                        }
                    }
                    // Remove this GRN from PO's list? Or keep it with cancelled status?
                    // Usually we keep the link.
                    await po.save({ session });
                }
            }

            grn.status = 'cancelled';
            grn.cancelledAt = new Date();
            grn.cancelledBy = req.user._id;
            await grn.save({ session });
        });

        res.json({ success: true, message: 'GRN cancelled and stock reversed' });
    } catch (err) {
        res.status(400);
        throw new Error(err.message || 'Failed to cancel GRN');
    } finally {
        session.endSession();
    }
});