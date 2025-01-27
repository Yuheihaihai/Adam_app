import random

class ProcessingMessages:
    def __init__(self):
        self.career_messages = [
            "キャリアパスと職業目標を分析中です...",
            "職務経験とスキルを処理中です...",
            "キャリア機会と可能性のある方向性を評価中です...",
            "あなたの状況に関連する業界動向を調査中です..."
        ]
        
        self.characteristic_messages = [
            "性格特性と行動パターンを分析中です...",
            "コミュニケーションスタイルと好みを処理中です...",
            "対人関係のダイナミクスを評価中です...",
            "あなたの強みと成長分野を確認中です..."
        ]

class ImmediateResponseHandler:
    def __init__(self):
        self.processing_messages = ProcessingMessages()
        self.current_mode = None

    async def send_immediate_response(self, mode):
        """Sends immediate processing message based on mode"""
        if mode == 'career':
            return {
                'immediate_response': True,
                'message': random.choice(self.processing_messages.career_messages),
                'status': 'processing'
            }
        elif mode == 'characteristic':
            return {
                'immediate_response': True,
                'message': random.choice(self.processing_messages.characteristic_messages),
                'status': 'processing'
            }
        elif mode == 'both':
            return {
                'immediate_response': True,
                'message': "Analyzing both career and personal characteristics...\nThis comprehensive analysis may take a few moments.",
                'status': 'processing'
            } 