class AIResponseHandler:
    def __init__(self):
        self.immediate_handler = ImmediateResponseHandler()
        
    async def process_user_query(self, query, modes):
        # First, send immediate response
        immediate_response = await self.send_processing_message(modes)
        
        # Then process the actual query
        final_response = await self.generate_detailed_response(query, modes)
        
        return {
            'immediate_response': immediate_response,
            'final_response': final_response
        }
    
    async def send_processing_message(self, modes):
        """Determine which processing message to send based on active modes"""
        if isinstance(modes, str):
            return await self.immediate_handler.send_immediate_response(modes)
        
        # If multiple modes are active
        if 'career' in modes and 'characteristic' in modes:
            return await self.immediate_handler.send_immediate_response('both')
        elif 'career' in modes:
            return await self.immediate_handler.send_immediate_response('career')
        elif 'characteristic' in modes:
            return await self.immediate_handler.send_immediate_response('characteristic') 