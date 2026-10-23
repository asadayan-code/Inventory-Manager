import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShoppingCart,
  Receipt,
  RotateCcw,
  Package,
  Boxes,
  ShieldCheck,
  Wrench,
  Users,
  Building2,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Volume2,
  VolumeX,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { soundEffects } from '../utils/scanner';

export type NavTab =
  | 'pos'
  | 'bills'
  | 'returns'
  | 'products'
  | 'stock'
  | 'serials'
  | 'job_cards'
  | 'customers'
  | 'suppliers'
  | 'cash_expenses'
  | 'reports'
  | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  registerOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  soundEnabled,
  onToggleSound,
  registerOpen = true,
}) => {
  const { user, logout } = useAuth();

  const isOwner = user?.role === 'OWNER';

  const navItems = [
    { id: 'pos', label: 'POS Counter', icon: ShoppingCart, hotkey: 'F1' },
    { id: 'bills', label: 'Bills & Quotes', icon: Receipt },
    { id: 'returns', label: 'Returns', icon: RotateCcw, ownerOnly: true },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'stock', label: 'Inventory', icon: Boxes },
    { id: 'serials', label: 'Warranty & Serials', icon: ShieldCheck },
    { id: 'job_cards', label: 'Job Cards', icon: Wrench },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Building2 },
    { id: 'cash_expenses', label: 'Cash & Expenses', icon: DollarSign },
    { id: 'reports', label: 'Reports', icon: BarChart3, ownerOnly: true },
    { id: 'settings', label: 'Settings & Admin', icon: Settings, ownerOnly: true },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md select-none print:hidden">
      {/* Top Brand Bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center font-black text-white text-sm shadow-xs">
              SA
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white block leading-tight">
                Sohail Autos <span className="text-emerald-400 font-semibold text-xs">Retail POS</span>
              </span>
              <span className="text-[10px] text-slate-400">Offline Desktop Edition • PKR Currency</span>
            </div>
          </div>

          {/* Cash Register Status */}
          <div className="ml-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${registerOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className={registerOpen ? 'text-emerald-300' : 'text-amber-300'}>
              Register: {registerOpen ? 'OPEN' : 'CLOSED'}
            </span>
          </div>

          {/* Barcode Scanner Ready Badge */}
          <div className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/60">
            <span className="text-emerald-400 font-mono">USB SCANNER READY</span>
          </div>
        </div>

        {/* User Badge, Sound Toggle & Logout */}
        <div className="flex items-center gap-3">
          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Barcode Scan Audio Enabled' : 'Barcode Scan Audio Muted'}
            className="flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span className="text-[11px]">{soundEnabled ? 'Beep On' : 'Muted'}</span>
          </button>

          {/* Current User Info */}
          <div className="flex items-center gap-2 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <span className="font-bold text-slate-200 block text-[11px] leading-tight">
                {user?.full_name || user?.username}
              </span>
              <span className={`text-[9px] font-extrabold uppercase tracking-wider ${
                isOwner ? 'text-amber-400' : 'text-sky-400'
              }`}>
                {user?.role}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Lock / Exit</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav className="flex items-center px-2 overflow-x-auto scrollbar-none bg-slate-950/70">
        {navItems.map((item) => {
          if (item.ownerOnly && !isOwner) return null;
          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as NavTab)}
              className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'border-emerald-500 text-emerald-400 bg-slate-800/80 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{item.label}</span>
              {item.hotkey && (
                <kbd className="hidden md:inline-block bg-slate-800 text-slate-400 border border-slate-700 text-[10px] px-1 rounded font-mono">
                  {item.hotkey}
                </kbd>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
