import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

const ItemHistoryCalendar = ({ items, transactions }) => {
  const { sku } = useParams();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());

  const item = items.find(i => i.sku === sku);
  const itemName = item ? item.name : sku;

  // Lọc giao dịch của tháng hiện tại và của đúng SKU này
  const itemTransactions = useMemo(() => {
    return transactions.filter(t => t['Mã hàng'] === sku);
  }, [transactions, sku]);

  // Gom nhóm giao dịch theo ngày trong tháng hiện tại
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  // Điều chỉnh để thứ 2 là ngày đầu tuần (0: T2, ..., 6: CN)
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const calendarData = useMemo(() => {
    const data = {};
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    // Khởi tạo tất cả các ngày
    for (let i = 1; i <= daysInMonth; i++) {
      data[i] = { imported: 0, exported: 0 };
    }

    // Gán dữ liệu giao dịch
    itemTransactions.forEach(t => {
      if (!t['Thời gian']) return;
      // Thời gian format: YYYY-MM-DD HH:mm:ss
      const parts = t['Thời gian'].split(' ')[0].split('-');
      if (parts.length === 3) {
        const tYear = parseInt(parts[0], 10);
        const tMonth = parseInt(parts[1], 10);
        const tDay = parseInt(parts[2], 10);

        if (tYear === year && tMonth === month) {
          const amount = parseInt(t['Số lượng'], 10) || 0;
          if (t['Hành động'] === 'Nhập') {
            data[tDay].imported += amount;
          } else if (t['Hành động'] === 'Xuất') {
            data[tDay].exported += amount;
          }
        }
      }
    });
    return data;
  }, [itemTransactions, currentDate, daysInMonth]);

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const monthNames = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
    "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
  ];

  const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  // Tính tổng Nhập / Xuất trong tháng
  const totalImported = Object.values(calendarData).reduce((sum, day) => sum + day.imported, 0);
  const totalExported = Object.values(calendarData).reduce((sum, day) => sum + day.exported, 0);

  // Tạo lưới lịch
  const calendarCells = [];
  for (let i = 0; i < startingDay; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dayData = calendarData[i];
    calendarCells.push(
      <div key={`day-${i}`} className="calendar-cell">
        <div className="calendar-day-number">{i}</div>
        <div className="calendar-day-content">
          {dayData.imported > 0 && (
            <div className="calendar-badge-in">+{dayData.imported}</div>
          )}
          {dayData.exported > 0 && (
            <div className="calendar-badge-out">-{dayData.exported}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          className="btn" 
          style={{ padding: '0.5rem', borderRadius: '50%', background: 'white', border: '1px solid var(--border)' }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: 0, lineHeight: 1 }}>Chi tiết Lịch sử</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
            Vật tư: <strong style={{ color: 'var(--secondary)' }}>{itemName}</strong> (SKU: {sku})
          </p>
        </div>
      </div>

      <div className="card">
        <div className="calendar-header">
          <div className="calendar-nav">
            <button className="btn" onClick={prevMonth} style={{ background: 'transparent', color: 'var(--secondary)', border: '1px solid var(--border)' }}><ChevronLeft size={20} /></button>
            <h3 style={{ margin: 0 }}>{monthNames[currentDate.getMonth()]} năm {currentDate.getFullYear()}</h3>
            <button className="btn" onClick={nextMonth} style={{ background: 'transparent', color: 'var(--secondary)', border: '1px solid var(--border)' }}><ChevronRight size={20} /></button>
          </div>
          <div className="calendar-summary">
            <div className="summary-item in">
              <span>Tổng Nhập:</span>
              <strong>{totalImported}</strong>
            </div>
            <div className="summary-item out">
              <span>Tổng Xuất:</span>
              <strong>{totalExported}</strong>
            </div>
          </div>
        </div>

        <div className="calendar-grid">
          {weekDays.map(day => (
            <div key={day} className="calendar-weekday">{day}</div>
          ))}
          {calendarCells}
        </div>
      </div>
    </div>
  );
};

export default ItemHistoryCalendar;
