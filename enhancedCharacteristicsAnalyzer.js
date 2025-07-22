// enhancedCharacteristicsAnalyzer.js - 二層構造特性分析
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// オリジナルのOpenAI関数を再利用するためのimport
const { OpenAI } = require('openai');

// GPT-4oの最大トークン制限
const GPT4O_TOKEN_LIMIT = 128 * 1024; // 128K tokens

class EnhancedCharacteristicsAnalyzer {
  constructor() {
    // 環境変数チェック
    if (!process.env.GEMINI_API_KEY) {
      console.warn('警告: GEMINI_API_KEY環境変数が設定されていません。レガシーモードで動作します。');
      this.geminiEnabled = false;
    } else {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiEnabled = true;
    }
    
    // OpenAIクライアント
    if (process.env.OPENAI_API_KEY) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.openaiEnabled = true;
    } else {
      console.warn('[EnhancedCharacteristicsAnalyzer] OpenAI API key not found. OpenAI analysis will be disabled.');
      this.openai = null;
      this.openaiEnabled = false;
    }
    
    // キャッシュ設定
    this.cacheDir = path.join(__dirname, 'data', 'characteristics_cache');
    this.ensureCacheDirectory();
    this.cacheExpiryMs = 3 * 24 * 60 * 60 * 1000; // 3日間
    
