import os
import json
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import gspread
from dotenv import load_dotenv
import tempfile
import shutil
from api.ai_scanner import InvoiceAI

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    import pytz
    SCHEDULER_AVAILABLE = True
except ImportError:
    SCHEDULER_AVAILABLE = False

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'), override=True)

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
EMAIL_RECEIVER = os.environ.get("EMAIL_RECEIVER") or EMAIL_SENDER
EMAIL_APP_PASSWORD = os.environ.get("EMAIL_APP_PASSWORD")
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), '../credentials.json')

def get_sheets(inventory_type="quan_trong"):
    try:
        google_creds = os.environ.get("GOOGLE_CREDENTIALS")
        if google_creds:
            creds_dict = json.loads(google_creds)
            gc = gspread.service_account_from_dict(creds_dict)
        else:
            gc = gspread.service_account(filename=CREDENTIALS_PATH)
        sh = gc.open_by_key(SPREADSHEET_ID)
        
        target_item_sheet = "Inventory" if inventory_type == "tong_kho" else "Data"
        target_hist_sheet = "LichSu_Tong" if inventory_type == "tong_kho" else "LichSu"

        items_sheet = None
        transactions_sheet = None
        for sheet in sh.worksheets():
            if sheet.title.lower() == target_item_sheet.lower():
                items_sheet = sheet
            if sheet.title == target_hist_sheet:
                transactions_sheet = sheet
                
        if not items_sheet:
            if inventory_type == "quan_trong":
                items_sheet = sh.get_worksheet(0)
            else:
                items_sheet = sh.add_worksheet(title="Inventory", rows="1000", cols="20")
                items_sheet.append_row(["Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Hạn mức", "Phân loại"])
            
        if not transactions_sheet:
            transactions_sheet = sh.add_worksheet(title=target_hist_sheet, rows="1000", cols="6")
            transactions_sheet.append_row(["Thời gian", "Mã hàng", "Tên hàng", "Hành động", "Số lượng", "Đơn vị"])
            
        return items_sheet, transactions_sheet
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return None, None

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/items")
def get_items(type: str = "quan_trong"):
    items_sheet, _ = get_sheets(type)
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
            "id": row.get("STT") or "",
            "sku": row.get("Mã hàng"),
            "name": row.get("Tên hàng"),
            "unit": row.get("ĐVT") or row.get("Đơn vị tính") or row.get("Đơn vị", ""),
            "quantity": qty,
            "minThreshold": threshold,
            "group": row.get("Nhóm", "") or row.get("Phân loại", "")
        })
        
    return items

@app.get("/api/transactions")
def get_transactions(type: str = "quan_trong"):
    _, trans_sheet = get_sheets(type)
    if not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
        
    records = trans_sheet.get_all_records()
    return records

class ItemUpdate(BaseModel):
    quantity: int
    changeAmount: int 
    type: str = "quan_trong"

class ItemDetailsUpdate(BaseModel):
    name: str
    unit: str
    minThreshold: int
    type: str = "quan_trong"

@app.put("/api/items/{sku}/details")
def update_item_details(sku: str, payload: ItemDetailsUpdate):
    items_sheet, _ = get_sheets(payload.type)
    if not items_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    cell = items_sheet.find(sku, in_column=1) if payload.type == "tong_kho" else items_sheet.find(sku, in_column=2)
    if not cell:
        # Fallback to general search
        cell = items_sheet.find(sku)
        if not cell:
            raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    col_name = 2 if payload.type == "tong_kho" else 3
    col_unit = 3 if payload.type == "tong_kho" else 4
    col_thresh = 5 if payload.type == "tong_kho" else 6
    
    items_sheet.update_cell(row_idx, col_name, payload.name)
    items_sheet.update_cell(row_idx, col_unit, payload.unit)
    items_sheet.update_cell(row_idx, col_thresh, payload.minThreshold)
    
    # Đồng bộ sang sheet còn lại
    other_type = "tong_kho" if payload.type == "quan_trong" else "quan_trong"
    other_items_sheet, _ = get_sheets(other_type)
    if other_items_sheet:
        try:
            cell_o = other_items_sheet.find(sku)
            if cell_o:
                ro = cell_o.row
                c_name = 2 if other_type == "tong_kho" else 3
                c_unit = 3 if other_type == "tong_kho" else 4
                c_thresh = 5 if other_type == "tong_kho" else 6
                other_items_sheet.update_cell(ro, c_name, payload.name)
                other_items_sheet.update_cell(ro, c_unit, payload.unit)
                other_items_sheet.update_cell(ro, c_thresh, payload.minThreshold)
        except Exception as e:
            print("Sync edit error:", e)
    
    return {"message": "Cập nhật thông tin thành công"}

