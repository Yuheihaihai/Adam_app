export const contextDetection = {
  detectTopicFromHistory(history) {
    const lastMessages = history.slice(-3).map(msg => msg.content.toLowerCase());
    
    if (lastMessages.some(msg => 
      msg.includes('career') || 
      msg.includes('job') || 
      msg.includes('職業') || 
      msg.includes('仕事'))) {
      return 'career';
    }
    
    if (lastMessages.some(msg => 
      msg.includes('character') || 
      msg.includes('personality') || 
      msg.includes('性格') || 
      msg.includes('特徴'))) {
      return 'characteristics';
    }
    
    if (lastMessages.some(msg => 
      msg.includes('advice') || 
      msg.includes('help') || 
      msg.includes('アドバイス') || 
      msg.includes('助言'))) {
      return 'personal';
    }
    
    return null;
  }
}; 