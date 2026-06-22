import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

export const createProduct = asyncHandler(async (req, res) => {
    const product = await Product.create({
        ...req.body,
        createdBy: req.user._id,
    });

    // Automatically create a StockItem entry for the default warehouse (or first warehouse)
    // so it shows up in the Stock Overview even with 0 stock.
    try {
        const Warehouse = mongoose.model('Warehouse');
        const StockItem = mongoose.model('StockItem');
        const defaultWh = await Warehouse.findOne({ isDefault: true }) || await Warehouse.findOne();
        
        if (defaultWh) {
            await StockItem.create({
                productId: product._id,
                warehouseId: defaultWh._id,
                productCode: product.productCode,
                productName: product.name,
                unitOfMeasure: product.unitOfMeasure,
                quantities: { onHand: 0, reserved: 0 },
                totalValue: 0
            });
        }
    } catch (err) {
        console.error('Initial stock record creation failed:', err);
    }

    const populated = await Product.findById(product._id)
        .populate('categoryId', 'name code')
        .populate('brandId', 'name');

    res.status(201).json({ success: true, data: populated });
});

export const getProducts = asyncHandler(async (req, res) => {
    const {
        search,
        categoryId,
        brandId,
        status,
        type,
        minPrice,
        maxPrice,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { shortName: { $regex: search, $options: 'i' } },
            { productCode: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { barcode: { $regex: search, $options: 'i' } },
        ];
    }

    if (categoryId) filter.categoryId = categoryId;
    if (brandId) filter.brandId = brandId;
    if (status) filter.status = status;
    if (type) filter.type = type;

    if (minPrice || maxPrice) {
        filter.basePrice = {};
        if (minPrice) filter.basePrice.$gte = Number(minPrice);
        if (maxPrice) filter.basePrice.$lte = Number(maxPrice);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate('categoryId', 'name code')
            .populate('brandId', 'name')
            .sort(sortObj)
            .skip(skip)
            .limit(Number(limit)),
        Product.countDocuments(filter),
    ]);

    res.json({
        success: true,
        count: products.length,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        data: products,
    });
});

export const getProductById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('categoryId', 'name code')
        .populate('brandId', 'name')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName');

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }
    res.json({ success: true, data: product });
});

export const updateProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    // Update fields
    Object.assign(product, req.body);
    product.updatedBy = req.user._id;

    await product.save();

    const populated = await Product.findById(product._id)
        .populate('categoryId', 'name code')
        .populate('brandId', 'name');

    // Sync denormalized fields in StockItems
    try {
        const StockItem = mongoose.model('StockItem');
        await StockItem.updateMany(
            { productId: populated._id },
            { 
                productName: populated.name,
                productCode: populated.productCode,
                unitOfMeasure: populated.unitOfMeasure
            }
        );
    } catch (err) {
        console.error('StockItem sync failed:', err);
    }

    res.json({ success: true, data: populated });
});

export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }
    product.deletedAt = new Date();
    product.status = 'inactive';
    await product.save();
    res.json({ success: true, message: 'Product deleted' });
});