    console.log(`拡張特性分析モジュール初期化完了 (Gemini ${this.geminiEnabled ? '有効' : '無効'})`);
  }
  
  // キャッシュディレクトリ確保
  ensureCacheDirectory() {
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }
  }
  
  // キャッシュファイルパス
  getCacheFilePath(userId) {
    return path.join(this.cacheDir, `${userId}_characteristics.json`);
  }
  
  // キャッシュからの読み込み
  getCachedCharacteristics(userId) {
    const cacheFile = this.getCacheFilePath(userId);
    
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        
        // 有効期限チェック
        if (Date.now() - cacheData.timestamp < this.cacheExpiryMs) {
          console.log(`ユーザー(${userId})の特性分析キャッシュヒット（${Math.round((Date.now() - cacheData.timestamp) / (60*60*1000))}時間前）`);
          return cacheData.data;
        } else {
          console.log(`ユーザー(${userId})の特性分析キャッシュ期限切れ`);
        }
      } catch (error) {
        console.error(`キャッシュ読み込みエラー(${userId}):`, error);
      }
    }
    
    return null;
  }
  
  // キャッシュへの書き込み
  cacheCharacteristics(userId, data) {
    const cacheFile = this.getCacheFilePath(userId);
    
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({
        timestamp: Date.now(),
        data
      }, null, 2));
      console.log(`ユーザー(${userId})の特性分析をキャッシュしました`);
    } catch (error) {
      console.error(`キャッシュ書き込みエラー(${userId}):`, error);
    }
  }
  
  // メインの特性分析関数（既存のAPIと互換）
  async analyzeUserCharacteristics(userId, historyData) {
    // キャッシュから確認
    const cachedData = this.getCachedCharacteristics(userId);
    if (cachedData) {
      return {
        structuredData: cachedData,
        source: 'cache'
      };
    }
    
    // 履歴データを評価して、トークン数を概算
    const history = historyData.history || [];
    const estimatedTokenCount = this._estimateTokenCount(history);
    console.log(`ユーザー(${userId})の履歴データ推定トークン数: ${estimatedTokenCount}`);
    
    // キャリア関連のクエリかを判定
    const isCareerQuery = this._isCareerQuery(historyData);
    
    // キャッシュがなければ新規分析
    if (this.geminiEnabled && estimatedTokenCount > GPT4O_TOKEN_LIMIT) {
      console.log(`トークン数(${estimatedTokenCount})がGPT-4o制限(${GPT4O_TOKEN_LIMIT})を超えたため、Geminiを使用します`);
      try {
        // Geminiによる構造化データ生成（1層目）
        const structuredData = await this._analyzeWithGemini(historyData);
        
        // キャッシュに保存
        this.cacheCharacteristics(userId, structuredData);
        
        return {
          structuredData,
          source: 'gemini'
        };
      } catch (error) {
        console.error('Gemini分析エラー:', error);
        console.log('OpenAIフォールバックを使用します');
        // エラー時はOpenAIにフォールバック
      }
    } else {
      if (this.geminiEnabled) {
        console.log(`トークン数(${estimatedTokenCount})がGPT-4o制限(${GPT4O_TOKEN_LIMIT})内のため、OpenAIを使用します`);
      }
    }
    
    // OpenAIによる分析（フォールバックまたは通常処理）
    if (!this.openaiEnabled) {
      console.warn('[EnhancedCharacteristicsAnalyzer] OpenAI is disabled. Returning fallback analysis.');
      const fallbackAnalysis = {
        legacyMode: true,
        analysis: '分析機能が利用できません。システム管理者にお問い合わせください。',
        isCareerAnalysis: isCareerQuery,
        disabled: true
      };
      
      this.cacheCharacteristics(userId, fallbackAnalysis);
      return {
        structuredData: fallbackAnalysis,
        source: 'disabled'
      };
    }
    
    try {
      const legacyAnalysis = await this._analyzeWithOpenAI(historyData, isCareerQuery);
      
      // キャッシュに保存
      this.cacheCharacteristics(userId, {
        legacyMode: true,
        analysis: legacyAnalysis,
        isCareerAnalysis: isCareerQuery
      });
      
      return {
        structuredData: {
          legacyMode: true,
          analysis: legacyAnalysis,
          isCareerAnalysis: isCareerQuery
        },
        source: 'openai_fallback'
      };
    } catch (error) {
      console.error('OpenAIフォールバック分析エラー:', error);
      throw error; // 両方失敗した場合は例外を投げる
    }
  }
  
  // トークン数を概算する関数
  _estimateTokenCount(history) {
    // 簡易的なトークン数推定: 英語で平均4文字=1トークン、日本語で平均1.5文字=1トークン
    // 保守的に見積もるため、一律3文字=1トークンとする
    let totalChars = 0;
    
    history.forEach(msg => {
      if (msg.content) {
        totalChars += msg.content.length;
      }
    });
    
    return Math.ceil(totalChars / 3);
  }
  
  // キャリア関連のクエリかどうかを判定する関数
  _isCareerQuery(historyData) {
    // 無効なhistoryDataの場合は早期リターン
    if (!historyData || !historyData.history) {
      console.log('無効なhistoryDataのため、キャリア判定をスキップします');
      return false;
    }
    
    // 最新のユーザーメッセージを取得
    const history = historyData.history || [];
    let latestUserMessage = "";
    
    // ユーザーの最新メッセージを探す
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        latestUserMessage = history[i].content || "";
        break;
      }
    }
    
    // メッセージが空の場合は早期リターン
    if (!latestUserMessage) {
      console.log('ユーザーメッセージが見つからないため、キャリア判定をスキップします');
      return false;
    }
    
    // キャリア関連の単語を含むかチェック
    const careerKeywords = [
      '適職', 'キャリア', '仕事', '職業', '転職', '就職', '職場', '社風', '人間関係',
      '向いてる', '診断', '分析'
    ];
    
    // キャリア関連の強力なパターンマッチング
    const careerPatterns = [
      /適職.*(診断|分析|教えて|調べて)/,
      /私に.*(向いてる|合う|ぴったり).*(仕事|職業|キャリア)/,
      /私の.*(特性|特徴|性格).*(仕事|適職|キャリア)/,
      /記録.*(思い出して|教えて).*(適職|仕事|職場)/,
      /.*職場.*(社風|人間関係).*/,
      /.*私の.*(仕事|職業|キャリア).*/
    ];
    
    // キーワードチェック
    const hasCareerKeyword = careerKeywords.some(keyword => latestUserMessage.includes(keyword));
    
    // パターンマッチングチェック
    const hasCareerPattern = careerPatterns.some(pattern => pattern.test(latestUserMessage));
    
    // どちらかに該当すればtrue
    const isCareerRelated = hasCareerKeyword || hasCareerPattern;
    
    console.log(`キャリア関連クエリ判定: ${isCareerRelated ? 'キャリア関連' : '一般的な特性分析'}`);
    
    return isCareerRelated;
  }
  
  // Geminiを使用した分析（1層目）
  async _analyzeWithGemini(historyData) {
    console.log('Geminiによる特性分析を開始...');
    
    // Geminiモデル取得
    const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // 履歴データをテキスト形式に変換
    const history = historyData.history || [];
    const historyText = history.map(msg => 
      `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`
    ).join('\n\n');
    
    // プロンプト作成
    const prompt = `
    以下のチャット履歴を分析し、ユーザーの特性を構造化JSONデータとして出力してください。
    
    分析観点:
    1. コミュニケーションパターン（言葉遣い、感情表現の特徴など）
    2. 思考プロセス（論理的思考、問題解決アプローチ、興味関心）
    3. 社会的相互作用（対人関係での傾向、ストレス対処法など）
    4. 感情と自己認識（感情表現の特徴、自己理解の程度など）
    
    チャット履歴:
    ${historyText}
    
    以下の形式でJSON出力:
    {
      "communication": {
        "style": "会話スタイルの特徴",
        "expression": "感情表現の特徴",
        "vocabulary": ["特徴的な語彙や表現"]
      },
      "thinking": {
        "approach": "思考アプローチの特徴",
        "interests": ["関心のある分野"],
        "problem_solving": "問題解決の特徴"
      },
      "social": {
        "interaction_style": "対人関係での特徴",
        "stress_coping": "ストレス対処法",
        "strengths": ["社会的相互作用における強み"],
        "challenges": ["社会的相互作用における課題"]
      },
      "emotional": {
        "expression_style": "感情表現の特徴",
        "self_awareness": "自己理解の程度",
        "motivation": "モチベーションの特徴"
      }
    }
    
    データが不足している場合は、対応するフィールドを "insufficient_data" と設定してください。
    `;
    
    // Gemini APIリクエスト
    const result = await model.generateContent(prompt);
    const resultText = result.response.text();
    
    // JSON抽出
    try {
      // JSONブロックを探す（```json 形式または直接JSON）
      const jsonMatch = resultText.match(/```json\n([\s\S]*?)\n```/) || 
                       resultText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const jsonText = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonText);
      } else {
        console.error('GeminiレスポンスからJSONを抽出できませんでした');
        // テキスト形式で返す（フォールバック）
        return {
          error: 'json_parse_error',
          raw_text: resultText
        };
      }
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      return {
        error: 'json_parse_error',
        raw_text: resultText
      };
    }
  }
  
  // OpenAIを使用した分析（フォールバック）
  async _analyzeWithOpenAI(historyData, isCareerQuery = false) {
    if (isCareerQuery) {
      console.log('OpenAIによるキャリア特化分析を実行...');
      
      const history = historyData.history || [];
      
      // 会話履歴からユーザーのメッセージのみを抽出
      const userMessages = history.filter(msg => msg.role === 'user').map(msg => msg.content);
      
      // 最新のユーザーメッセージを取得
      let latestUserMessage = "";
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') {
          latestUserMessage = history[i].content || "";
          break;
        }
      }
      
      // キャリア分析用プロンプト
      const careerPrompt = `
あなたは優れたキャリアカウンセラーです。ユーザーの会話履歴とキャリアに関する質問を分析し、具体的な適職診断と推薦を提供してください。

以下の項目を必ずすべて含めた適職診断結果を作成してください:
1. コミュニケーションスタイルと特性に基づいた具体的な職業推奨（少なくとも5つの具体的な職業名）
2. 各推奨職業の簡潔な説明と、なぜユーザーに適しているかの理由
3. 理想的な職場環境、社風、人間関係の特徴
4. 適職に就くために活かせる強みと、伸ばすべきスキル
5. キャリア満足度を高めるための具体的なアドバイス

注意点:
- 必ず具体的な職業名を複数挙げること（「エンジニア」ではなく、「フロントエンドエンジニア」「データサイエンティスト」など）
- 抽象的な分析だけでなく、実践的で具体的な推奨を行うこと
- たとえデータが少なくても、「十分な情報がない」などと言わず、利用可能なデータから最大限の分析を行うこと

以下はユーザーの会話履歴と現在の質問です:
会話履歴: ${userMessages.join('\n')}

現在の質問: ${latestUserMessage}`;
      
      // OpenAI Chat APIリクエスト
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'あなたは優れたキャリアカウンセラーです。' },
          { role: 'user', content: careerPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });
      
      return response.choices[0].message.content;
    } else {
      console.log('OpenAIによる従来の特性分析を実行...');
      
      const history = historyData.history || [];
      
      // OpenAI Chat APIリクエスト（従来のシステムプロンプトを使用）
      const systemPrompt = `
      あなたは「Adam」という発達障害専門のカウンセラーです。
      ユーザーの過去ログ(最大200件)を分析し、コミュニケーションパターン、思考プロセス、
      社会的相互作用、感情・自己認識の観点で洞察を提供してください。
      
      応答は200字以内、簡潔に。
      `;
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 500
      });
      
      return response.choices[0].message.content;
    }
  }
  
  // 共感的応答生成（2層目）
  async generateEmpatheticResponse(structuredData, userMessage) {
    // キャリア分析の場合は、そのまま返す
    if (structuredData && structuredData.legacyMode && structuredData.isCareerAnalysis) {
      console.log('キャリア分析結果を直接返します');
      return structuredData.analysis;
    }
    
    // Geminiから得た構造化データをOpenAIへ渡してより共感的な応答を生成
    try {
      // 構造化データをシステムプロンプトに変換
      const systemPrompt = this._createEmpatheticPrompt(structuredData);
      
      // OpenAI APIリクエスト
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('共感的応答生成エラー:', error);
      // エラー時は単純な応答
      return null; // エラー時はnullを返し、通常のパイプラインに戻す
    }
  }
  
  // 構造化データから共感的システムプロンプトを作成
  _createEmpatheticPrompt(structuredData) {
    // レガシーモードの場合
    if (structuredData.legacyMode) {
      return `
      あなたは「Adam」という発達障害専門の共感的なカウンセラーです。
      以下のユーザー分析に基づいて応答してください:
      
      ${structuredData.analysis}
      
      返答は200字以内で、共感的かつ具体的な内容にしてください。
      `;
    }
    
    // 構造化データがある場合
    let prompt = `
    あなたは「Adam」という発達障害専門の共感的なカウンセラーです。
    以下のユーザー特性データに基づいて応答してください:
    
    【コミュニケーションパターン】
    `;
    
    // コミュニケーションデータを追加
    if (structuredData.communication) {
      if (structuredData.communication.style) {
        prompt += `・スタイル: ${structuredData.communication.style}\n`;
      }
      if (structuredData.communication.expression) {
        prompt += `・表現: ${structuredData.communication.expression}\n`;
      }
      if (structuredData.communication.vocabulary && structuredData.communication.vocabulary.length > 0) {
        prompt += `・特徴的な語彙: ${structuredData.communication.vocabulary.join(', ')}\n`;
      }
    }
    
    // 思考プロセスデータを追加
    prompt += `\n【思考プロセス】\n`;
    if (structuredData.thinking) {
      if (structuredData.thinking.approach) {
        prompt += `・アプローチ: ${structuredData.thinking.approach}\n`;
      }
      if (structuredData.thinking.interests && structuredData.thinking.interests.length > 0) {
        prompt += `・関心: ${structuredData.thinking.interests.join(', ')}\n`;
      }
      if (structuredData.thinking.problem_solving) {
        prompt += `・問題解決: ${structuredData.thinking.problem_solving}\n`;
      }
    }
    
    // 社会的相互作用データを追加
    prompt += `\n【社会的相互作用】\n`;
    if (structuredData.social) {
      if (structuredData.social.interaction_style) {
        prompt += `・対人スタイル: ${structuredData.social.interaction_style}\n`;
      }
      if (structuredData.social.stress_coping) {
        prompt += `・ストレス対処: ${structuredData.social.stress_coping}\n`;
      }
      if (structuredData.social.strengths && structuredData.social.strengths.length > 0) {
        prompt += `・強み: ${structuredData.social.strengths.join(', ')}\n`;
      }
      if (structuredData.social.challenges && structuredData.social.challenges.length > 0) {
        prompt += `・課題: ${structuredData.social.challenges.join(', ')}\n`;
      }
    }
    
    // 感情・自己認識データを追加
    prompt += `\n【感情・自己認識】\n`;
    if (structuredData.emotional) {
      if (structuredData.emotional.expression_style) {
        prompt += `・感情表現: ${structuredData.emotional.expression_style}\n`;
      }
      if (structuredData.emotional.self_awareness) {
        prompt += `・自己理解: ${structuredData.emotional.self_awareness}\n`;
      }
      if (structuredData.emotional.motivation) {
        prompt += `・モチベーション: ${structuredData.emotional.motivation}\n`;
      }
    }
    
    // 応答指示を追加
    prompt += `
    上記の特性を踏まえ、ユーザーの言葉遣いパターンに合わせて、共感的かつ具体的な応答を200字以内で作成してください。
    応答は簡潔で、ユーザーの特性に合わせた表現を使ってください。
    `;
    
    return prompt;
  }
}

module.exports = new EnhancedCharacteristicsAnalyzer(); 