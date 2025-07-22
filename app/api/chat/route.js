/**
 * Detects user intention semantically using AI
 * @param {string} text - User message
 * @returns {Promise<string>} - Detected intention type
 */
async function detectIntentionWithAI(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "o3-mini-2025-01-31",
      messages: [
        {
          role: "system",
          content: "あなたはユーザーの意図を理解する専門家です。"
        },
        {
          role: "user",
          content: `
このメッセージの主な意図を1つだけ選んでください:

ユーザーメッセージ: "${text}"

選択肢（1つだけ回答）:
1. CAREER - キャリア相談・適職診断・職業推薦のリクエスト
2. HISTORY - 過去の会話記録を思い出して分析するリクエスト
3. SEARCH - Web検索リクエスト（※現在利用不可）
4. ANALYSIS - 詳細な説明や深い分析のリクエスト
5. MODEL - 特定のAIモデル（Claude等）を使うリクエスト
6. GENERAL - 上記に当てはまらない一般的な質問や会話

回答は番号と名前だけを返してください（例: "1. CAREER"）`
        }
      ],
      temperature: 0,
      max_tokens: 10
    });
    
    const result = response.choices[0].message.content.trim();
    console.log(`🧠 [意図検出] AI分析結果: "${result}"`);
    
    if (result.includes("CAREER")) return "career";
    if (result.includes("HISTORY")) return "history";
    if (result.includes("SEARCH")) return "search";
    if (result.includes("ANALYSIS")) return "analysis";
    if (result.includes("MODEL")) return "model";
    return "general";
  } catch (error) {
    console.error(`❌ [意図検出] AIエラー: ${error.message}`);
    return "general"; // Fallback to general intention
  }
}

/**
 * 特殊コマンドや意図を検出する関数
 * 高速なパターンマッチングを使用し、意図の種類と関連情報を返す
 * @param {string} text - ユーザーメッセージ
 * @returns {Object} - 検出された特殊コマンドや意図の情報
 */
function containsSpecialCommand(text) {
  // 深い分析モードを検出
  const deepAnalysisPattern = /もっと深く考えを掘り下げて例を示しながらさらに分かり易く(\(見やすく\))?教えてください。抽象的言葉禁止。/;
  const hasDeepAnalysis = deepAnalysisPattern.test(text);
  
  // より詳細なパターン検出を追加
  const hasAskForDetail = text.includes('詳しく教えて') || 
                          text.includes('詳細を教えて') || 
                          text.includes('もっと詳しく');
  
  // 過去の記録を思い出すコマンドを検出
  const hasRecallHistory = text.includes('過去の記録') && 
                         (text.includes('思い出して') || text.includes('教えて'));
  
  // 検索コマンドを検出
  const searchPattern = /「(.+?)」(について)?(を)?検索して(ください)?/;
  const searchMatch = text.match(searchPattern);
  const hasSearchCommand = searchMatch !== null;
  const searchQuery = hasSearchCommand ? searchMatch[1] : null;
  
  // Web検索コマンドの別パターン
  const altSearchPattern = /「(.+?)」(について)?(の)?情報を(ネットで|Web上?で|インターネットで)?調べて(ください)?/;
  const altSearchMatch = text.match(altSearchPattern);
  const hasAltSearchCommand = altSearchMatch !== null;
  const altSearchQuery = hasAltSearchCommand ? altSearchMatch[1] : null;
  
  // Claudeモードを検出
  const claudePattern = /(Claude|クロード)(モード|で|に)(.*)/;
  const claudeMatch = text.match(claudePattern);
  const hasClaudeRequest = claudeMatch !== null;
  
  // GPT-4モードを検出
  const gpt4Pattern = /(GPT-4o|GPT-4)(モード|で|に)(.*)/;
  const gpt4Match = text.match(gpt4Pattern);
  const hasGPT4Request = gpt4Match !== null;
  
  // 意図の種類を判断
  let intentionType = 'general';
  if (hasDeepAnalysis || hasAskForDetail) intentionType = 'analysis';
  if (hasRecallHistory) intentionType = 'history';
  if (hasSearchCommand || hasAltSearchCommand) intentionType = 'search';
  if (hasClaudeRequest) intentionType = 'model_claude';
  if (hasGPT4Request) intentionType = 'model_gpt4';
  if (isJobRequest(text)) intentionType = 'career';
  
  return {
    hasDeepAnalysis,
    hasAskForDetail,
    hasRecallHistory,
    hasSearchCommand,
    hasClaudeRequest,
    claudeQuery: claudeMatch ? claudeMatch[3]?.trim() : null,
    searchQuery: searchQuery || altSearchQuery,
    intentionType
  };
}

