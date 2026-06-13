import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Search, Plus, Minus, Trash2, ShoppingCart, Save, X,
    Package, AlertCircle, UserPlus, PackagePlus, CreditCard,
    CheckCircle, ArrowLeft, LayoutGrid, List
} from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { customersApi } from '../features/customers/customersApi';
import { productsApi } from '../features/products/productsApi';
import { stockApi } from '../features/stock/stockApi';
import { useWarehouses } from '../features/warehouses/useWarehouses';
import { useCategories } from '../features/products/useProducts';
import { useCreateSalesOrder } from '../features/salesOrders/useSalesOrders';
import { useCreateCustomer } from '../features/customers/useCustomers';
import QuickCreateCustomerModal from '../features/customers/QuickCreateCustomerModal';
import { posSessionsApi } from '../features/posSessions/posSessionsApi';
import PosSessionModal from '../features/posSessions/PosSessionModal';
import CloseRegisterModal from '../features/posSessions/CloseRegisterModal';
import ThermalReceipt from '../components/print/ThermalReceipt';
import api from '../api/axios';
import { useCompanySettings } from '../features/settings/useSettings';
import { settingsApi } from '../features/settings/settingsApi';

import { useAuthStore } from '../store/authStore';
import { useMobile } from '../hooks/useMobile';

