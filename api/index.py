import os
import json
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
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
        error_sheet = None
        for sheet in sh.worksheets():
            if sheet.title.lower() == "inventory":
                items_sheet = sheet
            elif sheet.title == "LichSu":
                transactions_sheet = sheet
            elif sheet.title.lower() == "data":
                data_sheet = sheet
            elif sheet.title == "ErrorLogs":
                error_sheet = sheet
                
        if not items_sheet:
            items_sheet = sh.add_worksheet(title="Inventory", rows="1000", cols="20")
            items_sheet.append_row(["Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Hạn mức", "Phân loại"])
            
        if not transactions_sheet:
            transactions_sheet = sh.add_worksheet(title="LichSu", rows="1000", cols="6")
            transactions_sheet.append_row(["Thời gian", "Mã hàng", "Tên hàng", "Hành động", "Số lượng", "Đơn vị", "Người thực hiện"])
            
        if not data_sheet:
            data_sheet = sh.get_worksheet(0)
            
        if not error_sheet:
            error_sheet = sh.add_worksheet(title="ErrorLogs", rows="1000", cols="2")
            error_sheet.append_row(["Thời gian", "Chi tiết lỗi"])
            
        return items_sheet, transactions_sheet, data_sheet, error_sheet
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return None, None, None, None

def log_error(error_sheet, error_message):
    if error_sheet:
        try:
            vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
            timestamp = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S") if vn_tz else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            error_sheet.append_row([timestamp, str(error_message)])
        except Exception:
            pass

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/items")
def get_items(type: str = "", background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        items_sheet, _, data_sheet, error_sheet = get_sheets()
        if not items_sheet:
            raise Exception("Cannot connect to Google Sheets")
            
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
                "conversion": row.get("Quy đổi", ""),
                "minThreshold": threshold,
                "group": row.get("Nhóm", "") or row.get("Phân loại", ""),
                "isImportant": str(sku).strip().lower() in important_skus
            })
        return items
    except Exception as e:
        items_sheet, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"get_items error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transactions")
