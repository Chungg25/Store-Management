import os
from api.index import get_supabase_client

supabase = get_supabase_client()

print("Deleting test data...")
res = supabase.table("items").select("id").in_("sku", ["TEST-001", "TEST-002"]).execute()
item_ids = [row["id"] for row in res.data]

if item_ids:
    supabase.table("inventory_batches").delete().in_("item_id", item_ids).execute()
    supabase.table("inventory_transactions").delete().in_("item_id", item_ids).execute()
    supabase.table("items").delete().in_("sku", ["TEST-001", "TEST-002"]).execute()
    print("Test data deleted successfully!")
else:
    print("No test data found.")
