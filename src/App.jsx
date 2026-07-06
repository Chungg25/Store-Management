import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Activity, ScanLine, Settings, Check, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './index.css';

const getGroupColor = (groupName) => {
  if (!groupName) return 'transparent';
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const Dashboard = ({ items, transactions }) => {
  const totalItems = items.length;
  const lowStockItems = items.filter(i => i.quantity <= i.minThreshold && i.minThreshold > 0).length;

  // Xử lý dữ liệu cho Biểu đồ (Nhóm theo ngày - Chỉ tính "Xuất")
  const chartData = useMemo(() => {
    const dailyData = {};

    transactions.forEach(t => {
      if (t['Hành động'] === 'Xuất') {
        // Cắt lấy phần ngày (YYYY-MM-DD) từ Timestamp
        const dateStr = t['Thời gian'] ? t['Thời gian'].split(' ')[0] : 'N/A';
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = { name: dateStr, 'Lượng xuất': 0 };
        }
        // Cộng dồn số lượng xuất trong ngày đó
        dailyData[dateStr]['Lượng xuất'] += Number(t['Số lượng']);
      }
    });

    // Chuyển object thành array và sắp xếp theo ngày
    return Object.values(dailyData).sort((a, b) => new Date(a.name) - new Date(b.name)).slice(-7); // Lấy 7 ngày gần nhất
  }, [transactions]);

  return (
    <div>
      <div className="page-header">
        <h2>Thống kê tổng quan</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Tổng số mã vật tư</h3>
          <p style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--secondary)' }}>{totalItems}</p>
        </div>
        <div className="card">
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sắp hết (Cần nhập)</h3>
          <p style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--danger)' }}>{lowStockItems}</p>
        </div>
        <div className="card">
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Số lượt giao dịch</h3>
          <p style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary)' }}>{transactions.length}</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--secondary)' }}>Lượng tiêu thụ (7 ngày qua)</h3>
        <div style={{ width: '100%', height: 350 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fill: '#6B7280' }} tickMargin={10} />
                <YAxis tick={{ fill: '#6B7280' }} />
                <Tooltip cursor={{ fill: 'rgba(21, 151, 229, 0.1)' }} />
                <Legend />
                <Bar dataKey="Lượng xuất" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Chưa có dữ liệu xuất kho nào được ghi nhận.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Inventory = ({ items, setItems, fetchItems }) => {
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [editingSku, setEditingSku] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', unit: '', minThreshold: 0 });
  const [transactionSku, setTransactionSku] = useState(null);
  const [transactionType, setTransactionType] = useState(null);
  const [transactionQty, setTransactionQty] = useState(1);
  const [popupError, setPopupError] = useState('');
  const itemsPerPage = 10;

  const uniqueGroups = useMemo(() => {
    const groups = new Set(items.map(i => i.group).filter(Boolean));
    return Array.from(groups).sort();
  }, [items]);

  // Lọc dữ liệu theo Tên, SKU và Nhóm
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const lower = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || 
        (i.name && i.name.toLowerCase().includes(lower)) ||
        (i.sku && i.sku.toLowerCase().includes(lower));
      
      const matchGroup = !selectedGroup || (i.group === selectedGroup);
      
      return matchSearch && matchGroup;
    });
  }, [items, searchTerm, selectedGroup]);

  // Sắp xếp dữ liệu
  const sortedItems = useMemo(() => {
    let sortableItems = [...filteredItems];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        // So sánh chuỗi không phân biệt hoa thường nếu là chuỗi
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredItems, sortConfig]);

  // Phân trang
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage) || 1;
  const currentItems = sortedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  const handleTransactionClick = (sku, type) => {
    if (editingSku === sku) setEditingSku(null);
    setTransactionSku(sku);
    setTransactionType(type);
    setTransactionQty(1);
  };

  const handleConfirmTransaction = async (item) => {
    if (transactionQty <= 0) return;
    const amount = transactionType === 'Nhập' ? transactionQty : -transactionQty;
    if (item.quantity + amount < 0) {
      setPopupError(`Không đủ số lượng để xuất! Hiện tại chỉ còn ${item.quantity} ${item.unit || 'sản phẩm'}.`);
      return;
    }
    await handleUpdateQuantity(item.sku, item.quantity, amount);
    setTransactionSku(null);
  };

  const handleUpdateQuantity = async (sku, currentQty, amount) => {
    const newQty = currentQty + amount;
    if (newQty < 0) return;

    // 1. Cập nhật UI ngay lập tức (Optimistic Update)
    if (setItems) {
      setItems(prevItems => prevItems.map(item => 
        item.sku === sku ? { ...item, quantity: newQty } : item
      ));
    }

    // 2. Chạy ngầm gọi API, không dùng await chặn giao diện
    fetch(`/api/items/${sku}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQty, changeAmount: amount })
    }).then(res => {
      if (!res.ok) {
        alert("Có lỗi xảy ra khi cập nhật số liệu lên Server!");
        fetchItems(); // Lỗi thì tải lại số cũ
      }
    }).catch(error => {
      console.error(error);
      alert("Lỗi kết nối Server.");
      fetchItems(); // Lỗi thì tải lại số cũ
    });
  };

  const handleEditClick = (item) => {
    setEditingSku(item.sku);
    setEditFormData({
      name: item.name || '',
      unit: item.unit || '',
      minThreshold: item.minThreshold || 0
    });
  };

  const handleCancelEdit = () => {
    setEditingSku(null);
  };

  const handleSaveEdit = async (sku) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/items/${sku}/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      if (res.ok) {
        setEditingSku(null);
        await fetchItems();
      } else {
        const data = await res.json();
        alert("Lỗi khi cập nhật: " + (data.detail || ""));
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối Server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Quản lý vật tư</h2>
        <button className="btn btn-primary" onClick={fetchItems} disabled={loading}>
          {loading ? "Đang tải..." : "Làm mới dữ liệu"}
        </button>
      </div>
      <div className="card table-container">
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Tìm kiếm Tên vật tư hoặc SKU..."
            className="form-input"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            style={{ maxWidth: '400px', flex: '1' }}
          />
          <select
            className="form-input"
            value={selectedGroup}
            onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); }}
            style={{ maxWidth: '200px' }}
          >
            <option value="">Tất cả các nhóm</option>
            {uniqueGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th onClick={() => requestSort('sku')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                SKU{getSortIndicator('sku')}
              </th>
              <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Tên vật tư{getSortIndicator('name')}
              </th>
              <th onClick={() => requestSort('quantity')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Tồn kho{getSortIndicator('quantity')}
              </th>
              <th>Đơn vị</th>
              <th onClick={() => requestSort('minThreshold')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Hạn mức{getSortIndicator('minThreshold')}
              </th>
              <th onClick={() => requestSort('group')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Nhóm{getSortIndicator('group')}
              </th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map(item => {
              const isLowStock = item.minThreshold > 0 && item.quantity < item.minThreshold;
              const isEditing = editingSku === item.sku;

              return (
                <tr key={item.sku}>
                  <td>{item.sku}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '0.25rem', fontSize: '0.875rem' }}
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td>
                    <span className={`badge ${isLowStock ? 'badge-danger' : 'badge-success'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '0.25rem', fontSize: '0.875rem', width: '80px' }}
                        value={editFormData.unit}
                        onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                      />
                    ) : (
                      item.unit
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.25rem', fontSize: '0.875rem', width: '80px' }}
                        value={editFormData.minThreshold}
                        onChange={(e) => setEditFormData({ ...editFormData, minThreshold: Number(e.target.value) })}
                      />
                    ) : (
                      item.minThreshold || 0
                    )}
                  </td>
                  <td>
                    {item.group ? (
                      <span className="badge" style={{ backgroundColor: getGroupColor(item.group), color: 'white', whiteSpace: 'nowrap' }}>
                        {item.group}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', minHeight: '32px', alignItems: 'center' }}>
                      {transactionSku === item.sku ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: transactionType === 'Nhập' ? 'var(--primary)' : 'var(--danger)' }}>
                            {transactionType}:
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            style={{ width: '60px', padding: '0.25rem' }}
                            value={transactionQty}
                            onChange={(e) => setTransactionQty(Number(e.target.value))}
                          />
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#10B981', marginLeft: '4px' }}
                            onClick={() => handleConfirmTransaction(item)}
                            disabled={loading}
                          >
                            ✓
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#6B7280' }}
                            onClick={() => setTransactionSku(null)}
                            disabled={loading}
                          >
                            ✕
                          </button>
                        </div>
                      ) : isEditing ? (
                        <>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#10B981' }}
                            onClick={() => handleSaveEdit(item.sku)}
                            disabled={loading}
                          >
                            ✓ Lưu
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#6B7280' }}
                            onClick={handleCancelEdit}
                            disabled={loading}
                          >
                            ✕ Hủy
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#F59E0B' }}
                            onClick={() => {
                              setTransactionSku(null);
                              handleEditClick(item);
                            }}
                            disabled={loading}
                          >
                            Sửa
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleTransactionClick(item.sku, 'Nhập')}
                            disabled={loading}
                          >
                            Nhập
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleTransactionClick(item.sku, 'Xuất')}
                            disabled={loading}
                          >
                            Xuất
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                  Không có dữ liệu hoặc đang tải...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sortedItems.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Hiển thị {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedItems.length)} trong tổng số {sortedItems.length} vật tư
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn"
              style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border)', background: 'white' }}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Trang trước
            </button>
            <span style={{ padding: '0.25rem 0.75rem', fontWeight: '500' }}>{currentPage} / {totalPages}</span>
            <button
              className="btn"
              style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border)', background: 'white' }}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}

      {popupError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'white', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '90%', textAlign: 'center',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#111827', fontSize: '1.25rem' }}>Lỗi giao dịch</h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#4B5563', lineHeight: 1.5 }}>
              {popupError}
            </p>
            <button
              onClick={() => setPopupError('')}
              style={{
                background: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem',
                borderRadius: '6px', fontWeight: '500', cursor: 'pointer', width: '100%'
              }}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Transactions = ({ transactions, fetchItems }) => {
  return (
    <div>
      <div className="page-header">
        <h2>Lịch sử Giao dịch</h2>
        <button className="btn btn-primary" onClick={fetchItems}>
          Làm mới
        </button>
      </div>
      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Hành động</th>
              <th>Mã hàng</th>
              <th>Tên hàng</th>
              <th>Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {[...transactions].reverse().map((t, idx) => (
              <tr key={idx}>
                <td style={{ color: 'var(--text-muted)' }}>{t['Thời gian']}</td>
                <td>
                  <span className={`badge ${t['Hành động'] === 'Nhập' ? 'badge-success' : 'badge-danger'}`}>
                    {t['Hành động']}
                  </span>
                </td>
                <td>{t['Mã hàng']}</td>
                <td>{t['Tên hàng']}</td>
                <td style={{ fontWeight: '600' }}>{t['Số lượng']} {t['Đơn vị']}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>
                  Chưa có lịch sử giao dịch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OcrScanner = ({ items }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrData, setOcrData] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setOcrData(null);
    }
  };

  const handleItemChange = (index, field, value) => {
    if (!ocrData || !ocrData.data) return;
    const newData = [...ocrData.data];
    newData[index][field] = value;
    setOcrData({ ...ocrData, data: newData });
  };

  const handleSave = async () => {
    if (!selectedFile || !ocrData || !ocrData.data) return;
    setSaving(true);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('data', JSON.stringify(ocrData.data));

    try {
      const res = await fetch('/api/save-ocr', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        // alert("Thành công!\n" + data.message);
        // Có thể reset state sau khi lưu thành công
        // setSelectedFile(null);
        // setPreviewUrl(null);
        // setOcrData(null);
      } else {
        alert("Lỗi khi lưu: " + (data.detail || "Không rõ lỗi"));
      }
    } catch (err) {
      console.error(err);
      alert("Không thể kết nối đến máy chủ.");
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setOcrData(data);
      } else {
        alert("Lỗi khi quét ảnh: " + (data.detail || "Không rõ lỗi"));
      }
    } catch (err) {
      console.error(err);
      alert("Không thể kết nối đến máy chủ OCR.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Quét Hóa đơn</h2>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <input type="file" accept="image/*" onChange={handleFileChange} style={{ marginBottom: '1rem' }} />
        <br />
        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={!selectedFile || loading}
        >
          {loading ? "Đang xử lý (Vui lòng đợi)..." : "Bắt đầu Quét"}
        </button>
      </div>

      {previewUrl && (
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          {/* Cột trái: Ảnh */}
          <div className="card" style={{ flex: 1, minWidth: '300px' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Ảnh gốc</h3>
            <img src={previewUrl} alt="Preview" style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          </div>

          {/* Cột phải: Text OCR */}
          <div className="card" style={{ flex: 1, minWidth: '300px' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Kết quả nhận diện</h3>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Đang chạy AI để phân tích...</p>
            ) : ocrData && Array.isArray(ocrData.data) ? (
              <div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Hệ thống tự động đối chiếu với danh mục vật tư trong kho. Vui lòng sửa lại tên/đơn vị ở bảng dưới nếu chưa khớp.
                </p>

                <datalist id="inventory-names">
                  {items.map(i => <option key={i.sku} value={i.name} />)}
                </datalist>

                {(() => {
                  const matchedItems = [];
                  const unmatchedItems = [];
                  ocrData.data.forEach((item, idx) => {
                    const isMatch = items.some(dbItem =>
                      dbItem.name?.toLowerCase() === (item["tên mặt hàng"] || "").trim().toLowerCase() &&
                      dbItem.unit?.toLowerCase() === (item["đơn vị tính"] || "").trim().toLowerCase()
                    );
                    if (isMatch || item.isNewItem) {
                      matchedItems.push({ ...item, originalIndex: idx, isMatch: isMatch });
                    } else {
                      unmatchedItems.push({ ...item, originalIndex: idx });
                    }
                  });

                  return (
                    <>
                      {matchedItems.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ color: 'var(--success)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></span>
                            Mặt hàng hợp lệ ({matchedItems.length})
                          </h4>
                          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 1 }}>
                                <tr>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>Tên mặt hàng</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', width: '80px' }}>ĐVT</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', width: '80px' }}>SL</th>
                                </tr>
                              </thead>
                              <tbody>
                                {matchedItems.map((item) => (
                                  <tr key={item.originalIndex}>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {item.isNewItem && !item.isMatch && (
                                          <span className="badge badge-success" style={{ backgroundColor: '#10B981', color: 'white' }}>MỚI</span>
                                        )}
                                        <input
                                          type="text"
                                          className="form-input"
                                          list="inventory-names"
                                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%', borderColor: 'var(--success)', backgroundColor: 'var(--success-bg)' }}
                                          value={item["tên mặt hàng"] || ''}
                                          onChange={(e) => handleItemChange(item.originalIndex, "tên mặt hàng", e.target.value)}
                                        />
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <input
                                        type="text"
                                        className="form-input"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%', borderColor: 'var(--success)', backgroundColor: 'var(--success-bg)' }}
                                        value={item["đơn vị tính"] || ''}
                                        onChange={(e) => handleItemChange(item.originalIndex, "đơn vị tính", e.target.value)}
                                      />
                                    </td>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <input
                                        type="number"
                                        className="form-input"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                                        value={item["số lượng"] || 0}
                                        onChange={(e) => handleItemChange(item.originalIndex, "số lượng", Number(e.target.value))}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {unmatchedItems.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--danger)' }}></span>
                            Cần điều chỉnh ({unmatchedItems.length})
                          </h4>
                          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 1 }}>
                                <tr>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>Tên mặt hàng (Gõ để tìm)</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', width: '80px' }}>ĐVT</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', width: '80px' }}>SL</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', width: '100px' }}>Hành động</th>
                                </tr>
                              </thead>
                              <tbody>
                                {unmatchedItems.map((item) => (
                                  <tr key={item.originalIndex}>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <input
                                        type="text"
                                        className="form-input"
                                        list="inventory-names"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%', borderColor: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}
                                        value={item["tên mặt hàng"] || ''}
                                        onChange={(e) => handleItemChange(item.originalIndex, "tên mặt hàng", e.target.value)}
                                        placeholder="Nhập tên đúng..."
                                      />
                                    </td>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <input
                                        type="text"
                                        className="form-input"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%', borderColor: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}
                                        value={item["đơn vị tính"] || ''}
                                        onChange={(e) => handleItemChange(item.originalIndex, "đơn vị tính", e.target.value)}
                                        placeholder="ĐVT..."
                                      />
                                    </td>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <input
                                        type="number"
                                        className="form-input"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                                        value={item["số lượng"] || 0}
                                        onChange={(e) => handleItemChange(item.originalIndex, "số lượng", Number(e.target.value))}
                                      />
                                    </td>
                                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                      <button
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#10B981', width: '100%' }}
                                        onClick={() => handleItemChange(item.originalIndex, "isNewItem", true)}
                                      >
                                        + Tạo mới
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}


                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Đang lưu..." : "Lưu & Xác nhận"}
                </button>
              </div>
            ) : ocrData ? (
              <p style={{ color: 'var(--danger)' }}>Lỗi: Dữ liệu AI trả về không đúng định dạng mảng.</p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Chưa có dữ liệu. Vui lòng bấm Quét để bắt đầu.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar = () => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <div className="sidebar">
      <div className="logo">
        DR. <span>SMILE</span>
      </div>
      <nav>
        <Link to="/" className={`nav-link ${isActive('/')}`}>
          <LayoutDashboard size={20} /> Dashboard
        </Link>
        <Link to="/inventory" className={`nav-link ${isActive('/inventory')}`}>
          <Package size={20} /> Kho vật tư
        </Link>
        <Link to="/transactions" className={`nav-link ${isActive('/transactions')}`}>
          <Activity size={20} /> Lịch sử Giao dịch
        </Link>
        <Link to="/ocr" className={`nav-link ${isActive('/ocr')}`}>
          <ScanLine size={20} /> Quét Hóa đơn
        </Link>
        <Link to="/settings" className={`nav-link ${isActive('/settings')}`}>
          <Settings size={20} /> Cài đặt Hệ thống
        </Link>
      </nav>
    </div>
  );
};

function App() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const fetchAllData = async () => {
    try {
      const [resItems, resTrans] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/transactions')
      ]);

      const dataItems = await resItems.json();
      const dataTrans = await resTrans.json();

      if (Array.isArray(dataItems)) setItems(dataItems);
      if (Array.isArray(dataTrans)) setTransactions(dataTrans);
    } catch (error) {
      console.error("Lỗi khi fetch data:", error);
    }
  };

  useEffect(() => {
    // Tải lần đầu tiên ngay khi mở web
    fetchAllData();

    // Thiết lập tự động tải lại mỗi 15 giây (Auto-polling)
    const intervalId = setInterval(() => {
      fetchAllData();
    }, 15000);

    // Dọn dẹp interval khi đóng component
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard items={items} transactions={transactions} />} />
            <Route path="/inventory" element={<Inventory items={items} setItems={setItems} fetchItems={fetchAllData} />} />
            <Route path="/transactions" element={<Transactions transactions={transactions} fetchItems={fetchAllData} />} />
            <Route path="/ocr" element={<OcrScanner items={items} />} />
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
