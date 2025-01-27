class AIMode:
    def __init__(self):
        self.consulting_mode = False
        self.current_context = None
        self.deep_exploration_mode = False
        self.default_model = 'default-model'
        self.deep_model = 'o1-preview-2024-09-12'
        
    def detect_complex_problem(self, user_input, context):
        # Complex problem indicators
        complex_indicators = {
            'humanRelationship': [
                'conflict', 'divorce', 'separation', 'abuse',
                'trust issues', 'communication problems'
            ],
            'career.characteristic': [
                'burnout', 'career change', 'workplace conflict',
                'promotion decision', 'leadership challenges'
            ]
        }
        
        # Check if current context requires potential consulting
        if any(keyword in user_input.lower() for keyword in complex_indicators.get(context, [])):
            return True
        return False

    async def request_consulting_mode(self, user_input):
        """コンサルティングモードへの切り替え許可を求める"""
        message = (
            "より体系的なコンサルティングアプローチが有効かもしれないと判断しました。"
            "コンサルティングモードに切り替えてもよろしいでしょうか？"
            "このモードでは以下のサービスを提供させていただきます："
            "\n- より詳細な質問による状況把握"
            "\n- 体系的な分析"
            "\n- ステップバイステップのガイダンス"
            "\n\n続行しますか？（はい/いいえ）"
        )
        return message

    def activate_consulting_mode(self):
        self.consulting_mode = True
        return "Consulting mode activated. Let's address your situation systematically."

    def deactivate_consulting_mode(self):
        self.consulting_mode = False
        return "Returning to standard conversation mode."

    def detect_deep_exploration_request(self, user_input: str) -> bool:
        """Detect if user is requesting deeper exploration"""
        deep_indicators = [
            'deeper',
            'さらにわか',
            'もっと深',
            'a request for a deeper exploration',
            'tell me more',
            'elaborate',
            'explain further',
            'より詳しく',
            'detail'
        ]
        return any(indicator in user_input.lower() for indicator in deep_indicators)

    def get_appropriate_model(self, user_input: str) -> str:
        """Determine which model to use based on user input"""
        if self.detect_deep_exploration_request(user_input):
            self.deep_exploration_mode = True
            return self.deep_model
        return self.default_model 