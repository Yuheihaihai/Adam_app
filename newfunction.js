async function isJobRequestSemantic(text) {
  // Skip semantic analysis for obvious cases
  if (text.includes('適職') || text.includes('キャリア診断') || text.includes('向いてる仕事') || 
      (text.includes('思い出して') && (text.includes('適職') || text.includes('仕事') || text.includes('キャリア'))) ||
      /記録.*(思い出|教え|診断).*(適職|仕事|職業|キャリア)/.test(text)) {
    console.log('👔 キャリア検出: 明示的なキーワードを検出: ' + text.substring(0, 30));
    return true;
  }
  
  try {
    console.log('🧠 セマンティック検出: 分析開始: ' + text.substring(0, 30));
    
    const prompt = ;

    const response = await openai.chat.completions.create({
      model: "o3-mini-2025-01-31", // Use a small, fast model for classification
      messages: [
        { role: "system", content: "あなたはユーザーのメッセージの意図を正確に判断するエキスパートです。" },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      max_tokens: 5, // Just need YES or NO
    });

    const decision = response.choices[0].message.content.trim();
    const isCareerRequest = decision.includes("YES");
    
    console.log('🧠 セマンティック検出: 結果: ' + (isCareerRequest ? "キャリア関連" : "キャリア以外") + ', モデル回答: "' + decision + '"');
    
    return isCareerRequest;
  } catch (error) {
    console.error('❌ セマンティック検出エラー: ' + error.message);
    // Fall back to the pattern matching approach on error
    return isJobRequest(text);
  }
}
