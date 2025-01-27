def detect_complex_problem(message):
    # Keywords or patterns that might indicate complex problems
    problem_indicators = [
        'error', 'issue', 'problem', 'stuck', 'help', 'wrong',
        'not working', 'failed', 'trouble', 'debug'
    ]
    
    # Check if message contains any problem indicators
    return any(indicator in message.lower() for indicator in problem_indicators)

def handle_message_with_mode_switch(message, current_mode):
    # 現在のモードで通常の応答を生成
    normal_response = generate_normal_response(message, current_mode)
    
    # 問題指標を検出した場合、通常の応答に切り替え提案を追加
    if current_mode != 'consultation' and detect_complex_problem(message):
        return {
            'response': (
                f"{normal_response}\n\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                "より詳細な分析と、より充実した回答が必要な場合は、"
                "コンサルテーションモードへの切り替えをお勧めします。\n"
                "（質の高い回答を生成するため、数秒ほど時間がかかる場合があります）\n\n"
                "切り替えてもよろしいでしょうか？（はい/いいえ）<回答が面倒な場合は答えずにそのままチャットしても大丈夫です。＞"
            ),
            'requires_mode_switch': True,
            'original_message': message
        }
    
    return {'response': normal_response}

def process_mode_switch_response(user_response, message):
    if user_response.lower() in ['yes', 'y', 'sure', 'okay']:
        return {
            'mode': 'consultation',
            'response': "Switching to consultation mode. Let me analyze your problem:\n" +
                       analyze_problem(message)
        }
    return {
        'mode': 'current',
        'response': "Continuing in current mode. How can I help you?"
    } 