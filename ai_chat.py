def detect_complex_problem(message):
    # Keywords or patterns that might indicate complex problems
    problem_indicators = [
        'error', 'issue', 'problem', 'stuck', 'help', 'wrong',
        'not working', 'failed', 'trouble', 'debug'
    ]
    
    # Check if message contains any problem indicators
    return any(indicator in message.lower() for indicator in problem_indicators)

def handle_chat_message(message, current_mode):
    if current_mode != 'consultation' and detect_complex_problem(message):
        # Ask user for confirmation to switch modes
        return {
            'response': "I notice you might be describing a technical problem. " +
                       "Would you like me to switch to consultation mode for more detailed analysis? " +
                       "(Please respond with 'yes' or 'no')",
            'requires_mode_switch': True
        }
    
    # If already in consultation mode or no problem detected, proceed normally
    return process_message(message, current_mode)

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