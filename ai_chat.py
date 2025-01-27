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
    # Sentiment analysis to detect negative emotions or distress
    sentiment_score = analyze_sentiment(message)
    
    # Context analysis for complex situations
    context_indicators = {
        'emotional_distress': detect_emotional_distress(message),
        'complexity_level': assess_complexity(message),
        'urgency_level': assess_urgency(message),
        'requires_analysis': needs_detailed_analysis(message)
    }
    
    # Determine if consultation mode is needed based on multiple factors
    should_consult = (
        sentiment_score < -0.3  # Negative sentiment threshold
        or context_indicators['emotional_distress'] > 0.6  # High emotional distress
        or context_indicators['complexity_level'] > 0.7    # Complex situation
        or context_indicators['urgency_level'] > 0.8       # Urgent situation
        or context_indicators['requires_analysis'] > 0.7   # Needs detailed analysis
    )
    
    return should_consult

def analyze_sentiment(message):
    # Implement sentiment analysis
    # Returns a score between -1 (very negative) and 1 (very positive)
    # You can use libraries like transformers, NLTK, or external APIs
    pass

def detect_emotional_distress(message):
    # Analyze emotional content and stress indicators
    # Returns a score between 0 (no distress) and 1 (high distress)
    pass

def assess_complexity(message):
    # Evaluate the complexity of the situation
    # Returns a score between 0 (simple) and 1 (very complex)
    pass

def assess_urgency(message):
    # Determine how urgent the situation is
    # Returns a score between 0 (not urgent) and 1 (very urgent)
    pass

def needs_detailed_analysis(message):
    # Check if the situation requires in-depth analysis
    # Returns a score between 0 (simple response sufficient) and 1 (needs detailed analysis)
    pass

def handle_mode_switch(current_mode, message):
    if current_mode != 'consultation' and detect_problem_indicators(message):
        # Ask for user confirmation before switching
        return {
            'response': (
                "問題解決のため、より詳しい分析が必要かもしれません。"
                "コンサルテーションモードに切り替えてもよろしいでしょうか？"
                "（「はい」または「いいえ」でお答えください）<回答が面倒な場合は答えずにそのままチャットしても大丈夫です。＞"
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