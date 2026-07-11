import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';

const ImplantStore = () => {
  const [implants, setImplants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchImplants = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/implants');
      const data = await res.json();
      if (Array.isArray(data)) {
        setImplants(data);
      }
    } catch (error) {
      console.error("Lỗi khi fetch implants:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImplants();
  }, []);

  const uniqueTypes = useMemo(() => {
    const types = new Set(implants.map(i => i.category).filter(Boolean));
    return Array.from(types).sort();
  }, [implants]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  const filteredItems = useMemo(() => {
    let result = [...implants];
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item =>
        (item.name || "").toLowerCase().includes(lowerSearch) ||
        (item.sku || "").toLowerCase().includes(lowerSearch) ||
        (item.category || "").toLowerCase().includes(lowerSearch)
      );
    }
    if (selectedType) {
      result = result.filter(item => item.category === selectedType);
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'quantity') {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [implants, searchTerm, selectedType, sortConfig]);

  const handleExport = () => {
    const data = filteredItems.map(item => ({
      'STT': item.id || '',
      'Mã hàng': item.sku || '',
      'Hãng / Loại': item.category || '',
      'Tên hàng / Kích thước': item.name || '',
      'ĐVT': item.unit || '',
      'Tồn kho': item.quantity || 0
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    if (worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + "1";
        if (worksheet[address]) {
          worksheet[address].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F46E5" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
      }
      worksheet['!cols'] = Object.keys(data[0]).map(k => ({ wch: Math.max(k.length + 5, 15) }));
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Implant");
    XLSX.writeFile(workbook, "Kho_Implant.xlsx");
  };

  return (
    <div className="page-content" style={{ animation: 'fadeIn 0.3s ease' }}>

      <div style={{
        marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
        background: 'linear-gradient(to right, #eff6ff, #e0e7ff)',
        border: '1px solid #c7d2fe',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        borderRadius: '16px',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px',
          background: 'linear-gradient(135deg, #a5b4fc, #818cf8)', opacity: '0.2', borderRadius: '50%', filter: 'blur(20px)'
        }}></div>

        <div style={{ zIndex: 1 }}>
          <h2 style={{ margin: 0, color: '#312e81', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 2 4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" /><path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" /></svg>
            Kho Implant
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', zIndex: 1 }}>
          <button className="btn btn-primary" onClick={fetchImplants} disabled={loading} style={{ background: '#4f46e5', color: 'white', border: 'none', boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.39)', padding: '0.5rem 1rem' }}>
            {loading ? "Đang tải..." : "Làm mới dữ liệu"}
          </button>
          <button className="btn btn-secondary" onClick={handleExport} style={{ backgroundColor: '#10B981', color: 'white', border: 'none', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)', padding: '0.5rem 1rem' }}>
            Tải File Excel
          </button>
        </div>
      </div>

      <div className="card table-container" style={{ borderTop: '4px solid #4f46e5', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Tìm kiếm Tên vật tư, Hãng hoặc Mã hàng..."
            className="form-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px', flex: '1', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
          />
          <select
            className="form-input"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ maxWidth: '250px', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontWeight: '500', color: '#374151' }}
          >
            <option value="">-- Tất cả Hãng / Loại --</option>
            {uniqueTypes.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <table style={{ borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th onClick={() => requestSort('id')} style={{ cursor: 'pointer', userSelect: 'none', borderRadius: '8px 0 0 8px', padding: '1rem' }}>STT{getSortIndicator('id')}</th>
              <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none', padding: '1rem' }}>Kích thước / Tên chi tiết{getSortIndicator('name')}</th>
              <th style={{ padding: '1rem' }}>ĐVT</th>
              <th onClick={() => requestSort('quantity')} style={{ cursor: 'pointer', userSelect: 'none', padding: '1rem' }}>Tồn kho{getSortIndicator('quantity')}</th>
              <th onClick={() => requestSort('sku')} style={{ cursor: 'pointer', userSelect: 'none', padding: '1rem' }}>Mã hàng{getSortIndicator('sku')}</th>
              <th onClick={() => requestSort('category')} style={{ cursor: 'pointer', userSelect: 'none', borderRadius: '0 8px 8px 0', padding: '1rem' }}>Hãng / Loại{getSortIndicator('category')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={item.sku || idx} style={{ backgroundColor: 'white', transition: 'all 0.2s ease', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' }} className="table-row-hover">
                <td style={{ color: '#6b7280', fontSize: '0.875rem', padding: '1rem', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>{item.id}</td>
                <td style={{ color: '#374151', padding: '1rem' }}>{item.name}</td>
                <td style={{ color: '#6b7280', padding: '1rem' }}>{item.unit}</td>
                <td style={{ padding: '1rem' }}>
                  <span className={`badge`} style={{
                    backgroundColor: Number(item.quantity) > 0 ? '#10b981' : '#f3f4f6',
                    color: Number(item.quantity) > 0 ? 'white' : '#6b7280',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    minWidth: '40px',
                    textAlign: 'center',
                    display: 'inline-block'
                  }}>
                    {item.quantity}
                  </span>
                </td>
                <td style={{ fontWeight: '600', color: '#111827', padding: '1rem' }}>{item.sku}</td>
                <td style={{ padding: '1rem', borderTopRightRadius: '8px', borderBottomRightRadius: '8px' }}>
                  <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '500', display: 'inline-block' }}>
                    {item.category}
                  </span>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>Không tìm thấy dữ liệu nào phù hợp!</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <style dangerouslySetInnerHTML={{
          __html: `
          .table-row-hover:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
            z-index: 10;
            position: relative;
          }
        `}} />
      </div>
    </div>
  );
};

export default ImplantStore;
