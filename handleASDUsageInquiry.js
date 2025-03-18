// handleASDUsageInquiry.js
// ASD関連の使用方法問い合わせを処理するためのモジュール

const EnhancedEmbeddingService = require('./enhancedEmbeddingService');

// ASD支援機能の説明テキスト
const ASD_GUIDE_TEXT = `
【ASD支援機能の使い方ガイド】

Adamでは以下のようなASD(自閉症スペクトラム障害)に関する質問や相談に対応できます：

■ 対応可能な質問例
• 「自閉症スペクトラムの特性について教えて」
• 「ASDの子どもとのコミュニケーション方法は？」
• 「感覚過敏への対処法を知りたい」
• 「社会的場面での不安に対するアドバイスが欲しい」
• 「特定の興味や関心を活かせる仕事は？」
• 「構造化や視覚支援の方法を教えて」
• 「学校や職場での合理的配慮について」

■ 使い方
• テキストで質問するだけ：気になることを自然な言葉で入力してください
• 継続的な会話：フォローアップ質問も自然にできます
• 画像の送信：視覚的な説明が必要なときは「画像で説明して」と伝えてください

■ 注意点
• 医学的診断はできません
• あくまで情報提供や一般的なアドバイスが中心です
• 専門家への相談も並行して検討してください

何か具体的に知りたいことがあれば、お気軽に質問してください。
`;

// ASD関連質問の例とカテゴリ
const ASD_EXAMPLES = [
  { category: "特性", 
    examples: [
      "自閉症スペクトラムの特徴は何ですか",
      "ASDの一般的な特性について教えてください",
      "アスペルガー症候群と自閉症の違いは"
    ]
  },
  { category: "コミュニケーション", 
    examples: [
      "ASDの方とのコミュニケーションのコツ",
      "非言語コミュニケーションの難しさについて",
      "会話が続かない時の対処法"
    ]
  },
  { category: "感覚過敏", 
    examples: [
      "音への過敏さの対処法",
      "感覚過敏について説明してください",
      "触覚の問題への対応方法"
    ]
  },
  { category: "社会生活", 
    examples: [
      "職場での困りごとへの対処法",
      "学校生活でのサポート方法",
      "人間関係の構築方法"
    ]
  },
  { category: "支援と配慮", 
    examples: [
      "合理的配慮の具体例",
      "視覚支援の作り方",
      "構造化の方法について"
    ]
  }
];

class ASDGuideHandler {
  constructor() {
    this.embeddingService = null;
    this.initialized = false;
  }
  
  async initialize() {
    if (!this.initialized) {
      this.embeddingService = new EnhancedEmbeddingService();
      await this.embeddingService.initialize();
      this.initialized = true;
    }
  }
  
  /**
   * ASD関連の質問かどうかを判断
   * @param {string} userMessage - ユーザーメッセージ
   * @returns {Promise<boolean>} - ASD関連かどうか
   */
  async isASDRelatedQuestion(userMessage) {
    await this.initialize();
    
    try {
      // キーワードマッチング（高速フィルタリング）
      const asdKeywords = ['asd', '自閉症', 'スペクトラム', 'アスペルガー', 'コミュニケーション困難', '感覚過敏'];
      const lowercaseMessage = userMessage.toLowerCase();
      
      // キーワードが含まれている場合は即座にtrueを返す
      for (const keyword of asdKeywords) {
        if (lowercaseMessage.includes(keyword)) {
          return true;
        }
      }
      
      // 関連するテキストサンプル
      const asdRelatedText = "自閉症スペクトラム障害の特性や対応方法について。感覚過敏や社会的コミュニケーションの困難さ。ASDの支援や配慮について。";
      
      // 埋め込みを使用した類似度計算
      const similarity = await this.embeddingService.getTextSimilarity(
        userMessage,
        asdRelatedText
      );
      
      // 閾値以上なら関連ありと判断
      return similarity > 0.7;
    } catch (error) {
      console.error('Error detecting ASD related question:', error);
      // フォールバック：シンプルなキーワードマッチング
      return userMessage.toLowerCase().includes('asd') || 
             userMessage.toLowerCase().includes('自閉症') ||
             userMessage.toLowerCase().includes('発達障害');
    }
  }
  
