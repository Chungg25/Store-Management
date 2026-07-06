import os
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), '../credentials.json')

class DriveService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/drive.file']
        self.credentials = Credentials.from_service_account_file(
            CREDENTIALS_PATH, scopes=self.scopes
        )
        self.service = build('drive', 'v3', credentials=self.credentials)

    def upload_image(self, file_path: str, file_name: str, folder_id: str = None) -> str:
        """
        Tải ảnh lên Google Drive.
        Trả về Web View Link của file đã tải lên.
        """
        file_metadata = {
            'name': file_name,
            'mimeType': 'image/jpeg'
        }
        
        if folder_id:
            file_metadata['parents'] = [folder_id]

        media = MediaFileUpload(file_path, mimetype='image/jpeg', resumable=True)
        
        uploaded_file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()

        # Share to anyone with link (optional, if they want to view it without being logged in as service account)
        try:
            self.service.permissions().create(
                fileId=uploaded_file.get('id'),
                body={'type': 'anyone', 'role': 'reader'}
            ).execute()
        except Exception as e:
            print(f"Warning: Could not share file: {e}")

        return uploaded_file.get('webViewLink')
