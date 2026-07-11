import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Activity, ScanLine, Settings, Check, X, Menu } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ItemHistoryCalendar from './ItemHistoryCalendar';
import ImplantStore from './ImplantStore';

import * as XLSX from 'xlsx-js-style';
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

const Inventory = ({ items, setItems, fetchItems, transactions, setTransactions }) => {
  const [showImportantOnly, setShowImportantOnly] = useState(false);
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
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionSubSku, setTransactionSubSku] = useState('');
  const [popupError, setPopupError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({ name: '', unit: '', quantity: 0, conversion: '', minThreshold: 0, group: '', date: '' });
  const [isAdding, setIsAdding] = useState(false);

  const [reportStartMonth, setReportStartMonth] = useState('');
  const [reportEndMonth, setReportEndMonth] = useState('');
  const itemsPerPage = 10;

  const uniqueGroups = useMemo(() => {
    const groups = new Set(items.map(i => i.group).filter(Boolean));
    return Array.from(groups).sort();
  }, [items]);

  // Lọc dữ liệu theo Tên, SKU và Nhóm
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (showImportantOnly && !i.isImportant) return false;

      const lower = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        (i.name && i.name.toLowerCase().includes(lower)) ||
        (i.sku && i.sku.toLowerCase().includes(lower));

      const matchGroup = !selectedGroup || (i.group === selectedGroup);

      return matchSearch && matchGroup;
    });
  }, [items, searchTerm, selectedGroup, showImportantOnly]);

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
    const today = new Date();
    setTransactionDate(new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().substring(0, 10));
  };

  const handleConfirmTransaction = async (item) => {
    if (transactionQty <= 0) return;
    
    const cleanItemName = (item.name || '').trim().toLowerCase();
    const relatedImplants = implants.filter(imp => (imp.category || '').trim().toLowerCase() === cleanItemName);
    if (relatedImplants.length > 0 && !transactionSubSku) {
      setPopupError("Vui lòng chọn Kích thước / Size!");
      return;
    }
    
    const amount = transactionType === 'Nhập' ? transactionQty : -transactionQty;
    if (item.quantity + amount < 0) {
      setPopupError(`Không đủ số lượng để xuất! Hiện tại chỉ còn ${item.quantity} ${item.unit || 'sản phẩm'}.`);
      return;
    }
    
    let subName = '';
    if (transactionSubSku) {
      subName = implants.find(imp => imp.sku === transactionSubSku)?.name || '';
    }
    
    await handleUpdateQuantity(item.sku, item.quantity, amount, transactionSubSku, subName);
    setTransactionSku(null);
    setTransactionSubSku('');
  };

  const handleUpdateQuantity = async (sku, currentQty, amount, subSku = '', subName = '') => {
    const newQty = currentQty + amount;
    if (newQty < 0) return;

    // 1. Cập nhật UI ngay lập tức (Optimistic Update)
    if (setItems) {
      setItems(prevItems => prevItems.map(item =>
        item.sku === sku ? { ...item, quantity: newQty } : item
      ));
    }

    // Thêm log lịch sử tạm thời cho UI
    if (setTransactions) {
      const action = amount > 0 ? 'Nhập' : 'Xuất';
      const person = action === 'Nhập' ? 'Đan' : 'Bình';
      const now = new Date();
      let dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().substring(0, 10);
      if (transactionDate) dateStr = transactionDate;
      const timeStr = `${dateStr} ${new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().substring(11, 19)}`;
      const targetItem = items.find(i => i.sku === sku);
      let item_name = targetItem ? targetItem.name : sku;
      if (subName) item_name = `${item_name} (Size: ${subName})`;

      setTransactions(prev => [{
        "Thời gian": timeStr,
        "Hành động": action,
        "Mã hàng": sku,
        "Tên hàng": item_name,
        "Số lượng": Math.abs(amount),
        "Đơn vị": targetItem ? targetItem.unit : "",
        "Người thực hiện": person
      }, ...prev]);
    }

    // 2. Chạy ngầm gọi API, không dùng await chặn giao diện
    fetch(`/api/items/${sku}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        quantity: newQty, 
        changeAmount: amount,
        date: transactionDate || null,
        sub_sku: subSku || null,
        sub_name: subName || null
      })
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        let err = data.detail || "Ghi sai cột";
        if (typeof err === "object") err = JSON.stringify(err);
        setPopupError("Lỗi đồng bộ Server: " + err);
        fetchItems(); // Lỗi thì tải lại số cũ
      } else {
        // Tải lại API sau 3 giây để lấy dữ liệu chuẩn nhất từ máy chủ
        setTimeout(() => {
          fetchItems();
        }, 3000);
      }
    }).catch(error => {
      console.error(error);
      setPopupError("Lỗi kết nối Server.");
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
    // 1. Cập nhật UI ngay lập tức
    if (setItems) {
      setItems(prevItems => prevItems.map(item =>
        item.sku === sku ? {
          ...item,
          name: editFormData.name,
          unit: editFormData.unit,
          minThreshold: editFormData.minThreshold
        } : item
      ));
    }
    setEditingSku(null);

    // 2. Chạy ngầm gọi API
    fetch(`/api/items/${sku}/details`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editFormData })
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPopupError("Lỗi khi cập nhật chi tiết: " + (data.detail || "Ghi sai cột"));
        fetchItems(); // Lỗi thì tải lại số cũ
      }
    }).catch(error => {
      console.error(error);
      setPopupError("Lỗi kết nối Server.");
      fetchItems(); // Lỗi thì tải lại số cũ
    });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addFormData)
      });
      if (res.ok) {
        setIsAddModalOpen(false);
        setAddFormData({ name: '', unit: '', quantity: 0, conversion: '', minThreshold: 0, group: '', date: '' });
        fetchItems();
      } else {
        const data = await res.json().catch(() => ({}));
        setPopupError("Lỗi thêm mới: " + (data.detail || "Unknown error"));
      }
    } catch (err) {
      setPopupError("Lỗi kết nối Server.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleExportTotal = () => {
    const data = filteredItems.map(item => ({
      'Tên vật tư': item.name,
      'Đơn vị tính': item.unit,
      'Tồn kho': item.quantity,
      'Số lượng': '' // Để trống cho nhân viên tự điền khi kiểm kho
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    applyExcelStyle(worksheet, data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tong_Vat_Tu");
    XLSX.writeFile(workbook, "Tong_Vat_Tu.xlsx");
  };

  const handleExportLowStock = () => {
    const lowStockItems = filteredItems.filter(item => item.minThreshold > 0 && item.quantity <= item.minThreshold);
    const data = lowStockItems.map(item => ({
      'Tên vật tư': item.name,
      'Tồn kho': item.quantity,
      'Hạn mức': item.minThreshold,
      'Đơn vị': item.unit
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    applyExcelStyle(worksheet, data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vat_Tu_Can_Nhap");
    XLSX.writeFile(workbook, "Vat_Tu_Can_Nhap.xlsx");
  };

  const handleExportReport = () => {
    if (!reportStartMonth || !reportEndMonth) {
      alert("Vui lòng chọn đầy đủ tháng bắt đầu và kết thúc!");
      return;
    }

    const startDate = new Date(`${reportStartMonth}-01T00:00:00`);
    const [endYear, endMonth] = reportEndMonth.split('-');
    const endDate = new Date(Number(endYear), Number(endMonth), 0, 23, 59, 59);

    if (startDate > endDate) {
      alert("Tháng bắt đầu không thể lớn hơn tháng kết thúc!");
      return;
    }

    const months = [];
    let curr = new Date(startDate);
    while (curr <= endDate) {
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      months.push(`${yyyy}-${mm}`);
      curr.setMonth(curr.getMonth() + 1);
    }

    const reportData = items.map(item => {
      let qtyEnd = item.quantity;
      const itemTrans = transactions.filter(t => t['Mã hàng'] === item.sku);

      // Nghịch đảo giao dịch sau endDate để tìm Tồn cuối kỳ (tại thời điểm endDate)
      const transAfterEnd = itemTrans.filter(t => {
        const tDate = new Date(t['Thời gian'].replace(' ', 'T'));
        return tDate > endDate;
      });

      transAfterEnd.forEach(t => {
        const amt = Number(t['Số lượng']) || 0;
        if (t['Hành động'] === 'Nhập') qtyEnd -= amt;
        else if (t['Hành động'] === 'Xuất') qtyEnd += amt;
      });

      // Lọc các giao dịch trong kỳ
      const transDuring = itemTrans.filter(t => {
        const tDate = new Date(t['Thời gian'].replace(' ', 'T'));
        return tDate >= startDate && tDate <= endDate;
      });

      let totalInPeriod = 0;
      let totalOutPeriod = 0;
      let qtyStart = qtyEnd;

      transDuring.forEach(t => {
        const amt = Number(t['Số lượng']) || 0;
        if (t['Hành động'] === 'Nhập') {
          totalInPeriod += amt;
          qtyStart -= amt; // Trừ đi nhập để lùi về tồn đầu
        } else if (t['Hành động'] === 'Xuất') {
          totalOutPeriod += amt;
          qtyStart += amt; // Cộng thêm xuất để lùi về tồn đầu
        }
      });

      const row = {
        'Mã hàng (SKU)': item.sku,
        'Tên vật tư': item.name,
        'Đơn vị tính': item.unit,
        'Tồn tháng trước': qtyStart,
      };

      let currentQty = qtyStart;
      months.forEach(monthStr => {
        let monthIn = 0;
        let monthOut = 0;
        transDuring.forEach(t => {
          if (t['Thời gian'].startsWith(monthStr)) {
            const amt = Number(t['Số lượng']) || 0;
            if (t['Hành động'] === 'Nhập') monthIn += amt;
            if (t['Hành động'] === 'Xuất') monthOut += amt;
          }
        });
        currentQty = currentQty + monthIn - monthOut;

        row[`Nhập ${monthStr}`] = monthIn;
        row[`Xuất ${monthStr}`] = monthOut;
        row[`Tồn cuối ${monthStr}`] = currentQty;
      });

      row['Tổng nhập kỳ'] = totalInPeriod;
      row['Tổng xuất kỳ'] = totalOutPeriod;
      row['Số lượng hiện tại'] = currentQty; // = qtyEnd

      return row;
    });

    // Thêm dòng Tổng Cộng ở cuối tự động theo các cột
    const totalRow = {
      'Mã hàng (SKU)': '',
      'Tên vật tư': 'TỔNG CỘNG',
      'Đơn vị tính': ''
    };

    if (reportData.length > 0) {
      Object.keys(reportData[0]).forEach(key => {
        if (key !== 'Mã hàng (SKU)' && key !== 'Tên vật tư' && key !== 'Đơn vị tính') {
          totalRow[key] = 0;
        }
      });
    }

    reportData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'Mã hàng (SKU)' && key !== 'Tên vật tư' && key !== 'Đơn vị tính') {
          totalRow[key] += row[key];
        }
      });
    });

    reportData.push(totalRow);

    const worksheet = XLSX.utils.json_to_sheet(reportData);

    applyExcelStyle(worksheet, reportData);

    // Format dòng TỔNG CỘNG (Dòng cuối)
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const lastRowIndex = range.e.r + 1; // 1-indexed trong file Excel
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + lastRowIndex;
      if (!worksheet[address]) continue;
      worksheet[address].s = {
        font: { bold: true, color: { rgb: "111827" } }, // Đen đậm
        fill: { fgColor: { rgb: "F3F4F6" } }, // Nền xám nhạt
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "medium", color: { rgb: "9CA3AF" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } }
        }
      };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Xuat_Nhap_Ton");
    XLSX.writeFile(workbook, `Bao_Cao_XNT_${reportStartMonth}_den_${reportEndMonth}.xlsx`);
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Kho vật tư</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
              <input type="checkbox" checked={showImportantOnly} onChange={(e) => setShowImportantOnly(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: showImportantOnly ? '#10B981' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                <span style={{ position: 'absolute', content: '""', height: '16px', width: '16px', left: showImportantOnly ? '20px' : '4px', bottom: '4px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' }}></span>
              </span>
            </label>
            <span style={{ fontWeight: '500', color: showImportantOnly ? '#10B981' : 'var(--text-muted)' }}>Chỉ hiện vật tư quan trọng</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => {
            const today = new Date();
            setAddFormData({ name: '', unit: '', quantity: 0, conversion: '', minThreshold: 0, group: '', date: new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().substring(0, 10) });
            setIsAddModalOpen(true);
          }} style={{ background: '#3b82f6', color: 'white', border: 'none' }}>
            Thêm vật tư
          </button>
          <button className="btn btn-secondary" onClick={handleExportTotal} style={{ backgroundColor: '#10B981', color: 'white', border: 'none' }}>
            Xuất tổng vật tư
          </button>
          <button className="btn btn-secondary" onClick={handleExportLowStock} style={{ backgroundColor: '#EF4444', color: 'white', border: 'none' }}>
            Xuất vật tư cần nhập
          </button>
          <button className="btn btn-primary" onClick={fetchItems} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới dữ liệu"}
          </button>
        </div>
      </div>

      <div style={{
        marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap',
        background: 'linear-gradient(to right, #eff6ff, #e0e7ff)',
        border: '1px solid #c7d2fe',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        borderRadius: '16px',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Trang trí góc (Decorative blob) */}
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px',
          background: 'linear-gradient(135deg, #a5b4fc, #818cf8)', opacity: '0.2', borderRadius: '50%', blur: '20px'
        }}></div>

        <h3 style={{ margin: 0, marginRight: 'auto', fontSize: '1.1rem', color: '#312e81', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 1, fontWeight: '700' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Báo cáo Xuất Nhập Tồn
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 1 }}>
          <label style={{ fontWeight: '600', fontSize: '0.875rem', color: '#4338ca' }}>Từ tháng:</label>
          <input type="month" className="form-input" value={reportStartMonth} onChange={(e) => setReportStartMonth(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #a5b4fc', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 1 }}>
          <label style={{ fontWeight: '600', fontSize: '0.875rem', color: '#4338ca' }}>Đến tháng:</label>
          <input type="month" className="form-input" value={reportEndMonth} onChange={(e) => setReportEndMonth(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #a5b4fc', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} />
        </div>
        <button className="btn btn-primary" onClick={handleExportReport} style={{
          background: 'linear-gradient(to right, #4f46e5, #4338ca)',
          padding: '0.6rem 1.5rem',
          borderRadius: '8px',
          fontWeight: '600',
          boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.39)',
          zIndex: 1,
          transition: 'all 0.2s ease',
          border: 'none'
        }}>
          Tải Excel
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
              <th onClick={() => requestSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Tên vật tư{getSortIndicator('name')}
              </th>
              <th onClick={() => requestSort('quantity')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Tồn kho{getSortIndicator('quantity')}
              </th>
              <th>Đơn vị</th>
              <th>Quy đổi</th>
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
              const isLowStock = item.minThreshold > 0 && item.quantity <= item.minThreshold;
              const isEditing = editingSku === item.sku;

              return (
                <tr key={item.sku}>
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
                      <Link to={`/item/${item.sku}`} style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Xem lịch sử giao dịch">
                        {item.name}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                      </Link>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${isLowStock ? 'badge-danger' : 'badge-success'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td>{item.conversion || ''}</td>
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
                          <input
                            type="date"
                            className="form-input"
                            style={{ padding: '0.25rem', fontSize: '0.875rem', width: '130px' }}
                            value={transactionDate}
                            onChange={(e) => setTransactionDate(e.target.value)}
                          />
                          {(() => {
                            const cleanItemName = (item.name || '').trim().toLowerCase();
                            const relatedImplants = implants.filter(imp => (imp.category || '').trim().toLowerCase() === cleanItemName);
                            if (relatedImplants.length > 0) {
                              return (
                                <select 
                                  className="form-input" 
                                  style={{ padding: '0.25rem', fontSize: '0.875rem', width: '130px', marginLeft: '4px' }}
                                  value={transactionSubSku}
                                  onChange={e => setTransactionSubSku(e.target.value)}
                                >
                                  <option value="">Chọn Size</option>
                                  {relatedImplants.map(imp => (
                                    <option key={imp.sku} value={imp.sku}>{imp.name}</option>
                                  ))}
                                </select>
                              );
                            }
                            return null;
                          })()}
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
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
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

      {isAddModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ marginTop: 0 }}>Thêm vật tư mới</h3>
            <form onSubmit={handleAddSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Tên hàng *</label>
                <input required type="text" className="form-input" value={addFormData.name} onChange={e => setAddFormData({ ...addFormData, name: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label>ĐVT *</label>
                  <input required type="text" className="form-input" value={addFormData.unit} onChange={e => setAddFormData({ ...addFormData, unit: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Số lượng *</label>
                  <input required type="number" className="form-input" value={addFormData.quantity} onChange={e => setAddFormData({ ...addFormData, quantity: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label>Quy đổi</label>
                  <input type="text" className="form-input" value={addFormData.conversion} onChange={e => setAddFormData({ ...addFormData, conversion: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Hạn mức *</label>
                  <input required type="number" className="form-input" value={addFormData.minThreshold} onChange={e => setAddFormData({ ...addFormData, minThreshold: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label>Nhóm *</label>
                  <select required className="form-input" value={addFormData.group} onChange={e => setAddFormData({ ...addFormData, group: e.target.value })}>
                    <option value="">-- Chọn nhóm --</option>
                    {uniqueGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Ngày nhập</label>
                  <input type="date" className="form-input" value={addFormData.date} onChange={e => setAddFormData({ ...addFormData, date: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setIsAddModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={isAdding}>
                  {isAdding ? "Đang lưu..." : "Xác nhận"}
                </button>
              </div>
            </form>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
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
  const [filterMonth, setFilterMonth] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const uniqueMonths = useMemo(() => {
    const months = new Set();
    transactions.forEach(t => {
      if (t['Thời gian']) {
        const monthStr = t['Thời gian'].substring(0, 7);
        months.add(monthStr);
      }
    });
    return Array.from(months).sort().reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      let matchMonth = true;
      let matchName = true;
      let matchAction = true;

      if (filterMonth && t['Thời gian']) {
        matchMonth = t['Thời gian'].startsWith(filterMonth);
      }

      if (searchName) {
        const lowerSearch = searchName.toLowerCase();
        const nameMatch = t['Tên hàng']?.toLowerCase().includes(lowerSearch);
        const skuMatch = t['Mã hàng']?.toLowerCase().includes(lowerSearch);
        matchName = nameMatch || skuMatch;
      }

      if (filterAction) {
        matchAction = t['Hành động'] === filterAction;
      }

      return matchMonth && matchName && matchAction;
    });
  }, [transactions, filterMonth, searchName, filterAction]);

  return (
    <div>
      <div className="page-header">
        <h2>Lịch sử Giao dịch</h2>
        <button className="btn btn-primary" onClick={fetchItems}>
          Làm mới
        </button>
      </div>
      <div className="card table-container">
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Tìm theo Tên hàng hoặc Mã SKU..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            style={{ maxWidth: '300px', flex: '1' }}
          />
          <select
            className="form-input"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            style={{ maxWidth: '200px' }}
          >
            <option value="">Tất cả các tháng</option>
            {uniqueMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ maxWidth: '180px' }}
          >
            <option value="">Mọi hành động</option>
            <option value="Nhập">Chỉ xem Nhập</option>
            <option value="Xuất">Chỉ xem Xuất</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Tên hàng</th>
              <th>Số lượng</th>
              <th>Mã hàng</th>
              <th>Hành động</th>
              <th>Người thực hiện</th>
            </tr>
          </thead>
          <tbody>
            {[...filteredTransactions].reverse().map((t, idx) => (
              <tr key={idx}>
                <td style={{ color: 'var(--text-muted)' }}>{t['Thời gian']}</td>
                <td>
                  <Link to={`/item/${t['Mã hàng']}`} style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Xem lịch sử giao dịch">
                    {t['Tên hàng']}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </Link>
                </td>
                <td style={{ fontWeight: '600' }}>{t['Số lượng']} {t['Đơn vị']}</td>
                <td>
                  <Link to={`/item/${t['Mã hàng']}`} style={{ fontWeight: '500', color: 'var(--primary)' }} title="Xem chi tiết vật tư">
                    {t['Mã hàng']}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${t['Hành động'] === 'Nhập' ? 'badge-success' : 'badge-danger'}`}>
                    {t['Hành động']}
                  </span>
                </td>
                <td>{t['Người thực hiện'] || ''}</td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/></svg> Kho Implant
          </Link>
          <Link to="/transactions" className={`nav-link ${isActive('/transactions')}`} onClick={() => setIsOpen(false)}>
            <Activity size={20} /> Lịch sử
          </Link>
          <Link to="/ocr" className={`nav-link ${isActive('/ocr')}`} onClick={() => setIsOpen(false)}>
            <ScanLine size={20} /> Quét Hóa đơn
          </Link>
          <Link to="/settings" className={`nav-link ${isActive('/settings')}`} onClick={() => setIsOpen(false)}>
            <Settings size={20} /> Cài đặt Hệ thống
          </Link>
        </nav>
      </div>
    </>
  );
};


