import os
import json
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import gspread
from dotenv import load_dotenv
import tempfile
import shutil
from api.ai_scanner import InvoiceAI

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID")
EMAIL_SENDER = os.environ.get("EMAIL_SENDER", "example@gmail.com")
EMAIL_APP_PASSWORD = os.environ.get("EMAIL_APP_PASSWORD")
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), '../credentials.json')

def get_sheets():
    try:
        gc = gspread.service_account(filename=CREDENTIALS_PATH)
        sh = gc.open_by_key(SPREADSHEET_ID)
        # Lấy Sheet Danh mục (tìm sheet tên 'Data' hoặc 'data', nếu không có thì lấy sheet đầu tiên)
        items_sheet = None
        transactions_sheet = None
        for sheet in sh.worksheets():
            if sheet.title.lower() == "data":
                items_sheet = sheet
            if sheet.title == "LichSu":
                transactions_sheet = sheet
                
        if not items_sheet:
            items_sheet = sh.get_worksheet(0)
            
        # Lấy hoặc tạo Sheet Lịch sử (LichSu)
        if not transactions_sheet:
            transactions_sheet = sh.add_worksheet(title="LichSu", rows="1000", cols="6")
            transactions_sheet.append_row(["Thời gian", "Mã hàng", "Tên hàng", "Hành động", "Số lượng", "Đơn vị"])
            
        return items_sheet, transactions_sheet
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return None, None

def send_alert_email(item_name: str, quantity: int, unit: str, threshold: int):
    if not EMAIL_APP_PASSWORD or EMAIL_SENDER == "example@gmail.com":
        return

    subject = f"⚠️ Cảnh báo tồn kho: {item_name} sắp hết!"
    body = f"""
    Kính gửi Quản lý Kho,

    Hệ thống ghi nhận vật tư "{item_name}" đã chạm hoặc dưới ngưỡng cảnh báo.
    
    - Số lượng hiện tại: {quantity} {unit}
    - Hạn mức tối thiểu: {threshold} {unit}
    
    Vui lòng kiểm tra và lên kế hoạch nhập hàng sớm.
    
    Trân trọng,
    Hệ thống Quản lý Kho Dr. Smile
    """
    
    msg = MIMEMultipart()
    msg['From'] = EMAIL_SENDER
    msg['To'] = EMAIL_SENDER
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_APP_PASSWORD)
        text = msg.as_string()
        server.sendmail(EMAIL_SENDER, EMAIL_SENDER, text)
        server.quit()
    except Exception as e:
        print(f"Failed to send email: {e}")

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/items")
def get_items():
    items_sheet, _ = get_sheets()
    if not items_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    records = items_sheet.get_all_records()
    items = []
    
    for row in records:
        if not row.get("Mã hàng"):
            continue
            
        try: qty = int(row.get("Số lượng", 0) or 0)
        except ValueError: qty = 0
            
        try: threshold = int(row.get("Hạn mức", 0) or 0)
        except ValueError: threshold = 0
            
        items.append({
            "id": row.get("STT"),
            "sku": row.get("Mã hàng"),
            "name": row.get("Tên hàng"),
            "unit": row.get("ĐVT"),
            "quantity": qty,
            "minThreshold": threshold,
            "group": row.get("Nhóm", "")
        })
        
    return items

@app.get("/api/transactions")
def get_transactions():
    _, trans_sheet = get_sheets()
    if not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
        
    records = trans_sheet.get_all_records()
    return records

class ItemUpdate(BaseModel):
    quantity: int
    changeAmount: int # Số lượng thay đổi (dương là nhập, âm là xuất)

class ItemDetailsUpdate(BaseModel):
    name: str
    unit: str
    minThreshold: int