export default function PosPage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const createOrder = useCreateSalesOrder();
    const isMobile = useMobile();
    const [showCartOnMobile, setShowCartOnMobile] = useState(false);
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('posViewMode') || 'grid');

    const toggleViewMode = (mode) => {
        setViewMode(mode);
        localStorage.setItem('posViewMode', mode);
    };

    // Pre-fetch settings for receipt
    useCompanySettings();

    // Cart state
    const [customerId, setCustomerId] = useState('');
    const [sourceWarehouseId, setSourceWarehouseId] = useState('');
    const [cart, setCart] = useState([]); // [{ productId, name, code, price, qty, available, taxRate, taxable }]
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [phoneSearch, setPhoneSearch] = useState('');
    const [orderDiscountPercent, setOrderDiscountPercent] = useState(0);
    const [orderDiscountAmount, setOrderDiscountAmount] = useState(0);
    const createCustomer = useCreateCustomer();

    // Modals
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [isCloseRegisterModalOpen, setIsCloseRegisterModalOpen] = useState(false);
    const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);
    const [calculatorCashReceived, setCalculatorCashReceived] = useState('');
    const [calculatorChangeReturned, setCalculatorChangeReturned] = useState(0);

    // Direct Printing
    const [recentInvoice, setRecentInvoice] = useState(null);
    const [paymentForPrint, setPaymentForPrint] = useState([]);

    // Data
    const { data: activeSessionData, isLoading: isLoadingSession } = useQuery({
        queryKey: ['pos-sessions', 'active'],
        queryFn: posSessionsApi.getActive,
        retry: false
    });
    const activeSession = activeSessionData?.data;
    const { data: warehousesData } = useWarehouses({ isActive: true });
    const { data: customersData } = useQuery({
        queryKey: ['customers', 'active'],
        queryFn: () => customersApi.list({ status: 'active', limit: 500 }),
    });
    const { data: productsData } = useQuery({
        queryKey: ['products', 'active', 'pos'],
        queryFn: () => productsApi.list({ status: 'active', canBeSold: true, limit: 500 }),
    });
    const { data: categoriesData } = useCategories({ isActive: 'true' });
    const { data: stockData } = useQuery({
        queryKey: ['stock', 'pos', sourceWarehouseId],
        queryFn: () => stockApi.list({ warehouseId: sourceWarehouseId, limit: 500 }),
        enabled: !!sourceWarehouseId,
    });

    const warehouses = warehousesData?.data || [];
    const customers = customersData?.data || [];
    const products = (productsData?.data || []).filter((p) => p.canBeSold !== false);
    const categories = categoriesData?.data || [];
    const stockItems = stockData?.data || [];

    // Set default warehouse
    useEffect(() => {
        if (!sourceWarehouseId && warehouses.length > 0) {
            const assignedVan = warehouses.find((w) => w.assignedRep === user?._id || w.assignedRep?._id === user?._id);
            const def = assignedVan || warehouses.find((w) => w.isDefault) || warehouses[0];
            if (def) setSourceWarehouseId(def._id);
        }
    }, [warehouses, sourceWarehouseId, user]);

    // Removed auto-select walk-in logic per user request

    // Build stock map
    const stockMap = useMemo(() => {
        const map = new Map();
        stockItems.forEach((s) => {
            const pid = s.productId?._id || s.productId;
            const existing = map.get(pid) || { onHand: 0, reserved: 0 };
            existing.onHand += s.quantities?.onHand || 0;
            existing.reserved += s.quantities?.reserved || 0;
            map.set(pid, existing);
        });
        return map;
    }, [stockItems]);

    // Filter products
    const filteredProducts = useMemo(() => {
        let result = products;
        if (activeCategory !== 'all') {
            result = result.filter((p) => (p.categoryId?._id || p.categoryId) === activeCategory);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter((p) =>
                p.name?.toLowerCase().includes(q)
                || p.productCode?.toLowerCase().includes(q)
                || p.barcode?.toLowerCase().includes(q)
            );
        }
        return result.slice(0, 60); // limit display
    }, [products, activeCategory, searchQuery]);

    const customerSuggestions = useMemo(() => {
        if ((!customerSearch && !phoneSearch) || customerId) return [];
        const q = customerSearch.toLowerCase();
        const ph = phoneSearch.toLowerCase();
        return customers.filter(c => {
            if (customerSearch) return (
                c.displayName?.toLowerCase().includes(q) ||
                c.primaryContact?.phone?.includes(q) ||
                c.customerCode?.toLowerCase().includes(q)
            );
            if (phoneSearch) return c.primaryContact?.phone?.includes(ph);
            return false;
        }).slice(0, 5);
    }, [customerSearch, phoneSearch, customers, customerId]);

    const phoneSuggestions = useMemo(() => {
        if (!phoneSearch || customerId) return [];
        const ph = phoneSearch.toLowerCase();
        return customers.filter(c => c.primaryContact?.phone?.includes(ph)).slice(0, 5);
    }, [phoneSearch, customers, customerId]);

    // Helper: get tier price for product at given quantity
    const getTierPrice = (product, qty) => {
        if (!product.tierPricing || product.tierPricing.length === 0) return product.basePrice;
        const tiers = [...product.tierPricing].sort((a, b) => (b.minQuantity || 0) - (a.minQuantity || 0));
        for (const tier of tiers) {
            if (qty >= (tier.minQuantity || 0)) {
                const maxOk = !tier.maxQuantity || qty <= tier.maxQuantity;
                if (maxOk && tier.price > 0) return tier.price;
            }
        }
        return product.basePrice;
    };

    const selectedCustomer = customers.find((c) => c._id === customerId);
    const customerOptions = customers.map((c) => ({
        value: c._id,
        label: `${c.displayName} (${c.customerCode})`,
    }));

    // Cart actions
    const addToCart = (product) => {
        const stock = stockMap.get(product._id);
        const available = stock ? Math.max(0, stock.onHand - stock.reserved) : 0;

        if (available <= 0) {
            toast.error(`${product.name} is out of stock at this warehouse`);
            return;
        }

        setCart((prev) => {
            const existing = prev.find((i) => i.productId === product._id);
            if (existing) {
                if (existing.qty >= available) {
                    toast.error(`Only ${available} available`);
                    return prev;
                }
                const newQty = existing.qty + 1;
                const tierPrice = getTierPrice(product, newQty);
                let price = tierPrice;
                if (selectedCustomer?.defaultDiscountPercent) {
                    price = price * (1 - selectedCustomer.defaultDiscountPercent / 100);
                }
                return prev.map((i) => i.productId === product._id
                    ? { ...i, qty: newQty, price: +price.toFixed(2), tierPricing: product.tierPricing } : i);
            }

            const tierPrice = getTierPrice(product, 1);
            let price = tierPrice;
            if (selectedCustomer?.defaultDiscountPercent) {
                price = price * (1 - selectedCustomer.defaultDiscountPercent / 100);
            }

            return [...prev, {
                productId: product._id,
                name: product.name,
                code: product.productCode,
                price: +price.toFixed(2),
                qty: 1,
                available,
                unitOfMeasure: product.unitOfMeasure,
                tierPricing: product.tierPricing || [],
                basePrice: product.basePrice,
            }];
        });
    };

    const updateQty = (productId, delta) => {
        setCart((prev) => prev.map((i) => {
            if (i.productId !== productId) return i;
            const newQty = i.qty + delta;
            if (newQty <= 0) return null;
            if (newQty > i.available) {
                toast.error(`Only ${i.available} available`);
                return i;
            }
            // Recalculate tier price on qty change
            const newPrice = getTierPrice({ basePrice: i.basePrice || i.price, tierPricing: i.tierPricing || [] }, newQty);
            let finalPrice = newPrice;
            if (selectedCustomer?.defaultDiscountPercent) {
                finalPrice = finalPrice * (1 - selectedCustomer.defaultDiscountPercent / 100);
            }
            return { ...i, qty: newQty, price: +finalPrice.toFixed(2) };
        }).filter(Boolean));
    };

    const setQty = (productId, qty) => {
        setCart((prev) => prev.map((i) => {
            if (i.productId !== productId) return i;
            const newQty = Math.max(0, +qty || 0);
            if (newQty > i.available) {
                toast.error(`Only ${i.available} available`);
                return i;
            }
            // Recalculate tier price on qty change
            const newPrice = getTierPrice({ basePrice: i.basePrice || i.price, tierPricing: i.tierPricing || [] }, newQty);
            let finalPrice = newPrice;
            if (selectedCustomer?.defaultDiscountPercent) {
                finalPrice = finalPrice * (1 - selectedCustomer.defaultDiscountPercent / 100);
            }
            return { ...i, qty: newQty, price: +finalPrice.toFixed(2) };
        }).filter((i) => i.qty > 0));
    };

    const removeFromCart = (productId) => {
        setCart((prev) => prev.filter((i) => i.productId !== productId));
    };

    const clearCart = () => {
        if (cart.length === 0) return;
        if (window.confirm('Clear all items?')) setCart([]);
    };

    // Totals
    const totals = useMemo(() => {
        let subtotal = 0;
        cart.forEach((item) => {
            subtotal += item.qty * item.price;
        });
        const orderDiscPercentAmount = subtotal * (+orderDiscountPercent || 0) / 100;
        const orderDiscFixed = +orderDiscountAmount || 0;
        const totalDiscount = orderDiscPercentAmount + orderDiscFixed;
        const grandTotal = subtotal - totalDiscount;
        return {
            subtotal: +subtotal.toFixed(2),
            orderDiscount: +totalDiscount.toFixed(2),
            grandTotal: +grandTotal.toFixed(2),
            itemCount: cart.reduce((s, i) => s + i.qty, 0),
        };
    }, [cart, orderDiscountPercent, orderDiscountAmount]);

    const fmt = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(n || 0);

    const handleCheckout = async (saveAsDraft = false, cashAmt = null, changeAmt = null) => {
        let finalCustomerId = customerId;

        // Auto-add customer if not selected but name typed
        if (!finalCustomerId && customerSearch) {
            try {
                const newCust = await createCustomer.mutateAsync({
                    displayName: customerSearch,
                    primaryContact: {
                        name: customerSearch,
                        phone: customerPhone || undefined
                    },
                    customerType: 'individual',
                    status: 'active'
                });
                finalCustomerId = newCust.data._id;
            } catch (err) {
                console.error('Auto-create customer error:', err);
                toast.error(err.response?.data?.message || err.message || 'Failed to auto-create customer');
                return;
            }
        }

        if (!finalCustomerId) { toast.error('Select or type a customer'); return; }
        if (!sourceWarehouseId) { toast.error('Select a warehouse'); return; }
        if (cart.length === 0) { toast.error('Cart is empty'); return; }
        if (!activeSession) { toast.error('You must open the cash register first'); setIsSessionModalOpen(true); return; }

        if (!saveAsDraft && cashAmt === null) {
            setCalculatorCashReceived('');
            setCalculatorChangeReturned(0);
            setIsCalculatorModalOpen(true);
            return;
        }

        const payload = {
            customerId: finalCustomerId,
            sourceWarehouseId,
            source: 'pos',
            items: cart.map((i) => ({
                productId: i.productId,
                orderedQuantity: i.qty,
                unitPrice: i.price,
                discountPercent: 0,
            })),
            orderDiscount: (orderDiscountPercent > 0 || orderDiscountAmount > 0)
                ? { type: 'fixed', value: totals.orderDiscount }
                : undefined,
            status: saveAsDraft ? 'draft' : 'approved',
            cashReceived: saveAsDraft ? undefined : (cashAmt || 0),
            changeReturned: saveAsDraft ? undefined : (changeAmt || 0),
        };

        try {
            const result = await createOrder.mutateAsync(payload);
            if (saveAsDraft) {
                toast.success('Order saved as draft');
                navigate(`/sales-orders/${result.data._id}`);
            } else {
                let fetchedInvoiceId = null;
                try {
                    const invoicesRes = await api.get('/invoices', { params: { salesOrderId: result.data._id } });
                    if (invoicesRes.data?.data?.length > 0) {
                        fetchedInvoiceId = invoicesRes.data.data[0]._id;
                    }
                } catch (err) {
                    console.error('Could not fetch invoice', err);
                }

                toast.success('Sale complete! Invoice generated.');
                setCart([]);
                setCustomerId('');
                setCustomerSearch('');
                setCustomerPhone('');
                setOrderDiscountPercent(0);
                setOrderDiscountAmount(0);

                // Navigate to receipt page - auto-triggers print dialog
                if (fetchedInvoiceId) {
                    navigate(`/receipt/${fetchedInvoiceId}`);
                }
            }
        } catch (err) {
            console.error('Checkout failed:', err);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 -m-4 md:-m-6">
            {/* Top bar */}
            <div className="bg-white border-b px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-center justify-between w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/sales-orders')}>
                            <ArrowLeft size={14} className="mr-1" /> Back
                        </Button>
                        <h1 className="font-bold text-lg flex items-center gap-2 md:hidden">
                            <ShoppingCart size={20} /> POS
                        </h1>
                    </div>
                    {/* Mobile Register Open/Close button */}
                    <div className="flex md:hidden gap-2">
                        {activeSession ? (
                            <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50 text-xs py-1.5 px-2.5 h-[36px]" onClick={() => setIsCloseRegisterModalOpen(true)}>
                                Close Reg
                            </Button>
                        ) : (
                            <Button variant="primary" size="sm" className="text-xs py-1.5 px-2.5 h-[36px]" onClick={() => setIsSessionModalOpen(true)}>
                                Open Reg
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center w-full">
                    {/* Customer & Phone section */}
                    <div className="flex-1 flex flex-col sm:flex-row gap-2 relative">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Customer Name..."
                                className="w-full px-3 py-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none border-gray-200 shadow-sm transition-all"
                                value={customerId ? selectedCustomer?.displayName : customerSearch}
                                onChange={(e) => {
                                    setCustomerSearch(e.target.value);
                                    setCustomerId('');
                                }}
                            />
                            {(customerId || customerSearch) && (
                                <button
                                    onClick={() => { setCustomerId(''); setCustomerSearch(''); setCustomerPhone(''); setPhoneSearch(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                >
                                    <X size={14} />
                                </button>
                            )}

                            {customerSearch && !customerId && customerSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="p-2 text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-50 border-b">Suggested Customers</div>
                                    {customerSuggestions.map(c => (
                                        <button
                                            key={c._id}
                                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary-50 transition-colors border-b last:border-0 flex flex-col"
                                            onClick={() => {
                                                setCustomerId(c._id);
                                                setCustomerSearch('');
                                                setCustomerPhone('');
                                            }}
                                        >
                                            <span className="font-bold text-gray-800">{c.displayName}</span>
                                            <span className="text-[10px] text-gray-500 flex items-center gap-2">
                                                {c.customerCode} • {c.primaryContact?.phone || 'No phone'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="flex-1 sm:w-40 relative">
                                <input
                                    type="text"
                                    placeholder="Phone No..."
                                    className="w-full px-3 py-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none border-gray-200 shadow-sm transition-all"
                                    value={customerId ? (selectedCustomer?.primaryContact?.phone || '') : phoneSearch || customerPhone}
                                    onChange={(e) => {
                                        if (!customerId) {
                                            setPhoneSearch(e.target.value);
                                            setCustomerPhone(e.target.value);
                                            setCustomerId('');
                                        }
                                    }}
                                    readOnly={!!customerId}
                                />
                                {phoneSearch && !customerId && phoneSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200" style={{minWidth:'220px'}}>
                                        <div className="p-2 text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-50 border-b">By Phone</div>
                                        {phoneSuggestions.map(c => (
                                            <button
                                                key={c._id}
                                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary-50 transition-colors border-b last:border-0 flex flex-col"
                                                onClick={() => {
                                                    setCustomerId(c._id);
                                                    setCustomerSearch('');
                                                    setPhoneSearch('');
                                                    setCustomerPhone('');
                                                }}
                                            >
                                                <span className="font-bold text-gray-800">{c.displayName}</span>
                                                <span className="text-[10px] text-gray-500">{c.primaryContact?.phone} • {c.customerCode}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button variant="outline" size="sm" onClick={() => setIsCustomerModalOpen(true)} title={selectedCustomer ? "Edit Customer" : "Advanced Add"} className="h-[42px] px-3 shrink-0">
                                <UserPlus size={16} className={selectedCustomer ? "text-blue-600" : ""} />
                            </Button>
                        </div>
                    </div>

                    <div className="w-full lg:w-56">
                        <Select placeholder="Warehouse"
                            options={warehouses.map((w) => ({ value: w._id, label: w.name }))}
                            value={sourceWarehouseId} onChange={(e) => { setSourceWarehouseId(e.target.value); setCart([]); }} />
                    </div>

                    {selectedCustomer && (
                        <div className="text-xs text-gray-600 self-start lg:self-center shrink-0">
                            <p>Credit: <span className="font-semibold">{fmt(selectedCustomer.creditStatus?.availableCredit || 0)}</span></p>
                            {selectedCustomer.creditStatus?.onCreditHold && (
                                <Badge variant="danger">On Credit Hold</Badge>
                            )}
                        </div>
                    )}
                </div>

                <div className="hidden md:flex gap-2 shrink-0">
                    {activeSession ? (
                        <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setIsCloseRegisterModalOpen(true)}>
                            Close Register
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={() => setIsSessionModalOpen(true)}>
                            Open Register
                        </Button>
                    )}
                    <h1 className="font-bold text-lg items-center gap-2 flex ml-4">
                        <ShoppingCart size={20} /> POS
                    </h1>
                </div>
            </div>

            {/* Main 2-column layout */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Backdrop for mobile cart drawer */}
                {showCartOnMobile && (
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-300 lg:hidden"
                        onClick={() => setShowCartOnMobile(false)}
                    />
                )}

                {/* Left: Product catalog */}
                <div className="flex-1 flex flex-col bg-gray-50 p-4 overflow-hidden flex">
                    {/* Search */}
                    <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search products..."
                                className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none border-gray-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {/* View toggle */}
                        <div className="flex bg-gray-150 border border-gray-200 rounded-lg p-0.5 shrink-0 bg-white">
                            <button
                                type="button"
                                onClick={() => toggleViewMode('grid')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Grid View"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleViewMode('list')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                title="List View"
                            >
                                <List size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Category tabs */}
                    <div className="flex gap-1 mb-3 overflow-x-auto pb-1 no-scrollbar">
                        <button onClick={() => setActiveCategory('all')}
                            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${activeCategory === 'all' ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-100'
                                }`}>
                            All
                        </button>
                        {categories.map((c) => (
                            <button key={c._id} onClick={() => setActiveCategory(c._id)}
                                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${activeCategory === c._id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-100'
                                    }`}>
                                {c.name}
                            </button>
                        ))}
                    </div>

                    {/* Product Catalog */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <Package size={32} className="mx-auto mb-2 text-gray-300" />
                                <p>No products found</p>
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="flex flex-col gap-2">
                                {filteredProducts.map((p) => {
                                    const stock = stockMap.get(p._id);
                                    const available = stock ? Math.max(0, stock.onHand - stock.reserved) : 0;
                                    const inCart = cart.find((i) => i.productId === p._id)?.qty || 0;
                                    const outOfStock = available <= 0;

                                    return (
                                        <button
                                            key={p._id}
                                            onClick={() => addToCart(p)}
                                            disabled={outOfStock}
                                            className={`text-left bg-white border rounded-xl p-3 flex items-center justify-between transition-all ${outOfStock
                                                ? 'opacity-50 cursor-not-allowed'
                                                : 'hover:shadow-md hover:border-gray-300 active:scale-[0.99]'
                                                } ${inCart > 0 ? 'border-primary-500 bg-primary-50/50 ring-1 ring-primary-500' : ''}`}
                                        >
                                            <div className="min-w-0 flex-1 pr-4">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-bold text-sm text-gray-800 truncate">{p.name}</span>
                                                    {inCart > 0 && (
                                                        <Badge variant="primary" className="px-1.5 py-0 text-[10px] font-bold">
                                                            {inCart} in cart
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-600">{p.productCode}</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        Stock: 
                                                        <span className={`font-bold ${available <= 5 ? 'text-amber-600' : 'text-gray-700'}`}>
                                                            {available} {p.unitOfMeasure || 'pcs'}
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <p className="text-sm font-black text-primary-600">{fmt(p.basePrice)}</p>
                                                <Badge variant={outOfStock ? 'danger' : available <= 5 ? 'warning' : 'success'} className="px-2 py-0.5 text-xs font-semibold">
                                                    {outOfStock ? 'Out of Stock' : 'Available'}
                                                </Badge>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                {filteredProducts.map((p) => {
                                    const stock = stockMap.get(p._id);
                                    const available = stock ? Math.max(0, stock.onHand - stock.reserved) : 0;
                                    const inCart = cart.find((i) => i.productId === p._id)?.qty || 0;
                                    const outOfStock = available <= 0;

                                    return (
                                        <button
                                            key={p._id}
                                            onClick={() => addToCart(p)}
                                            disabled={outOfStock}
                                            className={`relative text-left bg-white border rounded-xl p-3 flex flex-col justify-between transition-all min-h-[96px] ${outOfStock
                                                ? 'opacity-50 cursor-not-allowed'
                                                : 'hover:shadow-md active:scale-95 hover:border-primary-300'
                                                } ${inCart > 0 ? 'border-primary-500 bg-primary-50/50 ring-1 ring-primary-500' : ''}`}>
                                            <div>
                                                <p className="text-xs font-bold text-gray-800 line-clamp-2 mb-0.5 leading-snug">{p.name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">{p.productCode}</p>
                                            </div>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                                <p className="text-xs font-extrabold text-primary-600">{fmt(p.basePrice)}</p>
                                                <span className={`text-[10px] font-bold ${outOfStock ? 'text-red-500' : available <= 5 ? 'text-amber-500' : 'text-green-600'}`}>
                                                    {outOfStock ? 'Out' : `${available} Left`}
                                                </span>
                                            </div>
                                            {inCart > 0 && (
                                                <div className="absolute top-1.5 right-1.5">
                                                    <span className="bg-primary-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                                        {inCart}
                                                    </span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Cart (Fixed width on desktop, sliding drawer on mobile/tablet when active) */}
                <div className={`
                    fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] shadow-2xl flex flex-col bg-white border-l h-full transition-transform duration-300 ease-in-out
                    lg:static lg:w-96 lg:translate-x-0 lg:shadow-none lg:flex
                    ${showCartOnMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
                `}>
                    <div className="p-4 border-b flex items-center justify-between bg-white sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowCartOnMobile(false)} className="p-2 -ml-2 text-gray-400 lg:hidden" aria-label="Close cart">
                                <ArrowLeft size={20} />
                            </button>
                            <h2 className="font-bold flex items-center gap-2">
                                <ShoppingCart size={18} /> Cart
                                {totals.itemCount > 0 && <Badge>{totals.itemCount}</Badge>}
                            </h2>
                        </div>
                        {cart.length > 0 && (
                            <button onClick={clearCart} className="text-xs text-red-600 font-semibold hover:underline">Clear all</button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {cart.length === 0 ? (
                            <div className="text-center text-gray-500 py-12">
                                <ShoppingCart size={32} className="mx-auto mb-2 text-gray-300" />
                                <p className="text-sm">Cart is empty</p>
                                <button onClick={() => setShowCartOnMobile(false)} className="mt-4 text-primary-600 text-sm font-bold lg:hidden">Browse Products</button>
                            </div>
                        ) : (
                            cart.map((item) => (
                                <div key={item.productId} className="border border-gray-100 rounded-xl p-3 bg-gray-50/30">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-sm font-bold text-gray-900 break-words leading-tight">{item.name}</p>
                                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">{item.code}</p>
                                        </div>
                                        <button onClick={() => removeFromCart(item.productId)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-lg p-0.5 shadow-sm">
                                            <button onClick={() => updateQty(item.productId, -1)}
                                                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-gray-50 text-gray-500 rounded-md transition-colors">
                                                <Minus size={14} />
                                            </button>
                                            <input type="number" value={item.qty} min="1" max={item.available}
                                                onChange={(e) => setQty(item.productId, e.target.value)}
                                                className="w-10 text-center text-sm font-bold bg-transparent border-0 focus:ring-0 p-0" />
                                            <button onClick={() => updateQty(item.productId, 1)}
                                                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-gray-50 text-gray-500 rounded-md transition-colors">
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <p className="text-sm font-black text-gray-900">{fmt(item.qty * item.price)}</p>
                                    </div>
                                    <div className="flex justify-between items-center mt-2 text-[10px] text-gray-400 font-medium">
                                        <span>{fmt(item.price)} {item.unitOfMeasure ? `/ ${item.unitOfMeasure}` : ''}</span>
                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded-full">{item.available} in stock</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Summary */}
                    <div className="border-t p-4 space-y-3 bg-gray-50 sticky bottom-0">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-gray-500 font-medium">
                                <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-xs">
                                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Disc %</span>
                                    <input type="number" min="0" max="100" step="0.01"
                                        value={orderDiscountPercent}
                                        onChange={(e) => setOrderDiscountPercent(e.target.value)}
                                        className="w-12 text-right font-bold focus:outline-none text-xs bg-transparent border-0 p-0 focus:ring-0" />
                                </div>
                                <div className="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-xs">
                                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Disc (Rs)</span>
                                    <input type="number" min="0" step="0.01"
                                        value={orderDiscountAmount}
                                        onChange={(e) => setOrderDiscountAmount(e.target.value)}
                                        className="w-16 text-right font-bold focus:outline-none text-xs bg-transparent border-0 p-0 focus:ring-0" />
                                </div>
                            </div>
                            {totals.orderDiscount > 0 && (
                                <div className="flex justify-between text-xs font-bold text-red-600">
                                    <span>Total Discount</span><span>-{fmt(totals.orderDiscount)}</span>
                                </div>
                            )}

                        </div>

                        <div className="flex justify-between pt-3 border-t border-gray-200">
                            <span className="font-bold text-gray-900">Total</span>
                            <span className="text-xl font-black text-primary-600 leading-none">{fmt(totals.grandTotal)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <Button variant="outline" onClick={() => handleCheckout(true)}
                                disabled={cart.length === 0 || (!customerId && !customerSearch)} loading={createOrder.isPending}>
                                <Save size={14} className="mr-1" /> Draft
                            </Button>
                            <Button variant="primary" onClick={() => handleCheckout(false)}
                                disabled={cart.length === 0 || (!customerId && !customerSearch)} loading={createOrder.isPending}>
                                <CreditCard size={14} className="mr-1" /> Checkout
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Mobile Cart Toggle Button */}
                {!showCartOnMobile && (
                    <button
                        onClick={() => setShowCartOnMobile(true)}
                        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-95 hover:scale-105 active:scale-90 transition-all duration-200"
                    >
                        <div className="relative">
                            <ShoppingCart size={24} />
                            {totals.itemCount > 0 && (
                                <span className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                                    {totals.itemCount}
                                </span>
                            )}
                        </div>
                    </button>
                )}
            </div>

            <QuickCreateCustomerModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
                onSuccess={(newCustomer) => {
                    setCustomerId(newCustomer._id);
                    setCustomerSearch('');
                }}
                initialData={selectedCustomer || (customerSearch ? { displayName: customerSearch } : null)}
                isPosMode={true}
            />

            <PosSessionModal isOpen={isSessionModalOpen} onClose={() => setIsSessionModalOpen(false)} />
            <CloseRegisterModal isOpen={isCloseRegisterModalOpen} onClose={() => setIsCloseRegisterModalOpen(false)} session={activeSession} />

            <Modal
                isOpen={isCalculatorModalOpen}
                onClose={() => setIsCalculatorModalOpen(false)}
                title="POS Cash Payment Calculator"
                size="md"
            >
                <div className="p-6 space-y-6">
                    {/* Grand Total Display */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100 flex justify-between items-center">
                        <div>
                            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Total Payable</p>
                            <p className="text-3xl font-extrabold text-indigo-950 mt-1">{fmt(totals.grandTotal)}</p>
                        </div>
                        <div className="bg-indigo-500 text-white rounded-lg p-2.5 shadow-md shadow-indigo-200">
                            <CreditCard size={28} />
                        </div>
                    </div>

                    {/* Cash Received Input */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Cash Received (LKR)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">Rs.</span>
                            <input
                                type="number"
                                step="any"
                                autoFocus
                                placeholder="0.00"
                                value={calculatorCashReceived}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCalculatorCashReceived(val);
                                    const parsed = parseFloat(val) || 0;
                                    setCalculatorChangeReturned(Math.max(0, parsed - totals.grandTotal));
                                }}
                                className="w-full bg-white border border-gray-300 rounded-lg py-3.5 pl-12 pr-4 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm"
                            />
                        </div>
                    </div>

                    {/* Quick Cash Buttons */}
                    <div className="space-y-2">
                        <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Cash Shortcuts</span>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setCalculatorCashReceived(totals.grandTotal.toString());
                                    setCalculatorChangeReturned(0);
                                }}
                                className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition duration-200 border border-gray-200 active:scale-95"
                            >
                                Exact Cash
                            </button>
                            {[1000, 2000, 5000, 10000].map((denom) => (
                                <button
                                    key={denom}
                                    type="button"
                                    onClick={() => {
                                        setCalculatorCashReceived(denom.toString());
                                        setCalculatorChangeReturned(Math.max(0, denom - totals.grandTotal));
                                    }}
                                    className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition duration-200 border border-indigo-100 active:scale-95"
                                >
                                    {denom.toLocaleString('en-LK')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Change Returned Display */}
                    <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100 flex justify-between items-center">
                        <div>
                            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Change to Return</p>
                            <p className="text-3xl font-extrabold text-emerald-950 mt-1">{fmt(calculatorChangeReturned)}</p>
                        </div>
                        <div className="bg-emerald-500 text-white rounded-lg p-2.5 shadow-md shadow-emerald-200">
                            <CheckCircle size={28} />
                        </div>
                    </div>

                    {/* Insufficient Cash Warning */}
                    {calculatorCashReceived && (parseFloat(calculatorCashReceived) || 0) < totals.grandTotal && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                            <AlertCircle size={18} />
                            <span>Cash received is less than total payable!</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1 py-3"
                            onClick={() => setIsCalculatorModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={!calculatorCashReceived || (parseFloat(calculatorCashReceived) || 0) < totals.grandTotal || createOrder.isLoading}
                            onClick={async () => {
                                setIsCalculatorModalOpen(false);
                                await handleCheckout(false, parseFloat(calculatorCashReceived), calculatorChangeReturned);
                            }}
                        >
                            {createOrder.isLoading ? 'Checking out...' : 'Confirm & Pay'}
                        </Button>
                    </div>
                </div>
            </Modal>



            <style dangerouslySetInnerHTML={{
                __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
}