import json
import os
import base64
from openai import OpenAI

class InvoiceAI:
    def __init__(self):
        # Khởi tạo client Groq (dùng thư viện OpenAI)
        api_key = os.getenv("GROQ_API_KEY")
        self.client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=api_key,
        )
        self.model = "llama-3.2-90b-vision-preview"

    def process_image(self, image_path):
        """Đọc ảnh và gửi qua Gemini để bóc tách JSON trực tiếp"""
        print(f"Sending image {image_path} to Gemini AI for processing...")
        # OpenAI Vision yêu cầu truyền ảnh dưới dạng base64
        with open(image_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')

        prompt = """Bạn là một trợ lý ảo chuyên trích xuất hóa đơn.
Hãy phân tích hình ảnh hóa đơn/phiếu xuất kho này và trích xuất thông tin các mặt hàng.
Bạn PHẢI trả về ĐÚNG MỘT MẢNG JSON hợp lệ. Mỗi phần tử trong mảng là một object có 3 trường:
- "tên mặt hàng": tên của sản phẩm (chuỗi, viết hoa chữ cái đầu)
- "đơn vị tính": hộp, cái, túi, lọ, vỉ... (chuỗi, viết hoa chữ cái đầu)
- "số lượng": số lượng (số nguyên)
Lưu ý: 
- Chỉ trả về mảng JSON, tuyệt đối KHÔNG có markdown, KHÔNG có ```json, KHÔNG có bất kỳ text nào khác.
- Ví dụ mẫu: [{"tên mặt hàng": "Găng tay y tế", "đơn vị tính": "Hộp", "số lượng": 10}]
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ]
        )
        
        text = response.choices[0].message.content.strip()
        
        # Tiền xử lý kết quả phòng trường hợp AI vẫn bọc markdown
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
            
        return text.strip()
