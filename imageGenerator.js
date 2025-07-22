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
    // OpenAI APIキーが設定されている場合のみ初期化
    if (process.env.OPENAI_API_KEY) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.isEnabled = true;
    } else {
      console.warn('[ImageGenerator] OpenAI API key not found. Image generation will be disabled.');
      this.openai = null;
      this.isEnabled = false;
    }
    
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
    
    // 画像生成機能が無効な場合
    if (!this.isEnabled) {
      console.log(`[ImageGenerator] Image generation disabled for user ${userId}`);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '申し訳ありません。現在、画像生成機能は利用できません。システム管理者にお問い合わせください。'
      });
      await storeInteraction(userId, 'system', '[画像生成エラー] 機能が無効です');
      return false;
    }
    
    try {
      console.log(`[DEBUG-IMAGE] 画像生成開始: ユーザー=${userId}, テキスト="${explanationText.substring(0, 30)}..."`);
      
      // 画像生成リクエストをConversationHistoryに記録
      await storeInteraction(userId, 'user', `[画像生成リクエスト] ${explanationText.substring(0, 100)}...`);
      
      // 処理中メッセージは送信しない（replyTokenは画像送信のために保持）
      console.log('[DALL-E] 画像生成処理を開始...');

      // 画像生成プロンプトの準備
      let dallePrompt = explanationText;
      
      // [生成画像]プレフィックスがあれば削除
      if (dallePrompt.startsWith('[生成画像]')) {
        dallePrompt = dallePrompt.replace('[生成画像]', '').trim();
        console.log(`[DALL-E] Removed [生成画像] prefix. Using prompt: "${dallePrompt.substring(0, 50)}..."`);
      }
      
      // プロンプトが空でないか確認
      if (!dallePrompt) {
        console.error('[DALL-E] Error: Prompt is empty after removing prefix.');
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像生成のリクエスト内容が空です。もう一度お試しください。'
        });
        await storeInteraction(userId, 'system', '[画像生成エラー] プロンプトが空です');
        return false;
      }
      
      console.log(`[DALL-E] Sending request to OpenAI API (model: dall-e-3, size: 1024x1024, quality: standard) with prompt: "${dallePrompt.substring(0, 50)}..."`);
      
      // 画像生成APIの呼び出し
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: dallePrompt, // ユーザーのテキストを直接使用
        n: 1,
        size: "1024x1024",
        quality: "standard", // standard quality is faster and cheaper
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
      
      // LINE Messaging APIで画像を返信
      console.log(`[DALL-E] Sending image to user ${userId} via LINE`);
      
      await client.replyMessage(event.replyToken, {
          type: 'image',
          originalContentUrl: `${process.env.SERVER_URL || 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com'}/temp/${path.basename(tempFilePath)}`,
          previewImageUrl: `${process.env.SERVER_URL || 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com'}/temp/${path.basename(tempFilePath)}`
      });
      
      // 生成した画像の情報を会話履歴に記録
      console.log(`[DALL-E] Storing interaction record for user ${userId}`);
      
      // 生成した画像情報をストア
      const textPreview = explanationText.substring(0, 30) + (explanationText.length > 30 ? '...' : '');
      await storeInteraction(userId, 'assistant', `[生成画像参照] URL:${imageUrl.substring(0, 20)}... - ${textPreview}`);
      
      // 一時ファイルを削除 (送信後) - LINEが画像を取得する前に削除されないようコメントアウト
      // TODO: 定期的なクリーンアップタスクで古い画像を削除する
      /*
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`[DALL-E] Deleted temporary image file: ${tempFilePath}`);
        }
      } catch (unlinkError) {
        console.error(`[DALL-E] Error deleting temporary image file: ${unlinkError.message}`);
      }
      */
      
      console.log(`[DALL-E] Image file kept at: ${tempFilePath} for LINE to fetch`);
      
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