  /**
   * 使い方ガイドかどうかを判断
   * @param {string} userMessage - ユーザーメッセージ
   * @returns {Promise<boolean>} - 使い方ガイドかどうか
   */
  async isUsageGuideRequest(userMessage) {
    await this.initialize();
    
    try {
      // 使い方関連のテキストサンプル
      const usageGuideText = "使い方を教えてください。どんな質問に答えられますか。機能説明をお願いします。ヘルプ。対応できることは何ですか。";
      
      // 埋め込みを使用した類似度計算
      const similarity = await this.embeddingService.getTextSimilarity(
        userMessage,
        usageGuideText
      );
      
      // 閾値以上なら使い方ガイドと判断
      return similarity > 0.7;
    } catch (error) {
      console.error('Error detecting usage guide request:', error);
      // フォールバック：シンプルなキーワードマッチング
      const usageKeywords = ['使い方', '説明して', 'ヘルプ', '対応', 'できること', '機能', '例', '質問例'];
      return usageKeywords.some(keyword => userMessage.includes(keyword));
    }
  }
  
  /**
   * ASD支援機能のガイドを生成
   * @param {string} userMessage - ユーザーのメッセージ
   * @returns {string} - 返答テキスト
   */
  async generateASDGuide(userMessage) {
    await this.initialize();
    
    // 基本的なガイドテキスト
    let response = ASD_GUIDE_TEXT;
    
    try {
      // 各カテゴリとの関連度を計算
      const categoryScores = await Promise.all(
        ASD_EXAMPLES.map(async category => {
          const combinedExamples = category.examples.join('. ');
          const similarity = await this.embeddingService.getTextSimilarity(
            userMessage,
            combinedExamples
          );
          return {
            category: category.category,
            score: similarity
          };
        })
      );
      
      // 最も関連度の高いカテゴリを特定
      const topCategory = categoryScores.sort((a, b) => b.score - a.score)[0];
      
      // 関連度が高い場合、そのカテゴリの例を追加
      if (topCategory.score > 0.6) {
        const categoryExamples = ASD_EXAMPLES.find(c => c.category === topCategory.category);
        
        if (categoryExamples) {
          response += `\n\n特に「${topCategory.category}」に関するご質問例：\n`;
          categoryExamples.examples.forEach(example => {
            response += `• 「${example}」\n`;
          });
          response += "\nこのような質問から始めてみてください。";
        }
      }
    } catch (error) {
      console.error('Error generating personalized ASD guide:', error);
      // エラーの場合は基本テキストのみを返す
    }
    
    return response;
  }
}

// シングルトンインスタンス
const asdGuideHandler = new ASDGuideHandler();

/**
 * ASD使用法問い合わせを処理する関数
 * @param {Object} event - LINE Webhookイベント
 * @returns {Promise<void>}
 */
async function handleASDUsageInquiry(event) {
  const userId = event.source.userId;
  const messageText = event.message.text;
  
  console.log(`[DEBUG] handleASDUsageInquiry called for user ${userId}`);
  
  // 画像生成中なら処理をスキップ
  if (global.imageGenerationInProgress?.has(userId)) {
    console.log(`Image generation in progress for ${userId}, skipping ASD guide`);
    return;
  }
  
  try {
    // ASDガイドを生成
    const response = await asdGuideHandler.generateASDGuide(messageText);
    
    // 会話履歴を保存
    if (typeof global.storeInteraction === 'function') {
      await global.storeInteraction(userId, 'user', messageText);
      await global.storeInteraction(userId, 'assistant', response);
    } else {
      console.warn('storeInteraction function not found, interaction not stored');
    }
    
    // ユーザーに返信 - server.jsで定義されたグローバルなLINEクライアントを使用
    if (global.client && typeof global.client.replyMessage === 'function') {
      await global.client.replyMessage(event.replyToken, {
        type: 'text',
        text: response
      });
    } else {
      console.error('LINE client or replyMessage not available');
      // 代替策: event.replyを使用
      if (event.reply && typeof event.reply === 'function') {
        await event.reply(response);
      } else {
        throw new Error('No method available to reply to the user');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in handleASDUsageInquiry:', error);
    return false;
  }
}

module.exports = handleASDUsageInquiry; 