/**
 * 適職・キャリア分析リクエストを検出する関数
 * パターンマッチングを使用して高速に判定
 * @param {string} text - ユーザーメッセージ
 * @returns {boolean} - 適職リクエストかどうか
 */
function isJobRequest(text) {
  // 1. 直接的なキーワード検出
  const directKeywords = [
    '適職', '診断', 'キャリア', '向いてる', '向いている', 
    '私に合う', '私に合った', 'キャリアパス'
  ];
  
  if (directKeywords.some(keyword => text.includes(keyword))) {
    return true;
  }
  
  // 2. パターンマッチング
  const careerPatterns = [
    /私の?(?:適職|向いている職業|仕事)/,
    /(?:仕事|職業|キャリア)(?:について|を)(?:教えて|分析して|診断して)/,
    /私に(?:合う|向いている)(?:仕事|職業|キャリア)/,
    /(?:記録|履歴|会話).*(?:思い出して|分析して).*(?:適職|仕事|職業)/,
    /職場.*(?:社風|人間関係)/
  ];
  
  if (careerPatterns.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // 3. コンテキスト分析
  const jobContext1 = text.includes('仕事') && (
    text.includes('探し') || text.includes('教えて') || 
    text.includes('どんな') || text.includes('アドバイス')
  );
  
  const jobContext2 = text.includes('職場') && (
    text.includes('環境') || text.includes('人間関係') || text.includes('社風')
  );
  
  return jobContext1 || jobContext2;
}

/**
 * キーワード検出とAI分析を組み合わせたユーザー意図検出
 * @param {string} text - ユーザーメッセージ
 * @returns {Promise<string>} - 検出された意図タイプ
 */
async function detectIntention(text) {
  // 特殊コマンドの高速検出
  const commands = containsSpecialCommand(text);
  
  // 既に明確な意図が検出されている場合はそれを返す
  if (commands.intentionType !== 'general') {
    console.log(`🔍 [意図検出] パターン一致: ${commands.intentionType}`);
    
    // モデル選択の場合は具体的なモデルタイプを返す
    if (commands.intentionType === 'model_claude') return 'model_claude';
    if (commands.intentionType === 'model_gpt4') return 'model_gpt4';
    
    // その他の意図タイプはそのまま返す
    return commands.intentionType;
  }
  
  // キーワード検出で判断できない場合はAIで意味解析
  const aiIntention = await detectIntentionWithAI(text);
  console.log(`🧠 [意図検出] AI分析による意図: ${aiIntention}`);
  return aiIntention;
}

async function processMessage(userId, messageText) {
  try {
    // ユーザー意図の検出（高速なキーワード検出とAI分析の組み合わせ）
    const intention = await detectIntention(messageText);
    console.log(`🔍 [意図分析] 検出された意図: ${intention}`);
    
    // 過去の記録の取得リクエスト処理
    if (intention === "history") {
      return handleChatRecallWithRetries(userId, messageText);
    }
    
    // Web検索リクエスト処理 - 無効化（適職診断での自動検索のみ利用可能）
    if (intention === "search") {
      // ユーザーに検索機能の制限を説明
      return "申し訳ございませんが、Adam AIでは一般的なWeb検索機能は提供しておりません。\n\nただし、適職診断やキャリア相談をご利用いただく際は、システムが自動的に最新のキャリア情報を収集してお答えいたします。\n\n「適職診断をお願いします」「私に向いている仕事を教えて」などとお気軽にお話しください。";
    }
    
    // 各種モード選択と処理
    let mode = 'normal';
    let systemPrompt;
    
    switch (intention) {
      case 'career':
        mode = 'career';
        break;
      case 'analysis':
        mode = 'deep';
        break;
      case 'model_claude':
        // Claudeモードの処理
        const claudePattern = /(Claude|クロード)(モード|で|に)(.*)/;
        const claudeMatch = messageText.match(claudePattern);
        const claudeQuery = claudeMatch ? claudeMatch[3]?.trim() : messageText;
        
        // Claude APIに送信
        return callClaudeAPI(claudeQuery, userId);
        
      case 'model_gpt4':
        mode = 'gpt4';
        break;
      default:
        // 意図検出で判断できない場合は既存の判定ロジックを使用
        const { mode: detectedMode } = determineModeAndLimit(messageText);
        mode = detectedMode;
        break;
    }
    
    systemPrompt = getSystemPromptForMode(mode);
    return processWithAI(systemPrompt, messageText, await fetchUserHistory(userId), mode, userId);
  } catch (error) {
    console.error(`processMessage Error: ${error.message}`);
    return "申し訳ありません。メッセージの処理中にエラーが発生しました。";
  }
} 