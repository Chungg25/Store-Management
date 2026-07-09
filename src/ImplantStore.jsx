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

  // Parse types from names (e.g. "Trụ Implant Dentium Hàn" -> "Hàn", "Mỹ", "Pháp", "Thụy Sĩ")
  const uniqueTypes = useMemo(() => {
    const types = new Set();
    implants.forEach(item => {
      const name = (item.name || "").toLowerCase();
      if (name.includes('hàn')) types.add('Hàn Quốc');
      else if (name.includes('mỹ')) types.add('Mỹ');
      else if (name.includes('pháp')) types.add('Pháp');
      else if (name.includes('thụy sĩ') || name.includes('thuỵ sĩ')) types.add('Thụy Sĩ');
      else if (name.includes('đức')) types.add('Đức');
    });
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
        (item.sku || "").toLowerCase().includes(lowerSearch)
      );
    }
    if (selectedType) {
      const lowerType = selectedType.toLowerCase();
      result = result.filter(item => {
         const name = (item.name || "").toLowerCase();
         if (lowerType === 'hàn quốc') return name.includes('hàn');
         if (lowerType === 'mỹ') return name.includes('mỹ');
         if (lowerType === 'pháp') return name.includes('pháp');
         if (lowerType === 'đức') return name.includes('đức');
         if (lowerType === 'thụy sĩ') return name.includes('thụy sĩ') || name.includes('thuỵ sĩ');
         return true;
      });
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
      'Tên hàng / Kích thước': item.name || '',
      'ĐVT': item.unit || '',
      'Tồn kho': item.quantity || 0
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Apply styling helper if available (or duplicate here to keep it simple)
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
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div>
          <h2>Kho Implant</h2>
          <p className="text-muted">Tra cứu tồn kho các loại trụ Implant (Chỉ xem)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport} style={{ backgroundColor: '#10B981', color: 'white', border: 'none' }}>
            Xuất Excel
          </button>
          <button className="btn btn-primary" onClick={fetchImplants} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới dữ liệu"}
          </button>
        </div>
      </div>

      <div className="card table-container">
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Tìm kiếm Tên vật tư hoặc Mã hàng..."
            className="form-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px', flex: '1' }}
          />
          <select
            className="form-input"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ maxWidth: '200px' }}
          >
            <option value="">Tất cả các loại</option>
            {uniqueTypes.map(g => (
              <option key={g} value={g}>Trụ {g}</option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th onClick={() => requestSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>STT{getSortIndicator('id')}</th>
              <th onClick={() => requestSort('sku')} style={{ cursor: 'pointer', userSelect: 'none' }}>Mã hàng{getSortIndicator('sku')}</th>
              <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tên hàng / Kích thước{getSortIndicator('name')}</th>
              <th>ĐVT</th>
              <th onClick={() => requestSort('quantity')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tồn kho{getSortIndicator('quantity')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={item.sku || idx}>
                <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>{item.id}</td>
                <td style={{ fontWeight: '500', color: '#1f2937' }}>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.unit}</td>
                <td>
                  <span className={`badge badge-success`} style={{ backgroundColor: Number(item.quantity) > 0 ? '#10b981' : '#6b7280' }}>
                    {item.quantity}
                  </span>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Không tìm thấy vật tư Implant nào!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ImplantStore;
