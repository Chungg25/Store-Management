import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Activity, ScanLine, Settings, Check, X, Menu } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ItemHistoryCalendar from './ItemHistoryCalendar';
import ImplantStore from './ImplantStore';

import * as XLSX from 'xlsx-js-style';
import './index.css';


import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Transactions from './components/Transactions';

import Sidebar from './components/Sidebar';

function App() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [implants, setImplants] = useState([]);

  const fetchAllData = async () => {
    try {
      const [resItems, resTrans, resImplants] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/transactions'),
        fetch('/api/implants')
      ]);

      const dataItems = await resItems.json();
      const dataTrans = await resTrans.json();
      const dataImplants = await resImplants.json();

      if (Array.isArray(dataItems)) setItems(dataItems);
      if (Array.isArray(dataTrans)) setTransactions(dataTrans);
      if (Array.isArray(dataImplants)) setImplants(dataImplants);
    } catch (error) {
      console.error("Lỗi khi fetch data:", error);
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  return (
    <Router>
      <div className="app-container">
        <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
        <main className="main-content">
          <div className="mobile-header">
            <button className="btn" onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'transparent', border: 'none', padding: '0.5rem', display: 'flex', alignItems: 'center' }}>
              <Menu size={24} color="var(--secondary)" />
            </button>
            <div className="logo-mobile">DR. <span>SMILE</span></div>
            <div style={{ width: 40 }}></div>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard items={items} transactions={transactions} />} />
            <Route path="/inventory" element={<Inventory items={items} setItems={setItems} fetchItems={fetchAllData} transactions={transactions} setTransactions={setTransactions} implants={implants} />} />
            <Route path="/implant" element={<ImplantStore />} />
            <Route path="/item/:sku" element={<ItemHistoryCalendar items={items} transactions={transactions} />} />
            <Route path="/transactions" element={<Transactions transactions={transactions} fetchItems={fetchAllData} />} />
            
            <Route path="/settings" element={
              <div className="page-header">
                <h2>Cài đặt</h2>
                <p>Google Sheets & SMTP Mail đã được cấu hình ở Backend.</p>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
