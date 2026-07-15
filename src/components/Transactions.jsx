import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx-js-style';
import { applyExcelStyle } from '../utils/helpers';

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
            {filteredTransactions.map((t, idx) => (
              <tr key={idx}>
                <td style={{ color: 'var(--text-muted)' }}>{t['Thời gian'] ? t['Thời gian'].split(' ')[0] : ''}</td>
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

export default Transactions;
