# Implementation Plan: Split Inventory into Two Pages (Updated)

## Goal
Tách trang "Kho vật tư" thành 2 trang: "Tổng kho" (từ sheet `Inventory`) và "Vật tư quan trọng" (từ sheet `Data`). Bỏ chức năng gửi mail. Đồng bộ hóa thay đổi giữa hai sheet nếu có chung vật tư (Mã hàng).

## Proposed Changes

### Backend (`api/index.py`)
1. **Xóa tính năng Email**: Loại bỏ `generate_and_send_daily_report`, gỡ bỏ `apscheduler` và các endpoint liên quan đến cron.
2. **Quản lý Sheet động**:
   - Viết lại hàm `get_sheets(inventory_type)`:
     - `type="quan_trong"` -> Lấy sheet `Data` và `LichSu`.
     - `type="tong_kho"` -> Lấy sheet `Inventory` và tạo sheet mới `LichSu_Tong`.
3. **Đồng bộ hóa Giao dịch (Nhập/Xuất)**:
   - Trong `POST /api/transaction`: 
     - Nhận vào `type` (nguồn giao dịch).
     - Cập nhật số lượng ở sheet nguồn và ghi log vào sheet lịch sử nguồn.
     - **Tính năng đồng bộ**: Tự động mở sheet của kho còn lại, tìm kiếm xem có trùng `Mã hàng` không. Nếu có, cập nhật luôn số lượng bên sheet đó và **ghi một log giao dịch tương đương** vào sheet lịch sử của kho đó (để đảm bảo tính đúng đắn cho thuật toán tính Tồn đầu kỳ lúc xuất Excel).
4. **Đồng bộ hóa Chỉnh sửa (Edit)**:
   - Trong `PUT /api/update-item` và `PUT /api/update-threshold`: Nếu sửa thông tin một vật tư ở kho này, tự động dò tìm và sửa thông tin vật tư đó ở kho kia (nếu tồn tại).

### Frontend (`src/App.jsx`)
1. **Refactor component Inventory**: Thêm prop `type` và `title`.
2. **Định tuyến (Routing)**:
   - `/tong-kho` -> `<Inventory type="tong_kho" title="Tổng kho" />`
   - `/quan-trong` -> `<Inventory type="quan_trong" title="Vật tư quan trọng" />`
3. **Cập nhật Sidebar**: 
   - Thay nút "Kho vật tư" bằng 2 nút: "Tổng kho" và "Vật tư quan trọng".
4. **Cập nhật API Calls**: Gắn thêm `?type=${type}` hoặc `{ type }` vào body khi gọi fetch.

## Verification
- Kiểm tra tính năng đồng bộ kép: Khi Nhập 5 món ở "Vật tư quan trọng", kiểm tra xem bên "Tổng kho" có tự động tăng 5 món và có ghi log bên trang lịch sử của Tổng kho không.
