import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, NavTab } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { SalesCounter } from './pages/SalesCounter';
import { BillsList } from './pages/BillsList';
import { ReturnsPage } from './pages/ReturnsPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockPage } from './pages/StockPage';
import { SerialsWarrantyPage } from './pages/SerialsWarrantyPage';
import { JobCardsPage } from './pages/JobCardsPage';
import { CustomersSuppliersPage } from './pages/CustomersSuppliersPage';
import { CashExpensesPage } from './pages/CashExpensesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsUsersPage } from './pages/SettingsUsersPage';
import { soundEffects, initGlobalScanner } from './utils/scanner';

function MainApp() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('pos');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Toggle scan sound
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.enabled = next;
  };

  // Global keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        setCurrentTab('pos');
      } else if (e.key === 'F6') {
        setCurrentTab('bills');
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-xl mb-3 animate-pulse">
          PA
        </div>
        <p className="text-xs text-slate-400 font-mono">Initializing PakAudio POS Offline Engine...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        registerOpen={true}
      />

      <main className="flex-1 flex overflow-hidden">
        {currentTab === 'pos' && <SalesCounter />}
        {currentTab === 'bills' && <BillsList />}
        {currentTab === 'returns' && <ReturnsPage />}
        {currentTab === 'products' && <ProductsPage />}
        {currentTab === 'stock' && <StockPage />}
        {currentTab === 'serials' && <SerialsWarrantyPage />}
        {currentTab === 'job_cards' && <JobCardsPage />}
        {(currentTab === 'customers' || currentTab === 'suppliers') && <CustomersSuppliersPage />}
        {currentTab === 'cash_expenses' && <CashExpensesPage />}
        {currentTab === 'reports' && <ReportsPage />}
        {currentTab === 'settings' && <SettingsUsersPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