def get_transactions(type: str = "", background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        _, trans_sheet, _, error_sheet = get_sheets()
        if not trans_sheet:
            raise Exception("Cannot connect to Google Sheets")
        records = trans_sheet.get_all_records()
        return records
    except Exception as e:
        _, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"get_transactions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ItemCreate(BaseModel):
    name: str
    unit: str
    quantity: int
    conversion: str
    minThreshold: int
    group: str
    date: str = None

@app.post("/api/items")
def create_item(payload: ItemCreate, background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        items_sheet, trans_sheet, _, error_sheet = get_sheets()
        if not items_sheet or not trans_sheet:
            raise Exception("Cannot connect to Google Sheets")
            
        records = items_sheet.get_all_records()
        headers = items_sheet.row_values(1)
        
        max_stt = 0
        max_sku_num = 0
        
        for row in records:
            # Parse STT
            try:
                stt_val = int(row.get("STT", 0) or 0)
                if stt_val > max_stt: max_stt = stt_val
            except Exception:
                pass
            
            # Parse SKU (Mã hàng) assuming format like SP001
            sku_val = str(row.get("Mã hàng", "")).strip().upper()
            if sku_val.startswith("SP"):
                try:
                    num_val = int(sku_val.replace("SP", ""))
                    if num_val > max_sku_num: max_sku_num = num_val
                except Exception:
                    pass
        
        new_stt = max_stt + 1
        new_sku = f"SP{max_sku_num + 1:03d}"
        
        # Build row array based on headers
        new_row = [""] * len(headers)
        for i, h in enumerate(headers):
            h_lower = h.strip().lower()
            if h_lower == "stt": new_row[i] = new_stt
            elif h_lower == "mã hàng": new_row[i] = new_sku
            elif h_lower == "tên hàng": new_row[i] = payload.name
            elif h_lower in ["đvt", "đơn vị tính", "đơn vị"]: new_row[i] = payload.unit
            elif h_lower == "số lượng": new_row[i] = payload.quantity
            elif h_lower == "quy đổi": new_row[i] = payload.conversion
            elif h_lower == "hạn mức": new_row[i] = payload.minThreshold
            elif h_lower in ["nhóm", "phân loại"]: new_row[i] = payload.group
        
        # If headers are missing some columns, we should append them but for now assume they exist
        items_sheet.append_row(new_row)
        
        if payload.quantity > 0:
            vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
            now_time = datetime.now(vn_tz) if vn_tz else datetime.now()
            if payload.date:
                timestamp = f"{payload.date} {now_time.strftime('%H:%M:%S')}"
            else:
                timestamp = now_time.strftime("%Y-%m-%d %H:%M:%S")
            background_tasks.add_task(log_transaction, trans_sheet, timestamp, new_sku, payload.name, "Nhập", payload.quantity, payload.unit, "Đan")
            
        return {"message": "Tạo thành công", "sku": new_sku}
    except Exception as e:
        _, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"create_item error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/implants")
def get_implants():
    try:
        google_creds = os.environ.get("GOOGLE_CREDENTIALS")
        if google_creds:
            creds_dict = json.loads(google_creds)
            gc = gspread.service_account_from_dict(creds_dict)
        else:
            gc = gspread.service_account(filename=CREDENTIALS_PATH)
        sh = gc.open_by_key(SPREADSHEET_ID)
        try:
            ws = sh.worksheet('Implant')
        except:
            ws = sh.worksheet('implant')
        records = ws.get_all_records()
        implants = []
        current_category = "Khác"
        for row in records:
            clean_row = {}
            for k, v in row.items():
                k_clean = str(k).strip()
                if 'M' in k_clean: clean_row['sku'] = v
                elif 'H' in k_clean: clean_row['name'] = v
                elif 'V' in k_clean: clean_row['unit'] = v
                elif 'S' in k_clean and 'l' in k_clean: clean_row['quantity'] = v
                elif 'STT' in k_clean: clean_row['id'] = v
            
            sku_val = str(clean_row.get('sku', '')).strip()
            name_val = str(clean_row.get('name', '')).strip()
            
            if not sku_val and name_val:
                current_category = name_val
            elif sku_val:
                clean_row['category'] = current_category
                implants.append(clean_row)
        return implants
    except Exception as e:
        import traceback
        with open('error_log.txt', 'a', encoding='utf-8') as f:
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(status_code=500, detail=str(e))

class ItemUpdate(BaseModel):
    quantity: int
    changeAmount: int 
    type: str = "quan_trong"
    date: Optional[str] = None
    sub_sku: Optional[str] = None
    sub_name: Optional[str] = None

class ItemDetailsUpdate(BaseModel):
    name: str
    unit: str
    minThreshold: int
    type: str = "quan_trong"

@app.put("/api/items/{sku}/details")
def update_item_details(sku: str, payload: ItemDetailsUpdate, background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        items_sheet, _, _, error_sheet = get_sheets()
        if not items_sheet:
            raise Exception("Cannot connect to Google Sheets")
        
        idx_map = get_column_indices(items_sheet)
        col_sku = idx_map.get("mã hàng")
        if not col_sku:
            raise Exception("Sheet missing 'Mã hàng' column")
            
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
    except HTTPException:
        raise
    except Exception as e:
        _, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"update_item_details error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def get_column_indices(sheet):
    header = sheet.row_values(1)
    idx_map = {}
    for i, h in enumerate(header):
        idx_map[h.strip().lower()] = i + 1
    return idx_map

def log_transaction(trans_sheet, timestamp, sku, item_name, action, amount, unit, person):
    try:
        trans_sheet.append_row([timestamp, sku, item_name, action, amount, unit, person])
    except Exception as e:
        print(f"Error writing transaction: {e}")

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate, background_tasks: BackgroundTasks):
    try:
        items_sheet, trans_sheet, _, error_sheet = get_sheets()
        if not items_sheet or not trans_sheet:
            raise Exception("Cannot connect to Google Sheets")
        
        idx_map = get_column_indices(items_sheet)
        col_sku = idx_map.get("mã hàng")
        if not col_sku:
            raise Exception("Sheet is missing 'Mã hàng' column")
            
        cell = items_sheet.find(sku, in_column=col_sku)
        if not cell:
            raise HTTPException(status_code=404, detail="Item not found")
            
        row_idx = cell.row
        col_qty = idx_map.get("số lượng")
        if not col_qty:
            raise Exception("Sheet is missing 'Số lượng' column")
            
        col_name = idx_map.get("tên hàng")
        col_unit = idx_map.get("đvt") or idx_map.get("đơn vị tính") or idx_map.get("đơn vị")
        
        row_data = items_sheet.row_values(row_idx)
        item_name = row_data[col_name - 1] if col_name and len(row_data) >= col_name else ""
        unit = row_data[col_unit - 1] if col_unit and len(row_data) >= col_unit else ""
        
        new_quantity = payload.quantity
        items_sheet.update_cell(row_idx, col_qty, new_quantity)
        
        vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
        now_time = datetime.now(vn_tz) if vn_tz else datetime.now()
        if payload.date:
            timestamp = f"{payload.date} {now_time.strftime('%H:%M:%S')}"
        else:
            timestamp = now_time.strftime("%Y-%m-%d %H:%M:%S")
        action = "Nhập" if payload.changeAmount > 0 else "Xuất"
        person = "Đan" if action == "Nhập" else "Bình"
        amount = abs(payload.changeAmount)
        
        # Cập nhật số lượng của size cụ thể bên sheet Implant nếu có
        if payload.sub_sku:
            try:
                google_creds = os.environ.get("GOOGLE_CREDENTIALS")
                if google_creds:
                    gc = gspread.service_account_from_dict(json.loads(google_creds))
                else:
                    gc = gspread.service_account(filename=CREDENTIALS_PATH)
                sh = gc.open_by_key(SPREADSHEET_ID)
                try:
                    implant_ws = sh.worksheet('Implant')
                except:
                    implant_ws = sh.worksheet('implant')
                    
                implant_idx_map = get_column_indices(implant_ws)
                implant_col_sku = implant_idx_map.get("mã hàng") or implant_col_sku
                implant_col_qty = implant_idx_map.get("số lượng") or implant_col_qty
                
                # Default indices if mapping fails for some reason
                if not implant_col_sku: implant_col_sku = 2
                if not implant_col_qty: implant_col_qty = 6
                
                implant_cell = implant_ws.find(payload.sub_sku, in_column=implant_col_sku)
                if implant_cell:
                    impl_row = implant_cell.row
                    curr_val = implant_ws.cell(impl_row, implant_col_qty).value
                    try:
                        curr_q = int(curr_val) if curr_val else 0
                    except:
                        curr_q = 0
                    implant_ws.update_cell(impl_row, implant_col_qty, curr_q + payload.changeAmount)
            except Exception as e:
                print("Lỗi update implant sheet:", e)
        
        trans_name = item_name
        if payload.sub_name:
            trans_name = f"{item_name} (Size: {payload.sub_name})"
        
        background_tasks.add_task(log_transaction, trans_sheet, timestamp, sku, trans_name, action, amount, unit, person)
        
        return {"message": "Quantity updated", "new_quantity": new_quantity}
    except HTTPException:
        raise
    except Exception as e:
        _, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"update_item_quantity error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        items_sheet, trans_sheet, _, error_sheet = get_sheets()
        if items_sheet and trans_sheet:
            idx_map = get_column_indices(items_sheet)
            col_qty = idx_map.get("số lượng")
            if not col_qty:
                raise Exception("Sheet missing 'Số lượng' column")
            
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
                    background_tasks.add_task(log_transaction, trans_sheet, time_str, sku, name, "Nhập", qty, unit, "Đan")
                elif item.get("isNewItem"):
                    import time
                    new_sku = f"SP{int(time.time() * 1000)}"
                    try:
                        items_sheet.append_row([new_sku, name, unit, qty, 0, ""])
                        background_tasks.add_task(log_transaction, trans_sheet, time_str, new_sku, name, "Nhập", qty, unit, "Đan")
                        records.append({
                            "Tên hàng": name,
                            "ĐVT": unit,
                            "Mã hàng": new_sku,
                            "Số lượng": qty
                        })
                    except Exception as e:
                        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"OCR Append new item error: {str(e)}")
        
        return {"message": "Dữ liệu OCR đã được cập nhật thành công!"}
    except Exception as e:
        _, _, _, error_sheet = get_sheets()
        if error_sheet: background_tasks.add_task(log_error, error_sheet, f"OCR Save Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))