# Báo cáo Xuất Nhập Tồn theo Kỳ (Excel)

## Mục tiêu hoàn thành
Xây dựng tính năng cho phép người dùng chọn thời gian (Tháng Bắt Đầu - Tháng Kết Thúc) để xuất Excel Báo cáo Xuất Nhập Tồn. Tính toán chính xác số liệu tồn đầu kỳ dựa trên lịch sử giao dịch và tồn kho hiện tại.

## Chức năng đã làm

1. **Giao diện Trực tiếp (Mới):**
   - Chuyển tính năng chọn tháng từ Modal ra thẳng màn hình Inventory (Phía trên danh sách).
   - Thiết kế giao diện trực quan với Panel nổi bật, giúp thao tác xuất báo cáo chỉ mất 1 giây thay vì phải mở Popup.

2. **Cột Động (Dynamic Monthly Columns) - Mới:**
   - Khi chọn nhiều tháng (VD: T5 -> T7), hệ thống tự động sinh ra các cụm cột riêng lẻ cho từng tháng, ví dụ: `Nhập 2026-05`, `Xuất 2026-05`, `Tồn cuối 2026-05`, v.v.
   - Thêm 3 cột tổng kết kỳ ở cuối cùng: `Tổng nhập kỳ`, `Tổng xuất kỳ`, và `Số lượng hiện tại`.
   - Thuật toán lùi ngược (Reverse-calculation) được giữ nguyên, kết hợp thuật toán tính tiến (Forward-simulation) để tìm lượng tồn chính xác vào **mọi thời điểm trong lịch sử** mà không bị chệch 1 số nào.
   - Dòng `TỔNG CỘNG` ở cuối báo cáo cũng đã được lập trình động (Dynamic accumulator) để cộng tự động tất cả các cột của các tháng được chọn.

3. **Giao diện file Excel siêu đẹp:**
   - Tích hợp thư viện `xlsx-js-style` để tô màu tự động cho file Excel ngay khi vừa tải về.
   - Dòng tiêu đề được tô màu Nền Xanh Đậm (Indigo), Chữ Trắng In Đậm, Canh giữa.
   - Tự động kéo dãn độ rộng các cột sao cho chữ không bao giờ bị che khuất.
   - Dòng TỔNG CỘNG được làm nổi bật với nền Xám, Chữ Đen In Đậm và bo viền nét đứt.

## Xác minh
- File Excel giờ đây cung cấp cái nhìn chi tiết (breakdown) cực kỳ rõ ràng cho từng vật tư ở từng tháng một. Mở lên là xem được ngay không cần tốn công trang trí lại!
