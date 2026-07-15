import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

# Load variables
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Vui lòng cấu hình SUPABASE_URL và SUPABASE_KEY trong file .env trước khi chạy script này.")
    exit(1)

supabase: Client = create_client(url, key)

def main():
    excel_path = os.path.join(os.path.dirname(__file__), '../Data Store.xlsx')
    if not os.path.exists(excel_path):
        print(f"Không tìm thấy file {excel_path}")
        return

    print("Đọc file Excel...")
    xls = pd.ExcelFile(excel_path)
    
    # Đọc sheet Data / Inventory
    # Cấu trúc: STT, Mã hàng, Tên hàng, ĐVT, Số lượng, Hạn mức, Nhóm, Quy đổi, Đơn vị cung cấp
    if 'Inventory' in xls.sheet_names:
        df_items = pd.read_excel(xls, 'Inventory')
    elif 'Data' in xls.sheet_names:
        df_items = pd.read_excel(xls, 'Data')
    else:
        print("Không tìm thấy sheet Inventory hoặc Data")
        return

    print("Bắt đầu migrate dữ liệu lên Supabase...")
    
    # Map column names
    # Handling missing values
    df_items = df_items.fillna('')
    
    inserted_items = {} # sku -> id
    
    for index, row in df_items.iterrows():
        sku = str(row.get('Mã hàng', '')).strip()
        name = str(row.get('Tên hàng', '')).strip()
        
        if not sku or not name:
            continue
            
        unit = str(row.get('ĐVT', ''))
        category = str(row.get('Nhóm', ''))
        try:
            min_quantity = int(row.get('Hạn mức', 0))
        except:
            min_quantity = 0
            
        try:
            quantity = int(row.get('Số lượng', 0))
        except:
            quantity = 0

        # Insert item
        item_data = {
            "sku": sku,
            "name": name,
            "unit": unit,
            "category": category,
            "min_quantity": min_quantity,
            "exp_warning_days": 30 # Default
        }
        
        res = supabase.table('items').insert(item_data).execute()
        if res.data:
            item_id = res.data[0]['id']
            inserted_items[sku] = item_id
            
            # Khởi tạo lô hàng ban đầu (inventory_batch) với số lượng hiện có
            if quantity > 0:
                batch_data = {
                    "item_id": item_id,
                    "original_quantity": quantity,
                    "remaining_quantity": quantity,
                    "import_price": None,
                    "expiration_date": None
                }
                supabase.table('inventory_batches').insert(batch_data).execute()
                print(f"Đã thêm lô ban đầu cho {name} ({quantity} {unit})")
        
        print(f"Đã thêm vật tư: {name}")

    # Đọc sheet LichSu (Transactions)
    if 'LichSu' in xls.sheet_names:
        print("Đang xử lý Lịch sử (Transactions)...")
        df_trans = pd.read_excel(xls, 'LichSu')
        df_trans = df_trans.fillna('')
        
        for index, row in df_trans.iterrows():
            sku = str(row.get('Mã hàng', '')).strip()
            item_id = inserted_items.get(sku)
            if not item_id:
                continue
                
            action = str(row.get('Hành động', '')).strip()
            action_enum = 'IMPORT' if 'nhập' in action.lower() else 'EXPORT'
            
            try:
                quantity = int(row.get('Số lượng', 0))
            except:
                quantity = 0
                
            if quantity == 0:
                continue
                
            user_name = str(row.get('Người thực hiện', ''))
            time_val = row.get('Thời gian', None)
            
            trans_data = {
                "item_id": item_id,
                "action": action_enum,
                "quantity": quantity,
                "user_name": user_name
            }
            if time_val:
                trans_data["created_at"] = str(time_val)
                
            supabase.table('transactions').insert(trans_data).execute()
            
        print("Đã nhập Lịch sử giao dịch xong.")

    print("Migrate hoàn tất!")

if __name__ == "__main__":
    main()