def log_transaction(trans_sheet, timestamp, sku, item_name, action, amount, unit):
    try:
        trans_sheet.append_row([timestamp, sku, item_name, action, amount, unit])
    except Exception as e:
        print(f"Error writing transaction: {e}")

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate, background_tasks: BackgroundTasks):
    items_sheet, trans_sheet = get_sheets(payload.type)
    if not items_sheet or not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    cell = items_sheet.find(sku)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    col_qty = 4 if payload.type == "tong_kho" else 5
    
    row_data = items_sheet.row_values(row_idx)
    name_idx = 1 if payload.type == "tong_kho" else 2
    unit_idx = 2 if payload.type == "tong_kho" else 3
    item_name = row_data[name_idx] if len(row_data) > name_idx else ""
    unit = row_data[unit_idx] if len(row_data) > unit_idx else ""
    
    new_quantity = payload.quantity
    items_sheet.update_cell(row_idx, col_qty, new_quantity)
    
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
    timestamp = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S") if vn_tz else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = "Nhập" if payload.changeAmount > 0 else "Xuất"
    amount = abs(payload.changeAmount)
    
    background_tasks.add_task(log_transaction, trans_sheet, timestamp, sku, item_name, action, amount, unit)
    
    # Đồng bộ kép (Dual Sync)
    other_type = "tong_kho" if payload.type == "quan_trong" else "quan_trong"
    other_items_sheet, other_trans_sheet = get_sheets(other_type)
    if other_items_sheet and other_trans_sheet:
        try:
            cell_o = other_items_sheet.find(sku)
            if cell_o:
                ro = cell_o.row
                c_qty = 4 if other_type == "tong_kho" else 5
                old_qty_val = other_items_sheet.cell(ro, c_qty).value
                try: old_qty = int(old_qty_val or 0)
                except ValueError: old_qty = 0
                
                new_qty_other = old_qty + payload.changeAmount
                other_items_sheet.update_cell(ro, c_qty, new_qty_other)
                background_tasks.add_task(log_transaction, other_trans_sheet, timestamp, sku, item_name, action, amount, unit)
        except Exception as e:
            print("Sync transaction error:", e)
    
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



def sync_ocr_transactions(parsed_data, type, time_str):
    try:
        other_type = "tong_kho" if type == "quan_trong" else "quan_trong"
        other_items_sheet, other_trans_sheet = get_sheets(other_type)
        if not other_items_sheet or not other_trans_sheet:
            return
        
        other_records = other_items_sheet.get_all_records()
        for item in parsed_data:
            name = item.get("tên mặt hàng", "").strip()
            unit = item.get("đơn vị tính", "").strip()
            try: qty = int(item.get("số lượng", 0))
            except ValueError: qty = 0
            if not name or qty <= 0: continue
            
            for i, row in enumerate(other_records):
                row_name = str(row.get("Tên hàng", "")).strip()
                row_unit = str(row.get("ĐVT", "")).strip()
                # Thử so khớp cả "Đơn vị tính"
                alt_unit = str(row.get("Đơn vị tính", "")).strip()
                if row_name.lower() == name.lower() and (row_unit.lower() == unit.lower() or alt_unit.lower() == unit.lower()):
                    found_idx = i + 2
                    sku = str(row.get("Mã hàng", ""))
                    try: current_qty = int(row.get("Số lượng", 0) or 0)
                    except ValueError: current_qty = 0
                    
                    new_qty = current_qty + qty
                    col_qty = 4 if other_type == "tong_kho" else 5
                    other_items_sheet.update_cell(found_idx, col_qty, new_qty)
                    log_transaction(other_trans_sheet, time_str, sku, name, "Nhập", qty, unit)
                    break
    except Exception as e:
        print("OCR Sync error:", e)

@app.post("/api/save-ocr")
async def save_ocr(data: str = Form(...), type: str = Form("quan_trong"), background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        parsed_data = json.loads(data)
        
        items_sheet, trans_sheet = get_sheets(type)
        if items_sheet and trans_sheet:
            records = items_sheet.get_all_records()
            vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
            time_str = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S") if vn_tz else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            for item in parsed_data:
                name = item.get("tên mặt hàng", "").strip()
                unit = item.get("đơn vị tính", "").strip()
                try: qty = int(item.get("số lượng", 0))
                except ValueError: qty = 0
                
                if not name or qty <= 0: continue
                
                found_idx = -1
                current_qty = 0
                sku = ""
                for i, row in enumerate(records):
                    row_name = str(row.get("Tên hàng", "")).strip()
                    row_unit = str(row.get("ĐVT", "")).strip()
                    alt_unit = str(row.get("Đơn vị tính", "")).strip()
                    if row_name.lower() == name.lower() and (row_unit.lower() == unit.lower() or alt_unit.lower() == unit.lower()):
                        found_idx = i + 2 
                        sku = str(row.get("Mã hàng", ""))
                        try: current_qty = int(row.get("Số lượng", 0) or 0)
                        except ValueError: current_qty = 0
                        break
                
                if found_idx != -1:
                    new_qty = current_qty + qty
                    col_qty = 4 if type == "tong_kho" else 5
                    items_sheet.update_cell(found_idx, col_qty, new_qty)
                    log_transaction(trans_sheet, time_str, sku, name, "Nhập", qty, unit)
                elif item.get("isNewItem"):
                    new_stt = len(records) + 1
                    import time
                    new_sku = f"SP{int(time.time() * 1000)}"
                    try:
                        if type == "tong_kho":
                            items_sheet.append_row([new_sku, name, unit, qty, 0, ""])
                        else:
                            items_sheet.append_row([new_stt, new_sku, name, unit, qty, 0])
                        log_transaction(trans_sheet, time_str, new_sku, name, "Nhập", qty, unit)
                        records.append({
                            "Tên hàng": name,
                            "ĐVT": unit,
                            "Mã hàng": new_sku,
                            "Số lượng": qty
                        })
                    except Exception as e:
                        print(f"Error appending new item for OCR: {e}")
            
            # Kích hoạt đồng bộ kép chạy ngầm
            background_tasks.add_task(sync_ocr_transactions, parsed_data, type, time_str)
        
        return {
            "success": True, 
            "message": "Đã lưu thông tin hóa đơn và tự động nhập kho thành công.",
            "saved_data": parsed_data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Trigger reload
