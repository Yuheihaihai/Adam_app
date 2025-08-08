const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const IntentDetectionModel = require('../../intentDetectionModel');
const intentModel = new IntentDetectionModel();

// 共有メモリストア
const memoryStore = require('../../memoryStore');

// モデルの初期化
(async () => {
  try {
    await intentModel.initialize();
    console.log('Intent detection model initialized successfully');
  } catch (error) {
    console.error('Failed to initialize intent detection model:', error);
  }
})();

/**
 * @route   POST /api/intent/detect
 * @desc    テキストから意図を検出する
 * @access  Public
 */
const detectLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/detect', detectLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'テキストが提供されていないか、無効な形式です' 
      });
    }
    
    // テキストの長さを制限
    const processText = text.substring(0, 1000);
    
    // 意図検出
    const intentResult = await intentModel.detectIntent(processText);
    
    return res.json({
      success: true,
      intent: {
        primary: intentResult.primary,
        secondary: intentResult.secondary,
        confidence: intentResult.confidence,
        scores: intentResult.scores
      }
    });
  } catch (error) {
    console.error('Intent detection failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: '意図検出中にエラーが発生しました' 
    });
  }
});

/**
 * @route   POST /api/intent/feedback
 * @desc    意図検出結果に対するフィードバックを提供して学習データを追加する
 * @access  Public
 */
router.post('/feedback', async (req, res) => {
  try {
    const { text, predictedIntent, correctIntent, feedbackType, userId, context } = req.body;
    
    // 必須パラメータの検証
    if (!text || !predictedIntent || !correctIntent || !feedbackType) {
      return res.status(400).json({
        success: false,
        error: '必須パラメータが不足しています'
      });
    }
    
    // フィードバックタイプの検証
    if (!['correction', 'confirmation'].includes(feedbackType)) {
      return res.status(400).json({
        success: false,
        error: 'フィードバックタイプは "correction" または "confirmation" である必要があります'
      });
    }
    
    // 意図の検証
    if (!intentModel.intentLabels.includes(correctIntent)) {
      return res.status(400).json({
        success: false,
        error: `正しい意図が無効です。有効な意図: ${intentModel.intentLabels.join(', ')}`
      });
    }
    
    // フィードバックを学習データとして保存
    const saved = await intentModel.saveTrainingData(
      text, 
      predictedIntent, 
      correctIntent, 
      feedbackType,
      userId || null,
      context || null
    );
    
    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'フィードバックの保存に失敗しました'
      });
    }
    
    return res.json({
      success: true,
      message: 'フィードバックが正常に保存されました'
    });
  } catch (error) {
    console.error('フィードバック処理中にエラーが発生しました:', error);
    return res.status(500).json({
      success: false,
      error: 'フィードバック処理中にエラーが発生しました'
    });
  }
});

/**
 * @route   POST /api/intent/train
 * @desc    保存されたフィードバックデータを使用してモデルを再トレーニングする
 * @access  Private (本番環境では認証を追加する)
 */
router.post('/train', async (req, res) => {
  try {
    // トレーニングの開始
    const trainingResult = await intentModel.retrainModel();
    
    if (trainingResult) {
      return res.json({
        success: true,
        message: 'モデルのトレーニングが完了しました',
        version: intentModel.currentModelVersion
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'トレーニングに失敗したか、トレーニングデータがありません'
      });
    }
  } catch (error) {
    console.error('モデルトレーニング中にエラーが発生しました:', error);
    return res.status(500).json({
      success: false,
      error: 'モデルトレーニング中にエラーが発生しました'
    });
  }
});

/**
 * @route   GET /api/intent/training-status
 * @desc    モデルのトレーニングステータスを取得する
 * @access  Public
 */
router.get('/training-status', async (req, res) => {
  try {
    // メモリストアから未学習データの数を取得
    const untrainedCount = memoryStore.trainingData.filter(item => !item.trained).length;
    
    return res.json({
      success: true,
      untrainedSamples: untrainedCount,
      trainingInProgress: intentModel.trainingInProgress,
      currentVersion: intentModel.currentModelVersion,
      recentVersions: memoryStore.modelVersions.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 5)
    });
  } catch (error) {
    console.error('トレーニングステータス取得中にエラーが発生しました:', error);
    return res.status(500).json({
      success: false,
      error: 'トレーニングステータス取得中にエラーが発生しました'
    });
  }
});