const applyExcelStyle = (worksheet, data) => {
  if (!worksheet['!ref']) return;
  const range = XLSX.utils.decode_range(worksheet['!ref']);

  // Format Header (Dòng 1)
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const address = XLSX.utils.encode_col(C) + "1";
    if (!worksheet[address]) continue;
    worksheet[address].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      fill: { fgColor: { rgb: "4F46E5" } }, // Indigo-600
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } }
      }
    };
  }

  // Nhận diện cột Nhập/Xuất để đổi màu chữ
  const headerTypes = {};
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const address = XLSX.utils.encode_col(C) + "1";
    if (worksheet[address] && worksheet[address].v) {
      const val = worksheet[address].v.toString().toLowerCase();
      if (val.includes("nhập")) headerTypes[C] = "nhap";
      else if (val.includes("xuất")) headerTypes[C] = "xuat";
    }
  }

  // Format Data Rows
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + (R + 1);
      if (!worksheet[address]) continue;

      let fontColor = "111827"; // mặc định xám đen
      let isBold = false;
      if (headerTypes[C] === "nhap") {
        fontColor = "15803D"; // xanh lá đậm
        isBold = true;
      } else if (headerTypes[C] === "xuat") {
        fontColor = "B91C1C"; // đỏ đậm
        isBold = true;
      }

      worksheet[address].s = {
        font: { color: { rgb: fontColor }, bold: isBold },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } }
        },
        alignment: { vertical: "center", horizontal: typeof worksheet[address].v === 'number' ? 'right' : 'left' }
      };
    }
  }

  // Tự động căn chỉnh độ rộng cột
  if (data && data.length > 0) {
    const colWidths = Object.keys(data[0]).map(key => ({
      wch: Math.max(key.length + 5, 15) // Tăng độ rộng xíu cho dễ nhìn
    }));
    worksheet['!cols'] = colWidths;
  }
};

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
