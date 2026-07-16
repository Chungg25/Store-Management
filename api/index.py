from pytz import timezone
import os
import json
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import pytz
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from pydantic import BaseModel
from dotenv import load_dotenv
import tempfile
import shutil
from api.ai_scanner import InvoiceAI
from supabase import create_client, Client

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    import pytz
    SCHEDULER_AVAILABLE = True
except ImportError:
    SCHEDULER_AVAILABLE = False

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'), override=True)


def get_local_now():
    return datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).isoformat()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("SUPABASE_URL or SUPABASE_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

EMAIL_SENDER = os.environ.get("EMAIL_SENDER", "example@gmail.com")
EMAIL_RECEIVER = os.environ.get("EMAIL_RECEIVER") or EMAIL_SENDER
EMAIL_APP_PASSWORD = os.environ.get("EMAIL_APP_PASSWORD")

def log_error(error_message):
    try:
        print(f"ERROR: {error_message}")
    except Exception:
        pass

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/items")
def get_items(type: str = "", background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        from datetime import datetime
        supabase = get_supabase_client()
        items_res = supabase.table('items').select('*').execute()
        
        batches_res = supabase.table('inventory_batches').select('item_id, expiration_date').gt('remaining_quantity', 0).execute()
        
        today = datetime.now().date()
        expiring_map = {}
        for b in batches_res.data:
            item_id = b['item_id']
            exp_date_str = b.get('expiration_date')
            if exp_date_str:
                if item_id not in expiring_map:
                    expiring_map[item_id] = []
                expiring_map[item_id].append(exp_date_str)
                
        result = []
        for item in items_res.data:
            item_id = item.get("id")
            warning_days = item.get("exp_warning_days") or 0
            
            is_expiring = False
            closest_exp = None
            if item_id in expiring_map and warning_days > 0:
                dates = []
                for ds in expiring_map[item_id]:
                    try:
                        dates.append(datetime.strptime(ds, "%Y-%m-%d").date())
                    except:
                        pass
                if dates:
                    closest_date = min(dates)
                    closest_exp = closest_date.strftime("%Y-%m-%d")
                    if (closest_date - today).days <= warning_days:
                        is_expiring = True

            result.append({
                "id": item_id,
                "sku": item.get("sku"),
                "name": item.get("name"),
                "unit": item.get("unit"),
                "quantity": item.get("quantity", 0),
                "conversion": "",
                "minThreshold": item.get("min_quantity", 0),
                "expWarningDays": warning_days,
                "group": item.get("category", ""),
                "isImportant": item.get("is_important", False),
                "isExpiring": is_expiring,
                "closestExpirationDate": closest_exp
            })
        return result
    except Exception as e:
        background_tasks.add_task(log_error, f"get_items error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transactions")
def get_transactions(type: str = "", background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        supabase = get_supabase_client()
        trans_res = supabase.table('transactions').select('*, items(sku, name, unit)').order('system_created_at', desc=True).execute()
        
        result = []
        import pytz
        from datetime import datetime
        hcm_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        
        for t in trans_res.data:
            item_data = t.get('items', {})
            created_at_utc = t.get("created_at")
            sys_created = t.get("system_created_at")
            hcm_str = ""
            sys_str = ""
            if created_at_utc:
                # Nếu là ngày chọn (có giờ là 00:00:00) thì không đổi timezone, giữ nguyên
                if "00:00:00" in created_at_utc:
                    hcm_str = created_at_utc[:10]
                else:
                    try:
                        if created_at_utc.endswith('Z'):
                            created_at_utc = created_at_utc[:-1] + '+00:00'
                        dt = datetime.fromisoformat(created_at_utc)
                        dt_hcm = dt.astimezone(hcm_tz)
                        hcm_str = dt_hcm.strftime('%Y-%m-%d')
                    except Exception:
                        hcm_str = created_at_utc[:10]
            if sys_created:
                try:
                    if sys_created.endswith('Z'):
                        sys_created = sys_created[:-1] + '+00:00'
                    dt_sys = datetime.fromisoformat(sys_created)
                    dt_sys_hcm = dt_sys.astimezone(hcm_tz)
                    sys_str = dt_sys_hcm.strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    sys_str = sys_created[:19].replace('T', ' ')
            result.append({
                "Thời gian": hcm_str,
                "Thời gian hệ thống": sys_str,
                "Mã hàng": item_data.get("sku", ""),
                "Tên hàng": item_data.get("name", ""),
                "Hành động": "Nhập" if t.get("action") == "IMPORT" else "Xuất",
                "Số lượng": t.get("quantity"),
                "Đơn vị": item_data.get("unit", ""),
                "Người thực hiện": t.get("user_name", "")
            })
        return result
    except Exception as e:
        background_tasks.add_task(log_error, f"get_transactions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from typing import Optional

class ItemCreate(BaseModel):
    name: str
    unit: str
    quantity: int
    conversion: str = ""
    minThreshold: int = 0
    group: str = ""
    date: Optional[str] = None
    importPrice: Optional[float] = None
    expirationDate: Optional[str] = None
    expWarningDays: int = 30

@app.post("/api/items")
def create_item(payload: ItemCreate, background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        current_now = get_local_now()
        txn_date = payload.date if payload.date else current_now[:10]
        txn_created_at = f"{txn_date} 00:00:00"
        
        supabase = get_supabase_client()
        import time
        new_sku = f"SP{int(time.time() * 1000)}"
        
        item_data = {
            "sku": new_sku,
            "name": payload.name,
            "unit": payload.unit,
            "category": payload.group,
            "min_quantity": payload.minThreshold,
            "exp_warning_days": payload.expWarningDays,
            "quantity": payload.quantity
        }
        item_res = supabase.table('items').insert(item_data).execute()
        item_id = item_res.data[0]['id']
        
        if payload.quantity > 0:
            batch_data = {
                "item_id": item_id,
                "original_quantity": payload.quantity,
                "remaining_quantity": payload.quantity,
                "import_price": payload.importPrice,
                "expiration_date": payload.expirationDate if payload.expirationDate else None,
                "created_at": txn_created_at,
                "system_created_at": current_now
            }
            batch_res = supabase.table('inventory_batches').insert(batch_data).execute()
            batch_id = batch_res.data[0]['id']
            
            trans_data = {
                "item_id": item_id,
                "batch_id": batch_id,
                "action": "IMPORT",
                "quantity": payload.quantity,
                "user_name": "Đan",
                "created_at": txn_created_at,
                "system_created_at": current_now
            }
            supabase.table('transactions').insert(trans_data).execute()
            
        return {"message": "Tạo thành công", "sku": new_sku}
    except Exception as e:
        background_tasks.add_task(log_error, f"create_item error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/implants")
def get_implants():
    try:
        supabase = get_supabase_client()
        res = supabase.table('implants').select('*').order('quantity', desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ItemDetailsUpdate(BaseModel):
    name: str
    unit: str
    minThreshold: int
    expWarningDays: int = 30
    type: str = "quan_trong"

@app.put("/api/items/{sku}/details")
def update_item_details(sku: str, payload: ItemDetailsUpdate, background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        supabase = get_supabase_client()
        item_res = supabase.table('items').select('id').eq('sku', sku).execute()
        if not item_res.data:
            raise HTTPException(status_code=404, detail="Item not found")
            
        item_id = item_res.data[0]['id']
        update_data = {
            "name": payload.name,
            "unit": payload.unit,
            "min_quantity": payload.minThreshold,
            "exp_warning_days": payload.expWarningDays
        }
        supabase.table('items').update(update_data).eq('id', item_id).execute()
        
        return {"message": "Cập nhật thông tin thành công"}
    except HTTPException:
        raise
    except Exception as e:
        background_tasks.add_task(log_error, f"update_item_details error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/items/{sku}/batches")
def get_item_batches(sku: str, background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        supabase = get_supabase_client()
        # Find item id first
        item_res = supabase.table('items').select('id, name').eq('sku', sku).execute()
        if not item_res.data:
            raise HTTPException(status_code=404, detail="Item not found")
            
        item_id = item_res.data[0]['id']
        
        # Get all batches (including depleted)
        batches_res = supabase.table('inventory_batches').select('*').eq('item_id', item_id).order('expiration_date', nullsfirst=False).order('created_at').execute()
        
        batches_data = []
        for b in batches_res.data:
            b_copy = dict(b)
            if b_copy.get('created_at'):
                b_copy['created_at'] = b_copy['created_at'][:19].replace('T', ' ')
            batches_data.append(b_copy)
            
        return {
            "sku": sku,
            "name": item_res.data[0]['name'],
            "batches": batches_data
        }
    except HTTPException:
        raise
    except Exception as e:
        background_tasks.add_task(log_error, f"get_item_batches error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/expiring-batches")
def get_expiring_batches():
    try:
        supabase = get_supabase_client()
        items_res = supabase.table('items').select('*').execute()
        items_dict = {item['id']: item for item in items_res.data}
        
        batches_res = supabase.table('inventory_batches').select('*').gt('remaining_quantity', 0).execute()
        
        today = datetime.now().date()
        expiring = []
        for b in batches_res.data:
            item_id = b['item_id']
            item = items_dict.get(item_id)
            if not item:
                continue
            
            exp_date_str = b.get('expiration_date')
            if exp_date_str:
                try:
                    exp_date = datetime.strptime(exp_date_str, '%Y-%m-%d').date()
                    warning_days = item.get("exp_warning_days", 30)
                    diff_days = (exp_date - today).days
                    if diff_days <= warning_days:
                        b_info = dict(b)
                        b_info['item_sku'] = item['sku']
                        b_info['item_name'] = item['name']
                        b_info['diff_days'] = diff_days
                        expiring.append(b_info)
                except:
                    pass
                    
        return expiring
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export-expiring-batches")
def export_expiring_batches(background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        supabase = get_supabase_client()
        items_res = supabase.table('items').select('*').execute()
        items_dict = {item['id']: item for item in items_res.data}
        
        batches_res = supabase.table('inventory_batches').select('*').gt('remaining_quantity', 0).execute()
        
        today = datetime.now().date()
        exported_count = 0
        for b in batches_res.data:
            item_id = b['item_id']
            item = items_dict.get(item_id)
            if not item:
                continue
            
            exp_date_str = b.get('expiration_date')
            if exp_date_str:
                try:
                    exp_date = datetime.strptime(exp_date_str, '%Y-%m-%d').date()
                    warning_days = item.get("exp_warning_days", 30)
                    if (exp_date - today).days <= warning_days:
                        qty = b['remaining_quantity']
                        # Update batch to 0
                        supabase.table('inventory_batches').update({"remaining_quantity": 0}).eq('id', b['id']).execute()
                        
                        # Log transaction
                        trans_data = {
                            "item_id": item_id,
                            "batch_id": b['id'],
                            "action": "EXPORT",
                            "quantity": qty,
                            "user_name": "Hệ thống (Hủy cận hạn)",
                            "created_at": get_local_now()
                        }
                        supabase.table('transactions').insert(trans_data).execute()
                        
                        # Update item quantity
                        new_qty = max(0, item['quantity'] - qty)
                        supabase.table('items').update({'quantity': new_qty}).eq('id', item_id).execute()
                        item['quantity'] = new_qty
                        exported_count += 1
                except:
                    pass
                    
        return {"message": f"Đã hủy thành công {exported_count} lô hàng."}
    except Exception as e:
        background_tasks.add_task(log_error, f"export_expiring_batches error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class ItemUpdate(BaseModel):
    quantity: int
    changeAmount: int 
    type: str = "quan_trong"
    date: Optional[str] = None
    importPrice: Optional[float] = None
    expirationDate: Optional[str] = None
    sub_sku: Optional[str] = None
    sub_name: Optional[str] = None
    expWarningDays: Optional[int] = None

@app.put("/api/items/{sku}")
def update_item_quantity(sku: str, payload: ItemUpdate, background_tasks: BackgroundTasks):
    try:
        current_now = get_local_now()
        txn_date = payload.date if payload.date else current_now[:10]
        txn_created_at = f"{txn_date} 00:00:00"

        supabase = get_supabase_client()
        item_res = supabase.table('items').select('id, name, unit').eq('sku', sku).execute()
        if not item_res.data:
            raise HTTPException(status_code=404, detail="Item not found")
        item = item_res.data[0]
        item_id = item['id']
        
        if payload.changeAmount > 0: # IMPORT
            batch_data = {
                "item_id": item_id,
                "original_quantity": payload.changeAmount,
                "remaining_quantity": payload.changeAmount,
                "import_price": payload.importPrice,
                "expiration_date": payload.expirationDate if payload.expirationDate else None,
                "created_at": txn_created_at,
                "system_created_at": current_now
            }
            batch_res = supabase.table('inventory_batches').insert(batch_data).execute()
            batch_id = batch_res.data[0]['id']
            
            trans_data = {
                "item_id": item_id,
                "batch_id": batch_id,
                "action": "IMPORT",
                "quantity": payload.changeAmount,
                "user_name": "Đan",
                "created_at": txn_created_at,
                "system_created_at": current_now
            }
            supabase.table('transactions').insert(trans_data).execute()
        
        elif payload.changeAmount < 0: # EXPORT
            export_qty = abs(payload.changeAmount)
            
            batches_res = supabase.table('inventory_batches').select('*').eq('item_id', item_id).gt('remaining_quantity', 0).order('expiration_date', nullsfirst=False).order('created_at').execute()
            
            total_available = sum(b['remaining_quantity'] for b in batches_res.data)
            if total_available < export_qty:
                raise HTTPException(status_code=400, detail="Không đủ số lượng trong kho")
                
            qty_to_export = export_qty
            for b in batches_res.data:
                if qty_to_export <= 0:
                    break
                    
                deduct = min(b['remaining_quantity'], qty_to_export)
                new_rem = b['remaining_quantity'] - deduct
                supabase.table('inventory_batches').update({"remaining_quantity": new_rem}).eq('id', b['id']).execute()
                
                trans_data = {
                    "item_id": item_id,
                    "batch_id": b['id'],
                    "action": "EXPORT",
                    "quantity": deduct,
                    "user_name": "Bình",
                    "created_at": txn_created_at,
                    "system_created_at": current_now
                }
                supabase.table('transactions').insert(trans_data).execute()
                qty_to_export -= deduct
                
        # Cập nhật số lượng của size cụ thể bên bảng implants nếu có
        if payload.sub_sku:
            try:
                implant_res = supabase.table('implants').select('id, quantity').eq('sku', payload.sub_sku).execute()
                if implant_res.data:
                    impl_id = implant_res.data[0]['id']
                    curr_q = implant_res.data[0]['quantity']
                    supabase.table('implants').update({'quantity': curr_q + payload.changeAmount}).eq('id', impl_id).execute()
            except Exception as e:
                background_tasks.add_task(log_error, f"Error update implant size: {str(e)}")

        # Cập nhật tổng số lượng tồn kho caching ở bảng items
        try:
            update_payload = {'quantity': payload.quantity}
            if payload.expWarningDays is not None:
                update_payload['exp_warning_days'] = payload.expWarningDays
            supabase.table('items').update(update_payload).eq('id', item_id).execute()
        except Exception as e:
            background_tasks.add_task(log_error, f"Error update cached quantity: {str(e)}")
            
        return {"message": "Quantity updated", "new_quantity": payload.quantity}
    except HTTPException:
        raise
    except Exception as e:
        background_tasks.add_task(log_error, f"update_item_quantity error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

ai_engine = None

@app.post("/api/ocr")
async def process_ocr(file: UploadFile = File(...)):
    global ai_engine
    if ai_engine is None:
        try:
            ai_engine = InvoiceAI()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cannot initialize AI: {str(e)}")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
    finally:
        file.file.close()

    try:
        json_result = ai_engine.process_image(tmp_path)
        return {"success": True, "raw": ["AI Extracted JSON directly"], "data": json.loads(json_result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

@app.post("/api/save-ocr")
async def save_ocr(data: str = Form(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    try:
        parsed_data = json.loads(data)
        supabase = get_supabase_client()
        
        for item in parsed_data:
            name = item.get("tên mặt hàng", "").strip()
            unit = item.get("đơn vị tính", "").strip()
            try: qty = int(item.get("số lượng", 0))
            except ValueError: qty = 0
            
            if not name or qty <= 0: continue
            
            item_res = supabase.table('items').select('id, sku').ilike('name', name).execute()
            if item_res.data:
                item_id = item_res.data[0]['id']
                batch_data = {
                    "item_id": item_id,
                    "original_quantity": qty,
                    "remaining_quantity": qty,
                "created_at": get_local_now()
            }
                batch_res = supabase.table('inventory_batches').insert(batch_data).execute()
                
                trans_data = {
                    "item_id": item_id,
                    "batch_id": batch_res.data[0]['id'],
                    "action": "IMPORT",
                    "quantity": qty,
                    "user_name": "Đan",
                "created_at": get_local_now()
            }
                supabase.table('transactions').insert(trans_data).execute()
            elif item.get("isNewItem"):
                import time
                new_sku = f"SP{int(time.time() * 1000)}"
                new_item = {
                    "sku": new_sku,
                    "name": name,
                    "unit": unit
                }
                res = supabase.table('items').insert(new_item).execute()
                item_id = res.data[0]['id']
                
                batch_data = {
                    "item_id": item_id,
                    "original_quantity": qty,
                    "remaining_quantity": qty,
                "created_at": get_local_now()
            }
                batch_res = supabase.table('inventory_batches').insert(batch_data).execute()
                
                trans_data = {
                    "item_id": item_id,
                    "batch_id": batch_res.data[0]['id'],
                    "action": "IMPORT",
                    "quantity": qty,
                    "user_name": "Đan",
                "created_at": get_local_now()
            }
                supabase.table('transactions').insert(trans_data).execute()

        return {"message": "Dữ liệu OCR đã được cập nhật thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.delete("/api/batches/{batch_id}")
def delete_batch(batch_id: str):
    try:
        supabase = get_supabase_client()
        
        # 1. Fetch batch
        batch_res = supabase.table('inventory_batches').select('*').eq('id', batch_id).execute()
        if not batch_res.data:
            raise HTTPException(status_code=404, detail="Batch not found")
            
        batch = batch_res.data[0]
        qty_to_remove = batch.get('remaining_quantity', 0)
        item_id = batch['item_id']
        
        # 2. Update item quantity and record transaction if qty > 0
        if qty_to_remove > 0:
            item_res = supabase.table('items').select('*').eq('id', item_id).execute()
            if item_res.data:
                item = item_res.data[0]
                new_qty = max(0, item.get('quantity', 0) - qty_to_remove)
                supabase.table('items').update({'quantity': new_qty}).eq('id', item_id).execute()
                
                # Transaction Log
                current_now = get_local_now()
                trans_data = {
                    "item_id": item_id,
                    "action": "Xuất",
                    "quantity": qty_to_remove,
                    "user_name": "Hệ thống (Hủy lô)",
                    "created_at": current_now[:10] + " 00:00:00",
                    "system_created_at": current_now
                }
                supabase.table('transactions').insert(trans_data).execute()
                
        # 3. Delete the batch
        supabase.table('inventory_batches').delete().eq('id', batch_id).execute()
        
        return {"success": True, "message": "Batch deleted successfully"}
        
    except Exception as e:
        print(f"Error deleting batch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
