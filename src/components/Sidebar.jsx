import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Activity, ScanLine, Settings, X } from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <>
      {/* Nền xám mờ khi mở menu trên mobile */}
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)}></div>}

      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>DR. <span>SMILE</span></div>
          <button className="mobile-only btn" onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'white', border: 'none', padding: 0 }}>
            <X size={24} />
          </button>
        </div>
        <nav>
          <Link to="/" className={`nav-link ${isActive('/')}`} onClick={() => setIsOpen(false)}>
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link to="/inventory" className={`nav-link ${isActive('/inventory')}`} onClick={() => setIsOpen(false)}>
            <Package size={20} /> Kho vật tư
          </Link>
          <Link to="/implant" className={`nav-link ${isActive('/implant')}`} onClick={() => setIsOpen(false)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 2 4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" /><path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" /></svg> Kho Implant
          </Link>
          <Link to="/transactions" className={`nav-link ${isActive('/transactions')}`} onClick={() => setIsOpen(false)}>
            <Activity size={20} /> Lịch sử
          </Link>
          
          
        </nav>
      </div>
    </>
  );
};


export default Sidebar;