/**
 * @route   GET /api/intent/categories
 * @desc    サポートされている意図カテゴリのリストを取得する
 * @access  Public
 */
router.get('/categories', (req, res) => {
  try {
    return res.json({
      success: true,
      categories: intentModel.intentLabels.map(label => ({
        id: label,
        name: getCategoryDisplayName(label),
        description: getCategoryDescription(label)
      }))
    });
  } catch (error) {
    console.error('Error fetching intent categories:', error);
    return res.status(500).json({ 
      success: false, 
      error: '意図カテゴリの取得中にエラーが発生しました' 
    });
  }
});

// 意図カテゴリの表示名
function getCategoryDisplayName(category) {
  const displayNames = {
    'advice_seeking': '助言を求める',
    'information_request': '情報を求める',
    'problem_sharing': '問題を共有する',
    'decision_support': '意思決定支援',
    'emotional_support': '感情的サポート',
    'general_question': '一般的な質問',
    'recommendation_request': '推薦依頼',
    'feedback': 'フィードバック',
    'greeting': '挨拶',
    'farewell': '別れの挨拶',
    'gratitude': '感謝',
    'complaint': '苦情',
    'other': 'その他'
  };
  
  return displayNames[category] || category;
}

// 意図カテゴリの説明
function getCategoryDescription(category) {
  const descriptions = {
    'advice_seeking': '具体的なアドバイスや問題解決の手順を求めるメッセージ。「どうすればよいか」「方法を教えてほしい」など。状況説明のみで直接的な要求がない場合も含む',
    'information_request': '事実や情報、知識を明確に求めるメッセージ。「〜について教えてください」「〜とは何ですか」など。単語や短文による質問も含む',
    'problem_sharing': '自分の抱える問題、悩み、困難を共有するメッセージ。感覚の不快、注意集中の困難、学習の苦手さなども含む。身体症状や客観的な状況描写のみの場合も含む',
    'decision_support': '選択肢の中からどれを選ぶべきか判断の支援を求めるメッセージ。「どちらが良いか」「選択を手伝ってほしい」など。選択肢の提示のみで質問が明示されていない場合も含む',
    'emotional_support': '感情の理解や調整、心理的な支えを求めるメッセージ。感情表現の難しさや感情コントロールの課題も含む。身体症状や行動の変化のみで感情が明示されていない場合も含む',
    'general_question': '特定のカテゴリに入らない一般的な質問。文脈によって意図が変わる可能性がある質問も含む。単語のみや短い表現など、意図が不明確な場合も含む',
    'recommendation_request': '特定の目的のための推薦や提案を求めるメッセージ。「おすすめは？」「〜に適したものは？」など。状況説明のみで明示的な依頼がない場合も含む',
    'feedback': 'サービスや対応への感想、改善点の指摘、意見を提供するメッセージ。明確な評価表現がなくても経験の共有から推測される場合を含む',
    'greeting': '会話の開始時の挨拶を含むメッセージ。「こんにちは」「はじめまして」など。単語のみの短い表現も含む',
    'farewell': '会話の終了時の別れの挨拶を含むメッセージ。「さようなら」「また今度」など。短い表現や文脈から終了の意図が読み取れる場合も含む',
    'gratitude': '感謝の気持ちを表現するメッセージ。「ありがとう」「助かりました」など。明示的な感謝表現がなくても行動や状況描写から感謝の意図が推測される場合も含む',
    'complaint': '不満や苦情、不快感を表明するメッセージ。感覚過敏による不快感の表明なども含む。否定的な状況説明のみで感情表現が明示されていない場合も含む',
    'other': '上記のカテゴリには明確に分類できない、または複数の意図が混在するメッセージ。言語化が困難で意図が不明瞭な表現を含む'
  };
  
  return descriptions[category] || '';
}

module.exports = router; 