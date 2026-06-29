import express from 'express';
import {
    createInvoice, createFromSalesOrder, getInvoices, getInvoiceById,
    getAgingSummary, changeInvoiceStatus, deleteInvoice, getInvoicePrintJson,
} from '../controllers/invoiceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import {
    createInvoiceSchema, updateInvoiceSchema, createFromSalesOrderSchema,
} from '../validators/invoiceValidator.js';

const router = express.Router();

// Public endpoint accessed by the external Bluetooth Print Android app
router.get('/:id/print-json', getInvoicePrintJson);

router.use(protect);

router.get('/aging/summary', getAgingSummary);

router
    .route('/')
    .get(getInvoices)
    .post(
        authorize('admin', 'manager', 'accountant', 'sales_manager'),
        validate(createInvoiceSchema),
        createInvoice
    );

router.post(
    '/from-sales-order',
    authorize('admin', 'manager', 'accountant', 'sales_manager'),
    validate(createFromSalesOrderSchema),
    createFromSalesOrder
);

router
    .route('/:id')
    .get(getInvoiceById)
    .delete(authorize('admin', 'manager', 'accountant'), deleteInvoice);

router.patch(
    '/:id/status',
    authorize('admin', 'manager', 'accountant', 'sales_manager'),
    changeInvoiceStatus
);

export default router;