@app.put("/api/items/{sku}/details")
def update_item_details(sku: str, payload: ItemDetailsUpdate):
    items_sheet, _ = get_sheets()
    if not items_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    cell = items_sheet.find(sku, in_column=2)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    
    # Cập nhật tên, đơn vị, hạn mức
    items_sheet.update_cell(row_idx, 3, payload.name)
    items_sheet.update_cell(row_idx, 4, payload.unit)
    items_sheet.update_cell(row_idx, 6, payload.minThreshold)
    
    return {"message": "Cập nhật thông tin thành công"}

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate):
    items_sheet, trans_sheet = get_sheets()
    if not items_sheet or not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    cell = items_sheet.find(sku, in_column=2)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    new_quantity = payload.quantity
    
    items_sheet.update_cell(row_idx, 5, new_quantity)
    
    item_name = items_sheet.cell(row_idx, 3).value
    unit = items_sheet.cell(row_idx, 4).value
    threshold_val = items_sheet.cell(row_idx, 6).value
    
    # Ghi log giao dịch
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = "Nhập" if payload.changeAmount > 0 else "Xuất"
    amount = abs(payload.changeAmount)
    
    try:
        trans_sheet.append_row([timestamp, sku, item_name, action, amount, unit])
    except Exception as e:
        print(f"Error writing transaction: {e}")
    
    # Kểm tra cảnh báo
    try:
        threshold = int(threshold_val) if threshold_val else 0
        if payload.changeAmount < 0 and new_quantity <= threshold: # Chỉ gửi mail khi xuất làm giảm tồn kho
            send_alert_email(item_name, new_quantity, unit, threshold)
    except Exception as e:
        print(f"Error checking threshold: {e}")
    
    return {"message": "Quantity updated", "new_quantity": new_quantity}

# Initialize AI Engine Globally (to prevent loading repeatedly)
ai_engine = None

@app.post("/api/ocr")
async def process_ocr(file: UploadFile = File(...)):
    global ai_engine
    if ai_engine is None:
        try:
            ai_engine = InvoiceAI()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cannot initialize AI: {str(e)}")

    # Save uploaded file to temp file
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
    finally:
        file.file.close()

    # Process image with AI
    try:
        json_result = ai_engine.process_image(tmp_path)
        return {"success": True, "raw": ["AI Extracted JSON directly"], "data": json.loads(json_result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass



@app.post("/api/save-ocr")
async def save_ocr(data: str = Form(...)):
    try:
        # Xử lý phần dữ liệu (Dữ liệu đã được người dùng chỉnh sửa)
        parsed_data = json.loads(data)
        
        # Cập nhật số lượng vào Google Sheets
        items_sheet, trans_sheet = get_sheets()
        if items_sheet and trans_sheet:
            records = items_sheet.get_all_records()
            time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            for item in parsed_data:
                name = item.get("tên mặt hàng", "").strip()
                unit = item.get("đơn vị tính", "").strip()
                try:
                    qty = int(item.get("số lượng", 0))
                except ValueError:
                    qty = 0
                
                if not name or qty <= 0:
                    continue
                
                # Tìm mặt hàng có cùng tên và đơn vị tính (không phân biệt hoa thường)
                found_idx = -1
                current_qty = 0
                sku = ""
                for i, row in enumerate(records):
                    row_name = str(row.get("Tên hàng", "")).strip()
                    row_unit = str(row.get("ĐVT", "")).strip()
                    if row_name.lower() == name.lower() and row_unit.lower() == unit.lower():
                        found_idx = i + 2 # +2 vì get_all_records bỏ qua header (row 1) và list index bắt đầu từ 0
                        sku = str(row.get("Mã hàng", ""))
                        try:
                            current_qty = int(row.get("Số lượng", 0) or 0)
                        except ValueError:
                            current_qty = 0
                        break
                
                if found_idx != -1:
                    new_qty = current_qty + qty
                    items_sheet.update_cell(found_idx, 5, new_qty)
                    
                    # Ghi lịch sử
                    action = "Nhập"
                    try:
                        trans_sheet.append_row([time_str, sku, name, action, qty, unit])
                    except Exception as e:
                        print(f"Error writing transaction for OCR: {e}")
                elif item.get("isNewItem"):
                    # Thêm mặt hàng mới
                    new_stt = len(records) + 1
                    # Sinh mã SKU dựa trên timestamp để đảm bảo duy nhất
                    import time
                    new_sku = f"SP{int(time.time() * 1000)}"
                    try:
                        # STT, Mã hàng, Tên hàng, ĐVT, Số lượng, Hạn mức
                        items_sheet.append_row([new_stt, new_sku, name, unit, qty, 0])
                        # Ghi lịch sử
                        trans_sheet.append_row([time_str, new_sku, name, "Nhập", qty, unit])
                        
                        # Cập nhật records để các item sau (nếu trùng) có thể tìm thấy
                        records.append({
                            "Tên hàng": name,
                            "ĐVT": unit,
                            "Mã hàng": new_sku,
                            "Số lượng": qty
                        })
                    except Exception as e:
                        print(f"Error appending new item for OCR: {e}")
        
        return {
            "success": True, 
            "message": "Đã lưu thông tin hóa đơn và tự động nhập kho thành công.",
            "saved_data": parsed_data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

