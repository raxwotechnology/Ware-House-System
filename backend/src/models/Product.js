import mongoose from 'mongoose';
import { getNextSequence } from './Counter.js';

const productSchema = new mongoose.Schema(
    {
        productCode: {
            type: String,
            unique: true,
            trim: true,
            uppercase: true,
        },
        sku: {
            type: String,
            trim: true,
            sparse: true, // allows multiple nulls but enforces uniqueness when present
            uppercase: true,
        },
        barcode: {
            type: String,
            trim: true,
            sparse: true,
        },

        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            maxlength: 200,
        },
        productType: {
            type: String,
            enum: ['finished_good', 'raw_material', 'semi_finished', 'packaging', 'service', 'consumable'],
            default: 'finished_good',
        },
        canBeManufactured: { type: Boolean, default: false },
        canBePurchased: { type: Boolean, default: true },
        canBeSold: { type: Boolean, default: true },
        shortName: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 2000,
        },

        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, 'Category is required'],
        },
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
        },
        tags: [{ type: String, trim: true }],

        type: {
            type: String,
            enum: ['manufactured', 'trading', 'service', 'bundle'],
            default: 'trading',
        },

        productNature: {
            type: String,
            enum: ['single', 'variable', 'combo'],
            default: 'single',
        },

        variations: [
            {
                sku: String,
                name: String,
                barcode: String,
                attributeName: String, // e.g., Color
                attributeValue: String, // e.g., Red
                price: { type: Number, min: 0 },
                purchasePrice: { type: Number, min: 0, default: 0 },
                stock: { type: Number, default: 0 },
            },
        ],

        comboItems: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                quantity: { type: Number, default: 1 },
                priceContribution: { type: Number, default: 0 },
            },
        ],

        unitOfMeasure: {
            type: String,
            required: [true, 'Unit of measure is required'],
            trim: true,
        },

        // Pricing — LKR only for MVP
        basePrice: {
            type: Number,
            required: [true, 'Base price is required'],
            min: 0,
        },
        purchasePrice: {
            type: Number,
            default: 0,
            min: 0,
        },
        mrp: {
            type: Number,
            min: 0,
        },
        callPrice: {
            type: Number,
            min: 0,
        },
        callPriceUpdatedAt: {
            type: Date,
        },
        currency: {
            type: String,
            default: 'LKR',
        },

        // Tiered wholesale pricing (optional)
        tierPricing: [
            {
                tierName: { type: String, trim: true },
                minQuantity: { type: Number, min: 0 },
                maxQuantity: { type: Number },
                price: { type: Number, min: 0 },
            },
        ],

        // Tax
        tax: {
            taxable: { type: Boolean, default: true },
            taxRate: { type: Number, default: 18, min: 0, max: 100 }, // SL VAT default 18%
            hsCode: { type: String, trim: true },
        },

        // Cost tracking
        costs: {
            lastPurchaseCost: { type: Number, default: 0, min: 0 },
            averageCost: { type: Number, default: 0, min: 0 },
            standardCost: { type: Number, default: 0, min: 0 },
        },

        // Stock rules
        stockLevels: {
            minimumLevel: { type: Number, default: 0, min: 0 },
            reorderLevel: { type: Number, default: 0, min: 0 },
            maximumLevel: { type: Number, default: 0, min: 0 },
        },

        // Packaging
        packaging: {
            unitsPerCarton: { type: Number, min: 0 },
            cartonsPerPallet: { type: Number, min: 0 },
        },

        // Sales configuration
        salesConfig: {
            sellable: { type: Boolean, default: true },
            minimumOrderQuantity: { type: Number, default: 1, min: 0 },
            allowBackorder: { type: Boolean, default: false },
        },

        status: {
            type: String,
            enum: ['active', 'inactive', 'draft', 'discontinued'],
            default: 'active',
        },

        notes: { type: String, trim: true, maxlength: 1000 },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for performance
productSchema.index({ name: 'text', shortName: 'text', sku: 'text', productCode: 'text' });
productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ brandId: 1, status: 1 });
productSchema.index({ status: 1 });

// Auto-generate productCode before saving
productSchema.pre('save', async function () {
    if (this.isNew && !this.productCode) {
        const seq = await getNextSequence('product');
        this.productCode = `PRD-${seq}`;
    }

    if (this.isModified('callPrice')) {
        this.callPriceUpdatedAt = new Date();
    }
});

// Auto-filter soft-deleted
productSchema.pre(/^find/, function () {
    if (!this.getOptions().includeDeleted) {
        this.where({ deletedAt: null });
    }
});

const Product = mongoose.model('Product', productSchema);
export default Product;