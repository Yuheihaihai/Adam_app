class ConversationHandler:
    def __init__(self):
        self.ai_mode = AIMode()

    async def process_message(self, user_input, context):
        # Always determine the appropriate model first
        model = self.ai_mode.get_appropriate_model(user_input)
        
        # Check if we need consulting mode
        if (context in ['humanRelationship', 'career.characteristic'] and 
            self.ai_mode.detect_complex_problem(user_input, context)):
            
            if not self.ai_mode.consulting_mode:
                # Ask for permission to enter consulting mode
                return await self.ai_mode.request_consulting_mode(user_input)
        
        # Process message with selected model
        response = await self.process_with_model(user_input, context, model)
        return response

    async def process_with_model(self, user_input, context, model):
        """Process the message with the selected model, never rejecting any query"""
        try:
            # Always attempt to process the query, regardless of content
            if self.ai_mode.deep_exploration_mode:
                # Add context about being in deep exploration mode
                enhanced_input = f"Detailed analysis requested: {user_input}"
                # Process with enhanced context and never reject
                return await self.generate_detailed_response(enhanced_input, model)
            else:
                return await self.generate_standard_response(user_input, model)
        except Exception as e:
            # Fallback response to ensure we never reject a query
            return (
                "I understand you're looking for insights on this topic. "
                "Let me explore this further for you..."
            ) 