import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { productFormSchema } from './productSchemas';
import { useCategories, useBrands, useUoms, useCreateProduct, useUpdateProduct, useProducts } from './useProducts';

const tabs = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'variations', label: 'Variations' },
    { id: 'combo', label: 'Combo Items' },
    { id: 'pricing', label: 'Pricing & Tax' },
    { id: 'tiers', label: 'Wholesale Tiers' },
    { id: 'stock', label: 'Stock & Packaging' },
    { id: 'sales', label: 'Sales Config' },
];

export default function ProductFormModal({ isOpen, onClose, product = null }) {
    const [activeTab, setActiveTab] = useState('basic');
    const isEdit = !!product;

    const { data: categoriesData } = useCategories();
    const { data: brandsData } = useBrands();
    const { data: uomsData } = useUoms();
    const { data: allProductsData } = useProducts({ limit: 1000, status: 'active' });
    const createProduct = useCreateProduct();
    const updateProduct = useUpdateProduct();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        control,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(productFormSchema),
        defaultValues: {
            type: 'trading',
            status: 'active',
            taxable: true,
            taxRate: 18,
            sellable: true,
            allowBackorder: false,
            minimumOrderQuantity: 1,
            productNature: 'single',
            variations: [],
            comboItems: [],
            buyingPrice: 0,
            profitPercentage: 0,
            basePrice: 0,
            tierPricing: [],
        },
    });

    const { fields: tierFields, append: appendTier, remove: removeTier } = useFieldArray({
        control,
        name: 'tierPricing',
    });

    const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({
        control,
        name: 'variations',
    });

    const { fields: comboFields, append: appendCombo, remove: removeCombo } = useFieldArray({
        control,
        name: 'comboItems',
    });

    // When opening in edit mode, populate form
    useEffect(() => {
        if (isOpen && product) {
            reset({
                name: product.name || '',
                shortName: product.shortName || '',
                sku: product.sku || '',
                barcode: product.barcode || '',
                productType: product.productType || 'finished_good',
                canBeSold: product.canBeSold ?? true,
                canBePurchased: product.canBePurchased ?? true,
                canBeManufactured: product.canBeManufactured ?? false,
                description: product.description || '',
                categoryId: product.categoryId?._id || product.categoryId || '',
                brandId: product.brandId?._id || product.brandId || '',
                type: product.type || 'trading',
                unitOfMeasure: product.unitOfMeasure || '',
                basePrice: product.basePrice || 0,
                mrp: product.mrp || 0,
                callPrice: product.callPrice || 0,
                taxable: product.tax?.taxable ?? true,
                taxRate: product.tax?.taxRate ?? 18,
                hsCode: product.tax?.hsCode || '',
                minimumLevel: product.stockLevels?.minimumLevel || 0,
                reorderLevel: product.stockLevels?.reorderLevel || 0,
                maximumLevel: product.stockLevels?.maximumLevel || 0,
                unitsPerCarton: product.packaging?.unitsPerCarton || 0,
                cartonsPerPallet: product.packaging?.cartonsPerPallet || 0,
                minimumOrderQuantity: product.salesConfig?.minimumOrderQuantity || 1,
                sellable: product.salesConfig?.sellable ?? true,
                allowBackorder: product.salesConfig?.allowBackorder ?? false,
                status: product.status || 'active',
                buyingPrice: product.costs?.standardCost || 0,
                profitPercentage: product.costs?.standardCost && product.costs.standardCost > 0 && product.basePrice 
                    ? ((product.basePrice - product.costs.standardCost) / product.costs.standardCost * 100).toFixed(2) 
                    : 0,
                tierPricing: product.tierPricing || [],
                productNature: product.productNature || 'single',
                variations: product.variations || [],
                comboItems: product.comboItems?.map(item => ({
                    productId: item.productId?._id || item.productId,
                    quantity: item.quantity,
                    priceContribution: item.priceContribution
                })) || [],
                notes: product.notes || '',
            });
        } else if (isOpen && !product) {
            // Reset to defaults when creating new
            reset({
                type: 'trading',
                status: 'active',
                taxable: true,
                taxRate: 18,
                sellable: true,
                allowBackorder: false,
                minimumOrderQuantity: 1,
                buyingPrice: 0,
                profitPercentage: 0,
                basePrice: 0,
                mrp: 0,
                callPrice: 0,
                tierPricing: [],
                productNature: 'single',
                variations: [],
                comboItems: [],
            });
        }
        setActiveTab('basic');
    }, [isOpen, product, reset]);

    const onSubmit = async (data) => {
        // Transform flat form data back into nested structure for API
        const payload = {
            name: data.name,
            shortName: data.shortName || undefined,
            sku: data.sku || undefined,
            barcode: data.barcode || undefined,
            productType: data.productType,
            canBeSold: data.canBeSold,
            canBePurchased: data.canBePurchased,
            canBeManufactured: data.canBeManufactured,
            description: data.description || undefined,
            categoryId: data.categoryId,
            brandId: data.brandId || undefined,
            type: data.type,
            unitOfMeasure: data.unitOfMeasure,
            basePrice: data.basePrice,
            purchasePrice: data.buyingPrice || 0,
            mrp: data.mrp || undefined,
            callPrice: data.callPrice || undefined,
            costs: {
                ...(product?.costs || {}),
                standardCost: data.buyingPrice || 0,
            },
            tax: {
                taxable: false,
                taxRate: 0,
            },
            stockLevels: {
                minimumLevel: data.minimumLevel || 0,
                reorderLevel: data.reorderLevel || 0,
                maximumLevel: data.maximumLevel || 0,
            },
            packaging: {
                unitsPerCarton: data.unitsPerCarton || 0,
                cartonsPerPallet: data.cartonsPerPallet || 0,
            },
            salesConfig: {
                minimumOrderQuantity: data.minimumOrderQuantity || 1,
                sellable: data.sellable,
                allowBackorder: data.allowBackorder,
            },
            status: data.status,
            notes: data.notes || undefined,
            tierPricing: data.tierPricing || [],
            productNature: data.productNature,
            variations: data.productNature === 'variable' ? data.variations : [],
            comboItems: data.productNature === 'combo' ? data.comboItems : [],
        };

        try {
            if (isEdit) {
                await updateProduct.mutateAsync({ id: product._id, data: payload });
            } else {
                await createProduct.mutateAsync(payload);
            }
            onClose();
        } catch (err) {
            // Errors already toasted via hook
        }
    };

    const categoryOptions = (categoriesData?.data || []).map((c) => ({
        value: c._id,
        label: `${c.name} (${c.code})`,
    }));
    const brandOptions = (brandsData?.data || []).map((b) => ({
        value: b._id,
        label: b.name,
    }));
    const uomOptions = (uomsData?.data || []).map((u) => ({
        value: u.symbol,
        label: `${u.name} (${u.symbol})`,
    }));

    const isLoading = createProduct.isPending || updateProduct.isPending;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? `Edit Product — ${product?.productCode}` : 'Create New Product'}
            size="xl"
        >
            <form onSubmit={handleSubmit(onSubmit)}>
                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <div className="flex gap-1 px-6 overflow-x-auto no-scrollbar">
                        {tabs.map((tab) => {
                            const nature = watch('productNature');
                            if (tab.id === 'variations' && nature !== 'variable') return null;
                            if (tab.id === 'combo' && nature !== 'combo') return null;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === tab.id
                                        ? 'border-primary-600 text-primary-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                    {activeTab === 'basic' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Product Name" required error={errors.name?.message} {...register('name')} />
                                <Select
                                    label="Product Nature"
                                    required
                                    error={errors.productNature?.message}
                                    options={[
                                        { value: 'single', label: 'Single Product' },
                                        { value: 'variable', label: 'Variable Product' },
                                        { value: 'combo', label: 'Combo Product (Bundle)' },
                                    ]}
                                    {...register('productNature')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Short Name" error={errors.shortName?.message} {...register('shortName')} />
                                <Input label="Barcode" error={errors.barcode?.message} {...register('barcode')} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Input label="SKU" error={errors.sku?.message} {...register('sku')} />
                                <Select
                                    label="Type"
                                    required
                                    error={errors.type?.message}
                                    options={[
                                        { value: 'trading', label: 'Trading (buy & sell)' },
                                        { value: 'manufactured', label: 'Manufactured' },
                                        { value: 'service', label: 'Service' },
                                        { value: 'bundle', label: 'Bundle' },
                                    ]}
                                    {...register('type')}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Select
                                    label="Category"
                                    required
                                    error={errors.categoryId?.message}
                                    options={categoryOptions}
                                    {...register('categoryId')}
                                />
                                <Select
                                    label="Brand"
                                    error={errors.brandId?.message}
                                    options={brandOptions}
                                    {...register('brandId')}
                                />
                                <Select
                                    label="Product Type" required
                                    options={[
                                        { value: 'finished_good', label: 'Finished Good (sellable)' },
                                        { value: 'raw_material', label: 'Raw Material (for production)' },
                                        { value: 'semi_finished', label: 'Semi-Finished (intermediate)' },
                                        { value: 'packaging', label: 'Packaging Material' },
                                        { value: 'consumable', label: 'Consumable' },
                                        { value: 'service', label: 'Service' },
                                    ]}
                                    error={errors.productType?.message}
                                    {...register('productType')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Select
                                    label="Unit of Measure"
                                    required
                                    error={errors.unitOfMeasure?.message}
                                    options={uomOptions}
                                    {...register('unitOfMeasure')}
                                />
                                <Select
                                    label="Status"
                                    required
                                    error={errors.status?.message}
                                    options={[
                                        { value: 'active', label: 'Active' },
                                        { value: 'inactive', label: 'Inactive' },
                                        { value: 'draft', label: 'Draft' },
                                        { value: 'discontinued', label: 'Discontinued' },
                                    ]}
                                    {...register('status')}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" {...register('canBeSold')} />
                                    Can be sold
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" {...register('canBePurchased')} />
                                    Can be purchased
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" {...register('canBeManufactured')} />
                                    Can be manufactured
                                </label>
                            </div>
                            <Textarea label="Description" rows={3} error={errors.description?.message} {...register('description')} />
                            <Textarea label="Internal Notes" rows={2} error={errors.notes?.message} {...register('notes')} />
                        </div>
                    )}

                    {activeTab === 'variations' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-semibold text-gray-700">Product Variations</h4>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => appendVariation({ name: '', sku: '', price: watch('basePrice') || 0, purchasePrice: watch('buyingPrice') || 0, stock: 0 })}
                                >
                                    + Add Variation
                                </Button>
                            </div>

                            {variationFields.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <p className="text-sm text-gray-500">No variations added yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {variationFields.map((field, index) => (
                                        <div key={field.id} className="p-4 border rounded-lg bg-white space-y-3 relative">
                                            <button
                                                type="button"
                                                onClick={() => removeVariation(index)}
                                                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                            <div className="grid grid-cols-2 gap-4">
                                                <Input label="Variation Name (e.g. Red, XL)" required error={errors.variations?.[index]?.name?.message} {...register(`variations.${index}.name`)} />
                                                <Input label="SKU" error={errors.variations?.[index]?.sku?.message} {...register(`variations.${index}.sku`)} />
                                            </div>
                                            <div className="grid grid-cols-4 gap-4">
                                                <Input label="Barcode" error={errors.variations?.[index]?.barcode?.message} {...register(`variations.${index}.barcode`)} />
                                                <Input label="Purchase Price" type="number" step="0.01" error={errors.variations?.[index]?.purchasePrice?.message} {...register(`variations.${index}.purchasePrice`)} />
                                                <Input label="Sell Price" type="number" step="0.01" error={errors.variations?.[index]?.price?.message} {...register(`variations.${index}.price`)} />
                                                <Input label="Initial Stock" type="number" error={errors.variations?.[index]?.stock?.message} {...register(`variations.${index}.stock`)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'combo' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-semibold text-gray-700">Combo Items (Bundle Components)</h4>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => appendCombo({ productId: '', quantity: 1, priceContribution: 0 })}
                                >
                                    + Add Item
                                </Button>
                            </div>

                            {comboFields.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <p className="text-sm text-gray-500">No items added to this combo yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {comboFields.map((field, index) => (
                                        <div key={field.id} className="flex gap-4 items-end bg-white p-3 border rounded-lg">
                                            <div className="flex-1">
                                                <Select
                                                    label="Select Product"
                                                    required
                                                    error={errors.comboItems?.[index]?.productId?.message}
                                                    options={(allProductsData?.data || []).map(p => ({ value: p._id, label: `${p.name} (${p.productCode})` }))}
                                                    {...register(`comboItems.${index}.productId`)}
                                                />
                                            </div>
                                            <div className="w-24">
                                                <Input label="Qty" type="number" required error={errors.comboItems?.[index]?.quantity?.message} {...register(`comboItems.${index}.quantity`)} />
                                            </div>
                                            <div className="w-32">
                                                <Input label="Price Contr." type="number" step="0.01" error={errors.comboItems?.[index]?.priceContribution?.message} {...register(`comboItems.${index}.priceContribution`)} />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="text-red-500 border-red-200 hover:bg-red-50"
                                                onClick={() => removeCombo(index)}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <Input
                                    label="Buying Price (LKR)"
                                    type="number"
                                    step="0.01"
                                    error={errors.buyingPrice?.message}
                                    {...register('buyingPrice', {
                                        onChange: (e) => {
                                            const buy = parseFloat(e.target.value) || 0;
                                            const profit = watch('profitPercentage') || 0;
                                            const sell = buy * (1 + profit / 100);
                                            setValue('basePrice', parseFloat(sell.toFixed(2)));
                                        }
                                    })}
                                />
                                <Input
                                    label="Profit (%)"
                                    type="number"
                                    step="0.01"
                                    error={errors.profitPercentage?.message}
                                    {...register('profitPercentage', {
                                        onChange: (e) => {
                                            const profit = parseFloat(e.target.value) || 0;
                                            const buy = watch('buyingPrice') || 0;
                                            const sell = buy * (1 + profit / 100);
                                            setValue('basePrice', parseFloat(sell.toFixed(2)));
                                        }
                                    })}
                                />
                                <Input
                                    label="Selling Price (LKR)"
                                    type="number"
                                    step="0.01"
                                    required
                                    error={errors.basePrice?.message}
                                    {...register('basePrice', {
                                        onChange: (e) => {
                                            const sell = parseFloat(e.target.value) || 0;
                                            const buy = watch('buyingPrice') || 0;
                                            if (buy > 0) {
                                                const profit = ((sell - buy) / buy) * 100;
                                                setValue('profitPercentage', parseFloat(profit.toFixed(2)));
                                            }
                                        }
                                    })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="MRP (LKR)"
                                    type="number"
                                    step="0.01"
                                    error={errors.mrp?.message}
                                    {...register('mrp')}
                                />
                                <div className="flex flex-col">
                                    <Input
                                        label="Call Price (LKR)"
                                        type="number"
                                        step="0.01"
                                        error={errors.callPrice?.message}
                                        {...register('callPrice')}
                                    />
                                    {product && product.callPriceUpdatedAt && (
                                        <span className="text-[11px] text-gray-500 mt-1">
                                            Last Updated: {new Date(product.callPriceUpdatedAt).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tiers' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-semibold text-gray-700">Wholesale Price Tiers</h4>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => appendTier({ tierName: watch('name') || '', minQuantity: 1, maxQuantity: null, price: 0 })}
                                >
                                    + Add Tier
                                </Button>
                            </div>

                            {tierFields.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <p className="text-sm text-gray-500">No price tiers defined yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead>
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier Name</th>
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Qty</th>
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max Qty</th>
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price (LKR)</th>
                                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit %</th>
                                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {tierFields.map((field, index) => {
                                                const tierPrice = watch(`tierPricing.${index}.price`) || 0;
                                                const buyingPrice = watch('buyingPrice') || 0;
                                                const profit = buyingPrice > 0 ? ((tierPrice - buyingPrice) / buyingPrice * 100).toFixed(2) : 0;

                                                return (
                                                    <tr key={field.id}>
                                                        <td className="px-2 py-2">
                                                            <Input size="sm" {...register(`tierPricing.${index}.tierName`)} placeholder="e.g. Bulk 1" />
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <Input type="number" size="sm" {...register(`tierPricing.${index}.minQuantity`)} />
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <Input type="number" size="sm" {...register(`tierPricing.${index}.maxQuantity`)} placeholder="No limit" />
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <Input type="number" size="sm" step="0.01" {...register(`tierPricing.${index}.price`)} />
                                                        </td>
                                                        <td className="px-3 py-2 text-sm text-gray-600 font-medium">
                                                            <span className={profit > 0 ? 'text-green-600' : 'text-red-600'}>
                                                                {profit}%
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeTier(index)}
                                                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 italic">
                                * Profit % is calculated based on the Buying Price (Standard Cost).
                            </p>
                        </div>
                    )}

                    {activeTab === 'stock' && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-gray-700">Stock Levels</h4>
                            <div className="grid grid-cols-3 gap-4">
                                <Input
                                    label="Minimum Level"
                                    type="number"
                                    error={errors.minimumLevel?.message}
                                    {...register('minimumLevel')}
                                />
                                <Input
                                    label="Reorder Level"
                                    type="number"
                                    error={errors.reorderLevel?.message}
                                    {...register('reorderLevel')}
                                />
                                <Input
                                    label="Maximum Level"
                                    type="number"
                                    error={errors.maximumLevel?.message}
                                    {...register('maximumLevel')}
                                />
                            </div>
                            <h4 className="text-sm font-semibold text-gray-700 pt-4">Packaging</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Units per Carton"
                                    type="number"
                                    error={errors.unitsPerCarton?.message}
                                    {...register('unitsPerCarton')}
                                />
                                <Input
                                    label="Cartons per Pallet"
                                    type="number"
                                    error={errors.cartonsPerPallet?.message}
                                    {...register('cartonsPerPallet')}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="sellable" {...register('sellable')} />
                                <label htmlFor="sellable" className="text-sm text-gray-700">Sellable (can be added to sales orders)</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="allowBackorder" {...register('allowBackorder')} />
                                <label htmlFor="allowBackorder" className="text-sm text-gray-700">Allow backorder when out of stock</label>
                            </div>
                            <Input
                                label="Minimum Order Quantity"
                                type="number"
                                error={errors.minimumOrderQuantity?.message}
                                {...register('minimumOrderQuantity')}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex gap-2">
                        {activeTab !== 'basic' && (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => {
                                    const currentIndex = tabs.findIndex(t => t.id === activeTab);
                                    if (currentIndex > 0) setActiveTab(tabs[currentIndex - 1].id);
                                }}
                            >
                                Previous
                            </Button>
                        )}
                    </div>
                    
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose} type="button" disabled={isLoading}>
                            Cancel
                        </Button>
                        
                        {activeTab !== 'sales' ? (
                            <Button
                                type="button"
                                variant="primary"
                                onClick={() => {
                                    const currentIndex = tabs.findIndex(t => t.id === activeTab);
                                    if (currentIndex < tabs.length - 1) setActiveTab(tabs[currentIndex + 1].id);
                                }}
                            >
                                Next
                            </Button>
                        ) : (
                            <Button type="submit" variant="primary" loading={isLoading}>
                                {isEdit ? 'Update Product' : 'Create Product'}
                            </Button>
                        )}
                    </div>
                </div>
            </form>
        </Modal>
    );
}