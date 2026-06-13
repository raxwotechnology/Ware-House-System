import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BarChart3, Package, ShoppingCart, Users, Settings,
    FolderTree, Award, UserCircle, Tags, Warehouse, Boxes, Truck,
    ShoppingBag, FileText, Receipt, Wallet, Workflow, Factory, ShieldCheck,
    RotateCcw, Wrench, AlertTriangle, FileMinus, X, Users as UsersIcon, Building2, Clock, Calendar as CalendarIcon, Plane, Calculator, DollarSign,
    Landmark, FileCheck, PackageCheck, ArrowRightLeft, ChevronDown, ChevronRight, Plus, PanelLeftClose
} from 'lucide-react';

// ── Menu structure ──────────────────────────────────────────────────
const menuItems = [
    {
        label: 'Dashboard',
        id: 'dashboard',
        icon: LayoutDashboard,
        path: '/dashboard',
    },
    {
        label: 'People',
        id: 'people',
        icon: UsersIcon,
        children: [
            { label: 'Customers', path: '/customers' },
            { label: 'Suppliers', path: '/suppliers' },
            { label: 'Staff / Users', path: '/users', adminOnly: true },
            { label: 'Customer Groups', path: '/customer-groups' },
        ],
    },
    {
        label: 'Sales',
        id: 'sales',
        icon: ShoppingCart,
        children: [
            { label: 'POS Terminal', path: '/pos' },
            { label: 'POS Registers', path: '/pos-sessions' },
            { label: 'Sales Orders', path: '/sales-orders' },
            { label: 'Wholesale Prices', path: '/wholesale-prices' },
            { label: 'Invoices', path: '/invoices' },
            { label: 'Payments Received', path: '/payments' },
        ],
    },
    {
        label: 'Inventory',
        id: 'inventory',
        icon: Package,
        children: [
            { label: 'Products', path: '/products' },
            { label: 'Categories', path: '/categories' },
            { label: 'Brands', path: '/brands' },
            { label: 'Stock Levels', path: '/stock' },
            { label: 'Warehouses', path: '/warehouses' },
            { label: 'Stock Transfers', path: '/stock/transfer' },
            { label: 'Stock Adjustment', path: '/stock/adjustment' },
            { label: 'Damages Register', path: '/damages' },
        ],
    },
    {
        label: 'Procurement',
        id: 'procurement',
        icon: ShoppingBag,
        children: [
            { label: 'Purchase Orders', path: '/purchase-orders' },
            { label: 'Goods Received (GRN)', path: '/grns' },
            { label: 'Supplier Returns', path: '/supplier-returns' },
            { label: 'Purchase Bills', path: '/bills' },
        ],
    },
    {
        label: 'Finance',
        id: 'finance',
        icon: Landmark,
        children: [
            { label: 'Bank Accounts', path: '/bank-accounts' },
            { label: 'Expenses', path: '/expenses' },
            { label: 'Fund Transfers', path: '/fund-transfers' },
            { label: 'Cheque Registry', path: '/cheques' },
            { label: 'Credit Notes', path: '/credit-notes' },
        ],
    },
    {
        label: 'Manufacturing',
        id: 'production',
        icon: Factory,
        children: [
            { label: 'BOMs (Recipes)', path: '/boms' },
            { label: 'Production Orders', path: '/production-orders' },
        ],
    },
    {
        label: 'HR & Payroll',
        id: 'hr',
        icon: Building2,
        children: [
            { label: 'Employees', path: '/employees' },
            { label: 'Attendance', path: '/attendance' },
            { label: 'Payroll Management', path: '/payroll' },
        ],
    },
    {
        label: 'Analytics',
        id: 'analytics',
        icon: BarChart3,
        path: '/reports',
    },
    {
        label: 'Settings',
        id: 'settings',
        icon: Settings,
        path: '/settings',
    },
];

