import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Vui lòng cấu hình SUPABASE_URL và SUPABASE_KEY.")
    exit(1)

supabase: Client = create_client(url, key)

def create_implant_table_if_not_exists():
    try:
        # Check if table exists by doing a simple select
        supabase.table('implants').select('id').limit(1).execute()
        print("Bảng implants đã tồn tại.")
    except Exception:
        print("Tạo bảng implants qua SQL (Vui lòng chạy file sql trên Supabase trước nếu gặp lỗi).")
        # Since we cannot easily run DDL via REST API, we'll try to just inform the user.
        # But let's try calling rpc if we had one. Otherwise we rely on user running SQL.
        pass

def main():
    excel_path = os.path.join(os.path.dirname(__file__), '../Data Store.xlsx')
    if not os.path.exists(excel_path):
        print(f"Không tìm thấy file {excel_path}")
        return

    print("Đọc file Excel...")
    xls = pd.ExcelFile(excel_path)
    
    if 'Implant' not in xls.sheet_names:
        print("Không tìm thấy sheet Implant")
        return

    df = pd.read_excel(xls, 'Implant')
    df = df.fillna('')
    
    current_category = "Khác"
    
    for index, row in df.iterrows():
        # Cấu trúc: STT, Mã, Hãng, ĐVT, Số lượng
        # Note: headers might have spaces like "Mã "
        
        sku = ""
        name = ""
        unit = ""
        quantity = 0
        
        for k, v in row.items():
            k_clean = str(k).strip()
            val = str(v).strip()
            if not val: continue
            
            if 'M' in k_clean: sku = val
            elif 'H' in k_clean: name = val
            elif 'V' in k_clean: unit = val
            elif 'S' in k_clean and 'l' in k_clean: 
                try: quantity = int(float(val))
                except: quantity = 0
                
        if not sku and name:
            current_category = name
            print(f"Phát hiện danh mục: {current_category}")
        elif sku:
            implant_data = {
                "sku": sku,
                "name": name,
                "category": current_category,
                "unit": unit,
                "quantity": quantity
            }
            try:
                res = supabase.table('implants').insert(implant_data).execute()
                print(f"Đã thêm Implant Size: {name} ({sku})")
            except Exception as e:
                print(f"Lỗi thêm {sku}: {e}")

    print("Migrate Implant hoàn tất!")

if __name__ == "__main__":
    main()
