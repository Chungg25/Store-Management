import os
import json
import smtplib
import requests
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
GOOGLE_MAIL_SCRIPT_URL = os.environ.get("GOOGLE_MAIL_SCRIPT_URL")
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
    
    if GOOGLE_MAIL_SCRIPT_URL:
        try:
            payload = {
                "to": EMAIL_RECEIVER,
                "subject": subject,
                "htmlBody": body.replace('\n', '<br>')
            }
            requests.post(GOOGLE_MAIL_SCRIPT_URL, json=payload, timeout=10)
        except Exception as e:
            print(f"Failed to send webhook email: {e}")
    else:
        # Fallback to SMTP if webhook not configured
        msg = MIMEMultipart()
        msg['From'] = EMAIL_SENDER
        msg['To'] = EMAIL_RECEIVER
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_APP_PASSWORD)
            text = msg.as_string()
            receiver_emails = [email.strip() for email in EMAIL_RECEIVER.split(',')]
            server.sendmail(EMAIL_SENDER, receiver_emails, text)
            server.quit()
        except Exception as e:
            print(f"Failed to send email: {e}")

def generate_and_send_daily_report():
    if not EMAIL_APP_PASSWORD or EMAIL_SENDER == "example@gmail.com":
        print("Daily report skipped: Email not configured")
        return {"status": "skipped", "reason": "Email not configured"}

    items_sheet, _ = get_sheets()
    if not items_sheet:
        return {"status": "error", "reason": "Cannot connect to Google Sheets"}
        
    records = items_sheet.get_all_records()
    low_stock_items = []
    
    for row in records:
        if not row.get("Mã hàng"): continue
        try: qty = int(row.get("Số lượng", 0) or 0)
        except ValueError: qty = 0
        try: threshold = int(row.get("Hạn mức", 0) or 0)
        except ValueError: threshold = 0
        
        if threshold > 0 and qty <= threshold:
            low_stock_items.append({
                "sku": row.get("Mã hàng"),
                "name": row.get("Tên hàng"),
                "unit": row.get("ĐVT"),
                "quantity": qty,
                "threshold": threshold
            })
            
    if not low_stock_items:
        print("Daily report: All items are sufficiently stocked.")
        return {"status": "ok", "message": "No items need restocking"}

    # Generate HTML Table
    table_rows = ""
    for idx, item in enumerate(low_stock_items):
        bg_color = "#ffffff" if idx % 2 == 0 else "#f9fafb"
        table_rows += f"""
        <tr style="background-color: {bg_color};">
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{item['sku']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #1f2937;">{item['name']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #ef4444; font-weight: bold;">{item['quantity']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">{item['threshold']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{item['unit']}</td>
        </tr>
        """

    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
    today_str = datetime.now(vn_tz).strftime("%d/%m/%Y") if vn_tz else datetime.now().strftime("%d/%m/%Y")
    
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #1597E5; padding: 20px; text-align: center; color: white;">
                <h2 style="margin: 0; font-size: 24px;">Báo Cáo Tồn Kho Dr. Smile</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Tự động tạo lúc 8:00 Sáng - Ngày {today_str}</p>
            </div>
            <div style="padding: 20px;">
                <p style="font-size: 16px; color: #374151;">Xin chào Quản lý Kho,</p>
                <p style="font-size: 16px; color: #374151;">Hệ thống ghi nhận có <strong>{len(low_stock_items)}</strong> vật tư đã cạn kiệt hoặc chạm mức tối thiểu. Vui lòng xem danh sách bên dưới và lên kế hoạch nhập hàng:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 10px; text-align: left; font-size: 14px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Mã hàng</th>
                            <th style="padding: 10px; text-align: left; font-size: 14px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Tên vật tư</th>
                            <th style="padding: 10px; text-align: left; font-size: 14px; color: #ef4444; border-bottom: 2px solid #e5e7eb;">Tồn kho</th>
                            <th style="padding: 10px; text-align: left; font-size: 14px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Hạn mức</th>
                            <th style="padding: 10px; text-align: left; font-size: 14px; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Đơn vị</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table_rows}
                    </tbody>
                </table>
                
                <div style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                    <p style="margin: 0;">Email này được gửi tự động từ Hệ thống Quản lý Kho Dr. Smile.</p>
                </div>
            </div>
        </div>
      </body>
    </html>
    """
    
    subject = f"🔔 Báo cáo Nhập hàng tự động - Ngày {today_str}"
    if GOOGLE_MAIL_SCRIPT_URL:
        try:
            payload = {
                "to": EMAIL_RECEIVER,
                "subject": subject,
                "htmlBody": html_body
            }
            response = requests.post(GOOGLE_MAIL_SCRIPT_URL, json=payload, timeout=15)
            return {"status": "ok", "message": f"Sent report via Webhook for {len(low_stock_items)} items. Response: {response.text}"}
        except Exception as e:
            print(f"Failed to send daily report via Webhook: {e}")
            return {"status": "error", "message": f"Webhook Error: {str(e)}"}
    else:
        # Fallback to SMTP
        msg = MIMEMultipart()
        msg['From'] = EMAIL_SENDER
        msg['To'] = EMAIL_RECEIVER
        msg['Subject'] = subject
        
        msg.attach(MIMEText("Vui lòng mở email bằng trình duyệt hỗ trợ HTML.", 'plain'))
        msg.attach(MIMEText(html_body, 'html'))

        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_APP_PASSWORD)
            text = msg.as_string()
            receiver_emails = [email.strip() for email in EMAIL_RECEIVER.split(',')]
            server.sendmail(EMAIL_SENDER, receiver_emails, text)
            server.quit()
            return {"status": "ok", "message": f"Sent report via SMTP for {len(low_stock_items)} items."}
        except Exception as e:
            print(f"Failed to send daily report email: {e}")
            return {"status": "error", "message": f"SMTP Error: {str(e)}"}

@app.on_event("startup")
def setup_cron():
    if SCHEDULER_AVAILABLE:
        scheduler = AsyncIOScheduler()
        tz = pytz.timezone('Asia/Ho_Chi_Minh')
        scheduler.add_job(generate_and_send_daily_report, 'cron', hour=8, minute=0, timezone=tz)
        scheduler.start()
        print("Background cron scheduler started (08:00 AM VN Time).")
    else:
        print("APScheduler not installed. Internal cron is disabled.")

@app.get("/api/cron/daily-report")
def trigger_daily_report():
    result = generate_and_send_daily_report()
    return result

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

def log_transaction_and_check_alert(trans_sheet, timestamp, sku, item_name, action, amount, unit, threshold_val, new_quantity, change_amount):
    try:
        trans_sheet.append_row([timestamp, sku, item_name, action, amount, unit])
    except Exception as e:
        print(f"Error writing transaction: {e}")
        
    try:
        threshold = int(threshold_val) if threshold_val else 0
        if change_amount < 0 and new_quantity <= threshold: # Chỉ gửi mail khi xuất làm giảm tồn kho
            send_alert_email(item_name, new_quantity, unit, threshold)
    except Exception as e:
        print(f"Error checking threshold: {e}")

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate, background_tasks: BackgroundTasks):
    items_sheet, trans_sheet = get_sheets()
    if not items_sheet or not trans_sheet:
        raise HTTPException(status_code=500, detail="Cannot connect to Google Sheets")
    
    cell = items_sheet.find(sku, in_column=2)
    if not cell:
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = cell.row
    new_quantity = payload.quantity
    
    # Tối ưu: Lấy toàn bộ dữ liệu dòng chỉ trong 1 API call thay vì 3
    row_data = items_sheet.row_values(row_idx)
    item_name = row_data[2] if len(row_data) > 2 else ""
    unit = row_data[3] if len(row_data) > 3 else ""
    threshold_val = row_data[5] if len(row_data) > 5 else "0"
    
    items_sheet.update_cell(row_idx, 5, new_quantity)
    
    # Ghi log giao dịch và kiểm tra cảnh báo (chạy ngầm để phản hồi nhanh)
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh') if SCHEDULER_AVAILABLE else None
    timestamp = datetime.now(vn_tz).strftime("%Y-%m-%d %H:%M:%S") if vn_tz else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    action = "Nhập" if payload.changeAmount > 0 else "Xuất"
    amount = abs(payload.changeAmount)
    
    background_tasks.add_task(
        log_transaction_and_check_alert, 
        trans_sheet, timestamp, sku, item_name, action, amount, unit, threshold_val, new_quantity, payload.changeAmount
    )
    
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


# Trigger reload