export default function Sidebar({ userRole, isOpen, onClose }) {
    const sidebarRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const [expandedItems, setExpandedItems] = useState({});

    const toggleExpand = (id) => {
        setExpandedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const isChildActive = (item) => {
        return item.children?.some(child => location.pathname === child.path);
    };

    // Auto-expand active parent
    useEffect(() => {
        const initialExpanded = {};
        menuItems.forEach(item => {
            if (isChildActive(item)) {
                initialExpanded[item.id] = true;
            }
        });
        setExpandedItems(prev => ({ ...prev, ...initialExpanded }));
    }, [location.pathname]);

    const visibleItems = menuItems
        .filter(item => !item.adminOnly || userRole === 'admin')
        .map(item => {
            if (item.children) {
                return {
                    ...item,
                    children: item.children.filter(child => !child.adminOnly || userRole === 'admin')
                };
            }
            return item;
        })
        .filter(item => !item.children || item.children.length > 0);

    const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
    const newMenuRef = useRef(null);

    // Close new menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (newMenuRef.current && !newMenuRef.current.contains(event.target)) {
                setIsNewMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const newActions = [
        { label: 'New Invoice', path: '/invoices/new', icon: Receipt },
        { label: 'New Sales Order', path: '/sales-orders/new', icon: ShoppingCart },
        { label: 'New GRN', path: '/grns', icon: PackageCheck },
        { label: 'New Customer', path: '/customers', icon: UsersIcon },
    ];

    return (
        <>
            {/* Backdrop overlay (mobile layer) */}
            {isOpen && (
                <div className="fixed inset-0 bg-gray-900/10 backdrop-blur-[2px] z-30 lg:hidden" />
            )}

            {/* Sidebar panel */}
            <aside
                ref={sidebarRef}
                className={`h-screen bg-white border-r border-gray-100 flex flex-col z-40 shadow-sm transition-all duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full lg:translate-x-0 w-0'} 
                    fixed lg:relative inset-y-0 left-0`}
                style={{
                    width: isOpen ? '280px' : '0px',
                    minWidth: isOpen ? '280px' : '0px',
                    overflow: 'hidden',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    flexShrink: 0,
                }}
            >
                <div className="w-[280px] flex flex-col h-full bg-white">

                    {/* ── Logo / Brand ── */}
                    <div className="p-6 flex items-center justify-between flex-shrink-0 bg-white">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                                <Package className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-gray-900 text-xl tracking-tight">RC Traders</h2>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all"
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    </div>

                    {/* ── Quick Action ── */}
                    <div className="px-6 mb-4 relative" ref={newMenuRef}>
                        <button 
                            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl shadow-sm text-sm font-medium transition-all group ${
                                isNewMenuOpen ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-white border border-gray-100 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <Plus size={18} className={isNewMenuOpen ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'} />
                                <span>New</span>
                            </div>
                            <ChevronDown size={14} className={isNewMenuOpen ? 'text-white rotate-180' : 'text-gray-300'} />
                        </button>

                        {/* New Menu Dropdown */}
                        {isNewMenuOpen && (
                            <div className="absolute top-full left-6 right-6 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {newActions.map((action, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            navigate(action.path);
                                            setIsNewMenuOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                                    >
                                        <action.icon size={16} />
                                        <span>{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Scrollable nav ── */}
                    <nav className="flex-1 overflow-y-auto py-2 px-4 custom-scrollbar space-y-1">
                        {visibleItems.map((item) => {
                            const Icon = item.icon;
                            const isExpanded = expandedItems[item.id];
                            const isActive = location.pathname === item.path || isChildActive(item);
                            const hasChildren = item.children && item.children.length > 0;

                            return (
                                <div key={item.id} className="space-y-1">
                                    {hasChildren ? (
                                        <button
                                            onClick={() => toggleExpand(item.id)}
                                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${isActive
                                                    ? 'bg-gray-100 text-gray-900'
                                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                                }`}
                                        >
                                            {isActive && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full" />
                                            )}
                                            <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                            <span className="truncate">{item.label}</span>
                                            <div className="ml-auto">
                                                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                            </div>
                                        </button>
                                    ) : (
                                        <NavLink
                                            to={item.path}
                                            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${location.pathname === item.path
                                                    ? 'bg-gray-100 text-gray-900'
                                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                                }`}
                                        >
                                            {location.pathname === item.path && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full" />
                                            )}
                                            <Icon size={18} className={`flex-shrink-0 ${location.pathname === item.path ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                            <span className="truncate">{item.label}</span>
                                        </NavLink>
                                    )}

                                    {hasChildren && isExpanded && (
                                        <div className="ml-9 space-y-1 mt-1 border-l border-gray-100">
                                            {item.children.map((child) => (
                                                <NavLink
                                                    key={child.path}
                                                    to={child.path}
                                                    className={({ isActive }) =>
                                                        `block px-4 py-2 text-sm font-medium rounded-lg transition-all ${isActive
                                                            ? 'text-indigo-600'
                                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                                        }`
                                                    }
                                                >
                                                    {child.label}
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>

                    {/* ── User Profile / Footer ── */}
                    <div className="p-4 border-t border-gray-50 bg-white">
                        <div className="flex items-center gap-3 px-2 py-1">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                                {userRole?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate capitalize">{userRole}</p>
                                <p className="text-[11px] text-gray-500 truncate">Main Branch</p>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #f1f5f9;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #e2e8f0;
                }
            `}} />
        </>
    );
}