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

def detect_problem_indicators(message):
    # Problem indicators that should trigger consultation mode
    indicators = [
        '大変', '困る', '問題', 'トラブル', 'ストレス',
        'help', 'difficult', 'trouble', 'stress', 'problem',
        'issue', 'stuck', 'wrong', 'failed'
    ]
    return any(indicator in message.lower() for indicator in indicators)

def handle_mode_switch(current_mode, message):
    if current_mode != 'consultation' and detect_problem_indicators(message):
        # Ask for user confirmation before switching
        return {
            'response': (
                "問題解決のため、より詳しい分析が必要かもしれません。"
                "コンサルテーションモードに切り替えてもよろしいでしょうか？"
                "（「はい」または「いいえ」でお答えください）"
            ),
            'requires_mode_switch': True
        }
    return None

def process_message(message, current_mode):
    # Check if mode switch is needed
    mode_switch = handle_mode_switch(current_mode, message)
    if mode_switch:
        return mode_switch
        
    # Continue with normal processing
    return process_normal_message(message, current_mode) 