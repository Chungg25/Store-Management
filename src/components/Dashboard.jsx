import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Package, Activity, ScanLine } from 'lucide-react';

const Dashboard = ({ items, transactions }) => {
  const totalItems = items.length;
  const lowStockItems = items.filter(i => i.quantity <= i.minThreshold && i.minThreshold > 0).length;

  const transactionsThisMonth = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    return transactions.filter(t => {
      if (!t['Thời gian']) return false;
      const datePart = t['Thời gian'].split(' ')[0];
      if (!datePart) return false;
      const parts = datePart.split('-');
      if (parts.length < 2) return false;
      return parseInt(parts[0]) === currentYear && parseInt(parts[1]) === currentMonth;
    }).length;
  }, [transactions]);

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
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Số lượt giao dịch trong tháng</h3>
          <p style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary)' }}>{transactionsThisMonth}</p>
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

export default Dashboard;
