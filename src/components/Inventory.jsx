import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx-js-style';
import { getGroupColor, applyExcelStyle } from '../utils/helpers';
import { Package } from 'lucide-react';

const Inventory = ({ items, setItems, fetchItems, transactions, setTransactions, implants = [] }) => {
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
  const [transactionImportPrice, setTransactionImportPrice] = useState('');
  const [transactionExpirationDate, setTransactionExpirationDate] = useState('');
  const [transactionExpWarning, setTransactionExpWarning] = useState('');
  const [popupError, setPopupError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [batchList, setBatchList] = useState([]);

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
    setTransactionImportPrice('');
    setTransactionExpirationDate('');
    
    // Find the item to set its existing expWarningDays as default
    const currentItem = items.find(i => i.sku === sku);
    if (currentItem && type === 'Nhập') {
      setTransactionExpWarning(currentItem.expWarningDays || 30);
    } else {
      setTransactionExpWarning('');
    }
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

    await handleUpdateQuantity(item.sku, item.quantity, amount, transactionSubSku, subName, transactionImportPrice, transactionExpirationDate, transactionExpWarning);
    setTransactionSku(null);
    setTransactionSubSku('');
    setTransactionImportPrice('');
    setTransactionExpirationDate('');
    
    // Find the item to set its existing expWarningDays as default
    const currentItem = items.find(i => i.sku === sku);
    if (currentItem && type === 'Nhập') {
      setTransactionExpWarning(currentItem.expWarningDays || 30);
    } else {
      setTransactionExpWarning('');
    }
  };

  const handleUpdateQuantity = async (sku, currentQty, amount, subSku = '', subName = '', importPrice = '', expirationDate = '', expWarningDays = '') => {
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
        "Thời gian": dateStr,
        "Thời gian hệ thống": timeStr,
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
        sub_name: subName || null,
        importPrice: importPrice ? parseFloat(importPrice) : null,
        expirationDate: expirationDate || null,
        expWarningDays: expWarningDays ? parseInt(expWarningDays, 10) : null
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


  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa lô này không? Thao tác này cũng sẽ trừ đi số lượng trong tổng kho.")) return;
    try {
      const res = await fetch(`/api/batches/${batchId}`, { method: 'DELETE' });
      if (res.ok) {
        setBatchList(prev => prev.filter(b => b.id !== batchId));
        if (fetchItems) fetchItems(); // Refresh items
      } else {
        const data = await res.json().catch(() => ({}));
        setPopupError("Lỗi khi xóa lô: " + (data.detail || "Unknown"));
      }
    } catch (e) {
      console.error(e);
      setPopupError("Lỗi kết nối Server.");
    }
  };

  const handleViewBatches = async (item) => {
    setSelectedBatchItem(item);
    setIsBatchModalOpen(true);
    setBatchList([]);
    try {
      const res = await fetch(`/api/items/${item.sku}/batches`);
      if (res.ok) {
        const data = await res.json();
        setBatchList(data.batches || []);
      }
    } catch (e) {
      console.error(e);
    }
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
    
    const payload = {
      ...addFormData,
      quantity: parseInt(addFormData.quantity) || 0,
      minThreshold: parseInt(addFormData.minThreshold) || 0,
      expWarningDays: parseInt(addFormData.expWarningDays) || 30,
      importPrice: addFormData.importPrice ? parseFloat(addFormData.importPrice) : null
    };

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsAddModalOpen(false);
        setAddFormData({ name: '', unit: '', quantity: 0, conversion: '', minThreshold: 0, group: '', date: '', importPrice: '', expirationDate: '', expWarningDays: 30 });
        fetchItems();
      } else {
        const data = await res.json().catch(() => ({}));
        let err = data.detail || "Unknown error";
        if (typeof err === 'object') err = JSON.stringify(err);
        setPopupError("Lỗi thêm mới: " + err);
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


  const handleDownloadExpiringExcel = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/expiring-batches');
      const data = await res.json();

      if (!data || data.length === 0) {
        alert("Không có vật tư nào sắp hết hạn hoặc đã hết hạn.");
        return;
      }

      const excelData = data.map((b, idx) => ({
        'STT': idx + 1,
        'Mã hàng': b.item_sku,
        'Tên hàng': b.item_name,
        'Số lô': b.batch_number || (b.id ? b.id.substring(0, 8) : ''),
        'Số lượng tồn': b.remaining_quantity,
        'Ngày hết hạn': b.expiration_date,
        'Tình trạng': b.diff_days < 0 ? 'Đã quá hạn' : `Còn ${b.diff_days} ngày`
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      applyExcelStyle(worksheet, excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vat_Tu_Can_Han");
      XLSX.writeFile(workbook, "Danh_Sach_Vat_Tu_Can_Han.xlsx");

    } catch (err) {
      alert("Lỗi khi tải danh sách: " + err.message);
    } finally {
      setLoading(false);
    }
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
            setAddFormData({ name: '', unit: '', quantity: 0, conversion: '', minThreshold: 0, group: '', date: new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().substring(0, 10), importPrice: '', expirationDate: '', expWarningDays: 30 });
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
          <button className="btn btn-primary" onClick={handleDownloadExpiringExcel} disabled={loading} style={{ background: '#10B981', color: 'white', border: 'none' }}>
            Xuất vật tư cận hạn
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
              <th onClick={() => requestSort('minThreshold')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Hạn mức{getSortIndicator('minThreshold')}
              </th>
              <th>Đơn vị</th>
              <th onClick={() => requestSort('group')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Nhóm{getSortIndicator('group')}
              </th>
              <th>Quy đổi</th>
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
                    <span className={`badge ${isLowStock ? 'badge-danger' : (item.isExpiring ? 'badge-warning' : 'badge-success')}`}
                      style={{ cursor: 'pointer', ...(item.isExpiring && !isLowStock ? { backgroundColor: '#F59E0B', color: 'white' } : {}) }}
                      onClick={() => handleViewBatches(item)}
                      title="Bấm để xem chi tiết các lô hàng"
                    >
                      {item.quantity}
                    </span>
                    {item.isExpiring && (
                      <div style={{ fontSize: '0.75rem', color: '#F59E0B', marginTop: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        HSD: {item.closestExpirationDate}
                      </div>
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
                    {item.group ? (
                      <span className="badge" style={{ backgroundColor: getGroupColor(item.group), color: 'white', whiteSpace: 'nowrap' }}>
                        {item.group}
                      </span>
                    ) : null}
                  </td>
                  <td>{item.conversion || ''}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', minHeight: '32px', alignItems: 'center' }}>
                      {transactionSku === item.sku ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '220px' }}>
                          
                          {/* Row 1: Type, Qty, Date */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: transactionType === 'Nhập' ? 'var(--primary)' : 'var(--danger)', minWidth: '40px', paddingBottom: '0.35rem' }}>
                              {transactionType}:
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>Số lượng</label>
                              <input
                                type="number"
                                min="1"
                                className="form-input"
                                style={{ width: '70px', padding: '0.35rem' }}
                                value={transactionQty}
                                onChange={(e) => setTransactionQty(Number(e.target.value))}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>Ngày GD</label>
                              <input
                                type="date"
                                className="form-input"
                                style={{ padding: '0.35rem', fontSize: '0.875rem', width: '130px' }}
                                value={transactionDate}
                                onChange={(e) => setTransactionDate(e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Row 2: Price & Expiration (if Nhập) */}
                          {transactionType === 'Nhập' && (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              <div style={{ display: 'inline-block', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>Giá nhập (VNĐ)</label>
                                <input
                                  type="text"
                                  placeholder="Giá nhập"
                                  className="form-input"
                                  style={{ padding: '0.35rem', fontSize: '0.875rem', width: '115px', boxSizing: 'border-box' }}
                                  value={transactionImportPrice}
                                  onChange={(e) => setTransactionImportPrice(e.target.value.replace(/[^0-9]/g, ''))}
                                />
                                {transactionImportPrice && Number(transactionImportPrice) > 0 && Number(transactionImportPrice) < 1000 ? (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px' }}>
                                    <span onClick={() => setTransactionImportPrice(transactionImportPrice * 100000)} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', padding: '4px 6px', borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      {transactionImportPrice} Trăm
                                    </span>
                                    <span onClick={() => setTransactionImportPrice(transactionImportPrice * 1000000)} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', padding: '4px 6px', borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      {transactionImportPrice} Triệu
                                    </span>
                                    <span onClick={() => setTransactionImportPrice(transactionImportPrice * 10000000)} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', padding: '4px 6px', borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      {transactionImportPrice} Chục Tr
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>Hạn sử dụng</label>
                                <input
                                  type="date"
                                  className="form-input"
                                  style={{ padding: '0.35rem', fontSize: '0.875rem', width: '130px' }}
                                  value={transactionExpirationDate}
                                  onChange={(e) => setTransactionExpirationDate(e.target.value)}
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>Báo HSD (ngày)</label>
                                <input
                                  type="number"
                                  placeholder="Ví dụ: 30"
                                  className="form-input"
                                  style={{ padding: '0.35rem', fontSize: '0.875rem', width: '90px' }}
                                  value={transactionExpWarning}
                                  onChange={(e) => setTransactionExpWarning(e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {/* Row 3: Size Select */}
                          {(() => {
                            const cleanItemName = (item.name || '').trim().toLowerCase();
                            const relatedImplants = implants.filter(imp => (imp.category || '').trim().toLowerCase() === cleanItemName);
                            if (relatedImplants.length > 0) {
                              return (
                                <div>
                                  <select
                                    className="form-input"
                                    style={{ padding: '0.35rem', fontSize: '0.875rem', width: '100%' }}
                                    value={transactionSubSku}
                                    onChange={e => setTransactionSubSku(e.target.value)}
                                  >
                                    <option value="">Chọn Size Implant</option>
                                    {relatedImplants.map(imp => (
                                      <option key={imp.sku} value={imp.sku}>{imp.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Row 4: Action Buttons */}
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 1rem', fontSize: '0.85rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px' }}
                              onClick={() => setTransactionSku(null)}
                              disabled={loading}
                            >
                              Hủy
                            </button>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 1rem', fontSize: '0.85rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}
                              onClick={() => handleConfirmTransaction(item)}
                              disabled={loading}
                            >
                              Xác nhận
                            </button>
                          </div>
                        </div>
                      ) : isEditing ? (
                        <>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleConfirmEdit(item)}
                            disabled={loading}
                          >
                            Lưu
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#6B7280' }}
                            onClick={() => setEditingSku(null)}
                            disabled={loading}
                          >
                            Hủy
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

      {isBatchModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBatchModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Chi tiết Tồn kho theo lô</h3>
              <button className="close-btn" onClick={() => setIsBatchModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {selectedBatchItem && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Vật tư:</strong> {selectedBatchItem.name} ({selectedBatchItem.sku})
                </div>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ngày nhập lô</th>
                    <th>Tổng nhập</th>
                    <th>Số lượng tồn</th>
                    <th>Giá nhập</th>
                    <th>Hạn sử dụng</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {batchList.length > 0 ? (
                    batchList.map(b => {
                      const expDate = b.expiration_date ? new Date(b.expiration_date) : null;
                      const today = new Date();
                      let isExpiringSoon = false;
                      let isExpired = false;
                      if (expDate && selectedBatchItem && selectedBatchItem.expWarningDays > 0) {
                        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) isExpired = true;
                        else if (diffDays <= selectedBatchItem.expWarningDays) isExpiringSoon = true;
                      }

                      return (
                        <tr key={b.id} style={{ opacity: b.remaining_quantity === 0 ? 0.6 : 1 }}>
                          <td>{new Date(b.created_at).toLocaleDateString('vi-VN')}</td>
                          <td>{b.original_quantity}</td>
                          <td>
                            <span className={`badge ${b.remaining_quantity === 0 ? 'badge-secondary' : 'badge-success'}`} style={b.remaining_quantity === 0 ? { background: '#6c757d', color: 'white' } : {}}>
                              {b.remaining_quantity}
                            </span>
                          </td>
                          <td>{b.import_price ? parseInt(b.import_price).toLocaleString('vi-VN') + ' đ' : '-'}</td>
                          <td>
                            {b.expiration_date ? (
                              <span style={{
                                color: isExpired ? 'red' : (isExpiringSoon ? '#F59E0B' : 'inherit'),
                                fontWeight: (isExpired || isExpiringSoon) ? 'bold' : 'normal'
                              }}>
                                {b.expiration_date}
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            <button onClick={() => handleDeleteBatch(b.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              Xóa
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>Chưa có lô hàng nào hoặc đang tải...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ background: '#ffffff', padding: '2.5rem', borderRadius: '16px', width: '90%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #3b82f6, #10b981)' }}></div>
            <h3 style={{ marginTop: 0, marginBottom: '2rem', color: '#1e293b', fontSize: '1.5rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem' }}>
              <Package size={28} color="#3b82f6" />
              Thêm vật tư mới
            </h3>
            
            <form onSubmit={handleAddSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Tên hàng *</label>
                <input required type="text" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', width: '100%' }} value={addFormData.name} onChange={e => setAddFormData({ ...addFormData, name: e.target.value })} placeholder="Nhập tên vật tư..." />
              </div>
              
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>ĐVT *</label>
                  <input required type="text" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.unit} onChange={e => setAddFormData({ ...addFormData, unit: e.target.value })} placeholder="Cái, Hộp..." />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Số lượng ban đầu *</label>
                  <input required type="number" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.quantity} onChange={e => setAddFormData({ ...addFormData, quantity: parseInt(e.target.value) || 0 })} min="0" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Quy đổi</label>
                  <input type="text" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.conversion} onChange={e => setAddFormData({ ...addFormData, conversion: e.target.value })} placeholder="VD: 1 Hộp = 10 Cái" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Hạn mức cảnh báo *</label>
                  <input required type="number" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.minThreshold} onChange={e => setAddFormData({ ...addFormData, minThreshold: parseInt(e.target.value) || 0 })} min="0" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Nhóm *</label>
                  <select required className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.group} onChange={e => setAddFormData({ ...addFormData, group: e.target.value })}>
                    <option value="">-- Chọn nhóm --</option>
                    {uniqueGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Ngày nhập kho</label>
                  <input type="date" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.date} onChange={e => setAddFormData({ ...addFormData, date: e.target.value })} />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Giá nhập (VNĐ)</label>
                  <input type="text" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', width: '100%', boxSizing: 'border-box' }} value={addFormData.importPrice} onChange={e => setAddFormData({ ...addFormData, importPrice: e.target.value.replace(/[^0-9]/g, '') })} />
                  {addFormData.importPrice && Number(addFormData.importPrice) > 0 && Number(addFormData.importPrice) < 1000 ? (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', display: 'flex', gap: '4px', zIndex: 10 }}>
                      <span onClick={() => setAddFormData({ ...addFormData, importPrice: addFormData.importPrice * 100000 })} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        {addFormData.importPrice} Trăm
                      </span>
                      <span onClick={() => setAddFormData({ ...addFormData, importPrice: addFormData.importPrice * 1000000 })} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        {addFormData.importPrice} Triệu
                      </span>
                      <span onClick={() => setAddFormData({ ...addFormData, importPrice: addFormData.importPrice * 10000000 })} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        {addFormData.importPrice} Chục Tr
                      </span>
                    </div>
                  ) : null}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Hạn sử dụng</label>
                  <input type="date" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.expirationDate} onChange={e => setAddFormData({ ...addFormData, expirationDate: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: '#475569' }}>Báo HSD (ngày)</label>
                  <input type="number" className="form-input" style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} value={addFormData.expWarningDays} onChange={e => setAddFormData({ ...addFormData, expWarningDays: parseInt(e.target.value) || 0 })} min="0" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}>
                  Hủy bỏ
                </button>
                <button type="submit" disabled={isAdding} style={{ padding: '0.75rem 2rem', borderRadius: '8px', fontWeight: '600', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white', border: 'none', cursor: isAdding ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)' }}>
                  {isAdding ? "Đang xử lý..." : "Xác nhận Thêm"}
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

export default Inventory;
