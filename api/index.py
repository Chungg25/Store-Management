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

import time

CACHE = {}
CACHE_TTL = 15

def get_cached(key):
    if key in CACHE and time.time() - CACHE[key]["time"] < CACHE_TTL:
        return CACHE[key]["data"]
    return None

def set_cache(key, data):
    CACHE[key] = {"data": data, "time": time.time()}

def invalidate_cache():
    CACHE.clear()



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

def get_sheets():
    try:
        google_creds = os.environ.get("GOOGLE_CREDENTIALS")
        if google_creds:
            creds_dict = json.loads(google_creds)
            gc = gspread.service_account_from_dict(creds_dict)
        else:
            gc = gspread.service_account(filename=CREDENTIALS_PATH)
        sh = gc.open_by_key(SPREADSHEET_ID)
        
        items_sheet = None
        transactions_sheet = None
        data_sheet = None
        for sheet in sh.worksheets():
            if sheet.title.lower() == "inventory":
                items_sheet = sheet
            elif sheet.title == "LichSu":
                transactions_sheet = sheet
            elif sheet.title.lower() == "data":
                data_sheet = sheet
                
        if not items_sheet:
            items_sheet = sh.add_worksheet(title="Inventory", rows="1000", cols="20")
            items_sheet.append_row(["Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Hạn mức", "Phân loại"])
            
        if not transactions_sheet:
            transactions_sheet = sh.add_worksheet(title="LichSu", rows="1000", cols="6")
            transactions_sheet.append_row(["Thời gian", "Mã hàng", "Tên hàng", "Hành động", "Số lượng", "Đơn vị"])
            
        if not data_sheet:
            data_sheet = sh.get_worksheet(0)
            
        return items_sheet, transactions_sheet, data_sheet
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return None, None, None

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/items")
def get_items(type: str = ""):
    cached = get_cached("items")
    if cached: return cached
    
    items_sheet, _, data_sheet = get_sheets()
    if not items_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
        
    important_skus = set()
    if data_sheet:
        for r in data_sheet.get_all_records():
            s = r.get("Mã hàng")
            if s: important_skus.add(str(s).strip().lower())
    
    records = items_sheet.get_all_records()
    items = []
    for row in records:
        sku = row.get("Mã hàng")
        if not sku: continue
        try: qty = int(row.get("Số lượng", 0) or 0)
        except ValueError: qty = 0
        try: threshold = int(row.get("Hạn mức", 0) or 0)
        except ValueError: threshold = 0
        
        items.append({
            "id": row.get("STT") or "",
            "sku": sku,
            "name": row.get("Tên hàng"),
            "unit": row.get("ĐVT") or row.get("Đơn vị tính") or row.get("Đơn vị", ""),
            "quantity": qty,
            "minThreshold": threshold,
            "group": row.get("Nhóm", "") or row.get("Phân loại", ""),
            "isImportant": str(sku).strip().lower() in important_skus
        })
    set_cache("items", items)
    return items

@app.get("/api/transactions")
def get_transactions(type: str = ""):
    cached = get_cached("transactions")
    if cached: return cached
    _, trans_sheet, _ = get_sheets()
    if not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    records = trans_sheet.get_all_records()
    set_cache("transactions", records)
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
    invalidate_cache()
    items_sheet, _, _ = get_sheets()
    if not items_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    idx_map = get_column_indices(items_sheet)
    col_sku = idx_map.get("mã hàng")
    if not col_sku:
        raise HTTPException(status_code=500, detail="Sheet missing 'Mã hàng' column")
        
    cell = items_sheet.find(sku, in_column=col_sku)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    col_name = idx_map.get("tên hàng")
    col_unit = idx_map.get("đvt") or idx_map.get("đơn vị tính") or idx_map.get("đơn vị")
    col_thresh = idx_map.get("hạn mức")
    
    if col_name: items_sheet.update_cell(row_idx, col_name, payload.name)
    if col_unit: items_sheet.update_cell(row_idx, col_unit, payload.unit)
    if col_thresh: items_sheet.update_cell(row_idx, col_thresh, payload.minThreshold)
    
    return {"message": "Cập nhật thông tin thành công"}

def get_column_indices(sheet):
    header = sheet.row_values(1)
    idx_map = {}
    for i, h in enumerate(header):
        idx_map[h.strip().lower()] = i + 1
    return idx_map

def log_transaction(trans_sheet, timestamp, sku, item_name, action, amount, unit):
    try:
        trans_sheet.append_row([timestamp, sku, item_name, action, amount, unit])
    except Exception as e:
        print(f"Error writing transaction: {e}")

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate, background_tasks: BackgroundTasks):
    invalidate_cache()
    items_sheet, trans_sheet, _ = get_sheets()
    if not items_sheet or not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    idx_map = get_column_indices(items_sheet)
    col_sku = idx_map.get("mã hàng")
    if not col_sku:
        raise HTTPException(status_code=500, detail="Sheet is missing 'Mã hàng' column")
        
    cell = items_sheet.find(sku, in_column=col_sku)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    col_qty = idx_map.get("số lượng")
    if not col_qty:
        raise HTTPException(status_code=500, detail="Sheet is missing 'Số lượng' column")
        
    col_name = idx_map.get("tên hàng")
    col_unit = idx_map.get("đvt") or idx_map.get("đơn vị tính") or idx_map.get("đơn vị")
    
    row_data = items_sheet.row_values(row_idx)
    item_name = row_data[col_name - 1] if col_name and len(row_data) >= col_name else ""
    unit = row_data[col_unit - 1] if col_unit and len(row_data) >= col_unit else ""
    
    new_quantity = payload.quantity
    items_sheet.update_cell(row_idx, col_qty, new_quantity)
    
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
    timestamp = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S") if vn_tz else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = "Nhập" if payload.changeAmount > 0 else "Xuất"
    amount = abs(payload.changeAmount)
    
    background_tasks.add_task(log_transaction, trans_sheet, timestamp, sku, item_name, action, amount, unit)
    
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
async def save_ocr(data: str = Form(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        parsed_data = json.loads(data)
        invalidate_cache()
        items_sheet, trans_sheet, _ = get_sheets()
        if items_sheet and trans_sheet:
            idx_map = get_column_indices(items_sheet)
            col_qty = idx_map.get("số lượng")
            if not col_qty:
                raise HTTPException(status_code=500, detail="Sheet missing 'Số lượng' column")
            
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
                    items_sheet.update_cell(found_idx, col_qty, new_qty)
                    background_tasks.add_task(log_transaction, trans_sheet, time_str, sku, name, "Nhập", qty, unit)
                elif item.get("isNewItem"):
                    import time
                    new_sku = f"SP{int(time.time() * 1000)}"
                    try:
                        items_sheet.append_row([new_sku, name, unit, qty, 0, ""])
                        background_tasks.add_task(log_transaction, trans_sheet, time_str, new_sku, name, "Nhập", qty, unit)
                        records.append({
                            "Tên hàng": name,
                            "ĐVT": unit,
                            "Mã hàng": new_sku,
                            "Số lượng": qty
                        })
                    except Exception as e:
                        print(f"Error appending new item for OCR: {e}")
        
        return {"message": "Dữ liệu OCR đã được cập nhật thành công!"}
    except Exception as e:
        print(f"OCR Save Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))