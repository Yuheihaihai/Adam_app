/**
 * imageGenerator.js
 * 画像生成機能を実装するモジュール
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');

class ImageGenerator {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // 一時ファイルディレクトリの確認と作成
    this.tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir);
    }
  }

  /**
   * 画像生成処理を行う関数
   * @param {Object} event - LINEのメッセージイベント
   * @param {string} explanationText - 画像生成の元となるテキスト説明
   * @param {Function} storeInteraction - 会話履歴を保存する関数
   * @param {Object} client - LINE Messaging APIクライアント
   * @returns {Promise<boolean>} - 成功時はtrue、失敗時はfalse
   */
  async generateImage(event, explanationText, storeInteraction, client) {
    const userId = event.source.userId;
    
    try {
      console.log(`[DEBUG-IMAGE] 画像生成開始: ユーザー=${userId}, テキスト="${explanationText.substring(0, 30)}..."`);
      
      // 画像生成リクエストをConversationHistoryに記録
      await storeInteraction(userId, 'user', `[画像生成リクエスト] ${explanationText.substring(0, 100)}...`);
      
      // ユーザーに処理中メッセージを送信
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '画像を生成しています。少々お待ちください...'
      });

      // 画像生成プロンプトの前処理
      let cleanExplanationText = explanationText;
      
      // [生成画像]プレフィックスがあれば削除
      if (cleanExplanationText.startsWith('[生成画像]')) {
        cleanExplanationText = cleanExplanationText.replace('[生成画像]', '').trim();
        console.log(`[DALL-E] Removed [生成画像] prefix from explanation text`);
      }
      
      // 説明テキストが短すぎる場合はデフォルトの文脈を追加
      if (cleanExplanationText.length < 10) {
        console.log(`[DALL-E] Explanation text is too short (${cleanExplanationText.length} chars). Adding default context`);
        cleanExplanationText = `${cleanExplanationText}についての画像。イラスト風に美しく描かれています。`;
      }
      
      // 画像生成プロンプトを拡張（日本語説明をより詳細に変換）
      const enhancedPrompt = `${cleanExplanationText}\n\n高品質なイラスト風に描かれています。明るく鮮やかな色彩で、細部まで丁寧に描かれています。`;
      
      console.log(`[DALL-E] Enhanced prompt created (length: ${enhancedPrompt.length})`);
      console.log(`[DALL-E] Sending request to OpenAI API (model: dall-e-3, size: 1024x1024, quality: standard)`);
      
      // 画像生成APIの呼び出し
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      });
      
      const imageUrl = response.data[0].url;
      console.log(`[DALL-E] Image URL generated: ${imageUrl.substring(0, 30)}...`);
      
      // 画像データをダウンロード
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data, 'binary');
      
      // 一時ファイルに保存
      const tempFilePath = path.join(this.tempDir, `dalle_${Date.now()}.png`);
      fs.writeFileSync(tempFilePath, imageBuffer);
      
      // LINE Messaging APIで画像を送信
      console.log(`[DALL-E] Sending image to user ${userId} via LINE`);
      
      // 画像とテキストメッセージの両方を送信
      await client.pushMessage(userId, [
        {
          type: 'text',
          text: `「${cleanExplanationText.substring(0, 50)}${cleanExplanationText.length > 50 ? '...' : ''}」についての画像を生成しました：`
        },
        {
          type: 'image',
          originalContentUrl: `${process.env.SERVER_URL || 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com'}/temp/${path.basename(tempFilePath)}`,
          previewImageUrl: `${process.env.SERVER_URL || 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com'}/temp/${path.basename(tempFilePath)}`
        }
      ]);
      
      // 生成した画像の情報を会話履歴に記録
      console.log(`[DALL-E] Storing interaction record for user ${userId}`);
      
      // 生成した画像情報をストア
      const textPreview = explanationText.substring(0, 30) + (explanationText.length > 30 ? '...' : '');
      await storeInteraction(userId, 'assistant', `[生成画像参照] URL:${imageUrl.substring(0, 20)}... - ${textPreview}`);
      
      return true;
    } catch (error) {
      console.error(`[DALL-E] Error during image generation: ${error.message}`);
      console.error(`[DALL-E] Error details:`, error);
      
      try {
        // エラーメッセージをユーザーに送信
        await client.pushMessage(userId, {
          type: 'text',
          text: '申し訳ありません。画像生成中にエラーが発生しました。もう一度お試しいただくか、別の表現で依頼してください。'
        });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
      
      // エラー記録
      await storeInteraction(userId, 'system', `[画像生成エラー] ${error.message}`);
      return false;
    }
  }
}

module.exports = new ImageGenerator(); 